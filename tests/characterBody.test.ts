import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BASE_BODY_PROFILE as P,
  BODY_REFERENCE as R,
  BODY_SOCKETS as S,
  GARMENT_CLEARANCE,
} from '../src/character/body/bodyProfile';
import { GARMENT_GEOMETRY as G, bodyRadiusAt } from '../src/character/outfits/garmentGeometry';
import { OUTFITS, getOutfit } from '../src/character/outfits/outfitRegistry';
import {
  HEAD_VARIANTS,
  getHeadVariant,
  headModelToPivot,
  resolveHeadTransform,
} from '../src/character/heads/headRegistry';
import { DEFAULT_CHISPA_APPEARANCE } from '../src/character/characterAppearance';

/** Lee los límites de malla del GLB de cabeza sin three.js (accessor min/max). */
function glbMeshBounds(path: string, mesh: string) {
  const b = readFileSync(path);
  const len = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
  const m = j.meshes.find((x: { name: string }) => x.name === mesh);
  type Prim = { attributes: { POSITION: number } };
  const mins: number[][] = m.primitives.map((p: Prim) => j.accessors[p.attributes.POSITION].min);
  const maxs: number[][] = m.primitives.map((p: Prim) => j.accessors[p.attributes.POSITION].max);
  return {
    min: [0, 1, 2].map((i) => Math.min(...mins.map((v) => v[i]))),
    max: [0, 1, 2].map((i) => Math.max(...maxs.map((v) => v[i]))),
  };
}

function glbFaceRig(path: string): string {
  const b = readFileSync(path);
  const len = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
  const node = j.nodes.find((x: { name: string }) => x.name === 'CabezaBase');
  return (j.scenes[0].extras ?? node.extras).face_rig;
}

const head = glbMeshBounds('public/models/cabeza_base_v002.glb', 'Head');

describe('proporciones del cuerpo base', () => {
  const t = resolveHeadTransform(getHeadVariant('base'));
  const headWidth = (head.max[0] - head.min[0]) * t.scale;

  it('el torso es al menos tan ancho como la cabeza (antes: cabeza 20 % más ancha)', () => {
    expect((2 * P.torso.radiusChest) / headWidth).toBeGreaterThanOrEqual(1.0);
  });

  it('el torso ya no es un trapecio invertido', () => {
    expect(P.torso.radiusChest).toBeGreaterThanOrEqual(P.torso.radiusWaist);
    expect(P.torso.radiusHips - P.torso.radiusChest).toBeLessThanOrEqual(0.01);
  });

  it('ancho de hombros ≈ 1,5–1,7 cabezas', () => {
    const span = 2 * (P.arm.shoulderX + P.arm.shoulderRadius);
    expect(span / headWidth).toBeGreaterThan(1.5);
    expect(span / headWidth).toBeLessThan(1.7);
  });

  it('brazo ≈ 2/3 del torso y la mano no duplica el antebrazo', () => {
    const torsoH = P.torso.top - P.torso.bottom;
    expect(-P.arm.handY / torsoH).toBeGreaterThan(0.6);
    expect(P.arm.handRadius / P.arm.forearmRadius).toBeLessThan(1.7);
  });

  it('la altura total sigue en ~2,4 cabezas (estilo caricaturesco)', () => {
    const headTopY = P.torso.y + t.pivot[1] + head.max[1] * t.scale + t.offset[1];
    const headH = (head.max[1] - head.min[1]) * t.scale;
    expect(headTopY / headH).toBeGreaterThan(2.2);
    expect(headTopY / headH).toBeLessThan(2.7);
  });

  it('los pies siguen apoyados en y = 0 (no cambia visualYOffset)', () => {
    const soleBottom = P.leg.hipY - 0.322 - P.leg.soleSize[1] / 2;
    expect(Math.abs(soleBottom)).toBeLessThan(0.005);
  });

  it('sockets simétricos', () => {
    expect(S.shoulderL[0]).toBe(-S.shoulderR[0]);
    expect(S.hipL[0]).toBe(-S.hipR[0]);
    expect(S.handL[0]).toBe(-S.handR[0]);
  });

  it('primera persona conserva los valores de reposo calibrados', () => {
    expect(P.firstPerson).toEqual({ shoulderX: 0.28, shoulderY: 0.08, armScale: 0.84 });
  });
});

