import * as THREE from 'three';
import type { Forest } from './forest';
import type { Post } from './post';

export type Mode = 'day' | 'dusk' | 'night' | 'dark';

/** Todo lo que cambia con la hora: luz, niebla, partículas y gradación de color. */
interface Look {
  fog: number;
  fogNear: number;
  fogFar: number;
  sun: number;
  sunI: number;
  sunPos: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  lamp: number;
  fire: number;
  bloom: number;
  saturation: number;
  tint: number;
  motes: number;
  motesOpacity: number;
  fireflies: number;
  exposure: number;
}

export const LOOKS: Record<Mode, Look> = {
  day: {
    fog: 0xd8dcc0, fogNear: 26, fogFar: 70,
    sun: 0xfff0d4, sunI: 2.6, sunPos: [-10, 16, 9],
    hemiSky: 0xcfe0ff, hemiGround: 0x6a5a38, hemiI: 0.9,
    lamp: 0, fire: 1.2, bloom: 0.35, saturation: 1.2, tint: 0xfff6e8,
    motes: 0xfff0b0, motesOpacity: 0.55, fireflies: 0, exposure: 1.05,
  },
  dusk: {
    fog: 0xe0a882, fogNear: 22, fogFar: 62,
    sun: 0xffb070, sunI: 2.4, sunPos: [-16, 7, 8],
    hemiSky: 0xffb890, hemiGround: 0x3a2a3a, hemiI: 0.6,
    lamp: 14, fire: 8, bloom: 0.6, saturation: 1.12, tint: 0xfff0e0,
    motes: 0xffc070, motesOpacity: 0.7, fireflies: 0.3, exposure: 1.0,
  },
  night: {
    fog: 0x1c2a44, fogNear: 18, fogFar: 55,
    sun: 0x8aa8ff, sunI: 0.55, sunPos: [8, 14, -4],
    hemiSky: 0x4a5a90, hemiGround: 0x141420, hemiI: 0.6,
    lamp: 40, fire: 22, bloom: 0.9, saturation: 1.1, tint: 0xd8e0ff,
    motes: 0x9ab8ff, motesOpacity: 0.25, fireflies: 1, exposure: 1.1,
  },
  dark: {
    fog: 0x2e1a40, fogNear: 16, fogFar: 50,
    sun: 0xb080ff, sunI: 0.55, sunPos: [6, 12, -6],
    hemiSky: 0x6a3a9a, hemiGround: 0x120a18, hemiI: 0.6,
    lamp: 12, fire: 16, bloom: 0.85, saturation: 0.85, tint: 0xe4d0ff,
    motes: 0xc080ff, motesOpacity: 0.8, fireflies: 0, exposure: 1.15,
  },
};

const col = (n: number) => new THREE.Color(n);

/** Interpola suavemente de la luz actual a la de otro momento del día. */
export class LookController {
  private from: Look;
  private to: Look;
  private k = 1;
  mode: Mode;

  constructor(
    private scene: THREE.Scene,
    private renderer: THREE.WebGLRenderer,
    private forest: Forest,
    private post: Post,
    mode: Mode,
  ) {
    this.mode = mode;
    this.from = LOOKS[mode];
    this.to = LOOKS[mode];
    this.apply(1);
  }

  set(mode: Mode) {
    this.from = this.current();
    this.to = LOOKS[mode];
    this.mode = mode;
    this.k = 0;
  }

  /** Valores intermedios en el punto actual de la transición. */
  private current(): Look {
    const k = this.ease(this.k);
    const a = this.from;
    const b = this.to;
    const mix = (x: number, y: number) => x + (y - x) * k;
    const mixC = (x: number, y: number) => col(x).lerp(col(y), k).getHex();
    return {
      fog: mixC(a.fog, b.fog),
      fogNear: mix(a.fogNear, b.fogNear),
      fogFar: mix(a.fogFar, b.fogFar),
      sun: mixC(a.sun, b.sun),
      sunI: mix(a.sunI, b.sunI),
      sunPos: [mix(a.sunPos[0], b.sunPos[0]), mix(a.sunPos[1], b.sunPos[1]), mix(a.sunPos[2], b.sunPos[2])],
      hemiSky: mixC(a.hemiSky, b.hemiSky),
      hemiGround: mixC(a.hemiGround, b.hemiGround),
      hemiI: mix(a.hemiI, b.hemiI),
      lamp: mix(a.lamp, b.lamp),
      fire: mix(a.fire, b.fire),
      bloom: mix(a.bloom, b.bloom),
      saturation: mix(a.saturation, b.saturation),
      tint: mixC(a.tint, b.tint),
      motes: mixC(a.motes, b.motes),
      motesOpacity: mix(a.motesOpacity, b.motesOpacity),
      fireflies: mix(a.fireflies, b.fireflies),
      exposure: mix(a.exposure, b.exposure),
    };
  }

  private ease(t: number) {
    return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  }

  update(dt: number) {
    if (this.k >= 1) return;
    this.k = Math.min(1, this.k + dt / 1.6);
    this.apply(this.k);
  }

  private apply(_k: number) {
    const L = this.current();
    const f = this.forest;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(L.fog);
    fog.near = L.fogNear;
    fog.far = L.fogFar;
    (this.scene.background as THREE.Color).set(L.fog);
    f.sun.color.set(L.sun);
    f.sun.intensity = L.sunI;
    f.sun.position.set(...L.sunPos);
    f.hemi.color.set(L.hemiSky);
    f.hemi.groundColor.set(L.hemiGround);
    f.hemi.intensity = L.hemiI;
    f.lamp.intensity = L.lamp;
    f.fire.userData.base = L.fire;
    const glow = Math.min(1, L.lamp / 14);
    (f.lampGlow.material as THREE.MeshBasicMaterial).color.setRGB(0.42 + glow * 2.4, 0.36 + glow * 1.5, 0.26 + glow * 0.6);
    const motes = f.motes.material as THREE.ShaderMaterial;
    motes.uniforms.uColor.value.set(L.motes);
    motes.uniforms.uOpacity.value = L.motesOpacity;
    (f.fireflies.material as THREE.ShaderMaterial).uniforms.uOpacity.value = L.fireflies;
    for (const s of f.shades) s.mesh.visible = this.mode === 'dark' && this.k > 0.3;
    this.post.setGrade(L.saturation, L.tint, L.bloom);
    this.renderer.toneMappingExposure = L.exposure;
  }
}
