import { Rng } from '../../core/rng';
import { ENCOUNTERS, Encounter, MOVE_SKILL, Recruit, SKILLS, UNITS } from './data';
import type { CombatEvent, CombatState, Fighter, Result, Side, Skill, Status, StatusKind } from './types';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const fail = (reason: string): Result => ({ ok: false, reason });

export const BAL = {
  /** Probabilidad de morir al recibir un golpe a las puertas de la muerte. */
  deathBlow: 0.33,
  critMult: 1.5,
  critStressRelief: 4,
  critStressTaken: 10,
  allyDeathStress: 12,
  deathsDoorResistStress: 5,
  nightStress: 3,
  nightSpeed: 2,
  virtueChance: 0.25,
  afflictionActChance: 0.3,
  /** Por debajo de este estrés, una aflicción se disipa. */
  composure: 40,
  initiativeRoll: 6,
};

/** Opción de acción: una habilidad sobre un objetivo concreto. */
export interface Option {
  skill: string;
  target: number;
}

/**
 * Motor del combate por turnos con posiciones. Sin gráficos: cada orden
 * devuelve la lista de eventos que la vista anima, como el juego principal.
 */
export class Combat {
  readonly state: CombatState;
  readonly encounter: Encounter;
  private rng: Rng;

  constructor(encounter: Encounter | string, seed: number) {
    this.encounter = typeof encounter === 'string' ? ENCOUNTERS.find((e) => e.id === encounter)! : encounter;
    this.rng = new Rng(seed);
    this.state = { round: 0, fighters: [], queue: [], active: null, phase: 'busy', night: this.encounter.night, nextId: 1 };
    this.encounter.party.forEach((k, i) => this.spawn(k, 'party', i + 1));
    this.encounter.foes.forEach((k, i) => this.spawn(k, 'foe', i + 1));
  }

  private spawn(unit: string | Recruit, side: Side, rank: number) {
    const r = typeof unit === 'string' ? null : unit;
    const t = UNITS[r ? r.kind : (unit as string)];
    const f: Fighter = {
      ...structuredClone(t),
      id: this.state.nextId++,
      side,
      rank,
      hp: t.maxHp,
      stress: 0,
      statuses: [],
      deathsDoor: false,
      affliction: null,
      alive: true,
    };
    if (r) {
      const b = r.bonus ?? {};
      f.ref = r.ref;
      f.name = r.name;
      f.maxHp += b.maxHp ?? 0;
      f.hp = clamp(r.hp, 1, f.maxHp);
      f.stress = r.stress;
      f.affliction = r.affliction;
      f.dmg = [f.dmg[0] + (b.dmg ?? 0), f.dmg[1] + (b.dmg ?? 0)];
      f.prot = Math.min(0.6, f.prot + (b.prot ?? 0));
      f.acc += b.acc ?? 0;
    }
    if (side === 'party' && this.encounter.fort) f.prot = Math.min(0.6, f.prot + this.encounter.fort);
    if (side === 'foe' && this.state.night) f.speed += BAL.nightSpeed;
    this.state.fighters.push(f);
  }

  // ───────────────────────── consultas ─────────────────────────

  fighter(id: number): Fighter | undefined {
    return this.state.fighters.find((f) => f.id === id);
  }

  alive(side: Side): Fighter[] {
    return this.state.fighters.filter((f) => f.side === side && f.alive).sort((a, b) => a.rank - b.rank);
  }

  get active(): Fighter | undefined {
    return this.state.active !== null ? this.fighter(this.state.active) : undefined;
  }

  has(f: Fighter, kind: StatusKind): Status | undefined {
    return f.statuses.find((s) => s.kind === kind);
  }

  skill(id: string): Skill {
    if (id === MOVE_SKILL)
      return {
        id: MOVE_SKILL,
        name: 'Cambiar de puesto',
        icon: '⇄',
        desc: 'Intercambia la posición con un compañero contiguo.',
        from: [1, 2, 3, 4],
        target: { side: 'ally', ranks: [1, 2, 3, 4] },
      };
    return SKILLS[id];
  }

