import * as THREE from 'three';
import { useSyncExternalStore } from 'react';
import { grabbableRegistry } from '../props/grabbableRegistry';

/**
 * Aerosol: pinta piezas de dos maneras.
 * - `fill`: tiñe la pieza entera (solo cambia el color del material, sin texturas).
 * - `freehand`: trazos de aerógrafo sobre la superficie. Recién en el primer trazo se crea un
 *   canvas de 256×256 + CanvasTexture para esa malla, partiendo de su color/textura actual.
 * Los materiales originales nunca se tocan: se clonan al pintar y se restauran con el borrador.
 */

export type SprayMode = 'fill' | 'freehand';
export type SprayNozzle = 'fine' | 'medium' | 'thick';

export interface PaintSwatch { id: string; label: string; color: string | null }

export const PAINT_SWATCHES: PaintSwatch[] = [
  { id: 'oxido', label: 'Rojo óxido', color: '#a63d24' },
  { id: 'vial', label: 'Amarillo vial', color: '#f2c12e' },
  { id: 'militar', label: 'Verde militar', color: '#4b5d32' },
  { id: 'celeste', label: 'Celeste taller', color: '#5fb4d8' },
  { id: 'fuego', label: 'Naranja fuego', color: '#ee6a1f' },
  { id: 'negro', label: 'Negro mate', color: '#26262a' },
  { id: 'tiza', label: 'Blanco tiza', color: '#efeae0' },
  { id: 'original', label: 'Borrador (original)', color: null },
];

export const NOZZLE_LABELS: Record<SprayNozzle, string> = { fine: 'Fino', medium: 'Medio', thick: 'Grueso' };
const NOZZLE_RADIUS: Record<SprayNozzle, number> = { fine: 6, medium: 12, thick: 22 };
const CANVAS_SIZE = 256;
/** Frecuencia máxima de subida de texturas a la GPU (s): cuida los FPS en celular. */
const FLUSH_INTERVAL = 0.05;
const CHECK_INTERVAL = 0.5;

// ---------- Estado de la UI (color, modo, boquilla) ----------
interface SprayUiState { swatch: string; mode: SprayMode; nozzle: SprayNozzle }
let ui: SprayUiState = { swatch: 'oxido', mode: 'fill', nozzle: 'medium' };
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

export const sprayUi = {
  get: () => ui,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  setSwatch(id: string) { if (ui.swatch !== id) { ui = { ...ui, swatch: id }; emit(); } },
  setMode(mode: SprayMode) { if (ui.mode !== mode) { ui = { ...ui, mode }; emit(); } },
  toggleMode() { ui = { ...ui, mode: ui.mode === 'fill' ? 'freehand' : 'fill' }; emit(); },
  setNozzle(nozzle: SprayNozzle) { if (ui.nozzle !== nozzle) { ui = { ...ui, nozzle }; emit(); } },
  color(): string | null { return PAINT_SWATCHES.find((s) => s.id === ui.swatch)?.color ?? null; },
};

export function useSprayUi() {
  return useSyncExternalStore(sprayUi.subscribe, sprayUi.get, sprayUi.get);
}

// ---------- Motor de pintura ----------
interface MeshPaint {
  mesh: THREE.Mesh;
  original: THREE.Material | THREE.Material[];
  clones: THREE.Material[];
  canvas?: HTMLCanvasElement;
  ctx?: CanvasRenderingContext2D;
  texture?: THREE.CanvasTexture;
  flipY: boolean;
  dirty: boolean;
}
interface PartPaint { color: string | null; meshes: Map<THREE.Mesh, MeshPaint> }

const parts = new Map<string, PartPaint>();
let clock = 0;
let lastFlush = 0;
let lastCheck = 0;

type Colored = THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null };

function meshesOf(group: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.visible && !m.userData?.noPaint) out.push(m);
  });
  return out;
}

