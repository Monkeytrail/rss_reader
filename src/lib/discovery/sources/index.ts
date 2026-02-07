import type { SourceAdapter } from '../types';
import { hackernewsAdapter } from './hackernews';
import { lobstersAdapter } from './lobsters';
import { devtoAdapter } from './devto';

export { hackernewsAdapter } from './hackernews';
export { lobstersAdapter } from './lobsters';
export { devtoAdapter } from './devto';

export const allAdapters: SourceAdapter[] = [
  hackernewsAdapter,
  lobstersAdapter,
  devtoAdapter,
];
