import { useEffect, useRef, useState } from 'react'
import { Upload, Trash2, Globe } from 'lucide-react'
import SettingsSection from '../ui/SettingsSection.jsx'
import { supabase } from '../../supabaseClient.js'

// ── Logo on invoices (v1.6.0) ────────────────────────────────────────────
// The account logo is the one meant for dark backgrounds (often white), so
// invoices -- always printed on white -- can use their own "logo for light
// backgrounds" instead (sql/117). It's always stored as a PNG, because the
// PDF can only embed PNG or JPEG; uploads and the website's dark logo
// (a WebP) are converted in the browser first.
//
// photographers.invoice_logo_mode: null = light-background logo when one is
// uploaded, else the main logo; 'main' = main logo; 'none' = name only.

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL
const logoUrl = key => `${WORKER_URL}/logo/${encodeURIComponent(key)}`

const MAX_W = 1200
const MAX_H = 400

// Any image the browser can show (PNG, JPEG, WebP, SVG) -> PNG blob, scaled
// down to at most 1200x400.
function toPng(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const w0 = img.naturalWidth || 600
      const h0 = img.naturalHeight || 200
      const scale = Math.min(MAX_W / w0, MAX_H / h0, 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(w0 * scale))
      canvas.height = Math.max(1, Math.round(h0 * scale))
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => (blob && blob.size > 100 ? resolve(blob) : reject(new Error('That image came out blank.'))), 'image/png')
    }
    img.onerror = () => reject(new Error("That file couldn't be read as an image."))
    img.src = src
  })
}

async function deleteFromR2(key, accessToken) {
  if (!key) return
  await fetch(`${WORKER_URL}/delete/${encodeURIComponent(key)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => {})
}

function LogoPreview({ logoKey, name }) {
  // Always on white: this is how it prints.
  return (
    <div className="flex items-center justify-center rounded-lg" style={{ background: '#ffffff', border: '1px solid #e5e7eb', height: 72, padding: 10 }}>
      {logoKey ? (
        <img src={logoUrl(logoKey)} alt="" style={{ maxHeight: 52, maxWidth: '100%', objectFit: 'contain' }} />
      ) : (
        <span style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontWeight: 700, fontSize: 18, color: '#111827' }}>{name || 'Your business name'}</span>
      )}
    </div>
  )
}

function Option({ checked, onSelect, title, hint, testId, children }) {
  return (
    <label className="block rounded-xl p-3 cursor-pointer" data-testid={testId}
      style={{ border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`, background: checked ? 'rgba(99,102,241,0.04)' : 'var(--surface)' }}>
      <div className="flex items-start gap-2.5">
        <input type="radio" checked={checked} onChange={onSelect} style={{ marginTop: 3 }} />
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{title}</p>
            {hint && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
          </div>
          {children}
        </div>
      </div>
    </label>
  )
}

