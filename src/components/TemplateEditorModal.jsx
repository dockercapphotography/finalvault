import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import Button from './ui/Button.jsx'
import Input from './ui/Input.jsx'
import MarkdownToolbar from './ui/MarkdownToolbar.jsx'

/**
 * TemplateEditorModal
 *
 * Shared create/edit modal for the flat-form template types -- Email,
 * Contract, Gallery. NOT used for Questionnaire, which keeps its own
 * full-page editor for now (dnd-kit drag-reorder question list is
 * meaningfully more complex than a modal-shell form; see the Sept 2026
 * template-refactor conversation for the reasoning).
 *
 * Replaces the old in-place pattern where each *TemplatesTab component
 * swapped its own SettingsSection content out for a full inline editor
 * form. This renders as an overlay instead -- same shell (overlay style,
 * 16px side padding, 90vh max-height with internal scroll, scroll-lock
 * on the page behind it) as SendContractModal.jsx, so template editing
 * now uses the same modal pattern already established elsewhere in the
 * app rather than introducing a new one.
 *
 * Props:
 *   title      : string -- header title, e.g. "New Email Template" / "Edit Template"
 *   fields     : [{ key, label, type?: 'markdown', placeholder?, required?, rows? }]
 *                type omitted (or anything other than 'markdown') renders
 *                a plain Input; type: 'markdown' renders MarkdownToolbar.
 *   values     : { [key]: string } -- current field values, controlled by caller
 *   onChange   : (key, value) => void
 *   variables  : [{ tag, desc }] | undefined -- shows the "Insert variable"
 *                pill row when present. Inserts into whichever field has
 *                type: 'markdown' (there's exactly one per form today).
 *   saving     : bool
 *   canSave    : bool -- disables Save when false
 *   onSave     : () => void
 *   onClose    : () => void
 */
export default function TemplateEditorModal({
  title, fields, values, onChange, variables,
  saving, canSave, onSave, onClose, children,
}) {
  const markdownRefs = useRef({})

  // Lock body scroll while open -- identical pattern to SendContractModal.
  useEffect(() => {
    const scrollY = window.scrollY
    const body = document.body
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.overflow = 'hidden'
    return () => {
      body.style.position = ''
      body.style.top = ''
      body.style.left = ''
      body.style.right = ''
      body.style.overflow = ''
      window.scrollTo(0, scrollY)
    }
  }, [])

  function handleInsertVariable(tag) {
    const markdownKey = fields?.find(f => f.type === 'markdown')?.key
    const ref = markdownKey ? markdownRefs.current[markdownKey] : null
    if (ref?.insertAtCursor) {
      ref.insertAtCursor(tag)
    } else if (markdownKey) {
      onChange(markdownKey, (values[markdownKey] || '') + tag)
    }
  }

  const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 40,
    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
  }
  const modalStyle = {
    position: 'fixed', left: '50%', top: '50%', zIndex: 50,
    transform: 'translate(-50%, -50%)',
    width: '100%', maxWidth: 560,
    padding: '0 16px',
  }
  const innerStyle = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 16, overflowX: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
    maxHeight: '90vh', display: 'flex', flexDirection: 'column',
  }

  return (
    <>
      <div style={overlayStyle} onClick={onClose} />
      <div style={modalStyle}>
        <div style={innerStyle}>
          <div className="px-6 py-4 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{title}</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4 overflow-y-auto">
            {children ? children : fields.map(field => (
              <div key={field.key}>
                {field.type === 'markdown' ? (
                  <>
                    <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>{field.label}</label>
                    <MarkdownToolbar
                      ref={el => { markdownRefs.current[field.key] = el }}
                      value={values[field.key] || ''}
                      onChange={v => onChange(field.key, v)}
                      placeholder={field.placeholder}
                      rows={field.rows || 8}
                    />
                  </>
                ) : (
                  <Input
                    label={field.label}
                    value={values[field.key] || ''}
                    onChange={v => onChange(field.key, v)}
                    placeholder={field.placeholder}
                    required={field.required}
                  />
                )}
              </div>
            ))}

            {variables && (
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Insert variable</p>
                <div className="flex flex-wrap gap-1.5">
                  {variables.map(v => (
                    <button key={v.tag} onClick={() => handleInsertVariable(v.tag)} title={v.desc}
                      className="text-xs px-2.5 py-1 rounded-lg font-mono"
                      style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)', cursor: 'pointer' }}>
                      {v.tag}
                    </button>
                  ))}
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Click a variable to insert it at your cursor position.</p>
              </div>
            )}
          </div>

          <div className="px-6 py-4 flex items-center gap-3 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
            <Button onClick={onSave} disabled={!canSave || saving}>
              {saving ? 'Saving…' : 'Save Template'}
            </Button>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </>
  )
}
