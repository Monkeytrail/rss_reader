import { createClient, type Client } from '@libsql/client';

let client: Client | null = null;

export function getDb(): Client {
  if (client) return client;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) throw new Error('TURSO_DATABASE_URL not set');

  client = createClient({ url, authToken });
  return client;
}

export async function initSchema(): Promise<void> {
  const db = getDb();

  await db.batch([
    `CREATE TABLE IF NOT EXISTS discovered_domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT UNIQUE NOT NULL,
      feed_url TEXT,
      feed_title TEXT,
      feed_description TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','suggested','subscribed','dismissed','no_feed')),
      current_score INTEGER NOT NULL DEFAULT 0,
      first_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      categories TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS domain_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain_id INTEGER NOT NULL REFERENCES discovered_domains(id),
      source TEXT NOT NULL,
      story_url TEXT NOT NULL,
      story_title TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS discovery_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      stories_collected INTEGER NOT NULL DEFAULT 0,
      new_domains_found INTEGER NOT NULL DEFAULT 0,
      feeds_discovered INTEGER NOT NULL DEFAULT 0,
      new_suggestions INTEGER NOT NULL DEFAULT 0,
      errors TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_domains_status ON discovered_domains(status)`,
    `CREATE INDEX IF NOT EXISTS idx_domains_score ON discovered_domains(current_score DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_events_domain ON domain_events(domain_id)`,
  ]);
}
