import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fullName } from '../lib/format'
import { getPrefs } from '../lib/prefs'
import { hasHubspotToken, onApiKeysChange } from '../lib/apiKeys'
import { downloadCsv, importStatus, startImport } from '../lib/hubspot'
import { buildCsv, csvFileName } from '../lib/leadCsv'

// Export to HubSpot (PRD 10): the rep chooses what to send, the sending itself is automatic.
// The system pre-checks who looks relevant (has a phone and context), and the rep only unchecks. One touch instead of twenty.

const NO_EDITION = '__none__'
const hasContext = (e) => Boolean(e?.transcript || e?.identity_line)

export default function Export() {
  const [encs, setEncs] = useState(null)
  const [error, setError] = useState(null)
  const [editionId, setEditionId] = useState(null)
  const [checked, setChecked] = useState(new Set())
  const [tokenOk, setTokenOk] = useState(hasHubspotToken)
  const [send, setSend] = useState(null) // { state: 'sending'|'processing'|'done'|'error', text }

  useEffect(() => onApiKeysChange((k) => setTokenOk(hasHubspotToken(k))), [])

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
    if (!encs) return []
    const m = new Map()
    for (const e of encs) {
      const id = e.edition_id ?? NO_EDITION
      if (!m.has(id)) m.set(id, { id, name: e.edition ? `${e.edition.series?.name} ${new Date(e.edition.start_date).getFullYear()}` : 'מפגשים ללא כנס', date: e.edition?.start_date ?? e.created_at, count: 0 })
      m.get(id).count++
    }
    return [...m.values()].sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [encs])

  // Default: the current conference from the field screen, otherwise the most recent one
  useEffect(() => {
    if (editionId || !conferences.length) return
    const pref = getPrefs().editionId
    setEditionId(conferences.some((c) => c.id === pref) ? pref : conferences[0].id)
  }, [conferences, editionId])

  // One lead per person: the latest encounter with them at this conference, plus their full history (all conferences)
  const leads = useMemo(() => {
    if (!encs || !editionId) return []
    const here = encs.filter((e) => (e.edition_id ?? NO_EDITION) === editionId && e.person)
    const byPerson = new Map()
    for (const e of here) if (!byPerson.has(e.person_id)) byPerson.set(e.person_id, e)
    return [...byPerson.values()].map((e) => ({
      person: e.person,
      encounter: e,
      history: encs.filter((x) => x.person_id === e.person_id),
      relevant: Boolean(e.person.phone) && hasContext(e),
    }))
  }, [encs, editionId])

  // Pre-check whenever the conference changes
  useEffect(() => {
    setChecked(new Set(leads.filter((l) => l.relevant).map((l) => l.person.id)))
    setSend(null)
  }, [leads])

  const selected = leads.filter((l) => checked.has(l.person.id))
  const conf = conferences.find((c) => c.id === editionId)

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

  return (
    <main className="page">
      <div className="page-head">
        <h1>ייצוא ל-HubSpot</h1>
        <p className="sub">מסומנים מראש: מי שיש לו טלפון והקשר. הורד סימון ממי שלא רלוונטי (ספקים, מתחרים). נוצרים אנשי קשר וחברות בלבד, בלי Deals.</p>
      </div>

      {conferences.length === 0 ? (
        <div className="card sub">עדיין אין מפגשים מתועדים.</div>
      ) : (
        <>
          <div style={{ marginBottom: 16, maxWidth: 420 }}>
            <label htmlFor="conf">כנס</label>
            <select id="conf" value={editionId ?? ''} onChange={(e) => setEditionId(e.target.value)}>
              {conferences.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
          </div>

          {!tokenOk && (
            <div className="notice info small" style={{ marginBottom: 16 }}>
              אין HubSpot token, ולכן רק הורדת CSV זמינה. את הקובץ אפשר לייבא ידנית ב-HubSpot → Contacts → Import. לשליחה אוטומטית, הוסף token ב<Link to="/settings">הגדרות</Link>.
            </div>
          )}

          <div className="row" style={{ marginBottom: 12 }}>
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

          <div className="stack" style={{ gap: 8 }}>
            {leads.map(({ person, encounter, history, relevant }) => {
              const missing = [!person.phone && 'חסר טלפון', !hasContext(encounter) && 'חסר הקשר'].filter(Boolean)
              return (
                <label key={person.id} className="card tight" style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 10, cursor: 'pointer', color: 'var(--text)', fontSize: 15, margin: 0 }}>
                  <input type="checkbox" checked={checked.has(person.id)} onChange={() => toggle(person.id)} style={{ width: 18, height: 18, marginTop: 3 }} />
                  <span>
                    <span className="row">
                      <strong>{fullName(person)}</strong>
                      <span className="sub small">{[person.current_title, person.current_company].filter(Boolean).join(' · ')}</span>
                      {missing.map((m) => (
                        <span key={m} className="tag warn">⚠️ {m}</span>
                      ))}
                      {history.length > 1 && <span className="tag info">{history.length} מפגשים</span>}
                    </span>
                    <span className="small sub" style={{ display: 'block', direction: 'ltr', textAlign: 'right' }}>{person.phone}</span>
                    {encounter.identity_line && <span className="small" style={{ display: 'block' }}>"{encounter.identity_line}"</span>}
                    {!relevant && <span className="small sub" style={{ display: 'block' }}>לא סומן מראש: {missing.join(', ')}</span>}
                  </span>
                </label>
              )
            })}
          </div>

          <div className="row" style={{ marginTop: 16, position: 'sticky', bottom: 0, background: 'var(--bg)', paddingTop: 12, paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
            {tokenOk && (
              <button onClick={sendToHubspot} disabled={!selected.length || busy}>
                שלח ל-HubSpot ({selected.length})
              </button>
            )}
            <button className="secondary" onClick={() => downloadCsv(csv(), csvFileName(conf?.name))} disabled={!selected.length}>
              הורד CSV ({selected.length})
            </button>
          </div>

          {send && <div className={`notice small ${send.state === 'error' ? 'bad' : send.state === 'done' ? 'good' : 'info'}`}>{send.text}</div>}
        </>
      )}
    </main>
  )
}
