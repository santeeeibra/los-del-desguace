/**
 * Relay WebSocket local para la prueba de red (Node 22+, sin dependencias).
 *
 *   node tools/net-relay/relay.ts            # puerto 8787
 *   PORT=9000 node tools/net-relay/relay.ts
 *
 * Implementa el mínimo de RFC 6455 que usan los navegadores: handshake, marcos
 * de texto (sin fragmentar), ping/pong y cierre. GET /stats devuelve las
 * estadísticas de cada sala en JSON.
 */
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { Socket } from 'node:net';
import { createRelayCore, type RelayPeer } from './relayCore.ts';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
/** Si un cliente no responde pings en este tiempo, se lo da por desconectado. */
const DEAD_AFTER_MS = 5000;
const PING_EVERY_MS = 1500;
const STATS_EVERY_MS = 5000;

export function startRelay(port: number, log: (msg: string) => void = console.log) {
  const core = createRelayCore();
  const sockets = new Set<{ socket: Socket; peer: RelayPeer; lastSeen: number }>();

  const server: Server = createServer((req, res) => {
    if (req.url === '/stats') {
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify(core.stats(), null, 2));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Relay de la prueba de red de Los del Desguace. Ver /stats.\n');
  });

  server.on('upgrade', (req, socket: Socket) => {
    const key = req.headers['sec-websocket-key'];
    if (typeof key !== 'string') {
      socket.destroy();
      return;
    }
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    socket.setNoDelay(true);

    let closed = false;
    const peer: RelayPeer = {
      send: (data) => {
        if (!closed) socket.write(encodeFrame(0x1, Buffer.from(data)));
      },
      close: () => {
        if (closed) return;
        closed = true;
        socket.end(encodeFrame(0x8, Buffer.alloc(0)));
      },
    };
    const entry = { socket, peer, lastSeen: Date.now() };
    sockets.add(entry);
    let joined = false;
    let buffer = Buffer.alloc(0);

    const finish = () => {
      if (!sockets.has(entry)) return;
      sockets.delete(entry);
      closed = true;
      core.leave(peer);
    };

    socket.on('data', (chunk) => {
      entry.lastSeen = Date.now();
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const frame = decodeFrame(buffer);
        if (!frame) break;
        buffer = buffer.subarray(frame.length);
        if (frame.opcode === 0x8) {
          peer.close();
          finish();
          return;
        }
        if (frame.opcode === 0x9) {
          socket.write(encodeFrame(0xa, frame.payload));
          continue;
        }
        if (frame.opcode !== 0x1) continue;
        const text = frame.payload.toString('utf8');
        if (!joined) {
          try {
            const msg = JSON.parse(text);
            if (msg?.type !== 'join') throw new Error('se esperaba join');
            const result = core.join(peer, msg.room, msg.clientId, msg.name ?? '');
            if (!result.ok) {
              peer.send(JSON.stringify({ type: 'join-refused', reason: result.reason }));
              peer.close();
              finish();
              return;
            }
            joined = true;
            log(`sala ${String(msg.room).toUpperCase()}: entra ${msg.clientId}${result.isHost ? ' (anfitrión)' : ''}`);
          } catch {
            peer.close();
            finish();
            return;
          }
          continue;
        }
        core.message(peer, text);
      }
    });
    socket.on('close', finish);
    socket.on('error', finish);
  });

  const ping = setInterval(() => {
    const t = Date.now();
    for (const entry of sockets) {
      if (t - entry.lastSeen > DEAD_AFTER_MS) {
        entry.socket.destroy();
        continue;
      }
      entry.socket.write(encodeFrame(0x9, Buffer.alloc(0)));
    }
  }, PING_EVERY_MS);
  const stats = setInterval(() => core.broadcastStats(), STATS_EVERY_MS);

  server.listen(port, () => log(`Relay escuchando en ws://0.0.0.0:${port} (estadísticas en /stats)`));
  return {
    server,
    close() {
      clearInterval(ping);
      clearInterval(stats);
      for (const e of sockets) e.socket.destroy();
      server.close();
    },
  };
}

function encodeFrame(opcode: number, payload: Buffer) {
  const len = payload.length;
  const header = len < 126 ? Buffer.alloc(2) : len < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
  header[0] = 0x80 | opcode;
  if (len < 126) header[1] = len;
  else if (len < 65536) {
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function decodeFrame(buf: Buffer): { opcode: number; payload: Buffer; length: number } | null {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }
  const maskLen = masked ? 4 : 0;
  if (buf.length < offset + maskLen + len) return null;
  const payload = Buffer.from(buf.subarray(offset + maskLen, offset + maskLen + len));
  if (masked) {
    const mask = buf.subarray(offset, offset + 4);
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
  }
  return { opcode, payload, length: offset + maskLen + len };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startRelay(Number(process.env.PORT ?? 8787));
}
