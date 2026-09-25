import { Fragment, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { audioUrl, fetchEncounters, fetchPerson, setPersonStatus } from '../lib/data'
import { fullName } from '../lib/format'
import { personTags } from '../lib/tags'
import PersonTag from '../components/PersonTag.jsx'
import { retryProcessing, useJobs } from '../lib/processing'
import { FIELD_LABELS } from '../components/LeadResult.jsx'
import EditableField, { saveEncounterField } from '../components/EditableField.jsx'
import SuggestedActions from '../components/SuggestedActions.jsx'
import FollowUpEmail from '../components/FollowUpEmail.jsx'
import { hasApiKeys, onApiKeysChange } from '../lib/apiKeys'

const RUNNING = ['queued', 'transcribing', 'extracting']


// Person screen (PRD 8): the history is the interpretation. No score and no automatic conclusion.
export default function Person() {
  const { id } = useParams()
  const [person, setPerson] = useState(null)
  const [encs, setEncs] = useState([])
  const [error, setError] = useState(null)
  const [audio, setAudio] = useState({}) // encounterId → url

  useEffect(() => {
    Promise.all([fetchPerson(id), fetchEncounters(id)])
      .then(([p, e]) => {
        setPerson(p)
        setEncs(e)
      })
      .catch((e) => setError(e.message))
  }, [id])

  // When background processing finishes for one of these encounters, reload so the result shows up
  const jobs = useJobs()
  const justDone = encs.some((e) => e.audio_path && !e.extracted && jobs.get(e.id)?.status === 'done')
  useEffect(() => {
    if (justDone) fetchEncounters(id).then(setEncs).catch(() => {})
  }, [justDone, id])

  // The AI features (next actions, follow-up email) need the rep's own OpenAI key
  const [keysOk, setKeysOk] = useState(hasApiKeys)
  useEffect(() => onApiKeysChange((k) => setKeysOk(hasApiKeys(k))), [])

  // All hooks are above this line: nothing below may call a hook, because of the early returns (Rules of Hooks)
  if (error) return <main className="page"><div className="notice bad">שגיאה: {error}</div></main>
  if (!person) return <main className="page"><p className="sub">טוען…</p></main>

  const tags = personTags(person, encs)
  // "Changed company" is an info field, not a tag: it avoids an awkward moment and points to a warm contact at the new company.
  const pastCompanies = [...new Map(encs.filter((e) => e.company && e.company !== person.current_company).map((e) => [e.company, e])).values()]

  async function toggleStatus() {
    const next = person.status === 'archived' ? 'active' : 'archived'
    await setPersonStatus(person.id, next)
    setPerson({ ...person, status: next })
  }

  // Correct a field (Whisper errors): save, then show the new value in place
  const saveField = (e, k) => async (v) => {
    const next = await saveEncounterField(e.id, e, k, v)
    setEncs((list) => list.map((x) => (x.id === e.id ? { ...x, ...next } : x)))
  }

  async function play(e) {
    const url = await audioUrl(e.audio_path)
    setAudio((a) => ({ ...a, [e.id]: url ?? 'error' }))
  }

  return (
    <main className="page">
      <Link to="/people">→ לכל הלידים</Link>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row">
          <h1 style={{ margin: 0 }}>{fullName(person)}</h1>
          {person.status === 'archived' && <span className="tag">ליד סגור</span>}
        </div>
        <p>{[person.current_title, person.current_company].filter(Boolean).join(' · ') || <span className="sub">אין פרטי תפקיד</span>}</p>
        <p style={{ direction: 'ltr', textAlign: 'right' }}>{person.phone}</p>
        {person.email && <p>{person.email}</p>}
        {pastCompanies.map((e) => (
          // Information, not a warning: avoids an awkward moment, and means a warm contact at the old company
          <p key={e.company} className="sub">
            ב-{new Date(e.edition?.start_date ?? e.created_at).getFullYear()} נפגשתם כשעבד/ה ב-{e.company}
          </p>
        ))}

        {tags.length > 0 && (
          <div className="stack" style={{ marginTop: 12, gap: 6 }}>
            {tags.map((t) => (
              <div key={t.key} className="row">
                <PersonTag tag={t} />
                <span>{t.hint}</span>
              </div>
            ))}
          </div>
        )}

        <div className="row" style={{ marginTop: 16 }}>
          <button className="secondary" onClick={toggleStatus}>
            {person.status === 'archived' ? 'פתח מחדש' : 'סגור ליד'}
          </button>
        </div>
      </div>

      <h2 style={{ marginTop: 24 }}>{encs.length} מפגשים</h2>
      {/* No key is a setup step, not a fault: explain the features (same kind of box as on the new-lead screen) */}
      {!keysOk && encs.length > 0 && (
        <div className="notice info ai-explainer" style={{ marginBottom: 12 }}>
          <strong>מייל מעקב עם AI</strong>
          <p>לכל מפגש: טיוטת מייל מעקב באנגלית, על סמך מה שנאמר בשיחה. נוצרת עם GPT-4o-mini.</p>
          <p>דורש מפתח OpenAI אישי — הבריף מחייב שמפתחות יוגדרו על ידי המשתמש ולא בקוד.</p>
          <Link to="/settings">להגדרת מפתח ←</Link>
        </div>
      )}
      {encs.length === 0 && <div className="card sub">אין עדיין מפגשים מתועדים.</div>}
      <div className="stack">
        {encs.map((e) => {
          const year = new Date(e.edition?.start_date ?? e.created_at).getFullYear()
          const job = jobs.get(e.id)
          // All fields in label order, empty ones as [מלא] so the rep can fill them in here too.
          // Not while a recording is still waiting for the AI: its result would overwrite what the rep typed
          const pending = Boolean(e.audio_path && !e.extracted)
          const fields = Object.keys(FIELD_LABELS)
            .filter((k) => k !== 'identity_line')
            .map((k) => [k, e.extracted?.[k]])
          return (
            <article key={e.id} className="card enc">
              {/* Header: year big, conference next to it; at the far (left) edge the rep and "נסח מייל". Company (at the time) below */}
              <header className="enc-head">
                <span className="enc-year">{year}</span>
                <span className="enc-conf">{e.edition?.series?.name ?? 'מפגש ללא כנס'}</span>
                <span className="enc-head-end">
                  {e.rep_name && <span className="enc-rep">{e.rep_name}</span>}
                  {keysOk && !pending && <FollowUpEmail person={person} encounter={e} encounters={encs} />}
                </span>
              </header>
              {e.company && <p className="enc-company">{e.company}</p>}

              <div className="enc-divider" />

              {!pending && (
                <p className="enc-identity">
                  {e.identity_line ? (
                    <>
                      "<EditableField field="identity_line" label={FIELD_LABELS.identity_line} value={e.identity_line} onSave={saveField(e, 'identity_line')} />"
                    </>
                  ) : (
                    <EditableField field="identity_line" label={FIELD_LABELS.identity_line} value={null} placeholder="[מלא משפט זיהוי]" onSave={saveField(e, 'identity_line')} />
                  )}
                </p>
              )}
              {/* A lead with no context at all: flagged (PRD 7), and the [מלא] fields below are where it gets filled in */}
              {!e.identity_line && !e.transcript && !e.audio_path && <p className="enc-no-context">אין הקשר. לא נרשם מה נאמר.</p>}

              {e.audio_path && !e.extracted && (
                <div className="row" style={{ marginTop: 6 }}>
                  <span className="tag warn">{RUNNING.includes(job?.status) ? 'מעבד את ההקלטה…' : 'ההקלטה עוד לא עובדה'}</span>
                  {job?.error && <span style={{ color: 'var(--bad)' }}>{job.error}</span>}
                  {!RUNNING.includes(job?.status) && (
                    <button className="ghost" onClick={() => retryProcessing(e.id)}>
                      תמלל עכשיו
                    </button>
                  )}
                </div>
              )}

              {!pending && (
                <dl className="fields enc-fields">
                  {fields.map(([k, v]) => (
                    <Fragment key={k}>
                      <dt>{FIELD_LABELS[k]}</dt>
                      <dd className="val">
                        <EditableField field={k} label={FIELD_LABELS[k]} value={v} onSave={saveField(e, k)} />
                      </dd>
                    </Fragment>
                  ))}
                </dl>
              )}

              {/* AI-generated: say so, and let the rep read the source */}
              {!pending && (
                <SuggestedActions
                  e={e}
                  keysOk={keysOk}
                  onSaved={(list) => setEncs((all) => all.map((x) => (x.id === e.id ? { ...x, suggested_actions: list } : x)))}
                />
              )}

              {e.transcript && <Transcript text={e.transcript} />}

              {e.audio_path && <AudioPlayer e={e} url={audio[e.id]} onLoad={() => play(e)} />}

            </article>
          )
        })}
      </div>
    </main>
  )
}

// "Transcribed from a recording · show transcript ▾": marks the encounter as AI-generated and opens the source
function Transcript({ text }) {
  const [open, setOpen] = useState(false)
  return (
    <details className="enc-transcript" onToggle={(ev) => setOpen(ev.currentTarget.open)}>
      <summary>תומלל מהקלטה · {open ? 'הסתר תמלול ▴' : 'הצג תמלול ▾'}</summary>
      <p>{text}</p>
    </details>
  )
}

function AudioPlayer({ e, url, onLoad }) {
  const loaded = url && url !== 'error'
  return (
    <div className="audio-box">
      <span className="audio-label">הקלטה קולית{e.rep_name ? ` של ${e.rep_name}` : ''}</span>
      {loaded ? (
        <audio controls autoPlay src={url} aria-label="הקלטה קולית של המפגש" />
      ) : (
        <button type="button" className="secondary audio-play" onClick={onLoad}>
          <span aria-hidden="true">▶</span> {url === 'error' ? 'ההקלטה לא נטענה. נסה שוב' : 'השמע הקלטה'}
        </button>
      )}
    </div>
  )
}
