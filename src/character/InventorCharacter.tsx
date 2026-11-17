import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHARACTER_DIMENSIONS, PALETTE } from '../config/visualConfig';
import { CARRY_PROFILES, type GrabbableKind } from '../props/grabbableRegistry';

export interface CharacterAnimData {
  speed: number;
  verticalSpeed: number;
  isOnGround: boolean;
  isMoving: boolean;
  isRunning: boolean;
  isCarrying: boolean;
  carriedKind: GrabbableKind | null;
  carryDist: number;
  carryLift: number;
  accelForward: number;
  turnRate: number;
  takeoffImpulse: number;
  landImpulse: number;
  bumpImpulse: number;
}

interface InventorCharacterProps {
  animDataRef: React.RefObject<CharacterAnimData>;
  carryAnchorRef?: React.RefObject<THREE.Group | null>;
}

export function InventorCharacter({ animDataRef, carryAnchorRef }: InventorCharacterProps) {
  const rootRef = useRef<THREE.Group>(null);
  const bodyPivotRef = useRef<THREE.Group>(null);
  const torsoRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const eyeLeftRef = useRef<THREE.Mesh>(null);
  const eyeRightRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const backpackRef = useRef<THREE.Group>(null);
  const antennaRef = useRef<THREE.Group>(null);

  const stridePhase = useRef(0);
  const gaitBlend = useRef(0);
  const runBlend = useRef(0);
  const carryBlend = useRef(0);
  const airBlend = useRef(0);

  const squashY = useRef(1);
  const squashVel = useRef(0);
  const wobbleAngle = useRef(0);
  const wobbleVel = useRef(0);
  const smoothLean = useRef(0);
  const smoothPitch = useRef(0);
  const blinkTimer = useRef(2.5);

  const materials = useMemo(
    () => ({
      overall: new THREE.MeshStandardMaterial({
        color: PALETTE.overallBlue,
        roughness: 0.9,
        metalness: 0.02,
      }),
      pocket: new THREE.MeshStandardMaterial({
        color: PALETTE.overallPocket,
        roughness: 0.92,
        metalness: 0.02,
      }),
      shirt: new THREE.MeshStandardMaterial({
        color: PALETTE.shirtCream,
        roughness: 0.9,
        metalness: 0.0,
      }),
      skin: new THREE.MeshStandardMaterial({
        color: PALETTE.skinWarm,
        roughness: 0.72,
        metalness: 0.0,
      }),
      blush: new THREE.MeshStandardMaterial({
        color: PALETTE.skinBlush,
        roughness: 0.8,
        metalness: 0.0,
      }),
      glove: new THREE.MeshStandardMaterial({
        color: PALETTE.gloveTan,
        roughness: 0.86,
        metalness: 0.02,
      }),
      boot: new THREE.MeshStandardMaterial({
        color: PALETTE.bootRubber,
        roughness: 0.9,
        metalness: 0.04,
      }),
      sole: new THREE.MeshStandardMaterial({
        color: PALETTE.bootSole,
        roughness: 0.95,
        metalness: 0.02,
      }),
      cap: new THREE.MeshStandardMaterial({
        color: PALETTE.capMustard,
        roughness: 0.85,
        metalness: 0.02,
      }),
      goggleFrame: new THREE.MeshStandardMaterial({
        color: PALETTE.goggleFrame,
        roughness: 0.45,
        metalness: 0.55,
      }),
      goggleLens: new THREE.MeshStandardMaterial({
        color: PALETTE.goggleLens,
        emissive: '#298fa8',
        emissiveIntensity: 0.35,
        roughness: 0.14,
        metalness: 0.15,
      }),
      brass: new THREE.MeshStandardMaterial({
        color: PALETTE.brass,
        roughness: 0.3,
        metalness: 0.88,
      }),
      backpack: new THREE.MeshStandardMaterial({
        color: PALETTE.metalTeal,
        roughness: 0.48,
        metalness: 0.3,
      }),
      belt: new THREE.MeshStandardMaterial({
        color: PALETTE.woodDark,
        roughness: 0.82,
        metalness: 0.05,
      }),
      eye: new THREE.MeshStandardMaterial({
        color: '#1b1d22',
        roughness: 0.3,
        metalness: 0.05,
      }),
      bulb: new THREE.MeshStandardMaterial({
        color: '#ffb84d',
        emissive: '#ff8a1f',
        emissiveIntensity: 0.85,
        roughness: 0.25,
        metalness: 0.1,
      }),
      redHandle: new THREE.MeshStandardMaterial({
        color: PALETTE.metalRed,
        roughness: 0.45,
        metalness: 0.2,
      }),
    }),
    []
  );

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const anim = animDataRef.current;
    const t = state.clock.elapsedTime;

    // 1. Consume discrete takeoff / landing / bump impulses
    if (anim.takeoffImpulse > 0.01) {
      squashVel.current += anim.takeoffImpulse * 4.2;
      anim.takeoffImpulse = 0;
    }
    if (anim.landImpulse > 0.01) {
      squashVel.current -= anim.landImpulse * 6.2;
      anim.landImpulse = 0;
    }
    if (anim.bumpImpulse > 0.01) {
      squashVel.current -= anim.bumpImpulse * 3.4;
      wobbleVel.current += anim.bumpImpulse * 7.8;
      anim.bumpImpulse = 0;
    }

    // 2. Spring-damper for squash/stretch and bump stumble
    const springForce = (1 - squashY.current) * 150 - squashVel.current * 16;
    squashVel.current += springForce * dt;
    squashY.current = THREE.MathUtils.clamp(squashY.current + squashVel.current * dt, 0.76, 1.18);

    const wobbleForce = -wobbleAngle.current * 115 - wobbleVel.current * 12;
    wobbleVel.current += wobbleForce * dt;
    wobbleAngle.current = THREE.MathUtils.clamp(wobbleAngle.current + wobbleVel.current * dt, -0.4, 0.4);

    // 3. Smooth locomotion state blends (no sudden snapping between idle/walk/run/stop)
    const horizSpeed = anim.speed;
    const targetGait = anim.isOnGround && horizSpeed > 0.22 ? THREE.MathUtils.clamp(horizSpeed / 4.2, 0.2, 1.0) : 0;
    const targetRun = anim.isOnGround && anim.isRunning && horizSpeed > 4.4 ? 1 : 0;
    const targetCarry = anim.isCarrying ? 1 : 0;
    const targetAir = anim.isOnGround ? 0 : 1;

    gaitBlend.current = THREE.MathUtils.lerp(gaitBlend.current, targetGait, 1 - Math.exp(-13 * dt));
    runBlend.current = THREE.MathUtils.lerp(runBlend.current, targetRun, 1 - Math.exp(-9 * dt));
    carryBlend.current = THREE.MathUtils.lerp(carryBlend.current, targetCarry, 1 - Math.exp(-16 * dt));
    airBlend.current = THREE.MathUtils.lerp(airBlend.current, targetAir, 1 - Math.exp(-15 * dt));

    // Match stride cadence directly to ground speed to prevent foot-sliding
    if (horizSpeed > 0.2 && anim.isOnGround) {
      const strideLength = anim.isCarrying ? 0.56 : 0.62;
      stridePhase.current += (horizSpeed / strideLength) * dt;
    } else {
      // Smoothly return feet to planted stance on stop
      const nearestStop = Math.round(stridePhase.current / Math.PI) * Math.PI;
      stridePhase.current = THREE.MathUtils.lerp(stridePhase.current, nearestStop, 1 - Math.exp(-11 * dt));
    }

    const s = Math.sin(stridePhase.current);
    const c = Math.cos(stridePhase.current);
    const gAmp = gaitBlend.current * (1 - airBlend.current);

    // 4. Moderate acceleration pitch & cornering lean
    const targetPitch = THREE.MathUtils.clamp(anim.accelForward * 0.012, -0.09, 0.1);
    const targetLean = THREE.MathUtils.clamp(-anim.turnRate * 0.032, -0.14, 0.14);
    smoothPitch.current = THREE.MathUtils.lerp(smoothPitch.current, targetPitch, 1 - Math.exp(-10 * dt));
    smoothLean.current = THREE.MathUtils.lerp(smoothLean.current, targetLean, 1 - Math.exp(-11 * dt));

    // 5. Body pivot squash, dip on landing, and calm breathing
    let airStretch = 1;
    if (!anim.isOnGround) {
      airStretch = anim.verticalSpeed > 0 ? 1.09 : 0.96;
    }
    const finalScaleY = squashY.current * airStretch;
    const invScaleXZ = 1 / Math.sqrt(Math.max(0.7, finalScaleY));
    const landingDip = Math.min(0, squashY.current - 1) * 0.22;

    if (bodyPivotRef.current) {
      bodyPivotRef.current.scale.set(invScaleXZ, finalScaleY, invScaleXZ);
      const stepBob = Math.abs(c) * (0.036 + runBlend.current * 0.022) * gAmp;
      const idleBreath = Math.sin(t * 2.1) * 0.008 * (1 - gAmp);
      bodyPivotRef.current.position.y = stepBob + idleBreath + landingDip;

      const carryBackLean = carryBlend.current * -0.08;
      const runFwdLean = (0.05 + runBlend.current * 0.07) * gAmp;
      bodyPivotRef.current.rotation.x =
        carryBackLean + runFwdLean + smoothPitch.current - wobbleAngle.current * 0.65;
      bodyPivotRef.current.rotation.z =
        s * 0.042 * gAmp + smoothLean.current + wobbleAngle.current * 0.4;
    }

    // 6. Legs stride & airborne tuck
    if (leftLegRef.current && rightLegRef.current) {
      const legAmp = (0.58 + runBlend.current * 0.22) * (1 - carryBlend.current * 0.22);
      const groundLegL = s * legAmp * gAmp;
      const groundLegR = -s * legAmp * gAmp;

      const airLegL = anim.verticalSpeed > 0 ? 0.45 : -0.18;
      const airLegR = anim.verticalSpeed > 0 ? -0.22 : 0.24;

      leftLegRef.current.rotation.x = THREE.MathUtils.lerp(groundLegL, airLegL, airBlend.current);
      rightLegRef.current.rotation.x = THREE.MathUtils.lerp(groundLegR, airLegR, airBlend.current);
    }

    // 7. Carry anchor & size-aware + clearance-aware arm poses
    const profile = anim.carriedKind ? CARRY_PROFILES[anim.carriedKind] : CARRY_PROFILES.crate;
    const activeDist = anim.isCarrying ? anim.carryDist : profile.holdDistance;
    const activeLift = anim.isCarrying ? anim.carryLift : profile.holdHeight;
    if (carryAnchorRef?.current) {
      const carryBob = gAmp * Math.abs(c) * 0.018;
      carryAnchorRef.current.position.set(0, activeLift + carryBob, activeDist);
      carryAnchorRef.current.rotation.set(profile.tiltX, 0, 0);
    }

    if (leftArmRef.current && rightArmRef.current) {
      const lerpRate = 1 - Math.exp(-18 * dt);

      // Base idle / walk / run arm swing
      const swingAmp = (0.54 + runBlend.current * 0.26) * gAmp;
      const idleArm = Math.sin(t * 2.1) * 0.025 * (1 - gAmp);
      const walkRotXL = -s * swingAmp + idleArm;
      const walkRotXR = s * swingAmp - idleArm;

      // Jump / fall balance pose
      const airArmX = anim.verticalSpeed > 0 ? -0.82 : -0.48 + Math.sin(t * 11) * 0.14;
      const airArmZ = anim.verticalSpeed > 0 ? 0.46 : 0.58;

      const freeArmXL = THREE.MathUtils.lerp(walkRotXL, airArmX, airBlend.current);
      const freeArmXR = THREE.MathUtils.lerp(walkRotXR, airArmX, airBlend.current);
      const freeArmZL = THREE.MathUtils.lerp(0.14, airArmZ, airBlend.current);
      const freeArmZR = THREE.MathUtils.lerp(-0.14, -airArmZ, airBlend.current);

      // Carry pose tailored to object size AND actual clearance distance/lift
      const carryArmBob = gAmp * Math.abs(c) * 0.035;
      const distDelta = activeDist - profile.holdDistance; // negative when tucked close to chest
      const liftDelta = activeLift - profile.holdHeight; // positive when raised over table/edge
      const carryRotX =
        profile.armPitch + carryArmBob + distDelta * -0.95 + liftDelta * -1.45;
      const inwardAngle = (0.27 - profile.armSpread) * 1.45;
      const carryRotZL = inwardAngle;
      const carryRotZR = -inwardAngle;

      leftArmRef.current.rotation.x = THREE.MathUtils.lerp(
        leftArmRef.current.rotation.x,
        THREE.MathUtils.lerp(freeArmXL, carryRotX, carryBlend.current),
        lerpRate
      );
      rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
        rightArmRef.current.rotation.x,
        THREE.MathUtils.lerp(freeArmXR, carryRotX, carryBlend.current),
        lerpRate
      );
      leftArmRef.current.rotation.z = THREE.MathUtils.lerp(
        leftArmRef.current.rotation.z,
        THREE.MathUtils.lerp(freeArmZL, carryRotZL, carryBlend.current),
        lerpRate
      );
      rightArmRef.current.rotation.z = THREE.MathUtils.lerp(
        rightArmRef.current.rotation.z,
        THREE.MathUtils.lerp(freeArmZR, carryRotZR, carryBlend.current),
        lerpRate
      );
      // Keep shoulders/hands following the object's actual Z tuck & spread
      const shoulderOffset = THREE.MathUtils.lerp(0.25, profile.armSpread * 0.88, carryBlend.current);
      const handForwardPull = THREE.MathUtils.lerp(0, distDelta * 0.55, carryBlend.current);
      leftArmRef.current.position.set(-shoulderOffset, 0.14 + THREE.MathUtils.lerp(0, liftDelta * 0.35, carryBlend.current), handForwardPull);
      rightArmRef.current.position.set(shoulderOffset, 0.14 + THREE.MathUtils.lerp(0, liftDelta * 0.35, carryBlend.current), handForwardPull);
    }

    // 8. Expressive head look + blink
    if (headRef.current) {
      const lookYaw = gAmp > 0.25 ? THREE.MathUtils.clamp(-anim.turnRate * 0.06, -0.2, 0.2) : Math.sin(t * 0.7) * 0.14;
      const lookTilt = gAmp > 0.25 ? s * 0.025 * gAmp : Math.sin(t * 1.1) * 0.025;
      const lookPitch = !anim.isOnGround && anim.verticalSpeed < -1.5 ? 0.14 : carryBlend.current * 0.06;
      headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, lookYaw, 1 - Math.exp(-8 * dt));
      headRef.current.rotation.z = THREE.MathUtils.lerp(
        headRef.current.rotation.z,
        lookTilt - wobbleAngle.current * 0.45,
        1 - Math.exp(-9 * dt)
      );
      headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, lookPitch, 1 - Math.exp(-8 * dt));
    }

    blinkTimer.current -= dt;
    if (blinkTimer.current <= 0) {
      blinkTimer.current = 2.8 + (Math.sin(t * 7.3) + 1) * 1.1;
    }
    const isBlinking = blinkTimer.current < 0.11;
    if (eyeLeftRef.current && eyeRightRef.current) {
      const eyeScaleY = isBlinking ? 0.15 : 1;
      eyeLeftRef.current.scale.y = eyeScaleY;
      eyeRightRef.current.scale.y = eyeScaleY;
    }

    // 9. Backpack antenna inertia
    if (antennaRef.current) {
      const moveFactor = gAmp * (0.5 + runBlend.current * 0.5);
      antennaRef.current.rotation.x =
        -0.1 - moveFactor * 0.24 + Math.sin(t * 8.5) * (0.03 + moveFactor * 0.1) + wobbleAngle.current;
      antennaRef.current.rotation.z = Math.cos(t * 7.0) * (0.025 + moveFactor * 0.08) + smoothLean.current * 0.6;
    }
  });

  return (
    <group ref={rootRef} position={[0, CHARACTER_DIMENSIONS.visualYOffset, 0]}>
      <group ref={bodyPivotRef}>
        {/* LEGS & CHUNKY BOOTS */}
        <group ref={leftLegRef} position={[-0.14, 0.34, 0]}>
          <mesh castShadow receiveShadow material={materials.overall} position={[0, -0.1, 0]}>
            <capsuleGeometry args={[0.095, 0.12, 6, 12]} />
          </mesh>
          <mesh castShadow receiveShadow material={materials.cap} position={[0, -0.21, 0]}>
            <cylinderGeometry args={[0.105, 0.105, 0.05, 12]} />
          </mesh>
          <mesh castShadow receiveShadow material={materials.boot} position={[0, -0.27, 0.035]}>
            <boxGeometry args={[0.19, 0.11, 0.25]} />
          </mesh>
          <mesh castShadow receiveShadow material={materials.sole} position={[0, -0.325, 0.035]}>
            <boxGeometry args={[0.205, 0.035, 0.27]} />
          </mesh>
        </group>

        <group ref={rightLegRef} position={[0.14, 0.34, 0]}>
          <mesh castShadow receiveShadow material={materials.overall} position={[0, -0.1, 0]}>
            <capsuleGeometry args={[0.095, 0.12, 6, 12]} />
          </mesh>
          <mesh castShadow receiveShadow material={materials.cap} position={[0, -0.21, 0]}>
            <cylinderGeometry args={[0.105, 0.105, 0.05, 12]} />
          </mesh>
          <mesh castShadow receiveShadow material={materials.boot} position={[0, -0.27, 0.035]}>
            <boxGeometry args={[0.19, 0.11, 0.25]} />
          </mesh>
          <mesh castShadow receiveShadow material={materials.sole} position={[0, -0.325, 0.035]}>
            <boxGeometry args={[0.205, 0.035, 0.27]} />
          </mesh>
        </group>

        {/* TORSO / OVERALLS */}
        <group ref={torsoRef} position={[0, 0.58, 0]}>
          <mesh castShadow receiveShadow material={materials.overall}>
            <capsuleGeometry args={[0.24, 0.22, 8, 16]} />
          </mesh>
          <mesh castShadow receiveShadow material={materials.shirt} position={[0, 0.14, 0.05]}>
            <cylinderGeometry args={[0.21, 0.23, 0.16, 14]} />
          </mesh>
          <mesh castShadow material={materials.overall} position={[-0.12, 0.16, 0.15]} rotation={[0.15, 0, 0]}>
            <boxGeometry args={[0.065, 0.18, 0.05]} />
          </mesh>
          <mesh castShadow material={materials.overall} position={[0.12, 0.16, 0.15]} rotation={[0.15, 0, 0]}>
            <boxGeometry args={[0.065, 0.18, 0.05]} />
          </mesh>
          <mesh castShadow material={materials.brass} position={[-0.12, 0.1, 0.185]}>
            <boxGeometry args={[0.075, 0.045, 0.025]} />
          </mesh>
          <mesh castShadow material={materials.brass} position={[0.12, 0.1, 0.185]}>
            <boxGeometry args={[0.075, 0.045, 0.025]} />
          </mesh>
          <mesh castShadow material={materials.pocket} position={[0, 0.01, 0.23]}>
            <boxGeometry args={[0.22, 0.14, 0.04]} />
          </mesh>
          <mesh castShadow material={materials.redHandle} position={[0.05, 0.09, 0.235]} rotation={[0, 0, -0.25]}>
            <cylinderGeometry args={[0.018, 0.018, 0.09, 8]} />
          </mesh>
          <mesh castShadow material={materials.belt} position={[0, -0.1, 0]}>
            <cylinderGeometry args={[0.255, 0.255, 0.075, 16]} />
          </mesh>
          <mesh castShadow material={materials.brass} position={[0, -0.1, 0.255]}>
            <boxGeometry args={[0.09, 0.08, 0.03]} />
          </mesh>

          {/* CARRY ANCHOR dynamically positioned by CARRY_PROFILES */}
          <group ref={carryAnchorRef} position={[0, 0.12, 0.65]} />

          {/* SCRAP BACKPACK */}
          <group ref={backpackRef} position={[0, 0.04, -0.27]}>
            <mesh castShadow receiveShadow material={materials.backpack}>
              <boxGeometry args={[0.32, 0.34, 0.18]} />
            </mesh>
            <mesh castShadow material={materials.brass} position={[-0.08, 0.05, -0.1]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.06, 0.06, 0.03, 12]} />
            </mesh>
            <mesh castShadow material={materials.goggleFrame} position={[0.1, 0.12, -0.05]}>
              <cylinderGeometry args={[0.03, 0.035, 0.2, 10]} />
            </mesh>
            <group ref={antennaRef} position={[-0.11, 0.17, -0.02]}>
              <mesh castShadow material={materials.goggleFrame} position={[0, 0.12, 0]}>
                <cylinderGeometry args={[0.012, 0.016, 0.24, 8]} />
              </mesh>
              <mesh material={materials.bulb} position={[0, 0.25, 0]}>
                <sphereGeometry args={[0.042, 10, 10]} />
              </mesh>
            </group>
          </group>

          {/* LEFT ARM + BIG WORK GLOVE */}
          <group ref={leftArmRef} position={[-0.25, 0.14, 0]}>
            <mesh castShadow material={materials.shirt}>
              <sphereGeometry args={[0.086, 10, 10]} />
            </mesh>
            <mesh castShadow material={materials.shirt} position={[-0.025, -0.055, 0]} rotation={[0, 0, 0.15]}>
              <cylinderGeometry args={[0.076, 0.07, 0.1, 10]} />
            </mesh>
            <mesh castShadow material={materials.skin} position={[-0.045, -0.155, 0]}>
              <capsuleGeometry args={[0.055, 0.1, 6, 10]} />
            </mesh>
            <group position={[-0.055, -0.275, 0.03]}>
              <mesh castShadow material={materials.glove}>
                <sphereGeometry args={[0.105, 12, 10]} />
              </mesh>
              <mesh castShadow material={materials.glove} position={[0.06, 0.02, 0.05]}>
                <sphereGeometry args={[0.048, 8, 8]} />
              </mesh>
              <mesh castShadow material={materials.overall} position={[0, 0.075, -0.02]}>
                <cylinderGeometry args={[0.085, 0.095, 0.045, 10]} />
              </mesh>
            </group>
          </group>

          {/* RIGHT ARM + BIG WORK GLOVE */}
          <group ref={rightArmRef} position={[0.25, 0.14, 0]}>
            <mesh castShadow material={materials.shirt}>
              <sphereGeometry args={[0.086, 10, 10]} />
            </mesh>
            <mesh castShadow material={materials.shirt} position={[0.025, -0.055, 0]} rotation={[0, 0, -0.15]}>
              <cylinderGeometry args={[0.076, 0.07, 0.1, 10]} />
            </mesh>
            <mesh castShadow material={materials.skin} position={[0.045, -0.155, 0]}>
              <capsuleGeometry args={[0.055, 0.1, 6, 10]} />
            </mesh>
            <group position={[0.055, -0.275, 0.03]}>
              <mesh castShadow material={materials.glove}>
                <sphereGeometry args={[0.105, 12, 10]} />
              </mesh>
              <mesh castShadow material={materials.glove} position={[-0.06, 0.02, 0.05]}>
                <sphereGeometry args={[0.048, 8, 8]} />
              </mesh>
              <mesh castShadow material={materials.overall} position={[0, 0.075, -0.02]}>
                <cylinderGeometry args={[0.085, 0.095, 0.045, 10]} />
              </mesh>
            </group>
          </group>

          {/* HEAD + CAP + WELDING GOGGLES */}
          <group ref={headRef} position={[0, 0.37, 0.02]}>
            <mesh castShadow receiveShadow material={materials.skin}>
              <sphereGeometry args={[0.255, 18, 16]} />
            </mesh>
            <mesh castShadow material={materials.skin} position={[-0.25, -0.01, 0]}>
              <sphereGeometry args={[0.055, 10, 10]} />
            </mesh>
            <mesh castShadow material={materials.skin} position={[0.25, -0.01, 0]}>
              <sphereGeometry args={[0.055, 10, 10]} />
            </mesh>
            <mesh castShadow material={materials.blush} position={[0, -0.02, 0.255]}>
              <sphereGeometry args={[0.048, 10, 10]} />
            </mesh>
            <mesh material={materials.blush} position={[-0.13, -0.06, 0.21]} scale={[1.2, 0.7, 0.5]}>
              <sphereGeometry args={[0.042, 8, 8]} />
            </mesh>
            <mesh material={materials.blush} position={[0.13, -0.06, 0.21]} scale={[1.2, 0.7, 0.5]}>
              <sphereGeometry args={[0.042, 8, 8]} />
            </mesh>
            <mesh ref={eyeLeftRef} material={materials.eye} position={[-0.088, 0.03, 0.23]}>
              <sphereGeometry args={[0.036, 10, 10]} />
            </mesh>
            <mesh ref={eyeRightRef} material={materials.eye} position={[0.088, 0.03, 0.23]}>
              <sphereGeometry args={[0.036, 10, 10]} />
            </mesh>

            <group position={[0, 0.1, -0.01]} rotation={[-0.12, 0, 0]}>
              <mesh castShadow material={materials.cap}>
                <sphereGeometry args={[0.252, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.54]} />
              </mesh>
              <mesh castShadow material={materials.cap} position={[0, 0.02, -0.24]} rotation={[0.18, 0, 0]}>
                <boxGeometry args={[0.24, 0.035, 0.16]} />
              </mesh>
              <mesh castShadow material={materials.brass} position={[0, 0.255, 0]}>
                <sphereGeometry args={[0.03, 8, 8]} />
              </mesh>
            </group>

            <group position={[0, 0.145, 0.195]} rotation={[-0.25, 0, 0.04]}>
              <mesh material={materials.boot} position={[0, -0.01, -0.19]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.255, 0.024, 8, 22]} />
              </mesh>
              <group position={[-0.095, 0, 0]}>
                <mesh castShadow material={materials.goggleFrame} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.078, 0.082, 0.08, 14]} />
                </mesh>
                <mesh material={materials.goggleLens} position={[0, 0, 0.036]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.062, 0.062, 0.02, 14]} />
                </mesh>
              </group>
              <group position={[0.095, 0.006, 0]}>
                <mesh castShadow material={materials.goggleFrame} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.09, 0.094, 0.084, 14]} />
                </mesh>
                <mesh material={materials.goggleLens} position={[0, 0, 0.038]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.072, 0.072, 0.02, 14]} />
                </mesh>
              </group>
              <mesh castShadow material={materials.brass} position={[0, 0, 0.01]}>
                <boxGeometry args={[0.07, 0.028, 0.03]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
