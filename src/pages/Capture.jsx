import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAllEditions, lookupByPhone } from '../lib/data'
import { fullName, isPlausiblePhone, toE164 } from '../lib/format'
import { enqueue, flush, listPending } from '../lib/outbox'
import { getPrefs, onPrefsChange, setPrefs } from '../lib/prefs'
import { hasApiKeys, onApiKeysChange } from '../lib/apiKeys'
import { useJobs } from '../lib/processing'
import LeadResult from '../components/LeadResult.jsx'

// Field capture (PRD 7): lead documentation in 20 seconds, one hand, poor reception.
// Only the phone is required. Everything is saved on the device first and sent when there's a connection.

function useRecorder() {
  const [state, setState] = useState('idle') // idle | recording | done | error
  const [blob, setBlob] = useState(null)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState(null)
  const rec = useRef(null)
  const timer = useRef(null)

  async function start() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => window.MediaRecorder?.isTypeSupported?.(t))
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
      const chunks = []
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        setBlob(new Blob(chunks, { type: r.mimeType || type || 'audio/webm' }))
        setState('done')
      }
      r.start()
      rec.current = r
      setSeconds(0)
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000)
      setState('recording')
    } catch (e) {
      setError(e.name === 'NotAllowedError' ? 'אין הרשאה למיקרופון' : 'לא ניתן להקליט במכשיר הזה')
      setState('error')
    }
  }

  function stop() {
    clearInterval(timer.current)
    rec.current?.state === 'recording' && rec.current.stop()
  }

  function reset() {
    stop()
    setBlob(null)
    setSeconds(0)
    setState('idle')
  }

  useEffect(() => () => clearInterval(timer.current), [])
  return { state, blob, seconds, error, start, stop, reset }
}

// Marcus Weber from the demo data (scripts/seed-demo.js, pid(1)): three fully processed encounters
const DEMO_TRANSCRIBED_PERSON = '00000000-0000-4000-8000-000000000101'

