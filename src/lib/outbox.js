// Offline outbox (PRD 7: "capture and processing are separate").
// Every lead goes to IndexedDB first, recording included, and is sent to Supabase when there's a connection.
// Every send step is idempotent, so a partial send can be retried safely:
//   person is looked up by phone · encounter is upserted with a fixed id · recording already uploaded counts as success.

import { supabase } from './supabase'
import { enqueueProcessing } from './processing'

const DB = 'grain-field'
const STORE = 'outbox'

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx(mode, fn) {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const result = fn(t.objectStore(STORE))
    t.oncomplete = () => resolve(result?.result ?? result)
    t.onerror = () => reject(t.error)
  })
}

export const listPending = () => tx('readonly', (s) => s.getAll())
const remove = (id) => tx('readwrite', (s) => s.delete(id))

// lead: { phone, name, company, repName, editionId, audio?: Blob }
export async function enqueue(lead) {
  const item = { ...lead, id: uuid(), createdAt: new Date().toISOString() }
  await tx('readwrite', (s) => s.put(item))
  return item
}

async function send(item) {
  const [first, ...rest] = (item.name ?? '').trim().split(/\s+/).filter(Boolean)
  const last = rest.join(' ')

  // 1. Person, identified by phone
  const { data: found, error: findErr } = await supabase.from('people').select('*').eq('phone', item.phone).maybeSingle()
  if (findErr) throw findErr
  let person = found
  if (!person) {
    const { data, error } = await supabase
      .from('people')
      .insert({ phone: item.phone, first_name: first ?? null, last_name: last || null, current_company: item.company || null, status: 'active' })
      .select()
      .single()
    if (error) throw error
    person = data
  } else {
    // Fill in missing details. A different company becomes current_company, and the old one stays on the earlier encounters.
    const patch = {}
    if (!person.first_name && first) patch.first_name = first
    if (!person.last_name && last) patch.last_name = last
    if (item.company && item.company !== person.current_company) patch.current_company = item.company
    if (Object.keys(patch).length) {
      const { error } = await supabase.from('people').update(patch).eq('id', person.id)
      if (error) throw error
    }
  }

  // 2. Encounter. The id is fixed from the queue item, so a retry doesn't create a duplicate.
  const { error: encErr } = await supabase.from('encounters').upsert({
    id: item.id,
    person_id: person.id,
    edition_id: item.editionId || null,
    rep_name: item.repName || null,
    company: item.company || person.current_company || null,
    created_at: item.createdAt,
  })
  if (encErr) throw encErr

  // 3. Recording (if there is one)
  if (item.audio) {
    const ext = (item.audio.type.split('/')[1] || 'webm').split(';')[0]
    const path = `${item.id}.${ext}`
    const { error: upErr } = await supabase.storage.from('recordings').upload(path, item.audio, { contentType: item.audio.type })
    if (upErr && !/exists|duplicate/i.test(upErr.message)) throw upErr
    const { error } = await supabase.from('encounters').update({ audio_path: path }).eq('id', item.id)
    if (error) throw error
    // Transcription and extraction in the background. The lead is already saved, so a failure here loses nothing.
    enqueueProcessing(item.id, { blob: item.audio, label: item.name || item.phone })
  }
}

let flushing = null
// Sends everything waiting in the queue. Returns { sent, pending, error }.
export function flush() {
  flushing ??= (async () => {
    let sent = 0
    let lastError = null
    for (const item of await listPending()) {
      try {
        await send(item)
        await remove(item.id)
        sent++
      } catch (e) {
        lastError = e
        if (!navigator.onLine) break
      }
    }
    const pending = (await listPending()).length
    return { sent, pending, error: lastError?.message ?? null }
  })().finally(() => (flushing = null))
  return flushing
}
