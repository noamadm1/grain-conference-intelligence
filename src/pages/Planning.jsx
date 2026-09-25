import { useEffect, useMemo, useRef, useState } from 'react'
import { addAssignment, fetchAssignments, fetchUpcoming, removeAssignment } from '../lib/data'
import { dateRange, monthLabel, monthName, regionLabel, usd } from '../lib/format'
import { REC, findClusters, findConflicts, findGaps } from '../lib/planning'
import { REPS } from '../lib/reps'
import Assignees from '../components/Assignees.jsx'

// Planning view (PRD 6): "what needs a decision from me right now?"
// Action cards in three sections, most urgent first: conflicts, coverage gaps, savings. Built like the conference
// cards (tile + title + text). The year board is behind a button in the page header. The system shows, the manager assigns.

// Hebrew counting. Conferences are masculine (שלושה כנסים), trips feminine (שלוש נסיעות)
const COUNT_M = { 2: 'שני', 3: 'שלושה', 4: 'ארבעה', 5: 'חמישה' }
const COUNT_F = { 2: 'שתיים', 3: 'שלוש', 4: 'ארבע', 5: 'חמש' }
const ALL_OF = { 2: 'שניהם', 3: 'שלושתם', 4: 'ארבעתם', 5: 'חמשתם' }
const OTHERS = { 1: 'האחר', 2: 'השניים האחרים', 3: 'השלושה האחרים', 4: 'הארבעה האחרים' }
const QUARTER = ['הראשון', 'השני', 'השלישי', 'הרביעי']
// Most urgent first. Empty sections are skipped
const SECTIONS = [
  { type: 'conflict', title: 'התנגשויות' },
  { type: 'gap', title: 'אף אחד לא מכסה' },
  { type: 'cluster', title: 'הזדמנויות לחסוך' },
]
const DAY = 86400000