  /** Habilidades de una unidad, con el motivo si ahora no se pueden usar. */
  skillsOf(id: number): { skill: Skill; usable: boolean; reason?: string }[] {
    const f = this.fighter(id);
    if (!f) return [];
    return [...f.skills, ...(f.side === 'party' ? [MOVE_SKILL] : [])].map((sid) => {
      const skill = this.skill(sid);
      if (!skill.from.includes(f.rank)) return { skill, usable: false, reason: `Solo desde la posición ${skill.from.join(', ')}` };
      if (!this.targets(id, sid).length) return { skill, usable: false, reason: 'No hay objetivos al alcance' };
      return { skill, usable: true };
    });
  }

  /** Objetivos válidos para una habilidad (en las de área, todos los afectados). */
  targets(actorId: number, skillId: string): number[] {
    const f = this.fighter(actorId);
    if (!f) return [];
    const skill = this.skill(skillId);
    if (!skill.from.includes(f.rank)) return [];
    if (skill.target.side === 'self') return [f.id];
    if (skillId === MOVE_SKILL)
      return this.alive(f.side)
        .filter((a) => Math.abs(a.rank - f.rank) === 1)
        .map((a) => a.id);
    const side: Side = skill.target.side === 'ally' ? f.side : f.side === 'party' ? 'foe' : 'party';
    return this.alive(side)
      .filter((t) => skill.target.ranks.includes(t.rank))
      .filter((t) => !(skill.guard && t.id === f.id))
      .map((t) => t.id);
  }

  hitChance(actor: Fighter, skill: Skill, target: Fighter): number {
    if (skill.target.side !== 'enemy') return 1;
    const steady = this.has(target, 'steady') ? 0.1 : 0;
    return clamp((skill.acc ?? 0.9) + actor.acc - target.dodge - steady, 0.05, 0.95);
  }

  critChance(actor: Fighter, skill: Skill): number {
    return clamp(actor.crit + (skill.critBonus ?? 0), 0, 0.5);
  }

  /** Daño mínimo y máximo (sin crítico) de una habilidad contra un objetivo. */
  damageRange(actor: Fighter, skill: Skill, target: Fighter): [number, number] {
    if (!skill.dmg) return [0, 0];
    const mark = this.has(target, 'mark') && skill.markBonus ? 1 + skill.markBonus : 1;
    const calc = (base: number) => Math.max(1, Math.round(base * skill.dmg! * mark * (1 - target.prot) * this.afflictionMult(actor)));
    return [calc(actor.dmg[0]), calc(actor.dmg[1])];
  }

  private afflictionMult(f: Fighter) {
    return f.affliction === 'desesperado' ? 1.2 : f.affliction === 'temeroso' ? 0.85 : 1;
  }

  // ───────────────────────── flujo ─────────────────────────

  /** Empieza el combate: primera ronda y avance hasta el primer turno del jugador. */
  start(): CombatEvent[] {
    const events: CombatEvent[] = [];
    this.advance(events);
    return events;
  }

  act(skillId: string, targetId: number): Result {
    const f = this.active;
    if (this.state.phase !== 'player' || !f || f.side !== 'party') return fail('No es tu turno.');
    if (!this.targets(f.id, skillId).includes(targetId)) return fail('Objetivo no válido.');
    this.state.phase = 'busy';
    const events: CombatEvent[] = [];
    this.execute(f, skillId, targetId, events);
    this.advance(events);
    return { ok: true, events };
  }

  /** Retirada: el combate termina, pero el miedo se queda. */
  retreat(): Result {
    if (this.state.phase !== 'player') return fail('No es tu turno.');
    const events: CombatEvent[] = [];
    for (const p of this.alive('party')) this.addStress(p, 10, events);
    this.state.phase = 'fled';
    events.push({ type: 'end', result: 'fled' });
    return { ok: true, events };
  }

