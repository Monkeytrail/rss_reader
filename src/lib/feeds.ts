import Parser from 'rss-parser';
import feedsConfig from '../data/feeds.json';
import { parseOPMLFiles } from './opml';
import { calculateReadingTime } from './utils';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'AstroRSSReader/1.0',
  },
  customFields: {
    item: [
      ['media:group', 'mediaGroup'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['yt:videoId', 'youtubeVideoId'],
    ],
  },
});

function isYouTubeFeed(feedUrl: string): boolean {
  return feedUrl.includes('youtube.com/feeds');
}

function extractYouTubeData(item: any): { thumbnail?: string; videoId?: string } {
  let thumbnail: string | undefined;
  let videoId: string | undefined;

  if (item.youtubeVideoId) {
    videoId = item.youtubeVideoId;
  } else if (item.link) {
    const match = item.link.match(/[?&]v=([^&]+)/);
    if (match) videoId = match[1];
  }

  if (item.mediaGroup?.['media:thumbnail']?.[0]?.['$']?.url) {
    thumbnail = item.mediaGroup['media:thumbnail'][0]['$'].url;
  } else if (videoId) {
    thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
  }

  return { thumbnail, videoId };
}

export interface Article {
  id: string;
  title: string;
  link: string;
  pubDate: Date;
  author?: string;
  content?: string;
  summary?: string;
  feedUrl: string;
  feedTitle: string;
  feedFavicon: string;
  category: string;
  categorySlug: string;
  readingTime: number;
  mediaType: 'article' | 'video';
  thumbnail?: string;
  videoId?: string;
}

export interface FeedSource {
  title: string;
  url: string;
  category: string;
  categorySlug: string;
  faviconUrl: string;
}

export interface FeedMeta {
  url: string;
  title: string;
  category: string;
  categorySlug: string;
  faviconUrl: string;
  lastArticleDate: Date | null;
  articleCount: number;
  isQuiet: boolean;
}

