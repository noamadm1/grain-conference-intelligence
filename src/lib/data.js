// Supabase queries used by the screens.

import { supabase } from './supabase'
import { ICP_SETTINGS_KEY } from './icpDefaults'
import { mergeSettings } from './icp'

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

// PostgREST error code when a table or column doesn't exist yet (the SQL hasn't been run)
const isMissing = (error) => ['42P01', 'PGRST205', '42703', 'PGRST204'].includes(error?.code)

// The live ICP formula settings (app_settings → icp_formula), with defaults filled in
export async function fetchIcpSettings() {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', ICP_SETTINGS_KEY).maybeSingle()
  if (error && !isMissing(error)) throw error
  return mergeSettings(data?.value ?? {})
}

export const fetchUpcoming = async () =>
  must(
    await supabase
      .from('conference_editions')
      .select('*, series:conference_series(*)')
      .eq('status', 'upcoming')
      .order('icp_score', { ascending: false, nullsFirst: false }),
  )

// Every edition, upcoming and past, for the capture screen's conference picker (a lead can be recorded after the event)
export const fetchAllEditions = async () =>
  must(await supabase.from('conference_editions').select('id, start_date, city, status, series:conference_series(name)').order('start_date'))

// Returns null if the edition_assignments table doesn't exist yet (sql/002_screens.sql)
export async function fetchAssignments() {
  const { data, error } = await supabase.from('edition_assignments').select('id, edition_id, rep_name')
  if (isMissing(error)) return null
  if (error) throw error
  return data
}

export const addAssignment = async (edition_id, rep_name) =>
  must(await supabase.from('edition_assignments').insert({ edition_id, rep_name }).select('id, edition_id, rep_name').single())

export const removeAssignment = async (id) => must(await supabase.from('edition_assignments').delete().eq('id', id))

const ENCOUNTER_SELECT = '*, edition:conference_editions(id, start_date, city, series:conference_series(name, brand))'

// Encounters with the edition and series names, newest first
export const fetchEncounters = async (personId) =>
  must(await supabase.from('encounters').select(ENCOUNTER_SELECT).eq('person_id', personId).order('created_at', { ascending: false }))

// Check while the phone is being typed: does this person exist, and where did we meet them?
export async function lookupByPhone(e164) {
  const person = must(await supabase.from('people').select('*').eq('phone', e164).maybeSingle())
  if (!person) return null
  return { person, encounters: await fetchEncounters(person.id) }
}

export async function searchPeople(q) {
  const term = q.trim().replace(/[,()*%]/g, ' ')
  const build = (withHebrewName) => {
    let query = supabase.from('people').select('*').order('created_at', { ascending: false }).limit(50)
    if (!term) return query
    const digits = term.replace(/\D/g, '')
    const ors = [`first_name.ilike.*${term}*`, `last_name.ilike.*${term}*`, `current_company.ilike.*${term}*`]
    // Hebrew spelling of the name: "וובר" finds Weber, "מרקוס וובר" finds Marcus Weber
    if (withHebrewName) ors.push(`name_he.ilike.*${term}*`)
    if (digits.length >= 3) ors.push(`phone.ilike.*${digits}*`)
    // A full name ("Sarah Cohen"): match first + last name
    const [f, ...l] = term.split(/\s+/)
    if (l.length) ors.push(`and(first_name.ilike.*${f}*,last_name.ilike.*${l.join(' ')}*)`)
    return query.or(ors.join(','))
  }
  // Until sql/003_name_he.sql has been run, search without the Hebrew name instead of failing
  let res = await build(true)
  if (res.error && isMissing(res.error)) res = await build(false)
  const people = must(res)

  // Also by company at the time of the encounter ("who do I have at Adyen?" includes people who have since moved on)
  if (term) {
    const encs = must(await supabase.from('encounters').select('person_id').ilike('company', `%${term}%`).limit(100))
    const extra = [...new Set(encs.map((e) => e.person_id))].filter((id) => !people.some((p) => p.id === id))
    if (extra.length) people.push(...must(await supabase.from('people').select('*').in('id', extra)))
  }
  return people
}

export const fetchPerson = async (id) => must(await supabase.from('people').select('*').eq('id', id).single())

export const setPersonStatus = async (id, status) => must(await supabase.from('people').update({ status }).eq('id', id))

// Manual fill-in of fields the AI left empty
export const saveEncounterFields = async (id, { identity_line, extracted }) =>
  must(await supabase.from('encounters').update({ identity_line, extracted }).eq('id', id))

export async function audioUrl(path) {
  const { data, error } = await supabase.storage.from('recordings').createSignedUrl(path, 3600)
  return error ? null : data.signedUrl
}
