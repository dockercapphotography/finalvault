// ── Simple Markdown for templates and contracts ─────────────────────────────
// The small Markdown set the template toolbar writes: ## headings, **bold**,
// *italic*, "- " bullets and "1. " numbered lines. Used by the template
// editor's Preview and everywhere a contract is shown (Send Contract review,
// the contract page, the client's signing page), so all of them match.
// supabase/functions/_shared/contractMarkdown.ts applies the same rules to
// the signed PDF.
//
// Display only: the saved contract text (and its signature hash) is the raw
// text, never this HTML.

// Escape before any rule runs: the result is injected with
// dangerouslySetInnerHTML, and the text is written by any photographer.
// None of the supported syntax uses these characters.
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function applyInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>')
}

export function renderMarkdown(text) {
  if (!text) return ''
  return escapeHtml(text)
    .split('\n')
    .map(line => {
      const heading = line.match(/^(#{1,3})\s+(.*)$/)
      if (heading) {
        const size = heading[1].length === 1 ? '1.25em' : heading[1].length === 2 ? '1.1em' : '1em'
        return `<p style="font-size:${size};font-weight:700;margin:14px 0 6px">${applyInline(heading[2])}</p>`
      }
      // Bullets: "- " (and "* " followed by a space, so *italic* isn't one).
      const bullet = line.match(/^\s*[-*]\s+(.*)$/)
      if (bullet) {
        return `<div style="display:flex;gap:8px;margin:2px 0 2px 4px"><span aria-hidden="true">•</span><span style="flex:1;min-width:0">${applyInline(bullet[1])}</span></div>`
      }
      // Numbered lines keep the number that was typed (a contract's "4." stays 4).
      const numbered = line.match(/^\s*(\d+)\.\s+(.*)$/)
      if (numbered) {
        return `<div style="display:flex;gap:8px;margin:2px 0 2px 4px"><span>${numbered[1]}.</span><span style="flex:1;min-width:0">${applyInline(numbered[2])}</span></div>`
      }
      if (line.trim() === '') return '<div style="height:0.8em"></div>'
      // Plain all-capitals lines ("WEDDING DAY") read as sub-headings; the
      // PDF has always drawn them bold, so the screens do too.
      const trimmed = line.trim()
      if (/^[A-Z\s&/]{4,}$/.test(trimmed) && !trimmed.includes('.')) {
        return `<p style="margin:2px 0;font-weight:700">${applyInline(line)}</p>`
      }
      return `<p style="margin:2px 0">${applyInline(line)}</p>`
    })
    .join('')
}
