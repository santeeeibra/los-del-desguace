import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHARACTER_DIMENSIONS, PALETTE } from '../config/visualConfig';

export interface CharacterAnimData {
  speed: number;
  verticalSpeed: number;
  isOnGround: boolean;
  isMoving: boolean;
  isCarrying: boolean;
  landImpulse: number;
  bumpImpulse: number;
  bumpDirX: number;
  bumpDirZ: number;
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
  const squashY = useRef(1);
  const squashVel = useRef(0);
  const wobbleAngle = useRef(0);
  const wobbleVel = useRef(0);
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

    // Consume discrete landing / bump impulses into spring dampers
    if (anim.landImpulse > 0.01) {
      squashVel.current -= anim.landImpulse * 6.5;
      anim.landImpulse = 0;
    }
    if (anim.bumpImpulse > 0.01) {
      squashVel.current -= anim.bumpImpulse * 3.8;
      wobbleVel.current += anim.bumpImpulse * 8.5;
      anim.bumpImpulse = 0;
    }

    // Spring-damper for squash & stretch
    const springForce = (1 - squashY.current) * 140 - squashVel.current * 14;
    squashVel.current += springForce * dt;
    squashY.current = THREE.MathUtils.clamp(squashY.current + squashVel.current * dt, 0.72, 1.24);

    // Spring-damper for bump stumble wobble
    const wobbleForce = -wobbleAngle.current * 110 - wobbleVel.current * 11;
    wobbleVel.current += wobbleForce * dt;
    wobbleAngle.current = THREE.MathUtils.clamp(wobbleAngle.current + wobbleVel.current * dt, -0.45, 0.45);

    const horizSpeed = anim.speed;
    const isMoving = anim.isOnGround && horizSpeed > 0.25;
    const moveNorm = THREE.MathUtils.clamp(horizSpeed / 5.5, 0, 1.25);

    if (isMoving) {
      const freq = anim.isCarrying ? 10.5 : 8.5 + moveNorm * 4.5;
      stridePhase.current += dt * freq;
    } else {
      // Gently decay stride toward neutral resting stance
      stridePhase.current = THREE.MathUtils.lerp(
        stridePhase.current,
        Math.round(stridePhase.current / Math.PI) * Math.PI,
        1 - Math.exp(-8 * dt)
      );
    }

    const s = Math.sin(stridePhase.current);
    const c = Math.cos(stridePhase.current);
    const walkAmp = isMoving ? THREE.MathUtils.clamp(moveNorm, 0.25, 1) : 0;

    // Body squash/stretch + air stretch
    let targetAirStretch = 1;
    if (!anim.isOnGround) {
      targetAirStretch = anim.verticalSpeed > 0 ? 1.12 : 0.94;
    }
    const finalScaleY = squashY.current * targetAirStretch;
    const invScaleXZ = 1 / Math.sqrt(Math.max(0.65, finalScaleY));

    if (bodyPivotRef.current) {
      bodyPivotRef.current.scale.set(invScaleXZ, finalScaleY, invScaleXZ);
      // Bounce height while waddling
      const bounce = isMoving ? Math.abs(c) * 0.055 * walkAmp : Math.sin(t * 2.4) * 0.014;
      bodyPivotRef.current.position.y = bounce;
      // Playful PEAK-style waddle roll + carry backward lean + bump wobble
      const carryLean = anim.isCarrying ? -0.11 : isMoving ? 0.09 * walkAmp : 0;
      bodyPivotRef.current.rotation.x = carryLean - wobbleAngle.current * 0.7;
      bodyPivotRef.current.rotation.z = (isMoving ? s * 0.065 * walkAmp : 0) + wobbleAngle.current * 0.45;
    }

    // Legs stride
    if (leftLegRef.current && rightLegRef.current) {
      if (!anim.isOnGround) {
        const airTuck = anim.verticalSpeed > 0 ? 0.42 : -0.22;
        leftLegRef.current.rotation.x = THREE.MathUtils.lerp(
          leftLegRef.current.rotation.x,
          airTuck,
          1 - Math.exp(-12 * dt)
        );
        rightLegRef.current.rotation.x = THREE.MathUtils.lerp(
          rightLegRef.current.rotation.x,
          -airTuck * 0.6,
          1 - Math.exp(-12 * dt)
        );
      } else {
        const legSwing = (anim.isCarrying ? 0.55 : 0.78) * walkAmp;
        leftLegRef.current.rotation.x = s * legSwing;
        rightLegRef.current.rotation.x = -s * legSwing;
      }
    }

