// The three returning-contact tags (PRD 8). They're based on facts from the encounters only, with no guessing.
// encounters: sorted newest first. Each one has created_at, extracted { timing, pain, next_step }.

import { monthsBetween } from './format.js'

const NEXT_QUARTER = /רבעון הבא|next quarter/i
const norm = (s) => (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ')

// The end of the quarter after the date: the point where "next quarter" has already passed
function endOfNextQuarter(d) {
  const x = new Date(d)
  const q = Math.floor(x.getMonth() / 3)
  return new Date(x.getFullYear(), (q + 2) * 3, 1)
}

export function personTags(person, encounters, today = new Date()) {
  if (person?.status === 'archived' || !encounters.length) return []
  const tags = []
  const latest = encounters[0]

  // ⏰ Time has come: said "next quarter" (or gave a date) and that time has passed
  const timing = latest.extracted?.timing
  const due = latest.extracted?.timing_due ? new Date(latest.extracted.timing_due) : NEXT_QUARTER.test(timing ?? '') ? endOfNextQuarter(latest.created_at) : null
  if (due && due <= today) {
    tags.push({ key: 'due', label: '⏰ הזמן הגיע', tone: 'good', hint: `אמר/ה "${timing ?? 'בקרוב'}" ב-${new Date(latest.created_at).getFullYear()}. מה קרה?` })
  }

  // ⏸️ Stuck: 3+ encounters with the same answer (timing or pain unchanged across the last three)
  if (encounters.length >= 3) {
    const last3 = encounters.slice(0, 3)
    const same = (f) => {
      const v = last3.map((e) => norm(e.extracted?.[f]))
      return v[0] && v.every((x) => x === v[0])
    }
    if (same('timing') || same('pain')) {
      tags.push({ key: 'stuck', label: '⏸️ תקוע', tone: 'warn', hint: `${encounters.length} מפגשים, אותה תשובה. כדאי לשאול מה חוסם.` })
    }
  }

  // 💤 Dormant: we haven't met for 18+ months
  const gap = monthsBetween(latest.created_at, today)
  if (gap >= 18) {
    tags.push({ key: 'dormant', label: '💤 רדום', tone: 'info', hint: `לא נפגשנו ${Math.floor(gap)} חודשים. לחדש או לסגור.` })
  }

  return tags
}
