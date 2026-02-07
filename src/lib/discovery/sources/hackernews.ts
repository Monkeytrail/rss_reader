import type { CollectedStory, SourceAdapter } from '../types';

const TOP_STORIES_URL = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const ITEM_URL = 'https://hacker-news.firebaseio.com/v0/item';

function scoreForPosition(position: number): number {
  if (position < 30) return 5;
  if (position < 100) return 3;
  return 1;
}

export const hackernewsAdapter: SourceAdapter = {
  name: 'hackernews',

  async collect(): Promise<CollectedStory[]> {
    const response = await fetch(TOP_STORIES_URL);
    if (!response.ok) throw new Error(`HN top stories failed: ${response.status}`);

    const storyIds: number[] = await response.json();
    const topIds = storyIds.slice(0, 200);

    const stories: CollectedStory[] = [];
    const BATCH_SIZE = 50;

    for (let i = 0; i < topIds.length; i += BATCH_SIZE) {
      const batch = topIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (id, batchIndex) => {
          const position = i + batchIndex;
          const res = await fetch(`${ITEM_URL}/${id}.json`);
          if (!res.ok) return null;
          const item = await res.json();

          if (!item?.url) return null;

          return {
            url: item.url,
            title: item.title || '',
            source: 'hackernews' as const,
            points: scoreForPosition(position),
            position,
            storyUrl: `https://news.ycombinator.com/item?id=${id}`,
          };
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          stories.push(result.value);
        }
      }
    }

    return stories;
  },
};
