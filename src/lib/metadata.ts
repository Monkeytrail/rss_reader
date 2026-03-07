export interface Metadata {
  title: string;
  description: string;
  image_url: string;
  source_type: 'article' | 'youtube' | 'other';
  yt_channel?: string;
  yt_duration?: string;
}

const EMPTY: Metadata = {
  title: '',
  description: '',
  image_url: '',
  source_type: 'article',
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'");
}

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2];
      return u.searchParams.get('v');
    }
  } catch {
    // ignore
  }
  return null;
}

function isYouTubeUrl(url: string): boolean {
  return extractYouTubeId(url) !== null;
}

async function fetchYouTubeMetadata(url: string): Promise<Metadata> {
  const videoId = extractYouTubeId(url);
  const fallbackThumbnail = videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : '';

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`oEmbed ${res.status}`);

    const data = await res.json();
    return {
      title: data.title || '',
      description: '',
      image_url: data.thumbnail_url || fallbackThumbnail,
      source_type: 'youtube',
      yt_channel: data.author_name || '',
    };
  } catch {
    return {
      title: '',
      description: '',
      image_url: fallbackThumbnail,
      source_type: 'youtube',
    };
  }
}

async function fetchArticleMetadata(url: string): Promise<Metadata> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; RSSReader/1.0; +https://rss-pardoena.netlify.app)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return EMPTY;

    // Read only first 50KB — enough for <head>
    const reader = res.body?.getReader();
    if (!reader) return EMPTY;
    let html = '';
    let bytes = 0;
    while (bytes < 51_200) {
      const { done, value } = await reader.read();
      if (done) break;
      html += new TextDecoder().decode(value);
      bytes += value.length;
    }
    reader.cancel().catch(() => {});

    const getMeta = (pattern: RegExp) => {
      const m = html.match(pattern);
      return m ? decodeHtmlEntities(m[1].trim()) : '';
    };

    const title =
      getMeta(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      getMeta(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ||
      getMeta(/<title[^>]*>([^<]+)<\/title>/i);

    const description =
      getMeta(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
      getMeta(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ||
      getMeta(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
      getMeta(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);

    const image_url =
      getMeta(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      getMeta(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    return { title, description, image_url, source_type: 'article' };
  } catch {
    return EMPTY;
  }
}

export async function fetchMetadata(url: string): Promise<Metadata> {
  try {
    if (isYouTubeUrl(url)) return await fetchYouTubeMetadata(url);
    return await fetchArticleMetadata(url);
  } catch {
    return EMPTY;
  }
}
