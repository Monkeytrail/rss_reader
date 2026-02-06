import Parser from 'rss-parser';
import feedsConfig from '../data/feeds.json';
import { parseOPMLFiles } from './opml';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'AstroRSSReader/1.0',
  },
});

export interface Article {
  id: string;
  title: string;
  link: string;
  pubDate: Date;
  author?: string;
  content?: string;
  summary?: string;
  feedTitle: string;
  category: string;
  categorySlug: string;
}

export interface FeedSource {
  title: string;
  url: string;
  category: string;
  categorySlug: string;
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
        });
      }
    }
  }

  // 2. Feeds from OPML files
  const opmlFeeds = await parseOPMLFiles();
  for (const feed of opmlFeeds) {
    if (!seenUrls.has(feed.url)) {
      seenUrls.add(feed.url);
      sources.push(feed);
    }
  }

  return sources;
}

// Cache fetched articles across pages during a single build
let cachedArticles: Article[] | null = null;

export async function fetchAllFeeds(): Promise<Article[]> {
  if (cachedArticles) return cachedArticles;

  const sources = await getAllFeedSources();
  const articles: Article[] = [];

  const results = await Promise.allSettled(
    sources.map(async (feed) => {
      try {
        const parsed = await parser.parseURL(feed.url);
        const feedArticles: Article[] = [];

        for (const item of parsed.items.slice(0, 10)) {
          feedArticles.push({
            id: Buffer.from(item.link || item.guid || item.title || '')
              .toString('base64')
              .slice(0, 20),
            title: item.title || 'Untitled',
            link: item.link || '',
            pubDate: new Date(item.pubDate || item.isoDate || Date.now()),
            author: item.creator || item.author,
            content: item['content:encoded'] || item.content,
            summary: item.contentSnippet || item.summary,
            feedTitle: feed.title,
            category: feed.category,
            categorySlug: feed.categorySlug,
          });
        }

        return feedArticles;
      } catch (error) {
        console.error(`Failed to fetch ${feed.title}: ${error}`);
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
  return cachedArticles;
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
