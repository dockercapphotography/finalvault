import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {ArrowLeft, CheckCircle, Copy, Eye, EyeOff, Plus, RefreshCw, Trash2, X} from 'lucide-react'
import { getGallery, updateGallery, getTags, getGalleryTags, assignTag, unassignTag, createAndAssignTag, deleteGallery, getFolderAncestors, buildGalleryCrumbs } from '../utils/galleryApi.js'
import { getClients } from '../utils/crmApi.js'
import { getImages } from '../utils/imageApi.js'
import { deleteFromR2 } from '../utils/r2.js'
import { THEMES } from '../utils/themes.js'
import { supabase } from '../supabaseClient.js'
import Tabs from '../components/ui/Tabs.jsx'
import SettingsSection from '../components/ui/SettingsSection.jsx'
import SettingsRow from '../components/ui/SettingsRow.jsx'
import Toggle from '../components/ui/Toggle.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'
import PageBreadcrumb from '../components/ui/PageBreadcrumb.jsx'
import ClientPicker from '../components/ui/ClientPicker.jsx'
import { generatePin, generatePassword } from '../utils/secretGenerators.js'

const TABS = [
  { id: 'general',  label: 'General' },
  { id: 'access',   label: 'Access' },
  { id: 'sharing',  label: 'Sharing' },
  { id: 'display',  label: 'Display' },
  { id: 'danger',   label: 'Danger Zone' },
]

