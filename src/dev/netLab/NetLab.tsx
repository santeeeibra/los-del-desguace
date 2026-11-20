import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { GuestMetrics, INTERP_DELAY_MS, SNAPSHOT_HZ, SnapshotBuffer, evaluate, type Snapshot, type Vec3 } from './netLabCore';

/**
 * Prueba mínima de red (SOLO desarrollo, `?lab=net`). No es el juego.
 * El anfitrión simula una caja con Rapier; todos mueven su avatar y pueden
 * empujar o agarrar la caja. Ver tools/net-relay/README.md.
 */

type Msg = Record<string, unknown> & { t?: string; type?: string };

const ARENA = 5;
const BOX = 0.6;
const PLAYER_R = 0.35;
const MOVE_SPEED = 3.2;
const GRAB_RANGE = 1.6;
const COLORS = ['#356096', '#e2a82e', '#3e8c84', '#c84b36'];

function params() {
  const q = new URLSearchParams(location.search);
  const room = (q.get('room') ?? 'PRUEBA').toUpperCase();
  const relay = q.get('relay') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8787`;
  const network = q.get('net') === 'online' ? 'online' : 'lan';
  let clientId = '';
  try {
    clientId = sessionStorage.getItem('netlab.id') ?? '';
    if (!clientId) {
      clientId = `p-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem('netlab.id', clientId);
    }
  } catch {
    clientId = `p-${Math.random().toString(36).slice(2, 10)}`;
  }
  return { room, relay, network: network as 'lan' | 'online', clientId, name: q.get('name') ?? clientId.slice(2, 6) };
}

/** Estado compartido entre la UI y el bucle de render (refs mutables, sin re-render por cuadro). */
interface LabState {
  me: { x: number; z: number; yaw: number };
  input: { x: number; z: number };
  players: Map<string, [number, number, number]>;
  playerOrder: string[];
  isHost: boolean;
  hostId: string;
  clockOffset: number; // horaAnfitrión ≈ horaLocal + offset
  buffer: SnapshotBuffer;
  metrics: GuestMetrics;
  owner: string | null;
  hostBox: { p: Vec3; q: [number, number, number, number]; v: number } | null;
  wantGrab: boolean | null;
  boxDistance: number;
}

