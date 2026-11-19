import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { grabbableRegistry } from '../props/grabbableRegistry';
import { gameStore } from '../state/gameStore';
import type { LogicGraph } from './logicGraph';

const SEGMENTS_PER_WIRE = 8;
const MAX_WIRES = 32;
const MAX_INSTANCES = MAX_WIRES * SEGMENTS_PER_WIRE;
const MAX_RENDER_WIRE_DIST = 14;

interface LogicCablesProps {
  graph: LogicGraph;
  /** Posiciones fijas opcionales por nodeId cuando el nodo no está ligado a un grabbable. */
  anchors?: Record<string, THREE.Vector3>;
}

/**
 * Renderiza cables 3D con catenaria entre nodos lógicos conectados.
 * Usa un único InstancedMesh sin asignaciones por frame e ilumina cada cable según su señal (-1..+1).
 */
export function LogicCables({ graph, anchors }: LogicCablesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const startVec = useMemo(() => new THREE.Vector3(), []);
  const endVec = useMemo(() => new THREE.Vector3(), []);
  const pA = useMemo(() => new THREE.Vector3(), []);
  const pB = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const mid = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const color = useMemo(() => new THREE.Color(), []);

  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.45,
        metalness: 0.15,
      }),
    []
  );

  useEffect(() => () => mat.dispose(), [mat]);

  const resolveEndpoint = (nodeId: string, out: THREE.Vector3, storedIds: Set<string>): boolean => {
    const node = graph.getNode(nodeId);
    if (!node) return false;
    if (node.bodyId) {
      if (node.bodyId === grabbableRegistry.carriedId) {
        out.copy(grabbableRegistry.carriedVisualPos);
        out.y += 0.22;
        return Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z);
      }
      if (storedIds.has(node.bodyId)) return false;
      const entry = grabbableRegistry.getById(node.bodyId);
      const body = entry?.getBody();
      if (!entry || !body?.isValid() || !body.isEnabled()) return false;
      if (entry.getWorldPos(out)) {
        out.y += 0.22;
        return Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z);
      }
      return false;
    }
    const fixed = anchors?.[nodeId];
    if (fixed) {
      out.copy(fixed);
      return Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z);
    }
    return false;
  };

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const wires = graph.getWires();
    const storedIds = new Set<string>();
    for (const item of gameStore.getState().inventorySlots) {
      if (item?.id) storedIds.add(item.id);
    }
    let instanceIdx = 0;

    for (let w = 0; w < wires.length && w < MAX_WIRES; w++) {
      const wire = wires[w];
      if (!resolveEndpoint(wire.fromNodeId, startVec, storedIds) || !resolveEndpoint(wire.toNodeId, endVec, storedIds)) {
        continue;
      }

      const dist = startVec.distanceTo(endVec);
      if (dist > MAX_RENDER_WIRE_DIST) continue;

      if (wire.signal > 0.5) color.set('#66f5a3');
      else if (wire.signal < -0.5) color.set('#5cc8ff');
      else color.set('#30353d');

      const sag = Math.min(0.45, dist * 0.18);

      for (let s = 0; s < SEGMENTS_PER_WIRE; s++) {
        const t0 = s / SEGMENTS_PER_WIRE;
        const t1 = (s + 1) / SEGMENTS_PER_WIRE;
        pA.lerpVectors(startVec, endVec, t0);
        pB.lerpVectors(startVec, endVec, t1);
        pA.y -= Math.sin(t0 * Math.PI) * sag;
        pB.y -= Math.sin(t1 * Math.PI) * sag;

        dir.subVectors(pB, pA);
        const segLen = dir.length();
        if (segLen < 1e-4) continue;
        mid.addVectors(pA, pB).multiplyScalar(0.5);
        dir.normalize();

        dummy.position.copy(mid);
        dummy.quaternion.setFromUnitVectors(up, dir);
        dummy.scale.set(0.016, segLen * 1.04, 0.016);
        dummy.updateMatrix();
        mesh.setMatrixAt(instanceIdx, dummy.matrix);
        mesh.setColorAt(instanceIdx, color);
        instanceIdx++;
      }
    }

    mesh.count = instanceIdx;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_INSTANCES]} frustumCulled={false}>
      <cylinderGeometry args={[1, 1, 1, 6]} />
      <primitive object={mat} attach="material" />
    </instancedMesh>
  );
}
