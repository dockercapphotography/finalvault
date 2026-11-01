import { useEffect, useState } from 'react'
import { getPortalData } from '../utils/clientApi.js'

// Loads the Client Portal payload for a token (getPortalData keeps its own
// 30s cache) and reports which screen to show:
//   status: 'loading' | 'gate' | 'notFound' | 'ready'
// unlock(result) is PortalPasswordGate's onUnlock.
// Used by the v1.6.0 Invoices pages; the older portal pages still carry
// their own copy of this logic.
export function usePortalData(token) {
  const [state, setState] = useState({ token: null, status: 'loading', data: null, gateResult: null })

  useEffect(() => {
    let cancelled = false
    getPortalData(token)
      .then(result => {
        if (cancelled) return
        if (result?.password_required) setState({ token, status: 'gate', data: null, gateResult: result })
        else if (!result) setState({ token, status: 'notFound', data: null, gateResult: null })
        else setState({ token, status: 'ready', data: result, gateResult: null })
      })
      .catch(() => { if (!cancelled) setState({ token, status: 'notFound', data: null, gateResult: null }) })
    return () => { cancelled = true }
  }, [token])

  const current = state.token === token ? state : { token, status: 'loading', data: null, gateResult: null }
  return {
    ...current,
    unlock: result => setState({ token, status: 'ready', data: result, gateResult: null }),
  }
}
