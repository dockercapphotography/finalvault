import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { CheckCircle, AlertCircle, Loader } from 'lucide-react'

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getSessionByToken(token) {
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      id, name, description, mode, submit_token,
      photographers ( display_name, business_name ),
      session_questionnaires (
        sort_order,
        questionnaire_templates (
          id, name, header_text, require_agreement, agreement_label, confirmation_message, collect_email, collect_name,
          questionnaire_questions ( id, type, label, options, required, sort_order )
        )
      )
    `)
    .eq('submit_token', token)
    .single()
  if (error) return null

  // Sort session_questionnaires by sort_order and build a merged template view
  const sqs = (data.session_questionnaires || []).sort((a, b) => a.sort_order - b.sort_order)
  const templates = sqs.map(sq => sq.questionnaire_templates).filter(Boolean)

  // Merge: use first template's header/agreement/confirmation settings, merge all questions
  const merged = templates.length === 0 ? null : {
    ...templates[0],
    questionnaire_questions: templates.flatMap(t =>
      (t.questionnaire_questions || []).sort((a, b) => a.sort_order - b.sort_order)
    ),
  }

  return { ...data, questionnaire_templates: merged, _templates: templates }
}

async function submitForm({ sessionId, email, creditHandle, questions, answers, agreedToTerms }) {
  const { error } = await supabase
    .from('session_submissions')
    .insert({
      session_id: sessionId,
      email: email.trim(),
      credit_handle: creditHandle?.trim() || null,
      questions,
      answers,
      agreed_to_terms: agreedToTerms,
      agreed_at: agreedToTerms ? new Date().toISOString() : null,
      submitted_at: new Date().toISOString(),
    })
  if (error) throw error
}

// ── Markdown renderer (minimal, same as MarkdownToolbar) ──────────────────────

function renderMarkdown(text) {
  if (!text) return ''
  return text.split('\n').map(line => {
    if (line.startsWith('## ')) return `<h2 style="font-size:17px;font-weight:700;color:#111;margin:12px 0 6px">${line.slice(3)}</h2>`
    if (line.startsWith('- ')) return `<li style="margin-left:20px;list-style-type:disc;margin-bottom:4px;color:#374151">${applyInline(line.slice(2))}</li>`
    const ol = line.match(/^(\d+)\.\s(.*)/)
    if (ol) return `<li style="margin-left:20px;list-style-type:decimal;margin-bottom:4px;color:#374151">${applyInline(ol[2])}</li>`
    if (line.trim() === '') return '<br/>'
    return `<p style="margin:4px 0;color:#374151">${applyInline(line)}</p>`
  }).join('')
}

function applyInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
}

// ── Screens ───────────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader size={24} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function ErrorScreen({ message }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <AlertCircle size={24} style={{ color: '#ef4444' }} />
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111', margin: '0 0 8px', fontFamily: 'system-ui, sans-serif' }}>Form unavailable</h1>
        <p style={{ fontSize: 15, color: '#6b7280', margin: 0, fontFamily: 'system-ui, sans-serif', lineHeight: 1.6 }}>{message}</p>
      </div>
    </div>
  )
}

function ConfirmScreen({ session, confirmationMessage }) {
  const studioName = session.photographers?.business_name || session.photographers?.display_name || 'Your Photographer'
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <CheckCircle size={28} style={{ color: '#22c55e' }} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: '0 0 10px', fontFamily: 'system-ui, sans-serif' }}>
          You're all set!
        </h1>
        <p style={{ fontSize: 15, color: '#374151', margin: '0 0 6px', fontFamily: 'system-ui, sans-serif', lineHeight: 1.6 }}>
          Thanks for submitting your info for{' '}
          <strong style={{ display: 'inline', whiteSpace: 'nowrap' }}>{session.name}</strong>.
        </p>
        <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px', fontFamily: 'system-ui, sans-serif', lineHeight: 1.6 }}>
          {confirmationMessage || `${studioName} will be in touch when your photos are ready.`}
        </p>

      </div>
    </div>
  )
}

// ── Question renderers ────────────────────────────────────────────────────────

function QuestionField({ question, value, onChange }) {
  const inputStyle = {
    width: '100%',
    padding: '11px 14px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 15,
    color: '#111',
    outline: 'none',
    boxSizing: 'border-box',
    background: '#fff',
    fontFamily: 'system-ui, sans-serif',
  }

  switch (question.type) {
    case 'short_text':
      return (
        <input type="text" value={value || ''} onChange={e => onChange(e.target.value)}
          style={inputStyle}
          onFocus={e => e.target.style.borderColor = '#6366f1'}
          onBlur={e => e.target.style.borderColor = '#d1d5db'} />
      )
    case 'long_text':
      return (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={4}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
          onFocus={e => e.target.style.borderColor = '#6366f1'}
          onBlur={e => e.target.style.borderColor = '#d1d5db'} />
      )
    case 'yes_no':
      return (
        <div style={{ display: 'flex', gap: 10 }}>
          {['Yes', 'No'].map(opt => (
            <button key={opt} type="button" onClick={() => onChange(opt)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 15, fontWeight: 500,
                border: value === opt ? '2px solid #6366f1' : '2px solid #d1d5db',
                background: value === opt ? 'rgba(99,102,241,0.08)' : '#fff',
                color: value === opt ? '#6366f1' : '#374151',
                cursor: 'pointer', fontFamily: 'system-ui, sans-serif',
              }}>
              {opt}
            </button>
          ))}
        </div>
      )
    case 'single_choice':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(question.options || []).map(opt => (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="radio" name={question.id} value={opt} checked={value === opt}
                onChange={() => onChange(opt)}
                style={{ width: 16, height: 16, accentColor: '#6366f1', flexShrink: 0, cursor: 'pointer' }} />
              <span style={{ fontSize: 15, color: '#374151', fontFamily: 'system-ui, sans-serif' }}>{opt}</span>
            </label>
          ))}
        </div>
      )
    case 'multi_choice':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(question.options || []).map(opt => {
            const selected = Array.isArray(value) ? value.includes(opt) : false
            return (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={selected}
                  onChange={() => {
                    const current = Array.isArray(value) ? value : []
                    onChange(selected ? current.filter(v => v !== opt) : [...current, opt])
                  }}
                  style={{ width: 16, height: 16, accentColor: '#6366f1', flexShrink: 0, cursor: 'pointer' }} />
                <span style={{ fontSize: 15, color: '#374151', fontFamily: 'system-ui, sans-serif' }}>{opt}</span>
              </label>
            )
          })}
        </div>
      )
    case 'date':
      return (
        <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
          style={inputStyle}
          onFocus={e => e.target.style.borderColor = '#6366f1'}
          onBlur={e => e.target.style.borderColor = '#d1d5db'} />
      )
    default:
      return null
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SubmitForm() {
  const { token } = useParams()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // Form state
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [creditHandle, setCreditHandle] = useState('')
  const [answers, setAnswers] = useState({})
  const [agreed, setAgreed] = useState(false)

  useEffect(() => {
    getSessionByToken(token).then(data => {
      setSession(data)
      setLoading(false)
    })
  }, [token])

  function setAnswer(questionId, value) {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }

  function validate() {
    const tmpl = session?.questionnaire_templates
    if (tmpl?.collect_email) {
      if (!email.trim()) return false
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return false
    }
    if (tmpl?.collect_name && !creditHandle.trim()) return false
    const questions = tmpl?.questionnaire_questions || []
    for (const q of questions) {
      if (!q.required) continue
      const a = answers[q.id]
      if (!a || (Array.isArray(a) && a.length === 0) || String(a).trim() === '') return false
    }
    if (tmpl?.require_agreement && !agreed) return false
    return true
  }

  async function handleSubmit() {
    if (!validate() || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const tmpl = session.questionnaire_templates
      const questions = (tmpl?.questionnaire_questions || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(q => ({ id: q.id, type: q.type, label: q.label, options: q.options }))

      await submitForm({
        sessionId: session.id,
        email: email.trim(),
        creditHandle: creditHandle.trim() || null,
        questions,
        answers,
        agreedToTerms: agreed,
      })
      setSubmitted(true)
    } catch (err) {
      setSubmitError('Something went wrong. Please try again.')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingScreen />
  if (!session) return <ErrorScreen message="This form link is invalid or has expired." />
  if (submitted) return <ConfirmScreen session={session} confirmationMessage={session.questionnaire_templates?.confirmation_message} />

  const studioName = session.photographers?.business_name || session.photographers?.display_name || 'Your Photographer'
  const tmpl = session.questionnaire_templates
  const questions = (tmpl?.questionnaire_questions || []).sort((a, b) => a.sort_order - b.sort_order)
  const canSubmit = validate()

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#111', padding: '22px 24px', textAlign: 'center' }}>
        <p style={{ margin: 0, color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          {studioName}
        </p>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Session header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#111', margin: '0 0 10px', letterSpacing: '-0.02em' }}>
            {session.name}
          </h1>
          {session.description && (
            <p style={{ fontSize: 16, color: '#6b7280', margin: 0, lineHeight: 1.7, maxWidth: 560 }}>
              {session.description}
            </p>
          )}
        </div>

        {/* Questionnaire header text (Markdown) */}
        {tmpl?.header_text && (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px', marginBottom: 24, fontSize: 15, lineHeight: 1.7 }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(tmpl.header_text) }} />
        )}

        {/* Form card */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '32px 36px', display: 'flex', flexDirection: 'column', gap: 28, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>

          {/* Built-in: email */}
          {tmpl?.collect_email && (
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 6 }}>
                Email address <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input type="email" value={email} onChange={e => { setEmail(e.target.value); setEmailError('') }}
                onBlur={() => {
                  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
                    setEmailError('Please enter a valid email address')
                  }
                }}
                placeholder="your@email.com"
                style={{ width: '100%', padding: '13px 16px', border: `1.5px solid ${emailError ? '#ef4444' : '#e5e7eb'}`, borderRadius: 10, fontSize: 16, color: '#111', outline: 'none', boxSizing: 'border-box', background: '#fafafa' }}
                onFocus={e => e.target.style.borderColor = '#6366f1'}
              />
              {emailError && <p style={{ fontSize: 12, color: '#ef4444', margin: '4px 0 0' }}>{emailError}</p>}
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '5px 0 0' }}>Your photos will be delivered to this address.</p>
            </div>
          )}

          {/* Built-in: name / handle */}
          {tmpl?.collect_name && (
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 6 }}>
                Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input type="text" value={creditHandle} onChange={e => setCreditHandle(e.target.value)}
                placeholder="Please enter your name"
                style={{ width: '100%', padding: '13px 16px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 16, color: '#111', outline: 'none', boxSizing: 'border-box', background: '#fafafa' }}
                onFocus={e => e.target.style.borderColor = '#6366f1'}
                onBlur={e => e.target.style.borderColor = '#e5e7eb'} />
            </div>
          )}

          {/* Questionnaire questions */}
          {questions.map(q => (
            <div key={q.id}>
              <label style={{ display: 'block', fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 10 }}>
                {q.label}
                {q.required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
              </label>
              <QuestionField question={q} value={answers[q.id]} onChange={val => setAnswer(q.id, val)} />
            </div>
          ))}

          {/* Agreement checkbox */}
          {tmpl?.require_agreement && (
            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 20 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: '#6366f1', flexShrink: 0, marginTop: 2, cursor: 'pointer' }} />
                <span style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
                  {tmpl.agreement_label || 'I have read and agree to the terms above.'}
                </span>
              </label>
            </div>
          )}

          {/* Error */}
          {submitError && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px' }}>
              <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{submitError}</p>
            </div>
          )}

          {/* Submit */}
          <button onClick={handleSubmit} disabled={!canSubmit || submitting}
            style={{
              width: '100%', padding: '16px 20px', borderRadius: 12, fontSize: 17, fontWeight: 700,
              border: 'none', cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
              background: canSubmit && !submitting ? '#6366f1' : '#e5e7eb',
              color: canSubmit && !submitting ? '#fff' : '#9ca3af',
              transition: 'background 0.15s',
            }}>
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginTop: 20 }}>
          Powered by FinalVault
        </p>
      </div>
    </div>
  )
}
