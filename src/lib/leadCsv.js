// Building the lead CSV for HubSpot. Pure functions (no network), shared by the download and the automatic send.

// Must match EXPECTED_HEADER in supabase/functions/hubspot-import/index.ts
export const HEADER = ['First Name', 'Last Name', 'Phone Number', 'Email', 'Company', 'Job Title', 'Grain Lead History']

const FIELD_LABELS = { pain: 'הבעיה', timing: 'מתי', authority: 'מי מחליט', currencies: 'מטבעות שהוזכרו', next_step: 'צעד הבא' }

const encYear = (e) => new Date(e.edition?.start_date ?? e.created_at).getFullYear()

// The lead file: the identity line on top, then all encounters, newest first, with what was said each time
export function leadHistory(identityLine, encounters) {
  const lines = []
  if (identityLine) lines.push(identityLine, '')
  lines.push('היסטוריית מפגשים (Grain):')
  for (const e of encounters) {
    lines.push('')
    lines.push([encYear(e), e.edition?.series?.name ?? 'מפגש ללא כנס', e.company, e.rep_name && `פגש/ה: ${e.rep_name}`].filter(Boolean).join(' · '))
    const said = e.identity_line || e.transcript
    lines.push(said ? `"${said}"` : '(לא נרשם מה נאמר)')
    const fields = Object.entries(FIELD_LABELS)
      .map(([k, label]) => {
        const v = e.extracted?.[k]
        return v == null || v === '' ? null : `${label}: ${Array.isArray(v) ? v.join(', ') : v}`
      })
      .filter(Boolean)
    if (fields.length) lines.push(fields.join(' | '))
    if (e.transcript && e.identity_line) lines.push(`תמלול: ${e.transcript}`)
  }
  return lines.join('\n')
}

// A cell starting with = or @ is run as a formula when the file is opened in Excel. Neutralize it.
// (Not for the phone: "+972…" has to stay exactly as it is for HubSpot.)
const safeText = (s) => (/^[=@]/.test(s) ? `'${s}` : s)
const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

// rows: [{ person, identityLine, encounters }] → CSV (one person per row)
export function buildCsv(rows) {
  const lines = [HEADER.join(',')]
  for (const { person, identityLine, encounters } of rows) {
    lines.push(
      [
        safeText(person.first_name ?? ''),
        safeText(person.last_name ?? ''),
        person.phone ?? '',
        person.email ?? '',
        safeText(person.current_company ?? ''),
        safeText(person.current_title ?? ''),
        safeText(leadHistory(identityLine, encounters)),
      ]
        .map(cell)
        .join(','),
    )
  }
  return lines.join('\r\n')
}

export const csvFileName = (label) =>
  `grain-leads-${(label || 'export').replace(/[^\w֐-׿-]+/g, '-').replace(/-+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`
