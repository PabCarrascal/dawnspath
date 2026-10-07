import * as THREE from 'three';
import { Rng } from '../core/rng';

/**
 * Lienzo de pixel art: se pinta píxel a píxel en memoria y se vuelca a una
 * textura con filtrado "nearest", para que en 3D se vea nítido y en bloques.
 */
export class Px {
  readonly canvas: HTMLCanvasElement;
  private img: ImageData;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.img = new ImageData(w, h);
  }

  set(x: number, y: number, color: number, alpha = 255) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const d = this.img.data;
    d[i] = (color >> 16) & 255;
    d[i + 1] = (color >> 8) & 255;
    d[i + 2] = color & 255;
    d[i + 3] = alpha;
  }

  /** Píxel en coordenadas que se repiten (para texturas de mosaico). */
  wrap(x: number, y: number, color: number) {
    this.set(((x % this.w) + this.w) % this.w, ((y % this.h) + this.h) % this.h, color);
  }

  rect(x: number, y: number, w: number, h: number, color: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
  }

  alphaAt(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.img.data[(y * this.w + x) * 4 + 3];
  }

  colorAt(x: number, y: number) {
    const i = (y * this.w + x) * 4;
    const d = this.img.data;
    return (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
  }

  /** Rellena todo con ruido de una paleta (pesos opcionales). */
  noise(rng: Rng, colors: number[], weights?: number[]) {
    const total = weights?.reduce((a, b) => a + b, 0) ?? colors.length;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        let r = rng.next() * total;
        let k = 0;
        if (weights) while (r > weights[k] && k < colors.length - 1) r -= weights[k++];
        else k = Math.floor(r);
        this.set(x, y, colors[k]);
      }
    }
  }

  /** Contorno oscuro alrededor de lo opaco, como en los sprites de 16 bits. */
  outline(color: number) {
    const add: [number, number][] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.alphaAt(x, y)) continue;
        if (this.alphaAt(x - 1, y) || this.alphaAt(x + 1, y) || this.alphaAt(x, y - 1) || this.alphaAt(x, y + 1)) add.push([x, y]);
      }
    }
    for (const [x, y] of add) this.set(x, y, color);
  }

  /** Copia otro lienzo dentro de este (para montar hojas de sprites). */
  blit(src: Px, dx: number, dy: number) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const a = src.alphaAt(x, y);
        if (a) this.set(dx + x, dy + y, src.colorAt(x, y), a);
      }
    }
  }

  flush() {
    this.canvas.getContext('2d')!.putImageData(this.img, 0, 0);
    return this.canvas;
  }

  texture(repeat = false): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(this.flush());
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
}

// ───────────────────────── texturas del terreno ─────────────────────────

export const GRASS = [0x3f7a2e, 0x4c8c34, 0x5a9e3c, 0x6cb044];
export const DIRT = [0x5a3a22, 0x6b4628, 0x7a5230, 0x8a5e38];
export const PATH = [0x9a7448, 0xa8825a, 0xb48e62, 0x8c6840];
export const STONE = [0x6a6a72, 0x7c7c84, 0x8e8e96, 0x5a5a62];

/** Paletas de suelo por bioma: hierba, tierra y camino. */
export const GROUND = {
  green: { grass: GRASS, dirt: DIRT, path: PATH },
  meadow: { grass: [0x4f8f34, 0x5ea43e, 0x6cb648, 0x82c858], dirt: DIRT, path: [0xb08a58, 0xbc9666, 0xc8a270, 0xa07a4c] },
  dry: { grass: [0x6a8a3a, 0x789a42, 0x86a84c, 0x9ab85a], dirt: [0x6a4a2a, 0x7a5630, 0x8a6238, 0x9a6e40], path: [0xa89070, 0xb49c7c, 0xc0a888, 0x988060] },
  bog: { grass: [0x34442a, 0x3e4e2e, 0x4a5a34, 0x58683c], dirt: [0x2e2418, 0x3a2e1e, 0x463824, 0x52422a], path: [0x5a4a32, 0x66553a, 0x726042, 0x4e3e2a] },
  ash: { grass: [0x34303a, 0x3e3944, 0x48424e, 0x2a2630], dirt: [0x2a2028, 0x34282e, 0x3e3036, 0x48383e], path: [0x4a4048, 0x564a52, 0x625660, 0x3e343c] },
  alpine: { grass: [0x4a6a3a, 0x557544, 0x60804c, 0x6e8e58], dirt: [0x5a5048, 0x665a50, 0x726458, 0x4e463e], path: [0x8a8478, 0x969084, 0xa29c90, 0x7a7468] },
};
export type GroundKey = keyof typeof GROUND;

