import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [deniedEmail, setDeniedEmail] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // Runs on every session change, including immediately after login. An
  // auth.users row existing (session issued) is not the same as being on
  // vp_allowed_users — e.g. an account from another app sharing this
  // Supabase project. Bounce anyone who isn't allowed before they see
  // anything, rather than leaving them logged into an empty, erroring app.
  useEffect(() => {
    if (!session) {
      setAuthorized(null)
      return
    }
    let cancelled = false
    supabase.rpc('vp_is_allowed_user').then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) {
        setDeniedEmail(session.user.email ?? null)
        setAuthorized(false)
        supabase.auth.signOut()
      } else {
        setAuthorized(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [session])

  return {
    session,
    loading,
    authorized,
    deniedEmail,
    signOut: () => supabase.auth.signOut(),
  }
}
