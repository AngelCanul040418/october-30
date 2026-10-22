import { useState } from 'react'
import { BookOpen, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

function ReaderAuthPanel({ returnTo = '/library' }) {
  const [mode, setMode] = useState('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)

  function getSafeReturnTo() {
    return returnTo.startsWith('/') && !returnTo.startsWith('//')
      ? returnTo
      : '/library'
  }

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
            emailRedirectTo: `${window.location.origin}${getSafeReturnTo()}`,
          },
        })
        if (signUpError) throw signUpError

        if (!data.session) {
          setMessage('Te enviamos un correo para confirmar tu cuenta. Al confirmarla volverás a este libro.')
          setMode('sign-in')
          setPassword('')
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (signInError) throw signInError
      }
    } catch (authError) {
      const message = authError.message === 'Signups not allowed for this instance'
        ? 'El registro de lectores está desactivado en Supabase. El administrador debe activar “Allow new users to sign up” en Authentication > Providers > Email.'
        : authError.message
      setError(
        mode === 'sign-up'
          ? `No se pudo crear la cuenta: ${message}`
          : `No se pudo iniciar sesión: ${message}`,
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function resendConfirmation() {
    if (!supabase || submitting || resending || !email.trim()) {
      setError('Escribe tu correo electrónico para reenviar la confirmación.')
      return
    }

    setError('')
    setMessage('')
    setResending(true)
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}${getSafeReturnTo()}`,
        },
      })
      if (resendError) throw resendError
      setMessage('Te enviamos un nuevo correo de confirmación. Usa únicamente el enlace más reciente.')
    } catch (resendError) {
      setError(`No se pudo reenviar el correo: ${resendError.message}`)
    } finally {
      setResending(false)
    }
  }

  return (
    <section className="reader-auth-card" aria-labelledby="reader-auth-title">
      <div className="reader-auth-icon"><BookOpen size={23} /></div>
      <p className="book-intro-eyebrow">TU RINCONCITO DE LECTURA</p>
      <h1 id="reader-auth-title">
        {mode === 'sign-up' ? 'Crea tu cuenta de lector' : 'Inicia sesión'}
      </h1>
      <p className="reader-auth-copy">
        {mode === 'sign-up'
          ? 'Crea una cuenta para guardar este libro en tu biblioteca y volver a leerlo.'
          : 'Entra con tu cuenta para guardar y volver a leer los libros que te compartan.'}
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
        <div className="password-input-wrap">
          <input
            id="reader-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={submitting}
          />
          <button
            className="password-visibility-button"
            type="button"
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
            disabled={submitting}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}
        {message && <p className="reader-auth-message" role="status">{message}</p>}
        <button className="book-intro-open" type="submit" disabled={submitting}>
          {submitting
            ? 'Un momento…'
            : mode === 'sign-up'
              ? 'Crear cuenta y continuar'
              : 'Entrar a mi biblioteca'}
        </button>
        {mode === 'sign-in' && (
          <button
            className="reader-auth-resend"
            type="button"
            onClick={resendConfirmation}
            disabled={submitting || resending}
          >
            {resending ? 'Reenviando…' : 'Reenviar correo de confirmación'}
          </button>
        )}
      </form>
      <p className="reader-auth-switch">
        {mode === 'sign-up' ? '¿Ya tienes cuenta?' : '¿Es tu primera vez?'}
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
          {mode === 'sign-up' ? 'Inicia sesión' : 'Crea una cuenta de lector'}
        </button>
      </p>
    </section>
  )
}

export default ReaderAuthPanel
