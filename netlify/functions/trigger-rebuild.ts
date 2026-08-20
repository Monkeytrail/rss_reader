import type { Context } from "@netlify/functions";
import { jsonResponse } from '../../src/lib/httpResponse';

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const buildHookUrl = process.env.BUILD_HOOK_URL;

  if (!buildHookUrl) {
    return jsonResponse({ error: 'Build hook not configured' }, 500);
  }

  try {
    const response = await fetch(buildHookUrl, { method: 'POST' });

    if (response.ok) {
      return jsonResponse({ success: true });
    } else {
      throw new Error('Build hook failed');
    }
  } catch {
    return jsonResponse({ error: 'Failed to trigger build' }, 500);
  }
};
