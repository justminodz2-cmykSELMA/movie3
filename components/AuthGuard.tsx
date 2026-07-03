import React, { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { getToken } from "../services/authService";
import { useProfile } from "../contexts/ProfileContext";

export const GUEST_VIDEO_LIMIT = 5;
const GUEST_FLAG_KEY = "cinestream_guest_mode";
const GUEST_COUNT_KEY = "cinestream_guest_watch_count";

// Guest mode flag lives in sessionStorage so every new session must pass through the login page.
export const enableGuestMode = () => {
  try {
    sessionStorage.setItem(GUEST_FLAG_KEY, "1");
  } catch {}
};

export const disableGuestMode = () => {
  try {
    sessionStorage.removeItem(GUEST_FLAG_KEY);
  } catch {}
};

export const isGuestMode = (): boolean => {
  try {
    return sessionStorage.getItem(GUEST_FLAG_KEY) === "1";
  } catch {
    return false;
  }
};

// Watch count lives in localStorage so the guest limit persists across sessions.
export const getGuestWatchCount = (): number => {
  try {
    return parseInt(localStorage.getItem(GUEST_COUNT_KEY) || "0", 10) || 0;
  } catch {
    return 0;
  }
};

const incrementGuestWatchCount = () => {
  try {
    localStorage.setItem(GUEST_COUNT_KEY, String(getGuestWatchCount() + 1));
  } catch {}
};

export const resetGuestWatchCount = () => {
  try {
    localStorage.removeItem(GUEST_COUNT_KEY);
  } catch {}
};

// Blocks any page unless the user is logged in or explicitly chose guest mode on the login page.
export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (getToken() || isGuestMode()) return <>{children}</>;
  return <Navigate to="/login" replace />;
};

// Enforces the 5-video guest watch limit on player pages. Logged-in users are unlimited.
export const GuestWatchGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const { setToast } = useProfile();
  const countedRef = useRef(false);
  const [blocked] = useState(() => !getToken() && getGuestWatchCount() >= GUEST_VIDEO_LIMIT);

  useEffect(() => {
    if (blocked) {
      setToast({
        message: `Guest limit reached: only ${GUEST_VIDEO_LIMIT} videos without an account. Log in or sign up to keep watching.`,
        type: "error",
      });
      navigate("/login", { replace: true });
      return;
    }
    if (!getToken() && !countedRef.current) {
      countedRef.current = true;
      incrementGuestWatchCount();
      const left = Math.max(0, GUEST_VIDEO_LIMIT - getGuestWatchCount());
      setToast({
        message: `Guest mode: ${left} video${left === 1 ? "" : "s"} left. Sign up for unlimited watching.`,
        type: "info",
      });
    }
  }, [blocked, navigate, setToast]);

  if (blocked) return null;
  return <>{children}</>;
};
