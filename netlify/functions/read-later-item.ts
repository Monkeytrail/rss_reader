import type { Config, Context } from '@netlify/functions';
import { getDb, initSchema } from '../../src/lib/discovery/db';
import { corsJson, corsPreflight } from '../../src/lib/cors';

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

  let id: number;
  try {
    const body = await req.json();
    id = Number(body.id);
    if (!id || isNaN(id)) throw new Error('invalid id');
  } catch {
    return corsJson({ error: 'id is required in request body' }, 400);
  }

  // Check item exists
  const check = await db.execute({ sql: 'SELECT id, read_at FROM read_later WHERE id = ?', args: [id] });
  if (check.rows.length === 0) return corsJson({ error: 'Not found' }, 404);

  // PATCH — toggle read status
  if (req.method === 'PATCH') {
    const currentReadAt = check.rows[0].read_at;
    const newReadAt = currentReadAt ? null : new Date().toISOString();
    await db.execute({
      sql: 'UPDATE read_later SET read_at = ? WHERE id = ?',
      args: [newReadAt, id],
    });
    return corsJson({ id, read_at: newReadAt });
  }

  // DELETE — hard delete
  if (req.method === 'DELETE') {
    await db.execute({ sql: 'DELETE FROM read_later WHERE id = ?', args: [id] });
    return corsJson({ message: 'Deleted', id });
  }

  return corsJson({ error: 'Method not allowed' }, 405);
};

export const config: Config = {};
