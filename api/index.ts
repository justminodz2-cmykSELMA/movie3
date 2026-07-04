// @ts-ignore
import app from "../dist/server.js";

// Stream responses instead of buffering them. Without this, Vercel waits for
// the WHOLE body (e.g. a 2-4 MB video segment) to be downloaded from the
// upstream CDN before sending the first byte to the player, which makes
// playback feel heavy. With streaming, bytes flow to the player immediately.
export const config = {
  supportsResponseStreaming: true,
};

export default app;
