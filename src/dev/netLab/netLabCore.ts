/**
 * Lógica pura de la prueba de red: interpolación de snapshots y métricas.
 * Sin three.js ni red, para poder testearla.
 */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export interface BoxState {
  p: Vec3;
  q: Quat;
  /** Rapidez del cuerpo en el anfitrión (m/s). */
  v: number;
}

export interface Snapshot {
  tick: number;
  /** Hora del anfitrión al tomar el snapshot (ms). */
  hostTime: number;
  box: BoxState;
  owner: string | null;
  /** Veces que el anfitrión reubicó la caja por salir del área (teletransporte legítimo). */
  resets: number;
  players: Record<string, [number, number, number]>;
}

/** Retraso de interpolación: se dibuja el pasado para tener dos snapshots entre los que interpolar. */
export const INTERP_DELAY_MS = 100;
export const SNAPSHOT_HZ = 20;
/** Un hueco mayor que esto entre snapshots cuenta como corte perceptible. */
export const GAP_MS = 250;
/** Desplazamiento de un cuadro por encima de lo que permite la velocidad real: cuenta como salto. */
export const JUMP_M = 0.15;
/** Por encima de esto es un teletransporte, no un tirón. */
export const TELEPORT_M = 0.5;

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function slerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (dot < 0) {
    dot = -dot;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (dot > 0.9995) {
    const r: Quat = [lerp(a[0], bx, t), lerp(a[1], by, t), lerp(a[2], bz, t), lerp(a[3], bw, t)];
    const n = Math.hypot(...r) || 1;
    return [r[0] / n, r[1] / n, r[2] / n, r[3] / n];
  }
  const theta = Math.acos(dot);
  const s = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / s;
  const wb = Math.sin(t * theta) / s;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}

/**
 * Buffer de snapshots indexado por hora del anfitrión. `sample` devuelve el
 * estado interpolado para una hora del anfitrión dada.
 */
export class SnapshotBuffer {
  private items: Snapshot[] = [];

  push(s: Snapshot) {
    if (this.items.length && s.tick <= this.items[this.items.length - 1].tick) return;
    this.items.push(s);
    if (this.items.length > 40) this.items.shift();
  }

  clear() {
    this.items = [];
  }

  latest(): Snapshot | null {
    return this.items[this.items.length - 1] ?? null;
  }

  sample(hostTime: number): BoxState | null {
    const it = this.items;
    if (!it.length) return null;
    if (hostTime <= it[0].hostTime) return it[0].box;
    for (let i = it.length - 1; i > 0; i--) {
      const a = it[i - 1];
      const b = it[i];
      if (hostTime >= a.hostTime && hostTime <= b.hostTime) {
        const t = (hostTime - a.hostTime) / Math.max(1, b.hostTime - a.hostTime);
        return {
          p: [lerp(a.box.p[0], b.box.p[0], t), lerp(a.box.p[1], b.box.p[1], t), lerp(a.box.p[2], b.box.p[2], t)],
          q: slerp(a.box.q, b.box.q, t),
          v: lerp(a.box.v, b.box.v, t),
        };
      }
    }
    // Sin snapshot más nuevo: se mantiene el último (no se extrapola).
    return it[it.length - 1].box;
  }
}

export function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/** Métricas que un invitado acumula durante la prueba. */
export class GuestMetrics {
  rtt: number[] = [];
  snapshotTimes: number[] = [];
  gaps = 0;
  maxGapMs = 0;
  jumps = 0;
  teleports = 0;
  maxExcessM = 0;
  restErrors: number[] = [];
  reconnects: number[] = [];
  hostResets = 0;
  private lastSnapAt = 0;
  private lastDisplayed: Vec3 | null = null;

  onSnapshot(localNow: number) {
    if (this.lastSnapAt) {
      const gap = localNow - this.lastSnapAt;
      if (gap > GAP_MS) this.gaps++;
      this.maxGapMs = Math.max(this.maxGapMs, gap);
    }
    this.lastSnapAt = localNow;
    this.snapshotTimes.push(localNow);
    if (this.snapshotTimes.length > 400) this.snapshotTimes.shift();
  }

  /** Se llama tras un corte: el hueco del corte no cuenta como fallo de sincronización. */
  resetContinuity() {
    this.lastSnapAt = 0;
    this.lastDisplayed = null;
  }

  /**
   * Registra la posición dibujada en un cuadro. `speed` es la rapidez real
   * (interpolada) y `dt` el tiempo del cuadro: lo que exceda ese recorrido es salto.
   */
  onFrame(displayed: Vec3, speed: number, dt: number) {
    if (this.lastDisplayed) {
      const d = dist(displayed, this.lastDisplayed);
      const excess = d - speed * dt - 0.01;
      if (excess > this.maxExcessM) this.maxExcessM = excess;
      if (excess > TELEPORT_M) this.teleports++;
      else if (excess > JUMP_M) this.jumps++;
    }
    this.lastDisplayed = [...displayed];
  }

  /** Con la caja quieta en el anfitrión, la imagen debe coincidir con el último snapshot. */
  onRest(displayed: Vec3, truth: Vec3) {
    this.restErrors.push(dist(displayed, truth));
    if (this.restErrors.length > 600) this.restErrors.shift();
  }

  snapshotsPerSec(localNow: number) {
    const recent = this.snapshotTimes.filter((t) => localNow - t <= 5000);
    if (recent.length < 2) return 0;
    return (recent.length - 1) / ((recent[recent.length - 1] - recent[0]) / 1000 || 1);
  }

  summary(localNow: number) {
    return {
      rttP50: Math.round(percentile(this.rtt, 50)),
      rttP95: Math.round(percentile(this.rtt, 95)),
      snapshotsPerSec: Math.round(this.snapshotsPerSec(localNow) * 10) / 10,
      gaps: this.gaps,
      maxGapMs: Math.round(this.maxGapMs),
      jumps: this.jumps,
      teleports: this.teleports,
      maxExcessCm: Math.round(this.maxExcessM * 100),
      restErrorP95Cm: Math.round(percentile(this.restErrors, 95) * 1000) / 10,
      reconnectMs: this.reconnects.map(Math.round),
      hostResets: this.hostResets,
    };
  }
}

export function dist(a: Vec3, b: Vec3) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Criterios de aprobación (ver tools/net-relay/README.md). */
export const PASS = {
  lan: { rttP95: 60 },
  online: { rttP95: 250 },
  snapshotsPerSec: 18,
  gapsPer5Min: 3,
  teleports: 0,
  jumpsPer5Min: 5,
  restErrorP95Cm: 2,
  reconnectMs: 5000,
} as const;

export function evaluate(summary: ReturnType<GuestMetrics['summary']>, network: 'lan' | 'online') {
  return {
    rtt: summary.rttP95 <= PASS[network].rttP95,
    snapshots: summary.snapshotsPerSec >= PASS.snapshotsPerSec,
    gaps: summary.gaps <= PASS.gapsPer5Min,
    teleports: summary.teleports <= PASS.teleports,
    jumps: summary.jumps <= PASS.jumpsPer5Min,
    rest: summary.restErrorP95Cm <= PASS.restErrorP95Cm,
    reconnect: summary.reconnectMs.every((ms) => ms <= PASS.reconnectMs),
  };
}
