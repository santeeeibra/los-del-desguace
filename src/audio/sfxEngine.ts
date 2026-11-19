/**
 * Pure Web Audio API procedural sound effects engine for Los del Desguace.
 * No external audio assets or dependencies required.
 */

import type { EmoteId } from '../character/characterCustomization';

type AudioContextCtor = typeof AudioContext;

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let unlockListenersAttached = false;
let noiseBuffer: AudioBuffer | null = null;

// Engine hum persistent nodes
let engineOscMain: OscillatorNode | null = null;
let engineOscSub: OscillatorNode | null = null;
let engineLfo: OscillatorNode | null = null;
let engineLfoGain: GainNode | null = null;
let engineFilter: BiquadFilterNode | null = null;
let engineGain: GainNode | null = null;
let engineHumRequested = false;
let lastEngineIntensity = 0.5;
let lastEmoteSfxAt = 0;
let lastSuccessAt = Number.NEGATIVE_INFINITY;
const EMOTE_COOLDOWN_MS = 120;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

function ensureContext(): AudioContext | null {
  if (audioCtx) return audioCtx;
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;

  audioCtx = new Ctor();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 1.15;
  if (typeof audioCtx.createDynamicsCompressor === 'function') {
    const comp = audioCtx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.12;
    masterGain.connect(comp);
    comp.connect(audioCtx.destination);
  } else {
    masterGain.connect(audioCtx.destination);
  }
  return audioCtx;
}

function getReadyContext(): { ctx: AudioContext; out: GainNode } | null {
  if (audioCtx?.state !== 'running' || !masterGain) return null;
  return { ctx: audioCtx, out: masterGain };
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) {
    return noiseBuffer;
  }
  const length = Math.floor(ctx.sampleRate * 0.4);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

function runWithAudio(fn: (ctx: AudioContext, out: GainNode) => void): void {
  try {
    const ctx = ensureContext();
    if (!ctx || !masterGain) return;
    if (ctx.state === 'running') {
      fn(ctx, masterGain);
      return;
    }
    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(() => {
          if (ctx.state === 'running' && masterGain) {
            fn(ctx, masterGain);
          }
        })
        .catch(() => {});
    }
  } catch {
    // Ignore audio errors on restricted devices.
  }
}

function disconnectNodes(...nodes: AudioNode[]): void {
  for (const node of nodes) {
    try {
      node.disconnect();
    } catch {
      // Ignore already-disconnected nodes.
    }
  }
}

function scheduleTone(
  ctx: AudioContext,
  out: GainNode,
  type: OscillatorType,
  startFreq: number,
  endFreq: number,
  startTime: number,
  duration: number,
  peakGain = 0.14
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, startTime);
  if (endFreq !== startFreq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startTime + duration);
  }
  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.015, duration * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.onended = () => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      // Ignore already-disconnected nodes.
    }
  };
  osc.connect(gain);
  gain.connect(out);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

/**
 * Safely unlocks/resumes the Web Audio API context on the first user gesture
 * (`pointerdown`, `touchend`, or `keydown`). Removes global listeners once running.
 */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return;
  if (audioCtx?.state === 'running') return;

  if (unlockListenersAttached) return;
  unlockListenersAttached = true;

  const detachListeners = () => {
    if (!unlockListenersAttached) return;
    unlockListenersAttached = false;
    window.removeEventListener('pointerdown', handleGesture, { capture: true });
    window.removeEventListener('touchend', handleGesture, { capture: true });
    window.removeEventListener('keydown', handleGesture, { capture: true });
  };

  const handleGesture = () => {
    try {
      const ctx = ensureContext();
      if (!ctx) return;
      if (ctx.state === 'running') {
        detachListeners();
        if (engineHumRequested && !engineGain) setEngineHum(true, lastEngineIntensity);
      } else {
        void ctx
          .resume()
          .then(() => {
            if (ctx.state === 'running') {
              detachListeners();
              if (engineHumRequested) setEngineHum(true, lastEngineIntensity);
            }
          })
          .catch(() => {});
      }
    } catch {
      // The game can run on devices that block Web Audio.
    }
  };

  window.addEventListener('pointerdown', handleGesture, { capture: true, passive: true });
  window.addEventListener('touchend', handleGesture, { capture: true, passive: true });
  window.addEventListener('keydown', handleGesture, { capture: true, passive: true });
}

