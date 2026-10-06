/** Todos los números de balance en un solo sitio. */

export type Resource = 'food' | 'materials' | 'stone' | 'gold';
export type Cost = Partial<Record<Resource, number>>;

export const RESOURCE_NAMES: Record<Resource, string> = {
  food: 'víveres',
  materials: 'materiales',
  stone: 'piedra',
  gold: 'oro',
};

export const BALANCE = {
  mapRadius: 8,
  hoursPerDay: 5,

  terrain: {
    plain: { moveCost: 1 },
    forest: { moveCost: 2 },
    ford: { moveCost: 2 },
    river: { moveCost: Infinity },
    mountain: { moveCost: Infinity },
  },

  units: {
    hero: { hp: 80, atk: 12, upkeep: 2, vision: 2, range: 1, name: 'Héroe', moveRange: 0, reward: 0, renown: 0 },
    militia: { hp: 25, atk: 8, upkeep: 1, vision: 1, range: 1, name: 'Miliciano', moveRange: 0, reward: 0, renown: 0 },
    soldier: { hp: 40, atk: 15, upkeep: 1, vision: 1, range: 1, name: 'Soldado', moveRange: 0, reward: 0, renown: 0 },
    archer: { hp: 25, atk: 10, upkeep: 1, vision: 2, range: 2, name: 'Arquero', moveRange: 0, reward: 0, renown: 0 },
    shade: { hp: 30, atk: 8, upkeep: 0, vision: 0, range: 1, name: 'Sombra', moveRange: 2, reward: 12, renown: 1 },
    brute: { hp: 60, atk: 14, upkeep: 0, vision: 0, range: 1, name: 'Bruto', moveRange: 1, reward: 20, renown: 2 },
    king: { hp: 180, atk: 22, upkeep: 0, vision: 0, range: 1, name: 'Rey de la Noche', moveRange: 1, reward: 0, renown: 0 },
    lair: { hp: 50, atk: 0, upkeep: 0, vision: 0, range: 1, name: 'Guarida de sombras', moveRange: 0, reward: 25, renown: 3 },
  },

  /** El castillo: corazón del reino. Cada nivel amplía territorio, obras y defensas. */
  castle: {
    levels: [
      { name: 'Torreón', radius: 2, slots: 2, hp: 150, food: 3, materials: 3, housing: 6, damage: 6, cost: {} as Cost, days: 0 },
      { name: 'Fortaleza', radius: 3, slots: 3, hp: 250, food: 4, materials: 4, housing: 10, damage: 8, cost: { materials: 25, stone: 15 } as Cost, days: 2 },
      { name: 'Castillo', radius: 4, slots: 4, hp: 350, food: 5, materials: 5, housing: 14, damage: 10, cost: { materials: 40, stone: 30, gold: 12 } as Cost, days: 2 },
      { name: 'Ciudadela del Alba', radius: 5, slots: 4, hp: 500, food: 6, materials: 6, housing: 18, damage: 12, cost: { materials: 30, stone: 45, gold: 30 } as Cost, days: 3 },
    ],
    range: 2,
    vision: 3,
    regen: 10,
  },

  buildings: {
    farm: { name: 'Granja', level: 1, cost: { materials: 8 } as Cost, days: 1, workers: 1, hp: 20, terrain: ['plain'], produces: { food: 3 } as Cost, unique: false },
    sawmill: { name: 'Aserradero', level: 1, cost: { materials: 8 } as Cost, days: 1, workers: 1, hp: 20, terrain: ['forest', 'plain'], produces: { materials: 3 } as Cost, unique: false },
    quarry: { name: 'Cantera', level: 1, cost: { materials: 12 } as Cost, days: 2, workers: 2, hp: 30, terrain: ['plain', 'forest'], produces: { stone: 3 } as Cost, unique: false },
    house: { name: 'Casa', level: 1, cost: { materials: 8 } as Cost, days: 1, workers: 0, hp: 20, terrain: ['plain', 'forest'], produces: {} as Cost, unique: false },
    tower: { name: 'Torre', level: 1, cost: { materials: 15 } as Cost, days: 2, workers: 0, hp: 40, terrain: ['plain', 'forest'], produces: {} as Cost, unique: false },
    outpost: { name: 'Puesto de avanzada', level: 1, cost: { materials: 15, stone: 5 } as Cost, days: 2, workers: 0, hp: 40, terrain: ['plain', 'forest'], produces: {} as Cost, unique: false },
    bridge: { name: 'Puente', level: 1, cost: { materials: 20 } as Cost, days: 2, workers: 0, hp: 0, terrain: ['river'], produces: {} as Cost, unique: false },
    market: { name: 'Mercado', level: 2, cost: { materials: 20, stone: 10 } as Cost, days: 2, workers: 2, hp: 30, terrain: ['plain'], produces: { gold: 1 } as Cost, unique: true },
    barracks: { name: 'Cuartel', level: 2, cost: { materials: 25, stone: 10 } as Cost, days: 2, workers: 0, hp: 40, terrain: ['plain', 'forest'], produces: {} as Cost, unique: true },
    wall: { name: 'Muralla', level: 2, cost: { stone: 4 } as Cost, days: 1, workers: 0, hp: 50, terrain: ['plain', 'forest', 'ford'], produces: {} as Cost, unique: false },
    archery: { name: 'Arquería', level: 3, cost: { materials: 25, stone: 10, gold: 5 } as Cost, days: 2, workers: 0, hp: 30, terrain: ['plain', 'forest'], produces: {} as Cost, unique: true },
    forge: { name: 'Herrería', level: 3, cost: { materials: 20, stone: 20, gold: 10 } as Cost, days: 2, workers: 0, hp: 30, terrain: ['plain', 'forest'], produces: {} as Cost, unique: true },
    beacon: { name: 'Faro del Alba', level: 4, cost: { materials: 35, stone: 35, gold: 25 } as Cost, days: 3, workers: 0, hp: 90, terrain: ['plain', 'forest'], produces: {} as Cost, unique: true },
  },

  /** Efectos especiales de algunos edificios. */
  effects: {
    house: { housing: 4 },
    tower: { vision: 3, damage: 6, range: 2, influence: 1 },
    outpost: { influence: 2, vision: 2, heal: 15 },
    forge: { atk: 3 },
    beacon: { nights: 3, spawnBoost: 2 },
    repair: 0.25,
  },

  recruit: {
    militia: { cost: { food: 10 } as Cost, requires: null, castleLevel: 1 },
    soldier: { cost: { food: 15, materials: 10, gold: 3 } as Cost, requires: 'barracks', castleLevel: 2 },
    archer: { cost: { food: 10, materials: 15, gold: 5 } as Cost, requires: 'archery', castleLevel: 3 },
  },

  population: {
    start: 3,
    /** Cada N habitantes consumen 1 víver al día. */
    perFood: 2,
    growth: 1,
    /** Impuestos: cada N habitantes aportan 1 de oro al día. */
    perGold: 5,
  },

  market: [
    { give: { food: 10 } as Cost, get: { gold: 3 } as Cost },
    { give: { materials: 10 } as Cost, get: { gold: 3 } as Cost },
    { give: { gold: 4 } as Cost, get: { food: 10 } as Cost },
    { give: { gold: 5 } as Cost, get: { stone: 6 } as Cost },
  ],

  hero: {
    levels: [0, 2, 5, 9, 14, 20, 27],
    perLevel: { hp: 10, atk: 3, heal: 25 },
  },

  /** Bonus de daño por cada aliado adicional adyacente al objetivo (flanqueo). */
  flankBonus: 0.25,
  starvationDamage: 10,
  /** Las tormentas dañan, pero nunca derriban: dejan al menos 1 PV. */
  storm: { chance: 0.15, damage: 15, fromDay: 4 },

  night: {
    spawnBase: 0.4,
    spawnPerDay: 0.04,
    spawnMax: 0.9,
    kingWakeDistance: 3,
    bruteFromDay: 6,
    bruteChance: 0.28,
  },

  poi: {
    ruins: { count: 5, name: 'Ruinas' },
    village: { count: 3, name: 'Aldea', gold: 1, housing: 2, settlers: 2, influence: 1, vision: 2 },
    shrine: { count: 2, name: 'Santuario', heal: 20, blessing: 30, renown: 1 },
    lair: { count: 3, spawnChance: 0.3, minHeroDistance: 6 },
    /** Tope de criaturas nocturnas vivas (sin contar al Rey ni las guaridas). */
    maxCreatures: 12,
  },

  omenChance: 0.32,
} as const;

