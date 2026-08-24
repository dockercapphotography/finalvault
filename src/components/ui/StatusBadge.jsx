/**
 * Generic status pill. Caller supplies the status->style map since
 * different domains have entirely different status vocabularies (zip
 * job queue states, gallery states, contract states, etc) -- this
 * component only knows how to render a pill, not what any given status
 * means.
 *
 * styles shape: { [status]: { bg, fg, label } }
 */
export default function StatusBadge({ status, styles, fallbackLabel }) {
  const s = styles[status] || { bg: '#f3f4f6', fg: '#374151', label: fallbackLabel || status }
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  )
}
