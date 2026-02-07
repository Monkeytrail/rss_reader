import type { Config, Context } from '@netlify/functions';
import { initSchema, getDb } from '../../src/lib/discovery/db';
import { allAdapters } from '../../src/lib/discovery/sources/index';
import { groupStoriesByDomain } from '../../src/lib/discovery/domain-filter';
import { discoverFeed } from '../../src/lib/discovery/feed-discoverer';
import { calculateCycleScore, updateDomainScore } from '../../src/lib/discovery/scorer';
import type { CollectedStory } from '../../src/lib/discovery/types';

export default async (req: Request, context: Context) => {
  const startTime = new Date().toISOString();
  let storiesCollected = 0;
  let newDomainsFound = 0;
  let feedsDiscovered = 0;
  let newSuggestions = 0;
  const errors: string[] = [];

  try {
    await initSchema();
    const db = getDb();

    // Step 1: Collect stories from all sources
    const allStories: CollectedStory[] = [];

    const sourceResults = await Promise.allSettled(
      allAdapters.map((adapter) => adapter.collect()),
    );

    for (let i = 0; i < sourceResults.length; i++) {
      const result = sourceResults[i];
      if (result.status === 'fulfilled') {
        allStories.push(...result.value);
      } else {
        errors.push(`${allAdapters[i].name}: ${result.reason}`);
      }
    }
    storiesCollected = allStories.length;

    // Step 2: Group by domain and filter
    const domainStories = groupStoriesByDomain(allStories);

    // Load existing subscribed domains to skip
    const existingFeeds = await db.execute(
      "SELECT domain FROM discovered_domains WHERE status IN ('subscribed')",
    );
    const subscribedDomains = new Set(existingFeeds.rows.map((r) => r.domain as string));

    // Step 3: Process each domain
    for (const [domain, stories] of domainStories) {
      if (subscribedDomains.has(domain)) continue;

      // Upsert domain
      const existing = await db.execute({
        sql: 'SELECT id, status, feed_url FROM discovered_domains WHERE domain = ?',
        args: [domain],
      });

      let domainId: number;
      let currentStatus: string;
      let hasFeed: boolean;

      if (existing.rows.length === 0) {
        const insert = await db.execute({
          sql: `INSERT INTO discovered_domains (domain, status, current_score, first_seen, last_seen)
                VALUES (?, 'pending', 0, datetime('now'), datetime('now'))`,
          args: [domain],
        });
        domainId = Number(insert.lastInsertRowid);
        currentStatus = 'pending';
        hasFeed = false;
        newDomainsFound++;
      } else {
        domainId = existing.rows[0].id as number;
        currentStatus = existing.rows[0].status as string;
        hasFeed = existing.rows[0].feed_url !== null;

        await db.execute({
          sql: "UPDATE discovered_domains SET last_seen = datetime('now') WHERE id = ?",
          args: [domainId],
        });
      }

      // Insert events
      for (const story of stories) {
        await db.execute({
          sql: `INSERT INTO domain_events (domain_id, source, story_url, story_title, points, position)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [domainId, story.source, story.storyUrl, story.title, story.points, story.position],
        });
      }

      // Step 4: Discover feed if we don't have one
      if (!hasFeed && currentStatus !== 'no_feed' && currentStatus !== 'dismissed') {
        const feed = await discoverFeed(domain);
        if (feed) {
          await db.execute({
            sql: `UPDATE discovered_domains
                  SET feed_url = ?, feed_title = ?, feed_description = ?
                  WHERE id = ?`,
            args: [feed.feedUrl, feed.feedTitle, feed.feedDescription || null, domainId],
          });
          feedsDiscovered++;
          hasFeed = true;
        } else {
          await db.execute({
            sql: "UPDATE discovered_domains SET status = 'no_feed' WHERE id = ? AND status = 'pending'",
            args: [domainId],
          });
          currentStatus = 'no_feed';
        }
      }

      // Step 5: Update score
      if (hasFeed && currentStatus !== 'dismissed' && currentStatus !== 'subscribed' && currentStatus !== 'no_feed') {
        const cycleScore = calculateCycleScore(stories);

        const storyCategories = detectCategories(stories);
        if (storyCategories.length > 0) {
          await db.execute({
            sql: 'UPDATE discovered_domains SET categories = ? WHERE id = ?',
            args: [storyCategories.join(','), domainId],
          });
        }

        const { promoted } = await updateDomainScore(domainId, cycleScore, currentStatus);
        if (promoted) newSuggestions++;
      }
    }

    // Step 6: Log the run
    await db.execute({
      sql: `INSERT INTO discovery_runs (started_at, completed_at, stories_collected, new_domains_found, feeds_discovered, new_suggestions, errors)
            VALUES (?, datetime('now'), ?, ?, ?, ?, ?)`,
      args: [startTime, storiesCollected, newDomainsFound, feedsDiscovered, newSuggestions, errors.length > 0 ? errors.join('; ') : null],
    });

    return new Response(
      JSON.stringify({ success: true, storiesCollected, newDomainsFound, feedsDiscovered, newSuggestions, errors }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    try {
      const db = getDb();
      await db.execute({
        sql: `INSERT INTO discovery_runs (started_at, completed_at, stories_collected, new_domains_found, feeds_discovered, new_suggestions, errors)
              VALUES (?, datetime('now'), ?, ?, ?, ?, ?)`,
        args: [startTime, storiesCollected, newDomainsFound, feedsDiscovered, newSuggestions, message],
      });
    } catch {
      /* ignore logging failure */
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};

function detectCategories(stories: CollectedStory[]): string[] {
  const categories = new Set<string>();

  for (const story of stories) {
    if (story.source === 'hackernews' || story.source === 'lobsters') {
      categories.add('tech');
    }
    if (story.source === 'devto') {
      categories.add('webdev');
    }
  }

  return Array.from(categories);
}

export const config: Config = {
  schedule: '0 */12 * * *',
};
