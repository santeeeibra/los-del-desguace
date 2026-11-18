import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
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
}

export function CabezaBaseModel({
  bindingsRef,
  showBrows = true,
  showOutline = true,
  url = HEAD_MODEL_URL,
}: CabezaBaseModelProps) {
  const gltf = useGLTF(url);

  const { sceneClone, bindings } = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const extracted = extractFaceRigBindings(clone);
    return { sceneClone: clone, bindings: extracted };
  }, [gltf.scene]);

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
