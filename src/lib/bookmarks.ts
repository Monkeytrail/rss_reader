import { syncBookmark } from './syncState';

const STORAGE_KEY = 'rss-reader-bookmarked-articles';
const MAX_BOOKMARK_ENTRIES = 500;

function getBookmarkSet(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function saveBookmarkSet(set: Set<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

export function isBookmarked(articleId: string): boolean {
  return getBookmarkSet().has(articleId);
}

export function addBookmark(articleId: string): void {
  const set = getBookmarkSet();
  set.add(articleId);
  if (set.size > MAX_BOOKMARK_ENTRIES) {
    const arr = [...set];
    const trimmed = new Set(arr.slice(arr.length - MAX_BOOKMARK_ENTRIES));
    saveBookmarkSet(trimmed);
  } else {
    saveBookmarkSet(set);
  }
  syncBookmark.add(articleId);
}

export function removeBookmark(articleId: string): void {
  const set = getBookmarkSet();
  set.delete(articleId);
  saveBookmarkSet(set);
  syncBookmark.remove(articleId);
}

export function getAllBookmarks(): string[] {
  return [...getBookmarkSet()];
}

export function getBookmarkCount(): number {
  return getBookmarkSet().size;
}
