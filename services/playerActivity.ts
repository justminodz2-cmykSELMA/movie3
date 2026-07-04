// Global "player is open" flag.
// While the user is inside the video player we temporarily pause
// non-essential background work (addon sync polling, etc.) so all
// bandwidth and CPU go to video playback. Purely in-memory.

let active = false;
const listeners = new Set<(v: boolean) => void>();

export const setPlayerActive = (v: boolean) => {
  if (active === v) return;
  active = v;
  listeners.forEach((l) => {
    try { l(v); } catch {}
  });
};

export const isPlayerActive = () => active;

export const onPlayerActiveChange = (cb: (v: boolean) => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
