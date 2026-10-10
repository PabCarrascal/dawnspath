export type Side = 'party' | 'foe';

export type StatusKind = 'bleed' | 'stun' | 'mark' | 'guarded' | 'guarding' | 'steady';

export interface Status {
  kind: StatusKind;
  /** Turnos propios que le quedan (se descuenta al empezar el turno de quien lo lleva). */
  turns: number;
  /** Daño por turno (sangrado). */
  amount?: number;
  /** Quién lo aplicó (guardia: el protector). */
  by?: number;
}

export type Affliction = 'temeroso' | 'desesperado';

export interface Fighter {
  id: number;
  side: Side;
  kind: string;
  name: string;
  /** Posición: 1 = primera fila. */
  rank: number;
  hp: number;
  maxHp: number;
  /** 0..200: a los 100 se pone a prueba el temple; a los 200, infarto. */
  stress: number;
  speed: number;
  /** Probabilidades 0..1. */
  dodge: number;
  prot: number;
  acc: number;
  crit: number;
  dmg: [number, number];
  skills: string[];
  statuses: Status[];
  deathsDoor: boolean;
  affliction: Affliction | null;
  alive: boolean;
  /** Soldado de la campaña al que representa (para devolverle heridas y estrés). */
  ref?: string;
  /** Abatido: el golpe mortal lo deja inconsciente y el grupo se retira con él. */
  downed?: boolean;
}

export interface TargetRule {
  side: 'enemy' | 'ally' | 'self';
  /** Posiciones a las que alcanza. */
  ranks: number[];
  /** Golpea a todos los de esas posiciones a la vez. */
  all?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  desc: string;
  icon: string;
  /** Posiciones desde las que se puede usar. */
  from: number[];
  target: TargetRule;
  /** Multiplicador sobre el daño base (0 = no hace daño). */
  dmg?: number;
  /** Precisión base de la habilidad. */
  acc?: number;
  critBonus?: number;
  heal?: [number, number];
  /** Estrés que causa (negativo: lo alivia). */
  stress?: number;
  /** Desplaza al objetivo hacia atrás (+) o adelante (−). */
  push?: number;
  /** Mueve al que la usa hacia atrás (+) o adelante (−). */
  selfMove?: number;
  stun?: number;
  bleed?: { amount: number; turns: number; chance: number };
  mark?: number;
  /** Daño extra contra objetivos marcados. */
  markBonus?: number;
  guard?: number;
  steady?: number;
}

export type Phase = 'player' | 'busy' | 'won' | 'lost' | 'fled';

export interface CombatState {
  round: number;
  fighters: Fighter[];
  /** Orden de actuación que queda en esta ronda. */
  queue: number[];
  active: number | null;
  phase: Phase;
  night: boolean;
  nextId: number;
  /** Veces que un soldado ha hallado valor con el estrés al máximo (hazañas). */
  virtues?: number;
}

/** Eventos que el motor emite y la vista reproduce en orden. */
export type CombatEvent =
  | { type: 'round'; round: number; order: number[] }
  | { type: 'turn'; id: number }
  | { type: 'skip'; id: number; reason: 'stun' | 'fear' }
  | { type: 'skill'; actor: number; skill: string; targets: number[] }
  | { type: 'miss'; target: number }
  | { type: 'dodge'; target: number }
  | { type: 'damage'; target: number; amount: number; hp: number; crit: boolean; source: 'hit' | 'bleed' }
  | { type: 'heal'; target: number; amount: number; hp: number; crit: boolean }
  | { type: 'stress'; target: number; amount: number; stress: number }
  | { type: 'status'; target: number; status: StatusKind; on: boolean }
  | { type: 'guardRedirect'; from: number; to: number }
  | { type: 'deathsDoor'; target: number }
  | { type: 'resist'; target: number }
  | { type: 'death'; target: number }
  | { type: 'downed'; target: number }
  | { type: 'ranks'; ranks: Record<number, number> }
  | { type: 'resolve'; target: number; result: 'virtue' | Affliction }
  | { type: 'heartAttack'; target: number }
  | { type: 'bark'; target: number; text: string }
  | { type: 'end'; result: 'won' | 'lost' | 'fled' };

export type Result = { ok: true; events: CombatEvent[] } | { ok: false; reason: string };
