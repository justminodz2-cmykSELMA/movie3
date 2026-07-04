// Shared auth backend for Vercel serverless functions.
// Mirrors the Express routes in server.ts so login/signup/QR/admin work in production.
// Storage: Upstash Redis if UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_*)
// env vars are set (recommended for persistence), otherwise a /tmp file fallback.
import crypto from "crypto";
import fs from "fs";
import path from "path";

export interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  role: "admin" | "user";
  banned: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

type Sessions = Record<string, { userId: string; createdAt: number }>;
type QrEntry = { status: "pending" | "approved"; token?: string; createdAt: number };
type QrCodes = Record<string, QrEntry>;

const QR_TTL_MS = 5 * 60 * 1000;

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const hasRedis = Boolean(REDIS_URL && REDIS_TOKEN);

const TMP_DIR = "/tmp/vetrix-auth";

const redisGet = async (key: string): Promise<string | null> => {
  const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const j: any = await r.json().catch(() => null);
  return j && j.result != null ? String(j.result) : null;
};

const redisSet = async (key: string, value: string) => {
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    body: value,
  });
};

const loadJson = async <T>(key: string, fallback: T): Promise<T> => {
  try {
    if (hasRedis) {
      const raw = await redisGet(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    }
    const file = path.join(TMP_DIR, `${key}.json`);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch (e) {
    console.error(`[Auth] Failed to load ${key}:`, e);
  }
  return fallback;
};

const saveJson = async (key: string, data: any) => {
  const raw = JSON.stringify(data);
  try {
    if (hasRedis) {
      await redisSet(key, raw);
      return;
    }
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
    fs.writeFileSync(path.join(TMP_DIR, `${key}.json`), raw, "utf-8");
  } catch (e) {
    console.error(`[Auth] Failed to save ${key}:`, e);
  }
};

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

// Loads users and seeds the owner admin account, same as server.ts
const loadUsers = async (): Promise<StoredUser[]> => {
  let users = await loadJson<StoredUser[]>("auth-users", []);
  if (!Array.isArray(users)) users = [];
  let changed = false;
  const owner = users.find((u) => u.username === "adminown1");
  if (owner && owner.role !== "admin") {
    owner.role = "admin";
    changed = true;
  }
  if (!owner) {
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
    changed = true;
  }
  if (changed) await saveJson("auth-users", users);
  return users;
};

const loadSessions = async () => {
  let sessions = await loadJson<Sessions>("auth-sessions", {});
  if (!sessions || typeof sessions !== "object" || Array.isArray(sessions)) sessions = {};
  return sessions;
};

const loadQr = async (): Promise<QrCodes> => {
  let all = await loadJson<QrCodes>("auth-qr", {});
  if (!all || typeof all !== "object" || Array.isArray(all)) all = {};
  const now = Date.now();
  const cleaned: QrCodes = {};
  for (const [code, entry] of Object.entries(all)) {
    if (now - entry.createdAt <= QR_TTL_MS) cleaned[code] = entry;
  }
  return cleaned;
};

const getTokenFromReq = (req: any): string => {
  const auth = String(req.headers?.authorization || "");
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return String(req.query?.token || "");
};

const getUserByToken = (req: any, users: StoredUser[], sessions: Sessions): StoredUser | null => {
  const token = getTokenFromReq(req);
  if (!token) return null;
  const session = sessions[token];
  if (!session) return null;
  const user = users.find((u) => u.id === session.userId);
  if (!user || user.banned) return null;
  return user;
};

const createSession = async (
  user: StoredUser,
  users: StoredUser[],
  sessions: Sessions,
): Promise<string> => {
  const token = crypto.randomBytes(32).toString("hex");
  sessions[token] = { userId: user.id, createdAt: Date.now() };
  user.lastLoginAt = new Date().toISOString();
  await saveJson("auth-sessions", sessions);
  await saveJson("auth-users", users);
  return token;
};

const setCors = (res: any) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
};

const readBody = (req: any): any => (req.body && typeof req.body === "object" ? req.body : {});

const routeSegments = (req: any): string[] => {
  const p = req.query?.path;
  if (Array.isArray(p)) return p;
  if (typeof p === "string" && p) return p.split("/");

  if (req.url) {
    const pathname = req.url.split("?")[0];
    const match = pathname.match(/^\/api\/[^\/]+\/(.*)$/);
    if (match) return match[1].split("/").filter(Boolean);
    return pathname.split("/").filter(Boolean);
  }

  return [];
};

export async function handleAuth(req: any, res: any) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const route = routeSegments(req).join("/");
  const body = readBody(req);

  try {
    const users = await loadUsers();
    const sessions = await loadSessions();

    if (route === "signup" && req.method === "POST") {
      const { username, password } = body;
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
      const token = await createSession(user, users, sessions);
      return res.status(200).json({ token, user: publicUser(user) });
    }

    if (route === "login" && req.method === "POST") {
      const { username, password } = body;
      const user = users.find(
        (u) => u.username.toLowerCase() === String(username || "").trim().toLowerCase(),
      );
      if (!user || user.passwordHash !== hashPassword(String(password || ""), user.salt)) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      if (user.banned) {
        return res.status(403).json({ error: "This account has been banned" });
      }
      const token = await createSession(user, users, sessions);
      return res.status(200).json({ token, user: publicUser(user) });
    }

    if (route === "logout" && req.method === "POST") {
      const token = getTokenFromReq(req);
      if (token && sessions[token]) {
        delete sessions[token];
        await saveJson("auth-sessions", sessions);
      }
      return res.status(200).json({ ok: true });
    }

    if (route === "me" && req.method === "GET") {
      const user = getUserByToken(req, users, sessions);
      if (!user) return res.status(401).json({ error: "Not authenticated" });
      return res.status(200).json({ user: publicUser(user) });
    }

    if (route === "qr/create" && req.method === "POST") {
      const qr = await loadQr();
      const code = crypto.randomBytes(3).toString("hex").toUpperCase();
      qr[code] = { status: "pending", createdAt: Date.now() };
      await saveJson("auth-qr", qr);
      return res.status(200).json({ code, expiresInSeconds: QR_TTL_MS / 1000 });
    }

    if (route === "qr/status" && req.method === "GET") {
      const qr = await loadQr();
      const code = String(req.query?.code || "").toUpperCase();
      const entry = qr[code];
      if (!entry) return res.status(200).json({ status: "expired" });
      if (entry.status === "approved" && entry.token) {
        const session = sessions[entry.token];
        const user = session ? users.find((u) => u.id === session.userId) : null;
        delete qr[code];
        await saveJson("auth-qr", qr);
        return res.status(200).json({
          status: "approved",
          token: entry.token,
          user: user ? publicUser(user) : null,
        });
      }
      return res.status(200).json({ status: "pending" });
    }

    if (route === "qr/approve" && req.method === "POST") {
      const user = getUserByToken(req, users, sessions);
      if (!user) return res.status(401).json({ error: "Log in first to approve the TV" });
      const qr = await loadQr();
      const code = String(body.code || "").toUpperCase();
      const entry = qr[code];
      if (!entry || entry.status !== "pending") {
        return res.status(404).json({ error: "Code expired or invalid. Refresh the QR on your TV." });
      }
      entry.token = await createSession(user, users, sessions);
      entry.status = "approved";
      await saveJson("auth-qr", qr);
      return res.status(200).json({ ok: true });
    }

    // ========================================================
    // ADDON STUDIO — per-user personal addon manager (PC link).
    // Strictly neutral scope: reads/writes ONLY addon data for
    // the link's owner. Never touches accounts or sessions.
    // ========================================================
    const segs = route.split("/");
    if (segs[0] === "studio") {
      type StudioLink = { userId: string; profileId: string; profileName: string; createdAt: number };
      const loadLinks = async (): Promise<Record<string, StudioLink>> => {
        let links = await loadJson<Record<string, StudioLink>>("studio-links", {});
        if (!links || typeof links !== "object" || Array.isArray(links)) links = {};
        return links;
      };
      const addonsKey = (l: StudioLink) => `studio-addons-${l.userId}-${l.profileId}`;

      if (segs[1] === "link" && req.method === "POST") {
        const user = getUserByToken(req, users, sessions);
        if (!user) return res.status(401).json({ error: "Not authenticated" });
        const links = await loadLinks();
        const profileId = String(body.profileId || "default");
        const profileName = String(body.profileName || "");
        let token = Object.keys(links).find(
          (k) => links[k].userId === user.id && links[k].profileId === profileId,
        );
        if (!token) {
          token = crypto.randomBytes(12).toString("hex");
          links[token] = { userId: user.id, profileId, profileName, createdAt: Date.now() };
          await saveJson("studio-links", links);
        } else if (profileName && links[token].profileName !== profileName) {
          links[token].profileName = profileName;
          await saveJson("studio-links", links);
        }
        const store = await loadJson<{ rev: number; addons: any[] }>(addonsKey(links[token]), { rev: 0, addons: [] });
        return res.status(200).json({ token, rev: store.rev || 0 });
      }

      const stoken = String(segs[1] || "");
      const links = await loadLinks();
      const link = links[stoken];
      if (!link) return res.status(404).json({ error: "Invalid studio link" });

      if (segs[2] === "addons" && req.method === "GET") {
        const owner = users.find((u) => u.id === link.userId);
        const store = await loadJson<{ rev: number; addons: any[] }>(addonsKey(link), { rev: 0, addons: [] });
        return res.status(200).json({
          rev: store.rev || 0,
          addons: Array.isArray(store.addons) ? store.addons : [],
          profileName: link.profileName || "",
          username: owner ? owner.username : "",
        });
      }

      if (segs[2] === "addons" && req.method === "POST") {
        const addons = Array.isArray(body.addons) ? body.addons : null;
        if (!addons) return res.status(400).json({ error: "addons must be an array" });
        if (JSON.stringify(addons).length > 900_000) return res.status(413).json({ error: "Addon data too large" });
        const store = await loadJson<{ rev: number; addons: any[] }>(addonsKey(link), { rev: 0, addons: [] });
        const nextStore = { rev: (store.rev || 0) + 1, addons, updatedAt: Date.now() };
        await saveJson(addonsKey(link), nextStore);
        return res.status(200).json({ ok: true, rev: nextStore.rev });
      }
    }

    return res.status(404).json({ error: "Not found" });
  } catch (e) {
    console.error("[Auth] Unexpected error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}

export async function handleAdmin(req: any, res: any) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const segs = routeSegments(req);
  const body = readBody(req);

  try {
    const users = await loadUsers();
    const sessions = await loadSessions();

    const admin = getUserByToken(req, users, sessions);
    if (!admin) return res.status(401).json({ error: "Not authenticated" });
    if (admin.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    // GET /api/admin/users
    if (segs.length === 1 && segs[0] === "users" && req.method === "GET") {
      return res.status(200).json({
        users: users.map(publicUser),
        stats: {
          total: users.length,
          admins: users.filter((u) => u.role === "admin").length,
          banned: users.filter((u) => u.banned).length,
          activeSessions: Object.keys(sessions).length,
        },
      });
    }

    // POST /api/admin/users/:id/toggle-ban
    if (segs.length === 3 && segs[0] === "users" && segs[2] === "toggle-ban" && req.method === "POST") {
      const target = users.find((u) => u.id === segs[1]);
      if (!target) return res.status(404).json({ error: "User not found" });
      if (target.id === admin.id) return res.status(400).json({ error: "You cannot ban yourself" });
      target.banned = !target.banned;
      if (target.banned) {
        for (const [tok, s] of Object.entries(sessions)) {
          if (s.userId === target.id) delete sessions[tok];
        }
        await saveJson("auth-sessions", sessions);
      }
      await saveJson("auth-users", users);
      return res.status(200).json({ user: publicUser(target) });
    }

    // POST /api/admin/users/:id/role
    if (segs.length === 3 && segs[0] === "users" && segs[2] === "role" && req.method === "POST") {
      const target = users.find((u) => u.id === segs[1]);
      if (!target) return res.status(404).json({ error: "User not found" });
      if (target.id === admin.id) return res.status(400).json({ error: "You cannot change your own role" });
      const role = body.role;
      if (role !== "admin" && role !== "user") return res.status(400).json({ error: "Invalid role" });
      target.role = role;
      await saveJson("auth-users", users);
      return res.status(200).json({ user: publicUser(target) });
    }

    // DELETE /api/admin/users/:id
    if (segs.length === 2 && segs[0] === "users" && req.method === "DELETE") {
      if (segs[1] === admin.id) return res.status(400).json({ error: "You cannot delete yourself" });
      const before = users.length;
      const remaining = users.filter((u) => u.id !== segs[1]);
      if (remaining.length === before) return res.status(404).json({ error: "User not found" });
      for (const [tok, s] of Object.entries(sessions)) {
        if (s.userId === segs[1]) delete sessions[tok];
      }
      await saveJson("auth-sessions", sessions);
      await saveJson("auth-users", remaining);
      return res.status(200).json({ ok: true });
    }

    return res.status(404).json({ error: "Not found" });
  } catch (e) {
    console.error("[Admin] Unexpected error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
