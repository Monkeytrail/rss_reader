import type { Context } from '@netlify/functions';
import { getDb, initSchema } from '../../src/lib/discovery/db';
import { jsonResponse } from '../../src/lib/httpResponse';

const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=300' };

export default async (_req: Request, _context: Context) => {
  try {
    await initSchema();
    const db = getDb();

    // Get last 10 build timestamps
    const builds = await db.execute(
      `SELECT DISTINCT build_time FROM feed_health_snapshots ORDER BY build_time DESC LIMIT 10`,
    );

    if (builds.rows.length === 0) {
      return jsonResponse({}, 200, CACHE_HEADERS);
    }

    const buildTimes = builds.rows.map((r) => r.build_time as string);
    const placeholders = buildTimes.map(() => '?').join(',');

    const result = await db.execute({
      sql: `SELECT feed_url, build_time, status, error_message, article_count, last_article_date
            FROM feed_health_snapshots
            WHERE build_time IN (${placeholders})
            ORDER BY feed_url, build_time DESC`,
      args: buildTimes,
    });

    const healthByFeed: Record<string, any[]> = {};
    for (const row of result.rows) {
      const url = row.feed_url as string;
      if (!healthByFeed[url]) healthByFeed[url] = [];
      healthByFeed[url].push({
        buildTime: row.build_time,
        status: row.status,
        errorMessage: row.error_message,
        articleCount: row.article_count,
        lastArticleDate: row.last_article_date,
      });
    }

    return jsonResponse(healthByFeed, 200, CACHE_HEADERS);
  } catch (error) {
    console.error('Feed health error:', error);
    return jsonResponse({ error: 'Failed to fetch feed health' }, 500);
  }
};
