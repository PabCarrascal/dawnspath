import type { Fighter, Skill } from './types';

/** Habilidades. `from` = posiciones desde las que se usan; `target.ranks` = a cuáles alcanzan. */
export const SKILLS: Record<string, Skill> = {
  // ── Héroe ──
  dawnSlash: {
    id: 'dawnSlash', name: 'Tajo del alba', icon: '⚔',
    desc: 'Un golpe certero contra la primera línea.',
    from: [1, 2], target: { side: 'enemy', ranks: [1, 2] }, dmg: 1, acc: 0.9, critBonus: 0.05,
  },
  charge: {
    id: 'charge', name: 'Embestida', icon: '⇥',
    desc: 'Avanza y derriba: empuja al objetivo una posición y puede aturdirlo.',
    from: [1, 2, 3], target: { side: 'enemy', ranks: [1, 2] }, dmg: 0.6, acc: 0.85, push: 1, stun: 0.5, selfMove: -1,
  },
  rally: {
    id: 'rally', name: 'Grito de ánimo', icon: '✶',
    desc: 'Alivia el estrés de todo el grupo.',
    from: [1, 2, 3, 4], target: { side: 'ally', ranks: [1, 2, 3, 4], all: true }, stress: -8,
  },
  guard: {
    id: 'guard', name: 'Escudo en alto', icon: '⛨',
    desc: 'Protege a un compañero: los golpes que reciba irán contra el héroe durante 2 turnos.',
    from: [1, 2, 3], target: { side: 'ally', ranks: [1, 2, 3, 4] }, guard: 2,
  },

  // ── Lancero ──
  thrust: {
    id: 'thrust', name: 'Estocada', icon: '↣',
    desc: 'La lanza alcanza hasta la segunda fila enemiga.',
    from: [1, 2], target: { side: 'enemy', ranks: [1, 2] }, dmg: 1, acc: 0.9,
  },
  sweep: {
    id: 'sweep', name: 'Barrido', icon: '≋',
    desc: 'Golpea a las dos primeras filas a la vez.',
    from: [1, 2], target: { side: 'enemy', ranks: [1, 2], all: true }, dmg: 0.55, acc: 0.85,
  },
  shove: {
    id: 'shove', name: 'Empujón', icon: '⇨',
    desc: 'Desplaza al enemigo dos posiciones atrás y puede aturdirlo.',
    from: [1], target: { side: 'enemy', ranks: [1] }, dmg: 0.3, acc: 0.9, push: 2, stun: 0.4,
  },
  regroup: {
    id: 'regroup', name: 'Reagruparse', icon: '↩',
    desc: 'Retrocede una posición y se prepara: +estabilidad 2 turnos.',
    from: [1, 2, 3], target: { side: 'self', ranks: [1, 2, 3, 4] }, selfMove: 1, steady: 2,
  },

  // ── Arquero ──
  shot: {
    id: 'shot', name: 'Disparo', icon: '➶',
    desc: 'Alcanza a cualquier enemigo.',
    from: [2, 3, 4], target: { side: 'enemy', ranks: [1, 2, 3, 4] }, dmg: 1, acc: 0.85, critBonus: 0.05,
  },
  markShot: {
    id: 'markShot', name: 'Flecha marcadora', icon: '◎',
    desc: 'Marca al objetivo: recibirá más daño de los ataques preparados.',
    from: [3, 4], target: { side: 'enemy', ranks: [1, 2, 3, 4] }, dmg: 0.3, acc: 0.95, mark: 3,
  },
  volley: {
    id: 'volley', name: 'Lluvia de flechas', icon: '⋮',
    desc: 'Cae sobre la retaguardia enemiga.',
    from: [3, 4], target: { side: 'enemy', ranks: [3, 4], all: true }, dmg: 0.6, acc: 0.85,
  },
  pinpoint: {
    id: 'pinpoint', name: 'Tiro certero', icon: '✛',
    desc: 'Daño enorme contra objetivos marcados.',
    from: [2, 3, 4], target: { side: 'enemy', ranks: [1, 2, 3, 4] }, dmg: 0.8, acc: 0.9, markBonus: 1, critBonus: 0.1,
  },

  // ── Capellana ──
  prayer: {
    id: 'prayer', name: 'Plegaria', icon: '✚',
    desc: 'Cura a un compañero; puede sacarlo de las puertas de la muerte.',
    from: [2, 3, 4], target: { side: 'ally', ranks: [1, 2, 3, 4] }, heal: [4, 7],
  },
  solace: {
    id: 'solace', name: 'Consuelo', icon: '❦',
    desc: 'Alivia mucho el estrés de un compañero.',
    from: [2, 3, 4], target: { side: 'ally', ranks: [1, 2, 3, 4] }, stress: -18,
  },
  blind: {
    id: 'blind', name: 'Luz cegadora', icon: '☀',
    desc: 'Una luz del alba que aturde a la primera línea.',
    from: [3, 4], target: { side: 'enemy', ranks: [1, 2] }, dmg: 0.2, acc: 0.9, stun: 0.75,
  },
  staff: {
    id: 'staff', name: 'Bastonazo', icon: '│',
    desc: 'Un golpe flojo, pero algo es algo.',
    from: [1, 2, 3], target: { side: 'enemy', ranks: [1, 2] }, dmg: 0.7, acc: 0.85,
  },

  // ── Criaturas ──
  claw: {
    id: 'claw', name: 'Zarpazo', icon: '',
    desc: '',
    from: [1, 2], target: { side: 'enemy', ranks: [1, 2] }, dmg: 1, acc: 0.85,
  },
  whisper: {
    id: 'whisper', name: 'Susurro', icon: '',
    desc: '',
    from: [1, 2, 3], target: { side: 'enemy', ranks: [1, 2, 3, 4] }, dmg: 0.3, acc: 0.95, stress: 14,
  },
  smash: {
    id: 'smash', name: 'Machacar', icon: '',
    desc: '',
    from: [1, 2], target: { side: 'enemy', ranks: [1, 2] }, dmg: 1, acc: 0.8, stun: 0.25,
  },
  roar: {
    id: 'roar', name: 'Rugido', icon: '',
    desc: '',
    from: [1, 2, 3, 4], target: { side: 'enemy', ranks: [1, 2, 3, 4], all: true }, stress: 11,
  },
  dart: {
    id: 'dart', name: 'Dardo umbrío', icon: '',
    desc: '',
    from: [2, 3, 4], target: { side: 'enemy', ranks: [1, 2, 3, 4] }, dmg: 0.6, acc: 0.9, bleed: { amount: 3, turns: 3, chance: 0.85 },
  },
  // ── Mímico ──
  bite: {
    id: 'bite', name: 'Dentellada', icon: '',
    desc: '',
    from: [1, 2], target: { side: 'enemy', ranks: [1, 2] }, dmg: 1.1, acc: 0.85, bleed: { amount: 2, turns: 2, chance: 0.5 },
  },
  gulp: {
    id: 'gulp', name: 'Engullir', icon: '',
    desc: '',
    from: [1], target: { side: 'enemy', ranks: [1] }, dmg: 0.7, acc: 0.85, stun: 0.4,
  },
  glitter: {
    id: 'glitter', name: 'Brillo del oro', icon: '',
    desc: '',
    from: [1, 2, 3, 4], target: { side: 'enemy', ranks: [1, 2, 3, 4], all: true }, stress: 9,
  },
  // ── Lugarteniente ──
  reap: {
    id: 'reap', name: 'Siega', icon: '',
    desc: '',
    from: [1, 2, 3], target: { side: 'enemy', ranks: [1, 2], all: true }, dmg: 0.75, acc: 0.85,
  },
  dread: {
    id: 'dread', name: 'Pavor', icon: '',
    desc: '',
    from: [1, 2, 3, 4], target: { side: 'enemy', ranks: [1, 2, 3, 4], all: true }, stress: 13, dmg: 0.2, acc: 0.9,
  },
  nightBolt: {
    id: 'nightBolt', name: 'Saeta de noche', icon: '',
    desc: '',
    from: [1, 2, 3, 4], target: { side: 'enemy', ranks: [3, 4] }, dmg: 1.1, acc: 0.85, critBonus: 0.05,
  },
  lunge: {
    id: 'lunge', name: 'Acometida', icon: '',
    desc: '',
    from: [3, 4], target: { side: 'enemy', ranks: [3, 4] }, dmg: 0.9, acc: 0.85, selfMove: -2,
  },
};

