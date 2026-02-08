import type { Context } from '@netlify/functions';
import { getDb, initSchema } from '../../src/lib/discovery/db';

interface OPMLFeed {
  title: string;
  url: string;
  category: string;
  categorySlug: string;
}

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const headers = { 'Content-Type': 'application/json' };

  try {
    const feeds: OPMLFeed[] = await req.json();

    if (!Array.isArray(feeds) || feeds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Expected a non-empty array of feeds' }),
        { status: 400, headers },
      );
    }

    await initSchema();
    const db = getDb();

    let imported = 0;
    let skipped = 0;

    for (const feed of feeds) {
      if (!feed.url || !feed.title || !feed.category || !feed.categorySlug) {
        skipped++;
        continue;
      }

      try {
        new URL(feed.url);
      } catch {
        skipped++;
        continue;
      }

      const maxOrder = await db.execute({
        sql: 'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM feeds WHERE category_slug = ?',
        args: [feed.categorySlug],
      });
      const nextOrder = maxOrder.rows[0].next_order as number;

      const result = await db.execute({
        sql: `INSERT OR IGNORE INTO feeds (title, url, category_name, category_slug, sort_order, source)
              VALUES (?, ?, ?, ?, ?, 'opml')`,
        args: [feed.title, feed.url, feed.category, feed.categorySlug, nextOrder],
      });

      if (result.rowsAffected > 0) {
        imported++;
      } else {
        skipped++;
      }
    }

    // Trigger rebuild so new feeds appear
    const buildHookUrl = process.env.BUILD_HOOK_URL;
    if (buildHookUrl && imported > 0) {
      await fetch(buildHookUrl, { method: 'POST' }).catch(() => {});
    }

    return new Response(
      JSON.stringify({ imported, skipped }),
      { headers },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Import failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers },
    );
  }
};