  /** Juega solo hasta que le toca a una unidad del grupo o termina el combate. */
  private advance(events: CombatEvent[]) {
    for (let guard = 0; guard < 500; guard++) {
      if (this.checkEnd(events)) return;
      if (!this.state.queue.length) this.newRound(events);
      const id = this.state.queue.shift()!;
      const f = this.fighter(id);
      if (!f?.alive) continue;
      this.state.active = id;
      events.push({ type: 'turn', id });
      if (!this.startTurn(f, events)) continue;
      if (this.checkEnd(events)) return;

      if (f.side === 'party') {
        // Aflicción: a veces la unidad no obedece.
        if (f.affliction && this.rng.chance(BAL.afflictionActChance)) {
          if (f.affliction === 'temeroso') {
            events.push({ type: 'skip', id: f.id, reason: 'fear' });
            events.push({ type: 'bark', target: f.id, text: 'No puedo… no puedo más.' });
            for (const a of this.alive('party')) if (a.id !== f.id) this.addStress(a, 4, events);
            continue;
          }
          events.push({ type: 'bark', target: f.id, text: '¡Apartaos! ¡Yo me encargo!' });
          const o = this.randomOption(f);
          if (o) this.execute(f, o.skill, o.target, events);
          continue;
        }
        this.state.phase = 'player';
        return;
      }
      const o = this.choose(f);
      if (o) this.execute(f, o.skill, o.target, events);
    }
  }

  private newRound(events: CombatEvent[]) {
    this.state.round++;
    const order = this.state.fighters
      .filter((f) => f.alive)
      .map((f) => ({ f, roll: f.speed + this.rng.int(0, BAL.initiativeRoll) }))
      .sort((a, b) => b.roll - a.roll || a.f.id - b.f.id)
      .map((x) => x.f.id);
    this.state.queue = order;
    events.push({ type: 'round', round: this.state.round, order });
    if (this.state.night && this.state.round > 1) {
      for (const p of this.alive('party')) this.addStress(p, BAL.nightStress, events);
    }
  }

  /** Efectos al empezar el turno. Devuelve false si la unidad pierde el turno. */
  private startTurn(f: Fighter, events: CombatEvent[]): boolean {
    const bleed = this.has(f, 'bleed');
    if (bleed) {
      this.applyDamage(f, bleed.amount ?? 1, false, 'bleed', events);
      if (!f.alive) return false;
    }
    const stunned = this.has(f, 'stun');
    for (const s of f.statuses) if (s.kind !== 'stun') s.turns--;
    for (const s of f.statuses.filter((x) => x.turns <= 0 && x.kind !== 'stun')) this.removeStatus(f, s.kind, events);
    if (stunned) {
      this.removeStatus(f, 'stun', events);
      events.push({ type: 'skip', id: f.id, reason: 'stun' });
      return false;
    }
    return true;
  }

  private checkEnd(events: CombatEvent[]): boolean {
    if (this.state.phase === 'won' || this.state.phase === 'lost' || this.state.phase === 'fled') return true;
    if (!this.alive('foe').length) {
      this.state.phase = 'won';
      this.state.active = null;
      events.push({ type: 'end', result: 'won' });
      return true;
    }
    if (!this.alive('party').length) {
      this.state.phase = 'lost';
      this.state.active = null;
      events.push({ type: 'end', result: 'lost' });
      return true;
    }
    return false;
  }

  // ───────────────────────── ejecutar habilidades ─────────────────────────

