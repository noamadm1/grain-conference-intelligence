// Loads seed/series.json → conference_series and seed/editions.json → conference_editions.
//
//   npm run seed        upsert (safe to re-run; rows are matched by id)
//   npm run seed:dry    show what would be sent, write nothing
//
// Env (from .env): VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (falls back to VITE_SUPABASE_ANON_KEY).

import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.argv.includes('--dry-run')

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('✗ Missing VITE_SUPABASE_URL and a key (SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY) in .env')
  process.exit(1)
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('! No SUPABASE_SERVICE_ROLE_KEY — using anon key. Inserts will fail if RLS blocks them.')
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'))

// Read the real column list from PostgREST's OpenAPI spec, so seed keys that
// don't exist in the table are reported and skipped instead of failing the whole batch.
// Returns null if the spec isn't reachable (then rows are sent as-is).
async function fetchColumns() {
  try {
    const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    if (!res.ok) return null
    const spec = await res.json()
    const cols = {}
    for (const [table, def] of Object.entries(spec.definitions ?? {})) {
      cols[table] = new Set(Object.keys(def.properties ?? {}))
    }
    return cols
  } catch {
    return null
  }
}

function fitToColumns(table, rows, columns) {
  if (!columns) return rows
  const allowed = columns[table]
  if (!allowed) throw new Error(`Table "${table}" not found in the database schema`)

  const seedKeys = new Set(rows.flatMap(Object.keys))
  const dropped = [...seedKeys].filter((k) => !allowed.has(k))
  const missing = [...allowed].filter((c) => !seedKeys.has(c))
  if (dropped.length) console.warn(`  ! ${table}: seed fields with no matching column (skipped): ${dropped.join(', ')}`)
  if (missing.length) console.log(`  · ${table}: columns not in seed (left default/null): ${missing.join(', ')}`)

  return rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => allowed.has(k))))
}

async function load(table, rows, columns) {
  console.log(`\n→ ${table}: ${rows.length} rows`)
  const payload = fitToColumns(table, rows, columns)

  if (DRY_RUN) {
    console.log('  (dry run) first row:', JSON.stringify(payload[0], null, 2))
    return
  }

  const { error, count } = await supabase.from(table).upsert(payload, { onConflict: 'id', count: 'exact' })
  if (error) {
    console.error(`  ✗ ${error.message}${error.details ? ` — ${error.details}` : ''}${error.hint ? ` (hint: ${error.hint})` : ''}`)
    process.exit(1)
  }
  console.log(`  ✓ upserted ${count ?? payload.length}`)
}

const series = await readJson('seed/series.json')
const editions = await readJson('seed/editions.json')

// Referential check before touching the DB
const seriesIds = new Set(series.map((s) => s.id))
const orphans = editions.filter((e) => !seriesIds.has(e.series_id)).map((e) => e.id)
if (orphans.length) {
  console.error(`✗ Editions reference unknown series: ${orphans.join(', ')}`)
  process.exit(1)
}

const columns = await fetchColumns()
if (!columns) console.warn('! Could not read table schema — sending seed fields as-is.')

// Series first: editions reference them via series_id
await load('conference_series', series, columns)
await load('conference_editions', editions, columns)

console.log(DRY_RUN ? '\nDry run done — nothing written.' : '\nDone.')
