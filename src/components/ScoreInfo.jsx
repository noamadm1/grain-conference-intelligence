import { useEffect, useId, useRef, useState } from 'react'
import { scoreFacts } from '../lib/icp'
import { COST_QUALIFIER, REC } from '../lib/planning'

// (i) next to the score: "why {recommendation}", then the facts, one per line. No interpretation:
// no ✓ / ⚠, no "only", no bold, no summary. 5% and 63% need no adjective; the rep decides.
// Fixed order: audience, seniority, meetings, location, then cost (only in "worth considering").
// Closes on a second click, a click outside, or Escape.
export default function ScoreInfo({ edition, settings, detail }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const btn = useRef(null)
  const id = useId()
  const rec = REC[detail?.key]
  const title = rec ? `למה ${rec.label}` : 'למה הציון הזה'

  const facts = [
    ...(edition.series ? scoreFacts(edition, edition.series, settings) : []),
    ...(detail?.byCost ? [COST_QUALIFIER[detail.byCost]] : []),
  ]

  useEffect(() => {
    if (!open) return
    const outside = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
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
    <span className="score-info" ref={ref}>
      <button ref={btn} type="button" className="info-btn" aria-label={title} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        i
      </button>
      {open && (
        <div className="popover" id={id} role="dialog" aria-label={title}>
          <p className="popover-head">{title}</p>
          <ul className="facts">
            {facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
    </span>
  )
}
