import * as THREE from 'three';
import type { GrabbableKind } from '../props/grabbableRegistry';

export interface CarryWeightSpec {
  /** Normalized weight feel (0.25 light .. 1.0 heavy). */
  weightNorm: number;
  /** Downward shoulder drop in meters when holding the part. */
  shoulderDrop: number;
  /** Subtle torso lean/flex in radians (3rd person). */
  torsoFlex: number;
  /** Step bob amplitude in meters while walking. */
  bobAmp: number;
  /** Extra inward hand grip closing angle in radians. */
  gripClose: number;
  /** True when held with two hands (extensible for Entrega 2 single-hand small parts). */
  twoHanded: boolean;
}

const DEFAULT_WEIGHT_SPEC: CarryWeightSpec = {
  weightNorm: 0.55,
  shoulderDrop: 0.028,
  torsoFlex: 0.045,
  bobAmp: 0.016,
  gripClose: 0.06,
  twoHanded: true,
};

const CARRY_WEIGHT_SPECS: Partial<Record<GrabbableKind, CarryWeightSpec>> = {
  wheel: {
    weightNorm: 0.86,
    shoulderDrop: 0.052,
    torsoFlex: 0.085,
    bobAmp: 0.024,
    gripClose: 0.14,
    twoHanded: true,
  },
  crate: {
    weightNorm: 0.95,
    shoulderDrop: 0.058,
    torsoFlex: 0.095,
    bobAmp: 0.025,
    gripClose: 0.12,
    twoHanded: true,
  },
  woodBarrel: {
    weightNorm: 0.9,
    shoulderDrop: 0.054,
    torsoFlex: 0.09,
    bobAmp: 0.024,
    gripClose: 0.12,
    twoHanded: true,
  },
  chassis: {
    weightNorm: 1.0,
    shoulderDrop: 0.062,
    torsoFlex: 0.1,
    bobAmp: 0.022,
    gripClose: 0.1,
    twoHanded: true,
  },
  part: {
    weightNorm: 0.78,
    shoulderDrop: 0.042,
    torsoFlex: 0.07,
    bobAmp: 0.02,
    gripClose: 0.11,
    twoHanded: true,
  },
  battery: {
    weightNorm: 0.78,
    shoulderDrop: 0.042,
    torsoFlex: 0.07,
    bobAmp: 0.02,
    gripClose: 0.11,
    twoHanded: true,
  },
  seat: {
    weightNorm: 0.7,
    shoulderDrop: 0.036,
    torsoFlex: 0.06,
    bobAmp: 0.018,
    gripClose: 0.09,
    twoHanded: true,
  },
  balloon: {
    weightNorm: 0.25,
    shoulderDrop: 0.008,
    torsoFlex: 0.015,
    bobAmp: 0.012,
    gripClose: 0.04,
    twoHanded: false,
  },
};

export function getCarryWeightSpec(kind: GrabbableKind | null): CarryWeightSpec {
  if (!kind) return DEFAULT_WEIGHT_SPEC;
  return CARRY_WEIGHT_SPECS[kind] ?? DEFAULT_WEIGHT_SPEC;
}

export interface MountSettleEntry {
  fromPos: THREE.Vector3;
  fromQuat: THREE.Quaternion;
  startedAt: number;
  duration: number;
  isAxle: boolean;
}

const activeMountSettles = new Map<string, MountSettleEntry>();
const MAX_SETTLE_TRAVEL = 0.46;
const scratchDelta = new THREE.Vector3();

/**
 * Triggers a short, visual-only settle animation toward the real Rapier mount pose.
 * Never alters physics bodies or joints.
 */
export function triggerMountSettle(
  id: string,
  fromPos: THREE.Vector3,
  fromQuat: THREE.Quaternion,
  targetPos: { x: number; y: number; z: number },
  isAxle: boolean,
  nowSec = performance.now() / 1000,
): void {
  const clampedFrom = fromPos.clone();
  scratchDelta.set(
    clampedFrom.x - targetPos.x,
    clampedFrom.y - targetPos.y,
    clampedFrom.z - targetPos.z,
  );
  const dist = scratchDelta.length();
  if (dist > MAX_SETTLE_TRAVEL) {
    scratchDelta.multiplyScalar(MAX_SETTLE_TRAVEL / dist);
    clampedFrom.set(
      targetPos.x + scratchDelta.x,
      targetPos.y + scratchDelta.y,
      targetPos.z + scratchDelta.z,
    );
  }
  activeMountSettles.set(id, {
    fromPos: clampedFrom,
    fromQuat: fromQuat.clone(),
    startedAt: nowSec,
    duration: isAxle ? 0.165 : 0.135,
    isAxle,
  });
}