function partOf(id: string): PartPaint {
  let p = parts.get(id);
  if (!p) { p = { color: null, meshes: new Map() }; parts.set(id, p); }
  return p;
}

function ensureMesh(part: PartPaint, mesh: THREE.Mesh): MeshPaint {
  const existing = part.meshes.get(mesh);
  if (existing && sameMaterial(mesh, existing)) return existing;
  if (existing) disposeMeshPaint(existing, false);
  const original = mesh.material;
  const list = Array.isArray(original) ? original : [original];
  const clones = list.map((m) => m.clone());
  mesh.material = Array.isArray(original) ? clones : clones[0];
  const rec: MeshPaint = { mesh, original, clones, flipY: true, dirty: false };
  part.meshes.set(mesh, rec);
  return rec;
}

function sameMaterial(mesh: THREE.Mesh, rec: MeshPaint) {
  const cur = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return cur.length === rec.clones.length && cur.every((m, i) => m === rec.clones[i]);
}

function disposeMeshPaint(rec: MeshPaint, restore: boolean) {
  if (restore && sameMaterial(rec.mesh, rec)) rec.mesh.material = rec.original;
  rec.texture?.dispose();
  for (const c of rec.clones) c.dispose();
  rec.texture = undefined;
  rec.canvas = undefined;
  rec.ctx = undefined;
}

/** Quita la capa a mano alzada de una malla (vuelve al mapa original). */
function clearFreehand(rec: MeshPaint) {
  if (!rec.texture) return;
  const origList = Array.isArray(rec.original) ? rec.original : [rec.original];
  rec.clones.forEach((c, i) => {
    const cc = c as Colored;
    if ('map' in cc) { cc.map = (origList[i] as Colored).map ?? null; c.needsUpdate = true; }
  });
  rec.texture.dispose();
  rec.texture = undefined;
  rec.canvas = undefined;
  rec.ctx = undefined;
}

function tint(rec: MeshPaint, color: string) {
  for (const c of rec.clones) (c as Colored).color?.set(color);
}

/** Pinta la pieza entera de un color (o la devuelve a su aspecto original con `null`). */
export function fillPart(id: string, color: string | null): boolean {
  const group = grabbableRegistry.getById(id)?.getVisualGroup();
  if (!group) return false;
  if (color === null) { erasePart(id); return true; }
  const part = partOf(id);
  part.color = color;
  for (const mesh of meshesOf(group)) {
    const rec = ensureMesh(part, mesh);
    clearFreehand(rec);
    tint(rec, color);
  }
  return true;
}

export function erasePart(id: string) {
  const part = parts.get(id);
  if (!part) return;
  for (const rec of part.meshes.values()) disposeMeshPaint(rec, true);
  parts.delete(id);
}

function drawableImage(img: unknown): CanvasImageSource | null {
  if (!img || typeof document === 'undefined') return null;
  if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) return img.complete ? img : null;
  if (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) return img;
  if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) return img;
  return null;
}

/** Crea (una sola vez) el lienzo de la malla partiendo de su textura y color actuales. */
function ensureCanvas(rec: MeshPaint): boolean {
  if (rec.ctx && rec.texture) return true;
  if (typeof document === 'undefined' || rec.clones.length !== 1) return false;
  const mat = rec.clones[0] as Colored;
  if (!('map' in mat) || !mat.color) return false;
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const origMap = (Array.isArray(rec.original) ? null : (rec.original as Colored).map) ?? null;
  const img = drawableImage(origMap?.image);
  if (img) ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
  else { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE); }
  // El color actual del material se "hornea" en el lienzo para que el resultado se vea igual.
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `#${mat.color.getHexString()}`;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.globalCompositeOperation = 'source-over';
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = origMap ? origMap.flipY : true;
  texture.wrapS = origMap?.wrapS ?? THREE.RepeatWrapping;
  texture.wrapT = origMap?.wrapT ?? THREE.RepeatWrapping;
  mat.color.set('#ffffff');
  mat.map = texture;
  mat.needsUpdate = true;
  rec.canvas = canvas;
  rec.ctx = ctx;
  rec.texture = texture;
  rec.flipY = texture.flipY;
  return true;
}

