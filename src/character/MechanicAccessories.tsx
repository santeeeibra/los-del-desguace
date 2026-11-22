import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CharacterMaterials } from './characterMaterials';
import type { HeadTransform } from './heads/headRegistry';
import {
  createCigaretteSmokePool,
  getGreaseMaterialParams,
  stepCigaretteSmoke,
  type MechanicStyleConfig,
} from './mechanicStyle';

/**
 * Accesorios 3D del estilo "Mecánicos Locos" (solo decorativos, sin colliders).
 * Se monta DENTRO del grupo de la cabeza (pivote en el cuello). Todo lo de la cara está
 * medido en espacio del modelo de cabeza (mismo que `anchor_glasses` / `anchor_hat`) y se
 * escala con `headTransform`, así sigue a las 4 formas de cabeza.
 */

interface MechanicAccessoriesProps {
  style: MechanicStyleConfig;
  materials: CharacterMaterials;
  headTransform: HeadTransform;
  /** True mientras se suelda/amola/corta: baja la careta o las antiparras (con un poco de retardo). */
  protectiveActiveRef: RefObject<boolean>;
  /** True durante la exhalación del gesto "Pitada Pensativa". */
  smokeBurstRef: RefObject<boolean>;
}

// Referencias del modelo de cabeza (face_rig de cabeza_base_v002): ojos 0.988, sombrero 1.04, pelo 1.165.
const EYE_Y = 0.99;
const EYE_Z = 0.222;
const FOREHEAD_Y = 1.1;
const MOUTH_POS: [number, number, number] = [0.032, 0.845, 0.205];
const LERP_RATE = 11;

interface MechanicMaterials {
  metal: THREE.MeshStandardMaterial;
  darkMetal: THREE.MeshStandardMaterial;
  visor: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  paper: THREE.MeshStandardMaterial;
  filter: THREE.MeshStandardMaterial;
  ember: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  smudge: THREE.MeshBasicMaterial;
  smoke: THREE.MeshBasicMaterial[];
}

const SMOKE_GEO = new THREE.SphereGeometry(1, 8, 6);
const SMUDGE_GEO = new THREE.SphereGeometry(1, 10, 8);

function useMechanicMaterials(accentColor: string, smudgeOpacity: number): MechanicMaterials {
  const mats = useMemo<MechanicMaterials>(
    () => ({
      metal: new THREE.MeshStandardMaterial({ color: '#8c9296', roughness: 0.45, metalness: 0.7 }),
      darkMetal: new THREE.MeshStandardMaterial({ color: '#3b3f44', roughness: 0.5, metalness: 0.6 }),
      visor: new THREE.MeshStandardMaterial({ color: '#143a2c', roughness: 0.15, metalness: 0.4 }),
      accent: new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.85, metalness: 0 }),
      paper: new THREE.MeshStandardMaterial({ color: '#f1ecdf', roughness: 0.9 }),
      filter: new THREE.MeshStandardMaterial({ color: '#d7893c', roughness: 0.85 }),
      ember: new THREE.MeshStandardMaterial({
        color: '#ff7a1f',
        emissive: new THREE.Color('#ff5a10'),
        emissiveIntensity: 0.5,
        roughness: 0.6,
      }),
      wood: new THREE.MeshStandardMaterial({ color: '#c79a5e', roughness: 0.8 }),
      smudge: new THREE.MeshBasicMaterial({
        color: '#1d1714',
        transparent: true,
        opacity: smudgeOpacity,
        depthWrite: false,
      }),
      smoke: Array.from(
        { length: 5 },
        () => new THREE.MeshBasicMaterial({ color: '#d9d9d9', transparent: true, opacity: 0, depthWrite: false })
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accentColor, smudgeOpacity]
  );
  useEffect(
    () => () => {
      const { smoke, ...single } = mats;
      Object.values(single).forEach((m: THREE.Material) => m.dispose());
      smoke.forEach((m) => m.dispose());
    },
    [mats]
  );
  return mats;
}

