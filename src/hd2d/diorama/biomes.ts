import * as THREE from 'three';
import type { Biome } from '../../combat/rules/data';
import * as px from '../pixel';
import { clearCell, D, Grid, W, wx, wz } from './grid';
import type { Kit, TreeKind } from './kit';

type LeafKey = keyof typeof px.LEAF_TONES;

export interface BiomeDef {
  ground: px.GroundKey;
  /** Color hacia el que se tiñe la niebla de cualquier hora, y cuánto. */
  fog?: { color: number; mix: number };
  /** Polvo flotante y luciérnagas (o fuegos fatuos). */
  motes?: number;
  fireflies?: number;
  /** Tinte de la hierba en sprites (ceniza, marjal…). */
  grassTint?: number;
  /** Árboles de fondo, fuera de la maqueta. */
  far: { kinds: TreeKind[]; leaves: LeafKey[] };
  layout(g: Grid, k: { int(a: number, b: number): number; chance(p: number): boolean; next(): number }): void;
  decorate(k: Kit): void;
}

const autumn = (k: Kit): LeafKey => {
  const r = k.rng.next();
  return r < 0.5 ? 'green' : r < 0.72 ? 'orange' : r < 0.86 ? 'gold' : 'red';
};

/** Árboles en las celdas libres, con una probabilidad según su posición. */
function trees(k: Kit, prob: (i: number, j: number) => number, pick: () => [TreeKind, LeafKey], size: [number, number] = [0.8, 1.4]) {
  k.grid.each((i, j, c) => {
    if (c.type === 'river' || c.type === 'pool' || c.type === 'shallow' || clearCell(i, j, 1.5)) return;
    // Delante del claro no hay árboles: taparían la escena.
    if (j >= 11 && i >= 5 && i <= W - 5) return;
    const x = wx(i) + (k.rng.next() - 0.5) * 0.5;
    const z = wz(j) + (k.rng.next() - 0.5) * 0.5;
    if (!k.free(x, z, 1.5) || !k.rng.chance(prob(i, j))) return;
    const [kind, leaf] = pick();
    k.tree(x, z, size[0] + k.rng.next() * (size[1] - size[0]), kind, leaf);
  });
}

/** Rocas sueltas en celdas libres. */
function rocks(k: Kit, n: number, near?: (i: number, j: number) => boolean, tones?: number[]) {
  for (let t = 0; t < n * 4 && n > 0; t++) {
    const i = k.rng.int(0, W - 1);
    const j = k.rng.int(0, D - 1);
    if (near && !near(i, j)) continue;
    const x = wx(i) + (k.rng.next() - 0.5) * 0.6;
    const z = wz(j) + (k.rng.next() - 0.5) * 0.6;
    if (!k.free(x, z, 1.3)) continue;
    k.rock(x, z, 0.15 + k.rng.next() * 0.3, tones);
    n--;
  }
}

const grassy = (k: Kit) => (i: number, j: number) => k.grid.at(i, j)!.type === 'grass';
const nearWater = (k: Kit) => (i: number, j: number) =>
  k.grid.at(i, j)!.type === 'grass' && [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([a, b]) => k.grid.isWater(i + a, j + b));

/** Matas, flores y helechos de un bioma verde. */
function greenery(k: Kit, density = 0.7, flowers = 0.12, tint?: number) {
  const s = k.seed;
  const g = grassy(k);
  k.scatter([k.texture('tuft1', () => px.tuft(s + 30)), k.texture('tuft2', () => px.tuft(s + 31))], 0.5, density, g, tint);
  k.scatter([k.texture('fern', () => px.fern(s + 32))], 0.7, density * 0.25, g, tint);
  if (flowers > 0)
    k.scatter(
      [
        k.texture('fl1', () => px.flowers(s + 33, 0xf080a8, 0xffe070)),
        k.texture('fl2', () => px.flowers(s + 34, 0xf8f8f0, 0xf0c040)),
        k.texture('fl3', () => px.flowers(s + 35, 0xf0d040, 0xc06020)),
      ],
      0.5,
      flowers,
      g,
    );
}

function reedsAlong(k: Kit, density = 0.6, tint?: number) {
  k.scatter([k.texture('reed', () => px.tuft(k.seed + 36))], 0.85, density, nearWater(k), tint);
}

// ───────────────────────── bosque ─────────────────────────

const riverX = (j: number) => Math.round(6 + 1.6 * Math.sin(j * 0.45 + 0.5));
const pathX = (j: number) => Math.round(14 + 2.2 * Math.sin(j * 0.32 - 0.4));

