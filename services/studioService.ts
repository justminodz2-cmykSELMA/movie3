// ============================================================
// Studio service — client for the personal Addon Studio API.
// Neutral scope: only addon data ever travels through here.
// ============================================================

import { getToken } from "./authService";
import { InstalledAddon } from "../addons/types";

export interface StudioAddonsPayload {
  rev: number;
  addons: InstalledAddon[];
  profileName?: string;
  username?: string;
}

const request = async (path: string, options: RequestInit = {}) => {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
};

/** Returns the user's stable personal Studio link token (requires login). */
export const createStudioLink = async (
  profileId: string,
  profileName: string,
): Promise<{ token: string; rev: number }> => {
  const token = getToken();
  return request("/api/auth/studio/link", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({ profileId, profileName }),
  });
};

/** Reads the addons behind a Studio link (the token is the credential). */
export const fetchStudioAddons = async (stoken: string): Promise<StudioAddonsPayload> =>
  request(`/api/auth/studio/${encodeURIComponent(stoken)}/addons`);

/** Saves the addons behind a Studio link. Returns the new revision. */
export const saveStudioAddons = async (
  stoken: string,
  addons: InstalledAddon[],
): Promise<number> => {
  const data = await request(`/api/auth/studio/${encodeURIComponent(stoken)}/addons`, {
    method: "POST",
    body: JSON.stringify({ addons }),
  });
  return Number(data?.rev || 0);
};

/** Builds the full shareable Studio URL for a token. */
export const buildStudioUrl = (stoken: string): string =>
  `${window.location.origin}${window.location.pathname}#/studio/${stoken}`;
