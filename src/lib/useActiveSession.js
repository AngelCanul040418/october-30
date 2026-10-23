import { useEffect, useRef } from 'react'
import { supabase } from './supabase.js'

const CHECK_INTERVAL = 60000

export function useActiveSession(user, onInactive) {
  const onInactiveRef = useRef(onInactive)

  useEffect(() => {
    onInactiveRef.current = onInactive
  }, [onInactive])

  useEffect(() => {
    if (!supabase || !user) return undefined

    let active = true
    let checking = false

    async function checkAccount() {
      if (!active || checking) return
      checking = true
      try {
        const { data, error } = await supabase.rpc('is_library_user_active')
        if (active && !error && data === false) {
          onInactiveRef.current?.()
          await supabase.auth.signOut()
        }
      } finally {
        checking = false
      }
    }

    checkAccount()
    const interval = window.setInterval(checkAccount, CHECK_INTERVAL)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [user])
}
