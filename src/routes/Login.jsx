import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import LoginScreen from '../components/auth/LoginScreen.jsx'

export default function Login({ isPasswordRecovery, onPasswordUpdated }) {
  const navigate = useNavigate()

  const handleLogin = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const handleRegister = async (email, password, { firstName, lastName }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName, last_name: lastName } }
    })
    if (error) throw error
    return { needsEmailConfirmation: !data.session }
  }

  const handleResetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`
    })
    if (error) throw error
  }

  const handleUpdatePassword = async (password) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
    onPasswordUpdated?.()
    navigate('/')
  }

  return (
    <LoginScreen
      onLogin={handleLogin}
      onRegister={handleRegister}
      onResetPassword={handleResetPassword}
      onUpdatePassword={handleUpdatePassword}
      isPasswordRecovery={isPasswordRecovery}
    />
  )
}
