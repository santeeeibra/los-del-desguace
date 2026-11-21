import * as THREE from 'three';

export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityPreset {
  id: QualityLevel;
  label: string;
  dpr: [number, number];
  shadows: boolean;
  shadowMapSize: number;
  antialias: boolean;
  envResolution: number;
  maxDustPuffs: number;
  extraProps: boolean;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    id: 'low',
    label: 'Baja',
    dpr: [0.85, 1],
    shadows: false,
    shadowMapSize: 512,
    antialias: false,
    envResolution: 64,
    maxDustPuffs: 8,
    extraProps: false,
  },
  medium: {
    id: 'medium',
    label: 'Media',
    dpr: [1, 1.5],
    shadows: true,
    shadowMapSize: 1024,
    antialias: true,
    envResolution: 128,
    maxDustPuffs: 16,
    extraProps: true,
  },
  high: {
    id: 'high',
    label: 'Alta',
    dpr: [1, 2],
    shadows: true,
    shadowMapSize: 2048,
    antialias: true,
    envResolution: 256,
    maxDustPuffs: 24,
    extraProps: true,
  },
};

export const PALETTE = {
  // Lighting & atmosphere
  skyTop: '#6bb5e8',
  skyHorizon: '#f5cfa0',
  fogColor: '#e8c49b',
  sunColor: '#ffe3b3',
  hemiSky: '#9ecae8',
  hemiGround: '#7c5338',
  lampWarm: '#ffad4d',

  // Character ("Chispa")
  overallBlue: '#356096',
  overallPocket: '#284a75',
  shirtCream: '#e8dec8',
  capMustard: '#e6a62c',
  skinWarm: '#f0b892',
  skinBlush: '#e38d74',
  gloveTan: '#e5bd73',
  bootRubber: '#26282e',
  bootSole: '#444852',
  goggleFrame: '#4d525c',
  goggleLens: '#7de3f4',
  brass: '#d49d3b',

  // Scrapyard materials
  concreteBase: '#8c8379',
  concreteDark: '#6c655d',
  woodLight: '#b97e48',
  woodDark: '#86532c',
  metalTeal: '#3e8c84',
  metalRust: '#a84f32',
  metalYellow: '#e2a82e',
  metalRed: '#c84b36',
  metalSteel: '#8e969e',
  metalDark: '#3b4048',
  rubberTire: '#24262b',
  fabricSeat: '#c85b37',
  awningCanvas: '#e3d0ad',
  hazardYellow: '#e8b624',
  hazardBlack: '#272624',
} as const;

const CHARACTER_CAPSULE = {
  capsuleHalfHeight: 0.34,
  capsuleRadius: 0.32,
  floatHeight: 0.2,
} as const;

export const CHARACTER_DIMENSIONS = {
  ...CHARACTER_CAPSULE,
  // Ecctrl sostiene la cápsula a esta altura sobre una superficie plana.
  groundVisualYOffset: -(CHARACTER_CAPSULE.capsuleHalfHeight + CHARACTER_CAPSULE.capsuleRadius + CHARACTER_CAPSULE.floatHeight),
  visualYOffset: -0.66, // Referencia visual del asiento, primera persona y laboratorio.
} as const;

interface SharedTextures {
  concreteMap: THREE.CanvasTexture;
  concreteBumpMap: THREE.CanvasTexture;
  woodMap: THREE.CanvasTexture;
  corrugatedMap: THREE.CanvasTexture;
  corrugatedBumpMap: THREE.CanvasTexture;
  hazardMap: THREE.CanvasTexture;
  crateStencilMap: THREE.CanvasTexture;
}

let cachedTextures: SharedTextures | null = null;

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo inicializar el contexto 2D para texturas procedurales.');
  }
  return [canvas, ctx];
}

