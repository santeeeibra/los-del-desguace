import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAfterPhysicsStep, useRapier } from '@react-three/rapier';
import { Ecctrl, type EcctrlHandle } from 'ecctrl';
import * as THREE from 'three';
import { DustPuffPool, type DustPuffHandle } from '../character/DustPuffPool';
import { InventorCharacter, type CharacterAnimData } from '../character/InventorCharacter';
import { CHARACTER_DIMENSIONS } from '../config/visualConfig';
import { playerInput, type PlayerInputSnapshot } from '../controls/playerInput';
import type { CameraTargetSource } from '../controls/ThirdPersonCamera';
import {
  CARRY_PROFILES,
  grabbableRegistry,
  type GrabbableKind,
} from '../props/grabbableRegistry';
import { gameStore, useGameStore } from '../state/gameStore';

interface PlayerRigProps {
  maxDustPuffs: number;
  resetSignal: number;
  cameraSourceRef: React.MutableRefObject<CameraTargetSource>;
  enabled?: boolean;
  teleportTarget?: [number, number, number] | null;
}

const SPAWN_POS: [number, number, number] = [-0.6, 1.15, 4.2];

export function PlayerRig({
  maxDustPuffs,
  resetSignal,
  cameraSourceRef,
  enabled = true,
  teleportTarget = null,
}: PlayerRigProps) {
  const ecctrlRef = useRef<EcctrlHandle>(null);
  const visualCenterRef = useRef<THREE.Group>(null);
  const carryAnchorRef = useRef<THREE.Group | null>(null);
  const dustPoolRef = useRef<DustPuffHandle>(null);
  const cameraMode = useGameStore((s) => s.cameraMode);
  const { camera } = useThree();
  const { rapier, world } = useRapier();

  const animDataRef = useRef<CharacterAnimData>({
    speed: 0,
    verticalSpeed: 0,
    isOnGround: true,
    isMoving: false,
    isRunning: false,
    isCarrying: false,
    carriedKind: null,
    carryDist: 0.72,
    carryLift: -0.04,
    accelForward: 0,
    turnRate: 0,
    takeoffImpulse: 0,
    landImpulse: 0,
    bumpImpulse: 0,
    dropBlockedImpulse: 0,
  });

  const inputSnapshotRef = useRef<PlayerInputSnapshot>({
    forward: false,
    backward: false,
    leftward: false,
    rightward: false,
    jump: false,
    run: false,
    joystick: { x: 0, y: 0 },
  });

  const wasOnGround = useRef(true);
  const prevHorizSpeed = useRef(0);
  const prevMinVerticalSpeed = useRef(0);
  const prevForwardVel = useRef(0);
  const prevYaw = useRef(0);
  const shakeRef = useRef(0);
  const bumpCooldown = useRef(0);
  const carriedIdRef = useRef<string | null>(null);
  const carriedKindRef = useRef<GrabbableKind | null>(null);
  const smoothCarryDistRef = useRef(0.72);
  const smoothCarryLiftRef = useRef(-0.04);
  const lastSafeYawRef = useRef(0);
  const resolvedDistRef = useRef(0.72);
  const resolvedLiftRef = useRef(-0.04);
  const safeVisualYawRef = useRef<number | null>(null);

  // Reusable scratch objects (zero per-frame allocations)
  const scratchPlayerPos = useRef(new THREE.Vector3());
  const scratchVisualPos = useRef(new THREE.Vector3());
  const scratchForward = useRef(new THREE.Vector3());
  const scratchCamFwd = useRef(new THREE.Vector3());
  const scratchCamRight = useRef(new THREE.Vector3());
  const scratchItemPos = useRef(new THREE.Vector3());
  const scratchToItem = useRef(new THREE.Vector3());
  const scratchRayDir = useRef(new THREE.Vector3());
  const scratchDropQuat = useRef(new THREE.Quaternion());
  const scratchShapeQuat = useRef(new THREE.Quaternion());
  const scratchBodyQuat = useRef(new THREE.Quaternion());
  const scratchPostFwd = useRef(new THREE.Vector3());
  const scratchWheelOffsetQuat = useRef(
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2))
  );
  const scratchDropEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const scratchCandDir = useRef(new THREE.Vector3());
  const dropRayRef = useRef<InstanceType<typeof rapier.Ray> | null>(null);
  const dropShapesRef = useRef<{
    crate: InstanceType<typeof rapier.Cuboid>;
    wheel: InstanceType<typeof rapier.Cylinder>;
    canister: InstanceType<typeof rapier.Cylinder>;
    part: InstanceType<typeof rapier.Cuboid>;
    sweepBall: InstanceType<typeof rapier.Ball>;
  } | null>(null);

  // Wire up camera target source when active
  useEffect(() => {
    if (!enabled) return;
    cameraSourceRef.current = {
      getTargetPosition(out: THREE.Vector3) {
        if (visualCenterRef.current) {
          visualCenterRef.current.getWorldPosition(out);
          return true;
        }
        const ctrl = ecctrlRef.current;
        if (!ctrl) return false;
        const b = ctrl.body;
        if (b) {
          const t = b.translation();
          out.set(t.x, t.y, t.z);
        } else {
          out.copy(ctrl.currPos);
        }
        return true;
      },
      getExcludedBodyHandle() {
        return ecctrlRef.current?.body?.handle ?? null;
      },
      getShakeIntensity() {
        return shakeRef.current;
      },
    };
  }, [cameraSourceRef, enabled]);

  // Teleport character safely when exiting vehicle or moving between modes
  useEffect(() => {
    if (!teleportTarget || !ecctrlRef.current?.body) return;
    const b = ecctrlRef.current.body;
    b.setTranslation({ x: teleportTarget[0], y: teleportTarget[1], z: teleportTarget[2] }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }, [teleportTarget]);

  // Reset player position & drop any carried prop when reset is triggered
  useEffect(() => {
    const ctrl = ecctrlRef.current;
    if (!ctrl || !ctrl.body) return;

    if (carriedIdRef.current) {
      const entry = grabbableRegistry.getById(carriedIdRef.current);
      const body = entry?.getBody();
      const col = entry?.getCollider();
      if (body && col) {
        col.setSensor(false);
        col.setEnabled(true);
        body.setEnabled(true);
        body.setBodyType(rapier.RigidBodyType.Dynamic, true);
      }
      carriedIdRef.current = null;
      carriedKindRef.current = null;
      grabbableRegistry.carriedId = null;
      gameStore.setCarried(null, null);
    }

    ctrl.body.setTranslation({ x: SPAWN_POS[0], y: SPAWN_POS[1], z: SPAWN_POS[2] }, true);
    ctrl.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ctrl.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }, [resetSignal, rapier]);

  const ensureVolumeShapes = () => {
    if (!dropShapesRef.current) {
      dropShapesRef.current = {
        crate: new rapier.Cuboid(0.34, 0.31, 0.34),
        wheel: new rapier.Cylinder(0.16, 0.4),
        canister: new rapier.Cylinder(0.39, 0.24),
        part: new rapier.Cuboid(0.29, 0.24, 0.24),
        sweepBall: new rapier.Ball(0.16),
      };
    }
    if (!dropRayRef.current) {
      dropRayRef.current = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    }
    return dropShapesRef.current;
  };

  const isCarryPoseClear = (
    px: number,
    py: number,
    pz: number,
    yaw: number,
    dist: number,
    lift: number,
    kind: GrabbableKind,
    ctrlBody: NonNullable<EcctrlHandle['body']>,
    carriedBodyHandle: number | null
  ): { clear: boolean; hitNormalX: number; hitNormalZ: number } => {
    const shapes = ensureVolumeShapes();
    const volumeShape = shapes[kind];
    const sweepBall = shapes.sweepBall;
    const profile = CARRY_PROFILES[kind];

    const dirX = Math.sin(yaw);
    const dirZ = Math.cos(yaw);
    const chestY = py - 0.08 + lift;
    const targetX = px + dirX * dist;
    const targetZ = pz + dirZ * dist;

    // 1. Continuous path check from player center out to target so object never crosses through a wall
    const pathHit = world.castShape(
      { x: px, y: chestY, z: pz },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: dirX, y: 0, z: dirZ },
      sweepBall,
      0,
      dist,
      true,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      ctrlBody,
      (collider) => {
        const parent = collider.parent();
        return parent ? parent.handle !== carriedBodyHandle : true;
      }
    );
    if (pathHit) {
      return {
        clear: false,
        hitNormalX: pathHit.normal1.x,
        hitNormalZ: pathHit.normal1.z,
      };
    }

    // 2. Full-volume intersection check at target pose
    scratchDropEuler.current.set(profile.tiltX, yaw, 0);
    scratchDropQuat.current.setFromEuler(scratchDropEuler.current);
    if (kind === 'wheel') {
      scratchShapeQuat.current
        .copy(scratchDropQuat.current)
        .multiply(scratchWheelOffsetQuat.current);
    } else {
      scratchShapeQuat.current.copy(scratchDropQuat.current);
    }

    const hitCollider = world.intersectionWithShape(
      { x: targetX, y: chestY, z: targetZ },
      {
        x: scratchShapeQuat.current.x,
        y: scratchShapeQuat.current.y,
        z: scratchShapeQuat.current.z,
        w: scratchShapeQuat.current.w,
      },
      volumeShape,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      ctrlBody,
      (collider) => {
        const parent = collider.parent();
        return parent ? parent.handle !== carriedBodyHandle : true;
      }
    );

    if (hitCollider) {
      // Recover true surface normal of the obstructed wall so sliding & backing out stay free
      const perpX = dirZ;
      const perpZ = -dirX;
      const maxRay = dist + profile.dropRadius + 0.35;
      const ray = dropRayRef.current!;
      ray.dir = { x: dirX, y: 0, z: dirZ };
      const offsets = [0, 0.22, -0.22];
      for (const lat of offsets) {
        ray.origin = { x: px + perpX * lat, y: chestY, z: pz + perpZ * lat };
        const nHit = world.castRayAndGetNormal(
          ray,
          maxRay,
          true,
          rapier.QueryFilterFlags.EXCLUDE_SENSORS,
          undefined,
          undefined,
          ctrlBody,
          (collider) => {
            const parent = collider.parent();
            return parent ? parent.handle !== carriedBodyHandle : true;
          }
        );
        if (nHit && Math.hypot(nHit.normal.x, nHit.normal.z) > 0.25) {
          return { clear: false, hitNormalX: nHit.normal.x, hitNormalZ: nHit.normal.z };
        }
      }
      return { clear: false, hitNormalX: -dirX, hitNormalZ: -dirZ };
    }
    return { clear: true, hitNormalX: 0, hitNormalZ: 0 };
  };

  const findClearCarryAdjust = (
    px: number,
    py: number,
    pz: number,
    yaw: number,
    kind: GrabbableKind,
    ctrlBody: NonNullable<EcctrlHandle['body']>,
    carriedBodyHandle: number | null
  ): { dist: number; lift: number; hitNormalX: number; hitNormalZ: number } | null => {
    const profile = CARRY_PROFILES[kind];
    // Strict carry bounds within arm reach (never stretches upward away from hands)
    const minTuck = Math.max(0.46, CHARACTER_DIMENSIONS.capsuleRadius + 0.14);
    const midTuck = (minTuck + profile.holdDistance) * 0.5;
    const emergencyTuck = Math.max(0.42, CHARACTER_DIMENSIONS.capsuleRadius + 0.1);
    const adjustments: readonly [number, number][] = [
      [profile.holdDistance, profile.holdHeight],
      [midTuck, profile.holdHeight],
      [minTuck, profile.holdHeight],
      [minTuck, profile.holdHeight + 0.08],
      [minTuck, profile.holdHeight + 0.16],
      [minTuck, profile.holdHeight - 0.06],
      [emergencyTuck, profile.holdHeight],
    ];

    for (const [dist, lift] of adjustments) {
      const res = isCarryPoseClear(px, py, pz, yaw, dist, lift, kind, ctrlBody, carriedBodyHandle);
      if (res.clear) {
        return { dist, lift, hitNormalX: 0, hitNormalZ: 0 };
      }
    }
    return null;
  };

  const dropCarriedItem = () => {
    const carriedId = carriedIdRef.current;
    const carriedKind = carriedKindRef.current ?? 'crate';
    if (!carriedId) return;
    const entry = grabbableRegistry.getById(carriedId);
    const body = entry?.getBody();
    const col = entry?.getCollider();
    const ctrl = ecctrlRef.current;

    if (!body || !col || !ctrl || !ctrl.body) {
      carriedIdRef.current = null;
      carriedKindRef.current = null;
      grabbableRegistry.carriedId = null;
      gameStore.setCarried(null, null);
      return;
    }

    const shapes = ensureVolumeShapes();

    const profile = CARRY_PROFILES[carriedKind];
    const volumeShape = shapes[carriedKind];
    const halfHeight = profile.dropHalfExtents[1];

    scratchPlayerPos.current.copy(ctrl.currPos);
    scratchForward.current.copy(ctrl.bodyZAxis).setY(0).normalize();
    if (scratchForward.current.lengthSq() < 0.01) {
      scratchForward.current.set(0, 0, 1);
    }

    const baseYaw = Math.atan2(scratchForward.current.x, scratchForward.current.z);
    // Guarantee radial separation outside player's 0.32m capsule + object's footprint
    const minHorizDist = CHARACTER_DIMENSIONS.capsuleRadius + profile.dropRadius + 0.16;
    const primaryDist = Math.max(profile.holdDistance + 0.12, minHorizDist);
    const playerFeetY =
      scratchPlayerPos.current.y -
      CHARACTER_DIMENSIONS.capsuleHalfHeight -
      CHARACTER_DIMENSIONS.capsuleRadius;

    // Candidate offsets: (yawAngleOffset, distance, extraHeightAboveFeet)
    const candidates: readonly [number, number, number][] = [
      [0, primaryDist, halfHeight + 0.06],
      [0, primaryDist, halfHeight + 0.38],
      [0, primaryDist, halfHeight + 0.72],
      [0, primaryDist + 0.34, halfHeight + 0.06],
      [0.58, primaryDist, halfHeight + 0.06],
      [-0.58, primaryDist, halfHeight + 0.06],
      [0.58, primaryDist, halfHeight + 0.42],
      [-0.58, primaryDist, halfHeight + 0.42],
      [1.25, primaryDist, halfHeight + 0.08],
      [-1.25, primaryDist, halfHeight + 0.08],
      [Math.PI, primaryDist, halfHeight + 0.08],
    ];

    const ray = dropRayRef.current!;
    const sweepBall = shapes.sweepBall;
    let foundPose: { x: number; y: number; z: number; q: THREE.Quaternion } | null = null;

    for (const [yawOffset, dist, heightAboveFeet] of candidates) {
      const candYaw = baseYaw + yawOffset;
      scratchCandDir.current.set(Math.sin(candYaw), 0, Math.cos(candYaw));

      const candX = scratchPlayerPos.current.x + scratchCandDir.current.x * dist;
      let candY = playerFeetY + heightAboveFeet;
      const candZ = scratchPlayerPos.current.z + scratchCandDir.current.z * dist;

      // 1. Check line-of-sight from player chest to candidate spot so we never drop through a wall
      const chestY = scratchPlayerPos.current.y + 0.25;
      const toCandX = candX - scratchPlayerPos.current.x;
      const toCandY = candY - chestY;
      const toCandZ = candZ - scratchPlayerPos.current.z;
      const toCandLen = Math.hypot(toCandX, toCandY, toCandZ);

      if (toCandLen > 0.05) {
        const losHit = world.castShape(
          { x: scratchPlayerPos.current.x, y: chestY, z: scratchPlayerPos.current.z },
          { x: 0, y: 0, z: 0, w: 1 },
          { x: toCandX / toCandLen, y: toCandY / toCandLen, z: toCandZ / toCandLen },
          sweepBall,
          0,
          toCandLen,
          true,
          rapier.QueryFilterFlags.EXCLUDE_SENSORS,
          undefined,
          undefined,
          ctrl.body,
          (collider) => collider.parent()?.handle !== body.handle
        );
        if (losHit) {
          continue;
        }
      }

      // 2. Check ground beneath candidate spot so object is never placed overlapping below floor
      ray.origin.x = candX;
      ray.origin.y = candY + 0.4;
      ray.origin.z = candZ;
      ray.dir.x = 0;
      ray.dir.y = -1;
      ray.dir.z = 0;
      const groundHit = world.castRay(
        ray,
        3.2,
        true,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        ctrl.body,
        (collider) => collider.parent()?.handle !== body.handle
      );
      if (!groundHit) {
        continue;
      }
      const surfaceY = ray.origin.y - groundHit.timeOfImpact;
      if (candY < surfaceY + halfHeight + 0.04) {
        candY = surfaceY + halfHeight + 0.05;
      }

      // 3. Full-volume intersection test against ALL colliders INCLUDING player capsule!
      scratchDropEuler.current.set(0, candYaw, 0);
      scratchDropQuat.current.setFromEuler(scratchDropEuler.current);
      if (carriedKind === 'wheel') {
        scratchShapeQuat.current
          .copy(scratchDropQuat.current)
          .multiply(scratchWheelOffsetQuat.current);
      } else {
        scratchShapeQuat.current.copy(scratchDropQuat.current);
      }

      const overlapping = world.intersectionWithShape(
        { x: candX, y: candY, z: candZ },
        {
          x: scratchShapeQuat.current.x,
          y: scratchShapeQuat.current.y,
          z: scratchShapeQuat.current.z,
          w: scratchShapeQuat.current.w,
        },
        volumeShape,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        undefined,
        (collider) => collider.parent()?.handle !== body.handle
      );

      if (!overlapping) {
        foundPose = { x: candX, y: candY, z: candZ, q: scratchDropQuat.current.clone() };
        break;
      }
    }

    if (!foundPose) {
      // No free non-overlapping volume available: keep holding and alert player briefly
      animDataRef.current.dropBlockedImpulse = 1;
      gameStore.triggerDropBlocked();
      return;
    }

    // Gentle drop velocity: NO automatic launch! Cap horizontal carry-over speed cleanly.
    const gentleVx = THREE.MathUtils.clamp(ctrl.currLinVel.x * 0.15, -0.65, 0.65);
    const gentleVz = THREE.MathUtils.clamp(ctrl.currLinVel.z * 0.15, -0.65, 0.65);

    body.setTranslation({ x: foundPose.x, y: foundPose.y, z: foundPose.z }, true);
    body.setRotation(
      { x: foundPose.q.x, y: foundPose.q.y, z: foundPose.q.z, w: foundPose.q.w },
      true
    );
    body.setLinvel({ x: gentleVx, y: -0.05, z: gentleVz }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    col.setSensor(false);
    col.setEnabled(true);
    body.setEnabled(true);
    body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    body.wakeUp();

    grabbableRegistry.carriedVisualPos.set(foundPose.x, foundPose.y, foundPose.z);
    grabbableRegistry.carriedVisualQuat.copy(foundPose.q);

    carriedIdRef.current = null;
    carriedKindRef.current = null;
    grabbableRegistry.carriedId = null;
    gameStore.setCarried(null, null);
  };

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const ctrl = ecctrlRef.current;
    if (!ctrl || !ctrl.body) return;

    if (!enabled) {
      inputSnapshotRef.current.forward = false;
      inputSnapshotRef.current.backward = false;
      inputSnapshotRef.current.leftward = false;
      inputSnapshotRef.current.rightward = false;
      inputSnapshotRef.current.jump = false;
      inputSnapshotRef.current.run = false;
      inputSnapshotRef.current.joystick.x = 0;
      inputSnapshotRef.current.joystick.y = 0;
      ctrl.setMovement(inputSnapshotRef.current);
      return;
    }

    const isFirstPerson = gameStore.getState().cameraMode === 'firstPerson';
    ctrl.setLockForward(isFirstPerson);

    // 1. Feed unified keyboard + touch input to Ecctrl (preventing only inward carry wall penetration)
    const inputSnapshot = inputSnapshotRef.current;
    playerInput.fillMovement(inputSnapshot);
    if (carriedIdRef.current && carriedKindRef.current) {
      inputSnapshot.run = false;

      const carriedEntry = grabbableRegistry.getById(carriedIdRef.current);
      const carriedBodyHandle = carriedEntry?.getBody()?.handle ?? null;
      const carryKind = carriedKindRef.current;
      const carryProf = CARRY_PROFILES[carryKind];
      const p = ctrl.currPos;
      const yawForMove = Math.atan2(ctrl.bodyZAxis.x, ctrl.bodyZAxis.z);

      camera.getWorldDirection(scratchCamFwd.current);
      scratchCamFwd.current.y = 0;
      if (scratchCamFwd.current.lengthSq() > 1e-6) {
        scratchCamFwd.current.normalize();
      } else {
        scratchCamFwd.current.set(0, 0, -1);
      }
      scratchCamRight.current.set(-scratchCamFwd.current.z, 0, scratchCamFwd.current.x);

      let rawRight =
        inputSnapshot.joystick.x !== 0 || inputSnapshot.joystick.y !== 0
          ? inputSnapshot.joystick.x
          : (inputSnapshot.rightward ? 1 : 0) - (inputSnapshot.leftward ? 1 : 0);
      let rawFwd =
        inputSnapshot.joystick.x !== 0 || inputSnapshot.joystick.y !== 0
          ? inputSnapshot.joystick.y
          : (inputSnapshot.forward ? 1 : 0) - (inputSnapshot.backward ? 1 : 0);
      const rawMag = Math.hypot(rawRight, rawFwd);
      if (rawMag > 1) {
        rawRight /= rawMag;
        rawFwd /= rawMag;
      }

      if (rawMag > 0.01) {
        let worldX = scratchCamRight.current.x * rawRight + scratchCamFwd.current.x * rawFwd;
        let worldZ = scratchCamRight.current.z * rawRight + scratchCamFwd.current.z * rawFwd;
        const stepLen = Math.hypot(worldX, worldZ);
        const dirX = worldX / stepLen;
        const dirZ = worldZ / stepLen;

        const aheadClear = findClearCarryAdjust(
          p.x + dirX * 0.14,
          p.y,
          p.z + dirZ * 0.14,
          yawForMove,
          carryKind,
          ctrl.body,
          carriedBodyHandle
        );
        if (!aheadClear) {
          const probeAhead = isCarryPoseClear(
            p.x + dirX * 0.14,
            p.y,
            p.z + dirZ * 0.14,
            yawForMove,
            Math.max(0.46, CHARACTER_DIMENSIONS.capsuleRadius + 0.14),
            carryProf.holdHeight,
            carryKind,
            ctrl.body,
            carriedBodyHandle
          );
          const nLen = Math.hypot(probeAhead.hitNormalX, probeAhead.hitNormalZ);
          if (nLen > 0.01) {
            const nx = probeAhead.hitNormalX / nLen;
            const nz = probeAhead.hitNormalZ / nLen;
            const inwardDot = worldX * nx + worldZ * nz;
            if (inwardDot < 0) {
              worldX -= inwardDot * nx;
              worldZ -= inwardDot * nz;
              const safeRight =
                worldX * scratchCamRight.current.x + worldZ * scratchCamRight.current.z;
              const safeFwd =
                worldX * scratchCamFwd.current.x + worldZ * scratchCamFwd.current.z;
              inputSnapshot.forward = false;
              inputSnapshot.backward = false;
              inputSnapshot.leftward = false;
              inputSnapshot.rightward = false;
              inputSnapshot.joystick.x = Math.hypot(safeRight, safeFwd) > 0.04 ? safeRight : 0;
              inputSnapshot.joystick.y = Math.hypot(safeRight, safeFwd) > 0.04 ? safeFwd : 0;
            }
          }
        }
      }
    }
    ctrl.setMovement(inputSnapshot);

    // 2. Decay camera shake & bump cooldown
    shakeRef.current = Math.max(0, shakeRef.current - dt * 3.8);
    bumpCooldown.current = Math.max(0, bumpCooldown.current - dt);

    // 3. Detect jump takeoff, landing impact, acceleration & turning rate
    const onGround = ctrl.isOnGround;
    const vertVel = ctrl.currLinVel.y;
    const horizSpeed = Math.hypot(ctrl.currLinVel.x, ctrl.currLinVel.z);

    scratchForward.current.copy(ctrl.bodyZAxis).setY(0).normalize();
    const forwardVel = ctrl.currLinVel.x * scratchForward.current.x + ctrl.currLinVel.z * scratchForward.current.z;
    const accelForward = dt > 0.001 ? (forwardVel - prevForwardVel.current) / dt : 0;
    prevForwardVel.current = forwardVel;

    const currYaw = Math.atan2(scratchForward.current.x, scratchForward.current.z);
    let deltaYaw = currYaw - prevYaw.current;
    if (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
    if (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
    const turnRate = dt > 0.001 ? deltaYaw / dt : 0;
    prevYaw.current = currYaw;

    if (!onGround) {
      prevMinVerticalSpeed.current = Math.min(prevMinVerticalSpeed.current, vertVel);
    }

    if (wasOnGround.current && !onGround && vertVel > 2.0) {
      animDataRef.current.takeoffImpulse = 0.85;
      dustPoolRef.current?.spawnBurst(ctrl.currPos.x, ctrl.currPos.y - 0.5, ctrl.currPos.z, 'dust');
    }

    if (!wasOnGround.current && onGround) {
      const impactStrength = THREE.MathUtils.clamp(Math.abs(prevMinVerticalSpeed.current) / 8.5, 0.3, 1.2);
      animDataRef.current.landImpulse = impactStrength;
      shakeRef.current = Math.max(shakeRef.current, impactStrength * 0.42);
      dustPoolRef.current?.spawnBurst(ctrl.currPos.x, ctrl.currPos.y - 0.52, ctrl.currPos.z, 'dust');
      if (impactStrength > 0.65) {
        gameStore.triggerImpact('land');
      }
      prevMinVerticalSpeed.current = 0;
    }

    // Sudden horizontal stop while moving fast = solid bump reaction!
    const speedDrop = prevHorizSpeed.current - horizSpeed;
    if (speedDrop > 2.7 && prevHorizSpeed.current > 3.2 && bumpCooldown.current <= 0) {
      bumpCooldown.current = 0.55;
      animDataRef.current.bumpImpulse = 0.85;
      shakeRef.current = Math.max(shakeRef.current, 0.7);
      dustPoolRef.current?.spawnBurst(
        ctrl.currPos.x + ctrl.bodyZAxis.x * 0.35,
        ctrl.currPos.y + 0.1,
        ctrl.currPos.z + ctrl.bodyZAxis.z * 0.35,
        'spark'
      );
      gameStore.triggerImpact('bump');
    }

    wasOnGround.current = onGround;
    prevHorizSpeed.current = horizSpeed;

    // 4. Update procedural character animation data
    animDataRef.current.speed = horizSpeed;
    animDataRef.current.verticalSpeed = vertVel;
    animDataRef.current.isOnGround = onGround;
    animDataRef.current.isMoving = ctrl.isMoving;
    animDataRef.current.isRunning = inputSnapshot.run && !carriedIdRef.current;
    animDataRef.current.isCarrying = carriedIdRef.current !== null;
    animDataRef.current.carriedKind = carriedKindRef.current;
    animDataRef.current.accelForward = THREE.MathUtils.clamp(accelForward, -14, 14);
    animDataRef.current.turnRate = THREE.MathUtils.clamp(turnRate, -8, 8);

    // 5. Find best grabbable candidate when hands are free (unified reach + wall line-of-sight across all views)
    scratchPlayerPos.current.copy(ctrl.currPos);
    camera.getWorldDirection(scratchCamFwd.current);
    if (scratchCamFwd.current.lengthSq() > 1e-6) {
      scratchCamFwd.current.normalize();
    } else {
      scratchCamFwd.current.copy(scratchForward.current);
    }

    let bestId: string | null = null;
    let bestKind: GrabbableKind | null = null;
    let bestScore = Infinity;

    if (!carriedIdRef.current) {
      const shapesReady = ensureVolumeShapes();
      void shapesReady;
      const sightRay = dropRayRef.current!;
      const originY = scratchPlayerPos.current.y + (isFirstPerson ? 0.34 : 0.28);

      for (const item of grabbableRegistry.getAll()) {
        if (!item.getWorldPos(scratchItemPos.current)) continue;
        scratchToItem.current.subVectors(scratchItemPos.current, scratchPlayerPos.current);
        const dist = scratchToItem.current.length();
        if (dist > 2.4) continue;

        scratchRayDir.current.set(
          scratchItemPos.current.x - scratchPlayerPos.current.x,
          scratchItemPos.current.y - originY,
          scratchItemPos.current.z - scratchPlayerPos.current.z
        );
        const sightLen = scratchRayDir.current.length();
        if (sightLen < 0.01) continue;
        scratchRayDir.current.divideScalar(sightLen);

        let lookDot = 0;
        if (isFirstPerson) {
          lookDot = scratchCamFwd.current.dot(scratchRayDir.current);
          if (lookDot < 0.1) continue;
        } else {
          scratchCandDir.current.set(scratchToItem.current.x, 0, scratchToItem.current.z).normalize();
          lookDot = scratchForward.current.dot(scratchCandDir.current);
        }

        // Prevent grabbing through solid walls/obstacles in any view
        const itemBodyHandle = item.getBody()?.handle ?? null;
        if (sightLen > 0.22) {
          sightRay.origin = {
            x: scratchPlayerPos.current.x,
            y: originY,
            z: scratchPlayerPos.current.z,
          };
          sightRay.dir = {
            x: scratchRayDir.current.x,
            y: scratchRayDir.current.y,
            z: scratchRayDir.current.z,
          };
          const blocked = world.castRay(
            sightRay,
            sightLen - 0.14,
            true,
            rapier.QueryFilterFlags.EXCLUDE_SENSORS,
            undefined,
            undefined,
            ctrl.body,
            (collider) => {
              const parent = collider.parent();
              if (!parent) return true;
              if (itemBodyHandle !== null && parent.handle === itemBodyHandle) return false;
              const colItemId = (parent.userData as { grabbableId?: string } | undefined)?.grabbableId;
              // Allow line of sight past other nearby loose grabbables (only solid walls/furniture block)
              return !colItemId;
            }
          );
          if (blocked) continue;
        }

        const weight = isFirstPerson ? 1.35 : 0.7;
        const score = dist - lookDot * weight;
        if (score < bestScore) {
          bestScore = score;
          bestId = item.id;
          bestKind = item.kind;
        }
      }
    }

    grabbableRegistry.highlightedId = bestId;
    gameStore.setNearbyTarget(bestId, bestKind);

    // 6. Handle Grab / Drop interaction trigger
    if (playerInput.consumeInteract()) {
      if (carriedIdRef.current) {
        dropCarriedItem();
      } else if (bestId) {
        const entry = grabbableRegistry.getById(bestId);
        const body = entry?.getBody();
        const col = entry?.getCollider();
        if (entry && body && col) {
          // Completely disable the physics body & collider while carried so Rapier NEVER generates
          // contacts, ShapeCast hits, or kinematic depenetration forces against the player.
          col.setSensor(true);
          col.setEnabled(false);
          body.setEnabled(false);
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          carriedIdRef.current = bestId;
          carriedKindRef.current = entry.kind;
          grabbableRegistry.carriedId = bestId;
          grabbableRegistry.highlightedId = null;
          gameStore.setCarried(bestId, entry.kind);

          const prof = CARRY_PROFILES[entry.kind];
          const grabYaw = Math.atan2(scratchForward.current.x, scratchForward.current.z);
          const clearGrab = findClearCarryAdjust(
            scratchPlayerPos.current.x,
            scratchPlayerPos.current.y,
            scratchPlayerPos.current.z,
            grabYaw,
            entry.kind,
            ctrl.body,
            body.handle
          );
          const fallbackDist = Math.max(0.46, CHARACTER_DIMENSIONS.capsuleRadius + 0.14);
          const initDist = clearGrab ? clearGrab.dist : fallbackDist;
          const initLift = clearGrab ? clearGrab.lift : prof.holdHeight;
          smoothCarryDistRef.current = initDist;
          smoothCarryLiftRef.current = initLift;
          resolvedDistRef.current = initDist;
          resolvedLiftRef.current = initLift;
          safeVisualYawRef.current = null;
          lastSafeYawRef.current = grabYaw;

          const wx = scratchPlayerPos.current.x + Math.sin(grabYaw) * initDist;
          const wy = scratchPlayerPos.current.y - 0.08 + initLift;
          const wz = scratchPlayerPos.current.z + Math.cos(grabYaw) * initDist;
          scratchDropEuler.current.set(prof.tiltX, grabYaw, 0);
          scratchDropQuat.current.setFromEuler(scratchDropEuler.current);
          grabbableRegistry.carriedVisualPos.set(wx, wy, wz);
          grabbableRegistry.carriedVisualQuat.copy(scratchDropQuat.current);
          const vis = entry.getVisualGroup();
          if (vis) {
            vis.position.set(wx, wy, wz);
            vis.quaternion.copy(scratchDropQuat.current);
          }
          animDataRef.current.carryDist = initDist;
          animDataRef.current.carryLift = initLift;

          dustPoolRef.current?.spawnBurst(
            scratchPlayerPos.current.x,
            scratchPlayerPos.current.y + 0.1,
            scratchPlayerPos.current.z,
            'dust'
          );
        }
      }
    }

    // 7. Render-frame sync: place carried prop using exact Rapier-interpolated capsule center
    // so hands & object share the exact same render timestamp as Chispa (zero 60/120Hz jitter).
    if (carriedIdRef.current && carriedKindRef.current) {
      const entry = grabbableRegistry.getById(carriedIdRef.current);
      const kind = carriedKindRef.current;
      const prof = CARRY_PROFILES[kind];

      if (visualCenterRef.current) {
        visualCenterRef.current.getWorldPosition(scratchVisualPos.current);
        visualCenterRef.current.getWorldQuaternion(scratchBodyQuat.current);
      } else {
        const bp = ctrl.body.translation();
        const br = ctrl.body.rotation();
        scratchVisualPos.current.set(bp.x, bp.y, bp.z);
        scratchBodyQuat.current.set(br.x, br.y, br.z, br.w);
      }

      scratchPostFwd.current.set(0, 0, 1).applyQuaternion(scratchBodyQuat.current).setY(0);
      if (scratchPostFwd.current.lengthSq() > 1e-6) {
        scratchPostFwd.current.normalize();
      } else {
        scratchPostFwd.current.set(0, 0, 1);
      }

      const activeYaw =
        safeVisualYawRef.current !== null
          ? safeVisualYawRef.current
          : Math.atan2(scratchPostFwd.current.x, scratchPostFwd.current.z);

      const targetDist = resolvedDistRef.current;
      const targetLift = resolvedLiftRef.current;
      const distRate = targetDist < smoothCarryDistRef.current ? 45 : 14;
      smoothCarryDistRef.current = THREE.MathUtils.lerp(
        smoothCarryDistRef.current,
        targetDist,
        1 - Math.exp(-distRate * dt)
      );
      smoothCarryLiftRef.current = THREE.MathUtils.lerp(
        smoothCarryLiftRef.current,
        targetLift,
        1 - Math.exp(-22 * dt)
      );

      const wx = scratchVisualPos.current.x + Math.sin(activeYaw) * smoothCarryDistRef.current;
      const wy = scratchVisualPos.current.y - 0.08 + smoothCarryLiftRef.current;
      const wz = scratchVisualPos.current.z + Math.cos(activeYaw) * smoothCarryDistRef.current;
      scratchDropEuler.current.set(prof.tiltX, activeYaw, 0);
      scratchDropQuat.current.setFromEuler(scratchDropEuler.current);

      grabbableRegistry.carriedVisualPos.set(wx, wy, wz);
      grabbableRegistry.carriedVisualQuat.copy(scratchDropQuat.current);
      const vis = entry?.getVisualGroup();
      if (vis) {
        vis.position.set(wx, wy, wz);
        vis.quaternion.copy(scratchDropQuat.current);
      }

      animDataRef.current.carryDist = smoothCarryDistRef.current;
      animDataRef.current.carryLift = smoothCarryLiftRef.current;
    }

    if (typeof window !== 'undefined') {
      const carriedEntry = carriedIdRef.current ? grabbableRegistry.getById(carriedIdRef.current) : null;
      const carriedBody = carriedEntry?.getBody();
      const carriedCol = carriedEntry?.getCollider();
      const cPos = carriedBody?.translation();
      const pTele = visualCenterRef.current ? scratchVisualPos.current : ctrl.currPos;
      if (!carriedIdRef.current && visualCenterRef.current) {
        visualCenterRef.current.getWorldPosition(scratchVisualPos.current);
      }
      (window as unknown as Record<string, unknown>).__desguaceTelemetry = {
        px: Number(pTele.x.toFixed(3)),
        py: Number(pTele.y.toFixed(3)),
        pz: Number(pTele.z.toFixed(3)),
        vx: Number(ctrl.currLinVel.x.toFixed(3)),
        vy: Number(ctrl.currLinVel.y.toFixed(3)),
        vz: Number(ctrl.currLinVel.z.toFixed(3)),
        fx: Number(scratchForward.current.x.toFixed(3)),
        fz: Number(scratchForward.current.z.toFixed(3)),
        uy: Number(ctrl.bodyYAxis.y.toFixed(3)),
        isOnGround: onGround,
        standHandle: ctrl.standCollider?.handle ?? null,
        floatY: Number(ctrl.floatingImpulse.y.toFixed(4)),
        moveY: Number(ctrl.moveImpulse.y.toFixed(4)),
        gravityScale: ctrl.body.gravityScale(),
        slopeAngleDeg: Number(((ctrl.actualSlopeAngle * 180) / Math.PI).toFixed(1)),
        carriedId: carriedIdRef.current,
        carriedKind: carriedKindRef.current,
        carriedBodyEnabled: carriedBody?.isEnabled() ?? null,
        carriedColEnabled: carriedCol?.isEnabled() ?? null,
        carriedColSensor: carriedCol?.isSensor() ?? null,
        cx: cPos ? Number(cPos.x.toFixed(3)) : null,
        cy: cPos ? Number(cPos.y.toFixed(3)) : null,
        cz: cPos ? Number(cPos.z.toFixed(3)) : null,
        vxCarry: carriedIdRef.current ? Number(grabbableRegistry.carriedVisualPos.x.toFixed(3)) : null,
        vyCarry: carriedIdRef.current ? Number(grabbableRegistry.carriedVisualPos.y.toFixed(3)) : null,
        vzCarry: carriedIdRef.current ? Number(grabbableRegistry.carriedVisualPos.z.toFixed(3)) : null,
        carryDist: Number(animDataRef.current.carryDist.toFixed(3)),
      };
    }
  });

  // Physics-step carry wall & rotation safety (pure Rapier constraints, separate from render interpolation)
  useAfterPhysicsStep(() => {
    const ctrl = ecctrlRef.current;
    if (!ctrl || !ctrl.body) return;

    const p = ctrl.body.translation();
    const r = ctrl.body.rotation();
    const v = ctrl.body.linvel();

    scratchBodyQuat.current.set(r.x, r.y, r.z, r.w);
    scratchPostFwd.current.set(0, 0, 1).applyQuaternion(scratchBodyQuat.current).setY(0);
    if (scratchPostFwd.current.lengthSq() > 1e-6) {
      scratchPostFwd.current.normalize();
    } else {
      scratchPostFwd.current.set(0, 0, 1);
    }

    if (carriedIdRef.current && carriedKindRef.current) {
      const entry = grabbableRegistry.getById(carriedIdRef.current);
      const carriedBodyHandle = entry?.getBody()?.handle ?? null;
      const kind = carriedKindRef.current;
      const prof = CARRY_PROFILES[kind];

      const yawNow = Math.atan2(scratchPostFwd.current.x, scratchPostFwd.current.z);

      let resolved = findClearCarryAdjust(
        p.x,
        p.y,
        p.z,
        yawNow,
        kind,
        ctrl.body,
        carriedBodyHandle
      );

      let clampedYaw: number | null = null;

      if (!resolved) {
        const probe = isCarryPoseClear(
          p.x,
          p.y,
          p.z,
          yawNow,
          prof.holdDistance,
          prof.holdHeight,
          kind,
          ctrl.body,
          carriedBodyHandle
        );
        const nLen = Math.hypot(probe.hitNormalX, probe.hitNormalZ);
        const nx = nLen > 0.01 ? probe.hitNormalX / nLen : -Math.sin(yawNow);
        const nz = nLen > 0.01 ? probe.hitNormalZ / nLen : -Math.cos(yawNow);

        const nowDot = Math.sin(yawNow) * nx + Math.cos(yawNow) * nz;
        const safeDot = Math.sin(lastSafeYawRef.current) * nx + Math.cos(lastSafeYawRef.current) * nz;
        const turningDeeperIntoWall = nowDot < safeDot - 0.015;

        const safeTurnCheck = turningDeeperIntoWall
          ? findClearCarryAdjust(
              p.x,
              p.y,
              p.z,
              lastSafeYawRef.current,
              kind,
              ctrl.body,
              carriedBodyHandle
            )
          : null;

        if (safeTurnCheck && turningDeeperIntoWall) {
          clampedYaw = lastSafeYawRef.current;
          scratchDropEuler.current.set(0, clampedYaw, 0);
          scratchDropQuat.current.setFromEuler(scratchDropEuler.current);
          ctrl.body.setRotation(
            {
              x: scratchDropQuat.current.x,
              y: scratchDropQuat.current.y,
              z: scratchDropQuat.current.z,
              w: scratchDropQuat.current.w,
            },
            true
          );
          ctrl.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          resolved = safeTurnCheck;
        } else {
          const inwardDot = v.x * nx + v.z * nz;
          if (inwardDot < 0) {
            ctrl.body.setLinvel(
              { x: v.x - inwardDot * nx, y: v.y, z: v.z - inwardDot * nz },
              true
            );
          }
        }
      }

      const minBoundDist = Math.max(0.42, CHARACTER_DIMENSIONS.capsuleRadius + 0.1);
      resolvedDistRef.current = resolved
        ? resolved.dist
        : Math.min(minBoundDist, resolvedDistRef.current);
      resolvedLiftRef.current = THREE.MathUtils.clamp(
        resolved ? resolved.lift : prof.holdHeight,
        prof.holdHeight - 0.06,
        prof.holdHeight + 0.16
      );
      safeVisualYawRef.current = clampedYaw;
      if (resolved && clampedYaw === null) {
        lastSafeYawRef.current = yawNow;
      }
    }
  });

  return (
    <>
      <Ecctrl
        ref={ecctrlRef}
        enable={enabled}
        enabledRotations={[false, true, false]}
        position={SPAWN_POS}
        capsuleHalfHeight={CHARACTER_DIMENSIONS.capsuleHalfHeight}
        capsuleRadius={CHARACTER_DIMENSIONS.capsuleRadius}
        floatHeight={CHARACTER_DIMENSIONS.floatHeight}
        rayLength={0.58}
        rayHitForgiveness={0.08}
        slopeMaxAngle={0.55}
        maxWalkVel={4.3}
        maxRunVel={6.6}
        jumpVel={6.4}
        jumpDuration={0.12}
        fallingGravityScale={2.6}
        enableToggleRun={false}
        springK={95}
        dampingC={10.5}
        autoBalance={false}
        autoBalanceSpringOnY={0.14}
        autoBalanceDampingOnY={0.032}
        angularDamping={3.5}
        moveImpulsePointOffset={0}
        onCollisionEnter={({ other }) => {
          const ctrl = ecctrlRef.current;
          if (!ctrl || !enabled || bumpCooldown.current > 0) return;
          const speed = Math.hypot(ctrl.currLinVel.x, ctrl.currLinVel.z);
          if (speed > 3.6 && other.rigidBody) {
            const otherUserData = other.rigidBody.userData as { grabbableId?: string } | undefined;
            if (otherUserData?.grabbableId === carriedIdRef.current) return;
            bumpCooldown.current = 0.5;
            animDataRef.current.bumpImpulse = 0.65;
            shakeRef.current = Math.max(shakeRef.current, 0.5);
            dustPoolRef.current?.spawnBurst(
              ctrl.currPos.x,
              ctrl.currPos.y + 0.1,
              ctrl.currPos.z,
              'spark'
            );
            gameStore.triggerImpact('bump');
          }
        }}
      >
        <group ref={visualCenterRef} />
        {enabled && (
          <InventorCharacter
            animDataRef={animDataRef}
            carryAnchorRef={carryAnchorRef}
            firstPersonHideHead={cameraMode === 'firstPerson'}
          />
        )}
      </Ecctrl>

      <DustPuffPool ref={dustPoolRef} maxCount={maxDustPuffs} />
    </>
  );
}
