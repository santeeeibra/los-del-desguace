import * as THREE from 'three';
import type { CharacterExpression } from './characterAppearance';

export type HeadShapePreset = 'base' | 'round' | 'long' | 'wide';

export const HEAD_SHAPE_OPTIONS: ReadonlyArray<{
  id: HeadShapePreset;
  label: string;
}> = [
  { id: 'base', label: 'Base' },
  { id: 'round', label: 'Redonda' },
  { id: 'long', label: 'Alargada' },
  { id: 'wide', label: 'Ancha' },
];

export const HEAD_SHAPE_STORAGE_KEY = 'los-del-desguace.head-shape.v1';

export type AppearanceMorphName = 'shape_round' | 'shape_long' | 'shape_wide';

export type ExpressionMorphName =
  | 'blink_L'
  | 'blink_R'
  | 'eyes_wide'
  | 'squint'
  | 'look_left'
  | 'look_right'
  | 'look_up'
  | 'look_down'
  | 'mouth_open'
  | 'smile'
  | 'sad'
  | 'mouth_O'
  | 'brow_up'
  | 'brow_furrow';

export type AppearanceWeights = Record<AppearanceMorphName, number>;
export type ExpressionWeights = Record<ExpressionMorphName, number>;

export const SHAPE_PRESET_WEIGHTS: Record<HeadShapePreset, AppearanceWeights> = {
  base: { shape_round: 0, shape_long: 0, shape_wide: 0 },
  round: { shape_round: 1, shape_long: 0, shape_wide: 0 },
  long: { shape_round: 0, shape_long: 1, shape_wide: 0 },
  wide: { shape_round: 0, shape_long: 0, shape_wide: 1 },
};

export interface FaceShapeFitMetrics {
  hat_band_width: number;
  hat_band_depth: number;
  eye_spacing: number;
  temple_width: number;
  jaw_width_at_beard: number;
  head_top: number;
  chin_bottom: number;
}

export interface FaceAnchorMetadata {
  base: [number, number, number];
  delta: Record<AppearanceMorphName, [number, number, number]>;
}

export interface FaceRigMetadata {
  anchors: Record<string, FaceAnchorMetadata>;
  fit_by_shape: Record<'base' | AppearanceMorphName, FaceShapeFitMetrics>;
}

// Fallback metadata matching the verified cabeza_base_v002.glb extras.face_rig
export const DEFAULT_FACE_RIG_METADATA: FaceRigMetadata = {
  anchors: {
    anchor_hat: {
      base: [0, 1.0403, -0.0034],
      delta: {
        shape_round: [0, -0.0063, -0.0002],
        shape_long: [0, 0.0427, 0.0001],
        shape_wide: [0, -0.0263, -0.0003],
      },
    },
    anchor_hair: {
      base: [0, 1.1648, 0.0009],
      delta: {
        shape_round: [0, -0.008, 0.0002],
        shape_long: [0, 0.063, 0],
        shape_wide: [0, -0.042, 0],
      },
    },
    anchor_glasses: {
      base: [0, 0.9877, 0.2219],
      delta: {
        shape_round: [0, -0.015, 0.0138],
        shape_long: [0, 0.0456, -0.008],
        shape_wide: [0, -0.0323, 0.0098],
      },
    },
  },
  fit_by_shape: {
    base: {
      hat_band_width: 0.3739,
      hat_band_depth: 0.3559,
      eye_spacing: 0.1187,
      temple_width: 0.348,
      jaw_width_at_beard: 0.1855,
      head_top: 1.1648,
      chin_bottom: 0.7526,
    },
    shape_round: {
      hat_band_width: 0.4067,
      hat_band_depth: 0.3857,
      eye_spacing: 0.1218,
      temple_width: 0.3578,
      jaw_width_at_beard: 0.2197,
      head_top: 1.1568,
      chin_bottom: 0.7541,
    },
    shape_long: {
      hat_band_width: 0.3015,
      hat_band_depth: 0.3491,
      eye_spacing: 0.1064,
      temple_width: 0.2808,
      jaw_width_at_beard: 0.1349,
      head_top: 1.2278,
      chin_bottom: 0.7551,
    },
    shape_wide: {
      hat_band_width: 0.4762,
      hat_band_depth: 0.3658,
      eye_spacing: 0.1793,
      temple_width: 0.4704,
      jaw_width_at_beard: 0.3726,
      head_top: 1.1229,
      chin_bottom: 0.7532,
    },
  },
};

