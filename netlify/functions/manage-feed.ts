import type { Context } from '@netlify/functions';
import { getDb, initSchema } from '../../src/lib/discovery/db';
import { errorMessage, jsonResponse } from '../../src/lib/httpResponse';

export default async (req: Request, _context: Context) => {
  await initSchema();
  const db = getDb();

  try {
    if (req.method === 'GET') {
      const result = await db.execute(
        `SELECT id, title, url, category_name, category_slug, hidden, sort_order, source, created_at
         FROM feeds
         ORDER BY category_slug, sort_order`,
      );
      return jsonResponse(result.rows);
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { title, url, category_name, category_slug, source } = body;

      if (!title || !url || !category_name || !category_slug) {
        return jsonResponse({ error: 'Missing required fields: title, url, category_name, category_slug' }, 400);
      }

      try {
        new URL(url);
      } catch {
        return jsonResponse({ error: 'Invalid feed URL' }, 400);
      }

      const maxOrder = await db.execute({
        sql: 'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM feeds WHERE category_slug = ?',
        args: [category_slug],
      });
      const nextOrder = maxOrder.rows[0].next_order as number;

      const result = await db.execute({
        sql: `INSERT OR IGNORE INTO feeds (title, url, category_name, category_slug, sort_order, source)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [title, url, category_name, category_slug, nextOrder, source || 'manual'],
      });

      if (result.rowsAffected === 0) {
        return jsonResponse({ error: 'Feed URL already exists' }, 409);
      }

      await triggerRebuild();
      return jsonResponse({ success: true });
    }

    if (req.method === 'PATCH') {
      const body = await req.json();
      const { url, hidden } = body;

      if (!url || hidden === undefined) {
        return jsonResponse({ error: 'Missing required fields: url, hidden' }, 400);
      }

      await db.execute({
        sql: 'UPDATE feeds SET hidden = ? WHERE url = ?',
        args: [hidden ? 1 : 0, url],
      });

      await triggerRebuild();
      return jsonResponse({ success: true });
    }

    if (req.method === 'DELETE') {
      const body = await req.json();
      const { url } = body;

      if (!url) {
        return jsonResponse({ error: 'Missing required field: url' }, 400);
      }

      await db.execute({
        sql: 'DELETE FROM feeds WHERE url = ?',
        args: [url],
      });

      await triggerRebuild();
      return jsonResponse({ success: true });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    return jsonResponse({ error: 'Operation failed', message: errorMessage(error) }, 500);
  }
};

async function triggerRebuild(): Promise<void> {
  const buildHookUrl = process.env.BUILD_HOOK_URL;
  if (buildHookUrl) {
    try {
      await fetch(buildHookUrl, { method: 'POST' });
    } catch {
      // Rebuild trigger is best-effort
    }
  }
}
