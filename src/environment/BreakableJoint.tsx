import { useEffect, useRef } from 'react';
import { useAfterPhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { Quaternion, Vector3 } from 'three';
import { fragmentStore } from '../invention/fragmentStore';
import { BreakMonitor, hasBreakLimits, type BreakLimits } from '../physics/jointLoad';
import { registerSceneJoint } from '../physics/sceneJoints';
import { emitJointBroken } from '../props/jointEvents';

type MaybeBody = RapierRigidBody | null | undefined;

export interface BreakableFixedJointProps {
  /** Cuerpo base (suele ser fijo: torre, poste). */
  getBodyA: () => MaybeBody;
  /** Cuerpo que cuelga de A; es el que se mide y se suelta. */
  getBodyB: () => MaybeBody;
  /** Umbral de rotura por fuerza (N) o par (N·m). Sin umbral, la unión no se rompe sola. */
  limits: BreakLimits;
  /** Ids de objetos agarrables unidos: la Amoladora puede cortar la unión de cualquiera de ellos. */
  grindableIds?: readonly string[];
  /** Si la Sierra Láser corta alguna de estas piezas (queda "consumida"), la unión se suelta. */
  watchConsumedIds?: readonly string[];
  onBreak?: () => void;
  /** Cambiar esta clave vuelve a armar la unión (por ejemplo, al reiniciar un nivel). */
  resetKey?: number | string;
}

/**
 * Unión fija "soldada en el lugar" entre dos cuerpos, que se suelta cuando la fuerza o el par estimados
 * superan el umbral, cuando se corta con la Amoladora o cuando la Sierra Láser corta una pieza vigilada.
 */
export function BreakableFixedJoint({
  getBodyA,
  getBodyB,
  limits,
  grindableIds,
  watchConsumedIds,
  onBreak,
  resetKey,
}: BreakableFixedJointProps) {
  const { world, rapier } = useRapier();
  const jointRef = useRef<ReturnType<typeof world.createImpulseJoint> | null>(null);
  const brokenRef = useRef(false);
  const monitorRef = useRef(new BreakMonitor());
  const latest = useRef({ getBodyA, getBodyB, limits, watchConsumedIds, onBreak });
  latest.current = { getBodyA, getBodyB, limits, watchConsumedIds, onBreak };

  const breakJoint = useRef(() => {});
  breakJoint.current = () => {
    if (brokenRef.current) return;
    brokenRef.current = true;
    const joint = jointRef.current;
    jointRef.current = null;
    if (joint && joint.isValid()) world.removeImpulseJoint(joint, true);
    const b = latest.current.getBodyB();
    if (b?.isValid()) {
      const at = b.translation();
      b.wakeUp();
      emitJointBroken({ x: at.x, y: at.y, z: at.z });
    }
    latest.current.onBreak?.();
  };

  useEffect(() => {
    brokenRef.current = false;
    monitorRef.current.clear();
    const ids = grindableIds ?? [];
    const unregister = ids.map((id) => registerSceneJoint(id, () => breakJoint.current()));
    return () => {
      for (const off of unregister) off();
      const joint = jointRef.current;
      jointRef.current = null;
      if (joint && joint.isValid()) world.removeImpulseJoint(joint, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, world, grindableIds?.join('|')]);

  useAfterPhysicsStep(() => {
    if (brokenRef.current) return;
    const { getBodyA: bodyA, getBodyB: bodyB, limits: currentLimits, watchConsumedIds: watch } = latest.current;
    const a = bodyA();
    const b = bodyB();
    if (!a?.isValid() || !b?.isValid()) return;
    if (!jointRef.current) {
      // Se arma en el lugar: conserva la posición y orientación relativa que tienen en este momento.
      const qa = new Quaternion().copy(a.rotation() as Quaternion);
      const qb = new Quaternion().copy(b.rotation() as Quaternion);
      const qaInv = qa.clone().invert();
      const pa = a.translation();
      const pb = b.translation();
      const rel = new Vector3(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z).applyQuaternion(qaInv);
      const frame = qaInv.multiply(qb);
      jointRef.current = world.createImpulseJoint(
        rapier.JointData.fixed(
          { x: rel.x, y: rel.y, z: rel.z },
          { x: frame.x, y: frame.y, z: frame.z, w: frame.w },
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0, w: 1 },
        ),
        a,
        b,
        true,
      );
      monitorRef.current.reset('joint');
      return;
    }
    if (!a.isEnabled() || !b.isEnabled() || watch?.some((id) => fragmentStore.isConsumed(id))) {
      breakJoint.current();
      return;
    }
    if (!hasBreakLimits(currentLimits)) return;
    const principal = typeof b.principalInertia === 'function' ? b.principalInertia() : null;
    const mass = b.mass();
    const kin = {
      mass,
      linvel: b.linvel(),
      angvel: b.angvel(),
      inertia: principal ? (principal.x + principal.y + principal.z) / 3 : mass * 0.04,
    };
    if (monitorRef.current.update('joint', kin, currentLimits, 1 / 60)) breakJoint.current();
  });

  return null;
}
