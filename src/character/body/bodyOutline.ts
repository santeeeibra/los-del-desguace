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
        '#include <begin_vertex>',
        // Empuje constante en espacio de mundo, sin depender de la escala de la malla.
        `#include <begin_vertex>
        vec3 sc = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
        transformed += normalize(normal) * outlineWidth / sc;`
      );
  };
  sharedMaterial = mat;
  return mat;
}

const hullGeometries = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
function hullGeometry(src: THREE.BufferGeometry) {
  let g = hullGeometries.get(src);
  if (!g) {
    // Normales suavizadas: las aristas de cajas y tapas no abren grietas en el contorno.
    g = toCreasedNormals(src, Math.PI);
    hullGeometries.set(src, g);
  }
  return g;
}

/** Agrega (una sola vez) el casco de contorno a cada malla marcada dentro de `root`. */
export function applyBodyOutline(root: THREE.Object3D) {
  const targets: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.outline && !m.children.some((c) => c.userData[HULL_FLAG])) targets.push(m);
  });
  for (const m of targets) {
    const hull = new THREE.Mesh(hullGeometry(m.geometry), outlineMaterial());
    hull.userData[HULL_FLAG] = true;
    hull.castShadow = false;
    hull.receiveShadow = false;
    hull.raycast = () => {};
    m.add(hull);
  }
}
