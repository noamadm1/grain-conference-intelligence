// Formatting helpers shared by the screens.

export const REGION_LABELS = {
  europe: 'אירופה',
  'north-america': 'צפון אמריקה',
  apac: 'אסיה-פסיפיק',
  'middle-east': 'המזרח התיכון',
  africa: 'אפריקה',
  'global-rotating': 'מתחלף',
}
export const regionLabel = (r) => REGION_LABELS[r] ?? r ?? '—'

// A rotating series (Sibos) has no fixed region. For filtering, each edition belongs to the region of the country it's held in that year.
const COUNTRY_REGION = {
  USA: 'north-america', Canada: 'north-america', Mexico: 'north-america',
  Singapore: 'apac', 'Hong Kong': 'apac', Japan: 'apac', Australia: 'apac', China: 'apac', India: 'apac',
  UAE: 'middle-east', 'Saudi Arabia': 'middle-east', Israel: 'middle-east',
  Egypt: 'africa', Morocco: 'africa', 'South Africa': 'africa', Kenya: 'africa', Nigeria: 'africa',
}
export const editionRegion = (e) => {
  const r = e.series?.region
  return r === 'global-rotating' ? COUNTRY_REGION[e.country] ?? 'europe' : r
}

const MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳']
export const monthLabel = (d) => `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`

// "18–21 אוק׳ 26"
export function dateRange(start, end) {
  const s = new Date(start)
  const e = new Date(end ?? start)
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return s.getDate() === e.getDate() ? `${s.getDate()} ${monthLabel(s)}` : `${s.getDate()}–${e.getDate()} ${monthLabel(s)}`
  }
  return `${s.getDate()} ${monthLabel(s)} – ${e.getDate()} ${monthLabel(e)}`
}

export const usd = (n) => (n == null ? 'עלות לא ידועה' : `$${Math.round(n).toLocaleString('en-US')}`)

export const quarterOf = (d) => `Q${Math.floor(new Date(d).getMonth() / 3) + 1} ${new Date(d).getFullYear()}`

// The calendar quarter after the current one: [start, end)
export function nextQuarterRange(today = new Date()) {
  const q = Math.floor(today.getMonth() / 3)
  const start = new Date(today.getFullYear(), (q + 1) * 3, 1)
  const end = new Date(start.getFullYear(), start.getMonth() + 3, 1)
  return [start, end]
}

export const monthsBetween = (a, b) => (new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24 * 30.44)

// Phone → E.164. The default country code is used for local numbers ("050...").
export function toE164(raw, defaultCc = '972') {
  if (!raw) return ''
  let s = String(raw).trim().replace(/[^\d+]/g, '')
  if (s.startsWith('00')) s = '+' + s.slice(2)
  if (s.startsWith('+')) return '+' + s.slice(1).replace(/\D/g, '')
  if (s.startsWith('0')) return `+${defaultCc}${s.slice(1)}`
  return s ? `+${defaultCc}${s}` : ''
}
export const isPlausiblePhone = (e164) => /^\+\d{8,15}$/.test(e164)

export const fullName = (p) => [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'ללא שם'
