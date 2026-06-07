import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, User, Mail, Phone, Tag, X, ChevronRight } from 'lucide-react'
import { getClients, createClient, deleteClient } from '../utils/crmApi.js'
import Button from '../components/ui/Button.jsx'
import Toast from '../components/ui/Toast.jsx'
import { formatPhone } from '../utils/formatters.js'
import Input from '../components/ui/Input.jsx'

const CONTRACT_STATUS_BADGE = {
  draft:                 { label: 'Draft',            bg: 'var(--surface-raised)',  color: 'var(--text-muted)' },
  sent:                  { label: 'Awaiting Signature', bg: 'var(--warning-subtle)', color: 'var(--warning)' },
  pending_photographer:  { label: 'Needs Counter-Sign', bg: '#fef3c7',               color: '#d97706' },
  signed:                { label: 'Signed',            bg: 'var(--success-subtle)', color: 'var(--success)' },
  void:                  { label: 'Void',              bg: 'var(--danger-subtle)',  color: 'var(--danger)' },
}

function ClientFormModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    address: '', city: '', state: '', zip: '', notes: '', tags: '',
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
      const tags = form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : []
      const client = await createClient({ ...form, tags })
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
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full" style={{ transform: 'translate(-50%, -50%)', maxWidth: 520, padding: '0 16px' }}>
        <div className="rounded-2xl shadow-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>New Client</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4 overflow-y-auto" style={{ maxHeight: '70vh' }}>
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
              <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="123 Main St" style={inputStyle}
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
              <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="wedding, portrait, commercial (comma-separated)" style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Separate multiple tags with commas</p>
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

          <div className="px-6 py-4 flex items-center justify-end gap-3" style={{ borderTop: '1px solid var(--border)' }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.firstName.trim() || !form.lastName.trim()}>
              {saving ? 'Saving...' : 'Create Client'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

export default function Clients() {
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
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
    const matchesTag = !tagFilter || (c.tags ?? []).includes(tagFilter)
    return matchesSearch && matchesTag
  })

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Clients</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {clients.length} {clients.length === 1 ? 'client' : 'clients'}
          </p>
        </div>
        <Button onClick={() => setShowNewModal(true)}>
          <Plus size={15} />New Client
        </Button>
      </div>

      {/* Search + tag filter */}
      {clients.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1" style={{ minWidth: 200 }}>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients..."
              className="w-full text-sm pl-9 pr-4 py-2 rounded-lg outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>
          {allTags.length > 0 && (
            <div className="relative">
              <Tag size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <select
                value={tagFilter}
                onChange={e => setTagFilter(e.target.value)}
                className="text-sm pl-8 pr-8 py-2 rounded-lg outline-none appearance-none"
                style={{
                  background: tagFilter ? '#6366f1' : 'var(--surface)',
                  border: `1px solid ${tagFilter ? '#6366f1' : 'var(--border)'}`,
                  color: tagFilter ? '#fff' : 'var(--text)',
                  cursor: 'pointer',
                }}>
                <option value="">All tags</option>
                {allTags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {tagFilter && (
                <button onClick={() => setTagFilter('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex' }}>
                  <X size={12} />
                </button>
              )}
            </div>
          )}
          {(search || tagFilter) && (
            <button onClick={() => { setSearch(''); setTagFilter('') }}
              className="text-xs" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Clear
            </button>
          )}
        </div>
      )}

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
              className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors"
              style={{
                background: 'var(--surface)',
                borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                cursor: 'pointer',
                border: i > 0 ? '1px solid var(--border)' : 'none',
                borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
            >
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
                {client.first_name[0]}{client.last_name[0]}
              </div>

              {/* Name + meta */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>
                  {client.first_name} {client.last_name}
                </p>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {client.email && (
                    <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <Mail size={11} />{client.email}
                    </span>
                  )}
                  {client.phone && (
                    <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
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
