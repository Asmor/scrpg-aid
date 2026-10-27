import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { enableDragDropTouch } from '@dragdroptouch/drag-drop-touch'
import './index.css'
import App from './App'
import PwaUpdater from './PwaUpdater'

// Touch screens don't fire HTML drag events; this turns touch drags into them (moving mods in the roll dialog).
enableDragDropTouch()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PwaUpdater />
  </StrictMode>,
)
