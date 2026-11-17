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
import { grabbableRegistry } from '../props/grabbableRegistry';
import { gameStore } from '../state/gameStore';

interface PlayerRigProps {
  maxDustPuffs: number;
  resetSignal: number;
  cameraSourceRef: React.MutableRefObject<CameraTargetSource>;
}

const SPAWN_POS: [number, number, number] = [-0.6, 1.15, 4.2];

export function PlayerRig({ maxDustPuffs, resetSignal, cameraSourceRef }: PlayerRigProps) {
  const ecctrlRef = useRef<EcctrlHandle>(null);
  const carryAnchorRef = useRef<THREE.Group | null>(null);
  const dustPoolRef = useRef<DustPuffHandle>(null);
  const { rapier, world } = useRapier();

  const animDataRef = useRef<CharacterAnimData>({
    speed: 0,
    verticalSpeed: 0,
    isOnGround: true,
    isMoving: false,
    isCarrying: false,
    landImpulse: 0,
    bumpImpulse: 0,
    bumpDirX: 0,
    bumpDirZ: 0,
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
  const shakeRef = useRef(0);
  const bumpCooldown = useRef(0);
  const carriedIdRef = useRef<string | null>(null);

  // Reusable scratch objects (zero per-frame allocations)
  const scratchPlayerPos = useRef(new THREE.Vector3());
  const scratchForward = useRef(new THREE.Vector3());
  const scratchItemPos = useRef(new THREE.Vector3());
  const scratchToItem = useRef(new THREE.Vector3());
  const scratchCarryWorldPos = useRef(new THREE.Vector3());
  const scratchCarryWorldQuat = useRef(new THREE.Quaternion());
  const scratchRayDir = useRef(new THREE.Vector3());
  const dropRayRef = useRef<InstanceType<typeof rapier.Ray> | null>(null);

  // Wire up camera target source once
  useEffect(() => {
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
  }, [cameraSourceRef]);

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
      grabbableRegistry.carriedId = null;
      gameStore.setCarried(null, null);
    }

    ctrl.body.setTranslation({ x: SPAWN_POS[0], y: SPAWN_POS[1], z: SPAWN_POS[2] }, true);
    ctrl.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ctrl.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }, [resetSignal, rapier]);

  const dropCarriedItem = (withToss: boolean) => {
    const carriedId = carriedIdRef.current;
    if (!carriedId) return;
    const entry = grabbableRegistry.getById(carriedId);
    const body = entry?.getBody();
    const col = entry?.getCollider();
    const ctrl = ecctrlRef.current;

    if (body && col && ctrl) {
      // Check wall clearance between player center and carry anchor
      scratchPlayerPos.current.copy(ctrl.currPos);
      scratchForward.current.copy(ctrl.bodyZAxis).normalize();
      let dropDist = 0.85;

      if (!dropRayRef.current) {
        dropRayRef.current = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
      }
      const ray = dropRayRef.current;
      if (ray) {
        ray.origin.x = scratchPlayerPos.current.x;
        ray.origin.y = scratchPlayerPos.current.y + 0.15;
        ray.origin.z = scratchPlayerPos.current.z;
        ray.dir.x = scratchForward.current.x;
        ray.dir.y = 0;
        ray.dir.z = scratchForward.current.z;
        const hit = world.castRay(
          ray,
          1.1,
          true,
          rapier.QueryFilterFlags.EXCLUDE_SENSORS,
          undefined,
          undefined,
          ctrl.body
        );
        if (hit && hit.timeOfImpact < 1.0) {
          dropDist = Math.max(0.45, hit.timeOfImpact - 0.35);
        }
      }

      const dropX = scratchPlayerPos.current.x + scratchForward.current.x * dropDist;
      const dropY = scratchPlayerPos.current.y + 0.25;
      const dropZ = scratchPlayerPos.current.z + scratchForward.current.z * dropDist;

      body.setBodyType(rapier.RigidBodyType.Dynamic, true);
      col.setSensor(false);
      body.setTranslation({ x: dropX, y: dropY, z: dropZ }, true);
      if (withToss) {
        body.setLinvel(
          {
            x: ctrl.currLinVel.x * 0.5 + scratchForward.current.x * 2.4,
            y: 1.5,
            z: ctrl.currLinVel.z * 0.5 + scratchForward.current.z * 2.4,
          },
          true
        );
      } else {
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      body.wakeUp();
    }

    carriedIdRef.current = null;
    grabbableRegistry.carriedId = null;
    gameStore.setCarried(null, null);
  };

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const ctrl = ecctrlRef.current;
    if (!ctrl || !ctrl.body) return;

    // 1. Feed unified keyboard + touch input to Ecctrl
    const inputSnapshot = inputSnapshotRef.current;
    playerInput.fillMovement(inputSnapshot);
    // Slightly slower when carrying heavy scrap!
    if (carriedIdRef.current) {
      inputSnapshot.run = false;
    }
    ctrl.setMovement(inputSnapshot);

    // 2. Decay camera shake & bump cooldown
    shakeRef.current = Math.max(0, shakeRef.current - dt * 3.8);
    bumpCooldown.current = Math.max(0, bumpCooldown.current - dt);

    // 3. Detect jump takeoff, landing impact & sudden wall/prop bumps
    const onGround = ctrl.isOnGround;
    const vertVel = ctrl.currLinVel.y;
    const horizSpeed = Math.hypot(ctrl.currLinVel.x, ctrl.currLinVel.z);

    if (!onGround) {
      prevMinVerticalSpeed.current = Math.min(prevMinVerticalSpeed.current, vertVel);
    }

    if (wasOnGround.current && !onGround && vertVel > 2.2) {
      dustPoolRef.current?.spawnBurst(ctrl.currPos.x, ctrl.currPos.y - 0.5, ctrl.currPos.z, 'dust');
    }

    if (!wasOnGround.current && onGround) {
      const impactStrength = THREE.MathUtils.clamp(Math.abs(prevMinVerticalSpeed.current) / 8.5, 0.35, 1.25);
      animDataRef.current.landImpulse = impactStrength;
      shakeRef.current = Math.max(shakeRef.current, impactStrength * 0.45);
      dustPoolRef.current?.spawnBurst(ctrl.currPos.x, ctrl.currPos.y - 0.52, ctrl.currPos.z, 'dust');
      if (impactStrength > 0.65) {
        gameStore.triggerImpact('land');
      }
      prevMinVerticalSpeed.current = 0;
    }

    // Sudden horizontal stop while moving fast = solid bump reaction!
    const speedDrop = prevHorizSpeed.current - horizSpeed;
    if (speedDrop > 2.6 && prevHorizSpeed.current > 3.2 && bumpCooldown.current <= 0) {
      bumpCooldown.current = 0.55;
      animDataRef.current.bumpImpulse = 0.9;
      shakeRef.current = Math.max(shakeRef.current, 0.75);
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
    animDataRef.current.isCarrying = carriedIdRef.current !== null;

    // 5. Find best grabbable candidate when hands are free
    scratchPlayerPos.current.copy(ctrl.currPos);
    scratchForward.current.copy(ctrl.bodyZAxis).normalize();

    let bestId: string | null = null;
    let bestKind: 'crate' | 'wheel' | 'canister' | null = null;
    let bestScore = Infinity;

    if (!carriedIdRef.current) {
      for (const item of grabbableRegistry.getAll()) {
        if (!item.getWorldPos(scratchItemPos.current)) continue;
        scratchToItem.current.subVectors(scratchItemPos.current, scratchPlayerPos.current);
        const dist = scratchToItem.current.length();
        if (dist > 2.35) continue;

        scratchRayDir.current.copy(scratchToItem.current).setY(0).normalize();
        const facingDot = scratchForward.current.dot(scratchRayDir.current);
        // Prefer objects in front of Chispa
        const score = dist - facingDot * 0.65;
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
        moveImpulsePointOffset={0.15}
        onCollisionEnter={({ other }) => {
          const ctrl = ecctrlRef.current;
          if (!ctrl || bumpCooldown.current > 0) return;
          // Trigger light bump wobble if colliding hard into a dynamic prop/cart
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
        <InventorCharacter animDataRef={animDataRef} carryAnchorRef={carryAnchorRef} />
      </Ecctrl>

      <DustPuffPool ref={dustPoolRef} maxCount={maxDustPuffs} />
    </>
  );
}
