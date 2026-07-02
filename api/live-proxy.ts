import http from "http";
import https from "https";
import { URL } from "url";

export default function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).send("Missing url parameter");
  }

  let activeRemoteRequest: any = null;

  const fetchWithRedirects = (currentUrl: string, redirectCount: number = 0) => {
    if (redirectCount > 5) {
      console.error("[Live Proxy Vercel] Too many redirects");
      return res.status(508).send("Too many redirects");
    }

    try {
      const parsedUrl = new URL(currentUrl);
      const client = parsedUrl.protocol === "https:" ? https : http;

      console.log(`[Live Proxy Vercel] Requesting: ${currentUrl} (Redirect depth: ${redirectCount})`);

      const requestOptions = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
          ...(req.headers['range'] ? { 'Range': req.headers['range'] as string } : {})
        }
      };

      const remoteRequest = client.get(currentUrl, requestOptions, (remoteResponse) => {
        const statusCode = remoteResponse.statusCode || 200;
        console.log(`[Live Proxy Vercel] Remote response status: ${statusCode} for ${currentUrl}`);

        // Handle redirects (301, 302, 307, 308)
        if (statusCode >= 300 && statusCode < 400 && remoteResponse.headers.location) {
          let nextUrl = remoteResponse.headers.location;
          if (!nextUrl.startsWith("http://") && !nextUrl.startsWith("https://")) {
            // Resolve relative URL
            nextUrl = new URL(nextUrl, currentUrl).toString();
          }
          console.log(`[Live Proxy Vercel] Following redirect to: ${nextUrl}`);
          remoteRequest.destroy();
          fetchWithRedirects(nextUrl, redirectCount + 1);
          return;
        }

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

      remoteRequest.on("error", (err: any) => {
        console.error(`[Live Proxy Vercel] Remote stream error for ${currentUrl}:`, err.message);
        if (!res.headersSent) {
          res.status(500).send("Proxy error fetching stream");
        }
      });

    } catch (error: any) {
      console.error("[Live Proxy Vercel] Error:", error.message);
      if (!res.headersSent) {
        res.status(400).send("Invalid URL or stream error");
      }
    }
  };

  fetchWithRedirects(targetUrl);

  req.on("close", () => {
    if (activeRemoteRequest) {
      activeRemoteRequest.destroy();
    }
  });
}
