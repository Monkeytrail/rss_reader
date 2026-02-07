import type { CollectedStory } from './types';

const BLOCKED_DOMAINS = new Set([
  'medium.com',
  'github.com',
  'youtube.com',
  'twitter.com',
  'x.com',
  'reddit.com',
  'news.ycombinator.com',
  'stackoverflow.com',
  'stackexchange.com',
  'wikipedia.org',
  'arxiv.org',
  'docs.google.com',
  'drive.google.com',
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'substack.com',
  'dev.to',
  'npmjs.com',
  'pypi.org',
  'archive.org',
  'lobste.rs',
  'codepen.io',
  'jsfiddle.net',
  'replit.com',
  'pastebin.com',
  'imgur.com',
  'twitch.tv',
  'tiktok.com',
  'discord.com',
  'slack.com',
  'notion.so',
  'figma.com',
  'apple.com',
  'microsoft.com',
  'amazon.com',
  'google.com',
  'crates.io',
  'hub.docker.com',
  'play.google.com',
  'apps.apple.com',
]);

const BLOCKED_PATTERNS = [
  /^.*\.github\.io$/,
  /^.*\.medium\.com$/,
  /^.*\.substack\.com$/,
];

export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isBlockedDomain(domain: string): boolean {
  if (BLOCKED_DOMAINS.has(domain)) return true;

  for (const blocked of BLOCKED_DOMAINS) {
    if (domain.endsWith('.' + blocked)) return true;
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(domain)) return true;
  }

  return false;
}

/**
 * Group stories by domain, filtering out blocked domains.
 */
export function groupStoriesByDomain(
  stories: CollectedStory[],
): Map<string, CollectedStory[]> {
  const domainMap = new Map<string, CollectedStory[]>();

  for (const story of stories) {
    const domain = extractDomain(story.url);
    if (!domain) continue;
    if (isBlockedDomain(domain)) continue;

    if (!domainMap.has(domain)) {
      domainMap.set(domain, []);
    }
    domainMap.get(domain)!.push(story);
  }

  return domainMap;
}
