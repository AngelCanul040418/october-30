import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Power, RefreshCw, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'
import SiteHeader from '../components/SiteHeader.jsx'
import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

const roleLabels = {
  super_admin: 'Super administrador',
  author: 'Autor',
  reader: 'Lector',
}

async function showUsersAlert(options) {
  const [{ default: Swal }] = await Promise.all([
    import('sweetalert2'),
    import('sweetalert2/dist/sweetalert2.min.css'),
  ])
  return Swal.fire(options)
}

function UserManagementPage() {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState('')
  const [checkingSession, setCheckingSession] = useState(isSupabaseConfigured)
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [savingUserId, setSavingUserId] = useState('')
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('author')
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState('')

  const callManagementFunction = useCallback(async (payload) => {
    const { data, error: functionError } = await supabase.functions.invoke('manage-users', {
      body: payload,
    })
    if (functionError) {
      if (functionError.context instanceof Response) {
        const responseBody = await functionError.context.clone().json()
        if (responseBody?.error) throw new Error(responseBody.error)
      }
      throw functionError
    }
    if (data?.error) throw new Error(data.error)
    return data
  }, [])

  const loadUsers = useCallback(async () => {
    if (!supabase) return
    setLoadingUsers(true)
    setError('')
    try {
      const result = await callManagementFunction({ action: 'list' })
      setUsers(result.users)
    } catch (loadError) {
      setError(`No se pudieron cargar las cuentas: ${loadError.message}`)
    } finally {
      setLoadingUsers(false)
    }
  }, [callManagementFunction])

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
        if (data?.role === 'super_admin') loadUsers()
      })
      .catch((profileError) => {
        if (!active) return
        setError(`No se pudo comprobar el rol de la cuenta: ${profileError.message}`)
        setRole('reader')
      })
    return () => {
      active = false
    }
  }, [loadUsers, user])

  async function signOut() {
    if (!supabase) return
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(`No se pudo cerrar sesión: ${signOutError.message}`)
  }

  async function inviteUser(event) {
    event.preventDefault()
    if (!supabase || inviting) return
    setInviting(true)
    setError('')
    const invitedEmail = email.trim()
    let invitationSent = false
    try {
      await callManagementFunction({
        action: 'invite',
        email: invitedEmail,
        role: inviteRole,
      })
      invitationSent = true
      setEmail('')
      await loadUsers()
    } catch (inviteError) {
      setError(`No se pudo invitar a la persona: ${inviteError.message}`)
    } finally {
      setInviting(false)
    }
    if (invitationSent) {
      try {
        await showUsersAlert({
          icon: 'success',
          title: 'Invitación enviada',
          text: `Enviamos una invitación a ${invitedEmail}.`,
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#294d3d',
        })
      } catch (alertError) {
        setError(`La invitación se envió, pero no se pudo mostrar la confirmación: ${alertError.message}`)
      }
    }
  }

  async function updateRole(targetUser, nextRole) {
    if (!supabase || savingUserId || targetUser.role === nextRole) return
    let confirmation
    try {
      confirmation = await showUsersAlert({
        icon: 'question',
        title: '¿Cambiar el rol?',
        text: `${targetUser.email} tendrá el rol “${roleLabels[nextRole]}”.`,
        showCancelButton: true,
        confirmButtonText: 'Cambiar rol',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#294d3d',
      })
    } catch (alertError) {
      setError(`No se pudo mostrar la confirmación: ${alertError.message}`)
      return
    }
    if (!confirmation.isConfirmed) return

    setSavingUserId(targetUser.id)
    setError('')
    let roleUpdated = false
    try {
      await callManagementFunction({
        action: 'set-role',
        user_id: targetUser.id,
        role: nextRole,
      })
      roleUpdated = true
      setUsers((current) => current.map((entry) => (
        entry.id === targetUser.id ? { ...entry, role: nextRole } : entry
      )))
    } catch (roleError) {
      setError(`No se pudo cambiar el rol: ${roleError.message}`)
    } finally {
      setSavingUserId('')
    }
    if (roleUpdated) {
      try {
        await showUsersAlert({
          icon: 'success',
          title: 'Rol actualizado',
          text: `La cuenta ahora tiene el rol “${roleLabels[nextRole]}”.`,
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#294d3d',
        })
      } catch (alertError) {
        setError(`El rol se actualizó, pero no se pudo mostrar la confirmación: ${alertError.message}`)
      }
    }
  }

  async function toggleUserActive(targetUser) {
    if (!supabase || savingUserId) return
    const nextActive = !targetUser.is_active
    let confirmation
    try {
      confirmation = await showUsersAlert({
        icon: nextActive ? 'question' : 'warning',
        title: nextActive ? '¿Activar esta cuenta?' : '¿Desactivar esta cuenta?',
        text: nextActive
          ? `${targetUser.email} podrá volver a iniciar sesión.`
          : `${targetUser.email} ya no podrá iniciar sesión.`,
        showCancelButton: true,
        confirmButtonText: nextActive ? 'Activar cuenta' : 'Desactivar cuenta',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: nextActive ? '#294d3d' : '#b42318',
      })
    } catch (alertError) {
      setError(`No se pudo mostrar la confirmación: ${alertError.message}`)
      return
    }
    if (!confirmation.isConfirmed) return

    setSavingUserId(targetUser.id)
    setError('')
    let statusUpdated = false
    try {
      await callManagementFunction({
        action: 'set-active',
        user_id: targetUser.id,
        is_active: nextActive,
      })
      statusUpdated = true
      setUsers((current) => current.map((entry) => (
        entry.id === targetUser.id ? { ...entry, is_active: nextActive } : entry
      )))
    } catch (activeError) {
      await loadUsers()
      setError(`No se pudo completar el cambio de estado: ${activeError.message}`)
    } finally {
      setSavingUserId('')
    }
    if (statusUpdated) {
      try {
        await showUsersAlert({
          icon: 'success',
          title: nextActive ? 'Cuenta activada' : 'Cuenta desactivada',
          text: `${targetUser.email} ${nextActive ? 'puede volver a iniciar sesión' : 'ya no puede iniciar sesión'}.`,
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#294d3d',
        })
      } catch (alertError) {
        setError(`El estado cambió, pero no se pudo mostrar la confirmación: ${alertError.message}`)
      }
    }

  }

  async function deleteUser(targetUser) {
    if (!supabase || savingUserId) return
    let confirmation
    try {
      confirmation = await showUsersAlert({
        icon: 'warning',
        title: '¿Eliminar esta cuenta?',
        text: `Se eliminará permanentemente ${targetUser.email || 'esta cuenta'} y no se podrá deshacer.`,
        showCancelButton: true,
        confirmButtonText: 'Eliminar cuenta',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#b42318',
      })
    } catch (alertError) {
      setError(`No se pudo mostrar la confirmación: ${alertError.message}`)
      return
    }
    if (!confirmation.isConfirmed) return

    setSavingUserId(targetUser.id)
    setError('')
    let deleted = false
    try {
      await callManagementFunction({
        action: 'delete',
        user_id: targetUser.id,
      })
      deleted = true
      setUsers((current) => current.filter((entry) => entry.id !== targetUser.id))
    } catch (deleteError) {
      setError(`No se pudo eliminar la cuenta: ${deleteError.message}`)
    } finally {
      setSavingUserId('')
    }
    if (deleted) {
      try {
        await showUsersAlert({
          icon: 'success',
          title: 'Cuenta eliminada',
          text: 'La cuenta y sus datos relacionados fueron eliminados.',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#294d3d',
        })
      } catch (alertError) {
        setError(`La cuenta se eliminó, pero no se pudo mostrar la confirmación: ${alertError.message}`)
      }
    }
  }

  return (
    <div className="app-shell">
      <SiteHeader
        note="Usuarios y roles"
        homeHref="/"
        onSignOut={user ? signOut : undefined}
      />
      <main className="main-content user-management-main">
        {checkingSession ? (
          <div className="page-loading session-loading"><span className="spinner" /> Comprobando acceso...</div>
        ) : !isSupabaseConfigured ? (
          <section className="empty-state">
            <h1>Gestión no configurada</h1>
            <p>Conecta este proyecto con Supabase para administrar las cuentas.</p>
          </section>
        ) : !user ? (
          <section className="empty-state">
            <h1>Inicia sesión para continuar</h1>
            <p>La gestión de usuarios solo está disponible para el super administrador.</p>
            <a className="primary-button" href="/">Ir al acceso</a>
          </section>
        ) : role !== 'super_admin' ? (
          <section className="empty-state">
            <h1>Acceso restringido</h1>
            <p>Solo el super administrador puede gestionar cuentas y asignar roles.</p>
            <a className="primary-button" href="/">Volver al panel</a>
          </section>
        ) : (
          <>
            <a className="user-management-backlink" href="/">
              <ArrowLeft size={16} />
              Volver al panel
            </a>
            <section className="user-management-heading">
              <div className="reader-auth-icon"><Users size={22} /></div>
              <p className="eyebrow">CONTROL DE ACCESO</p>
              <h1>Usuarios y roles</h1>
              <p>Invita autores y lectores, asigna permisos y controla el acceso a la plataforma.</p>
            </section>
            {error && <p className="error-message" role="alert">{error}</p>}

            <form className="user-invite-card" onSubmit={inviteUser}>
              <div className="user-section-title">
                <UserPlus size={19} />
                <div>
                  <h2>Invitar a una persona</h2>
                  <p>Recibirá un correo para aceptar la invitación y crear su contraseña.</p>
                </div>
              </div>
              <div className="user-invite-fields">
                <label>
                  Correo electrónico
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="nombre@ejemplo.com"
                    required
                    disabled={inviting}
                  />
                </label>
                <label>
                  Rol inicial
                  <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} disabled={inviting}>
                    <option value="author">Autor</option>
                    <option value="reader">Lector</option>
                    <option value="super_admin">Super administrador</option>
                  </select>
                </label>
                <button className="primary-button" type="submit" disabled={inviting}>
                  <UserPlus size={16} />
                  {inviting ? 'Enviando…' : 'Enviar invitación'}
                </button>
              </div>
            </form>

            <section className="user-list-card">
              <div className="user-list-heading">
                <div className="user-section-title">
                  <ShieldCheck size={19} />
                  <div>
                    <h2>Cuentas registradas</h2>
                    <p>{users.length} {users.length === 1 ? 'cuenta' : 'cuentas'}</p>
                  </div>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={loadUsers}
                  disabled={loadingUsers}
                >
                  <RefreshCw size={15} />
                  Actualizar
                </button>
              </div>

              {loadingUsers && users.length === 0 ? (
                <div className="page-loading"><span className="spinner" /> Cargando cuentas...</div>
              ) : users.length === 0 ? (
                <p className="user-list-empty">Todavía no hay cuentas registradas.</p>
              ) : (
                <div className="user-table-scroll">
                  <table className="user-table">
                    <thead>
                      <tr>
                        <th>Cuenta</th>
                        <th>Rol</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((entry) => (
                        <tr key={entry.id}>
                          <td>
                            <strong>{entry.email || 'Sin correo'}</strong>
                            <span>{new Date(entry.created_at).toLocaleDateString()}</span>
                          </td>
                          <td>
                            <label className="visually-hidden" htmlFor={`user-role-${entry.id}`}>
                              Rol de {entry.email}
                            </label>
                            <select
                              id={`user-role-${entry.id}`}
                              value={entry.role}
                              onChange={(event) => updateRole(entry, event.target.value)}
                              disabled={savingUserId === entry.id}
                            >
                              {Object.entries(roleLabels).map(([value, label]) => (
                                <option value={value} key={value}>{label}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <span className={`user-status${entry.is_active ? ' is-active' : ' is-inactive'}`}>
                              {entry.is_active ? 'Activa' : 'Desactivada'}
                            </span>
                          </td>
                          <td>
                            <button
                              className={`user-status-button${entry.is_active ? ' deactivate' : ''}`}
                              type="button"
                              onClick={() => toggleUserActive(entry)}
                              disabled={savingUserId === entry.id}
                            >
                              <Power size={15} />
                              {entry.is_active ? 'Desactivar' : 'Activar'}
                            </button>
                            <button
                              className="user-delete-button"
                              type="button"
                              onClick={() => deleteUser(entry)}
                              disabled={savingUserId === entry.id}
                            >
                              <Trash2 size={15} />
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

export default UserManagementPage
