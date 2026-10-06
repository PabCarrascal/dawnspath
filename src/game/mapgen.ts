import { Hex, HexKey, distance, equals, hex, key, neighbors, range, toWorld } from '../core/hex';
import { createNoise2D } from '../core/noise';
import { Rng } from '../core/rng';
import { BALANCE, PoiKind, TerrainType } from './config';
import type { Tile } from './types';

const R = BALANCE.mapRadius;
export const HERO_START: Hex = hex(-(R - 1), R - 1);
export const KING_START: Hex = hex(R - 1, -(R - 1));

export interface GeneratedMap {
  tiles: Map<HexKey, Tile>;
  /** Guaridas de sombras: el juego las crea como unidades nocturnas. */
  lairs: Hex[];
}

export function generateMap(rng: Rng): GeneratedMap {
  const tiles = new Map<HexKey, Tile>();
  const elevation = createNoise2D(rng);
  const moisture = createNoise2D(rng);

  for (const h of range(hex(0, 0), R)) {
    const w = toWorld(h, 1);
    const e = elevation(w.x * 0.26 + 10, w.z * 0.26 + 10);
    const m = moisture(w.x * 0.24 + 50, w.z * 0.24 + 50);
    let terrain: TerrainType = 'plain';
    if (e > 0.66) terrain = 'mountain';
    else if (m > 0.54) terrain = 'forest';
    tiles.set(key(h), {
      ...h,
      terrain,
      variant: rng.next(),
      owned: false,
      structure: null,
      explored: false,
      visible: false,
    });
  }

  // Dos o tres ríos perpendiculares al eje héroe → rey, y algún lago.
  const offsets = rng.chance(0.5) ? [-4.2, 4.2] : [-6, 0, 6];
  for (const o of offsets) carveRiver(tiles, rng, o + rng.range(-0.8, 0.8));
  carveLakes(tiles, rng, rng.int(1, 2));

  // Alrededores del héroe y del rey despejados.
  for (const center of [HERO_START, KING_START]) {
    for (const h of range(center, 1)) {
      const t = tiles.get(key(h));
      if (t && (t.terrain === 'mountain' || t.terrain === 'river')) t.terrain = 'plain';
    }
    tiles.get(key(center))!.terrain = 'plain';
  }

  ensurePath(tiles, HERO_START, KING_START);
  ensureForestNear(tiles, rng, HERO_START);
  ensureMountainNear(tiles, rng, HERO_START);
  const lairs = placePois(tiles, rng);
  return { tiles, lairs };
}

/** Lagos: un hexágono de agua con parte de sus vecinos. */
function carveLakes(tiles: Map<HexKey, Tile>, rng: Rng, count: number) {
  const candidates = [...tiles.values()].filter(
    (t) => distance(t, HERO_START) >= 4 && distance(t, KING_START) >= 4 && distance(t, hex(0, 0)) <= R - 2,
  );
  for (let i = 0; i < count && candidates.length; i++) {
    const c = rng.pick(candidates);
    c.terrain = 'river';
    for (const n of neighbors(c)) {
      const t = tiles.get(key(n));
      if (t && rng.chance(0.55)) t.terrain = 'river';
    }
  }
}

/**
 * Reparte aldeas, guaridas, santuarios y ruinas por casillas alcanzables
 * (cruzando ríos con puentes, nunca montañas), separadas entre sí.
 */
function placePois(tiles: Map<HexKey, Tile>, rng: Rng): Hex[] {
  const P = BALANCE.poi;
  const reachable = new Set<HexKey>([key(HERO_START)]);
  const queue: Hex[] = [HERO_START];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of neighbors(cur)) {
      const t = tiles.get(key(n));
      if (!t || t.terrain === 'mountain' || reachable.has(key(n))) continue;
      reachable.add(key(n));
      queue.push(n);
    }
  }
  const taken: Hex[] = [];
  const base = rng.shuffle(
    [...tiles.values()].filter(
      (t) =>
        reachable.has(key(t)) &&
        (t.terrain === 'plain' || t.terrain === 'forest') &&
        distance(t, HERO_START) >= 3 &&
        distance(t, KING_START) >= 3,
    ),
  );
  const pick = (count: number, spacing: number, ok: (t: Tile) => boolean): Tile[] => {
    const out: Tile[] = [];
    for (const t of base) {
      if (out.length >= count) break;
      if (!ok(t) || taken.some((h) => distance(h, t) < spacing)) continue;
      out.push(t);
      taken.push(t);
    }
    return out;
  };
  const mark = (list: Tile[], poi: PoiKind) => {
    for (const t of list) {
      t.poi = poi;
      t.poiUsed = false;
      if (poi === 'village') t.terrain = 'plain';
    }
  };

  mark(pick(P.village.count, 4, (t) => distance(t, HERO_START) >= 4 && distance(t, HERO_START) <= 10), 'village');
  const lairs = pick(P.lair.count, 4, (t) => distance(t, HERO_START) >= P.lair.minHeroDistance);
  mark(pick(P.shrine.count, 4, (t) => distance(t, HERO_START) >= 4), 'shrine');
  mark(pick(P.ruins.count, 3, () => true), 'ruins');
  return lairs.map((t) => ({ q: t.q, r: t.r }));
}

