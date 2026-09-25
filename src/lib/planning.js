// Planning logic (PRD 5 "the recommendation" + PRD 6). These are pure functions over editions and assignments.
// edition: a conference_editions row with series (conference_series) joined in.
// assignments: [{ edition_id, rep_name }]

import { editionRegion } from './format.js'

// Saving per trip avoided: a rough estimate, broken down so the number is defensible (PRD 6).
export const TRIP_COST = { flight: 1000, hotel: 600, perDiem: 300 } // flight + 3 nights hotel ($200 a night) + per diem
export const TRIP_SAVING_USD = TRIP_COST.flight + TRIP_COST.hotel + TRIP_COST.perDiem // $1,900
// Up to 7 days between one conference's end and the next one's start = the same trip (was: under 14, which let
// a 24-day chain count as one trip)
const CLUSTER_MAX_GAP_DAYS = 7
// And the whole trip, from the first conference's start to the last one's end, is at most 12 days. Without it a chain of
// short gaps grows into a trip nobody takes (ITB → PAY360 → Fintech Week London: 5 days apart each, 16 days in total)
const CLUSTER_MAX_SPAN_DAYS = 12

const DAY = 1000 * 60 * 60 * 24
const d = (s) => new Date(s)
// Days counted like the card text ("בתוך N ימים"): both ends included
const spanDays = (first, last) => Math.round((d(last.end_date ?? last.start_date) - d(first.start_date)) / DAY) + 1
const overlaps = (a, b) => d(a.start_date) <= d(b.end_date ?? b.start_date) && d(b.start_date) <= d(a.end_date ?? a.start_date)

// ---- Recommendation: score + cost ----

export const costPerIcp = (e) => {
  const vol = e.icp_breakdown?.icp_volume
  return e.ticket_cost_usd != null && vol ? Number(e.ticket_cost_usd) / vol : null
}