export function MechanicAccessories({
  style,
  materials,
  headTransform,
  protectiveActiveRef,
  smokeBurstRef,
}: MechanicAccessoriesProps) {
  const grease = getGreaseMaterialParams(style.greaseLevel);
  const mats = useMechanicMaterials(style.accentColor, grease.smudgeOpacity);

  const gogglesRef = useRef<THREE.Group>(null);
  const maskRef = useRef<THREE.Group>(null);
  const smokeRefs = useRef<Array<THREE.Mesh | null>>([]);
  const emberRef = useRef<THREE.Mesh>(null);
  const smokePool = useMemo(() => createCigaretteSmokePool(), []);

  const hasGoggles = style.headgear === 'welding_goggles_up' || style.headgear === 'welding_goggles_down';
  const hasMask = style.headgear === 'welding_mask_up' || style.headgear === 'welding_mask_down';
  const maskUpAtRest = style.headgear === 'welding_mask_up';
  const gogglesUpAtRest = style.headgear === 'welding_goggles_up';

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const k = 1 - Math.exp(-LERP_RATE * dt);
    const protective = protectiveActiveRef.current === true;

    // Antiparras: suben a la frente o bajan a los ojos (se bajan solas al soldar).
    if (gogglesRef.current && hasGoggles) {
      const down = style.headgear === 'welding_goggles_down' || protective;
      const g = gogglesRef.current;
      g.position.y = THREE.MathUtils.lerp(g.position.y, down ? EYE_Y : FOREHEAD_Y, k);
      g.position.z = THREE.MathUtils.lerp(g.position.z, down ? EYE_Z : EYE_Z - 0.035, k);
      g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, down ? 0 : -0.55, k);
    }

    // Careta: gira sobre la frente (arriba = sobre la cabeza, abajo = tapando la cara).
    if (maskRef.current && hasMask) {
      const down = style.headgear === 'welding_mask_down' || protective;
      maskRef.current.rotation.x = THREE.MathUtils.lerp(maskRef.current.rotation.x, down ? 0 : 1.85, k);
    }

    // Humo y brasa del cigarrillo (pool fijo de 5 partículas, sin allocations).
    if (style.mouthProp === 'cigarette') {
      stepCigaretteSmoke(smokePool, dt, true, smokeBurstRef.current === true);
      for (let i = 0; i < smokePool.puffs.length; i++) {
        const mesh = smokeRefs.current[i];
        const p = smokePool.puffs[i];
        if (!mesh) continue;
        mesh.visible = p.active;
        if (p.active) {
          mesh.position.set(p.x, p.y, p.z);
          mesh.scale.setScalar(p.scale);
          mats.smoke[i].opacity = p.opacity;
        }
      }
      mats.ember.emissiveIntensity = 0.3 + smokePool.emberGlow * 1.6;
    }
  });

  const sGreaseSmudges = grease.smudgeOpacity > 0;
  const heavy = style.greaseLevel === 'heavy';

  return (
    <>
      {/* Todo lo de la cara va en espacio de modelo de cabeza */}
      <group position={headTransform.offset} scale={headTransform.scale}>
        {/* ANTIPARRAS DE SOLDADOR (animadas) */}
        {hasGoggles && (
          <group
            ref={gogglesRef}
            position={[0, gogglesUpAtRest ? FOREHEAD_Y : EYE_Y, gogglesUpAtRest ? EYE_Z - 0.035 : EYE_Z]}
            rotation={[gogglesUpAtRest ? -0.55 : 0, 0, 0]}
          >
            <mesh material={materials.goggleStrap} position={[0, 0, -0.2]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.2, 0.014, 6, 24]} />
            </mesh>
            {[-0.06, 0.06].map((gx) => (
              <group key={gx} position={[gx, 0, 0]}>
                <mesh castShadow material={mats.darkMetal} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.052, 0.056, 0.05, 14]} />
                </mesh>
                <mesh material={mats.visor} position={[0, 0, 0.026]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.04, 0.04, 0.014, 14]} />
                </mesh>
              </group>
            ))}
            <mesh castShadow material={mats.accent} position={[0, 0, 0.005]}>
              <boxGeometry args={[0.04, 0.02, 0.03]} />
            </mesh>
          </group>
        )}

        {/* CARETA DE SOLDAR (bisagra en la frente) */}
        {hasMask && (
          <group
            ref={maskRef}
            position={[0, FOREHEAD_Y - 0.03, 0.06]}
            rotation={[maskUpAtRest ? 1.85 : 0, 0, 0]}
          >
            {/* Casco-pantalla: tramo de cilindro abierto, cuelga hacia abajo desde la bisagra */}
            <mesh castShadow material={mats.metal} position={[0, -0.14, -0.06]}>
              <cylinderGeometry args={[0.225, 0.225, 0.3, 20, 1, true, -0.95, 1.9]} />
            </mesh>
            <mesh castShadow material={mats.darkMetal} position={[0, 0.005, -0.06]}>
              <boxGeometry args={[0.36, 0.022, 0.05]} />
            </mesh>
            {/* Visor oscuro */}
            <mesh material={mats.visor} position={[0, -0.095, 0.172]}>
              <boxGeometry args={[0.21, 0.058, 0.014]} />
            </mesh>
            <mesh material={mats.accent} position={[0, -0.255, 0.16]}>
              <boxGeometry args={[0.15, 0.02, 0.02]} />
            </mesh>
          </group>
        )}

        {/* CASCO DE CHAPA REMACHADO */}
        {style.headgear === 'scrap_helmet' && (
          <group position={[0, 1.04, 0]} rotation={[-0.1, 0, 0]}>
            <mesh castShadow material={mats.metal}>
              <sphereGeometry args={[0.215, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.56]} />
            </mesh>
            <mesh castShadow material={mats.darkMetal} position={[0, 0.02, 0.05]} rotation={[0.12, 0, 0]}>
              <boxGeometry args={[0.28, 0.026, 0.3]} />
            </mesh>
            <mesh castShadow material={mats.accent} position={[0, 0.205, 0]}>
              <boxGeometry args={[0.05, 0.04, 0.3]} />
            </mesh>
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2;
              return (
                <mesh key={i} material={mats.darkMetal} position={[Math.sin(a) * 0.213, 0.065, Math.cos(a) * 0.213]}>
                  <sphereGeometry args={[0.013, 6, 6]} />
                </mesh>
              );
            })}
          </group>
        )}

        {/* PELO CHAMUSCADO: mechones parados sobre la coronilla */}
        {style.headgear === 'singed_hair' && (
          <group position={[0, 1.13, -0.005]}>
            {Array.from({ length: 9 }, (_, i) => {
              const a = (i / 9) * Math.PI * 2;
              const ring = i % 3 === 0 ? 0 : 0.085;
              const tilt = i % 3 === 0 ? 0.1 : 0.55;
              return (
                <mesh
                  key={i}
                  castShadow
                  material={i % 2 === 0 ? materials.hairShadow : materials.hair}
                  position={[Math.sin(a) * ring, 0.045, Math.cos(a) * ring]}
                  rotation={[Math.cos(a) * tilt, 0, -Math.sin(a) * tilt]}
                >
                  <coneGeometry args={[0.03, 0.14 + (i % 4) * 0.025, 6]} />
                </mesh>
              );
            })}
          </group>
        )}

        {/* MANCHAS DE GRASA / HOLLÍN en mejillas y frente */}
        {sGreaseSmudges && (
          <group>
            {[
              [-0.085, 0.935, 0.178, 0.034, 0.02],
              [0.092, 0.92, 0.172, 0.028, 0.018],
              ...(heavy
                ? [
                    [0.02, 1.03, 0.195, 0.04, 0.016],
                    [-0.05, 0.875, 0.19, 0.03, 0.02],
                    [0.06, 0.86, 0.19, 0.026, 0.016],
                  ]
                : []),
            ].map(([x, y, z, rx, ry], i) => (
              <mesh
                key={i}
                geometry={SMUDGE_GEO}
                material={mats.smudge}
                position={[x, y, z]}
                scale={[rx, ry, 0.006]}
                rotation={[0, x * 1.5, 0.4 * (i % 2 ? 1 : -1)]}
              />
            ))}
          </group>
        )}

        {/* ACCESORIOS BUCALES */}
        {style.mouthProp !== 'none' && (
          <group position={MOUTH_POS}>
            {style.mouthProp === 'cigarette' && (
              <group rotation={[-0.12, 0.28, 0]}>
                <mesh material={mats.filter} position={[0, 0, 0.012]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.0085, 0.0085, 0.028, 8]} />
                </mesh>
                <mesh material={mats.paper} position={[0, 0, 0.065]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.0085, 0.0085, 0.07, 8]} />
                </mesh>
                <mesh ref={emberRef} material={mats.ember} position={[0, 0, 0.102]}>
                  <sphereGeometry args={[0.0095, 8, 6]} />
                </mesh>
                {/* Humo: 5 esferas recicladas, posición local respecto de la punta */}
                <group position={[0, 0.005, 0.105]}>
                  {mats.smoke.map((m, i) => (
                    <mesh
                      key={i}
                      ref={(el) => {
                        smokeRefs.current[i] = el;
                      }}
                      geometry={SMOKE_GEO}
                      material={m}
                      visible={false}
                    />
                  ))}
                </group>
              </group>
            )}
            {style.mouthProp === 'toothpick' && (
              <mesh material={mats.wood} position={[0, 0, 0.026]} rotation={[Math.PI / 2 - 0.1, 0.3, 0]}>
                <cylinderGeometry args={[0.004, 0.003, 0.075, 6]} />
              </mesh>
            )}
            {style.mouthProp === 'bolt' && (
              <group rotation={[-0.08, 0.2, 0]}>
                <mesh material={materials.brass} position={[0, 0, 0.034]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.007, 0.007, 0.06, 8]} />
                </mesh>
                <mesh castShadow material={mats.metal} position={[0, 0, 0.068]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.016, 0.016, 0.014, 6]} />
                </mesh>
              </group>
            )}
          </group>
        )}
      </group>

      {/* PAÑUELO AL CUELLO (espacio del pivote de cabeza = cuello) */}
      {style.neckOrBack === 'bandana' && (
        <group position={[0, -0.05, 0.005]}>
          <mesh castShadow material={mats.accent} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.8]}>
            <torusGeometry args={[0.098, 0.026, 8, 18]} />
          </mesh>
          {/* Nudo / punta caída adelante */}
          <mesh castShadow material={mats.accent} position={[0, -0.05, 0.1]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.05, 0.1, 4]} />
          </mesh>
        </group>
      )}
    </>
  );
}
