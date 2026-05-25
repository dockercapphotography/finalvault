import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, RefreshCw, CheckCircle } from 'lucide-react'
import { getGallery, updateGallery } from '../utils/galleryApi.js'
import { supabase } from '../supabaseClient.js'
import Tabs from '../components/ui/Tabs.jsx'
import SettingsSection from '../components/ui/SettingsSection.jsx'
import SettingsRow from '../components/ui/SettingsRow.jsx'
import Toggle from '../components/ui/Toggle.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'

const TABS = [
  { id: 'general',  label: 'General' },
  { id: 'access',   label: 'Access' },
  { id: 'sharing',  label: 'Sharing' },
  { id: 'display',  label: 'Display' },
]

const TEMPLATES = [
  { id: 'classic',   name: 'Classic',   description: 'Clean grid layout' },
  { id: 'minimal',   name: 'Minimal',   description: 'Full bleed, minimal UI' },
  { id: 'editorial', name: 'Editorial', description: 'Magazine-style' },
  { id: 'bold',      name: 'Bold',      description: 'Large hero image' },
]

function generatePin() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const codeInputStyle = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderRadius: '8px',
  padding: '9px 72px 9px 12px',
  fontSize: '14px',
  outline: 'none',
  fontFamily: 'monospace',
  letterSpacing: '0.1em',
}