export default function InvoiceLogoSection({ onSaveState }) {
  const [state, setState] = useState(null) // { userId, name, mainKey, invoiceKey, mode, websiteDarkKey }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: ph }, site] = await Promise.all([
        supabase.from('photographers')
          .select('display_name, business_name, logo_r2_key, invoice_logo_r2_key, invoice_logo_mode')
          .eq('id', user.id).single(),
        supabase.from('microsites').select('logo_dark_r2_key').eq('photographer_id', user.id).maybeSingle()
          .then(r => r.data).catch(() => null),
      ])
      if (cancelled || !ph) return
      setState({
        userId: user.id,
        name: ph.business_name || ph.display_name || '',
        mainKey: ph.logo_r2_key || null,
        invoiceKey: ph.invoice_logo_r2_key || null,
        mode: ph.invoice_logo_mode || null,
        websiteDarkKey: site?.logo_dark_r2_key || null,
      })
    })()
    return () => { cancelled = true }
  }, [])

  async function update(fields, nextState) {
    const { error: err } = await supabase.from('photographers').update(fields).eq('id', state.userId)
    if (err) throw err
    setState(s => ({ ...s, ...nextState }))
    onSaveState?.('saved')
  }

  async function chooseMode(mode) {
    setError(null)
    try {
      await update({ invoice_logo_mode: mode }, { mode })
    } catch {
      onSaveState?.('error')
    }
  }

  // Converts, uploads, then points invoice_logo_r2_key at the new file and
  // removes the old one.
  async function storePng(blob) {
    const { data: { session } } = await supabase.auth.getSession()
    const key = `photographers/${state.userId}/logos/invoice-logo-${crypto.randomUUID()}.png`
    const form = new FormData()
    form.append('file', new File([blob], 'invoice-logo.png', { type: 'image/png' }))
    form.append('key', key)
    const resp = await fetch(`${WORKER_URL}/watermark-upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: form,
    })
    const result = await resp.json().catch(() => ({}))
    if (!result.ok) throw new Error(result.error || 'Upload failed.')
    const previous = state.invoiceKey
    await update({ invoice_logo_r2_key: key, invoice_logo_mode: null }, { invoiceKey: key, mode: null })
    await deleteFromR2(previous, session.access_token)
  }

  async function run(fn) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err.message || 'Something went wrong.')
      onSaveState?.('error')
    } finally {
      setBusy(false)
    }
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    run(async () => {
      const url = URL.createObjectURL(file)
      try {
        await storePng(await toPng(url))
      } finally {
        URL.revokeObjectURL(url)
      }
    })
  }

  function copyWebsiteLogo() {
    run(async () => {
      // Fetched as a blob first so the canvas isn't tainted cross-origin.
      const resp = await fetch(logoUrl(state.websiteDarkKey))
      if (!resp.ok) throw new Error("Couldn't load your website's dark logo.")
      const url = URL.createObjectURL(await resp.blob())
      try {
        await storePng(await toPng(url))
      } finally {
        URL.revokeObjectURL(url)
      }
    })
  }

  function removeInvoiceLogo() {
    run(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const previous = state.invoiceKey
      await update({ invoice_logo_r2_key: null }, { invoiceKey: null })
      await deleteFromR2(previous, session.access_token)
    })
  }

  if (!state) {
    return <SettingsSection title="Logo on invoices" description="Loading…" />
  }

  const lightSelected = state.mode === null
  const effectiveKey = state.mode === 'none' ? null : state.mode === 'main' ? state.mainKey : (state.invoiceKey || state.mainKey)

  return (
    <SettingsSection
      title="Logo on invoices"
      description="Invoices are printed on white, so a white logo disappears. Add a version made for light backgrounds, or choose what to show.">
      <div className="px-5 py-4 space-y-3" style={{ background: 'var(--surface)' }} data-testid="invoice-logo-section">
        <Option checked={lightSelected} onSelect={() => chooseMode(null)} testId="invoice-logo-light"
          title="Logo for light backgrounds"
          hint={state.invoiceKey ? null : state.mainKey ? "Not added yet, so your main logo is used until you add one." : null}>
          {state.invoiceKey && <LogoPreview logoKey={state.invoiceKey} />}
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleFile} />
            <button type="button" disabled={busy} onClick={e => { e.preventDefault(); fileRef.current?.click() }}
              className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5" data-testid="invoice-logo-upload"
              style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--text)', cursor: busy ? 'wait' : 'pointer' }}>
              <Upload size={13} />{state.invoiceKey ? 'Replace' : 'Upload'}
            </button>
            {state.websiteDarkKey && (
              <button type="button" disabled={busy} onClick={e => { e.preventDefault(); copyWebsiteLogo() }}
                className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5" data-testid="invoice-logo-from-website"
                style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--text)', cursor: busy ? 'wait' : 'pointer' }}>
                <Globe size={13} />Use my website's dark logo
              </button>
            )}
            {state.invoiceKey && (
              <button type="button" disabled={busy} onClick={e => { e.preventDefault(); removeInvoiceLogo() }}
                className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5"
                style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: busy ? 'wait' : 'pointer' }}>
                <Trash2 size={13} />Remove
              </button>
            )}
            {busy && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Saving…</span>}
          </div>
        </Option>

        <Option checked={state.mode === 'main'} onSelect={() => chooseMode('main')} testId="invoice-logo-main"
          title="My main logo" hint={state.mainKey ? 'The logo from your Profile.' : 'No main logo yet; your business name is shown instead.'} />

        <Option checked={state.mode === 'none'} onSelect={() => chooseMode('none')} testId="invoice-logo-none"
          title="No logo" hint="Just your business name in large type." />

        {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}

        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>On your invoices</p>
          <LogoPreview logoKey={effectiveKey} name={state.name} />
        </div>
      </div>
    </SettingsSection>
  )
}
