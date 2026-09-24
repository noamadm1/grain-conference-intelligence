import { useEffect, useMemo, useState } from 'react'
import { fetchAssignments, fetchIcpSettings, fetchUpcoming } from '../lib/data'
import { REGION_LABELS, dateRange, editionRegion, nextQuarterRange, quarterOf, regionLabel, usd } from '../lib/format'
import { REC, medianCostPerIcp, recommendation } from '../lib/planning'
import { ICP_DEFAULTS } from '../lib/icpDefaults'
import Assignees from '../components/Assignees.jsx'
import ScoreInfo from '../components/ScoreInfo.jsx'

// Filters, worded the way a salesperson would say them.
// Within a group the choices are OR (Europe or Asia), between groups AND (Europe and "must").
const REGIONS = ['europe', 'north-america', 'apac', 'middle-east', 'africa']
const RECS = ['must', 'worth', 'nearby', 'skip']
const [nqStart, nqEnd] = nextQuarterRange()
const inNextQuarter = (e) => new Date(e.start_date) >= nqStart && new Date(e.start_date) < nqEnd

const scoreClass = (s) => (s >= 60 ? 'hi' : s >= 55 ? 'mid' : 'lo')
const toNum = (s) => (s === '' ? null : Number(s))

export default function Conferences() {
  const [editions, setEditions] = useState(null)
  const [assignments, setAssignments] = useState(null)
  const [points, setPoints] = useState(ICP_DEFAULTS.points)
  const [error, setError] = useState(null)

  const [regions, setRegions] = useState(new Set())
  const [recs, setRecs] = useState(new Set())
  const [nextQ, setNextQ] = useState(false)
  const [costMin, setCostMin] = useState('')
  const [costMax, setCostMax] = useState('')

  useEffect(() => {
    Promise.all([fetchUpcoming(), fetchAssignments()])
      .then(([e, a]) => {
        setEditions(e)
        setAssignments(a)
      })
      .catch((e) => setError(e.message))
    // Maximum points for the (i) breakdown. If this fails, the defaults are shown
    fetchIcpSettings()
      .then((s) => setPoints(s.points))
      .catch(() => {})
  }, [])

  const median = useMemo(() => (editions ? medianCostPerIcp(editions) : null), [editions])
  const recOf = useMemo(() => new Map((editions ?? []).map((e) => [e.id, recommendation(e, median)])), [editions, median])

  const min = toNum(costMin)
  const max = toNum(costMax)
  const costActive = min != null || max != null

  // skip: leave one group out, so each chip's count shows what you'd get by adding it
  const passes = (e, skip) => {
    if (skip !== 'region' && regions.size && !regions.has(editionRegion(e))) return false
    if (skip !== 'rec' && recs.size && !recs.has(recOf.get(e.id))) return false
    if (nextQ && !inNextQuarter(e)) return false
    if (costActive) {
      const c = e.ticket_cost_usd == null ? null : Number(e.ticket_cost_usd)
      if (c == null) return false // Unknown cost can't be shown as inside a range
      if (min != null && c < min) return false
      if (max != null && c > max) return false
    }
    return true
  }

  const shown = (editions ?? []).filter((e) => passes(e)).sort((a, b) => Number(b.icp_score ?? -1) - Number(a.icp_score ?? -1))
  const countFor = (group, test) => (editions ?? []).filter((e) => passes(e, group) && test(e)).length

  const activeCount = regions.size + recs.size + (nextQ ? 1 : 0) + (costActive ? 1 : 0)
  const clearAll = () => {
    setRegions(new Set())
    setRecs(new Set())
    setNextQ(false)
    setCostMin('')
    setCostMax('')
  }
  const toggleIn = (setter) => (k) =>
    setter((s) => {
      const n = new Set(s)
      n.has(k) ? n.delete(k) : n.add(k)
      return n
    })

  return (
    <main className="page">
      <div className="page-head">
        <h1>מאגר הכנסים</h1>
        <p className="sub">ממוין לפי התאמת קהל ל-ICP. העלות מוצגת בנפרד.</p>
      </div>

      <section className="card tight filters" aria-label="סינון">
        <div className="filter-row">
          <span className="filter-label">המלצה</span>
          <div className="chips">
            {RECS.map((k) => (
              <button key={k} className={`chip ${recs.has(k) ? 'on' : ''}`} aria-pressed={recs.has(k)} onClick={() => toggleIn(setRecs)(k)}>
                {REC[k].label} <span className="chip-count">{countFor('rec', (e) => recOf.get(e.id) === k)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="filter-row">
          <span className="filter-label">אזור</span>
          <div className="chips">
            {REGIONS.map((r) => (
              <button key={r} className={`chip ${regions.has(r) ? 'on' : ''}`} aria-pressed={regions.has(r)} onClick={() => toggleIn(setRegions)(r)}>
                {REGION_LABELS[r]} <span className="chip-count">{countFor('region', (e) => editionRegion(e) === r)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="filter-row">
          <span className="filter-label">עלות כרטיס</span>
          <div className="cost-range">
            <input type="number" inputMode="numeric" min="0" step="100" placeholder="מ-$" aria-label="עלות מינימלית בדולרים" value={costMin} onChange={(e) => setCostMin(e.target.value)} />
            <span className="sub">עד</span>
            <input type="number" inputMode="numeric" min="0" step="100" placeholder="עד $" aria-label="עלות מקסימלית בדולרים" value={costMax} onChange={(e) => setCostMax(e.target.value)} />
          </div>
          <span className="filter-label when">מתי</span>
          <button className={`chip ${nextQ ? 'on' : ''}`} aria-pressed={nextQ} onClick={() => setNextQ((v) => !v)}>
            הרבעון הבא ({quarterOf(nqStart)})
          </button>
        </div>
        {min != null && max != null && min > max && <p className="small" style={{ color: 'var(--warn)' }}>העלות המינימלית גבוהה מהמקסימלית.</p>}

        <div className="filter-foot">
          <span className="sub small">
            {editions ? `${shown.length} מתוך ${editions.length} כנסים` : ''}
            {activeCount > 0 && ` · ${activeCount} סינונים פעילים`}
          </span>
          {activeCount > 0 && (
            <button className="ghost small" onClick={clearAll}>
              נקה הכל
            </button>
          )}
        </div>
      </section>

      {error && <div className="notice bad">שגיאה בטעינה: {error}</div>}
      {!editions && !error && <p className="sub">טוען…</p>}

      <div className="stack">
        {editions && shown.length === 0 && <div className="card sub">אין כנסים שעונים על כל הסינונים. נסה להסיר אחד.</div>}
        {shown.map((e) => {
          const rec = REC[recOf.get(e.id)]
          const score = e.icp_score == null ? null : Math.round(Number(e.icp_score))
          const name = e.series?.name ?? e.id
          return (
            <article key={e.id} className="card conf">
              <div className="conf-score">
                <div className={`score ${score == null ? 'lo' : scoreClass(score)}`} title="ציון התאמת קהל ל-ICP">
                  {score ?? '—'}
                </div>
                <ScoreInfo breakdown={e.icp_breakdown} points={points} />
              </div>

              <div className="conf-body">
                <div className="conf-title">
                  <h2>
                    {e.series?.website ? (
                      <a href={e.series.website} target="_blank" rel="noopener noreferrer">
                        {name}
                        <span className="ext" aria-hidden="true">↗</span>
                        <span className="visually-hidden"> (נפתח בלשונית חדשה)</span>
                      </a>
                    ) : (
                      name
                    )}
                  </h2>
                  {rec && <span className={`tag ${rec.tone}`}>{rec.label}</span>}
                </div>

                <p className="conf-why">{e.icp_explanation ?? 'אין עדיין הסבר לציון'}</p>

                <div className="conf-meta">
                  <span>{dateRange(e.start_date, e.end_date)}</span>
                  <span>
                    {e.city}, {e.country}
                  </span>
                  <span>{regionLabel(editionRegion(e))}</span>
                  <span className="cost">{usd(e.ticket_cost_usd)}</span>
                  {e.attendees?.value && (
                    <span title={e.attendees.sources?.join(' · ') || undefined}>
                      ~{Number(e.attendees.value).toLocaleString('en-US')} משתתפים
                      {e.attendees.spread > 0.3 ? ' ⚠️' : ''}
                    </span>
                  )}
                </div>

                <Assignees editionId={e.id} assignments={assignments} onChange={setAssignments} />
              </div>
            </article>
          )
        })}
      </div>
    </main>
  )
}
