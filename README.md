# Grain · Conference Intelligence

A conference intelligence tool for Grain's sales team. It follows a rep through the full lifecycle of a conference: **choosing** which events are worth it (an ICP score based on audience fit, kept separate from cost, with a one-line explanation), **planning** (travel clusters, coverage gaps, scheduling conflicts), **capturing leads in the field** (a phone-first mobile form that works offline, with a voice memo that is transcribed and turned into structured fields by AI), and **following up** (a searchable memory of every person met, with fact-based tags such as "time has come", "stuck" and "dormant", plus export to HubSpot).

**Live demo:** https://grain-conferences.netlify.app

The full product spec is in [`PRD.md`](PRD.md) (in Hebrew). It also records what was built, what changed from the original plan and why, and the design system.

## Stack

React 19 + Vite · Supabase (Postgres, Storage, Edge Functions) · OpenAI Whisper + `gpt-4o-mini` · HubSpot Imports API

## Setup

Requires Node.js 20.6+ (the scripts use `node --env-file`).

```bash
git clone <repo-url>
cd <repo>
npm install
```

Create a `.env` file in the project root (see `.env.example`):

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

- The `VITE_` values are public and get bundled into the site.
- `SUPABASE_SERVICE_ROLE_KEY` is used **only** by the scripts below. It has no `VITE_` prefix, so it never reaches the browser bundle. Never commit it.

In the Supabase dashboard → **SQL Editor**, run the SQL files **in order**:

1. `sql/000_base_schema.sql`: tables
2. `sql/001_icp_explanation.sql`: score explanation and breakdown columns
3. `sql/002_screens.sql`: recordings column and bucket, rep assignments

Then load the data:

```bash
npm run seed        # 22 conference series + 36 editions from seed/*.json
npm run seed:demo   # 13 demo people with 20 encounters (idempotent)
npm run score       # compute ICP scores for upcoming editions
npm run dev         # http://localhost:5173
```

`seed` and `score` also have dry-run variants (`seed:dry`, `score:dry`) that write nothing.

## API keys

**API keys are never in the code, in `.env`, or in the build.** Each user enters them on the app's **Settings** screen (הגדרות), and they are stored only in that browser's localStorage:

| Key | Used for | Required |
|---|---|---|
| OpenAI API key | Whisper transcription + `gpt-4o-mini` field extraction | For the AI feature. Without it, recordings are saved and processed later |
| HubSpot Private App token | Automatic lead import | No. Without it, leads can still be exported as CSV |

Each device needs its own keys. Don't enter them on a shared computer.

## Deploy

```bash
npm run build
```

Drag the `dist/` folder onto [Netlify Drop](https://app.netlify.com/drop) (or any static host). The app uses hash-based routing (`#/…`), so no redirect configuration is needed.

**HubSpot sync (optional):** browsers can't call HubSpot directly (CORS), so the import goes through a Supabase Edge Function. In Supabase → Edge Functions → *Deploy a new function* → *Via Editor*, create `hubspot-import` from `supabase/functions/hubspot-import/index.ts` and turn **off** "Verify JWT". The token needs these scopes: `crm.import`, `crm.objects.contacts.write`, `crm.objects.companies.write`, `crm.schemas.contacts.write`.

## Project structure

```
src/
  pages/        One file per screen: Conferences, Planning, Capture (field), People, Person, Export, Settings
  components/   Shared UI (rep assignment chips, AI result card)
  lib/          Logic, mostly pure and framework-free:
                  icp.js / icpDefaults.js   ICP score + explanation sentence
                  planning.js               clusters, coverage gaps, conflicts, recommendations
                  tags.js                   returning-contact tags
                  outbox.js                 offline lead queue (IndexedDB)
                  processing.js / ai.js     background transcription + extraction
                  leadCsv.js / hubspot.js   CSV export and HubSpot import
  styles.css    Design tokens and components (see PRD.md §16)
scripts/        Node scripts: seed.js, seed-demo.js, score.js
seed/           Verified conference data: series.json, editions.json
sql/            Database migrations, run in order
supabase/       Edge Function: hubspot-import (proxy to the HubSpot Imports API)
```

## Notes

- There is no authentication. The anon key can read and write all tables, which is acceptable for an internal tool, but anyone with the site link can change data.
- Demo tags depend on today's date. The demo data is calibrated to late September 2026; re-run `npm run seed:demo` after adjusting its dates if you're demoing later.