  private execute(actor: Fighter, skillId: string, targetId: number, events: CombatEvent[]) {
    const skill = this.skill(skillId);
    const chosen = this.fighter(targetId)!;
    let targets: Fighter[];
    if (skill.target.side === 'self') targets = [actor];
    else if (skill.target.all) {
      const side = skill.target.side === 'ally' ? actor.side : chosen.side;
      targets = this.alive(side).filter((t) => skill.target.ranks.includes(t.rank));
    } else targets = [chosen];

    events.push({ type: 'skill', actor: actor.id, skill: skillId, targets: targets.map((t) => t.id) });

    if (skillId === MOVE_SKILL) {
      this.swap(actor, chosen, events);
      return;
    }

    let partyCrit = false;
    for (let target of targets) {
      if (skill.target.side === 'enemy') {
        // Guardia: el protector recibe el golpe dirigido a su protegido.
        const guarded = this.has(target, 'guarded');
        const guardian = guarded?.by ? this.fighter(guarded.by) : undefined;
        if (!skill.target.all && guardian?.alive) {
          events.push({ type: 'guardRedirect', from: target.id, to: guardian.id });
          target = guardian;
        }
        if (!this.rng.chance(this.hitChance(actor, skill, target))) {
          events.push({ type: target.dodge > 0.1 ? 'dodge' : 'miss', target: target.id });
          continue;
        }
        const crit = !!skill.dmg && this.rng.chance(this.critChance(actor, skill));
        if (skill.dmg) {
          const [lo, hi] = this.damageRange(actor, skill, target);
          let amount = this.rng.int(lo, hi);
          if (crit) amount = Math.round(amount * BAL.critMult);
          this.applyDamage(target, amount, crit, 'hit', events);
          if (crit && actor.side === 'party') partyCrit = true;
          if (crit && actor.side === 'foe' && target.alive) this.addStress(target, BAL.critStressTaken, events);
        }
        if (!target.alive) continue;
        if (skill.stress) this.addStress(target, skill.stress, events);
        if (skill.mark) this.addStatus(target, { kind: 'mark', turns: skill.mark }, events);
        if (skill.bleed && this.rng.chance(skill.bleed.chance))
          this.addStatus(target, { kind: 'bleed', turns: skill.bleed.turns, amount: skill.bleed.amount }, events);
        if (skill.stun && this.rng.chance(this.has(target, 'steady') ? skill.stun / 2 : skill.stun))
          this.addStatus(target, { kind: 'stun', turns: 1 }, events);
        if (skill.push) this.shift(target, skill.push, events);
      } else {
        if (skill.heal) {
          const crit = this.rng.chance(0.1);
          let amount = this.rng.int(skill.heal[0], skill.heal[1]);
          if (crit) amount = Math.round(amount * BAL.critMult);
          this.applyHeal(target, amount, crit, events);
        }
        if (skill.stress) this.addStress(target, skill.stress, events);
        if (skill.steady) this.addStatus(target, { kind: 'steady', turns: skill.steady }, events);
        if (skill.guard) {
          this.addStatus(actor, { kind: 'guarding', turns: skill.guard }, events);
          this.addStatus(target, { kind: 'guarded', turns: skill.guard, by: actor.id }, events);
        }
      }
    }
    if (partyCrit) {
      events.push({ type: 'bark', target: actor.id, text: '¡Por el alba!' });
      for (const p of this.alive('party')) this.addStress(p, -BAL.critStressRelief, events);
    }
    if (skill.selfMove && actor.alive) this.shift(actor, skill.selfMove, events);
  }

  private applyDamage(t: Fighter, amount: number, crit: boolean, source: 'hit' | 'bleed', events: CombatEvent[]) {
    if (t.side === 'foe') {
      t.hp = Math.max(0, t.hp - amount);
      events.push({ type: 'damage', target: t.id, amount, hp: t.hp, crit, source });
      if (t.hp <= 0) this.kill(t, events);
      return;
    }
    if (t.deathsDoor) {
      events.push({ type: 'damage', target: t.id, amount, hp: 0, crit, source });
      const blow = this.has(t, 'steady') ? BAL.deathBlow - 0.1 : BAL.deathBlow;
      if (this.rng.chance(blow)) this.fatal(t, events);
      else {
        events.push({ type: 'resist', target: t.id });
        this.addStress(t, BAL.deathsDoorResistStress, events);
      }
      return;
    }
    t.hp = Math.max(0, t.hp - amount);
    events.push({ type: 'damage', target: t.id, amount, hp: t.hp, crit, source });
    if (t.hp <= 0) {
      t.deathsDoor = true;
      events.push({ type: 'deathsDoor', target: t.id });
    }
  }

  private applyHeal(t: Fighter, amount: number, crit: boolean, events: CombatEvent[]) {
    const real = Math.min(amount, t.maxHp - t.hp);
    t.hp += real;
    if (t.deathsDoor && t.hp > 0) t.deathsDoor = false;
    events.push({ type: 'heal', target: t.id, amount: real, hp: t.hp, crit });
  }

