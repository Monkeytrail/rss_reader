import type { DiscoveredFeed } from './types';

const COMMON_FEED_PATHS = [
  '/feed',
  '/rss',
  '/atom.xml',
  '/feed.xml',
  '/index.xml',
  '/rss.xml',
  '/blog/feed',
  '/blog/rss.xml',
  '/blog/feed.xml',
  '/blog/atom.xml',
  '/feed/rss',
  '/feed/atom',
];

const FEED_CONTENT_TYPES = [
  'application/rss+xml',
  'application/atom+xml',
  'application/xml',
  'text/xml',
  'application/feed+json',
];

const USER_AGENT = 'AstroRSSReader/1.0 (feed-discovery)';
const FETCH_TIMEOUT = 8000;

/**
 * Discover an RSS/Atom feed for a domain.
 * 1. Check HTML <link> tags on homepage
 * 2. Probe common feed paths
 * 3. Validate feed has content and is fresh (<90 days)
 */
export async function discoverFeed(domain: string): Promise<DiscoveredFeed | null> {
  const baseUrl = `https://${domain}`;

  // Strategy 1: HTML <link> tags
  const linkTagFeed = await findFeedFromHtml(baseUrl);
  if (linkTagFeed) {
    const validated = await validateFeed(linkTagFeed);
    if (validated) return validated;
  }

  // Strategy 2: Common paths
  for (const path of COMMON_FEED_PATHS) {
    const feedUrl = `${baseUrl}${path}`;
    const validated = await validateFeed(feedUrl);
    if (validated) return validated;
  }

  return null;
}

async function findFeedFromHtml(baseUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(baseUrl, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const html = await response.text();

    const linkRegex = /<link[^>]*rel=["']alternate["'][^>]*>/gi;
    const matches = html.matchAll(linkRegex);

    for (const match of matches) {
      const tag = match[0];

      const typeMatch = tag.match(/type=["']([^"']+)["']/i);
      if (!typeMatch) continue;

      const type = typeMatch[1].toLowerCase();
      if (!FEED_CONTENT_TYPES.some((ct) => type.includes(ct))) continue;

      const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
      if (!hrefMatch) continue;

      let feedUrl = hrefMatch[1];

      if (feedUrl.startsWith('/')) {
        feedUrl = `${baseUrl}${feedUrl}`;
      } else if (!feedUrl.startsWith('http')) {
        feedUrl = `${baseUrl}/${feedUrl}`;
      }

      return feedUrl;
    }
  } catch {
    // timeout or network error
  }

  return null;
}

async function validateFeed(feedUrl: string): Promise<DiscoveredFeed | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const text = await response.text();

    // Must look like RSS or Atom
    if (!text.includes('<rss') && !text.includes('<feed') && !text.includes('<channel>')) {
      return null;
    }

    // Extract title
    const titleMatch = text.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/is);
    const title = titleMatch?.[1]?.trim() || '';

    // Extract description
    const descMatch =
      text.match(/<description[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/is) ||
      text.match(/<subtitle[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/subtitle>/is);
    const description = descMatch?.[1]?.trim() || '';

    // Count items
    const itemMatches = text.match(/<item[\s>]/gi) || [];
    const entryMatches = text.match(/<entry[\s>]/gi) || [];
    const itemCount = Math.max(itemMatches.length, entryMatches.length);

    if (itemCount === 0) return null;

    // Find most recent date
    const dateRegex =
      /<(?:pubDate|updated|published|dc:date)[^>]*>(.*?)<\/(?:pubDate|updated|published|dc:date)>/gi;
    const dates: Date[] = [];
    let dateMatch: RegExpExecArray | null;
    while ((dateMatch = dateRegex.exec(text)) !== null) {
      const d = new Date(dateMatch[1].trim());
      if (!isNaN(d.getTime())) dates.push(d);
    }
    dates.sort((a, b) => b.getTime() - a.getTime());
    const lastItemDate = dates[0] || null;

    // Freshness check: must be <90 days old
    if (lastItemDate) {
      const daysSinceLastItem = (Date.now() - lastItemDate.getTime()) / 86400000;
      if (daysSinceLastItem > 90) return null;
    }

    return {
      feedUrl,
      feedTitle: title,
      feedDescription: description || undefined,
      itemCount,
      lastItemDate,
    };
  } catch {
    return null;
  }
}
