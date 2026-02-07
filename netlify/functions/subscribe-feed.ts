import type { Context } from '@netlify/functions';
import { getDb, initSchema } from '../../src/lib/discovery/db';

interface SubscribeBody {
  domain_id: number;
  feed_url: string;
  feed_title: string;
  category: string;
  category_slug: string;
}

interface FeedsJsonCategory {
  name: string;
  slug: string;
  feeds: Array<{ title: string; url: string }>;
}

interface FeedsJson {
  categories: FeedsJsonCategory[];
}

const GITHUB_OWNER = 'Monkeytrail';
const GITHUB_REPO = 'rss_reader';
const FILE_PATH = 'src/data/feeds.json';

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return new Response(
      JSON.stringify({ error: 'GitHub token not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const body: SubscribeBody = await req.json();
    const { domain_id, feed_url, feed_title, category, category_slug } = body;

    if (!feed_url || !feed_title || !category || !category_slug || !domain_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Step 1: Read current feeds.json from GitHub
    const getResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'AstroRSSReader/1.0',
        },
      },
    );

    if (!getResponse.ok) {
      throw new Error(`GitHub GET failed: ${getResponse.status}`);
    }

    const fileData = await getResponse.json();
    const currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
    const feedsJson: FeedsJson = JSON.parse(currentContent);

    // Step 2: Add feed to the appropriate category
    let targetCategory = feedsJson.categories.find((c) => c.slug === category_slug);

    if (!targetCategory) {
      targetCategory = { name: category, slug: category_slug, feeds: [] };
      feedsJson.categories.push(targetCategory);
    }

    if (targetCategory.feeds.some((f) => f.url === feed_url)) {
      return new Response(
        JSON.stringify({ error: 'Feed already exists in this category' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    }

    targetCategory.feeds.push({ title: feed_title, url: feed_url });

    // Step 3: Commit updated feeds.json
    const newContent = JSON.stringify(feedsJson, null, 2) + '\n';
    const encodedContent = Buffer.from(newContent).toString('base64');

    const putResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'AstroRSSReader/1.0',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Add discovered feed: ${feed_title}`,
          content: encodedContent,
          sha: fileData.sha,
        }),
      },
    );

    if (!putResponse.ok) {
      const errorBody = await putResponse.text();
      throw new Error(`GitHub PUT failed: ${putResponse.status} - ${errorBody}`);
    }

    // Step 4: Mark as subscribed in Turso
    await initSchema();
    const db = getDb();
    await db.execute({
      sql: "UPDATE discovered_domains SET status = 'subscribed' WHERE id = ?",
      args: [domain_id],
    });

    return new Response(
      JSON.stringify({ success: true, message: 'Feed subscribed and rebuild triggered' }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to subscribe',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
