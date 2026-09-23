// Calculates the ICP score for every upcoming edition and writes it to conference_editions.
// Historical editions are not scored.
//
//   npm run score        calculate and write
//   npm run score:dry    calculate and print, write nothing
//
// The formula settings come from app_settings (key "icp_formula"). If that row is missing, the defaults are written there first.
// When a score changes, a row is added to score_history.

import { createClient } from '@supabase/supabase-js'
import { ICP_DEFAULTS, ICP_SETTINGS_KEY } from '../src/lib/icpDefaults.js'
import { mergeSettings, scoreEdition } from '../src/lib/icp.js'

const DRY_RUN = process.argv.includes('--dry-run')

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('✗ Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

const fail = (what, error) => {
  console.error(`✗ ${what}: ${error.message}`)
  process.exit(1)
}

// 1. Settings
let { data: settingsRow, error } = await supabase.from('app_settings').select('value').eq('key', ICP_SETTINGS_KEY).maybeSingle()
if (error) fail('read app_settings', error)
if (!settingsRow) {
  console.log(`· app_settings has no "${ICP_SETTINGS_KEY}" yet. ${DRY_RUN ? 'Would write' : 'Writing'} the defaults.`)
  if (!DRY_RUN) {
    const { error } = await supabase.from('app_settings').insert({ key: ICP_SETTINGS_KEY, value: ICP_DEFAULTS })
    if (error) fail('write default settings', error)
  }
  settingsRow = { value: ICP_DEFAULTS }
}
const settings = mergeSettings(settingsRow.value)

// 2. Data
const { data: editions, error: eErr } = await supabase
  .from('conference_editions')
  .select('*, series:conference_series(*)')
  .eq('status', 'upcoming')
if (eErr) fail('read editions', eErr)

// Check whether the explanation and breakdown columns exist (sql/001_icp_explanation.sql)
const hasExplanationCols = !(await supabase.from('conference_editions').select('icp_explanation, icp_breakdown').limit(1)).error
if (!hasExplanationCols) {
  console.warn('! Columns icp_explanation / icp_breakdown are missing. Only the score will be saved. Run sql/001_icp_explanation.sql to add them.')
}

// 3. Calculate
const today = new Date()
const results = editions
  .map((e) => ({ e, ...scoreEdition(e, e.series, settings, today) }))
  .sort((a, b) => b.score - a.score)

// 4. Write
let changed = 0
let locked = 0
if (!DRY_RUN) {
  for (const r of results) {
    // An edited score (marked in manually_set) takes priority over the calculated one
    if (r.e.manually_set?.includes('icp_score')) {
      locked++
      continue
    }
    const old = r.e.icp_score == null ? null : Number(r.e.icp_score)
    const patch = { icp_score: r.score }
    if (hasExplanationCols) Object.assign(patch, { icp_explanation: r.explanation, icp_breakdown: r.breakdown })

    const { error } = await supabase.from('conference_editions').update(patch).eq('id', r.e.id)
    if (error) fail(`update ${r.e.id}`, error)

    if (old !== r.score) {
      changed++
      const { error } = await supabase.from('score_history').insert({
        edition_id: r.e.id,
        old_score: old,
        new_score: r.score,
        reason: old == null ? `חישוב ראשוני: ${r.explanation}` : `חישוב מחדש לפי הגדרות הנוסחה: ${r.explanation}`,
      })
      if (error) fail(`score_history ${r.e.id}`, error)
    }
  }
}

// 5. Report
const pad = (s, n) => String(s).padEnd(n)
console.log(`\n${pad('Score', 6)}${pad('Edition', 42)}${pad('A/S/N/G−P', 17)}Explanation`)
for (const r of results) {
  const b = r.breakdown
  const parts = `${Math.round(b.audience)}/${Math.round(b.seniority)}/${Math.round(b.access)}/${Math.round(b.geo_timing)}${b.penalty ? `−${b.penalty}` : ''}`
  console.log(`${pad(r.score, 6)}${pad(r.e.id, 42)}${pad(parts, 17)}${r.explanation}`)
}
console.log(
  DRY_RUN
    ? `\nDry run: ${results.length} editions, nothing written.`
    : `\n✓ ${results.length} editions scored · ${changed} changed (logged to score_history)${locked ? ` · ${locked} skipped (manually_set)` : ''}`,
)
