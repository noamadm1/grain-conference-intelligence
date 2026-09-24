// A returning-contact tag: a small colored dot and a short name. Pill-shaped but neutral (white, gray border),
// so it doesn't read like a recommendation tag (מומלץ / לא מומלץ), which is tinted.
export default function PersonTag({ tag }) {
  return (
    <span className="tag person-tag">
      <span className={`dot ${tag.dot}`} aria-hidden="true" />
      {tag.label}
    </span>
  )
}
