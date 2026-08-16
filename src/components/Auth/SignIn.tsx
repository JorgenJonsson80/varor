import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import './SignIn.css'

export function SignIn() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setStatus('sending')
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    })
    if (error) {
      setStatus('error')
      setError(error.message)
      return
    }
    setStatus('sent')
  }

  return (
    <div className="signin-page">
      <form onSubmit={handleSubmit} className="signin-form">
        <h1>Varuplacering</h1>
        {status === 'sent' ? (
          <p>Kolla din mejl ({email}) för inloggningslänken.</p>
        ) : (
          <>
            <label>
              E-post
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </label>
            <button type="submit" disabled={status === 'sending'}>
              {status === 'sending' ? 'Skickar…' : 'Skicka inloggningslänk'}
            </button>
            {error && <p className="error">{error}</p>}
          </>
        )}
      </form>
    </div>
  )
}