/** Movimiento genérico: intercambiar posición con un compañero contiguo. */
export const MOVE_SKILL = 'move';

type Template = Omit<Fighter, 'id' | 'side' | 'rank' | 'statuses' | 'deathsDoor' | 'affliction' | 'alive' | 'hp' | 'stress'>;

export const UNITS: Record<string, Template> = {
  hero: { kind: 'hero', name: 'Héroe del Alba', maxHp: 33, speed: 4, dodge: 0.05, prot: 0.15, acc: 0, crit: 0.05, dmg: [6, 11], skills: ['dawnSlash', 'charge', 'rally', 'guard'] },
  spearman: { kind: 'spearman', name: 'Lancero', maxHp: 29, speed: 3, dodge: 0.05, prot: 0.2, acc: 0, crit: 0.04, dmg: [5, 9], skills: ['thrust', 'sweep', 'shove', 'regroup'] },
  archer: { kind: 'archer', name: 'Arquera', maxHp: 22, speed: 6, dodge: 0.12, prot: 0, acc: 0.05, crit: 0.06, dmg: [4, 8], skills: ['shot', 'markShot', 'pinpoint', 'volley'] },
  chaplain: { kind: 'chaplain', name: 'Capellana', maxHp: 21, speed: 5, dodge: 0.08, prot: 0, acc: 0, crit: 0.05, dmg: [3, 6], skills: ['prayer', 'solace', 'blind', 'staff'] },
  shade: { kind: 'shade', name: 'Sombra', maxHp: 21, speed: 5, dodge: 0.12, prot: 0, acc: 0.05, crit: 0.08, dmg: [5, 8], skills: ['claw', 'whisper'] },
  brute: { kind: 'brute', name: 'Bruto', maxHp: 42, speed: 1, dodge: 0, prot: 0.25, acc: 0.05, crit: 0.08, dmg: [9, 14], skills: ['smash', 'roar'] },
  herald: { kind: 'herald', name: 'Heraldo de la Noche', maxHp: 80, speed: 5, dodge: 0.05, prot: 0.2, acc: 0.05, crit: 0.06, dmg: [8, 12], skills: ['reap', 'dread', 'nightBolt'] },
  mimic: { kind: 'mimic', name: 'Cofre mímico', maxHp: 36, speed: 4, dodge: 0, prot: 0.3, acc: 0.05, crit: 0.1, dmg: [7, 11], skills: ['bite', 'gulp', 'glitter'] },
  stalker: { kind: 'stalker', name: 'Acechador', maxHp: 19, speed: 7, dodge: 0.15, prot: 0, acc: 0.1, crit: 0.1, dmg: [5, 8], skills: ['dart', 'lunge'] },
};

