import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { keepStorageWhenInstalled } from '../../../pwa/standalone'
import '../../../styles/index.css'
import { ProjectsApp } from './ProjectsApp'

// P4a · Entry of the PROYECTOS test page. The app's own entry (src/main.tsx) does not know it exists.

// The build links the app's manifest (start_url "/") into every page. Without it, iOS adds THIS
// page to the home screen (its URL and the apple-mobile-web-app meta tags) instead of opening ELYUM.
document.querySelectorAll('link[rel="manifest"]').forEach((l) => l.remove())
keepStorageWhenInstalled()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProjectsApp />
  </StrictMode>,
)
