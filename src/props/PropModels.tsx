import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { PROP_MODEL_URLS, USE_LEGACY_PROP_VISUALS } from './propModelConfig';
import { BODYWORK_SPECS, type BodyworkKind, type GlassState } from '../invention/bodywork';
import { ROBOTICS_SPECS, type RoboticPartKind } from '../invention/robotics';

/**
 * Modelos estilizados generados en Blender (ver art/blender/build_props.py).
 * Solo reemplazan la representación visual: tamaño, pivote (centro),
 * identificadores, agarre y colliders siguen definidos en GrabbableProps.
 */

const prepared = new WeakSet<THREE.Object3D>();

export function PropModel({ url }: { url: string }) {
  // Sin Draco ni Meshopt: los GLB usan solo WebP + KHR_mesh_quantization (nativos en GLTFLoader).
  const { scene } = useGLTF(url, false, false);

  const model = useMemo(() => {
    if (!prepared.has(scene)) {
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        for (const tex of [mat.map, mat.normalMap, mat.roughnessMap, mat.aoMap]) {
          if (tex) tex.anisotropy = 4;
        }
      });
      prepared.add(scene);
    }
    // clone() comparte geometría, material y texturas entre todas las instancias
    const c = scene.clone(true);
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);

  return <primitive object={model} />;
}

if (!USE_LEGACY_PROP_VISUALS) {
  for (const url of Object.values(PROP_MODEL_URLS)) useGLTF.preload(url, false, false);
}

// ---------- Carrocería modular (chapas, cuña, ventana, puerta, jaula) ----------
// Geometría procedural liviana (sin GLB). Medidas = BODYWORK_SPECS[kind].size.

const bwSteel = new THREE.MeshStandardMaterial({ color: '#8d979d', roughness: 0.55, metalness: 0.55 });
const bwTrim = new THREE.MeshStandardMaterial({ color: '#5e686d', roughness: 0.5, metalness: 0.6 });
const bwRivet = new THREE.MeshStandardMaterial({ color: '#c9a45a', roughness: 0.35, metalness: 0.8 });
const bwTube = new THREE.MeshStandardMaterial({ color: '#c84b36', roughness: 0.45, metalness: 0.4 });
const bwGlass = new THREE.MeshStandardMaterial({
  color: '#a9dcef', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.38, depthWrite: false,
});
const bwCrack = new THREE.LineBasicMaterial({ color: '#f4fbff', transparent: true, opacity: 0.85 });

let wedgeGeometry: THREE.BufferGeometry | null = null;
/** Cuña: perfil triangular (alto atrás, filo adelante) extruido a lo ancho. Centrada en su caja. */
function getWedgeGeometry() {
  if (wedgeGeometry) return wedgeGeometry;
  const [w, h, d] = BODYWORK_SPECS.panel_wedge.size;
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, -h / 2);
  shape.lineTo(d / 2, -h / 2);
  shape.lineTo(-d / 2, h / 2);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  // El perfil está en XY (x = largo, y = alto) y se extruye en Z: pasar a x = ancho, z = largo.
  g.translate(0, 0, -w / 2);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  wedgeGeometry = g;
  return g;
}

let crackGeometry: THREE.BufferGeometry | null = null;
function getCrackGeometry() {
  if (crackGeometry) return crackGeometry;
  const pts: number[] = [];
  const rays = 9;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + 0.3;
    const r1 = 0.18 + (i % 3) * 0.06;
    const r2 = r1 + 0.1;
    pts.push(0.08, 0.05, 0, 0.08 + Math.cos(a) * r1, 0.05 + Math.sin(a) * r1 * 0.8, 0);
    pts.push(0.08 + Math.cos(a) * r1, 0.05 + Math.sin(a) * r1 * 0.8, 0,
      0.08 + Math.cos(a + 0.2) * r2, 0.05 + Math.sin(a + 0.2) * r2 * 0.8, 0);
  }
  crackGeometry = new THREE.BufferGeometry();
  crackGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return crackGeometry;
}

