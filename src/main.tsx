import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import PwaUpdater from './PwaUpdater'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PwaUpdater />
  </StrictMode>,
)
