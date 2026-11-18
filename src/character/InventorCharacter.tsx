import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHARACTER_DIMENSIONS } from '../config/visualConfig';
import { CARRY_PROFILES, type GrabbableKind } from '../props/grabbableRegistry';
import { CabezaBaseModel } from './CabezaBaseModel';
import { BASE_BODY_PROFILE as BODY, BODY_SOCKETS } from './body/bodyProfile';
import { BeltMeshes, ForearmZone, LegZone, ShoulderZone, TorsoZone } from './body/BodyParts';
import { useCharacterMaterials } from './characterMaterials';
import { applyBodyOutline } from './body/bodyOutline';
import { getHeadVariant, headModelToPivot, resolveHeadTransform } from './heads/headRegistry';
import { getOutfit } from './outfits/outfitRegistry';
import {
  DEFAULT_CHISPA_APPEARANCE,
  type CharacterAppearanceConfig,
  type CharacterExpression,
} from './characterAppearance';
import {
  FaceRigController,
  resolveAnchorPosition,
  resolveShapeFitMetrics,
  type FaceRigBindings,
  type HeadShapePreset,
} from './faceRigController';

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
  dropBlockedImpulse?: number;
}

interface InventorCharacterProps {
  animDataRef: React.RefObject<CharacterAnimData>;
  carryAnchorRef?: React.RefObject<THREE.Group | null>;
  appearance?: CharacterAppearanceConfig;
  /** Id de `HEAD_VARIANTS`. Si se omite, se usa `headShape` (compatibilidad). */
  headId?: string;
  /** @deprecated usar `headId`; se mantiene para las llamadas existentes. */
  headShape?: HeadShapePreset;
  /** Id de `OUTFITS`. */
  outfitId?: string;
  firstPersonHideHead?: boolean;
}

// Accesorios de cabeza (casco): medidas propias del accesorio, no del cuerpo.
const HARDHAT_TILT_X = -0.22;
const HARDHAT_RADIUS = 0.268;
const HAT_CLEARANCE = 0.014;

export function InventorCharacter({
  animDataRef,
  carryAnchorRef,
  appearance = DEFAULT_CHISPA_APPEARANCE,
  headId,
  headShape = 'base',
  outfitId,
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

  const headVariant = getHeadVariant(headId ?? headShape);
  const headTransform = useMemo(() => resolveHeadTransform(headVariant), [headVariant]);
  const outfit = getOutfit(outfitId);
  const pal = useMemo(
    () => (outfit.palette ? { ...appearance.palette, ...outfit.palette } : appearance.palette),
    [appearance.palette, outfit.palette]
  );
  const materials = useCharacterMaterials(pal);

  // Contorno del cuerpo (la cabeza trae el suyo en el GLB).
  useEffect(() => {
    if (bodyPivotRef.current) applyBodyOutline(bodyPivotRef.current);
  }, [outfit, materials, appearance]);

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

      const fpArmScale = firstPersonHideHead ? BODY.firstPerson.armScale : 1.0;
      leftArmRef.current.scale.setScalar(fpArmScale);
      rightArmRef.current.scale.setScalar(fpArmScale);

      const baseShoulderX = firstPersonHideHead ? BODY.firstPerson.shoulderX : BODY.arm.shoulderX;
      const carryShoulderX = firstPersonHideHead
        ? Math.max(profile.armSpread * 0.94, 0.22)
        : profile.armSpread * 0.88;
      const shoulderOffset = THREE.MathUtils.lerp(baseShoulderX, carryShoulderX, carryBlend.current);
      const baseArmY = firstPersonHideHead ? BODY.firstPerson.shoulderY : BODY.arm.shoulderY;
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
      faceController.setShapePreset(headVariant.shapePreset);
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
        const [hx, hy, hz] = headModelToPivot(headTransform, p.x, p.y, p.z);
        headAnchorRef.current.position.set(hx, hy, hz);
        const sx = ((fit.hat_band_width * headTransform.scale) / 2 + HAT_CLEARANCE) / HARDHAT_RADIUS;
        const sz = ((fit.hat_band_depth * headTransform.scale) / 2 + HAT_CLEARANCE) / HARDHAT_RADIUS;
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
  const S = BODY_SOCKETS;

  return (
    <group ref={rootRef} position={[0, CHARACTER_DIMENSIONS.visualYOffset, 0]}>
      <group ref={bodyPivotRef}>
        {/* PIERNAS: cuerpo base + prenda de pierna + botas (medidas en bodyProfile) */}
        <group ref={leftLegRef} position={S.hipL}>
          <LegZone m={materials} outfit={outfit} side={-1} />
        </group>
        <group ref={rightLegRef} position={S.hipR}>
          <LegZone m={materials} outfit={outfit} side={1} />
        </group>

        {/* TORSO: cuerpo base + cuello + ropa por capas */}
        <group ref={torsoRef} position={[0, BODY.torso.y, 0]}>
          <group ref={torsoBodyRef}>
            <TorsoZone m={materials} outfit={outfit} />

            {/* BELT DECORATIVE ANCHOR (non-colliding, replaceable tools/pouches) */}
            <group ref={beltAnchorRef} position={S.waist}>
              <BeltMeshes m={materials} />
              {appearance.beltToolStyle === 'pouch' && (
                <group position={[BODY.torso.radiusHips + 0.022, -0.02, 0.03]}>
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
          <group ref={backpackAnchorRef} position={S.back}>
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

          {/* BRAZOS: posición de reposo = socket de hombro (useFrame la recalcula con el mismo perfil) */}
          <group ref={leftArmRef} position={S.shoulderL}>
            <group ref={leftShoulderRef}>
              <ShoulderZone m={materials} outfit={outfit} side={-1} />
            </group>
            <ForearmZone m={materials} outfit={outfit} side={-1} />
          </group>
          <group ref={rightArmRef} position={S.shoulderR}>
            <group ref={rightShoulderRef}>
              <ShoulderZone m={materials} outfit={outfit} side={1} />
            </group>
            <ForearmZone m={materials} outfit={outfit} side={1} />
          </group>

          {/* CABEZA: pivote en el socket del cuello; el registro resuelve escala/offset por variante */}
          <group ref={headRef} position={headTransform.pivot}>
            <Suspense fallback={null}>
              <group scale={headTransform.scale} position={headTransform.offset}>
                <CabezaBaseModel bindingsRef={faceBindingsRef} url={headVariant.modelUrl} />
              </group>
            </Suspense>

            {/* HEAD DECORATIVE ANCHOR (Hard-hat with front visor brim, replaceable by helmet/cap/astronaut) */}
            <group ref={headAnchorRef} position={[0, 0.095, -0.015]} rotation={[-0.14, 0, 0]}>
              {appearance.hatStyle === 'hardhat' && (
                <group>
                  <mesh castShadow material={materials.hardhat}>
                    <sphereGeometry args={[HARDHAT_RADIUS, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
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
