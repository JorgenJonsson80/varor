import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { SignIn } from './components/Auth/SignIn'
import { PlatskartaAdmin } from './components/Platskarta/PlatskartaAdmin'
import { ResultatView } from './components/Resultat/ResultatView'
import { AppDataProvider } from './context/AppDataContext'
import './App.css'

type View = 'resultat' | 'platskarta'

function App() {
  const { session, loading, authorized, deniedEmail, signOut } = useAuth()
  const [view, setView] = useState<View>('resultat')

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
    <AppDataProvider>
      <div className="app-shell">
        <header className="app-header">
          <h1>Varuplacering</h1>
          <nav className="app-nav">
            <button
              type="button"
              className={view === 'resultat' ? 'active' : ''}
              onClick={() => setView('resultat')}
            >
              Resultat
            </button>
            <button
              type="button"
              className={view === 'platskarta' ? 'active' : ''}
              onClick={() => setView('platskarta')}
            >
              Platskarta
            </button>
          </nav>
          <div className="app-header-user">
            <span>{session.user.email}</span>
            <button type="button" onClick={() => signOut()}>
              Logga ut
            </button>
          </div>
        </header>
        {/* Both views stay mounted once shown, so switching tabs doesn't re-fetch — only their
            visibility toggles. Using a class instead of unmounting keeps each view's own local
            state (filters, pagination, fetched history) alive across switches. */}
        <main>
          <div className={view === 'resultat' ? '' : 'view-hidden'}>
            <ResultatView />
          </div>
          <div className={view === 'platskarta' ? '' : 'view-hidden'}>
            <PlatskartaAdmin userId={session.user.id} />
          </div>
        </main>
      </div>
    </AppDataProvider>
  )
}

export default App
