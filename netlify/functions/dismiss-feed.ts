import type { Context } from '@netlify/functions';
import { getDb, initSchema } from '../../src/lib/discovery/db';

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { domain_id } = await req.json();

    if (!domain_id) {
      return new Response(
        JSON.stringify({ error: 'Missing domain_id' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    await initSchema();
    const db = getDb();

    await db.execute({
      sql: "UPDATE discovered_domains SET status = 'dismissed' WHERE id = ?",
      args: [domain_id],
    });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to dismiss',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
