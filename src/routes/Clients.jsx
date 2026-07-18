import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, User, Mail, Phone, Tag, X, ChevronRight } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import { getClients, createClient, deleteClient, getAllTags as fetchAllTags } from '../utils/crmApi.js'
import TagInput from '../components/ui/TagInput.jsx'
import AddressAutocomplete from '../components/ui/AddressAutocomplete.jsx'
import Button from '../components/ui/Button.jsx'
import Toast from '../components/ui/Toast.jsx'
import { formatPhone } from '../utils/formatters.js'
import Input from '../components/ui/Input.jsx'
import BottomSheet from '../components/layout/BottomSheet.jsx'
import Modal from '../components/ui/Modal.jsx'

const CONTRACT_STATUS_BADGE = {
  draft:                 { label: 'Draft',            bg: 'var(--surface-raised)',  color: 'var(--text-muted)' },
  sent:                  { label: 'Awaiting Signature', bg: 'var(--warning-subtle)', color: 'var(--warning)' },
  pending_photographer:  { label: 'Needs Counter-Sign', bg: '#fef3c7',               color: '#d97706' },
  signed:                { label: 'Signed',            bg: 'var(--success-subtle)', color: 'var(--success)' },
  void:                  { label: 'Void',              bg: 'var(--danger-subtle)',  color: 'var(--danger)' },
}

function ClientFormWrapper({ onClose, children, footer }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} maxHeight="92vh">
        <div className="flex items-center px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>New Client</h2>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </BottomSheet>
    )
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg flex flex-col rounded-2xl shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>New Client</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </div>
    </div>
  )
}

function ClientFormModal({ onClose, onSaved, existingTags = [] }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    address: '', city: '', state: '', zip: '', notes: '', tags: [], pronouns: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('First and last name are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const tags = Array.isArray(form.tags) ? form.tags : form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : []
      const client = await createClient({ ...form, tags, pronouns: form.pronouns || null })
      onSaved(client)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)',
    color: 'var(--text)', borderRadius: '8px', padding: '9px 12px',
    fontSize: '14px', outline: 'none',
  }

  return (
    <ClientFormWrapper onClose={onClose} footer={
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
        <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg"
          style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
          Cancel
        </button>
        <Button onClick={handleSubmit} disabled={saving || !form.firstName.trim() || !form.lastName.trim()}>
          {saving ? 'Saving...' : 'Create Client'}
        </Button>
      </div>
    }>
          <div className="space-y-4">
            {error && (
              <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--danger-subtle)', color: 'var(--danger)' }}>
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>First name <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                  placeholder="Jane" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Last name <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                  placeholder="Smith" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>
            </div>


            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Pronouns</label>
              <select value={form.pronouns || ""} onChange={e => setForm(f => ({ ...f, pronouns: e.target.value }))}
                style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="">Select pronouns (optional)</option>
                <option value="she/her">she/her</option>
                <option value="he/him">he/him</option>
                <option value="they/them">they/them</option>
                <option value="she/they">she/they</option>
                <option value="he/they">he/they</option>
                <option value="ze/hir">ze/hir</option>
                <option value="xe/xem">xe/xem</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Email</label>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="jane@example.com" type="email" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Phone</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="(555) 000-0000" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Address</label>
              <AddressAutocomplete
                value={form.address}
                onChange={val => setForm(f => ({ ...f, address: val }))}
                onSelect={({ address, city, state, zip }) => setForm(f => ({
                  ...f, address, city: city || f.city, state: state || f.state, zip: zip || f.zip,
                }))}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-1">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>City</label>
                <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  placeholder="Indianapolis" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>State</label>
                <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                  placeholder="IN" maxLength={2} style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>ZIP</label>
                <input value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))}
                  placeholder="46201" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Tags</label>
              <TagInput
                value={Array.isArray(form.tags) ? form.tags : form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : []}
                onChange={tags => setForm(f => ({ ...f, tags }))}
                allTags={existingTags}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Internal notes — not visible to client" rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
                onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'} />
            </div>
          </div>
    </ClientFormWrapper>
  )
}


