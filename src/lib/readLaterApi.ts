const SITE_URL = 'https://rss-pardoena.netlify.app';
export const TOKEN_KEY = 'rl-token';

export const READ_LATER_API = `${SITE_URL}/.netlify/functions/read-later`;
const READ_LATER_ITEM_API = `${SITE_URL}/.netlify/functions/read-later-item`;

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function apiItem(method: string, id: number): Promise<Response> {
  return fetch(READ_LATER_ITEM_API, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
    body: JSON.stringify({ id }),
  });
}

export function escHtml(str: string): string {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
