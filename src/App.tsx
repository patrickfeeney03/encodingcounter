import './App.css'
import { useEffect, useMemo, useState } from 'react'
import { parseHashLocation } from './lib/hashRouter'
import Countdown from './routes/Countdown'
import Setup from './routes/Setup'

function App() {
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    if (!window.location.hash) window.location.hash = '#/'
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const location = useMemo(() => parseHashLocation(hash), [hash])
  const route =
    location.path === '/c' ? (
      <Countdown key={location.searchParams.toString()} searchParams={location.searchParams} />
    ) : (
      <Setup />
    )

  return (
    <div className="app">
      <main className="appMain">{route}</main>
    </div>
  )
}

export default App
