import { useEffect, useId, useRef, useState } from 'react'
import { addAssignment, removeAssignment } from '../lib/data'
import { REPS } from '../lib/reps'

// Reps assigned to a conference. "The system shows, the manager assigns."
// "+ שבץ" opens a list with a checkbox per rep: tick to assign, untick to remove, several at once.
// A new name can be typed at the bottom. assignments === null means the table doesn't exist yet: nothing is shown.
export default function Assignees({ editionId, assignments, onChange }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(null) // the rep name being saved
  const [err, setErr] = useState(null)
  const wrap = useRef(null)
  const btn = useRef(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const outside = (e) => wrap.current && !wrap.current.contains(e.target) && setOpen(false)
    const esc = (e) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      btn.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  if (assignments == null) return null

  const mine = assignments.filter((a) => a.edition_id === editionId)
  const assigned = new Map(mine.map((a) => [a.rep_name, a]))
  // The fixed list, plus any name already used in an assignment (typed in earlier)
  const names = [...new Set([...REPS, ...assignments.map((a) => a.rep_name)])]

  async function add(n) {
    setBusy(n)
    try {
      const row = await addAssignment(editionId, n)
      onChange([...assignments, row])
      setErr(null)
    } catch (e) {
      setErr(e.code === '23505' ? `${n} כבר משובץ/ת` : e.message)
    } finally {
      setBusy(null)
    }
  }

  async function remove(a) {
    setBusy(a.rep_name)
    try {
      await removeAssignment(a.id)
      onChange(assignments.filter((x) => x.id !== a.id))
      setErr(null)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(null)
    }
  }

  const toggle = (n) => (assigned.has(n) ? remove(assigned.get(n)) : add(n))

  async function addNew(e) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    if (!assigned.has(n)) await add(n)
    setName('')
  }

  return (
    <div className="row assignees" style={{ marginTop: 10 }}>
      <span className="sub small">משובצים:</span>
      {mine.length === 0 && <span className="sub">אף אחד</span>}
      {mine.map((a) => (
        <span key={a.id} className="tag info">
          {a.rep_name}{' '}
          <button className="ghost" style={{ padding: 0 }} onClick={() => remove(a)} disabled={busy === a.rep_name} aria-label={`הסר את ${a.rep_name}`}>
            ×
          </button>
        </span>
      ))}

      <div className="assign-menu" ref={wrap}>
        <button ref={btn} type="button" className="ghost" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
          + שבץ
        </button>
        {open && (
          <div className="filter-panel assign-panel" id={id} role="group" aria-label="שיבוץ אנשי מכירות">
            {names.map((n) => (
              <label key={n} className="filter-option">
                <input type="checkbox" checked={assigned.has(n)} disabled={busy === n} onChange={() => toggle(n)} />
                <span>{n}</span>
              </label>
            ))}
            <form onSubmit={addNew} className="assign-new">
              <label className="visually-hidden" htmlFor={`${id}-new`}>שם חדש</label>
              <input id={`${id}-new`} value={name} onChange={(e) => setName(e.target.value)} placeholder="שם חדש" />
              <button type="submit" className="secondary" disabled={!name.trim() || busy != null}>
                הוסף
              </button>
            </form>
          </div>
        )}
      </div>
      {err && <span style={{ color: 'var(--bad)' }}>{err}</span>}
    </div>
  )
}