export interface FaceRigBindings {
  root: THREE.Object3D;
  headMeshes: THREE.Mesh[];
  browMeshes: THREE.Mesh[];
  outlineMeshes: THREE.Mesh[];
  browNode: THREE.Object3D | null;
  meta: FaceRigMetadata;
}

const ZERO_EXPRESSION: ExpressionWeights = {
  blink_L: 0,
  blink_R: 0,
  eyes_wide: 0,
  squint: 0,
  look_left: 0,
  look_right: 0,
  look_up: 0,
  look_down: 0,
  mouth_open: 0,
  smile: 0,
  sad: 0,
  mouth_O: 0,
  brow_up: 0,
  brow_furrow: 0,
};

// Matches verified viewer/EEVEE combinations from v002 README
const EXPRESSION_TARGETS: Record<CharacterExpression | 'neutral', Partial<ExpressionWeights>> = {
  neutral: {},
  happy: { smile: 0.75, squint: 0.22, brow_up: 0.28 },
  effort: { squint: 0.9, brow_furrow: 1, mouth_open: 0.3, sad: 0.35 },
  surprise: { eyes_wide: 1, brow_up: 1, mouth_O: 1 },
  disappointed: { squint: 0.35, sad: 0.85, brow_furrow: 0.6 },
};

const EXPRESSION_MORPH_KEYS = Object.keys(ZERO_EXPRESSION) as ExpressionMorphName[];
const APPEARANCE_MORPH_KEYS: AppearanceMorphName[] = ['shape_round', 'shape_long', 'shape_wide'];

export function parseFaceRigMetadata(root: THREE.Object3D): FaceRigMetadata {
  const candidates: unknown[] = [root.userData?.face_rig];
  root.traverse((obj) => {
    if (obj !== root && obj.userData?.face_rig) {
      candidates.push(obj.userData.face_rig);
    }
  });

  for (const raw of candidates) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object' && 'anchors' in parsed && 'fit_by_shape' in parsed) {
        return parsed as FaceRigMetadata;
      }
    } catch {
      // Fallback to verified defaults
    }
  }
  return DEFAULT_FACE_RIG_METADATA;
}

export function extractFaceRigBindings(root: THREE.Object3D): FaceRigBindings {
  const headNode = root.getObjectByName('Head') ?? root;
  const browNode = root.getObjectByName('Brows_Simple') ?? null;

  const collectMorphMeshes = (node: THREE.Object3D | null): THREE.Mesh[] => {
    const out: THREE.Mesh[] = [];
    if (!node) return out;
    node.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
          out.push(mesh);
        }
      }
    });
    return out;
  };

  const headMeshes = collectMorphMeshes(headNode);
  const browMeshes = collectMorphMeshes(browNode);
  const outlineMeshes: THREE.Mesh[] = [];

  for (const mesh of headMeshes) {
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const isOutline = (mat?.name ?? '') === 'M_outline';
    mesh.castShadow = !isOutline;
    mesh.receiveShadow = !isOutline;
    if (isOutline) {
      if (mat) {
        mat.side = THREE.FrontSide;
      }
      outlineMeshes.push(mesh);
    }
  }

  for (const mesh of browMeshes) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  }

  return {
    root,
    headMeshes,
    browMeshes,
    outlineMeshes,
    browNode,
    meta: parseFaceRigMetadata(root),
  };
}

export function resolveAnchorPosition(
  meta: FaceRigMetadata,
  anchorName: string,
  appearance: AppearanceWeights,
  out: THREE.Vector3
): THREE.Vector3 {
  const anchor = meta.anchors[anchorName] ?? DEFAULT_FACE_RIG_METADATA.anchors[anchorName];
  if (!anchor) {
    return out.set(0, 1.04, 0);
  }
  let x = anchor.base[0];
  let y = anchor.base[1];
  let z = anchor.base[2];
  for (const k of APPEARANCE_MORPH_KEYS) {
    const w = appearance[k];
    const d = anchor.delta[k];
    if (w && d) {
      x += w * d[0];
      y += w * d[1];
      z += w * d[2];
    }
  }
  return out.set(x, y, z);
}

