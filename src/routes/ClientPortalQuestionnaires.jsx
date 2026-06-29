import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { ClipboardList, ChevronRight } from 'lucide-react'
import { getPortalData } from '../utils/clientApi.js'
import ClientPortalLayout from '../components/layout/ClientPortalLayout.jsx'

function QuestionnaireRow({ questionnaire }) {
  return (
    <a
      href={`/submit/${questionnaire.submit_token}?q=${questionnaire.questionnaire_id}`}
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ border: '1px solid var(--border)', textDecoration: 'none' }}
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(99,102,241,0.08)' }}>
        <ClipboardList size={16} style={{ color: '#6366f1' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{questionnaire.questionnaire_name}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{questionnaire.session_name}</p>
      </div>
      <ChevronRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    </a>
  )
}

export default function ClientPortalQuestionnaires() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    load()
  }, [token])

  async function load() {
    setLoading(true)
    setNotFound(false)
    try {
      const result = await getPortalData(token)
      if (!result) {
        setNotFound(true)
        return
      }
      setData(result)
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
        <div className="text-center max-w-sm">
          <p className="text-base font-medium" style={{ color: 'var(--text)' }}>This link isn't valid</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            The link may have been regenerated. Contact your photographer for an updated link.
          </p>
        </div>
      </div>
    )
  }

  if (loading || !data) {
    return (
      <ClientPortalLayout token={token} hasQuestionnaires={true} pendingContracts={0} pendingQuestionnaires={0}>
        <div className="flex items-center justify-center py-24">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
        </div>
      </ClientPortalLayout>
    )
  }

  const questionnaires = data.pending_questionnaires || []
  const pendingContracts = (data.contracts || []).filter(c => c.status !== 'signed')

  return (
    <ClientPortalLayout
      token={token}
      hasQuestionnaires={true}
      pendingContracts={pendingContracts.length}
      pendingQuestionnaires={questionnaires.length}
    >
      <div className="space-y-5" style={{ maxWidth: 1100 }}>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Questionnaires</h1>

        {questionnaires.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardList size={28} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Nothing outstanding</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              You're all caught up -- completed questionnaires don't stay listed here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {questionnaires.map(q => <QuestionnaireRow key={q.session_id} questionnaire={q} />)}
          </div>
        )}
      </div>
    </ClientPortalLayout>
  )
}