describe('cabezas intercambiables', () => {
  const fit = JSON.parse(glbFaceRig('public/models/cabeza_base_v002.glb')).fit_by_shape;

  it('el registro coincide con las medidas reales del GLB (muñón de cuello y barbilla)', () => {
    for (const v of Object.values(HEAD_VARIANTS)) {
      if (!v.modelUrl.endsWith('cabeza_base_v002.glb')) continue;
      expect(v.neckJoinModelY).toBeCloseTo(head.min[1], 2);
      const key = v.shapePreset === 'base' ? 'base' : `shape_${v.shapePreset}`;
      expect(v.chinFrontModelY).toBeCloseTo(fit[key].chin_bottom, 3);
    }
  });

  /** Altura de la tapa de hombros de la camisa a una distancia radial dada. */
  const shirtCapY = (r: number) =>
    G.shirt.capBase + G.shirt.capHeight * Math.sqrt(Math.max(0, 1 - (r / G.shirt.radiusChest) ** 2));

  it.each(Object.keys(HEAD_VARIANTS))(
    '"%s": la unión con el cuello queda oculta y la barbilla libre por encima del cuello de camisa',
    (id) => {
      const v = HEAD_VARIANTS[id];
      const t = resolveHeadTransform(v);
      const joinY = t.pivot[1] + headModelToPivot(t, 0, v.neckJoinModelY, 0)[1];
      const chinY = t.pivot[1] + headModelToPivot(t, 0, v.chinFrontModelY, 0)[1];
      // La base del muñón se hunde en la tapa de hombros: sin hueco visible.
      expect(joinY).toBeLessThan(shirtCapY(P.neck.radiusBottom));
      // La barbilla visible no atraviesa el cuello de la camisa ni la tapa de hombros.
      expect(chinY).toBeGreaterThan(G.collar.y + G.collar.tube);
      expect(chinY).toBeGreaterThan(shirtCapY(G.collar.radius));
      // Y el cuello se ve, pero corto (estilo caricaturesco).
      expect(chinY - shirtCapY(P.neck.radiusBottom)).toBeLessThan(0.08);
    }
  );

  it('id desconocido cae en la cabeza base (no rompe variantes)', () => {
    expect(getHeadVariant('no-existe').id).toBe('base');
    expect(getHeadVariant(undefined).id).toBe('base');
  });

  it('los ajustes por variante están acotados', () => {
    const t = resolveHeadTransform({ ...HEAD_VARIANTS.base, adjust: { scale: 9, offset: [1, 1, 1] } });
    expect(t.scale).toBeLessThanOrEqual(1.25);
    expect(Math.abs(t.offset[0])).toBeLessThanOrEqual(0.04);
    expect(Math.abs(t.offset[2])).toBeLessThanOrEqual(0.04);
  });

  it('casco y gafas conservan su posición relativa a la cabeza', () => {
    // Antes: anchor = p*1.08 + (0,-0.91,-0.01) dentro de un grupo en z 0.02.
    const t = resolveHeadTransform(HEAD_VARIANTS.base);
    const [x, y, z] = headModelToPivot(t, 0, 1.0403, -0.0034);
    const chin = headModelToPivot(t, 0, HEAD_VARIANTS.base.neckJoinModelY, 0);
    expect(x).toBe(0);
    expect(y - chin[1]).toBeCloseTo((1.0403 - 0.69) * 1.08, 6);
    expect(z + t.pivot[2]).toBeCloseTo(-0.0034 * 1.08 - 0.01 + 0.02, 6);
  });
});

