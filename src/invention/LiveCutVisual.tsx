import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { liveCut } from './liveCut';

const Y = new THREE.Vector3(0, 1, 0);

/** Pone un cilindro (radio fijo, largo 1 en Y) entre dos puntos. */
function stretch(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, tmp: THREE.Vector3) {
  tmp.subVectors(to, from);
  const length = tmp.length();
  mesh.visible = length > 0.005;
  if (!mesh.visible) return;
  mesh.position.copy(from).addScaledVector(tmp, 0.5);
  mesh.scale.set(1, length, 1);
  mesh.quaternion.setFromUnitVectors(Y, tmp.divideScalar(length));
}

/**
 * Dibujo del corte en vivo: guía celeste mientras se traza, y al cortar una línea de material al
 * rojo vivo que avanza con un frente blanco brillante y una luz naranja que parpadea.
 */
export function LiveCutVisual() {
  const group = useRef<THREE.Group>(null);
  const guide = useRef<THREE.Mesh>(null);
  const molten = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const cylinder = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), []);
  const mats = useMemo(() => ({
    guide: new THREE.MeshBasicMaterial({ color: '#52e0f0', transparent: true, opacity: 0.85, depthTest: false, toneMapped: false }),
    molten: new THREE.MeshBasicMaterial({ color: '#ff6a1f', transparent: true, opacity: 0.95, depthTest: false, toneMapped: false }),
    core: new THREE.MeshBasicMaterial({ color: '#fff0b0', depthTest: false, toneMapped: false }),
    glow: new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.9, depthTest: false, toneMapped: false }),
  }), []);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    if (liveCut.phase === 'idle') {
      g.visible = false;
      return;
    }
    g.visible = true;
    const tracing = liveCut.phase === 'trace';
    if (guide.current) {
      guide.current.visible = tracing;
      if (tracing) {
        stretch(guide.current, liveCut.a, liveCut.b, tmp);
        guide.current.scale.x = guide.current.scale.z = 0.008;
      }
    }
    const cutting = liveCut.phase === 'cut';
    if (molten.current && core.current && glow.current && light.current) {
      molten.current.visible = cutting;
      core.current.visible = cutting;
      glow.current.visible = cutting;
      light.current.visible = cutting;
      if (cutting) {
        const flicker = 0.85 + Math.sin(t * 60) * 0.15 + Math.sin(t * 23) * 0.1;
        stretch(molten.current, liveCut.a, liveCut.front, tmp);
        molten.current.scale.x = molten.current.scale.z = 0.026 * flicker + 0.006;
        stretch(core.current, liveCut.a, liveCut.front, tmp);
        core.current.scale.x = core.current.scale.z = 0.009;
        glow.current.position.copy(liveCut.front);
        glow.current.scale.setScalar(0.075 * flicker);
        light.current.position.copy(liveCut.front);
        light.current.intensity = 2.6 * flicker;
      }
    }
  });

  return (
    <group ref={group} visible={false} renderOrder={30}>
      <mesh ref={guide} geometry={cylinder} material={mats.guide} renderOrder={31} />
      <mesh ref={molten} geometry={cylinder} material={mats.molten} renderOrder={32} />
      <mesh ref={core} geometry={cylinder} material={mats.core} renderOrder={33} />
      <mesh ref={glow} material={mats.glow} renderOrder={34}><sphereGeometry args={[1, 12, 12]} /></mesh>
      <pointLight ref={light} color="#ff8a3a" distance={2.4} intensity={0} />
    </group>
  );
}
