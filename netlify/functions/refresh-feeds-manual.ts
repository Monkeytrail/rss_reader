import type { Context } from '@netlify/functions';
import { createHash, timingSafeEqual } from 'crypto';
import { hasRunToday, runFeedRefresh } from '../../src/lib/discovery/refresh-feeds';
import { errorMessage, jsonResponse } from '../../src/lib/httpResponse';

function constantTimeEqual(a: string, b: string): boolean {
  const ah = createHash('sha256').update(a).digest();
  const bh = createHash('sha256').update(b).digest();
  return timingSafeEqual(ah, bh);
}

function isAuthorized(req: Request): boolean {
  const token = process.env.REFRESH_FEEDS_TOKEN;
  if (!token) return false;

  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return false;

  return constantTimeEqual(auth.slice('Bearer '.length), token);
}

// Plain HTTP endpoint for the feed refresh, meant as a backup trigger for
// days Netlify's own scheduled function (refresh-feeds-scheduled.ts) doesn't
// fire — scheduled functions can't be invoked over HTTP, so this duplicate
// exists purely to be reachable from an external cron (e.g. GitHub Actions).
//
// `updated > 0` is true on essentially every run (feeds rarely all 304 at
// once), so if the scheduled run already happened today this would otherwise
// trigger a second real rebuild rather than acting as a true backup.
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!isAuthorized(req)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    if (await hasRunToday()) {
      return jsonResponse({ skipped: true, reason: 'already ran today' });
    }

    const result = await runFeedRefresh();
    return jsonResponse(result);
  } catch (error) {
    console.error('Feed refresh failed:', error);
    return jsonResponse({ error: errorMessage(error) }, 500);
  }
};
