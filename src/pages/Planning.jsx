import { useEffect, useMemo, useState } from 'react'
import { addAssignment, fetchAssignments, fetchUpcoming, removeAssignment } from '../lib/data'
import { dateRange, monthName, regionLabel, usd } from '../lib/format'
import { REC, findClusters, findConflicts, findGaps } from '../lib/planning'
import { REPS } from '../lib/reps'
import Assignees from '../components/Assignees.jsx'

// Planning view (PRD 6): "what needs a decision from me right now?"
// Action cards on top, built like the conference cards (tile + title + text). The month-by-month list is behind a button.
// The system shows, the manager assigns.
const MAX_CARDS = 4

// Hebrew counting. Conferences are masculine (שלושה כנסים), trips feminine (שלוש נסיעות)
const COUNT_M = { 2: 'שני', 3: 'שלושה', 4: 'ארבעה', 5: 'חמישה' }
const COUNT_F = { 2: 'שתיים', 3: 'שלוש', 4: 'ארבע', 5: 'חמש' }
const ALL_OF = { 2: 'שניהם', 3: 'שלושתם', 4: 'ארבעתם', 5: 'חמשתם' }
const OTHERS = { 1: 'האחר', 2: 'השניים האחרים', 3: 'השלושה האחרים', 4: 'הארבעה האחרים' }
const QUARTER = ['הראשון', 'השני', 'השלישי', 'הרביעי']
const DAY = 86400000