/** Soldado persistente de la campaña que entra en combate con sus heridas y su estrés. */
export interface Recruit {
  ref: string;
  kind: string;
  name: string;
  hp: number;
  stress: number;
  affliction: Fighter['affliction'];
  /** Mejoras de la herrería y de la experiencia. */
  bonus?: { maxHp?: number; dmg?: number; prot?: number; acc?: number };
}

export type Biome = 'meadow' | 'forest' | 'ruins' | 'ford' | 'lair' | 'den' | 'castle' | 'village' | 'shrine' | 'mountain' | 'bog';

export interface Encounter {
  id: string;
  name: string;
  desc: string;
  party: (string | Recruit)[];
  foes: string[];
  night: boolean;
  biome?: Biome;
  /** Protección extra del grupo por pelear atrincherado (torre, empalizada). */
  fort?: number;
  /** Campaña: el héroe no muere mientras quede alguien que lo saque del combate. */
  carryHero?: boolean;
}

export const ENCOUNTERS: Encounter[] = [
  {
    id: 'skirmish',
    name: 'Escaramuza',
    desc: '2 contra 2 · el héroe y una arquera frente a una sombra y un acechador.',
    party: ['hero', 'archer'],
    foes: ['shade', 'stalker'],
    night: false,
    biome: 'meadow',
  },
  {
    id: 'patrol',
    name: 'Patrulla',
    desc: '3 contra 3 · primera línea, lanza y arco contra un bruto y su séquito.',
    party: ['hero', 'spearman', 'archer'],
    foes: ['brute', 'shade', 'stalker'],
    night: false,
    biome: 'ruins',
  },
  {
    id: 'ambush',
    name: 'Emboscada nocturna',
    desc: '4 contra 4 · de noche las criaturas son más rápidas y el miedo pesa más.',
    party: ['hero', 'spearman', 'archer', 'chaplain'],
    foes: ['brute', 'shade', 'shade', 'stalker'],
    night: true,
    biome: 'forest',
  },
];
