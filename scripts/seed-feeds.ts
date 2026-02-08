import 'dotenv/config';
import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error('TURSO_DATABASE_URL not set');
  process.exit(1);
}

const db = createClient({ url, authToken });

interface FeedsJson {
  categories: Array<{
    name: string;
    slug: string;
    feeds: Array<{ title: string; url: string }>;
  }>;
}

async function seed() {
  // Create the feeds table if it doesn't exist
  await db.execute(`CREATE TABLE IF NOT EXISTS feeds (
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
  )`);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_feeds_category ON feeds(category_slug)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_feeds_hidden ON feeds(hidden)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_feeds_url ON feeds(url)`);

  // Read feeds.json
  const feedsPath = resolve(import.meta.dirname, '../src/data/feeds.json');
  const feedsJson: FeedsJson = JSON.parse(readFileSync(feedsPath, 'utf-8'));

  let totalInserted = 0;
  let totalSkipped = 0;

  for (const category of feedsJson.categories) {
    for (let i = 0; i < category.feeds.length; i++) {
      const feed = category.feeds[i];
      try {
        const result = await db.execute({
          sql: `INSERT OR IGNORE INTO feeds (title, url, category_name, category_slug, sort_order, source)
                VALUES (?, ?, ?, ?, ?, 'seed')`,
          args: [feed.title, feed.url, category.name, category.slug, i],
        });
        if (result.rowsAffected > 0) {
          totalInserted++;
        } else {
          totalSkipped++;
          console.log(`  Skipped (duplicate): ${feed.title} — ${feed.url}`);
        }
      } catch (err) {
        console.error(`  Error inserting ${feed.title}:`, err);
      }
    }
    console.log(`Category "${category.name}": ${category.feeds.length} feeds`);
  }

  console.log(`\nDone! Inserted: ${totalInserted}, Skipped: ${totalSkipped}`);

  // Verify
  const count = await db.execute('SELECT COUNT(*) as count FROM feeds');
  console.log(`Total feeds in Turso: ${count.rows[0].count}`);

  const categories = await db.execute('SELECT DISTINCT category_name FROM feeds ORDER BY category_name');
  console.log(`Categories: ${categories.rows.map(r => r.category_name).join(', ')}`);
}

seed().catch(console.error);
