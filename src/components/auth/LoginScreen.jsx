import { useState, useEffect } from 'react'
import { Eye, EyeOff } from 'lucide-react'

const LogoMark = () => (
  <img src="/finalvault_logo.svg" alt="FinalVault" width="48" height="48" />
)

export default function LoginScreen({
  onLogin, onRegister, onResetPassword, onUpdatePassword, isPasswordRecovery
}) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [passwordRequirements, setPasswordRequirements] = useState({
    minLength: false, hasLowercase: false, hasUppercase: false,
    hasNumber: false, hasSymbol: false
  })

  useEffect(() => {
    if (isPasswordRecovery) {
      setMode('newPassword'); setError(''); setSuccessMessage('')
      setPassword(''); setConfirmPassword('')
    }
  }, [isPasswordRecovery])

  useEffect(() => {
    if (mode === 'register' || mode === 'newPassword') {
      setPasswordRequirements({
        minLength: password.length >= 8,
        hasLowercase: /[a-z]/.test(password),
        hasUppercase: /[A-Z]/.test(password),
        hasNumber: /[0-9]/.test(password),
        hasSymbol: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)
      })
    }
  }, [password, mode])

  useEffect(() => {
    setError(''); setSuccessMessage('')
    if (mode !== 'register') { setFirstName(''); setLastName('') }
  }, [mode])

  const allPasswordReqsMet =
    passwordRequirements.minLength && passwordRequirements.hasLowercase &&
    passwordRequirements.hasUppercase && passwordRequirements.hasNumber &&
    passwordRequirements.hasSymbol

  const handleSubmit = async () => {
    if (mode === 'forgot') {
      if (!email) { setError('Please enter your email address'); return }
      setError(''); setIsSubmitting(true)
      try {
        await onResetPassword(email)
        setSuccessMessage('Reset email sent! Check your inbox.')
      } catch (err) { setError(err.message || 'Failed to send reset email.') }
      finally { setIsSubmitting(false) }
      return
    }
    if (mode === 'newPassword') {
      if (!password || !confirmPassword) { setError('Please enter and confirm your new password'); return }
      if (!allPasswordReqsMet) { setError('Password does not meet all requirements'); return }
      if (password !== confirmPassword) { setError('Passwords do not match'); return }
      setError(''); setIsSubmitting(true)
      try { await onUpdatePassword(password); setSuccessMessage('Password updated!') }
      catch (err) { setError(err.message || 'Failed to update password.') }
      finally { setIsSubmitting(false) }
      return
    }
    if (!email || !password) { setError('Please enter both email and password'); return }
    if (mode === 'register') {
      if (!firstName || !lastName) { setError('Please enter your first and last name'); return }
      if (!allPasswordReqsMet) { setError('Password does not meet all requirements'); return }
      if (password !== confirmPassword) { setError('Passwords do not match'); return }
    }
    setError(''); setIsSubmitting(true)
    try {
      if (mode === 'register') {
        const result = await onRegister(email, password, { firstName, lastName })
        if (result.needsEmailConfirmation) {
          setSuccessMessage('Account created! Check your email to confirm, then sign in.')
          setMode('login'); setPassword(''); setConfirmPassword('')
        }
      } else {
        await onLogin(email, password)
      }
    } catch (err) { setError(err.message || 'Authentication failed.') }
    finally { setIsSubmitting(false) }
  }

  const isSubmitDisabled = isSubmitting ||
    (mode === 'register' && (!firstName || !lastName || !email || !password ||
      !confirmPassword || password !== confirmPassword || !allPasswordReqsMet)) ||
    (mode === 'newPassword' && (!password || !confirmPassword ||
      password !== confirmPassword || !allPasswordReqsMet))

  const getTitle = () => ({
    forgot: 'Reset your password', newPassword: 'Set a new password',
    register: 'Create your account', login: 'Sign in to your account'
  }[mode])

  const getButtonLabel = () => {
    if (isSubmitting) return { forgot: 'Sending...', newPassword: 'Updating...', register: 'Creating...', login: 'Signing in...' }[mode]
    return { forgot: 'Send Reset Email', newPassword: 'Update Password', register: 'Create Account', login: 'Sign In' }[mode]
  }

  const inputStyle = {
    width: '100%',
    background: 'rgba(255,255,255,0.75)',
    border: '1px solid rgba(120,80,200,0.2)',
    color: '#1a1a2e',
    borderRadius: '10px',
    padding: '10px 14px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.15s',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  }

  const showPasswordFields = mode === 'register' || mode === 'newPassword'

  return (
    <>
      <style>{`
        @keyframes fvBlob1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(40px, 30px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
        }
        @keyframes fvBlob2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-30px, -40px) scale(1.08); }
          66% { transform: translate(25px, -15px) scale(0.92); }
        }
        @keyframes fvBlob3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(20px, -30px) scale(0.96); }
          66% { transform: translate(-30px, 25px) scale(1.06); }
        }
        .fv-blob1 { animation: fvBlob1 12s ease-in-out infinite; }
        .fv-blob2 { animation: fvBlob2 15s ease-in-out infinite; }
        .fv-blob3 { animation: fvBlob3 10s ease-in-out infinite; }
        .fv-input:focus { border-color: rgba(124,92,191,0.6) !important; }
      `}</style>

      <div className="min-h-[100dvh] flex items-center justify-center py-8 px-4"
        style={{ background: '#f5f0ff', position: 'relative', overflow: 'hidden' }}>

        {/* Animated gradient blobs */}
        <div className="fv-blob1" style={{
          position: 'absolute', top: '-80px', left: '-80px',
          width: '360px', height: '360px', borderRadius: '50%',
          background: '#b780ef', opacity: 0.25, filter: 'blur(60px)',
          pointerEvents: 'none',
        }} />
        <div className="fv-blob2" style={{
          position: 'absolute', bottom: '-60px', right: '-60px',
          width: '300px', height: '300px', borderRadius: '50%',
          background: '#7c5cbf', opacity: 0.2, filter: 'blur(50px)',
          pointerEvents: 'none',
        }} />
        <div className="fv-blob3" style={{
          position: 'absolute', bottom: '20%', left: '30%',
          width: '240px', height: '240px', borderRadius: '50%',
          background: '#d7b8f6', opacity: 0.3, filter: 'blur(55px)',
          pointerEvents: 'none',
        }} />

        <div className="w-full max-w-sm" style={{ position: 'relative', zIndex: 1 }}>
          <div className="text-center mb-8 flex flex-col items-center gap-3">
            <LogoMark />
            <div>
              <h1 style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 700,
                fontSize: '18px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#3c2070',
              }}>FinalVault</h1>
              <p className="text-sm mt-1" style={{ color: 'rgba(80,40,140,0.6)' }}>{getTitle()}</p>
            </div>
          </div>

          <div className="rounded-xl p-6 space-y-3"
            style={{
              background: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(120,80,200,0.15)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}>

            {error && (
              <div className="px-3 py-2.5 rounded-lg text-sm"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>
                {error}
              </div>
            )}
            {successMessage && (
              <div className="px-3 py-2.5 rounded-lg text-sm"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>
                {successMessage}
              </div>
            )}

            {mode === 'register' && (
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                  placeholder="First Name *" style={inputStyle} disabled={isSubmitting}
                  className="fv-input"
                  onFocus={e => e.target.style.borderColor = 'rgba(124,92,191,0.6)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(120,80,200,0.2)'} />
                <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                  placeholder="Last Name *" style={inputStyle} disabled={isSubmitting}
                  className="fv-input"
                  onFocus={e => e.target.style.borderColor = 'rgba(124,92,191,0.6)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(120,80,200,0.2)'} />
              </div>
            )}

            {mode !== 'newPassword' && (
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Email" style={inputStyle} disabled={isSubmitting}
                className="fv-input"
                onFocus={e => e.target.style.borderColor = 'rgba(124,92,191,0.6)'}
                onBlur={e => e.target.style.borderColor = 'rgba(120,80,200,0.2)'} />
            )}

            {mode !== 'forgot' && (
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && mode === 'login' && !isSubmitting && handleSubmit()}
                  placeholder={mode === 'newPassword' ? 'New Password' : 'Password'}
                  style={{ ...inputStyle, paddingRight: '40px' }} disabled={isSubmitting}
                  className="fv-input"
                  onFocus={e => e.target.style.borderColor = 'rgba(124,92,191,0.6)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(120,80,200,0.2)'} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'rgba(80,40,140,0.5)', cursor: 'pointer' }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            )}

            {showPasswordFields && (
              <>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !isSubmitting && handleSubmit()}
                    placeholder="Confirm Password"
                    style={{ ...inputStyle, paddingRight: '40px' }} disabled={isSubmitting}
                    className="fv-input"
                    onFocus={e => e.target.style.borderColor = 'rgba(124,92,191,0.6)'}
                    onBlur={e => e.target.style.borderColor = 'rgba(120,80,200,0.2)'} />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'rgba(80,40,140,0.5)', cursor: 'pointer' }}>
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {confirmPassword && (
                  <p className="text-xs flex items-center gap-1.5"
                    style={{ color: password === confirmPassword ? '#16a34a' : '#dc2626' }}>
                    <span>{password === confirmPassword ? '✓' : '✗'}</span>
                    {password === confirmPassword ? 'Passwords match' : 'Passwords do not match'}
                  </p>
                )}

                {password && (
                  <div className="rounded-lg p-3 space-y-2"
                    style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(120,80,200,0.15)' }}>
                    <div className="flex justify-between text-xs" style={{ color: 'rgba(80,40,140,0.6)' }}>
                      <span>Character count</span>
                      <span style={{ color: password.length >= 8 ? '#16a34a' : 'rgba(80,40,140,0.5)' }}>
                        {password.length}/8
                      </span>
                    </div>
                    <div className="w-full rounded-full h-1 overflow-hidden" style={{ background: 'rgba(120,80,200,0.15)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min((password.length / 8) * 100, 100)}%`,
                          background: password.length >= 8 ? '#16a34a' : 'rgba(120,80,200,0.4)'
                        }} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {[
                        { key: 'hasLowercase', label: 'Lowercase (a-z)' },
                        { key: 'hasUppercase', label: 'Uppercase (A-Z)' },
                        { key: 'hasNumber',    label: 'Number (0-9)' },
                        { key: 'hasSymbol',    label: 'Symbol (!@#...)' },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center gap-1.5 text-xs"
                          style={{ color: passwordRequirements[key] ? '#16a34a' : 'rgba(80,40,140,0.5)' }}>
                          <span>{passwordRequirements[key] ? '✓' : '○'}</span>
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <button
              onClick={handleSubmit} disabled={isSubmitDisabled}
              className="w-full py-2.5 rounded-lg font-medium text-sm transition-opacity mt-1"
              style={{
                background: '#7c5cbf',
                color: '#fff',
                opacity: isSubmitDisabled ? 0.4 : 1,
                cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
              }}>
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                    style={{ borderColor: '#fff', borderTopColor: 'transparent' }} />
                  {getButtonLabel()}
                </span>
              ) : getButtonLabel()}
            </button>

            {mode === 'login' && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                {[
                  { label: 'Forgot password?', action: () => setMode('forgot') },
                  { label: 'Create account', action: () => setMode('register') },
                ].map(({ label, action }) => (
                  <button key={label} onClick={action} disabled={isSubmitting}
                    className="text-sm py-2 rounded-lg transition-colors"
                    style={{
                      color: 'rgba(80,40,140,0.7)',
                      border: '1px solid rgba(120,80,200,0.2)',
                      background: 'rgba(255,255,255,0.5)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(124,92,191,0.5)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(120,80,200,0.2)'}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            {mode !== 'login' && (
              <button onClick={() => setMode('login')} disabled={isSubmitting}
                className="w-full text-sm pt-1 transition-colors"
                style={{ color: 'rgba(80,40,140,0.6)', cursor: 'pointer' }}>
                ← Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
