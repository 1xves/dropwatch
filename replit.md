# DROPWATCH

A streetwear release tracker that monitors Instagram profiles and extracts upcoming drops, restocks, collabs, and news into a release calendar.

## Architecture

This is a fullstack app with:
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (port 5000)
- **Backend**: Express.js server (port 3000)
- **Database**: Replit PostgreSQL via Drizzle ORM

In development, Vite proxies all `/api/*` requests to the Express server on port 3000. Both run together via `npm run dev` (using `concurrently`).

## Key Files

- `server/index.ts` — Express server entry point
- `server/routes/scrape.ts` — Instagram scraping via Apify + AI extraction via OpenAI
- `server/routes/brands.ts` — CRUD for brands
- `server/routes/posts.ts` — Read posts with brand join
- `server/db.ts` — Drizzle + pg pool setup
- `shared/schema.ts` — Drizzle schema (brands, brand_posts tables; brand_posts includes `extractedListedItems text[]` for AI-extracted product items)
- `src/lib/api/instagram.ts` — Frontend API calls + data transformation helpers
- `src/pages/Index.tsx` — Main dashboard page
- `src/components/` — ReleaseCalendar, UpcomingDrops, AlertsFeed, TrackedBrands, BrandUrlInput

## Environment Variables / Secrets

- `DATABASE_URL` — Replit PostgreSQL (auto-provisioned)
- `APIFY_API_KEY` — Required for Instagram scraping via Apify
- `OPENAI_API_KEY` — Optional; used for AI-powered post extraction (falls back to regex)

## Scripts

- `npm run dev` — Start both Express server + Vite dev server
- `npm run build` — Build frontend + compile server TypeScript
- `npm run start` — Run production build
- `npm run db:push` — Push schema changes to the database

## Release Dedup Logic (`postsToReleases` in `src/lib/api/instagram.ts`)

- Posts ordered by postDate desc, processed through nameKey → rootKey → captionKey → dateKey merge chain
- **Community Day detection**: Only triggers when "community day" appears in the first 3 non-empty caption lines (prevents deep-mention false positives). Post-processing absorbs same-day same-brand releases into the Community Day event card
- **Collab/drop merge**: When a collab and a non-collab share the same brand+date, they merge via dateKey. Drops absorb collabs (replacing items/name/type), collabs fold into drops (items not mixed)
- **Event protection**: Events never merge with non-events in the item-overlap merge step
- **Generic name cleanup**: "Next release : date", "NEW RELEASE" → falls back to first item name or skips
- **Booth/pop-up cleanup**: Event posts with "booth" or "pop-up" in name extract venue from caption
- **Garment summary**: When bullet items are design names (not garment descriptions), they're consolidated to the detected garment type (e.g., "Tees")
- **Price display**: Events skip inline prices (since they bundle multiple items at different price points)

## Migration Notes (Lovable → Replit)

- Supabase replaced with Replit PostgreSQL + Drizzle ORM
- Supabase Edge Functions (`scrape-instagram`, `scrape-all-brands`) ported to Express routes at `/api/scrape/instagram` and `/api/scrape/all-brands`
- Lovable AI gateway replaced with OpenAI API (`gpt-4o-mini`)
- Frontend Supabase client calls replaced with `fetch()` to `/api/*` routes
- `lovable-tagger` removed from Vite config
