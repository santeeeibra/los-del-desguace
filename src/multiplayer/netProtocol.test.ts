import { describe, expect, it, vi } from 'vitest';
import { multiplayerStore } from './multiplayerStore';
import {
  PLAYER_COLORS,
  assignPlayerColor,
  createBroadcastTransport,
  decodeNetMessage,
  encodeNetMessage,
  type WorldSnapshot,
} from './netProtocol';

describe('multiplayer protocol & store', () => {
  it('asigna colores únicos hasta 6 jugadores y serializa mensajes de red', () => {
    const colors = new Set(Array.from({ length: 6 }, (_, i) => assignPlayerColor(i)));
    expect(colors.size).toBe(PLAYER_COLORS.length);

    const encoded = encodeNetMessage({
      type: 'input',
      packet: {
        playerId: 'p_1',
        seq: 42,
        moveX: 0.5,
        moveZ: -1,
        yaw: 1.2,
        jump: false,
        run: true,
      },
    });
    const decoded = decodeNetMessage(encoded);
    expect(decoded?.type).toBe('input');
    if (decoded?.type === 'input') {
      expect(decoded.packet.seq).toBe(42);
      expect(decoded.packet.run).toBe(true);
    }
  });

  it('crea y cierra salas como host', () => {
    multiplayerStore.hostRoom('test-sala', 'Santi');
    const st = multiplayerStore.getState();
    expect(st.role).toBe('host');
    expect(st.roomCode).toBe('TEST-SALA');
    expect(Object.keys(st.players)).toHaveLength(1);

    multiplayerStore.leaveRoom();
    expect(multiplayerStore.getState().role).toBe('offline');
    expect(Object.keys(multiplayerStore.getState().players)).toHaveLength(0);
  });

  it('retransmite la posición del invitado a otra pestaña', async () => {
    const code = 'TEST-AVATARES';
    const peer = createBroadcastTransport(code);
    let snapshot: WorldSnapshot | undefined;
    peer.subscribe((msg) => { if (msg.type === 'snapshot') snapshot = msg.snapshot; });
    try {
      multiplayerStore.hostRoom(code, 'Anfitrión');
      peer.send({ type: 'join', playerId: 'p_guest', name: 'Invitado' });
      peer.send({ type: 'pose', playerId: 'p_guest', pose: {
        pos: [3, 1, 7], yaw: 1, speed: 2, isOnGround: true, isCarrying: false, seatedId: null,
      } });
      await vi.waitFor(() => expect(multiplayerStore.getState().players.p_guest?.pos).toEqual([3, 1, 7]));
      multiplayerStore.sendLocalPose({
        pos: [0, 1, 5], yaw: 0, speed: 0, isOnGround: true, isCarrying: false, seatedId: null,
      }, 'sandbox');
      await vi.waitFor(() => expect(snapshot?.players.find((player) => player.id === 'p_guest')?.pos).toEqual([3, 1, 7]));
    } finally {
      multiplayerStore.leaveRoom();
      peer.close();
    }
  });
});
