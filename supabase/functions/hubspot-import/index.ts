// Supabase Edge Function: a proxy to the HubSpot Imports API (PRD 10).
// Why a proxy: HubSpot doesn't allow calls from a browser (CORS).
//
// The HubSpot token is not stored here. It comes from the app's settings screen (the user's localStorage) in the x-hubspot-token header.
// The function stores no secret, and it can only do three things: check a token, start a contact+company import, and check an import's status.
// It never creates Deals: a lead from a conference is not a deal.
//
// Deploy: Supabase → Edge Functions → Deploy a new function → Via Editor, name: hubspot-import, paste this file.
//         Turn off "Verify JWT" (the project uses a publishable key, which is not a JWT).
//
// Token scopes needed (HubSpot → Settings → Integrations → Private Apps):
//   crm.import · crm.objects.contacts.write · crm.objects.companies.write · crm.schemas.contacts.write

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hubspot-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const HUBSPOT = 'https://api.hubapi.com'

// The custom contact property that holds the lead's history ("this is where the value is")
const HISTORY_PROPERTY = 'grain_lead_history'

// The column mapping is fixed here, not sent from the client, so it's impossible to import into anything other than contacts and companies.
// 0-1 = Contact, 0-2 = Company. Objects in the same row are associated with each other.
const EXPECTED_HEADER = ['First Name', 'Last Name', 'Phone Number', 'Email', 'Company', 'Job Title', 'Grain Lead History']
const COLUMN_MAPPINGS = [
  { columnObjectTypeId: '0-1', columnName: 'First Name', propertyName: 'firstname' },
  { columnObjectTypeId: '0-1', columnName: 'Last Name', propertyName: 'lastname' },
  { columnObjectTypeId: '0-1', columnName: 'Phone Number', propertyName: 'phone' },
  { columnObjectTypeId: '0-1', columnName: 'Email', propertyName: 'email' },
  { columnObjectTypeId: '0-2', columnName: 'Company', propertyName: 'name' },
  { columnObjectTypeId: '0-1', columnName: 'Job Title', propertyName: 'jobtitle' },
  { columnObjectTypeId: '0-1', columnName: 'Grain Lead History', propertyName: HISTORY_PROPERTY },
]

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function hubspot(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${HUBSPOT}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}

// Creates the history property on the first import (if it doesn't exist yet)
async function ensureHistoryProperty(token: string) {
  const got = await hubspot(token, `/crm/v3/properties/contacts/${HISTORY_PROPERTY}`)
  if (got.ok) return null
  if (got.status !== 404) return got
  const created = await hubspot(token, '/crm/v3/properties/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: HISTORY_PROPERTY,
      label: 'Grain: היסטוריית מפגשים',
      type: 'string',
      fieldType: 'textarea',
      groupName: 'contactinformation',
      description: 'משפט זיהוי והיסטוריית המפגשים בכנסים, מכלי הכנסים של Grain',
    }),
  })
  return created.ok || created.status === 409 ? null : created
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const token = req.headers.get('x-hubspot-token')?.trim()
  if (!token) return json(400, { error: 'חסר HubSpot token' })

  let payload: { action?: string; csv?: string; name?: string; importId?: string }
  try {
    payload = await req.json()
  } catch {
    return json(400, { error: 'גוף הבקשה לא תקין' })
  }

  // Token check for the settings screen (listing imports needs the crm.import scope, the same one used for importing)
  if (payload.action === 'ping') {
    const r = await hubspot(token, '/crm/v3/imports?limit=1')
    if (r.ok) return json(200, { ok: true })
    return json(r.status, { error: r.status === 401 ? 'token לא תקין' : r.status === 403 ? 'חסרה הרשאת crm.import' : r.body.message ?? 'שגיאה' })
  }

  // Import status (imports in HubSpot are processed asynchronously)
  if (payload.action === 'status') {
    if (!/^\d+$/.test(payload.importId ?? '')) return json(400, { error: 'מזהה ייבוא לא תקין' })
    const r = await hubspot(token, `/crm/v3/imports/${payload.importId}`)
    return json(r.ok ? 200 : r.status, r.ok ? { state: r.body.state, counters: r.body.metadata?.counters ?? {} } : { error: r.body.message ?? 'שגיאה' })
  }

  // Import
  const csv = payload.csv ?? ''
  const header = csv.replace(/^﻿/, '').split(/\r?\n/, 1)[0]
  if (header !== EXPECTED_HEADER.join(',')) return json(400, { error: 'מבנה ה-CSV לא צפוי' })
  if (csv.length > 5_000_000) return json(413, { error: 'הקובץ גדול מדי' })

  const propErr = await ensureHistoryProperty(token)
  if (propErr) {
    const hint = propErr.status === 401 ? 'token לא תקין' : propErr.status === 403 ? 'ל-token חסרה הרשאת crm.schemas.contacts.write' : propErr.body.message
    return json(propErr.status, { error: `יצירת שדה ההיסטוריה ב-HubSpot נכשלה: ${hint}` })
  }

  const fileName = 'grain-conference-leads.csv'
  const importRequest = {
    name: (payload.name ?? 'Grain conference leads').slice(0, 200),
    dateFormat: 'DAY_MONTH_YEAR',
    files: [{ fileName, fileFormat: 'CSV', fileImportPage: { hasHeader: true, columnMappings: COLUMN_MAPPINGS } }],
  }
  const form = new FormData()
  form.append('importRequest', JSON.stringify(importRequest))
  form.append('files', new Blob([csv], { type: 'text/csv' }), fileName)

  const r = await hubspot(token, '/crm/v3/imports', { method: 'POST', body: form })
  if (!r.ok) {
    const hint = r.status === 401 ? 'token לא תקין' : r.status === 403 ? 'ל-token חסרה הרשאת crm.import' : r.body.message
    return json(r.status, { error: `HubSpot דחה את הייבוא: ${hint}` })
  }
  return json(200, { importId: r.body.id, state: r.body.state })
})
