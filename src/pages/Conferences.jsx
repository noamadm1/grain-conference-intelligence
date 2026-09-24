import { useEffect, useMemo, useState } from 'react'
import { fetchAssignments, fetchIcpSettings, fetchUpcoming } from '../lib/data'
import { REGION_LABELS, dateRange, editionRegion, monthName, quarterOf, regionLabel, usd } from '../lib/format'
import { REC, medianCostPerIcp, recommendationDetail } from '../lib/planning'
import { mergeSettings } from '../lib/icp'
import Assignees from '../components/Assignees.jsx'
import FilterMenu from '../components/FilterMenu.jsx'
import ScoreInfo from '../components/ScoreInfo.jsx'

// Filters, worded the way a salesperson would say them. Four dropdowns in one row.
// Within a group the choices are OR (Europe or Asia), between groups AND (Europe and "must").
const REGIONS = ['europe', 'north-america', 'apac', 'middle-east', 'africa']
const RECS = ['must', 'worth', 'nearby', 'skip']

// Tile shades follow the bands: 60+ "must", 50+ "worth considering"
const scoreClass = (s) => (s >= 60 ? 'hi' : s >= 50 ? 'mid' : 'lo')
const toNum = (s) => (s === '' ? null : Number(s))
const money = (n) => `$${n.toLocaleString('en-US')}`

// How sure the attendee count is, in words: the spread is how much the sources disagree. A verified count needs no note
function attendeesNote(e) {
  const spread = e.attendees?.spread ?? 0
  if (e.confidence?.attendees === 'verified' || spread < 0.15) return ''
  return spread > 0.3 ? ' (הערכה גסה)' : ' (הערכה)'
}

