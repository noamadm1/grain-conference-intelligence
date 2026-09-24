// Per-device preferences (the rep's name, the current conference, the country code). Kept in localStorage only.
// Wrapped in try/catch because private browsing can block storage. Then the defaults are used.

const KEY = 'grain.prefs'
const DEFAULTS = { repName: '', editionId: '', countryCode: '972' }
const listeners = new Set()

export function getPrefs() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setPrefs(patch) {
  const next = { ...getPrefs(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable: preference lasts for this session only */
  }
  listeners.forEach((fn) => fn(next))
  return next
}

// The top bar and the field screen both edit the rep name, so each one follows the other's changes
export function onPrefsChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// "Mine" = the encounter's rep_name matches the name set on this device. Display-only personalization, not identity:
// no login, so this is a convenience filter, not a permission.
const norm = (s) => (s ?? '').trim().toLowerCase()
export const isMine = (repName, encounterRepName) => Boolean(norm(repName)) && norm(repName) === norm(encounterRepName)
