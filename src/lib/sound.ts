/**
 * Procedural sound effects synthesized with the Web Audio API — no audio files.
 * Every sound is built from a few oscillators and filtered noise bursts.
 */

export type SoundName =
  | 'deal'
  | 'flip'
  | 'chip'
  | 'chips'
  | 'pot'
  | 'check'
  | 'fold'
  | 'allin'
  | 'click'
  | 'turn'
  | 'tick'
  | 'urgent'
  | 'win'
  | 'bigwin'
  | 'message'
  | 'reaction'
  | 'error'
  | 'join'
  | 'bonus';

type Wave = OscillatorType;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.7;
  private muted = false;
  private lastPlayed = new Map<SoundName, number>();

  configure(volume: number, muted: boolean) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
  }

  /** Must be called from a user gesture at least once (autoplay policies). */
  unlock() {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor: typeof AudioContext | undefined =
      typeof window !== 'undefined'
        ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!Ctor) return null;
    try {
      const ctx = new Ctor({ latencyHint: 'interactive' });
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : this.volume;
      master.connect(comp);
      comp.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 1.2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
      this.master = master;
      this.noiseBuffer = buf;
      return ctx;
    } catch {
      return null;
    }
  }

  private tone(
    t: number,
    freq: number,
    dur: number,
    opts: { type?: Wave; gain?: number; attack?: number; freqEnd?: number; detune?: number; dest?: AudioNode } = {},
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), t + dur);
    if (opts.detune) osc.detune.value = opts.detune;
    const peak = opts.gain ?? 0.3;
    const attack = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(opts.dest ?? this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(
    t: number,
    dur: number,
    opts: { type?: BiquadFilterType; freq?: number; freqEnd?: number; q?: number; gain?: number; attack?: number } = {},
  ) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type ?? 'bandpass';
    filter.frequency.setValueAtTime(opts.freq ?? 2000, t);
    if (opts.freqEnd) filter.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + dur);
    filter.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master!);
    const offset = Math.random() * 0.8;
    src.start(t, offset, dur + 0.05);
  }

  private clack(t: number, gain = 0.22) {
    const f = 2400 + Math.random() * 1600;
    this.tone(t, f, 0.05, { type: 'triangle', gain, freqEnd: f * 0.92 });
    this.tone(t, f * 1.9, 0.035, { type: 'sine', gain: gain * 0.4 });
    this.noise(t, 0.025, { type: 'highpass', freq: 5000, gain: gain * 0.7 });
  }

  play(name: SoundName, opts: { delay?: number; count?: number } = {}) {
    if (this.muted || this.volume <= 0) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (ctx.state === 'suspended') void ctx.resume();
    // Avoid machine-gun repeats of the same sound in the same instant.
    const nowMs = performance.now();
    const last = this.lastPlayed.get(name) ?? 0;
    if (!opts.delay && nowMs - last < 25 && name !== 'deal' && name !== 'flip') return;
    this.lastPlayed.set(name, nowMs);

    const t = ctx.currentTime + 0.005 + (opts.delay ?? 0);
    switch (name) {
      case 'deal': {
        this.noise(t, 0.11, { type: 'bandpass', freq: 3200, freqEnd: 1300, q: 0.9, gain: 0.32, attack: 0.008 });
        this.noise(t + 0.06, 0.03, { type: 'highpass', freq: 4000, gain: 0.12 });
        break;
      }
      case 'flip': {
        this.noise(t, 0.03, { type: 'highpass', freq: 2800, gain: 0.25 });
        this.noise(t + 0.045, 0.05, { type: 'bandpass', freq: 1800, q: 1.4, gain: 0.22 });
        this.tone(t + 0.045, 700, 0.04, { type: 'sine', gain: 0.06 });
        break;
      }
      case 'chip':
        this.clack(t);
        break;
      case 'chips': {
        const n = Math.max(2, Math.min(8, opts.count ?? 4));
        for (let i = 0; i < n; i++) this.clack(t + i * (0.035 + Math.random() * 0.03), 0.16 + Math.random() * 0.08);
        break;
      }
      case 'pot': {
        for (let i = 0; i < 9; i++) this.clack(t + i * 0.045 + Math.random() * 0.02, 0.1 + Math.random() * 0.1);
        this.noise(t, 0.4, { type: 'bandpass', freq: 3500, freqEnd: 2000, q: 0.6, gain: 0.06, attack: 0.05 });
        break;
      }
      case 'check': {
        for (const dt of [0, 0.11]) {
          this.tone(t + dt, 190, 0.09, { type: 'sine', gain: 0.45, freqEnd: 90 });
          this.noise(t + dt, 0.03, { type: 'lowpass', freq: 900, gain: 0.25 });
        }
        break;
      }
      case 'fold': {
        this.noise(t, 0.28, { type: 'bandpass', freq: 2200, freqEnd: 500, q: 0.8, gain: 0.2, attack: 0.03 });
        break;
      }
      case 'allin': {
        const ctx2 = this.ctx!;
        const osc = ctx2.createOscillator();
        const filter = ctx2.createBiquadFilter();
        const g = ctx2.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(82, t);
        osc.frequency.exponentialRampToValueAtTime(110, t + 0.7);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(250, t);
        filter.frequency.exponentialRampToValueAtTime(1800, t + 0.6);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        osc.connect(filter);
        filter.connect(g);
        g.connect(this.master!);
        osc.start(t);
        osc.stop(t + 1);
        this.noise(t, 0.7, { type: 'bandpass', freq: 600, freqEnd: 5000, q: 0.7, gain: 0.1, attack: 0.4 });
        for (let i = 0; i < 6; i++) this.clack(t + 0.45 + i * 0.04, 0.15);
        break;
      }
      case 'click':
        this.tone(t, 1250, 0.035, { type: 'sine', gain: 0.12 });
        break;
      case 'turn': {
        this.tone(t, 880, 0.35, { type: 'sine', gain: 0.18, attack: 0.01 });
        this.tone(t + 0.1, 1318.5, 0.45, { type: 'sine', gain: 0.16, attack: 0.01 });
        this.tone(t + 0.1, 2637, 0.25, { type: 'sine', gain: 0.03, attack: 0.01 });
        break;
      }
      case 'tick':
        this.tone(t, 1500, 0.045, { type: 'sine', gain: 0.14 });
        break;
      case 'urgent':
        this.tone(t, 1980, 0.07, { type: 'triangle', gain: 0.18 });
        this.tone(t + 0.09, 1980, 0.07, { type: 'triangle', gain: 0.14 });
        break;
      case 'win':
      case 'bigwin': {
        const notes = name === 'bigwin' ? [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568] : [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((f, i) => {
          this.tone(t + i * 0.085, f, 0.5, { type: 'triangle', gain: 0.16, attack: 0.008 });
          this.tone(t + i * 0.085, f * 2, 0.3, { type: 'sine', gain: 0.04, attack: 0.008 });
        });
        const end = t + notes.length * 0.085;
        this.tone(end, 1046.5, 0.9, { type: 'sine', gain: 0.1, attack: 0.02 });
        this.tone(end, 1318.5, 0.9, { type: 'sine', gain: 0.08, attack: 0.02 });
        this.tone(end, 1568, 0.9, { type: 'sine', gain: 0.08, attack: 0.02 });
        for (let i = 0; i < (name === 'bigwin' ? 14 : 8); i++) this.clack(t + 0.15 + i * 0.05, 0.1 + Math.random() * 0.08);
        break;
      }
      case 'message':
        this.tone(t, 620, 0.09, { type: 'sine', gain: 0.12, freqEnd: 940 });
        break;
      case 'reaction':
        this.tone(t, 420, 0.12, { type: 'sine', gain: 0.12, freqEnd: 1100 });
        this.tone(t + 0.05, 900, 0.08, { type: 'sine', gain: 0.05 });
        break;
      case 'error':
        this.tone(t, 220, 0.12, { type: 'square', gain: 0.06 });
        this.tone(t + 0.14, 196, 0.16, { type: 'square', gain: 0.06 });
        break;
      case 'join':
        this.tone(t, 660, 0.15, { type: 'sine', gain: 0.12 });
        this.tone(t + 0.08, 990, 0.2, { type: 'sine', gain: 0.1 });
        break;
      case 'bonus': {
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(t + i * 0.06, f, 0.3, { type: 'triangle', gain: 0.13 }));
        for (let i = 0; i < 10; i++) this.clack(t + 0.2 + i * 0.04, 0.12);
        break;
      }
    }
  }
}

export const sound = new SoundEngine();

export function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}
