import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Mail, Phone, MapPin, Tag, FileText, ExternalLink,
  Pencil, Trash2, X, Plus, FilePlus, Clock, CheckCircle,
  AlertCircle, Ban, Send
} from 'lucide-react'
import { getClient, updateClient, deleteClient, getClientGalleries, getContracts } from '../utils/crmApi.js'
import { formatDate, formatPhone } from '../utils/formatters.js'
import Button from '../components/ui/Button.jsx'
import Badge from '../components/ui/Badge.jsx'
import Toast from '../components/ui/Toast.jsx'
import PageBreadcrumb from '../components/ui/PageBreadcrumb.jsx'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

const CONTRACT_STATUS_CONFIG = {
  draft:                { label: 'Draft',              variant: 'default',  Icon: FileText },
  sent:                 { label: 'Awaiting Signature', variant: 'warning',  Icon: Send },
  pending_photographer: { label: 'Needs Counter-Sign', variant: 'warning',  Icon: AlertCircle },
  signed:               { label: 'Signed',             variant: 'success',  Icon: CheckCircle },
  void:                 { label: 'Void',               variant: 'danger',   Icon: Ban },
}

function EditClientModal({ client, onClose, onSaved }) {
  const [form, setForm] = useState({
    firstName: client.first_name,
    lastName: client.last_name,
    email: client.email || '',
    phone: client.phone || '',
    address: client.address || '',
    city: client.city || '',
    state: client.state || '',
    zip: client.zip || '',
    notes: client.notes || '',
    tags: (client.tags ?? []).join(', '),
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
      const updated = await updateClient(client.id, { ...form, tags })
      onSaved(updated)
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
  const focus = e => e.target.style.borderColor = 'var(--border-strong)'
  const blur  = e => e.target.style.borderColor = 'var(--border)'

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full" style={{ transform: 'translate(-50%, -50%)', maxWidth: 520, padding: '0 16px' }}>
        <div className="rounded-2xl shadow-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Edit Client</h2>
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
                <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} style={inputStyle} onFocus={focus} onBlur={blur} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Last name <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} style={inputStyle} onFocus={focus} onBlur={blur} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Email</label>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" style={inputStyle} onFocus={focus} onBlur={blur} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Phone</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inputStyle} onFocus={focus} onBlur={blur} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Address</label>
              <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} style={inputStyle} onFocus={focus} onBlur={blur} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-1">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>City</label>
                <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} style={inputStyle} onFocus={focus} onBlur={blur} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>State</label>
                <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} maxLength={2} style={inputStyle} onFocus={focus} onBlur={blur} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>ZIP</label>
                <input value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} style={inputStyle} onFocus={focus} onBlur={blur} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Tags</label>
              <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="wedding, portrait (comma-separated)" style={inputStyle} onFocus={focus} onBlur={blur} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3} style={{ ...inputStyle, resize: 'vertical' }} onFocus={focus} onBlur={blur} />
            </div>
          </div>

          <div className="px-6 py-4 flex items-center justify-end gap-3" style={{ borderTop: '1px solid var(--border)' }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.firstName.trim() || !form.lastName.trim()}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

