import { useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { Bold, Italic, Heading2, List, ListOrdered, Eye, Pencil } from 'lucide-react'

function renderMarkdown(text) {
  if (!text) return ''
  // Simple markdown rendering — bold, italic, headings, lists
  return text
    .split('\n')
    .map(line => {
      // H2
      if (line.startsWith('## ')) return `<h2 style="font-size:15px;font-weight:600;margin:8px 0 4px">${line.slice(3)}</h2>`
      // Unordered list
      if (line.startsWith('- ')) return `<li style="margin-left:16px;list-style-type:disc">${applyInline(line.slice(2))}</li>`
      // Ordered list — simple 1. 2. etc
      const olMatch = line.match(/^(\d+)\.\s(.*)/)
      if (olMatch) return `<li style="margin-left:16px;list-style-type:decimal">${applyInline(olMatch[2])}</li>`
      // Empty line → paragraph break
      if (line.trim() === '') return '<br/>'
      return `<p style="margin:2px 0">${applyInline(line)}</p>`
    })
    .join('')
}

function applyInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
}

const MarkdownToolbar = forwardRef(function MarkdownToolbar({ value, onChange, placeholder, rows = 8 }, ref) {
  const [preview, setPreview] = useState(false)
  const textareaRef = useRef(null)

  useImperativeHandle(ref, () => ({
    insertAtCursor(text) {
      const el = textareaRef.current
      if (!el) { onChange(value + text); return }
      const start = el.selectionStart
      const end = el.selectionEnd
      const newVal = value.slice(0, start) + text + value.slice(end)
      onChange(newVal)
      setTimeout(() => {
        el.focus()
        el.selectionStart = el.selectionEnd = start + text.length
      }, 0)
    },
  }))

  function wrap(before, after) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end) || 'text'
    const newVal = value.slice(0, start) + before + selected + after + value.slice(end)
    onChange(newVal)
    setTimeout(() => {
      el.focus()
      el.selectionStart = start + before.length
      el.selectionEnd = start + before.length + selected.length
    }, 0)
  }

  function prependLine(prefix) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const newVal = value.slice(0, lineStart) + prefix + value.slice(lineStart)
    onChange(newVal)
    setTimeout(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + prefix.length
    }, 0)
  }

  const toolbarButtons = [
    { icon: Bold,        title: 'Bold',           action: () => wrap('**', '**') },
    { icon: Italic,      title: 'Italic',          action: () => wrap('*', '*') },
    { icon: Heading2,    title: 'Heading',         action: () => prependLine('## ') },
    { icon: List,        title: 'Bullet list',     action: () => prependLine('- ') },
    { icon: ListOrdered, title: 'Numbered list',   action: () => prependLine('1. ') },
  ]

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 rounded-t-lg"
        style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderBottom: 'none' }}>
        {toolbarButtons.map(({ icon: Icon, title, action }) => (
          <button
            key={title}
            type="button"
            title={title}
            onClick={action}
            className="p-1.5 rounded"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <Icon size={13} />
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setPreview(p => !p)}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded"
          style={{
            background: preview ? 'rgba(99,102,241,0.1)' : 'none',
            color: preview ? '#6366f1' : 'var(--text-muted)',
            border: 'none', cursor: 'pointer',
          }}>
          {preview ? <Pencil size={11} /> : <Eye size={11} />}
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>

      {/* Textarea or preview */}
      {preview ? (
        <div
          className="w-full text-sm px-3 py-2.5"
          style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: '0 0 8px 8px',
            color: 'var(--text)',
            minHeight: `${rows * 1.6}em`,
            lineHeight: 1.6,
          }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(value) || `<span style="color:var(--text-muted)">(empty)</span>` }}
        />
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          style={{
            width: '100%',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: '0 0 8px 8px',
            color: 'var(--text)',
            padding: '10px 12px',
            fontSize: 13,
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit',
            lineHeight: 1.6,
            boxSizing: 'border-box',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
      )}
    </div>
  )
})

export default MarkdownToolbar
