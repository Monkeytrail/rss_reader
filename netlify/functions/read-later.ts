import type { Config, Context } from '@netlify/functions';
import { getDb, initSchema } from '../../src/lib/discovery/db';
import { fetchMetadata } from '../../src/lib/metadata';
import { corsJson, corsPreflight } from '../../src/lib/cors';

const LIST_LIMIT = 50;
const ARCHIVE_LIMIT = 30;

function isAuthorized(req: Request): boolean {
  const token = process.env.READ_LATER_TOKEN;
  if (!token) return false;

  const auth = req.headers.get('authorization');
  if (auth === `Bearer ${token}`) return true;

  const url = new URL(req.url);
  if (url.searchParams.get('token') === token) return true;

  return false;
}

export default async (req: Request, _context: Context) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (!isAuthorized(req)) return corsJson({ error: 'Unauthorized' }, 401);

  await initSchema();
  const db = getDb();

  // POST — add URL to queue
  if (req.method === 'POST') {
    let url: string;
    let titleOverride: string | undefined;

    try {
      const body = await req.json();
      url = body.url;
      titleOverride = body.title;
    } catch {
      return corsJson({ error: 'Invalid JSON body' }, 400);
    }

    if (!url) return corsJson({ error: 'url is required' }, 400);
    try { new URL(url); } catch { return corsJson({ error: 'Invalid URL' }, 400); }

    // Check for duplicate
    const existing = await db.execute({ sql: 'SELECT id FROM read_later WHERE url = ?', args: [url] });
    if (existing.rows.length > 0) {
      return corsJson({ message: 'Already saved', id: existing.rows[0].id }, 200);
    }

    const meta = await fetchMetadata(url);
    const title = titleOverride || meta.title || url;

    const result = await db.execute({
      sql: `INSERT INTO read_later (url, title, description, image_url, source_type, yt_channel, yt_duration)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [url, title, meta.description, meta.image_url, meta.source_type, meta.yt_channel ?? null, meta.yt_duration ?? null],
    });

    return corsJson({ message: 'Saved', id: result.lastInsertRowid, title, source_type: meta.source_type }, 201);
  }

  // GET — list queue or archive
  if (req.method === 'GET') {
    const params = new URL(req.url).searchParams;
    const archived = params.get('archived') === 'true';
    const before = params.get('before');
    const limit = archived ? ARCHIVE_LIMIT : LIST_LIMIT;

    let sql: string;
    const args: (string | number)[] = [];

    if (archived) {
      sql = 'SELECT * FROM read_later WHERE read_at IS NOT NULL';
      if (before) { sql += ' AND read_at < ?'; args.push(before); }
      sql += ` ORDER BY read_at DESC LIMIT ${limit + 1}`;
    } else {
      sql = 'SELECT * FROM read_later WHERE read_at IS NULL';
      if (before) { sql += ' AND added_at < ?'; args.push(before); }
      sql += ` ORDER BY added_at DESC LIMIT ${limit + 1}`;
    }

    const result = await db.execute({ sql, args });
    const rows = result.rows;
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    return corsJson({ items: rows, has_more: hasMore });
  }

  return corsJson({ error: 'Method not allowed' }, 405);
};

export const config: Config = {
  path: '/api/read-later',
};
