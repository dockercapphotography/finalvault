import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { useBookingBranding } from '../utils/bookingBranding.js'
import { useDocumentTitle } from '../hooks/useDocumentTitle.js'
import BrandHeader from '../components/booking/BrandHeader.jsx'
import BookingCover from '../components/booking/BookingCover.jsx'

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getSessionByToken(token, questionnaireId) {
  const { data, error } = await supabase.rpc('get_submit_form_data', {
    p_token: token,
    p_questionnaire_id: questionnaireId || null,
  })
  if (error || !data || data.type !== 'found') return null
  return { ...data, _questionnaireId: questionnaireId }
}

async function submitForm({ sessionId, email, creditHandle, questions, answers, agreedToTerms, questionnaireId }) {
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
      questionnaire_id: questionnaireId || null,
    })
  if (error) throw error
}

// ── Markdown renderer (minimal, same as MarkdownToolbar) -- colors now
// pull from the --bk-* variables the branding wrapper sets, since this
// renders as raw HTML via dangerouslySetInnerHTML but still lives inside
// that same styled subtree and inherits its custom properties normally. ──

function renderMarkdown(text) {
  if (!text) return ''
  return text.split('\n').map(line => {
    if (line.startsWith('## ')) return `<h2 style="font-size:17px;font-weight:700;color:var(--bk-ink);margin:12px 0 6px">${line.slice(3)}</h2>`
    if (line.startsWith('- ')) return `<li style="margin-left:20px;list-style-type:disc;margin-bottom:4px;color:var(--bk-muted)">${applyInline(line.slice(2))}</li>`
    const ol = line.match(/^(\d+)\.\s(.*)/)
    if (ol) return `<li style="margin-left:20px;list-style-type:decimal;margin-bottom:4px;color:var(--bk-muted)">${applyInline(ol[2])}</li>`
    if (line.trim() === '') return '<br/>'
    return `<p style="margin:4px 0;color:var(--bk-muted)">${applyInline(line)}</p>`
  }).join('')
}

function applyInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
}

// ── Screens ───────────────────────────────────────────────────────────────────

// Loading/error (the !session case) genuinely have no branding data yet
// -- session hasn't loaded or failed to load at all -- so these stay
// plain and unbranded on purpose, not an oversight.

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

