/**
 * Núcleo del relay de la prueba de red (sin dependencias, sin E/S).
 *
 * Topología en estrella: el primer jugador de una sala es el anfitrión y
 * simula la física. Los mensajes de un invitado van solo al anfitrión; los del
 * anfitrión van a todos los invitados. El relay no interpreta el juego: solo
 * reenvía y cuenta mensajes y bytes para estimar costos.
 *
 * Está separado del transporte (relay.ts) para poder montarlo después sobre
 * otro servicio (por ejemplo un Durable Object) sin reescribir la lógica.
 */

export const MAX_ROOM_PLAYERS = 4;

export interface RelayPeer {
  /** Envía un texto ya serializado al cliente. */
  send(data: string): void;
  /** Cierra la conexión del cliente. */
  close(): void;
}

export interface RoomStats {
  /** Mensajes recibidos por el relay (lo que un servicio cobra como entrantes). */
  received: number;
  /** Copias enviadas por el relay (un mensaje del anfitrión se reenvía a cada invitado). */
  forwarded: number;
  bytesIn: number;
  bytesOut: number;
  startedAt: number;
}

interface Member {
  id: string;
  name: string;
  peer: RelayPeer;
}

interface Room {
  code: string;
  hostId: string;
  members: Map<string, Member>;
  stats: RoomStats;
}

export type JoinResult =
  | { ok: true; isHost: boolean }
  | { ok: false; reason: 'full' | 'bad-request' };

const CODE_RE = /^[A-Z0-9]{3,8}$/;
const ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
/** Tope por mensaje: un snapshot de la prueba ocupa ~0,3 kB. */
export const MAX_MESSAGE_BYTES = 8 * 1024;

export function createRelayCore(now: () => number = Date.now) {
  const rooms = new Map<string, Room>();
  const peerRoom = new Map<RelayPeer, { room: Room; id: string }>();

  function sendRaw(room: Room, member: Member, data: string) {
    member.peer.send(data);
    room.stats.forwarded++;
    room.stats.bytesOut += byteLength(data);
  }

  function sendControl(member: Member, payload: object) {
    member.peer.send(JSON.stringify(payload));
  }

  function closeRoom(room: Room, reason: string) {
    for (const m of room.members.values()) {
      sendControl(m, { type: 'room-closed', reason });
      peerRoom.delete(m.peer);
      m.peer.close();
    }
    room.members.clear();
    rooms.delete(room.code);
  }

  return {
    join(peer: RelayPeer, roomCode: string, clientId: string, name: string): JoinResult {
      const code = String(roomCode).toUpperCase();
      if (!CODE_RE.test(code) || !ID_RE.test(clientId)) return { ok: false, reason: 'bad-request' };
      let room = rooms.get(code);
      if (!room) {
        room = {
          code,
          hostId: clientId,
          members: new Map(),
          stats: { received: 0, forwarded: 0, bytesIn: 0, bytesOut: 0, startedAt: now() },
        };
        rooms.set(code, room);
      }
      const previous = room.members.get(clientId);
      if (!previous && room.members.size >= MAX_ROOM_PLAYERS) return { ok: false, reason: 'full' };
      // Reconexión con el mismo id: reemplaza la conexión vieja sin avisar salida.
      if (previous) {
        peerRoom.delete(previous.peer);
        previous.peer.close();
      }
      const member: Member = { id: clientId, name: String(name).slice(0, 24), peer };
      room.members.set(clientId, member);
      peerRoom.set(peer, { room, id: clientId });
      const isHost = room.hostId === clientId;
      sendControl(member, {
        type: 'welcome',
        you: clientId,
        hostId: room.hostId,
        reconnect: Boolean(previous),
        players: [...room.members.values()].map((m) => ({ id: m.id, name: m.name })),
      });
      for (const m of room.members.values()) {
        if (m.id !== clientId) sendControl(m, { type: 'peer-joined', id: clientId, name: member.name, reconnect: Boolean(previous) });
      }
      return { ok: true, isHost };
    },

    /** Reenvía un mensaje de juego. Devuelve false si se descartó. */
    message(peer: RelayPeer, data: string): boolean {
      const entry = peerRoom.get(peer);
      if (!entry) return false;
      const { room, id } = entry;
      const size = byteLength(data);
      room.stats.received++;
      room.stats.bytesIn += size;
      if (size > MAX_MESSAGE_BYTES) return false;
      if (id === room.hostId) {
        for (const m of room.members.values()) if (m.id !== id) sendRaw(room, m, data);
      } else {
        const host = room.members.get(room.hostId);
        if (host) sendRaw(room, host, data);
      }
      return true;
    },

    leave(peer: RelayPeer) {
      const entry = peerRoom.get(peer);
      if (!entry) return;
      peerRoom.delete(peer);
      const { room, id } = entry;
      if (room.members.get(id)?.peer !== peer) return;
      if (id === room.hostId) {
        closeRoom(room, 'El anfitrión salió. La ronda terminó.');
        return;
      }
      room.members.delete(id);
      for (const m of room.members.values()) sendControl(m, { type: 'peer-left', id });
      if (room.members.size === 0) rooms.delete(room.code);
    },

    /** Envía las estadísticas de cada sala a sus miembros. */
    broadcastStats() {
      for (const room of rooms.values()) {
        const payload = { type: 'relay-stats', ...statsSummary(room.stats, now()), players: room.members.size };
        for (const m of room.members.values()) sendControl(m, payload);
      }
    },

    stats() {
      return [...rooms.values()].map((r) => ({ code: r.code, players: r.members.size, ...statsSummary(r.stats, now()) }));
    },
  };
}

export function statsSummary(s: RoomStats, nowMs: number) {
  const seconds = Math.max(0.001, (nowMs - s.startedAt) / 1000);
  return {
    seconds: Math.round(seconds),
    received: s.received,
    forwarded: s.forwarded,
    bytesIn: s.bytesIn,
    bytesOut: s.bytesOut,
    receivedPerSec: round1(s.received / seconds),
    forwardedPerSec: round1(s.forwarded / seconds),
    avgBytesIn: s.received ? Math.round(s.bytesIn / s.received) : 0,
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function byteLength(s: string) {
  return new TextEncoder().encode(s).length;
}
