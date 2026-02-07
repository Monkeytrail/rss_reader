import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const buildHookUrl = process.env.BUILD_HOOK_URL;

  if (!buildHookUrl) {
    return new Response(
      JSON.stringify({ error: 'Build hook not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const response = await fetch(buildHookUrl, { method: 'POST' });

    if (response.ok) {
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      throw new Error('Build hook failed');
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to trigger build' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