export function grassTop(seed: number, tones = GRASS) {
  const rng = new Rng(seed);
  const p = new Px(16, 16);
  p.noise(rng, tones, [2, 4, 3, 1]);
  // Briznas: trazos verticales de 2 px, más claros arriba
  for (let i = 0; i < 10; i++) {
    const x = rng.int(0, 15);
    const y = rng.int(0, 15);
    p.wrap(x, y, tones[3]);
    p.wrap(x, y + 1, tones[1]);
  }
  // Alguna flor diminuta
  if (rng.chance(0.6)) p.set(rng.int(1, 14), rng.int(1, 14), rng.pick([0xf0e070, 0xf0f0f0, 0xe07090]));
  return p;
}

export function grassSide(seed: number, grass = GRASS, soil = DIRT) {
  const rng = new Rng(seed);
  const p = new Px(16, 16);
  p.noise(rng, soil, [2, 3, 3, 1]);
  for (let x = 0; x < 16; x++) {
    const depth = 3 + rng.int(0, 2);
    for (let y = 0; y < depth; y++) p.set(x, y, y === depth - 1 ? grass[0] : rng.pick(grass.slice(1)));
  }
  for (let i = 0; i < 3; i++) {
    const x = rng.int(1, 14);
    const y = rng.int(7, 14);
    p.set(x, y, 0x9a9aa2);
    p.set(x + 1, y, 0x7c7c84);
  }
  return p;
}

export function dirt(seed: number, tones = DIRT) {
  const rng = new Rng(seed);
  const p = new Px(16, 16);
  p.noise(rng, tones, [2, 3, 3, 1]);
  for (let i = 0; i < 4; i++) {
    const x = rng.int(0, 14);
    const y = rng.int(0, 15);
    p.set(x, y, 0x8e8e96);
    p.set(x + 1, y, 0x6a6a72);
  }
  // Raíces finas
  for (let i = 0; i < 2; i++) {
    let x = rng.int(0, 15);
    for (let y = 0; y < 6; y++) {
      p.wrap(x, rng.int(0, 15) + y, 0x3a2414);
      x += rng.int(-1, 1);
    }
  }
  return p;
}

export function pathTop(seed: number, tones = PATH) {
  const rng = new Rng(seed);
  const p = new Px(16, 16);
  p.noise(rng, tones, [3, 3, 2, 1]);
  for (let i = 0; i < 6; i++) {
    const x = rng.int(0, 14);
    const y = rng.int(0, 14);
    p.set(x, y, 0xc8c0b0);
    p.set(x + 1, y, 0x8e8e96);
    p.set(x, y + 1, 0x7c7c84);
  }
  return p;
}

export function stone(seed: number, tones = STONE) {
  const rng = new Rng(seed);
  const p = new Px(16, 16);
  p.noise(rng, tones, [3, 3, 2, 1]);
  for (let i = 0; i < 3; i++) {
    let x = rng.int(0, 15);
    let y = rng.int(0, 15);
    for (let k = 0; k < 5; k++) {
      p.wrap(x, y, 0x46464e);
      x += rng.int(0, 1);
      y += rng.int(-1, 1);
    }
  }
  return p;
}

export function bark(seed: number) {
  const rng = new Rng(seed);
  const p = new Px(16, 16);
  p.noise(rng, [0x4a2e1a, 0x5a3a22, 0x6a4628], [2, 3, 2]);
  for (let x = 0; x < 16; x += rng.int(2, 4)) for (let y = 0; y < 16; y++) if (rng.chance(0.7)) p.set(x, y, 0x34200f);
  return p;
}

/** Copas: grumos de hojas con luz arriba a la izquierda y huecos oscuros. */
export function leaves(seed: number, tones: number[]) {
  const rng = new Rng(seed);
  const p = new Px(32, 32);
  p.noise(rng, [tones[0], tones[1]], [3, 2]);
  for (let i = 0; i < 26; i++) {
    const cx = rng.int(0, 31);
    const cy = rng.int(0, 31);
    const r = rng.int(2, 4);
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r) continue;
        const lit = x + y < -r * 0.6;
        p.wrap(cx + x, cy + y, lit ? tones[3] : x + y > r * 0.7 ? tones[0] : tones[2]);
      }
    }
  }
  for (let i = 0; i < 18; i++) p.wrap(rng.int(0, 31), rng.int(0, 31), tones[0]);
  return p;
}

