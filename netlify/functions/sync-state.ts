import type { Context } from '@netlify/functions';
import { getDb, initSchema } from '../../src/lib/discovery/db';
import { jsonResponse } from '../../src/lib/httpResponse';

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    await initSchema();
    const db = getDb();

    const body = await req.json();
    const { userId, action, articleId } = body;

    if (!userId) {
      return jsonResponse({ error: 'userId required' }, 400);
    }

    if (action === 'pull') {
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

      return jsonResponse({
        readArticles: readResult.rows.map((r) => r.article_id as string),
        bookmarks: bookmarkResult.rows.map((r) => r.article_id as string),
      });
    }

    if (!action || !articleId) {
      return jsonResponse({ error: 'action and articleId required' }, 400);
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

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Sync error:', error);
    return jsonResponse({ success: true, fallback: true });
  }
};
