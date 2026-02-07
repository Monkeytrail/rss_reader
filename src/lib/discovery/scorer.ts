import type { CollectedStory } from './types';
import { getDb } from './db';

const SUGGESTION_THRESHOLD = 8;

/**
 * Calculate score for a domain based on its stories in this crawl cycle.
 */
export function calculateCycleScore(stories: CollectedStory[]): number {
  let score = 0;

  for (const story of stories) {
    score += story.points;
  }

  // Cross-source bonus: +3 if appeared on 2+ different sources
  const uniqueSources = new Set(stories.map((s) => s.source));
  if (uniqueSources.size >= 2) {
    score += 3;
  }

  return score;
}

/**
 * Update a domain's score and potentially promote to 'suggested'.
 */
export async function updateDomainScore(
  domainId: number,
  cycleScore: number,
  currentStatus: string,
): Promise<{ newScore: number; promoted: boolean }> {
  const db = getDb();

  const row = await db.execute({
    sql: 'SELECT current_score FROM discovered_domains WHERE id = ?',
    args: [domainId],
  });

  const currentScore = (row.rows[0]?.current_score as number) || 0;
  const newScore = currentScore + cycleScore;
  const shouldPromote = newScore >= SUGGESTION_THRESHOLD && currentStatus === 'pending';
  const newStatus = shouldPromote ? 'suggested' : currentStatus;

  await db.execute({
    sql: `UPDATE discovered_domains
          SET current_score = ?, status = ?, last_seen = datetime('now')
          WHERE id = ?`,
    args: [newScore, newStatus, domainId],
  });

  return { newScore, promoted: shouldPromote };
}