const forest: BiomeDef = {
  ground: 'green',
  far: { kinds: ['pine', 'round'], leaves: ['pine', 'green', 'orange', 'gold'] },
  layout(g) {
    g.each((i, j) => {
      const rx = riverX(j);
      const pxx = pathX(j);
      let h = 0;
      if (j <= 3 && (i <= 8 || i >= 19)) h = 1;
      if (j <= 1 && (i <= 4 || i >= 22)) h = 2;
      if (i === rx || i === rx + 1) g.set(i, j, 'river');
      else if (i === pxx || i === pxx + 1) g.set(i, j, 'path', h);
      else if (j === 9 && ((i > rx + 1 && i < pxx) || (i < rx && i >= rx - 3))) g.set(i, j, 'path', h);
      else g.set(i, j, 'grass', h);
    });
  },
  decorate(k) {
    trees(k, (i, j) => (j <= 4 ? 0.45 : i <= 2 || i >= W - 3 ? 0.35 : j >= D - 3 ? 0.03 : 0.08), () => {
      const pine = k.rng.chance(0.35);
      return pine ? ['pine', 'pine'] : ['round', autumn(k)];
    });
    greenery(k);
    reedsAlong(k);
    rocks(k, 14, (i, j) => Math.abs(i - riverX(j)) <= 2);
    rocks(k, 8);
    for (let n = 0; n < 12; n++) {
      const x = wx(k.rng.int(1, W - 2));
      const z = wz(k.rng.int(1, D - 3));
      if (k.free(x, z, 1.4)) k.mushroom(x, z, 0.6 + k.rng.next() * 0.8);
    }
    const bx = wx(riverX(9)) + 0.5;
    k.bridge(bx, wz(9));
    k.lamp(bx + 2.1, wz(9) - 0.8);
  },
};

// ───────────────────────── pradera ─────────────────────────

const meadow: BiomeDef = {
  ground: 'meadow',
  fog: { color: 0xf0e8c8, mix: 0.15 },
  far: { kinds: ['round', 'round', 'pine'], leaves: ['green', 'gold', 'green'] },
  layout(g, r) {
    g.each((i, j) => {
      const roll = Math.sin(i * 0.5) + Math.cos(j * 0.6 + i * 0.2);
      g.set(i, j, 'grass', j <= 4 && roll > 0.6 ? 1 : 0);
    });
    g.fill(2, 2, 6, 4, 'grass', 1);
    g.fill(3, 2, 5, 4, 'river');
    g.set(4, 5, 'river');
    for (let j = 0; j < D; j++) {
      const x = Math.round(17 + 3 * Math.sin(j * 0.25));
      g.set(x, j, 'path', g.at(x, j)!.h);
      g.set(x + 1, j, 'path', g.at(x + 1, j)!.h);
    }
    void r;
  },
  decorate(k) {
    trees(k, (i, j) => (j <= 3 ? 0.08 : i <= 1 || i >= W - 2 ? 0.12 : 0.02), () => ['round', k.rng.chance(0.3) ? 'gold' : 'green'], [1.0, 1.6]);
    greenery(k, 0.9, 0.5);
    reedsAlong(k, 0.8);
    rocks(k, 6);
    k.fence(wx(8), wz(13), wx(13), wz(13.4));
    k.fence(wx(20), wz(4), wx(24), wz(4.5));
    for (const [i, j] of [[22, 6], [23, 7], [7, 14]]) k.haystack(wx(i), wz(j));
    k.sign(wx(16), wz(13), 0.4);
  },
};

// ───────────────────────── ruinas ─────────────────────────

