import { useEffect, useState } from 'react'
import { BookOpen, Library, ShieldCheck, Users } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import SiteHeader from '../components/SiteHeader.jsx'
import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

function SuperAdminPage() {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState('')
  const [checkingSession, setCheckingSession] = useState(isSupabaseConfigured)
  const [stats, setStats] = useState({ users: 0, authors: 0, books: 0 })
  const [loadingStats, setLoadingStats] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) return undefined

    let active = true
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setUser(session?.user ?? null)
      setRole('')
      setCheckingSession(false)
    })

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) setError(`No se pudo comprobar la sesión: ${sessionError.message}`)
      setUser(data.session?.user ?? null)
      setCheckingSession(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !user) return undefined
    let active = true
    supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error: profileError }) => {
        if (!active) return
        if (profileError) {
          setError(`No se pudo comprobar el rol de la cuenta: ${profileError.message}`)
          setRole('reader')
          return
        }
        setRole(data?.role ?? 'reader')
      })
      .catch((profileError) => {
        if (active) {
          setError(`No se pudo comprobar el rol de la cuenta: ${profileError.message}`)
          setRole('reader')
        }
      })

    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    if (!supabase || role !== 'super_admin') return undefined
    let active = true
    Promise.resolve()
      .then(() => {
        if (!active) return null
        setLoadingStats(true)
        return Promise.all([
          supabase.from('user_profiles').select('role'),
          supabase.from('books').select('id', { count: 'exact', head: true }),
        ])
      })
      .then((results) => {
        if (!active || !results) return
        const [profilesResult, booksResult] = results
        if (profilesResult.error) throw profilesResult.error
        if (booksResult.error) throw booksResult.error
        const profiles = profilesResult.data ?? []
        setStats({
          users: profiles.length,
          authors: profiles.filter((profile) => profile.role === 'author').length,
          books: booksResult.count ?? 0,
        })
      })
      .catch((statsError) => {
        if (active) setError(`No se pudieron cargar las estadísticas: ${statsError.message}`)
      })
      .finally(() => {
        if (active) setLoadingStats(false)
      })

    return () => {
      active = false
    }
  }, [role])

  async function signOut() {
    if (!supabase) return
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(`No se pudo cerrar sesión: ${signOutError.message}`)
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="app-shell">
        <SiteHeader note="Super administración" />
        <main className="main-content">
          <section className="empty-state">
            <h1>Panel no configurado</h1>
            <p>Conecta este proyecto con Supabase para acceder al panel.</p>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <SiteHeader note="Super administración" onSignOut={user ? signOut : undefined} />
      <main className="main-content super-admin-main">
        {checkingSession ? (
          <div className="page-loading session-loading"><span className="spinner" /> Comprobando acceso...</div>
        ) : !user ? (
          <section className="empty-state">
            <h1>Inicia sesión para continuar</h1>
            <p>Este espacio está reservado para el super administrador.</p>
            <a className="primary-button" href="/author">Ir al acceso</a>
          </section>
        ) : role === 'super_admin' ? (
          <>
            <section className="super-admin-welcome">
              <div className="reader-auth-icon"><ShieldCheck size={24} /></div>
              <p className="eyebrow">CENTRO DE CONTROL</p>
              <h1>Bienvenido, super administrador</h1>
              <p>Desde aquí puedes controlar las cuentas, los autores y la biblioteca completa.</p>
            </section>
            {error && <p className="error-message" role="alert">{error}</p>}
            <section className="super-admin-stats" aria-label="Resumen de la plataforma">
              <div className="super-admin-stat">
                <Users size={20} />
                <span>Cuentas</span>
                <strong>{loadingStats ? '…' : stats.users}</strong>
              </div>
              <div className="super-admin-stat">
                <ShieldCheck size={20} />
                <span>Autores</span>
                <strong>{loadingStats ? '…' : stats.authors}</strong>
              </div>
              <div className="super-admin-stat">
                <BookOpen size={20} />
                <span>Libros</span>
                <strong>{loadingStats ? '…' : stats.books}</strong>
              </div>
            </section>
            <section className="super-admin-actions" aria-label="Acciones administrativas">
              <a className="super-admin-action-card" href="/users">
                <span className="super-admin-action-icon"><Users size={22} /></span>
                <span>
                  <strong>Usuarios y roles</strong>
                  <small>Invita autores, crea lectores y administra permisos.</small>
                </span>
                <span className="super-admin-action-arrow">→</span>
              </a>
              <a className="super-admin-action-card" href="/books">
                <span className="super-admin-action-icon"><Library size={22} /></span>
                <span>
                  <strong>Biblioteca completa</strong>
                  <small>Consulta y administra todos los libros de la plataforma.</small>
                </span>
                <span className="super-admin-action-arrow">→</span>
              </a>
              <a className="super-admin-action-card" href="/author">
                <span className="super-admin-action-icon"><BookOpen size={22} /></span>
                <span>
                  <strong>Vista de autor</strong>
                  <small>Abre el espacio de publicación para revisar su experiencia.</small>
                </span>
                <span className="super-admin-action-arrow">→</span>
              </a>
            </section>
          </>
        ) : role === 'author' ? (
          <Navigate to="/author" replace />
        ) : (
          <Navigate to="/library" replace />
        )}
      </main>
    </div>
  )
}

export default SuperAdminPage
