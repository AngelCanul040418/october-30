import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

function ReaderAuthPanel({ returnTo = '/library' }) {
  const [mode, setMode] = useState('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!supabase || submitting) return

    setError('')
    setMessage('')
    setSubmitting(true)

    try {
      if (mode === 'sign-up') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${returnTo}`,
          },
        })
        if (signUpError) throw signUpError

        if (!data.session) {
          setMessage('Revisa tu correo para confirmar la cuenta y después inicia sesión.')
          setMode('sign-in')
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (signInError) throw signInError
      }
    } catch (authError) {
      setError(
        mode === 'sign-up'
          ? `No se pudo crear la cuenta: ${authError.message}`
          : `No se pudo iniciar sesión: ${authError.message}`,
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="reader-auth-card" aria-labelledby="reader-auth-title">
      <div className="reader-auth-icon"><BookOpen size={23} /></div>
      <p className="book-intro-eyebrow">TU RINCONCITO DE LECTURA</p>
      <h1 id="reader-auth-title">
        {mode === 'sign-up' ? 'Crea tu cuenta' : 'Inicia sesión'}
      </h1>
      <p className="reader-auth-copy">
        Guarda los libros que te comparten y vuelve a leerlos cuando quieras.
      </p>
      <form className="reader-auth-form" onSubmit={handleSubmit}>
        <label htmlFor="reader-email">Correo electrónico</label>
        <input
          id="reader-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          disabled={submitting}
        />
        <label htmlFor="reader-password">Contraseña</label>
        <input
          id="reader-password"
          type="password"
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          disabled={submitting}
        />
        {error && <p className="error-message" role="alert">{error}</p>}
        {message && <p className="reader-auth-message" role="status">{message}</p>}
        <button className="book-intro-open" type="submit" disabled={submitting}>
          {submitting
            ? 'Un momento…'
            : mode === 'sign-up'
              ? 'Crear cuenta'
              : 'Entrar a mi biblioteca'}
        </button>
      </form>
      <p className="reader-auth-switch">
        {mode === 'sign-up' ? '¿Ya tienes cuenta?' : '¿Es tu primera visita?'}
        {' '}
        <button
          type="button"
          onClick={() => {
            setMode((currentMode) => currentMode === 'sign-up' ? 'sign-in' : 'sign-up')
            setError('')
            setMessage('')
          }}
          disabled={submitting}
        >
          {mode === 'sign-up' ? 'Inicia sesión' : 'Crea una cuenta'}
        </button>
      </p>
    </section>
  )
}

export default ReaderAuthPanel
