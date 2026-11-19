import type { CharacterCustomizationConfig, EmoteId } from '../character/characterCustomization';
import type { GameModeId } from '../modes/gameModes';

export const MAX_MULTIPLAYER_PLAYERS = 6;

export const PLAYER_COLORS = [
  '#356096', // Azul taller (Host / P1)
  '#e2a82e', // Mostaza (P2)
  '#3e8c84', // Teal (P3)
  '#c84b36', // Terracota (P4)
  '#7de3f4', // Celeste (P5)
  '#86d9af', // Menta (P6)
] as const;

export interface PlayerInputPacket {
  playerId: string;
  seq: number;
  moveX: number;
  moveZ: number;
  yaw: number;
  jump: boolean;
  run: boolean;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  colorHex: string;
  pos: readonly [number, number, number];
  yaw: number;
  speed: number;
  isOnGround: boolean;
  isCarrying: boolean;
  seatedId: string | null;
  emote?: EmoteId | null;
  characterConfig?: CharacterCustomizationConfig;
}

export type PlayerPose = Pick<
  PlayerSnapshot,
  'pos' | 'yaw' | 'speed' | 'isOnGround' | 'isCarrying' | 'seatedId' | 'emote' | 'characterConfig'
>;

export interface BodySnapshot {
  id: string;
  pos: readonly [number, number, number];
  quat: readonly [number, number, number, number];
}

export interface WorldSnapshot {
  tick: number;
  mode: GameModeId;
  players: PlayerSnapshot[];
  bodies: BodySnapshot[];
  wireSignals: Array<readonly [string, number]>;
}

export type NetMessage =
  | { type: 'join'; playerId: string; name: string }
  | { type: 'leave'; playerId: string }
  | { type: 'input'; packet: PlayerInputPacket }
  | { type: 'pose'; playerId: string; pose: PlayerPose }
  | { type: 'snapshot'; snapshot: WorldSnapshot };

export interface NetTransport {
  send: (msg: NetMessage) => void;
  subscribe: (handler: (msg: NetMessage) => void) => () => void;
  close: () => void;
}

export function assignPlayerColor(index: number): string {
  const safe = Math.abs(index) % PLAYER_COLORS.length;
  return PLAYER_COLORS[safe];
}

export function encodeNetMessage(msg: NetMessage): string {
  return JSON.stringify(msg);
}

export function decodeNetMessage(raw: string): NetMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') return null;
    return parsed as NetMessage;
  } catch {
    return null;
  }
}

/**
 * Transporte local multi-pestaña vía BroadcastChannel para probar 2–6 jugadores en el mismo navegador
 * sin necesitar servidor externo.
 */
export function createBroadcastTransport(roomCode: string): NetTransport {
  const channelName = `los-del-desguace.room.${roomCode}`;
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null;
  const listeners = new Set<(msg: NetMessage) => void>();

  if (bc) {
    bc.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      const msg = decodeNetMessage(event.data);
      if (msg) listeners.forEach((fn) => fn(msg));
    };
  }

  return {
    send(msg) {
      bc?.postMessage(encodeNetMessage(msg));
    },
    subscribe(handler) {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
    close() {
      listeners.clear();
      bc?.close();
    },
  };
}

/**
 * Transporte WebSocket para jugar online contra un relay/host remoto.
 */
export function createWebSocketTransport(url: string): NetTransport {
  const ws = new WebSocket(url);
  const listeners = new Set<(msg: NetMessage) => void>();
  const queue: string[] = [];

  ws.addEventListener('open', () => {
    while (queue.length > 0 && ws.readyState === WebSocket.OPEN) {
      ws.send(queue.shift()!);
    }
  });
  ws.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return;
    const msg = decodeNetMessage(event.data);
    if (msg) listeners.forEach((fn) => fn(msg));
  });

  return {
    send(msg) {
      const encoded = encodeNetMessage(msg);
      if (ws.readyState === WebSocket.OPEN) ws.send(encoded);
      else queue.push(encoded);
    },
    subscribe(handler) {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
    close() {
      listeners.clear();
      ws.close();
    },
  };
}
