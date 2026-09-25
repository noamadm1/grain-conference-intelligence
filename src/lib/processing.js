// Background processing queue: recording → transcript → extracted fields → encounter.
// It runs after the lead is already saved, so the rep never waits, and a failure never loses the lead.
//
// The state lives in the DB, not in memory: an encounter with audio_path whose extracted is null still needs processing.
// So everything survives a reload, a lost connection or missing keys, and resumePending() picks it up again.
// Each step is saved as soon as it succeeds: a transcript that was saved isn't transcribed again when extraction is retried.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { extract, suggestActions, transcribe } from './ai'
import { getApiKeys, hasApiKeys } from './apiKeys'
import { SUGGESTED_ACTIONS_ENABLED } from './features'
import { fullName } from './format'

const jobs = new Map() // encounterId → { id, label, status, error, result }
const listeners = new Set()
const queue = []
let running = false

const emit = () => listeners.forEach((fn) => fn(new Map(jobs)))
const setJob = (id, patch) => {
  jobs.set(id, { ...jobs.get(id), id, ...patch })
  emit()
}

export function useJobs() {
  const [state, setState] = useState(() => new Map(jobs))
  useEffect(() => {
    listeners.add(setState)
    return () => listeners.delete(setState)
  }, [])
  return state
}

// blob: the recording, if it's still in memory (saves a download). label: a name to show while it runs.
export function enqueueProcessing(encounterId, { blob = null, label = null } = {}) {
  const cur = jobs.get(encounterId)
  if (cur && ['queued', 'transcribing', 'extracting'].includes(cur.status)) return
  setJob(encounterId, { label: label ?? cur?.label ?? null, status: 'queued', error: null, blob })
  queue.push(encounterId)
  run()
}

export const retryProcessing = (encounterId) => enqueueProcessing(encounterId)

async function run() {
  if (running) return
  running = true
  while (queue.length) {
    const id = queue.shift()
    try {
      await processOne(id)
    } catch (e) {
      setJob(id, { status: 'failed', error: e.message ?? String(e) })
    }
  }
  running = false
}

async function processOne(id) {
  const keys = getApiKeys()
  if (!hasApiKeys(keys)) {
    setJob(id, { status: 'no-keys', error: 'חסר מפתח OpenAI. ההקלטה שמורה ותעובד אחרי שיוזן בהגדרות.' })
    return
  }
  if (!navigator.onLine) {
    setJob(id, { status: 'failed', error: 'אין חיבור. ייעשה ניסיון נוסף כשהחיבור יחזור.' })
    return
  }

  const { data: enc, error } = await supabase
    .from('encounters')
    .select('*, person:people(first_name, last_name, current_company), edition:conference_editions(series:conference_series(name))')
    .eq('id', id)
    .single()
  if (error) throw error
  // Already processed (e.g. the outbox retried a send): don't extract again, to avoid overwriting manual edits
  if (enc.extracted) {
    setJob(id, { status: 'done', error: null, blob: null, result: { transcript: enc.transcript, identity_line: enc.identity_line, extracted: enc.extracted } })
    return
  }
  const label = jobs.get(id)?.label ?? (fullName(enc.person) !== 'ללא שם' ? fullName(enc.person) : null)
  setJob(id, { label })

  // 1. Transcription (only if it hasn't been done already)
  let transcript = enc.transcript
  if (!transcript) {
    setJob(id, { status: 'transcribing' })
    let blob = jobs.get(id)?.blob
    if (!blob) {
      const dl = await supabase.storage.from('recordings').download(enc.audio_path)
      if (dl.error) throw new Error(`ההקלטה לא נטענה מהשרת: ${dl.error.message}`)
      blob = dl.data
    }
    transcript = await transcribe(blob, keys.openai)
    if (!transcript) throw new Error('התמלול יצא ריק. ייתכן שההקלטה שקטה מדי. ההקלטה שמורה.')
    const { error: tErr } = await supabase.from('encounters').update({ transcript }).eq('id', id)
    if (tErr) throw tErr
  }

  // 2. Extraction
  setJob(id, { status: 'extracting', blob: null })
  const person = enc.person ?? {}
  const fields = await extract(
    transcript,
    { name: fullName(person) === 'ללא שם' ? null : fullName(person), company: enc.company ?? person.current_company, conference: enc.edition?.series?.name },
    keys.openai,
  )
  // name_he belongs to the person, not the encounter
  const { identity_line, name_he, ...extracted } = fields
  const { error: xErr } = await supabase.from('encounters').update({ identity_line, extracted }).eq('id', id)
  if (xErr) throw xErr

  // 3. Suggested next actions, from what was said. Off for now (features.js, PRD 11): skipped entirely.
  // Not critical when on: if it fails (or the column doesn't exist yet), the lead is fully saved anyway
  if (SUGGESTED_ACTIONS_ENABLED) {
    try {
      const actions = await suggestActions(
        { ...enc, transcript, identity_line, extracted, conference: enc.edition?.series?.name },
        keys.openai,
      )
      await supabase.from('encounters').update({ suggested_actions: actions }).eq('id', id)
    } catch {
      /* left as null: can be generated from the Person screen */
    }
  }

  // Hebrew spelling of the name, for Hebrew search ("וובר" → Weber). Only if the person has none yet: never overwrite.
  // Not critical: before sql/003_name_he.sql the column doesn't exist, and the lead is saved anyway.
  if (name_he && enc.person_id) {
    await supabase.from('people').update({ name_he }).eq('id', enc.person_id).is('name_he', null)
  }

  setJob(id, { status: 'done', error: null, result: { transcript, identity_line, extracted } })
}

// Picks up encounters that still need processing (a reload, missing keys, a failure earlier)
// retryFailed: also retry failures from this session (e.g. when the connection comes back)
export async function resumePending({ retryFailed = false } = {}) {
  if (!hasApiKeys() || !navigator.onLine) return
  const { data, error } = await supabase
    .from('encounters')
    .select('id')
    .not('audio_path', 'is', null)
    .is('extracted', null)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return
  data.forEach((e) => {
    const s = jobs.get(e.id)?.status
    if (s !== 'failed' || retryFailed) enqueueProcessing(e.id)
  })
}
