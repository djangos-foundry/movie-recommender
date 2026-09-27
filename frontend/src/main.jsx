import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { loadPrefs, applyAccent } from './lib/prefs'

// Apply the saved accent before the first paint so there is no flash of the default
applyAccent(loadPrefs().accent)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