export function resolveShapeFitMetrics(
  meta: FaceRigMetadata,
  appearance: AppearanceWeights
): FaceShapeFitMetrics {
  const fits = meta.fit_by_shape ?? DEFAULT_FACE_RIG_METADATA.fit_by_shape;
  const base = fits.base ?? DEFAULT_FACE_RIG_METADATA.fit_by_shape.base;
  const sumW =
    appearance.shape_round + appearance.shape_long + appearance.shape_wide;
  const norm = sumW > 1 ? 1 / sumW : 1;

  const res: FaceShapeFitMetrics = { ...base };
  for (const k of APPEARANCE_MORPH_KEYS) {
    const w = appearance[k] * norm;
    const f = fits[k];
    if (!w || !f) continue;
    res.hat_band_width += w * (f.hat_band_width - base.hat_band_width);
    res.hat_band_depth += w * (f.hat_band_depth - base.hat_band_depth);
    res.eye_spacing += w * (f.eye_spacing - base.eye_spacing);
    res.temple_width += w * (f.temple_width - base.temple_width);
    res.jaw_width_at_beard += w * (f.jaw_width_at_beard - base.jaw_width_at_beard);
    res.head_top += w * (f.head_top - base.head_top);
    res.chin_bottom += w * (f.chin_bottom - base.chin_bottom);
  }
  return res;
}

export function loadSavedHeadShape(): HeadShapePreset {
  if (typeof window === 'undefined') return 'base';
  try {
    const raw = window.localStorage.getItem(HEAD_SHAPE_STORAGE_KEY);
    if (raw === 'base' || raw === 'round' || raw === 'long' || raw === 'wide') {
      return raw;
    }
  } catch {
    // Ignore storage unavailability
  }
  return 'base';
}

export function saveHeadShape(shape: HeadShapePreset) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HEAD_SHAPE_STORAGE_KEY, shape);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Isolated facial animation & shape controller for cabeza_base_v002.
 * - Keeps persistent appearance morphs independent from temporary expressions.
 * - Drives all meshes (Head including M_outline primitives + Brows_Simple) uniformly.
 * - Enforces documented face_rig limits (eyelid closure vs eyes_wide/squint, smile/sad, mouth open/O, gaze disk).
 */
export class FaceRigController {
  private appearance: AppearanceWeights = { ...SHAPE_PRESET_WEIGHTS.base };
  private currentExpr: ExpressionWeights = { ...ZERO_EXPRESSION };
  private finalWeights: ExpressionWeights = { ...ZERO_EXPRESSION };
  private blinkTimer = 2.6;
  private blinkProgress = -1;
  private nextGazeTimer = 1.4;
  private targetGazeX = 0;
  private targetGazeY = 0;
  private gazeX = 0;
  private gazeY = 0;

  setShapePreset(preset: HeadShapePreset) {
    const target = SHAPE_PRESET_WEIGHTS[preset] ?? SHAPE_PRESET_WEIGHTS.base;
    this.appearance.shape_round = target.shape_round;
    this.appearance.shape_long = target.shape_long;
    this.appearance.shape_wide = target.shape_wide;
  }

  getAppearanceWeights(): Readonly<AppearanceWeights> {
    return this.appearance;
  }

  resetTransient() {
    this.currentExpr = { ...ZERO_EXPRESSION };
    this.blinkProgress = -1;
    this.gazeX = 0;
    this.gazeY = 0;
    this.targetGazeX = 0;
    this.targetGazeY = 0;
  }

  update(
    bindings: FaceRigBindings,
    dt: number,
    expression: CharacterExpression | 'neutral',
    options?: { isMoving?: boolean; turnRate?: number; suppressGaze?: boolean }
  ) {
    const targetPreset = EXPRESSION_TARGETS[expression] ?? EXPRESSION_TARGETS.neutral;
    const isIdleTarget = expression === 'neutral';
    const rate = isIdleTarget ? 5.5 : 13.0;
    const alpha = 1 - Math.exp(-rate * dt);

    for (const k of EXPRESSION_MORPH_KEYS) {
      const targetVal = targetPreset[k] ?? 0;
      this.currentExpr[k] = THREE.MathUtils.lerp(this.currentExpr[k], targetVal, alpha);
    }

    // Soft automatic blink cycle (suppressed only at peak wide-eyed surprise)
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && this.blinkProgress < 0) {
      this.blinkProgress = 0;
      this.blinkTimer = 2.7 + Math.random() * 2.4;
    }

