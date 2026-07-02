import express from "express";
import path from "path";
import http from "http";
import https from "https";
import { URL } from "url";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Add broad CORS headers for all API requests
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // API 1: Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API 2: M3U Playlist Proxy
  app.get("/api/m3u-proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).send("Missing url parameter");
    }

    try {
      console.log(`[M3U Proxy] Fetching playlist: ${targetUrl}`);
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Remote server responded with status ${response.status}`);
      }

      const text = await response.text();
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(text);
    } catch (error: any) {
      console.error("[M3U Proxy] Error:", error.message);
      res.status(500).send(`Failed to fetch playlist: ${error.message}`);
    }
  });

  // API 3: Live Video Stream Proxy (resolves CORS and mixed content HTTP/HTTPS blocks)
  app.get("/api/live-proxy", (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).send("Missing url parameter");
    }

    let activeRemoteRequest: any = null;

    const fetchWithRedirects = (currentUrl: string, redirectCount: number = 0) => {
      if (redirectCount > 5) {
        console.error("[Live Proxy] Too many redirects");
        return res.status(508).send("Too many redirects");
      }

      try {
        const parsedUrl = new URL(currentUrl);
        const client = parsedUrl.protocol === "https:" ? https : http;

        console.log(`[Live Proxy] Requesting: ${currentUrl} (Redirect depth: ${redirectCount})`);

        const requestOptions = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
            ...(req.headers['range'] ? { 'Range': req.headers['range'] as string } : {})
          }
        };

        const remoteRequest = client.get(currentUrl, requestOptions, (remoteResponse) => {
          const statusCode = remoteResponse.statusCode || 200;
          console.log(`[Live Proxy] Remote response status: ${statusCode} for ${currentUrl}`);

          // Handle redirects (301, 302, 307, 308)
          if (statusCode >= 300 && statusCode < 400 && remoteResponse.headers.location) {
            let nextUrl = remoteResponse.headers.location;
            if (!nextUrl.startsWith("http://") && !nextUrl.startsWith("https://")) {
              // Resolve relative URL
              nextUrl = new URL(nextUrl, currentUrl).toString();
            }
            console.log(`[Live Proxy] Following redirect to: ${nextUrl}`);
            remoteRequest.destroy();
            fetchWithRedirects(nextUrl, redirectCount + 1);
            return;
          }

          // Disable buffering to allow live response streaming
          res.setHeader("X-Accel-Buffering", "no");
          res.setHeader("Cache-Control", "no-cache, no-transform");
          res.setHeader("Connection", "keep-alive");

          // Copy headers to allow range requests and video streaming
          if (remoteResponse.headers["content-type"]) {
            res.setHeader("Content-Type", remoteResponse.headers["content-type"]);
          } else {
            res.setHeader("Content-Type", "video/mp2t"); // Default for .ts streams
          }

          if (remoteResponse.headers["content-length"]) {
            res.setHeader("Content-Length", remoteResponse.headers["content-length"]);
          }

          if (remoteResponse.headers["content-range"]) {
            res.setHeader("Content-Range", remoteResponse.headers["content-range"]);
          }

          if (remoteResponse.headers["accept-ranges"]) {
            res.setHeader("Accept-Ranges", remoteResponse.headers["accept-ranges"]);
          }

          res.status(statusCode);
          remoteResponse.pipe(res);
        });

        activeRemoteRequest = remoteRequest;

        remoteRequest.on("error", (err) => {
          console.error(`[Live Proxy] Remote stream error for ${currentUrl}:`, err.message);
          if (!res.headersSent) {
            res.status(500).send("Proxy error fetching stream");
          }
        });

      } catch (error: any) {
        console.error("[Live Proxy] Error:", error.message);
        if (!res.headersSent) {
          res.status(400).send("Invalid URL or stream error");
        }
      }
    };

    fetchWithRedirects(targetUrl);

    req.on("close", () => {
      // Abort remote request if client closes connection to prevent resource leaks
      if (activeRemoteRequest) {
        activeRemoteRequest.destroy();
      }
    });
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in development mode (Vite Middleware)");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in production mode (Static Serve)");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("/*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
