import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useProfile } from "../contexts/ProfileContext";
import {
  login,
  signup,
  logout,
  fetchMe,
  qrCreate,
  qrStatus,
  setSession,
  AuthUser,
} from "../services/authService";
import {
  enableGuestMode,
  resetGuestWatchCount,
  getGuestWatchCount,
  GUEST_VIDEO_LIMIT,
} from "../components/AuthGuard";

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { setToast } = useProfile();

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // Form state
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // QR state
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrExpired, setQrExpired] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchMe().then((user) => {
      setCurrentUser(user);
      setCheckingSession(false);
    });
  }, []);

  const startQrSession = useCallback(async () => {
    setQrExpired(false);
    setQrCode(null);
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      const { code, expiresInSeconds } = await qrCreate();
      setQrCode(code);

      const expireTimer = setTimeout(() => {
        setQrExpired(true);
        if (pollRef.current) clearInterval(pollRef.current);
      }, expiresInSeconds * 1000);

      pollRef.current = setInterval(async () => {
        try {
          const status = await qrStatus(code);
          if (status.status === "approved" && status.token && status.user) {
            if (pollRef.current) clearInterval(pollRef.current);
            clearTimeout(expireTimer);
            setSession(status.token, status.user);
            resetGuestWatchCount();
            setCurrentUser(status.user);
            setToast({ message: `Welcome, ${status.user.username}!`, type: "success" });
            navigate("/");
          } else if (status.status === "expired") {
            if (pollRef.current) clearInterval(pollRef.current);
            clearTimeout(expireTimer);
            setQrExpired(true);
          }
        } catch {
          // Network hiccup while polling: keep trying silently
        }
      }, 3000);
    } catch {
      setQrExpired(true);
    }
  }, [navigate, setToast]);

  useEffect(() => {
    if (!checkingSession && !currentUser) {
      startQrSession();
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [checkingSession, currentUser, startQrSession]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const user =
        mode === "login"
          ? await login(username, password)
          : await signup(username, password);
      resetGuestWatchCount();
      setCurrentUser(user);
      setToast({
        message: mode === "login" ? `Welcome back, ${user.username}!` : `Account created. Welcome, ${user.username}!`,
        type: "success",
      });
      navigate("/");
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setCurrentUser(null);
    setToast({ message: "Logged out", type: "info" });
  };

  const handleContinueWithoutAccount = () => {
    enableGuestMode();
    const left = Math.max(0, GUEST_VIDEO_LIMIT - getGuestWatchCount());
    setToast({
      message: `Sign up or log in to get a full account with no limits. Without an account you can only watch ${GUEST_VIDEO_LIMIT} videos (${left} remaining).`,
      type: "info",
    });
    navigate("/");
  };

  const approveUrl = qrCode
    ? `${window.location.origin}${window.location.pathname}#/qr-approve?code=${qrCode}`
    : "";
  const qrImageUrl = approveUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=440x440&margin=12&bgcolor=ffffff&color=18181b&data=${encodeURIComponent(approveUrl)}`
    : "";

  const inputClasses =
    "w-full bg-zinc-900/80 border border-zinc-700 focus:border-red-600 px-5 py-4 text-base text-white placeholder-zinc-500 rounded-xl outline-none transition-colors focusable";

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <i className="fa-solid fa-circle-notch fa-spin text-4xl text-red-600"></i>
      </div>
    );
  }

  // Already logged in view
  if (currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950 flex flex-col items-center justify-center px-6 text-white">
        <img
        src="https://i.ibb.co/Vc2jxqRR/Chat-GPT-Image-Jul-1-2026-01-37-52-PM.png"
        alt="Vetrix"
        className="w-28 h-28 object-contain mb-10"
      />
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-10 max-w-md w-full text-center shadow-2xl backdrop-blur-md">
          <div className="w-20 h-20 mx-auto rounded-full bg-red-600/15 border border-red-600/40 flex items-center justify-center mb-5">
            <i className="fa-solid fa-user text-3xl text-red-500"></i>
          </div>
          <h1 className="text-2xl font-bold mb-1">Signed in as {currentUser.username}</h1>
          <p className="text-sm text-zinc-400 mb-8 capitalize">{currentUser.role} account</p>
          <div className="space-y-3">
            <button
              onClick={() => navigate("/")}
              className="w-full py-4 bg-red-600 hover:bg-red-500 rounded-xl font-bold text-base transition-colors focusable"
              tabIndex={0}
            >
              Continue to App
            </button>
            {currentUser.role === "admin" && (
              <button
                onClick={() => navigate("/admin")}
                className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold text-base transition-colors focusable"
                tabIndex={0}
              >
                <i className="fa-solid fa-shield-halved mr-2"></i>Admin Panel
              </button>
            )}
            <button
              onClick={handleLogout}
              className="w-full py-4 bg-transparent border border-zinc-700 hover:border-red-600 hover:text-red-500 rounded-xl font-bold text-base transition-colors focusable"
              tabIndex={0}
            >
              <i className="fa-solid fa-right-from-bracket mr-2"></i>Log Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950 text-white flex flex-col items-center justify-center px-6 py-10">
      <img
        src="https://i.ibb.co/Vc2jxqRR/Chat-GPT-Image-Jul-1-2026-01-37-52-PM.png"
        alt="Vetrix"
        className="w-28 h-28 object-contain mb-10"
      />

      <div className="flex flex-col lg:flex-row items-stretch gap-8 w-full max-w-5xl">
        {/* QR panel */}
        <div className="flex-1 bg-zinc-900/70 border border-zinc-800 rounded-2xl p-8 flex flex-col items-center text-center shadow-2xl backdrop-blur-md">
          <h2 className="text-xl font-bold mb-1">Sign in with your phone</h2>
          <p className="text-sm text-zinc-400 mb-6">Scan the QR code, log in on your phone, and this TV signs in automatically.</p>

          <div className="relative w-56 h-56 md:w-64 md:h-64 bg-white rounded-2xl p-3 flex items-center justify-center shadow-[0_0_60px_-15px_rgba(220,38,38,0.5)]">
            {qrExpired ? (
              <div className="text-zinc-800 text-sm font-semibold px-4">QR code expired</div>
            ) : qrImageUrl ? (
              <img src={qrImageUrl} alt="Login QR code" className="w-full h-full object-contain rounded-lg" />
            ) : (
              <i className="fa-solid fa-circle-notch fa-spin text-3xl text-zinc-400"></i>
            )}
          </div>

          {qrCode && !qrExpired && (
            <div className="mt-5 text-sm text-zinc-400">
              Or open <span className="text-zinc-200 font-semibold">/qr-approve</span> on your phone and enter code:
              <div className="mt-2 text-2xl font-black tracking-[0.4em] text-red-500">{qrCode}</div>
            </div>
          )}

          <button
            onClick={startQrSession}
            className="mt-6 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-bold transition-colors focusable"
            tabIndex={0}
          >
            <i className="fa-solid fa-rotate mr-2"></i>Refresh QR Code
          </button>
        </div>

        {/* Divider */}
        <div className="flex lg:flex-col items-center justify-center gap-3 text-zinc-600">
          <div className="flex-1 h-px lg:h-auto lg:w-px bg-zinc-800 lg:flex-1"></div>
          <span className="text-xs font-bold uppercase tracking-widest">or</span>
          <div className="flex-1 h-px lg:h-auto lg:w-px bg-zinc-800 lg:flex-1"></div>
        </div>

        {/* Form panel */}
        <div className="flex-1 bg-zinc-900/70 border border-zinc-800 rounded-2xl p-8 shadow-2xl backdrop-blur-md">
          <h2 className="text-xl font-bold mb-1">{mode === "login" ? "Log in with password" : "Create an account"}</h2>
          <p className="text-sm text-zinc-400 mb-6">
            {mode === "login" ? "Use your Vetrix account credentials." : "Sign up right here on your TV."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              autoComplete="username"
              className={inputClasses}
              tabIndex={0}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className={inputClasses}
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                <i className="fa-solid fa-circle-exclamation"></i>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 bg-red-600 hover:bg-red-500 disabled:opacity-60 rounded-xl font-bold text-base transition-colors focusable"
              tabIndex={0}
            >
              {submitting ? (
                <i className="fa-solid fa-circle-notch fa-spin"></i>
              ) : mode === "login" ? (
                "Log In"
              ) : (
                "Sign Up"
              )}
            </button>
          </form>

          <button
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
            }}
            className="mt-5 w-full py-3 text-sm text-zinc-400 hover:text-white rounded-xl border border-transparent hover:border-zinc-700 transition-colors focusable"
            tabIndex={0}
          >
            {mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}
          </button>

          <button
            onClick={handleContinueWithoutAccount}
            className="mt-2 w-full py-3 text-sm text-zinc-500 hover:text-white rounded-xl border border-transparent hover:border-zinc-700 transition-colors focusable"
            tabIndex={0}
          >
            <i className="fa-solid fa-arrow-left mr-2"></i>Continue without account
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;