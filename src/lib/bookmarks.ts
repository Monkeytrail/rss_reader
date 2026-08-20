import { createStoredSet } from './localStorageSet';
import { syncBookmark } from './syncState';

const bookmarks = createStoredSet('rss-reader-bookmarked-articles', 500);

export function isBookmarked(articleId: string): boolean {
  return bookmarks.has(articleId);
}

export function addBookmark(articleId: string): void {
  bookmarks.add(articleId);
  syncBookmark.add(articleId);
}

export function removeBookmark(articleId: string): void {
  bookmarks.remove(articleId);
  syncBookmark.remove(articleId);
}

export function getAllBookmarks(): string[] {
  return bookmarks.all();
}

export function getBookmarkCount(): number {
  return bookmarks.count();
}