function PlainField({ label, value, onChange, onRefresh, onCopy, placeholder, hint, maxLength, type = 'text' }) {
  const [show, setShow] = useState(true)
  return (
    <div className="space-y-1.5">
      {label && <label className="text-sm font-medium block" style={{ color: 'var(--text)' }}>{label}</label>}
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => {
            const v = maxLength ? e.target.value.slice(0, maxLength) : e.target.value
            onChange(type === 'pin' ? v.replace(/[^0-9]/g, '') : v)
          }}
          placeholder={placeholder}
          style={{
            width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--text)', borderRadius: '8px', padding: '9px 80px 9px 12px',
            fontSize: '14px', outline: 'none',
            fontFamily: type === 'pin' ? 'monospace' : 'inherit',
            letterSpacing: type === 'pin' ? '0.2em' : 'normal',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {onRefresh && (
            <button type="button" onClick={onRefresh} title="Generate new"
              style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
              <RefreshCw size={14} />
            </button>
          )}
          {onCopy && value && (
            <button type="button" onClick={() => navigator.clipboard.writeText(value)} title="Copy"
              style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
              <Copy size={14} />
            </button>
          )}
          <button type="button" onClick={() => setShow(!show)}
            style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
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
    saved: { text: 'Changes saved', color: 'var(--success)', bg: 'var(--success-subtle)', border: 'var(--success)', icon: true },
    error: { text: 'Failed to save', color: 'var(--danger)', bg: 'var(--danger-subtle)', border: 'var(--danger)' },
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
  const location = useLocation()
  const [gallery, setGallery] = useState(null)
  const [folderAncestors, setFolderAncestors] = useState([])
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState('idle')
  const [activeTab, setActiveTab] = useState('general')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isFirstLoad = useRef(true)
  const dismissTimer = useRef(null)

  const [title, setTitle] = useState('')
  const [eventName, setEventName] = useState('')
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
  const [allowHiresDownload, setAllowHiresDownload] = useState(false)
  const [allowFavorites, setAllowFavorites] = useState(true)
  const [allowComments, setAllowComments] = useState(true)
  const [showGuide, setShowGuide] = useState(true)
  const [galleryTags, setGalleryTags] = useState([])
  const [linkedClientId, setLinkedClientId] = useState('')
  const [allClients, setAllClients] = useState([])
  const [allTags, setAllTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [tagSuggestions, setTagSuggestions] = useState([])
  const [showTagSuggestions, setShowTagSuggestions] = useState(false)
  const [tagDropdownPos, setTagDropdownPos] = useState({ top: 0, left: 0, width: 0 })
  const tagInputRef = useRef(null)
  const tagDropdownMouseDown = useRef(false)
  const tagDropdownRef = useRef(null)
  const [expiryWarningEnabled, setExpiryWarningEnabled] = useState(false)
  const [expiryWarningDays, setExpiryWarningDays] = useState(3)
  const [themeColor, setThemeColor] = useState('light')
  const [gridSize, setGridSize] = useState('medium')
  const [gridSpacing, setGridSpacing] = useState('tight')

  useEffect(() => { load() }, [id])

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
      // Folder context: prefer what GalleryDetail relayed via navigation
      // state, otherwise fetch fresh from the gallery's folder_id. Fetching
      // as a fallback (not just trusting relayed state) keeps the breadcrumb
      // correct even on a direct link or hard refresh to this page.
      if (location.state?.folderAncestors) {
        setFolderAncestors(location.state.folderAncestors)
      } else {
        getFolderAncestors(g.folder_id).then(setFolderAncestors).catch(() => setFolderAncestors([]))
      }
      setTitle(g.title || '')
      setEventName(g.event_name || '')
      setClientName(g.client_name || '')
      setNotes(g.notes || '')
      setEventDate(g.event_date || '')
      setIsActive(g.is_active ?? true)
      setExpiresAt(g.expires_at ? g.expires_at.split('T')[0] : '')
      setRequirePassword(g.require_password ?? false)
      setPassword(g.plain_password || '')
      setRequireDownloadPin(g.require_download_pin ?? false)
      setDownloadPin(g.plain_download_pin || '')
      setAllowDownloads(g.allow_downloads ?? true)
      setDownloadWatermarked(g.download_watermarked ?? false)
      setAllowHiresDownload(g.allow_hires_download ?? false)
      setAllowFavorites(g.allow_favorites ?? true)
      setAllowComments(g.allow_comments ?? true)
      setShowGuide(g.show_guide ?? true)
      const [tagsData, allTagsData] = await Promise.all([getGalleryTags(id), getTags()])
      setGalleryTags(tagsData)
      setAllTags(allTagsData)
      setExpiryWarningEnabled(g.expiry_warning_enabled ?? false)
      setExpiryWarningDays(g.expiry_warning_days ?? 3)
      setThemeColor(g.theme_color || 'light')
      // Normalise legacy 'regular' value to 'medium'
      setGridSize(g.grid_size === 'regular' ? 'medium' : (g.grid_size || 'medium'))
      setGridSpacing(g.grid_spacing === 'regular' ? 'tight' : (g.grid_spacing || 'tight'))
      setLinkedClientId(g.client_id || '')
      getClients().then(setAllClients).catch(() => {})
    } catch {
      setSaveState('error')
    } finally {
      setLoading(false)
      setTimeout(() => { isFirstLoad.current = false }, 100)
    }
  }

  async function handleDeleteGallery() {
    setDeleting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const images = await getImages(id)
      await Promise.all(images.map(img => Promise.all([
        img.original_r2_key ? deleteFromR2({ key: img.original_r2_key, token }) : Promise.resolve(),
        img.preview_r2_key ? deleteFromR2({ key: img.preview_r2_key, token }) : Promise.resolve(),
      ])))
      await deleteGallery(id)
      navigate('/')
    } catch {
      setSaveState('error')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const save = useCallback(async (overrides = {}) => {
    if (isFirstLoad.current || !gallery || !title) return
    try {
      const s = {
        title, clientName, eventName, notes, eventDate, isActive, expiresAt, expiryWarningEnabled, expiryWarningDays,
        requirePassword, password, requireDownloadPin, downloadPin,
        allowDownloads, downloadWatermarked, allowHiresDownload,
        allowFavorites, allowComments, showGuide, themeColor, gridSize, gridSpacing,
        linkedClientId,
        ...overrides
      }
      await updateGallery(id, {
        title: s.title,
        client_name: s.clientName,
        event_name: s.eventName,
        notes: s.notes,
        event_date: s.eventDate || null,
        is_active: s.isActive,
        expires_at: s.expiresAt ? new Date(s.expiresAt).toISOString() : null,
        require_password: s.requirePassword,
        plain_password: s.requirePassword ? s.password : null,
        require_download_pin: s.requireDownloadPin,
        plain_download_pin: s.requireDownloadPin ? s.downloadPin : null,
        allow_downloads: s.allowDownloads,
        download_watermarked: s.downloadWatermarked,
        allow_hires_download: s.allowHiresDownload,
        allow_favorites: s.allowFavorites,
        expiry_warning_enabled: s.expiryWarningEnabled,
        expiry_warning_days: s.expiryWarningDays,
        allow_comments: s.allowComments,
        show_guide: s.showGuide,
        client_id: s.linkedClientId || null,
        theme_color: s.themeColor,
        grid_size: s.gridSize,
        grid_spacing: s.gridSpacing,
      })
      setSaveState('saved')
    } catch { setSaveState('error') }
  }, [gallery, title, clientName, eventName, notes, eventDate, isActive, expiresAt, expiryWarningEnabled, expiryWarningDays,
      requirePassword, password, requireDownloadPin, downloadPin,
      allowDownloads, downloadWatermarked, allowHiresDownload,
      allowFavorites, allowComments, showGuide, themeColor, gridSize, gridSpacing, id])

  function handleToggle(setter, key, val) {
    setter(val)
    const overrides = { [key]: val }
    save(overrides)
  }

  function handleTogglePassword(val) {
    setRequirePassword(val)
    let pw = password
    if (val && !password) { pw = generatePassword(); setPassword(pw) }
    save({ requirePassword: val, password: pw })
  }

  function handleToggleDownloadPin(val) {
    setRequireDownloadPin(val)
    let pin = downloadPin
    if (val && !downloadPin) { pin = generatePin(); setDownloadPin(pin) }
    save({ requireDownloadPin: val, downloadPin: pin })
  }

  // ── Tag handlers ─────────────────────────────────────────────────────────────

  function handleTagInput(val) {
    setTagInput(val)
    const assigned = new Set(galleryTags.map(t => t.id))
    const q = val.toLowerCase()
    const suggestions = allTags.filter(t => !assigned.has(t.id) && (q === '' || t.name.includes(q)))
    setTagSuggestions(suggestions)
    setShowTagSuggestions(true)
  }

  function openTagDropdown() {
    if (tagInputRef.current) {
      const rect = tagInputRef.current.getBoundingClientRect()
      setTagDropdownPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: rect.width })
    }
    const assigned = new Set(galleryTags.map(t => t.id))
    const suggestions = allTags.filter(t => !assigned.has(t.id))
    setTagSuggestions(suggestions)
    setShowTagSuggestions(true)
  }

  useEffect(() => {
    if (!showTagSuggestions) return
    function handleOutsideClick(e) {
      if (tagInputRef.current && tagInputRef.current.contains(e.target)) return
      if (tagDropdownRef.current && tagDropdownRef.current.contains(e.target)) return
      setShowTagSuggestions(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [showTagSuggestions])

  async function handleSelectTag(tag) {
    setTagInput('')
    setTagInput('')
    if (galleryTags.find(t => t.id === tag.id)) return
    try {
      await assignTag(id, tag.id)
      setGalleryTags(prev => [...prev, tag])
      setAllTags(prev => prev.map(t => t.id === tag.id ? { ...t, usage_count: (t.usage_count || 0) + 1 } : t))
    } catch (err) { console.error(err) }
  }

  async function handleCreateTag(name) {
    setTagInput('')
    setTagInput('')
    try {
      const tag = await createAndAssignTag(id, { name: name.trim().toLowerCase() })
      setGalleryTags(prev => [...prev, tag])
      setAllTags(prev => [...prev, { ...tag, usage_count: 1 }])
    } catch (err) { console.error(err) }
  }

  async function handleRemoveTag(tagId) {
    try {
      await unassignTag(id, tagId)
      setGalleryTags(prev => prev.filter(t => t.id !== tagId))
      setAllTags(prev => prev.map(t => t.id === tagId ? { ...t, usage_count: Math.max(0, (t.usage_count || 1) - 1) } : t))
    } catch (err) { console.error(err) }
  }

  function handleTagKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const q = tagInput.trim().toLowerCase()
      if (!q) return
      const exact = allTags.find(t => t.name === q)
      if (exact && !galleryTags.find(t => t.id === exact.id)) {
        handleSelectTag(exact)
      } else if (!exact) {
        handleCreateTag(q)
      }
    }
    if (e.key === 'Escape') {
      setShowTagSuggestions(false)
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
    <div className="max-w-2xl space-y-5">
      <PageBreadcrumb crumbs={buildGalleryCrumbs(gallery, folderAncestors, 'Settings')} />

      <div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{gallery.title}</p>
      </div>

      <div className="md:hidden">
        <select value={activeTab} onChange={e => setActiveTab(e.target.value)}
          style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '10px', padding: '10px 14px', fontSize: '14px', fontWeight: '500', outline: 'none', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center', paddingRight: '36px' }}>
          {TABS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div className="hidden md:flex gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className="px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
            style={{ background: activeTab === t.id ? 'var(--surface-raised)' : 'transparent', color: activeTab === t.id ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer', border: 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="space-y-4">
          <SettingsSection title="Gallery Info">
            <div className="px-5 py-4 space-y-4" style={{ background: 'var(--surface)' }}>
              <Input label="Gallery title" value={title} onChange={setTitle} onBlur={() => save()} placeholder="e.g. Smith Wedding — June 2026" required />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Client name" value={clientName} onChange={setClientName} onBlur={() => save()} placeholder="e.g. Sarah & James" />
                <Input label="Event date" value={eventDate} onChange={setEventDate} onBlur={() => save()} type="date" />
              </div>
              <Input label="Event name" value={eventName} onChange={setEventName} onBlur={() => save()} placeholder="e.g. PopCon Indy 2026" hint="Shown in the client gallery header" />
              <Input label="Internal notes" value={notes} onChange={setNotes} onBlur={() => save()} placeholder="Not visible to clients" type="textarea" />
            </div>
          </SettingsSection>
          {allClients.length > 0 && (
            <SettingsSection title="Linked Client" description="Associate this gallery with a client record">
              <div className="px-5 py-4" style={{ background: 'var(--surface)' }}>
                <ClientPicker
                  clients={allClients}
                  value={linkedClientId}
                  onChange={clientId => {
                    setLinkedClientId(clientId)
                    save({ linkedClientId: clientId })
                  }}
                />
              </div>
            </SettingsSection>
          )}

          <SettingsSection title="Tags" description="Categorize this gallery for easy filtering on your dashboard">
            <div className="px-5 py-4" style={{ background: 'var(--surface)' }}>
              {/* Assigned tag pills */}
              {galleryTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {galleryTags.map(tag => (
                    <span key={tag.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                      style={{ background: (tag.color || '#6366f1') + '22', color: tag.color || '#6366f1', border: `1px solid ${tag.color || '#6366f1'}44` }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color || '#6366f1', display: 'inline-block', flexShrink: 0 }} />
                      {tag.name}
                      <button onClick={() => handleRemoveTag(tag.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center', padding: 0, marginLeft: 2 }}>
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {/* Tag input */}
              <div style={{ position: 'relative' }}>
                <input
                  ref={tagInputRef}
                  type="text"
                  value={tagInput}
                  onChange={e => handleTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onFocus={openTagDropdown}
                  onBlur={() => {}}
                  placeholder="Add a tag..."
                  className="w-full text-sm rounded-lg px-3 py-2 outline-none"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                {showTagSuggestions && createPortal(
                  <div
                    ref={tagDropdownRef}
                    onMouseDown={() => { tagDropdownMouseDown.current = true }}
                    onMouseUp={() => { tagDropdownMouseDown.current = false; tagInputRef.current?.focus() }}
                    style={{
                    position: 'absolute',
                    top: tagDropdownPos.top,
                    left: tagDropdownPos.left,
                    width: tagDropdownPos.width,
                    zIndex: 9999,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
                    overflow: 'hidden', maxHeight: 240, overflowY: 'auto',
                  }}>
                    {tagSuggestions.length === 0 && !tagInput.trim() && (
                      <div className="px-3 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                        All tags assigned
                      </div>
                    )}
                    {tagSuggestions.map(tag => (
                      <button key={tag.id} onMouseDown={() => handleSelectTag(tag)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-subtle)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color || '#6366f1', flexShrink: 0 }} />
                        {tag.name}
                        <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>{tag.usage_count} {tag.usage_count === 1 ? 'gallery' : 'galleries'}</span>
                      </button>
                    ))}
                    {tagInput.trim() && !allTags.find(t => t.name === tagInput.trim().toLowerCase()) && (
                      <button onMouseDown={() => handleCreateTag(tagInput.trim())}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', borderTop: tagSuggestions.length > 0 ? '1px solid var(--border)' : 'none' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-subtle)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        <Plus size={12} />
                        Create tag "{tagInput.trim().toLowerCase()}"
                      </button>
                    )}
                  </div>,
                  document.body
                )}
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                Type to search existing tags or press Enter to create a new one
              </p>
            </div>
          </SettingsSection>
          <SettingsSection title="Status">
            <SettingsRow label="Gallery active" description="Inactive galleries are inaccessible to clients">
              <Toggle checked={isActive} onChange={v => handleToggle(setIsActive, 'isActive', v)} />
            </SettingsRow>
          </SettingsSection>
        </div>
      )}

      {activeTab === 'access' && (
        <div className="space-y-4">
          <SettingsSection title="Password Protection" description="Require clients to enter a password before viewing the gallery">
            <SettingsRow label="Require password" description="Clients must enter a password to access">
              <Toggle checked={requirePassword} onChange={handleTogglePassword} />
            </SettingsRow>
            {requirePassword && (
              <div className="px-5 py-4 space-y-1.5" style={{ background: 'var(--surface)' }}>
                <PlainField label="Gallery password" value={password} onChange={v => setPassword(v)}
                  onRefresh={() => { const pw = generatePassword(); setPassword(pw); save({ password: pw }) }}
                  onCopy placeholder="Enter password" hint="Share this with your client so they can access the gallery." />
                {password && <Button variant="secondary" onClick={() => save()}>Save Password</Button>}
              </div>
            )}
          </SettingsSection>
          <SettingsSection title="Download PIN" description="A separate 4-digit PIN required to download images">
            <SettingsRow label="Require download PIN" description="Clients need a PIN to download">
              <Toggle checked={requireDownloadPin} onChange={handleToggleDownloadPin} />
            </SettingsRow>
            {requireDownloadPin && (
              <div className="px-5 py-4 space-y-3" style={{ background: 'var(--surface)' }}>
                <PlainField type="pin" label="Download PIN" value={downloadPin} onChange={v => setDownloadPin(v)}
                  onRefresh={() => { const pin = generatePin(); setDownloadPin(pin); save({ downloadPin: pin }) }}
                  onCopy placeholder="4-digit PIN" maxLength={4} hint="4-digit numeric PIN · Click ↺ to generate a new one" />
                {downloadPin.length === 4 && <Button variant="secondary" onClick={() => save()}>Save PIN</Button>}
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
              <>
                <SettingsRow label="Web Size downloads" description="Clients can download watermarked web-size images (2400px)">
                  <Toggle checked={downloadWatermarked} onChange={v => handleToggle(setDownloadWatermarked, 'downloadWatermarked', v)} />
                </SettingsRow>
                <SettingsRow label="High Resolution downloads" description="Clients can download clean full-resolution originals">
                  <Toggle checked={allowHiresDownload} onChange={v => handleToggle(setAllowHiresDownload, 'allowHiresDownload', v)} />
                </SettingsRow>
              </>
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

          <SettingsSection title="Gallery Guide" description="Walk clients through the gallery on their first visit">
            <SettingsRow label="Show gallery guide" description="Clients see a short tutorial the first time they open the gallery">
              <Toggle checked={showGuide} onChange={v => handleToggle(setShowGuide, 'showGuide', v)} />
            </SettingsRow>
          </SettingsSection>
          <SettingsSection title="Expiry" description="Set a gallery expiry date and optionally notify viewers before it expires">
            <div className="px-5 py-4" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
              <Input label="Expiry date" value={expiresAt} onChange={setExpiresAt} onBlur={() => save()} type="date" hint="Gallery automatically deactivates after this date. Leave blank for no expiry." />
            </div>
            {expiresAt && <>
            <SettingsRow label="Send expiry warning email" description="Notify viewers before the gallery expires">
              <Toggle checked={expiryWarningEnabled} onChange={v => handleToggle(setExpiryWarningEnabled, 'expiryWarningEnabled', v)} />
            </SettingsRow>
            {expiryWarningEnabled && (
              <div className="px-4 py-3" style={{ background: 'var(--surface)' }}>
                <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text)' }}>Send warning</label>
                <select
                  value={expiryWarningDays}
                  onChange={e => { setExpiryWarningDays(Number(e.target.value)); save({ expiryWarningDays: Number(e.target.value) }) }}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  {[1, 3, 7, 14, 30].map(d => (
                    <option key={d} value={d}>{d} day{d !== 1 ? 's' : ''} before expiry date</option>
                  ))}
                </select>
              </div>
            )}
            </>}
          </SettingsSection>
        </div>
      )}

      {activeTab === 'display' && (
        <div className="space-y-4">
          <SettingsSection title="Color Theme" description="Background and accent colors for the client gallery">
            <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ background: 'var(--surface)' }}>
              {THEMES.map(t => (
                <button key={t.id} onClick={() => { setThemeColor(t.id); save({ themeColor: t.id }) }}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all"
                  style={{
                    cursor: 'pointer',
                    border: themeColor === t.id ? '2px solid #6366f1' : '2px solid var(--border)',
                    background: themeColor === t.id ? 'rgba(99,102,241,0.05)' : 'var(--bg-subtle)',
                  }}>
                  <div className="flex gap-1.5">
                    <div className="w-4 h-4 rounded-full border" style={{ background: t.bg, borderColor: 'var(--border)' }} />
                    <div className="w-4 h-4 rounded-full border" style={{ background: t.surface, borderColor: 'var(--border)' }} />
                    <div className="w-4 h-4 rounded-full border" style={{ background: t.accent, borderColor: 'var(--border)' }} />
                  </div>
                  <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>{t.label}</p>
                </button>
              ))}
            </div>
          </SettingsSection>

          <SettingsSection title="Grid" description="Control how images appear in the gallery">
            <div className="px-4 py-4 space-y-4" style={{ background: 'var(--surface)' }}>
              <div>
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>Thumbnail Size</p>
                <div className="grid grid-cols-2 gap-2">
                  {[{ id: 'medium', label: 'Regular', desc: '5 per row' }, { id: 'large', label: 'Large', desc: '4 per row' }].map(g => (
                    <button key={g.id} onClick={() => { setGridSize(g.id); save({ gridSize: g.id }) }}
                      className="p-3 rounded-xl text-left transition-all"
                      style={{ cursor: 'pointer', border: gridSize === g.id ? '2px solid #6366f1' : '2px solid var(--border)', background: gridSize === g.id ? 'rgba(99,102,241,0.05)' : 'var(--bg-subtle)' }}>
                      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{g.label}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{g.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>Grid Spacing</p>
                <div className="grid grid-cols-2 gap-2">
                  {[{ id: 'tight', label: 'Tight', desc: 'Minimal gaps' }, { id: 'large', label: 'Spacious', desc: 'Larger gaps' }].map(g => (
                    <button key={g.id} onClick={() => { setGridSpacing(g.id); save({ gridSpacing: g.id }) }}
                      className="p-3 rounded-xl text-left transition-all"
                      style={{ cursor: 'pointer', border: gridSpacing === g.id ? '2px solid #6366f1' : '2px solid var(--border)', background: gridSpacing === g.id ? 'rgba(99,102,241,0.05)' : 'var(--bg-subtle)' }}>
                      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{g.label}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{g.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </SettingsSection>

        </div>
      )}

      {activeTab === 'danger' && (
        <div className="space-y-4">
          <SettingsSection title="Delete Gallery">
            {!confirmDelete ? (
              <div className="flex items-center justify-between gap-4 p-4 rounded-xl"
                style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Delete this gallery</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Permanently deletes the gallery and all its images. Cannot be undone.</p>
                </div>
                <Button variant="danger" onClick={() => setConfirmDelete(true)}><Trash2 size={14} />Delete</Button>
              </div>
            ) : (
              <div className="p-4 rounded-xl space-y-3"
                style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>
                  Are you sure? This will permanently delete &ldquo;{gallery.title}&rdquo; and all its images.
                </p>
                <div className="flex gap-2">
                  <Button variant="danger" onClick={handleDeleteGallery} disabled={deleting}>
                    <Trash2 size={14} />{deleting ? 'Deleting...' : 'Yes, delete permanently'}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </SettingsSection>
        </div>
      )}

      <SaveIndicator state={saveState} />
    </div>
  )
}
