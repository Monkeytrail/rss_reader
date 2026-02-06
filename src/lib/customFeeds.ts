export interface CustomFeed {
  id: string;
  title: string;
  url: string;
  category: string;
  categorySlug: string;
  addedAt: number;
}

const STORAGE_KEY = 'rss-reader-custom-feeds';

export function getCustomFeeds(): CustomFeed[] {
  if (typeof localStorage === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addCustomFeed(
  url: string,
  title: string,
  category: string = 'Custom',
): CustomFeed {
  const feeds = getCustomFeeds();

  const newFeed: CustomFeed = {
    id: crypto.randomUUID(),
    title,
    url,
    category,
    categorySlug: category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    addedAt: Date.now(),
  };

  feeds.push(newFeed);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(feeds));

  return newFeed;
}

export function removeCustomFeed(id: string): void {
  const feeds = getCustomFeeds().filter((f) => f.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(feeds));
}

export function exportCustomFeedsAsOPML(): string {
  const feeds = getCustomFeeds();

  const outlines = feeds
    .map(
      (f) =>
        `      <outline type="rss" text="${escapeXml(f.title)}" title="${escapeXml(f.title)}" xmlUrl="${escapeXml(f.url)}" />`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>My Custom Feeds</title>
  </head>
  <body>
    <outline text="Custom Feeds" title="Custom Feeds">
${outlines}
    </outline>
  </body>
</opml>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
