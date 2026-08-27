import type { Config, Context } from '@netlify/functions';
import { runFeedRefresh } from '../../src/lib/discovery/refresh-feeds';
import { errorMessage, jsonResponse } from '../../src/lib/httpResponse';

export default async (_req: Request, _context: Context) => {
  try {
    const result = await runFeedRefresh();
    return jsonResponse(result);
  } catch (error) {
    console.error('Feed refresh failed:', error);
    return jsonResponse({ error: errorMessage(error) }, 500);
  }
};

export const config: Config = {
  // 6:00 and 11:00 UTC = 8am and 1pm CEST. Netlify cron is UTC-only, so this
  // drifts an hour off local time during CET (late Oct - late Mar).
  schedule: '0 6,11 * * *',
};
