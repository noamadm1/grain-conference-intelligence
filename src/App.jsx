import { useEffect } from 'react'
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import Conferences from './pages/Conferences.jsx'
import Capture from './pages/Capture.jsx'
import People from './pages/People.jsx'
import Person from './pages/Person.jsx'
import Planning from './pages/Planning.jsx'
import Settings from './pages/Settings.jsx'
import Export from './pages/Export.jsx'
import Greeting from './components/Greeting.jsx'
import { resumePending } from './lib/processing'

// HashRouter: works in drag-and-drop hosting (Netlify/Vercel) with no redirect setup
export default function App() {
  // Recordings still waiting for processing (reload, lost connection) are picked up in the background
  useEffect(() => {
    resumePending()
    const online = () => resumePending({ retryFailed: true })
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [])

  return (
    <HashRouter>
      <header className="topbar">
        <span className="brand">Grain · כנסים</span>
        <nav>
          <NavLink to="/conferences">כנסים</NavLink>
          <NavLink to="/planning">תכנון</NavLink>
          <NavLink to="/capture">תיעוד בשטח</NavLink>
          <NavLink to="/people">אנשי קשר</NavLink>
          <NavLink to="/export">ייצוא</NavLink>
          <NavLink to="/settings">הגדרות</NavLink>
        </nav>
        <Greeting />
      </header>
      <Routes>
        <Route path="/" element={<Navigate to="/conferences" replace />} />
        <Route path="/conferences" element={<Conferences />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/capture" element={<Capture />} />
        <Route path="/people" element={<People />} />
        <Route path="/people/:id" element={<Person />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/export" element={<Export />} />
        <Route path="*" element={<Navigate to="/conferences" replace />} />
      </Routes>
    </HashRouter>
  )
}
