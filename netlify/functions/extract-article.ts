import type { Context } from '@netlify/functions';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const articleUrl = url.searchParams.get('url');

  if (!articleUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const response = await fetch(articleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSSReader/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const html = await response.text();
    const { document } = parseHTML(html);

    // Set documentURI for Readability
    Object.defineProperty(document, 'documentURI', {
      value: articleUrl,
      writable: false,
    });

    const reader = new Readability(document as any);
    const article = reader.parse();

    if (!article) {
      return new Response(
        JSON.stringify({ error: 'Could not extract article content' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const cleanContent = sanitizeHtml(article.content);

    return new Response(
      JSON.stringify({
        title: article.title,
        byline: article.byline,
        content: cleanContent,
        excerpt: article.excerpt,
        siteName: article.siteName,
        length: article.length,
        readingTime: Math.ceil(article.length / 200),
        originalUrl: articleUrl,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
        },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to extract article',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};

function sanitizeHtml(html: string): string {
  const { document } = parseHTML(html);

  document
    .querySelectorAll('script, iframe, object, embed, form, input, button, style')
    .forEach((el: Element) => el.remove());

  document.querySelectorAll('*').forEach((el: Element) => {
    Array.from(el.attributes).forEach((attr) => {
      if (
        attr.name.startsWith('on') ||
        (attr.name === 'href' && attr.value.startsWith('javascript:'))
      ) {
        el.removeAttribute(attr.name);
      }
    });
  });

  document.querySelectorAll('a').forEach((link: HTMLAnchorElement) => {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  });

  return document.body.innerHTML;
}
