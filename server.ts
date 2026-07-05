import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import http from "http";
import https from "https";
import { URL } from "url";
import { Readable } from "stream";
import zlib from "zlib";
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

  // ==========================================================
  // VS PROVIDER (TMDB-based): m3u8 extractor + HLS proxy
  // Works directly with TMDB ids: /api/vs-extract?type=movie&tmdb_id=..
  // Optimized: first-success race, per-step timeouts, Redis cache,
  // self-healing proxy (re-extracts on expired/IP-locked links),
  // and edge cache headers so many viewers share cached responses.
  // ==========================================================
  const VS_PROVIDERS = [
    "https://vsembed.ru",
    "https://vsembed.su",
    "https://vidsrcme.ru",
    "https://vidsrc.pm",
    "https://vidsrc.in",
  ];

  // Optional external stream proxy (a Cloudflare Worker running
  // cloudflare-worker/vs-stream-proxy.js). When set, heavy video segments are
  // served through the worker instead of this server: video bandwidth here
  // drops to ~0 and playback streams from Cloudflare's global edge cache.
  // NOTE: the upstream CDN 403s ANY browser Origin header, so segments can
  // never be fetched directly by the client — they must go through a
  // server-side hop. A worker is the cheapest, fastest such hop.
  // Set VS_STREAM_PROXY to the worker URL, e.g. https://vs-stream.yourname.workers.dev
  const VS_STREAM_PROXY = (process.env.VS_STREAM_PROXY || "").trim().replace(/\/+$/, "");

  // Long TTL keeps segment URLs stable so Vercel's edge cache is reused across
  // viewers and page reloads. Expired/IP-locked tokens are handled by the
  // self-heal path, so a stale cache entry is never fatal.
  const VS_CACHE_TTL_MS = 1000 * 60 * 120; // 2 hours
  const VS_STEP_TIMEOUT_MS = 6500;

  // Small in-memory cache (per warm instance) + Redis (cross-instance)
  // `local` marks results scraped by THIS instance (token matches our IP).
  const vsCache = new Map<string, { timestamp: number; response: any; local: boolean }>();
  const vsCacheSet = (key: string, response: any, local: boolean) => {
    if (vsCache.size > 150) {
      // drop oldest entries to keep memory light
      const oldest = [...vsCache.keys()].slice(0, 50);
      oldest.forEach((k) => vsCache.delete(k));
    }
    vsCache.set(key, { timestamp: Date.now(), response, local });
  };

  // Full browser header spoofing — Cloudflare rejects headerless fetches with 521
  const VS_BROWSER_HEADERS: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
    "Cache-Control": "max-age=0",
    "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  };

  const vsFetch = (url: string, init: any = {}, timeoutMs = VS_STEP_TIMEOUT_MS) =>
    fetch(url, {
      redirect: "follow",
      ...init,
      headers: { ...VS_BROWSER_HEADERS, ...(init.headers || {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });

  // ----------------------------------------------------------
  // IP-bound token handling.
  // Stream tokens are JWTs locked to the caller's IP (/24). On serverless,
  // every instance has a different egress IP, so a token extracted by one
  // instance 403s on another — which used to trigger a FULL re-scrape per
  // segment (the "heavy playback" bug). Instead, each instance fetches its
  // OWN token once via generate.php (~200ms, cached) and swaps it into every
  // upstream URL. Segments then stream directly with zero healing.
  // ----------------------------------------------------------
  const VS_TOKEN_TTL_MS = 1000 * 60 * 60; // tokens live ~4h; refresh hourly
  const VS_TOKEN_NEG_TTL_MS = 1000 * 60 * 10; // don't re-probe token-less hosts for 10 min
  const vsTokenCache = new Map<string, { token: string | null; ts: number }>();
  const vsTokenInflight = new Map<string, Promise<string | null>>();

  async function vsGetOwnToken(host: string, force = false): Promise<string | null> {
    const cached = vsTokenCache.get(host);
    if (!force && cached) {
      const ttl = cached.token ? VS_TOKEN_TTL_MS : VS_TOKEN_NEG_TTL_MS;
      if (Date.now() - cached.ts < ttl) return cached.token;
    }

    // Coalesce concurrent refreshes (a burst of segment requests on a cold
    // instance must trigger only ONE generate.php call).
    const inflightKey = `${host}:${force ? "f" : "n"}`;
    const existing = vsTokenInflight.get(inflightKey);
    if (existing) return existing;

    const p = (async () => {
      try {
        const res = await vsFetch(`https://${host}/generate.php`, {
          headers: { Referer: "https://cloudorchestranova.com/" },
        }, 5000);
        const token = res.ok ? (await res.text()).trim() : "";
        if (!token || token.includes("<") || token.length < 20) {
          // Host doesn't hand out tokens: remember that (negative cache),
          // but never overwrite a previously good token with a failure.
          if (!cached?.token) vsTokenCache.set(host, { token: null, ts: Date.now() });
          return cached?.token ?? null;
        }
        vsTokenCache.set(host, { token, ts: Date.now() });
        return token;
      } catch {
        return cached?.token ?? null;
      } finally {
        vsTokenInflight.delete(inflightKey);
      }
    })();
    vsTokenInflight.set(inflightKey, p);
    return p;
  }

  // Attach/replace the token query param with one bound to THIS instance's
  // IP. Proxied URLs arrive token-less (stripped for stable caching), so the
  // token must be ADDED here, not just swapped.
  async function vsOwnTokenUrl(rawUrl: string, forceRefresh = false): Promise<string> {
    try {
      const u = new URL(rawUrl);
      const token = await vsGetOwnToken(u.host, forceRefresh);
      if (token) u.searchParams.set("token", token);
      return u.href;
    } catch {
      return rawUrl;
    }
  }

  // Drop the token from URLs we hand to the client: proxied URLs become
  // stable across viewers/extractions (better edge-cache hit rate) and the
  // proxy attaches its own token upstream anyway.
  const vsStripToken = (rawUrl: string): string => {
    try {
      const u = new URL(rawUrl);
      if (!u.searchParams.has("token")) return rawUrl;
      u.searchParams.delete("token");
      return u.href;
    } catch {
      return rawUrl;
    }
  };

  async function vsScrapeProvider(domain: string, targetUrl: string) {
    // 1. Fetch the embed page
    const embedRes = await vsFetch(targetUrl);
    if (!embedRes.ok) throw new Error(`Embed fetch failed: ${embedRes.status}`);
    const embedHtml = await embedRes.text();

    // 2. Extract rcp URL from iframe
    const rcpMatch = embedHtml.match(/src="\/\/(cloudorchestranova\.com\/rcp\/[^"]+)"/);
    if (!rcpMatch) throw new Error("RCP iframe not found in embed page");
    const rcpUrl = `https://${rcpMatch[1]}`;

    // 3. Fetch the RCP page
    const rcpRes = await vsFetch(rcpUrl, { headers: { Referer: targetUrl } });
    if (!rcpRes.ok) throw new Error(`RCP fetch failed: ${rcpRes.status}`);
    const rcpHtml = await rcpRes.text();

    // 4. Extract prorcp URL
    const prorcpMatch = rcpHtml.match(/src:\s*'(\/prorcp\/[^']+)'/);
    if (!prorcpMatch) throw new Error("ProRCP URL not found in RCP page");
    const prorcpUrl = `https://cloudorchestranova.com${prorcpMatch[1]}`;

    // 5. Fetch the ProRCP page
    const prorcpRes = await vsFetch(prorcpUrl, { headers: { Referer: rcpUrl } });
    if (!prorcpRes.ok) throw new Error(`ProRCP fetch failed: ${prorcpRes.status}`);
    const prorcpHtml = await prorcpRes.text();

    // 6. Extract master_urls and token generation host
    let masterUrls = "";
    const masterUrlsMatch = prorcpHtml.match(/var\s+master_urls\s*=\s*['"]([^'"]+)['"]/i);
    const fileMatch = prorcpHtml.match(/file:\s*['"](.*?)['"]/i);

    if (masterUrlsMatch) {
      masterUrls = masterUrlsMatch[1];
    } else if (fileMatch) {
      masterUrls = fileMatch[1];
    } else {
      const fallbackMatch = prorcpHtml.match(/(https:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
      if (fallbackMatch) {
        masterUrls = fallbackMatch[1];
      } else {
        throw new Error("No stream URL found in ProRCP source");
      }
    }

    let hlsUrl = masterUrls.split(" or ")[0];

    // 7. Get token if needed
    if (hlsUrl.includes("__TOKEN__")) {
      const m3u8UrlObj = new URL(hlsUrl);
      const tokenHost = m3u8UrlObj.host;
      try {
        const tokenRes = await vsFetch(`https://${tokenHost}/generate.php`, {
          headers: { Referer: prorcpUrl },
        }, 5000);
        if (tokenRes.ok) {
          const token = await tokenRes.text();
          hlsUrl = hlsUrl.replace(/__TOKEN__/g, token.trim());
        }
      } catch (e) {
        console.warn(`[VS ${domain}] Failed to generate token`);
      }
    }

    // 8. Extract subtitles
    const subtitles: { lang: string; url: string }[] = [];
    const subsMatch = prorcpHtml.match(/var\s+default_subtitles\s*=\s*['"]([^'"]+)['"]/i);
    if (subsMatch && subsMatch[1] && subsMatch[1] !== "[]") {
      const subsArray = subsMatch[1].split(",");
      for (const sub of subsArray) {
        const parts = sub.split("]");
        if (parts.length === 2) {
          subtitles.push({ lang: parts[0].replace("[", "").trim(), url: parts[1] });
        } else {
          subtitles.push({ lang: "Sub", url: sub });
        }
      }
    }

    return { hlsUrl, subtitles };
  }

  // Race all domains, resolve with the FIRST successful scrape.
  function vsFirstSuccess(urls: Record<string, string>): Promise<{ domain: string; hlsUrl: string; subtitles: any[] }> {
    return new Promise((resolve, reject) => {
      const entries = Object.entries(urls);
      let pending = entries.length;
      let done = false;
      const errors: string[] = [];
      for (const [domain, url] of entries) {
        vsScrapeProvider(domain, url)
          .then((r) => {
            if (!done && r.hlsUrl) {
              done = true;
              resolve({ domain, hlsUrl: r.hlsUrl, subtitles: r.subtitles });
            } else if (!done && --pending === 0) {
              reject(new Error(errors.join(" | ") || "No stream found"));
            }
          })
          .catch((e) => {
            errors.push(`${domain}: ${e.message}`);
            if (!done && --pending === 0) {
              reject(new Error(errors.join(" | ")));
            }
          });
      }
    });
  }

  // Compact self-heal context passed through proxy URLs so an expired /
  // IP-locked link can be re-extracted transparently.
  const vsPackCtx = (type: string, tmdb_id: string, season?: number, episode?: number) =>
    Buffer.from(JSON.stringify({ t: type, i: tmdb_id, s: season, e: episode })).toString("base64url");
  const vsUnpackCtx = (x: string): { t: string; i: string; s?: number; e?: number } | null => {
    try { return JSON.parse(Buffer.from(x, "base64url").toString("utf-8")); } catch { return null; }
  };

  // Core extraction with caching. `fresh=true` bypasses caches (self-heal),
  // but a just-refreshed result (< 20s old) is reused so a burst of healing
  // playlist requests triggers only ONE re-scrape.
  // ==========================================================
  // DEFAULT SUBTITLES (OpenSubtitles) — merged into every vs-extract
  // response so subtitle tracks always show up in the player by default
  // (MovieBox-style). Purely additive: scraped provider subtitles keep
  // priority, these are appended after them.
  // ==========================================================
  const VS_SUB_LANGS: Record<string, string> = {
    en: "English", ar: "Arabic", fr: "French", es: "Spanish", de: "German",
    it: "Italian", pt: "Portuguese", ru: "Russian", tr: "Turkish",
  };
  const VS_SUB_MAX_PER_LANG = 3;
  // TMDB v3 key — same public key the frontend already ships with
  // (contexts/constants.ts); used server-side only to resolve IMDB ids.
  const VS_TMDB_KEY = "12b96f7cdd99dcc564c5723a2f256b24";

  const vsOpenSubsHeaders = {
    "X-User-Agent": "trailers.to-UA",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  };

  // OpenSubtitles' legacy REST endpoint has a redirect bug: mixed-case URLs
  // trigger a 302 to "https://_/..." (literal underscore host), which makes
  // fetch die with EAI_AGAIN. Fix: lowercase the URL up-front, follow any
  // redirect manually, and rewrite the broken "_" host back to the real one.
  async function fetchOpenSubtitlesREST(url: string, timeoutMs = 8000) {
    const targetUrl = url.toLowerCase();
    let res = await fetch(targetUrl, {
      headers: vsOpenSubsHeaders,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.status >= 300 && res.status < 400) {
      let location = res.headers.get("location");
      if (location) {
        if (location.startsWith("https://_/")) {
          location = location.replace("https://_/", "https://rest.opensubtitles.org/");
        } else if (location.startsWith("http://_/")) {
          location = location.replace("http://_/", "https://rest.opensubtitles.org/");
        }
        res = await fetch(location, {
          headers: vsOpenSubsHeaders,
          signal: AbortSignal.timeout(timeoutMs),
        });
      }
    }
    return res;
  }

  // Resolve IMDB id from TMDB (memory + redis cached — it never changes).
  const vsImdbCache = new Map<string, string | null>();
  async function vsGetImdbId(type: string, tmdb_id: string): Promise<string | null> {
    const key = `vsimdb:${type}:${tmdb_id}`;
    if (vsImdbCache.has(key)) return vsImdbCache.get(key) ?? null;
    if (redis) {
      try {
        const raw = await redisGet(key);
        if (raw) { vsImdbCache.set(key, raw === "-" ? null : raw); return raw === "-" ? null : raw; }
      } catch {}
    }
    let imdb: string | null = null;
    try {
      const r = await fetch(
        `https://api.themoviedb.org/3/${type === "tv" ? "tv" : "movie"}/${tmdb_id}/external_ids?api_key=${VS_TMDB_KEY}`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (r.ok) {
        const d: any = await r.json();
        imdb = d && typeof d.imdb_id === "string" && /^tt\d+$/.test(d.imdb_id) ? d.imdb_id : null;
      }
    } catch {}
    vsImdbCache.set(key, imdb);
    if (redis) { try { await redis.set(key, imdb || "-", { ex: 60 * 60 * 24 * 30 }); } catch {} }
    return imdb;
  }

  type VsSub = { lang: string; url: string };

  // Primary source: OpenSubtitles legacy REST (with the lowercase fix).
  async function vsSubsFromRest(imdb: string, season?: number, episode?: number): Promise<VsSub[]> {
    const cleanImdb = imdb.replace(/^tt/, "");
    const url =
      season != null && episode != null
        ? `https://rest.opensubtitles.org/search/episode-${episode}/imdbid-${cleanImdb}/season-${season}`
        : `https://rest.opensubtitles.org/search/imdbid-${cleanImdb}`;
    const res = await fetchOpenSubtitlesREST(url);
    if (!res.ok) throw new Error(`REST ${res.status}`);
    const data: any = await res.json();
    if (!Array.isArray(data)) return [];

    const perLang = new Map<string, any[]>();
    for (const item of data) {
      const iso = item?.ISO639;
      if (!iso || !VS_SUB_LANGS[iso] || !item.SubDownloadLink) continue;
      const arr = perLang.get(iso) || [];
      arr.push(item);
      perLang.set(iso, arr);
    }
    const out: VsSub[] = [];
    for (const [iso, arr] of perLang) {
      arr.sort((a, b) => (parseInt(b.SubDownloadsCnt) || 0) - (parseInt(a.SubDownloadsCnt) || 0));
      for (const item of arr.slice(0, VS_SUB_MAX_PER_LANG)) {
        out.push({ lang: VS_SUB_LANGS[iso], url: String(item.SubDownloadLink) });
      }
    }
    return out;
  }

  // Fallback source: free OpenSubtitles mirror (no key, datacenter-IP
  // friendly) so default subtitles still appear if rest.opensubtitles.org
  // walls this server's IP behind a Cloudflare challenge.
  const VS_SUB_ISO3: Record<string, string> = {
    eng: "English", ara: "Arabic", fre: "French", fra: "French", spa: "Spanish",
    ger: "German", deu: "German", ita: "Italian", por: "Portuguese", pob: "Portuguese",
    rus: "Russian", tur: "Turkish",
  };
  async function vsSubsFromMirror(imdb: string, season?: number, episode?: number): Promise<VsSub[]> {
    const url =
      season != null && episode != null
        ? `https://opensubtitles-v3.strem.io/subtitles/series/${imdb}:${season}:${episode}.json`
        : `https://opensubtitles-v3.strem.io/subtitles/movie/${imdb}.json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Mirror ${res.status}`);
    const data: any = await res.json();
    const subs = Array.isArray(data?.subtitles) ? data.subtitles : [];
    const perLang = new Map<string, number>();
    const out: VsSub[] = [];
    for (const s of subs) {
      const label = VS_SUB_ISO3[String(s?.lang || "").toLowerCase()];
      if (!label || !s.url) continue;
      const n = perLang.get(label) || 0;
      if (n >= VS_SUB_MAX_PER_LANG) continue;
      perLang.set(label, n + 1);
      out.push({ lang: label, url: String(s.url) });
    }
    return out;
  }

  // Fetch default subtitles (cached). Never throws — an empty list simply
  // means the player falls back to whatever the stream provider scraped.
  async function vsFetchDefaultSubs(type: string, tmdb_id: string, season?: number, episode?: number): Promise<VsSub[]> {
    const key = `vssubs:${type}:${tmdb_id}:${season ?? ""}:${episode ?? ""}`;
    const mem = vsCache.get(key);
    if (mem && Date.now() - mem.timestamp < 1000 * 60 * 60 * 6) return mem.response;
    if (redis) {
      try {
        const raw = await redisGet(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          vsCacheSet(key, parsed, false);
          return parsed;
        }
      } catch {}
    }
    let subs: VsSub[] = [];
    try {
      const imdb = await vsGetImdbId(type, tmdb_id);
      if (imdb) {
        try {
          subs = await vsSubsFromRest(imdb, season, episode);
        } catch (e: any) {
          console.warn(`[VS subs] REST failed (${e.message}), trying mirror`);
        }
        if (!subs.length) {
          try {
            subs = await vsSubsFromMirror(imdb, season, episode);
          } catch (e: any) {
            console.warn(`[VS subs] mirror failed (${e.message})`);
          }
        }
      }
    } catch {}
    if (subs.length) {
      vsCacheSet(key, subs, true);
      if (redis) { try { await redis.set(key, JSON.stringify(subs), { ex: 60 * 60 * 12 }); } catch {} }
    }
    return subs;
  }

  async function vsExtract(type: string, tmdb_id: string, season?: number, episode?: number, fresh = false) {
    const cacheKey = `vsx:${type}:${tmdb_id}:${season ?? ""}:${episode ?? ""}`;

    if (fresh) {
      // Reuse only results scraped by THIS instance moments ago (burst of
      // healing requests should trigger a single re-scrape).
      const mem = vsCache.get(cacheKey);
      if (mem && mem.local && Date.now() - mem.timestamp < 20000) return mem.response;
    }

    if (!fresh) {
      const mem = vsCache.get(cacheKey);
      if (mem && Date.now() - mem.timestamp < VS_CACHE_TTL_MS) return mem.response;
      if (redis) {
        try {
          const raw = await redisGet(cacheKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            vsCacheSet(cacheKey, parsed, false);
            return parsed;
          }
        } catch {}
      }
    }

    const urls = VS_PROVIDERS.reduce((acc: Record<string, string>, domain) => {
      acc[domain] =
        type === "tv"
          ? `${domain}/embed/tv?tmdb=${tmdb_id}&season=${season}&episode=${episode}`
          : `${domain}/embed/movie/${tmdb_id}`;
      return acc;
    }, {});

    // Default subtitles are fetched IN PARALLEL with the provider race, so
    // they add zero latency to extraction.
    const defaultSubsPromise = vsFetchDefaultSubs(type, tmdb_id, season, episode).catch(() => [] as VsSub[]);

    const winner = await vsFirstSuccess(urls);
    const defaultSubs = await defaultSubsPromise;

    // Merge: scraped provider subtitles keep priority, defaults are appended
    // (deduped by URL and capped per language across both lists).
    const mergedSubs: VsSub[] = [...(winner.subtitles || [])];
    const seenUrls = new Set(mergedSubs.map((s: any) => s && s.url));
    const langCount = new Map<string, number>();
    for (const s of mergedSubs) {
      const l = String((s as any).lang || "").toLowerCase();
      langCount.set(l, (langCount.get(l) || 0) + 1);
    }
    for (const sub of defaultSubs) {
      if (!sub || !sub.url || seenUrls.has(sub.url)) continue;
      const l = sub.lang.toLowerCase();
      if ((langCount.get(l) || 0) >= VS_SUB_MAX_PER_LANG) continue;
      langCount.set(l, (langCount.get(l) || 0) + 1);
      seenUrls.add(sub.url);
      mergedSubs.push(sub);
    }

    const result = {
      domain: winner.domain,
      hlsUrl: winner.hlsUrl,
      subtitles: mergedSubs,
      ctx: vsPackCtx(type, tmdb_id, season, episode),
    };

    vsCacheSet(cacheKey, result, true);
    if (redis) {
      try { await redis.set(cacheKey, JSON.stringify(result), { ex: 60 * 120 }); } catch {}
    }
    return result;
  }

  // Extract endpoint for m3u8 scraper (TMDB id based)
  app.get("/api/vs-extract", async (req, res) => {
    const type = (req.query.type as string) || "movie";
    const tmdb_id = req.query.tmdb_id as string;
    const season = req.query.season ? parseInt(req.query.season as string) : undefined;
    const episode = req.query.episode ? parseInt(req.query.episode as string) : undefined;

    if (!tmdb_id) {
      return res.status(400).json({ success: false, error: "tmdb_id query param is required", results: {} });
    }
    if (type === "tv" && (season == null || episode == null)) {
      return res.status(400).json({ success: false, error: "season and episode query params are required for TV shows", results: {} });
    }

    try {
      const r = await vsExtract(type, tmdb_id, season, episode);
      const proxiedHlsUrl = `/api/vs-proxy/playlist.m3u8?url=${encodeURIComponent(vsStripToken(r.hlsUrl))}&x=${r.ctx}`;
      // Keep the response shape the frontend already understands.
      // Edge caches the extraction for an hour: repeat viewers of the same title
      // get an instant answer without invoking the function at all.
      res.set("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=600");
      res.json({
        success: true,
        results: { [r.domain]: { hls_url: proxiedHlsUrl, subtitles: r.subtitles, error: null } },
      });
    } catch (err: any) {
      res.status(200).json({ success: false, error: err.message, results: {} });
    }
  });

  const VS_UPSTREAM_HEADERS = (req: express.Request) => ({
    "User-Agent": (req.headers["user-agent"] as string) || "Mozilla/5.0",
    "Referer": "https://cloudorchestranova.com/",
  });

  // Fetch a playlist; if it fails and we have a self-heal context,
  // re-extract a fresh link (fresh token from THIS instance's IP) and retry.
  async function vsFetchPlaylistWithHeal(req: express.Request, targetUrl: string, xCtx?: string): Promise<{ text: string; finalUrl: string }> {
    try {
      // Always fetch with a token bound to THIS instance's IP.
      const ownUrl = await vsOwnTokenUrl(targetUrl);
      const r = await vsFetch(ownUrl, { headers: VS_UPSTREAM_HEADERS(req) }, 8000);
      if (r.ok) return { text: await r.text(), finalUrl: ownUrl };
      // Token may have expired mid-flight: force-refresh once and retry.
      if (r.status === 403 || r.status === 401) {
        const freshUrl = await vsOwnTokenUrl(targetUrl, true);
        if (freshUrl !== ownUrl) {
          const r2 = await vsFetch(freshUrl, { headers: VS_UPSTREAM_HEADERS(req) }, 8000);
          if (r2.ok) return { text: await r2.text(), finalUrl: freshUrl };
        }
      }
      throw new Error(`Upstream ${r.status}`);
    } catch (firstErr: any) {
      const ctx = xCtx ? vsUnpackCtx(xCtx) : null;
      if (!ctx) throw firstErr;
      console.warn(`[VS heal] playlist fetch failed (${firstErr.message}), re-extracting fresh link`);

      // Self-heal: re-extract a fresh link (token bound to THIS instance's IP)
      const fresh = await vsExtract(ctx.t, ctx.i, ctx.s, ctx.e, true);

      // Fetch the fresh master playlist
      const masterRes = await vsFetch(fresh.hlsUrl, { headers: VS_UPSTREAM_HEADERS(req) }, 8000);
      if (!masterRes.ok) throw new Error(`Self-heal retry failed: ${masterRes.status}`);
      const masterText = await masterRes.text();

      // If the fresh playlist is a media playlist (no renditions), or the
      // failing URL WAS the master, we are done. Compare basenames (NOT full
      // paths): the encoded path blob changes between extractions, and using
      // full paths made a master request return a VARIANT playlist — which
      // silently removed the quality menu in the player.
      const pathOf = (u: string) => { try { return new URL(u).pathname; } catch { return u; } };
      const baseNameOf = (u: string) => pathOf(u).split("/").pop() || "";
      const isMasterPlaylist = masterText.includes("#EXT-X-STREAM-INF");
      if (!isMasterPlaylist || baseNameOf(targetUrl) === baseNameOf(fresh.hlsUrl)) {
        return { text: masterText, finalUrl: fresh.hlsUrl };
      }

      // The failing URL was a VARIANT: find the matching variant in the fresh
      // master by longest common pathname suffix (rendition hash dir survives
      // token refreshes), fallback to the first variant.
      const masterBase = fresh.hlsUrl.substring(0, fresh.hlsUrl.lastIndexOf("/") + 1);
      const masterOrigin = (() => { try { return new URL(fresh.hlsUrl).origin; } catch { return ""; } })();
      const variants = masterText.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
        .map((l) => (l.startsWith("http") ? l : l.startsWith("/") ? masterOrigin + l : masterBase + l));
      if (variants.length === 0) throw new Error("Self-heal: fresh master has no variants");

      const targetPath = pathOf(targetUrl);
      const suffixLen = (a: string, b: string) => {
        let n = 0;
        while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
        return n;
      };
      let healUrl = variants[0];
      let best = -1;
      for (const v of variants) {
        const score = suffixLen(pathOf(v), targetPath);
        if (score > best) { best = score; healUrl = v; }
      }

      const retry = await vsFetch(healUrl, { headers: VS_UPSTREAM_HEADERS(req) }, 8000);
      if (!retry.ok) throw new Error(`Self-heal retry failed: ${retry.status}`);
      return { text: await retry.text(), finalUrl: healUrl };
    }
  }

  // HLS playlist proxy (rewrites nested playlists and segments through our proxy)
  app.get("/api/vs-proxy/playlist.m3u8", async (req, res) => {
    const targetUrl = req.query.url as string;
    const xCtx = req.query.x as string | undefined;
    if (!targetUrl) return res.status(400).send("Missing url");

    try {
      const { text: m3u8Content, finalUrl } = await vsFetchPlaylistWithHeal(req, targetUrl, xCtx);

      const targetUrlObj = new URL(finalUrl);
      const hostUrl = `${targetUrlObj.protocol}//${targetUrlObj.host}`;
      const baseUrl = finalUrl.substring(0, finalUrl.lastIndexOf("/") + 1);
      const xParam = xCtx ? `&x=${xCtx}` : "";

      // When segments are offloaded to the edge worker, tell it where to fall
      // back (this deployment) if the upstream ever rejects the worker.
      const selfProto = ((req.headers["x-forwarded-proto"] as string) || "https").split(",")[0].trim();
      const selfHost = (req.headers["x-forwarded-host"] as string) || (req.headers.host as string) || "";
      const fbParam = VS_STREAM_PROXY && selfHost ? `&fb=${encodeURIComponent(`${selfProto}://${selfHost}`)}` : "";

      const rewritten = m3u8Content
        .split("\n")
        .map((line) => {
          const tline = line.trim();
          if (!tline || tline.startsWith("#")) return line;

          let fullUrl = tline;
          if (tline.startsWith("http")) {
            fullUrl = tline;
          } else if (tline.startsWith("/")) {
            fullUrl = hostUrl + tline;
          } else {
            fullUrl = baseUrl + tline;
          }

          // Strip the (instance-specific) token so proxied URLs are identical
          // for every viewer — the proxy re-attaches its own token upstream.
          // Identical URLs mean the CDN/edge cache can serve segments without
          // ever invoking the function again.
          const cleanUrl = vsStripToken(fullUrl);

          // Check if the URL is another m3u8 or a ts chunk
          if (fullUrl.includes(".m3u8")) {
            return `/api/vs-proxy/playlist.m3u8?url=${encodeURIComponent(cleanUrl)}${xParam}`;
          } else if (VS_STREAM_PROXY) {
            // Offload the heavy video bytes to the edge worker. The worker
            // falls back to /api/vs-proxy/ts here if upstream rejects it.
            return `${VS_STREAM_PROXY}/ts?url=${encodeURIComponent(cleanUrl)}${xParam}${fbParam}`;
          } else {
            return `/api/vs-proxy/ts?url=${encodeURIComponent(cleanUrl)}${xParam}`;
          }
        })
        .join("\n");

      res.set("Content-Type", "application/vnd.apple.mpegurl");
      res.set("Access-Control-Allow-Origin", "*");
      // VOD playlists rarely change: let the browser + edge cache them briefly
      res.set("Cache-Control", "public, max-age=60, s-maxage=3600, stale-while-revalidate=600");
      res.send(rewritten);
    } catch (err: any) {
      res.status(502).send("Proxy error: " + err.message);
    }
  });

  // Self-heal for a SEGMENT: re-extract, walk fresh master -> matching variant
  // -> segment with the same basename. Handles expired / IP-locked tokens.
  async function vsHealSegment(req: express.Request, targetUrl: string, xCtx: string): Promise<string | null> {
    try {
      const ctx = vsUnpackCtx(xCtx);
      if (!ctx) return null;
      const fresh = await vsExtract(ctx.t, ctx.i, ctx.s, ctx.e, true);
      const masterRes = await vsFetch(fresh.hlsUrl, { headers: VS_UPSTREAM_HEADERS(req) }, 8000);
      if (!masterRes.ok) return null;
      const masterText = await masterRes.text();
      const masterBase = fresh.hlsUrl.substring(0, fresh.hlsUrl.lastIndexOf("/") + 1);
      const masterOrigin = (() => { try { return new URL(fresh.hlsUrl).origin; } catch { return ""; } })();
      const absolutize = (l: string, base: string) => (l.startsWith("http") ? l : l.startsWith("/") ? masterOrigin + l : base + l);
      const pathOf = (u: string) => { try { return new URL(u).pathname; } catch { return u; } };
      const suffixLen = (a: string, b: string) => {
        let n = 0;
        while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
        return n;
      };
      const targetPath = pathOf(targetUrl);
      const targetDir = targetPath.substring(0, targetPath.lastIndexOf("/") + 1);
      const targetName = targetPath.split("/").pop();

      // Candidate media playlists: the master itself (if media) or its variants
      let mediaUrls: string[] = [];
      if (masterText.includes("#EXT-X-STREAM-INF")) {
        mediaUrls = masterText.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
          .map((l) => absolutize(l, masterBase));
        // best variant first: the one whose dir matches the failing segment's dir
        mediaUrls.sort((a, b) => suffixLen(pathOf(b).substring(0, pathOf(b).lastIndexOf("/") + 1), targetDir) - suffixLen(pathOf(a).substring(0, pathOf(a).lastIndexOf("/") + 1), targetDir));
        mediaUrls = mediaUrls.slice(0, 2);
      } else {
        mediaUrls = [fresh.hlsUrl];
      }

      for (const mu of mediaUrls) {
        const mRes = await vsFetch(mu, { headers: VS_UPSTREAM_HEADERS(req) }, 8000);
        if (!mRes.ok) continue;
        const mText = await mRes.text();
        const mBase = mu.substring(0, mu.lastIndexOf("/") + 1);
        const segs = mText.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
          .map((l) => absolutize(l, mBase));
        const match = segs.find((s) => pathOf(s).split("/").pop() === targetName);
        if (match) return match;
      }
    } catch (e: any) {
      console.warn(`[VS heal] segment heal failed: ${e.message}`);
    }
    return null;
  }

  // HLS segment proxy (streams + strong cache so concurrent viewers hit the edge cache)
  app.get("/api/vs-proxy/ts", async (req, res) => {
    const targetUrl = req.query.url as string;
    const xCtx = req.query.x as string | undefined;
    if (!targetUrl) return res.status(400).send("Missing url");

    const attempt = (u: string) => vsFetch(u, { headers: VS_UPSTREAM_HEADERS(req) }, 15000);

    try {
      // Fastest path: segment hosts accept token-less requests (tokens are
      // only enforced on playlists), so skip all token lookups. This removes
      // a generate.php roundtrip on cold instances and shaves latency off
      // EVERY segment — the main cause of the "heavy playback" stutter.
      let retryUrl = targetUrl;
      let fetchRes = await attempt(targetUrl).catch(() => null as any);
      if (!fetchRes || fetchRes.status === 403 || fetchRes.status === 401) {
        // This host does enforce tokens: attach one bound to THIS instance's IP.
        retryUrl = await vsOwnTokenUrl(targetUrl);
        fetchRes = await attempt(retryUrl).catch(() => fetchRes);
        if (fetchRes && (fetchRes.status === 403 || fetchRes.status === 401)) {
          // Our cached token expired: force-refresh once and retry.
          retryUrl = await vsOwnTokenUrl(targetUrl, true);
          fetchRes = await attempt(retryUrl).catch(() => fetchRes);
        }
      }
      if ((!fetchRes || !fetchRes.ok) && xCtx) {
        // Link itself is dead: self-heal via fresh extraction (rare now)
        const healed = await vsHealSegment(req, targetUrl, xCtx);
        if (healed) fetchRes = await attempt(await vsOwnTokenUrl(healed)).catch(() => fetchRes);
      }
      if (!fetchRes || !fetchRes.ok) {
        // one last quick retry — segment hosts occasionally hiccup
        fetchRes = await attempt(retryUrl);
      }
      if (!fetchRes.ok) {
        return res.status(fetchRes.status).send("Failed to fetch ts");
      }

      // Always force MPEG-TS video content type to avoid MIME-type decode issues in browsers
      res.set("Content-Type", "video/mp2t");
      res.set("Access-Control-Allow-Origin", "*");
      // Segments are immutable: cache aggressively at edge + browser
      res.set("Cache-Control", "public, max-age=3600, s-maxage=86400, immutable");
      const len = fetchRes.headers.get("content-length");
      if (len) res.set("Content-Length", len);

      // stream the response
      if (fetchRes.body) {
        // @ts-ignore
        Readable.fromWeb(fetchRes.body).pipe(res);
      } else {
        res.send(Buffer.from(await fetchRes.arrayBuffer()));
      }
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(502).send("Proxy error: " + err.message);
      }
    }
  });

  // Subtitle proxy: converts SRT to VTT and fixes CORS
  app.get("/api/vs-sub", async (req, res) => {
    const fileUrl = req.query.url as string;
    if (!fileUrl) return res.status(400).send("Missing subtitle URL");

    try {
      const subtitleRes = await vsFetch(fileUrl, {}, 10000);

      // OpenSubtitles download links serve gzipped SRT files — detect the
      // gzip magic bytes and decompress before converting to VTT.
      const arrayBuffer = await subtitleRes.arrayBuffer();
      let buffer = Buffer.from(arrayBuffer);
      const isGzipped =
        (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) ||
        fileUrl.toLowerCase().includes(".gz");
      if (isGzipped) {
        try {
          buffer = zlib.gunzipSync(buffer);
        } catch (e: any) {
          console.error("[VS] Failed to gunzip subtitle:", e.message);
        }
      }
      const raw = buffer.toString("utf-8");

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "text/vtt");
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");

      if (raw.trim().startsWith("WEBVTT")) {
        return res.send(raw);
      }

      const vtt =
        "WEBVTT\n\n" +
        raw
          .replace(/\r+/g, "")
          .replace(/^\s+|\s+$/g, "")
          .split("\n")
          .map((line) =>
            line.replace(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/g, "$1:$2:$3.$4")
          )
          .join("\n");

      res.send(vtt);
    } catch (err: any) {
      console.error("[VS] Subtitle Proxy Error:", err.message);
      res.status(500).send("Failed to convert subtitle");
    }
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
