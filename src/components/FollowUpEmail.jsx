import { useEffect, useId, useRef, useState } from 'react'
import { draftFollowUp } from '../lib/ai'
import { getApiKeys } from '../lib/apiKeys'

// "נסח מייל": a ready follow-up email in English, from this encounter and the person's history.
// Generated on demand, not stored. Text only: copy it, the app never sends anything.
// Closes on a second click, a click outside, or Escape.
export default function FollowUpEmail({ person, encounter, encounters }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(null) // { subject, body }
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [copied, setCopied] = useState(false)
  const wrap = useRef(null)
  const btn = useRef(null)
  const text = useRef(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const outside = (ev) => wrap.current && !wrap.current.contains(ev.target) && setOpen(false)
    const esc = (ev) => {
      if (ev.key !== 'Escape') return
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

  async function generate() {
    setBusy(true)
    setErr(null)
    setCopied(false)
    try {
      const norm = (x) => ({
        ...x,
        conference: x.edition?.series?.name,
        year: new Date(x.edition?.start_date ?? x.created_at).getFullYear(),
      })
      setDraft(await draftFollowUp({ person, latest: norm(encounter), history: encounters.map(norm) }, getApiKeys().openai))
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setBusy(false)
    }
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && !draft && !busy) generate()
  }

  async function copy() {
    const all = `Subject: ${draft.subject}\n\n${draft.body}`
    try {
      await navigator.clipboard.writeText(all)
      setCopied(true)
    } catch {
      // Clipboard blocked (e.g. not https): select the text so the rep can copy it by hand
      const range = document.createRange()
      range.selectNodeContents(text.current)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
      setErr('ההעתקה נחסמה בדפדפן. הטקסט מסומן: Ctrl+C')
    }
  }

  return (
    <div className="email-menu" ref={wrap}>
      {/* An icon, not text: less on the card. The name is in aria-label and in the hover title */}
      <button ref={btn} type="button" className="email-btn" aria-label="נסח מייל" title="נסח מייל" aria-expanded={open} aria-controls={id} onClick={toggle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      </button>
      {open && (
        <div className="popover email-popover" id={id} role="dialog" aria-label="טיוטת מייל מעקב">
          <p className="popover-head">טיוטת מייל מעקב</p>
          {busy && <p className="sub">מנסח…</p>}
          {err && <p style={{ color: 'var(--bad)' }}>{err}</p>}
          {draft && !busy && (
            <>
              {/* English, left to right. The recipient is for reference only; it isn't part of what's copied */}
              <div className="email-draft" dir="ltr" ref={text}>
                {person.email && <p className="email-to">To: {person.email}</p>}
                <p className="email-subject">Subject: {draft.subject}</p>
                <p className="email-body">{draft.body}</p>
              </div>
              <div className="row">
                <button type="button" onClick={copy}>
                  {copied ? '✓ הועתק' : 'העתק'}
                </button>
                <button type="button" className="ghost" onClick={generate}>
                  נסח מחדש
                </button>
              </div>
              <p className="sub small">טקסט בלבד. המערכת לא שולחת מיילים.</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
