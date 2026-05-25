import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Save } from 'lucide-react'
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

const selectStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderRadius: '8px',
  padding: '7px 32px 7px 10px',
  fontSize: '13px',
  outline: 'none',
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
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

  useEffect(() => {
    load()
  }, [id])

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
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
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

      // Hash password/PIN via Supabase RPC if changed
      if (requirePassword && password) {
        const { data } = await supabase.rpc('hash_gallery_password', { p_password: password })
        updates.password_hash = data
      }
      if (requireDownloadPin && downloadPin) {
        const { data } = await supabase.rpc('hash_gallery_password', { p_password: downloadPin })
        updates.download_pin_hash = data
      }

      await updateGallery(id, updates)
      setToast({ message: 'Settings saved', type: 'success' })
      setPassword('')
      setDownloadPin('')
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
      {/* Back */}
      <Button variant="ghost" onClick={() => navigate(`/galleries/${id}`)} className="-ml-2">
        <ArrowLeft size={15} />
        Back to gallery
      </Button>

      {/* Header */}
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

      {/* Tabs */}
      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* ── General Tab ── */}
      {activeTab === 'general' && (
        <div className="space-y-4">
          <SettingsSection title="Gallery Info">
            <div className="px-5 py-4 space-y-4" style={{ background: 'var(--surface)' }}>
              <Input
                label="Gallery title"
                value={title}
                onChange={setTitle}
                placeholder="e.g. Smith Wedding — June 2026"
                required
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Client name"
                  value={clientName}
                  onChange={setClientName}
                  placeholder="e.g. Sarah & James"
                />
                <Input
                  label="Event date"
                  value={eventDate}
                  onChange={setEventDate}
                  type="date"
                />
              </div>
              <Input
                label="Internal notes"
                value={notes}
                onChange={setNotes}
                placeholder="Not visible to clients"
                type="textarea"
              />
            </div>
          </SettingsSection>

          <SettingsSection title="Status">
            <SettingsRow
              label="Gallery active"
              description="Inactive galleries are inaccessible to clients"
            >
              <Toggle checked={isActive} onChange={setIsActive} />
            </SettingsRow>
            <div className="px-5 py-4" style={{ background: 'var(--surface)' }}>
              <Input
                label="Expiry date"
                value={expiresAt}
                onChange={setExpiresAt}
                type="date"
                hint="Gallery automatically deactivates after this date. Leave blank for no expiry."
              />
            </div>
          </SettingsSection>
        </div>
      )}

      {/* ── Access Tab ── */}
      {activeTab === 'access' && (
        <div className="space-y-4">
          <SettingsSection
            title="Password Protection"
            description="Require clients to enter a password before viewing the gallery"
          >
            <SettingsRow label="Require password" description="Clients must enter a password to access">
              <Toggle checked={requirePassword} onChange={setRequirePassword} />
            </SettingsRow>
            {requirePassword && (
              <div className="px-5 py-4 space-y-1" style={{ background: 'var(--surface)' }}>
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  Gallery password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Set a new password (leave blank to keep current)"
                    style={{
                      width: '100%',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      borderRadius: '8px',
                      padding: '9px 40px 9px 12px',
                      fontSize: '14px',
                      outline: 'none',
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Leave blank to keep the existing password unchanged
                </p>
              </div>
            )}
          </SettingsSection>

          <SettingsSection
            title="Download PIN"
            description="Separate PIN required specifically to download images"
          >
            <SettingsRow label="Require download PIN" description="Clients need a PIN to download">
              <Toggle checked={requireDownloadPin} onChange={setRequireDownloadPin} />
            </SettingsRow>
            {requireDownloadPin && (
              <div className="px-5 py-4 space-y-1" style={{ background: 'var(--surface)' }}>
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  Download PIN
                </label>
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    value={downloadPin}
                    onChange={e => setDownloadPin(e.target.value)}
                    placeholder="Set a new PIN (leave blank to keep current)"
                    style={{
                      width: '100%',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      borderRadius: '8px',
                      padding: '9px 40px 9px 12px',
                      fontSize: '14px',
                      outline: 'none',
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Leave blank to keep the existing PIN unchanged
                </p>
              </div>
            )}
          </SettingsSection>
        </div>
      )}

      {/* ── Sharing Tab ── */}
      {activeTab === 'sharing' && (
        <div className="space-y-4">
          <SettingsSection
            title="Downloads"
            description="Control how clients can download their images"
          >
            <SettingsRow label="Allow downloads" description="Clients can download their images">
              <Toggle checked={allowDownloads} onChange={setAllowDownloads} />
            </SettingsRow>
            {allowDownloads && (
              <SettingsRow
                label="Watermark downloads"
                description="Downloads include your watermark. Off = clean originals."
              >
                <Toggle checked={downloadWatermarked} onChange={setDownloadWatermarked} />
              </SettingsRow>
            )}
          </SettingsSection>

          <SettingsSection
            title="Client Interactions"
            description="Control what clients can do in their gallery"
          >
            <SettingsRow label="Allow favorites" description="Clients can heart their favorite images">
              <Toggle checked={allowFavorites} onChange={setAllowFavorites} />
            </SettingsRow>
            <SettingsRow label="Allow comments" description="Clients can leave comments on images">
              <Toggle checked={allowComments} onChange={setAllowComments} />
            </SettingsRow>
          </SettingsSection>
        </div>
      )}

      {/* ── Display Tab ── */}
      {activeTab === 'display' && (
        <div className="space-y-4">
          <SettingsSection
            title="Gallery Template"
            description="Choose how the gallery looks for your client"
          >
            <div className="p-5 grid grid-cols-2 gap-3" style={{ background: 'var(--surface)' }}>
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className="text-left p-4 rounded-xl transition-all"
                  style={{
                    cursor: 'pointer',
                    border: template === t.id ? '2px solid #6366f1' : '2px solid var(--border)',
                    background: template === t.id ? 'rgba(99,102,241,0.05)' : 'var(--bg-subtle)',
                  }}
                >
                  <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>{t.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.description}</p>
                </button>
              ))}
            </div>
          </SettingsSection>
        </div>
      )}

      {/* Save button at bottom too */}
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