    // Arms: idle sway, walk swing, jump paddle, or carry cradle
    if (leftArmRef.current && rightArmRef.current) {
      const lerpFactor = 1 - Math.exp(-14 * dt);
      if (anim.isCarrying) {
        // Reach forward & slightly inward to cradle the carried object
        const carryBob = isMoving ? Math.abs(c) * 0.06 : Math.sin(t * 3) * 0.025;
        leftArmRef.current.rotation.x = THREE.MathUtils.lerp(
          leftArmRef.current.rotation.x,
          -1.38 + carryBob,
          lerpFactor
        );
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
          rightArmRef.current.rotation.x,
          -1.38 + carryBob,
          lerpFactor
        );
        leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, -0.22, lerpFactor);
        rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, 0.22, lerpFactor);
      } else if (!anim.isOnGround) {
        const paddle = Math.sin(t * 14) * 0.28;
        leftArmRef.current.rotation.x = THREE.MathUtils.lerp(
          leftArmRef.current.rotation.x,
          -0.65 + paddle,
          lerpFactor
        );
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
          rightArmRef.current.rotation.x,
          -0.65 - paddle,
          lerpFactor
        );
        leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, 0.55, lerpFactor);
        rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, -0.55, lerpFactor);
      } else {
        const armSwing = s * 0.72 * walkAmp;
        const idleBreath = Math.sin(t * 2.4) * 0.04;
        leftArmRef.current.rotation.x = THREE.MathUtils.lerp(
          leftArmRef.current.rotation.x,
          -armSwing + idleBreath,
          lerpFactor
        );
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
          rightArmRef.current.rotation.x,
          armSwing - idleBreath,
          lerpFactor
        );
        leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, 0.16, lerpFactor);
        rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, -0.16, lerpFactor);
      }
    }

    // Expressive head look + blink
    if (headRef.current) {
      const lookYaw = isMoving ? 0 : Math.sin(t * 0.85) * 0.16;
      const lookTilt = isMoving ? s * 0.04 * walkAmp : Math.sin(t * 1.3) * 0.04;
      headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, lookYaw, 1 - Math.exp(-6 * dt));
      headRef.current.rotation.z = THREE.MathUtils.lerp(
        headRef.current.rotation.z,
        lookTilt - wobbleAngle.current * 0.5,
        1 - Math.exp(-8 * dt)
      );
      headRef.current.rotation.x = THREE.MathUtils.lerp(
        headRef.current.rotation.x,
        anim.isCarrying ? 0.08 : 0,
        1 - Math.exp(-8 * dt)
      );
    }

    blinkTimer.current -= dt;
    if (blinkTimer.current <= 0) {
      blinkTimer.current = 2.6 + ((Math.sin(t * 7.3) + 1) * 1.1);
    }
    const isBlinking = blinkTimer.current < 0.12;
    if (eyeLeftRef.current && eyeRightRef.current) {
      const eyeScaleY = isBlinking ? 0.15 : 1;
      eyeLeftRef.current.scale.y = eyeScaleY;
      eyeRightRef.current.scale.y = eyeScaleY;
    }

    // Backpack antenna wobble
    if (antennaRef.current) {
      antennaRef.current.rotation.x =
        -0.15 - moveNorm * 0.25 + Math.sin(t * 9) * (0.06 + moveNorm * 0.12) + wobbleAngle.current;
      antennaRef.current.rotation.z = Math.cos(t * 7.5) * (0.05 + moveNorm * 0.1);
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
          {/* Boot cuff + upper + sole */}
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
          {/* Main plump body */}
          <mesh castShadow receiveShadow material={materials.overall} position={[0, 0, 0]}>
            <capsuleGeometry args={[0.24, 0.22, 8, 16]} />
          </mesh>
          {/* Shirt chest collar */}
          <mesh castShadow receiveShadow material={materials.shirt} position={[0, 0.14, 0.05]}>
            <cylinderGeometry args={[0.21, 0.23, 0.16, 14]} />
          </mesh>
          {/* Overall straps & brass buckles */}
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
          {/* Front bib pocket + protruding red tool handle */}
          <mesh castShadow material={materials.pocket} position={[0, 0.01, 0.23]}>
            <boxGeometry args={[0.22, 0.14, 0.04]} />
          </mesh>
          <mesh castShadow material={materials.redHandle} position={[0.05, 0.09, 0.235]} rotation={[0, 0, -0.25]}>
            <cylinderGeometry args={[0.018, 0.018, 0.09, 8]} />
          </mesh>
          {/* Leather utility belt */}
          <mesh castShadow material={materials.belt} position={[0, -0.1, 0]}>
            <cylinderGeometry args={[0.255, 0.255, 0.075, 16]} />
          </mesh>
          <mesh castShadow material={materials.brass} position={[0, -0.1, 0.255]}>
            <boxGeometry args={[0.09, 0.08, 0.03]} />
          </mesh>

          {/* CARRY ANCHOR: sits cleanly in front of chest between the oversized gloves */}
          <group ref={carryAnchorRef} position={[0, 0.08, 0.62]} />

          {/* SCRAP BACKPACK */}
          <group ref={backpackRef} position={[0, 0.04, -0.27]}>
            <mesh castShadow receiveShadow material={materials.backpack}>
              <boxGeometry args={[0.32, 0.34, 0.18]} />
            </mesh>
            {/* Brass pressure dial */}
            <mesh castShadow material={materials.brass} position={[-0.08, 0.05, -0.1]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.06, 0.06, 0.03, 12]} />
            </mesh>
            {/* Exhaust pipe */}
            <mesh castShadow material={materials.goggleFrame} position={[0.1, 0.12, -0.05]}>
              <cylinderGeometry args={[0.03, 0.035, 0.2, 10]} />
            </mesh>
            {/* Springy antenna */}
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
            {/* Rounded shoulder cap */}
            <mesh castShadow material={materials.shirt}>
              <sphereGeometry args={[0.086, 10, 10]} />
            </mesh>
            {/* Rolled sleeve */}
            <mesh castShadow material={materials.shirt} position={[-0.025, -0.055, 0]} rotation={[0, 0, 0.15]}>
              <cylinderGeometry args={[0.076, 0.07, 0.1, 10]} />
            </mesh>
            {/* Forearm */}
            <mesh castShadow material={materials.skin} position={[-0.045, -0.155, 0]}>
              <capsuleGeometry args={[0.055, 0.1, 6, 10]} />
            </mesh>
            {/* Oversized mechanic glove */}
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
            {/* Chunky round head */}
            <mesh castShadow receiveShadow material={materials.skin}>
              <sphereGeometry args={[0.255, 18, 16]} />
            </mesh>
            {/* Ears */}
            <mesh castShadow material={materials.skin} position={[-0.25, -0.01, 0]}>
              <sphereGeometry args={[0.055, 10, 10]} />
            </mesh>
            <mesh castShadow material={materials.skin} position={[0.25, -0.01, 0]}>
              <sphereGeometry args={[0.055, 10, 10]} />
            </mesh>
            {/* Nose */}
            <mesh castShadow material={materials.blush} position={[0, -0.02, 0.255]}>
              <sphereGeometry args={[0.048, 10, 10]} />
            </mesh>
            {/* Rosy cheeks */}
            <mesh material={materials.blush} position={[-0.13, -0.06, 0.21]} scale={[1.2, 0.7, 0.5]}>
              <sphereGeometry args={[0.042, 8, 8]} />
            </mesh>
            <mesh material={materials.blush} position={[0.13, -0.06, 0.21]} scale={[1.2, 0.7, 0.5]}>
              <sphereGeometry args={[0.042, 8, 8]} />
            </mesh>
            {/* Expressive eyes */}
            <mesh ref={eyeLeftRef} material={materials.eye} position={[-0.088, 0.03, 0.23]}>
              <sphereGeometry args={[0.036, 10, 10]} />
            </mesh>
            <mesh ref={eyeRightRef} material={materials.eye} position={[0.088, 0.03, 0.23]}>
              <sphereGeometry args={[0.036, 10, 10]} />
            </mesh>

            {/* Backwards mechanic cap */}
            <group position={[0, 0.1, -0.01]} rotation={[-0.12, 0, 0]}>
              <mesh castShadow material={materials.cap}>
                <sphereGeometry args={[0.252, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.54]} />
              </mesh>
              {/* Cap brim facing backwards */}
              <mesh castShadow material={materials.cap} position={[0, 0.02, -0.24]} rotation={[0.18, 0, 0]}>
                <boxGeometry args={[0.24, 0.035, 0.16]} />
              </mesh>
              {/* Cap top button */}
              <mesh castShadow material={materials.brass} position={[0, 0.255, 0]}>
                <sphereGeometry args={[0.03, 8, 8]} />
              </mesh>
            </group>

            {/* Chunky Welding Goggles pushed onto forehead */}
            <group position={[0, 0.145, 0.195]} rotation={[-0.25, 0, 0.04]}>
              {/* Strap */}
              <mesh material={materials.boot} position={[0, -0.01, -0.19]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.255, 0.024, 8, 22]} />
              </mesh>
              {/* Left & right goggle cups (slightly asymmetrical sizes for charm!) */}
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
              {/* Brass bridge */}
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
