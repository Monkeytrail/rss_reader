import type { Context } from "@netlify/functions";
import { jsonResponse } from '../../src/lib/httpResponse';

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const youtubeUrl = url.searchParams.get("url");

  if (!youtubeUrl) {
    return jsonResponse({ error: "Missing url parameter" }, 400);
  }

  try {
    const response = await fetch(youtubeUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RSSReader/1.0)" },
    });

    const html = await response.text();
    const channelIdMatch = html.match(/"channelId":"([^"]+)"/);
    const channelNameMatch = html.match(/"author":"([^"]+)"/);

    if (!channelIdMatch) {
      return jsonResponse({ error: "Could not find channel ID" }, 404);
    }

    const channelId = channelIdMatch[1];
    const channelName = channelNameMatch ? channelNameMatch[1] : "Unknown";
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

    return jsonResponse({ channelId, channelName, feedUrl });
  } catch {
    return jsonResponse({ error: "Failed to fetch YouTube page" }, 500);
  }
};
