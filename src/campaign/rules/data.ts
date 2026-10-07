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
  /** Días entre cada avance de la oscuridad. */
  darkEvery: 4,
  /** Días que aguanta el castillo con la oscuridad a sus puertas. */
  siegeDays: 3,
  /** Ataque extra contra una guarnición cuando la oscuridad llega a su nodo. */
  darkAttack: 0.6,
  /** Probabilidad de suceso al llegar a un nodo sin combate. */
  eventChance: 0.35,
  villageHire: 25,
  pray: { hours: 1, heal: 0.25, stress: -20 },
  /** Estrés extra al acampar en un nodo oscuro. */
  darkNightStress: 6,
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

/**
 * El sendero: doce nodos del castillo a la torre del Heraldo, con dos caminos
 * (el bosque y la ermita por el norte, el vado y el marjal por el sur) y el
 * cubil de las sombras, que extiende la oscuridad mientras siga en pie.
 */
export const MAP: NodeDef[] = [
  {
    id: 'castle', name: 'Castillo del Alba', type: 'castle', biome: 'castle',
    desc: 'Tu base. Aquí se descansa, se mejora y se prepara la siguiente salida.',
    x: 110, y: 480, links: ['prado'], travel: 2, foes: [], regen: [], loot: {},
  },
  {
    id: 'prado', name: 'Prado Ceniciento', type: 'meadow', biome: 'meadow',
    desc: 'La puerta del castillo. Si la oscuridad llega aquí, empieza el asedio.',
    x: 270, y: 420, links: ['castle', 'robledal', 'bosque', 'ruinas'], travel: 2,
    foes: ['shade', 'stalker'], regen: ['shade', 'stalker'], loot: { gold: 25, materials: 3 },
  },
  {
    id: 'robledal', name: 'Aldea de Robledal', type: 'village', biome: 'village',
    desc: 'Una aldea que aún resiste. Víveres baratos, cobijo para dormir y alguien dispuesto a luchar.',
    x: 225, y: 250, links: ['prado', 'bosque'], travel: 3,
    foes: [], regen: ['shade', 'stalker'], loot: {},
    village: { foodPrice: 2, recruit: 'chaplain', name: 'Hermana Oria' },
  },
  {
    id: 'bosque', name: 'Bosque Hondo', type: 'forest', biome: 'forest',
    desc: 'Madera abundante, pero la vista no alcanza más allá de los troncos.',
    x: 420, y: 300, links: ['prado', 'robledal', 'ermita', 'vado'], travel: 3,
    foes: ['shade', 'stalker', 'shade'], regen: ['shade', 'stalker'], loot: { materials: 9, gold: 10 },
  },
  {
    id: 'ruinas', name: 'Ruinas de Velar', type: 'ruins', biome: 'ruins',
    desc: 'Oro y piedra entre muros caídos. Algo grande duerme bajo el arco.',
    x: 420, y: 515, links: ['prado', 'cubil', 'vado'], travel: 3,
    foes: ['brute', 'shade'], regen: ['brute', 'shade'], loot: { gold: 50, stone: 6 },
  },
  {
    id: 'cubil', name: 'Cubil de las Sombras', type: 'den', biome: 'den',
    desc: 'Un foco de oscuridad. Mientras siga en pie, la noche avanza desde aquí hacia el castillo.',
    x: 590, y: 555, links: ['ruinas', 'molino'], travel: 3,
    foes: ['brute', 'shade', 'shade', 'stalker'], regen: [], loot: { gold: 40 }, source: true,
  },
  {
    id: 'vado', name: 'Vado del Cuervo', type: 'ford', biome: 'ford',
    desc: 'El único paso del río. Quien lo guarde controla el camino del sur.',
    x: 600, y: 385, links: ['bosque', 'ruinas', 'paso', 'molino'], travel: 3,
    foes: ['brute', 'stalker', 'shade'], regen: ['shade', 'stalker'], loot: { stone: 6, materials: 4, gold: 25 },
  },
  {
    id: 'ermita', name: 'Ermita del Alba', type: 'shrine', biome: 'shrine',
    desc: 'Un santuario profanado. Limpio, se puede rezar en él para curar cuerpo y temple.',
    x: 560, y: 170, links: ['bosque', 'paso'], travel: 3,
    foes: ['shade', 'shade'], regen: ['shade', 'shade'], loot: { gold: 10 }, prayers: 2,
  },
  {
    id: 'paso', name: 'Paso del Lobo', type: 'mountain', biome: 'mountain',
    desc: 'Un desfiladero lento de cruzar. Mucha piedra y buenas posiciones.',
    x: 750, y: 235, links: ['ermita', 'vado', 'torre'], travel: 4,
    foes: ['brute', 'stalker'], regen: ['brute', 'stalker'], loot: { stone: 10, materials: 2 },
  },
  {
    id: 'molino', name: 'Aldea del Molino', type: 'village', biome: 'village',
    desc: 'Una aldea tomada por las criaturas. Liberarla devuelve sus víveres y su gente.',
    x: 765, y: 470, links: ['vado', 'cubil', 'marjal'], travel: 3,
    foes: ['shade', 'stalker', 'shade'], regen: ['shade', 'stalker'], loot: { gold: 20 },
    village: { foodPrice: 2, recruit: 'spearman', name: 'Tobías el molinero' },
  },
  {
    id: 'marjal', name: 'Marjal Negro', type: 'bog', biome: 'bog',
    desc: 'Agua negra y niebla. Entrar ya pesa en el ánimo.',
    x: 895, y: 380, links: ['molino', 'torre'], travel: 3,
    foes: ['stalker', 'shade', 'stalker'], regen: ['stalker', 'shade'], loot: { gold: 20, materials: 4 }, enterStress: 5,
  },
  {
    id: 'torre', name: 'Torre del Heraldo', type: 'lair', biome: 'lair',
    desc: 'El lugarteniente del Rey de la Noche guarda aquí el camino hacia el norte.',
    x: 890, y: 160, links: ['paso', 'marjal'], travel: 2,
    foes: ['brute', 'herald', 'stalker'], regen: ['brute', 'herald', 'stalker'], loot: { gold: 80 }, boss: true, source: true,
  },
];

export const NODE = Object.fromEntries(MAP.map((n) => [n.id, n])) as Record<string, NodeDef>;
