def patch(path, old, new, expected_count=1):
    with open(path, 'r') as f:
        src = f.read()
    count = src.count(old)
    assert count == expected_count, f"{path}: expected {expected_count} occurrence(s) of {old!r}, found {count}"
    src = src.replace(old, new)
    with open(path, 'w') as f:
        f.write(src)
    print(f"OK  {path}: replaced {expected_count}x")

path = 'src/routes/ClientGallery.jsx'

patch(path,
"  const [email, setEmail] = useState('')\n  const [password, setPassword] = useState('')",
"  const [email, setEmail] = useState('')\n  const [emailError, setEmailError] = useState('')\n  const [password, setPassword] = useState('')")

patch(path,
"""  async function handleNameSubmit() {
    if (!email.trim()) return
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const viewer = await getOrCreateViewer(gallery.id, email.trim())
      if (gallery.require_password) setStage('password')
      else navigate(`/g/${token}/view${window.location.search}`, { replace: true })
    } catch {
      setStage('name')
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }""",
"""  async function handleNameSubmit() {
    if (!email.trim()) return
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.trim())) {
      setEmailError('Please enter a valid email address.')
      return
    }
    setEmailError('')
    setSubmitting(true)
    try {
      const viewer = await getOrCreateViewer(gallery.id, email.trim())
      if (gallery.require_password) setStage('password')
      else navigate(`/g/${token}/view${window.location.search}`, { replace: true })
    } catch {
      setEmailError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }""")

patch(path,
"""        <InputField
          value={email}
          onChange={setEmail}
          type="email"
          placeholder="Enter your email to continue"
          autoFocus
        />
        <GateButton onClick={handleNameSubmit} loading={submitting || !email.trim()}>""",
"""        <InputField
          value={email}
          onChange={v => { setEmail(v); setEmailError('') }}
          type="email"
          placeholder="Enter your email to continue"
          autoFocus
        />
        {emailError && (
          <p className="text-sm text-center" style={{ color: '#f87171' }}>{emailError}</p>
        )}
        <GateButton onClick={handleNameSubmit} loading={submitting || !email.trim()}>""")

print("\nAll patches applied successfully.")
