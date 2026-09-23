// Per-device preferences (the rep's name, the current conference, the country code). Kept in localStorage only.
// Wrapped in try/catch because private browsing can block storage. Then the defaults are used.

const KEY = 'grain.prefs'
const DEFAULTS = { repName: '', editionId: '', countryCode: '972' }

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
  return next
}
