import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const root = createRoot(document.getElementById('root')!)

// Laboratorio de personajes: solo en desarrollo, nunca entra al build de producción.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('lab') === 'character') {
  Promise.all([import('./dev/CharacterLab.tsx'), import('./dev/labCombos.ts')]).then(
    ([{ CharacterLab }, { LAB_COMBOS }]) => {
      root.render(<CharacterLab combos={LAB_COMBOS} />)
    },
  )
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
