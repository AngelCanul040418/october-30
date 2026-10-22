import { useState } from 'react'
import { BookOpen, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

function ReaderAuthPanel() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!supabase || submitting) return

    setError('')
    setSubmitting(true)

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signInError) throw signInError
    } catch (authError) {
      setError(`No se pudo iniciar sesión: ${authError.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="reader-auth-card" aria-labelledby="reader-auth-title">
      <div className="reader-auth-icon"><BookOpen size={23} /></div>
      <p className="book-intro-eyebrow">TU RINCONCITO DE LECTURA</p>
      <h1 id="reader-auth-title">Inicia sesión</h1>
      <p className="reader-auth-copy">
        Entra con la cuenta que te compartieron para guardar y volver a leer tus libros.
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
            autoComplete="current-password"
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
        <button className="book-intro-open" type="submit" disabled={submitting}>
          {submitting ? 'Un momento…' : 'Entrar a mi biblioteca'}
        </button>
      </form>
      <p className="reader-auth-switch">¿Necesitas una cuenta? Pídele al super administrador que te envíe una invitación.</p>
    </section>
  )
}

export default ReaderAuthPanel
