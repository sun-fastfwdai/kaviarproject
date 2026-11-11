# Kaviar

Operator console for the Kaviar team: every brand's Shopify store and Meta ad account, synced into one database, with the growth screens on top (Performance, Ad signals, Meta Ads, Shopify data, Data sync).

Brands never log in. Only the Kaviar team does.

The public landing page lives at `/`. Its **Book a call** form saves enquiries to the `leads` table, which the team works through on **Leads** in the console.

## Stack

- Next.js 16 (App Router, Cache Components, Partial Prerendering), React 19, TypeScript
- Postgres + Drizzle ORM (local Postgres in dev, Neon or any Postgres in production)
- Shopify Admin GraphQL API `2026-10` — OAuth with expiring offline tokens, bulk operations, webhooks
- Meta Marketing API `v26.0` — Facebook Login, ad-level daily insights
- Design system ported from the Figma boards (`src/app/globals.css`), Phosphor icons

## Run it locally

```bash
npm install
cp .env.example .env.local        # fill SESSION_SECRET, TOKEN_ENCRYPTION_KEY, CRON_SECRET (openssl rand -base64 32)
createdb kaviar                   # or point DATABASE_URL at any Postgres
npm run db:migrate
npm run db:seed                   # optional: a sample brand with realistic Shopify + Meta data
npm run dev                       # http://localhost:3000
```

The first visit to `/login` creates the owner account. Add teammates with:

```bash
npm run team:add -- --email jina@kaviar.ai --name Jina    # prints a one-time password
```

## Supabase

Use the pooler connection string with full certificate verification:

```
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=certs/supabase-ca.crt
```

`certs/supabase-ca.crt` is Supabase's public root CA (Project Settings → Database → SSL Configuration).
Migration `0002_enable_rls` turns on row-level security with no policies, so Supabase's REST API can't read
any table; the app connects as the owner and isn't affected.

## Connect Shopify

1. In the Shopify Dev Dashboard, create an app. Set its redirect URL to `{APP_URL}/api/shopify/callback`
   and its app URL to `{APP_URL}/api/shopify/install`.
2. Access scopes: `read_orders, read_all_orders, read_products, read_inventory, read_customers`.
   `read_all_orders` (history older than 60 days) and customer data need approval in the app's
   **API access** / **Protected customer data** settings.
3. Compliance webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) → `{APP_URL}/api/shopify/webhooks`.
4. Put the client ID / secret in `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`.
5. In Kaviar: Brands → Add brand → Integrations → enter `brand.myshopify.com` → approve in Shopify.

Kaviar requests **expiring offline tokens** (`expiring=1`): 1-hour access tokens with a rotating 90-day
refresh token. Refreshes happen under a row lock so two syncs never rotate the same token. Order history
comes down through a bulk operation (one JSONL file, no per-query cost limit). After that every sync only reads
what changed (`updated_at` cursor), and order/product webhooks trigger a sync within a couple of minutes.

Webhooks need a public `https` `APP_URL`; locally the hourly pull covers it.

## Connect Meta Ads

1. Create a Meta app with **Facebook Login for Business**. Valid OAuth redirect URI: `{APP_URL}/api/meta/callback`.
2. Permissions: `ads_read`, `business_management`. While the app is in development mode, anyone with a role on the
   app can connect without App Review.
3. Put the app ID / secret in `META_APP_ID` / `META_APP_SECRET`.
4. In Kaviar: Integrations → Connect Meta Ads → pick the brand's ad account.

The login token lasts about 60 days; Integrations shows when it needs reconnecting. Every call is signed with `appsecret_proof`.

## How "verified" numbers work

Meta counts a sale when someone saw or clicked an ad within its attribution window, including orders that
arrived through Google or email. Shopify only knows an order came from Meta if the visit carried Meta UTMs.
Kaviar shows both and makes decisions on the Shopify number.

Paste these URL parameters into every Meta ad so each order also names its campaign and ad:

```
utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&utm_term={{adset.id}}
```

Performance → **Which ad sold what** joins those orders to their line items.

## Sync schedule

- Vercel Cron calls `/api/cron/sync` hourly (`vercel.json`) with `Authorization: Bearer $CRON_SECRET`.
- **Sync now** on any brand page starts one immediately; runs never overlap (unique index on running rows).
- Meta insights for the last 7 days are re-read every run, because Meta restates recent days.

## Layout

```
src/app/(marketing)       Landing page (/) and the Book a call form
src/app/(workspace)       Brands, Leads, Team
src/app/(brand)/brands/[slug]   Overview, Integrations, Ad signals, Performance, Meta Ads, Shopify data, Data sync
src/app/api               Shopify install/callback/webhooks, Meta connect/callback, cron
src/lib/shopify           OAuth, GraphQL client with token refresh, bulk operations, mappers, sync
src/lib/meta              OAuth, Graph client, insights sync
src/lib/sync              Orchestrator (runs, cursors, locking) and order attribution
src/lib/queries           Every SQL query the pages use
```

## Security

- Shopify and Meta tokens are encrypted at rest (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`).
- OAuth state lives in a signed, 10-minute, httpOnly cookie; Shopify callbacks and webhooks are HMAC-verified.
- Sessions are random tokens stored hashed; passwords use scrypt.
- Customers are stored as ids, order counts and spend — no names, emails or addresses.

## Tests

```bash
npm test          # unit tests + an end-to-end sync against a real Postgres (kaviar_test) with Shopify/Meta mocked
npm run typecheck
npm run lint
```
