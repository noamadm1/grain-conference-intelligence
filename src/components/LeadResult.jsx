import { Fragment, useState } from 'react'
import EditableField, { saveEncounterField } from './EditableField.jsx'
import { retryProcessing } from '../lib/processing'

export const FIELD_LABELS = {
  identity_line: 'משפט זיהוי',
  pain: 'הבעיה',
  timing: 'מתי',
  currencies: 'מטבעות',
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

// Processing status for one lead + the result. Every field can be corrected (click to edit),
// and empty ones are marked [מלא] so the rep fills them in.
export default function LeadResult({ job }) {
  const st = STATUS[job.status] ?? STATUS.queued
  const result = job.result
  const [, rerender] = useState(0)

  const fieldValue = (k) => (k === 'identity_line' ? result.identity_line : result.extracted?.[k])
  const missing = result ? Object.keys(FIELD_LABELS).filter((k) => fieldValue(k) == null) : []

  const saveField = (k) => async (v) => {
    const next = await saveEncounterField(job.id, result, k, v)
    Object.assign(result, next) // update the displayed result in place
    rerender((n) => n + 1)
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
          {/* Same grid as the Person screen. Every value is editable; empty ones show [מלא] */}
          <dl className="fields" style={{ alignItems: 'center', marginTop: 0 }}>
            {Object.entries(FIELD_LABELS).map(([k, label]) => (
              <Fragment key={k}>
                <dt>{label}</dt>
                <dd className="val">
                  <EditableField field={k} label={label} value={fieldValue(k)} onSave={saveField(k)} />
                </dd>
              </Fragment>
            ))}
          </dl>
          {missing.length > 0 && <span className="small sub">{missing.length} שדות לא הוזכרו בהקלטה. לחץ על [מלא] כדי להשלים</span>}
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