/**
 * Traza un río de borde a borde, perpendicular al eje héroe→rey y
 * desplazado `offset` unidades a lo largo de ese eje. Deja 1-2 vados.
 */
function carveRiver(tiles: Map<HexKey, Tile>, rng: Rng, offset: number) {
  const a = toWorld(HERO_START, 1);
  const b = toWorld(KING_START, 1);
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const axis = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
  const perp = { x: -axis.z, z: axis.x };

  const all = [...tiles.values()];
  const score = (t: Tile, dir: number) => {
    const w = toWorld(t, 1);
    return dir * (w.x * perp.x + w.z * perp.z) - Math.abs(w.x * axis.x + w.z * axis.z - offset) * 2;
  };
  const start = all.reduce((best, t) => (score(t, 1) > score(best, 1) ? t : best));
  const end = all.reduce((best, t) => (score(t, -1) > score(best, -1) ? t : best));

  const course: Tile[] = [start];
  let cur: Hex = start;
  let guard = 0;
  while (!equals(cur, end) && guard++ < 90) {
    const options = neighbors(cur)
      .map((n) => tiles.get(key(n)))
      .filter((t): t is Tile => !!t && !course.includes(t));
    if (!options.length) break;
    // Claves aleatorias precalculadas: un comparador aleatorio no es determinista.
    const scored = options.map((t) => ({ t, k: distance(t, end) + rng.next() * 1.3 }));
    scored.sort((p, q) => p.k - q.k);
    cur = scored[0].t;
    course.push(scored[0].t);
  }

  for (const t of course) t.terrain = 'river';

  const fords = rng.int(1, 2);
  const inner = course.slice(2, -2);
  rng.shuffle(inner);
  for (const t of inner.slice(0, fords)) t.terrain = 'ford';
}

/** Dijkstra que trata montañas/ríos como caros; luego los "abre" en el camino. */
function ensurePath(tiles: Map<HexKey, Tile>, from: Hex, to: Hex) {
  const cost = (t: Tile) => (t.terrain === 'mountain' || t.terrain === 'river' ? 12 : 1);
  const dist = new Map<HexKey, number>([[key(from), 0]]);
  const prev = new Map<HexKey, HexKey>();
  const open: HexKey[] = [key(from)];
  while (open.length) {
    open.sort((x, y) => dist.get(x)! - dist.get(y)!);
    const k = open.shift()!;
    const t = tiles.get(k)!;
    if (equals(t, to)) break;
    for (const n of neighbors(t)) {
      const nk = key(n);
      const nt = tiles.get(nk);
      if (!nt) continue;
      const d = dist.get(k)! + cost(nt);
      if (d < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, d);
        prev.set(nk, k);
        if (!open.includes(nk)) open.push(nk);
      }
    }
  }
  let k: HexKey | undefined = key(to);
  while (k) {
    const t = tiles.get(k)!;
    if (t.terrain === 'mountain') t.terrain = 'plain';
    if (t.terrain === 'river') t.terrain = 'ford';
    k = prev.get(k);
  }
}

function ensureForestNear(tiles: Map<HexKey, Tile>, rng: Rng, center: Hex) {
  const near = range(center, 2)
    .map((h) => tiles.get(key(h)))
    .filter((t): t is Tile => !!t && distance(t, center) > 0);
  if (near.some((t) => t.terrain === 'forest')) return;
  const plains = near.filter((t) => t.terrain === 'plain');
  if (plains.length) rng.pick(plains).terrain = 'forest';
}

/** Una montaña a 3 casillas del castillo para poder levantar una cantera. */
function ensureMountainNear(tiles: Map<HexKey, Tile>, rng: Rng, center: Hex) {
  const near = range(center, 3)
    .map((h) => tiles.get(key(h)))
    .filter((t): t is Tile => !!t);
  if (near.some((t) => t.terrain === 'mountain')) return;
  const ring = near.filter((t) => distance(t, center) === 3 && t.terrain !== 'river');
  if (ring.length) rng.pick(ring).terrain = 'mountain';
}
