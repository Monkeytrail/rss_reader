import { syncRead } from './syncState';

const STORAGE_KEY = 'rss-reader-read-articles';
const MAX_READ_ENTRIES = 2000;

function getReadSet(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadSet(set: Set<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

export function isRead(articleId: string): boolean {
  return getReadSet().has(articleId);
}

export function markAsRead(articleId: string): void {
  const set = getReadSet();
  set.add(articleId);
  if (set.size > MAX_READ_ENTRIES) {
    const arr = [...set];
    const trimmed = new Set(arr.slice(arr.length - MAX_READ_ENTRIES));
    saveReadSet(trimmed);
  } else {
    saveReadSet(set);
  }
  syncRead.add(articleId);
}

export function markAsUnread(articleId: string): void {
  const set = getReadSet();
  set.delete(articleId);
  saveReadSet(set);
  syncRead.remove(articleId);
}
