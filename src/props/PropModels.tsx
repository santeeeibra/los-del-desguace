import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { PROP_MODEL_URLS, USE_LEGACY_PROP_VISUALS } from './propModelConfig';

/**
 * Modelos estilizados generados en Blender (ver art/blender/build_props.py).
 * Solo reemplazan la representación visual: tamaño, pivote (centro),
 * identificadores, agarre y colliders siguen definidos en GrabbableProps.
 */

const prepared = new WeakSet<THREE.Object3D>();

export function PropModel({ url }: { url: string }) {
  // Sin Draco ni Meshopt: los GLB usan solo WebP + KHR_mesh_quantization (nativos en GLTFLoader).
  const { scene } = useGLTF(url, false, false);

  const model = useMemo(() => {
    if (!prepared.has(scene)) {
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        for (const tex of [mat.map, mat.normalMap, mat.roughnessMap, mat.aoMap]) {
          if (tex) tex.anisotropy = 4;
        }
      });
      prepared.add(scene);
    }
    // clone() comparte geometría, material y texturas entre todas las instancias
    const c = scene.clone(true);
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);

  return <primitive object={model} />;
}

if (!USE_LEGACY_PROP_VISUALS) {
  for (const url of Object.values(PROP_MODEL_URLS)) useGLTF.preload(url, false, false);
}
