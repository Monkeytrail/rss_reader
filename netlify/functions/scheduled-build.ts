import type { Config } from '@netlify/functions';

export default async () => {
  const buildHookUrl = process.env.BUILD_HOOK_URL;

  if (buildHookUrl) {
    await fetch(buildHookUrl, { method: 'POST' });
    return new Response('Build triggered');
  }

  return new Response('No build hook configured', { status: 500 });
};

export const config: Config = {
  schedule: '0 * * * *', // Every hour
};
