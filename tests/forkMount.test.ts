import { describe, expect, it } from 'vitest';
import {
  cutFromEdge,
  forkGap,
  forkGapWidth,
  forkNotchAt,
  PLATFORM_TEMPLATES,
  rasterize,
  steerClearance,
  WHEEL_HALF_WIDTH,
} from '../src/invention/platformShape';
import { forkPivotFor, isForkMount, steerLimitsOnPlatform, wheelFootprintFromPose } from '../src/invention/platformRules';

const rect = () => rasterize(PLATFORM_TEMPLATES.rect.points);

describe('Horquilla de triciclo', () => {
  it('la muesca de horquilla se corta desde el borde sin partir la chapa', () => {
    const grid = rect();
    const cut = cutFromEdge(grid, forkNotchAt(grid, 'front'));
    expect(cut.error).toBeNull();
    expect(cut.removed.length).toBeGreaterThan(0);
  });

  it('detecta el hueco entre dos brazos y lo centra', () => {
    const grid = rect();
    const cut = cutFromEdge(grid, forkNotchAt(grid, 'front'));
    const gap = forkGap(cut.grid, 0.12, 0.6);
    expect(gap).not.toBeNull();
    expect(Math.abs(gap!.centerX)).toBeLessThan(0.05);
    expect(gap!.width).toBeGreaterThan(2 * WHEEL_HALF_WIDTH);
    expect(Math.abs(gap!.width - forkGapWidth())).toBeLessThan(0.1);
  });

  it('sin brazos a los dos lados no hay horquilla', () => {
    const grid = rect();
    expect(forkGap(grid, 0, 0.95)).toBeNull();
    const cut = cutFromEdge(grid, forkNotchAt(grid, 'front'));
    expect(forkGap(cut.grid, 0, 0.95)).toBeNull();
  });

  it('un hueco más angosto que la rueda más la holgura no sirve', () => {
    const grid = rect();
    const cut = cutFromEdge(grid, [
      { x: -0.1, z: 0.8 }, { x: -0.1, z: 0.3 }, { x: 0.1, z: 0.3 }, { x: 0.1, z: 0.8 },
    ]);
    expect(cut.error).toBeNull();
    expect(forkGap(cut.grid, 0, 0.5)).toBeNull();
  });

  it('en horquilla la mangueta gira sobre el centro de la rueda y deja recorrido libre', () => {
    const grid = rect();
    const cut = cutFromEdge(grid, forkNotchAt(grid, 'front'));
    const pose = { position: { x: 0, y: 0, z: 0.5 }, axis: { x: 1, y: 0, z: 0 } };
    expect(isForkMount(cut.grid, pose)).toBe(true);
    expect(forkPivotFor(cut.grid, pose)).toEqual(pose.position);
    const footprint = wheelFootprintFromPose(pose, cut.grid);
    expect(footprint.px).toBe(0);
    expect(footprint.pz).toBe(0.5);
    const limits = steerLimitsOnPlatform(cut.grid, pose);
    expect(limits.max).toBeGreaterThan(0.2);
    expect(limits.min).toBeLessThan(-0.2);
    // Con el pivote en el borde (sin horquilla) el mismo hueco deja menos recorrido simétrico.
    expect(steerClearance(cut.grid, { x: 0, z: 0.5, y: 0, axleYaw: 0 }).max).toBeGreaterThanOrEqual(limits.max - 1e-6);
  });

  it('una rueda soldada al costado de una chapa llena no es horquilla', () => {
    const grid = rect();
    const pose = { position: { x: 0.62, y: 0, z: 0.4 }, axis: { x: 1, y: 0, z: 0 } };
    expect(isForkMount(grid, pose)).toBe(false);
    expect(forkPivotFor(grid, pose)).toBeNull();
  });
});
