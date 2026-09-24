import { useEffect, useState } from 'react'
import { getPrefs, onPrefsChange, setPrefs } from '../lib/prefs'

// "היי {name}" in the top bar. Click to edit inline: Enter or leaving the field saves, Escape cancels.
// No name set → nothing is shown (the name is set on the field screen).
export default function Greeting() {
  const [name, setName] = useState(() => getPrefs().repName.trim())
  const [draft, setDraft] = useState(null) // null = not editing

  useEffect(() => onPrefsChange((p) => setName(p.repName.trim())), [])

  const save = () => {
    if (draft == null) return
    setPrefs({ repName: draft.trim() })
    setDraft(null)
  }

  if (draft != null) {
    return (
      <input
        className="greeting-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setDraft(null)
        }}
        placeholder="השם שלך"
        aria-label="השם שלך"
        autoFocus
      />
    )
  }

  if (!name) return null
  return (
    <button className="greeting" onClick={() => setDraft(name)} title="לחץ כדי לשנות את השם">
      היי {name}
    </button>
  )
}
