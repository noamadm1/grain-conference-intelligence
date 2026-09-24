import { useEffect, useId, useRef } from 'react'

// One filter button with a panel below it. The parent decides which panel is open (only one at a time).
// Closes on a click outside or Escape; Escape returns focus to the button.
// summary: what's selected, shown on the button ("אזור: אירופה, אסיה"). null = not active.
export default function FilterMenu({ label, summary, open, onOpenChange, children }) {
  const wrap = useRef(null)
  const btn = useRef(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const outside = (e) => wrap.current && !wrap.current.contains(e.target) && onOpenChange(false)
    const esc = (e) => {
      if (e.key !== 'Escape') return
      onOpenChange(false)
      btn.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', esc)
    }
  }, [open, onOpenChange])

  return (
    <div className="filter-menu" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className={`filter-btn ${summary ? 'on' : ''}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => onOpenChange(!open)}
        title={summary ? `${label}: ${summary}` : undefined}
      >
        <span className="filter-btn-text">{summary ? `${label}: ${summary}` : label}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="filter-panel" id={id} role="group" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  )
}
