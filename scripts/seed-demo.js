// Demo data for people and encounters (PRD 8: "demo data has to be varied").
//
//   npm run seed:demo
//
// Idempotent: people have fixed ids and are upserted. Their encounters and merge decisions are deleted and rewritten.
// Only the demo people are affected (ids 00000000-0000-4000-8000-0000000001xx). Real data is never touched.
// The phone numbers are from fictional ranges (+1 202-555-01xx, +44 7700 900xxx, +972-50-555-01xx).
//
// The dates are chosen so the tags fire against a "today" around late 2026:
//   dormant = last encounter over 18 months ago · time has come = "next quarter" and that quarter has passed · stuck = the same timing 3 times

import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('✗ Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

const pid = (n) => `00000000-0000-4000-8000-${String(100 + n).padStart(12, '0')}`
const eid = (n, i) => `00000000-0000-4000-9000-${String(n * 10 + i).padStart(12, '0')}`

// Each person: the current details + encounters (oldest to newest). Each encounter records the company/title at that time.
const PEOPLE = [
  // 1. Warming up: PayFlow → FinPay, clear progression from "not ready" to "wants a quote"
  {
    scenario: 'מתחמם + עבר חברה',
    first_name: 'Marcus', last_name: 'Weber', phone: '+447700900101', email: 'm.weber@finpay.example',
    current_company: 'FinPay', current_title: 'VP Treasury',
    encounters: [
      {
        edition: 'money2020-europe-2024', rep: 'דנה לוי', company: 'PayFlow', title: 'Head of Payments',
        identity_line: 'מרקוס מ-PayFlow: מתעניין בגידור, לא בשל',
        transcript: 'דיברתי עם מרקוס מ-PayFlow. הם מעבירים הרבה EUR ל-GBP ומרגישים את התנודתיות, אבל אין להם עדיין מדיניות גידור. אמר שזה לא בראש סדר העדיפויות השנה.',
        extracted: { pain: 'תנודתיות EUR/GBP פוגעת במרווחים', timing: 'לא השנה', currencies: ['EUR', 'GBP'], authority: 'משפיע, לא מחליט', next_step: 'לשלוח חומר רקע' },
      },
      {
        edition: 'money2020-europe-2025', rep: 'יואב שרון', company: 'FinPay', title: 'VP Treasury',
        identity_line: 'מרקוס, עכשיו VP Treasury ב-FinPay: בוחנים ברצינות, ביקש חומרים',
        transcript: 'מרקוס עבר ל-FinPay, עכשיו אחראי טרז׳רי. יש להם חשיפה ל-USD ול-PLN מהתרחבות למזרח אירופה. ביקש מקרי בוחן של PSPs דומים ושאל על אינטגרציה ל-API.',
        extracted: { pain: 'חשיפה חדשה ל-PLN ו-USD אחרי התרחבות', timing: 'במהלך 2026', currencies: ['EUR', 'USD', 'PLN'], authority: 'מחליט בתחום הטרז׳רי', next_step: 'לשלוח מקרי בוחן + תיעוד API' },
      },
      {
        edition: 'money2020-europe-2026', rep: 'דנה לוי', company: 'FinPay', title: 'VP Treasury',
        identity_line: 'מרקוס מ-FinPay: רוצה הצעת מחיר, מכניס את ה-CFO',
        transcript: 'פגישה טובה מאוד. מרקוס אמר שהבורד אישר תקציב לניהול סיכוני מט״ח. רוצה הצעת מחיר ושיחה משותפת עם ה-CFO. שאל על תמחור לפי נפח.',
        extracted: { pain: 'הבורד דורש מדיניות גידור פורמלית', timing: 'Q4 2026, לפני סגירת תקציב 2027', currencies: ['EUR', 'USD', 'PLN'], authority: 'מחליט, עם אישור CFO', next_step: 'הצעת מחיר + שיחה עם ה-CFO' },
      },
    ],
  },

  // 2. Stuck: 3 encounters, "next quarter" every time
  {
    scenario: 'תקוע',
    first_name: 'Omar', last_name: 'Haddad', phone: '+971505550102', email: null,
    current_company: 'GulfRemit', current_title: 'CFO',
    encounters: [
      {
        edition: 'money2020-europe-2024', rep: 'עומר כהן', company: 'GulfRemit', title: 'CFO',
        identity_line: 'עומר חדאד מ-GulfRemit: העברות AED→INR, "רבעון הבא"',
        transcript: 'GulfRemit עושים העברות מהמפרץ להודו ולפקיסטן. ה-CFO מודע לבעיה, מחזיקים יתרות גדולות ב-INR. אמר שיחזרו אלינו ברבעון הבא.',
        extracted: { pain: 'יתרות גדולות ב-INR ו-PKR בלי גידור', timing: 'רבעון הבא', currencies: ['AED', 'INR', 'PKR'], authority: 'מחליט', next_step: 'לחזור אליו ברבעון הבא' },
      },
      {
        edition: 'seamless-middle-east-2025', rep: 'עומר כהן', company: 'GulfRemit', title: 'CFO',
        identity_line: 'עומר חדאד מ-GulfRemit: אותה בעיה ב-INR, שוב "רבעון הבא"',
        transcript: 'שוב עם עומר. אותה בעיה, היתרות ב-INR רק גדלו. אמר שעסוקים ברישוי חדש ויחזרו לזה ברבעון הבא.',
        extracted: { pain: 'יתרות גדולות ב-INR ו-PKR בלי גידור', timing: 'רבעון הבא', currencies: ['AED', 'INR', 'PKR'], authority: 'מחליט', next_step: 'לחזור אליו ברבעון הבא' },
      },
      {
        edition: 'seamless-middle-east-2026', rep: 'מיכל אברהם', company: 'GulfRemit', title: 'CFO',
        identity_line: 'עומר חדאד מ-GulfRemit: מסכים שזו בעיה, עדיין "רבעון הבא"',
        transcript: 'פגשתי את ה-CFO של GulfRemit. מכיר את Grain, מסכים שזו בעיה, אבל שוב אמר רבעון הבא. לא ברור מה חוסם.',
        extracted: { pain: 'יתרות ב-INR ו-PKR, הפסדי המרה', timing: 'רבעון הבא', currencies: ['AED', 'INR', 'PKR'], authority: 'מחליט', next_step: null },
      },
    ],
  },

  // 3. Dormant: the last encounter was in October 2024
  {
    scenario: 'רדום',
    first_name: 'Hannah', last_name: 'Schmidt', phone: '+491515550103', email: 'h.schmidt@kessler.example',
    current_company: 'Kessler Industrie', current_title: 'Treasury Manager',
    encounters: [
      {
        edition: 'sibos-2024', rep: 'יואב שרון', company: 'Kessler Industrie', title: 'Treasury Manager',
        identity_line: 'האנה מ-Kessler: יבואנית, משלמת לספקים ב-CNY, מחכה ל-ERP',
        transcript: 'Kessler מייבאים רכיבים מסין, משלמים ב-CNY ו-USD עם תנאי תשלום של 90 יום. האנה אמרה שהם באמצע הטמעת SAP ולא יתחילו פרויקט חדש לפני שזה נגמר.',
        extracted: { pain: 'חשיפת CNY/USD על תנאי תשלום של 90 יום', timing: 'אחרי הטמעת SAP, אולי 2025', currencies: ['EUR', 'CNY', 'USD'], authority: 'משפיעה, ה-CFO מחליט', next_step: 'לבדוק מתי ה-SAP עולה' },
      },
    ],
  },

  // 4. Time has come: said "next quarter" in October 2025, and Q1 2026 has passed
  {
    scenario: 'הזמן הגיע',
    first_name: 'James', last_name: 'Carter', phone: '+12025550104', email: 'jcarter@northpay.example',
    current_company: 'NorthPay', current_title: 'Director of Finance',
    encounters: [
      {
        edition: 'money2020-usa-2025', rep: 'דנה לוי', company: 'NorthPay', title: 'Director of Finance',
        identity_line: "ג'יימס מ-NorthPay: PSP שנכנס למקסיקו, בוחנים ברבעון הבא",
        transcript: "ג'יימס מ-NorthPay, PSP אמריקאי שמתרחב למקסיקו ולקנדה. מרוויחים ב-MXN ו-CAD ומשלמים ב-USD. אמר שיבחנו פתרון גידור ברבעון הבא, אחרי שיסגרו את הרבעון הנוכחי.",
        extracted: { pain: 'הכנסות ב-MXN ו-CAD, עלויות ב-USD', timing: 'רבעון הבא', currencies: ['USD', 'MXN', 'CAD'], authority: 'ממליץ ל-CFO', next_step: 'לחזור אליו אחרי סגירת הרבעון' },
      },
    ],
  },

  // 5. Spelling variant: Sara/Sarah Cohen, same company, different phones. Two separate people, for the merge question.
  {
    scenario: 'איות שונה (א)',
    first_name: 'Sara', last_name: 'Cohen', phone: '+972505550105', email: null,
    current_company: 'Transferra', current_title: 'VP Treasury',
    encounters: [
      {
        edition: 'money2020-europe-2025', rep: 'מיכל אברהם', company: 'Transferra', title: 'VP Treasury',
        identity_line: 'שרה מ-Transferra: העברות ILS→EUR, בודקת ספקים',
        transcript: 'שרה, VP Treasury ב-Transferra, חברת העברות בין ישראל לאירופה. מגדרים היום ידנית דרך הבנק. בודקת כמה ספקים.',
        extracted: { pain: 'גידור ידני דרך הבנק, יקר ואיטי', timing: 'השנה', currencies: ['ILS', 'EUR'], authority: 'מחליטה', next_step: 'דמו' },
      },
    ],
  },
  {
    scenario: 'איות שונה (ב)',
    first_name: 'Sarah', last_name: 'Cohen', phone: '+972525550106', email: 'sarah.c@transferra.example',
    current_company: 'Transferra', current_title: 'VP Treasury',
    encounters: [
      {
        edition: 'fintech-meetup-2026', rep: 'יואב שרון', company: 'Transferra', title: 'VP Treasury',
        identity_line: 'שרה מ-Transferra: אחרי דמו עם מתחרה, רוצה להשוות',
        transcript: 'Sarah Cohen מ-Transferra. עשו דמו עם מתחרה ולא התלהבו מהממשק. רוצה להשוות אותנו מול הבנק. שאלה על ILS ו-USD.',
        extracted: { pain: 'הספק הנוכחי מסורבל, גידור ILS/USD', timing: 'החלטה עד סוף Q3 2026', currencies: ['ILS', 'USD', 'EUR'], authority: 'מחליטה', next_step: 'לשלוח השוואה מול הבנק' },
      },
    ],
  },

  // 6. Changed company, same phone
  {
    scenario: 'עבר חברה (אותו טלפון)',
    first_name: 'Daniel', last_name: 'Friedman', phone: '+972505550107', email: null,
    current_company: 'GlobeStay Group', current_title: 'Head of Finance',
    encounters: [
      {
        edition: 'itb-berlin-2025', rep: 'עומר כהן', company: 'TourNet Wholesale', title: 'Finance Manager',
        identity_line: 'דניאל מ-TourNet: סיטונאי, קונה מלונות ב-EUR ומוכר ב-USD',
        transcript: 'דניאל מ-TourNet, סיטונאי תיירות. קונים חדרים באירופה ב-EUR חצי שנה מראש ומוכרים לסוכנים בארה״ב ב-USD. הפער בזמן הוא כל הסיפור.',
        extracted: { pain: 'פער של 6 חודשים בין קנייה ב-EUR למכירה ב-USD', timing: 'לקראת עונת הקיץ', currencies: ['EUR', 'USD'], authority: 'משפיע', next_step: 'שיחה עם ה-CFO שלהם' },
      },
      {
        edition: 'itb-berlin-2026', rep: 'מיכל אברהם', company: 'GlobeStay Group', title: 'Head of Finance',
        identity_line: 'דניאל, עכשיו ב-GlobeStay: אותה בעיה, עכשיו הוא מחליט',
        transcript: 'דניאל עבר ל-GlobeStay, טור אופרייטור גדול יותר. אותה בעיה בסדר גודל גדול יותר, ועכשיו הוא זה שמחליט. זוכר אותנו מ-TourNet.',
        extracted: { pain: 'חשיפת EUR/USD/GBP על הזמנות מראש', timing: 'לפני עונת החורף 2026', currencies: ['EUR', 'USD', 'GBP'], authority: 'מחליט', next_step: 'לקבוע דמו עם הצוות שלו' },
      },
    ],
  },

  // 7. Ordinary: 1-2 encounters, no tags
  {
    scenario: 'רגיל',
    first_name: 'Aisha', last_name: 'Al-Mansouri', phone: '+971505550108', email: null,
    current_company: 'Emirates PayHub', current_title: 'Treasury Lead',
    encounters: [
      {
        edition: 'seamless-middle-east-2026', rep: 'עומר כהן', company: 'Emirates PayHub', title: 'Treasury Lead',
        identity_line: 'עאישה מ-Emirates PayHub: PSP לסוחרים, סליקה ב-SAR ו-EGP',
        transcript: 'Emirates PayHub סולקים לסוחרים בסעודיה ובמצרים. ה-EGP הוא כאב ראש רציני. ביקשה מידע על כיסוי למטבעות לא סחירים.',
        extracted: { pain: 'פיחותים ב-EGP פוגעים ביתרות', timing: null, currencies: ['AED', 'SAR', 'EGP'], authority: 'משפיעה', next_step: 'לבדוק כיסוי ל-EGP' },
      },
    ],
  },
  {
    scenario: 'רגיל',
    first_name: 'Olivia', last_name: 'Bennett', phone: '+447700900109', email: 'olivia@horizonholidays.example',
    current_company: 'Horizon Holidays', current_title: 'Finance Director',
    encounters: [
      {
        edition: 'itb-berlin-2026', rep: 'מיכל אברהם', company: 'Horizon Holidays', title: 'Finance Director',
        identity_line: 'אוליביה מ-Horizon Holidays: טור אופרייטור בריטי, קונה ב-EUR ו-TRY',
        transcript: 'Horizon Holidays, טור אופרייטור בריטי. מוכרים ב-GBP וקונים ב-EUR ו-TRY. מגדרים עם forwards דרך הבנק ורוצים משהו גמיש יותר.',
        extracted: { pain: 'forwards בבנק לא גמישים לביטולים', timing: 'לפני עונת 2027', currencies: ['GBP', 'EUR', 'TRY'], authority: 'מחליטה', next_step: 'שיחת היכרות' },
      },
    ],
  },
  {
    scenario: 'רגיל',
    first_name: 'Marco', last_name: 'Bianchi', phone: '+393405550110', email: null,
    current_company: 'ClearMerchant', current_title: 'Head of Treasury',
    encounters: [
      {
        edition: 'money2020-europe-2025', rep: 'יואב שרון', company: 'ClearMerchant', title: 'Head of Treasury',
        identity_line: 'מרקו מ-ClearMerchant: PSP איטלקי, payouts ב-10 מטבעות',
        transcript: 'ClearMerchant עושים payouts לסוחרים בעשרה מטבעות. מרקו מנהל את זה באקסל. מתעניין אבל עמוס.',
        extracted: { pain: 'ניהול חשיפה ב-10 מטבעות באקסל', timing: null, currencies: ['EUR', 'USD', 'GBP', 'CHF'], authority: 'מחליט', next_step: 'לשלוח סקירה קצרה' },
      },
      {
        edition: 'money2020-europe-2026', rep: 'יואב שרון', company: 'ClearMerchant', title: 'Head of Treasury',
        identity_line: 'מרקו מ-ClearMerchant: עברו ל-15 מטבעות, האקסל כבר לא מחזיק',
        transcript: 'מרקו אמר שעברו ל-15 מטבעות והאקסל לא מחזיק. רוצה לראות דמו של הדשבורד.',
        extracted: { pain: 'האקסל לא מחזיק 15 מטבעות', timing: 'עד סוף 2026', currencies: ['EUR', 'USD', 'GBP', 'CHF', 'SEK'], authority: 'מחליט', next_step: 'דמו דשבורד' },
      },
    ],
  },
  {
    scenario: 'רגיל',
    first_name: 'Noa', last_name: 'Katz', phone: '+972505550111', email: 'noa@katzimport.example',
    current_company: 'Katz Electronics Import', current_title: 'CFO',
    encounters: [
      {
        edition: 'sibos-2025', rep: 'דנה לוי', company: 'Katz Electronics Import', title: 'CFO',
        identity_line: 'נועה כץ, CFO של יבואנית אלקטרוניקה: משלמת ב-USD, מוכרת ב-ILS',
        transcript: 'נועה, CFO של יבואנית אלקטרוניקה. משלמים לספקים באסיה ב-USD ומוכרים בישראל בשקלים. הדולר הזיז להם את הרווחיות ברבעון האחרון.',
        extracted: { pain: 'שחיקת רווחיות מתנודות USD/ILS', timing: 'Q1 2027', currencies: ['USD', 'ILS'], authority: 'מחליטה', next_step: 'הצעה ראשונית' },
      },
    ],
  },
  {
    scenario: 'רגיל',
    first_name: 'Ethan', last_name: 'Brooks', phone: '+12025550112', email: 'ethan@crossledger.example',
    current_company: 'CrossLedger', current_title: 'VP Finance',
    encounters: [
      {
        edition: 'fintech-meetup-2025', rep: 'עומר כהן', company: 'CrossLedger', title: 'VP Finance',
        identity_line: "אית'ן מ-CrossLedger: תשלומי B2B לאמריקה הלטינית",
        transcript: 'CrossLedger עושים תשלומי B2B מארה״ב לברזיל ולקולומביה. החשיפה ל-BRL גדולה. מוקדם עבורם, עוד לא גייסו.',
        extracted: { pain: 'חשיפה ל-BRL ו-COP', timing: 'אחרי סבב הגיוס', currencies: ['USD', 'BRL', 'COP'], authority: 'מחליט', next_step: 'לעקוב אחרי הגיוס' },
      },
      {
        edition: 'money2020-usa-2025', rep: 'דנה לוי', company: 'CrossLedger', title: 'VP Finance',
        identity_line: "אית'ן מ-CrossLedger: גייסו סבב B, עכשיו רלוונטי",
        transcript: "אית'ן סיפר שגייסו סבב B והנפחים הוכפלו. עכשיו זה רלוונטי. רוצה פגישה עם הצוות שלנו בניו יורק.",
        extracted: { pain: 'נפחים כפולים ב-BRL אחרי הגיוס', timing: 'Q1 2027', currencies: ['USD', 'BRL', 'COP', 'MXN'], authority: 'מחליט', next_step: 'פגישה בניו יורק' },
      },
    ],
  },
  {
    scenario: 'רגיל',
    first_name: 'Yusuf', last_name: 'Demir', phone: '+905325550113', email: null,
    current_company: 'Anatolia Tours', current_title: 'Finance Manager',
    encounters: [
      {
        edition: 'itb-berlin-2026', rep: 'דנה לוי', company: 'Anatolia Tours', title: 'Finance Manager',
        identity_line: 'יוסוף מ-Anatolia Tours: סיטונאי טורקי, מוכר ב-EUR ומשלם ב-TRY',
        transcript: 'Anatolia Tours מוכרים חבילות לאירופאים ב-EUR ומשלמים למלונות בטורקיה ב-TRY. האינפלציה ב-TRY יוצרת בלגן בתמחור.',
        extracted: { pain: 'תמחור חבילות מול אינפלציה ב-TRY', timing: null, currencies: ['EUR', 'TRY'], authority: 'משפיע', next_step: 'לשלוח מידע' },
      },
    ],
  },
]

// ---- Write ----

const { data: editions, error: edErr } = await supabase.from('conference_editions').select('id, start_date')
if (edErr) throw edErr
const editionDate = Object.fromEntries(editions.map((e) => [e.id, e.start_date]))

const people = PEOPLE.map((p, i) => ({
  id: pid(i + 1),
  phone: p.phone,
  email: p.email,
  first_name: p.first_name,
  last_name: p.last_name,
  current_company: p.current_company,
  current_title: p.current_title,
  linkedin_name: `${p.first_name} ${p.last_name}`,
  linkedin_url: null, // The AI doesn't guess LinkedIn URLs (PRD 7)
  status: 'active',
}))

const encounters = PEOPLE.flatMap((p, i) =>
  p.encounters.map((e, j) => {
    if (!editionDate[e.edition]) throw new Error(`Unknown edition: ${e.edition}`)
    // The encounter happened on the conference's second day
    const at = new Date(editionDate[e.edition])
    at.setUTCDate(at.getUTCDate() + 1)
    at.setUTCHours(11, 0, 0, 0)
    return {
      id: eid(i + 1, j + 1),
      person_id: pid(i + 1),
      edition_id: e.edition,
      rep_name: e.rep,
      company: e.company,
      title: e.title,
      transcript: e.transcript,
      identity_line: e.identity_line,
      extracted: e.extracted,
      created_at: at.toISOString(),
    }
  }),
)

const ids = people.map((p) => p.id)
const fail = (what, error) => {
  console.error(`✗ ${what}: ${error.message}`)
  process.exit(1)
}

let r = await supabase.from('people').upsert(people, { onConflict: 'id' })
if (r.error) fail('people', r.error)

// Rewrite this person's encounters, so a change to the script leaves no stale rows behind
r = await supabase.from('encounters').delete().in('person_id', ids)
if (r.error) fail('delete encounters', r.error)
r = await supabase.from('encounters').insert(encounters)
if (r.error) fail('encounters', r.error)

// Reset merge decisions for demo people, so the Sara/Sarah question comes up again in the demo
r = await supabase.from('merge_decisions').delete().or(`person_a.in.(${ids}),person_b.in.(${ids})`)
if (r.error) fail('merge_decisions', r.error)

console.log(`✓ ${people.length} people · ${encounters.length} encounters\n`)
PEOPLE.forEach((p, i) => console.log(`  ${p.scenario.padEnd(22)} ${p.first_name} ${p.last_name} · ${p.encounters.length} encounters`))
