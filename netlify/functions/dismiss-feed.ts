import type { Context } from '@netlify/functions';
import { getDb, initSchema } from '../../src/lib/discovery/db';
import { errorMessage, jsonResponse } from '../../src/lib/httpResponse';

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { domain_id } = await req.json();

    if (!domain_id) {
      return jsonResponse({ error: 'Missing domain_id' }, 400);
    }

    await initSchema();
    const db = getDb();

    await db.execute({
      sql: "UPDATE discovered_domains SET status = 'dismissed' WHERE id = ?",
      args: [domain_id],
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return jsonResponse({ error: 'Failed to dismiss', message: errorMessage(error) }, 500);
  }
};