describe('ropa modular sin intersecciones', () => {
  const sample = (lo: number, hi: number, n = 20) =>
    Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
  const lerpR = (y: number, y0: number, y1: number, r0: number, r1: number) =>
    r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  const shirtR = (y: number) =>
    lerpR(y, G.shirt.bottom, G.shirt.capBase, G.shirt.radiusBottom, G.shirt.radiusChest);

  it('capa 1 (camisa/remera) queda por fuera del cuerpo con holgura', () => {
    for (const y of sample(G.shirt.bottom, G.shirt.capBase)) {
      expect(shirtR(y) - bodyRadiusAt(R, y)).toBeGreaterThanOrEqual(GARMENT_CLEARANCE - 1e-3);
    }
    expect(G.shirt.capHeight).toBeGreaterThan(R.torso.capHeight);
  });

  it.each(['overall', 'pants'] as const)('capa 2 (%s) queda por fuera del cuerpo y de la camisa', (k) => {
    const g = G[k];
    for (const y of sample(g.bottom, g.top)) {
      const r = lerpR(y, g.bottom, g.top, g.radiusHips, g.radiusTop);
      expect(r - bodyRadiusAt(R, y)).toBeGreaterThanOrEqual(2 * GARMENT_CLEARANCE);
      if (y >= G.shirt.bottom) expect(r - shirtR(y)).toBeGreaterThanOrEqual(GARMENT_CLEARANCE - 1e-3);
    }
  });

  it('el cinturón va por fuera de cualquier prenda de capa 2', () => {
    for (const g of [G.overall, G.pants]) {
      const r = lerpR(G.belt.y, g.bottom, g.top, g.radiusHips, g.radiusTop);
      expect(G.belt.radius - r).toBeGreaterThanOrEqual(GARMENT_CLEARANCE);
    }
  });

  it('mangas y piernas cubren el cuerpo con holgura', () => {
    expect(G.sleeve.shoulderRadius - P.arm.shoulderRadius).toBeGreaterThanOrEqual(GARMENT_CLEARANCE);
    expect(G.sleeve.radiusBottom - P.arm.upperRadius).toBeGreaterThan(0);
    expect(G.leg.radius - P.leg.radius).toBeGreaterThanOrEqual(GARMENT_CLEARANCE);
  });

  it('las prendas solo recolorean claves de paleta existentes', () => {
    const keys = Object.keys(DEFAULT_CHISPA_APPEARANCE.palette);
    for (const o of Object.values(OUTFITS)) {
      for (const k of Object.keys(o.palette ?? {})) expect(keys).toContain(k);
    }
    expect(getOutfit('no-existe').id).toBe('overol');
  });
});

describe('regresión: animación y física', () => {
  const src = readFileSync('src/character/InventorCharacter.tsx', 'utf8');

  it('useFrame usa el mismo perfil que el JSX para los hombros', () => {
    expect(src).toContain('BODY.firstPerson.shoulderX : BODY.arm.shoulderX');
    expect(src).toContain('BODY.firstPerson.shoulderY : BODY.arm.shoulderY');
    expect(src).toMatch(/ref=\{leftArmRef\} position=\{S\.shoulderL\}/);
    expect(src).toMatch(/ref=\{rightArmRef\} position=\{S\.shoulderR\}/);
  });

  it('no quedan offsets de cuerpo o cabeza escritos a mano', () => {
    expect(src).not.toMatch(/HEAD_MODEL_(SCALE|OFFSET)/);
    expect(src).not.toMatch(/\?\s*0\.28\s*:\s*0\.25/);
    expect(src).not.toMatch(/\?\s*0\.08\s*:\s*0\.14/);
  });

  it('el grupo torso y el anclaje de carga siguen en su sitio', () => {
    expect(P.torso.y).toBe(0.58);
    expect(src).toContain('<group ref={carryAnchorRef} position={[0, 0.12, 0.65]} />');
  });

  it('las dimensiones de colisión no cambian', () => {
    const cfg = readFileSync('src/config/visualConfig.ts', 'utf8');
    expect(cfg).toMatch(/capsuleHalfHeight: 0\.34,\s*capsuleRadius: 0\.32,\s*floatHeight: 0\.2,\s*visualYOffset: -0\.66/);
  });
});
