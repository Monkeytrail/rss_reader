import { getDb, initSchema } from './db';

const BATCH_SIZE = 10;
const FEED_TIMEOUT = 15_000;

interface FeedRow {
  id: number;
  url: string;
  title: string;
  etag: string | null;
  lastModified: string | null;
}

interface FetchResult {
  feedId: number;
  status: 'ok' | '304' | 'error';
  etag: string | null;
  lastModified: string | null;
  error?: string;
}

export interface RefreshFeedsResult {
  total: number;
  updated: number;
  skipped: number;
  errors: number;
  durationMs: number;
  rebuildTriggered: boolean;
}

async function checkFeed(feed: FeedRow): Promise<FetchResult> {
  const headers: Record<string, string> = {
    'User-Agent': 'AstroRSSReader/1.0',
  };

  if (feed.etag) {
    headers['If-None-Match'] = feed.etag;
  }
  if (feed.lastModified) {
    headers['If-Modified-Since'] = feed.lastModified;
  }

  try {
    const response = await fetch(feed.url, {
      headers,
      signal: AbortSignal.timeout(FEED_TIMEOUT),
    });

    if (response.status === 304) {
      return {
        feedId: feed.id,
        status: '304',
        etag: feed.etag,
        lastModified: feed.lastModified,
      };
    }

    // Consume body to free connection
    await response.text();

    return {
      feedId: feed.id,
      status: 'ok',
      etag: response.headers.get('etag') || null,
      lastModified: response.headers.get('last-modified') || null,
    };
  } catch (error) {
    return {
      feedId: feed.id,
      status: 'error',
      etag: feed.etag,
      lastModified: feed.lastModified,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runFeedRefresh(): Promise<RefreshFeedsResult> {
  const start = Date.now();

  await initSchema();
  const db = getDb();

  const result = await db.execute(
    'SELECT id, url, title, etag, last_modified FROM feeds WHERE hidden = 0',
  );

  const feeds: FeedRow[] = result.rows.map((row) => ({
    id: row.id as number,
    url: row.url as string,
    title: row.title as string,
    etag: (row.etag as string) || null,
    lastModified: (row.last_modified as string) || null,
  }));

  // Process in batches to avoid overwhelming servers
  const results: FetchResult[] = [];
  for (let i = 0; i < feeds.length; i += BATCH_SIZE) {
    const batch = feeds.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(batch.map((feed) => checkFeed(feed)));
    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        results.push(r.value);
      }
    }
  }

  // Update ETag / Last-Modified in the database
  const now = new Date().toISOString();
  const updates = results.map((r) => ({
    sql: `UPDATE feeds SET etag = ?, last_modified = ?, last_fetched_at = ?, last_fetch_status = ? WHERE id = ?`,
    args: [r.etag, r.lastModified, now, r.status, r.feedId],
  }));

  if (updates.length > 0) {
    await db.batch(updates);
  }

  const updated = results.filter((r) => r.status === 'ok').length;
  const skipped = results.filter((r) => r.status === '304').length;
  const errors = results.filter((r) => r.status === 'error').length;
  const durationMs = Date.now() - start;

  // Log run to feed_refresh_log
  await db.execute({
    sql: `INSERT INTO feed_refresh_log (total_feeds, updated, not_modified, errors, duration_ms) VALUES (?, ?, ?, ?, ?)`,
    args: [results.length, updated, skipped, errors, durationMs],
  });

  console.log(
    `Feed refresh: ${results.length} feeds, ${updated} updated, ${skipped} not modified, ${errors} errors (${durationMs}ms)`,
  );

  // Log errors for debugging
  for (const r of results) {
    if (r.status === 'error') {
      const feed = feeds.find((f) => f.id === r.feedId);
      console.warn(`  Error: ${feed?.title} (${feed?.url}): ${r.error}`);
    }
  }

  // Only trigger rebuild if any feed returned new content
  let rebuildTriggered = false;
  if (updated > 0) {
    const buildHookUrl = process.env.BUILD_HOOK_URL;
    if (buildHookUrl) {
      console.log(`Triggering rebuild (${updated} feeds changed)`);
      try {
        const res = await fetch(buildHookUrl, { method: 'POST' });
        if (!res.ok) {
          console.error(`Build hook returned ${res.status} ${res.statusText}`);
        } else {
          rebuildTriggered = true;
        }
      } catch (error) {
        console.error('Build hook request failed:', error);
      }
    } else {
      console.warn('BUILD_HOOK_URL not set — skipping rebuild trigger');
    }
  } else {
    console.log('No feeds changed — skipping rebuild');
  }

  return { total: results.length, updated, skipped, errors, durationMs, rebuildTriggered };
}