function Rivets({ w, d, y }: { w: number; d: number; y: number }) {
  const spots: [number, number][] = [[-w / 2 + 0.06, -d / 2 + 0.06], [w / 2 - 0.06, -d / 2 + 0.06],
    [-w / 2 + 0.06, d / 2 - 0.06], [w / 2 - 0.06, d / 2 - 0.06]];
  return (
    <>
      {spots.map(([x, z], i) => (
        <mesh key={i} material={bwRivet} position={[x, y, z]}>
          <cylinderGeometry args={[0.022, 0.022, 0.012, 8]} />
        </mesh>
      ))}
    </>
  );
}

/** Tubo de la jaula entre dos puntos. */
function Tube({ a, b, r = 0.028 }: { a: [number, number, number]; b: [number, number, number]; r?: number }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return { pos: va.add(vb).multiplyScalar(0.5), quat: q, len: dir.length() };
  }, [a, b]);
  return (
    <mesh castShadow material={bwTube} position={pos} quaternion={quat}>
      <cylinderGeometry args={[r, r, len, 10]} />
    </mesh>
  );
}

/** Puntos de la jaula: 4 parantes y marco superior (se usan también para sus colliders). */
export function rollCageLayout() {
  const [w, h, d] = BODYWORK_SPECS.roll_cage.size;
  const x = w / 2 - 0.04;
  const z = d / 2 - 0.04;
  const y0 = -h / 2;
  const y1 = h / 2 - 0.03;
  return { w, h, d, x, z, y0, y1 };
}

export function BodyworkVisual({ kind, glass }: { kind: BodyworkKind; glass?: GlassState }) {
  const [w, h, d] = BODYWORK_SPECS[kind].size;
  switch (kind) {
    case 'panel_flat':
      return (
        <group>
          <mesh castShadow receiveShadow material={bwSteel}><boxGeometry args={[w, h, d]} /></mesh>
          <mesh material={bwTrim} position={[0, h / 2 + 0.002, 0]}><boxGeometry args={[w * 0.92, 0.004, 0.05]} /></mesh>
          <Rivets w={w} d={d} y={h / 2 + 0.004} />
        </group>
      );
    case 'panel_wedge':
      return (
        <group>
          <mesh castShadow receiveShadow material={bwSteel} geometry={getWedgeGeometry()} />
          <mesh material={bwTrim} position={[0, -h / 2 + 0.015, 0]}><boxGeometry args={[w, 0.03, d]} /></mesh>
        </group>
      );
    case 'window_frame': {
      const bar = 0.07;
      return (
        <group>
          <mesh castShadow material={bwSteel} position={[0, h / 2 - bar / 2, 0]}><boxGeometry args={[w, bar, d]} /></mesh>
          <mesh castShadow material={bwSteel} position={[0, -h / 2 + bar / 2, 0]}><boxGeometry args={[w, bar, d]} /></mesh>
          <mesh castShadow material={bwSteel} position={[-w / 2 + bar / 2, 0, 0]}><boxGeometry args={[bar, h - bar * 2, d]} /></mesh>
          <mesh castShadow material={bwSteel} position={[w / 2 - bar / 2, 0, 0]}><boxGeometry args={[bar, h - bar * 2, d]} /></mesh>
          {glass !== 'shattered' && (
            <mesh material={bwGlass} userData={{ noPaint: true }}>
              <boxGeometry args={[w - bar * 2, h - bar * 2, 0.012]} />
            </mesh>
          )}
          {glass === 'cracked' && (
            <lineSegments geometry={getCrackGeometry()} material={bwCrack} position={[0, 0, 0.008]} userData={{ noPaint: true }} />
          )}
        </group>
      );
    }
    case 'door_panel':
      return (
        <group>
          <mesh castShadow receiveShadow material={bwSteel}><boxGeometry args={[w, h, d]} /></mesh>
          <mesh material={bwTrim} position={[w / 2 + 0.012, 0.02, d / 2 - 0.14]}><boxGeometry args={[0.025, 0.04, 0.14]} /></mesh>
          <mesh material={bwTrim} position={[0, h / 2 - 0.16, 0]}><boxGeometry args={[w + 0.004, 0.02, d * 0.85]} /></mesh>
        </group>
      );
    case 'roll_cage': {
      const { x, z, y0, y1 } = rollCageLayout();
      return (
        <group>
          {([[-x, -z], [x, -z], [-x, z], [x, z]] as const).map(([px, pz], i) => (
            <group key={`p${i}`}><Tube a={[px, y0, pz]} b={[px, y1, pz]} /></group>
          ))}
          <Tube a={[-x, y1, -z]} b={[x, y1, -z]} />
          <Tube a={[-x, y1, z]} b={[x, y1, z]} />
          <Tube a={[-x, y1, -z]} b={[-x, y1, z]} />
          <Tube a={[x, y1, -z]} b={[x, y1, z]} />
          <Tube a={[-x, y1, -z]} b={[x, y1, z]} r={0.022} />
        </group>
      );
    }
  }
}

