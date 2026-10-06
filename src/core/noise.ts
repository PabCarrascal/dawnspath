import { Rng } from './rng';

/** Value noise 2D suavizado con octavas. Suficiente para generar biomas. */
export function createNoise2D(rng: Rng): (x: number, y: number) => number {
  const SIZE = 256;
  const perm = new Uint8Array(SIZE * 2);
  const values = new Float32Array(SIZE);
  const base = Array.from({ length: SIZE }, (_, i) => i);
  rng.shuffle(base);
  for (let i = 0; i < SIZE * 2; i++) perm[i] = base[i % SIZE];
  for (let i = 0; i < SIZE; i++) values[i] = rng.next();

  const lattice = (ix: number, iy: number) => values[perm[(perm[ix & 255] + iy) & 511] & 255];
  const smooth = (t: number) => t * t * (3 - 2 * t);

  const single = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const a = lattice(ix, iy);
    const b = lattice(ix + 1, iy);
    const c = lattice(ix, iy + 1);
    const d = lattice(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };

  return (x, y) => {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < 3; o++) {
      sum += single(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
}
