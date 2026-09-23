import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { searchPeople } from '../lib/data'
import { supabase } from '../lib/supabase'
import { fullName } from '../lib/format'
import { personTags } from '../lib/tags'

const TAG_FILTERS = [
  { key: null, label: 'הכל' },
  { key: 'due', label: '⏰ הזמן הגיע' },
  { key: 'stuck', label: '⏸️ תקוע' },
  { key: 'dormant', label: '💤 רדום' },
]

// Search by name, phone or company. Tags in the list are a sorting tool, with no limit on how many.
export default function People() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState(null)
  const [tagFilter, setTagFilter] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const people = await searchPeople(q)
        const ids = people.map((p) => p.id)
        const { data: encs, error } = ids.length
          ? await supabase
              .from('encounters')
              .select('person_id, created_at, extracted, company, edition:conference_editions(start_date, series:conference_series(name))')
              .in('person_id', ids)
              .order('created_at', { ascending: false })
          : { data: [] }
        if (error) throw error
        const byPerson = Object.groupBy?.(encs, (e) => e.person_id) ?? encs.reduce((m, e) => ((m[e.person_id] ??= []).push(e), m), {})
        if (!cancelled) {
          setRows(people.map((p) => ({ p, encs: byPerson[p.id] ?? [], tags: personTags(p, byPerson[p.id] ?? []) })))
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q])

  const shown = rows?.filter((r) => !tagFilter || r.tags.some((t) => t.key === tagFilter)) ?? []

  return (
    <main className="page">
      <div className="page-head">
        <h1>אנשי קשר</h1>
        <p className="sub">מי זה ומה היה? חיפוש לפי שם, טלפון או חברה.</p>
      </div>

      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="שרה · 050… · Adyen" autoFocus style={{ marginBottom: 12 }} />

      <div className="chips" style={{ marginBottom: 16 }}>
        {TAG_FILTERS.map((f) => (
          <button key={f.label} className={`chip ${tagFilter === f.key ? 'on' : ''}`} onClick={() => setTagFilter(f.key)}>
            {f.label}
            {f.key && rows ? ` (${rows.filter((r) => r.tags.some((t) => t.key === f.key)).length})` : ''}
          </button>
        ))}
      </div>

      {error && <div className="notice bad">שגיאה: {error}</div>}
      {!rows && !error && <p className="sub">טוען…</p>}
      {rows && shown.length === 0 && (
        <div className="card sub">{q || tagFilter ? 'לא נמצאו אנשי קשר.' : 'עדיין אין אנשי קשר. הם נוצרים מתוך מסך התיעוד בשטח.'}</div>
      )}

      <div className="stack">
        {shown.map(({ p, encs, tags }) => {
          const last = encs[0]
          return (
            <Link key={p.id} to={`/people/${p.id}`} className="card tight" style={{ color: 'inherit', display: 'block' }}>
              <div className="row">
                <strong>{fullName(p)}</strong>
                <span className="sub small">{[p.current_title, p.current_company].filter(Boolean).join(' · ')}</span>
                <span className="spacer" />
                {p.status === 'archived' && <span className="tag">סגור</span>}
                {tags.map((t) => (
                  <span key={t.key} className={`tag ${t.tone}`}>
                    {t.label}
                  </span>
                ))}
              </div>
              <div className="meta small" style={{ marginTop: 4 }}>
                <span style={{ direction: 'ltr' }}>{p.phone}</span>
                <span>
                  {encs.length} מפגשים
                  {last ? ` · אחרון: ${last.edition?.series?.name ?? 'מפגש'} ${new Date(last.edition?.start_date ?? last.created_at).getFullYear()}` : ''}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </main>
  )
}
