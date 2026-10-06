/**
 * Audio 100% procedural con WebAudio: música ambiental generativa que
 * cambia entre el día y la noche, y efectos sintetizados. Sin archivos.
 */

export type Sfx =
  | 'click'
  | 'select'
  | 'error'
  | 'step'
  | 'swing'
  | 'hit'
  | 'hurt'
  | 'death'
  | 'build'
  | 'collapse'
  | 'levelUp'
  | 'nightfall'
  | 'dawn'
  | 'thunder'
  | 'roar'
  | 'spawn'
  | 'zap'
  | 'heal'
  | 'good'
  | 'bad'
  | 'victory'
  | 'defeat';

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

// Progresiones en Re: luminosa de día, menor y grave de noche.
const DAY_CHORDS = [
  [62, 66, 69, 73], // Dmaj7
  [59, 62, 66, 69], // Bm7
  [55, 59, 62, 66], // Gmaj7
  [57, 61, 64, 67], // A7sus
];
const NIGHT_CHORDS = [
  [50, 57, 62, 65], // Dm
  [46, 53, 58, 62], // Bb
  [48, 55, 60, 63], // Cm
  [45, 52, 57, 61], // A
];
const DAY_SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81];
const NIGHT_SCALE = [62, 65, 67, 69, 72, 74, 77];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private dayBus!: GainNode;
  private nightBus!: GainNode;
  private delay!: DelayNode;
  private wind!: GainNode;
  private noise!: AudioBuffer;
  private timer: number | null = null;
  private nextBar = 0;
  private bar = 0;
  private night = 0;

  musicVolume = 0.55;
  sfxVolume = 0.8;
  muted = false;

  /** Debe llamarse tras un gesto del usuario (política de autoplay). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    this.master = ctx.createGain();
    this.master.connect(comp).connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);

    this.dayBus = ctx.createGain();
    this.nightBus = ctx.createGain();
    this.nightBus.gain.value = 0;

    // Eco suave compartido por la música.
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    this.delay.connect(tone).connect(fb).connect(this.delay);
    this.delay.connect(this.musicBus);
    this.dayBus.connect(this.musicBus);
    this.nightBus.connect(this.musicBus);
    this.dayBus.connect(this.delay);
    this.nightBus.connect(this.delay);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.startWind();
    this.applyVolumes();
    this.nextBar = ctx.currentTime + 0.2;
    this.timer = window.setInterval(() => this.schedule(), 250);
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.musicVolume * 0.5, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.sfxVolume * 0.7, t, 0.05);
  }

  /** 0 = día, 1 = noche. Funde la música y el viento. */
  setNight(f: number) {
    if (!this.ctx || Math.abs(f - this.night) < 0.01) return;
    this.night = f;
    const t = this.ctx.currentTime;
    this.dayBus.gain.setTargetAtTime(1 - f, t, 0.4);
    this.nightBus.gain.setTargetAtTime(f, t, 0.4);
    this.wind.gain.setTargetAtTime(0.025 + f * 0.05, t, 0.6);
  }

  dispose() {
    if (this.timer !== null) clearInterval(this.timer);
    void this.ctx?.close();
  }

  // ───────────────────────── música ─────────────────────────

  private schedule() {
    const ctx = this.ctx!;
    const barLen = 4.8;
    while (this.nextBar < ctx.currentTime + 1) {
      const t = this.nextBar;
      const i = this.bar % 4;
      for (const n of DAY_CHORDS[i]) this.pad(midi(n), t, barLen + 1.5, this.dayBus, 0.05);
      for (const n of NIGHT_CHORDS[i]) this.pad(midi(n - 12), t, barLen + 1.5, this.nightBus, 0.055, 520);
      // Arpegios dispersos: más vivos de día, campanas lentas de noche.
      for (let k = 0; k < 8; k++) {
        if (Math.random() < 0.42) {
          const n = DAY_SCALE[Math.floor(Math.random() * DAY_SCALE.length)];
          this.pluck(midi(n), t + k * (barLen / 8), this.dayBus, 0.045);
        }
      }
      for (let k = 0; k < 3; k++) {
        if (Math.random() < 0.45) {
          const n = NIGHT_SCALE[Math.floor(Math.random() * NIGHT_SCALE.length)];
          this.bell(midi(n), t + k * (barLen / 3) + Math.random() * 0.3, this.nightBus, 0.03, 3.5);
        }
      }
      this.nextBar += barLen;
      this.bar++;
    }
  }

  private pad(freq: number, t: number, dur: number, out: AudioNode, vol: number, cutoff = 1100) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.Q.value = 0.4;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 1.6);
    g.gain.setValueAtTime(vol, t + dur - 1.8);
    g.gain.linearRampToValueAtTime(0, t + dur);
    f.connect(g).connect(out);
    for (const detune of [-7, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  private pluck(freq: number, t: number, out: AudioNode, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 1.3);
  }

  private bell(freq: number, t: number, out: AudioNode, vol: number, decay = 2) {
    const ctx = this.ctx!;
    for (const [mult, amp] of [
      [1, 1],
      [2.76, 0.35],
      [5.4, 0.12],
    ]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * amp, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay / mult ** 0.3);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + decay + 0.1);
    }
  }

  private startWind() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 300;
    lfo.connect(lfoGain).connect(bp.frequency);
    this.wind = ctx.createGain();
    this.wind.gain.value = 0.025;
    src.connect(bp).connect(this.wind).connect(this.musicBus);
    src.start();
    lfo.start();
  }

  // ───────────────────────── efectos ─────────────────────────

  play(name: Sfx) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + 0.005;
    const out = this.sfxBus;
    switch (name) {
      case 'click':
        this.tone('sine', 900, 700, t, 0.05, 0.12, out);
        break;
      case 'select':
        this.tone('triangle', 660, 660, t, 0.07, 0.15, out);
        this.tone('triangle', 990, 990, t + 0.06, 0.09, 0.12, out);
        break;
      case 'error':
        this.tone('square', 160, 120, t, 0.14, 0.06, out);
        break;
      case 'step':
        this.burst(t, 0.07, 700, 'lowpass', 0.22, out);
        break;
      case 'swing':
        this.burst(t, 0.16, 1800, 'highpass', 0.18, out, 4000);
        break;
      case 'hit':
        this.burst(t, 0.12, 1200, 'lowpass', 0.4, out);
        this.tone('sine', 160, 50, t, 0.18, 0.5, out);
        break;
      case 'hurt':
        this.tone('sawtooth', 220, 110, t, 0.2, 0.12, out, 900);
        this.burst(t, 0.1, 900, 'lowpass', 0.3, out);
        break;
      case 'death':
        this.tone('sawtooth', 300, 60, t, 0.7, 0.14, out, 700);
        this.burst(t + 0.05, 0.5, 400, 'lowpass', 0.25, out, 100);
        break;
      case 'build':
        for (let i = 0; i < 3; i++) {
          this.tone('triangle', 240 - i * 20, 180 - i * 20, t + i * 0.12, 0.08, 0.3, out);
          this.burst(t + i * 0.12, 0.05, 1500, 'bandpass', 0.15, out);
        }
        break;
      case 'collapse':
        this.burst(t, 0.9, 500, 'lowpass', 0.45, out, 80);
        this.tone('sine', 90, 40, t, 0.8, 0.3, out);
        break;
      case 'levelUp':
        [72, 76, 79, 84, 88].forEach((n, i) => this.bell(midi(n), t + i * 0.08, out, 0.12, 1.6));
        break;
      case 'nightfall':
        this.bell(midi(38), t, out, 0.35, 5);
        this.bell(midi(45), t + 0.02, out, 0.15, 4);
        break;
      case 'dawn':
        [62, 66, 69, 74, 78].forEach((n, i) => this.bell(midi(n), t + i * 0.18, out, 0.1, 3));
        break;
      case 'thunder':
        this.burst(t, 0.15, 3000, 'lowpass', 0.6, out);
        this.burst(t + 0.1, 2.6, 300, 'lowpass', 0.55, out, 60);
        break;
      case 'roar':
        this.tone('sawtooth', 70, 45, t, 1.6, 0.35, out, 500, 6);
        this.tone('sawtooth', 105, 60, t, 1.4, 0.2, out, 700, 5);
        this.burst(t, 1.5, 300, 'lowpass', 0.3, out, 120);
        break;
      case 'spawn':
        this.burst(t, 0.6, 200, 'bandpass', 0.25, out, 1600);
        this.tone('sine', 120, 70, t, 0.6, 0.12, out);
        break;
      case 'zap':
        this.tone('square', 1400, 300, t, 0.18, 0.08, out, 3000);
        break;
      case 'heal':
        [76, 81, 88].forEach((n, i) => this.bell(midi(n), t + i * 0.07, out, 0.05, 1.2));
        break;
      case 'good':
        this.bell(midi(81), t, out, 0.1, 1.2);
        this.bell(midi(88), t + 0.1, out, 0.08, 1.5);
        break;
      case 'bad':
        this.tone('triangle', 330, 311, t, 0.4, 0.15, out);
        this.tone('triangle', 233, 220, t + 0.18, 0.5, 0.15, out);
        break;
      case 'victory':
        [62, 66, 69, 74, 78, 81, 86].forEach((n, i) => this.bell(midi(n), t + i * 0.14, out, 0.14, 4));
        break;
      case 'defeat':
        [57, 53, 50, 45].forEach((n, i) => this.bell(midi(n), t + i * 0.4, out, 0.16, 4));
        break;
    }
  }

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    t: number,
    dur: number,
    vol: number,
    out: AudioNode,
    cutoff = 8000,
    vibrato = 0,
  ) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = vibrato;
      lg.gain.value = f0 * 0.06;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(
    t: number,
    dur: number,
    freq: number,
    type: BiquadFilterType,
    vol: number,
    out: AudioNode,
    freqEnd?: number,
  ) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }
}

export const audio = new AudioEngine();
