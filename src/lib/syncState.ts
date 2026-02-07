export function getUserId(): string | null {
  try {
    const user = localStorage.getItem('gotrue.user');
    if (!user || user === 'null') return null;
    const parsed = JSON.parse(user);
    return parsed.id || null;
  } catch {
    return null;
  }
}

type SyncAction = 'add_read' | 'remove_read' | 'add_bookmark' | 'remove_bookmark';

function syncAction(action: SyncAction, articleId: string): void {
  const userId = getUserId();
  if (!userId) return;

  fetch(`/.netlify/functions/sync-state?userId=${encodeURIComponent(userId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, articleId }),
  }).catch(() => {});
}

export async function pullRemoteState(): Promise<{
  readArticles: string[];
  bookmarks: string[];
} | null> {
  const userId = getUserId();
  if (!userId) return null;

  try {
    const response = await fetch(
      `/.netlify/functions/sync-state?userId=${encodeURIComponent(userId)}`,
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export const syncRead = {
  add: (articleId: string) => syncAction('add_read', articleId),
  remove: (articleId: string) => syncAction('remove_read', articleId),
};

export const syncBookmark = {
  add: (articleId: string) => syncAction('add_bookmark', articleId),
  remove: (articleId: string) => syncAction('remove_bookmark', articleId),
};
