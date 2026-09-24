import { getDb, initSchema } from './db';

const MIN_INTERVAL_MS = 10 * 60 * 1000;

export interface TriggerResult {
  triggered: boolean;
  skippedReason?: string;
}

export async function triggerBuildIfNeeded(reason: string): Promise<TriggerResult> {
  const buildHookUrl = process.env.BUILD_HOOK_URL;
  if (!buildHookUrl) {
    console.warn('BUILD_HOOK_URL not set — skipping rebuild trigger');
    return { triggered: false, skippedReason: 'BUILD_HOOK_URL not configured' };
  }

  await initSchema();
  const db = getDb();

  const last = await db.execute(
    'SELECT triggered_at FROM build_triggers ORDER BY triggered_at DESC LIMIT 1',
  );

  const now = Date.now();
  if (last.rows.length > 0) {
    const lastTriggeredAt = new Date(last.rows[0].triggered_at as string).getTime();
    const elapsedMs = now - lastTriggeredAt;
    if (elapsedMs < MIN_INTERVAL_MS) {
      const waitMin = Math.ceil((MIN_INTERVAL_MS - elapsedMs) / 60000);
      return {
        triggered: false,
        skippedReason: `A build was triggered in the last ${Math.round(MIN_INTERVAL_MS / 60000)} minutes, skipping. Try again in ${waitMin} min.`,
      };
    }
  }

  try {
    const res = await fetch(buildHookUrl, { method: 'POST' });
    if (!res.ok) {
      console.error(`Build hook returned ${res.status} ${res.statusText}`);
      return { triggered: false, skippedReason: `Build hook returned ${res.status}` };
    }
  } catch (error) {
    console.error('Build hook request failed:', error);
    return { triggered: false, skippedReason: 'Build hook request failed' };
  }

  await db.execute({
    sql: 'INSERT INTO build_triggers (triggered_at, reason) VALUES (?, ?)',
    args: [new Date(now).toISOString(), reason],
  });

  return { triggered: true };
}
