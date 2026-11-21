import { Suspense, type RefObject } from 'react';
import type { Group } from 'three';
import { PropModel } from '../props/PropModels';
import { GRINDER_MODEL_URL } from '../props/propModelConfig';

const SCALE = 0.8;

/** Amoladora de mano. `tipRef` queda delante del disco: de ahí sale el rayo de apuntado. */
export function GrinderTool({ tipRef }: { tipRef?: RefObject<Group | null> }) {
  return (
    <group position={[0.048, -0.014, 0.0]} rotation={[0.1, -0.12, 0.1]}>
      <group ref={tipRef} position={[0, -0.05 * SCALE, 0.2 * SCALE]} />
      <Suspense fallback={null}>
        <group scale={SCALE}>
          <PropModel url={GRINDER_MODEL_URL} />
        </group>
      </Suspense>
    </group>
  );
}
