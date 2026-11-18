// Copia CONGELADA del cuerpo anterior (commit dc2482b) solo para comparar antes/después en el laboratorio.
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHARACTER_DIMENSIONS } from '../../config/visualConfig';
import { CARRY_PROFILES, type GrabbableKind } from '../../props/grabbableRegistry';
import { CabezaBaseModel } from '../../character/CabezaBaseModel';
import {
  DEFAULT_CHISPA_APPEARANCE,
  type CharacterAppearanceConfig,
  type CharacterExpression,
} from '../../character/characterAppearance';
import {
  FaceRigController,
  resolveAnchorPosition,
  resolveShapeFitMetrics,
  type FaceRigBindings,
  type HeadShapePreset,
} from '../../character/faceRigController';

interface CharacterAnimData {
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
  dropBlockedImpulse?: number;
}

interface InventorCharacterProps {
  animDataRef: React.RefObject<CharacterAnimData>;
  carryAnchorRef?: React.RefObject<THREE.Group | null>;
  appearance?: CharacterAppearanceConfig;
  headShape?: HeadShapePreset;
  firstPersonHideHead?: boolean;
}

const GEAR_ANGLES = [0, 1, 2, 3, 4, 5].map((i) => (i * Math.PI) / 3);
const HEAD_MODEL_SCALE = 1.08;
const HEAD_MODEL_OFFSET: readonly [number, number, number] = [0, -0.91, -0.01];
const HARDHAT_TILT_X = -0.22;
const HARDHAT_RADIUS = 0.268;
const HAT_CLEARANCE = 0.014;

