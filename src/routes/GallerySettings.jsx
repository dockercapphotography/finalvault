import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Save, RefreshCw } from 'lucide-react'
import { getGallery, updateGallery } from '../utils/galleryApi.js'
import { supabase } from '../supabaseClient.js'
import Tabs from '../components/ui/Tabs.jsx'
import SettingsSection from '../components/ui/SettingsSection.jsx'
import SettingsRow from '../components/ui/SettingsRow.jsx'
import Toggle from '../components/ui/Toggle.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'
import Toast from '../components/ui/Toast.jsx'

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

const inputStyle = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderRadius: '8px',
  padding: '9px 40px 9px 12px',
  fontSize: '14px',
  outline: 'none',
}

function PinField({ value, onChange, onRefresh, showValue, onToggleShow, placeholder }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type={showValue ? 'text' : 'password'}
            value={value}
            onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder={placeholder}
            maxLength={4}
            style={{ ...inputStyle, paddingRight: '72px', fontFamily: 'monospace', letterSpacing: '0.15em' }}
            onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              type="button"
              onClick={onRefresh}
              title="Generate new PIN"
              style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <RefreshCw size={14} />
            </button>
            <button
              type="button"
              onClick={onToggleShow}
              style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              {showValue ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        4-digit numeric PIN · Click <RefreshCw size={10} style={{ display: 'inline', marginBottom: '-1px' }} /> to generate a new one
      </p>
    </div>
  )
}