function ClientAvatar({ client, size = 10 }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!client.avatar_r2_key) return
    import('../utils/crmApi.js').then(({ getClientAvatarUrl }) => {
      import('../supabaseClient.js').then(({ supabase }) => {
        supabase.auth.getSession().then(({ data: { session } }) => {
          getClientAvatarUrl(client.avatar_r2_key, session?.access_token).then(setUrl)
        })
      })
    })
  }, [client.avatar_r2_key])

  const sizeClass = `w-${size} h-${size}`
  if (url) return <img src={url} alt={client.first_name} className={`${sizeClass} rounded-full object-cover flex-shrink-0`} />
  return (
    <div className={`${sizeClass} rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0`}
      style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}>
      {(client.first_name?.[0] || "").toUpperCase()}{(client.last_name?.[0] || "").toUpperCase()}
    </div>
  )
}

export default function Clients() {
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [existingTags, setExistingTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState([])
  const [showNewModal, setShowNewModal] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await getClients()
      setClients(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleClientSaved(client) {
    setClients(prev => [client, ...prev].sort((a, b) =>
      a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)
    ))
    setShowNewModal(false)
    setToast({ message: `${client.first_name} ${client.last_name} added`, type: 'success' })
  }

  // Collect all unique tags across all clients for the filter dropdown
  const allTags = [...new Set(clients.flatMap(c => c.tags ?? []))].sort()

  const filtered = clients.filter(c => {
    const fullName = `${c.first_name} ${c.last_name}`.toLowerCase()
    const matchesSearch = !search.trim() ||
      fullName.includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search)
    const matchesTag = !tagFilter.length || tagFilter.every(t => (c.tags ?? []).includes(t))
    return matchesSearch && matchesTag
  })

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        title="Clients"
        subtitle={`${clients.length} ${clients.length === 1 ? 'client' : 'clients'}`}
        search={clients.length > 0 ? { value: search, onChange: setSearch, placeholder: 'Search clients...' } : undefined}
        filterSections={clients.length > 0 && allTags.length > 0 ? [{
          key: 'tags', label: 'Tags', type: 'multiSelect',
          value: tagFilter, onChange: setTagFilter,
          options: allTags.map(t => ({ value: t, label: t })),
        }] : undefined}
        onClearAllFilters={() => { setSearch(''); setTagFilter([]) }}
        primaryAction={{ label: 'New Client', icon: Plus, onClick: () => setShowNewModal(true) }}
      />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--danger-subtle)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
          Failed to load clients: {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && clients.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--surface-raised)' }}>
            <User size={22} style={{ color: 'var(--text-muted)' }} />
          </div>
          <h2 className="font-medium mb-1" style={{ color: 'var(--text)' }}>No clients yet</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Add your first client to get started</p>
          <Button onClick={() => setShowNewModal(true)}>
            <Plus size={15} />New Client
          </Button>
        </div>
      )}

      {/* No search results */}
      {!loading && !error && clients.length > 0 && filtered.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No clients match your search.</p>
          <button onClick={() => { setSearch(''); setTagFilter('') }}
            className="text-sm mt-2" style={{ color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer' }}>
            Clear filters
          </button>
        </div>
      )}

      {/* Client list */}
      {!loading && !error && filtered.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {filtered.map((client, i) => (
            <button
              key={client.id}
              onClick={() => navigate(`/clients/${client.id}`)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
              style={{
                background: 'var(--surface)',
                borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
            >
              {/* Avatar */}
              <ClientAvatar client={client} size={9} />

              {/* Name + meta */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>
                    {client.first_name} {client.last_name}
                  </p>
                  {client.pronouns && client.pronouns !== 'Prefer not to say' && (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{client.pronouns}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 min-w-0">
                  {client.email && (
                    <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <Mail size={11} />{client.email}
                    </span>
                  )}
                  {client.phone && (
                    <span className="hidden md:flex text-xs items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <Phone size={11} />{formatPhone(client.phone)}
                    </span>
                  )}
                </div>
              </div>

              {/* Tags */}
              {client.tags?.length > 0 && (
                <div className="hidden md:flex items-center gap-1.5 flex-wrap">
                  {client.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="px-2 py-0.5 rounded-md text-xs"
                      style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)' }}>
                      {tag}
                    </span>
                  ))}
                  {client.tags.length > 3 && (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>+{client.tags.length - 3}</span>
                  )}
                </div>
              )}

              <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}

      {showNewModal && (
        <ClientFormModal
          existingTags={allTags}
          onClose={() => setShowNewModal(false)}
          onSaved={handleClientSaved}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        </div>
      )}
    </div>
  )
}
