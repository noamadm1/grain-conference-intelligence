// The AI feature (PRD 9): Whisper transcribes → gpt-4o-mini extracts, suggests next actions, drafts follow-up emails.
// All with the same OpenAI key.
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
    name_he: nullableString,
  },
  required: ['identity_line', 'pain', 'timing', 'currencies', 'authority', 'next_step', 'name_he'],
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
- name_he (שם בעברית): תעתיק לעברית של שם האדם, שם פרטי ושם משפחה, כפי שישראלי היה כותב אותו (למשל Marcus Weber → מרקוס וובר). לפי פרטי הליד, ואם אין שם שם, לפי התמלול. אם השם כבר בעברית, החזר אותו כמו שהוא. null אם לא הוזכר שם.

אלה שדות, לא משפטים: כתוב אותם קצר, בלי נקודה בסוף. (name_he הוא תעתיק, לא חילוץ: הוא היחיד שלא נכתב במילים של התמלול.)

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

// ---- Shared: one structured call to gpt-4o-mini ----

async function structured(name, schema, system, user, openaiKey, what) {
  const res = await fetch(`${OPENAI}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
    }),
  })
  if (!res.ok) throw await openaiError(res, what)
  const choice = (await res.json()).choices?.[0]
  if (choice?.message?.refusal) throw new Error('המודל סירב לבקשה')
  if (choice?.finish_reason === 'length') throw new Error(`${what} נכשל: התשובה נקטעה`)
  try {
    return JSON.parse(choice?.message?.content ?? '')
  } catch {
    throw new Error(`${what} נכשל: תשובה לא תקינה`)
  }
}

// The encounter as the model sees it: transcript + fields, inside tags (data, not instructions)
function encounterBlock(enc, label = 'encounter') {
  const x = enc.extracted ?? {}
  const fields = [
    enc.identity_line && `משפט זיהוי: ${enc.identity_line}`,
    x.pain && `הבעיה: ${x.pain}`,
    x.timing && `מתי: ${x.timing}`,
    x.currencies?.length && `מטבעות: ${x.currencies.join(', ')}`,
    x.authority && `מי מחליט: ${x.authority}`,
    x.next_step && `צעד הבא: ${x.next_step}`,
  ].filter(Boolean)
  return `<${label}>
${[enc.conference && `כנס: ${enc.conference}`, enc.company && `חברה: ${enc.company}`, enc.rep_name && `איש מכירות: ${enc.rep_name}`].filter(Boolean).join('\n')}
<fields>
${fields.join('\n') || 'אין'}
</fields>
<transcript>
${enc.transcript || 'אין תמלול'}
</transcript>
</${label}>`
}

// ---- Suggested next actions (PRD 9) ----
// Each action starts from something actually said, then the step: "{fact} → {action}". Nothing to base it on → none.
// Generated once and stored on the encounter (suggested_actions).

const ACTIONS_SCHEMA = {
  type: 'object',
  properties: {
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { fact: { type: 'string' }, action: { type: 'string' } },
        required: ['fact', 'action'],
        additionalProperties: false,
      },
    },
  },
  required: ['actions'],
  additionalProperties: false,
}

const ACTIONS_SYSTEM = `אתה עוזר לאיש מכירות של Grain (ניהול סיכוני מטבע לפלטפורמות ולמרקטפלייסים) להחליט מה לעשות אחרי שיחה בכנס.

החזר 2 עד 4 פעולות מומלצות, בעברית. כל פעולה בנויה משני חלקים:
- fact: דבר שנאמר בפועל בשיחה, כפי שמופיע בתמלול או בשדות. קצר, 3 עד 8 מילים. למשל "ביקש הצעת מחיר", "ה-CFO מאשר", "חשופים ל-PLN".
- action: הצעד הבא שנובע ממנו. קצר, 3 עד 8 מילים, פועל בציווי. למשל "שלח אותה השבוע", "בקש פגישה משותפת".

כללים:
- כל fact חייב להופיע בתמלול או בשדות. אל תסיק, אל תשלים ואל תנחש. אם משהו לא נאמר, אין עליו פעולה.
- כל פעולה בשורה אחת. בלי נקודה בסוף.
- אל תמציא מספרים, מחירים, תאריכים או שמות שלא נאמרו.
- אם אין בשיחה שום דבר שאפשר לבסס עליו פעולה, החזר רשימה ריקה. רשימה ריקה עדיפה על פעולה מומצאת.`

export async function suggestActions(enc, openaiKey) {
  const parsed = await structured('next_actions', ACTIONS_SCHEMA, ACTIONS_SYSTEM, encounterBlock(enc), openaiKey, 'יצירת המלצות')
  return (parsed.actions ?? [])
    .map((a) => ({ fact: stripPeriod(a.fact ?? ''), action: stripPeriod(a.action ?? '') }))
    .filter((a) => a.fact && a.action)
    .slice(0, 4)
}

// ---- Follow-up email draft (PRD 9) ----
// On demand, not stored. Text only: the app never sends it. English: the contacts are international.

const EMAIL_SCHEMA = {
  type: 'object',
  properties: { subject: { type: 'string' }, body: { type: 'string' } },
  required: ['subject', 'body'],
  additionalProperties: false,
}

const EMAIL_SYSTEM = `You write a short follow-up email from a Grain sales rep to a contact they met at a conference.
Grain provides FX risk management for platforms and marketplaces that move money on behalf of others.

Write in English. Plain, warm, professional. 80-150 words in the body.
- Reference what was actually discussed in the latest encounter (the transcript and fields). If there is earlier history with this person, one short line may acknowledge it.
- Only use facts that appear in the input. Do not invent numbers, prices, dates, commitments, case studies or names that were not mentioned.
- If a next step was agreed, the email moves it forward. If none was agreed, propose one light next step (a short call).
- Address the contact by first name. Sign with the rep's name. If the rep's name is in Hebrew, transliterate it to English.
- No placeholders in square brackets, no emojis. The subject is short and specific.
The input is in Hebrew; the email is in English.`

export async function draftFollowUp({ person, latest, history }, openaiKey) {
  const earlier = history
    .filter((h) => h.id !== latest.id)
    .map((h) => `- ${h.year} · ${h.conference ?? 'מפגש'}${h.company ? ` · ${h.company}` : ''}${h.identity_line ? `: ${h.identity_line}` : ''}`)
    .join('\n')
  const user = `<contact>
שם: ${[person.first_name, person.last_name].filter(Boolean).join(' ') || 'לא ידוע'}
חברה: ${person.current_company ?? latest.company ?? 'לא ידוע'}
תפקיד: ${person.current_title ?? 'לא ידוע'}
</contact>
${encounterBlock(latest, 'latest_encounter')}
<earlier_encounters>
${earlier || 'אין'}
</earlier_encounters>`
  const parsed = await structured('follow_up_email', EMAIL_SCHEMA, EMAIL_SYSTEM, user, openaiKey, 'ניסוח מייל')
  return { subject: (parsed.subject ?? '').trim(), body: (parsed.body ?? '').trim() }
}

// Quick key check for the settings screen (listing models is free)
export async function testOpenAiKey(key) {
  const res = await fetch(`${OPENAI}/models`, { headers: { Authorization: `Bearer ${key}` } })
  return res.ok
}