/**
 * Short electric crackle/spark: bandpass-filtered noise burst + high-pitched pulse.
 */
export function playSpark(): void {
  const ready = getReadyContext();
  if (!ready || ready.ctx.state !== 'running') return;
  const { ctx, out } = ready;
  const now = ctx.currentTime;

  // Filtered noise crackle
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.setValueAtTime(3400, now);
  bandpass.Q.value = 3.2;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.28, now + 0.006);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

  noise.onended = () => disconnectNodes(noise, bandpass, noiseGain);
  noise.connect(bandpass);
  bandpass.connect(noiseGain);
  noiseGain.connect(out);
  noise.start(now);
  noise.stop(now + 0.09);

  // High-pitched electric zap pulse
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(1950, now);
  osc.frequency.exponentialRampToValueAtTime(420, now + 0.055);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.14, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

  osc.onended = () => disconnectNodes(osc, oscGain);
  osc.connect(oscGain);
  oscGain.connect(out);
  osc.start(now);
  osc.stop(now + 0.065);
}

/**
 * Soft low/metallic impact thud scaled by intensity (0..1).
 */
export function playImpact(intensity = 0.5): void {
  const ready = getReadyContext();
  if (!ready || ready.ctx.state !== 'running') return;
  const { ctx, out } = ready;
  const now = ctx.currentTime;

  const clamped = Math.max(0, Math.min(1, intensity));
  if (clamped <= 0.02) return;

  // Low body thud
  const thud = ctx.createOscillator();
  thud.type = 'triangle';
  thud.frequency.setValueAtTime(115 + clamped * 55, now);
  thud.frequency.exponentialRampToValueAtTime(38, now + 0.14);

  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.001, now);
  thudGain.gain.linearRampToValueAtTime(0.28 * clamped, now + 0.006);
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

  thud.onended = () => disconnectNodes(thud, thudGain);
  thud.connect(thudGain);
  thudGain.connect(out);
  thud.start(now);
  thud.stop(now + 0.17);

  // Subtle metallic overtone
  const clank = ctx.createOscillator();
  clank.type = 'sine';
  clank.frequency.setValueAtTime(360 + clamped * 180, now);
  clank.frequency.exponentialRampToValueAtTime(140, now + 0.09);

  const clankGain = ctx.createGain();
  clankGain.gain.setValueAtTime(0.08 * clamped, now);
  clankGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

  clank.onended = () => disconnectNodes(clank, clankGain);
  clank.connect(clankGain);
  clankGain.connect(out);
  clank.start(now);
  clank.stop(now + 0.1);
}

/**
 * Crisp click/spark when connecting or disconnecting a logic wire.
 */
export function playWireSnap(): void {
  const ready = getReadyContext();
  if (!ready || ready.ctx.state !== 'running') return;
  const { ctx, out } = ready;
  const now = ctx.currentTime;

  // Short mechanical snap
  const snap = ctx.createOscillator();
  snap.type = 'square';
  snap.frequency.setValueAtTime(880, now);
  snap.frequency.exponentialRampToValueAtTime(1520, now + 0.022);
  snap.frequency.exponentialRampToValueAtTime(340, now + 0.05);

  const snapGain = ctx.createGain();
  snapGain.gain.setValueAtTime(0.14, now);
  snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

  snap.onended = () => disconnectNodes(snap, snapGain);
  snap.connect(snapGain);
  snapGain.connect(out);
  snap.start(now);
  snap.stop(now + 0.06);

  // Tiny high-pass noise transient
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(2400, now);

  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.12, now);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

  noise.onended = () => disconnectNodes(noise, hp, nGain);
  noise.connect(hp);
  hp.connect(nGain);
  nGain.connect(out);
  noise.start(now);
  noise.stop(now + 0.04);
}

/**
 * Optional gentle engine hum/idle with low gain so it never saturates.
 * Repeated calls while active smoothly ramp frequency, cutoff, and LFO rate.
 */
