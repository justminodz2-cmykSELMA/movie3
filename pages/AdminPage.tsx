import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useProfile } from "../contexts/ProfileContext";
import {
  fetchMe,
  adminFetchUsers,
  adminToggleBan,
  adminSetRole,
  adminDeleteUser,
  AuthUser,
  AdminStats,
} from "../services/authService";

const StatCard: React.FC<{ icon: string; label: string; value: number; accent?: string }> = ({
  icon,
  label,
  value,
  accent = "text-red-500",
}) => (
  <div className="flex-1 min-w-[150px] bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 flex items-center gap-4 backdrop-blur-md">
    <div className={`w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xl ${accent}`}>
      <i className={icon}></i>
    </div>
    <div>
      <div className="text-2xl font-black text-white leading-none">{value}</div>
      <div className="text-xs text-zinc-400 uppercase tracking-widest mt-1">{label}</div>
    </div>
  </div>
);

const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { setToast } = useProfile();

  const [me, setMe] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetchUsers();
      setUsers(data.users);
      setStats(data.stats);
    } catch (err: any) {
      setError(err?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe().then((user) => {
      setMe(user);
      setChecking(false);
      if (user?.role === "admin") loadUsers();
    });
  }, [loadUsers]);

  const handleToggleBan = async (u: AuthUser) => {
    try {
      const updated = await adminToggleBan(u.id);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
      setToast({ message: updated.banned ? `${u.username} banned` : `${u.username} unbanned`, type: "info" });
      loadUsers();
    } catch (err: any) {
      setToast({ message: err?.message || "Action failed", type: "error" });
    }
  };

  const handleToggleRole = async (u: AuthUser) => {
    try {
      const updated = await adminSetRole(u.id, u.role === "admin" ? "user" : "admin");
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
      setToast({ message: `${u.username} is now ${updated.role}`, type: "success" });
      loadUsers();
    } catch (err: any) {
      setToast({ message: err?.message || "Action failed", type: "error" });
    }
  };

  const handleDelete = async (u: AuthUser) => {
    if (!window.confirm(`Delete user "${u.username}" permanently?`)) return;
    try {
      await adminDeleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setToast({ message: `${u.username} deleted`, type: "info" });
      loadUsers();
    } catch (err: any) {
      setToast({ message: err?.message || "Action failed", type: "error" });
    }
  };

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString() + " " + new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

  const actionBtn =
    "px-3 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap focusable";

  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <i className="fa-solid fa-circle-notch fa-spin text-4xl text-red-600"></i>
      </div>
    );
  }

  if (!me || me.role !== "admin") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950 text-white flex flex-col items-center justify-center px-6">
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-10 max-w-md w-full text-center shadow-2xl">
          <div className="w-20 h-20 mx-auto rounded-full bg-red-600/15 border border-red-600/40 flex items-center justify-center mb-5">
            <i className="fa-solid fa-lock text-3xl text-red-500"></i>
          </div>
          <h1 className="text-2xl font-bold mb-2">Admin access required</h1>
          <p className="text-sm text-zinc-400 mb-8">
            {me ? "Your account does not have admin permissions." : "Log in with an admin account to open this panel."}
          </p>
          <div className="space-y-3">
            <button
              onClick={() => navigate("/login")}
              className="w-full py-4 bg-red-600 hover:bg-red-500 rounded-xl font-bold transition-colors focusable"
              tabIndex={0}
            >
              Go to Login
            </button>
            <button
              onClick={() => navigate("/")}
              className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold transition-colors focusable"
              tabIndex={0}
            >
              Back to App
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950 text-white px-4 md:px-10 py-10">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-600/15 border border-red-600/40 flex items-center justify-center text-red-500 text-xl">
              <i className="fa-solid fa-shield-halved"></i>
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black">Admin Panel</h1>
              <p className="text-sm text-zinc-400">Signed in as {me.username}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadUsers}
              className="px-5 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-bold transition-colors focusable"
              tabIndex={0}
            >
              <i className={`fa-solid fa-rotate mr-2 ${loading ? "fa-spin" : ""}`}></i>Refresh
            </button>
            <button
              onClick={() => navigate("/")}
              className="px-5 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-bold transition-colors focusable"
              tabIndex={0}
            >
              <i className="fa-solid fa-arrow-left mr-2"></i>Back to App
            </button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="flex flex-wrap gap-4 mb-8">
            <StatCard icon="fa-solid fa-users" label="Total Users" value={stats.total} />
            <StatCard icon="fa-solid fa-shield-halved" label="Admins" value={stats.admins} accent="text-amber-500" />
            <StatCard icon="fa-solid fa-ban" label="Banned" value={stats.banned} accent="text-red-500" />
            <StatCard icon="fa-solid fa-tower-broadcast" label="Active Sessions" value={stats.activeSessions} accent="text-green-500" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-6">
            <i className="fa-solid fa-circle-exclamation"></i>
            <span>{error}</span>
          </div>
        )}

        {/* Users list */}
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl overflow-hidden backdrop-blur-md">
          <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="font-bold text-lg">Users</h2>
            <span className="text-xs text-zinc-500 uppercase tracking-widest">{users.length} accounts</span>
          </div>

          {loading && users.length === 0 ? (
            <div className="p-10 text-center">
              <i className="fa-solid fa-circle-notch fa-spin text-2xl text-red-600"></i>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/70">
              {users.map((u) => (
                <div key={u.id} className="px-6 py-4 flex flex-wrap items-center gap-4">
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-lg flex-shrink-0 ${
                      u.role === "admin"
                        ? "bg-amber-500/15 border border-amber-500/40 text-amber-500"
                        : "bg-zinc-800 border border-zinc-700 text-zinc-300"
                    }`}
                  >
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">{u.username}</span>
                      {u.role === "admin" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-amber-500/15 text-amber-500 border border-amber-500/40">
                          Admin
                        </span>
                      )}
                      {u.banned && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-red-500/15 text-red-500 border border-red-500/40">
                          Banned
                        </span>
                      )}
                      {u.id === me.id && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-zinc-700 text-zinc-300">
                          You
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      Joined {formatDate(u.createdAt)} • Last login {formatDate(u.lastLoginAt)}
                    </div>
                  </div>

                  {u.id !== me.id && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => handleToggleRole(u)}
                        className={`${actionBtn} bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/30`}
                        tabIndex={0}
                      >
                        <i className="fa-solid fa-shield-halved mr-1"></i>
                        {u.role === "admin" ? "Remove Admin" : "Make Admin"}
                      </button>
                      <button
                        onClick={() => handleToggleBan(u)}
                        className={`${actionBtn} ${
                          u.banned
                            ? "bg-green-500/10 text-green-500 hover:bg-green-500/20 border border-green-500/30"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700"
                        }`}
                        tabIndex={0}
                      >
                        <i className={`fa-solid ${u.banned ? "fa-unlock" : "fa-ban"} mr-1`}></i>
                        {u.banned ? "Unban" : "Ban"}
                      </button>
                      <button
                        onClick={() => handleDelete(u)}
                        className={`${actionBtn} bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/30`}
                        tabIndex={0}
                      >
                        <i className="fa-solid fa-trash mr-1"></i>Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {users.length === 0 && !loading && (
                <div className="p-10 text-center text-zinc-500 text-sm">No users found.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPage;