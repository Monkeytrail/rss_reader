import type { Config, Context } from '@netlify/functions';
import { runFeedRefresh } from '../../src/lib/discovery/refresh-feeds';

export default async (_req: Request, _context: Context) => {
  try {
    const result = await runFeedRefresh();
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Feed refresh failed:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};

export const config: Config = {
  schedule: '0 8 * * *',
};