export function clearMountSettle(id: string): void {
  activeMountSettles.delete(id);
}

/**
 * Samples the visual-only mount settle animation.
 * Returns scale factor (1.0 when idle) and writes interpolated pose into outPos/outQuat.
 */
export function sampleMountSettle(
  id: string,
  nowSec: number,
  targetPos: THREE.Vector3,
  targetQuat: THREE.Quaternion,
  outPos: THREE.Vector3,
  outQuat: THREE.Quaternion,
): { active: boolean; scale: number } {
  const entry = activeMountSettles.get(id);
  if (!entry) {
    outPos.copy(targetPos);
    outQuat.copy(targetQuat);
    return { active: false, scale: 1 };
  }
  const elapsed = nowSec - entry.startedAt;
  if (elapsed >= entry.duration || elapsed < 0) {
    activeMountSettles.delete(id);
    outPos.copy(targetPos);
    outQuat.copy(targetQuat);
    return { active: false, scale: 1 };
  }
  const u = elapsed / entry.duration;
  // Fast ease-out cubic into the final axle/weld pose
  const eased = 1 - (1 - u) * (1 - u) * (1 - u);
  outPos.lerpVectors(entry.fromPos, targetPos, eased);
  outQuat.slerpQuaternions(entry.fromQuat, targetQuat, eased);

  // Brief crisp lock-in scale pop right as the part seats (~u = 0.65..1.0)
  let scale = 1;
  if (u > 0.55) {
    const popPhase = (u - 0.55) / 0.45;
    const bump = Math.sin(popPhase * Math.PI);
    scale = 1 + bump * (entry.isAxle ? 0.045 : 0.032);
  }
  return { active: true, scale };
}

/**
 * Maps real measured RPM from the test bench (and throttle power) to engine hum state.
 * Stays active during spindown until measured RPM drops near zero.
 */
export function computeBenchAudioIntensity(
  rpm: number,
  power: number,
): { active: boolean; intensity: number } {
  const safeRpm = Math.max(0, Number.isFinite(rpm) ? rpm : 0);
  const safePower = Math.max(0, Math.min(1, Number.isFinite(power) ? power : 0));
  if (safeRpm < 1.5 && safePower < 0.02) {
    return { active: false, intensity: 0 };
  }
  // 10 rad/s ≈ 95.5 RPM at full bench speed
  const rpmNorm = Math.min(1, safeRpm / 96);
  const intensity = Math.max(0.14, Math.min(1, 0.14 + rpmNorm * 0.72 + safePower * 0.14));
  return { active: true, intensity };
}

export interface ChassisDynamicsInput {
  fwdSpeed: number;
  prevFwdSpeed: number;
  sideSpeed: number;
  vertVel: number;
  prevVertVel: number;
  yawRate: number;
  throttle: number;
  steer: number;
  grounded: boolean;
  wasGrounded: boolean;
  dt: number;
}

export interface ChassisDynamicsOutput {
  targetPitch: number;
  targetRoll: number;
  landingImpact: number;
  speedNorm: number;
  slipNorm: number;
  hardImpact: number;
}

/**
 * Computes visual-only chassis suspension response and audio signals (rolling, skid, impact)
 * from real physical velocity and ground state.
 */
