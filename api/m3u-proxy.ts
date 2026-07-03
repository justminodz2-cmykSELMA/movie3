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
    const limitParam = urlObj.searchParams.get("limit");
    let resultText = text;

    if (limitParam) {
      const limit = parseInt(limitParam, 10);
      if (!isNaN(limit) && limit > 0) {
        const lines = text.split('\n');
        const limitedLines: string[] = [];
        let channelCount = 0;

        if (lines.length > 0 && lines[0].trim().startsWith('#EXTM3U')) {
          limitedLines.push(lines[0]);
        }

        const startIdx = lines.length > 0 && lines[0].trim().startsWith('#EXTM3U') ? 1 : 0;
        for (let i = startIdx; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();
          if (trimmed.startsWith('#EXTINF:')) {
            if (channelCount >= limit) {
              break;
            }
            limitedLines.push(line);
            
            // Collect the stream URL and associated metadata lines
            for (let j = i + 1; j < lines.length; j++) {
              const nextLine = lines[j];
              const nextTrimmed = nextLine.trim();
              if (nextTrimmed.startsWith('#EXTINF:')) {
                i = j - 1;
                break;
              }
              limitedLines.push(nextLine);
              if (nextTrimmed.startsWith('http')) {
                channelCount++;
                i = j;
                break;
              }
            }
          } else if (trimmed !== '' && !trimmed.startsWith('#EXTM3U')) {
            limitedLines.push(line);
          }
        }
        resultText = limitedLines.join('\n');
      }
    }

    const newHeaders = new Headers(corsHeaders);
    newHeaders.set("Content-Type", "text/plain; charset=utf-8");

    return new Response(resultText, {
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
