import { Suspense, type RefObject } from 'react';
import type { Group } from 'three';
import { PropModel } from '../props/PropModels';
import { WELDER_MODEL_URL } from '../props/propModelConfig';

const SCALE = 0.7;

/** Soldadora de mano. `tipRef` queda en la boquilla: de ahí sale el rayo de apuntado. */
export function WelderTool({ tipRef }: { tipRef?: RefObject<Group | null> }) {
  return (
    <group position={[0.048, -0.014, 0.013]} rotation={[0.1, -0.12, 0.1]}>
      <group ref={tipRef} position={[0, 0.042 * SCALE, 0.352 * SCALE]} />
      <Suspense fallback={null}>
        <group scale={SCALE}>
          <PropModel url={WELDER_MODEL_URL} />
        </group>
      </Suspense>
    </group>
  );
}
