import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

// Routes — Photographer (authenticated)
import Dashboard from './routes/Dashboard.jsx'
import GalleryNew from './routes/GalleryNew.jsx'
import GalleryDetail from './routes/GalleryDetail.jsx'
import GallerySettings from './routes/GallerySettings.jsx'
import GalleryActivity from './routes/GalleryActivity.jsx'
import Account from './routes/Account.jsx'
import Admin from './routes/Admin.jsx'

// Routes — Client (public)
import ClientGallery from './routes/ClientGallery.jsx'
import ClientGalleryView from './routes/ClientGalleryView.jsx'

// Routes — Auth
import Login from './routes/Login.jsx'

// Components
import PageWrapper from './components/layout/PageWrapper.jsx'

function ProtectedRoute({ session, children }) {
  if (!session) return <Navigate to="/login" replace />
  return children
}

function AuthRoute({ session, children }) {
  if (session) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Still resolving session — avoid flash of wrong route
  if (session === undefined) return null

  return (
    <Routes>
      {/* Auth */}
      <Route path="/login" element={
        <AuthRoute session={session}>
          <Login />
        </AuthRoute>
      } />

      {/* Photographer dashboard — protected */}
      <Route path="/" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}>
            <Dashboard />
          </PageWrapper>
        </ProtectedRoute>
      } />
      <Route path="/galleries/new" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}>
            <GalleryNew />
          </PageWrapper>
        </ProtectedRoute>
      } />
      <Route path="/galleries/:id" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}>
            <GalleryDetail />
          </PageWrapper>
        </ProtectedRoute>
      } />
      <Route path="/galleries/:id/settings" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}>
            <GallerySettings />
          </PageWrapper>
        </ProtectedRoute>
      } />
      <Route path="/galleries/:id/activity" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}>
            <GalleryActivity />
          </PageWrapper>
        </ProtectedRoute>
      } />
      <Route path="/account" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}>
            <Account />
          </PageWrapper>
        </ProtectedRoute>
      } />
      <Route path="/admin" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}>
            <Admin />
          </PageWrapper>
        </ProtectedRoute>
      } />

      {/* Client gallery — fully public */}
      <Route path="/g/:token" element={<ClientGallery />} />
      <Route path="/g/:token/view" element={<ClientGalleryView />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