const ruins: BiomeDef = {
  ground: 'dry',
  fog: { color: 0xe8d8b0, mix: 0.12 },
  far: { kinds: ['round', 'dead', 'pine'], leaves: ['gold', 'green', 'orange'] },
  layout(g, r) {
    g.each((i, j) => g.set(i, j, 'grass', 0));
    // Plataforma del templo al fondo y suelo enlosado roto
    g.fill(6, 0, 20, 3, 'cobble', 1);
    for (let i = 5; i <= 21; i++) for (let j = 4; j <= 13; j++) if (r.chance(0.72)) g.set(i, j, 'cobble', 0);
    g.fill(0, 0, 3, 2, 'grass', 1);
  },
  decorate(k) {
    k.arch(wx(13), wz(1.2), 3.2, 2.6);
    k.wall(wx(8), wz(1), 3, 1.6);
    k.wall(wx(18.5), wz(1), 3.5, 1.4);
    for (const i of [6, 9, 17, 20]) k.column(wx(i), wz(4), 1.6 + k.rng.next() * 1.2, k.rng.chance(0.5));
    for (const i of [5, 21]) k.column(wx(i), wz(13), 0.5 + k.rng.next() * 0.6, true);
    k.wall(wx(2.5), wz(8), 2.5, 1.2, Math.PI / 2);
    k.wall(wx(23.5), wz(9), 3, 1.0, Math.PI / 2);
    for (let n = 0; n < 9; n++) {
      const x = wx(k.rng.int(2, W - 3));
      const z = wz(k.rng.int(3, D - 2));
      if (k.free(x, z, 1.3)) k.rubble(x, z);
    }
    trees(k, (i, j) => (i <= 3 || i >= W - 4 ? 0.2 : j >= D - 2 ? 0.02 : 0.03), () => (k.rng.chance(0.35) ? ['dead', 'green'] : ['round', k.rng.chance(0.5) ? 'gold' : 'green']));
    greenery(k, 0.5, 0.08, 0xd8d0a0);
    rocks(k, 6);
  },
};

// ───────────────────────── vado ─────────────────────────

const ford: BiomeDef = {
  ground: 'green',
  fog: { color: 0xc8dce0, mix: 0.12 },
  far: { kinds: ['round', 'willow', 'pine'], leaves: ['green', 'green', 'gold'] },
  layout(g) {
    g.each((i, j) => {
      const cx = Math.round(14 + 1.5 * Math.sin(j * 0.4));
      let h = j <= 2 && (i < 9 || i > 19) ? 1 : 0;
      if (Math.abs(i - cx) <= 2) {
        // Donde se pelea, el río se puede vadear
        g.set(i, j, j >= 8 && j <= 11 ? 'shallow' : 'river', j >= 8 && j <= 11 ? 0 : -1);
        return;
      }
      if (Math.abs(i - cx) === 3) g.set(i, j, 'sand', h);
      else g.set(i, j, 'grass', h);
      h = 0;
    });
  },
  decorate(k) {
    // Piedras para cruzar el vado
    for (let n = 0; n < 8; n++) k.rock(wx(12 + k.rng.next() * 5), wz(8 + k.rng.next() * 3.5) + (k.rng.chance(0.5) ? 1.8 : -1.6), 0.12 + k.rng.next() * 0.12);
    trees(k, (i, j) => (j <= 3 ? 0.35 : i <= 3 || i >= W - 4 ? 0.3 : 0.05), () => (k.rng.chance(0.4) ? ['willow', 'green'] : ['round', autumn(k)]));
    greenery(k, 0.6, 0.1);
    reedsAlong(k, 1.4);
    rocks(k, 12, (i, j) => k.grid.at(i, j)!.type === 'sand');
    // Pilares de un puente caído
    for (const s of [-1, 1]) k.column(wx(14) + s * 2.6, wz(3.5), 1.4, true);
    k.lamp(wx(9), wz(6.5));
  },
};

// ───────────────────────── aldea ─────────────────────────

const village: BiomeDef = {
  ground: 'green',
  fog: { color: 0xf0d8b0, mix: 0.1 },
  far: { kinds: ['round', 'pine'], leaves: ['green', 'orange', 'gold'] },
  layout(g) {
    g.each((i, j) => g.set(i, j, 'grass', j <= 1 ? 1 : 0));
    // Calle mayor (donde está el claro) y calle hacia el fondo
    g.fill(2, 8, 23, 11, 'cobble', 0);
    g.fill(13, 2, 14, 7, 'cobble', 0);
    g.fill(13, 12, 14, 15, 'path', 0);
  },
  decorate(k) {
    const rows: [number, number, number, number, number, 'tile' | 'thatch'][] = [
      [4.5, 4.4, 2.4, 1.8, 1.6, 'tile'],
      [9.5, 4.2, 2.0, 1.6, 1.9, 'thatch'],
      [18.5, 4.4, 2.6, 1.8, 2.0, 'tile'],
      [23, 4.2, 2.0, 1.6, 1.5, 'thatch'],
    ];
    for (const [i, j, w, d, h, roof] of rows) k.house(wx(i), wz(j), w, d, h, 0, { roof, chimney: k.rng.chance(0.6) });
    k.house(wx(1.5), wz(13.5), 1.8, 1.6, 1.5, Math.PI / 2, { roof: 'thatch' });
    k.house(wx(24.2), wz(13.2), 1.8, 1.6, 1.6, -Math.PI / 2, { roof: 'tile' });
    k.well(wx(7.5), wz(6.7));
    k.stall(wx(16.5), wz(6.6), 0xc83a2a);
    k.stall(wx(20.5), wz(6.8), 0x2a6ac8);
    k.lamp(wx(11.5), wz(7.2));
    k.lamp(wx(15.8), wz(12.4));
    for (const [x, z] of [[wx(3), wz(6.5)], [wx(22.5), wz(6.6)], [wx(12), wz(13)]]) k.barrel(x, z);
    k.crate(wx(17.8), wz(5.8));
    k.fence(wx(5), wz(13), wx(11), wz(13.2));
    k.fence(wx(17), wz(13.1), wx(22), wz(13));
    trees(k, (i, j) => (j <= 1 ? 0.3 : (i <= 1 || i >= W - 2) && j < 12 ? 0.25 : 0), () => ['round', autumn(k)]);
    greenery(k, 0.5, 0.35);
  },
};

