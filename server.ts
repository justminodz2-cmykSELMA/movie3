import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import http from "http";
import https from "https";
import { URL } from "url";

const app = express();
const PORT = 3000;

async function startServer() {
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
  app.use(express.json());

  const DATA_DIR = path.join(process.cwd(), "data");
  const USERS_FILE = path.join(DATA_DIR, "users.json");
  const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

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

  const readJson = <T>(file: string, fallback: T): T => {
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
      }
    } catch (e) {
      console.error(`[Auth] Failed to read ${file}:`, e);
    }
    return fallback;
  };

  const writeJson = (file: string, data: any) => {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.error(`[Auth] Failed to write ${file}:`, e);
    }
  };

  let users: StoredUser[] = readJson<StoredUser[]>(USERS_FILE, []);
  let sessions: Record<string, { userId: string; createdAt: number }> =
    readJson(SESSIONS_FILE, {});
  const qrCodes = new Map<
    string,
    { status: "pending" | "approved"; token?: string; createdAt: number }
  >();
  const QR_TTL_MS = 5 * 60 * 1000;

  const hashPassword = (password: string, salt: string) =>
    crypto.scryptSync(password, salt, 64).toString("hex");

  const saveUsers = () => writeJson(USERS_FILE, users);
  const saveSessions = () => writeJson(SESSIONS_FILE, sessions);

  // Seed the owner admin account on first run (and always ensure it has the admin role)
  const ownerAccount = users.find((u) => u.username === "adminown1");
  if (ownerAccount && ownerAccount.role !== "admin") {
    ownerAccount.role = "admin";
    saveUsers();
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
    saveUsers();
  }

  // Clean up the old auto-seeded "admin" account if it was never used
  const oldDefaultIdx = users.findIndex((u) => u.username === "admin" && u.lastLoginAt === null);
  if (oldDefaultIdx !== -1) {
    users.splice(oldDefaultIdx, 1);
    saveUsers();
  }

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

  const createSession = (user: StoredUser): string => {
    const token = crypto.randomBytes(32).toString("hex");
    sessions[token] = { userId: user.id, createdAt: Date.now() };
    user.lastLoginAt = new Date().toISOString();
    saveSessions();
    saveUsers();
    return token;
  };

  const cleanQrCodes = () => {
    const now = Date.now();
    for (const [code, entry] of qrCodes.entries()) {
      if (now - entry.createdAt > QR_TTL_MS) qrCodes.delete(code);
    }
  };

  // --- Sign up ---
  app.post("/api/auth/signup", (req, res) => {
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
    saveUsers();
    const token = createSession(user);
    res.json({ token, user: publicUser(user) });
  });

  // --- Log in ---
  app.post("/api/auth/login", (req, res) => {
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
    const token = createSession(user);
    res.json({ token, user: publicUser(user) });
  });

  // --- Log out ---
  app.post("/api/auth/logout", (req, res) => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token && sessions[token]) {
      delete sessions[token];
      saveSessions();
    }
    res.json({ ok: true });
  });

  // --- Current user ---
  app.get("/api/auth/me", (req, res) => {
    const user = getUserByToken(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    res.json({ user: publicUser(user) });
  });

  // --- QR login: TV creates a pairing code ---
  app.post("/api/auth/qr/create", (req, res) => {
    cleanQrCodes();
    const code = crypto.randomBytes(3).toString("hex").toUpperCase();
    qrCodes.set(code, { status: "pending", createdAt: Date.now() });
    res.json({ code, expiresInSeconds: QR_TTL_MS / 1000 });
  });

  // --- QR login: TV polls pairing status ---
  app.get("/api/auth/qr/status", (req, res) => {
    cleanQrCodes();
    const code = String(req.query.code || "").toUpperCase();
    const entry = qrCodes.get(code);
    if (!entry) return res.json({ status: "expired" });
    if (entry.status === "approved" && entry.token) {
      const session = sessions[entry.token];
      const user = session ? users.find((u) => u.id === session.userId) : null;
      qrCodes.delete(code);
      return res.json({
        status: "approved",
        token: entry.token,
        user: user ? publicUser(user) : null,
      });
    }
    res.json({ status: "pending" });
  });

  // --- QR login: phone (logged in) approves the TV code ---
  app.post("/api/auth/qr/approve", (req, res) => {
    cleanQrCodes();
    const user = getUserByToken(req);
    if (!user) return res.status(401).json({ error: "Log in first to approve the TV" });
    const code = String((req.body || {}).code || "").toUpperCase();
    const entry = qrCodes.get(code);
    if (!entry || entry.status !== "pending") {
      return res.status(404).json({ error: "Code expired or invalid. Refresh the QR on your TV." });
    }
    entry.token = createSession(user);
    entry.status = "approved";
    res.json({ ok: true });
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
  app.post("/api/admin/users/:id/toggle-ban", requireAdmin, (req, res) => {
    const admin = (req as any).adminUser as StoredUser;
    const target = users.find((u) => u.id === req.params.id);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (target.id === admin.id) return res.status(400).json({ error: "You cannot ban yourself" });
    target.banned = !target.banned;
    if (target.banned) {
      for (const [tok, s] of Object.entries(sessions)) {
        if (s.userId === target.id) delete sessions[tok];
      }
      saveSessions();
    }
    saveUsers();
    res.json({ user: publicUser(target) });
  });

  // --- Admin: change role ---
  app.post("/api/admin/users/:id/role", requireAdmin, (req, res) => {
    const admin = (req as any).adminUser as StoredUser;
    const target = users.find((u) => u.id === req.params.id);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (target.id === admin.id) return res.status(400).json({ error: "You cannot change your own role" });
    const role = (req.body || {}).role;
    if (role !== "admin" && role !== "user") return res.status(400).json({ error: "Invalid role" });
    target.role = role;
    saveUsers();
    res.json({ user: publicUser(target) });
  });

  // --- Admin: delete user ---
  app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
    const admin = (req as any).adminUser as StoredUser;
    if (req.params.id === admin.id) return res.status(400).json({ error: "You cannot delete yourself" });
    const before = users.length;
    users = users.filter((u) => u.id !== req.params.id);
    if (users.length === before) return res.status(404).json({ error: "User not found" });
    for (const [tok, s] of Object.entries(sessions)) {
      if (s.userId === req.params.id) delete sessions[tok];
    }
    saveSessions();
    saveUsers();
    res.json({ ok: true });
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
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    console.log("Starting server in development mode (Vite Middleware)");
    const viteName = "vite";
    const viteModule = await import(viteName /* @vite-ignore */);
    const vite = await viteModule.createServer({
      server: { middlewareMode: true },
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

startServer();

export default app;
