import { useAuth } from './hooks/useAuth'
import { SignIn } from './components/Auth/SignIn'
import { PlatskartaAdmin } from './components/Platskarta/PlatskartaAdmin'
import './App.css'

function App() {
  const { session, loading, authorized, deniedEmail, signOut } = useAuth()

  if (loading) {
    return <div className="app-loading">Laddar…</div>
  }

  if (!session || authorized === false) {
    return <SignIn deniedEmail={authorized === false ? deniedEmail : null} />
  }

  if (authorized === null) {
    return <div className="app-loading">Kontrollerar behörighet…</div>
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Varuplacering</h1>
        <div className="app-header-user">
          <span>{session.user.email}</span>
          <button type="button" onClick={() => signOut()}>
            Logga ut
          </button>
        </div>
      </header>
      <main>
        <PlatskartaAdmin userId={session.user.id} />
      </main>
    </div>
  )
}

export default App
