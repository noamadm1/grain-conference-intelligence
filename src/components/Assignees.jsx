import { useState } from 'react'
import { addAssignment, removeAssignment } from '../lib/data'

// Reps assigned to a conference, plus manual assignment. "The system shows, the manager assigns."
// assignments === null means the table doesn't exist yet. In that case nothing is shown.
export default function Assignees({ editionId, assignments, onChange }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [err, setErr] = useState(null)
  if (assignments == null) return null

  const mine = assignments.filter((a) => a.edition_id === editionId)

  async function add(e) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    try {
      const row = await addAssignment(editionId, n)
      onChange([...assignments, row])
      setName('')
      setAdding(false)
      setErr(null)
    } catch (e) {
      setErr(e.code === '23505' ? 'כבר משובץ' : e.message)
    }
  }

  async function remove(a) {
    try {
      await removeAssignment(a.id)
      onChange(assignments.filter((x) => x.id !== a.id))
    } catch (e) {
      setErr(e.message)
    }
  }

  return (
    <div className="row small" style={{ marginTop: 10 }}>
      <span className="sub">משובצים:</span>
      {mine.length === 0 && <span className="sub">אף אחד</span>}
      {mine.map((a) => (
        <span key={a.id} className="tag info">
          {a.rep_name}{' '}
          <button className="ghost" style={{ padding: 0 }} onClick={() => remove(a)} aria-label={`הסר את ${a.rep_name}`}>
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <form onSubmit={add} className="row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם איש מכירות" autoFocus style={{ width: 150, padding: 6 }} />
          <button style={{ padding: '6px 12px' }}>הוסף</button>
          <button type="button" className="ghost" onClick={() => setAdding(false)}>
            ביטול
          </button>
        </form>
      ) : (
        <button className="ghost" onClick={() => setAdding(true)}>
          + שבץ
        </button>
      )}
      {err && <span style={{ color: 'var(--bad)' }}>{err}</span>}
    </div>
  )
}
