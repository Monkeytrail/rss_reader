import type { CollectedStory, SourceAdapter } from '../types';

const TOP_ARTICLES_URL = 'https://dev.to/api/articles?top=7';

export const devtoAdapter: SourceAdapter = {
  name: 'devto',

  async collect(): Promise<CollectedStory[]> {
    const response = await fetch(TOP_ARTICLES_URL, {
      headers: { 'User-Agent': 'AstroRSSReader/1.0 (feed-discovery)' },
    });
    if (!response.ok) throw new Error(`Dev.to fetch failed: ${response.status}`);

    const items: Array<{
      url: string;
      title: string;
      canonical_url: string;
    }> = await response.json();

    return items.map((item, index) => ({
      url: item.canonical_url || item.url,
      title: item.title,
      source: 'devto' as const,
      points: 2,
      position: index,
      storyUrl: item.url,
    }));
  },
};
