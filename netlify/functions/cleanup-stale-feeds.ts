import type { Config, Context } from '@netlify/functions';
import { getDb, initSchema } from '../../src/lib/discovery/db';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const MIN_SNAPSHOTS = 3;

export default async (_req: Request, _context: Context) => {
  try {
    await initSchema();
    const db = getDb();

    // Find feeds with enough history to evaluate
    const result = await db.execute(`
      SELECT f.url, f.title,
        COUNT(s.id) as snapshot_count,
        SUM(CASE WHEN s.status = 'error' THEN 1 ELSE 0 END) as error_count,
        MAX(s.last_article_date) as latest_article
      FROM feeds f
      LEFT JOIN feed_health_snapshots s ON f.url = s.feed_url
      GROUP BY f.url
      HAVING COUNT(s.id) >= ${MIN_SNAPSHOTS}
    `);

    const now = Date.now();
    const toDelete: { url: string; title: string; reason: string }[] = [];

    for (const row of result.rows) {
      const snapshotCount = row.snapshot_count as number;
      const errorCount = row.error_count as number;
      const latestArticle = row.latest_article as string | null;

      // Never active: every snapshot errored
      if (errorCount === snapshotCount) {
        toDelete.push({
          url: row.url as string,
          title: row.title as string,
          reason: `never active (${errorCount}/${snapshotCount} snapshots errored)`,
        });
        continue;
      }

      // Quiet for over a year
      if (latestArticle) {
        const lastDate = new Date(latestArticle).getTime();
        if (now - lastDate > ONE_YEAR_MS) {
          const daysSince = Math.floor((now - lastDate) / (24 * 60 * 60 * 1000));
          toDelete.push({
            url: row.url as string,
            title: row.title as string,
            reason: `quiet for ${daysSince} days (last article: ${latestArticle.slice(0, 10)})`,
          });
        }
      }
    }

    if (toDelete.length === 0) {
      console.log('Stale feed cleanup: no feeds to remove');
      return new Response(JSON.stringify({ deleted: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Delete feeds and their snapshots
    const deleteStatements = [];
    for (const feed of toDelete) {
      console.log(`Deleting: "${feed.title}" (${feed.url}) — ${feed.reason}`);
      deleteStatements.push(
        { sql: 'DELETE FROM feeds WHERE url = ?', args: [feed.url] },
        { sql: 'DELETE FROM feed_health_snapshots WHERE feed_url = ?', args: [feed.url] },
      );
    }

    await db.batch(deleteStatements);

    const neverActive = toDelete.filter((f) => f.reason.startsWith('never active')).length;
    const quiet = toDelete.length - neverActive;
    console.log(
      `Stale feed cleanup: deleted ${toDelete.length} feeds (${neverActive} never active, ${quiet} quiet >1yr)`,
    );

    // Trigger rebuild so deleted feeds disappear from the site
    const buildHookUrl = process.env.BUILD_HOOK_URL;
    if (buildHookUrl) {
      await fetch(buildHookUrl, { method: 'POST' }).catch(() => {});
    }

    return new Response(
      JSON.stringify({
        deleted: toDelete.length,
        neverActive,
        quiet,
        feeds: toDelete,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Stale feed cleanup failed:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};

export const config: Config = {
  schedule: '0 3 * * 1',
};
