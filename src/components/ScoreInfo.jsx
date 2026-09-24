import { useEffect, useId, useRef, useState } from 'react'
import { scoreReasons } from '../lib/icp'
import { COST_QUALIFIER, REC } from '../lib/planning'

// (i) next to the score: why this recommendation, as a list of facts with ✓ / ⚠. No points:
// "36/50" invites "why not 40?", and there's no good answer — it's a calculation, not a fact.
// Closes on a second click, a click outside, or Escape.
export default function ScoreInfo({ edition, settings, detail }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const btn = useRef(null)
  const id = useId()
  const rec = REC[detail?.key]

  // The audience line always first (it's half the score), then ✓, then ⚠.
  // Cost is a reason only where it matters: inside "worth considering"
  const [audience, ...rest] = edition.series ? scoreReasons(edition, edition.series, settings) : []
  if (detail?.byCost) rest.push({ ok: detail.byCost === 'cheap', text: COST_QUALIFIER[detail.byCost] })
  const reasons = [...(audience ? [audience] : []), ...rest.filter((r) => r.ok), ...rest.filter((r) => !r.ok)]
  // What decided it: a list of equal-looking ✓ / ⚠ hides that one line outweighs the rest.
  // A weak audience decides only when the recommendation is low. When it's high (must / worth considering),
  // the other ✓ lines carried it despite the audience, and saying "the audience decides" would contradict the heading
  const highRec = detail?.key === 'must' || detail?.key === 'worth'
  const decided = !audience
    ? null
    : audience.ok
      ? 'הקהל מתאים, וזה חצי מהציון.'
      : highRec
        ? 'פחות מחצי מהמשתתפים לקוחות פוטנציאליים. ההמלצה נשענת על השאר (✓).'
        : 'הקהל הוא שקובע — רוב המשתתפים לא לקוחות פוטנציאליים.'

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
      <button ref={btn} type="button" className="info-btn" aria-label={rec ? `למה ${rec.label}` : 'למה הציון הזה'} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        i
      </button>
      {open && (
        <div className="popover" id={id} role="dialog" aria-label={rec ? `למה ${rec.label}` : 'למה הציון הזה'}>
          <p className="popover-head">{rec ? `למה ${rec.label}` : 'למה הציון הזה'}</p>
          {decided && <p className="decided">{decided}</p>}
          <ul className="reasons">
            {reasons.map((r) => (
              <li key={r.text} className={`${r.ok ? 'ok' : 'weak'} ${r.key === 'audience' ? 'lead' : ''}`}>
                <span className="mark" aria-hidden="true">{r.ok ? '✓' : '⚠'}</span>
                <span className="visually-hidden">{r.ok ? 'חוזקה: ' : 'חולשה: '}</span>
                {r.text}
              </li>
            ))}
          </ul>
          <p className="sub">מי בקהל זו הערכה שלנו לפי הנושאים והדוברים של הכנס, לא נתון רשמי של המארגנים.</p>
        </div>
      )}
    </span>
  )
}
