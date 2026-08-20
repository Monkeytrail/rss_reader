# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Astro dev server
- `npm run build` — build the static site to `dist/` (this is also what Netlify runs)
- `npm run preview` — preview the production build locally
- `npx tsx scripts/seed-feeds.ts` — one-off bootstrap that inserts feeds from a local `src/data/feeds.json` into the `feeds` table in Turso. That JSON file no longer exists in the repo (the `feeds` table in Turso is now the sole source of truth for the feed list), so this script only matters when re-seeding a fresh database.

There is no lint or test script configured.

## Architecture

**Static site, build-time content fetching.** This is an Astro site with `output: 'static'`. Articles are NOT fetched at request time — `fetchAllFeeds()` in `src/lib/feeds.ts` pulls and parses every RSS/Atom feed during `astro build` and the results are baked into the static HTML. This means the site only shows new articles after a rebuild, which is why rebuilds are triggered from several places:
- A scheduled Netlify function, `netlify/functions/refresh-feeds-scheduled.ts` (cron `0 8 * * *`), calls `runFeedRefresh()` in `src/lib/discovery/refresh-feeds.ts`.
- `netlify/functions/refresh-feeds-manual.ts` is a bearer-token-protected backup endpoint meant to be hit by an external cron (GitHub Actions) in case Netlify's own scheduler misses a run.
- `netlify/functions/trigger-rebuild.ts` POSTs to the Netlify `BUILD_HOOK_URL` to kick off a fresh static build (used by the manual "refresh" button in the UI).

**Turso (libsql) is the single database** for everything the app persists — there's no separate DB per feature. Schema lives entirely in `src/lib/discovery/db.ts`'s `initSchema()`: idempotent `CREATE TABLE IF NOT EXISTS` statements plus `ALTER TABLE ... ADD COLUMN` wrapped in try/catch for new columns. There are no migration files — schema changes are made directly in `initSchema()`, and every code path that touches the DB calls `initSchema()` first. Tables cover: the feed list (`feeds`), the content-discovery pipeline (`discovered_domains`, `domain_events`, `discovery_runs`), per-user state (`user_read_articles`, `user_bookmarks`), feed uptime (`feed_health_snapshots`, `feed_refresh_log`), and the read-later queue (`read_later`).

**Auth is client-side only (Netlify Identity).** `/login` uses the Netlify Identity widget; there's no server session. The logged-in user's id is read straight out of `localStorage` (`gotrue.user`) and passed as a plain field in POST bodies to Netlify functions like `sync-state` — there's no server-side verification of that id. Separately, a few endpoints (`read-later*.ts`, `refresh-feeds-manual.ts`) are protected instead by a shared bearer token, for automation/backup access rather than end-user auth.

**Client state is local-first, synced opportunistically.** Read/bookmark status lives in `localStorage` via `createStoredSet()` (`src/lib/localStorageSet.ts`) and is updated synchronously in `readStatus.ts` / `bookmarks.ts`. Every mutation also fires an async, best-effort POST to `/.netlify/functions/sync-state` (`src/lib/syncState.ts`) keyed by user id; `pullRemoteState()` merges server state back in on load. Treat local storage as the source of truth for UI responsiveness and Turso as the sync target, not the other way around.

**Feed discovery pipeline** (`src/lib/discovery/`): pulls trending links from Hacker News, Lobsters, and dev.to (`sources/*.ts`), extracts and scores domains (`scorer.ts` — cumulative score across crawl cycles, cross-source bonus, promotes a domain to `suggested` past a threshold), then probes candidate domains for an actual feed (`feed-discoverer.ts`). Suggestions surface on `/discover` for manual approval into the `feeds` table.

**YouTube feeds get special handling** in `src/lib/feeds.ts`: detected by URL pattern, parsed with custom XML fields (`yt:videoId`, `media:thumbnail`) to build video cards, and filtered for Shorts using a cheap sync regex/URL check first, falling back to an HTTP HEAD-style check (`isYouTubeShortHttp`) only for videos that need it.

**Category ordering** for the homepage/nav is controlled by the `CATEGORY_ORDER` array in `src/lib/feeds.ts` — categories not listed there sort to the end. Update that array, not component code, when reordering categories.

## Design system

Styling follows the **Pastis Design System**, dark-mode only, wired through a two-layer token bridge:
- `src/styles/pastis-tokens.css` holds the raw Pastis palette (`--pastis-*`), copied by value (not `@import`-ed) from the external `pastis-design-system` repo so the build stays self-contained. Don't hand-edit these to match a one-off need — pull the real value from Pastis and add it here.
- `src/styles/global.css` maps those onto semantic tokens (`--color-bg`, `--color-text`, `--color-accent`, `--color-border`, spacing/font scale, etc.) at the top of the file, then a global reset and base/layout rules follow.

Components should always style against the **semantic `--color-*` tokens**, never reach for `--pastis-*` directly — that's the existing convention across every component. Font is Inter (Google Fonts CDN, weights 400/500/600), loaded once in `global.css`.

Light mode was deliberately removed (see commit `ad129a7`) in favor of dark-only — there's no `prefers-color-scheme` or `data-theme` handling left in `global.css`/`Layout.astro`. Two leftovers from before that removal still exist and are easy to mistake for live functionality: `src/components/ThemeToggle.astro` is unused (not imported anywhere), and `src/pages/login.astro` still has its own inline theme-detection/toggle script predating the token bridge — don't extend either without first collapsing them back into the current dark-only setup.
