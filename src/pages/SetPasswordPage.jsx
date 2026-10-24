import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import SiteHeader from '../components/SiteHeader.jsx'
import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

function SetPasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const isPasswordReset = location.pathname === '/reset-password'
  const [user, setUser] = useState(null)
  const [checkingSession, setCheckingSession] = useState(isSupabaseConfigured)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const sessionUserIdRef = useRef('')

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      const nextUser = session?.user ?? null
      if (sessionUserIdRef.current !== (nextUser?.id ?? '')) {
        sessionUserIdRef.current = nextUser?.id ?? ''
        setUser(nextUser)
      }
      setCheckingSession(false)
    })

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) setError(`No se pudo comprobar el enlace: ${sessionError.message}`)
      const nextUser = data.session?.user ?? null
      if (sessionUserIdRef.current !== (nextUser?.id ?? '')) {
        sessionUserIdRef.current = nextUser?.id ?? ''
        setUser(nextUser)
      }
      setCheckingSession(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function savePassword(event) {
    event.preventDefault()
    if (!supabase || !user || saving) return
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()
      if (profileError) throw profileError
      navigate(profile?.role === 'reader' ? '/library' : '/', { replace: true })
    } catch (saveError) {
      setError(`No se pudo establecer la contraseña: ${saveError.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app-shell reader-theme">
      <SiteHeader note="Activar cuenta" homeHref="/" />
      <main className="shared-reader-main">
        {checkingSession ? (
          <div className="page-loading session-loading"><span className="spinner" /> Comprobando enlace...</div>
        ) : !isSupabaseConfigured ? (
          <section className="empty-state">
            <h1>Cuenta no configurada</h1>
            <p>Este proyecto todavía no está conectado a Supabase.</p>
          </section>
        ) : !user ? (
          <section className="empty-state">
            <h1>El enlace no está activo</h1>
            <p>Abre el enlace más reciente que recibiste por correo y vuelve a intentarlo.</p>
            <Link className="primary-button" to="/">Ir al inicio de sesión</Link>
          </section>
        ) : (
          <section className="reader-auth-card" aria-labelledby="set-password-title">
            <div className="reader-auth-icon"><KeyRound size={23} /></div>
            <p className="book-intro-eyebrow">ACTIVA TU CUENTA</p>
            <h1 id="set-password-title">{isPasswordReset ? 'Restablece tu contraseña' : 'Crea tu contraseña'}</h1>
            <p className="reader-auth-copy">
              {isPasswordReset
                ? `Crea una contraseña nueva para entrar con ${user.email}.`
                : `Establece una contraseña para entrar con ${user.email}.`}
            </p>
            <form className="reader-auth-form" onSubmit={savePassword}>
              <label htmlFor="new-password">Contraseña nueva</label>
              <div className="password-input-wrap">
                <input
                  id="new-password"
                  type={showPasswords ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={saving}
                />
                <button
                  className="password-visibility-button"
                  type="button"
                  aria-label={showPasswords ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showPasswords}
                  onClick={() => setShowPasswords((visible) => !visible)}
                  disabled={saving}
                >
                  {showPasswords ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <label htmlFor="confirm-password">Confirmar contraseña</label>
              <input
                id="confirm-password"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                disabled={saving}
              />
              {error && <p className="error-message" role="alert">{error}</p>}
              <button className="book-intro-open" type="submit" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  )
}

export default SetPasswordPage
