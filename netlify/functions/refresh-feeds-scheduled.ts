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
  schedule: '0 8 * * *',
};
