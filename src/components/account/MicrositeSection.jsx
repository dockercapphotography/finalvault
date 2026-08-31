import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Globe } from 'lucide-react'
import { getMyMicrosite } from '../../utils/micrositeApi.js'
import { callManageCustomDomain } from './CustomDomainSection.jsx'
import SettingsSection from '../ui/SettingsSection.jsx'

export default function MicrositeSection() {
  const [site, setSite] = useState(undefined) // undefined = loading
  const [domain, setDomain] = useState(undefined) // undefined = loading, null = none configured

  useEffect(() => {
    getMyMicrosite().then(setSite).catch(() => setSite(null))
    callManageCustomDomain('GET').then(setDomain).catch(() => setDomain(null))
  }, [])

  const loading = site === undefined || domain === undefined
  const hasDomain = !!domain
  const enabled = !!site?.enabled

  return (
    <SettingsSection
      title="Website"
      description="A one-page website shown at the root of your custom domain."
      action={
        !loading && (
          <span
            className="text-xs font-medium"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 999,
              background: enabled ? 'var(--success-subtle)' : 'var(--bg-subtle)',
              color: enabled ? 'var(--success)' : 'var(--text-muted)',
            }}>
            {enabled ? 'Enabled' : 'Not enabled'}
          </span>
        )
      }
    >
      <div className="px-5 py-4 flex items-center justify-between gap-4" style={{ background: 'var(--surface)' }}>
        <div className="min-w-0">
          {hasDomain ? (
            <>
              <div className="flex items-center gap-2">
                <Globe size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <a href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-medium" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                  {domain.domain}
                </a>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', marginLeft: 22 }}>Your live website.</p>
            </>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Add a custom domain above to make your website live.</p>
          )}
        </div>
        {hasDomain ? (
          <Link
            to="/website"
            className="text-sm font-medium px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            Manage website
          </Link>
        ) : (
          <button
            disabled
            title="Add a custom domain first"
            className="text-sm font-medium px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'not-allowed', opacity: 0.6, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            Manage website
          </button>
        )}
      </div>
    </SettingsSection>
  )
}
