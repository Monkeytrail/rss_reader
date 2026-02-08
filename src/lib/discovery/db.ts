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
    `CREATE TABLE IF NOT EXISTS user_read_articles (
      user_id TEXT NOT NULL,
      article_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, article_id)
    )`,
    `CREATE TABLE IF NOT EXISTS user_bookmarks (
      user_id TEXT NOT NULL,
      article_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, article_id)
    )`,
    `CREATE TABLE IF NOT EXISTS feed_health_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_url TEXT NOT NULL,
      build_time TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL CHECK (status IN ('success', 'error', 'quiet')),
      error_message TEXT,
      article_count INTEGER NOT NULL DEFAULT 0,
      last_article_date TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_read ON user_read_articles(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_bookmarks ON user_bookmarks(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_feed_health ON feed_health_snapshots(feed_url, build_time DESC)`,
    `CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT UNIQUE NOT NULL,
      category_name TEXT NOT NULL,
      category_slug TEXT NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('seed', 'manual', 'opml', 'discovered')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_feeds_category ON feeds(category_slug)`,
    `CREATE INDEX IF NOT EXISTS idx_feeds_hidden ON feeds(hidden)`,
    `CREATE INDEX IF NOT EXISTS idx_feeds_url ON feeds(url)`,
  ]);
}
