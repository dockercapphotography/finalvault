import { useState, useEffect, useRef } from 'react'
import { Upload, CheckCircle } from 'lucide-react'
import { supabase } from '../supabaseClient.js'
import {
  getWatermarks, uploadWatermark, updateWatermark,
  deleteWatermark, setActiveWatermark
} from '../utils/watermarkApi.js'
import WatermarkCard from '../components/watermarks/WatermarkCard.jsx'
import SettingsSection from '../components/ui/SettingsSection.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'

function SaveIndicator({ state }) {
  if (state === 'idle') return null
  const config = {
    saved: { text: 'Changes saved', color: 'var(--success)', bg: 'var(--success-subtle)', border: 'var(--success)', icon: true },
    error: { text: 'Failed to save',  color: 'var(--danger)',  bg: 'var(--danger-subtle)',  border: 'var(--danger)' },
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

export default function Account() {
  const [user, setUser]               = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [watermarks, setWatermarks]   = useState([])
  const [activeId, setActiveId]       = useState(null)
  const [uploading, setUploading]     = useState(false)
  const [saveState, setSaveState]     = useState('idle')
  const [loading, setLoading]         = useState(true)
  const fileInputRef                  = useRef(null)
  const dismissTimer                  = useRef(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (saveState === 'saved') {
      clearTimeout(dismissTimer.current)
      dismissTimer.current = setTimeout(() => setSaveState('idle'), 2500)
    }
    return () => clearTimeout(dismissTimer.current)
  }, [saveState])

  async function load() {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      const { data: profile } = await supabase
        .from('photographers')
        .select('display_name, active_watermark_id')
        .eq('id', user.id)
        .single()

      setDisplayName(profile?.display_name || '')
      setActiveId(profile?.active_watermark_id || null)

      const wms = await getWatermarks()
      setWatermarks(wms)
    } catch (err) {
      console.error('Account load error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function saveProfile() {
    try {
      const { error } = await supabase
        .from('photographers')
        .update({ display_name: displayName, updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (error) throw error
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  async function handleWatermarkUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setUploading(true)
      const wm = await uploadWatermark(file, file.name.replace(/\.[^.]+$/, ''))
      setWatermarks(prev => [wm, ...prev])
      if (watermarks.length === 0) {
        await setActiveWatermark(wm.id)
        setActiveId(wm.id)
      }
      setSaveState('saved')
    } catch (err) {
      console.error('Watermark upload error:', err)
      setSaveState('error')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleSetActive(id) {
    try {
      await setActiveWatermark(id)
      setActiveId(id)
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  async function handleUpdate(id, updates) {
    try {
      const updated = await updateWatermark(id, updates)
      setWatermarks(prev => prev.map(w => w.id === id ? updated : w))
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this watermark?')) return
    try {
      await deleteWatermark(id)
      setWatermarks(prev => prev.filter(w => w.id !== id))
      if (activeId === id) {
        await setActiveWatermark(null)
        setActiveId(null)
      }
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: 'var(--border-strong)', borderTopColor: 'transparent' }} />
    </div>
  )

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Account</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
      </div>

      {/* Profile */}
      <SettingsSection title="Profile">
        <div className="px-5 py-4 space-y-4" style={{ background: 'var(--surface)' }}>
          <Input
            label="Display name"
            value={displayName}
            onChange={setDisplayName}
            onBlur={saveProfile}
            placeholder="Your name or studio name"
          />
          <div>
            <label className="text-sm font-medium block" style={{ color: 'var(--text)' }}>Email</label>
            <p className="text-sm mt-1.5" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
          </div>
        </div>
      </SettingsSection>

      {/* Watermarks */}
      <SettingsSection
        title="Watermarks"
        description="Watermarks are applied to image previews. The active watermark is used for new galleries.">

        <div className="px-5 py-4" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label="Upload watermark image"
            onChange={handleWatermarkUpload}
            className="sr-only"
          />
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}>
            <Upload size={14} />
            {uploading ? 'Uploading…' : 'Upload watermark image'}
          </Button>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            PNG with transparency recommended. Max 5 MB.
          </p>
        </div>

        {watermarks.length === 0 ? (
          <div className="px-5 py-8 text-center" style={{ background: 'var(--surface)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No watermarks yet. Upload one above.
            </p>
          </div>
        ) : (
          <div className="p-5 grid grid-cols-1 gap-4" style={{ background: 'var(--surface)' }}>
            {watermarks.map(wm => (
              <WatermarkCard
                key={wm.id}
                watermark={wm}
                isActive={wm.id === activeId}
                onSetActive={handleSetActive}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </SettingsSection>

      <SaveIndicator state={saveState} />
    </div>
  )
}
