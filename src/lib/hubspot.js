// Sending leads to HubSpot (PRD 10) through the Edge Function hubspot-import, plus downloading the CSV.
// Contacts and Companies only. No Deals: a lead from a conference is not a deal.

import { supabase } from './supabase'
import { getApiKeys } from './apiKeys'

// Download. The BOM makes Excel show Hebrew correctly.
export function downloadCsv(csv, fileName) {
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function callFunction(body, token = getApiKeys().hubspot) {
  const { data, error } = await supabase.functions.invoke('hubspot-import', { body, headers: { 'x-hubspot-token': token } })
  if (!error) return data
  // Error from the function itself ({ error }) or from the platform (the function isn't deployed / no connection)
  const res = error.context
  if (res && typeof res.json === 'function') {
    const b = await res.json().catch(() => null)
    if (b?.error) throw new Error(b.error)
    if (res.status === 404) throw new Error('הפונקציה hubspot-import עדיין לא פרוסה ב-Supabase')
    if (res.status === 401) throw new Error('הפונקציה דורשת JWT. יש לכבות "Verify JWT" בהגדרות הפונקציה')
    throw new Error(`שגיאה ${res.status}`)
  }
  throw new Error(navigator.onLine ? 'לא ניתן להגיע לפונקציה hubspot-import. האם היא פרוסה?' : 'אין חיבור')
}

// Returns 'ok' or an error message (for the settings screen)
export async function testHubspotToken(token) {
  try {
    await callFunction({ action: 'ping' }, token)
    return 'ok'
  } catch (e) {
    return e.message
  }
}

export const startImport = (csv, name) => callFunction({ action: 'import', csv, name })
export const importStatus = (importId) => callFunction({ action: 'status', importId: String(importId) })
