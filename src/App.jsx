import { useEffect, useState, useRef } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient.js'

import Dashboard from './routes/Dashboard.jsx'
import GalleryNew from './routes/GalleryNew.jsx'
import GalleryDetail from './routes/GalleryDetail.jsx'
import GallerySettings from './routes/GallerySettings.jsx'
import GalleryActivity from './routes/GalleryActivity.jsx'
import Account from './routes/Account.jsx'
import Bookmarked from './routes/Bookmarked.jsx'
import Clients from './routes/Clients.jsx'
import ClientDetail from './routes/ClientDetail.jsx'
import ContractDetail from './routes/ContractDetail.jsx'
import Sessions from './routes/Sessions.jsx'
import SubmitForm from './routes/SubmitForm.jsx'
import SessionDetail from './routes/SessionDetail.jsx'
import Admin from './routes/Admin.jsx'
import ClientGallery from './routes/ClientGallery.jsx'
import ClientGalleryView from './routes/ClientGalleryView.jsx'
import Login from './routes/Login.jsx'
import PrivacyPolicy from './routes/PrivacyPolicy.jsx'
import SignContract from './routes/SignContract.jsx'
import TermsOfService from './routes/TermsOfService.jsx'
import PageWrapper from './components/layout/PageWrapper.jsx'

const RECOVERY_KEY = 'fv-password-recovery'

function ProtectedRoute({ session, children }) {
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const [session, setSession] = useState(undefined)
  // Read recovery flag from sessionStorage on mount — survives the location.replace reload
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(
    () => sessionStorage.getItem(RECOVERY_KEY) === 'true'
  )

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        sessionStorage.setItem(RECOVERY_KEY, 'true')
        setIsPasswordRecovery(true)
        setSession(session)
        window.location.replace('/login')
        return
      }
      if (event === 'USER_UPDATED') {
        sessionStorage.removeItem(RECOVERY_KEY)
        setIsPasswordRecovery(false)
      }
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('fv-theme') || 'light'
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  if (session === undefined) return null

  return (
    <Routes>
      <Route path="/login" element={
        session && !isPasswordRecovery
          ? <Navigate to="/" replace />
          : <Login isPasswordRecovery={isPasswordRecovery} onPasswordUpdated={() => {
              sessionStorage.removeItem(RECOVERY_KEY)
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
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/g/:token" element={<ClientGallery />} />
      <Route path="/g/:token/view" element={<ClientGalleryView />} />

      <Route path="/sign/:token" element={<SignContract />} />
      <Route path="/submit/:token" element={<SubmitForm />} />
      <Route path="/clients" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}><Clients /></PageWrapper>
        </ProtectedRoute>
      } />
      <Route path="/clients/:id" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}><ClientDetail /></PageWrapper>
        </ProtectedRoute>
      } />
      <Route path="/contracts/:id" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}><ContractDetail /></PageWrapper>
        </ProtectedRoute>
      } />
      <Route path="/sessions" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}><Sessions /></PageWrapper>
        </ProtectedRoute>
      } />
      <Route path="/sessions/:id" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}><SessionDetail /></PageWrapper>
        </ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
