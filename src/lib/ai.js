// The AI feature (PRD 9): Whisper transcribes → gpt-4o-mini extracts. Both use the same OpenAI key.
// Principle: extract and phrase. Don't infer and don't decide. A field that wasn't mentioned stays null.

import { EXTRACTION_MODEL } from './apiKeys.js'

const OPENAI = 'https://api.openai.com/v1'

async function openaiError(res, what) {
  const body = await res.json().catch(() => null)
  if (res.status === 401) return new Error('מפתח OpenAI לא תקין')
  if (res.status === 429) return new Error('חריגה ממכסת OpenAI. נסה שוב בעוד דקה')
  return new Error(`${what} נכשל (${res.status}): ${body?.error?.message ?? res.statusText}`)
}

// ---- Whisper ----

export async function transcribe(blob, openaiKey) {
  const ext = (blob.type.split('/')[1] || 'webm').split(';')[0]
  const form = new FormData()
  form.append('file', blob, `recording.${ext}`)
  form.append('model', 'whisper-1')
  form.append('language', 'he')

  const res = await fetch(`${OPENAI}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
  })
  if (!res.ok) throw await openaiError(res, 'תמלול')
  return (await res.json()).text?.trim() ?? ''
}

// ---- Extraction ----

// Strict JSON Schema: every field is required, and null = "not mentioned in the recording"
const nullableString = { type: ['string', 'null'] }
const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    identity_line: nullableString,
    pain: nullableString,
    timing: nullableString,
    currencies: { type: ['array', 'null'], items: { type: 'string' } },
    authority: nullableString,
    next_step: nullableString,
  },
  required: ['identity_line', 'pain', 'timing', 'currencies', 'authority', 'next_step'],
  additionalProperties: false,
}

const SYSTEM = `אתה מחלץ מידע מסיכום קולי שאיש מכירות של Grain הקליט מיד אחרי שיחה בכנס.
Grain מוכרת ניהול סיכוני מטבע (FX) ל-PSPs, חברות תשלומים חוצי גבולות, סיטונאי תיירות ועסקים עם חשיפת מט"ח.

החזר את השדות הבאים, בעברית:
- identity_line (משפט זיהוי): משפט אחד קצר שיעזור לאיש המכירות להיזכר באדם הזה גם בעוד שנה. מבנה: שם מ-חברה, ואחריו מה שהכי מבדיל אותו: הבעיה, מתי, מי מחליט. לדוגמה: "שרה מ-PayFlow: הפזו, בוחנים ברבעון הבא, לא מחליטה". השתמש רק בפרטים שמופיעים בתמלול או בפרטי הליד.
- pain (הבעיה): הבעיה או החשיפה למט"ח שתוארה.
- timing (מתי): מתי הם מתכוונים לפעול, במילים שנאמרו. אם נאמר "רבעון הבא", כתוב "רבעון הבא".
- currencies (מטבעות שהוזכרו): קודי ISO של המטבעות שהוזכרו (למשל "EUR", "MXN"). המר שמות ("פזו מקסיקני") לקוד רק כשהמטבע חד-משמעי.
- authority (מי מחליט): מה נאמר על מי מחליט: האם האדם מחליט, ממליץ, או צריך אישור של מישהו אחר.
- next_step (צעד הבא): הצעד הבא שסוכם.

אלה שדות, לא משפטים: כתוב אותם קצר, בלי נקודה בסוף.

הכלל החשוב ביותר: שדה שלא הוזכר בתמלול מקבל null. אל תסיק, אל תשלים ואל תנחש. כששדה ריק, איש המכירות משלים אותו בעצמו, ושדה שגוי גרוע משדה ריק.
תמלול קולי עלול להכיל שגיאות בשמות חברות ובשמות אנשים. אם השם מופיע בפרטי הליד, העדף את הכתיב משם.`

export async function extract(transcript, context, openaiKey) {
  const lead = [
    context.name && `שם: ${context.name}`,
    context.company && `חברה: ${context.company}`,
    context.conference && `כנס: ${context.conference}`,
  ]
    .filter(Boolean)
    .join('\n')

  const res = await fetch(`${OPENAI}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      temperature: 0, // extraction, not creative writing
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `<lead_details>\n${lead || 'אין פרטים'}\n</lead_details>\n\n<transcript>\n${transcript}\n</transcript>` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'lead_extraction', strict: true, schema: EXTRACTION_SCHEMA } },
    }),
  })
  if (!res.ok) throw await openaiError(res, 'חילוץ')

  const choice = (await res.json()).choices?.[0]
  if (choice?.message?.refusal) throw new Error('המודל סירב לעבד את התמלול')
  if (choice?.finish_reason === 'length') throw new Error('חילוץ נכשל: התשובה נקטעה')

  let parsed
  try {
    parsed = JSON.parse(choice?.message?.content ?? '')
  } catch {
    throw new Error('חילוץ נכשל: תשובה לא תקינה')
  }

  // Fields, not sentences: strip trailing periods. An empty string or empty list is also "not mentioned".
  return Object.fromEntries(
    Object.keys(EXTRACTION_SCHEMA.properties).map((k) => {
      let v = parsed[k]
      if (typeof v === 'string') v = stripPeriod(v)
      if (Array.isArray(v)) v = v.map(stripPeriod).filter(Boolean)
      return [k, v === '' || v === undefined || (Array.isArray(v) && v.length === 0) ? null : v]
    }),
  )
}

const stripPeriod = (s) => String(s).trim().replace(/[.。]+$/, '').trim()

// Quick key check for the settings screen (listing models is free)
export async function testOpenAiKey(key) {
  const res = await fetch(`${OPENAI}/models`, { headers: { Authorization: `Bearer ${key}` } })
  return res.ok
}
