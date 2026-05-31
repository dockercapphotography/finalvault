import { useEffect, useState, useRef } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient.js'

import Dashboard from './routes/Dashboard.jsx'
import GalleryNew from './routes/GalleryNew.jsx'
import GalleryDetail from './routes/GalleryDetail.jsx'
import GallerySettings from './routes/GallerySettings.jsx'
import GalleryActivity from './routes/GalleryActivity.jsx'
import Account from './routes/Account.jsx'
import Bookmarked from './routes/Bookmarked.jsx'
import Admin from './routes/Admin.jsx'
import ClientGallery from './routes/ClientGallery.jsx'
import ClientGalleryView from './routes/ClientGalleryView.jsx'
import Login from './routes/Login.jsx'
import PageWrapper from './components/layout/PageWrapper.jsx'

function ProtectedRoute({ session, children }) {
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const isPasswordRecoveryRef = useRef(false)

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        isPasswordRecoveryRef.current = true
        setIsPasswordRecovery(true)
        setSession(session)
        // Force navigation to login to show the reset form
        window.location.replace('/login')
        return
      }
      if (event === 'USER_UPDATED') {
        isPasswordRecoveryRef.current = false
        setIsPasswordRecovery(false)
      }
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Load and apply saved theme
  useEffect(() => {
    const saved = localStorage.getItem('fv-theme') || 'light'
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  if (session === undefined) return null

  return (
    <Routes>
      <Route path="/login" element={
        // Always render Login — it handles its own state via isPasswordRecovery prop
        session && !isPasswordRecovery
          ? <Navigate to="/" replace />
          : <Login isPasswordRecovery={isPasswordRecovery} onPasswordUpdated={() => {
              isPasswordRecoveryRef.current = false
              setIsPasswordRecovery(false)
            }} />
      } />

      <Route path="/" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}><Dashboard /></PageWrapper>
        </ProtectedRoute>
      } />
      <Route path="/galleries/new" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}><GalleryNew /></PageWrapper>
        </ProtectedRoute>
      } />
      <Route path="/galleries/:id" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}><GalleryDetail /></PageWrapper>
        </ProtectedRoute>
      } />
      <Route path="/galleries/:id/settings" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}><GallerySettings /></PageWrapper>
        </ProtectedRoute>
      } />
      <Route path="/galleries/:id/activity" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}><GalleryActivity /></PageWrapper>
        </ProtectedRoute>
      } />
      <Route path="/bookmarked" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}><Bookmarked /></PageWrapper>
        </ProtectedRoute>
      } />
      <Route path="/account" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}><Account /></PageWrapper>
        </ProtectedRoute>
      } />
      <Route path="/admin" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}><Admin /></PageWrapper>
        </ProtectedRoute>
      } />

      <Route path="/g/:token" element={<ClientGallery />} />
      <Route path="/g/:token/view" element={<ClientGalleryView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
