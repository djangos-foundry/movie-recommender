import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { loadPrefs, applyAccent, applyTheme, resolveTheme } from './lib/prefs'

// Apply the saved theme and accent before the first paint so there is no flash of the default
const prefs = loadPrefs()
const theme = resolveTheme(prefs.theme)
applyTheme(theme)
applyAccent(prefs.accent, theme)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
