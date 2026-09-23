import { useEffect, useMemo, useState } from 'react'
import { addAssignment, fetchAssignments, fetchUpcoming, removeAssignment } from '../lib/data'
import { dateRange, monthLabel, regionLabel, usd } from '../lib/format'
import { FLIGHT_SAVING_USD, findClusters, findConflicts, findGaps } from '../lib/planning'
import Assignees from '../components/Assignees.jsx'

// Planning view (PRD 6): "what needs a decision from me right now?"
// Conclusions on top (3-4 action cards) and the timeline behind a button. The system shows, the manager assigns.
const MAX_CARDS = 4

export default function Planning() {
  const [editions, setEditions] = useState(null)
  const [assignments, setAssignments] = useState(null)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(null) // key of the expanded card
  const [showAll, setShowAll] = useState(false)
  const [showTimeline, setShowTimeline] = useState(false)

  useEffect(() => {
    Promise.all([fetchUpcoming(), fetchAssignments()])
      .then(([e, a]) => {
        setEditions(e)
        setAssignments(a)
      })
      .catch((e) => setError(e.message))
  }, [])

  const tableMissing = editions && assignments === null
  const asg = assignments ?? []

  const cards = useMemo(() => {
    if (!editions) return []
    const out = []
    // Ordered by value: savings first
    for (const c of findClusters(editions, asg)) out.push({ type: 'cluster', key: `c-${c.editions[0].id}`, c })
    if (!tableMissing) {
      for (const g of findGaps(editions, asg)) out.push({ type: 'gap', key: `g-${g.quarter}-${g.region}`, g })
      for (const x of findConflicts(editions, asg)) out.push({ type: 'conflict', key: `x-${x.rep}-${x.move.id}`, x })
    }
    // Conflicts are an operational problem that needs an answer, so they're guaranteed a place within the limit
    const conflicts = out.filter((o) => o.type === 'conflict')
    const rest = out.filter((o) => o.type !== 'conflict')
    return [...rest.slice(0, Math.max(0, MAX_CARDS - conflicts.length)), ...conflicts, ...rest.slice(Math.max(0, MAX_CARDS - conflicts.length))]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editions, assignments])

  if (error) return <main className="page"><div className="notice bad">שגיאה בטעינה: {error}</div></main>
  if (!editions) return <main className="page"><p className="sub">טוען…</p></main>

  const plannedIds = new Set(asg.map((a) => a.edition_id))
  const regions = new Set(editions.filter((e) => plannedIds.has(e.id)).map((e) => e.series?.region))
  const visible = showAll ? cards : cards.slice(0, MAX_CARDS)

  async function reassign(x, toRep) {
    const row = asg.find((a) => a.rep_name === x.rep && a.edition_id === x.move.id)
    if (row) await removeAssignment(row.id)
    const added = await addAssignment(x.move.id, toRep)
    setAssignments([...asg.filter((a) => a.id !== row?.id), added])
  }

  const assigneesFor = (e) => <Assignees editionId={e.id} assignments={assignments} onChange={setAssignments} />

  const editionLine = (e) => (
    <div key={e.id} className="card tight">
      <div className="row">
        <strong>{Math.round(Number(e.icp_score))}</strong>
        <span>{e.series?.name}</span>
        <span className="sub small">
          · {dateRange(e.start_date, e.end_date)} · {e.city} · {usd(e.ticket_cost_usd)}
        </span>
      </div>
      {e.icp_explanation && <p className="small sub">{e.icp_explanation}</p>}
      {assigneesFor(e)}
    </div>
  )

  return (
    <main className="page">
      <div className="page-head">
        <h1>תכנון</h1>
        <p className="sub">
          {plannedIds.size
            ? `${plannedIds.size} כנסים משובצים ב-${regions.size} אזורים. `
            : 'עדיין לא שובצו כנסים. שיבוץ נעשה מכרטיסי הכנסים. '}
          מה דורש החלטה עכשיו:
        </p>
      </div>

      {tableMissing && (
        <div className="notice warn" style={{ marginBottom: 16 }}>
          טבלת השיבוצים עדיין לא קיימת, לכן מוצגים רק אשכולות. הרץ את sql/002_screens.sql ב-Supabase כדי לראות פערים והתנגשויות.
        </div>
      )}

      {cards.length === 0 && (
        <div className="notice good" style={{ marginBottom: 16 }}>
          השנה מכוסה היטב: {plannedIds.size} כנסים ב-{regions.size} אזורים. אין כרגע החלטות פתוחות.
        </div>
      )}

      <div className="stack">
        {visible.map((card) => {
          const isOpen = open === card.key
          const toggle = () => setOpen(isOpen ? null : card.key)

          if (card.type === 'cluster') {
            const { c } = card
            const first = c.editions[0]
            const last = c.editions[c.editions.length - 1]
            const days = Math.round((new Date(last.end_date ?? last.start_date) - new Date(first.start_date)) / 86400000) + 1
            return (
              <article key={card.key} className="card">
                <span className="tag good">💰 הזדמנות לחיסכון</span>
                <h2 style={{ marginTop: 8 }}>
                  {c.editions.length} כנסים ב{regionLabel(c.region)} בתוך {days} ימים
                </h2>
                <p>{c.editions.map((e) => e.series?.name).join(' · ')}</p>
                <p className="sub small" style={{ marginTop: 4 }}>
                  חיסכון משוער: ~{usd(c.saving)} ({c.editions.length - 1 === 1 ? 'טיסה אחת' : `${c.editions.length - 1} טיסות`} פחות, הערכה גסה של ~{usd(FLIGHT_SAVING_USD)} לטיסה)
                </p>
                {c.upgrades.length > 0 && (
                  <p className="small" style={{ color: 'var(--good)', marginTop: 4 }}>
                    {c.upgrades.map((e) => e.series?.name).join(', ')}: "רק אם כבר באזור" ← "שווה את זה", כי הכנס צמוד לכנס מתוכנן.
                  </p>
                )}
                <button className="secondary" style={{ marginTop: 12 }} onClick={toggle}>
                  {isOpen ? 'סגור' : 'תכנן נסיעה מחוברת'}
                </button>
                {isOpen && <div className="stack" style={{ marginTop: 12 }}>{c.editions.map(editionLine)}</div>}
              </article>
            )
          }

          if (card.type === 'gap') {
            const { g } = card
            const best = g.good[0]
            return (
              <article key={card.key} className="card">
                <span className="tag warn">🕳️ פער בכיסוי</span>
                <h2 style={{ marginTop: 8 }}>
                  {g.quarter.replace('-', ' ')} · {regionLabel(g.region)}: {g.good.length === 1 ? 'כנס טוב אחד' : `${g.good.length} כנסים טובים`} בלי אף אחד משובץ
                </h2>
                <p className="sub small">
                  הטוב ביותר: {best.series?.name} (ציון {Math.round(Number(best.icp_score))}, {usd(best.ticket_cost_usd)})
                </p>
                <button className="secondary" style={{ marginTop: 12 }} onClick={toggle}>
                  {isOpen ? 'סגור' : 'הצג את הכנסים'}
                </button>
                {isOpen && <div className="stack" style={{ marginTop: 12 }}>{g.good.map(editionLine)}</div>}
              </article>
            )
          }

          const { x } = card
          return (
            <article key={card.key} className="card">
              <span className="tag bad">⚠️ התנגשות</span>
              <h2 style={{ marginTop: 8 }}>
                {x.rep} משובץ/ת לשני כנסים חופפים
              </h2>
              <p>
                {x.keep.series?.name} ({dateRange(x.keep.start_date, x.keep.end_date)}) ו-{x.move.series?.name} ({dateRange(x.move.start_date, x.move.end_date)})
              </p>
              <p className="sub small">
                בלי העברה, {x.move.series?.name} (ציון {Math.round(Number(x.move.icp_score))}) נשאר בלי כיסוי בפועל.
              </p>
              <div className="row" style={{ marginTop: 12 }}>
                {x.freeReps.length ? (
                  x.freeReps.map((r) => (
                    <button key={r} className="secondary" onClick={() => reassign(x, r)}>
                      העבר את {x.move.series?.name} ל{r}
                    </button>
                  ))
                ) : (
                  <button className="secondary" onClick={toggle}>
                    {isOpen ? 'סגור' : 'אין איש פנוי. שבץ ידנית'}
                  </button>
                )}
              </div>
              {isOpen && <div style={{ marginTop: 12 }}>{editionLine(x.move)}</div>}
            </article>
          )
        })}
      </div>

      {cards.length > MAX_CARDS && (
        <button className="ghost" style={{ marginTop: 8 }} onClick={() => setShowAll(!showAll)}>
          {showAll ? 'הצג פחות' : `הצג את כל ${cards.length} ההמלצות`}
        </button>
      )}

      <div style={{ marginTop: 24 }}>
        <button className="secondary" onClick={() => setShowTimeline(!showTimeline)}>
          {showTimeline ? 'הסתר ציר זמן' : 'הצג ציר זמן'}
        </button>
        {(showTimeline || cards.length === 0) && <Timeline editions={editions} plannedIds={plannedIds} />}
      </div>
    </main>
  )
}