    let blinkExtra = 0;
    if (this.blinkProgress >= 0) {
      this.blinkProgress += dt;
      const blinkDuration = 0.17;
      if (this.blinkProgress < blinkDuration) {
        blinkExtra = Math.sin((Math.PI * this.blinkProgress) / blinkDuration);
      } else {
        this.blinkProgress = -1;
      }
    }

    // Subtle alive gaze inside the recommended unit disk (x² + y² <= 1)
    if (options?.suppressGaze) {
      this.targetGazeX = 0;
      this.targetGazeY = 0;
    } else if (options?.isMoving && Math.abs(options.turnRate ?? 0) > 0.25) {
      this.targetGazeX = THREE.MathUtils.clamp(-(options.turnRate ?? 0) * 0.14, -0.55, 0.55);
      this.targetGazeY = 0;
    } else {
      this.nextGazeTimer -= dt;
      if (this.nextGazeTimer <= 0) {
        this.nextGazeTimer = 1.6 + Math.random() * 2.2;
        const angle = Math.random() * Math.PI * 2;
        const mag = Math.random() < 0.35 ? 0 : 0.18 + Math.random() * 0.24;
        this.targetGazeX = Math.cos(angle) * mag;
        this.targetGazeY = Math.sin(angle) * mag * 0.55;
      }
    }

    const gazeAlpha = 1 - Math.exp(-8 * dt);
    this.gazeX = THREE.MathUtils.lerp(this.gazeX, this.targetGazeX, gazeAlpha);
    this.gazeY = THREE.MathUtils.lerp(this.gazeY, this.targetGazeY, gazeAlpha);
    const gazeMag = Math.hypot(this.gazeX, this.gazeY);
    const gx = gazeMag > 1 ? this.gazeX / gazeMag : this.gazeX;
    const gy = gazeMag > 1 ? this.gazeY / gazeMag : this.gazeY;

    const w = this.finalWeights;
    for (const k of EXPRESSION_MORPH_KEYS) {
      w[k] = this.currentExpr[k];
    }
    w.look_left = Math.max(0, gx);
    w.look_right = Math.max(0, -gx);
    w.look_up = Math.max(0, gy);
    w.look_down = Math.max(0, -gy);

    // Combine blink safely under surprise (prevent lid clipping against wide eye)
    const allowedBlink = Math.max(0, 1 - this.currentExpr.eyes_wide * 0.85);
    const blinkVal = Math.min(allowedBlink, Math.max(w.blink_L, w.blink_R, blinkExtra));
    w.blink_L = blinkVal;
    w.blink_R = blinkVal;

    // Enforce documented face_rig.limits so primitives never self-intersect
    const bMax = Math.max(w.blink_L, w.blink_R);
    w.eyes_wide = Math.min(w.eyes_wide, Math.max(0, 1 - bMax));
    w.squint = Math.min(w.squint, Math.max(0, (1 - bMax) / 0.45));

    if (w.smile + w.sad > 1) {
      const s = 1 / (w.smile + w.sad);
      w.smile *= s;
      w.sad *= s;
    }
    if (w.mouth_open + w.mouth_O > 1.2) {
      const s = 1.2 / (w.mouth_open + w.mouth_O);
      w.mouth_open *= s;
      w.mouth_O *= s;
    }

    // Apply appearance + expressions identically across Head (incl. M_outline) and Brows_Simple
    const applyToMeshes = (meshes: THREE.Mesh[]) => {
      for (const mesh of meshes) {
        const dict = mesh.morphTargetDictionary;
        const inf = mesh.morphTargetInfluences;
        if (!dict || !inf) continue;

        for (const k of APPEARANCE_MORPH_KEYS) {
          const idx = dict[k];
          if (idx !== undefined) inf[idx] = this.appearance[k];
        }
        for (const k of EXPRESSION_MORPH_KEYS) {
          const idx = dict[k];
          if (idx !== undefined) inf[idx] = w[k];
        }
      }
    };

    applyToMeshes(bindings.headMeshes);
    applyToMeshes(bindings.browMeshes);
  }
}
