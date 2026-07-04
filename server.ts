import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import http from "http";
import https from "https";
import { URL } from "url";
import { Redis } from "@upstash/redis";

const app = express();
const PORT = 3000;

// Add broad CORS headers for all API requests
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // API 1: Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // ==========================================================
  // AUTH BACKEND: accounts, sessions, QR login (TV), admin
  // ==========================================================
  app.use(express.json({ limit: "1mb" })); // addon sources + manifests can exceed the 100kb default

  const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  const hasRedis = Boolean(REDIS_URL && REDIS_TOKEN);

  const redis = hasRedis
    ? new Redis({
        url: REDIS_URL,
        token: REDIS_TOKEN,
      })
    : null;

  const TMP_DIR = "/tmp/vetrix-auth";
  const DATA_DIR = process.env.VERCEL ? TMP_DIR : path.join(process.cwd(), "data");

  interface StoredUser {
    id: string;
    username: string;
    passwordHash: string;
    salt: string;
    role: "admin" | "user";
    banned: boolean;
    createdAt: string;
    lastLoginAt: string | null;
  }

  const redisGet = async (key: string): Promise<string | null> => {
    if (!redis) return null;
    const data = await redis.get(key);
    if (data === null || data === undefined) return null;
    return typeof data === "string" ? data : JSON.stringify(data);
  };

  const redisSet = async (key: string, value: string) => {
    if (!redis) return;
    await redis.set(key, value);
  };

  const readJson = async <T>(key: string, fallback: T): Promise<T> => {
    try {
      if (hasRedis) {
        const raw = await redisGet(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
      }
      const file = path.join(DATA_DIR, `${key}.json`);
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
      }
    } catch (e) {
      console.error(`[Auth] Failed to read ${key}:`, e);
    }
    return fallback;
  };

  const writeJson = async (key: string, data: any) => {
    try {
      const raw = JSON.stringify(data, null, 2);
      if (hasRedis) {
        await redisSet(key, raw);
        return;
      }
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(path.join(DATA_DIR, `${key}.json`), raw, "utf-8");
    } catch (e) {
      console.error(`[Auth] Failed to write ${key}:`, e);
    }
  };

  type QrEntry = { status: "pending" | "approved"; token?: string; createdAt: number };
  let qrCodes: Record<string, QrEntry> = {};

  let users: StoredUser[] = [];
  let sessions: Record<string, { userId: string; createdAt: number }> = {};

  
  // Async initialization
  const initDb = async () => {
    users = await readJson<StoredUser[]>("users", []);
    if (!Array.isArray(users)) users = [];
    
    sessions = await readJson("sessions", {});
    if (!sessions || typeof sessions !== "object" || Array.isArray(sessions)) sessions = {};
    
    qrCodes = await readJson("qr", {});
    if (!qrCodes || typeof qrCodes !== "object" || Array.isArray(qrCodes)) qrCodes = {};
    
    // Seed the owner admin account
    const ownerAccount = users.find((u) => u.username === "adminown1");
    if (ownerAccount && ownerAccount.role !== "admin") {
      ownerAccount.role = "admin";
      await saveUsers();
    }
    if (!ownerAccount) {
      const salt = crypto.randomBytes(16).toString("hex");
      users.push({
        id: `usr_${Date.now()}`,
        username: "adminown1",
        passwordHash: hashPassword("admin20261", salt),
        salt,
        role: "admin",
        banned: false,
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
      });
      await saveUsers();
    }

    // Clean up the old auto-seeded "admin" account if it was never used
    const oldDefaultIdx = users.findIndex((u) => u.username === "admin" && u.lastLoginAt === null);
    if (oldDefaultIdx !== -1) {
      users.splice(oldDefaultIdx, 1);
      await saveUsers();
    }
  };

  const saveUsers = () => writeJson("users", users);
  const saveSessions = () => writeJson("sessions", sessions);

  let dbInitialized = false;
  let dbInitPromise: Promise<void> | null = null;
  app.use(async (req, res, next) => {
    if (!dbInitialized) {
      if (!dbInitPromise) {
        dbInitPromise = initDb().then(() => {
          dbInitialized = true;
        });
      }
      try {
        await dbInitPromise;
      } catch (err) {
        console.error("DB Init Error:", err);
        return next(err);
      }
    }
    next();
  });

  const QR_TTL_MS = 5 * 60 * 1000;

  const hashPassword = (password: string, salt: string) =>
    crypto.scryptSync(password, salt, 64).toString("hex");

  const publicUser = (u: StoredUser) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    banned: u.banned,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  });

  const getUserByToken = (req: express.Request): StoredUser | null => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : (req.query.token as string) || "";
    if (!token) return null;
    const session = sessions[token];
    if (!session) return null;
    const user = users.find((u) => u.id === session.userId);
    if (!user || user.banned) return null;
    return user;
  };

  const createSession = async (user: StoredUser): Promise<string> => {
    const token = crypto.randomBytes(32).toString("hex");
    sessions[token] = { userId: user.id, createdAt: Date.now() };
    user.lastLoginAt = new Date().toISOString();
    await saveSessions();
    await saveUsers();
    return token;
  };

  const saveQr = () => writeJson("qr", qrCodes);

  const cleanQrCodes = async () => {
    const now = Date.now();
    let changed = false;
    for (const code of Object.keys(qrCodes)) {
      if (now - qrCodes[code].createdAt > QR_TTL_MS) {
        delete qrCodes[code];
        changed = true;
      }
    }
    if (changed) await saveQr();
  };

  // --- Sign up ---
  app.post("/api/auth/signup", async (req, res, next) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password || String(username).trim().length < 3 || String(password).length < 4) {
        return res.status(400).json({ error: "Username must be 3+ chars and password 4+ chars" });
      }
      const uname = String(username).trim();
      if (users.some((u) => u.username.toLowerCase() === uname.toLowerCase())) {
        return res.status(409).json({ error: "Username already exists" });
      }
      const salt = crypto.randomBytes(16).toString("hex");
      const user: StoredUser = {
        id: `usr_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
        username: uname,
        passwordHash: hashPassword(String(password), salt),
        salt,
        role: "user",
        banned: false,
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
      };
      users.push(user);
      await saveUsers();
      const token = await createSession(user);
      res.json({ token, user: publicUser(user) });
    } catch(e) { next(e); }
  });

  // --- Log in ---
  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const { username, password } = req.body || {};
      const user = users.find(
        (u) => u.username.toLowerCase() === String(username || "").trim().toLowerCase(),
      );
      if (!user || user.passwordHash !== hashPassword(String(password || ""), user.salt)) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      if (user.banned) {
        return res.status(403).json({ error: "This account has been banned" });
      }
      const token = await createSession(user);
      res.json({ token, user: publicUser(user) });
    } catch(e) { next(e); }
  });

  // --- Log out ---
  app.post("/api/auth/logout", async (req, res, next) => {
    try {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (token && sessions[token]) {
        delete sessions[token];
        await saveSessions();
      }
      res.json({ ok: true });
    } catch(e) { next(e); }
  });

  // --- Current user ---
  app.get("/api/auth/me", (req, res) => {
    const user = getUserByToken(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    res.json({ user: publicUser(user) });
  });

  // --- QR login: TV creates a pairing code ---
  app.post("/api/auth/qr/create", async (req, res, next) => {
    try {
      await cleanQrCodes();
      const code = crypto.randomBytes(3).toString("hex").toUpperCase();
      qrCodes[code] = { status: "pending", createdAt: Date.now() };
      await saveQr();
      res.json({ code, expiresInSeconds: QR_TTL_MS / 1000 });
    } catch(e) { next(e); }
  });

  // --- QR login: TV polls pairing status ---
  app.get("/api/auth/qr/status", async (req, res, next) => {
    try {
      await cleanQrCodes();
      const code = String(req.query.code || "").toUpperCase();
      const entry = qrCodes[code];
      if (!entry) return res.json({ status: "expired" });
      if (entry.status === "approved" && entry.token) {
        const session = sessions[entry.token];
        const user = session ? users.find((u) => u.id === session.userId) : null;
        delete qrCodes[code];
        await saveQr();
        return res.json({
          status: "approved",
          token: entry.token,
          user: user ? publicUser(user) : null,
        });
      }
      res.json({ status: "pending" });
    } catch(e) { next(e); }
  });

  // --- QR login: phone (logged in) approves the TV code ---
  app.post("/api/auth/qr/approve", async (req, res, next) => {
    try {
      await cleanQrCodes();
      const user = getUserByToken(req);
      if (!user) return res.status(401).json({ error: "Log in first to approve the TV" });
      const code = String((req.body || {}).code || "").toUpperCase();
      const entry = qrCodes[code];
      if (!entry || entry.status !== "pending") {
        return res.status(404).json({ error: "Code expired or invalid. Refresh the QR on your TV." });
      }
      entry.token = await createSession(user);
      entry.status = "approved";
      await saveQr();
      res.json({ ok: true });
    } catch(e) { next(e); }
  });

  // --- Admin: middleware ---
  const requireAdmin = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const user = getUserByToken(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (user.role !== "admin") return res.status(403).json({ error: "Admin access required" });
    (req as any).adminUser = user;
    next();
  };

  // ==========================================================
  // ADDON STUDIO — per-user personal addon manager (PC link).
  // Strictly neutral scope: these routes read/write ONLY addon
  // data for the link's owner. They never touch accounts,
  // sessions, roles or any other user data.
  // ==========================================================
  type StudioLink = { userId: string; profileId: string; profileName: string; createdAt: number };
  let studioLinks: Record<string, StudioLink> = {};
  let studioLinksLoaded = false;
  const loadStudioLinks = async (): Promise<Record<string, StudioLink>> => {
    if (!studioLinksLoaded) {
      studioLinks = await readJson<Record<string, StudioLink>>("studio-links", {});
      if (!studioLinks || typeof studioLinks !== "object" || Array.isArray(studioLinks)) studioLinks = {};
      studioLinksLoaded = true;
    }
    return studioLinks;
  };
  const saveStudioLinks = () => writeJson("studio-links", studioLinks);
  const studioAddonsKey = (l: StudioLink) => `studio-addons-${l.userId}-${l.profileId}`;

  // Create (or return) the user's stable personal Studio link token.
  app.post("/api/auth/studio/link", async (req, res, next) => {
    try {
      const user = getUserByToken(req);
      if (!user) return res.status(401).json({ error: "Not authenticated" });
      await loadStudioLinks();
      const profileId = String(req.body?.profileId || "default");
      const profileName = String(req.body?.profileName || "");
      let token = Object.keys(studioLinks).find(
        (k) => studioLinks[k].userId === user.id && studioLinks[k].profileId === profileId,
      );
      if (!token) {
        token = crypto.randomBytes(12).toString("hex");
        studioLinks[token] = { userId: user.id, profileId, profileName, createdAt: Date.now() };
        await saveStudioLinks();
      } else if (profileName && studioLinks[token].profileName !== profileName) {
        studioLinks[token].profileName = profileName;
        await saveStudioLinks();
      }
      const store = await readJson<{ rev: number; addons: any[] }>(studioAddonsKey(studioLinks[token]), { rev: 0, addons: [] });
      res.json({ token, rev: store.rev || 0 });
    } catch (e) { next(e); }
  });

  // Read the addons behind a Studio link (token is the credential).
  app.get("/api/auth/studio/:stoken/addons", async (req, res, next) => {
    try {
      await loadStudioLinks();
      const link = studioLinks[String(req.params.stoken || "")];
      if (!link) return res.status(404).json({ error: "Invalid studio link" });
      const owner = users.find((u) => u.id === link.userId);
      const store = await readJson<{ rev: number; addons: any[] }>(studioAddonsKey(link), { rev: 0, addons: [] });
      res.json({
        rev: store.rev || 0,
        addons: Array.isArray(store.addons) ? store.addons : [],
        profileName: link.profileName || "",
        username: owner ? owner.username : "",
      });
    } catch (e) { next(e); }
  });

  // Save the addons behind a Studio link. Addon data only.
  app.post("/api/auth/studio/:stoken/addons", async (req, res, next) => {
    try {
      await loadStudioLinks();
      const link = studioLinks[String(req.params.stoken || "")];
      if (!link) return res.status(404).json({ error: "Invalid studio link" });
      const addons = Array.isArray(req.body?.addons) ? req.body.addons : null;
      if (!addons) return res.status(400).json({ error: "addons must be an array" });
      if (JSON.stringify(addons).length > 900_000) return res.status(413).json({ error: "Addon data too large" });
      const store = await readJson<{ rev: number; addons: any[] }>(studioAddonsKey(link), { rev: 0, addons: [] });
      const nextStore = { rev: (store.rev || 0) + 1, addons, updatedAt: Date.now() };
      await writeJson(studioAddonsKey(link), nextStore);
      res.json({ ok: true, rev: nextStore.rev });
    } catch (e) { next(e); }
  });

  // --- Admin: list users + stats ---
  app.get("/api/admin/users", requireAdmin, (req, res) => {
    res.json({
      users: users.map(publicUser),
      stats: {
        total: users.length,
        admins: users.filter((u) => u.role === "admin").length,
        banned: users.filter((u) => u.banned).length,
        activeSessions: Object.keys(sessions).length,
      },
    });
  });

  // --- Admin: ban / unban ---
  app.post("/api/admin/users/:id/toggle-ban", requireAdmin, async (req, res, next) => {
    try {
      const admin = (req as any).adminUser as StoredUser;
      const target = users.find((u) => u.id === req.params.id);
      if (!target) return res.status(404).json({ error: "User not found" });
      if (target.id === admin.id) return res.status(400).json({ error: "You cannot ban yourself" });
      target.banned = !target.banned;
      if (target.banned) {
        for (const [tok, s] of Object.entries(sessions)) {
          if (s.userId === target.id) delete sessions[tok];
        }
        await saveSessions();
      }
      await saveUsers();
      res.json({ user: publicUser(target) });
    } catch(e) { next(e); }
  });

  // --- Admin: change role ---
  app.post("/api/admin/users/:id/role", requireAdmin, async (req, res, next) => {
    try {
      const admin = (req as any).adminUser as StoredUser;
      const target = users.find((u) => u.id === req.params.id);
      if (!target) return res.status(404).json({ error: "User not found" });
      if (target.id === admin.id) return res.status(400).json({ error: "You cannot change your own role" });
      const role = (req.body || {}).role;
      if (role !== "admin" && role !== "user") return res.status(400).json({ error: "Invalid role" });
      target.role = role;
      await saveUsers();
      res.json({ user: publicUser(target) });
    } catch(e) { next(e); }
  });

  // --- Admin: delete user ---
  app.delete("/api/admin/users/:id", requireAdmin, async (req, res, next) => {
    try {
      const admin = (req as any).adminUser as StoredUser;
      if (req.params.id === admin.id) return res.status(400).json({ error: "You cannot delete yourself" });
      const before = users.length;
      users = users.filter((u) => u.id !== req.params.id);
      if (users.length === before) return res.status(404).json({ error: "User not found" });
      for (const [tok, s] of Object.entries(sessions)) {
        if (s.userId === req.params.id) delete sessions[tok];
      }
      await saveSessions();
      await saveUsers();
      res.json({ ok: true });
    } catch(e) { next(e); }
  });

  // API 2: M3U Playlist Proxy
  app.get("/api/m3u-proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).send("Missing url parameter");
    }

    try {
      console.log(`[M3U Proxy] Fetching playlist: ${targetUrl}`);
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Remote server responded with status ${response.status}`);
      }

      const text = await response.text();
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(text);
    } catch (error: any) {
      console.error("[M3U Proxy] Error:", error.message);
      res.status(500).send(`Failed to fetch playlist: ${error.message}`);
    }
  });

  // API 3: Live Video Stream Proxy (resolves CORS and mixed content HTTP/HTTPS blocks)
  app.get("/api/live-proxy", (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).send("Missing url parameter");
    }

    let activeRemoteRequest: any = null;

    const fetchWithRedirects = (currentUrl: string, redirectCount: number = 0) => {
      if (redirectCount > 5) {
        console.error("[Live Proxy] Too many redirects");
        return res.status(508).send("Too many redirects");
      }

      try {
        const parsedUrl = new URL(currentUrl);
        const client = parsedUrl.protocol === "https:" ? https : http;

        console.log(`[Live Proxy] Requesting: ${currentUrl} (Redirect depth: ${redirectCount})`);

        const requestOptions = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
            ...(req.headers['range'] ? { 'Range': req.headers['range'] as string } : {})
          }
        };

        const remoteRequest = client.get(currentUrl, requestOptions, (remoteResponse) => {
          const statusCode = remoteResponse.statusCode || 200;
          console.log(`[Live Proxy] Remote response status: ${statusCode} for ${currentUrl}`);

          // Handle redirects (301, 302, 307, 308)
          if (statusCode >= 300 && statusCode < 400 && remoteResponse.headers.location) {
            let nextUrl = remoteResponse.headers.location;
            if (!nextUrl.startsWith("http://") && !nextUrl.startsWith("https://")) {
              // Resolve relative URL
              nextUrl = new URL(nextUrl, currentUrl).toString();
            }
            console.log(`[Live Proxy] Following redirect to: ${nextUrl}`);
            remoteRequest.destroy();
            fetchWithRedirects(nextUrl, redirectCount + 1);
            return;
          }

          // Disable buffering to allow live response streaming
          res.setHeader("X-Accel-Buffering", "no");
          res.setHeader("Cache-Control", "no-cache, no-transform");
          res.setHeader("Connection", "keep-alive");

          // Copy headers to allow range requests and video streaming
          if (remoteResponse.headers["content-type"]) {
            res.setHeader("Content-Type", remoteResponse.headers["content-type"]);
          } else {
            res.setHeader("Content-Type", "video/mp2t"); // Default for .ts streams
          }

          if (remoteResponse.headers["content-length"]) {
            res.setHeader("Content-Length", remoteResponse.headers["content-length"]);
          }

          if (remoteResponse.headers["content-range"]) {
            res.setHeader("Content-Range", remoteResponse.headers["content-range"]);
          }

          if (remoteResponse.headers["accept-ranges"]) {
            res.setHeader("Accept-Ranges", remoteResponse.headers["accept-ranges"]);
          }

          res.status(statusCode);
          remoteResponse.pipe(res);
        });

        activeRemoteRequest = remoteRequest;

        remoteRequest.on("error", (err) => {
          console.error(`[Live Proxy] Remote stream error for ${currentUrl}:`, err.message);
          if (!res.headersSent) {
            res.status(500).send("Proxy error fetching stream");
          }
        });

      } catch (error: any) {
        console.error("[Live Proxy] Error:", error.message);
        if (!res.headersSent) {
          res.status(400).send("Invalid URL or stream error");
        }
      }
    };

    fetchWithRedirects(targetUrl);

    req.on("close", () => {
      // Abort remote request if client closes connection to prevent resource leaks
      if (activeRemoteRequest) {
        activeRemoteRequest.destroy();
      }
    });
  });

  // Vite middleware for development vs static serve for production
  async function startServer() {
    if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    console.log("Starting server in development mode (Vite Middleware)");
    const viteName = "vite";
    const viteModule = await import(viteName /* @vite-ignore */);
    const vite = await viteModule.createServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    console.log("Starting server in production mode (Static Serve)");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("/*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  }
}

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("[Express Error]", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  });

startServer().catch(err => {
  console.error("Server start failed:", err);
});

export default app;