  /** Golpe mortal a un miembro del grupo: muere, salvo el héroe si alguien puede llevárselo. */
  private fatal(t: Fighter, events: CombatEvent[]) {
    const carriers = this.alive('party').filter((f) => f.id !== t.id);
    if (!(this.encounter.carryHero && t.kind === 'hero' && carriers.length)) return this.kill(t, events);
    t.downed = true;
    t.hp = 0;
    t.statuses = [];
    events.push({ type: 'downed', target: t.id });
    for (const p of carriers) this.addStress(p, 10, events);
    this.state.phase = 'fled';
    this.state.active = null;
    events.push({ type: 'end', result: 'fled' });
  }

  private kill(t: Fighter, events: CombatEvent[]) {
    t.alive = false;
    t.hp = 0;
    t.statuses = [];
    events.push({ type: 'death', target: t.id });
    // Quien protegía o era protegido por el caído pierde el vínculo.
    for (const f of this.state.fighters) {
      f.statuses = f.statuses.filter((s) => !((s.kind === 'guarded' || s.kind === 'guarding') && (s.by === t.id || f.id === t.id)));
    }
    if (t.side === 'party') for (const p of this.alive('party')) this.addStress(p, BAL.allyDeathStress, events);
    this.compact(t.side, events);
  }

  /** Estrés: a los 100 se pone a prueba el temple; a los 200, infarto. */
  private addStress(t: Fighter, amount: number, events: CombatEvent[]) {
    if (t.side !== 'party' || !t.alive || !amount) return;
    if (amount > 0 && this.has(t, 'steady')) amount = Math.ceil(amount / 2);
    const before = t.stress;
    t.stress = clamp(t.stress + amount, 0, 200);
    if (t.stress === before) return;
    events.push({ type: 'stress', target: t.id, amount: t.stress - before, stress: t.stress });

    if (before < 100 && t.stress >= 100 && !t.affliction) {
      if (this.rng.chance(BAL.virtueChance)) {
        t.stress = 45;
        events.push({ type: 'resolve', target: t.id, result: 'virtue' });
        events.push({ type: 'stress', target: t.id, amount: 0, stress: t.stress });
        this.addStatus(t, { kind: 'steady', turns: 4 }, events);
        for (const a of this.alive('party')) if (a.id !== t.id) this.addStress(a, -6, events);
      } else {
        t.affliction = this.rng.chance(0.5) ? 'temeroso' : 'desesperado';
        events.push({ type: 'resolve', target: t.id, result: t.affliction });
        for (const a of this.alive('party')) if (a.id !== t.id) this.addStress(a, 5, events);
      }
    } else if (t.affliction && t.stress < BAL.composure) {
      t.affliction = null;
      events.push({ type: 'bark', target: t.id, text: 'Vuelvo a respirar. Sigamos.' });
    }

    if (t.stress >= 200) {
      events.push({ type: 'heartAttack', target: t.id });
      t.stress = 150;
      if (t.deathsDoor) this.fatal(t, events);
      else {
        t.hp = 0;
        t.deathsDoor = true;
        events.push({ type: 'damage', target: t.id, amount: 0, hp: 0, crit: false, source: 'hit' });
        events.push({ type: 'deathsDoor', target: t.id });
      }
    }
  }

  private addStatus(t: Fighter, s: Status, events: CombatEvent[]) {
    const existing = this.has(t, s.kind);
    if (existing) {
      existing.turns = Math.max(existing.turns, s.turns);
      if (s.amount) existing.amount = Math.max(existing.amount ?? 0, s.amount);
      if (s.by) existing.by = s.by;
      return;
    }
    t.statuses.push({ ...s });
    events.push({ type: 'status', target: t.id, status: s.kind, on: true });
  }

  private removeStatus(t: Fighter, kind: StatusKind, events: CombatEvent[]) {
    if (!this.has(t, kind)) return;
    t.statuses = t.statuses.filter((s) => s.kind !== kind);
    events.push({ type: 'status', target: t.id, status: kind, on: false });
  }

  // ───────────────────────── posiciones ─────────────────────────

