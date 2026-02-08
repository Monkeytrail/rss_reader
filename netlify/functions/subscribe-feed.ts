import type { Context } from '@netlify/functions';
import { getDb, initSchema } from '../../src/lib/discovery/db';

interface SubscribeBody {
  domain_id: number;
  feed_url: string;
  feed_title: string;
  category: string;
  category_slug: string;
}

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body: SubscribeBody = await req.json();
    const { domain_id, feed_url, feed_title, category, category_slug } = body;

    if (!feed_url || !feed_title || !category || !category_slug || !domain_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    await initSchema();
    const db = getDb();

    // Get next sort order for this category
    const maxOrder = await db.execute({
      sql: 'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM feeds WHERE category_slug = ?',
      args: [category_slug],
    });
    const nextOrder = maxOrder.rows[0].next_order as number;

    // Insert feed into database
    await db.execute({
      sql: `INSERT OR IGNORE INTO feeds (title, url, category_name, category_slug, sort_order, source)
            VALUES (?, ?, ?, ?, ?, 'discovered')`,
      args: [feed_title, feed_url, category, category_slug, nextOrder],
    });

    // Mark domain as subscribed in discovery system
    await db.execute({
      sql: "UPDATE discovered_domains SET status = 'subscribed' WHERE id = ?",
      args: [domain_id],
    });

    // Trigger rebuild so the feed appears on next build
    const buildHookUrl = process.env.BUILD_HOOK_URL;
    if (buildHookUrl) {
      await fetch(buildHookUrl, { method: 'POST' }).catch(() => {});
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Feed subscribed, rebuild triggered' }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to subscribe',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