export function setEngineHum(active: boolean, intensity = 0.5): void {
  engineHumRequested = active;
  lastEngineIntensity = intensity;
  const ready = getReadyContext();
  if (!ready) return;
  const { ctx, out } = ready;
  const now = ctx.currentTime;

  if (!engineGain || !engineFilter || !engineOscMain || !engineOscSub) {
    if (!active) return;

    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.setValueAtTime(190, now);
    engineFilter.Q.value = 1.65;

    engineGain = ctx.createGain();
    engineGain.gain.setValueAtTime(0, now);

    engineOscMain = ctx.createOscillator();
    engineOscMain.type = 'sawtooth';
    engineOscMain.frequency.setValueAtTime(50, now);

    engineOscSub = ctx.createOscillator();
    engineOscSub.type = 'triangle';
    engineOscSub.frequency.setValueAtTime(25, now);

    try {
      engineLfo = ctx.createOscillator();
      engineLfo.type = 'sine';
      engineLfo.frequency.setValueAtTime(9, now);

      engineLfoGain = ctx.createGain();
      engineLfoGain.gain.setValueAtTime(24, now);

      engineLfo.connect(engineLfoGain);
      engineLfoGain.connect(engineFilter.frequency);
      engineLfo.start(now);
    } catch {
      engineLfo = null;
      engineLfoGain = null;
    }

    engineOscMain.connect(engineFilter);
    engineOscSub.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(out);

    engineOscMain.start(now);
    engineOscSub.start(now);
  }

  const clamped = Math.max(0, Math.min(1, intensity));
  const targetGain = active ? 0.036 + clamped * 0.052 : 0;
  const targetFreq = 45 + clamped * 44;
  const targetCutoff = 155 + clamped * 210;

  engineGain.gain.setTargetAtTime(targetGain, now, 0.07);
  engineOscMain.frequency.setTargetAtTime(targetFreq, now, 0.07);
  engineOscSub.frequency.setTargetAtTime(targetFreq * 0.5, now, 0.07);
  engineFilter.frequency.setTargetAtTime(targetCutoff, now, 0.07);
  if (engineLfo && engineLfoGain) {
    try {
      engineLfo.frequency.setTargetAtTime(7.5 + clamped * 9.5, now, 0.08);
      engineLfoGain.gain.setTargetAtTime(active ? 18 + clamped * 26 : 0, now, 0.08);
    } catch {
      // Ignore if AudioParam modulation is unsupported in mock audio contexts
    }
  }
}

/**
 * Procedural WebAudio cue for each of the 7 workshop emotes.
 */
export function playEmoteSfx(emote: EmoteId): void {
  const nowMs = Date.now();
  if (nowMs - lastEmoteSfxAt < EMOTE_COOLDOWN_MS) return;
  lastEmoteSfxAt = nowMs;

  runWithAudio((ctx, out) => {
    const now = ctx.currentTime;

    switch (emote) {
      case 'wave': {
        // Cheerful two-note ascending hello chime (520Hz -> 680Hz)
        scheduleTone(ctx, out, 'triangle', 520, 540, now, 0.095, 0.14);
        scheduleTone(ctx, out, 'triangle', 680, 710, now + 0.09, 0.14, 0.16);
        break;
      }
      case 'thumbsUp': {
        // Crisp bright approval ding (600Hz -> 900Hz)
        scheduleTone(ctx, out, 'sine', 600, 615, now, 0.075, 0.15);
        scheduleTone(ctx, out, 'triangle', 900, 920, now + 0.065, 0.18, 0.17);
        break;
      }
      case 'celebrate': {
        // 3-note major triad fanfare (523Hz -> 659Hz -> 784Hz)
        scheduleTone(ctx, out, 'triangle', 523.25, 528, now, 0.085, 0.14);
        scheduleTone(ctx, out, 'triangle', 659.25, 665, now + 0.08, 0.085, 0.15);
        scheduleTone(ctx, out, 'triangle', 783.99, 800, now + 0.16, 0.21, 0.17);
        break;
      }
      case 'facepalm': {
        // Comic descending slide (320Hz -> 170Hz)
        scheduleTone(ctx, out, 'sawtooth', 320, 170, now, 0.24, 0.11);
        scheduleTone(ctx, out, 'triangle', 160, 95, now + 0.04, 0.22, 0.12);
        break;
      }
      case 'think': {
        // Curious soft pluck (440Hz -> 510Hz)
        scheduleTone(ctx, out, 'sine', 440, 460, now, 0.09, 0.12);
        scheduleTone(ctx, out, 'sine', 510, 545, now + 0.11, 0.13, 0.13);
        break;
      }
      case 'wrenchSpin': {
        // Quick metallic ratchet clicks/whir
        const clicks = [920, 1180, 1420, 1680];
        clicks.forEach((freq, idx) => {
          scheduleTone(ctx, out, 'square', freq, freq * 0.82, now + idx * 0.036, 0.028, 0.09);
        });
        break;
      }
      case 'panic': {
        // Quick cartoon vibrato alert (620Hz <-> 760Hz)
        scheduleTone(ctx, out, 'sawtooth', 620, 760, now, 0.075, 0.12);
        scheduleTone(ctx, out, 'sawtooth', 760, 620, now + 0.075, 0.075, 0.12);
        scheduleTone(ctx, out, 'sawtooth', 620, 780, now + 0.15, 0.095, 0.13);
        break;
      }
    }
  });
}

