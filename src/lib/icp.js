// ICP score (PRD section 5). This is a pure function with no I/O.
// The scoring script uses it, and the UI will use it too, so the sliders can recalculate live.
// The score measures audience fit only. Cost is kept separate on purpose.

import { ICP_DEFAULTS } from './icpDefaults.js'
import { editionRegion, regionLabel } from './format.js'

const SEGMENT_LABELS = {
  platforms: 'פלטפורמות',
  payments_psp: 'PSP/תשלומים',
  embedded_fintech: 'פינטק משובץ',
  saas_vertical: 'SaaS ורטיקלי',
  treasury: "טרז'רי",
  travel_wholesale: 'סיטונאי תיירות',
  travel_general: 'תיירות כללית',
  banks: 'בנקים',
  other: 'אחר',
}

// Fill in any value the stored settings leave out, so an older row in app_settings still works after new fields are added.
export function mergeSettings(stored = {}) {
  const d = ICP_DEFAULTS
  return {
    ...d,
    ...stored,
    points: { ...d.points, ...stored.points },
    // Replaced whole, not merged: a stored segment set is a full definition, and a merge would bring back removed segments
    segment_weights: stored.segment_weights ?? d.segment_weights,
    access: { ...d.access, ...stored.access },
    geo: { ...d.geo, ...stored.geo },
    mass_penalty: stored.mass_penalty ?? d.mass_penalty,
  }
}

const round1 = (n) => Math.round(n * 10) / 10

// Core ICP = segments with weight at least 0.85 (today: platforms and PSPs)
const isCoreSegment = (s, k) => (s.segment_weights[k] ?? 0) >= 0.85
const coreShareOf = (mix, s) => Object.entries(mix).reduce((sum, [k, p]) => sum + (p > 0 && isCoreSegment(s, k) ? p : 0), 0)

