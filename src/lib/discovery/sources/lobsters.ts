import type { CollectedStory, SourceAdapter } from '../types';

const HOTTEST_URL = 'https://lobste.rs/hottest.json';

export const lobstersAdapter: SourceAdapter = {
  name: 'lobsters',

  async collect(): Promise<CollectedStory[]> {
    const response = await fetch(HOTTEST_URL, {
      headers: { 'User-Agent': 'AstroRSSReader/1.0 (feed-discovery)' },
    });
    if (!response.ok) throw new Error(`Lobsters fetch failed: ${response.status}`);

    const items: Array<{
      short_id: string;
      url: string;
      title: string;
      comments_url: string;
    }> = await response.json();

    return items
      .filter((item) => item.url && !item.url.includes('lobste.rs'))
      .map((item, index) => ({
        url: item.url,
        title: item.title,
        source: 'lobsters' as const,
        points: 4,
        position: index,
        storyUrl: item.comments_url || `https://lobste.rs/s/${item.short_id}`,
      }));
  },
};
