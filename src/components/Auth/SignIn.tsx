import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import './SignIn.css'

interface Props {
  deniedEmail?: string | null
}

export function SignIn({ deniedEmail }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setStatus('sending')
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setStatus('error')
      setError(error.message)
      return
    }
    // On success, useAuth's onAuthStateChange picks up the new session automatically.
  }

  return (
    <div className="signin-page">
      <form onSubmit={handleSubmit} className="signin-form">
        <h1>Varuplacering</h1>
        {deniedEmail && (
          <p className="error">
            {deniedEmail} har inte behörighet till Varuplacering. Kontakta en administratör om du borde ha
            det.
          </p>
        )}
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
        <label>
          Lösenord
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? 'Loggar in…' : 'Logga in'}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  )
}