// ───────────────────────── ermita ─────────────────────────

const shrine: BiomeDef = {
  ground: 'green',
  fog: { color: 0xe8e0f8, mix: 0.18 },
  fireflies: 0xfff0b0,
  far: { kinds: ['dead', 'pine', 'round'], leaves: ['pine', 'gold', 'green'] },
  layout(g) {
    g.each((i, j) => g.set(i, j, 'grass', j <= 4 && i >= 8 && i <= 19 ? 1 : j <= 2 ? 1 : 0));
    g.fill(13, 6, 14, 15, 'cobble', 0);
    g.fill(10, 2, 17, 5, 'cobble', 0);
  },
  decorate(k) {
    k.chapel(wx(13.5), wz(3.6));
    for (let n = 0; n < 7; n++) {
      const a = Math.PI * (0.05 + (n / 6) * 0.9);
      k.menhir(wx(13.5) + Math.cos(a) * 9, wz(6) - Math.sin(a) * 4.5 + 3, 1.2 + k.rng.next() * 0.9);
    }
    for (let n = 0; n < 8; n++) k.candle(wx(12 + k.rng.next() * 3), wz(5.9 + k.rng.next() * 0.4));
    trees(k, (i, j) => (i <= 3 || i >= W - 4 ? 0.25 : i >= 9 && i <= 18 ? 0 : j <= 5 ? 0.15 : 0.03), () => (k.rng.chance(0.5) ? ['dead', 'green'] : ['pine', 'pine']));
    greenery(k, 0.6, 0.3);
    rocks(k, 5);
  },
};

// ───────────────────────── paso de montaña ─────────────────────────

const mountain: BiomeDef = {
  ground: 'alpine',
  fog: { color: 0xc8d4e8, mix: 0.22 },
  motes: 0xffffff,
  far: { kinds: ['pine', 'pine', 'dead'], leaves: ['pine', 'pine', 'green'] },
  layout(g, r) {
    g.each((i, j) => g.set(i, j, 'grass', 0));
    // Paredes del desfiladero: al fondo y a los lados, con nieve en lo alto
    g.each((i, j) => {
      const side = Math.min(i, W - 1 - i);
      let h = 0;
      if (j <= 5) h = 6 - j + r.int(0, 1) + (side < 8 ? 1 : 0);
      if (side <= 4 && j <= 13) h = Math.max(h, 6 - side - Math.floor(j / 5) + r.int(0, 1));
      if (h > 0) g.set(i, j, h >= 5 ? 'snow' : 'rock', h);
    });
    for (let j = 5; j < D; j++) {
      const x = Math.round(13 + Math.sin(j * 0.5) * 1.5);
      for (const i of [x, x + 1]) if (g.at(i, j)!.h === 0) g.set(i, j, 'path', 0);
    }
    // El camino sube por una garganta entre las paredes del fondo
    for (let j = 0; j <= 5; j++) for (const i of [12, 13, 14, 15]) g.set(i, j, 'path', Math.max(0, 2 - Math.floor(j / 2)));
  },
  decorate(k) {
    rocks(k, 26, undefined, [0x6e6a66, 0x7e7a74, 0x8e8a84, 0x5e5a58]);
    trees(k, (i, j) => (k.grid.at(i, j)!.type === 'rock' ? 0.3 : j >= 12 ? 0.1 : 0.04), () => ['pine', 'pine'], [0.7, 1.2]);
    k.scatter([k.texture('tuft1', () => px.tuft(k.seed + 30))], 0.45, 0.35, grassy(k), 0xb0b89a);
    // Mojón y una vieja señal
    for (let n = 0; n < 4; n++) k.rock(wx(18.5), wz(12.5), 0.3 - n * 0.06).position.y += n * 0.18;
    k.sign(wx(10.5), wz(12.5), -0.3);
  },
};