const score = (e) => Math.round(Number(e.icp_score))
const scoreClass = (s) => (s >= 60 ? 'hi' : s >= 50 ? 'mid' : 'lo')
// 'and' attaches to a Hebrew word (ויואב) and takes a hyphen before Latin or a number (ו-ITB)
const and = (w) => (/^[֐-׿]/.test(w) ? `ו${w}` : `ו-${w}`)
const names = (list) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} ${and(list.at(-1))}`)
const kShort = (usdAmount) => `$${Math.round(usdAmount / 1000)}K`

export default function Planning() {
  const [editions, setEditions] = useState(null)
  const [assignments, setAssignments] = useState(null)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(null) // key of the expanded card
  const [showAll, setShowAll] = useState(false)
  const [showMonths, setShowMonths] = useState(false)

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
      for (const x of findConflicts(editions, asg, REPS)) out.push({ type: 'conflict', key: `x-${x.rep}-${x.move.id}`, x })
    }
    // Within the first MAX_CARDS, every card type that exists gets a place (its top card), then the rest fill by value.
    // Otherwise three savings cards could push the only coverage gap or conflict behind "show all"
    const firstOfEach = ['cluster', 'gap', 'conflict'].map((t) => out.find((o) => o.type === t)).filter(Boolean)
    const top = new Set(firstOfEach)
    for (const o of out) if (top.size < MAX_CARDS) top.add(o)
    // Shown in value order (savings, gaps, conflicts), the rest after "show all"
    return [...out.filter((o) => top.has(o)), ...out.filter((o) => !top.has(o))]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editions, assignments])

  if (error) return <main className="page"><div className="notice bad">שגיאה בטעינה: {error}</div></main>
  if (!editions) return <main className="page"><p className="sub">טוען…</p></main>

  const visible = showAll ? cards : cards.slice(0, MAX_CARDS)
  const repsOn = (e) => asg.filter((a) => a.edition_id === e.id).map((a) => a.rep_name)

  async function reassign(x, toRep) {
    const row = asg.find((a) => a.rep_name === x.rep && a.edition_id === x.move.id)
    if (row) await removeAssignment(row.id)
    const added = await addAssignment(x.move.id, toRep)
    setAssignments([...asg.filter((a) => a.id !== row?.id), added])
  }

  const row = (e) => <EditionRow key={e.id} e={e} assignments={assignments} onChange={setAssignments} />

  return (
    <main className="page">
      <div className="page-head">
        <h1>תצוגת תכנון</h1>
        <p>מה דורש החלטה: הזדמנויות לחסוך בנסיעות, כנסים טובים שאף אחד לא מכסה, והתנגשויות ביומן.</p>
      </div>

      {tableMissing && (
        <div className="notice warn" style={{ marginBottom: 16 }}>
          טבלת השיבוצים עדיין לא קיימת, לכן מוצגים רק אשכולות. הרץ את sql/002_screens.sql ב-Supabase כדי לראות פערים והתנגשויות.
        </div>
      )}

      {cards.length === 0 && (
        <div className="notice good" style={{ marginBottom: 16 }}>
          אין כרגע החלטות פתוחות: אין נסיעות לחבר, כל כנס טוב מכוסה, ואין התנגשויות.
        </div>
      )}

      <div className="stack">
        {visible.map((card) => {
          const isOpen = open === card.key
          const toggle = () => setOpen(isOpen ? null : card.key)

          if (card.type === 'cluster') {
            const { c } = card
            const n = c.editions.length
            const first = c.editions[0]
            const last = c.editions[n - 1]
            const days = Math.round((new Date(last.end_date ?? last.start_date) - new Date(first.start_date)) / DAY) + 1
            const confNames = c.editions.map((e) => e.series?.name)
            // Who is already going to one of these conferences
            const already = c.editions.flatMap((e) => repsOn(e).map((rep) => ({ rep, e })))
            const reps = [...new Set(already.map((a) => a.rep))]
            let how = `איש מכירות אחד יכול לכסות את ${ALL_OF[n] ?? `כל ה-${n}`} בנסיעה אחת של ${days} ימים.`
            if (reps.length === 1) {
              const mine = already.filter((a) => a.rep === reps[0]).map((a) => a.e.series?.name)
              const rest = n - mine.length
              how = rest
                ? `${reps[0]} כבר משובץ/ת ל-${names(mine)} — אפשר לצרף לאותה נסיעה את ${OTHERS[rest] ?? `${rest} האחרים`}.`
                : `${reps[0]} כבר משובץ/ת לכולם. נסיעה אחת.`
            } else if (reps.length > 1) {
              how = `כבר משובצים כאן: ${names(reps)}. אפשר לאחד לנסיעה אחת של ${days} ימים.`
            }
            return (
              <PlanCard
                key={card.key}
                tile={kShort(c.saving)}
                tileClass="saving"
                tileLabel={`חיסכון משוער ${usd(c.saving)}`}
                tileCaption="חיסכון"
                title={`${COUNT_M[n] ?? n} כנסים ב${regionLabel(c.region)}`}
                tag={<span className="tag good">הזדמנות לחסוך</span>}
                meta={dateRange(first.start_date, last.end_date ?? last.start_date)}
              >
                <p>
                  {COUNT_M[n] ?? n} כנסים ב{regionLabel(c.region)} בתוך {days} ימים: {confNames.join(', ')}. נסיעה אחת במקום {COUNT_F[n] ?? n} חוסכת כ-{usd(c.saving)}.
                </p>
                <p>{how}</p>
                {c.upgrades.length > 0 && (
                  <p>
                    {names(c.upgrades.map((e) => e.series?.name))} עולה מ"{REC.nearby.label}" ל"{REC.worth.label}", כי הוא צמוד לכנס שכבר משובץ.
                  </p>
                )}
                <div className="plan-actions">
                  <button className="secondary" onClick={toggle}>{isOpen ? 'סגור' : 'הצג את הכנסים'}</button>
                </div>
                {isOpen && <div className="plan-rows">{c.editions.map(row)}</div>}
              </PlanCard>
            )
          }

          if (card.type === 'gap') {
            const { g } = card
            const best = g.good[0]
            const [year, q] = g.quarter.split('-Q')
            return (
              <PlanCard
                key={card.key}
                tile={score(best)}
                tileClass={scoreClass(score(best))}
                tileLabel={`ציון ${score(best)}`}
                tileCaption="ציון"
                title={`${regionLabel(g.region)} · רבעון ${q} ${year}`}
                tag={<span className="tag warn">אף אחד לא מכסה</span>}
              >
                <p>
                  {names(g.good.map((e) => `${e.series?.name} (${score(e)})`))} ברבעון {QUARTER[q - 1]}, ואף אחד לא משובץ.
                </p>
                <div className="plan-actions">
                  <button className="secondary" onClick={toggle}>{isOpen ? 'סגור' : 'שבץ מישהו'}</button>
                </div>
                {isOpen && <div className="plan-rows">{g.good.map(row)}</div>}
              </PlanCard>
            )
          }

          const { x } = card
          return (
            <PlanCard
              key={card.key}
              tile="⚠"
              tileClass="conflict"
              tileLabel="התנגשות"
              tileCaption="התנגשות"
              title={x.rep}
              tag={<span className="tag bad">התנגשות ביומן</span>}
              meta={dateRange(x.move.start_date, x.move.end_date)}
            >
              <p>
                {x.rep} משובץ/ת לשני כנסים באותם תאריכים: {x.keep.series?.name} {and(x.move.series?.name ?? '')}. כדאי להעביר את {x.move.series?.name} ({score(x.move)}) למישהו אחר.
              </p>
              <Reassign x={x} onMove={reassign} />
            </PlanCard>
          )
        })}
      </div>

      {cards.length > MAX_CARDS && (
        <button className="ghost" style={{ marginTop: 8 }} onClick={() => setShowAll(!showAll)}>
          {showAll ? 'הצג פחות' : `הצג את כל ${cards.length} ההמלצות`}
        </button>
      )}

      <div style={{ marginTop: 24 }}>
        <button className="secondary" onClick={() => setShowMonths(!showMonths)}>
          {showMonths ? 'הסתר את לוח הכנסים' : 'לוח הכנסים לשנה'}
        </button>
        {(showMonths || cards.length === 0) && <Months editions={editions} row={row} />}
      </div>
    </main>
  )
}

// Same shell as the conference card: tile (with a caption, so the number explains itself), title + tag, a meta line, then the body
function PlanCard({ tile, tileClass, tileLabel, tileCaption, title, tag, meta, children }) {
  return (
    <article className="card conf plan-card">
      <div className="conf-score">
        <div className={`score ${tileClass}`} role="img" aria-label={tileLabel} title={tileLabel}>
          {tile}
        </div>
        {tileCaption && (
          <span className="tile-caption" aria-hidden="true">
            {tileCaption}
          </span>
        )}
      </div>
      <div className="conf-body">
        <div className="conf-title">
          <h2>{title}</h2>
          {tag}
        </div>
        {meta && (
          <div className="conf-meta">
            <span className="date">{meta}</span>
          </div>
        )}
        <div className="plan-text">{children}</div>
      </div>
    </article>
  )
}

// Move the lower-scoring conference to a rep who is free on those dates
function Reassign({ x, onMove }) {
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  if (!x.freeReps.length) return <p className="sub">אין איש מכירות פנוי בתאריכים האלה.</p>
  return (
    <form
      className="plan-actions"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!to) return
        setBusy(true)
        try {
          await onMove(x, to)
        } finally {
          setBusy(false)
        }
      }}
    >
      <label className="visually-hidden" htmlFor={`move-${x.move.id}`}>
        למי להעביר את {x.move.series?.name}
      </label>
      <select id={`move-${x.move.id}`} value={to} onChange={(e) => setTo(e.target.value)}>
        <option value="">בחר איש מכירות פנוי…</option>
        {x.freeReps.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <button type="submit" className="secondary" disabled={!to || busy}>
        העבר את {x.move.series?.name}
      </button>
    </form>
  )
}

// One conference as a row: score, name, dates, city, who's assigned (and assigning).
// A conference worth considering (50+) with nobody assigned stands out: that's where a decision is missing
const NEEDS_COVER = 50

function EditionRow({ e, assignments, onChange }) {
  const s = score(e)
  const uncovered = assignments != null && s >= NEEDS_COVER && !assignments.some((a) => a.edition_id === e.id)
  return (
    <div className={`edition-row ${uncovered ? 'uncovered' : ''}`}>
      <div className={`score small-score ${scoreClass(s)}`} aria-label={`ציון ${s}`}>
        {s}
      </div>
      <div className="conf-body">
        <strong className="edition-name">{e.series?.name}</strong>
        <div className="conf-meta">
          <span className="date">{dateRange(e.start_date, e.end_date)}</span>
          <span>
            {e.city}, {e.country}
          </span>
          {uncovered && <span className="uncovered-mark">אף אחד לא משובץ</span>}
        </div>
        <Assignees editionId={e.id} assignments={assignments} onChange={onChange} hideEmpty={uncovered} />
      </div>
    </div>
  )
}

// The year's schedule board, month by month (instead of a dot timeline). Months with no conferences are skipped
function Months({ editions, row }) {
  const byMonth = new Map()
  for (const e of [...editions].sort((a, b) => new Date(a.start_date) - new Date(b.start_date))) {
    const d = new Date(e.start_date)
    const k = `${d.getFullYear()}-${d.getMonth()}`
    if (!byMonth.has(k)) byMonth.set(k, { label: monthName(d), list: [] })
    byMonth.get(k).list.push(e)
  }
  return (
    <div className="months">
      {[...byMonth.values()].map((m) => (
        <section key={m.label} className="card month">
          <h2>
            {m.label} <span className="month-count">· {m.list.length === 1 ? 'כנס אחד' : `${m.list.length} כנסים`}</span>
          </h2>
          <div className="plan-rows">{m.list.map(row)}</div>
        </section>
      ))}
    </div>
  )
}
