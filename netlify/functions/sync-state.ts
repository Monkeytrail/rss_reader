import type { Context } from '@netlify/functions';
import { getDb, initSchema } from '../../src/lib/discovery/db';

export default async (req: Request, _context: Context) => {
  try {
    await initSchema();
    const db = getDb();

    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');

    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'GET') {
      const [readResult, bookmarkResult] = await Promise.all([
        db.execute({
          sql: 'SELECT article_id FROM user_read_articles WHERE user_id = ? ORDER BY created_at DESC LIMIT 2000',
          args: [userId],
        }),
        db.execute({
          sql: 'SELECT article_id FROM user_bookmarks WHERE user_id = ? ORDER BY created_at DESC LIMIT 500',
          args: [userId],
        }),
      ]);

      return new Response(
        JSON.stringify({
          readArticles: readResult.rows.map((r) => r.article_id as string),
          bookmarks: bookmarkResult.rows.map((r) => r.article_id as string),
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { action, articleId } = body;

      if (!action || !articleId) {
        return new Response(JSON.stringify({ error: 'action and articleId required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      switch (action) {
        case 'add_read':
          await db.execute({
            sql: 'INSERT OR IGNORE INTO user_read_articles (user_id, article_id) VALUES (?, ?)',
            args: [userId, articleId],
          });
          break;
        case 'remove_read':
          await db.execute({
            sql: 'DELETE FROM user_read_articles WHERE user_id = ? AND article_id = ?',
            args: [userId, articleId],
          });
          break;
        case 'add_bookmark':
          await db.execute({
            sql: 'INSERT OR IGNORE INTO user_bookmarks (user_id, article_id) VALUES (?, ?)',
            args: [userId, articleId],
          });
          break;
        case 'remove_bookmark':
          await db.execute({
            sql: 'DELETE FROM user_bookmarks WHERE user_id = ? AND article_id = ?',
            args: [userId, articleId],
          });
          break;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    console.error('Sync error:', error);
    return new Response(JSON.stringify({ success: true, fallback: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
