import { afterEach, describe, expect, it } from 'vitest';
import { startRelay } from '../tools/net-relay/relay.ts';
import { createRelayCore, type RelayPeer } from '../tools/net-relay/relayCore.ts';

function fakePeer() {
  const inbox: string[] = [];
  let closed = false;
  const peer: RelayPeer = { send: (d) => inbox.push(d), close: () => (closed = true) };
  return { peer, inbox, json: () => inbox.map((s) => JSON.parse(s)), isClosed: () => closed };
}

describe('núcleo del relay', () => {
  it('reenvía en estrella y cuenta recibidos, reenvíos y bytes', () => {
    const core = createRelayCore(() => 0);
    const host = fakePeer();
    const a = fakePeer();
    const b = fakePeer();
    expect(core.join(host.peer, 'abcd', 'host-1', 'H')).toEqual({ ok: true, isHost: true });
    expect(core.join(a.peer, 'ABCD', 'guest-a', 'A')).toEqual({ ok: true, isHost: false });
    core.join(b.peer, 'ABCD', 'guest-b', 'B');
    [host, a, b].forEach((p) => (p.inbox.length = 0));

    core.message(host.peer, '{"s":1}'); // anfitrión → 2 invitados
    core.message(a.peer, '{"i":1}'); // invitado → solo anfitrión

    expect(a.inbox).toEqual(['{"s":1}']);
    expect(b.inbox).toEqual(['{"s":1}']);
    expect(host.inbox).toEqual(['{"i":1}']);
    const [stats] = core.stats();
    expect(stats.received).toBe(2);
    expect(stats.forwarded).toBe(3);
    expect(stats.bytesIn).toBe(14);
    expect(stats.bytesOut).toBe(21);
  });

  it('cierra la sala con un mensaje claro si sale el anfitrión', () => {
    const core = createRelayCore();
    const host = fakePeer();
    const a = fakePeer();
    core.join(host.peer, 'SALA', 'host-1', 'H');
    core.join(a.peer, 'SALA', 'guest-a', 'A');
    core.leave(host.peer);
    const last = a.json().at(-1);
    expect(last.type).toBe('room-closed');
    expect(last.reason).toMatch(/anfitrión salió/);
    expect(a.isClosed()).toBe(true);
    expect(core.stats()).toHaveLength(0);
  });

  it('limita la sala a 4 jugadores y acepta la reconexión con el mismo id', () => {
    const core = createRelayCore();
    const peers = [0, 1, 2, 3].map(() => fakePeer());
    peers.forEach((p, i) => core.join(p.peer, 'FULL', `player-${i}`, `P${i}`));
    expect(core.join(fakePeer().peer, 'FULL', 'player-9', 'X')).toEqual({ ok: false, reason: 'full' });
    const again = fakePeer();
    expect(core.join(again.peer, 'FULL', 'player-2', 'P2')).toEqual({ ok: true, isHost: false });
    expect(peers[2].isClosed()).toBe(true);
    expect(again.json()[0]).toMatchObject({ type: 'welcome', reconnect: true });
    // La conexión vieja ya no saca al jugador de la sala.
    core.leave(peers[2].peer);
    expect(core.stats()[0].players).toBe(4);
  });

  it('descarta mensajes demasiado grandes', () => {
    const core = createRelayCore();
    const host = fakePeer();
    const a = fakePeer();
    core.join(host.peer, 'BIG1', 'host-1', 'H');
    core.join(a.peer, 'BIG1', 'guest-a', 'A');
    a.inbox.length = 0;
    expect(core.message(host.peer, 'x'.repeat(9000))).toBe(false);
    expect(a.inbox).toHaveLength(0);
  });
});

describe('relay WebSocket', () => {
  let relay: ReturnType<typeof startRelay> | null = null;
  afterEach(() => relay?.close());

  it('conecta clientes WebSocket reales y reenvía mensajes', async () => {
    relay = startRelay(0, () => {});
    await new Promise<void>((r) => relay!.server.once('listening', () => r()));
    const { port } = relay.server.address() as { port: number };
    const open = (id: string) =>
      new Promise<{ ws: WebSocket; got: unknown[] }>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        const got: unknown[] = [];
        ws.onmessage = (e) => got.push(JSON.parse(String(e.data)));
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'join', room: 'WSOK', clientId: id, name: id }));
          resolve({ ws, got });
        };
      });
    const host = await open('host-1');
    await waitFor(() => host.got.length > 0);
    const guest = await open('guest-1');
    await waitFor(() => guest.got.length > 0);
    host.ws.send(JSON.stringify({ t: 'snap', n: 1 }));
    await waitFor(() => guest.got.some((m) => (m as { t?: string }).t === 'snap'));
    host.ws.close();
    await waitFor(() => guest.got.some((m) => (m as { type?: string }).type === 'room-closed'));
    guest.ws.close();
  });
});

async function waitFor(cond: () => boolean, ms = 2000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('tiempo agotado');
    await new Promise((r) => setTimeout(r, 10));
  }
}
