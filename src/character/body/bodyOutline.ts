import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Contorno del cuerpo coherente con la cabeza (casco invertido, como `M_outline`
 * del GLB). Solo reciben contorno las mallas marcadas con `userData.outline`
 * (las capas exteriores de cada zona), así las piezas internas o de unión
 * (hombro/manga, cuellos, puños, parches) no dibujan líneas dobles.
 */

/** Mismo tono que `M_outline` de la cabeza (lineal 0.0123, 0.0086, 0.0070 → sRGB). */
const OUTLINE_COLOR = new THREE.Color(0.0123, 0.0086, 0.007);
const OUTLINE_WIDTH = 0.0065;
/** Tope por distancia a la cámara: de cerca (primera persona) la línea no engorda. */
const OUTLINE_NEAR_RATIO = 0.008;
const HULL_FLAG = '__bodyOutlineHull';

let sharedMaterial: THREE.MeshBasicMaterial | null = null;
function outlineMaterial() {
  if (sharedMaterial) return sharedMaterial;
  const mat = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.outlineWidth = { value: OUTLINE_WIDTH };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float outlineWidth;')
      .replace(
        '#include <project_vertex>',
        // La matriz inversa transpuesta corrige la normal incluso con escalas y rotaciones anidadas.
        `#include <project_vertex>
        mvPosition.xyz += normalize(normalMatrix * normal) * min(outlineWidth, ${OUTLINE_NEAR_RATIO.toFixed(4)} * max(-mvPosition.z, 0.0));
        gl_Position = projectionMatrix * mvPosition;`
      );
  };
  sharedMaterial = mat;
  return mat;
}

const hullGeometries = new WeakMap<THREE.BufferGeometry, { geometry: THREE.BufferGeometry; users: number }>();
function acquireHullGeometry(src: THREE.BufferGeometry) {
  let entry = hullGeometries.get(src);
  if (!entry) {
    // Normales suavizadas: las aristas de cajas y tapas no abren grietas en el contorno.
    const geometry = toCreasedNormals(src.index ? src : src.clone(), Math.PI);
    entry = { geometry, users: 0 };
    hullGeometries.set(src, entry);
  }
  entry.users++;
  return entry.geometry;
}

/** Agrega (una sola vez) el casco de contorno a cada malla marcada dentro de `root`. */
export function applyBodyOutline(root: THREE.Object3D) {
  const targets: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.outline && !m.children.some((c) => c.userData[HULL_FLAG])) targets.push(m);
  });
  const release = targets.map((m) => {
    const source = m.geometry;
    const hull = new THREE.Mesh(acquireHullGeometry(source), outlineMaterial());
    hull.userData[HULL_FLAG] = true;
    hull.castShadow = false;
    hull.receiveShadow = false;
    hull.raycast = () => {};
    m.add(hull);
    return () => {
      m.remove(hull);
      const entry = hullGeometries.get(source);
      if (entry && --entry.users === 0) {
        hullGeometries.delete(source);
        entry.geometry.dispose();
      }
    };
  });
  return () => {
    for (const remove of release.splice(0)) remove();
  };
}
