export interface AuthUser {
  id: string;
  username: string;
  role: "admin" | "user";
  banned: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminStats {
  total: number;
  admins: number;
  banned: number;
  activeSessions: number;
}

const TOKEN_KEY = "cineAuthToken";
const USER_KEY = "cineAuthUser";

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const getCachedUser = (): AuthUser | null => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
};

export const setSession = (token: string, user: AuthUser) => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (e) {
    console.error("Failed to persist auth session:", e);
  }
};

export const clearSession = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch (e) {
    console.error("Failed to clear auth session:", e);
  }
};

const request = async (path: string, options: RequestInit = {}) => {
  const token = getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
};

export const signup = async (username: string, password: string) => {
  const data = await request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setSession(data.token, data.user);
  return data.user as AuthUser;
};

export const login = async (username: string, password: string) => {
  const data = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setSession(data.token, data.user);
  return data.user as AuthUser;
};

export const logout = async () => {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } catch {
    // Even if the server call fails, clear the local session
  }
  clearSession();
};

export const fetchMe = async (): Promise<AuthUser | null> => {
  if (!getToken()) return null;
  try {
    const data = await request("/api/auth/me");
    setSession(getToken() as string, data.user);
    return data.user as AuthUser;
  } catch {
    clearSession();
    return null;
  }
};

// --- QR pairing (TV login) ---

export const qrCreate = async (): Promise<{ code: string; expiresInSeconds: number }> =>
  request("/api/auth/qr/create", { method: "POST" });

export const qrStatus = async (
  code: string,
): Promise<{ status: "pending" | "approved" | "expired"; token?: string; user?: AuthUser }> =>
  request(`/api/auth/qr/status?code=${encodeURIComponent(code)}`);

export const qrApprove = async (code: string) =>
  request("/api/auth/qr/approve", {
    method: "POST",
    body: JSON.stringify({ code }),
  });

// --- Admin ---

export const adminFetchUsers = async (): Promise<{ users: AuthUser[]; stats: AdminStats }> =>
  request("/api/admin/users");

export const adminToggleBan = async (id: string): Promise<AuthUser> =>
  (await request(`/api/admin/users/${id}/toggle-ban`, { method: "POST" })).user;

export const adminSetRole = async (id: string, role: "admin" | "user"): Promise<AuthUser> =>
  (await request(`/api/admin/users/${id}/role`, {
    method: "POST",
    body: JSON.stringify({ role }),
  })).user;

export const adminDeleteUser = async (id: string) =>
  request(`/api/admin/users/${id}`, { method: "DELETE" });