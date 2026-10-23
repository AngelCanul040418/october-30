import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const allowedRoles = new Set(['super_admin', 'author', 'reader'])

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405)

  const authorization = request.headers.get('Authorization')
  const token = authorization?.replace(/^Bearer\s+/i, '')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const appUrl = Deno.env.get('APP_URL')

  if (!token || !supabaseUrl || !anonKey || !serviceRoleKey || !appUrl) {
    return jsonResponse({ error: 'La función no está configurada correctamente.' }, 500)
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const { data: authData, error: authError } = await authClient.auth.getUser(token)
    if (authError || !authData.user) return jsonResponse({ error: 'La sesión no es válida.' }, 401)

    const { data: callerProfile, error: callerProfileError } = await serviceClient
      .from('user_profiles')
      .select('role, is_active')
      .eq('user_id', authData.user.id)
      .maybeSingle()
    if (callerProfileError) throw callerProfileError
    if (callerProfile?.role !== 'super_admin' || !callerProfile.is_active) {
      return jsonResponse({ error: 'Solo un super administrador puede gestionar usuarios.' }, 403)
    }

    const body = await request.json()
    const action = body?.action

    if (action === 'list') {
      const users = []
      for (let page = 1; ; page += 1) {
        const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: 1000 })
        if (error) throw error
        users.push(...data.users)
        if (data.users.length < 1000) break
      }

      const { data: profiles, error: profilesError } = await serviceClient
        .from('user_profiles')
        .select('user_id, role, is_active')
      if (profilesError) throw profilesError
      const rolesByUser = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.role]))
      const activeByUser = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.is_active]))

      return jsonResponse({
        users: users.map((user) => ({
          id: user.id,
          email: user.email ?? '',
          role: rolesByUser.get(user.id) ?? 'reader',
          is_active: Boolean(activeByUser.get(user.id))
            && (!user.banned_until || new Date(user.banned_until).getTime() <= Date.now()),
          created_at: user.created_at,
        })),
      })
    }

    if (action === 'invite') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      const role = body.role
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse({ error: 'Escribe un correo electrónico válido.' }, 400)
      }
      if (!allowedRoles.has(role)) return jsonResponse({ error: 'El rol seleccionado no es válido.' }, 400)

      const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${appUrl.replace(/\/$/, '')}/set-password`,
      })
      if (error) throw error

      const { error: profileError } = await serviceClient
        .from('user_profiles')
        .upsert({ user_id: data.user.id, role }, { onConflict: 'user_id' })
      if (profileError) {
        throw new Error(`La invitación se envió, pero no se pudo asignar el rol: ${profileError.message}`)
      }
      return jsonResponse({ success: true })
    }

    const targetUserId = typeof body.user_id === 'string' ? body.user_id : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId)) {
      return jsonResponse({ error: 'La cuenta seleccionada no es válida.' }, 400)
    }

    if (action === 'delete') {
      if (targetUserId === authData.user.id) {
        return jsonResponse({ error: 'No puedes eliminar tu propia cuenta.' }, 400)
      }

      const { data: targetUser, error: targetUserError } = await serviceClient.auth.admin.getUserById(targetUserId)
      if (targetUserError) throw targetUserError
      if (!targetUser.user) return jsonResponse({ error: 'No encontramos esa cuenta.' }, 404)

      const { data: targetProfile, error: targetProfileError } = await serviceClient
        .from('user_profiles')
        .select('role')
        .eq('user_id', targetUserId)
        .maybeSingle()
      if (targetProfileError) throw targetProfileError

      if (targetProfile?.role === 'super_admin') {
        const { data: otherSuperAdmins, error: adminsError } = await serviceClient
          .from('user_profiles')
          .select('user_id, is_active')
          .eq('role', 'super_admin')
          .neq('user_id', targetUserId)
        if (adminsError) throw adminsError
        let hasActiveSuperAdmin = false
        for (const profile of otherSuperAdmins ?? []) {
          if (!profile.is_active) continue
          const { data: adminUser, error: adminUserError } = await serviceClient.auth.admin.getUserById(profile.user_id)
          if (adminUserError) throw adminUserError
          if (adminUser.user && (!adminUser.user.banned_until || new Date(adminUser.user.banned_until).getTime() <= Date.now())) {
            hasActiveSuperAdmin = true
            break
          }
        }
        if (!hasActiveSuperAdmin) {
          return jsonResponse({ error: 'Debe permanecer al menos un super administrador activo.' }, 400)
        }
      }

      const { data: ownedBooks, error: booksError } = await serviceClient
        .from('books')
        .select('file_path, cover_path')
        .eq('owner_id', targetUserId)
      if (booksError) throw booksError

      const storagePaths = (ownedBooks ?? [])
        .flatMap((book) => [book.file_path, book.cover_path])
        .filter((path): path is string => Boolean(path))
      if (storagePaths.length > 0) {
        const { error: storageError } = await serviceClient.storage.from('books').remove(storagePaths)
        if (storageError) throw new Error(`No se pudieron eliminar los archivos de la cuenta: ${storageError.message}`)
      }

      const { error: deleteError } = await serviceClient.auth.admin.deleteUser(targetUserId)
      if (deleteError) throw deleteError
      return jsonResponse({ success: true })
    }

    const { data: targetProfile, error: targetProfileError } = await serviceClient
      .from('user_profiles')
      .select('role')
      .eq('user_id', targetUserId)
      .maybeSingle()
    if (targetProfileError) throw targetProfileError
    if (!targetProfile) return jsonResponse({ error: 'No encontramos el perfil de esa cuenta.' }, 404)

    const mustKeepSuperAdmin = targetProfile.role === 'super_admin'
      && (
        (action === 'set-role' && body.role !== 'super_admin')
        || (action === 'set-active' && body.is_active === false)
      )
    if (mustKeepSuperAdmin) {
      if (targetUserId === authData.user.id) {
        return jsonResponse({ error: 'No puedes quitarte el rol o desactivar tu propia cuenta.' }, 400)
      }
      const { data: otherSuperAdmins, error: adminsError } = await serviceClient
        .from('user_profiles')
        .select('user_id, is_active')
        .eq('role', 'super_admin')
        .neq('user_id', targetUserId)
      if (adminsError) throw adminsError
      let hasActiveSuperAdmin = false
      for (const profile of otherSuperAdmins ?? []) {
        if (!profile.is_active) continue
        const { data: adminUser, error: adminUserError } = await serviceClient.auth.admin.getUserById(profile.user_id)
        if (adminUserError) throw adminUserError
        if (adminUser.user && (!adminUser.user.banned_until || new Date(adminUser.user.banned_until).getTime() <= Date.now())) {
          hasActiveSuperAdmin = true
          break
        }
      }
      if (!hasActiveSuperAdmin) {
        return jsonResponse({ error: 'Debe permanecer al menos un super administrador activo.' }, 400)
      }
    }

    if (action === 'set-role') {
      if (!allowedRoles.has(body.role)) {
        return jsonResponse({ error: 'El rol seleccionado no es válido.' }, 400)
      }
      const { error } = await serviceClient
        .from('user_profiles')
        .update({ role: body.role })
        .eq('user_id', targetUserId)
      if (error) throw error
      return jsonResponse({ success: true })
    }

    if (action === 'set-active') {
      if (typeof body.is_active !== 'boolean') {
        return jsonResponse({ error: 'El estado de la cuenta no es válido.' }, 400)
      }
      if (body.is_active) {
        const { error: authError } = await serviceClient.auth.admin.updateUserById(targetUserId, {
          ban_duration: 'none',
        })
        if (authError) throw authError
        const { error: profileError } = await serviceClient
          .from('user_profiles')
          .update({ is_active: true })
          .eq('user_id', targetUserId)
        if (profileError) {
          throw new Error(`Se habilitó el inicio de sesión, pero no se pudo activar el perfil: ${profileError.message}`)
        }
      } else {
        const { error: profileError } = await serviceClient
          .from('user_profiles')
          .update({ is_active: false })
          .eq('user_id', targetUserId)
        if (profileError) throw profileError
        const { error: authError } = await serviceClient.auth.admin.updateUserById(targetUserId, {
          ban_duration: '876000h',
        })
        if (authError) {
          throw new Error(`Se revocó el acceso a los libros, pero no se pudo bloquear el inicio de sesión: ${authError.message}`)
        }
      }
      return jsonResponse({ success: true })
    }

    return jsonResponse({ error: 'La operación solicitada no es válida.' }, 400)
  } catch (error) {
    console.error('Error gestionando usuarios:', error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Ocurrió un error inesperado.' }, 500)
  }
})
