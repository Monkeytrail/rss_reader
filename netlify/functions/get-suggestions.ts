import type { Context } from '@netlify/functions';
import { getDb, initSchema } from '../../src/lib/discovery/db';
import type { SuggestionResponse } from '../../src/lib/discovery/types';
import { errorMessage, jsonResponse } from '../../src/lib/httpResponse';

export default async (req: Request, _context: Context) => {
  try {
    await initSchema();
    const db = getDb();

    const result = await db.execute(`
      SELECT
        d.id AS domain_id,
        d.domain,
        d.feed_url,
        d.feed_title,
        d.feed_description,
        d.current_score,
        d.first_seen,
        d.categories,
        COUNT(DISTINCT e.source) AS source_count
      FROM discovered_domains d
      LEFT JOIN domain_events e ON e.domain_id = d.id
      WHERE d.status = 'suggested'
        AND d.feed_url IS NOT NULL
      GROUP BY d.id
      ORDER BY d.current_score DESC
      LIMIT 50
    `);

    const suggestions: SuggestionResponse[] = result.rows.map((row) => ({
      domain_id: row.domain_id as number,
      domain: row.domain as string,
      feed_url: row.feed_url as string,
      feed_title: row.feed_title as string,
      feed_description: (row.feed_description as string) || null,
      current_score: row.current_score as number,
      first_seen: row.first_seen as string,
      source_count: row.source_count as number,
      categories: (row.categories as string) || '',
    }));

    return jsonResponse(suggestions, 200, { 'Cache-Control': 'public, max-age=1800' });
  } catch (error) {
    return jsonResponse({ error: 'Failed to fetch suggestions', message: errorMessage(error) }, 500);
  }
};
