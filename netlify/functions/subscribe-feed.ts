import type { Context } from '@netlify/functions';
import { getDb, initSchema } from '../../src/lib/discovery/db';
import { errorMessage, jsonResponse } from '../../src/lib/httpResponse';

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
      return jsonResponse({ error: 'Missing required fields' }, 400);
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

    return jsonResponse({ success: true, message: 'Feed subscribed, rebuild triggered' });
  } catch (error) {
    return jsonResponse({ error: 'Failed to subscribe', message: errorMessage(error) }, 500);
  }
};
