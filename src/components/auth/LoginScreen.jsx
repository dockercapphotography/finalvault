import { useState, useEffect } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginScreen({
  onLogin,
  onRegister,
  onResetPassword,
  onUpdatePassword,
  isPasswordRecovery
}) {
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'forgot' | 'newPassword'
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
    minLength: false,
    hasLowercase: false,
    hasUppercase: false,
    hasNumber: false,
    hasSymbol: false
  })

  // Switch to new password mode when recovery link is clicked
  useEffect(() => {
    if (isPasswordRecovery) {
      setMode('newPassword')
      setError('')
      setSuccessMessage('')
      setPassword('')
      setConfirmPassword('')
    }
  }, [isPasswordRecovery])

  // Live password requirement checks
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

  // Clear messages when switching modes
  useEffect(() => {
    setError('')
    setSuccessMessage('')
    if (mode !== 'register') {
      setFirstName('')
      setLastName('')
    }
  }, [mode])

  const allPasswordReqsMet =
    passwordRequirements.minLength &&
    passwordRequirements.hasLowercase &&
    passwordRequirements.hasUppercase &&
    passwordRequirements.hasNumber &&
    passwordRequirements.hasSymbol

  const handleSubmit = async () => {
    // Forgot password
    if (mode === 'forgot') {
      if (!email) { setError('Please enter your email address'); return }
      setError('')
      setIsSubmitting(true)
      try {
        await onResetPassword(email)
        setSuccessMessage('Reset email sent! Check your inbox and click the link.')
      } catch (err) {
        setError(err.message || 'Failed to send reset email. Please try again.')
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    // Set new password
    if (mode === 'newPassword') {
      if (!password || !confirmPassword) { setError('Please enter and confirm your new password'); return }
      if (!allPasswordReqsMet) { setError('Password does not meet all requirements'); return }
      if (password !== confirmPassword) { setError('Passwords do not match'); return }
      setError('')
      setIsSubmitting(true)
      try {
        await onUpdatePassword(password)
        setSuccessMessage('Password updated! You are now signed in.')
      } catch (err) {
        setError(err.message || 'Failed to update password. Please try again.')
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    // Login / Register shared validation
    if (!email || !password) { setError('Please enter both email and password'); return }

    if (mode === 'register') {
      if (!firstName || !lastName) { setError('Please enter your first and last name'); return }
      if (!allPasswordReqsMet) { setError('Password does not meet all requirements'); return }
      if (password !== confirmPassword) { setError('Passwords do not match'); return }
    }

    setError('')
    setIsSubmitting(true)

    try {
      if (mode === 'register') {
        const result = await onRegister(email, password, { firstName, lastName })
        if (result.needsEmailConfirmation) {
          setSuccessMessage('Account created! Check your email for a confirmation link, then sign in.')
          setMode('login')
          setPassword('')
          setConfirmPassword('')
        }
      } else {
        await onLogin(email, password)
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isSubmitDisabled =
    isSubmitting ||
    (mode === 'register' && (!firstName || !lastName || !email || !password || !confirmPassword || password !== confirmPassword || !allPasswordReqsMet)) ||
    (mode === 'newPassword' && (!password || !confirmPassword || password !== confirmPassword || !allPasswordReqsMet))

  const getTitle = () => {
    if (mode === 'forgot') return 'Reset your password'
    if (mode === 'newPassword') return 'Set a new password'
    if (mode === 'register') return 'Create your account'
    return 'Sign in to FinalVault'
  }

  const getButtonLabel = () => {
    if (isSubmitting) {
      if (mode === 'forgot') return 'Sending...'
      if (mode === 'newPassword') return 'Updating...'
      if (mode === 'register') return 'Creating account...'
      return 'Signing in...'
    }
    if (mode === 'forgot') return 'Send Reset Email'
    if (mode === 'newPassword') return 'Update Password'
    if (mode === 'register') return 'Create Account'
    return 'Sign In'
  }

  const showPasswordFields = mode === 'register' || mode === 'newPassword'

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-white flex items-center justify-center py-8 px-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 max-w-md w-full">

        {/* Logo / Wordmark */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">FinalVault</h1>
          <p className="text-slate-400 text-sm mt-1">{getTitle()}</p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Success */}
        {successMessage && (
          <div className="bg-green-500/10 border border-green-500/50 text-green-400 px-4 py-3 rounded-lg mb-4 text-sm">
            {successMessage}
          </div>
        )}

        <div className="space-y-3">

          {/* Name fields — register only */}
          {mode === 'register' && (
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First Name *"
                className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm"
                disabled={isSubmitting}
              />
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last Name *"
                className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm"
                disabled={isSubmitting}
              />
            </div>
          )}

          {/* Email — not shown on newPassword */}
          {mode !== 'newPassword' && (
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm"
              disabled={isSubmitting}
            />
          )}

          {mode === 'forgot' && (
            <p className="text-slate-500 text-xs -mt-1">
              Enter your email and we'll send you a link to reset your password.
            </p>
          )}

          {/* Password — not shown on forgot */}
          {mode !== 'forgot' && (
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && mode === 'login' && !isSubmitting && handleSubmit()}
                placeholder={mode === 'newPassword' ? 'New Password' : 'Password'}
                className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-4 py-3 pr-12 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm"
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                disabled={isSubmitting}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          )}

          {/* Confirm password + requirements — register and newPassword */}
          {showPasswordFields && (
            <>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !isSubmitting && handleSubmit()}
                  placeholder="Confirm Password"
                  className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-4 py-3 pr-12 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  disabled={isSubmitting}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Passwords match indicator */}
              {confirmPassword && (
                <p className={`text-xs flex items-center gap-1.5 -mt-1 ${password === confirmPassword ? 'text-green-400' : 'text-red-400'}`}>
                  <span>{password === confirmPassword ? '✓' : '✗'}</span>
                  {password === confirmPassword ? 'Passwords match' : 'Passwords do not match'}
                </p>
              )}

              {/* Password strength */}
              {password && (
                <div className="space-y-2 bg-slate-800/50 rounded-lg p-3">
                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className={password.length >= 8 ? 'text-green-400' : 'text-slate-500'}>
                        Character count
                      </span>
                      <span className={password.length >= 8 ? 'text-green-400' : 'text-slate-500'}>
                        {password.length}/8
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${password.length >= 8 ? 'bg-green-500' : 'bg-slate-500'}`}
                        style={{ width: `${Math.min((password.length / 8) * 100, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Requirements checklist */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {[
                      { key: 'hasLowercase', label: 'Lowercase (a-z)' },
                      { key: 'hasUppercase', label: 'Uppercase (A-Z)' },
                      { key: 'hasNumber', label: 'Number (0-9)' },
                      { key: 'hasSymbol', label: 'Symbol (!@#...)' }
                    ].map(({ key, label }) => (
                      <div
                        key={key}
                        className={`flex items-center gap-1.5 text-xs ${passwordRequirements[key] ? 'text-green-400' : 'text-slate-500'}`}
                      >
                        <span>{passwordRequirements[key] ? '✓' : '○'}</span>
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors mt-1 ${
              isSubmitDisabled
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-white text-slate-900 hover:bg-slate-100 cursor-pointer'
            }`}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-slate-400 border-t-slate-900" />
                {getButtonLabel()}
              </span>
            ) : getButtonLabel()}
          </button>

          {/* Mode switchers — login mode */}
          {mode === 'login' && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={() => setMode('forgot')}
                disabled={isSubmitting}
                className="text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg py-2.5 transition-colors"
              >
                Forgot password?
              </button>
              <button
                onClick={() => setMode('register')}
                disabled={isSubmitting}
                className="text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg py-2.5 transition-colors"
              >
                Create account
              </button>
            </div>
          )}

          {/* Back to sign in — all other modes */}
          {mode !== 'login' && (
            <button
              onClick={() => setMode('login')}
              disabled={isSubmitting}
              className="w-full text-sm text-slate-500 hover:text-slate-300 transition-colors pt-1"
            >
              ← Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
