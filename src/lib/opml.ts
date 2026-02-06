import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';

interface OPMLOutline {
  '@_text'?: string;
  '@_title'?: string;
  '@_xmlUrl'?: string;
  '@_type'?: string;
  outline?: OPMLOutline | OPMLOutline[];
}

interface FeedFromOPML {
  title: string;
  url: string;
  category: string;
  categorySlug: string;
}

export async function parseOPMLFiles(): Promise<FeedFromOPML[]> {
  const opmlDir = join(process.cwd(), 'public', 'opml');
  const feeds: FeedFromOPML[] = [];

  let files: string[];
  try {
    files = await readdir(opmlDir);
  } catch {
    return feeds;
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  for (const file of files) {
    if (!file.endsWith('.opml')) continue;

    try {
      const content = await readFile(join(opmlDir, file), 'utf-8');
      const parsed = parser.parse(content);
      const body = parsed.opml?.body;

      if (body?.outline) {
        extractFeeds(body.outline, feeds, 'Uncategorized', 'uncategorized');
      }
    } catch (error) {
      console.error(`Failed to parse ${file}:`, error);
    }
  }

  return feeds;
}

function extractFeeds(
  outline: OPMLOutline | OPMLOutline[],
  feeds: FeedFromOPML[],
  currentCategory: string,
  currentSlug: string,
): void {
  const outlines = Array.isArray(outline) ? outline : [outline];

  for (const item of outlines) {
    if (item['@_xmlUrl']) {
      feeds.push({
        title: item['@_title'] || item['@_text'] || 'Untitled',
        url: item['@_xmlUrl'],
        category: currentCategory,
        categorySlug: currentSlug,
      });
    } else if (item.outline) {
      const categoryName = item['@_title'] || item['@_text'] || 'Uncategorized';
      const categorySlug = slugify(categoryName);
      extractFeeds(item.outline, feeds, categoryName, categorySlug);
    }
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
