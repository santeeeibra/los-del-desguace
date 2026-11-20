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
} else if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('lab') === 'net') {
  // Prueba mínima de red: solo en desarrollo (ver tools/net-relay/README.md).
  import('./dev/netLab/NetLab.tsx').then(({ NetLab }) => root.render(<NetLab />))
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
