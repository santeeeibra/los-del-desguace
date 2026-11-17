import { Component, type ErrorInfo, type ReactNode } from 'react';
import { DesguaceScene } from './scene/DesguaceScene';
import { HudOverlay } from './ui/HudOverlay';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class SceneErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error al renderizar la escena 3D:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            textAlign: 'center',
            background: '#231e1b',
            color: '#f7f1e3',
          }}
        >
          <h2>No se pudo iniciar la escena 3D</h2>
          <p style={{ maxWidth: 480, color: '#c8bfb0', marginTop: 8 }}>{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  return (
    <main className="viewport-root">
      <SceneErrorBoundary>
        <DesguaceScene />
      </SceneErrorBoundary>
      <HudOverlay />
    </main>
  );
}

export default App;