export const DIFFICULTIES = {
  easy: {
    name: 'Fácil',
    description: 'Más recursos y noches más tranquilas.',
    start: { food: 30, materials: 30, stone: 5, gold: 0 },
    spawn: 0.7,
    enemyAtk: 0.8,
    kingWakeDay: 16,
  },
  normal: {
    name: 'Normal',
    description: 'La experiencia pensada.',
    start: { food: 20, materials: 25, stone: 0, gold: 0 },
    spawn: 1,
    enemyAtk: 1,
    kingWakeDay: 14,
  },
  hard: {
    name: 'Difícil',
    description: 'Escasez, sombras feroces y un Rey impaciente.',
    start: { food: 15, materials: 14, stone: 0, gold: 0 },
    spawn: 1.3,
    enemyAtk: 1.25,
    kingWakeDay: 11,
  },
} as const;

export type TerrainType = keyof typeof BALANCE.terrain;
export type UnitKind = keyof typeof BALANCE.units;
export type BuildingKind = keyof typeof BALANCE.buildings;
/** Lo que puede ocupar una casilla: un edificio o el castillo. */
export type StructureKind = BuildingKind | 'castle';
export type RecruitKind = keyof typeof BALANCE.recruit;
export type DifficultyId = keyof typeof DIFFICULTIES;
export type PoiKind = 'ruins' | 'village' | 'shrine';

export const RESOURCES: Resource[] = ['food', 'materials', 'stone', 'gold'];