function finalizeColorTexture(
  canvas: HTMLCanvasElement,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function finalizeLinearTexture(
  canvas: HTMLCanvasElement,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export function getSharedTextures(): SharedTextures {
  if (cachedTextures) return cachedTextures;

  // 1. Concrete workshop floor with subtle slabs & oil speckles
  const [cCanvas, cCtx] = makeCanvas(256, 256);
  cCtx.fillStyle = PALETTE.concreteBase;
  cCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 420; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    const r = 1 + (i % 3);
    cCtx.fillStyle = i % 5 === 0 ? 'rgba(60, 52, 46, 0.16)' : 'rgba(235, 224, 206, 0.08)';
    cCtx.fillRect(x, y, r, r);
  }
  cCtx.strokeStyle = 'rgba(56, 50, 46, 0.35)';
  cCtx.lineWidth = 3;
  cCtx.strokeRect(1.5, 1.5, 253, 253);
  cCtx.beginPath();
  cCtx.moveTo(128, 0);
  cCtx.lineTo(128, 256);
  cCtx.moveTo(0, 128);
  cCtx.lineTo(256, 128);
  cCtx.stroke();
  const concreteMap = finalizeColorTexture(cCanvas, 10, 10);

  const [cbCanvas, cbCtx] = makeCanvas(256, 256);
  cbCtx.fillStyle = '#808080';
  cbCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 420; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    const r = 1 + (i % 3);
    cbCtx.fillStyle = i % 2 === 0 ? '#969696' : '#686868';
    cbCtx.fillRect(x, y, r, r);
  }
  cbCtx.strokeStyle = '#383838';
  cbCtx.lineWidth = 3;
  cbCtx.strokeRect(1.5, 1.5, 253, 253);
  cbCtx.beginPath();
  cbCtx.moveTo(128, 0);
  cbCtx.lineTo(128, 256);
  cbCtx.moveTo(0, 128);
  cbCtx.lineTo(256, 128);
  cbCtx.stroke();
  const concreteBumpMap = finalizeLinearTexture(cbCanvas, 10, 10);

  // 2. Warm wood planks
  const [wCanvas, wCtx] = makeCanvas(256, 256);
  wCtx.fillStyle = PALETTE.woodLight;
  wCtx.fillRect(0, 0, 256, 256);
  const plankH = 64;
  for (let row = 0; row < 4; row++) {
    wCtx.fillStyle = row % 2 === 0 ? '#bd824b' : '#b17541';
    wCtx.fillRect(0, row * plankH, 256, plankH);
    wCtx.fillStyle = 'rgba(92, 53, 24, 0.16)';
    for (let g = 0; g < 6; g++) {
      wCtx.fillRect(0, row * plankH + 8 + g * 9, 256, 2);
    }
    wCtx.fillStyle = '#6f4220';
    wCtx.fillRect(0, row * plankH, 256, 3);
  }
  const woodMap = finalizeColorTexture(wCanvas, 1, 1);

  // 3. Painted corrugated metal sheet
  const [mCanvas, mCtx] = makeCanvas(256, 128);
  for (let x = 0; x < 256; x += 16) {
    mCtx.fillStyle = '#ffffff';
    mCtx.fillRect(x, 0, 8, 128);
    mCtx.fillStyle = '#cfcfcf';
    mCtx.fillRect(x + 8, 0, 8, 128);
  }
  mCtx.fillStyle = 'rgba(130, 62, 34, 0.12)';
  mCtx.fillRect(0, 96, 256, 32);
  const corrugatedMap = finalizeColorTexture(mCanvas, 2, 1);

  const [mbCanvas, mbCtx] = makeCanvas(256, 64);
  for (let x = 0; x < 256; x++) {
    const v = Math.round(128 + Math.sin((x / 16) * Math.PI * 2) * 100);
    mbCtx.fillStyle = `rgb(${v},${v},${v})`;
    mbCtx.fillRect(x, 0, 1, 64);
  }
  const corrugatedBumpMap = finalizeLinearTexture(mbCanvas, 2, 1);

  // 4. Hazard stripes
  const [hCanvas, hCtx] = makeCanvas(128, 128);
  hCtx.fillStyle = PALETTE.hazardYellow;
  hCtx.fillRect(0, 0, 128, 128);
  hCtx.fillStyle = PALETTE.hazardBlack;
  for (let i = -128; i < 256; i += 32) {
    hCtx.beginPath();
    hCtx.moveTo(i, 0);
    hCtx.lineTo(i + 16, 0);
    hCtx.lineTo(i + 16 - 128, 128);
    hCtx.lineTo(i - 128, 128);
    hCtx.closePath();
    hCtx.fill();
  }
  const hazardMap = finalizeColorTexture(hCanvas, 4, 1);

  // 5. Crate wood with painted stencil icon (arrow + gear badge)
  const [sCanvas, sCtx] = makeCanvas(256, 256);
  sCtx.drawImage(wCanvas, 0, 0);
  sCtx.strokeStyle = '#6f4220';
  sCtx.lineWidth = 18;
  sCtx.strokeRect(9, 9, 238, 238);
  sCtx.fillStyle = 'rgba(38, 34, 30, 0.72)';
  // Upward arrow stencil (diegetic, no words needed)
  sCtx.beginPath();
  sCtx.moveTo(128, 66);
  sCtx.lineTo(164, 112);
  sCtx.lineTo(142, 112);
  sCtx.lineTo(142, 168);
  sCtx.lineTo(114, 168);
  sCtx.lineTo(114, 112);
  sCtx.lineTo(92, 112);
  sCtx.closePath();
  sCtx.fill();
  sCtx.fillRect(92, 178, 72, 12);
  const crateStencilMap = finalizeColorTexture(sCanvas, 1, 1);

  cachedTextures = {
    concreteMap,
    concreteBumpMap,
    woodMap,
    corrugatedMap,
    corrugatedBumpMap,
    hazardMap,
    crateStencilMap,
  };
  return cachedTextures;
}
