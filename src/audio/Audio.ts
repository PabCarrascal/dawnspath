/**
 * Audio con WebAudio: la banda sonora (pistas generadas con MusicGen, en
 * public/music, ver tools/music) con fundidos entre pantallas, un viento de
 * fondo que crece de noche y efectos sintetizados en código.
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

/** Pistas en bucle: castillo, camino de día y de noche, oscuridad, combate y jefe. */
export type Track = 'castle' | 'road' | 'night' | 'dark' | 'battle' | 'boss';
/** Fanfarrias de una sola vez. */
export type Jingle = 'victory' | 'defeat';
/** Todas las pistas, en el orden en que conviene precargarlas (la de la portada primero). */
export const ALL_MUSIC: (Track | Jingle)[] = ['castle', 'road', 'battle', 'night', 'dark', 'boss', 'victory', 'defeat'];

const musicUrl = (name: string) => `${import.meta.env.BASE_URL}music/${name}.m4a`;

/** Las pistas ya traen un fundido de salida de 3 s: la siguiente vuelta entra encima. */
const LOOP_OVERLAP = 3;

interface Playing {
  gain: GainNode;
  srcs: AudioBufferSourceNode[];
  timer: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  /** Baja la música mientras suena una fanfarria. */
  private duck!: GainNode;
  private wind!: GainNode;
  private noise!: AudioBuffer;
  private night = 0;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  /** Bytes ya descargados (la pantalla de carga los baja antes de que haya contexto de audio). */
  private raw = new Map<string, Promise<ArrayBuffer | null>>();
  /** La pista pedida (aunque aún no haya contexto de audio) y la que suena. */
  private want: Track | null = null;
  private playing: Playing | null = null;
  private switches = 0;

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
    this.duck = ctx.createGain();
    this.duck.connect(this.musicBus);
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.startWind();
    this.applyVolumes();
    if (this.want) void this.switchTo(this.want);
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.musicVolume * 0.7, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.sfxVolume * 0.7, t, 0.05);
  }

  /** 0 = día, 1 = noche: el viento sopla más fuerte de noche. */
  setNight(f: number) {
    if (!this.ctx || Math.abs(f - this.night) < 0.01) return;
    this.night = f;
    this.wind.gain.setTargetAtTime(0.025 + f * 0.05, this.ctx.currentTime, 0.6);
  }

  dispose() {
    if (this.playing) clearTimeout(this.playing.timer);
    void this.ctx?.close();
  }

  // ───────────────────────── música ─────────────────────────

  /** Cambia de pista con un fundido (o la apaga con `null`). Si no hay audio aún, la deja pedida. */
  music(name: Track | null) {
    if (name === this.want) return;
    this.want = name;
    if (this.ctx) void this.switchTo(name);
  }

  /** Fanfarria de victoria o de derrota: la música baja mientras suena. */
  async jingle(name: Jingle) {
    const ctx = this.ctx;
    if (!ctx) return;
    const buf = await this.load(name);
    if (!buf) return void this.play(name);
    const t = ctx.currentTime;
    this.duck.gain.setTargetAtTime(0.12, t, 0.15);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.musicBus);
    src.start(t + 0.05);
    this.duck.gain.setTargetAtTime(1, t + buf.duration - 1, 0.8);
  }

  /**
   * Descarga una pista sin decodificarla (no hace falta contexto de audio).
   * `onProgress` recibe la fracción descargada, de 0 a 1.
   */
  preload(name: string, onProgress?: (f: number) => void) {
    let p = this.raw.get(name);
    if (!p) {
      p = fetch(musicUrl(name))
        .then(async (r) => {
          if (!r.ok) throw new Error(r.statusText);
          const total = Number(r.headers.get('content-length')) || 0;
          if (!r.body || !total || !onProgress) return r.arrayBuffer();
          const reader = r.body.getReader();
          const chunks: Uint8Array[] = [];
          let got = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            got += value.length;
            // Si el servidor comprime, la longitud anunciada no cuadra: se topa en 1.
            onProgress(Math.min(1, got / total));
          }
          const out = new Uint8Array(got);
          let at = 0;
          for (const c of chunks) {
            out.set(c, at);
            at += c.length;
          }
          return out.buffer;
        })
        .catch(() => null);
      this.raw.set(name, p);
    }
    void p.then(() => onProgress?.(1));
    return p;
  }

  private load(name: string) {
    let p = this.buffers.get(name);
    if (!p) {
      p = this.preload(name)
        .then((data) => (data ? this.ctx!.decodeAudioData(data) : null))
        .catch(() => null);
      this.buffers.set(name, p);
    }
    return p;
  }

  private async switchTo(name: Track | null) {
    const ctx = this.ctx!;
    const token = ++this.switches;
    if (this.playing) this.fadeOut(this.playing, 1.6);
    this.playing = null;
    if (!name) return;
    const buf = await this.load(name);
    // Mientras cargaba se pudo pedir otra pista.
    if (!buf || token !== this.switches) return;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, ctx.currentTime, 0.5);
    gain.connect(this.duck);
    const playing: Playing = { gain, srcs: [], timer: 0 };
    this.playing = playing;
    // Cada vuelta empieza cuando la anterior entra en su fundido de salida.
    const lap = (at: number) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(gain);
      src.start(at);
      playing.srcs.push(src);
      src.onended = () => playing.srcs.splice(playing.srcs.indexOf(src), 1);
      const next = at + buf.duration - LOOP_OVERLAP;
      playing.timer = window.setTimeout(() => lap(next), Math.max(0, (next - ctx.currentTime - 1) * 1000));
    };
    lap(ctx.currentTime + 0.05);
  }

  private fadeOut(p: Playing, seconds: number) {
    clearTimeout(p.timer);
    p.gain.gain.setTargetAtTime(0, this.ctx!.currentTime, seconds / 4);
    setTimeout(() => {
      for (const s of p.srcs) s.stop();
      p.gain.disconnect();
    }, seconds * 1000 + 200);
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
