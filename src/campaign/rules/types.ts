import type { Biome } from '../../combat/rules/data';
import type { Affliction } from '../../combat/rules/types';

export type SoldierKind = 'hero' | 'spearman' | 'archer' | 'chaplain';
export type BuildingId = 'smithy' | 'tavern' | 'lodge';
export type Structure = 'camp' | 'tower';
export type NodeType = 'castle' | 'meadow' | 'forest' | 'ruins' | 'ford' | 'lair';

export interface Resources {
  gold: number;
  materials: number;
  stone: number;
}

/** Soldado persistente: sus heridas, su estrés y su experiencia viajan con él. */
export interface Soldier {
  id: string;
  kind: SoldierKind;
  name: string;
  hp: number;
  stress: number;
  affliction: Affliction | null;
  xp: number;
  alive: boolean;
  /** Dónde está: en el castillo, con el grupo o de guardia en un nodo. */
  where: 'castle' | 'party' | 'garrison';
  post?: string;
  /** Causa de la muerte, para el memorial. */
  fate?: string;
}

export interface RecruitOffer {
  kind: SoldierKind;
  name: string;
  cost: number;
}

/** Definición fija de un nodo del sendero. */
export interface NodeDef {
  id: string;
  name: string;
  type: NodeType;
  biome: Biome;
  desc: string;
  /** Posición en el mapa ilustrado (0..1000 × 0..620). */
  x: number;
  y: number;
  links: string[];
  /** Horas de luz que cuesta llegar. */
  travel: number;
  foes: string[];
  /** Quiénes vuelven si las criaturas retoman el nodo. */
  regen: string[];
  loot: Partial<Resources>;
  boss?: boolean;
}

/** Estado cambiante de un nodo. */
export interface NodeState {
  seen: boolean;
  foes: string[];
  everCleared: boolean;
  looted: boolean;
  structure: Structure | null;
  garrison: string[];
}

export type NodeStatus = 'unknown' | 'hostile' | 'lost' | 'cleared' | 'secured' | 'castle';

export interface Expedition {
  /** Ids de soldados en orden de posición (1 = delante). */
  party: string[];
  node: string;
  /** Nodo del que se viene (para retirarse tras huir de un combate). */
  prev: string | null;
  hours: number;
  maxHours: number;
  food: number;
  torches: number;
  /** Lo que lleva la caravana: botín, materiales y piedra para obras. */
  bag: Resources;
  /** Días que lleva fuera. */
  days: number;
}

export type CombatKind = 'node' | 'ambush' | 'road';

export interface PendingCombat {
  kind: CombatKind;
  node: string;
  seed: number;
  night: boolean;
  foes: string[];
  fort: number;
  /** Emboscada nocturna: cómo fue la noche, para aplicar el descanso al terminar. */
  rest?: { rough: boolean; torch: boolean };
}

export interface LogLine {
  text: string;
  tone: 'good' | 'bad' | 'info';
}

export interface CampaignState {
  version: 1;
  seed: number;
  rng: number;
  day: number;
  phase: 'castle' | 'expedition' | 'won' | 'lost';
  stock: Resources & { food: number; torches: number };
  buildings: Record<BuildingId, number>;
  soldiers: Soldier[];
  recruits: RecruitOffer[];
  nodes: Record<string, NodeState>;
  exp: Expedition | null;
  pending: PendingCombat | null;
  /** Último informe del amanecer o del regreso, para mostrarlo tras recargar. */
  report: { title: string; lines: LogLine[] } | null;
  stats: { expeditions: number; battles: number; deaths: number; nights: number };
  nextId: number;
  endReason?: string;
}

export type ActionResult =
  | { ok: true; log: LogLine[]; combat?: PendingCombat }
  | { ok: false; reason: string };
