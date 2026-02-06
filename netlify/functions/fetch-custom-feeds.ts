import type { Context } from '@netlify/functions';
import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'AstroRSSReader/1.0',
  },
});

interface CustomFeed {
  url: string;
  title: string;
  category: string;
  categorySlug: string;
}

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const feeds: CustomFeed[] = await req.json();
    const articles: Record<string, unknown>[] = [];

    const results = await Promise.allSettled(
      feeds.map(async (feed) => {
        const parsed = await parser.parseURL(feed.url);
        const feedArticles = [];

        for (const item of parsed.items.slice(0, 10)) {
          feedArticles.push({
            id: Buffer.from(item.link || item.guid || '')
              .toString('base64')
              .slice(0, 20),
            title: item.title || 'Untitled',
            link: item.link || '',
            pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
            author: item.creator || item.author,
            summary: item.contentSnippet || item.summary,
            feedTitle: feed.title,
            category: feed.category,
            categorySlug: feed.categorySlug,
            isCustom: true,
          });
        }

        return feedArticles;
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        articles.push(...result.value);
      }
    }

    articles.sort(
      (a, b) =>
        new Date(b.pubDate as string).getTime() -
        new Date(a.pubDate as string).getTime(),
    );

    return new Response(JSON.stringify(articles), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
