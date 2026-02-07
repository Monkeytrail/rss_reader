import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const youtubeUrl = url.searchParams.get("url");

  if (!youtubeUrl) {
    return new Response(JSON.stringify({ error: "Missing url parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const response = await fetch(youtubeUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RSSReader/1.0)" },
    });

    const html = await response.text();
    const channelIdMatch = html.match(/"channelId":"([^"]+)"/);
    const channelNameMatch = html.match(/"author":"([^"]+)"/);

    if (!channelIdMatch) {
      return new Response(
        JSON.stringify({ error: "Could not find channel ID" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const channelId = channelIdMatch[1];
    const channelName = channelNameMatch ? channelNameMatch[1] : "Unknown";
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

    return new Response(
      JSON.stringify({ channelId, channelName, feedUrl }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch YouTube page" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