// ───────────────────────── marjal ─────────────────────────

const bog: BiomeDef = {
  ground: 'bog',
  fog: { color: 0x7a9070, mix: 0.22 },
  grassTint: 0xa8b088,
  motes: 0xb8e090,
  fireflies: 0x9aff7a,
  far: { kinds: ['dead', 'willow', 'dead'], leaves: ['green', 'green', 'green'] },
  layout(g, r) {
    g.each((i, j) => g.set(i, j, 'grass', 0));
    g.each((i, j) => {
      if (clearCell(i, j, 1.2)) return;
      const n = Math.sin(i * 0.7 + j * 0.3) + Math.cos(j * 0.8 - i * 0.25);
      if (n > 0.3 || r.chance(0.1)) g.set(i, j, 'pool');
    });
  },
  decorate(k) {
    // Pasarela de tablones que atraviesa las charcas hacia el fondo
    k.boardwalk(wx(13.5), wz(15), wx(13.5), wz(12));
    k.boardwalk(wx(14), wz(7.8), wx(16), wz(1));
    k.grid.each((i, j, c) => {
      if (c.type === 'pool' && k.rng.chance(0.3)) k.lily(wx(i) + (k.rng.next() - 0.5) * 0.6, wz(j) + (k.rng.next() - 0.5) * 0.6);
    });
    trees(k, (i, j) => (j <= 4 ? 0.25 : i <= 2 || i >= W - 3 ? 0.25 : 0.05), () => (k.rng.chance(0.7) ? ['dead', 'green'] : ['willow', 'green']), [0.9, 1.5]);
    greenery(k, 0.5, 0, 0xa8b088);
    reedsAlong(k, 1.6, 0xb8c090);
    rocks(k, 6, undefined, [0x4a4a42, 0x56564c, 0x626256, 0x3e3e38]);
  },
};

// ───────────────────────── guarida y cubil ─────────────────────────

const darkDecor = (k: Kit) => {
  trees(k, (i, j) => (j <= 5 ? 0.3 : i <= 2 || i >= W - 3 ? 0.3 : 0.05), () => ['dead', 'green'], [1.0, 1.7]);
  k.scatter([k.texture('tuft1', () => px.tuft(k.seed + 30))], 0.45, 0.4, grassy(k), 0x8a7a8a);
  for (let n = 0; n < 16; n++) {
    const x = wx(k.rng.int(1, W - 2)) + k.rng.next() - 0.5;
    const z = wz(k.rng.int(2, D - 2)) + k.rng.next() - 0.5;
    if (k.free(x, z, 1.3)) k.stake(x, z, 0.6 + k.rng.next() * 0.9);
  }
  for (let n = 0; n < 6; n++) {
    const x = wx(k.rng.int(2, W - 3));
    const z = wz(k.rng.int(4, D - 2));
    if (k.free(x, z, 1.3)) k.bones(x, z);
  }
  for (let n = 0; n < 5; n++) {
    const x = wx(k.rng.int(2, W - 3));
    const z = wz(k.rng.int(3, D - 2));
    if (k.free(x, z, 1.4)) k.crystal(x, z, 0.8 + k.rng.next() * 0.6);
  }
  rocks(k, 8, undefined, [0x3a3238, 0x463c44, 0x524650, 0x2a2228]);
};

const lair: BiomeDef = {
  ground: 'ash',
  fog: { color: 0x5a2a3a, mix: 0.4 },
  motes: 0xff6a5a,
  fireflies: 0xff5a4a,
  grassTint: 0x8a7a8a,
  far: { kinds: ['dead', 'dead', 'pine'], leaves: ['green', 'green', 'pine'] },
  layout(g) {
    g.each((i, j) => g.set(i, j, j <= 3 && i >= 9 && i <= 18 ? 'ash' : 'grass', j <= 3 && (i < 6 || i > 21) ? 1 : 0));
    g.fill(10, 0, 17, 3, 'cobble', 1);
    for (let j = 4; j < D; j++) {
      const x = Math.round(13 + Math.sin(j * 0.4));
      g.set(x, j, 'ash', 0);
      g.set(x + 1, j, 'ash', 0);
    }
  },
  decorate(k) {
    k.spire(wx(13.5), wz(1.5));
    darkDecor(k);
  },
};

