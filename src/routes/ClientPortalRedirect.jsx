import { useParams, Navigate } from 'react-router-dom'

// A bare /client/:token link (the canonical shareable form) has no section
// in the URL, so it doesn't match any of the /client/:token/<section>
// routes directly. This redirects to Galleries as the default landing
// section -- keeping "/client/:token" the link a photographer can safely
// paste anywhere, independent of whichever section happens to be the
// default today.
export default function ClientPortalRedirect() {
  const { token } = useParams()
  return <Navigate to={`/client/${token}/galleries`} replace />
}