export const LEAF_TONES = {
  green: [0x24501e, 0x2f6a26, 0x3e8a32, 0x62ae44],
  pine: [0x183a22, 0x1f4a2a, 0x2a6034, 0x3e7a40],
  orange: [0x8a3a14, 0xb4501c, 0xd8702a, 0xf0a040],
  red: [0x6a1a14, 0x9a2a1c, 0xc23e24, 0xe86a3a],
  gold: [0x8a6a14, 0xb8901c, 0xd8b02a, 0xf0d860],
};

export function water(seed: number) {
  const rng = new Rng(seed);
  const p = new Px(32, 32);
  p.noise(rng, [0x2a6a8a, 0x2f7898, 0x3484a4], [3, 3, 2]);
  for (let i = 0; i < 18; i++) {
    const x = rng.int(0, 31);
    const y = rng.int(0, 31);
    const len = rng.int(2, 5);
    for (let k = 0; k < len; k++) p.wrap(x + k, y, k === 0 || k === len - 1 ? 0x6ab8d0 : 0xa8e0f0);
  }
  return p;
}

export function waterfall(seed: number) {
  const rng = new Rng(seed);
  const p = new Px(16, 32);
  p.noise(rng, [0x5aa8c8, 0x7cc4dc, 0xa8dcec], [2, 3, 2]);
  for (let x = 0; x < 16; x++) {
    if (!rng.chance(0.5)) continue;
    const y0 = rng.int(0, 31);
    for (let k = 0; k < 8; k++) p.wrap(x, y0 + k, 0xf0fbff);
  }
  return p;
}

// ───────────────────────── vegetación en sprites ─────────────────────────

/** Mata de hierba con transparencia. */
export function tuft(seed: number) {
  const rng = new Rng(seed);
  const p = new Px(16, 16);
  for (let i = 0; i < 7; i++) {
    let x = 3 + rng.int(0, 9);
    const h = rng.int(6, 13);
    for (let y = 15; y > 15 - h; y--) {
      const t = (15 - y) / h;
      p.set(x, y, t > 0.7 ? 0x8ccc58 : t > 0.35 ? 0x5a9e3c : 0x3f7a2e);
      if (rng.chance(0.25)) x += rng.chance(0.5) ? 1 : -1;
    }
  }
  return p;
}

/** Flores sobre tallo: rosas, blancas o amarillas. */
export function flowers(seed: number, petal: number, center: number) {
  const rng = new Rng(seed);
  const p = new Px(16, 16);
  for (let i = 0; i < 4; i++) {
    const x = 2 + rng.int(0, 11);
    const top = rng.int(3, 8);
    for (let y = 15; y > top; y--) p.set(x, y, 0x3f7a2e);
    p.set(x - 1, top, petal);
    p.set(x + 1, top, petal);
    p.set(x, top - 1, petal);
    p.set(x, top + 1, petal);
    p.set(x, top, center);
    p.set(x + 1, top + 3, 0x5a9e3c);
  }
  return p;
}

/** Helecho: hojas en abanico. */
export function fern(seed: number) {
  const rng = new Rng(seed);
  const p = new Px(16, 16);
  for (let f = 0; f < 5; f++) {
    const ang = -Math.PI / 2 + (f - 2) * 0.45;
    for (let r = 0; r < 9; r++) {
      const x = 8 + Math.cos(ang) * r;
      const y = 15 + Math.sin(ang) * r;
      p.set(x, y, r > 6 ? 0x6cb044 : 0x3f7a2e);
      if (r % 2 === 0 && r > 1) {
        p.set(x - 1, y + rng.int(0, 1), 0x4c8c34);
        p.set(x + 1, y + rng.int(0, 1), 0x5a9e3c);
      }
    }
  }
  return p;
}

// ───────────────────────── materiales de construcción y suelos ─────────────────────────

/** Adoquines redondeados con juntas oscuras. */
export function cobble(seed: number, tones = [0x8a8478, 0x9a9488, 0xaaa498, 0x7a7468]) {
  const rng = new Rng(seed);
  const p = new Px(16, 16);
  p.rect(0, 0, 16, 16, 0x4a443e);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 2 : 0;
    for (let col = -1; col < 4; col++) {
      const x0 = col * 4 + off;
      const c = rng.pick(tones);
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) p.wrap(x0 + x, row * 4 + y, x + y === 0 ? tones[2] : x + y >= 3 ? tones[3] : c);
    }
  }
  return p;
}

export function ash(seed: number) {
  const rng = new Rng(seed);
  const p = new Px(16, 16);
  p.noise(rng, GROUND.ash.grass, [3, 3, 2, 2]);
  for (let i = 0; i < 5; i++) p.set(rng.int(0, 15), rng.int(0, 15), rng.chance(0.5) ? 0x8a2a3a : 0x6a5a6a);
  return p;
}

