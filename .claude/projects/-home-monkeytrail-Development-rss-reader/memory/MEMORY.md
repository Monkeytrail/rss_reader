# RSS Reader Project Memory

## Tech Stack
- Astro 4.x (static site generation)
- Vanilla CSS with custom properties
- rss-parser + fast-xml-parser
- Netlify hosting with scheduled functions
- PWA with service worker

## Key Architecture Decisions
- Feed results are **cached in-memory** during build (`cachedArticles` in feeds.ts) — reduced build from ~28s to ~8s
- Three feed sources: feeds.json, OPML files, custom feeds (localStorage)
- Custom feeds fetched live via Netlify Function (`fetch-custom-feeds.ts`)
- Theme toggle uses `data-theme` attribute on `<html>`, stored in localStorage

## Build Notes
- Some feeds return 403/404 — this is expected; the build continues gracefully
- Astro generates 10 pages: index, manage, 8 category pages
- Icons generated with Python PIL (no ImageMagick on this system)

## File Structure
- Components: `src/components/` (ArticleCard, Search, ThemeToggle, Header, CategoryNav, AddFeed)
- Pages: `src/pages/` (index, manage, category/[slug])
- Lib: `src/lib/` (feeds.ts, opml.ts, customFeeds.ts, utils.ts)
- Netlify functions: `netlify/functions/` (scheduled-build, fetch-feed-info, fetch-custom-feeds)