  /** Desplaza una unidad `by` posiciones (+ atrás, − adelante) reordenando su bando. */
  private shift(f: Fighter, by: number, events: CombatEvent[]) {
    const line = this.alive(f.side);
    const from = line.indexOf(f);
    const to = clamp(from + by, 0, line.length - 1);
    if (to === from) return;
    line.splice(from, 1);
    line.splice(to, 0, f);
    this.applyLine(line, events);
  }

  private swap(a: Fighter, b: Fighter, events: CombatEvent[]) {
    const line = this.alive(a.side);
    const i = line.indexOf(a);
    const j = line.indexOf(b);
    line[i] = b;
    line[j] = a;
    this.applyLine(line, events);
  }

  private compact(side: Side, events: CombatEvent[]) {
    this.applyLine(this.alive(side), events);
  }

  private applyLine(line: Fighter[], events: CombatEvent[]) {
    let changed = false;
    line.forEach((f, i) => {
      if (f.rank !== i + 1) changed = true;
      f.rank = i + 1;
    });
    if (changed) {
      const ranks: Record<number, number> = {};
      for (const f of line) ranks[f.id] = f.rank;
      events.push({ type: 'ranks', ranks });
    }
  }

  // ───────────────────────── inteligencia ─────────────────────────

  options(f: Fighter): Option[] {
    const out: Option[] = [];
    for (const { skill, usable } of this.skillsOf(f.id)) {
      if (!usable) continue;
      for (const t of this.targets(f.id, skill.id)) out.push({ skill: skill.id, target: t });
    }
    return out;
  }

  private randomOption(f: Fighter): Option | null {
    const opts = this.options(f).filter((o) => o.skill !== MOVE_SKILL);
    return opts.length ? this.rng.pick(opts) : null;
  }

  /**
   * Elige la mejor acción con una heurística simple y algo de azar. La usan
   * las criaturas y, en el simulador, también el grupo.
   */
  choose(f: Fighter): Option | null {
    const opts = this.options(f);
    if (!opts.length) return null;
    const scored = opts.map((o) => ({ o, s: this.score(f, o) + this.rng.next() * 3 }));
    scored.sort((a, b) => b.s - a.s);
    return scored[0].o;
  }

  private score(f: Fighter, o: Option): number {
    const skill = this.skill(o.skill);
    const t = this.fighter(o.target)!;
    if (o.skill === MOVE_SKILL) {
      // Moverse solo si desde aquí no se puede atacar.
      return this.options(f).some((x) => x.skill !== MOVE_SKILL && this.skill(x.skill).dmg) ? -10 : 4;
    }
    let s = 0;
    if (skill.target.side === 'enemy') {
      const hit = this.hitChance(f, skill, t);
      const [lo, hi] = this.damageRange(f, skill, t);
      const avg = (lo + hi) / 2;
      const n = skill.target.all ? this.targets(f.id, o.skill).length : 1;
      s += hit * avg * n;
      if (avg >= t.hp) s += 8;
      if (t.deathsDoor) s += f.side === 'foe' ? 3 : 10;
      if (skill.stress) s += (skill.stress / 3) * (t.stress < 100 ? 1 : 0.5) * n;
      if (skill.stun && !this.has(t, 'stun')) s += 4 * skill.stun;
      if (skill.mark && !this.has(t, 'mark')) s += 3;
      if (skill.bleed && !this.has(t, 'bleed')) s += skill.bleed.amount * skill.bleed.turns * 0.6;
      if (skill.push) s += 1;
    } else {
      if (skill.heal) {
        const missing = t.maxHp - t.hp;
        s += Math.min(missing, (skill.heal[0] + skill.heal[1]) / 2) * 1.2 + (t.deathsDoor ? 12 : 0);
        if (missing < 3) s -= 10;
      }
      if (skill.stress) {
        const group = skill.target.all ? this.alive(f.side) : [t];
        const total = group.reduce((acc, g) => acc + Math.min(g.stress, -skill.stress!), 0);
        s += total / 2.5 - (total < 10 ? 6 : 0);
      }
      if (skill.guard) s += this.has(t, 'guarded') ? -5 : t.deathsDoor ? 16 : t.hp < t.maxHp * 0.5 ? 6 : -5;
      if (skill.steady) s += this.has(f, 'steady') ? -5 : 1;
    }
    return s;
  }
}
