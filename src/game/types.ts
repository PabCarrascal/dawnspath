import type { Hex, HexKey } from '../core/hex';
import type { BuildingKind, DifficultyId, PoiKind, Resource, StructureKind, TerrainType, UnitKind } from './config';

export type Team = 'dawn' | 'night';
export type Resources = Record<Resource, number>;

export interface Tile extends Hex {
  terrain: TerrainType;
  /** Variación visual 0..1 (altura, tono). No afecta a las reglas. */
  variant: number;
  /** Dentro de la zona de influencia del reino (se recalcula). */
  owned: boolean;
  structure: StructureKind | null;
  /** Días de obra restantes (0 o ausente: terminado). */
  work?: number;
  workTotal?: number;
  /** Vida de la estructura. */
  shp?: number;
  /** Punto de interés fijo de la casilla. */
  poi?: PoiKind | null;
  /** Ruinas saqueadas, aldea anexionada o santuario ya bendecido. */
  poiUsed?: boolean;
  explored: boolean;
  visible: boolean;
}

export interface Unit extends Hex {
  id: number;
  kind: UnitKind;
  team: Team;
  hp: number;
  maxHp: number;
  atk: number;
  /** Solo el héroe: renombre acumulado y nivel. */
  renown?: number;
  level?: number;
}

export interface Castle extends Hex {
  level: number;
  hp: number;
  maxHp: number;
  /** Días restantes de la mejora en curso (0 = ninguna). */
  upgrade: number;
}

export type Phase = 'day' | 'night' | 'won' | 'lost';
export type EndReason = 'king' | 'beacon' | 'hero' | 'castle';

export interface Stats {
  territory: number;
  shadesSlain: number;
  structuresBuilt: number;
  soldiersRecruited: number;
  poisFound: number;
  lairsDestroyed: number;
}

export interface GameState {
  seed: number;
  difficulty: DifficultyId;
  day: number;
  phase: Phase;
  hours: number;
  res: Resources;
  /** Habitantes civiles: trabajan en los edificios y se reclutan como tropas. */
  population: number;
  castle: Castle;
  forge: boolean;
  /** Noches que el Faro del Alba lleva encendido (null si no existe). */
  beaconNights: number | null;
  kingAwake: boolean;
  tiles: Map<HexKey, Tile>;
  units: Unit[];
  nextId: number;
  stats: Stats;
  endReason?: EndReason;
}

export interface Economy {
  production: Resources;
  /** Víveres consumidos por tropas y habitantes. */
  upkeep: number;
  housing: number;
  workersNeeded: number;
  workersAssigned: number;
  /** Edificios productivos sin gente suficiente. */
  understaffed: HexKey[];
}

export interface DawnReport {
  day: number;
  production: Resources;
  upkeep: number;
  starving: boolean;
  newSettlers: number;
}

/**
 * Eventos que la lógica emite y la capa visual reproduce en orden.
 * Cada evento lleva lo necesario para animarse sin leer el estado final.
 */
export type GameEvent =
  | { type: 'move'; unitId: number; path: Hex[] }
  | { type: 'attack'; attackerId: number; targetId: number; ranged?: boolean }
  | { type: 'damage'; unitId: number; amount: number; hp: number; source: 'attack' | 'counter' | 'tower' | 'hunger' }
  | { type: 'heal'; unitId: number; amount: number; hp: number }
  | { type: 'death'; unitId: number }
  | { type: 'spawn'; unit: Unit }
  | { type: 'build'; at: Hex; structure: BuildingKind; days: number }
  | { type: 'built'; at: Hex; structure: BuildingKind }
  | { type: 'progress'; at: Hex; left: number; total: number }
  | { type: 'castleWork'; days: number }
  | { type: 'castleUpgraded'; level: number; hp: number; maxHp: number }
  | { type: 'siege'; attackerId: number; at: Hex }
  | { type: 'structureHit'; at: Hex; amount: number; hp: number; maxHp: number }
  | { type: 'repair'; at: Hex; hp: number; maxHp: number }
  | { type: 'destroy'; at: Hex; structure: StructureKind; cause: 'shade' | 'storm' }
  | { type: 'claim'; tiles: Hex[] }
  | { type: 'vision' }
  | { type: 'nightfall' }
  | { type: 'storm'; at: Hex | null }
  | { type: 'towerShot'; from: Hex; targetId: number; castle?: boolean }
  | { type: 'kingWakes' }
  | { type: 'dawn'; report: DawnReport }
  | { type: 'beacon'; nights: number; needed: number }
  | { type: 'levelUp'; unitId: number; level: number; hp: number; maxHp: number; atk: number }
  | { type: 'omen'; title: string; text: string; tone: 'good' | 'bad' }
  | { type: 'discover'; at: Hex; poi: PoiKind; title: string; text: string }
  | { type: 'log'; text: string; tone?: 'info' | 'good' | 'bad' | 'epic' }
  | { type: 'gameOver'; victory: boolean; reason: EndReason };

/** Lo que las criaturas nocturnas visibles podrían alcanzar esta noche. */
export interface Threat {
  tiles: Set<HexKey>;
  endangered: Set<number>;
}

export interface SaveData {
  version: 2;
  rng: number;
  state: Omit<GameState, 'tiles'> & { tiles: Tile[] };
}

export type Result = { ok: true; events: GameEvent[] } | { ok: false; reason: string };