// Date filter: one quarter ("q:2026-Q4") or one month ("m:2026-10"), by the conference's start date
const quarterKey = (d) => `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const matchesDate = (e, sel) => {
  const d = new Date(e.start_date)
  return sel.startsWith('q:') ? quarterKey(d) === sel.slice(2) : monthKey(d) === sel.slice(2)
}

export default function Conferences() {
  const [editions, setEditions] = useState(null)
  const [assignments, setAssignments] = useState(null)
  const [settings, setSettings] = useState(() => mergeSettings({}))
  const [error, setError] = useState(null)

  const [regions, setRegions] = useState(new Set())
  const [recs, setRecs] = useState(new Set())
  const [date, setDate] = useState(null)
  const [costMin, setCostMin] = useState('')
  const [costMax, setCostMax] = useState('')
  const [openMenu, setOpenMenu] = useState(null)

  useEffect(() => {
    Promise.all([fetchUpcoming(), fetchAssignments()])
      .then(([e, a]) => {
        setEditions(e)
        setAssignments(a)
      })
      .catch((e) => setError(e.message))
    // The live formula settings, for the (i) breakdown. If this fails, the defaults are shown
    fetchIcpSettings()
      .then(setSettings)
      .catch(() => {})
  }, [])

  const median = useMemo(() => (editions ? medianCostPerIcp(editions) : null), [editions])
  const detailOf = useMemo(() => new Map((editions ?? []).map((e) => [e.id, recommendationDetail(e, median)])), [editions, median])
  const recOf = useMemo(() => new Map([...detailOf].map(([id, d]) => [id, d.key])), [detailOf])

  // Quarters and months that actually have conferences, in date order
  const dateOptions = useMemo(() => {
    const quarters = new Map()
    for (const e of [...(editions ?? [])].sort((a, b) => new Date(a.start_date) - new Date(b.start_date))) {
      const d = new Date(e.start_date)
      const q = quarterKey(d)
      if (!quarters.has(q)) quarters.set(q, { key: `q:${q}`, label: quarterOf(d), months: new Map() })
      quarters.get(q).months.set(monthKey(d), { key: `m:${monthKey(d)}`, label: monthName(d) })
    }
    return [...quarters.values()].map((q) => ({ ...q, months: [...q.months.values()] }))
  }, [editions])

  const min = toNum(costMin)
  const max = toNum(costMax)
  const costActive = min != null || max != null

  // skip: leave one group out, so the counts in a panel show what you'd get by choosing that option
  const passes = (e, skip) => {
    if (skip !== 'region' && regions.size && !regions.has(editionRegion(e))) return false
    if (skip !== 'rec' && recs.size && !recs.has(recOf.get(e.id))) return false
    if (skip !== 'date' && date && !matchesDate(e, date)) return false
    if (skip !== 'cost' && costActive) {
      const c = e.ticket_cost_usd == null ? null : Number(e.ticket_cost_usd)
      if (c == null) return false // Unknown cost can't be shown as inside a range
      if (min != null && c < min) return false
      if (max != null && c > max) return false
    }
    return true
  }

  const shown = (editions ?? []).filter((e) => passes(e)).sort((a, b) => Number(b.icp_score ?? -1) - Number(a.icp_score ?? -1))
  const countFor = (group, test) => (editions ?? []).filter((e) => passes(e, group) && test(e)).length

  const activeCount = regions.size + recs.size + (date ? 1 : 0) + (costActive ? 1 : 0)
  const clearAll = () => {
    setRegions(new Set())
    setRecs(new Set())
    setDate(null)
    setCostMin('')
    setCostMax('')
    setOpenMenu(null)
  }
  const toggleIn = (setter, k) =>
    setter((s) => {
      const n = new Set(s)
      n.has(k) ? n.delete(k) : n.add(k)
      return n
    })
  const menu = (key) => ({ open: openMenu === key, onOpenChange: (v) => setOpenMenu(v ? key : null) })

  // What's selected, shown on each button. In the order of the list, not the order of clicking
  const recSummary = recs.size ? RECS.filter((k) => recs.has(k)).map((k) => REC[k].label).join(', ') : null
  const regionSummary = regions.size ? REGIONS.filter((r) => regions.has(r)).map((r) => REGION_LABELS[r]).join(', ') : null
  const dateSummary = date ? dateOptions.flatMap((q) => [q, ...q.months]).find((o) => o.key === date)?.label ?? null : null
  const costSummary = !costActive ? null : min != null && max != null ? `${money(min)}–${money(max)}` : min != null ? `מ-${money(min)}` : `עד ${money(max)}`

  const dateOption = (o, nested) => (
    <label key={o.key} className={`filter-option ${nested ? 'nested' : ''}`}>
      <input type="radio" name="date" checked={date === o.key} onChange={() => setDate(o.key)} />
      <span>{o.label}</span>
      <span className="chip-count">{countFor('date', (e) => matchesDate(e, o.key))}</span>
    </label>
  )

  return (
    <main className="page">
      <div className="page-head">
        <h1>מאגר הכנסים</h1>
        <p className="sub">ממוין לפי התאמת קהל ל-ICP. העלות מוצגת בנפרד.</p>
      </div>

      <section className="filter-bar" aria-label="סינון">
        <FilterMenu label="המלצה" summary={recSummary} {...menu('rec')}>
          {RECS.map((k) => (
            <label key={k} className="filter-option">
              <input type="checkbox" checked={recs.has(k)} onChange={() => toggleIn(setRecs, k)} />
              <span>{REC[k].label}</span>
              <span className="chip-count">{countFor('rec', (e) => recOf.get(e.id) === k)}</span>
            </label>
          ))}
        </FilterMenu>

        <FilterMenu label="אזור" summary={regionSummary} {...menu('region')}>
          {REGIONS.map((r) => (
            <label key={r} className="filter-option">
              <input type="checkbox" checked={regions.has(r)} onChange={() => toggleIn(setRegions, r)} />
              <span>{REGION_LABELS[r]}</span>
              <span className="chip-count">{countFor('region', (e) => editionRegion(e) === r)}</span>
            </label>
          ))}
        </FilterMenu>

        <FilterMenu label="תאריך" summary={dateSummary} {...menu('date')}>
          <label className="filter-option">
            <input type="radio" name="date" checked={date == null} onChange={() => setDate(null)} />
            <span>כל התאריכים</span>
          </label>
          {dateOptions.map((q) => (
            <div key={q.key}>
              {dateOption(q, false)}
              {q.months.map((m) => dateOption(m, true))}
            </div>
          ))}
        </FilterMenu>

        <FilterMenu label="עלות" summary={costSummary} {...menu('cost')}>
          <div className="cost-range">
            <label className="visually-hidden" htmlFor="cost-min">עלות מינימלית בדולרים</label>
            <input id="cost-min" type="number" inputMode="numeric" min="0" step="100" placeholder="מ-$" value={costMin} onChange={(e) => setCostMin(e.target.value)} />
            <span className="sub">עד</span>
            <label className="visually-hidden" htmlFor="cost-max">עלות מקסימלית בדולרים</label>
            <input id="cost-max" type="number" inputMode="numeric" min="0" step="100" placeholder="עד $" value={costMax} onChange={(e) => setCostMax(e.target.value)} />
          </div>
          {min != null && max != null && min > max && <p style={{ color: 'var(--warn)' }}>העלות המינימלית גבוהה מהמקסימלית.</p>}
          <p className="sub small">עלות כרטיס. {countFor('cost', () => true)} כנסים עם שאר הסינונים.</p>
        </FilterMenu>

        {activeCount > 0 && (
          <button className="ghost" onClick={clearAll}>
            נקה הכל
          </button>
        )}
      </section>

      {editions && (
        <p className="sub small" style={{ marginBottom: 12 }}>
          {shown.length} מתוך {editions.length} כנסים
        </p>
      )}

      {error && <div className="notice bad">שגיאה בטעינה: {error}</div>}
      {!editions && !error && <p className="sub">טוען…</p>}

      <div className="stack">
        {editions && shown.length === 0 && <div className="card sub">אין כנסים שעונים על כל הסינונים. נסה להסיר אחד.</div>}
        {shown.map((e) => {
          const detail = detailOf.get(e.id)
          const rec = REC[detail?.key]
          const score = e.icp_score == null ? null : Math.round(Number(e.icp_score))
          const name = e.series?.name ?? e.id
          return (
            <article key={e.id} className="card conf">
              <div className="conf-score">
                <div className={`score ${score == null ? 'lo' : scoreClass(score)}`} title="ציון התאמת קהל ל-ICP">
                  {score ?? '—'}
                </div>
                <ScoreInfo edition={e} settings={settings} detail={detail} />
              </div>

              {/* Why the recommendation is in the (i) popover, so the card stays clean for scanning */}
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

                <div className="conf-meta">
                  <span>{dateRange(e.start_date, e.end_date)}</span>
                  <span>
                    {e.city}, {e.country}
                  </span>
                  <span className="secondary">{regionLabel(editionRegion(e))}</span>
                  <span className="cost">{e.ticket_cost_usd == null ? 'עלות כרטיס לא ידועה' : `עלות כרטיס לכנס: ${usd(e.ticket_cost_usd)}`}</span>
                  {e.attendees?.value && (
                    <span className="secondary" title={e.attendees.sources?.length ? `מקורות: ${e.attendees.sources.join(' · ')}` : undefined}>
                      ~{Number(e.attendees.value).toLocaleString('en-US')} משתתפים{attendeesNote(e)}
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
