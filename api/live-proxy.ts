import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'https';
import http from 'http';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).send("Missing url parameter");
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  let activeRemoteRequest: any = null;

  const fetchWithRedirects = (currentUrl: string, redirectCount: number = 0) => {
    if (redirectCount > 5) {
      return res.status(508).send("Too many redirects");
    }

    try {
      const parsedUrl = new URL(currentUrl);
      const client = parsedUrl.protocol === "https:" ? https : http;

      const requestOptions = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
          ...(req.headers['range'] ? { 'Range': req.headers['range'] as string } : {})
        }
      };

      const remoteRequest = client.get(currentUrl, requestOptions, (remoteResponse) => {
        const statusCode = remoteResponse.statusCode || 200;

        if (statusCode >= 300 && statusCode < 400 && remoteResponse.headers.location) {
          let nextUrl = remoteResponse.headers.location;
          if (!nextUrl.startsWith("http://") && !nextUrl.startsWith("https://")) {
            nextUrl = new URL(nextUrl, currentUrl).toString();
          }
          remoteRequest.destroy();
          fetchWithRedirects(nextUrl, redirectCount + 1);
          return;
        }

        if (remoteResponse.headers["content-type"]) {
          res.setHeader("Content-Type", remoteResponse.headers["content-type"]);
        } else {
          res.setHeader("Content-Type", "video/mp2t");
        }

        if (remoteResponse.headers["content-length"]) res.setHeader("Content-Length", remoteResponse.headers["content-length"]);
        if (remoteResponse.headers["content-range"]) res.setHeader("Content-Range", remoteResponse.headers["content-range"]);
        if (remoteResponse.headers["accept-ranges"]) res.setHeader("Accept-Ranges", remoteResponse.headers["accept-ranges"]);

        res.status(statusCode);
        remoteResponse.pipe(res);
      });

      remoteRequest.on('error', (err) => {
        if (!res.headersSent) {
          res.status(500).send(`Remote streaming error: ${err.message}`);
        }
      });

      activeRemoteRequest = remoteRequest;

    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).send(`Proxy setup error: ${err.message}`);
      }
    }
  };

  fetchWithRedirects(targetUrl);

  req.on('close', () => {
    if (activeRemoteRequest) {
      activeRemoteRequest.destroy();
    }
  });
}
