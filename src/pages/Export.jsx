import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fullName } from '../lib/format'
import { getPrefs, isMine, onPrefsChange } from '../lib/prefs'
import { hasHubspotToken, onApiKeysChange } from '../lib/apiKeys'
import { downloadCsv, importStatus, startImport } from '../lib/hubspot'
import { buildCsv, csvFileName } from '../lib/leadCsv'

// Export to HubSpot (PRD 10): the rep chooses what to send, the sending itself is automatic.
// The system pre-checks who looks worth sending, and the rep only unchecks. One touch instead of twenty.

const NO_EDITION = '__none__'
const ALL = '__all__' // "כל הכנסים": every lead at once
// Pre-check rule: a phone, AND a need came up (pain) or a next step was agreed. Text alone isn't enough:
// a transcript with no need and no next step is someone who just swapped cards.
// Returns the reasons it's NOT pre-checked; empty = pre-checked. One function, so the reason shown always matches the rule.
const filled = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '')
function precheckReasons(person, e) {
  const reasons = []
  if (!person.phone) reasons.push('חסר טלפון')
  const worth = filled(e?.extracted?.pain) || filled(e?.extracted?.next_step)
  if (!worth) reasons.push(e?.transcript ? 'לא עלה צורך בשיחה' : 'לא תועדה שיחה')
  return reasons
}

