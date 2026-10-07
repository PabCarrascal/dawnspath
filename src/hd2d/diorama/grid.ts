/** Rejilla del diorama: columnas de bloques de 1 × 1, con el frente hacia +z. */
export const W = 26;
export const D = 16;
export const BOTTOM = -3;
export const wx = (i: number) => i - W / 2 + 0.5;
export const wz = (j: number) => j - D / 2 + 0.5;
export const ci = (x: number) => Math.round(x + W / 2 - 0.5);
export const cj = (z: number) => Math.round(z + D / 2 - 0.5);

/**
 * Tipos de celda. El agua tiene tres alturas: río (hondo), vado (a ras de
 * suelo, se camina por él) y charca (marjal).
 */
export type CellType = 'grass' | 'path' | 'river' | 'shallow' | 'pool' | 'rock' | 'cobble' | 'ash' | 'sand' | 'snow';

export interface Cell {
  type: CellType;
  h: number;
}

export const WATER: CellType[] = ['river', 'shallow', 'pool'];

export class Grid {
  readonly c: Cell[][] = [];

  constructor(type: CellType = 'grass') {
    for (let i = 0; i < W; i++) {
      this.c[i] = [];
      for (let j = 0; j < D; j++) this.c[i][j] = { type, h: 0 };
    }
  }

  at(i: number, j: number): Cell | undefined {
    return this.c[i]?.[j];
  }

  set(i: number, j: number, type: CellType, h?: number) {
    const cell = this.at(i, j);
    if (!cell) return;
    cell.type = type;
    if (h !== undefined) cell.h = h;
    else if (type === 'river' || type === 'pool') cell.h = -1;
  }

  fill(i0: number, j0: number, i1: number, j1: number, type: CellType, h?: number) {
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) this.set(i, j, type, h);
  }

  each(fn: (i: number, j: number, cell: Cell) => void) {
    for (let i = 0; i < W; i++) for (let j = 0; j < D; j++) fn(i, j, this.c[i][j]);
  }

  isWater(i: number, j: number) {
    const cell = this.at(i, j);
    return !!cell && WATER.includes(cell.type);
  }

  /** Altura del suelo en un punto (para apoyar objetos). */
  height(x: number, z: number) {
    const cell = this.at(ci(x), cj(z));
    if (!cell) return 0;
    return cell.type === 'river' || cell.type === 'pool' ? -0.32 : cell.h;
  }
}

/** Centro de la escena: aquí se pelea y aquí acampa el grupo, en todos los biomas. */
export const BATTLE = { x: wx(14) + 0.5, z: wz(10) };
export const CLEAR = { x: BATTLE.x, z: BATTLE.z, rx: 6.6, rz: 1.9 };

/** Dentro del claro, con un margen (1 = el borde exacto). */
export function inClear(x: number, z: number, margin = 1) {
  const dx = (x - CLEAR.x) / (CLEAR.rx * margin);
  const dz = (z - CLEAR.z) / (CLEAR.rz * margin);
  return dx * dx + dz * dz < 1;
}

export const clearCell = (i: number, j: number, margin = 1.12) => inClear(wx(i), wz(j), margin);

/** Puesto de cada combatiente: el grupo a la izquierda (1 = el más cercano al centro). */
export function slot(side: 'party' | 'foe', rank: number) {
  const dir = side === 'party' ? -1 : 1;
  return {
    x: BATTLE.x + dir * (1.0 + (rank - 1) * 1.25),
    z: BATTLE.z + (rank % 2 === 0 ? -0.45 : 0.25),
  };
}
