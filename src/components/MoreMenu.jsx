import { useEffect, useId, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

// ⚙ at the end of the top bar: screens that aren't daily (settings, export).
// Closes on a click outside, Escape, or navigating to a page.
const ITEMS = [
  ['/settings', 'הגדרות'],
  ['/export', 'ייצוא ל-HubSpot'],
]

export default function MoreMenu() {
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)
  const btn = useRef(null)
  const id = useId()
  const { pathname } = useLocation()
  const here = ITEMS.some(([to]) => pathname.startsWith(to))

  useEffect(() => setOpen(false), [pathname])

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

  return (
    <div className="more-menu" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className={`more-btn ${here ? 'active' : ''}`}
        aria-label="הגדרות וייצוא"
        title="הגדרות וייצוא"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        ⚙
      </button>
      {open && (
        <nav className="more-panel" id={id} aria-label="הגדרות וייצוא">
          {ITEMS.map(([to, label]) => (
            <NavLink key={to} to={to}>
              {label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