export function snow(seed: number) {
  const rng = new Rng(seed);
  const p = new Px(16, 16);
  p.noise(rng, [0xe8eef4, 0xf4f8fc, 0xdce4ee, 0xc8d4e2], [3, 3, 2, 1]);
  return p;
}

export function sand(seed: number) {
  const rng = new Rng(seed);
  const p = new Px(16, 16);
  p.noise(rng, [0xc8b07a, 0xd4bc86, 0xbca06c, 0xe0c894], [3, 3, 2, 1]);
  for (let i = 0; i < 5; i++) p.set(rng.int(0, 15), rng.int(0, 15), 0x8e8e96);
  return p;
}

/** Roca de acantilado: vetas horizontales y grietas. */
export function rock(seed: number, tones = [0x5e5a58, 0x6e6a66, 0x7e7a74, 0x4e4a48]) {
  const rng = new Rng(seed);
  const p = new Px(16, 16);
  p.noise(rng, tones, [3, 3, 2, 2]);
  for (let y = 2; y < 16; y += rng.int(3, 5)) for (let x = 0; x < 16; x++) if (rng.chance(0.7)) p.set(x, y, tones[3]);
  for (let i = 0; i < 3; i++) p.set(rng.int(0, 15), rng.int(0, 15), tones[2]);
  return p;
}

/** Sillares de piedra (murallas, capilla, ruinas). */
export function bricks(seed: number, tones = [0x8a8478, 0x9a9488, 0xa8a296, 0x6a645c]) {
  const rng = new Rng(seed);
  const p = new Px(16, 16);
  p.rect(0, 0, 16, 16, tones[3]);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 4 : 0;
    for (let col = -1; col < 3; col++) {
      const c = rng.pick(tones.slice(0, 3));
      p.rect(((col * 8 + off) % 16 + 16) % 16, row * 4, 7, 3, c);
      if (col * 8 + off + 7 > 16) p.rect(0, row * 4, (col * 8 + off + 7) % 16, 3, c);
      p.set(((col * 8 + off) % 16 + 16) % 16, row * 4, tones[2]);
    }
  }
  return p;
}

/** Enlucido con entramado de madera (casas de aldea). */
export function plaster(seed: number) {
  const rng = new Rng(seed);
  const p = new Px(16, 16);
  p.noise(rng, [0xece2cc, 0xf4ecd8, 0xe0d4ba], [3, 3, 1]);
  const beam = [0x5a3820, 0x6a4428];
  p.rect(0, 0, 16, 1, beam[0]);
  p.rect(0, 15, 16, 1, beam[0]);
  p.rect(0, 0, 1, 16, beam[1]);
  p.rect(15, 0, 1, 16, beam[1]);
  // Viga central y riostras cortas en las esquinas, como el entramado de verdad
  p.rect(0, 7, 16, 1, beam[0]);
  p.rect(7, 0, 1, 16, beam[1]);
  for (let k = 0; k < 4; k++) {
    p.set(1 + k, 6 - k, beam[1]);
    p.set(14 - k, 6 - k, beam[1]);
  }
  return p;
}

/** Tejas en hileras. */
export function roof(seed: number, tones = [0xb8402a, 0xc85032, 0xd8643c, 0x8a2e1e]) {
  const rng = new Rng(seed);
  const p = new Px(16, 16);
  for (let row = 0; row < 4; row++) {
    for (let x = 0; x < 16; x++) {
      const c = rng.pick(tones.slice(0, 3));
      for (let y = 0; y < 4; y++) p.set(x, row * 4 + y, y === 3 ? tones[3] : (x + row * 2) % 4 === 0 ? tones[3] : c);
    }
  }
  return p;
}

export function thatch(seed: number) {
  const rng = new Rng(seed);
  const p = new Px(16, 16);
  p.noise(rng, [0xb8984a, 0xc8a856, 0xa8883e, 0xd8b866], [3, 3, 2, 1]);
  for (let x = 0; x < 16; x++) if (rng.chance(0.5)) p.rect(x, rng.int(0, 15), 1, 3, 0x8a6a2e);
  return p;
}

export function planks(seed: number, tones = [0x7a5030, 0x8a5e38, 0x9a6a40, 0x553418]) {
  const rng = new Rng(seed);
  const p = new Px(16, 16);
  for (let row = 0; row < 4; row++) {
    const c = rng.pick(tones.slice(0, 3));
    p.rect(0, row * 4, 16, 4, c);
    p.rect(0, row * 4 + 3, 16, 1, tones[3]);
    p.set(rng.int(1, 14), row * 4 + 1, tones[3]);
  }
  return p;
}
