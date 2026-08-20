import type { Context } from '@netlify/functions';
import Parser from 'rss-parser';
import { errorMessage, jsonResponse } from '../../src/lib/httpResponse';

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
    return jsonResponse({ error: 'Missing url parameter' }, 400);
  }

  try {
    const feed = await parser.parseURL(feedUrl);

    return jsonResponse({
      title: feed.title || '',
      description: feed.description || '',
      link: feed.link || '',
      itemCount: feed.items?.length || 0,
    });
  } catch (error) {
    return jsonResponse({ error: 'Failed to fetch feed', message: errorMessage(error) }, 500);
  }
};