// "א, ב וג" — Hebrew list: the last item takes ו as a prefix
const listHe = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ו${items.at(-1)}`)

// Reasons behind a recommendation, for the (i) popover: facts only, no points.
// ok: true = ✓ (the component is strong), false = ⚠ (weak). Strong = at least ~60% of what the component can give,
// judged on the fact shown in the line, not on the fit-scaled points:
//   audience: at least half the attendees are core ICP (the number in the line; same bar as "strong ICP")
//   seniority: at least 60% of the cap (40% decision makers)
//   access: at least 60% of the access points (the tools exist, whatever the audience)
// The audience line comes first, marked key: 'audience': it's half the score, whichever way it goes. Then ✓, then ⚠.
export function scoreReasons(edition, series, s) {
  const core = coreShareOf(series.audience_mix ?? {}, s)
  const pct = series.seniority_pct ?? 0
  const a = s.access
  const access =
    (series.has_attendee_list ? a.attendee_list : 0) +
    (series.has_meeting_system ? a.meeting_system : 0) +
    (series.has_expo_floor ? a.expo_floor : 0) +
    ((edition.duration_days ?? 0) >= a.long_event_min_days ? a.long_event : 0) +
    (series.has_evening_events ? a.evening_events : 0)
  const region = editionRegion({ ...edition, series })
  const inFocus = s.geo.focus_regions.includes(region)
  const missingTools = [!series.has_attendee_list && 'רשימת משתתפים', !series.has_meeting_system && 'מערכת פגישות'].filter(Boolean)

  const audience =
    core === 0
      ? { key: 'audience', ok: false, text: 'כמעט אין לקוחות פוטנציאליים בקהל' }
      : core >= 50
        ? { key: 'audience', ok: true, text: `${core}% מהמשתתפים הם לקוחות פוטנציאליים` }
        : { key: 'audience', ok: false, text: `רק ${core}% מהמשתתפים הם לקוחות פוטנציאליים` }

  const out = []

  if (access >= s.points.access * 0.6) {
    out.push({ ok: true, text: 'אפשר לקבוע פגישות מראש' })
    if (!series.has_attendee_list) out.push({ ok: false, text: 'אין רשימת משתתפים מראש' })
  } else {
    out.push({ ok: false, text: missingTools.length ? `קשה לקבוע פגישות מראש: אין ${listHe(missingTools)}` : 'קשה לקבוע פגישות מראש' })
  }

  out.push({ ok: inFocus, text: `${regionLabel(region)} — ${inFocus ? 'שוק שאנחנו מתמקדים בו' : 'לא שוק שאנחנו מתמקדים בו כרגע'}` })

  const seniorityOk = Math.min(1, pct / s.seniority_cap_pct) >= 0.6
  out.push({ ok: seniorityOk, text: seniorityOk ? `${pct}% מהמשתתפים בתפקידים בכירים` : `רק ${pct}% בתפקידים בכירים` })

  const penalty = edition.icp_breakdown?.penalty ?? 0
  const volume = edition.icp_breakdown?.icp_volume
  if (penalty > 0) out.push({ ok: false, text: `קהל קטן מדי: רק כ-${Number(volume).toLocaleString('en-US')} לקוחות פוטנציאליים בכל הכנס` })

  return [audience, ...out.filter((r) => r.ok), ...out.filter((r) => !r.ok)]
}

export function scoreEdition(edition, series, settings) {
  const s = settings
  const mix = series.audience_mix ?? {}

  // A. Audience quality: fit = Σ (segment share × segment weight)
  const fit = Object.entries(mix).reduce((sum, [seg, pct]) => sum + ((pct ?? 0) / 100) * (s.segment_weights[seg] ?? 0), 0)
  const audience = fit * s.points.audience

  // B. Seniority, limited to its maximum points
  const seniorityPct = series.seniority_pct ?? 0
  const seniority = Math.min(s.points.seniority, (seniorityPct / s.seniority_cap_pct) * s.points.seniority)

  // C. Meeting access
  const a = s.access
  const longEvent = (edition.duration_days ?? 0) >= a.long_event_min_days
  const access =
    (series.has_attendee_list ? a.attendee_list : 0) +
    (series.has_meeting_system ? a.meeting_system : 0) +
    (series.has_expo_floor ? a.expo_floor : 0) +
    (longEvent ? a.long_event : 0) +
    (series.has_evening_events ? a.evening_events : 0)

  // D. Geography: focus market yes/no. No timing: every conference in the DB is within a year, so it doesn't differentiate
  // The edition's region, not the series': a rotating series (Sibos) is scored by the country it's held in that year
  const inFocusRegion = s.geo.focus_regions.includes(editionRegion({ ...edition, series }))
  const geo = inFocusRegion ? s.points.geo : 0

  // E. Critical mass: penalty only
  const attendees = edition.attendees?.value ?? null
  const volume = attendees == null ? null : attendees * fit
  // If the attendee count is unknown, don't apply a penalty. We don't penalize missing data we can't measure.
  const band = volume == null ? null : s.mass_penalty.find((b) => volume >= b.min_volume)
  const penalty = band?.penalty ?? 0

  // Seniority, access and geography are worth more when there are relevant people to meet: partly scaled by fit.
  // score = audience + (seniority + access + geo) × (floor + (1 − floor) × fit) − penalty
  const floor = Math.min(1, Math.max(0, s.context_fit_floor ?? 1))
  const scale = floor + (1 - floor) * fit

  const raw = audience + (seniority + access + geo) * scale - penalty
  const score = Math.max(0, Math.round(raw))

  // Components as they count in the score (after scaling), so they add up to it. The unscaled values are kept in "unscaled".
  const breakdown = {
    audience: round1(audience),
    seniority: round1(seniority * scale),
    access: round1(access * scale),
    geo: round1(geo * scale),
    unscaled: { seniority: round1(seniority), access: round1(access), geo: round1(geo) },
    penalty,
    fit: round1(fit * 100) / 100,
    icp_volume: volume == null ? null : Math.round(volume),
  }

  return { score, breakdown, explanation: explain({ fit, seniority, access, penalty, volume, inFocusRegion, mix, seniorityPct, series }, s) }
}

// One short sentence: up to 2 strengths, then up to 2 weaknesses.
// It only describes facts from the calculation. It doesn't recommend anything.
function explain(x, s) {
  const pros = []
  const cons = []

  // The wording is based on the share of the core ICP (segments with weight at least 0.85: platforms and PSPs), not on fit.
  // Otherwise a conference with a large non-core audience would be described as "strong ICP".
  const entries = Object.entries(x.mix).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1])
  const isCore = ([k]) => isCoreSegment(s, k)
  const core = entries.filter(isCore)
  const coreShare = coreShareOf(x.mix, s)
  const topCore = core[0]
  // "other" is left out: "only X% ICP" already says it
  const dominantNonCore = entries.find((e) => !isCore(e) && e[0] !== 'other' && e[1] >= 40)
  const label = (k) => SEGMENT_LABELS[k] ?? k
  // Name every core segment present: "(43% PSP/תשלומים + פלטפורמות)"
  const topCoreText = topCore ? ` (${coreShare}% ${core.map(([k]) => label(k)).join(' + ')})` : ''

  if (x.penalty > 0) cons.push(`רק כ-${Math.round(x.volume).toLocaleString('en-US')} אנשי ICP (עונש מסה −${x.penalty})`)

  if (coreShare >= 50) pros.push(`קהל ICP חזק${topCoreText}`)
  else if (coreShare >= 25) pros.push(`קהל ICP בינוני${topCoreText}`)
  else cons.push(`רק ${coreShare}% מהקהל ב-ICP`)
  if (dominantNonCore) cons.push(`${dominantNonCore[1]}% מהקהל ${label(dominantNonCore[0])}`)

  if (x.access >= s.points.access * 0.8) pros.push('ניתן לתאם פגישות מראש')
  else if (!x.series.has_attendee_list) cons.push('אין רשימת משתתפים מראש')
  else if (!x.series.has_meeting_system) cons.push('אין מערכת קביעת פגישות')

  if (x.seniority >= s.points.seniority * 0.75) pros.push(`בכירות גבוהה (${x.seniorityPct}%)`)
  else if (x.seniority <= s.points.seniority * 0.5) cons.push(`בכירות נמוכה (${x.seniorityPct}%)`)

  if (!x.inFocusRegion) cons.push('מחוץ לשווקי הפוקוס')

  const p = pros.slice(0, 2).join(', ')
  const c = cons.slice(0, 2).join(', ')
  if (p && c) return `${p}; אבל ${c}`
  return p || c
}
