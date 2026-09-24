import { Fragment, useState } from 'react'
import { saveEncounterFields } from '../lib/data'
import { retryProcessing } from '../lib/processing'

export const FIELD_LABELS = {
  identity_line: 'משפט זיהוי',
  pain: 'הבעיה',
  timing: 'מתי',
  currencies: 'מטבעות שהוזכרו',
  authority: 'מי מחליט',
  next_step: 'צעד הבא',
}

const STATUS = {
  queued: { tone: 'info', text: 'ממתין לעיבוד…' },
  transcribing: { tone: 'info', text: '🎙️ מתמלל…' },
  extracting: { tone: 'info', text: '✨ מחלץ שדות…' },
  done: { tone: 'good', text: '✓ עובד' },
  failed: { tone: 'bad', text: 'העיבוד נכשל' },
  'no-keys': { tone: 'warn', text: 'ממתין למפתח OpenAI' },
}

const toInput = (v) => (Array.isArray(v) ? v.join(', ') : v ?? '')
const fromInput = (k, s) => {
  const t = s.trim()
  if (!t) return null
  return k === 'currencies' ? t.split(/[,\s]+/).filter(Boolean).map((c) => c.toUpperCase()) : t
}

// Processing status for one lead + the result. Empty fields are marked [מלא] and the rep can fill them in.
export default function LeadResult({ job }) {
  const st = STATUS[job.status] ?? STATUS.queued
  const result = job.result
  const [values, setValues] = useState(null) // manual edits: key → string
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState(null)

  const fieldValue = (k) => (k === 'identity_line' ? result.identity_line : result.extracted?.[k])
  const missing = result ? Object.keys(FIELD_LABELS).filter((k) => fieldValue(k) == null) : []

  async function save() {
    const next = { identity_line: result.identity_line, extracted: { ...result.extracted } }
    for (const [k, s] of Object.entries(values ?? {})) {
      const v = fromInput(k, s)
      if (k === 'identity_line') next.identity_line = v
      else next.extracted[k] = v
    }
    try {
      await saveEncounterFields(job.id, next)
      Object.assign(result, next) // update the displayed result in place
      setValues(null)
      setSaved(true)
      setErr(null)
    } catch (e) {
      setErr(e.message)
    }
  }

  return (
    <div className="card tight">
      <div className="row">
        <strong>{job.label || 'ליד'}</strong>
        <span className={`tag ${st.tone}`}>{st.text}</span>
        <span className="spacer" />
        {['failed', 'no-keys'].includes(job.status) && (
          <button className="ghost" onClick={() => retryProcessing(job.id)}>
            נסה שוב
          </button>
        )}
      </div>
      {job.error && <p style={{ color: job.status === 'no-keys' ? 'var(--warn)' : 'var(--bad)', marginTop: 4 }}>{job.error}</p>}

      {result && (
        <div className="stack" style={{ gap: 6, marginTop: 8 }}>
          {/* Same grid as the Person screen. Here empty fields stay, as [מלא] inputs to fill in */}
          <dl className="fields" style={{ alignItems: 'center', marginTop: 0 }}>
            {Object.entries(FIELD_LABELS).map(([k, label]) => {
              const v = fieldValue(k)
              const editing = values && k in values
              return (
                <Fragment key={k}>
                  <dt>{label}</dt>
                  {v != null && !editing ? (
                    <dd className="val">{toInput(v)}</dd>
                  ) : (
                    <dd>
                      <input
                        value={values?.[k] ?? ''}
                        onChange={(e) => {
                          setSaved(false)
                          setValues({ ...values, [k]: e.target.value })
                        }}
                        placeholder="[מלא]"
                        style={{ padding: 8, borderColor: 'var(--warn)' }}
                      />
                    </dd>
                  )}
                </Fragment>
              )
            })}
          </dl>
          {missing.length > 0 && (
            <div className="row">
              <button className="secondary" style={{ padding: '6px 14px' }} onClick={save} disabled={!values || !Object.values(values).some((s) => s.trim())}>
                שמור השלמות
              </button>
              <span className="small sub">{missing.length} שדות לא הוזכרו בהקלטה</span>
            </div>
          )}
          {saved && <span style={{ color: 'var(--good)' }}>✓ ההשלמות נשמרו</span>}
          {err && <span style={{ color: 'var(--bad)' }}>{err}</span>}
          {result.transcript && (
            <details>
              <summary className="sub small" style={{ cursor: 'pointer' }}>תמלול מלא</summary>
              <p style={{ marginTop: 4 }}>{result.transcript}</p>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
