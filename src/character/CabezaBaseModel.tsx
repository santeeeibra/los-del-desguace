import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Mesh, MeshStandardMaterial, type Material } from 'three';
import {
  extractFaceRigBindings,
  type FaceRigBindings,
} from './faceRigController';

export const HEAD_MODEL_URL = '/models/cabeza_base_v002.glb';

interface CabezaBaseModelProps {
  bindingsRef: React.MutableRefObject<FaceRigBindings | null>;
  showBrows?: boolean;
  showOutline?: boolean;
  /** Modelo de cabeza (registro `HEAD_VARIANTS`); por defecto la cabeza base v002. */
  url?: string;
  skinColor?: string;
  browColor?: string;
}

export function CabezaBaseModel({
  bindingsRef,
  showBrows = true,
  showOutline = true,
  url = HEAD_MODEL_URL,
  skinColor,
  browColor,
}: CabezaBaseModelProps) {
  const gltf = useGLTF(url);

  const { sceneClone, bindings, tinted } = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const extracted = extractFaceRigBindings(clone);
    const tinted = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    clone.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const cloneTinted = (material: Material) => {
        if (!(material instanceof MeshStandardMaterial) ||
            !['M_skin', 'M_skin_dark', 'M_brow'].includes(material.name)) return material;
        const existing = tinted.get(material);
        if (existing) return existing;
        const individual = material.clone();
        tinted.set(material, individual);
        return individual;
      };
      object.material = Array.isArray(object.material) ? object.material.map(cloneTinted) : cloneTinted(object.material);
    });
    return { sceneClone: clone, bindings: extracted, tinted };
  }, [gltf.scene]);

  useEffect(() => {
    for (const [original, material] of tinted) {
      const color = material.name === 'M_brow' ? browColor : skinColor;
      if (color) {
        material.color.set(color);
        if (material.name === 'M_skin_dark') material.color.multiplyScalar(0.78);
      } else {
        material.color.copy(original.color);
      }
    }
  }, [tinted, skinColor, browColor]);

  useEffect(() => () => {
    for (const material of tinted.values()) material.dispose();
  }, [tinted]);

  useEffect(() => {
    bindingsRef.current = bindings;
    return () => {
      if (bindingsRef.current === bindings) {
        bindingsRef.current = null;
      }
    };
  }, [bindings, bindingsRef]);

  useEffect(() => {
    if (bindings.browNode) {
      bindings.browNode.visible = showBrows;
    }
    for (const outline of bindings.outlineMeshes) {
      outline.visible = showOutline;
    }
  }, [bindings, showBrows, showOutline]);

  return <primitive object={sceneClone} />;
}

useGLTF.preload(HEAD_MODEL_URL);