/**
 * Crisp metallic clank + brief warm spark for welding/mounting parts,
 * loading presets, or 1-click repair.
 */
export function playWeldClank(): void {
  runWithAudio((ctx, out) => {
    const now = ctx.currentTime;

    // Metallic clank body + bright ring
    scheduleTone(ctx, out, 'triangle', 540, 210, now, 0.11, 0.19);
    scheduleTone(ctx, out, 'sine', 1180, 760, now + 0.004, 0.085, 0.11);

    // Brief warm weld spark crackle
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(2800, now + 0.012);
    bandpass.Q.value = 2.4;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now + 0.012);
    noiseGain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    noise.onended = () => disconnectNodes(noise, bandpass, noiseGain);
    noise.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(out);
    noise.start(now + 0.012);
    noise.stop(now + 0.09);
  });
}

/**
 * Cheerful ascending three-note brass/wood chime for passing checkpoints,
 * flight rings, or completing contracts.
 */
export function playSuccessChime(): void {
  runWithAudio((ctx, out) => {
    const now = ctx.currentTime;
    if (now - lastSuccessAt < 0.25) return;
    lastSuccessAt = now;

    // Ascending C5 -> E5 -> G5 triad with warm overtone
    scheduleTone(ctx, out, 'triangle', 523.25, 526, now, 0.1, 0.15);
    scheduleTone(ctx, out, 'sine', 1046.5, 1052, now, 0.08, 0.05);

    scheduleTone(ctx, out, 'triangle', 659.25, 663, now + 0.085, 0.1, 0.16);
    scheduleTone(ctx, out, 'sine', 1318.5, 1324, now + 0.085, 0.08, 0.05);

    scheduleTone(ctx, out, 'triangle', 783.99, 792, now + 0.17, 0.22, 0.18);
    scheduleTone(ctx, out, 'sine', 1567.98, 1580, now + 0.17, 0.18, 0.06);
  });
}

/**
 * Subtle, warm, short wooden tap (~35ms) for clicking wooden UI buttons/tabs.
 */
export function playWoodClick(): void {
  runWithAudio((ctx, out) => {
    const now = ctx.currentTime;

    // Resonant warm wood body
    scheduleTone(ctx, out, 'triangle', 430, 215, now, 0.034, 0.11);

    // Subtle crisp wood knock transient
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1450, now);
    bp.Q.value = 1.8;

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.001, now);
    nGain.gain.linearRampToValueAtTime(0.065, now + 0.003);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);

    noise.onended = () => disconnectNodes(noise, bp, nGain);
    noise.connect(bp);
    bp.connect(nGain);
    nGain.connect(out);
    noise.start(now);
    noise.stop(now + 0.026);
  });
}

export function playHornSfx(): void {
  runWithAudio((ctx, out) => {
    const now = ctx.currentTime;
    scheduleTone(ctx, out, 'triangle', 310, 295, now, 0.28, 0.16);
    scheduleTone(ctx, out, 'triangle', 392, 376, now + 0.02, 0.28, 0.14);
  });
}

export function playSpringBoing(): void {
  runWithAudio((ctx, out) => {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.14);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.34);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    osc.connect(gain);
    gain.connect(out);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // ignore
      }
    };
    osc.start(now);
    osc.stop(now + 0.37);
  });
}

export const sfxEngine = {
  unlockAudio,
  playSpark,
  playImpact,
  playWireSnap,
  setEngineHum,
  playEmoteSfx,
  playWeldClank,
  playSuccessChime,
  playWoodClick,
};
