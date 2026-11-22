import type { RapierRigidBody, useRapier } from '@react-three/rapier';
import { Quaternion, Vector3 } from 'three';
import { getPartLogicOutput } from '../logic/contraptionRegistry';
import { grabbableRegistry } from '../props/grabbableRegistry';
import {
  attachClawGrip,
  releaseClawGrip,
  ROBOTICS_SPECS,
  roboticKindFromId,
  stepWinchTension,
  winchRopes,
  type ClawGripState,
  type WinchState,
} from './robotics';

type PhysicsContext = ReturnType<typeof useRapier>;

const claws = new Map<string, ClawGripState>();
const winches = new Map<string, WinchState & { wasOn: boolean }>();
const _dir = new Vector3();
const _q = new Quaternion();

/**
 * Pinza y Cabrestante: se manejan con su señal lógica (interruptor / temporizador cableado).
 * - Pinza: con señal agarra lo más cercano dentro de su radio; sin señal suelta.
 * - Cabrestante: al recibir señal lanza el gancho hacia adelante (+Z local) y engancha lo primero
 *   que toca; mientras tiene señal enrolla la soga; sin señal la mantiene trabada.
 */
export function stepRoboticTools({ world, rapier }: Pick<PhysicsContext, 'world' | 'rapier'>, dt: number, ownBodies?: (id: string) => Set<number>) {
  const seen = new Set<string>();
  for (const entry of grabbableRegistry.getAll()) {
    if (entry.kind !== 'robotic') continue;
    const kind = roboticKindFromId(entry.id);
    if (kind !== 'claw' && kind !== 'winch') continue;
    const body = entry.getBody();
    if (!body?.isValid()) continue;
    seen.add(entry.id);
    const on = getPartLogicOutput(entry.id) > 0.5;
    const skip = ownBodies?.(entry.id) ?? new Set<number>();
    skip.add(body.handle);

    if (kind === 'claw') {
      let state = claws.get(entry.id);
      if (!state) { state = { clawBody: body, grabbedBody: null, gripJoint: null, closed: false }; claws.set(entry.id, state); }
      state.clawBody = body;
      if (on && !state.closed) {
        const radius = ROBOTICS_SPECS.claw.gripRadius ?? 0.58;
        const p = body.translation();
        let best: RapierRigidBody | null = null;
        let bestD = Infinity;
        world.intersectionsWithShape(p, body.rotation(), new rapier.Ball(radius), (collider) => {
          const other = collider.parent();
          // Solo piezas del taller (nunca al jugador ni al piso).
          if (!other || other.isFixed() || skip.has(other.handle) || !(other.userData as { grabbableId?: string } | undefined)?.grabbableId) return true;
          const t = other.translation();
          const d = Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z);
          if (d < bestD) { bestD = d; best = other; }
          return true;
        });
        if (best) attachClawGrip({ world, rapier }, state, best);
      } else if (!on && state.closed) {
        releaseClawGrip(world, state);
      }
      continue;
    }

    let state = winches.get(entry.id);
    if (!state) {
      state = { winchBody: body, anchorWorldPoint: null, anchorBody: null, anchorLocalOffset: new Vector3(), cableLength: 0, reelCommand: 0, wasOn: false };
      winches.set(entry.id, state);
    }
    state.winchBody = body;
    if (on && !state.wasOn && !state.anchorBody && !state.anchorWorldPoint) {
      const p = body.translation();
      const q = body.rotation();
      _dir.set(0, 0, 1).applyQuaternion(_q.set(q.x, q.y, q.z, q.w)).normalize();
      const ray = new rapier.Ray(p, { x: _dir.x, y: _dir.y, z: _dir.z });
      const hit = world.castRay(ray, ROBOTICS_SPECS.winch.maxCableLength ?? 18, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined, undefined, undefined, (c) => !skip.has(c.parent()?.handle ?? -1));
      if (hit) {
        const point = new Vector3(p.x + _dir.x * hit.timeOfImpact, p.y + _dir.y * hit.timeOfImpact, p.z + _dir.z * hit.timeOfImpact);
        const other = hit.collider.parent();
        if (other && !other.isFixed()) {
          const t = other.translation();
          const r = other.rotation();
          state.anchorBody = other;
          state.anchorLocalOffset.set(point.x - t.x, point.y - t.y, point.z - t.z)
            .applyQuaternion(_q.set(r.x, r.y, r.z, r.w).invert());
        } else {
          state.anchorWorldPoint = point;
        }
        state.cableLength = hit.timeOfImpact;
      }
    }
    state.wasOn = on;
    state.reelCommand = on ? 1 : 0;
    const rope = stepWinchTension(state, dt);
    if (rope) winchRopes.set(entry.id, rope);
    else winchRopes.delete(entry.id);
  }
  for (const id of [...claws.keys()]) if (!seen.has(id)) { releaseClawGrip(world, claws.get(id)!); claws.delete(id); }
  for (const id of [...winches.keys()]) if (!seen.has(id)) { winches.delete(id); winchRopes.delete(id); }
}

/** Reparar (H): sueltan las pinzas y se recogen los ganchos. */
export function resetRoboticTools(world: PhysicsContext['world']) {
  for (const s of claws.values()) releaseClawGrip(world, s);
  claws.clear();
  winches.clear();
  winchRopes.clear();
}