const score = (e) => Math.round(Number(e.icp_score))
const scoreClass = (s) => (s >= 60 ? 'hi' : s >= 50 ? 'mid' : 'lo')
// 'and' attaches to a Hebrew word (ויואב) and takes a hyphen before Latin or a number (ו-ITB)
const and = (w) => (/^[֐-׿]/.test(w) ? `ו${w}` : `ו-${w}`)
const names = (list) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} ${and(list.at(-1))}`)
const kShort = (usdAmount) => `$${usdAmount < 10000 ? (usdAmount / 1000).toFixed(1).replace(/\.0$/, '') : Math.round(usdAmount / 1000)}K`

export default function Planning() {
  const [editions, setEditions] = useState(null)
  const [assignments, setAssignments] = useState(null)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(null) // key of the expanded card
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
    // Within each section, in each finder's own order (savings by value, gaps by uncovered score)
    if (!tableMissing) {
      for (const x of findConflicts(editions, asg, REPS)) out.push({ type: 'conflict', key: `x-${x.rep}-${x.move.id}`, x })
      for (const g of findGaps(editions, asg)) out.push({ type: 'gap', key: `g-${g.quarter}-${g.region}`, g })
    }
    for (const c of findClusters(editions, asg)) out.push({ type: 'cluster', key: `c-${c.editions[0].id}`, c })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editions, assignments])

  if (error) return <main className="page"><div className="notice bad">שגיאה בטעינה: {error}</div></main>
  if (!editions) return <main className="page"><p className="sub">טוען…</p></main>

  const repsOn = (e) => asg.filter((a) => a.edition_id === e.id).map((a) => a.rep_name)

  async function reassign(x, toRep) {
    const row = asg.find((a) => a.rep_name === x.rep && a.edition_id === x.move.id)
    if (row) await removeAssignment(row.id)
    const added = await addAssignment(x.move.id, toRep)
    setAssignments([...asg.filter((a) => a.id !== row?.id), added])
  }

  const row = (e) => <EditionRow key={e.id} e={e} assignments={assignments} onChange={setAssignments} />

  const renderCard = (card) => {
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
            {COUNT_M[n] ?? n} כנסים ב{regionLabel(c.region)} בתוך {days} ימים: {confNames.join(', ')}. נסיעה אחת במקום {COUNT_F[n] ?? n}.
          </p>
          <p>
            חיסכון משוער: ~{usd(c.saving)} ({n - 1 > 1 ? `${n - 1} נסיעות × ` : ''}טיסה, 3 לילות מלון וקצבה יומית)
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
  }

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-row">
          <h1>תצוגת תכנון</h1>
          <button className={`secondary board-btn ${showMonths ? 'on' : ''}`} aria-expanded={showMonths} onClick={() => setShowMonths(!showMonths)}>
            {showMonths ? 'הסתר את לוח הכנסים' : 'לוח הכנסים לשנה'}
          </button>
        </div>
        <p>מה דורש החלטה: התנגשויות ביומן, כנסים טובים שאף אחד לא מכסה, והזדמנויות לחסוך בנסיעות.</p>
      </div>

      {(showMonths || cards.length === 0) && <YearBoard editions={editions} assignments={assignments} row={row} />}

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

      {SECTIONS.map(({ type, title }) => {
        const list = cards.filter((c) => c.type === type)
        if (!list.length) return null // empty sections are skipped entirely
        return (
          <section key={type} className="plan-section" aria-label={title}>
            <h2 className="plan-section-head">
              {title} <span className="plan-section-count">{list.length}</span>
            </h2>
            <div className="stack">{list.map(renderCard)}</div>
          </section>
        )
      })}
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

// One conference as a row: score tile, name, dates and city on a second line, assigned reps at the far end.
// A conference worth considering (50+) with nobody assigned stands out: that's where a decision is missing
const NEEDS_COVER = 50
const isUncovered = (e, assignments) => assignments != null && score(e) >= NEEDS_COVER && !assignments.some((a) => a.edition_id === e.id)

function EditionRow({ e, assignments, onChange }) {
  const s = score(e)
  const uncovered = isUncovered(e, assignments)
  return (
    <div className={`edition-row ${uncovered ? 'uncovered' : ''}`}>
      <div className={`score small-score ${scoreClass(s)}`} aria-label={`ציון ${s}`}>
        {s}
      </div>
      <div className="edition-main">
        <strong className="edition-name">{e.series?.name}</strong>
        <div className="conf-meta">
          <span className="date">{dateRange(e.start_date, e.end_date)}</span>
          <span>
            {e.city}, {e.country}
          </span>
        </div>
      </div>
      <div className="edition-end">
        {uncovered && <span className="uncovered-mark">אף אחד לא משובץ</span>}
        <Assignees editionId={e.id} assignments={assignments} onChange={onChange} compact />
      </div>
    </div>
  )
}

// Year board: a strip of months (only months with conferences) for the year at a glance, and the selected month's
// conferences below it. Replaces a vertical list of 10 months, which was cluttered.
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

function YearBoard({ editions, assignments, row }) {
  const months = useMemo(() => {
    const m = new Map()
    for (const e of [...editions].sort((a, b) => new Date(a.start_date) - new Date(b.start_date))) {
      const d = new Date(e.start_date)
      const k = monthKey(d)
      if (!m.has(k)) m.set(k, { key: k, date: new Date(d.getFullYear(), d.getMonth(), 1), short: monthLabel(d), label: monthName(d), list: [] })
      m.get(k).list.push(e)
    }
    return [...m.values()]
  }, [editions])

  // Default: the current month if it has conferences, otherwise the nearest one (the next one on a tie)
  const [selected, setSelected] = useState(() => {
    const now = new Date()
    const current = months.find((m) => m.key === monthKey(now))
    if (current) return current.key
    const dist = (m) => Math.abs(m.date - new Date(now.getFullYear(), now.getMonth(), 1))
    return [...months].sort((a, b) => dist(a) - dist(b) || b.date - a.date)[0]?.key
  })
  const month = months.find((m) => m.key === selected) ?? months[0]

  // Bring the selected month into view in the strip (it may be off-screen on a phone)
  const stripRef = useRef(null)
  useEffect(() => {
    stripRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selected])

  if (!month) return null
  const count = (n) => (n === 1 ? 'כנס אחד' : `${n} כנסים`)

  return (
    <section className="card year-board">
      <div className="month-strip" ref={stripRef} aria-label="חודשים">
        {months.map((m) => {
          const gaps = m.list.filter((e) => isUncovered(e, assignments)).length
          return (
            <button
              key={m.key}
              type="button"
              className="month-btn"
              aria-pressed={m.key === month.key}
              aria-label={`${m.label}, ${count(m.list.length)}${gaps ? `, ${gaps} בלי כיסוי` : ''}`}
              onClick={() => setSelected(m.key)}
            >
              <span className="month-name">{m.short}</span>
              <span className="month-num">{count(m.list.length)}</span>
              {/* Coverage at a glance: a good conference (50+) nobody covers this month */}
              {gaps > 0 && <span className="month-gap" aria-hidden="true" />}
            </button>
          )
        })}
      </div>

      <h2 className="month-title">
        {month.label} <span className="month-count">· {count(month.list.length)}</span>
      </h2>
      <div className="plan-rows">{month.list.map(row)}</div>
    </section>
  )
}
