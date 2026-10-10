import type { Biome } from '../../combat/rules/data';
import type { Affliction } from '../../combat/rules/types';

export type SoldierKind = 'hero' | 'spearman' | 'archer' | 'chaplain';
export type BuildingId = 'smithy' | 'tavern' | 'lodge';
export type Structure = 'camp' | 'tower';
export type NodeType = 'castle' | 'meadow' | 'forest' | 'ruins' | 'ford' | 'lair' | 'village' | 'shrine' | 'mountain' | 'den' | 'bog';

export interface Resources {
  gold: number;
  materials: number;
  stone: number;
}

/** Soldado persistente: sus heridas, su estrés y su experiencia viajan con él. */
/** Nombres de los soldados: los de siempre o los de chiste ("Susana Oria"). */
export type NameStyle = 'classic' | 'fun';

/** Nombres alternativos de un soldado o recluta, para poder cambiar de estilo sin perderlos. */
export interface Names {
  classic?: string;
  fun?: string;
  /** Personaje con nombre propio (aldeas, sucesos): no se renombra. */
  unique?: boolean;
}

export interface Soldier extends Names {
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

export interface RecruitOffer extends Names {
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
  /** Aldea: víveres más baratos y un recluta. */
  village?: { foodPrice: number; recruit: Exclude<SoldierKind, 'hero'>; name: string };
  /** Ermita: veces que se puede rezar. */
  prayers?: number;
  /** Foco de oscuridad: mientras siga en pie, la noche se extiende desde aquí. */
  source?: boolean;
  /** Estrés que cuesta entrar (marjales, lugares malditos). */
  enterStress?: number;
}

/** Estado cambiante de un nodo. */
export interface NodeState {
  seen: boolean;
  foes: string[];
  everCleared: boolean;
  looted: boolean;
  structure: Structure | null;
  garrison: string[];
  /** Centinelas pagados de guardia (no son soldados del grupo). */
  sentinels?: number;
  /** Cubierto por la oscuridad: allí siempre se pelea de noche. */
  dark: boolean;
  /** Foco destruido: ya no extiende la oscuridad. */
  destroyed?: boolean;
  /** Ermita: rezos que quedan. Aldea: si ya se contrató a su recluta. */
  uses: number;
  /** Suceso propio del lugar ya ocurrido (aldeas, ermitas). */
  visited?: boolean;
}

export type NodeStatus = 'unknown' | 'hostile' | 'lost' | 'cleared' | 'secured' | 'castle';

/** Suceso esperando a que el jugador elija. */
export interface PendingEvent {
  id: string;
  node: string;
  /** Resultado de la elección, para mostrarlo antes de seguir. */
  result?: LogLine[];
}

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

export type CombatKind = 'node' | 'ambush' | 'road' | 'mimic';

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
  version: 2;
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
  event: PendingEvent | null;
  /** Sucesos de una sola vez que ya han salido. */
  eventsSeen: string[];
  /** Días que faltan para que la oscuridad avance. */
  darkClock: number;
  /** Asedio: días que resiste el castillo con la oscuridad a sus puertas. */
  siege: number | null;
  /** Estilo de nombres de los soldados (ajuste del jugador). */
  names?: NameStyle;
  /** Recargo en el precio de los víveres por aldea (sucesos). */
  villagePrices?: Record<string, number>;
  /** Aldeas cuyo recluta se ofrece gratis. */
  freeHire?: string[];
  /** Último informe del amanecer o del regreso, para mostrarlo tras recargar. */
  report: { title: string; lines: LogLine[] } | null;
  stats: { expeditions: number; battles: number; deaths: number; nights: number };
  nextId: number;
  endReason?: string;
}

export type ActionResult =
  | { ok: true; log: LogLine[]; combat?: PendingCombat; event?: PendingEvent }
  | { ok: false; reason: string };
