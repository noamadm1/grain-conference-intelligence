import { useEffect, useMemo, useState } from 'react'
import { fetchAssignments, fetchUpcoming } from '../lib/data'
import { dateRange, nextQuarterRange, quarterOf, regionLabel, usd } from '../lib/format'
import { REC, medianCostPerIcp, recommendation } from '../lib/planning'
import Assignees from '../components/Assignees.jsx'

// Quick filters, worded the way a salesperson would say them. Several can be combined (AND).
const [nqStart, nqEnd] = nextQuarterRange()
const FILTERS = [
  { key: 'nextq', label: `הרבעון הבא (${quarterOf(nqStart)})`, test: (e) => new Date(e.start_date) >= nqStart && new Date(e.start_date) < nqEnd },
  { key: 'europe', label: 'אירופה', test: (e) => e.series?.region === 'europe' },
  { key: 'cheap', label: 'מתחת ל-$2,000', test: (e) => e.ticket_cost_usd != null && Number(e.ticket_cost_usd) < 2000 },
  { key: 'score60', label: 'ציון 60+', test: (e) => Number(e.icp_score) >= 60 },
]

const scoreClass = (s) => (s >= 60 ? 'hi' : s >= 55 ? 'mid' : 'lo')

export default function Conferences() {
  const [editions, setEditions] = useState(null)
  const [assignments, setAssignments] = useState(null)
  const [active, setActive] = useState(new Set())
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([fetchUpcoming(), fetchAssignments()])
      .then(([e, a]) => {
        setEditions(e)
        setAssignments(a)
      })
      .catch((e) => setError(e.message))
  }, [])

  const median = useMemo(() => (editions ? medianCostPerIcp(editions) : null), [editions])

  const shown = useMemo(() => {
    if (!editions) return []
    const tests = FILTERS.filter((f) => active.has(f.key)).map((f) => f.test)
    return editions.filter((e) => tests.every((t) => t(e))).sort((a, b) => Number(b.icp_score ?? -1) - Number(a.icp_score ?? -1))
  }, [editions, active])

  const toggle = (k) =>
    setActive((s) => {
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

      <div className="chips" style={{ marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip ${active.has(f.key) ? 'on' : ''}`} onClick={() => toggle(f.key)}>
            {f.label}
          </button>
        ))}
        {active.size > 0 && (
          <button className="ghost" onClick={() => setActive(new Set())}>
            נקה
          </button>
        )}
      </div>

      {error && <div className="notice bad">שגיאה בטעינה: {error}</div>}
      {!editions && !error && <p className="sub">טוען…</p>}
      {editions && (
        <p className="sub small" style={{ marginBottom: 12 }}>
          {shown.length} מתוך {editions.length} כנסים
        </p>
      )}

      <div className="stack">
        {editions && shown.length === 0 && <div className="card sub">אין כנסים שעונים על כל הסינונים. נסה להסיר אחד.</div>}
        {shown.map((e) => {
          const rec = REC[recommendation(e, median)]
          const score = e.icp_score == null ? null : Math.round(Number(e.icp_score))
          return (
            <article key={e.id} className="card conf">
              <div className={`score ${score == null ? 'lo' : scoreClass(score)}`} title="ציון התאמת קהל ל-ICP">
                {score ?? '—'}
              </div>
              <div>
                <div className="row">
                  <h2 style={{ margin: 0 }}>{e.series?.name}</h2>
                  {rec && <span className={`tag ${rec.tone}`}>{rec.label}</span>}
                </div>
                <p style={{ margin: '4px 0 8px' }}>{e.icp_explanation ?? 'אין עדיין הסבר לציון'}</p>
                <div className="meta">
                  <span>{dateRange(e.start_date, e.end_date)}</span>
                  <span>
                    {e.city}, {e.country}
                  </span>
                  <span>{regionLabel(e.series?.region)}</span>
                  <span>{usd(e.ticket_cost_usd)}</span>
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
