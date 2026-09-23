// API keys entered by the user on the settings screen. Kept in this browser's localStorage only.
// The brief says keys are configured by the user, never in the code, .env or the build.
// openai: transcription (Whisper) and extraction. Required for the AI feature.
// hubspot: a Private App token for sending leads. Optional; without it, CSV download is still available.
// Note: any script running on this site can read localStorage. That's acceptable for an internal tool without login.

export const EXTRACTION_MODEL = 'gpt-4o-mini'

const KEY = 'grain.apiKeys'
const listeners = new Set()

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

function write(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj))
  } catch {
    /* storage blocked: the keys won't persist */
  }
}

// Remove an Anthropic key left over from an earlier version: a secret that's no longer used shouldn't stay stored
{
  const { anthropic, ...rest } = read()
  if (anthropic !== undefined) write(rest)
}

export const getApiKeys = () => {
  const k = read()
  return { openai: k.openai ?? '', hubspot: k.hubspot ?? '' }
}

export function setApiKeys(patch) {
  const next = { ...getApiKeys(), ...patch }
  write(next)
  listeners.forEach((fn) => fn(next))
  return next
}

export const hasApiKeys = (k = getApiKeys()) => Boolean(k.openai)
export const hasHubspotToken = (k = getApiKeys()) => Boolean(k.hubspot)

export function onApiKeysChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
