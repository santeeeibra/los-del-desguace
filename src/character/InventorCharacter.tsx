import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHARACTER_DIMENSIONS } from '../config/visualConfig';
import { getCarryWeightSpec } from '../invention/vehicleFeel';
import { CARRY_PROFILES, type GrabbableKind } from '../props/grabbableRegistry';
import { CabezaBaseModel } from './CabezaBaseModel';
import { MagicWrench } from './MagicWrench';
import { WelderTool } from './WelderTool';
import { GrinderTool } from './GrinderTool';
import { SliceSawTool } from './SliceSawTool';
import { WireTool } from './WireTool';
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
import { EMOTE_BY_ID, type EmoteId } from './characterCustomization';
import { MechanicAccessories } from './MechanicAccessories';
import { sampleThinkingPuffPose, withProtectiveGearActive } from './mechanicStyle';
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
  pickupImpulse?: number;
  rotateImpulse?: number;
  mountImpulse?: number;
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
  wrenchEquipped?: boolean;
  welderEquipped?: boolean;
  grinderEquipped?: boolean;
  /** Sierra de corte en la mano (mientras se rebana una pieza). */
  sawEquipped?: boolean;
  /** Pinza de cableado en la mano (modo Cables). */
  wireEquipped?: boolean;
  /** True mientras la herramienta está soldando, amolando o trazando corte (agrega vibración y retroceso). */
  toolWorking?: boolean;
  seated?: boolean;
  alignToGround?: boolean;
  wrenchTipRef?: React.RefObject<THREE.Group | null>;
  activeEmote?: EmoteId | null;
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
  wrenchEquipped = false,
  welderEquipped = false,
  grinderEquipped = false,
  sawEquipped = false,
  wireEquipped = false,
  toolWorking = false,
  seated = false,
  alignToGround = false,
  wrenchTipRef,
  activeEmote = null,
}: InventorCharacterProps) {
  const rootRef = useRef<THREE.Group>(null);
  const bodyPivotRef = useRef<THREE.Group>(null);
  const torsoRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);

  // Decorative-only attachment anchor refs (non-colliding)
  const headAnchorRef = useRef<THREE.Group>(null);
  const hairRef = useRef<THREE.Group>(null);
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
  const toolHoldGroupRef = useRef<THREE.Group>(null);
  const lastToolKeyRef = useRef<string>('none');
  const toolEquipSpring = useRef(0);
  const toolEquipVel = useRef(0);

  // "Mecánicos Locos": careta/antiparras automáticas y humo del gesto pensativo
  const protectiveActiveRef = useRef(false);
  const protectiveTimer = useRef(0);
  const smokeBurstRef = useRef(false);
  const emoteStartRef = useRef<{ id: EmoteId | null; at: number }>({ id: null, at: 0 });

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
  const carryHeft = useRef(0);
  const carryHeftVel = useRef(0);
  const wristTwist = useRef(0);
  const wristTwistVel = useRef(0);
  const mountRecoil = useRef(0);
  const mountRecoilVel = useRef(0);
  const carrySettlePitch = useRef(0);
  const carrySettleRoll = useRef(0);

  const landExprTimer = useRef(0);
  const surpriseExprTimer = useRef(0);
  const disappointExprTimer = useRef(0);

  const headVariant = getHeadVariant(headId ?? headShape);
  const headTransform = useMemo(() => resolveHeadTransform(headVariant), [headVariant]);
  const outfit = getOutfit(outfitId);
  const pal = useMemo(
    () => (outfit.palette && !appearance.usePaletteForOutfit ? { ...appearance.palette, ...outfit.palette } : appearance.palette),
    [appearance.palette, appearance.usePaletteForOutfit, outfit.palette]
  );
  const materials = useCharacterMaterials(pal);

  // Contorno del cuerpo (la cabeza trae el suyo en el GLB).
  useEffect(() => {
    if (bodyPivotRef.current) return applyBodyOutline(bodyPivotRef.current);
  }, [outfit, appearance.hatStyle, appearance.gogglesStyle, appearance.backpackStyle, appearance.beltToolStyle]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const anim = animDataRef.current;
    const t = state.clock.elapsedTime;

    // 0. Equipo de protección: baja la careta/antiparras mientras se suelda, amola o corta
    //    (y las mantiene bajas 0.4 s después, para que no parpadeen entre chispas).
    protectiveTimer.current = toolWorking ? 0.4 : Math.max(0, protectiveTimer.current - dt);
    if (appearance.mechanic) {
      protectiveActiveRef.current =
        withProtectiveGearActive(appearance.mechanic, protectiveTimer.current > 0) !== appearance.mechanic.headgear;
    }
    if (emoteStartRef.current.id !== activeEmote) emoteStartRef.current = { id: activeEmote, at: t };
    smokeBurstRef.current = false;

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
    if (anim.pickupImpulse && anim.pickupImpulse > 0.01) {
      const heft = THREE.MathUtils.clamp(anim.pickupImpulse, 0.2, 1.2);
      carryHeftVel.current += heft * 5.2;
      squashVel.current -= heft * 2.9;
      anim.pickupImpulse = 0;
    }
    if (anim.rotateImpulse && Math.abs(anim.rotateImpulse) > 0.01) {
      wristTwistVel.current += THREE.MathUtils.clamp(anim.rotateImpulse, -1.5, 1.5) * 6.8;
      anim.rotateImpulse = 0;
    }
    if (anim.mountImpulse && anim.mountImpulse > 0.01) {
      mountRecoilVel.current += THREE.MathUtils.clamp(anim.mountImpulse, 0.2, 1.2) * 5.5;
      carryHeft.current = 0;
      carryHeftVel.current = 0;
      anim.mountImpulse = 0;
    }

    landExprTimer.current = Math.max(0, landExprTimer.current - dt);
    surpriseExprTimer.current = Math.max(0, surpriseExprTimer.current - dt);
    disappointExprTimer.current = Math.max(0, disappointExprTimer.current - dt);

    // 2. Spring-damper for squash/stretch, bump stumble, and carry/wrist cues
    const springForce = (1 - squashY.current) * 155 - squashVel.current * 15.5;
    squashVel.current += springForce * dt;
    squashY.current = THREE.MathUtils.clamp(squashY.current + squashVel.current * dt, 0.74, 1.18);

    const wobbleForce = -wobbleAngle.current * 115 - wobbleVel.current * 12;
    wobbleVel.current += wobbleForce * dt;
    wobbleAngle.current = THREE.MathUtils.clamp(wobbleAngle.current + wobbleVel.current * dt, -0.4, 0.4);

    const heftForce = -carryHeft.current * 135 - carryHeftVel.current * 16.5;
    carryHeftVel.current += heftForce * dt;
    carryHeft.current = THREE.MathUtils.clamp(carryHeft.current + carryHeftVel.current * dt, -0.25, 0.85);
    if (!anim.isCarrying) {
      carryHeft.current = THREE.MathUtils.lerp(carryHeft.current, 0, 1 - Math.exp(-22 * dt));
    }

    const wristForce = -wristTwist.current * 165 - wristTwistVel.current * 17.5;
    wristTwistVel.current += wristForce * dt;
    wristTwist.current = THREE.MathUtils.clamp(wristTwist.current + wristTwistVel.current * dt, -0.45, 0.45);

    const recoilForce = -mountRecoil.current * 150 - mountRecoilVel.current * 17;
    mountRecoilVel.current += recoilForce * dt;
    mountRecoil.current = THREE.MathUtils.clamp(mountRecoil.current + mountRecoilVel.current * dt, -0.2, 0.55);

    // 3. Smooth locomotion state blends (idle / walk / run / stop / carry / air)
    const horizSpeed = seated ? 0 : anim.speed;
    const targetGait =
      anim.isOnGround && horizSpeed > 0.22 ? THREE.MathUtils.clamp(horizSpeed / 4.2, 0.2, 1.0) : 0;
    const targetRun = anim.isOnGround && anim.isRunning && horizSpeed > 4.4 ? 1 : 0;
    const targetCarry = anim.isCarrying ? 1 : 0;
    const targetAir = anim.isOnGround || seated ? 0 : 1;

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

    // 4. Moderate acceleration pitch & cornering lean + carry settle inertia
    const weightSpec = getCarryWeightSpec(anim.isCarrying ? anim.carriedKind : null);
    const targetPitch = THREE.MathUtils.clamp(anim.accelForward * 0.012, -0.09, 0.1);
    const targetLean = THREE.MathUtils.clamp(-anim.turnRate * 0.032, -0.14, 0.14);
    smoothPitch.current = THREE.MathUtils.lerp(smoothPitch.current, targetPitch, 1 - Math.exp(-10 * dt));
    smoothLean.current = THREE.MathUtils.lerp(smoothLean.current, targetLean, 1 - Math.exp(-11 * dt));

    const targetCarrySettlePitch = anim.isCarrying
      ? THREE.MathUtils.clamp(-anim.accelForward * 0.011 * weightSpec.weightNorm, -0.09, 0.09)
      : 0;
    const targetCarrySettleRoll = anim.isCarrying
      ? THREE.MathUtils.clamp(anim.turnRate * 0.028 * weightSpec.weightNorm, -0.12, 0.12)
      : 0;
    carrySettlePitch.current = THREE.MathUtils.lerp(carrySettlePitch.current, targetCarrySettlePitch, 1 - Math.exp(-9 * dt));
    carrySettleRoll.current = THREE.MathUtils.lerp(carrySettleRoll.current, targetCarrySettleRoll, 1 - Math.exp(-9 * dt));

    // 5. Body pivot squash, dip on landing, and breathing
    let airStretch = 1;
    if (!anim.isOnGround && !seated) {
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
        const heftCrouch = (carryBlend.current * weightSpec.shoulderDrop * 0.65 + carryHeft.current * 0.048);
        bodyPivotRef.current.position.y = stepBob + idleBreath + landingDip - heftCrouch;

        const carryBackLean = carryBlend.current * -(0.045 + weightSpec.torsoFlex * 0.6) + carryHeft.current * 0.09;
        const runFwdLean = (0.05 + runBlend.current * 0.08) * gAmp;
        bodyPivotRef.current.rotation.x =
          carryBackLean + runFwdLean + smoothPitch.current + carrySettlePitch.current * 0.45 - wobbleAngle.current * 0.65;
        bodyPivotRef.current.rotation.z =
          s * (0.042 + carryBlend.current * 0.015) * gAmp + smoothLean.current + carrySettleRoll.current * 0.35 + wobbleAngle.current * 0.4;
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

      leftLegRef.current.rotation.x = seated ? -1.27 : THREE.MathUtils.lerp(groundLegL, airLegL, airBlend.current);
      rightLegRef.current.rotation.x = seated ? -1.27 : THREE.MathUtils.lerp(groundLegR, airLegR, airBlend.current);
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

      const toolKey = wireEquipped ? 'wire' : sawEquipped ? 'saw' : grinderEquipped ? 'grinder' : welderEquipped ? 'welder' : wrenchEquipped ? 'wrench' : 'none';
      if (toolKey !== lastToolKeyRef.current) {
        lastToolKeyRef.current = toolKey;
        if (toolKey !== 'none') {
          toolEquipSpring.current = 1;
          toolEquipVel.current = -2.2;
        }
      }
      // Resorte amortiguado de desenfunde al sacar una herramienta (180ms con ligero rebote)
      toolEquipVel.current += (-175 * toolEquipSpring.current - 18 * toolEquipVel.current) * dt;
      toolEquipSpring.current += toolEquipVel.current * dt;
      if (Math.abs(toolEquipSpring.current) < 0.002 && Math.abs(toolEquipVel.current) < 0.01) {
        toolEquipSpring.current = 0;
        toolEquipVel.current = 0;
      }

      const freeArmXL = THREE.MathUtils.lerp(walkRotXL, airArmX, airBlend.current);
      const toolBob = gAmp * Math.abs(c) * 0.08;
      const toolEquipPitch = toolEquipSpring.current * 0.72;
      const toolWorkKick = toolWorking ? -0.06 + Math.sin(t * 58) * 0.032 : 0;
      const freeArmXR = (wrenchEquipped || wireEquipped)
        ? (firstPersonHideHead ? -0.9 : -0.65) + idleArm + toolBob + toolEquipPitch + toolWorkKick
        : THREE.MathUtils.lerp(walkRotXR, airArmX, airBlend.current);
      const freeArmZL = THREE.MathUtils.lerp(firstPersonHideHead ? -0.18 : -0.14, airArmZ, airBlend.current);
      const freeArmZR = THREE.MathUtils.lerp(firstPersonHideHead ? 0.18 : 0.14, -airArmZ, airBlend.current)
        + ((wrenchEquipped || wireEquipped) ? toolEquipSpring.current * 0.24 : 0);

      if (toolHoldGroupRef.current) {
        const vibX = toolWorking ? Math.sin(t * 72) * 0.008 : 0;
        const vibY = toolWorking ? Math.cos(t * 86) * 0.007 : 0;
        const idleBreath = (wrenchEquipped || wireEquipped) ? Math.sin(t * 2.4) * 0.006 : 0;
        toolHoldGroupRef.current.position.set(
          S.handR[0] + vibX,
          S.handR[1] + vibY + idleBreath - Math.max(0, toolEquipSpring.current) * 0.05,
          S.handR[2] + (toolWorking ? -0.018 : 0),
        );
        toolHoldGroupRef.current.rotation.set(
          toolWorking ? Math.sin(t * 64) * 0.04 : 0,
          0,
          toolEquipSpring.current * -0.45 + gAmp * s * 0.05,
        );
      }

      // Carry pose tailored to object size, weight, step sway & wrist rotation cue
      const carryStepBob = gAmp * Math.abs(c) * (firstPersonHideHead ? weightSpec.bobAmp * 1.15 : weightSpec.bobAmp * 1.8);
      const carryStepSway = gAmp * s * (firstPersonHideHead ? 0.024 : 0.032) * weightSpec.weightNorm;
      const distDelta = activeDist - profile.holdDistance;
      const liftDelta = activeLift - profile.holdHeight;
      const heftPitch = carryHeft.current * 0.22;
      const recoilPitch = -mountRecoil.current * 0.36;
      const carryRotXBase =
        profile.armPitch + carryStepBob + heftPitch + carrySettlePitch.current * 0.75 + distDelta * -0.95 + liftDelta * -1.45;
      const carryRotXL = carryRotXBase + wristTwist.current * 0.45 + carryStepSway * 0.5;
      const carryRotXR = carryRotXBase - wristTwist.current * 0.45 - carryStepSway * 0.5;
      const inwardAngle = (0.27 - profile.armSpread) * 1.45 + weightSpec.gripClose * carryBlend.current;
      const carryRotZL = inwardAngle + wristTwist.current * 0.55 + carrySettleRoll.current * 0.65 + carryStepSway;
      const carryRotZR = -inwardAngle + wristTwist.current * 0.55 + carrySettleRoll.current * 0.65 + carryStepSway;

      leftArmRef.current.rotation.x = THREE.MathUtils.lerp(
        leftArmRef.current.rotation.x,
        THREE.MathUtils.lerp(freeArmXL + recoilPitch, carryRotXL, carryBlend.current),
        lerpRate
      );
      rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
        rightArmRef.current.rotation.x,
        THREE.MathUtils.lerp(freeArmXR + recoilPitch, carryRotXR, carryBlend.current),
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
        ? Math.max(profile.armSpread * 0.9, 0.21)
        : profile.armSpread * 0.85;
      const shoulderOffset = THREE.MathUtils.lerp(baseShoulderX, carryShoulderX, carryBlend.current);
      const baseArmY = firstPersonHideHead ? BODY.firstPerson.shoulderY : BODY.arm.shoulderY;
      const shoulderWeightDrop =
        (weightSpec.shoulderDrop * (firstPersonHideHead ? 0.72 : 1.0) + carryHeft.current * 0.042) * carryBlend.current;
      const stepArmDip = firstPersonHideHead ? -gAmp * Math.abs(c) * weightSpec.bobAmp * 0.65 * carryBlend.current : 0;
      const armPosY = baseArmY + THREE.MathUtils.lerp(0, liftDelta * 0.35, carryBlend.current) - shoulderWeightDrop + stepArmDip;
      const handForwardPull = firstPersonHideHead
        ? THREE.MathUtils.lerp(0.1, 0.14 + distDelta * 0.65, carryBlend.current)
        : THREE.MathUtils.lerp(0, distDelta * 0.55, carryBlend.current);
      const wristShiftY = wristTwist.current * 0.028 * carryBlend.current;
      leftArmRef.current.position.set(-shoulderOffset, armPosY + wristShiftY, handForwardPull);
      rightArmRef.current.position.set(shoulderOffset, armPosY - wristShiftY, handForwardPull);
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

    // 8b. Procedural Emote Pose Overrides (7 workshop gestures)
    if (activeEmote && !anim.isCarrying && !firstPersonHideHead && leftArmRef.current && rightArmRef.current) {
      const leftArm = leftArmRef.current;
      const rightArm = rightArmRef.current;
      const head = headRef.current;

      switch (activeEmote) {
        case 'wave':
          rightArm.rotation.x = -2.45;
          rightArm.rotation.z = 0.35 + Math.sin(t * 12) * 0.35;
          if (head) head.rotation.z = 0.14;
          break;
        case 'thumbsUp':
          rightArm.rotation.x = -1.45;
          rightArm.rotation.z = -0.12;
          if (head) head.rotation.x = Math.sin(t * 8) * 0.12;
          break;
        case 'celebrate':
          leftArm.rotation.x = -2.55;
          leftArm.rotation.z = -0.45;
          rightArm.rotation.x = -2.55;
          rightArm.rotation.z = 0.45;
          if (!seated && bodyPivotRef.current) {
            bodyPivotRef.current.position.y += Math.abs(Math.sin(t * 11)) * 0.09;
          }
          break;
        case 'facepalm':
          rightArm.rotation.x = -2.05;
          rightArm.rotation.z = -0.58;
          if (head) {
            head.rotation.x = 0.36;
            head.rotation.y = Math.sin(t * 9) * 0.18;
          }
          break;
        case 'think':
          rightArm.rotation.x = -1.75;
          rightArm.rotation.z = -0.52;
          leftArm.rotation.x = -0.85;
          leftArm.rotation.z = 0.48;
          if (head) {
            head.rotation.x = -0.16;
            head.rotation.z = 0.18;
          }
          break;
        case 'thinking_puff': {
          // Pitada pensativa: mano a la boca, brazo izquierdo cruzado, cabeza ladeada mirando el invento
          const pose = sampleThinkingPuffPose(t - emoteStartRef.current.at);
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, -1.95, pose.rightHandToMouth);
          rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, -0.5, pose.rightHandToMouth);
          leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, -0.9, pose.leftArmCrossed);
          leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, 0.62, pose.leftArmCrossed);
          if (head) {
            head.rotation.z = pose.headTiltZ;
            head.rotation.x = pose.headPitchX;
          }
          smokeBurstRef.current = pose.exhaleSmoke;
          break;
        }
        case 'wrenchSpin':
          rightArm.rotation.x = -1.7;
          rightArm.rotation.z = 0.24 + Math.sin(t * 15) * 0.28;
          break;
        case 'panic':
          leftArm.rotation.x = -2.25;
          leftArm.rotation.z = 0.42;
          rightArm.rotation.x = -2.25;
          rightArm.rotation.z = -0.42;
          if (head) head.rotation.y = Math.sin(t * 24) * 0.16;
          break;
      }
    }

    // 9. Facial expression state ("alegre", "esfuerzo", "sorpresa", "decepcion")
    let expr: CharacterExpression = 'happy';
    if (activeEmote && EMOTE_BY_ID[activeEmote]) {
      expr = EMOTE_BY_ID[activeEmote].expression;
    } else if (surpriseExprTimer.current > 0 || (!anim.isOnGround && anim.verticalSpeed < -4.2)) {
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
        if (hairRef.current) {
          hairRef.current.position.y = ((fit.head_top - p.y) * headTransform.scale - 0.045) / ((sx + sz) / 2);
        }
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
    <group ref={rootRef} position={[
      0,
      alignToGround && !seated && !firstPersonHideHead
        ? CHARACTER_DIMENSIONS.groundVisualYOffset
        : CHARACTER_DIMENSIONS.visualYOffset,
      0,
    ]}>
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
            {(wrenchEquipped || wireEquipped || activeEmote === 'wrenchSpin') && (
              <group ref={toolHoldGroupRef} position={S.handR}>
                {wireEquipped ? <WireTool tipRef={wrenchTipRef} />
                  : welderEquipped ? <WelderTool tipRef={wrenchTipRef} />
                  : grinderEquipped ? <GrinderTool tipRef={wrenchTipRef} />
                  : sawEquipped ? <SliceSawTool tipRef={wrenchTipRef} />
                  : <MagicWrench tipRef={wrenchTipRef} />}
              </group>
            )}
          </group>

          {/* CABEZA: pivote en el socket del cuello; el registro resuelve escala/offset por variante */}
          <group ref={headRef} position={headTransform.pivot}>
            <Suspense fallback={null}>
              <group scale={headTransform.scale} position={headTransform.offset}>
                <CabezaBaseModel bindingsRef={faceBindingsRef} url={headVariant.modelUrl}
                  skinColor={appearance.usePaletteForOutfit ? pal.skin : undefined}
                  browColor={appearance.usePaletteForOutfit ? pal.hairShadow : undefined} />
              </group>
            </Suspense>

            {/* MECÁNICOS LOCOS: antiparras, careta, casco de chapa, pelo chamuscado, boca, grasa, pañuelo */}
            {appearance.mechanic && (
              <MechanicAccessories
                style={appearance.mechanic}
                materials={materials}
                headTransform={headTransform}
                protectiveActiveRef={protectiveActiveRef}
                smokeBurstRef={smokeBurstRef}
              />
            )}

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
              {appearance.hatStyle === 'none' && appearance.usePaletteForOutfit && appearance.mechanic?.headgear !== 'scrap_helmet' && (
                <group ref={hairRef} position={[0, 0.17, -0.025]}>
                  <mesh castShadow material={materials.hairShadow} scale={[0.205, 0.073, 0.19]} position={[0, -0.012, -0.02]}>
                    <sphereGeometry args={[1, 16, 10]} />
                  </mesh>
                  <mesh castShadow material={materials.hair} scale={[0.157, 0.068, 0.139]} position={[0.025, 0.021, 0.012]} rotation={[0, 0, -0.28]}>
                    <sphereGeometry args={[1, 16, 10]} />
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
