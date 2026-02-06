const STORAGE_KEY = 'rss-reader-read-articles';

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
  // Keep max 2000 entries to avoid localStorage bloat
  if (set.size > 2000) {
    const arr = [...set];
    const trimmed = new Set(arr.slice(arr.length - 2000));
    saveReadSet(trimmed);
    return;
  }
  saveReadSet(set);
}
