/**
 * Perfil de proporciones del cuerpo base compartido de Los del Desguace.
 *
 * ÚNICA fuente de medidas del cuerpo. El JSX y el `useFrame` de
 * `InventorCharacter` leen estos valores; las cabezas y prendas solo pueden
 * pedir ajustes acotados (ver `HEAD_OVERRIDE_LIMITS` y `GARMENT_CLEARANCE`).
 *
 * Unidades: metros, espacio local del personaje con los pies en y = 0
 * (antes de `CHARACTER_DIMENSIONS.visualYOffset`). Las alturas de grupo son
 * relativas a su padre, igual que en la jerarquía de three.js.
 */

export interface BodyProfile {
  /** Grupo torso (pivote de brazos, cabeza, anclajes de carga/mochila). */
  torso: {
    y: number;
    /** Extremos del volumen del torso, relativos a `torso.y`. */
    bottom: number;
    top: number;
    radiusHips: number;
    radiusWaist: number;
    radiusChest: number;
    /** Altura relativa donde el torso pasa de cintura a pecho. */
    chestStart: number;
    /** Aplastamiento vertical de la tapa redondeada de hombros (0..1). */
    shoulderCapSquash: number;
  };
  neck: {
    /** Base y tope del cuello relativos a `torso.y`. */
    bottom: number;
    top: number;
    radiusBottom: number;
    radiusTop: number;
  };
  head: {
    /** Pivote de la cabeza = tope del cuello (rotaciones de mirada). */
    pivotZ: number;
    /** Cuánto baja la base del cuello de la cabeza por debajo del pivote (unión oculta). */
    neckJoinBelowPivot: number;
  };
  arm: {
    shoulderX: number;
    shoulderY: number;
    shoulderRadius: number;
    upperRadius: number;
    upperLength: number;
    forearmRadius: number;
    forearmLength: number;
    /** Desplazamiento lateral de la mano hacia afuera (signo según lado). */
    handOutX: number;
    handY: number;
    handZ: number;
    handRadius: number;
  };
  leg: {
    hipX: number;
    hipY: number;
    radius: number;
    length: number;
    footY: number;
    bootSize: [number, number, number];
    soleSize: [number, number, number];
  };
  /** Valores de reposo en primera persona (mismos que usaba el juego). */
  firstPerson: {
    shoulderX: number;
    shoulderY: number;
    armScale: number;
  };
  /** Resolución de las primitivas redondeadas (coherencia con la cabeza lisa). */
  radialSegments: number;
}

export const BASE_BODY_PROFILE: BodyProfile = {
  torso: {
    y: 0.58,
    bottom: -0.19,
    top: 0.26,
    radiusHips: 0.255,
    radiusWaist: 0.245,
    radiusChest: 0.25,
    chestStart: 0.06,
    shoulderCapSquash: 0.42,
  },
  neck: {
    bottom: 0.22,
    top: 0.31,
    radiusBottom: 0.1,
    radiusTop: 0.088,
  },
  head: {
    pivotZ: 0.01,
    neckJoinBelowPivot: 0.075,
  },
  arm: {
    shoulderX: 0.3,
    shoulderY: 0.17,
    shoulderRadius: 0.1,
    upperRadius: 0.085,
    upperLength: 0.1,
    forearmRadius: 0.06,
    forearmLength: 0.1,
    handOutX: 0.055,
    handY: -0.3,
    handZ: 0.03,
    handRadius: 0.095,
  },
  leg: {
    hipX: 0.145,
    hipY: 0.34,
    radius: 0.11,
    length: 0.11,
    footY: -0.265,
    bootSize: [0.2, 0.1, 0.26],
    soleSize: [0.216, 0.038, 0.285],
  },
  firstPerson: {
    shoulderX: 0.28,
    shoulderY: 0.08,
    armScale: 0.84,
  },
  radialSegments: 24,
};

/** Holgura mínima entre la superficie del cuerpo y cualquier prenda (README: 5 mm). */
export const GARMENT_CLEARANCE = 0.005;

