import { createStoredSet } from './localStorageSet';
import { syncRead } from './syncState';

const readArticles = createStoredSet('rss-reader-read-articles', 2000);

export function isRead(articleId: string): boolean {
  return readArticles.has(articleId);
}

export function markAsRead(articleId: string): void {
  readArticles.add(articleId);
  syncRead.add(articleId);
}

export function markAsUnread(articleId: string): void {
  readArticles.remove(articleId);
  syncRead.remove(articleId);
}
