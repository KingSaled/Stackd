/**
 * Procedural sound design with the Web Audio API — no audio files.
 *
 * Instead of plain oscillator beeps, every effect is modelled on the physical
 * event it represents and placed in a small room:
 *  - clay chips: a short noise strike exciting a few inharmonic ringing modes,
 *    with randomised pitch/decay so no two clacks are identical,
 *  - cards: pink-noise "slides" across felt with a soft landing tap, crisp snaps
 *    for flips and a riffle for the shuffle,
 *  - checks: knuckle knocks on a padded rail (resonant low thumps),
 *  - musical cues: FM bells and electric-piano tones for turn/win/bonus,
 *  - everything runs through a generated stereo room reverb, and table sounds
 *    are panned toward the seat they come from.
 */

export type SoundName =
  | 'deal'
  | 'shuffle'
  | 'flip'
  | 'chip'
  | 'chips'
  | 'collect'
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

export interface PlayOptions {
  /** Seconds from now. */
  delay?: number;
  /** Number of chips for chip sounds. */
  count?: number;
  /** Stereo position -1 (left) … 1 (right). */
  pan?: number;
}

interface Bus {
  out: AudioNode;
  t: number;
}

const MIDI = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private white: AudioBuffer | null = null;
  private pink: AudioBuffer | null = null;
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
      comp.threshold.value = -18;
      comp.knee.value = 18;
      comp.ratio.value = 3;
      comp.attack.value = 0.002;
      comp.release.value = 0.2;
      // Gentle high shelf removes digital harshness.
      const tone = ctx.createBiquadFilter();
      tone.type = 'highshelf';
      tone.frequency.value = 9000;
      tone.gain.value = -4;
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : this.volume;
      master.connect(tone);
      tone.connect(comp);
      comp.connect(ctx.destination);

      const reverb = ctx.createConvolver();
      reverb.buffer = this.makeRoom(ctx, 1.7, 0.42);
      const wet = ctx.createGain();
      wet.gain.value = 0.9;
      reverb.connect(wet);
      wet.connect(master);

      this.ctx = ctx;
      this.master = master;
      this.reverb = reverb;
      this.white = this.makeNoise(ctx, false);
      this.pink = this.makeNoise(ctx, true);
      return ctx;
    } catch {
      return null;
    }
  }

  private makeNoise(ctx: AudioContext, pink: boolean): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 1.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (!pink) {
        d[i] = w;
        continue;
      }
      // Paul Kellet's pink noise filter: softer, more natural textures.
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    return buf;
  }

  /** Stereo impulse response of a warm, small room. */
  private makeRoom(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const pre = Math.floor(ctx.sampleRate * 0.012);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / ctx.sampleRate;
        // One-pole low-pass that closes over time: high frequencies die first (warmth).
        const k = 0.55 - 0.45 * Math.min(1, t / seconds);
        lp += k * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.exp(-t / decay);
      }
      // A few early reflections.
      for (const [ms, g] of [[9, 0.5], [17, 0.35], [29, 0.25], [41, 0.18]]) {
        const idx = Math.floor((ms + ch * 3) * ctx.sampleRate * 0.001);
        if (idx < len) d[idx] += g * (ch ? -1 : 1);
      }
    }
    return buf;
  }

  /** A voice bus: optional pan → dry to master, plus a reverb send. */
  private bus(t: number, pan = 0, send = 0.12): Bus {
    const ctx = this.ctx!;
    const input = ctx.createGain();
    let node: AudioNode = input;
    if (pan && 'createStereoPanner' in ctx) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      input.connect(p);
      node = p;
    }
    node.connect(this.master!);
    if (send > 0 && this.reverb) {
      const s = ctx.createGain();
      s.gain.value = send;
      node.connect(s);
      s.connect(this.reverb);
    }
    return { out: input, t };
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number, shape: 'exp' | 'lin' = 'exp') {
    g.gain.setValueAtTime(0.0001, t);
    if (shape === 'lin') g.gain.linearRampToValueAtTime(peak, t + attack);
    else g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  /** Filtered noise burst. */
  private noise(
    b: Bus,
    at: number,
    dur: number,
    o: { type?: BiquadFilterType; f?: number; f2?: number; q?: number; gain?: number; attack?: number; pink?: boolean; lin?: boolean },
  ) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = o.pink ? this.pink : this.white;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.f ?? 2000, at);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, at + dur);
    f.Q.value = o.q ?? 0.8;
    const g = ctx.createGain();
    this.env(g, at, o.gain ?? 0.3, o.attack ?? 0.002, dur, o.lin ? 'lin' : 'exp');
    src.connect(f);
    f.connect(g);
    g.connect(b.out);
    src.start(at, Math.random() * 1.2, dur + (o.attack ?? 0.002) + 0.1);
  }

  /** Decaying sine partial. */
  private partial(b: Bus, at: number, freq: number, decay: number, gain: number, o: { attack?: number; glide?: number } = {}) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, at);
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(freq * o.glide, at + decay);
    const g = ctx.createGain();
    this.env(g, at, gain, o.attack ?? 0.001, decay);
    osc.connect(g);
    g.connect(b.out);
    osc.start(at);
    osc.stop(at + (o.attack ?? 0.001) + decay + 0.05);
  }

  /** FM bell / electric-piano tone. ratio ~1 = e-piano, ~1.4/3.5 = bell. */
  private fm(b: Bus, at: number, freq: number, dur: number, gain: number, ratio: number, index: number, attack = 0.004) {
    const ctx = this.ctx!;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    car.frequency.value = freq;
    mod.frequency.value = freq * ratio;
    // Modulation index decays faster than the note: bright attack, mellow tail.
    modGain.gain.setValueAtTime(freq * index, at);
    modGain.gain.exponentialRampToValueAtTime(freq * index * 0.08 + 1, at + dur * 0.5);
    mod.connect(modGain);
    modGain.connect(car.frequency);
    const g = ctx.createGain();
    this.env(g, at, gain, attack, dur);
    car.connect(g);
    g.connect(b.out);
    car.start(at);
    mod.start(at);
    car.stop(at + attack + dur + 0.05);
    mod.stop(at + attack + dur + 0.05);
  }

  /* -------------------------------------------------------------- Instruments */

  /** One clay chip striking another. */
  private clack(b: Bus, at: number, gain = 0.25) {
    const f0 = 2300 + Math.random() * 900;
    this.noise(b, at, 0.012, { type: 'bandpass', f: 4200, q: 0.9, gain: gain * 0.9, attack: 0.0006 });
    this.partial(b, at, f0, 0.028 + Math.random() * 0.015, gain * 0.5);
    this.partial(b, at, f0 * 1.59, 0.02, gain * 0.28);
    this.partial(b, at, f0 * 2.31, 0.013, gain * 0.16);
    this.noise(b, at, 0.012, { type: 'lowpass', f: 500, q: 0.7, gain: gain * 0.35, attack: 0.0008 });
  }

  /** A short stack of chips settling: strikes come faster and softer. */
  private stack(b: Bus, at: number, n: number, gain = 0.22) {
    let t = at;
    let gap = 0.05 + Math.random() * 0.015;
    for (let i = 0; i < n; i++) {
      this.clack(b, t, gain * (1 - i * 0.07) * (0.85 + Math.random() * 0.3));
      t += gap;
      gap *= 0.78 + Math.random() * 0.1;
    }
  }

  /** A card sliding across felt, then landing. */
  private slide(b: Bus, at: number, dur = 0.13, gain = 0.3) {
    this.noise(b, at, dur, { type: 'bandpass', f: 2400, f2: 900, q: 0.6, gain, attack: dur * 0.25, pink: true, lin: true });
    this.noise(b, at, dur * 0.9, { type: 'highpass', f: 5000, q: 0.5, gain: gain * 0.15, attack: dur * 0.2 });
    this.noise(b, at + dur * 0.9, 0.018, { type: 'lowpass', f: 1400, q: 0.8, gain: gain * 0.45, attack: 0.001 });
  }

  /** Knuckles on the padded rail. */
  private knock(b: Bus, at: number, gain = 0.5) {
    this.noise(b, at, 0.03, { type: 'lowpass', f: 900, q: 1.2, gain: gain * 0.6, attack: 0.001 });
    this.partial(b, at, 145, 0.09, gain * 0.7, { glide: 0.7 });
    this.partial(b, at, 310, 0.05, gain * 0.25, { glide: 0.85 });
  }

  /** A wooden tick for the countdown. */
  private wood(b: Bus, at: number, f: number, gain = 0.25) {
    this.noise(b, at, 0.006, { type: 'bandpass', f: f * 2, q: 1, gain: gain * 0.5, attack: 0.0005 });
    this.partial(b, at, f, 0.045, gain * 0.7);
    this.partial(b, at, f * 2.76, 0.02, gain * 0.2);
  }

  play(name: SoundName, opts: PlayOptions = {}) {
    if (this.muted || this.volume <= 0) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (ctx.state === 'suspended') void ctx.resume();
    // Avoid machine-gun repeats of the same sound in the same instant.
    const nowMs = performance.now();
    const last = this.lastPlayed.get(name) ?? 0;
    if (!opts.delay && nowMs - last < 25 && name !== 'deal' && name !== 'flip') return;
    this.lastPlayed.set(name, nowMs);

    const t = ctx.currentTime + 0.01 + (opts.delay ?? 0);
    const pan = (opts.pan ?? 0) * 0.7;

    switch (name) {
      case 'deal':
        this.slide(this.bus(t, pan, 0.06), t, 0.11 + Math.random() * 0.03, 0.26);
        break;
      case 'shuffle': {
        // A riffle: dozens of tiny card ticks accelerating then a bridge "fwump".
        const b = this.bus(t, 0, 0.08);
        let x = t;
        for (let i = 0; i < 26; i++) {
          this.noise(b, x, 0.008, { type: 'bandpass', f: 3000 + Math.random() * 1500, q: 1.2, gain: 0.07 + Math.random() * 0.05, attack: 0.0005 });
          x += 0.011 + Math.random() * 0.006;
        }
        this.noise(b, x + 0.02, 0.12, { type: 'lowpass', f: 1600, f2: 600, q: 0.7, gain: 0.18, attack: 0.02, pink: true });
        break;
      }
      case 'flip': {
        const b = this.bus(t, pan, 0.07);
        this.noise(b, t, 0.04, { type: 'bandpass', f: 1800, f2: 3800, q: 0.7, gain: 0.1, attack: 0.012, pink: true });
        this.noise(b, t + 0.04, 0.012, { type: 'highpass', f: 2600, q: 0.6, gain: 0.22, attack: 0.0006 });
        this.noise(b, t + 0.045, 0.02, { type: 'lowpass', f: 1200, q: 0.7, gain: 0.16, attack: 0.001 });
        break;
      }
      case 'chip':
        this.clack(this.bus(t, pan, 0.1), t, 0.24);
        break;
      case 'chips':
        this.stack(this.bus(t, pan, 0.1), t, Math.max(2, Math.min(8, opts.count ?? 4)));
        break;
      case 'collect': {
        // Bets swept into the pot: chips sliding on felt, then settling.
        const b = this.bus(t, 0, 0.1);
        this.noise(b, t, 0.22, { type: 'bandpass', f: 1500, f2: 700, q: 0.5, gain: 0.12, attack: 0.05, pink: true, lin: true });
        this.stack(b, t + 0.2, 3 + Math.floor(Math.random() * 2), 0.14);
        break;
      }
      case 'pot': {
        const b = this.bus(t, pan, 0.12);
        this.noise(b, t, 0.3, { type: 'bandpass', f: 1600, f2: 800, q: 0.5, gain: 0.12, attack: 0.06, pink: true, lin: true });
        this.stack(b, t + 0.25, 6, 0.18);
        break;
      }
      case 'check': {
        const b = this.bus(t, pan, 0.08);
        this.knock(b, t, 0.5);
        this.knock(b, t + 0.12, 0.38);
        break;
      }
      case 'fold': {
        const b = this.bus(t, pan, 0.06);
        this.slide(b, t, 0.16, 0.18);
        this.slide(b, t + 0.03, 0.16, 0.12);
        break;
      }
      case 'allin': {
        const b = this.bus(t, pan, 0.18);
        // Rising tension, a deep thud, then the whole stack going in.
        this.noise(b, t, 0.32, { type: 'bandpass', f: 300, f2: 2400, q: 0.9, gain: 0.07, attack: 0.3, pink: true, lin: true });
        this.partial(b, t + 0.3, 92, 0.6, 0.55, { glide: 0.55, attack: 0.004 });
        this.partial(b, t + 0.3, 184, 0.3, 0.18, { glide: 0.6 });
        this.noise(b, t + 0.3, 0.08, { type: 'lowpass', f: 500, q: 0.8, gain: 0.3, attack: 0.002 });
        this.stack(b, t + 0.34, 8, 0.2);
        break;
      }
      case 'click': {
        const b = this.bus(t, 0, 0);
        this.noise(b, t, 0.006, { type: 'bandpass', f: 2600, q: 1.4, gain: 0.12, attack: 0.0005 });
        this.partial(b, t, 1900, 0.012, 0.03);
        break;
      }
      case 'turn': {
        // Two-note electric-piano chime: noticeable but never alarming.
        const b = this.bus(t, 0, 0.3);
        this.fm(b, t, MIDI(76), 0.9, 0.11, 1, 1.4); // E5
        this.fm(b, t + 0.13, MIDI(83), 1.2, 0.1, 1, 1.2); // B5
        this.fm(b, t + 0.13, MIDI(88), 0.8, 0.025, 3.5, 2); // shimmer
        break;
      }
      case 'tick':
        this.wood(this.bus(t, 0, 0.05), t, 1150, 0.2);
        break;
      case 'urgent': {
        const b = this.bus(t, 0, 0.05);
        this.wood(b, t, 1500, 0.24);
        this.wood(b, t + 0.1, 1500, 0.18);
        break;
      }
      case 'win':
      case 'bigwin': {
        const big = name === 'bigwin';
        const b = this.bus(t, pan, 0.32);
        // Chips raked in and stacked…
        this.noise(b, t, 0.28, { type: 'bandpass', f: 1500, f2: 700, q: 0.5, gain: 0.12, attack: 0.06, pink: true, lin: true });
        this.stack(b, t + 0.22, big ? 10 : 6, 0.17);
        // …over a warm bell arpeggio (G major add9).
        const notes = big ? [67, 71, 74, 79, 81, 83, 86] : [67, 71, 74, 79];
        notes.forEach((n, i) => this.fm(b, t + 0.12 + i * 0.075, MIDI(n), 1.4, 0.07, 3.5, 1.6));
        const end = t + 0.12 + notes.length * 0.075;
        this.fm(b, end, MIDI(79), 2, 0.06, 1, 0.9);
        this.fm(b, end, MIDI(83), 2, 0.05, 1, 0.9);
        this.fm(b, end, MIDI(86), 2, 0.045, 1, 0.9);
        if (big) {
          // Low warm swell underneath.
          this.partial(b, t + 0.1, MIDI(43), 1.8, 0.12, { attack: 0.25 });
          this.partial(b, t + 0.1, MIDI(50), 1.8, 0.07, { attack: 0.3 });
        }
        break;
      }
      case 'message': {
        const b = this.bus(t, 0, 0.25);
        this.fm(b, t, MIDI(84), 0.35, 0.05, 3.01, 1.2);
        this.fm(b, t + 0.06, MIDI(91), 0.3, 0.025, 3.01, 1);
        break;
      }
      case 'reaction': {
        const b = this.bus(t, pan, 0.2);
        this.partial(b, t, 380, 0.08, 0.14, { glide: 2.1, attack: 0.005 });
        this.fm(b, t + 0.04, MIDI(86), 0.25, 0.035, 2, 1);
        break;
      }
      case 'error': {
        const b = this.bus(t, 0, 0.15);
        this.knock(b, t, 0.3);
        this.fm(b, t, MIDI(57), 0.35, 0.06, 1, 0.8);
        this.fm(b, t + 0.12, MIDI(53), 0.45, 0.06, 1, 0.8);
        break;
      }
      case 'join': {
        const b = this.bus(t, pan, 0.3);
        this.fm(b, t, MIDI(79), 0.8, 0.05, 3.5, 1.3);
        this.fm(b, t + 0.09, MIDI(86), 0.9, 0.04, 3.5, 1.3);
        break;
      }
      case 'bonus': {
        const b = this.bus(t, 0, 0.3);
        [72, 76, 79, 84, 88].forEach((n, i) => this.fm(b, t + i * 0.07, MIDI(n), 1.2, 0.065, 3.5, 1.6));
        this.stack(b, t + 0.35, 9, 0.16);
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

/** Stereo position of a seat on screen (-1 left … 1 right), read from the rendered table. */
export function seatPan(seat: number | undefined): number {
  if (seat == null || typeof document === 'undefined') return 0;
  const el = document.querySelector(`[data-seat="${seat}"]`);
  if (!el) return 0;
  const r = el.getBoundingClientRect();
  return Math.max(-1, Math.min(1, ((r.left + r.width / 2) / window.innerWidth) * 2 - 1));
}