export function computeChassisDynamics(input: ChassisDynamicsInput): ChassisDynamicsOutput {
  const safeDt = Math.max(input.dt, 1 / 120);
  const horizSpeed = Math.hypot(input.fwdSpeed, input.sideSpeed);
  const rawAccel = (input.fwdSpeed - input.prevFwdSpeed) / safeDt;
  const clampedAccel = Math.max(-18, Math.min(18, rawAccel));

  // Squat back slightly on acceleration, nose-dive on braking
  const throttleBias = input.grounded ? input.throttle * 0.018 : 0;
  const accelPitch = input.grounded ? -clampedAccel * 0.0042 - throttleBias : 0;
  const targetPitch = Math.max(-0.075, Math.min(0.075, accelPitch));

  // Outward body roll in turns proportional to lateral speed & yaw rate
  const cornerForce = input.yawRate * Math.min(Math.abs(input.fwdSpeed), 10) * 0.0045 + input.sideSpeed * 0.01;
  const steerBias = input.grounded ? input.steer * Math.min(horizSpeed / 6, 1) * 0.022 : 0;
  const targetRoll = input.grounded
    ? Math.max(-0.068, Math.min(0.068, cornerForce + steerBias))
    : 0;

  // Landing settle after cresting a hill/bump
  const vertDelta = input.vertVel - input.prevVertVel;
  let landingImpact = 0;
  if (input.grounded && (!input.wasGrounded || input.prevVertVel < -1.1) && vertDelta > 1.35) {
    landingImpact = Math.min(1, (vertDelta - 1.0) / 6.5);
  }

  // Rolling signal: smooth continuous ground contact hum
  const speedNorm = input.grounded && horizSpeed > 0.45
    ? Math.min(1, (horizSpeed - 0.35) / 11.5)
    : 0;

  // Skid signal: lateral slide, hard braking against motion, or low-speed wheelspin
  let slipNorm = 0;
  if (input.grounded) {
    const lateralSlip = Math.max(0, (Math.abs(input.sideSpeed) - 0.85) / 3.4);
    const hardBrake =
      Math.abs(input.fwdSpeed) > 2.6 &&
      input.throttle * input.fwdSpeed < -0.25 &&
      clampedAccel * Math.sign(input.fwdSpeed) < -3.2
        ? Math.min(1, (Math.abs(clampedAccel) - 2.5) / 7.5)
        : 0;
    const launchSpin =
      Math.abs(input.throttle) > 0.7 && horizSpeed < 1.6 && Math.abs(clampedAccel) > 2.2
        ? 0.35
        : 0;
    slipNorm = Math.min(1, Math.max(lateralSlip, hardBrake, launchSpin));
  }

  // Hard impact signal: sudden deceleration or heavy vertical landing
  const prevSpeed = Math.abs(input.prevFwdSpeed);
  const currSpeed = Math.abs(input.fwdSpeed);
  const speedDrop = prevSpeed - currSpeed;
  let hardImpact = 0;
  if (speedDrop > 2.6 && prevSpeed > 3.2) {
    hardImpact = Math.min(1, (speedDrop - 2.0) / 7.0);
  }
  if (landingImpact > 0.35) {
    hardImpact = Math.max(hardImpact, landingImpact * 0.85);
  }

  return {
    targetPitch,
    targetRoll,
    landingImpact,
    speedNorm,
    slipNorm,
    hardImpact,
  };
}

/**
 * Shared live visual-only feel state (zero-allocation, read inside useFrame).
 * Extension point for future materials/vehicles in Entregas 2 & 3.
 */
export const vehicleFeelState = {
  /** 0..1 normalized real motor spin (bench RPM or driving wheels) for motor housing vibration. */
  motorRpmNorm: 0,
  benchMotors: null as ReadonlySet<string> | null,
  driveMotor: null as string | null,
  /** Target visual pitch (rad) for the workshop chassis model. */
  chassisPitch: 0,
  /** Target visual roll (rad) for the workshop chassis model. */
  chassisRoll: 0,
  /** One-shot landing settle impulse (consumed by WorkshopChassis useFrame). */
  chassisHeaveImpulse: 0,
  /** True when the workshop chassis is currently active (driven or on bench). */
  chassisActive: false,
  /** Current surface material tag (extension point for Entrega 3: concrete vs wood). */
  surfaceMaterial: 'concrete' as 'concrete' | 'wood' | 'dirt',
};

export function resetVehicleFeel(): void {
  activeMountSettles.clear();
  vehicleFeelState.motorRpmNorm = 0;
  vehicleFeelState.benchMotors = null;
  vehicleFeelState.driveMotor = null;
  vehicleFeelState.chassisPitch = 0;
  vehicleFeelState.chassisRoll = 0;
  vehicleFeelState.chassisHeaveImpulse = 0;
  vehicleFeelState.chassisActive = false;
  vehicleFeelState.surfaceMaterial = 'concrete';
}