// One horizontal bar, not a calendar grid. A filled dot means the conference is planned.
function Timeline({ editions, plannedIds }) {
  const sorted = [...editions].sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
  const start = new Date(new Date(sorted[0].start_date).getFullYear(), new Date(sorted[0].start_date).getMonth(), 1)
  const lastD = new Date(sorted[sorted.length - 1].end_date ?? sorted[sorted.length - 1].start_date)
  const end = new Date(lastD.getFullYear(), lastD.getMonth() + 1, 1)
  const pos = (d) => ((new Date(d) - start) / (end - start)) * 100

  const months = []
  for (let m = new Date(start); m < end; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) months.push(m)

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="timeline-wrap">
        {/* dir=ltr: time runs left to right, the usual convention for a timeline */}
        <div className="timeline" dir="ltr">
          {months.map((m) => (
            <div key={m.toISOString()}>
              <div className="tl-tick" style={{ left: `${pos(m)}%` }} />
              <div className="tl-month" style={{ left: `${pos(m)}%` }}>{monthLabel(m)}</div>
            </div>
          ))}
          {sorted.map((e, i) => (
            <div
              key={e.id}
              className={`tl-dot ${plannedIds.has(e.id) ? 'planned' : ''}`}
              style={{ left: `${pos(e.start_date)}%`, top: 10 + (i % 6) * 17 }}
              title={`${e.series?.name} · ${dateRange(e.start_date, e.end_date)} · ${e.city} · ציון ${Math.round(Number(e.icp_score))}`}
            />
          ))}
        </div>
      </div>
      <p className="small sub" style={{ marginTop: 8 }}>● מתוכנן · ○ לא משובץ · מעבר עכבר מציג פרטים</p>
    </div>
  )
}
