import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
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
import { gameStore } from '../state/gameStore';

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
  const carryAnchorRef = useRef<THREE.Group | null>(null);
  const dustPoolRef = useRef<DustPuffHandle>(null);
  const { rapier, world } = useRapier();

  const animDataRef = useRef<CharacterAnimData>({
    speed: 0,
    verticalSpeed: 0,
    isOnGround: true,
    isMoving: false,
    isRunning: false,
    isCarrying: false,
    carriedKind: null,
    accelForward: 0,
    turnRate: 0,
    takeoffImpulse: 0,
    landImpulse: 0,
    bumpImpulse: 0,
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

  // Reusable scratch objects (zero per-frame allocations)
  const scratchPlayerPos = useRef(new THREE.Vector3());
  const scratchForward = useRef(new THREE.Vector3());
  const scratchItemPos = useRef(new THREE.Vector3());
  const scratchToItem = useRef(new THREE.Vector3());
  const scratchCarryWorldPos = useRef(new THREE.Vector3());
  const scratchCarryWorldQuat = useRef(new THREE.Quaternion());
  const scratchRayDir = useRef(new THREE.Vector3());
  const dropBallRef = useRef<InstanceType<typeof rapier.Ball> | null>(null);

  // Wire up camera target source when active
  useEffect(() => {
    if (!enabled) return;
    cameraSourceRef.current = {
      getTargetPosition(out: THREE.Vector3) {
        const ctrl = ecctrlRef.current;
        if (!ctrl) return false;
        out.copy(ctrl.currPos);
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

  const dropCarriedItem = (withToss: boolean) => {
    const carriedId = carriedIdRef.current;
    const carriedKind = carriedKindRef.current ?? 'crate';
    if (!carriedId) return;
    const entry = grabbableRegistry.getById(carriedId);
    const body = entry?.getBody();
    const col = entry?.getCollider();
    const ctrl = ecctrlRef.current;

    if (body && col && ctrl) {
      const profile = CARRY_PROFILES[carriedKind];
      scratchPlayerPos.current.copy(ctrl.currPos);
      scratchForward.current.copy(ctrl.bodyZAxis).setY(0).normalize();
      if (scratchForward.current.lengthSq() < 0.01) {
        scratchForward.current.set(0, 0, 1);
      }

      // Shapecast forward with a ball matching the object's radius so we never embed into walls
      if (!dropBallRef.current || dropBallRef.current.radius !== profile.dropRadius) {
        dropBallRef.current = new rapier.Ball(profile.dropRadius);
      }

      const maxSweepDist = profile.holdDistance + 0.35;
      const origin = {
        x: scratchPlayerPos.current.x,
        y: scratchPlayerPos.current.y + 0.28,
        z: scratchPlayerPos.current.z,
      };
      const rot = { x: 0, y: 0, z: 0, w: 1 };
      const vel = {
        x: scratchForward.current.x,
        y: 0,
        z: scratchForward.current.z,
      };

      const shapeHit = world.castShape(
        origin,
        rot,
        vel,
        dropBallRef.current,
        0,
        maxSweepDist,
        true,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        ctrl.body,
        (collider) => collider.parent()?.handle !== body.handle
      );

      let dropDist = profile.holdDistance;
      let blockedByWall = false;
      if (shapeHit) {
        blockedByWall = true;
        dropDist = Math.max(0.28, shapeHit.time_of_impact - 0.14);
      }

      const dropX = scratchPlayerPos.current.x + scratchForward.current.x * dropDist;
      const dropY = scratchPlayerPos.current.y + profile.dropHeightOffset + (blockedByWall ? 0.15 : 0);
      const dropZ = scratchPlayerPos.current.z + scratchForward.current.z * dropDist;

      body.setBodyType(rapier.RigidBodyType.Dynamic, true);
      col.setSensor(false);
      body.setTranslation({ x: dropX, y: dropY, z: dropZ }, true);

      if (withToss && !blockedByWall) {
        const tossPower = carriedKind === 'wheel' ? 3.1 : 2.1;
        body.setLinvel(
          {
            x: ctrl.currLinVel.x * 0.45 + scratchForward.current.x * tossPower,
            y: 1.25,
            z: ctrl.currLinVel.z * 0.45 + scratchForward.current.z * tossPower,
          },
          true
        );
      } else {
        // Blocked by wall or gentle drop: zero forward impulse so it settles straight down cleanly
        body.setLinvel({ x: 0, y: -0.2, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      body.wakeUp();
    }

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

    // 1. Feed unified keyboard + touch input to Ecctrl
    const inputSnapshot = inputSnapshotRef.current;
    playerInput.fillMovement(inputSnapshot);
    if (carriedIdRef.current) {
      inputSnapshot.run = false;
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

    // 5. Find best grabbable candidate when hands are free
    scratchPlayerPos.current.copy(ctrl.currPos);

    let bestId: string | null = null;
    let bestKind: GrabbableKind | null = null;
    let bestScore = Infinity;

    if (!carriedIdRef.current) {
      for (const item of grabbableRegistry.getAll()) {
        if (!item.getWorldPos(scratchItemPos.current)) continue;
        scratchToItem.current.subVectors(scratchItemPos.current, scratchPlayerPos.current);
        const dist = scratchToItem.current.length();
        if (dist > 2.4) continue;

        scratchRayDir.current.copy(scratchToItem.current).setY(0).normalize();
        const facingDot = scratchForward.current.dot(scratchRayDir.current);
        const score = dist - facingDot * 0.7;
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
        dropCarriedItem(true);
      } else if (bestId) {
        const entry = grabbableRegistry.getById(bestId);
        const body = entry?.getBody();
        const col = entry?.getCollider();
        if (entry && body && col) {
          col.setSensor(true);
          body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
          carriedIdRef.current = bestId;
          carriedKindRef.current = entry.kind;
          grabbableRegistry.carriedId = bestId;
          grabbableRegistry.highlightedId = null;
          gameStore.setCarried(bestId, entry.kind);
          dustPoolRef.current?.spawnBurst(
            scratchPlayerPos.current.x,
            scratchPlayerPos.current.y + 0.1,
            scratchPlayerPos.current.z,
            'dust'
          );
        }
      }
    }

    // 7. Keep carried object anchored cleanly to Chispa's gloved hands
    if (carriedIdRef.current && carryAnchorRef.current) {
      const entry = grabbableRegistry.getById(carriedIdRef.current);
      const body = entry?.getBody();
      if (body) {
        carryAnchorRef.current.getWorldPosition(scratchCarryWorldPos.current);
        carryAnchorRef.current.getWorldQuaternion(scratchCarryWorldQuat.current);
        body.setNextKinematicTranslation({
          x: scratchCarryWorldPos.current.x,
          y: scratchCarryWorldPos.current.y,
          z: scratchCarryWorldPos.current.z,
        });
        body.setNextKinematicRotation({
          x: scratchCarryWorldQuat.current.x,
          y: scratchCarryWorldQuat.current.y,
          z: scratchCarryWorldQuat.current.z,
          w: scratchCarryWorldQuat.current.w,
        });
      }
    }
  });

  return (
    <>
      <Ecctrl
        ref={ecctrlRef}
        enable={enabled}
        position={SPAWN_POS}
        capsuleHalfHeight={CHARACTER_DIMENSIONS.capsuleHalfHeight}
        capsuleRadius={CHARACTER_DIMENSIONS.capsuleRadius}
        floatHeight={CHARACTER_DIMENSIONS.floatHeight}
        maxWalkVel={4.3}
        maxRunVel={6.6}
        jumpVel={6.4}
        jumpDuration={0.12}
        fallingGravityScale={2.6}
        springK={85}
        dampingC={7}
        autoBalance
        autoBalanceSpringOnY={0.16}
        autoBalanceDampingOnY={0.012}
        moveImpulsePointOffset={0.15}
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
        {enabled && <InventorCharacter animDataRef={animDataRef} carryAnchorRef={carryAnchorRef} />}
      </Ecctrl>

      <DustPuffPool ref={dustPoolRef} maxCount={maxDustPuffs} />
    </>
  );
}
