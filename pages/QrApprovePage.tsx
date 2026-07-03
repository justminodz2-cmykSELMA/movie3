import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  login,
  signup,
  fetchMe,
  qrApprove,
  AuthUser,
} from "../services/authService";

const QrApprovePage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const params = new URLSearchParams(location.search);
  const [code, setCode] = useState((params.get("code") || "").toUpperCase());

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    fetchMe().then((user) => {
      setCurrentUser(user);
      setCheckingSession(false);
    });
  }, []);

  const handleApprove = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await qrApprove(code);
      setApproved(true);
    } catch (err: any) {
      setError(err?.message || "Failed to approve TV login");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAuthAndApprove = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const user =
        mode === "login"
          ? await login(username, password)
          : await signup(username, password);
      setCurrentUser(user);
      await qrApprove(code);
      setApproved(true);
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClasses =
    "w-full bg-zinc-900/80 border border-zinc-700 focus:border-red-600 px-5 py-4 text-base text-white placeholder-zinc-500 rounded-xl outline-none transition-colors focusable";

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950 text-white flex flex-col items-center justify-center px-6 py-10">
      <div className="flex items-center gap-2 mb-8">
        <span className="text-3xl font-black text-red-600" style={{ fontFamily: "'Anton', sans-serif" }}>N</span>
        <span className="text-lg font-semibold tracking-[0.25em] text-zinc-200 uppercase">CineStream</span>
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-8 max-w-md w-full shadow-2xl backdrop-blur-md">
        {approved ? (
          <div className="text-center py-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-green-500/15 border border-green-500/40 flex items-center justify-center mb-5">
              <i className="fa-solid fa-check text-3xl text-green-500"></i>
            </div>
            <h1 className="text-2xl font-bold mb-2">TV Signed In!</h1>
            <p className="text-sm text-zinc-400">Your TV is now logged in as {currentUser?.username}. You can close this page.</p>
          </div>
        ) : checkingSession ? (
          <div className="text-center py-10">
            <i className="fa-solid fa-circle-notch fa-spin text-3xl text-red-600"></i>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-red-600/15 border border-red-600/40 flex items-center justify-center mb-4">
                <i className="fa-solid fa-tv text-2xl text-red-500"></i>
              </div>
              <h1 className="text-2xl font-bold mb-1">Sign in your TV</h1>
              <p className="text-sm text-zinc-400">
                {currentUser
                  ? `Approve the TV login as ${currentUser.username}.`
                  : "Log in or sign up to approve the TV login."}
              </p>
            </div>

            <div className="mb-5">
              <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2 block">TV Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. A1B2C3"
                className={`${inputClasses} text-center text-xl font-black tracking-[0.4em]`}
                tabIndex={0}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4">
                <i className="fa-solid fa-circle-exclamation"></i>
                <span>{error}</span>
              </div>
            )}

            {currentUser ? (
              <button
                onClick={handleApprove}
                disabled={submitting || !code}
                className="w-full py-4 bg-red-600 hover:bg-red-500 disabled:opacity-60 rounded-xl font-bold text-base transition-colors focusable"
                tabIndex={0}
              >
                {submitting ? <i className="fa-solid fa-circle-notch fa-spin"></i> : "Approve TV Login"}
              </button>
            ) : (
              <form onSubmit={handleAuthAndApprove} className="space-y-4">
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
                />
                <button
                  type="submit"
                  disabled={submitting || !code}
                  className="w-full py-4 bg-red-600 hover:bg-red-500 disabled:opacity-60 rounded-xl font-bold text-base transition-colors focusable"
                  tabIndex={0}
                >
                  {submitting ? (
                    <i className="fa-solid fa-circle-notch fa-spin"></i>
                  ) : mode === "login" ? (
                    "Log In & Approve TV"
                  ) : (
                    "Sign Up & Approve TV"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "login" ? "signup" : "login");
                    setError(null);
                  }}
                  className="w-full py-3 text-sm text-zinc-400 hover:text-white rounded-xl border border-transparent hover:border-zinc-700 transition-colors focusable"
                  tabIndex={0}
                >
                  {mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}
                </button>
              </form>
            )}
          </>
        )}
      </div>

      <button
        onClick={() => navigate("/")}
        className="mt-6 text-sm text-zinc-500 hover:text-white transition-colors focusable"
        tabIndex={0}
      >
        <i className="fa-solid fa-arrow-left mr-2"></i>Back to app
      </button>
    </div>
  );
};

export default QrApprovePage;