function hexToRgb(hex: string) {
  const c = new THREE.Color(hex);
  return `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
}

/**
 * Un "soplo" de aerosol en el punto que tocó el rayo. Si la malla no tiene UV limpias (o tiene varios
 * materiales) se tiñe esa sub-malla entera. Devuelve false si no se pudo pintar.
 */
export function sprayAt(id: string, hit: THREE.Intersection, color: string | null, nozzle: SprayNozzle, dt: number): boolean {
  const mesh = hit.object as THREE.Mesh;
  if (!mesh?.isMesh) return false;
  if (color === null) { erasePart(id); return true; }
  const part = partOf(id);
  const rec = ensureMesh(part, mesh);
  const hasUv = Boolean(hit.uv && (mesh.geometry as THREE.BufferGeometry)?.attributes?.uv);
  if (!hasUv || !ensureCanvas(rec)) {
    tint(rec, color);
    return true;
  }
  const ctx = rec.ctx!;
  const fract = (n: number) => n - Math.floor(n);
  const u = fract(hit.uv!.x);
  const v = fract(hit.uv!.y);
  const x = u * CANVAS_SIZE;
  const y = (rec.flipY ? 1 - v : v) * CANVAS_SIZE;
  const r = NOZZLE_RADIUS[nozzle];
  const alpha = Math.min(0.55, Math.max(0.08, dt * 7));
  const rgb = hexToRgb(color);
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `rgba(${rgb},${alpha})`);
  grad.addColorStop(0.55, `rgba(${rgb},${alpha * 0.45})`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  rec.dirty = true;
  return true;
}

/** Llamar una vez por cuadro: sube texturas sucias con frecuencia limitada y repara pinturas perdidas. */
export function tickPaint(dt: number) {
  clock += dt;
  if (clock - lastFlush >= FLUSH_INTERVAL) {
    lastFlush = clock;
    for (const part of parts.values()) {
      for (const rec of part.meshes.values()) {
        if (rec.dirty && rec.texture) { rec.texture.needsUpdate = true; rec.dirty = false; }
      }
    }
  }
  if (clock - lastCheck < CHECK_INTERVAL) return;
  lastCheck = clock;
  for (const [id, part] of parts) {
    const group = grabbableRegistry.getById(id)?.getVisualGroup();
    if (!group) {
      // La pieza ya no está (patio reiniciado o reconstrucción): liberar GPU y conservar solo el color.
      for (const rec of part.meshes.values()) disposeMeshPaint(rec, false);
      part.meshes.clear();
      if (part.color === null) parts.delete(id);
      continue;
    }
    const live = new Set(meshesOf(group));
    for (const [mesh, rec] of part.meshes) {
      if (!live.has(mesh)) { disposeMeshPaint(rec, false); part.meshes.delete(mesh); }
    }
    // Se volvió a armar la malla (por ejemplo al reconstruir con H): reaplicar el color base.
    if (part.color) {
      for (const mesh of live) {
        const rec = part.meshes.get(mesh);
        if (!rec || !sameMaterial(mesh, rec)) tint(ensureMesh(part, mesh), part.color);
      }
    }
  }
}

/** Color base guardado de una pieza (sirve para planos y reconstrucción). */
export function paintColorOf(id: string): string | null {
  return parts.get(id)?.color ?? null;
}

/** Libera toda la pintura (texturas y materiales clonados). */
export function disposeAllPaint(restore = true) {
  for (const part of parts.values()) for (const rec of part.meshes.values()) disposeMeshPaint(rec, restore);
  parts.clear();
}

// ---------- Chorro de partículas (lo dibuja SprayMist) ----------
export const sprayFx = {
  active: false,
  from: new THREE.Vector3(),
  to: new THREE.Vector3(),
  color: new THREE.Color('#a63d24'),
};
