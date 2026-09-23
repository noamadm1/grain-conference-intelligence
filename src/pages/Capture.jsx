import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchUpcoming, lookupByPhone } from '../lib/data'
import { fullName, isPlausiblePhone, toE164 } from '../lib/format'
import { enqueue, flush, listPending } from '../lib/outbox'
import { getPrefs, setPrefs } from '../lib/prefs'
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

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function Capture() {
  const [prefs, setP] = useState(getPrefs)
  const [editions, setEditions] = useState([])
  const [editingSetup, setEditingSetup] = useState(!getPrefs().repName)

  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
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
    fetchUpcoming().then(setEditions).catch(() => {})
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

  async function save(ev) {
    ev.preventDefault()
    if (!phoneOk || recorder.state === 'recording') return
    await enqueue({
      phone: e164,
      name: name.trim(),
      company: company.trim(),
      repName: prefs.repName,
      editionId: prefs.editionId,
      audio: recorder.blob ?? null,
    })
    const savedName = name.trim() || e164
    setPhone('')
    setName('')
    setCompany('')
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
      {/* Who am I, and where. Set once per conference. */}
      {editingSetup ? (
        <div className="card stack" style={{ marginBottom: 16 }}>
          <div>
            <label htmlFor="rep">השם שלך</label>
            <input id="rep" value={prefs.repName} onChange={(e) => updatePrefs({ repName: e.target.value })} placeholder="למשל: דנה" />
          </div>
          <div>
            <label htmlFor="ed">הכנס הנוכחי</label>
            <select id="ed" value={prefs.editionId} onChange={(e) => updatePrefs({ editionId: e.target.value })}>
              <option value="">ללא כנס</option>
              {[...editions]
                .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.series?.name} · {e.city}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="cc">קידומת מדינה למספרים מקומיים</label>
            <input id="cc" className="ltr" inputMode="numeric" value={prefs.countryCode} onChange={(e) => updatePrefs({ countryCode: e.target.value.replace(/\D/g, '') })} />
          </div>
          <button type="button" onClick={() => setEditingSetup(false)} disabled={!prefs.repName.trim()}>
            המשך
          </button>
        </div>
      ) : (
        <div className="row small sub" style={{ marginBottom: 12 }}>
          <span>
            {prefs.repName} · {currentEdition ? currentEdition.series?.name : 'ללא כנס'}
          </span>
          <button className="ghost" onClick={() => setEditingSetup(true)}>
            שנה
          </button>
          <span className="spacer" />
          {pending > 0 && <span className="tag warn">{pending} ממתינים לשליחה</span>}
        </div>
      )}

      {!keysOk && (
        <div className="notice warn small" style={{ marginBottom: 12 }}>
          ⚠️ חסר מפתח OpenAI, ולכן הקלטות יישמרו אבל לא יתומללו. <Link to="/settings">להגדרות ←</Link>
        </div>
      )}

      <form className="stack" onSubmit={save}>
        <div>
          <label htmlFor="phone">📞 טלפון *</label>
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
          {phone && !phoneOk && <p className="small sub" style={{ marginTop: 4 }}>מספר לא שלם</p>}
          {phoneOk && <p className="small sub" style={{ marginTop: 4, direction: 'ltr', textAlign: 'right' }}>{e164}</p>}
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
                {lastMet.identity_line ? <div className="small">"{lastMet.identity_line}"</div> : null}
              </>
            ) : (
              'קיים במערכת, עדיין בלי מפגשים'
            )}
            <div>
              <Link to={`/people/${match.person.id}`} className="small">
                להיסטוריה המלאה ←
              </Link>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="name">👤 שם</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="company">🏢 חברה</label>
          <input id="company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder={match?.person.current_company ?? ''} autoComplete="off" />
        </div>

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
          <p className="small sub" style={{ marginTop: -6 }}>
            נסה לכלול: מה הבעיה, מתי, מי מחליט
          </p>
        )}
        {recorder.error && <p className="small" style={{ color: 'var(--bad)' }}>{recorder.error}</p>}

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