// Real branding data IS available here (session loaded successfully) --
// same useBookingBranding/--bk-* pattern as the main form below.
function ConfirmScreen({ session, confirmationMessage }) {
  const branding = session.branding || { has_microsite: false, studio_name: null, logo_r2_key: null }
  const { bkVars } = useBookingBranding(branding)
  const studioName = branding.studio_name || 'Your Photographer'
  const tmpl = session.questionnaire_templates
  const redirectUrl = tmpl?.redirect_url || null
  const redirectLabel = tmpl?.redirect_label || 'Continue'
  const redirectAuto = !!tmpl?.redirect_auto
  const redirectDelaySeconds = tmpl?.redirect_delay_seconds || 5

  const [secondsLeft, setSecondsLeft] = useState(redirectDelaySeconds)
  const [autoCancelled, setAutoCancelled] = useState(false)

  useEffect(() => {
    if (!redirectUrl || !redirectAuto || autoCancelled) return
    if (secondsLeft <= 0) {
      window.location.href = redirectUrl
      return
    }
    const t = setTimeout(() => setSecondsLeft(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [secondsLeft, redirectUrl, redirectAuto, autoCancelled])

  return (
    <div style={{ ...bkVars, minHeight: '100vh', background: 'var(--bk-bg)', color: 'var(--bk-ink)', fontFamily: 'var(--bk-font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <CheckCircle size={28} style={{ color: '#22c55e' }} />
        </div>
        <h1 style={{ fontSize: 24, fontFamily: 'var(--bk-font-display)', fontWeight: 700, color: 'var(--bk-ink)', margin: '0 0 10px' }}>
          You're all set!
        </h1>
        <p style={{ fontSize: 15, color: 'var(--bk-ink)', margin: '0 0 6px', lineHeight: 1.6 }}>
          Thanks for submitting your info for{' '}
          <strong style={{ display: 'inline', whiteSpace: 'nowrap' }}>{session.name}</strong>.
        </p>
        <p style={{ fontSize: 14, color: 'var(--bk-muted)', margin: '0 0 24px', lineHeight: 1.6 }}>
          {confirmationMessage || `${studioName} will be in touch when your photos are ready.`}
        </p>

        {redirectUrl && (
          <div style={{ marginTop: 4 }}>
            <a href={redirectUrl}
              style={{
                display: 'block', width: '100%', boxSizing: 'border-box', padding: '15px 20px', borderRadius: 12,
                fontSize: 16, fontWeight: 700, textDecoration: 'none',
                background: 'var(--bk-accent)', color: 'var(--bk-accent-button-text)',
              }}>
              {redirectLabel}
            </a>
            {redirectAuto && !autoCancelled && secondsLeft > 0 && (
              <p style={{ fontSize: 13, color: 'var(--bk-muted)', margin: '12px 0 0' }}>
                Redirecting in {secondsLeft}s &middot;{' '}
                <button onClick={() => setAutoCancelled(true)}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--bk-accent)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
                  Cancel
                </button>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Question renderers ────────────────────────────────────────────────────────
// Error/danger states (email validation) stay hardcoded red -- errors
// shouldn't be re-colored to match the photographer's accent, or they
// stop reading as errors. Everything else pulls from --bk-*.

function QuestionField({ question, value, onChange }) {
  const inputStyle = {
    width: '100%',
    padding: '11px 14px',
    border: '1px solid var(--bk-border)',
    borderRadius: 8,
    fontSize: 15,
    color: 'var(--bk-ink)',
    outline: 'none',
    boxSizing: 'border-box',
    background: 'var(--bk-surface)',
    fontFamily: 'inherit',
  }

  switch (question.type) {
    case 'short_text':
      return (
        <input type="text" value={value || ''} onChange={e => onChange(e.target.value)}
          style={inputStyle}
          onFocus={e => e.target.style.borderColor = 'var(--bk-accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--bk-border)'} />
      )
    case 'long_text':
      return (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={4}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
          onFocus={e => e.target.style.borderColor = 'var(--bk-accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--bk-border)'} />
      )
    case 'yes_no':
      return (
        <div style={{ display: 'flex', gap: 10 }}>
          {['Yes', 'No'].map(opt => (
            <button key={opt} type="button" onClick={() => onChange(opt)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 15, fontWeight: 500,
                border: value === opt ? '2px solid var(--bk-accent)' : '2px solid var(--bk-border)',
                background: value === opt ? 'rgba(var(--bk-accent-rgb), 0.08)' : 'var(--bk-surface)',
                color: value === opt ? 'var(--bk-accent)' : 'var(--bk-ink)',
                cursor: 'pointer', fontFamily: 'inherit',
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
                style={{ width: 16, height: 16, accentColor: 'var(--bk-accent)', flexShrink: 0, cursor: 'pointer' }} />
              <span style={{ fontSize: 15, color: 'var(--bk-ink)', fontFamily: 'inherit' }}>{opt}</span>
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
                  style={{ width: 16, height: 16, accentColor: 'var(--bk-accent)', flexShrink: 0, cursor: 'pointer' }} />
                <span style={{ fontSize: 15, color: 'var(--bk-ink)', fontFamily: 'inherit' }}>{opt}</span>
              </label>
            )
          })}
        </div>
      )
    case 'date':
      return (
        <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
          style={inputStyle}
          onFocus={e => e.target.style.borderColor = 'var(--bk-accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--bk-border)'} />
      )
    default:
      return null
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

// Same scrim BookingHero.jsx uses under its own overlaid logo, so the
// treatment matches exactly rather than approximating it.
const TOP_SCRIM = 'linear-gradient(180deg, rgba(20,17,13,0.6) 0%, rgba(20,17,13,0) 100%)'

export default function SubmitForm() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const questionnaireId = searchParams.get('q')
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

  // Called unconditionally, every render (rules of hooks) with a safe
  // unbranded default before session loads -- same pattern
  // AllSessionsBooking.jsx uses for the exact same reason.
  const branding = session?.branding || { has_microsite: false, studio_name: null, logo_r2_key: null }
  const { bkVars } = useBookingBranding(branding)
  useDocumentTitle(
    session?.name && branding?.studio_name
      ? `${session.name} · ${branding.studio_name}`
      : session?.name,
    { suffix: false }
  )

  useEffect(() => {
    getSessionByToken(token, questionnaireId).then(data => {
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
        questionnaireId: session._questionnaireId || null,
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
  if (!session.questionnaire_templates) return <ErrorScreen message="No questionnaire found. Please use the link provided by your photographer." />
  if (submitted) return <ConfirmScreen session={session} confirmationMessage={session.questionnaire_templates?.confirmation_message} />

  const tmpl = session.questionnaire_templates
  const questions = (tmpl?.questionnaire_questions || []).sort((a, b) => a.sort_order - b.sort_order)
  const canSubmit = validate()

  return (
    <div style={{ ...bkVars, minHeight: '100vh', background: 'var(--bk-bg)', color: 'var(--bk-ink)', fontFamily: 'var(--bk-font-body)' }}>
      {/* Cover + overlaid logo, matching BookingHero.jsx's mobile pattern
          (a single-column form page has no need for its separate desktop
          rail variant -- this treatment applies at every width here). */}
      <div style={{ position: 'relative' }}>
        <BookingCover
          imageKey={tmpl.cover_image_r2_key}
          focusX={tmpl.cover_focus_x}
          focusY={tmpl.cover_focus_y}
          height={250}
          coverMode="questionnaire_cover"
        />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 90, background: TOP_SCRIM }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '16px 20px 0' }}>
          <BrandHeader branding={branding} overlay />
        </div>
      </div>

      {/* Session title, in its own card overlapping the cover's bottom
          edge -- same -44px overlap BookingHero.jsx's mobile card uses. */}
      <div style={{ maxWidth: 720, margin: '-44px auto 0', padding: '0 16px', position: 'relative', zIndex: 2 }}>
        <div className="rounded-2xl p-5" style={{ background: 'var(--bk-surface)', border: '1px solid var(--bk-border)', position: 'relative', overflow: 'hidden', paddingLeft: 22 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: 'var(--bk-accent)' }} />
          {session.session_type && (
            <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bk-accent)', margin: 0 }}>
              {session.session_type}
            </p>
          )}
          <h1 style={{ fontSize: 20, fontFamily: 'var(--bk-font-display)', fontWeight: 700, color: 'var(--bk-ink)', margin: '4px 0 0', letterSpacing: '-0.01em' }}>
            {session.name}
          </h1>
          {session.description && (
            <p style={{ fontSize: 12, color: 'var(--bk-muted)', margin: '8px 0 0', lineHeight: 1.6 }}>
              {session.description}
            </p>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 80px', position: 'relative' }}>

        {/* Questionnaire header text (Markdown) */}
        {tmpl?.header_text && (
          <div style={{ background: 'var(--bk-surface)', border: '1px solid var(--bk-border)', borderRadius: 12, padding: '20px 24px', marginBottom: 24, fontSize: 15, lineHeight: 1.7 }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(tmpl.header_text) }} />
        )}

        {/* Form card */}
        <div style={{ background: 'var(--bk-surface)', border: '1px solid var(--bk-border)', borderRadius: 16, padding: '32px 36px', display: 'flex', flexDirection: 'column', gap: 28, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>

          {/* Built-in: email */}
          {tmpl?.collect_email && (
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--bk-ink)', marginBottom: 6 }}>
                Email address <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input type="email" value={email} onChange={e => { setEmail(e.target.value); setEmailError('') }}
                onBlur={() => {
                  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
                    setEmailError('Please enter a valid email address')
                  }
                }}
                placeholder="your@email.com"
                style={{ width: '100%', padding: '13px 16px', border: `1.5px solid ${emailError ? '#ef4444' : 'var(--bk-border)'}`, borderRadius: 10, fontSize: 16, color: 'var(--bk-ink)', outline: 'none', boxSizing: 'border-box', background: 'var(--bk-bg-subtle)', fontFamily: 'inherit' }}
                onFocus={e => e.target.style.borderColor = 'var(--bk-accent)'}
              />
              {emailError && <p style={{ fontSize: 12, color: '#ef4444', margin: '4px 0 0' }}>{emailError}</p>}
              <p style={{ fontSize: 12, color: 'var(--bk-muted)', margin: '5px 0 0' }}>Your photos will be delivered to this address.</p>
            </div>
          )}

          {/* Built-in: name / handle */}
          {tmpl?.collect_name && (
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--bk-ink)', marginBottom: 6 }}>
                Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input type="text" value={creditHandle} onChange={e => setCreditHandle(e.target.value)}
                placeholder="Please enter your name"
                style={{ width: '100%', padding: '13px 16px', border: '1.5px solid var(--bk-border)', borderRadius: 10, fontSize: 16, color: 'var(--bk-ink)', outline: 'none', boxSizing: 'border-box', background: 'var(--bk-bg-subtle)', fontFamily: 'inherit' }}
                onFocus={e => e.target.style.borderColor = 'var(--bk-accent)'}
                onBlur={e => e.target.style.borderColor = 'var(--bk-border)'} />
            </div>
          )}

          {/* Questionnaire questions */}
          {questions.map(q => (
            <div key={q.id}>
              <label style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--bk-ink)', marginBottom: 10 }}>
                {q.label}
                {q.required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
              </label>
              <QuestionField question={q} value={answers[q.id]} onChange={val => setAnswer(q.id, val)} />
            </div>
          ))}

          {/* Agreement checkbox */}
          {tmpl?.require_agreement && (
            <div style={{ borderTop: '1px solid var(--bk-border)', paddingTop: 20 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--bk-accent)', flexShrink: 0, marginTop: 2, cursor: 'pointer' }} />
                <span style={{ fontSize: 14, color: 'var(--bk-ink)', lineHeight: 1.6 }}>
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
              background: canSubmit && !submitting ? 'var(--bk-accent)' : 'var(--bk-border)',
              color: canSubmit && !submitting ? 'var(--bk-accent-button-text)' : 'var(--bk-muted)',
              transition: 'background 0.15s', fontFamily: 'inherit',
            }}>
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20 }}>
          <img src="/finalvault_logo.svg" alt="FinalVault" width="22" height="22" style={{ opacity: 0.7 }} />
          <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9ca3af' }}>FinalVault</span>
        </div>
      </div>
    </div>
  )
}