function getFaviconUrl(feedUrl: string): string {
  try {
    const domain = new URL(feedUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return '/icons/default-feed.svg';
  }
}

export async function getAllFeedSources(): Promise<FeedSource[]> {
  const sources: FeedSource[] = [];
  const seenUrls = new Set<string>();

  // 1. Feeds from feeds.json
  for (const category of feedsConfig.categories) {
    for (const feed of category.feeds) {
      if (!seenUrls.has(feed.url)) {
        seenUrls.add(feed.url);
        sources.push({
          title: feed.title,
          url: feed.url,
          category: category.name,
          categorySlug: category.slug,
          faviconUrl: getFaviconUrl(feed.url),
        });
      }
    }
  }

  // 2. Feeds from OPML files
  const opmlFeeds = await parseOPMLFiles();
  for (const feed of opmlFeeds) {
    if (!seenUrls.has(feed.url)) {
      seenUrls.add(feed.url);
      sources.push({
        ...feed,
        faviconUrl: getFaviconUrl(feed.url),
      });
    }
  }

  return sources;
}

// Cache fetched articles across pages during a single build
let cachedArticles: Article[] | null = null;

// Cache raw parsed feed data for getFeedMetadata
let cachedParsedFeeds: Map<string, any> | null = null;

// Cache feed errors during build
let cachedFeedErrors: Map<string, string> = new Map();

export interface FeedError {
  url: string;
  title: string;
  category: string;
  error: string;
}

export async function fetchAllFeeds(): Promise<Article[]> {
  if (cachedArticles) return cachedArticles;

  const sources = await getAllFeedSources();
  const articles: Article[] = [];
  cachedParsedFeeds = new Map();

  const results = await Promise.allSettled(
    sources.map(async (feed) => {
      try {
        const parsed = await parser.parseURL(feed.url);
        cachedParsedFeeds!.set(feed.url, parsed);
        const feedArticles: Article[] = [];
        const isYouTube = isYouTubeFeed(feed.url);

        const now = Date.now();
        for (const item of parsed.items.slice(0, 10)) {
          const pubDate = new Date(item.pubDate || item.isoDate || 0);
          if (pubDate.getTime() > now || pubDate.getTime() === 0) continue;

          const itemAny = item as any;
          const contentText =
            itemAny['content:encoded'] || item.content || item.contentSnippet || item.summary;

          let thumbnail: string | undefined;
          let videoId: string | undefined;
          let mediaType: 'article' | 'video' = 'article';

          if (isYouTube) {
            const ytData = extractYouTubeData(itemAny);
            thumbnail = ytData.thumbnail;
            videoId = ytData.videoId;
            mediaType = 'video';
          }

          feedArticles.push({
            id: Buffer.from(item.link || item.guid || item.title || '')
              .toString('base64')
              .slice(0, 20),
            title: item.title || 'Untitled',
            link: item.link || '',
            pubDate,
            author: item.creator || itemAny.author,
            content: itemAny['content:encoded'] || item.content,
            summary: item.contentSnippet || item.summary,
            feedUrl: feed.url,
            feedTitle: feed.title,
            feedFavicon: feed.faviconUrl,
            category: feed.category,
            categorySlug: feed.categorySlug,
            readingTime: calculateReadingTime(contentText),
            mediaType,
            thumbnail,
            videoId,
          });
        }

        return feedArticles;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Failed to fetch ${feed.title}: ${msg}`);
        cachedFeedErrors.set(feed.url, msg);
        return [];
      }
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      articles.push(...result.value);
    }
  }

  cachedArticles = articles.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  // Record feed health snapshot to Turso (build-time only)
  if (typeof window === 'undefined') {
    await recordFeedHealthSnapshot(sources);
  }

  return cachedArticles;
}

async function recordFeedHealthSnapshot(sources: FeedSource[]): Promise<void> {
  try {
    const { getDb, initSchema } = await import('./discovery/db');
    await initSchema();
    const db = getDb();

    const buildTime = new Date().toISOString();
    const statements = [];

    for (const source of sources) {
      const parsed = cachedParsedFeeds?.get(source.url);
      const errorMsg = cachedFeedErrors.get(source.url);

      let status: 'success' | 'error' | 'quiet' = 'success';
      let articleCount = 0;
      let lastArticleDate: string | null = null;

      if (errorMsg) {
        status = 'error';
      } else if (parsed) {
        articleCount = parsed.items?.length || 0;
        if (parsed.items && parsed.items.length > 0) {
          const dates = parsed.items
            .map((item: any) => new Date(item.pubDate || item.isoDate || 0))
            .filter((d: Date) => !isNaN(d.getTime()) && d.getTime() > 0)
            .sort((a: Date, b: Date) => b.getTime() - a.getTime());
          if (dates[0]) {
            lastArticleDate = dates[0].toISOString();
            if (Math.floor((Date.now() - dates[0].getTime()) / 86400000) > QUIET_THRESHOLD_DAYS) {
              status = 'quiet';
            }
          }
        }
      }

      statements.push({
        sql: `INSERT INTO feed_health_snapshots (feed_url, build_time, status, error_message, article_count, last_article_date) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [source.url, buildTime, status, errorMsg || null, articleCount, lastArticleDate],
      });
    }

    if (statements.length > 0) {
      await db.batch(statements);
    }
  } catch (error) {
    console.error('Failed to record feed health:', error);
  }
}

export async function getCategories() {
  const sources = await getAllFeedSources();
  const categories = new Map<string, { name: string; slug: string }>();

  for (const source of sources) {
    if (!categories.has(source.categorySlug)) {
      categories.set(source.categorySlug, {
        name: source.category,
        slug: source.categorySlug,
      });
    }
  }

  return Array.from(categories.values());
}

const QUIET_THRESHOLD_DAYS = 28;

export async function getFeedMetadata(): Promise<FeedMeta[]> {
  // Ensure feeds have been fetched first so we can use the cache
  await fetchAllFeeds();

  const sources = await getAllFeedSources();
  const now = new Date();
  const metadata: FeedMeta[] = [];

  for (const source of sources) {
    let lastArticleDate: Date | null = null;
    let articleCount = 0;

    const parsed = cachedParsedFeeds?.get(source.url);
    if (parsed) {
      articleCount = parsed.items?.length || 0;

      if (parsed.items && parsed.items.length > 0) {
        const dates = parsed.items
          .map((item: any) => new Date(item.pubDate || item.isoDate || 0))
          .filter((date: Date) => !isNaN(date.getTime()) && date.getTime() > 0)
          .sort((a: Date, b: Date) => b.getTime() - a.getTime());

        lastArticleDate = dates[0] || null;
      }
    }

    const daysSinceLastArticle = lastArticleDate
      ? Math.floor((now.getTime() - lastArticleDate.getTime()) / 86400000)
      : Infinity;

    metadata.push({
      url: source.url,
      title: source.title,
      category: source.category,
      categorySlug: source.categorySlug,
      faviconUrl: source.faviconUrl,
      lastArticleDate,
      articleCount,
      isQuiet: daysSinceLastArticle > QUIET_THRESHOLD_DAYS,
    });
  }

  return metadata;
}

export async function getFeedErrors(): Promise<FeedError[]> {
  await fetchAllFeeds();

  const sources = await getAllFeedSources();
  const errors: FeedError[] = [];

  for (const [url, errorMsg] of cachedFeedErrors.entries()) {
    const source = sources.find((s) => s.url === url);
    errors.push({
      url,
      title: source?.title || url,
      category: source?.category || 'Unknown',
      error: errorMsg,
    });
  }

  return errors;
}
