// ---------------------------------------------------------------------------
// One-time local cache reset.
//
// After an app update, some users still have stale cached data in their
// browser's localStorage (e.g. old cached stream URLs). This module clears
// ONLY the app's cache entries — exactly once per device — and then never
// runs again. It does NOT touch auth tokens, language, profiles, addons,
// or any other user data.
//
// To force another one-time reset in a future update, bump CACHE_RESET_VERSION.
// ---------------------------------------------------------------------------

const CACHE_RESET_VERSION = '10';
const FLAG_KEY = 'cineCacheResetVersion';

// Session flag used to show the "System updated" toast once after the reset.
const NOTICE_KEY = 'cineSystemUpdatedNotice';

// Only keys starting with these prefixes are treated as cache and removed.
const CACHE_PREFIXES = [
  'stream_cache_', // cached stream URLs (all versions: v1..v4)
];

/**
 * Runs once per device. Clears only local cache entries, marks the reset as
 * done, and queues a one-time "System updated" notice for the UI.
 * Safe to call on every startup — it becomes a no-op after the first run.
 */
export function runOneTimeCacheReset(): void {
  try {
    if (localStorage.getItem(FLAG_KEY) === CACHE_RESET_VERSION) {
      return; // Already done — never run again.
    }

    // Brand-new device (no stored data at all): nothing to clean, no notice.
    const isExistingUser = localStorage.length > 0;

    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && CACHE_PREFIXES.some((p) => key.startsWith(p))) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }

    localStorage.setItem(FLAG_KEY, CACHE_RESET_VERSION);

    if (isExistingUser) {
      try {
        sessionStorage.setItem(NOTICE_KEY, '1');
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* localStorage unavailable — nothing to do */
  }
}

/**
 * Returns true exactly once (right after the one-time reset ran) so the UI
 * can show a simple "System updated" message, then clears the flag.
 */
export function consumeSystemUpdatedNotice(): boolean {
  try {
    if (sessionStorage.getItem(NOTICE_KEY) === '1') {
      sessionStorage.removeItem(NOTICE_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
