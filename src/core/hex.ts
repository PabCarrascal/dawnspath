/**
 * Coordenadas axiales para hexágonos "pointy-top".
 * Referencia: https://www.redblobgames.com/grids/hexagons/
 */
export interface Hex {
  q: number;
  r: number;
}

export type HexKey = string;

export const DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const key = (h: Hex): HexKey => `${h.q},${h.r}`;

export const fromKey = (k: HexKey): Hex => {
  const [q, r] = k.split(',').map(Number);
  return { q, r };
};

export const hex = (q: number, r: number): Hex => ({ q, r });

export const add = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r });

export const equals = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;

export const distance = (a: Hex, b: Hex): number =>
  (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

export const neighbors = (h: Hex): Hex[] => DIRECTIONS.map((d) => add(h, d));

/** Todos los hexágonos a distancia <= radius de center. */
export function range(center: Hex, radius: number): Hex[] {
  const out: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) out.push({ q: center.q + q, r: center.r + r });
  }
  return out;
}

/** Redondea coordenadas fraccionarias al hexágono más cercano. */
export function round(q: number, r: number): Hex {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq + 0, r: rr + 0 };
}

/** Hexágono que contiene el punto (x, z) del mundo. */
export function fromWorld(x: number, z: number, size: number): Hex {
  return round(((Math.sqrt(3) / 3) * x - z / 3) / size, ((2 / 3) * z) / size);
}

/** Posición en el plano XZ del mundo (y = 0) para un hexágono de tamaño `size`. */
export function toWorld(h: Hex, size: number): { x: number; z: number } {
  return {
    x: size * Math.sqrt(3) * (h.q + h.r / 2),
    z: size * 1.5 * h.r,
  };
}
