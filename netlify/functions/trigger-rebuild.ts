import type { Context } from "@netlify/functions";
import { jsonResponse } from '../../src/lib/httpResponse';
import { triggerBuildIfNeeded } from '../../src/lib/discovery/buildTrigger';

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const result = await triggerBuildIfNeeded('manual-button');

  if (result.triggered) {
    return jsonResponse({ success: true });
  }

  return jsonResponse({ error: result.skippedReason ?? 'Failed to trigger build' }, 429);
};
