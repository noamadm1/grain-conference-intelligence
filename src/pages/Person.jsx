import { Fragment, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { audioUrl, fetchEncounters, fetchPerson, setPersonStatus } from '../lib/data'
import { fullName } from '../lib/format'
import { personTags } from '../lib/tags'
import { retryProcessing, useJobs } from '../lib/processing'
import { FIELD_LABELS } from '../components/LeadResult.jsx'

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

  async function play(e) {
    const url = await audioUrl(e.audio_path)
    setAudio((a) => ({ ...a, [e.id]: url ?? 'error' }))
  }

  return (
    <main className="page">
      <Link to="/people">→ לכל אנשי הקשר</Link>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row">
          <h1 style={{ margin: 0 }}>{fullName(person)}</h1>
          {person.status === 'archived' && <span className="tag">ליד סגור</span>}
        </div>
        <p>{[person.current_title, person.current_company].filter(Boolean).join(' · ') || <span className="sub">אין פרטי תפקיד</span>}</p>
        <p style={{ direction: 'ltr', textAlign: 'right' }}>{person.phone}</p>
        {person.email && <p>{person.email}</p>}
        {pastCompanies.map((e) => (
          <p key={e.company} style={{ color: 'var(--warn)', marginTop: 6 }}>
            ⚠️ עבד/ה ב-{e.company} כשנפגשתם ב-{new Date(e.edition?.start_date ?? e.created_at).getFullYear()}
          </p>
        ))}

        {tags.length > 0 && (
          <div className="stack" style={{ marginTop: 12, gap: 6 }}>
            {tags.map((t) => (
              <div key={t.key} className="row">
                <span className={`tag ${t.tone}`}>{t.label}</span>
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
      {encs.length === 0 && <div className="card sub">אין עדיין מפגשים מתועדים.</div>}
      <div className="stack">
        {encs.map((e) => {
          const year = new Date(e.edition?.start_date ?? e.created_at).getFullYear()
          const said = e.identity_line || e.transcript
          // In label order, empty fields skipped (null, empty string, empty list)
          const fields = Object.keys(FIELD_LABELS)
            .filter((k) => k !== 'identity_line')
            .map((k) => [k, e.extracted?.[k]])
            .filter(([, v]) => (Array.isArray(v) ? v.length : v != null && String(v).trim()))
          return (
            <div key={e.id} className="card tight enc">
              <div className="row">
                <strong>{year}</strong>
                <span>· {e.edition?.series?.name ?? 'מפגש ללא כנס'}</span>
                {e.company && <span>· {e.company}</span>}
                {e.rep_name && <span className="sub">· פגש/ה: {e.rep_name}</span>}
              </div>
              {said ? (
                <p className="quote">"{said.length > 280 ? said.slice(0, 280) + '…' : said}"</p>
              ) : (
                <p className="quote" style={{ color: 'var(--warn)' }}>⚠️ אין הקשר. לא נרשם מה נאמר.</p>
              )}
              {e.audio_path && !e.extracted && (
                <div className="row" style={{ marginTop: 6 }}>
                  <span className="tag warn">
                    {RUNNING.includes(jobs.get(e.id)?.status) ? '⏳ מעבד את ההקלטה…' : '🎙️ ההקלטה עוד לא עובדה'}
                  </span>
                  {jobs.get(e.id)?.error && <span style={{ color: 'var(--bad)' }}>{jobs.get(e.id).error}</span>}
                  {!RUNNING.includes(jobs.get(e.id)?.status) && (
                    <button className="ghost" onClick={() => retryProcessing(e.id)}>
                      תמלל עכשיו
                    </button>
                  )}
                </div>
              )}
              {fields.length > 0 && (
                <dl className="fields">
                  {fields.map(([k, v]) => (
                    <Fragment key={k}>
                      <dt>{FIELD_LABELS[k]}</dt>
                      <dd className="val">{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
                    </Fragment>
                  ))}
                </dl>
              )}
              {e.audio_path &&
                (audio[e.id] && audio[e.id] !== 'error' ? (
                  <audio controls src={audio[e.id]} style={{ marginTop: 8, width: '100%' }} />
                ) : (
                  <button className="ghost" onClick={() => play(e)}>
                    {audio[e.id] === 'error' ? 'ההקלטה לא נטענה. נסה שוב' : '🎙️ השמע הקלטה'}
                  </button>
                ))}
            </div>
          )
        })}
      </div>
    </main>
  )
}