export function medianCostPerIcp(editions) {
  const v = editions.map(costPerIcp).filter((x) => x != null).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

// Four bands by score
export const REC = {
  must: { label: 'מומלץ', tone: 'good' },
  worth: { label: 'שווה לשקול', tone: 'info' },
  nearby: { label: 'רק אם כבר שם', tone: 'warn' },
  skip: { label: 'לא מומלץ', tone: 'bad' },
}

// Score bands (PRD section 5): 60+ must · 50-60 worth considering · 40-50 only if already there · below 40 not recommended.
// A critical-mass penalty always means "not recommended".
export const REC_BANDS = { must: 60, worth: 50, nearby: 40 }

// The recommendation, plus a cost note for "worth considering".
// byCost: 'cheap' | 'expensive' = cost per ICP person vs the median. It doesn't move a conference between bands:
// inside the 50-60 band it's what the decision depends on, so it's shown next to the tag. null when the cost is unknown
// or the band is decided by the score alone.
export function recommendationDetail(e, median) {
  const score = e.icp_score == null ? null : Number(e.icp_score)
  if (score == null) return { key: null, byCost: null }
  if (score < REC_BANDS.nearby || (e.icp_breakdown?.penalty ?? 0) > 0) return { key: 'skip', byCost: null }
  if (score >= REC_BANDS.must) return { key: 'must', byCost: null }
  if (score >= REC_BANDS.worth) {
    const c = costPerIcp(e)
    return { key: 'worth', byCost: c == null || median == null ? null : c < median ? 'cheap' : 'expensive' }
  }
  return { key: 'nearby', byCost: null }
}

export const recommendation = (e, median) => recommendationDetail(e, median).key

export const COST_QUALIFIER = { cheap: 'זול יחסית לקהל', expensive: 'יקר יחסית לקהל' }

// ---- Clusters: same region + up to 7 days between conferences + at most 12 days in total ----
// Built in date order: a conference that would stretch the trip past 12 days starts the next cluster instead

export function findClusters(editions, assignments) {
  const planned = new Set(assignments.map((a) => a.edition_id))
  const byRegion = {}
  for (const e of editions) {
    // The edition's region: a rotating series (Sibos) belongs to the country it's held in that year
    const r = editionRegion(e)
    if (!r) continue
    ;(byRegion[r] ??= []).push(e)
  }

  const clusters = []
  for (const [region, list] of Object.entries(byRegion)) {
    list.sort((a, b) => d(a.start_date) - d(b.start_date))
    let cur = [list[0]]
    const close = () => {
      if (cur.length >= 2) clusters.push({ region, editions: cur })
    }
    for (const e of list.slice(1)) {
      const prev = cur[cur.length - 1]
      const gap = (d(e.start_date) - d(prev.end_date ?? prev.start_date)) / DAY
      if (gap <= CLUSTER_MAX_GAP_DAYS && spanDays(cur[0], e) <= CLUSTER_MAX_SPAN_DAYS) cur.push(e)
      else {
        close()
        cur = [e]
      }
    }
    close()
  }

  return clusters
    .map((c) => {
      const anyPlanned = c.editions.some((e) => planned.has(e.id))
      // A cluster can change a recommendation: "only if already in the area" becomes "worth it" next to a planned conference
      const upgrades = anyPlanned ? c.editions.filter((e) => !planned.has(e.id) && Number(e.icp_score) >= REC_BANDS.nearby && Number(e.icp_score) < REC_BANDS.worth) : []
      return {
        ...c,
        anyPlanned,
        upgrades,
        saving: (c.editions.length - 1) * TRIP_SAVING_USD,
        topScore: Math.max(...c.editions.map((e) => Number(e.icp_score) || 0)),
      }
    })
    // Only clusters worth acting on: something is already planned, or there's a conference worth attending
    .filter((c) => c.anyPlanned || c.topScore >= REC_BANDS.worth)
    .sort((a, b) => b.saving - a.saving || b.topScore - a.topScore)
}

// ---- Coverage gaps: quarter × region with good conferences and nobody assigned ----

const quarterKey = (s) => `${d(s).getFullYear()}-Q${Math.floor(d(s).getMonth() / 3) + 1}`

export function findGaps(editions, assignments, minScore = 60) {
  const planned = new Set(assignments.map((a) => a.edition_id))
  const groups = {}
  for (const e of editions) {
    const k = `${quarterKey(e.start_date)}|${editionRegion(e)}`
    ;(groups[k] ??= []).push(e)
  }
  return Object.entries(groups)
    .map(([k, list]) => {
      const [quarter, region] = k.split('|')
      const good = list.filter((e) => Number(e.icp_score) >= minScore).sort((a, b) => b.icp_score - a.icp_score)
      return { quarter, region, good, covered: list.some((e) => planned.has(e.id)) }
    })
    .filter((g) => g.good.length && !g.covered)
    // Imbalance between effort and potential: the more potential left uncovered, the higher it ranks
    .sort((a, b) => b.good.reduce((s, e) => s + Number(e.icp_score), 0) - a.good.reduce((s, e) => s + Number(e.icp_score), 0))
}

// ---- Conflicts: the same person at two conferences whose dates overlap ----

// candidates: everyone who could take a conference (the rep list). Anyone assigned is added to it
export function findConflicts(editions, assignments, candidates = []) {
  const byId = Object.fromEntries(editions.map((e) => [e.id, e]))
  const assigned = [...new Set(assignments.map((a) => a.rep_name))]
  const reps = [...new Set([...candidates, ...assigned])]
  const busy = (rep, e) => assignments.some((a) => a.rep_name === rep && byId[a.edition_id] && overlaps(byId[a.edition_id], e))

  const conflicts = []
  for (const rep of assigned) {
    const mine = assignments.filter((a) => a.rep_name === rep).map((a) => byId[a.edition_id]).filter(Boolean)
    for (let i = 0; i < mine.length; i++) {
      for (let j = i + 1; j < mine.length; j++) {
        if (overlaps(mine[i], mine[j])) {
          const [a, b] = [mine[i], mine[j]].sort((x, y) => y.icp_score - x.icp_score)
          // Suggest people who are free for the lower-scoring conference
          conflicts.push({ rep, keep: a, move: b, freeReps: reps.filter((r) => r !== rep && !busy(r, b)) })
        }
      }
    }
  }
  return conflicts
}
