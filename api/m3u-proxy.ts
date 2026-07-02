import { IncomingMessage, ServerResponse } from "http";

export default async function handler(req: any, res: any) {
  // Add CORS headers
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

  try {
    console.log(`[M3U Proxy Vercel] Fetching playlist: ${targetUrl}`);
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
    res.status(200).send(text);
  } catch (error: any) {
    console.error("[M3U Proxy Vercel] Error:", error.message);
    res.status(500).send(`Failed to fetch playlist: ${error.message}`);
  }
}