export default function Export() {
  const [encs, setEncs] = useState(null)
  const [error, setError] = useState(null)
  const [editionId, setEditionId] = useState(null)
  const [checked, setChecked] = useState(new Set())
  const [tokenOk, setTokenOk] = useState(hasHubspotToken)
  const [send, setSend] = useState(null) // { state: 'sending'|'processing'|'done'|'error', text }

  useEffect(() => onApiKeysChange((k) => setTokenOk(hasHubspotToken(k))), [])

  // "שלי": only leads this rep captured. The lead's history still includes everyone's encounters.
  const [repName, setRepName] = useState(() => getPrefs().repName.trim())
  const [mineOnly, setMineOnly] = useState(false)
  useEffect(() => onPrefsChange((p) => setRepName(p.repName.trim())), [])
  const mineActive = mineOnly && Boolean(repName)
  const pool = useMemo(() => (encs && mineActive ? encs.filter((e) => isMine(repName, e.rep_name)) : encs), [encs, mineActive, repName])

  useEffect(() => {
    supabase
      .from('encounters')
      .select('*, person:people(*), edition:conference_editions(id, start_date, city, series:conference_series(name))')
      .order('created_at', { ascending: false })
      .limit(2000)
      .then(({ data, error }) => (error ? setError(error.message) : setEncs(data)))
  }, [])

  // Conferences that have encounters, newest first
  const conferences = useMemo(() => {
    if (!pool) return []
    const m = new Map()
    for (const e of pool) {
      const id = e.edition_id ?? NO_EDITION
      if (!m.has(id)) m.set(id, { id, name: e.edition ? `${e.edition.series?.name} ${new Date(e.edition.start_date).getFullYear()}` : 'מפגשים ללא כנס', date: e.edition?.start_date ?? e.created_at, count: 0 })
      m.get(id).count++
    }
    return [...m.values()].sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [pool])

  // Default: the current conference from the field screen, otherwise the most recent one
  // Also re-picks when the "שלי" filter hides the selected conference
  useEffect(() => {
    if (!conferences.length || editionId === ALL || conferences.some((c) => c.id === editionId)) return
    const pref = getPrefs().editionId
    setEditionId(conferences.some((c) => c.id === pref) ? pref : conferences[0].id)
  }, [conferences, editionId])

  // One lead per person: the latest encounter with them at this conference (or anywhere, for "all"),
  // plus their full history (all conferences)
  const leads = useMemo(() => {
    if (!pool || !editionId) return []
    const here = pool.filter((e) => e.person && (editionId === ALL || (e.edition_id ?? NO_EDITION) === editionId))
    const byPerson = new Map()
    for (const e of here) if (!byPerson.has(e.person_id)) byPerson.set(e.person_id, e)
    return [...byPerson.values()].map((e) => ({
      person: e.person,
      encounter: e,
      history: encs.filter((x) => x.person_id === e.person_id),
      reasons: precheckReasons(e.person, e),
    }))
  }, [encs, pool, editionId])

  // Pre-check whenever the conference changes
  useEffect(() => {
    setChecked(new Set(leads.filter((l) => !l.reasons.length).map((l) => l.person.id)))
    setSend(null)
  }, [leads])

  const selected = leads.filter((l) => checked.has(l.person.id))
  const conf = editionId === ALL ? { id: ALL, name: 'כל הכנסים' } : conferences.find((c) => c.id === editionId)
  // Sorted by the system's recommendation, not by the live checkbox: unchecking a lead doesn't make it jump away
  const suggested = leads.filter((l) => !l.reasons.length)
  const notSuggested = leads.filter((l) => l.reasons.length)

  const toggle = (id) =>
    setChecked((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const csv = () => buildCsv(selected.map((l) => ({ person: l.person, identityLine: l.encounter.identity_line, encounters: l.history })))

  async function sendToHubspot() {
    setSend({ state: 'sending', text: `שולח ${selected.length} לידים…` })
    try {
      const { importId } = await startImport(csv(), `Grain · ${conf?.name ?? 'כנס'} · ${new Date().toISOString().slice(0, 10)}`)
      setSend({ state: 'processing', text: `✓ ${selected.length} לידים נשלחו. HubSpot מעבד את הייבוא…` })
      // HubSpot processes imports asynchronously: check the status for up to about half a minute
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 3000))
        const st = await importStatus(importId).catch(() => null)
        if (!st) continue
        if (st.state === 'DONE') {
          const c = st.counters ?? {}
          const created = c.CREATED_OBJECTS ?? c.CREATED ?? null
          const errors = c.ERRORS ?? c.ERROR_COUNT ?? 0
          setSend({
            state: errors ? 'error' : 'done',
            text: `✓ הייבוא הושלם ב-HubSpot${created != null ? `: ${created} רשומות נוצרו` : ''}${errors ? `, ${errors} שורות עם שגיאות (פירוט ב-HubSpot → Imports)` : ''}`,
          })
          return
        }
        if (['FAILED', 'CANCELED'].includes(st.state)) {
          setSend({ state: 'error', text: `HubSpot סימן את הייבוא כ-${st.state}. פירוט ב-HubSpot → Contacts → Import. אפשר להוריד CSV כגיבוי.` })
          return
        }
      }
      setSend({ state: 'done', text: `✓ ${selected.length} לידים נשלחו. HubSpot עדיין מעבד. התוצאה תופיע ב-HubSpot → Contacts → Import (מזהה ${importId}).` })
    } catch (e) {
      setSend({ state: 'error', text: `${e.message}. אפשר להוריד CSV ולייבא ידנית.` })
    }
  }

  if (error) return <main className="page"><div className="notice bad">שגיאה בטעינה: {error}</div></main>
  if (!encs) return <main className="page"><p className="sub">טוען…</p></main>

  const busy = send && ['sending', 'processing'].includes(send.state)
  const total = pool?.length ?? 0

  const row = (l) => {
    const { person, encounter, history, reasons } = l
    const company = [person.current_title, person.current_company ?? encounter.company].filter(Boolean).join(' · ')
    return (
      <label key={person.id} className={`lead-row ${checked.has(person.id) ? 'on' : ''}`}>
        <input type="checkbox" checked={checked.has(person.id)} onChange={() => toggle(person.id)} />
        <span className="lead-body">
          <span className="lead-head">
            <strong className="lead-name">{fullName(person)}</strong>
            {company && <span className="lead-company">{company}</span>}
            {/* Why the system didn't check it: the reason, prominent */}
            {reasons.map((m) => <span key={m} className="tag warn">{m}</span>)}
          </span>
          {encounter.identity_line && <span className="lead-identity">"{encounter.identity_line}"</span>}
          <span className="lead-meta">
            <span className="lead-phone">{person.phone || 'אין טלפון'}</span>
            <span>{history.length === 1 ? 'מפגש אחד' : `${history.length} מפגשים`}</span>
          </span>
        </span>
      </label>
    )
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1>ייצוא ל-HubSpot</h1>
      </div>

      {repName && (
        <div className="chips" style={{ marginBottom: 16 }}>
          <button className={`chip ${mineActive ? 'on' : ''}`} onClick={() => setMineOnly((v) => !v)}>
            רק לידים שאני תיעדתי
          </button>
        </div>
      )}

      {conferences.length === 0 ? (
        <div className="card sub">{mineActive ? `אין לידים ש${repName} תיעד/ה.` : 'עדיין אין מפגשים מתועדים.'}</div>
      ) : (
        <>
          <div style={{ marginBottom: 16, maxWidth: 420 }}>
            <label htmlFor="conf">כנס</label>
            <select id="conf" value={editionId ?? ''} onChange={(e) => setEditionId(e.target.value)}>
              <option value={ALL}>כל הכנסים ({total} מפגשים)</option>
              {conferences.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
          </div>

          {/* The system made a recommendation: say so, and say how */}
          <div className="notice info export-explain">
            <strong>
              המערכת סימנה {suggested.length} מתוך {leads.length} לידים
            </strong>
            <p>מסומנים: לידים עם טלפון, שבשיחה איתם עלה צורך או סוכם צעד הבא. הורד סימון ממי שלא רלוונטי — ספקים, מתחרים, או מי שרק החליף כרטיס.</p>
          </div>

          <div className="row" style={{ marginBottom: 8 }}>
            <span className="sub small">
              {selected.length} מתוך {leads.length} מסומנים
            </span>
            <button className="ghost small" onClick={() => setChecked(new Set(leads.map((l) => l.person.id)))}>
              סמן הכל
            </button>
            <button className="ghost small" onClick={() => setChecked(new Set())}>
              נקה
            </button>
          </div>

          <div className="lead-list">
            {suggested.map(row)}
            {notSuggested.length > 0 && (
              <>
                <div className="lead-divider" role="separator">
                  <span>לא סומנו ({notSuggested.length})</span>
                </div>
                {notSuggested.map(row)}
              </>
            )}
          </div>

          <div className="export-actions">
            <div className="row">
              <button onClick={sendToHubspot} disabled={!tokenOk || !selected.length || busy}>
                שלח ל-HubSpot ({selected.length})
              </button>
              <button className="secondary" onClick={() => downloadCsv(csv(), csvFileName(conf?.name))} disabled={!selected.length}>
                הורד CSV ({selected.length})
              </button>
            </div>
            <p className="sub small">נוצרים אנשי קשר וחברות בלבד. לא נוצרים Deals.</p>
            {!tokenOk && (
              <p className="small">
                כדי לשלוח ישירות צריך HubSpot token ב<Link to="/settings">הגדרות</Link>. בינתיים אפשר להוריד CSV ולייבא ב-HubSpot → Contacts → Import.
              </p>
            )}
          </div>

          {send && <div className={`notice ${send.state === 'error' ? 'bad' : send.state === 'done' ? 'good' : 'info'}`}>{send.text}</div>}
        </>
      )}
    </main>
  )
}