function GalleryRow({ gallery }) {
  const coverKey = gallery.cover_r2_key || gallery.gallery_images?.preview_r2_key
  const isActive = gallery.is_active
  return (
    <Link
      to={`/galleries/${gallery.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors"
      style={{ textDecoration: 'none' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Thumbnail */}
      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0"
        style={{ background: 'var(--surface-raised)' }}>
        {coverKey ? (
          <img
            src={`${WORKER_URL}/preview/${encodeURIComponent(coverKey)}?share_token=${gallery.share_token}`}
            alt={gallery.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FileText size={14} style={{ color: 'var(--text-muted)' }} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{gallery.title}</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {gallery.event_date ? formatDate(gallery.event_date) : formatDate(gallery.created_at)}
          {gallery.event_name && ` · ${gallery.event_name}`}
        </p>
      </div>
      <Badge variant={isActive ? 'success' : 'default'}>{isActive ? 'Active' : 'Inactive'}</Badge>
      <ExternalLink size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    </Link>
  )
}

function ContractRow({ contract, onClick }) {
  const cfg = CONTRACT_STATUS_CONFIG[contract.status] || CONTRACT_STATUS_CONFIG.draft
  const { Icon } = cfg
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
      style={{ background: 'none', border: 'none', cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--surface-raised)' }}>
        <Icon size={14} style={{ color: 'var(--text-muted)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{contract.title}</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {contract.sent_at ? `Sent ${formatDate(contract.sent_at)}` : `Created ${formatDate(contract.created_at)}`}
          {contract.galleries?.title && ` · ${contract.galleries.title}`}
        </p>
      </div>
      <Badge variant={cfg.variant}>{cfg.label}</Badge>
    </button>
  )
}

export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [galleries, setGalleries] = useState([])
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showEdit, setShowEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    load()
  }, [id])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [c, g, cx] = await Promise.all([
        getClient(id),
        getClientGalleries(id),
        getContracts({ clientId: id }),
      ])
      setClient(c)
      setGalleries(g)
      setContracts(cx)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteClient(id)
      navigate('/clients')
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (error || !client) {
    return (
      <div className="max-w-2xl space-y-4">
        <button onClick={() => navigate('/clients')} className="flex items-center gap-2 text-sm"
          style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
          <ArrowLeft size={16} />Back to Clients
        </button>
        <div className="px-4 py-3 rounded-xl text-sm"
          style={{ background: 'var(--danger-subtle)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
          {error || 'Client not found.'}
        </div>
      </div>
    )
  }

  const fullName = `${client.first_name} ${client.last_name}`
  const location = [client.city, client.state].filter(Boolean).join(', ')

  return (
    <div className="max-w-3xl space-y-6">
      {/* Breadcrumb — desktop */}
      <div className="hidden md:block">
        <PageBreadcrumb crumbs={[
          { label: 'Clients', to: '/clients' },
          { label: fullName },
        ]} />
      </div>

      {/* Mobile back button */}
      <button onClick={() => navigate('/clients')}
        className="flex items-center gap-2 text-sm md:hidden"
        style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
        <ArrowLeft size={16} />Clients
      </button>

      {/* Header card */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="px-6 py-5">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-xl font-bold"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
              {client.first_name[0]}{client.last_name[0]}
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>{fullName}</h1>
              <div className="flex items-center gap-4 mt-1 flex-wrap">
                {client.email && (
                  <a href={`mailto:${client.email}`} className="text-sm flex items-center gap-1.5"
                    style={{ color: '#6366f1', textDecoration: 'none' }}>
                    <Mail size={13} />{client.email}
                  </a>
                )}
                {client.phone && (
                  <a href={`tel:${formatPhone(client.phone)}`} className="text-sm flex items-center gap-1.5"
                    style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                    <Phone size={13} />{formatPhone(client.phone)}
                  </a>
                )}
                {location && (
                  <span className="text-sm flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <MapPin size={13} />{location}
                  </span>
                )}
              </div>
              {client.tags?.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <Tag size={12} style={{ color: 'var(--text-muted)' }} />
                  {client.tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 rounded-md text-xs"
                      style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>
                <Pencil size={13} />Edit
              </Button>
            </div>
          </div>

          {/* Address */}
          {(client.address || client.zip) && (
            <div className="mt-4 pt-4 text-sm" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              {[client.address, client.city && client.state ? `${client.city}, ${client.state}` : client.city || client.state, client.zip]
                .filter(Boolean).join(' · ')}
            </div>
          )}
        </div>

        {/* Notes */}
        {client.notes && (
          <div className="px-6 py-4" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-muted)' }}>Notes</p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{client.notes}</p>
          </div>
        )}
      </div>

      {/* Galleries */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
          <div>
            <h3 className="font-medium text-sm" style={{ color: 'var(--text)' }}>Galleries</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {galleries.length} {galleries.length === 1 ? 'gallery' : 'galleries'} linked to this client
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate('/galleries/new')}>
            <Plus size={13} />New Gallery
          </Button>
        </div>

        {galleries.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No galleries linked yet.</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Link this client from Gallery Settings, or create a new gallery.
            </p>
          </div>
        ) : (
          <div style={{ background: 'var(--surface)' }}>
            {galleries.map((g, i) => (
              <div key={g.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <GalleryRow gallery={g} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contracts */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
          <div>
            <h3 className="font-medium text-sm" style={{ color: 'var(--text)' }}>Contracts</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {contracts.length} {contracts.length === 1 ? 'contract' : 'contracts'}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/clients/${id}/contracts/new`)}>
            <FilePlus size={13} />Send Contract
          </Button>
        </div>

        {contracts.length === 0 ? (
          <div className="px-5 py-8 text-center" style={{ background: 'var(--surface)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No contracts yet.</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Send a contract to get a legally binding signature from this client.
            </p>
          </div>
        ) : (
          <div style={{ background: 'var(--surface)' }}>
            {contracts.map((c, i) => (
              <div key={c.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <ContractRow
                  contract={c}
                  onClick={() => navigate(`/contracts/${c.id}`)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="px-5 py-4" style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-medium text-sm" style={{ color: 'var(--text)' }}>Danger Zone</h3>
        </div>
        <div className="px-5 py-4" style={{ background: 'var(--surface)' }}>
          {!confirmDelete ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Delete client</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Permanently removes this client record. Linked galleries and contracts are not deleted.
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={13} />Delete
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
              <p className="text-sm flex-1 font-medium" style={{ color: 'var(--danger)' }}>
                Delete {fullName}? This cannot be undone.
              </p>
              <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          )}
        </div>
      </div>

      {showEdit && (
        <EditClientModal
          client={client}
          onClose={() => setShowEdit(false)}
          onSaved={updated => {
            setClient(updated)
            setShowEdit(false)
            setToast({ message: 'Client updated', type: 'success' })
          }}
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
