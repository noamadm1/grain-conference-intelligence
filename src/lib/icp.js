// ICP score (PRD section 5). This is a pure function with no I/O.
// The scoring script uses it, and the UI will use it too, so the sliders can recalculate live.
// The score measures audience fit only. Cost is kept separate on purpose.

import { ICP_DEFAULTS } from './icpDefaults.js'

const SEGMENT_LABELS = {
  payments_psp: 'PSP/תשלומים',
  travel_wholesale: 'סיטונאי תיירות',
  travel_general: 'תיירות כללית',
  treasury: "טרז'רי",
  banks: 'בנקים',
  fintech_general: 'פינטק כללי',
}

// Fill in any value the stored settings leave out, so an older row in app_settings still works after new fields are added.
export function mergeSettings(stored = {}) {
  const d = ICP_DEFAULTS
  return {
    ...d,
    ...stored,
    points: { ...d.points, ...stored.points },
    segment_weights: { ...d.segment_weights, ...stored.segment_weights },
    access: { ...d.access, ...stored.access },
    geo_timing: { ...d.geo_timing, ...stored.geo_timing },
    mass_penalty: stored.mass_penalty ?? d.mass_penalty,
  }
}

const round1 = (n) => Math.round(n * 10) / 10

function addMonths(date, months) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export function scoreEdition(edition, series, settings, today = new Date()) {
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

  // D. Geography and timing
  const g = s.geo_timing
  const inFocusRegion = g.focus_regions.includes(series.region)
  const start = new Date(edition.start_date)
  const inWindow = start >= new Date(today.toDateString()) && start <= addMonths(today, g.timing_window_months)
  const geoTiming = (inFocusRegion ? g.focus_region_points : 0) + (inWindow ? g.timing_points : 0)

  // E. Critical mass: penalty only
  const attendees = edition.attendees?.value ?? null
  const volume = attendees == null ? null : attendees * fit
  // If the attendee count is unknown, don't apply a penalty. We don't penalize missing data we can't measure.
  const band = volume == null ? null : s.mass_penalty.find((b) => volume >= b.min_volume)
  const penalty = band?.penalty ?? 0

  const raw = audience + seniority + access + geoTiming - penalty
  const score = Math.max(0, Math.round(raw))

  const breakdown = {
    audience: round1(audience),
    seniority: round1(seniority),
    access: round1(access),
    geo_timing: round1(geoTiming),
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

  // The wording is based on the share of the core ICP (segments with weight at least 0.85), not on fit.
  // Otherwise a conference with a large bank audience would be described as "strong ICP" (e.g. Sibos).
  const entries = Object.entries(x.mix).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1])
  const isCore = ([k]) => (s.segment_weights[k] ?? 0) >= 0.85
  const core = entries.filter(isCore)
  const coreShare = core.reduce((sum, [, p]) => sum + p, 0)
  const topCore = core[0]
  const dominantNonCore = entries.find((e) => !isCore(e) && e[1] >= 40)
  const label = (k) => SEGMENT_LABELS[k] ?? k
  const topCoreText = topCore ? ` (${topCore[1]}% ${label(topCore[0])})` : ''

  if (x.penalty > 0) cons.push(`רק כ-${Math.round(x.volume).toLocaleString('en-US')} אנשי ICP (עונש מסה −${x.penalty})`)

  if (coreShare >= 50) pros.push(`קהל ICP חזק${topCoreText}`)
  else if (coreShare >= 25) pros.push(`קהל ICP בינוני${topCoreText}`)
  else cons.push(`רק ${coreShare}% מהקהל ב-ICP`)
  if (dominantNonCore) cons.push(`${dominantNonCore[1]}% מהקהל ${label(dominantNonCore[0])}`)

  if (x.access >= 20) pros.push('ניתן לתאם פגישות מראש')
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