/** Límites para los ajustes por variante de cabeza: evitan valores arbitrarios. */
export const HEAD_OVERRIDE_LIMITS = {
  scale: [0.85, 1.25] as const,
  offset: 0.04,
};

/**
 * Medidas de referencia por zona, derivadas del perfil. Las prendas se
 * construyen a partir de esto (radio de cuerpo + holgura) en lugar de
 * repetir números.
 */
export interface BodyReference {
  torso: {
    bottom: number;
    top: number;
    chestStart: number;
    radiusHips: number;
    radiusWaist: number;
    radiusChest: number;
    capHeight: number;
    /** Donde termina el cilindro del pecho y empieza la tapa redondeada de hombros. */
    capBase: number;
  };
  neck: { bottom: number; top: number; radiusBottom: number; radiusTop: number };
  arm: {
    upperRadius: number;
    upperLength: number;
    forearmRadius: number;
    forearmLength: number;
    shoulderRadius: number;
    handRadius: number;
    /** Altura relativa al hombro donde termina la manga corta / empieza el antebrazo. */
    elbowY: number;
    wristY: number;
  };
  leg: { radius: number; length: number; top: number; ankleY: number };
}

export function deriveBodyReference(p: BodyProfile): BodyReference {
  const capHeight = p.torso.radiusChest * p.torso.shoulderCapSquash;
  const elbowY = -(p.arm.shoulderRadius * 0.4 + p.arm.upperLength);
  return {
    torso: {
      bottom: p.torso.bottom,
      top: p.torso.top,
      chestStart: p.torso.chestStart,
      radiusHips: p.torso.radiusHips,
      radiusWaist: p.torso.radiusWaist,
      radiusChest: p.torso.radiusChest,
      capHeight,
      capBase: p.torso.top - capHeight,
    },
    neck: { ...p.neck },
    arm: {
      upperRadius: p.arm.upperRadius,
      upperLength: p.arm.upperLength,
      forearmRadius: p.arm.forearmRadius,
      forearmLength: p.arm.forearmLength,
      shoulderRadius: p.arm.shoulderRadius,
      handRadius: p.arm.handRadius,
      elbowY,
      wristY: p.arm.handY + p.arm.handRadius * 0.7,
    },
    leg: {
      radius: p.leg.radius,
      length: p.leg.length,
      top: 0.08,
      ankleY: p.leg.footY + p.leg.bootSize[1] * 0.5,
    },
  };
}

/** Sockets del cuerpo: puntos de montaje comunes para cabezas, ropa y accesorios. */
export interface BodySockets {
  /** En espacio del grupo torso. */
  neck: [number, number, number];
  chest: [number, number, number];
  waist: [number, number, number];
  back: [number, number, number];
  shoulderL: [number, number, number];
  shoulderR: [number, number, number];
  /** En espacio del grupo raíz/cuerpo. */
  hipL: [number, number, number];
  hipR: [number, number, number];
  /** En espacio del grupo brazo. */
  handL: [number, number, number];
  handR: [number, number, number];
}

export function deriveBodySockets(p: BodyProfile): BodySockets {
  const t = p.torso;
  return {
    neck: [0, p.neck.top, p.head.pivotZ],
    chest: [0, (t.chestStart + t.top) / 2, t.radiusChest],
    waist: [0, -0.05, 0],
    back: [0, 0.04, -(t.radiusChest + 0.02)],
    shoulderL: [-p.arm.shoulderX, p.arm.shoulderY, 0],
    shoulderR: [p.arm.shoulderX, p.arm.shoulderY, 0],
    hipL: [-p.leg.hipX, p.leg.hipY, 0],
    hipR: [p.leg.hipX, p.leg.hipY, 0],
    handL: [-p.arm.handOutX, p.arm.handY, p.arm.handZ],
    handR: [p.arm.handOutX, p.arm.handY, p.arm.handZ],
  };
}

export const BODY_REFERENCE = deriveBodyReference(BASE_BODY_PROFILE);
export const BODY_SOCKETS = deriveBodySockets(BASE_BODY_PROFILE);
