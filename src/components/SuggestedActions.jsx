import { useState } from 'react'
import { suggestActions } from '../lib/ai'
import { getApiKeys } from '../lib/apiKeys'
import { saveSuggestedActions } from '../lib/data'
import { SUGGESTED_ACTIONS_ENABLED } from '../lib/features'

// "מה כדאי לעשות" on an encounter card: 2-4 lines, each "{what was said} → {suggested step}".
// suggested_actions: an array = generated (empty = nothing to base an action on: show nothing);
// null / missing = not generated yet: offer "צור המלצות" (only with an OpenAI key, and only if there's something to go on).
// Built, not turned on (PRD 11): with SUGGESTED_ACTIONS_ENABLED false, nothing here renders, saved or not.

const hasSubstance = (e) =>
  Boolean(e.transcript || e.identity_line || Object.values(e.extracted ?? {}).some((v) => (Array.isArray(v) ? v.length : v)))

export default function SuggestedActions({ e, keysOk, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const actions = e.suggested_actions

  if (!SUGGESTED_ACTIONS_ENABLED) return null

  if (Array.isArray(actions)) {
    if (!actions.length) return null
    return (
      <section className="enc-actions" aria-label="מה כדאי לעשות">
        <h3>מה כדאי לעשות</h3>
        <ul>
          {actions.map((a) => (
            <li key={a.fact + a.action}>
              <span className="act-fact">{a.fact}</span>
              <span className="act-arrow" aria-hidden="true">←</span>
              <span className="visually-hidden">, ולכן: </span>
              <span className="act-step">{a.action}</span>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  if (!keysOk || !hasSubstance(e)) return null

  async function generate() {
    setBusy(true)
    setErr(null)
    try {
      const list = await suggestActions({ ...e, conference: e.edition?.series?.name }, getApiKeys().openai)
      await saveSuggestedActions(e.id, list)
      onSaved(list)
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="enc-actions-empty">
      <button type="button" className="ghost" onClick={generate} disabled={busy}>
        {busy ? 'יוצר המלצות…' : 'צור המלצות'}
      </button>
      {err && <span style={{ color: 'var(--bad)' }}>{err}</span>}
    </div>
  )
}