export default function GallerySettings() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [gallery, setGallery] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [activeTab, setActiveTab] = useState('general')
  const [showPassword, setShowPassword] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const [showDownloadPin, setShowDownloadPin] = useState(false)

  // Form state
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

  // Track whether PINs are newly set this session (need hashing) vs unchanged
  const [passwordChanged, setPasswordChanged] = useState(false)
  const [pinChanged, setPinChanged] = useState(false)

  useEffect(() => { load() }, [id])

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
      // Show existing PINs as placeholder — don't show actual hash
      setPassword('')
      setDownloadPin('')
      setPasswordChanged(false)
      setPinChanged(false)
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  // Auto-generate PIN when toggling on
  function handleTogglePassword(val) {
    setRequirePassword(val)
    if (val && !password) {
      // Generate a random password suggestion? No — passwords stay manual
    }
  }

  function handleToggleDownloadPin(val) {
    setRequireDownloadPin(val)
    if (val && !downloadPin) {
      const pin = generatePin()
      setDownloadPin(pin)
      setPinChanged(true)
      setShowDownloadPin(true)
    }
  }

  function handleRefreshPin() {
    const pin = generatePin()
    setDownloadPin(pin)
    setPinChanged(true)
    setShowDownloadPin(true)
  }

  function handlePasswordChange(val) {
    setPassword(val)
    setPasswordChanged(true)
  }

  function handlePinChange(val) {
    setDownloadPin(val)
    setPinChanged(true)
  }

  async function handleSave() {
    if (!title) {
      setToast({ message: 'Gallery title is required', type: 'error' })
      return
    }
    setSaving(true)
    try {
      const updates = {
        title,
        client_name: clientName,
        notes,
        event_date: eventDate || null,
        is_active: isActive,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        require_password: requirePassword,
        require_download_pin: requireDownloadPin,
        allow_downloads: allowDownloads,
        download_watermarked: downloadWatermarked,
        allow_favorites: allowFavorites,
        allow_comments: allowComments,
        template,
      }

      if (requirePassword && password && passwordChanged) {
        const { data } = await supabase.rpc('hash_gallery_password', { p_password: password })
        updates.password_hash = data
      }
      if (requireDownloadPin && downloadPin && pinChanged) {
        const { data } = await supabase.rpc('hash_gallery_password', { p_password: downloadPin })
        updates.download_pin_hash = data
      }

      await updateGallery(id, updates)
      setToast({ message: 'Settings saved', type: 'success' })
      setPasswordChanged(false)
      setPinChanged(false)
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    } finally {
      setSaving(false)
    }
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
        <Button onClick={handleSave} disabled={saving}>
          <Save size={14} />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* ── General ── */}
      {activeTab === 'general' && (
        <div className="space-y-4">
          <SettingsSection title="Gallery Info">
            <div className="px-5 py-4 space-y-4" style={{ background: 'var(--surface)' }}>
              <Input label="Gallery title" value={title} onChange={setTitle}
                placeholder="e.g. Smith Wedding — June 2026" required />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Client name" value={clientName} onChange={setClientName}
                  placeholder="e.g. Sarah & James" />
                <Input label="Event date" value={eventDate} onChange={setEventDate} type="date" />
              </div>
              <Input label="Internal notes" value={notes} onChange={setNotes}
                placeholder="Not visible to clients" type="textarea" />
            </div>
          </SettingsSection>

          <SettingsSection title="Status">
            <SettingsRow label="Gallery active" description="Inactive galleries are inaccessible to clients">
              <Toggle checked={isActive} onChange={setIsActive} />
            </SettingsRow>
            <div className="px-5 py-4" style={{ background: 'var(--surface)' }}>
              <Input label="Expiry date" value={expiresAt} onChange={setExpiresAt} type="date"
                hint="Gallery automatically deactivates after this date. Leave blank for no expiry." />
            </div>
          </SettingsSection>
        </div>
      )}

      {/* ── Access ── */}
      {activeTab === 'access' && (
        <div className="space-y-4">
          <SettingsSection title="Password Protection"
            description="Require clients to enter a password before viewing the gallery">
            <SettingsRow label="Require password" description="Clients must enter a password to access">
              <Toggle checked={requirePassword} onChange={handleTogglePassword} />
            </SettingsRow>
            {requirePassword && (
              <div className="px-5 py-4 space-y-1.5" style={{ background: 'var(--surface)' }}>
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  Gallery password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => handlePasswordChange(e.target.value)}
                    placeholder={gallery.password_hash ? 'Leave blank to keep current password' : 'Set a password'}
                    style={{ ...inputStyle, paddingRight: '40px' }}
                    onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {gallery.password_hash ? 'A password is currently set. Leave blank to keep it.' : 'Clients will need this to view the gallery.'}
                </p>
              </div>
            )}
          </SettingsSection>

          <SettingsSection title="Download PIN"
            description="A separate PIN required to download images">
            <SettingsRow label="Require download PIN" description="Clients need a PIN to download">
              <Toggle checked={requireDownloadPin} onChange={handleToggleDownloadPin} />
            </SettingsRow>
            {requireDownloadPin && (
              <div className="px-5 py-4" style={{ background: 'var(--surface)' }}>
                <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>
                  Download PIN
                </label>
                <PinField
                  value={downloadPin}
                  onChange={handlePinChange}
                  onRefresh={handleRefreshPin}
                  showValue={showDownloadPin}
                  onToggleShow={() => setShowDownloadPin(!showDownloadPin)}
                  placeholder={gallery.download_pin_hash ? '••••' : 'Auto-generated'}
                />
              </div>
            )}
          </SettingsSection>
        </div>
      )}

      {/* ── Sharing ── */}
      {activeTab === 'sharing' && (
        <div className="space-y-4">
          <SettingsSection title="Downloads"
            description="Control how clients can download their images">
            <SettingsRow label="Allow downloads" description="Clients can download their images">
              <Toggle checked={allowDownloads} onChange={setAllowDownloads} />
            </SettingsRow>
            {allowDownloads && (
              <SettingsRow label="Watermark downloads"
                description="Downloads include your watermark. Off = clean originals.">
                <Toggle checked={downloadWatermarked} onChange={setDownloadWatermarked} />
              </SettingsRow>
            )}
          </SettingsSection>

          <SettingsSection title="Client Interactions"
            description="Control what clients can do in their gallery">
            <SettingsRow label="Allow favorites" description="Clients can heart their favorite images">
              <Toggle checked={allowFavorites} onChange={setAllowFavorites} />
            </SettingsRow>
            <SettingsRow label="Allow comments" description="Clients can leave comments on images">
              <Toggle checked={allowComments} onChange={setAllowComments} />
            </SettingsRow>
          </SettingsSection>
        </div>
      )}

      {/* ── Display ── */}
      {activeTab === 'display' && (
        <div className="space-y-4">
          <SettingsSection title="Gallery Template"
            description="Choose how the gallery looks for your client">
            <div className="p-5 grid grid-cols-2 gap-3" style={{ background: 'var(--surface)' }}>
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => setTemplate(t.id)}
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

      <div className="flex justify-end pb-6">
        <Button onClick={handleSave} disabled={saving}>
          <Save size={14} />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        </div>
      )}
    </div>
  )
}
