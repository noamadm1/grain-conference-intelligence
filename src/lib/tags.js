// The three returning-contact tags (PRD 8). They're based on facts from the encounters only, with no guessing.
// encounters: sorted newest first. Each one has created_at, extracted { timing, pain, next_step }.

import { monthName, monthsBetween } from './format.js'

// Short name (list, filter chips) + a colored dot, not an emoji: a sales tool, not a messaging app.
// dot: good = green, warn = orange, idle = gray. The hint (Person screen) says the fact behind the tag.
export const TAG_META = {
  due: { label: 'הבטיח לחזור', dot: 'good' },
  stuck: { label: 'לא מתקדם', dot: 'warn' },
  dormant: { label: 'לא דיברנו שנה+', dot: 'idle' },
}

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

  // Promised to come back: said "next quarter" (or gave a date) and that time has passed
  const timing = latest.extracted?.timing
  const due = latest.extracted?.timing_due ? new Date(latest.extracted.timing_due) : NEXT_QUARTER.test(timing ?? '') ? endOfNextQuarter(latest.created_at) : null
  if (due && due <= today) {
    const when = monthName(new Date(latest.created_at))
    const hint = NEXT_QUARTER.test(timing ?? '') ? `אמר/ה 'רבעון הבא' ב${when}, והרבעון עבר` : `אמר/ה '${timing ?? 'בקרוב'}' ב${when}, והמועד עבר`
    tags.push({ key: 'due', ...TAG_META.due, hint })
  }

  // Not moving: 3+ encounters with the same answer (timing or pain unchanged across the last three)
  if (encounters.length >= 3) {
    const last3 = encounters.slice(0, 3)
    const same = (f) => {
      const v = last3.map((e) => norm(e.extracted?.[f]))
      return v[0] && v.every((x) => x === v[0])
    }
    if (same('timing') || same('pain')) {
      // The check is on the last three, so the hint says three even when there were more
      tags.push({ key: 'stuck', ...TAG_META.stuck, hint: encounters.length === 3 ? '3 מפגשים, ובכולם אותה תשובה' : '3 המפגשים האחרונים, ובכולם אותה תשובה' })
    }
  }

  // Haven't talked in a while: 18+ months since the last encounter
  const gap = monthsBetween(latest.created_at, today)
  if (gap >= 18) {
    tags.push({ key: 'dormant', ...TAG_META.dormant, hint: `המפגש האחרון היה לפני ${Math.floor(gap)} חודשים` })
  }

  return tags
}
