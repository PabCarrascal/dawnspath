import { Hex, toWorld } from '../core/hex';
import type { Tile } from '../game/types';

export const HEX_SIZE = 1;

/** Altura de la "tapa" de cada casilla según el terreno. */
export function capHeight(t: Tile): number {
  switch (t.terrain) {
    case 'plain':
      return 0.42 + t.variant * 0.06;
    case 'forest':
      return 0.46 + t.variant * 0.05;
    case 'mountain':
      return 0.62 + t.variant * 0.08;
    case 'ford':
      return 0.2;
    case 'river':
      return 0.1;
  }
}

export const WATER_LEVEL = 0.3;
export const BRIDGE_DECK = 0.5;

/** Altura a la que se apoyan unidades y estructuras. */
export function standHeight(t: Tile): number {
  if (t.terrain === 'river') return t.structure === 'bridge' ? BRIDGE_DECK + 0.04 : WATER_LEVEL;
  if (t.terrain === 'ford') return WATER_LEVEL - 0.06;
  return capHeight(t);
}

export function worldPos(h: Hex): { x: number; z: number } {
  return toWorld(h, HEX_SIZE);
}
