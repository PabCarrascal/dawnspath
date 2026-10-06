import * as THREE from 'three';

export interface MatOpts {
  emissive?: number;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  /** Si es true, el material se oscurece con la niebla de guerra. */
  fow?: boolean;
  transparent?: boolean;
  opacity?: number;
  /** Se ilumina de noche (ventanas, antorchas). */
  nightGlow?: boolean;
}

let patcher: (<T extends THREE.Material>(m: T) => T) | null = null;
const cache = new Map<string, THREE.MeshStandardMaterial>();

/** Materiales cuyo brillo depende de la hora del día. */
export const nightGlow: { mat: THREE.MeshStandardMaterial; base: number }[] = [];

export function setFowPatcher(fn: <T extends THREE.Material>(m: T) => T) {
  patcher = fn;
}

/** Material low-poly cacheado (sombreado plano). */
export function mat(color: number, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const id = JSON.stringify([color, o]);
  const hit = cache.get(id);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: o.roughness ?? 0.85,
    metalness: o.metalness ?? 0,
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
  });
  if (o.fow && patcher) patcher(m);
  if (o.nightGlow) nightGlow.push({ mat: m, base: o.emissiveIntensity ?? 1 });
  cache.set(id, m);
  return m;
}

export const PALETTE = {
  dirt: 0x6b4a32,
  dirtDark: 0x4a3222,
  plain: [0x7fb24a, 0x8cbc52, 0x74a844],
  forestFloor: [0x4f7f36, 0x5a8a3a],
  mountainCap: 0x7d7a74,
  rock: [0x8a8580, 0x6f6b66, 0x9a948c],
  snow: 0xf3f6fb,
  sand: 0xc9b07a,
  riverBed: 0x5e6a5a,
  pine: [0x2f6b3a, 0x3a7a3c, 0x2a5e35, 0x467f3a],
  trunk: 0x5a3b24,
  grass: 0x9ccc5a,
  flowers: [0xf2d24b, 0xef7b8f, 0xffffff, 0xa98bff],
  water: 0x2b86b8,
  ocean: 0x1a5677,
  wood: 0x8a5a34,
  woodDark: 0x5e3b20,
  stone: 0xb7b2a6,
  stoneDark: 0x8d877b,
  roof: 0x3a4f8f,
  tent: 0xe9dcc0,
  tentAlt: 0xd9823b,
  fire: 0xff8a2a,
  window: 0xffc36b,
  dawn: 0xffd27a,
  hero: 0x2f6fd6,
  heroDark: 0x1d3f86,
  steel: 0xc9d1dc,
  gold: 0xe2b43c,
  skin: 0xf1c7a0,
  soldier: 0x7c8794,
  shade: 0x1b1027,
  shadeGlow: 0xff2a3a,
  king: 0x2a1240,
  kingGlow: 0xc055ff,
};
