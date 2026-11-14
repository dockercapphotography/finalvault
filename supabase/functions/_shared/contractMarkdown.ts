// ── Simple Markdown for the signed contract PDF ─────────────────────────────
// Same rules as src/utils/markdown.js (the screens): # / ## / ### headings,
// **bold**, *italic*, "- " or "* " bullets, "1. " numbered lines (the typed
// number is kept). Returns blocks for the PDF renderer to draw; it never
// changes the contract text itself (the signature hash covers the raw text).

export type Run = { text: string; bold: boolean; italic: boolean }
export type Block =
  | { kind: 'blank' }
  | { kind: 'heading'; level: number; runs: Run[] }
  | { kind: 'item'; marker: string; runs: Run[] }
  | { kind: 'para'; runs: Run[]; allCaps: boolean }

// Italic: *text* not part of **, and not "5 * 3" (no space after the opening *).
const ITALIC = /(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g

function italicRuns(text: string, bold: boolean): Run[] {
  const runs: Run[] = []
  let last = 0
  for (const m of text.matchAll(ITALIC)) {
    const start = (m.index ?? 0) + m[1].length
    if (start > last) runs.push({ text: text.slice(last, start), bold, italic: false })
    runs.push({ text: m[2], bold, italic: true })
    last = start + m[2].length + 2
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold, italic: false })
  return runs
}

export function parseInline(text: string, bold = false): Run[] {
  const runs: Run[] = []
  // Odd indexes are the insides of **...**.
  text.split(/\*\*(.+?)\*\*/).forEach((part, i) => {
    if (!part) return
    runs.push(...italicRuns(part, bold || i % 2 === 1))
  })
  return runs
}

export function parseContractMarkdown(body: string): Block[] {
  return body.split('\n').map((line): Block => {
    if (!line.trim()) return { kind: 'blank' }
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) return { kind: 'heading', level: heading[1].length, runs: parseInline(heading[2], true) }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    if (bullet) return { kind: 'item', marker: '•', runs: parseInline(bullet[1]) }
    const numbered = line.match(/^\s*(\d+)\.\s+(.*)$/)
    if (numbered) return { kind: 'item', marker: `${numbered[1]}.`, runs: parseInline(numbered[2]) }
    // Plain all-capitals lines with no period ("WEDDING DAY") were drawn bold
    // before Markdown was supported; keep that so older contracts look the same.
    const trimmed = line.trim()
    const allCaps = /^[A-Z\s&\/]{4,}$/.test(trimmed) && !trimmed.includes('.')
    return { kind: 'para', runs: parseInline(line), allCaps }
  })
}
