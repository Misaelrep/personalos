import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { MotionLevelProvider } from './motion/MotionLevel'
import { keepStorageWhenInstalled } from './pwa/standalone'
import { startUpdates } from './pwa/updates'
import { DayProvider } from './state/DayProvider'
import './styles/index.css'

startUpdates()
keepStorageWhenInstalled()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionLevelProvider>
      <DayProvider>
        <App />
      </DayProvider>
    </MotionLevelProvider>
  </StrictMode>,
)
