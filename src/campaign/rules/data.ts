import type { BuildingId, NodeDef, Resources, SoldierKind, Structure } from './types';

/** Equilibrio de la campaña; el bot (`npm run sim`) ayuda a ajustarlo. */
export const CBAL = {
  maxHours: 12,
  /** Un grupo que ha dormido al raso empieza el día con menos luz. */
  roughNightHours: 2,
  securedTravel: 1,
  combatHours: 2,
  fleeHours: 1,
  scoutHours: 1,
  lootHours: 2,
  partyMax: 4,
  foodPrice: 3,
  torchPrice: 4,
  foodCap: 16,
  torchCap: 6,
  /** Probabilidad de emboscada nocturna donde duerme el grupo. */
  ambush: { rough: 0.35, roughTorch: 0.2, camp: 0.14, tower: 0.07 },
  /** Probabilidad de emboscada al cruzar un nodo limpio sin guardia. */
  roadAmbush: 0.2,
  /** Probabilidad de que las criaturas retomen un nodo limpio sin guardia (los vecinos del castillo no). */
  retake: 0.2,
  /** Probabilidad de ataque nocturno a una guarnición. */
  garrisonAttack: 0.35,
  rest: {
    camp: { heal: 0.2, stress: -8 },
    rough: { heal: 0, stress: 10, torchStress: 5 },
    castle: { stress: -15 },
  },
  hunger: { stress: 12, hp: 3 },
  /** Botín de oro por criatura abatida. */
  goldPerFoe: 8,
  xpLevels: [0, 2, 5, 9],
  treatCost: 15,
};

export const BUILDINGS: Record<BuildingId, { name: string; desc: string; levels: string[]; cost: Partial<Resources>[] }> = {
  smithy: {
    name: 'Herrería',
    desc: 'Mejores armas y armaduras para todos los soldados.',
    levels: ['Fragua apagada', 'Hojas templadas: +1 daño, +5% protección', 'Acero del alba: +2 daño, +10% protección', 'Obra maestra: +3 daño, +15% protección'],
    cost: [{ gold: 40, materials: 6 }, { gold: 80, materials: 10 }, { gold: 140, materials: 14, stone: 4 }],
  },
  tavern: {
    name: 'Taberna',
    desc: 'Baja el estrés entre expediciones y recluta soldados.',
    levels: ['Bodega modesta', 'Buena cerveza: tratamientos más eficaces, 3 reclutas', 'Juglares: aún más alivio, 4 reclutas', 'Gran salón: alivio máximo, 5 reclutas'],
    cost: [{ gold: 30 }, { gold: 70, materials: 6 }, { gold: 120, materials: 10 }],
  },
  lodge: {
    name: 'Logia de constructores',
    desc: 'Desbloquea y abarata las estructuras de campo.',
    levels: ['Solo campamentos', 'Planos de torre; campamentos más baratos', 'Cuadrillas rápidas: obras 1 hora más cortas', 'Torres reforzadas: más defensa'],
    cost: [{ gold: 20, materials: 6, stone: 4 }, { gold: 40, materials: 10, stone: 8 }, { gold: 60, materials: 14, stone: 12 }],
  },
};

export const STRUCTURES: Record<Structure, { name: string; desc: string; garrison: number; defense: number }> = {
  camp: { name: 'Campamento', desc: 'Se duerme mejor y caben 1 soldado de guardia.', garrison: 1, defense: 0.6 },
  tower: { name: 'Torre de vigía', desc: 'Defiende el nodo de noche; caben 2 de guardia y protege al grupo.', garrison: 2, defense: 1.6 },
};

export const KIND_NAMES: Record<SoldierKind, string> = {
  hero: 'Héroe',
  spearman: 'Lancero',
  archer: 'Arquera',
  chaplain: 'Capellana',
};

export const NAMES: Record<Exclude<SoldierKind, 'hero'>, string[]> = {
  spearman: ['Bram', 'Odo', 'Garret', 'Tomas', 'Wulf', 'Anselm', 'Ruy'],
  archer: ['Ilse', 'Mira', 'Nell', 'Sabela', 'Wren', 'Ines', 'Tova'],
  chaplain: ['Maren', 'Clara', 'Edda', 'Lucía', 'Agnes', 'Brígida'],
};

export const RECRUIT_COST: Record<Exclude<SoldierKind, 'hero'>, number> = { spearman: 30, archer: 30, chaplain: 40 };

export const START = {
  stock: { gold: 80, materials: 6, stone: 0, food: 0, torches: 0 },
  soldiers: [
    { kind: 'hero', name: 'Aldric, Héroe del Alba' },
    { kind: 'spearman', name: 'Bram' },
    { kind: 'archer', name: 'Ilse' },
  ] as { kind: SoldierKind; name: string }[],
};

/** Ataques nocturnos: más fuertes cuantos más días pasan. */
export const NIGHT_FOES = [
  ['shade', 'stalker'],
  ['shade', 'shade', 'stalker'],
  ['brute', 'shade', 'stalker'],
];

/** El sendero del corte vertical: cinco nodos con una bifurcación y un lugarteniente al final. */
export const MAP: NodeDef[] = [
  {
    id: 'castle', name: 'Castillo del Alba', type: 'castle', biome: 'castle',
    desc: 'Tu base. Aquí se descansa, se mejora y se prepara la siguiente salida.',
    x: 120, y: 470, links: ['prado'], travel: 2, foes: [], regen: [], loot: {},
  },
  {
    id: 'prado', name: 'Prado Ceniciento', type: 'meadow', biome: 'meadow',
    desc: 'Campo abierto: fácil para acampar, sin protección natural.',
    x: 300, y: 420, links: ['castle', 'bosque', 'ruinas'], travel: 2,
    foes: ['shade', 'stalker'], regen: ['shade', 'stalker'], loot: { gold: 25, materials: 3 },
  },
  {
    id: 'bosque', name: 'Bosque Hondo', type: 'forest', biome: 'forest',
    desc: 'Madera abundante, pero la vista no alcanza más allá de los troncos.',
    x: 470, y: 245, links: ['prado', 'vado'], travel: 3,
    foes: ['shade', 'stalker', 'shade'], regen: ['shade', 'stalker'], loot: { materials: 9, gold: 10 },
  },
  {
    id: 'ruinas', name: 'Ruinas de Velar', type: 'ruins', biome: 'ruins',
    desc: 'Oro y piedra entre muros caídos. Algo grande duerme bajo el arco.',
    x: 500, y: 525, links: ['prado', 'vado'], travel: 3,
    foes: ['brute', 'shade'], regen: ['brute'], loot: { gold: 50, stone: 6 },
  },
  {
    id: 'vado', name: 'Vado del Cuervo', type: 'ford', biome: 'ford',
    desc: 'El único paso del río. Quien lo guarde controla el camino.',
    x: 700, y: 390, links: ['bosque', 'ruinas', 'torre'], travel: 3,
    foes: ['brute', 'shade', 'stalker'], regen: ['shade', 'stalker'], loot: { stone: 6, materials: 4, gold: 25 },
  },
  {
    id: 'torre', name: 'Torre del Heraldo', type: 'lair', biome: 'lair',
    desc: 'El lugarteniente del Rey de la Noche guarda aquí el camino hacia el norte.',
    x: 885, y: 235, links: ['vado'], travel: 2,
    foes: ['brute', 'herald', 'stalker'], regen: ['brute', 'herald', 'stalker'], loot: { gold: 80 }, boss: true,
  },
];

export const NODE = Object.fromEntries(MAP.map((n) => [n.id, n])) as Record<string, NodeDef>;
