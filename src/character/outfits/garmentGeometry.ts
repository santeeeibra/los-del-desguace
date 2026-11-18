import { BODY_REFERENCE, GARMENT_CLEARANCE, type BodyReference } from '../body/bodyProfile';

/**
 * Dimensiones de prendas derivadas del cuerpo base. Capa 1 = prenda pegada
 * (remera, camisa); capa 2 = prenda que va encima (overol, pantalón);
 * capa 3 = accesorios ceñidos (cinturón). Cada capa suma al menos
 * GARMENT_CLEARANCE sobre la anterior, así no hay intersecciones visibles.
 */
export const LAYER_STEP = GARMENT_CLEARANCE * 2;

export function layerRadius(bodyRadius: number, layer: 1 | 2 | 3): number {
  return bodyRadius + GARMENT_CLEARANCE + (layer - 1) * LAYER_STEP;
}

export interface GarmentGeometry {
  shirt: {
    layer: 1;
    bottom: number;
    radiusBottom: number;
    capBase: number;
    radiusWaist: number;
    radiusChest: number;
    capHeight: number;
  };
  overall: {
    layer: 2;
    bottom: number;
    top: number;
    radiusHips: number;
    radiusTop: number;
    bibWidth: number;
    bibHeight: number;
    bibZ: number;
  };
  pants: {
    layer: 2;
    bottom: number;
    top: number;
    radiusHips: number;
    radiusTop: number;
  };
  belt: { layer: 3; radius: number; height: number; y: number };
  collar: { y: number; radius: number; tube: number };
  sleeve: { radiusTop: number; radiusBottom: number; length: number; shoulderRadius: number };
  leg: { radius: number };
  glove: { radius: number; cuffRadius: number };
}

function radiusAt(ref: BodyReference, y: number): number {
  const t = ref.torso;
  if (y <= t.chestStart) {
    const k = (y - t.bottom) / (t.chestStart - t.bottom);
    return t.radiusHips + (t.radiusWaist - t.radiusHips) * k;
  }
  const k = Math.min(1, (y - t.chestStart) / (t.capBase - t.chestStart));
  return t.radiusWaist + (t.radiusChest - t.radiusWaist) * k;
}

export function deriveGarmentGeometry(ref: BodyReference = BODY_REFERENCE): GarmentGeometry {
  const t = ref.torso;
  const shirtBottom = -0.04;
  const overallTop = t.chestStart + 0.04;
  const pantsTop = 0.0;
  const beltY = -0.05;
  const chest2 = layerRadius(t.radiusChest, 2);
  return {
    shirt: {
      layer: 1,
      bottom: shirtBottom,
      radiusBottom: layerRadius(radiusAt(ref, shirtBottom), 1),
      capBase: t.capBase,
      radiusWaist: layerRadius(t.radiusWaist, 1),
      radiusChest: layerRadius(t.radiusChest, 1),
      capHeight: t.capHeight + GARMENT_CLEARANCE,
    },
    overall: {
      layer: 2,
      bottom: t.bottom,
      top: overallTop,
      radiusHips: layerRadius(t.radiusHips, 2),
      radiusTop: layerRadius(radiusAt(ref, overallTop), 2),
      bibWidth: 0.25,
      bibHeight: 0.17,
      bibZ: chest2 - 0.03,
    },
    pants: {
      layer: 2,
      bottom: t.bottom,
      top: pantsTop,
      radiusHips: layerRadius(t.radiusHips, 2),
      radiusTop: layerRadius(radiusAt(ref, pantsTop), 2),
    },
    belt: {
      layer: 3,
      radius: layerRadius(radiusAt(ref, beltY), 3),
      height: 0.055,
      y: beltY,
    },
    collar: {
      y: ref.neck.bottom + 0.035,
      radius: ref.neck.radiusBottom + 0.03,
      tube: 0.03,
    },
    sleeve: {
      shoulderRadius: layerRadius(ref.arm.shoulderRadius, 1),
      radiusTop: layerRadius(ref.arm.upperRadius, 1),
      radiusBottom: layerRadius(ref.arm.upperRadius, 1) - 0.004,
      length: ref.arm.upperLength,
    },
    leg: { radius: layerRadius(ref.leg.radius, 1) },
    glove: { radius: ref.arm.handRadius, cuffRadius: layerRadius(ref.arm.forearmRadius, 2) + 0.012 },
  };
}

export const GARMENT_GEOMETRY = deriveGarmentGeometry();

/** Radio del cuerpo base a una altura dada del torso (para pruebas de holgura). */
export { radiusAt as bodyRadiusAt };
