/** A story collected from a trending source */
export interface CollectedStory {
  url: string;
  title: string;
  source: 'hackernews' | 'lobsters' | 'devto';
  points: number;
  position: number;
  storyUrl: string;
}

/** A source adapter must return an array of CollectedStory */
export interface SourceAdapter {
  name: 'hackernews' | 'lobsters' | 'devto';
  collect(): Promise<CollectedStory[]>;
}

/** Result of feed discovery on a domain */
export interface DiscoveredFeed {
  feedUrl: string;
  feedTitle: string;
  feedDescription?: string;
  itemCount: number;
  lastItemDate: Date | null;
}

/** What the get-suggestions API returns */
export interface SuggestionResponse {
  domain_id: number;
  domain: string;
  feed_url: string;
  feed_title: string;
  feed_description: string | null;
  current_score: number;
  first_seen: string;
  source_count: number;
  categories: string;
}
