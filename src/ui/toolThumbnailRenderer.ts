import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GRINDER_MODEL_URL, WELDER_MODEL_URL, WRENCH_MODEL_URL } from '../props/propModelConfig';

export type HotbarToolId = 'wrench' | 'welder' | 'grinder' | 'saw' | 'wire' | 'spray';

const THUMB_SIZE = 128;
const cache: Partial<Record<HotbarToolId, string>> = {};
let pending: Promise<Partial<Record<HotbarToolId, string>>> | null = null;

function buildSawPreviewMesh(): THREE.Group {
  const g = new THREE.Group();
  const mat = (color: string, roughness: number, metalness = 0.2) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.095, 0.038), mat('#4a2a12', 0.88, 0.05));
  grip.position.set(0, -0.05, -0.01);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.072, 0.15), mat('#c84b36', 0.48, 0.22));
  body.position.set(0, 0.012, 0.02);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.034, 14), mat('#2b2f36', 0.45, 0.35));
  cap.position.set(0, 0.012, -0.065);
  const guard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.106, 0.106, 0.014, 24, 1, false, 0, Math.PI),
    mat('#a7adb3', 0.35, 0.65),
  );
  guard.position.set(0.044, 0.005, 0.115);
  guard.rotation.z = Math.PI / 2;
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.098, 0.006, 28), mat('#e8edf0', 0.22, 0.82));
  blade.position.set(0.056, 0.005, 0.115);
  blade.rotation.z = Math.PI / 2;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.016, 12), mat('#d49d3b', 0.3, 0.85));
  hub.position.set(0.056, 0.005, 0.115);
  hub.rotation.z = Math.PI / 2;
  const emitter = new THREE.Mesh(
    new THREE.SphereGeometry(0.016, 10, 10),
    new THREE.MeshBasicMaterial({ color: '#6ff6ff' }),
  );
  emitter.position.set(0.056, -0.02, 0.205);
  g.add(grip, body, cap, guard, blade, hub, emitter);
  return g;
}

function buildWirePreviewMesh(): THREE.Group {
  const g = new THREE.Group();
  const mat = (color: string, roughness: number, metalness = 0.25) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.095, 0.042), mat('#4a2a12', 0.88, 0.05));
  grip.position.set(0, -0.055, -0.005);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.07, 0.15), mat('#2c7e73', 0.42, 0.28));
  body.position.set(0, 0.01, 0.03);
  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.062, 18), mat('#d97a38', 0.36, 0.72));
  spool.position.set(0, 0.066, 0.015);
  spool.rotation.z = Math.PI / 2;
  const led = new THREE.Mesh(
    new THREE.BoxGeometry(0.038, 0.018, 0.016),
    new THREE.MeshStandardMaterial({ color: '#72f5da', emissive: '#36d7b7', emissiveIntensity: 1.3 }),
  );
  led.position.set(0, 0.018, 0.108);
  g.add(grip, body, spool, led);
  for (const side of [-1, 1]) {
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.03, 0.115), mat('#e3b34c', 0.28, 0.85));
    jaw.position.set(side * 0.024, 0.008, 0.165);
    jaw.rotation.y = side * -0.14;
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.013, 10, 10),
      new THREE.MeshBasicMaterial({ color: '#72f5da' }),
    );
    tip.position.set(side * 0.018, 0.008, 0.22);
    g.add(jaw, tip);
  }
  return g;
}

function renderObjectToDataUrl(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  euler: [number, number, number],
): string {
  const pivot = new THREE.Group();
  pivot.add(object);
  pivot.rotation.set(euler[0], euler[1], euler[2]);
  scene.add(pivot);
  pivot.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(pivot);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  pivot.position.sub(center);
  pivot.scale.setScalar(1.38 / maxDim);
  pivot.updateMatrixWorld(true);

  camera.position.set(0, 0.12, 2.35);
  camera.lookAt(0, 0, 0);
  renderer.clear();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(pivot);
  return url;
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) m?.dispose();
  });
}

/**
 * Genera miniaturas 3D reales (iluminación cálida de taller, fondo transparente) de las 5 herramientas
 * equipables usando sus modelos 3D reales una sola vez al iniciar y libera el contexto auxiliar.
 */
export function loadToolThumbnails(): Promise<Partial<Record<HotbarToolId, string>>> {
  if (pending) return pending;
  pending = (async () => {
    if (typeof document === 'undefined' || typeof WebGLRenderingContext === 'undefined') return cache;
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = THUMB_SIZE;
      canvas.height = THUMB_SIZE;
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      });
      renderer.setSize(THUMB_SIZE, THUMB_SIZE, false);
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;

      const scene = new THREE.Scene();
      const hemi = new THREE.HemisphereLight('#fff4d8', '#6b4728', 1.35);
      const key = new THREE.DirectionalLight('#fff2cf', 2.4);
      key.position.set(2.4, 3.2, 3.6);
      const rim = new THREE.DirectionalLight('#86f2e2', 1.15);
      rim.position.set(-2.6, 1.4, -2.0);
      scene.add(hemi, key, rim);

      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
      const loader = new GLTFLoader();

      const loadGlb = (url: string) =>
        new Promise<THREE.Object3D | null>((resolve) => {
          loader.load(url, (gltf) => resolve(gltf.scene), undefined, () => resolve(null));
        });

      const [wrenchObj, welderObj, grinderObj] = await Promise.all([
        loadGlb(WRENCH_MODEL_URL),
        loadGlb(WELDER_MODEL_URL),
        loadGlb(GRINDER_MODEL_URL),
      ]);

      if (wrenchObj) {
        cache.wrench = renderObjectToDataUrl(renderer, scene, camera, wrenchObj, [0.35, 0.55, -0.68]);
        disposeObject(wrenchObj);
      }
      if (welderObj) {
        cache.welder = renderObjectToDataUrl(renderer, scene, camera, welderObj, [0.22, -0.78, 0.18]);
        disposeObject(welderObj);
      }
      if (grinderObj) {
        cache.grinder = renderObjectToDataUrl(renderer, scene, camera, grinderObj, [0.28, -0.82, 0.24]);
        disposeObject(grinderObj);
      }

      const sawObj = buildSawPreviewMesh();
      cache.saw = renderObjectToDataUrl(renderer, scene, camera, sawObj, [0.22, -0.88, 0.18]);
      disposeObject(sawObj);

      const wireObj = buildWirePreviewMesh();
      cache.wire = renderObjectToDataUrl(renderer, scene, camera, wireObj, [0.22, -0.82, 0.18]);
      disposeObject(wireObj);
    } catch {
      // Fallback limpio a ToolIcon SVG si no hay WebGL disponible
    } finally {
      renderer?.dispose();
    }
    return cache;
  })();
  return pending;
}
