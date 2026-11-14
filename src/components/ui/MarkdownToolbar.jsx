import { useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { Bold, Italic, Heading2, List, ListOrdered, Eye, Pencil } from 'lucide-react'
import { renderMarkdown } from '../../utils/markdown.js'

// Change the textarea's text and put the caret back without the view
// jumping. Setting a new value moves the browser's scroll to the end of
// the text, and focus() can scroll the modal, so save every scroll
// position first and restore them once React has re-rendered.
function editKeepingScroll(el, onChange, newVal, selStart, selEnd = selStart) {
  const saved = []
  for (let node = el; node; node = node.parentElement) {
    saved.push([node, node.scrollTop, node.scrollLeft])
  }
  onChange(newVal)
  requestAnimationFrame(() => {
    el.focus({ preventScroll: true })
    el.setSelectionRange(selStart, selEnd)
    for (const [node, top, left] of saved) {
      node.scrollTop = top
      node.scrollLeft = left
    }
  })
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
      editKeepingScroll(el, onChange, newVal, start + text.length)
    },
  }))

  function wrap(before, after) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end) || 'text'
    const newVal = value.slice(0, start) + before + selected + after + value.slice(end)
    editKeepingScroll(el, onChange, newVal, start + before.length, start + before.length + selected.length)
  }

  function prependLine(prefix) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const newVal = value.slice(0, lineStart) + prefix + value.slice(lineStart)
    editKeepingScroll(el, onChange, newVal, start + prefix.length)
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
