import type { Context } from '@netlify/functions';
import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 5000,
  headers: {
    'User-Agent': 'AstroRSSReader/1.0',
  },
});

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const feedUrl = url.searchParams.get('url');

  if (!feedUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const feed = await parser.parseURL(feedUrl);

    return new Response(
      JSON.stringify({
        title: feed.title || '',
        description: feed.description || '',
        link: feed.link || '',
        itemCount: feed.items?.length || 0,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch feed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};