function CodeField({ value, onChange, onRefresh, showValue, onToggleShow, placeholder, hint }) {
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <input
          type={showValue ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={codeInputStyle}
          onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <button type="button" onClick={onRefresh} title="Generate new code"
            style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            <RefreshCw size={14} />
          </button>
          <button type="button" onClick={onToggleShow}
            style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            {showValue ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      {hint && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  )
}

function SaveIndicator({ state }) {
  if (state === 'idle') return null
  const config = {
    saved:  { text: 'Changes saved', color: 'var(--success)', bg: 'var(--success-subtle)', border: 'var(--success)', icon: true },
    error:  { text: 'Failed to save', color: 'var(--danger)', bg: 'var(--danger-subtle)', border: 'var(--danger)' },
  }
  const { text, color, bg, border, icon } = config[state]
  return (
    <div className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg z-50"
      style={{ background: bg, color, border: `1px solid ${border}40` }}>
      {icon && <CheckCircle size={14} />}
      {text}
    </div>
  )
}

export default function GallerySettings() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [gallery, setGallery] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState('idle')
  const [activeTab, setActiveTab] = useState('general')
  const [showPassword, setShowPassword] = useState(false)
  const [showDownloadPin, setShowDownloadPin] = useState(false)

  const isFirstLoad = useRef(true)
  const passwordChanged = useRef(false)
  const pinChanged = useRef(false)
  const dismissTimer = useRef(null)

  const [title, setTitle] = useState('')
  const [clientName, setClientName] = useState('')
  const [notes, setNotes] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [expiresAt, setExpiresAt] = useState('')
  const [requirePassword, setRequirePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [requireDownloadPin, setRequireDownloadPin] = useState(false)
  const [downloadPin, setDownloadPin] = useState('')
  const [allowDownloads, setAllowDownloads] = useState(true)
  const [downloadWatermarked, setDownloadWatermarked] = useState(false)
  const [allowFavorites, setAllowFavorites] = useState(true)
  const [allowComments, setAllowComments] = useState(true)
  const [template, setTemplate] = useState('classic')

  useEffect(() => { load() }, [id])

  // Dismiss 'Changes saved' after 2.5s
  useEffect(() => {
    if (saveState === 'saved') {
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
      dismissTimer.current = setTimeout(() => setSaveState('idle'), 2500)
    }
    return () => { if (dismissTimer.current) clearTimeout(dismissTimer.current) }
  }, [saveState])

  async function load() {
    try {
      setLoading(true)
      const g = await getGallery(id)
      setGallery(g)
      setTitle(g.title || '')
      setClientName(g.client_name || '')
      setNotes(g.notes || '')
      setEventDate(g.event_date || '')
      setIsActive(g.is_active ?? true)
      setExpiresAt(g.expires_at ? g.expires_at.split('T')[0] : '')
      setRequirePassword(g.require_password ?? false)
      setRequireDownloadPin(g.require_download_pin ?? false)
      setAllowDownloads(g.allow_downloads ?? true)
      setDownloadWatermarked(g.download_watermarked ?? false)
      setAllowFavorites(g.allow_favorites ?? true)
      setAllowComments(g.allow_comments ?? true)
      setTemplate(g.template || 'classic')
      setPassword('')
      setDownloadPin('')
      passwordChanged.current = false
      pinChanged.current = false
    } catch {
      setSaveState('error')
    } finally {
      setLoading(false)
      setTimeout(() => { isFirstLoad.current = false }, 100)
    }
  }

  const save = useCallback(async (overrides = {}) => {
    if (isFirstLoad.current || !gallery || !title) return
    // Jump straight to saved — no intermediate 'saving' flash
    try {
      const s = {
        title, clientName, notes, eventDate, isActive, expiresAt,
        requirePassword, password, requireDownloadPin, downloadPin,
        allowDownloads, downloadWatermarked, allowFavorites, allowComments, template,
        ...overrides
      }
      const updates = {
        title: s.title, client_name: s.clientName, notes: s.notes,
        event_date: s.eventDate || null,
        is_active: s.isActive,
        expires_at: s.expiresAt ? new Date(s.expiresAt).toISOString() : null,
        require_password: s.requirePassword,
        require_download_pin: s.requireDownloadPin,
        allow_downloads: s.allowDownloads,
        download_watermarked: s.downloadWatermarked,
        allow_favorites: s.allowFavorites,
        allow_comments: s.allowComments,
        template: s.template,
      }
      if (s.requirePassword && s.password && passwordChanged.current) {
        const { data } = await supabase.rpc('hash_gallery_password', { p_password: s.password })
        updates.password_hash = data
        passwordChanged.current = false
      }
      if (s.requireDownloadPin && s.downloadPin && pinChanged.current) {
        const { data } = await supabase.rpc('hash_gallery_password', { p_password: s.downloadPin })
        updates.download_pin_hash = data
        pinChanged.current = false
      }
      await updateGallery(id, updates)
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }, [gallery, title, clientName, notes, eventDate, isActive, expiresAt,
      requirePassword, password, requireDownloadPin, downloadPin,
      allowDownloads, downloadWatermarked, allowFavorites, allowComments, template, id])

  // Toggles save immediately; text fields save on blur
  function handleToggle(setter, key, val) {
    setter(val)
    save({ [key]: val })
  }

  function handleTemplateChange(val) {
    setTemplate(val)
    save({ template: val })
  }

  function handleTogglePassword(val) {
    setRequirePassword(val)
    let pw = password
    if (val && !password && !gallery?.password_hash) {
      pw = generatePassword()
      setPassword(pw)
      passwordChanged.current = true
      setShowPassword(true)
    }
    save({ requirePassword: val, password: pw })
  }

  function handleRefreshPassword() {
    const pw = generatePassword()
    setPassword(pw)
    passwordChanged.current = true
    setShowPassword(true)
    save({ password: pw })
  }

  function handleToggleDownloadPin(val) {
    setRequireDownloadPin(val)
    let pin = downloadPin
    if (val && !downloadPin && !gallery?.download_pin_hash) {
      pin = generatePin()
      setDownloadPin(pin)
      pinChanged.current = true
      setShowDownloadPin(true)
    }
    save({ requireDownloadPin: val, downloadPin: pin })
  }

  function handleRefreshPin() {
    const pin = generatePin()
    setDownloadPin(pin)
    pinChanged.current = true
    setShowDownloadPin(true)
    save({ downloadPin: pin })
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: 'var(--border-strong)', borderTopColor: 'transparent' }} />
    </div>
  )

  if (!gallery) return null

  return (
    <div className="max-w-2xl space-y-6">
      <Button variant="ghost" onClick={() => navigate(`/galleries/${id}`)} className="-ml-2">
        <ArrowLeft size={15} />Back to gallery
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Settings</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{gallery.title}</p>
        </div>

      </div>

      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'general' && (
        <div className="space-y-4">
          <SettingsSection title="Gallery Info">
            <div className="px-5 py-4 space-y-4" style={{ background: 'var(--surface)' }}>
              <Input label="Gallery title" value={title} onChange={setTitle} onBlur={() => save()}
                placeholder="e.g. Smith Wedding — June 2026" required />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Client name" value={clientName} onChange={setClientName} onBlur={() => save()}
                  placeholder="e.g. Sarah & James" />
                <Input label="Event date" value={eventDate} onChange={setEventDate} onBlur={() => save()} type="date" />
              </div>
              <Input label="Internal notes" value={notes} onChange={setNotes} onBlur={() => save()}
                placeholder="Not visible to clients" type="textarea" />
            </div>
          </SettingsSection>
          <SettingsSection title="Status">
            <SettingsRow label="Gallery active" description="Inactive galleries are inaccessible to clients">
              <Toggle checked={isActive} onChange={v => handleToggle(setIsActive, 'isActive', v)} />
            </SettingsRow>
            <div className="px-5 py-4" style={{ background: 'var(--surface)' }}>
              <Input label="Expiry date" value={expiresAt} onChange={setExpiresAt} onBlur={() => save()} type="date"
                hint="Gallery automatically deactivates after this date. Leave blank for no expiry." />
            </div>
          </SettingsSection>
        </div>
      )}

      {activeTab === 'access' && (
        <div className="space-y-4">
          <SettingsSection title="Password Protection"
            description="Require clients to enter a password before viewing the gallery">
            <SettingsRow label="Require password" description="Clients must enter a password to access">
              <Toggle checked={requirePassword} onChange={handleTogglePassword} />
            </SettingsRow>
            {requirePassword && (
              <div className="px-5 py-4 space-y-1.5" style={{ background: 'var(--surface)' }}>
                <label className="text-sm font-medium block" style={{ color: 'var(--text)' }}>Gallery password</label>
                <CodeField value={password}
                  onChange={v => { setPassword(v); passwordChanged.current = true }}
                  onRefresh={handleRefreshPassword}
                  showValue={showPassword} onToggleShow={() => setShowPassword(!showPassword)}
                  placeholder={gallery.password_hash ? 'Leave blank to keep current' : 'Auto-generated'}
                  hint={gallery.password_hash
                    ? 'A password is set. Leave blank to keep it, or generate/type a new one.'
                    : 'Share this with your client so they can access the gallery.'} />
              </div>
            )}
          </SettingsSection>
          <SettingsSection title="Download PIN" description="A separate 4-digit PIN required to download images">
            <SettingsRow label="Require download PIN" description="Clients need a PIN to download">
              <Toggle checked={requireDownloadPin} onChange={handleToggleDownloadPin} />
            </SettingsRow>
            {requireDownloadPin && (
              <div className="px-5 py-4 space-y-1.5" style={{ background: 'var(--surface)' }}>
                <label className="text-sm font-medium block" style={{ color: 'var(--text)' }}>Download PIN</label>
                <CodeField value={downloadPin}
                  onChange={v => { setDownloadPin(v.replace(/[^0-9]/g, '').slice(0, 4)); pinChanged.current = true }}
                  onRefresh={handleRefreshPin}
                  showValue={showDownloadPin} onToggleShow={() => setShowDownloadPin(!showDownloadPin)}
                  placeholder={gallery.download_pin_hash ? '••••' : 'Auto-generated'}
                  hint="4-digit numeric PIN · Click ↺ to generate a new one" />
              </div>
            )}
          </SettingsSection>
        </div>
      )}

      {activeTab === 'sharing' && (
        <div className="space-y-4">
          <SettingsSection title="Downloads" description="Control how clients can download their images">
            <SettingsRow label="Allow downloads" description="Clients can download their images">
              <Toggle checked={allowDownloads} onChange={v => handleToggle(setAllowDownloads, 'allowDownloads', v)} />
            </SettingsRow>
            {allowDownloads && (
              <SettingsRow label="Watermark downloads" description="Downloads include your watermark. Off = clean originals.">
                <Toggle checked={downloadWatermarked} onChange={v => handleToggle(setDownloadWatermarked, 'downloadWatermarked', v)} />
              </SettingsRow>
            )}
          </SettingsSection>
          <SettingsSection title="Client Interactions">
            <SettingsRow label="Allow favorites" description="Clients can heart their favorite images">
              <Toggle checked={allowFavorites} onChange={v => handleToggle(setAllowFavorites, 'allowFavorites', v)} />
            </SettingsRow>
            <SettingsRow label="Allow comments" description="Clients can leave comments on images">
              <Toggle checked={allowComments} onChange={v => handleToggle(setAllowComments, 'allowComments', v)} />
            </SettingsRow>
          </SettingsSection>
        </div>
      )}

      {activeTab === 'display' && (
        <div className="space-y-4">
          <SettingsSection title="Gallery Template" description="Choose how the gallery looks for your client">
            <div className="p-5 grid grid-cols-2 gap-3" style={{ background: 'var(--surface)' }}>
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => handleTemplateChange(t.id)}
                  className="text-left p-4 rounded-xl transition-all"
                  style={{
                    cursor: 'pointer',
                    border: template === t.id ? '2px solid #6366f1' : '2px solid var(--border)',
                    background: template === t.id ? 'rgba(99,102,241,0.05)' : 'var(--bg-subtle)',
                  }}>
                  <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>{t.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.description}</p>
                </button>
              ))}
            </div>
          </SettingsSection>
        </div>
      )}

      <SaveIndicator state={saveState} />
    </div>
  )
}