export function InventorCharacterLegacy({
  animDataRef,
  carryAnchorRef,
  appearance = DEFAULT_CHISPA_APPEARANCE,
  headShape = 'base',
  firstPersonHideHead = false,
}: InventorCharacterProps) {
  const rootRef = useRef<THREE.Group>(null);
  const bodyPivotRef = useRef<THREE.Group>(null);
  const torsoRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);

  // Decorative-only attachment anchor refs (non-colliding)
  const headAnchorRef = useRef<THREE.Group>(null);
  const gogglesAnchorRef = useRef<THREE.Group>(null);
  const backpackAnchorRef = useRef<THREE.Group>(null);
  const beltAnchorRef = useRef<THREE.Group>(null);
  const antennaRef = useRef<THREE.Group>(null);

  // Separate GLB face rig bindings & animation controller
  const faceBindingsRef = useRef<FaceRigBindings | null>(null);
  const faceControllerRef = useRef<FaceRigController | null>(null);
  if (!faceControllerRef.current) {
    faceControllerRef.current = new FaceRigController();
  }
  const scratchAnchorPos = useRef(new THREE.Vector3());

  // Limbs
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftShoulderRef = useRef<THREE.Group>(null);
  const rightShoulderRef = useRef<THREE.Group>(null);
  const torsoBodyRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);

  // Continuous blend & procedural physics-visual states (never alters physics body)
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

  const landExprTimer = useRef(0);
  const surpriseExprTimer = useRef(0);
  const disappointExprTimer = useRef(0);

  const pal = appearance.palette;

  const materials = useMemo(
    () => ({
      overall: new THREE.MeshStandardMaterial({
        color: pal.overall,
        roughness: 0.86,
        metalness: 0.03,
      }),
      overallStrap: new THREE.MeshStandardMaterial({
        color: pal.overallStrap,
        roughness: 0.88,
        metalness: 0.03,
      }),
      shirt: new THREE.MeshStandardMaterial({
        color: pal.shirt,
        roughness: 0.9,
        metalness: 0.0,
      }),
      cuff: new THREE.MeshStandardMaterial({
        color: pal.cuffAndRibbon,
        roughness: 0.72,
        metalness: 0.04,
      }),
      skin: new THREE.MeshStandardMaterial({
        color: pal.skin,
        roughness: 0.72,
        metalness: 0.0,
      }),
      glove: new THREE.MeshStandardMaterial({
        color: pal.glove,
        roughness: 0.85,
        metalness: 0.03,
      }),
      glovePad: new THREE.MeshStandardMaterial({
        color: pal.glovePad,
        roughness: 0.88,
        metalness: 0.02,
      }),
      boot: new THREE.MeshStandardMaterial({
        color: pal.boot,
        roughness: 0.84,
        metalness: 0.04,
      }),
      sole: new THREE.MeshStandardMaterial({
        color: pal.sole,
        roughness: 0.94,
        metalness: 0.02,
      }),
      hardhat: new THREE.MeshStandardMaterial({
        color: pal.hardhat,
        roughness: 0.42,
        metalness: 0.08,
      }),
      hardhatCrest: new THREE.MeshStandardMaterial({
        color: pal.hardhatCrest,
        roughness: 0.38,
        metalness: 0.08,
      }),
      goggleFrame: new THREE.MeshStandardMaterial({
        color: pal.gogglesFrame,
        roughness: 0.45,
        metalness: 0.52,
      }),
      goggleStrap: new THREE.MeshStandardMaterial({
        color: pal.gogglesStrap,
        roughness: 0.8,
        metalness: 0.08,
      }),
      goggleLens: new THREE.MeshStandardMaterial({
        color: pal.gogglesLens,
        roughness: 0.14,
        metalness: 0.45,
      }),
      belt: new THREE.MeshStandardMaterial({
        color: pal.belt,
        roughness: 0.82,
        metalness: 0.05,
      }),
      brass: new THREE.MeshStandardMaterial({
        color: pal.brass,
        roughness: 0.32,
        metalness: 0.84,
      }),
      emblem: new THREE.MeshStandardMaterial({
        color: pal.emblem,
        roughness: 0.55,
        metalness: 0.05,
      }),
      patchLight: new THREE.MeshStandardMaterial({
        color: pal.patchLight,
        roughness: 0.9,
        metalness: 0.02,
      }),
      patchDark: new THREE.MeshStandardMaterial({
        color: pal.patchDark,
        roughness: 0.92,
        metalness: 0.02,
      }),
      backpack: new THREE.MeshStandardMaterial({
        color: pal.backpack,
        roughness: 0.54,
        metalness: 0.22,
      }),
    }),
    [pal]
  );

  useEffect(() => {
    return () => {
      Object.values(materials).forEach((mat) => mat.dispose());
    };
  }, [materials]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const anim = animDataRef.current;
    const t = state.clock.elapsedTime;

    // 1. Consume discrete takeoff / landing / bump / drop-blocked cues
    if (anim.takeoffImpulse > 0.01) {
      squashVel.current += anim.takeoffImpulse * 4.4;
      anim.takeoffImpulse = 0;
    }
    if (anim.landImpulse > 0.01) {
      squashVel.current -= anim.landImpulse * 6.8;
      landExprTimer.current = Math.max(landExprTimer.current, 0.42);
      anim.landImpulse = 0;
    }
    if (anim.bumpImpulse > 0.01) {
      squashVel.current -= anim.bumpImpulse * 3.6;
      wobbleVel.current += anim.bumpImpulse * 7.8;
      surpriseExprTimer.current = 0.55;
      disappointExprTimer.current = Math.max(disappointExprTimer.current, 0.95);
      anim.bumpImpulse = 0;
    }
    if (anim.dropBlockedImpulse && anim.dropBlockedImpulse > 0.01) {
      disappointExprTimer.current = Math.max(disappointExprTimer.current, 0.85);
      wobbleVel.current += 2.2;
      anim.dropBlockedImpulse = 0;
    }

    landExprTimer.current = Math.max(0, landExprTimer.current - dt);
    surpriseExprTimer.current = Math.max(0, surpriseExprTimer.current - dt);
    disappointExprTimer.current = Math.max(0, disappointExprTimer.current - dt);

    // 2. Spring-damper for squash/stretch and bump stumble
    const springForce = (1 - squashY.current) * 155 - squashVel.current * 15.5;
    squashVel.current += springForce * dt;
    squashY.current = THREE.MathUtils.clamp(squashY.current + squashVel.current * dt, 0.74, 1.18);

    const wobbleForce = -wobbleAngle.current * 115 - wobbleVel.current * 12;
    wobbleVel.current += wobbleForce * dt;
    wobbleAngle.current = THREE.MathUtils.clamp(wobbleAngle.current + wobbleVel.current * dt, -0.4, 0.4);

    // 3. Smooth locomotion state blends (idle / walk / run / stop / carry / air)
    const horizSpeed = anim.speed;
    const targetGait =
      anim.isOnGround && horizSpeed > 0.22 ? THREE.MathUtils.clamp(horizSpeed / 4.2, 0.2, 1.0) : 0;
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

    // 5. Body pivot squash, dip on landing, and breathing
    let airStretch = 1;
    if (!anim.isOnGround) {
      airStretch = anim.verticalSpeed > 0 ? 1.09 : 0.96;
    }
    const finalScaleY = squashY.current * airStretch;
    const invScaleXZ = 1 / Math.sqrt(Math.max(0.7, finalScaleY));
    const landingDip = Math.min(0, squashY.current - 1) * 0.24;

    if (bodyPivotRef.current) {
      if (firstPersonHideHead) {
        // Keep the first-person anchor completely free of bob/squash so camera & carried pose never vibrate
        bodyPivotRef.current.scale.set(1, 1, 1);
        bodyPivotRef.current.position.set(0, 0, 0);
        bodyPivotRef.current.rotation.set(0, 0, 0);
      } else {
        bodyPivotRef.current.scale.set(invScaleXZ, finalScaleY, invScaleXZ);
        const stepBob = Math.abs(c) * (0.036 + runBlend.current * 0.022) * gAmp;
        const idleBreath = Math.sin(t * 2.1) * 0.008 * (1 - gAmp);
        bodyPivotRef.current.position.y = stepBob + idleBreath + landingDip;

        const carryBackLean = carryBlend.current * -0.07;
        const runFwdLean = (0.05 + runBlend.current * 0.08) * gAmp;
        bodyPivotRef.current.rotation.x =
          carryBackLean + runFwdLean + smoothPitch.current - wobbleAngle.current * 0.65;
        bodyPivotRef.current.rotation.z =
          s * 0.042 * gAmp + smoothLean.current + wobbleAngle.current * 0.4;
      }
    }

    // 6. Legs stride, jump tuck ("en el aire"), and landing crouch
    if (leftLegRef.current && rightLegRef.current) {
      const legAmp = (0.58 + runBlend.current * 0.22) * (1 - carryBlend.current * 0.22);
      const groundLegL = s * legAmp * gAmp;
      const groundLegR = -s * legAmp * gAmp;

      // Joyful mid-air tuck matching concept sheet "EN EL AIRE"
      const airLegL = anim.verticalSpeed > -1.0 ? -0.52 : -0.22;
      const airLegR = anim.verticalSpeed > -1.0 ? -0.44 : 0.18;

      leftLegRef.current.rotation.x = THREE.MathUtils.lerp(groundLegL, airLegL, airBlend.current);
      rightLegRef.current.rotation.x = THREE.MathUtils.lerp(groundLegR, airLegR, airBlend.current);
    }

    // 7. Carry anchor & size-aware + clearance-aware arm poses
    const profile = anim.carriedKind ? CARRY_PROFILES[anim.carriedKind] : CARRY_PROFILES.crate;
    const activeDist = anim.isCarrying ? anim.carryDist : profile.holdDistance;
    const activeLift = anim.isCarrying ? anim.carryLift : profile.holdHeight;
    if (carryAnchorRef?.current) {
      const carryBob = firstPersonHideHead ? 0 : gAmp * Math.abs(c) * 0.018;
      carryAnchorRef.current.position.set(0, activeLift + carryBob, activeDist);
      carryAnchorRef.current.rotation.set(profile.tiltX, 0, 0);
    }

    if (leftArmRef.current && rightArmRef.current) {
      const lerpRate = 1 - Math.exp(-18 * dt);

      const swingScale = firstPersonHideHead ? 0.32 : 1.0;
      const swingAmp = (0.54 + runBlend.current * 0.26) * gAmp * swingScale;
      const idleArm = Math.sin(t * 2.1) * 0.025 * (1 - gAmp) * swingScale;
      const walkRotXL = -s * swingAmp + idleArm + (firstPersonHideHead ? -0.26 : 0);
      const walkRotXR = s * swingAmp - idleArm + (firstPersonHideHead ? -0.26 : 0);

      // Third-person joyful jump arms ("EN EL AIRE"); restrained lower pose in first person so gloves stay out of eyes
      const airArmX = firstPersonHideHead
        ? -0.42
        : anim.verticalSpeed > -0.5
          ? -2.15
          : -0.7 + Math.sin(t * 11) * 0.14;
      const airArmZ = firstPersonHideHead
        ? -0.22
        : anim.verticalSpeed > -0.5
          ? -0.55
          : -0.48;

      const freeArmXL = THREE.MathUtils.lerp(walkRotXL, airArmX, airBlend.current);
      const freeArmXR = THREE.MathUtils.lerp(walkRotXR, airArmX, airBlend.current);
      const freeArmZL = THREE.MathUtils.lerp(firstPersonHideHead ? -0.18 : -0.14, airArmZ, airBlend.current);
      const freeArmZR = THREE.MathUtils.lerp(firstPersonHideHead ? 0.18 : 0.14, -airArmZ, airBlend.current);

      // Carry pose tailored to object size & resolved clearance offset
      const carryArmBob = firstPersonHideHead ? 0 : gAmp * Math.abs(c) * 0.035;
      const distDelta = activeDist - profile.holdDistance;
      const liftDelta = activeLift - profile.holdHeight;
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

      const fpArmScale = firstPersonHideHead ? 0.84 : 1.0;
      leftArmRef.current.scale.setScalar(fpArmScale);
      rightArmRef.current.scale.setScalar(fpArmScale);

      const baseShoulderX = firstPersonHideHead ? 0.28 : 0.25;
      const carryShoulderX = firstPersonHideHead
        ? Math.max(profile.armSpread * 0.94, 0.22)
        : profile.armSpread * 0.88;
      const shoulderOffset = THREE.MathUtils.lerp(baseShoulderX, carryShoulderX, carryBlend.current);
      const baseArmY = firstPersonHideHead ? 0.08 : 0.14;
      const armPosY = baseArmY + THREE.MathUtils.lerp(0, liftDelta * 0.35, carryBlend.current);
      const handForwardPull = firstPersonHideHead
        ? THREE.MathUtils.lerp(0.1, 0.14 + distDelta * 0.65, carryBlend.current)
        : THREE.MathUtils.lerp(0, distDelta * 0.55, carryBlend.current);
      leftArmRef.current.position.set(-shoulderOffset, armPosY, handForwardPull);
      rightArmRef.current.position.set(shoulderOffset, armPosY, handForwardPull);
    }

    // Toggle ONLY obstructing head/torso/upper-shoulder/leg geometry in first person (keep forearms, cuffs, gloves & cargo visible)
    const showFullBody = !firstPersonHideHead;
    if (headRef.current) {
      headRef.current.visible = showFullBody;
    }
    if (backpackAnchorRef.current) {
      backpackAnchorRef.current.visible = showFullBody;
    }
    if (torsoBodyRef.current) {
      torsoBodyRef.current.visible = showFullBody;
    }
    if (leftLegRef.current) {
      leftLegRef.current.visible = showFullBody;
    }
    if (rightLegRef.current) {
      rightLegRef.current.visible = showFullBody;
    }
    if (leftShoulderRef.current) {
      leftShoulderRef.current.visible = showFullBody;
    }
    if (rightShoulderRef.current) {
      rightShoulderRef.current.visible = showFullBody;
    }

    // 8. Expressive head look + ponytail secondary swing
    if (headRef.current) {
      const lookYaw =
        gAmp > 0.25 ? THREE.MathUtils.clamp(-anim.turnRate * 0.06, -0.2, 0.2) : Math.sin(t * 0.7) * 0.12;
      const lookTilt = gAmp > 0.25 ? s * 0.025 * gAmp : Math.sin(t * 1.1) * 0.022;
      const lookPitch = !anim.isOnGround && anim.verticalSpeed < -1.5 ? 0.14 : carryBlend.current * 0.05;
      headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, lookYaw, 1 - Math.exp(-8 * dt));
      headRef.current.rotation.z = THREE.MathUtils.lerp(
        headRef.current.rotation.z,
        lookTilt - wobbleAngle.current * 0.45,
        1 - Math.exp(-9 * dt)
      );
      headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, lookPitch, 1 - Math.exp(-8 * dt));
    }

    // 9. Facial expression state ("alegre", "esfuerzo", "sorpresa", "decepcion")
    let expr: CharacterExpression = 'happy';
    if (surpriseExprTimer.current > 0 || (!anim.isOnGround && anim.verticalSpeed < -4.2)) {
      expr = 'surprise';
    } else if (disappointExprTimer.current > 0) {
      expr = 'disappointed';
    } else if (anim.isCarrying || landExprTimer.current > 0 || runBlend.current > 0.55) {
      expr = 'effort';
    }

    const faceBindings = faceBindingsRef.current;
    const faceController = faceControllerRef.current;
    if (faceBindings && faceController) {
      faceController.setShapePreset(headShape);
      faceController.update(faceBindings, dt, expr, {
        isMoving: gAmp > 0.25,
        turnRate: anim.turnRate,
        suppressGaze: firstPersonHideHead,
      });

      // Casco y antiparras siguen el anclaje y las medidas de la forma elegida (face_rig)
      if (headAnchorRef.current) {
        const appearanceWeights = faceController.getAppearanceWeights();
        const fit = resolveShapeFitMetrics(faceBindings.meta, appearanceWeights);
        const p = resolveAnchorPosition(faceBindings.meta, 'anchor_hat', appearanceWeights, scratchAnchorPos.current);
        headAnchorRef.current.position.set(
          p.x * HEAD_MODEL_SCALE + HEAD_MODEL_OFFSET[0],
          p.y * HEAD_MODEL_SCALE + HEAD_MODEL_OFFSET[1],
          p.z * HEAD_MODEL_SCALE + HEAD_MODEL_OFFSET[2]
        );
        const sx = ((fit.hat_band_width * HEAD_MODEL_SCALE) / 2 + HAT_CLEARANCE) / HARDHAT_RADIUS;
        const sz = ((fit.hat_band_depth * HEAD_MODEL_SCALE) / 2 + HAT_CLEARANCE) / HARDHAT_RADIUS;
        headAnchorRef.current.scale.set(sx, (sx + sz) / 2, sz);
        headAnchorRef.current.rotation.x = HARDHAT_TILT_X * 0.5;
      }
    }

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
        {/* LEGS & WORK BOOTS WITH ORANGE TONGUES */}
        <group ref={leftLegRef} position={[-0.135, 0.34, 0]}>
          <mesh castShadow receiveShadow material={materials.overall} position={[0, -0.09, 0]}>
            <capsuleGeometry args={[0.105, 0.11, 6, 12]} />
          </mesh>
          {/* Knee cloth patch (left = dark slate patch like concept sheet) */}
          <mesh material={materials.patchDark} position={[0, -0.095, 0.1]} rotation={[0.08, 0, -0.12]}>
            <boxGeometry args={[0.085, 0.085, 0.018]} />
          </mesh>
          {/* Orange ankle collar & front tongue */}
          <mesh castShadow material={materials.cuff} position={[0, -0.205, 0.015]}>
            <cylinderGeometry args={[0.102, 0.105, 0.055, 12]} />
          </mesh>
          <mesh castShadow material={materials.cuff} position={[0, -0.22, 0.09]}>
            <boxGeometry args={[0.08, 0.075, 0.055]} />
          </mesh>
          {/* Leather boot upper & dark tread sole */}
          <mesh castShadow receiveShadow material={materials.boot} position={[0, -0.265, 0.035]}>
            <boxGeometry args={[0.19, 0.1, 0.25]} />
          </mesh>
          <mesh castShadow receiveShadow material={materials.sole} position={[0, -0.322, 0.04]}>
            <boxGeometry args={[0.206, 0.038, 0.275]} />
          </mesh>
        </group>

        <group ref={rightLegRef} position={[0.135, 0.34, 0]}>
          <mesh castShadow receiveShadow material={materials.overall} position={[0, -0.09, 0]}>
            <capsuleGeometry args={[0.105, 0.11, 6, 12]} />
          </mesh>
          {/* Knee cloth patch (right = warm stitched tan patch) */}
          <mesh material={materials.patchLight} position={[0, -0.085, 0.1]} rotation={[-0.08, 0, 0.14]}>
            <boxGeometry args={[0.09, 0.085, 0.018]} />
          </mesh>
          {/* Orange ankle collar & front tongue */}
          <mesh castShadow material={materials.cuff} position={[0, -0.205, 0.015]}>
            <cylinderGeometry args={[0.102, 0.105, 0.055, 12]} />
          </mesh>
          <mesh castShadow material={materials.cuff} position={[0, -0.22, 0.09]}>
            <boxGeometry args={[0.08, 0.075, 0.055]} />
          </mesh>
          <mesh castShadow receiveShadow material={materials.boot} position={[0, -0.265, 0.035]}>
            <boxGeometry args={[0.19, 0.1, 0.25]} />
          </mesh>
          <mesh castShadow receiveShadow material={materials.sole} position={[0, -0.322, 0.04]}>
            <boxGeometry args={[0.206, 0.038, 0.275]} />
          </mesh>
        </group>

        {/* CHUNKY MECHANIC TORSO / OVERALLS */}
        <group ref={torsoRef} position={[0, 0.58, 0]}>
          <group ref={torsoBodyRef}>
          {/* Pear-shaped overall hips + cream shirt upper torso */}
          <mesh castShadow receiveShadow material={materials.overall} position={[0, -0.04, 0]}>
            <cylinderGeometry args={[0.23, 0.265, 0.3, 16]} />
          </mesh>
          <mesh castShadow receiveShadow material={materials.shirt} position={[0, 0.145, 0]}>
            <cylinderGeometry args={[0.205, 0.232, 0.16, 14]} />
          </mesh>

          {/* Front overalls bib & white 6-tooth gear emblem */}
          <mesh castShadow material={materials.overall} position={[0, 0.11, 0.18]} rotation={[-0.06, 0, 0]}>
            <boxGeometry args={[0.24, 0.19, 0.08]} />
          </mesh>
          <group position={[0, 0.115, 0.224]}>
            <mesh material={materials.emblem}>
              <torusGeometry args={[0.044, 0.016, 8, 16]} />
            </mesh>
            {GEAR_ANGLES.map((ang) => (
              <mesh
                key={ang}
                material={materials.emblem}
                position={[Math.cos(ang) * 0.054, Math.sin(ang) * 0.054, 0]}
                rotation={[0, 0, ang]}
              >
                <boxGeometry args={[0.022, 0.02, 0.014]} />
              </mesh>
            ))}
          </group>

          {/* Front straps + brass buckles */}
          <mesh castShadow material={materials.overallStrap} position={[-0.1, 0.195, 0.135]} rotation={[0.18, 0, 0]}>
            <boxGeometry args={[0.055, 0.17, 0.045]} />
          </mesh>
          <mesh castShadow material={materials.overallStrap} position={[0.1, 0.195, 0.135]} rotation={[0.18, 0, 0]}>
            <boxGeometry args={[0.055, 0.17, 0.045]} />
          </mesh>
          <mesh castShadow material={materials.brass} position={[-0.1, 0.16, 0.175]}>
            <boxGeometry args={[0.064, 0.04, 0.022]} />
          </mesh>
          <mesh castShadow material={materials.brass} position={[0.1, 0.16, 0.175]}>
            <boxGeometry args={[0.064, 0.04, 0.022]} />
          </mesh>

          {/* Crossed back straps (signature silhouette from rear view!) */}
          <mesh castShadow material={materials.overallStrap} position={[0, 0.145, -0.205]} rotation={[0, 0, 0.56]}>
            <boxGeometry args={[0.06, 0.25, 0.036]} />
          </mesh>
          <mesh castShadow material={materials.overallStrap} position={[0, 0.145, -0.205]} rotation={[0, 0, -0.56]}>
            <boxGeometry args={[0.06, 0.25, 0.036]} />
          </mesh>

          {/* Side & back stitched patches */}
          <mesh material={materials.patchLight} position={[-0.08, -0.05, -0.242]} rotation={[0, 0, 0.18]}>
            <boxGeometry args={[0.085, 0.08, 0.016]} />
          </mesh>
          <mesh material={materials.patchDark} position={[0.09, -0.07, -0.238]} rotation={[0, 0, -0.14]}>
            <boxGeometry args={[0.075, 0.075, 0.016]} />
          </mesh>

          {/* BELT DECORATIVE ANCHOR (non-colliding, replaceable tools/pouches) */}
          <group ref={beltAnchorRef} position={[0, -0.05, 0]}>
            <mesh castShadow material={materials.belt}>
              <cylinderGeometry args={[0.258, 0.264, 0.055, 16]} />
            </mesh>
            <mesh castShadow material={materials.brass} position={[0, 0, 0.255]}>
              <boxGeometry args={[0.08, 0.065, 0.025]} />
            </mesh>
            {appearance.beltToolStyle === 'pouch' && (
              <group position={[0.255, -0.02, 0.03]}>
                <mesh castShadow material={materials.cuff}>
                  <boxGeometry args={[0.075, 0.12, 0.12]} />
                </mesh>
                <mesh castShadow material={materials.brass} position={[0.04, 0.025, 0]}>
                  <boxGeometry args={[0.014, 0.028, 0.04]} />
                </mesh>
              </group>
            )}
          </group>
          </group>

          {/* CARRY ANCHOR dynamically positioned by PlayerRig clearance solver */}
          <group ref={carryAnchorRef} position={[0, 0.12, 0.65]} />

          {/* BACKPACK DECORATIVE ANCHOR (non-colliding, swaps outfits without altering physics) */}
          <group ref={backpackAnchorRef} position={[0, 0.04, -0.27]}>
            {appearance.backpackStyle === 'scrap_pack' && (
              <group>
                <mesh castShadow receiveShadow material={materials.backpack}>
                  <boxGeometry args={[0.3, 0.32, 0.16]} />
                </mesh>
                <mesh castShadow material={materials.brass} position={[-0.07, 0.04, -0.09]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.052, 0.052, 0.026, 12]} />
                </mesh>
                <group ref={antennaRef} position={[-0.1, 0.16, -0.02]}>
                  <mesh castShadow material={materials.goggleFrame} position={[0, 0.1, 0]}>
                    <cylinderGeometry args={[0.012, 0.016, 0.2, 8]} />
                  </mesh>
                  <mesh material={materials.cuff} position={[0, 0.21, 0]}>
                    <sphereGeometry args={[0.038, 10, 10]} />
                  </mesh>
                </group>
              </group>
            )}
          </group>

          {/* LEFT ARM + ORANGE CUFF + BIG WORK GLOVE */}
          <group ref={leftArmRef} position={[-0.25, 0.14, 0]}>
            <group ref={leftShoulderRef}>
              <mesh castShadow material={materials.shirt}>
                <sphereGeometry args={[0.088, 10, 10]} />
              </mesh>
              <mesh castShadow material={materials.shirt} position={[-0.022, -0.055, 0]} rotation={[0, 0, 0.15]}>
                <cylinderGeometry args={[0.078, 0.082, 0.095, 10]} />
              </mesh>
            </group>
            <mesh castShadow material={materials.skin} position={[-0.042, -0.145, 0]}>
              <capsuleGeometry args={[0.052, 0.085, 6, 10]} />
            </mesh>
            {/* Orange cuff + chunky grey-brown padded work glove */}
            <group position={[-0.052, -0.265, 0.03]}>
              <mesh castShadow material={materials.cuff} position={[0, 0.078, -0.015]}>
                <cylinderGeometry args={[0.082, 0.092, 0.058, 12]} />
              </mesh>
              <mesh castShadow material={materials.glove}>
                <sphereGeometry args={[0.104, 12, 10]} />
              </mesh>
              <mesh castShadow material={materials.glovePad} position={[-0.04, 0.01, 0.04]} rotation={[0, 0.5, 0]}>
                <boxGeometry args={[0.07, 0.075, 0.06]} />
              </mesh>
              <mesh castShadow material={materials.glove} position={[0.062, 0.02, 0.05]}>
                <sphereGeometry args={[0.046, 8, 8]} />
              </mesh>
            </group>
          </group>

          {/* RIGHT ARM + ORANGE CUFF + BIG WORK GLOVE */}
          <group ref={rightArmRef} position={[0.25, 0.14, 0]}>
            <group ref={rightShoulderRef}>
              <mesh castShadow material={materials.shirt}>
                <sphereGeometry args={[0.088, 10, 10]} />
              </mesh>
              <mesh castShadow material={materials.shirt} position={[0.022, -0.055, 0]} rotation={[0, 0, -0.15]}>
                <cylinderGeometry args={[0.078, 0.082, 0.095, 10]} />
              </mesh>
            </group>
            <mesh castShadow material={materials.skin} position={[0.042, -0.145, 0]}>
              <capsuleGeometry args={[0.052, 0.085, 6, 10]} />
            </mesh>
            <group position={[0.052, -0.265, 0.03]}>
              <mesh castShadow material={materials.cuff} position={[0, 0.078, -0.015]}>
                <cylinderGeometry args={[0.082, 0.092, 0.058, 12]} />
              </mesh>
              <mesh castShadow material={materials.glove}>
                <sphereGeometry args={[0.104, 12, 10]} />
              </mesh>
              <mesh castShadow material={materials.glovePad} position={[0.04, 0.01, 0.04]} rotation={[0, -0.5, 0]}>
                <boxGeometry args={[0.07, 0.075, 0.06]} />
              </mesh>
              <mesh castShadow material={materials.glove} position={[-0.062, 0.02, 0.05]}>
                <sphereGeometry args={[0.046, 8, 8]} />
              </mesh>
            </group>
          </group>

          {/* HEAD + EXPRESSIVE FACE + SPIKY PONYTAIL + HEAD/GOGGLES ANCHORS */}
          <group ref={headRef} position={[0, 0.37, 0.02]}>
            {/* Cabeza base v002 (GLB con rig facial por morph targets) */}
            <Suspense fallback={null}>
              <group scale={HEAD_MODEL_SCALE} position={HEAD_MODEL_OFFSET}>
                <CabezaBaseModel bindingsRef={faceBindingsRef} />
              </group>
            </Suspense>

            {/* HEAD DECORATIVE ANCHOR (Hard-hat with front visor brim, replaceable by helmet/cap/astronaut) */}
            <group ref={headAnchorRef} position={[0, 0.095, -0.015]} rotation={[-0.14, 0, 0]}>
              {appearance.hatStyle === 'hardhat' && (
                <group>
                  <mesh castShadow material={materials.hardhat}>
                    <sphereGeometry args={[0.268, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
                  </mesh>
                  {/* Top center safety crest */}
                  <mesh castShadow material={materials.hardhatCrest} position={[0, 0.245, 0]}>
                    <boxGeometry args={[0.068, 0.055, 0.34]} />
                  </mesh>
                  {/* Front visor brim (+Z!) */}
                  <mesh castShadow material={materials.hardhat} position={[0, 0.015, 0.24]} rotation={[0.14, 0, 0]}>
                    <boxGeometry args={[0.32, 0.036, 0.16]} />
                  </mesh>
                </group>
              )}

              {/* GOGGLES DECORATIVE ANCHOR resting cleanly on front of hard-hat */}
              <group ref={gogglesAnchorRef} position={[0, 0.125, 0.21]} rotation={[-0.22, 0, 0]}>
                {appearance.gogglesStyle === 'forehead' && (
                  <group>
                    <mesh material={materials.goggleStrap} position={[0, -0.01, -0.21]} rotation={[Math.PI / 2, 0, 0]}>
                      <torusGeometry args={[0.266, 0.02, 8, 22]} />
                    </mesh>
                    {[-0.088, 0.088].map((gx) => (
                      <group key={gx} position={[gx, 0, 0]}>
                        <mesh castShadow material={materials.goggleFrame} rotation={[Math.PI / 2, 0, 0]}>
                          <cylinderGeometry args={[0.076, 0.08, 0.076, 14]} />
                        </mesh>
                        <mesh material={materials.goggleLens} position={[0, 0, 0.034]} rotation={[Math.PI / 2, 0, 0]}>
                          <cylinderGeometry args={[0.06, 0.06, 0.018, 14]} />
                        </mesh>
                      </group>
                    ))}
                    <mesh castShadow material={materials.goggleStrap} position={[0, 0, 0.01]}>
                      <boxGeometry args={[0.06, 0.028, 0.03]} />
                    </mesh>
                  </group>
                )}
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
