import { useEffect, useId, useRef, useState } from 'react'

const ROWS = [
  ['audience', 'איכות קהל'],
  ['seniority', 'בכירות'],
  ['access', 'נגישות'],
  ['geo', 'גיאוגרפיה'],
]

// (i) next to the score: what the score measures, and how it breaks down.
// Closes on a second click, a click outside, or Escape.
export default function ScoreInfo({ breakdown, points }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const outside = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <span className="score-info" ref={ref}>
      <button type="button" className="info-btn" aria-label="מה הציון אומר" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
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
                  <dd>
                    {Math.round(breakdown[k] ?? 0)}/{points[k]}
                  </dd>
                </div>
              ))}
              {breakdown.penalty > 0 && (
                <div>
                  <dt>עונש מסה קריטית</dt>
                  <dd>−{breakdown.penalty}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="sub">אין עדיין פירוק לציון.</p>
          )}
          <p className="sub small">בכירות, נגישות וגיאוגרפיה נספרות חלקית לפי התאמת הקהל: נגישות מלאה שווה פחות כשיש מעט אנשים רלוונטיים.</p>
          <p className="sub small">⚠️ פילוח הקהל לסגמנטים הוא הערכה לפי תוכן הכנס, לא נתון מדוד.</p>
        </div>
      )}
    </span>
  )
}
