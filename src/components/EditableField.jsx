import { useRef, useState } from 'react'
import { saveEncounterFields } from '../lib/data'

// Any extracted field can be corrected, not only empty ones: Whisper makes mistakes in Hebrew ("ריבון" for "רבעון").
// Click the value (or focus it and press Enter) to edit. Enter or leaving the field saves, Escape cancels.

export const toInput = (v) => (Array.isArray(v) ? v.join(', ') : v ?? '')
export const fromInput = (k, s) => {
  const t = s.trim()
  if (!t) return null
  return k === 'currencies' ? t.split(/[,\s]+/).filter(Boolean).map((c) => c.toUpperCase()) : t
}

// Save one field of an encounter. Same path as "שמור השלמות": the whole { identity_line, extracted } is written.
// Returns the new { identity_line, extracted } so the caller can update what it shows.
export async function saveEncounterField(encounterId, current, key, value) {
  const next = { identity_line: current.identity_line ?? null, extracted: { ...(current.extracted ?? {}) } }
  if (key === 'identity_line') next.identity_line = value
  else next.extracted[key] = value
  await saveEncounterFields(encounterId, next)
  return next
}

export default function EditableField({ field, value, onSave, label, placeholder = '[מלא]' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [state, setState] = useState(null) // null | 'saving' | 'saved' | error message
  const done = useRef(false) // Escape then blur (the input unmounts): don't save after a cancel
  const empty = value == null || (Array.isArray(value) && !value.length) || value === ''

  const start = () => {
    done.current = false
    setDraft(toInput(value))
    setState(null)
    setEditing(true)
  }

  async function commit() {
    if (done.current) return
    done.current = true
    setEditing(false)
    const next = fromInput(field, draft)
    if (toInput(next) === toInput(value)) return // nothing changed
    setState('saving')
    try {
      await onSave(next)
      setState('saved')
      setTimeout(() => setState((s) => (s === 'saved' ? null : s)), 1500)
    } catch (e) {
      setState(e.message || 'השמירה נכשלה')
    }
  }

  const cancel = () => {
    done.current = true
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        className="field-input"
        value={draft}
        autoFocus
        aria-label={label ? `עריכת ${label}` : 'עריכה'}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') cancel()
        }}
      />
    )
  }

  return (
    <>
      <span
        className={`editable ${empty ? 'empty' : ''}`}
        role="button"
        tabIndex={0}
        title="לחץ לעריכה"
        aria-label={label ? `${label}: ${empty ? 'ריק' : toInput(value)}. לחץ לעריכה` : undefined}
        onClick={start}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            start()
          }
        }}
      >
        {empty ? placeholder : toInput(value)}
      </span>
      {state === 'saving' && <span className="field-state">שומר…</span>}
      {state === 'saved' && <span className="field-state ok">✓ נשמר</span>}
      {state && !['saving', 'saved'].includes(state) && <span className="field-state bad">{state}</span>}
    </>
  )
}
