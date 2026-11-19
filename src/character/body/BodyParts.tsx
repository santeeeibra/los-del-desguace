import type { CharacterMaterials } from '../characterMaterials';
import { BASE_BODY_PROFILE as P, BODY_REFERENCE as R } from './bodyProfile';
import { GARMENT_GEOMETRY as G } from '../outfits/garmentGeometry';
import type { OutfitConfig } from '../outfits/outfitRegistry';

/**
 * Piezas del cuerpo base compartido + la ropa de cada zona. Cada componente se
 * monta dentro del grupo animado que ya existía (torso, brazo, pierna), así la
 * animación y el rig no cambian. Todas las medidas salen del perfil.
 */

const SEG = P.radialSegments;
/** Solo las capas exteriores de cada zona llevan contorno (ver bodyOutline.ts). */
const OUTLINE = { outline: true };
const GEAR_ANGLES = [0, 1, 2, 3, 4, 5].map((i) => (i * Math.PI) / 3);

interface ZoneProps {
  m: CharacterMaterials;
  outfit: OutfitConfig;
}

/** Torso: cuerpo base (piel) + capa 1 (camisa/remera) + capa 2 (overol/pantalón). */
export function TorsoZone({ m, outfit }: ZoneProps) {
  const t = R.torso;
  const lowerH = t.chestStart - t.bottom;
  const upperH = t.capBase - t.chestStart;
  const s = G.shirt;
  const shirtUpperH = s.capBase - s.bottom;

  return (
    <group>
      {/* Cuerpo base (oculto por la ropa salvo en prendas abiertas) */}
      <mesh material={m.skin} position={[0, t.bottom + lowerH / 2, 0]}>
        <cylinderGeometry args={[t.radiusWaist, t.radiusHips, lowerH, SEG]} />
      </mesh>
      <mesh material={m.skin} position={[0, t.chestStart + upperH / 2, 0]}>
        <cylinderGeometry args={[t.radiusChest, t.radiusWaist, upperH, SEG]} />
      </mesh>
      <mesh material={m.skin} position={[0, t.capBase, 0]} scale={[1, t.capHeight / t.radiusChest, 1]}>
        <sphereGeometry args={[t.radiusChest, SEG, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>

      {/* Cuello: transición cabeza → hombros */}
      <mesh castShadow material={m.skin} position={[0, (R.neck.bottom + R.neck.top) / 2, P.head.pivotZ * 0.5]}>
        <cylinderGeometry args={[R.neck.radiusTop, R.neck.radiusBottom, R.neck.top - R.neck.bottom, SEG]} />
      </mesh>

      {/* Capa 1: camisa / remera con tapa de hombros redondeada y cuello */}
      <mesh userData={OUTLINE} castShadow receiveShadow material={m.shirt} position={[0, s.bottom + shirtUpperH / 2, 0]}>
        <cylinderGeometry args={[s.radiusChest, s.radiusBottom, shirtUpperH, SEG]} />
      </mesh>
      <mesh userData={OUTLINE} castShadow receiveShadow material={m.shirt} position={[0, s.capBase, 0]} scale={[1, s.capHeight / s.radiusChest, 1]}>
        <sphereGeometry args={[s.radiusChest, SEG, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh castShadow material={m.shirt} position={[0, G.collar.y, P.head.pivotZ * 0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[G.collar.radius, G.collar.tube, 10, SEG]} />
      </mesh>

      {outfit.torso === 'overall_bib' && <OverallBib m={m} />}
      {outfit.legs === 'overall_legs' && <OverallHips m={m} />}
      {outfit.legs === 'pants' && <PantsHips m={m} />}
    </group>
  );
}

function OverallHips({ m }: { m: CharacterMaterials }) {
  const o = G.overall;
  const h = o.top - o.bottom;
  return (
    <group>
      <mesh userData={OUTLINE} castShadow receiveShadow material={m.overall} position={[0, o.bottom + h / 2, 0]}>
        <cylinderGeometry args={[o.radiusTop, o.radiusHips, h, SEG]} />
      </mesh>
      {/* Parches cosidos traseros */}
      <mesh material={m.patchLight} position={[-0.08, -0.05, -(o.radiusHips + 0.002)]} rotation={[0, 0, 0.18]}>
        <boxGeometry args={[0.085, 0.08, 0.016]} />
      </mesh>
      <mesh material={m.patchDark} position={[0.09, -0.07, -(o.radiusHips + 0.002)]} rotation={[0, 0, -0.14]}>
        <boxGeometry args={[0.075, 0.075, 0.016]} />
      </mesh>
    </group>
  );
}

function PantsHips({ m }: { m: CharacterMaterials }) {
  const p = G.pants;
  const h = p.top - p.bottom;
  return (
    <mesh userData={OUTLINE} castShadow receiveShadow material={m.overall} position={[0, p.bottom + h / 2, 0]}>
      <cylinderGeometry args={[p.radiusTop, p.radiusHips, h, SEG]} />
    </mesh>
  );
}

function OverallBib({ m }: { m: CharacterMaterials }) {
  const o = G.overall;
  // El peto termina donde empieza la curva de hombros: así no sobresale de perfil.
  const bibY = R.torso.capBase - o.bibHeight / 2 - 0.005;
  // Tiradores apoyados sobre la tapa de hombros (siguen su curva hacia atrás).
  const strapY = R.torso.capBase + 0.025;
  const strapZ = G.shirt.radiusChest - 0.012;
  const backZ = -(G.shirt.radiusChest + 0.012);
  return (
    <group>
      {/* Peto frontal + emblema de engranaje */}
      <mesh castShadow material={m.overall} position={[0, bibY, o.bibZ]} rotation={[-0.06, 0, 0]}>
        <boxGeometry args={[o.bibWidth, o.bibHeight, 0.08]} />
      </mesh>
      <group position={[0, bibY + 0.005, o.bibZ + 0.044]}>
        <mesh material={m.emblem}>
          <torusGeometry args={[0.044, 0.016, 8, 16]} />
        </mesh>
        {GEAR_ANGLES.map((ang) => (
          <mesh key={ang} material={m.emblem} position={[Math.cos(ang) * 0.054, Math.sin(ang) * 0.054, 0]} rotation={[0, 0, ang]}>
            <boxGeometry args={[0.022, 0.02, 0.014]} />
          </mesh>
        ))}
      </group>
      {/* Tiradores delanteros + hebillas */}
      {[-0.1, 0.1].map((x) => (
        <group key={x}>
          <mesh castShadow material={m.overallStrap} position={[x, strapY, strapZ]} rotation={[-0.5, 0, 0]}>
            <boxGeometry args={[0.055, 0.12, 0.03]} />
          </mesh>
          <mesh castShadow material={m.brass} position={[x, bibY + o.bibHeight / 2 - 0.02, o.bibZ + 0.04]}>
            <boxGeometry args={[0.064, 0.04, 0.022]} />
          </mesh>
        </group>
      ))}
      {/* Tiradores cruzados en la espalda */}
      {[0.56, -0.56].map((rz) => (
        <mesh key={rz} castShadow material={m.overallStrap} position={[0, R.torso.capBase - 0.09, backZ]} rotation={[0, 0, rz]}>
          <boxGeometry args={[0.06, 0.2, 0.024]} />
        </mesh>
      ))}
    </group>
  );
}

/** Cinturón (anclaje de herramientas): siempre por fuera de la capa 2. */
export function BeltMeshes({ m }: { m: CharacterMaterials }) {
  const b = G.belt;
  return (
    <>
      <mesh castShadow material={m.belt}>
        <cylinderGeometry args={[b.radius, b.radius + 0.004, b.height, SEG]} />
      </mesh>
      <mesh castShadow material={m.brass} position={[0, 0, b.radius]}>
        <boxGeometry args={[0.08, 0.065, 0.025]} />
      </mesh>
    </>
  );
}

/** Hombro + brazo superior (se oculta en primera persona). */
export function ShoulderZone({ m, outfit, side }: ZoneProps & { side: 1 | -1 }) {
  const a = R.arm;
  const sleeve = outfit.sleeves === 'short';
  const upperY = a.elbowY / 2;
  return (
    <group>
      <mesh userData={OUTLINE} castShadow material={sleeve ? m.shirt : m.skin}>
        <sphereGeometry args={[sleeve ? G.sleeve.shoulderRadius : a.shoulderRadius, SEG, 14]} />
      </mesh>
      <mesh castShadow material={m.skin} position={[side * 0.02, upperY, 0]} rotation={[0, 0, -side * 0.15]}>
        <capsuleGeometry args={[a.upperRadius, a.upperLength * 0.6, 6, SEG]} />
      </mesh>
      {sleeve && (
        <mesh castShadow material={m.shirt} position={[side * 0.016, upperY * 0.8, 0]} rotation={[0, 0, -side * 0.15]}>
          <cylinderGeometry args={[G.sleeve.radiusTop, G.sleeve.radiusBottom, G.sleeve.length, SEG]} />
        </mesh>
      )}
    </group>
  );
}

/** Antebrazo + mano/guante (visible también en primera persona). */
export function ForearmZone({ m, outfit, side }: ZoneProps & { side: 1 | -1 }) {
  const a = R.arm;
  const h = P.arm;
  const forearmY = (a.elbowY + h.handY) / 2;
  const gloves = outfit.hands === 'work_gloves';
  const r = a.handRadius;
  return (
    <group>
      <mesh userData={gloves ? undefined : OUTLINE} castShadow material={m.skin} position={[side * h.handOutX * 0.75, forearmY, h.handZ * 0.4]}>
        <capsuleGeometry args={[a.forearmRadius, a.forearmLength, 6, SEG]} />
      </mesh>
      <group position={[side * h.handOutX, h.handY, h.handZ]}>
        {gloves ? (
          <>
            <mesh castShadow material={m.cuff} position={[0, r * 0.75, -0.015]}>
              <cylinderGeometry args={[G.glove.cuffRadius, G.glove.cuffRadius + 0.01, 0.056, SEG]} />
            </mesh>
            <mesh userData={OUTLINE} castShadow material={m.glove}>
              <sphereGeometry args={[r, SEG, 14]} />
            </mesh>
            <mesh castShadow material={m.glovePad} position={[-side * r * 0.4, 0.01, r * 0.4]} rotation={[0, side * -0.5, 0]}>
              <boxGeometry args={[r * 0.68, r * 0.72, r * 0.58]} />
            </mesh>
            <mesh castShadow material={m.glove} position={[side * r * 0.6, 0.02, r * 0.5]}>
              <sphereGeometry args={[r * 0.45, 12, 10]} />
            </mesh>
          </>
        ) : (
          <mesh userData={OUTLINE} castShadow material={m.skin}>
            <sphereGeometry args={[r * 0.8, SEG, 14]} />
          </mesh>
        )}
      </group>
    </group>
  );
}

/** Pierna base + prenda de pierna + botas. */
export function LegZone({ m, outfit, side }: ZoneProps & { side: 1 | -1 }) {
  const l = P.leg;
  const legCenter = -0.09;
  const isOverall = outfit.legs === 'overall_legs';
  return (
    <group>
      <mesh userData={OUTLINE} castShadow receiveShadow material={m.overall} position={[0, legCenter, 0]}>
        <capsuleGeometry args={[G.leg.radius, l.length, 6, SEG]} />
      </mesh>
      {isOverall && (
        <mesh material={side < 0 ? m.patchDark : m.patchLight} position={[0, -0.09, G.leg.radius - 0.004]} rotation={[side * -0.08, 0, side * 0.13]}>
          <boxGeometry args={[0.088, 0.085, 0.018]} />
        </mesh>
      )}
      {/* Puño arremangado */}
      <mesh castShadow material={isOverall ? m.cuff : m.overall} position={[0, -0.205, 0.015]}>
        <cylinderGeometry args={[G.leg.radius - 0.004, G.leg.radius, 0.055, SEG]} />
      </mesh>
      {outfit.feet === 'work_boots' && (
        <>
          <mesh castShadow material={m.cuff} position={[0, -0.22, 0.095]}>
            <boxGeometry args={[0.08, 0.075, 0.055]} />
          </mesh>
          <mesh userData={OUTLINE} castShadow receiveShadow material={m.boot} position={[0, l.footY, 0.035]}>
            <boxGeometry args={l.bootSize} />
          </mesh>
          <mesh castShadow receiveShadow material={m.sole} position={[0, -0.322, 0.04]}>
            <boxGeometry args={l.soleSize} />
          </mesh>
        </>
      )}
    </group>
  );
}
