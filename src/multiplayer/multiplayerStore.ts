import { useSyncExternalStore } from 'react';
import {
  assignPlayerColor,
  createBroadcastTransport,
  MAX_MULTIPLAYER_PLAYERS,
  type NetMessage,
  type NetTransport,
  type PlayerSnapshot,
  type PlayerPose,
  type WorldSnapshot,
} from './netProtocol';

export type MultiplayerRole = 'offline' | 'host' | 'client';

export interface MultiplayerState {
  role: MultiplayerRole;
  roomCode: string;
  localPlayerId: string;
  localName: string;
  players: Record<string, PlayerSnapshot>;
  lastSnapshotTick: number;
}

function makePlayerId(): string {
  return `p_${Math.random().toString(36).slice(2, 8)}`;
}

let state: MultiplayerState = {
  role: 'offline',
  roomCode: 'YUNKE-1',
  localPlayerId: makePlayerId(),
  localName: 'Chispa',
  players: {},
  lastSnapshotTick: 0,
};

let transport: NetTransport | null = null;
let unsubscribeTransport: (() => void) | null = null;
let lastJoinRetry = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

function keepAppearanceReference(
  next: PlayerSnapshot['characterConfig'],
  previous: PlayerSnapshot['characterConfig'],
) {
  if (!next || !previous) return next ?? previous;
  const keys = Object.keys(previous) as Array<keyof NonNullable<PlayerSnapshot['characterConfig']>>;
  return keys.length === Object.keys(next).length && keys.every((key) => next[key] === previous[key]) ? previous : next;
}

function handleNetMessage(msg: NetMessage) {
  if (msg.type === 'join' && state.role === 'host') {
    const count = Object.keys(state.players).length;
    if (count >= MAX_MULTIPLAYER_PLAYERS || state.players[msg.playerId]) return;
    const color = Array.from({ length: MAX_MULTIPLAYER_PLAYERS }, (_, index) => assignPlayerColor(index))
      .find((candidate) => !Object.values(state.players).some((player) => player.colorHex === candidate))!;
    const joined: PlayerSnapshot = {
      id: msg.playerId,
      name: msg.name,
      colorHex: color,
      pos: [0, 1.2, 4 + count * 0.8],
      yaw: 0,
      speed: 0,
      isOnGround: true,
      isCarrying: false,
      seatedId: null,
    };
    state = { ...state, players: { ...state.players, [msg.playerId]: joined } };
    emit();
  } else if (msg.type === 'pose' && state.role === 'host') {
    const player = state.players[msg.playerId];
    if (!player || player.id === state.localPlayerId || !Array.isArray(msg.pose?.pos) || !msg.pose.pos.every(Number.isFinite) ||
        msg.pose.pos.length !== 3 || !Number.isFinite(msg.pose.yaw) || !Number.isFinite(msg.pose.speed)) return;
    const { pos, yaw, speed, isOnGround, isCarrying, seatedId, emote, characterConfig } = msg.pose;
    state = { ...state, players: { ...state.players, [msg.playerId]: {
      ...player,
      pos,
      yaw,
      speed,
      isOnGround,
      isCarrying,
      seatedId,
      emote: emote ?? null,
      characterConfig: keepAppearanceReference(characterConfig, player.characterConfig),
    } } };
    emit();
  } else if (msg.type === 'leave') {
    if (!state.players[msg.playerId]) return;
    const next = { ...state.players };
    delete next[msg.playerId];
    state = { ...state, players: next };
    emit();
  } else if (msg.type === 'snapshot' && state.role === 'client') {
    if (!Array.isArray(msg.snapshot?.players) || !Number.isFinite(msg.snapshot.tick)) return;
    const nextPlayers: Record<string, PlayerSnapshot> = {};
    for (const p of msg.snapshot.players) {
      if (!p || typeof p.id !== 'string' || !Array.isArray(p.pos) || p.pos.length !== 3 || !p.pos.every(Number.isFinite)) return;
      nextPlayers[p.id] = { ...p, characterConfig: keepAppearanceReference(p.characterConfig, state.players[p.id]?.characterConfig) };
    }
    state = {
      ...state,
      players: nextPlayers,
      lastSnapshotTick: msg.snapshot.tick,
    };
    emit();
  }
}

export const multiplayerStore = {
  getState: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  hostRoom(roomCode = 'YUNKE-1', name = 'Host') {
    this.leaveRoom();
    const cleanCode = roomCode.trim().toUpperCase() || 'YUNKE-1';
    transport = createBroadcastTransport(cleanCode);
    unsubscribeTransport = transport.subscribe(handleNetMessage);
    const selfSnap: PlayerSnapshot = {
      id: state.localPlayerId,
      name,
      colorHex: assignPlayerColor(0),
      pos: [0, 1.2, 4],
      yaw: 0,
      speed: 0,
      isOnGround: true,
      isCarrying: false,
      seatedId: null,
    };
    state = {
      ...state,
      role: 'host',
      roomCode: cleanCode,
      localName: name,
      players: { [state.localPlayerId]: selfSnap },
    };
    emit();
  },
  joinRoom(roomCode = 'YUNKE-1', name = 'Invitado') {
    this.leaveRoom();
    const cleanCode = roomCode.trim().toUpperCase() || 'YUNKE-1';
    transport = createBroadcastTransport(cleanCode);
    unsubscribeTransport = transport.subscribe(handleNetMessage);
    state = {
      ...state,
      role: 'client',
      roomCode: cleanCode,
      localName: name,
      players: {},
    };
    transport.send({ type: 'join', playerId: state.localPlayerId, name });
    emit();
  },
  broadcastSnapshot(snapshot: WorldSnapshot) {
    if (state.role !== 'host' || !transport) return;
    transport.send({ type: 'snapshot', snapshot });
  },
  sendLocalPose(pose: PlayerPose, mode: WorldSnapshot['mode']) {
    if (state.role === 'client' && transport) {
      if (!state.players[state.localPlayerId] && Date.now() - lastJoinRetry > 1000) {
        lastJoinRetry = Date.now();
        transport.send({ type: 'join', playerId: state.localPlayerId, name: state.localName });
      }
      transport.send({ type: 'pose', playerId: state.localPlayerId, pose });
      return;
    }
    if (state.role !== 'host') return;
    const player = state.players[state.localPlayerId];
    const nextTick = state.lastSnapshotTick + 1;
    const players = { ...state.players, [state.localPlayerId]: { ...player, ...pose } };
    state = { ...state, players, lastSnapshotTick: nextTick };
    this.broadcastSnapshot({ tick: nextTick, mode, players: Object.values(players), bodies: [], wireSignals: [] });
    emit();
  },
  leaveRoom() {
    if (transport) {
      transport.send({ type: 'leave', playerId: state.localPlayerId });
      unsubscribeTransport?.();
      transport.close();
    }
    transport = null;
    unsubscribeTransport = null;
    state = { ...state, role: 'offline', players: {}, lastSnapshotTick: 0 };
    emit();
  },
};

export function useMultiplayerStore(): MultiplayerState {
  return useSyncExternalStore(multiplayerStore.subscribe, multiplayerStore.getState);
}