// "Money20/20 Europe 2026": the year tells apart editions of the same conference
const editionName = (e) => `${e.series?.name ?? e.id} ${new Date(e.start_date).getFullYear()}`

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function Capture() {
  const [prefs, setP] = useState(getPrefs)
  const [editions, setEditions] = useState([])
  const [editingSetup, setEditingSetup] = useState(!getPrefs().repName)

  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [title, setTitle] = useState('')
  const [match, setMatch] = useState(null) // { person, encounters }
  const [status, setStatus] = useState(null) // { tone, text }
  const [pending, setPending] = useState(0)
  const phoneRef = useRef(null)
  const recorder = useRecorder()
  const jobs = useJobs()
  const [keysOk, setKeysOk] = useState(hasApiKeys)
  useEffect(() => onApiKeysChange((k) => setKeysOk(hasApiKeys(k))), [])

  const e164 = toE164(phone, prefs.countryCode)
  const phoneOk = isPlausiblePhone(e164)
  const currentEdition = editions.find((e) => e.id === prefs.editionId)

  useEffect(() => {
    fetchAllEditions().then(setEditions).catch(() => {})
    listPending().then((l) => setPending(l.length)).catch(() => {})
    const sync = () => flush().then((r) => setPending(r.pending)).catch(() => {})
    sync()
    window.addEventListener('online', sync)
    return () => window.removeEventListener('online', sync)
  }, [])

  // Instant duplicate check: "you met Sarah at Money20/20 2025"
  useEffect(() => {
    setMatch(null)
    if (!phoneOk || !navigator.onLine) return
    const t = setTimeout(() => {
      lookupByPhone(e164)
        .then((m) => {
          setMatch(m)
          if (m && !name) setName(fullName(m.person) === 'ללא שם' ? '' : fullName(m.person))
        })
        .catch(() => {})
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e164, phoneOk])

  const updatePrefs = (patch) => setP(setPrefs(patch))
  // The name can also change from the greeting in the top bar
  useEffect(
    () =>
      onPrefsChange((p) => {
        setP(p)
        if (!p.repName.trim()) setEditingSetup(true) // Name cleared: back to setup, a lead needs a rep
      }),
    [],
  )

  async function save(ev) {
    ev.preventDefault()
    if (!phoneOk || recorder.state === 'recording') return
    await enqueue({
      phone: e164,
      name: name.trim(),
      company: company.trim(),
      title: title.trim(),
      repName: prefs.repName,
      editionId: prefs.editionId,
      audio: recorder.blob ?? null,
    })
    const savedName = name.trim() || e164
    setPhone('')
    setName('')
    setCompany('')
    setTitle('')
    setMatch(null)
    recorder.reset()
    phoneRef.current?.focus()

    const r = await flush().catch((e) => ({ pending: 1, error: e.message }))
    setPending(r.pending)
    setStatus(
      r.pending === 0
        ? { tone: 'good', text: `✓ ${savedName} נשמר` }
        : { tone: 'warn', text: `✓ ${savedName} נשמר במכשיר. יישלח אוטומטית כשיהיה חיבור.${r.error ? ` (${r.error})` : ''}` },
    )
  }

  const lastMet = match?.encounters?.[0]

  return (
    <main className="page narrow">
      {/* Device settings: who am I, which conference, the country code. Set once per conference, not part of the lead */}
      {editingSetup ? (
        <section className="card stack setup-panel" style={{ marginBottom: 16 }} aria-labelledby="setup-head">
          <div>
            <h2 id="setup-head" className="form-section-head">הגדרות המכשיר</h2>
            <p className="sub small">נקבע פעם אחת לכנס ונשמר במכשיר הזה. לא חלק מהליד.</p>
          </div>
          <div>
            <label htmlFor="rep">השם שלך</label>
            <input id="rep" value={prefs.repName} onChange={(e) => updatePrefs({ repName: e.target.value })} placeholder="למשל: דנה לוי" />
          </div>
          <div>
            <label htmlFor="ed">הכנס</label>
            {/* Upcoming first (soonest first), then past ones (newest first): a lead can be recorded after the event */}
            <select id="ed" value={prefs.editionId} onChange={(e) => updatePrefs({ editionId: e.target.value })}>
              <option value="">ללא כנס</option>
              <optgroup label="כנסים קרובים">
                {editions
                  .filter((e) => e.status !== 'historical')
                  .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {editionName(e)} · {e.city}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="כנסים שהיו">
                {editions
                  .filter((e) => e.status === 'historical')
                  .sort((a, b) => new Date(b.start_date) - new Date(a.start_date))
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {editionName(e)} · {e.city}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>
          <div>
            <label htmlFor="cc">קידומת מדינה למספרים מקומיים</label>
            <input id="cc" className="ltr" inputMode="numeric" value={prefs.countryCode} onChange={(e) => updatePrefs({ countryCode: e.target.value.replace(/\D/g, '') })} />
          </div>
          <button type="button" onClick={() => setEditingSetup(false)} disabled={!prefs.repName.trim()}>
            המשך
          </button>
        </section>
      ) : (
        // Where am I: only the conference. The rep's name is in the top bar greeting, a device setting, not part of the lead
        <div className="capture-head">
          <div className="capture-where">
            <span className="capture-conf">{currentEdition ? editionName(currentEdition) : 'ללא כנס'}</span>
          </div>
          <button className="ghost" onClick={() => setEditingSetup(true)}>
            שנה
          </button>
          {pending > 0 && <span className="tag warn">{pending} ממתינים לשליחה</span>}
        </div>
      )}

      <form className="stack capture-form" onSubmit={save}>
        <section className="form-section" aria-labelledby="sec-customer">
          <h2 id="sec-customer" className="form-section-head">פרטי לקוח</h2>
          <div>
            <label htmlFor="phone">
              {/* The input is 'required', so screen readers announce it: the asterisk is visual only */}
              טלפון <span className="req" aria-hidden="true">*</span>
            </label>
            <input
              id="phone"
              ref={phoneRef}
              className="ltr"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              autoFocus={!editingSetup}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                setStatus(null)
              }}
              placeholder="050-1234567 או +44…"
              required
            />
            {phone && !phoneOk && <p style={{ marginTop: 4, color: 'var(--warn)' }}>מספר לא שלם</p>}
            {phoneOk && <p className="sub" style={{ marginTop: 4, direction: 'ltr', textAlign: 'right' }}>{e164}</p>}
          </div>

          {match && (
            <div className="notice info">
              <strong>{fullName(match.person)}</strong>
              {match.person.current_company ? ` · ${match.person.current_company}` : ''}
              <br />
              {lastMet ? (
                <>
                  פגשת {match.encounters.length > 1 ? `${match.encounters.length} פעמים, לאחרונה ` : ''}
                  ב-{lastMet.edition?.series?.name ?? 'מפגש'} {new Date(lastMet.edition?.start_date ?? lastMet.created_at).getFullYear()}
                  {lastMet.rep_name ? ` (${lastMet.rep_name})` : ''}
                  {lastMet.identity_line ? <div>"{lastMet.identity_line}"</div> : null}
                </>
              ) : (
                'קיים במערכת, עדיין בלי מפגשים'
              )}
              <div>
                <Link to={`/people/${match.person.id}`}>
                  להיסטוריה המלאה ←
                </Link>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="name">שם</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="company">חברה</label>
            <input id="company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder={match?.person.current_company ?? ''} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="title">תפקיד</label>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={match?.person.current_title ?? 'למשל: VP Treasury'} autoComplete="off" />
          </div>
        </section>

        <section className="form-section" aria-labelledby="sec-summary">
          <h2 id="sec-summary" className="form-section-head">סיכום השיחה</h2>
          {/* No key is a setup step, not a fault: explain the feature and show a processed example */}
          {!keysOk && (
            <div className="notice info ai-explainer" style={{ marginBottom: 12 }}>
              <strong>🎙️ תמלול AI</strong>
              <p>הקלטות מתומללות אוטומטית עם Whisper ומחולצות לשדות מובנים.</p>
              <p>דורש מפתח OpenAI אישי — הבריף מחייב שמפתחות יוגדרו על ידי המשתמש ולא בקוד.</p>
              <Link to={`/people/${DEMO_TRANSCRIBED_PERSON}`}>ראה דוגמה מתומללת →</Link>
              <Link to="/settings">להגדרת מפתח ←</Link>
            </div>
          )}

          {recorder.state === 'recording' ? (
            <button type="button" className="big secondary" onClick={recorder.stop}>
              <span className="rec-dot" />
              עצור הקלטה · {mmss(recorder.seconds)}
            </button>
          ) : recorder.state === 'done' ? (
            <div className="row">
              <span className="tag good">🎙️ הקלטה {mmss(recorder.seconds)} ✓</span>
              <button type="button" className="ghost" onClick={recorder.reset}>
                מחק והקלט שוב
              </button>
            </div>
          ) : (
            <button type="button" className="big secondary" onClick={recorder.start}>
              🎙️ הקלט סיכום
            </button>
          )}
          {recorder.state !== 'done' && (
            <p className="sub" style={{ marginTop: -6 }}>
              נסה לכלול: מה הבעיה, מתי, מי מחליט
            </p>
          )}
          {recorder.error && <p style={{ color: 'var(--bad)' }}>{recorder.error}</p>}
        </section>


        <button type="submit" className="big" disabled={!phoneOk || recorder.state === 'recording'}>
          {recorder.state === 'recording' ? 'עצור את ההקלטה כדי לשמור' : 'שמור'}
        </button>

        {status && <div className={`notice ${status.tone}`}>{status.text}</div>}
      </form>

      {jobs.size > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2>עיבוד הקלטות</h2>
          <div className="stack">
            {[...jobs.values()].reverse().map((job) => (
              <LeadResult key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
