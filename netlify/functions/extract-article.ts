import type { Context } from '@netlify/functions';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { errorMessage, jsonResponse } from '../../src/lib/httpResponse';

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const articleUrl = url.searchParams.get('url');

  if (!articleUrl) {
    return jsonResponse({ error: 'Missing url parameter' }, 400);
  }

  try {
    const response = await fetch(articleUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url: articleUrl });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      return jsonResponse({ error: 'Could not extract article content' }, 422);
    }

    const cleanContent = sanitizeHtml(article.content ?? '');

    return jsonResponse(
      {
        title: article.title,
        byline: article.byline,
        content: cleanContent,
        excerpt: article.excerpt,
        siteName: article.siteName,
        length: article.length,
        readingTime: Math.ceil((article.length ?? 0) / 200),
        originalUrl: articleUrl,
      },
      200,
      { 'Cache-Control': 'public, max-age=3600' },
    );
  } catch (error) {
    return jsonResponse({ error: 'Failed to extract article', message: errorMessage(error) }, 500);
  }
};

function sanitizeHtml(html: string): string {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  document
    .querySelectorAll('script, iframe, object, embed, form, input, button, style')
    .forEach((el) => el.remove());

  document.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      if (
        attr.name.startsWith('on') ||
        (attr.name === 'href' && attr.value.startsWith('javascript:'))
      ) {
        el.removeAttribute(attr.name);
      }
    });
  });

  document.querySelectorAll('a').forEach((link) => {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  });

  return document.body.innerHTML;
}
