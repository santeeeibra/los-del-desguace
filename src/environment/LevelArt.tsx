import { Component, createContext, Suspense, useContext, useEffect, useMemo, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { ExpeditionLevelId } from '../modes/expeditionLevels';

const BASE = import.meta.env.BASE_URL;

/**
 * Arte 3D de cada nivel de invento (ver docs/PEDIDO_ANTIGRAVITY_NIVELES.md).
 * El .glb es solo la malla visual en coordenadas locales del nivel; los colliders y la lógica
 * siguen en `ExpeditionLevels.tsx`. Si el archivo no existe, el nivel muestra los bloques de prueba.
 */
export const LEVEL_MODEL_URLS: Record<ExpeditionLevelId, string> = {
  'level-1-swamp': `${BASE}models/levels/level-1-puente.glb`,
  'level-2-wind': `${BASE}models/levels/level-2-autos.glb`,
  'level-3-crusher': `${BASE}models/levels/level-3-olla.glb`,
  'level-4-batteries': `${BASE}models/levels/level-4-pilas.glb`,
};

/** `true` cuando el nivel ya tiene su .glb cargado: los bloques de prueba se ocultan. */
const LevelArtContext = createContext(false);

/** Los bloques de prueba (greybox) se ocultan cuando el arte del nivel está presente. */
export function useGreyboxVisible(): boolean {
  return !useContext(LevelArtContext);
}

const availability = new Map<string, Promise<boolean>>();

/**
 * Comprueba que la URL sea realmente un GLB ("glTF" en los primeros bytes).
 * El servidor de desarrollo responde index.html con 200 a rutas inexistentes, así que
 * mirar solo el estado HTTP no alcanza.
 */
function glbExists(url: string): Promise<boolean> {
  let cached = availability.get(url);
  if (!cached) {
    cached = fetch(url, { headers: { Range: 'bytes=0-3' } })
      .then(async (res) => {
        if (!res.ok || !res.body) return false;
        const reader = res.body.getReader();
        const { value } = await reader.read();
        void reader.cancel();
        return !!value && value.length >= 4
          && String.fromCharCode(value[0], value[1], value[2], value[3]) === 'glTF';
      })
      .catch(() => false);
    availability.set(url, cached);
  }
  return cached;
}

/** Un .glb corrupto no debe tirar la escena: se descarta el arte y queda el greybox. */
class ArtBoundary extends Component<{ onError: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function LevelGlb({ url, origin }: { url: string; origin: readonly [number, number, number] }) {
  const { scene } = useGLTF(url, false, false);
  const model = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    });
    return c;
  }, [scene]);
  return <primitive object={model} position={[origin[0], origin[1], origin[2]]} />;
}

/**
 * Carga el .glb del nivel si existe y avisa a los hijos (vía contexto) para ocultar el greybox.
 * Los hijos (la geometría física del nivel) se montan siempre.
 */
export function LevelArt({
  levelId,
  origin,
  children,
}: {
  levelId: ExpeditionLevelId;
  origin: readonly [number, number, number];
  children: React.ReactNode;
}) {
  const url = LEVEL_MODEL_URLS[levelId];
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let alive = true;
    setAvailable(false);
    void glbExists(url).then((ok) => { if (alive) setAvailable(ok); });
    return () => { alive = false; };
  }, [url]);

  return (
    <LevelArtContext.Provider value={available}>
      {children}
      {available && (
        <ArtBoundary onError={() => setAvailable(false)}>
          <Suspense fallback={null}>
            <LevelGlb url={url} origin={origin} />
          </Suspense>
        </ArtBoundary>
      )}
    </LevelArtContext.Provider>
  );
}
