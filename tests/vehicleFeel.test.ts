import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  computeBenchAudioIntensity,
  computeChassisDynamics,
  getCarryWeightSpec,
  resetVehicleFeel,
  sampleMountSettle,
  triggerMountSettle,
} from '../src/invention/vehicleFeel';

describe('Entrega 1 · vehicleFeel (peso de rueda, encastre, banco RPM y chasis)', () => {
  beforeEach(() => {
    resetVehicleFeel();
  });

  it('da peso, bajada de hombros y agarre cerrado a dos manos al levantar una rueda', () => {
    const wheel = getCarryWeightSpec('wheel');
    const balloon = getCarryWeightSpec('balloon');
    expect(wheel.twoHanded).toBe(true);
    expect(wheel.weightNorm).toBeGreaterThan(0.8);
    expect(wheel.shoulderDrop).toBeGreaterThan(balloon.shoulderDrop);
    expect(wheel.gripClose).toBeGreaterThan(balloon.gripClose);
  });

  it('anima un recorrido visual corto hasta la pose final al encastrar una rueda y termina exacto', () => {
    const fromPos = new THREE.Vector3(5, 2, 5);
    const targetPos = new THREE.Vector3(0, 0.4, 0);
    const fromQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.5, 0));
    const targetQuat = new THREE.Quaternion();
    const outPos = new THREE.Vector3();
    const outQuat = new THREE.Quaternion();

    triggerMountSettle('wheel-1', fromPos, fromQuat, targetPos, true, 10.0);

    // Al inicio, el desplazamiento queda acotado a un tramo corto (<= 0.46 m)
    const start = sampleMountSettle('wheel-1', 10.0, targetPos, targetQuat, outPos, outQuat);
    expect(start.active).toBe(true);
    expect(outPos.distanceTo(targetPos)).toBeLessThanOrEqual(0.47);
    expect(outPos.distanceTo(targetPos)).toBeGreaterThan(0.2);

    // Cerca del final, aplica un breve pulso de encastre (> 1.0)
    const lockIn = sampleMountSettle('wheel-1', 10.13, targetPos, targetQuat, outPos, outQuat);
    expect(lockIn.active).toBe(true);
    expect(lockIn.scale).toBeGreaterThan(1.0);
    expect(outPos.distanceTo(targetPos)).toBeLessThan(0.08);

    // Al completar, queda en la pose física exacta y escala 1
    const done = sampleMountSettle('wheel-1', 10.2, targetPos, targetQuat, outPos, outQuat);
    expect(done.active).toBe(false);
    expect(done.scale).toBe(1);
    expect(outPos.distanceTo(targetPos)).toBeCloseTo(0, 5);
  });

  it('acompaña las RPM reales del banco al acelerar y al desacelerar hasta frenar', () => {
    const idle = computeBenchAudioIntensity(0, 0);
    expect(idle.active).toBe(false);

    const revving = computeBenchAudioIntensity(72, 0.85);
    const lowRpm = computeBenchAudioIntensity(24, 0.25);
    expect(revving.active).toBe(true);
    expect(revving.intensity).toBeGreaterThan(lowRpm.intensity);

    // Al tocar Parar (power = 0), el audio sigue vivo acompañando la caída de RPM
    const spindown = computeBenchAudioIntensity(35, 0);
    expect(spindown.active).toBe(true);
    expect(spindown.intensity).toBeGreaterThan(0.2);
    expect(spindown.intensity).toBeLessThan(revving.intensity);

    // Al llegar a ~0 RPM se apaga
    const stopped = computeBenchAudioIntensity(0.8, 0);
    expect(stopped.active).toBe(false);
  });

  it('distingue aceleración, frenado, giro, aterrizaje, rodadura, patinada e impacto', () => {
    const dt = 1 / 60;

    // 1. Aceleración limpia en recta -> cabeceo hacia atrás y rodadura sin patinada
    const accel = computeChassisDynamics({
      fwdSpeed: 4.5,
      prevFwdSpeed: 4.35,
      sideSpeed: 0.05,
      vertVel: 0,
      prevVertVel: 0,
      yawRate: 0,
      throttle: 1,
      steer: 0,
      grounded: true,
      wasGrounded: true,
      dt,
    });
    expect(accel.targetPitch).toBeLessThan(0);
    expect(accel.speedNorm).toBeGreaterThan(0.25);
    expect(accel.slipNorm).toBe(0);
    expect(accel.hardImpact).toBe(0);

    // 2. Frenado fuerte -> cabeceo hacia adelante (nariz baja) y patinada
    const brake = computeChassisDynamics({
      fwdSpeed: 6.0,
      prevFwdSpeed: 6.2,
      sideSpeed: 0.1,
      vertVel: 0,
      prevVertVel: 0,
      yawRate: 0,
      throttle: -1,
      steer: 0,
      grounded: true,
      wasGrounded: true,
      dt,
    });
    expect(brake.targetPitch).toBeGreaterThan(0);
    expect(brake.slipNorm).toBeGreaterThan(0.2);

    // 3. Giro con derrape lateral -> balanceo lateral y patinada
    const turnSkid = computeChassisDynamics({
      fwdSpeed: 7.0,
      prevFwdSpeed: 7.0,
      sideSpeed: 2.2,
      vertVel: 0,
      prevVertVel: 0,
      yawRate: 1.5,
      throttle: 0.6,
      steer: 1,
      grounded: true,
      wasGrounded: true,
      dt,
    });
    expect(Math.abs(turnSkid.targetRoll)).toBeGreaterThan(0.02);
    expect(turnSkid.slipNorm).toBeGreaterThan(0.3);

    // 4. Aterrizaje desde una loma -> asentamiento de suspensión + impacto
    const landing = computeChassisDynamics({
      fwdSpeed: 5.5,
      prevFwdSpeed: 5.5,
      sideSpeed: 0,
      vertVel: 0.2,
      prevVertVel: -4.2,
      yawRate: 0,
      throttle: 0.5,
      steer: 0,
      grounded: true,
      wasGrounded: false,
      dt,
    });
    expect(landing.landingImpact).toBeGreaterThan(0.4);
    expect(landing.hardImpact).toBeGreaterThan(0.3);

    // 5. Choque frontal brusco -> impacto alto distinto de rodadura
    const crash = computeChassisDynamics({
      fwdSpeed: 1.0,
      prevFwdSpeed: 7.5,
      sideSpeed: 0,
      vertVel: 0,
      prevVertVel: 0,
      yawRate: 0,
      throttle: 0,
      steer: 0,
      grounded: true,
      wasGrounded: true,
      dt,
    });
    expect(crash.hardImpact).toBeGreaterThan(0.5);
  });
});
