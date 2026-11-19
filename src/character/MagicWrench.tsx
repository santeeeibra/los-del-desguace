import { Suspense, type RefObject } from 'react';
import type { Group } from 'three';
import { PropModel } from '../props/PropModels';
import { USE_LEGACY_PROP_VISUALS, WRENCH_MODEL_URL } from '../props/propModelConfig';

export function MagicWrench({ tipRef }: { tipRef?: RefObject<Group | null> }) {
  const fallback = (
    <>
      <mesh position={[0, 0, 0.086]}>
        <boxGeometry args={[0.052, 0.039, 0.29]} />
        <meshStandardMaterial color="#3a5966" metalness={0.75} roughness={0.34} />
      </mesh>
      <mesh position={[0, 0.022, 0.039]}>
        <boxGeometry args={[0.033, 0.007, 0.133]} />
        <meshStandardMaterial color="#84ead0" emissive="#37ba91" emissiveIntensity={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.238]}>
        <boxGeometry args={[0.136, 0.047, 0.045]} />
        <meshStandardMaterial color="#99c4c8" metalness={0.62} roughness={0.3} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.061, 0, 0.277]} rotation={[0, side * -0.24, 0]}>
          <boxGeometry args={[0.038, 0.045, 0.073]} />
          <meshStandardMaterial color="#99c4c8" metalness={0.62} roughness={0.3} />
        </mesh>
      ))}
    </>
  );
  return (
    <group position={[0.048, -0.014, 0.013]} rotation={[0.1, -0.12, 0.1]}>
      <group ref={tipRef} position={[0, 0, 0.31]} />
      {USE_LEGACY_PROP_VISUALS ? fallback : (
        <Suspense fallback={fallback}>
          <group position={[0, 0, 0.102]} rotation={[Math.PI / 2, 0, 0]} scale={0.74}>
            <PropModel url={WRENCH_MODEL_URL} />
          </group>
        </Suspense>
      )}
    </group>
  );
}
