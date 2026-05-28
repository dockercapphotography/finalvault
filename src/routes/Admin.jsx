import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Database, Shield, ChevronDown, Check, X, Plus, Pencil } from 'lucide-react'
import { supabase } from '../supabaseClient.js'
import Badge from '../components/ui/Badge.jsx'
import Toast from '../components/ui/Toast.jsx'
import { formatDate } from '../utils/formatters.js'

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const gb = bytes / (1024 ** 3)
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / (1024 ** 2)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

const selectStyle = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderRadius: '8px',
  padding: '9px 12px',
  fontSize: '14px',
  outline: 'none',
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: '36px',
}

// ── Tier Modal ────────────────────────────────────────────────────────────────

function TierModal({ tier, onSave, onClose }) {
  const [name, setName] = useState(tier?.name || '')
  const [storageGb, setStorageGb] = useState(tier?.storage_gb || 2)
  const [priceMonthly, setPriceMonthly] = useState(tier?.price_monthly || 0)
  const [saving, setSaving] = useState(false)
  const isEdit = !!tier?.id

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({ id: tier?.id, name: name.trim(), storage_gb: Number(storageGb), price_monthly: Number(priceMonthly) })
      onClose()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold" style={{ color: 'var(--text)' }}>
            {isEdit ? 'Edit Tier' : 'New Tier'}
          </h3>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          {[
            { label: 'Tier Name', value: name, onChange: setName, type: 'text', placeholder: 'e.g. Pro' },
            { label: 'Storage (GB)', value: storageGb, onChange: setStorageGb, type: 'number', placeholder: '50' },
            { label: 'Price / Month ($)', value: priceMonthly, onChange: setPriceMonthly, type: 'number', placeholder: '10' },
          ].map(f => (
            <div key={f.label}>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>{f.label}</label>
              <input
                type={f.type}
                value={f.value}
                onChange={e => f.onChange(e.target.value)}
                placeholder={f.placeholder}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
              />
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex-1 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#6366f1', color: '#fff', opacity: !name.trim() || saving ? 0.5 : 1, cursor: !name.trim() || saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Tier'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm"
            style={{ background: 'var(--surface-raised)', color: 'var(--text)', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Admin ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'users', label: 'Users', icon: Users },
  { id: 'tiers', label: 'Storage Tiers', icon: Database },
]

export default function Admin() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('users')
  const [photographers, setPhotographers] = useState([])
  const [tiers, setTiers] = useState([])
  const [storage, setStorage] = useState({})
  const [galleryCounts, setGalleryCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [toast, setToast] = useState(null)
  const [tierModal, setTierModal] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/login'); return }

      const { data: self } = await supabase
        .from('photographers')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      if (!self?.is_admin) { navigate('/'); return }
      setIsAdmin(true)

      const [{ data: photogs }, { data: tierRows }, { data: storageRows }, { data: galleryRows }, { data: imageRows }] = await Promise.all([
        supabase.from('photographers').select('id, display_name, created_at, is_admin'),
        supabase.from('storage_tiers').select('*').order('storage_gb'),
        supabase.from('photographer_storage').select('*'),
        supabase.from('galleries').select('id, photographer_id'),
        supabase.from('gallery_images').select('gallery_id, file_size').is('deleted_at', null),
      ])

      setPhotographers(photogs || [])
      setTiers(tierRows || [])

      const galleryToPhotog = {}
      const countMap = {}
      for (const g of galleryRows || []) {
        galleryToPhotog[g.id] = g.photographer_id
        countMap[g.photographer_id] = (countMap[g.photographer_id] || 0) + 1
      }
      setGalleryCounts(countMap)

      const bytesMap = {}
      for (const img of imageRows || []) {
        const pid = galleryToPhotog[img.gallery_id]
        if (pid) bytesMap[pid] = (bytesMap[pid] || 0) + (img.file_size || 0)
      }

      const storageMap = {}
      for (const s of storageRows || []) {
        storageMap[s.photographer_id] = { ...s, bytes_used: bytesMap[s.photographer_id] || s.bytes_used || 0 }
      }
      for (const pid of Object.keys(bytesMap)) {
        if (!storageMap[pid]) storageMap[pid] = { photographer_id: pid, bytes_used: bytesMap[pid], tier_id: null }
      }
      setStorage(storageMap)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleAdmin(photographer) {
    try {
      await supabase.from('photographers')
        .update({ is_admin: !photographer.is_admin })
        .eq('id', photographer.id)
      setPhotographers(prev => prev.map(p =>
        p.id === photographer.id ? { ...p, is_admin: !p.is_admin } : p
      ))
      setToast({ message: `${photographer.display_name || 'User'} admin status updated`, type: 'success' })
    } catch {
      setToast({ message: 'Failed to update admin status', type: 'error' })
    }
  }

  async function handleSetTier(photographerId, tierId) {
    try {
      const { error } = await supabase.rpc('admin_set_photographer_tier', {
        p_photographer_id: photographerId,
        p_tier_id: tierId || null,
      })
      if (error) throw error
      setStorage(prev => ({
        ...prev,
        [photographerId]: { ...(prev[photographerId] || {}), photographer_id: photographerId, tier_id: tierId || null }
      }))
      setToast({ message: 'Tier updated', type: 'success' })
    } catch (err) {
      setToast({ message: 'Failed to update tier', type: 'error' })
    }
  }

  async function handleSaveTier({ id, name, storage_gb, price_monthly }) {
    if (id) {
      const { data } = await supabase.from('storage_tiers')
        .update({ name, storage_gb, price_monthly })
        .eq('id', id).select().single()
      setTiers(prev => prev.map(t => t.id === id ? data : t))
      setToast({ message: 'Tier updated', type: 'success' })
    } else {
      const { data } = await supabase.from('storage_tiers')
        .insert({ name, storage_gb, price_monthly }).select().single()
      setTiers(prev => [...prev, data])
      setToast({ message: 'Tier created', type: 'success' })
    }
  }

  const filtered = photographers.filter(p =>
    !search || (p.display_name || p.id).toLowerCase().includes(search.toLowerCase())
  )

  const totalStorage = Object.values(storage).reduce((sum, s) => sum + (s.bytes_used || 0), 0)

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
    </div>
  )

  if (!isAdmin) return null

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <Shield size={20} style={{ color: '#6366f1' }} />
          Admin Panel
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Manage users, storage tiers, and platform settings
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Photographers', value: photographers.length },
          { label: 'Total Storage Used', value: formatBytes(totalStorage) },
          { label: 'Storage Tiers', value: tiers.length },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>{s.value}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs — dropdown on mobile, buttons on desktop */}
      <div className="md:hidden">
        <select value={tab} onChange={e => setTab(e.target.value)} style={selectStyle}>
          {TABS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div className="hidden md:flex gap-2">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: tab === t.id ? '#6366f1' : 'var(--surface)',
              color: tab === t.id ? '#fff' : 'var(--text-muted)',
              border: `1px solid ${tab === t.id ? '#6366f1' : 'var(--border)'}`,
              cursor: 'pointer',
            }}>
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Users tab */}
      {tab === 'users' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users…"
              className="text-sm px-3 py-2 rounded-lg flex-1 max-w-xs"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
            />
            <p className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>{filtered.length} users</p>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No users found</div>
            ) : filtered.map((p, i) => {
              const storageRow = storage[p.id]
              const tier = tiers.find(t => t.id === storageRow?.tier_id)
              const bytesUsed = storageRow?.bytes_used || 0
              const limitBytes = tier ? tier.storage_gb * 1024 ** 3 : null
              const usagePct = limitBytes ? Math.min(100, (bytesUsed / limitBytes) * 100) : 0

              return (
                <div key={p.id} className="p-4 space-y-3 text-sm"
                  style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: 'var(--surface)' }}>

                  {/* Row 1: name + admin toggle */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate" style={{ color: 'var(--text)' }}>
                        {p.display_name || <span style={{ color: 'var(--text-muted)' }}>No name</span>}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Joined {formatDate(p.created_at)} · {galleryCounts[p.id] || 0} galleries
                      </p>
                    </div>
                    <button
                      onClick={() => handleToggleAdmin(p)}
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                      style={{
                        background: p.is_admin ? 'rgba(99,102,241,0.12)' : 'var(--surface-raised)',
                        color: p.is_admin ? '#6366f1' : 'var(--text-muted)',
                        cursor: 'pointer', border: 'none',
                      }}>
                      {p.is_admin ? <><Check size={11} /> Admin</> : 'Not admin'}
                    </button>
                  </div>

                  {/* Row 2: storage + tier */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                        {formatBytes(bytesUsed)}{limitBytes ? ` / ${tier.storage_gb}GB` : ''}
                      </p>
                      {limitBytes && (
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-raised)' }}>
                          <div className="h-full rounded-full"
                            style={{ width: `${usagePct}%`, background: usagePct > 90 ? '#ef4444' : '#6366f1' }} />
                        </div>
                      )}
                    </div>
                    <select
                      value={storageRow?.tier_id || ''}
                      onChange={e => handleSetTier(p.id, e.target.value)}
                      className="text-xs rounded-lg px-2 py-1.5 shrink-0"
                      style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', outline: 'none' }}>
                      <option value="">No tier</option>
                      {tiers.map(t => (
                        <option key={t.id} value={t.id}>{t.name} ({t.storage_gb}GB)</option>
                      ))}
                    </select>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tiers tab */}
      {tab === 'tiers' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => setTierModal({})}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: '#6366f1', color: '#fff', cursor: 'pointer' }}>
              <Plus size={14} /> New Tier
            </button>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {tiers.map((tier, i) => {
              const userCount = Object.values(storage).filter(s => s.tier_id === tier.id).length
              return (
                <div key={tier.id} className="flex items-center gap-4 px-4 py-3 text-sm"
                  style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: 'var(--surface)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium" style={{ color: 'var(--text)' }}>{tier.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {tier.storage_gb}GB · {tier.price_monthly === 0 ? 'Free' : `$${Number(tier.price_monthly).toFixed(2)}/mo`} · {userCount} users
                    </p>
                  </div>
                  <button
                    onClick={() => setTierModal(tier)}
                    className="p-1.5 rounded-lg shrink-0"
                    style={{ background: 'var(--surface-raised)', cursor: 'pointer' }}>
                    <Pencil size={13} style={{ color: 'var(--text-muted)' }} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tierModal !== null && (
        <TierModal tier={tierModal} onSave={handleSaveTier} onClose={() => setTierModal(null)} />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        </div>
      )}
    </div>
  )
}
