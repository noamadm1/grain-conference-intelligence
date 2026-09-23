import { useState } from 'react'
import { testOpenAiKey } from '../lib/ai'
import { EXTRACTION_MODEL, getApiKeys, setApiKeys } from '../lib/apiKeys'
import { testHubspotToken } from '../lib/hubspot'
import { resumePending } from '../lib/processing'

// API keys: set by the user, stored only in this browser. Not in the code and not on the server.
export default function Settings() {
  const [keys, setKeys] = useState(getApiKeys)
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState({}) // key → 'testing' | 'ok' | 'bad' | error message
  const [saved, setSaved] = useState(false)

  function save(e) {
    e.preventDefault()
    const clean = { openai: keys.openai.trim(), hubspot: keys.hubspot.trim() }
    setApiKeys(clean)
    setKeys(clean)
    setSaved(true)
    if (clean.openai) resumePending({ retryFailed: true }) // recordings that were waiting for the key start processing now
  }

  async function test(k) {
    setStatus((s) => ({ ...s, [k]: 'testing' }))
    const v = keys[k].trim()
    const result = k === 'openai' ? ((await testOpenAiKey(v)) ? 'ok' : 'bad') : await testHubspotToken(v)
    setStatus((s) => ({ ...s, [k]: result }))
  }

  const badge = (k) => {
    const s = status[k]
    if (!s) return null
    if (s === 'testing') return <span className="tag">בודק…</span>
    if (s === 'ok') return <span className="tag good">✓ תקין</span>
    if (s === 'bad') return <span className="tag bad">✗ לא תקין</span>
    return <span className="tag bad">✗ {s}</span>
  }

  const field = (k, label, placeholder, hint) => (
    <div>
      <label htmlFor={k}>{label}</label>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input
          id={k}
          className="ltr"
          type={show ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          value={keys[k]}
          onChange={(e) => {
            setKeys({ ...keys, [k]: e.target.value })
            setSaved(false)
            setStatus((s) => ({ ...s, [k]: null }))
          }}
          placeholder={placeholder}
        />
        <button type="button" className="secondary" onClick={() => test(k)} disabled={!keys[k].trim()} style={{ whiteSpace: 'nowrap' }}>
          בדוק
        </button>
      </div>
      <div className="row small sub" style={{ marginTop: 4 }}>
        <span>{hint}</span>
        {badge(k)}
      </div>
    </div>
  )

  return (
    <main className="page narrow">
      <div className="page-head">
        <h1>הגדרות</h1>
        <p className="sub">מפתחות API. נשמרים רק בדפדפן הזה, לא בשרת ולא בקוד.</p>
      </div>

      <form className="card stack" onSubmit={save}>
        {field('openai', `מפתח OpenAI (תמלול עם Whisper, חילוץ עם ${EXTRACTION_MODEL})`, 'sk-…', 'platform.openai.com → API keys')}
        {field(
          'hubspot',
          'HubSpot Private App token (לא חובה)',
          'pat-…',
          'HubSpot → Settings → Integrations → Private Apps. הרשאות: crm.import, crm.objects.contacts.write, crm.objects.companies.write, crm.schemas.contacts.write',
        )}
        <label className="row small" style={{ color: 'var(--text)' }}>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} style={{ width: 'auto' }} />
          הצג מפתחות
        </label>
        <button type="submit">שמור</button>
        {saved && (
          <div className={`notice small ${keys.openai ? 'good' : 'warn'}`}>
            ✓ נשמר.
            {keys.openai ? ' הקלטות שחיכו למפתח יעובדו עכשיו ברקע.' : ' בלי מפתח OpenAI, הקלטות יישמרו אבל לא יתומללו.'}
            {keys.hubspot ? '' : ' בלי HubSpot token, ייצוא לידים זמין כהורדת CSV בלבד.'}
          </div>
        )}
      </form>

      <p className="small sub" style={{ marginTop: 16 }}>
        כל מכשיר צריך מפתחות משלו. ההקלטות נשלחות ישירות מהדפדפן ל-OpenAI, והלידים ל-HubSpot דרך פונקציה ב-Supabase. אל תזין מפתחות במחשב משותף.
      </p>
    </main>
  )
}
