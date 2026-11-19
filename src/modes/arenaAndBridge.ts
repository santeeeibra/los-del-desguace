import { useSyncExternalStore } from 'react';
import { playHornSfx, playSpark, playSuccessChime } from '../audio/sfxEngine';

export const ROBOT_ARENA_CENTER = [15, 0, -11] as const;
export const ROBOT_ARENA_RADIUS = 7.2;

export const BRIDGE_START_POS = [-12, 0.85, 22] as const;
export const BRIDGE_GOAL_POS = [-12, 1.0, 37] as const;
export const BRIDGE_SPAN_Z_MIN = 24;
export const BRIDGE_SPAN_Z_MAX = 34;

export interface RivalRobotState {
  id: string;
  knockedOut: boolean;
}

export interface AerialDroneState {
  id: string;
  destroyed: boolean;
  angle: number;
  radius: number;
  altitude: number;
  speed: number;
}

export interface ArenaAndBridgeState {
  robotsKnockedOut: number;
  totalRobots: number;
  dronesDestroyed: number;
  totalDrones: number;
  bridgeIntegrity: number; // 0..100%
  bridgeCollapsed: boolean;
  robots: readonly RivalRobotState[];
  drones: readonly AerialDroneState[];
}

function createInitialDrones(): AerialDroneState[] {
  return [
    { id: 'drone-1', destroyed: false, angle: 0, radius: 7.5, altitude: 7.8, speed: 0.55 },
    { id: 'drone-2', destroyed: false, angle: (Math.PI * 2) / 3, radius: 9.2, altitude: 9.0, speed: -0.48 },
    { id: 'drone-3', destroyed: false, angle: (Math.PI * 4) / 3, radius: 6.4, altitude: 10.2, speed: 0.62 },
  ];
}

function createInitialRobots(): RivalRobotState[] {
  return [
    { id: 'rival-bot-1', knockedOut: false },
    { id: 'rival-bot-2', knockedOut: false },
  ];
}

let state: ArenaAndBridgeState = {
  robotsKnockedOut: 0,
  totalRobots: 2,
  dronesDestroyed: 0,
  totalDrones: 3,
  bridgeIntegrity: 100,
  bridgeCollapsed: false,
  robots: createInitialRobots(),
  drones: createInitialDrones(),
};

const listeners = new Set<() => void>();
let resetNonce = 0;
let bridgeIntegrity = 100;

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function getDroneWorldPosition(drone: AerialDroneState): [number, number, number] {
  const cx = 9.5;
  const cz = 20.0;
  return [
    cx + Math.cos(drone.angle) * drone.radius,
    drone.altitude + Math.sin(drone.angle * 2) * 0.55,
    cz + Math.sin(drone.angle) * drone.radius,
  ];
}

export function isOutsideRobotArena(x: number, y: number, z: number): boolean {
  const dx = x - ROBOT_ARENA_CENTER[0];
  const dz = z - ROBOT_ARENA_CENTER[2];
  return Math.hypot(dx, dz) > ROBOT_ARENA_RADIUS + 0.9 || y < -0.5;
}

export const arenaAndBridgeStore = {
  getState(): ArenaAndBridgeState {
    return state;
  },

  getResetNonce(): number {
    return resetNonce;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  reset(): void {
    resetNonce += 1;
    bridgeIntegrity = 100;
    state = {
      robotsKnockedOut: 0,
      totalRobots: 2,
      dronesDestroyed: 0,
      totalDrones: 3,
      bridgeIntegrity: 100,
      bridgeCollapsed: false,
      robots: createInitialRobots(),
      drones: createInitialDrones(),
    };
    emit();
  },

  markRobotKnockedOut(id: string): boolean {
    const target = state.robots.find((bot) => bot.id === id);
    if (!target || target.knockedOut) return false;
    const robots = state.robots.map((bot) => (bot.id === id ? { ...bot, knockedOut: true } : bot));
    const robotsKnockedOut = robots.filter((bot) => bot.knockedOut).length;
    state = { ...state, robots, robotsKnockedOut };
    playSpark();
    if (robotsKnockedOut >= state.totalRobots) playSuccessChime();
    emit();
    return true;
  },

  destroyDrone(id: string): boolean {
    const target = state.drones.find((drone) => drone.id === id);
    if (!target || target.destroyed) return false;
    const drones = state.drones.map((drone) => (drone.id === id ? { ...drone, destroyed: true } : drone));
    const dronesDestroyed = drones.filter((drone) => drone.destroyed).length;
    state = { ...state, drones, dronesDestroyed };
    playHornSfx();
    playSpark();
    if (dronesDestroyed >= state.totalDrones) playSuccessChime();
    emit();
    return true;
  },

  stepDrones(dt: number, attackerPos: { x: number; y: number; z: number } | null): void {
    let changed = false;
    const drones = state.drones.map((drone) => {
      if (drone.destroyed) return drone;
      const nextAngle = drone.angle + drone.speed * dt;
      const updated = { ...drone, angle: nextAngle };
      if (attackerPos) {
        const [dx, dy, dz] = getDroneWorldPosition(updated);
        const distSq =
          (dx - attackerPos.x) * (dx - attackerPos.x) +
          (dy - attackerPos.y) * (dy - attackerPos.y) +
          (dz - attackerPos.z) * (dz - attackerPos.z);
        if (distSq <= 2.35 * 2.35) {
          changed = true;
          playHornSfx();
          playSpark();
          return { ...updated, destroyed: true };
        }
      }
      return updated;
    });
    const dronesDestroyed = drones.filter((drone) => drone.destroyed).length;
    if (changed && dronesDestroyed >= state.totalDrones) playSuccessChime();
    state = { ...state, drones, dronesDestroyed };
    if (changed) emit();
  },

  updateBridgeStress(loadFactor: number, dt: number): void {
    if (state.bridgeCollapsed) return;
    // loadFactor > 1 significa sobrecarga en el puente; <= 0.7 permite recuperar estabilidad
    if (loadFactor > 0.85) {
      bridgeIntegrity = Math.max(0, bridgeIntegrity - (loadFactor - 0.65) * 24 * dt);
    } else if (bridgeIntegrity < 100) {
      bridgeIntegrity = Math.min(100, bridgeIntegrity + 12 * dt);
    }
    const collapsed = bridgeIntegrity <= 0.5;
    const displayedIntegrity = Math.round(bridgeIntegrity);
    if (displayedIntegrity !== state.bridgeIntegrity || collapsed !== state.bridgeCollapsed) {
      state = {
        ...state,
        bridgeIntegrity: displayedIntegrity,
        bridgeCollapsed: collapsed,
      };
      if (collapsed) playSpark();
      emit();
    }
  },
};

export function useArenaAndBridgeState(): ArenaAndBridgeState {
  return useSyncExternalStore(arenaAndBridgeStore.subscribe, arenaAndBridgeStore.getState);
}