export function NetLab() {
  const cfg = useMemo(params, []);
  const state = useRef<LabState>({
    me: { x: (Math.random() - 0.5) * 4, z: 2.5, yaw: Math.PI },
    input: { x: 0, z: 0 },
    players: new Map(),
    playerOrder: [],
    isHost: false,
    hostId: '',
    clockOffset: 0,
    buffer: new SnapshotBuffer(),
    metrics: new GuestMetrics(),
    owner: null,
    hostBox: null,
    wantGrab: null,
    boxDistance: 0,
  }).current;
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState('Conectando…');
  const [closedReason, setClosedReason] = useState<string | null>(null);
  const [relayStats, setRelayStats] = useState<Msg | null>(null);
  const [hud, setHud] = useState({ summary: state.metrics.summary(0), owner: null as string | null, players: 0, dist: 0 });
  const [conflict, setConflict] = useState<string>('');
  const disconnectAt = useRef(0);
  const ownerReports = useRef<Map<string, string | null>>(new Map());
  const hostSim = useRef<HostSim | null>(null);

  const send = (m: Msg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  };

  const connect = () => {
    const ws = new WebSocket(cfg.relay);
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'join', room: cfg.room, clientId: cfg.clientId, name: cfg.name }));
    ws.onclose = () => {
      if (wsRef.current === ws) setStatus((s) => (s.startsWith('Sala cerrada') ? s : 'Desconectado'));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as Msg;
      handle(msg);
    };
  };

  const handle = (msg: Msg) => {
    const now = performance.now();
    switch (msg.type) {
      case 'welcome': {
        state.hostId = String(msg.hostId);
        state.isHost = state.hostId === cfg.clientId;
        state.playerOrder = (msg.players as { id: string }[]).map((p) => p.id);
        setStatus(state.isHost ? `Anfitrión de la sala ${cfg.room}` : `Invitado en la sala ${cfg.room}`);
        if (state.isHost && !hostSim.current) void createHostSim().then((sim) => (hostSim.current = sim));
        return;
      }
      case 'peer-joined':
        if (!state.playerOrder.includes(String(msg.id))) state.playerOrder.push(String(msg.id));
        return;
      case 'peer-left':
        state.players.delete(String(msg.id));
        if (state.owner === msg.id) state.owner = null;
        return;
      case 'room-closed':
        setClosedReason(String(msg.reason));
        setStatus('Sala cerrada');
        return;
      case 'join-refused':
        setStatus(`No se pudo entrar: ${msg.reason === 'full' ? 'sala llena (máx. 4)' : 'datos inválidos'}`);
        return;
      case 'relay-stats':
        setRelayStats(msg);
        return;
    }
    // Mensajes de juego
    if (state.isHost) {
      if (msg.t === 'pose') state.players.set(String(msg.id), msg.p as [number, number, number]);
      else if (msg.t === 'grab') hostSim.current?.requestGrab(String(msg.id), state, msg.force === true);
      else if (msg.t === 'release') hostSim.current?.release(String(msg.id), state);
      else if (msg.t === 'ping') send({ t: 'pong', to: msg.id, c: msg.c, h: hostNow() });
      else if (msg.t === 'owner-seen') {
        ownerReports.current.set(String(msg.id), (msg.owner as string | null) ?? null);
        const values = [...ownerReports.current.values()];
        const all = new Set([...values, state.owner]);
        setConflict(`Dueño final: ${state.owner ?? 'nadie'} · reportes ${values.length} · todos coinciden: ${all.size === 1 ? 'SÍ' : 'NO'}`);
      }
      return;
    }
    if (msg.t === 'snap') {
      const s = msg.s as Snapshot;
      if (disconnectAt.current) {
        state.metrics.reconnects.push(now - disconnectAt.current);
        disconnectAt.current = 0;
        state.buffer.clear();
        state.metrics.resetContinuity();
      }
      const prev = state.buffer.latest();
      if (prev && s.resets !== prev.resets) {
        // Reubicación intencional del anfitrión: no es un fallo de sincronización.
        state.metrics.hostResets++;
        state.buffer.clear();
        state.metrics.resetContinuity();
      }
      state.buffer.push(s);
      state.metrics.onSnapshot(now);
      state.owner = s.owner;
      for (const [id, p] of Object.entries(s.players)) if (id !== cfg.clientId) state.players.set(id, p);
    } else if (msg.t === 'pong' && msg.to === cfg.clientId) {
      const rtt = now - Number(msg.c);
      state.metrics.rtt.push(rtt);
      if (state.metrics.rtt.length > 300) state.metrics.rtt.shift();
      state.clockOffset = Number(msg.h) - (Number(msg.c) + rtt / 2);
    } else if (msg.t === 'conflict') {
      const localAt = Number(msg.at) - state.clockOffset;
      setTimeout(() => send({ t: 'grab', id: cfg.clientId, force: true }), Math.max(0, localAt - performance.now()));
      setTimeout(() => send({ t: 'owner-seen', id: cfg.clientId, owner: state.buffer.latest()?.owner ?? null }), Math.max(0, localAt - performance.now()) + 600);
    }
  };

  const hostNow = () => performance.now();

  useEffect(() => {
    connect();
    const poseTimer = setInterval(() => {
      const p: [number, number, number] = [state.me.x, state.me.z, state.me.yaw];
      if (state.isHost) state.players.set(cfg.clientId, p);
      else send({ t: 'pose', id: cfg.clientId, p });
    }, 1000 / SNAPSHOT_HZ);
    const pingTimer = setInterval(() => {
      if (!state.isHost) send({ t: 'ping', id: cfg.clientId, c: performance.now() });
    }, 1000);
    const hudTimer = setInterval(() => {
      setHud({ summary: state.metrics.summary(performance.now()), owner: state.owner, players: state.playerOrder.length, dist: state.boxDistance });
    }, 500);
    return () => {
      clearInterval(poseTimer);
      clearInterval(pingTimer);
      clearInterval(hudTimer);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Teclado
  useEffect(() => {
    const keys = new Set<string>();
    const update = () => {
      state.input.x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      state.input.z = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === 'KeyE' && !e.repeat) toggleGrab();
      keys.add(e.code);
      update();
    };
    const up = (e: KeyboardEvent) => {
      keys.delete(e.code);
      update();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleGrab = () => {
    const mine = state.owner === cfg.clientId;
    if (state.isHost) {
      if (mine) hostSim.current?.release(cfg.clientId, state);
      else hostSim.current?.requestGrab(cfg.clientId, state);
    } else send({ t: mine ? 'release' : 'grab', id: cfg.clientId });
  };

  const startConflict = () => {
    ownerReports.current.clear();
    hostSim.current?.release(state.owner ?? '', state);
    const at = hostNow() + 1500;
    send({ t: 'conflict', at });
    setConflict('Prueba en curso…');
    setTimeout(() => hostSim.current?.requestGrab(cfg.clientId, state, true), at - hostNow());
  };

  const simulateDrop = () => {
    const ws = wsRef.current;
    if (!ws) return;
    wsRef.current = null;
    ws.close();
    setStatus('Corte simulado: reconectando en 3 s…');
    setTimeout(() => {
      disconnectAt.current = performance.now();
      connect();
    }, 3000);
  };

  const result = {
    room: cfg.room,
    role: state.isHost ? 'anfitrión' : 'invitado',
    network: cfg.network,
    ...hud.summary,
    pass: state.isHost ? null : evaluate(hud.summary, cfg.network),
    relay: relayStats,
    conflict,
    userAgent: navigator.userAgent,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#cfd6da', fontFamily: 'system-ui, sans-serif', touchAction: 'none' }}>
      <Canvas camera={{ position: [0, 9, 8], fov: 45 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[4, 8, 3]} intensity={1.2} />
        <Scene state={state} cfg={cfg} hostSim={hostSim} send={send} />
      </Canvas>
      <div style={panel}>
        <b>Prueba de red</b> · {status}
        <br />
        Jugadores: {hud.players} · Dueño de la caja: {hud.owner ? (hud.owner === cfg.clientId ? 'vos' : hud.owner) : 'nadie'} · distancia: {hud.dist.toFixed(1)} m {hud.dist <= GRAB_RANGE ? '(al alcance)' : ''}
        {!state.isHost && (
          <>
            <br />
            RTT p50/p95: {hud.summary.rttP50}/{hud.summary.rttP95} ms · snapshots/s: {hud.summary.snapshotsPerSec}
            <br />
            Huecos &gt;250 ms: {hud.summary.gaps} (máx {hud.summary.maxGapMs} ms) · saltos: {hud.summary.jumps} · teletransportes: {hud.summary.teleports}
            <br />
            Error en reposo p95: {hud.summary.restErrorP95Cm} cm · reubicaciones: {hud.summary.hostResets} · reconexiones: {hud.summary.reconnectMs.join(', ') || '—'} ms
          </>
        )}
        {relayStats && (
          <>
            <br />
            Relay: {String(relayStats.receivedPerSec)} recibidos/s · {String(relayStats.forwardedPerSec)} reenvíos/s · {String(relayStats.avgBytesIn)} B/mensaje
          </>
        )}
        {conflict && (
          <>
            <br />
            {conflict}
          </>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          <button onClick={toggleGrab}>Agarrar / soltar (E)</button>
          {state.isHost ? <button onClick={startConflict}>Prueba de conflicto</button> : <button onClick={simulateDrop}>Simular corte</button>}
          <button onClick={() => void navigator.clipboard?.writeText(JSON.stringify(result, null, 2))}>Copiar resultados</button>
        </div>
      </div>
      <TouchStick state={state} />
      {closedReason && (
        <div style={{ ...panel, top: '40%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: 18, textAlign: 'center' }}>
          {closedReason}
        </div>
      )}
    </div>
  );
}

const panel: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 8,
  right: 8,
  maxWidth: 560,
  background: 'rgba(255,255,255,0.88)',
  borderRadius: 8,
  padding: 8,
  fontSize: 13,
  lineHeight: 1.45,
};

function TouchStick({ state }: { state: LabState }) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      style={{ position: 'absolute', left: 0, bottom: 0, width: '50%', height: '45%' }}
      onPointerDown={(e) => (origin.current = { x: e.clientX, y: e.clientY })}
      onPointerMove={(e) => {
        if (!origin.current) return;
        const dx = (e.clientX - origin.current.x) / 60;
        const dy = (e.clientY - origin.current.y) / 60;
        const len = Math.hypot(dx, dy);
        state.input.x = len > 1 ? dx / len : dx;
        state.input.z = len > 1 ? dy / len : dy;
      }}
      onPointerUp={() => {
        origin.current = null;
        state.input.x = 0;
        state.input.z = 0;
      }}
    />
  );
}

function Scene({
  state,
  cfg,
  hostSim,
  send,
}: {
  state: LabState;
  cfg: ReturnType<typeof params>;
  hostSim: React.RefObject<HostSim | null>;
  send: (m: Msg) => void;
}) {
  const boxRef = useRef<THREE.Mesh>(null);
  const meRef = useRef<THREE.Group>(null);
  const others = useRef<Map<string, THREE.Mesh>>(new Map());
  const othersGroup = useRef<THREE.Group>(null);
  const tick = useRef(0);
  const snapAcc = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    state.boxDistance = Math.hypot(state.me.x - (boxRef.current?.position.x ?? 0), state.me.z - (boxRef.current?.position.z ?? 0));
    // Avatar propio: movimiento local inmediato (sin esperar a la red).
    const { me, input } = state;
    const len = Math.hypot(input.x, input.z);
    if (len > 0.05) {
      me.x = THREE.MathUtils.clamp(me.x + (input.x / Math.max(1, len)) * MOVE_SPEED * dt, -ARENA + PLAYER_R, ARENA - PLAYER_R);
      me.z = THREE.MathUtils.clamp(me.z + (input.z / Math.max(1, len)) * MOVE_SPEED * dt, -ARENA + PLAYER_R, ARENA - PLAYER_R);
      me.yaw = Math.atan2(input.x, input.z);
    }
    meRef.current?.position.set(me.x, 0.5, me.z);
    meRef.current?.rotation.set(0, me.yaw, 0);

    // Caja
    let shown: { p: Vec3; q: [number, number, number, number]; v: number } | null = null;
    if (state.isHost && hostSim.current) {
      const sim = hostSim.current;
      sim.step(dt, state);
      shown = sim.boxState();
      snapAcc.current += dt;
      if (snapAcc.current >= 1 / SNAPSHOT_HZ) {
        snapAcc.current %= 1 / SNAPSHOT_HZ;
        const snap: Snapshot = {
          tick: ++tick.current,
          hostTime: performance.now(),
          box: shown,
          owner: state.owner,
          resets: sim.resets,
          players: Object.fromEntries(state.players),
        };
        send({ t: 'snap', s: snap });
      }
    } else if (!state.isHost) {
      const renderTime = performance.now() + state.clockOffset - INTERP_DELAY_MS;
      shown = state.buffer.sample(renderTime);
      if (shown) {
        // Tiempo real del cuadro: con el limitado, un cuadro lento parecería un salto.
        state.metrics.onFrame(shown.p, shown.v, rawDt);
        const latest = state.buffer.latest();
        if (latest && latest.box.v < 0.02 && shown.v < 0.02 && renderTime > latest.hostTime) state.metrics.onRest(shown.p, latest.box.p);
      }
    }
    if (shown && boxRef.current) {
      boxRef.current.position.set(...shown.p);
      boxRef.current.quaternion.set(...shown.q);
      const mat = boxRef.current.material as THREE.MeshStandardMaterial;
      const ownerIdx = state.owner ? state.playerOrder.indexOf(state.owner) : -1;
      mat.emissive.set(ownerIdx >= 0 ? COLORS[ownerIdx % COLORS.length] : '#000000');
      mat.emissiveIntensity = ownerIdx >= 0 ? 0.45 : 0;
    }

    // Otros jugadores
    const group = othersGroup.current;
    if (!group) return;
    for (const [id, p] of state.players) {
      if (id === cfg.clientId) continue;
      let mesh = others.current.get(id);
      if (!mesh) {
        const idx = Math.max(0, state.playerOrder.indexOf(id));
        mesh = new THREE.Mesh(new THREE.CapsuleGeometry(PLAYER_R, 0.5, 4, 12), new THREE.MeshStandardMaterial({ color: COLORS[idx % COLORS.length] }));
        group.add(mesh);
        others.current.set(id, mesh);
      }
      mesh.position.lerp(new THREE.Vector3(p[0], 0.5, p[1]), Math.min(1, dt * 12));
    }
    for (const [id, mesh] of others.current) {
      if (!state.players.has(id)) {
        group.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        others.current.delete(id);
      }
    }
  });

  const myColor = COLORS[Math.max(0, state.playerOrder.indexOf(cfg.clientId)) % COLORS.length];
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ARENA * 2, ARENA * 2]} />
        <meshStandardMaterial color="#b9a58a" />
      </mesh>
      <gridHelper args={[ARENA * 2, 10, '#7a6a55', '#9d8c74']} position={[0, 0.01, 0]} />
      <mesh ref={boxRef} position={[0, BOX / 2, 0]}>
        <boxGeometry args={[BOX, BOX, BOX]} />
        <meshStandardMaterial color="#b07a45" />
      </mesh>
      <group ref={meRef}>
        <mesh>
          <capsuleGeometry args={[PLAYER_R, 0.5, 4, 12]} />
          <meshStandardMaterial color={myColor} />
        </mesh>
        <mesh position={[0, 0.25, 0.32]}>
          <boxGeometry args={[0.15, 0.15, 0.15]} />
          <meshStandardMaterial color="#222" />
        </mesh>
      </group>
      <group ref={othersGroup} />
    </>
  );
}

/** Simulación del anfitrión: caja dinámica, paredes y jugadores como cápsulas cinemáticas. */
interface HostSim {
  step(dt: number, state: LabState): void;
  boxState(): { p: Vec3; q: [number, number, number, number]; v: number };
  requestGrab(id: string, state: LabState, force?: boolean): void;
  release(id: string, state: LabState): void;
  readonly resets: number;
}

async function createHostSim(): Promise<HostSim> {
  const RAPIER: typeof RAPIER_NS = (await import('@dimforge/rapier3d-compat')).default;
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -18, z: 0 });
  world.createCollider(RAPIER.ColliderDesc.cuboid(ARENA, 0.1, ARENA).setTranslation(0, -0.1, 0));
  for (const [x, z, hx, hz] of [
    [ARENA, 0, 0.1, ARENA],
    [-ARENA, 0, 0.1, ARENA],
    [0, ARENA, ARENA, 0.1],
    [0, -ARENA, ARENA, 0.1],
  ])
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, 1, hz).setTranslation(x, 1, z));
  const box = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, BOX / 2 + 0.01, 0).setCanSleep(true));
  world.createCollider(RAPIER.ColliderDesc.cuboid(BOX / 2, BOX / 2, BOX / 2).setDensity(80).setFriction(0.7), box);
  const avatars = new Map<string, RAPIER_NS.RigidBody>();
  const STEP = 1 / 60;
  let acc = 0;
  let resets = 0;

  const ownerTarget = (state: LabState) => {
    const p = state.owner ? state.players.get(state.owner) : null;
    if (!p) return null;
    return { x: p[0] + Math.sin(p[2]) * 0.8, y: 0.9, z: p[1] + Math.cos(p[2]) * 0.8 };
  };

  return {
    get resets() {
      return resets;
    },
    step(dt, state) {
      // Paso fijo: la física no depende de los fps del anfitrión.
      acc = Math.min(acc + dt, STEP * 6);
      for (const [id, p] of state.players) {
        let body = avatars.get(id);
        if (!body) {
          body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p[0], 0.6, p[1]));
          world.createCollider(RAPIER.ColliderDesc.capsule(0.25, PLAYER_R), body);
          avatars.set(id, body);
        }
        body.setNextKinematicTranslation({ x: p[0], y: 0.6, z: p[1] });
      }
      for (const [id, body] of avatars) {
        if (!state.players.has(id)) {
          world.removeRigidBody(body);
          avatars.delete(id);
        }
      }
      while (acc >= STEP) {
        const target = ownerTarget(state);
        if (target) {
          const t = box.translation();
          box.wakeUp();
          box.setLinvel({ x: (target.x - t.x) * 12, y: (target.y - t.y) * 12, z: (target.z - t.z) * 12 }, true);
          box.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }
        world.step();
        acc -= STEP;
      }
      const t = box.translation();
      if (t.y < -2 || Math.abs(t.x) > ARENA + 1 || Math.abs(t.z) > ARENA + 1) {
        resets++;
        box.setTranslation({ x: 0, y: 1, z: 0 }, true);
        box.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    },
    boxState() {
      const t = box.translation();
      const r = box.rotation();
      const v = box.linvel();
      return {
        p: [round(t.x), round(t.y), round(t.z)],
        q: [round(r.x), round(r.y), round(r.z), round(r.w)],
        v: box.isSleeping() ? 0 : round(Math.hypot(v.x, v.y, v.z)),
      };
    },
    requestGrab(id, state, force = false) {
      if (state.owner) return; // Candado: el primero que llega al anfitrión gana.
      const p = state.players.get(id);
      const t = box.translation();
      // En la prueba de conflicto se ignora el alcance: se mide el candado, no la distancia.
      if (!p || (!force && Math.hypot(p[0] - t.x, p[1] - t.z) > GRAB_RANGE)) return;
      state.owner = id;
    },
    release(id, state) {
      if (state.owner === id) state.owner = null;
    },
  };
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