const den: BiomeDef = {
  ...lair,
  fog: { color: 0x3a2a3a, mix: 0.45 },
  layout(g) {
    g.each((i, j) => g.set(i, j, 'grass', j <= 2 ? 1 : 0));
    g.fill(9, 0, 18, 3, 'rock', 2);
    g.fill(11, 3, 16, 4, 'ash', 0);
  },
  decorate(k) {
    k.cave(wx(13.5), wz(4.6));
    darkDecor(k);
  },
};

// ───────────────────────── castillo ─────────────────────────

const castle: BiomeDef = {
  ground: 'green',
  fog: { color: 0xf0d8b8, mix: 0.1 },
  far: { kinds: ['round', 'pine'], leaves: ['green', 'orange', 'gold'] },
  layout(g) {
    g.each((i, j) => g.set(i, j, 'cobble', 0));
    // Muralla al fondo, con el adarve
    g.fill(0, 0, W - 1, 3, 'rock', 3);
    g.fill(0, 4, 1, 8, 'rock', 3);
    g.fill(W - 2, 4, W - 1, 8, 'rock', 3);
    // Jardincillos a los lados del patio
    g.fill(2, 12, 6, 15, 'grass', 0);
    g.fill(20, 12, 23, 15, 'grass', 0);
  },
  decorate(k) {
    const stone = k.mat('bricks', () => px.bricks(k.seed));
    // Almenas sobre la muralla
    for (let i = 0; i < W; i += 1) k.add(k.box(0.5, 0.45, 0.5, stone, 0, 0.22, 0), wx(i), wz(3) + 0.25, 3);
    k.castleTower(wx(1), wz(3), 1.3, 5.5, 0x3a4a7a);
    k.castleTower(wx(W - 2), wz(3), 1.3, 5.5, 0x3a4a7a);
    k.castleTower(wx(13.5), wz(1.6), 2.0, 7, 0x7a2a2a);
    for (const i of [5, 9, 18, 22]) k.banner(wx(i), wz(4), 3.6, 0x8a1e1e);
    // Herrería, taberna y logia
    k.house(wx(5), wz(5.6), 2.4, 1.8, 1.4, 0, { walls: 'stone', roof: 'slate', chimney: true });
    k.house(wx(13.5), wz(5.4), 3.0, 2.0, 2.2, 0, { roof: 'tile', chimney: true });
    k.house(wx(21.5), wz(5.6), 2.6, 1.8, 1.5, 0, { walls: 'wood', roof: 'thatch' });
    // Fragua encendida delante de la herrería y andamio en la logia
    k.add(k.box(0.6, 0.5, 0.5, k.glow(0xff7a2a, 'fire'), 0, 0.25, 0), wx(5) + 0.6, wz(5.6) + 1.1);
    k.pointLight(wx(5) + 0.6, 0.6, wz(5.6) + 1.4, 0xff8a3a, 10, 'fire', 5);
    for (const dx of [1.5, 2.1]) k.add(k.box(0.08, 2.2, 0.08, k.mat('planks', () => px.planks(k.seed))), wx(21.5) + dx, wz(5.6) + 0.4);
    k.anchors.smithy = new THREE.Vector3(wx(5), 2.9, wz(5.6));
    k.anchors.tavern = new THREE.Vector3(wx(13.5), 4.0, wz(5.4));
    k.anchors.lodge = new THREE.Vector3(wx(21.5), 3.1, wz(5.6));
    k.well(wx(9.5), wz(6.9));
    k.lamp(wx(17.5), wz(7));
    k.lamp(wx(9.5), wz(12.6));
    for (const [x, z] of [[wx(3), wz(7)], [wx(7.4), wz(6.3)], [wx(23.4), wz(7)]]) k.barrel(x, z);
    k.crate(wx(19.5), wz(6.4));
    trees(k, (i, j) => (k.grid.at(i, j)!.type === 'grass' ? 0.3 : 0), () => ['round', autumn(k)], [0.8, 1.2]);
    greenery(k, 0.6, 0.4);
  },
};

export const BIOMES: Record<Biome, BiomeDef> = { forest, meadow, ruins, ford, village, shrine, mountain, bog, lair, den, castle };
