export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
  
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const urlObj = new URL(req.url);
  const targetUrl = urlObj.searchParams.get("url");

  if (!targetUrl) {
    return new Response("Missing url parameter", { status: 400, headers: corsHeaders });
  }

  try {
    console.log(`[M3U Proxy Edge] Fetching playlist: ${targetUrl}`);
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Remote server responded with status ${response.status}`);
    }

    const text = await response.text();
    const newHeaders = new Headers(corsHeaders);
    newHeaders.set("Content-Type", "text/plain; charset=utf-8");

    return new Response(text, {
      status: 200,
      headers: newHeaders,
    });
  } catch (error: any) {
    console.error("[M3U Proxy Edge] Error:", error.message);
    return new Response(`Failed to fetch playlist: ${error.message}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
}
