import { useEffect, useId, useRef, useState } from 'react'
import { componentReasons } from '../lib/icp'

const ROWS = [
  ['audience', 'איכות קהל'],
  ['seniority', 'בכירות'],
  ['access', 'נגישות'],
  ['geo', 'גיאוגרפיה'],
]

// (i) next to the score: what the score measures, each component with its points and a one-line reason.
// This replaces the explanation sentence on the card. Closes on a second click, a click outside, or Escape.
export default function ScoreInfo({ edition, settings }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const btn = useRef(null)
  const id = useId()
  const breakdown = edition.icp_breakdown
  const reasons = edition.series ? componentReasons(edition, edition.series, settings) : {}

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
      <button ref={btn} type="button" className="info-btn" aria-label="פירוט הציון" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        i
      </button>
      {open && (
        <div className="popover" id={id} role="dialog" aria-label="פירוט הציון">
          <p>התאמת קהל ל-ICP של Grain. העלות מוצגת בנפרד.</p>
          {breakdown ? (
            <dl className="breakdown">
              {ROWS.map(([k, label]) => (
                <div key={k}>
                  <dt>{label}</dt>
                  <dd className="pts">
                    {Math.round(breakdown[k] ?? 0)}/{settings.points[k]}
                  </dd>
                  <dd className="why">{reasons[k]}</dd>
                </div>
              ))}
              {breakdown.penalty > 0 && (
                <div>
                  <dt>עונש מסה</dt>
                  <dd className="pts">−{breakdown.penalty}</dd>
                  <dd className="why">רק כ-{Number(breakdown.icp_volume).toLocaleString('en-US')} אנשי ICP</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="sub">אין עדיין פירוק לציון.</p>
          )}
          <p className="sub">בכירות, נגישות וגיאוגרפיה נספרות חלקית לפי התאמת הקהל: נגישות מלאה שווה פחות כשיש מעט אנשים רלוונטיים.</p>
          <p className="sub">⚠️ פילוח הקהל לסגמנטים הוא הערכה לפי תוכן הכנס, לא נתון מדוד.</p>
        </div>
      )}
    </span>
  )
}