// ---------- Piezas robóticas (bisagra, pistón, base giratoria, pinza, cabrestante) ----------
const rbBody = new THREE.MeshStandardMaterial({ color: '#e0a526', roughness: 0.45, metalness: 0.3 });
const rbDark = new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.5, metalness: 0.5 });
const rbChrome = new THREE.MeshStandardMaterial({ color: '#d7dde1', roughness: 0.2, metalness: 0.9 });
const rbRope = new THREE.MeshStandardMaterial({ color: '#c9a45a', roughness: 0.9 });

export function RoboticVisual({ kind }: { kind: RoboticPartKind }) {
  const [w, h, d] = ROBOTICS_SPECS[kind].size;
  switch (kind) {
    case 'hinge':
      return (
        <group>
          <mesh castShadow material={rbBody} position={[0, -h / 4, 0]}><boxGeometry args={[w, h / 2, d]} /></mesh>
          <mesh castShadow material={rbChrome} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[h / 2.6, h / 2.6, w * 1.04, 14]} /></mesh>
          <mesh castShadow material={rbDark} position={[0, h / 4, 0]}><boxGeometry args={[w * 0.6, h / 2, d * 0.8]} /></mesh>
        </group>
      );
    case 'piston':
      return (
        <group>
          <mesh castShadow material={rbBody} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -d * 0.1]}>
            <cylinderGeometry args={[w / 2, w / 2, d * 0.8, 14]} />
          </mesh>
          <mesh castShadow material={rbChrome} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, d * 0.35]}>
            <cylinderGeometry args={[w / 4, w / 4, d * 0.3, 10]} />
          </mesh>
          <mesh castShadow material={rbDark} position={[0, 0, d / 2]}><boxGeometry args={[w * 0.7, h * 0.7, 0.04]} /></mesh>
        </group>
      );
    case 'bearing':
      return (
        <group>
          <mesh castShadow material={rbDark} position={[0, -h / 4, 0]}><cylinderGeometry args={[w / 2, w / 2, h / 2, 20]} /></mesh>
          <mesh castShadow material={rbBody} position={[0, h / 4, 0]}><cylinderGeometry args={[w / 2.3, w / 2.3, h / 2, 20]} /></mesh>
          <mesh material={rbChrome} position={[w / 3, h / 2 + 0.005, 0]}><boxGeometry args={[0.06, 0.01, 0.02]} /></mesh>
        </group>
      );
    case 'claw':
      return (
        <group>
          <mesh castShadow material={rbBody} position={[0, h / 4, 0]}><boxGeometry args={[w * 0.6, h / 2, d * 0.5]} /></mesh>
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh castShadow material={rbChrome} position={[s * w * 0.35, -h / 6, 0]} rotation={[0, 0, s * 0.25]}>
                <boxGeometry args={[0.05, h * 0.65, d * 0.35]} />
              </mesh>
            </group>
          ))}
        </group>
      );
    case 'winch':
      return (
        <group>
          <mesh castShadow material={rbDark} position={[0, -h / 2 + 0.04, 0]}><boxGeometry args={[w, 0.08, d]} /></mesh>
          <mesh castShadow material={rbBody} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[h / 2.4, h / 2.4, w * 0.9, 16]} /></mesh>
          <mesh material={rbRope} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[h / 3, h / 3, w * 0.7, 16]} /></mesh>
          <mesh castShadow material={rbChrome} position={[0, 0, d / 2]}><torusGeometry args={[0.05, 0.015, 6, 12]} /></mesh>
        </group>
      );
  }
}
