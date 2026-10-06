import { Rng } from '../../core/rng';
import type { Combat } from '../../combat/rules/Combat';
import { Encounter, Recruit, UNITS } from '../../combat/rules/data';
import { BUILDINGS, CBAL, KIND_NAMES, MAP, NAMES, NIGHT_FOES, NODE, RECRUIT_COST, START, STRUCTURES } from './data';
import type {
  ActionResult,
  BuildingId,
  CampaignState,
  LogLine,
  NodeState,
  NodeStatus,
  PendingCombat,
  Resources,
  Soldier,
  SoldierKind,
  Structure,
} from './types';

const fail = (reason: string): ActionResult => ({ ok: false, reason });
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const RES: (keyof Resources)[] = ['gold', 'materials', 'stone'];
const RES_NAME: Record<keyof Resources, string> = { gold: 'oro', materials: 'materiales', stone: 'piedra' };

export function formatRes(r: Partial<Resources>) {
  return RES.filter((k) => r[k]).map((k) => `${r[k]} ${RES_NAME[k]}`).join(', ');
}

/**
 * Reglas de la campaña: castillo, sendero, expediciones, noche y guarniciones.
 * Sin gráficos; cada acción devuelve un registro y, si toca, un combate pendiente.
 */
export class Campaign {
  readonly state: CampaignState;
  private rng: Rng;

  constructor(seed: number, saved?: CampaignState) {
    if (saved) {
      this.state = saved;
      this.rng = new Rng(saved.rng);
      return;
    }
    this.rng = new Rng(seed);
    const nodes: Record<string, NodeState> = {};
    for (const n of MAP) {
      nodes[n.id] = { seen: n.id === 'castle' || n.id === 'prado', foes: [...n.foes], everCleared: n.id === 'castle', looted: false, structure: null, garrison: [] };
    }
    this.state = {
      version: 1,
      seed,
      rng: 0,
      day: 1,
      phase: 'castle',
      stock: { ...START.stock },
      buildings: { smithy: 0, tavern: 0, lodge: 0 },
      soldiers: [],
      recruits: [],
      nodes,
      exp: null,
      pending: null,
      report: null,
      stats: { expeditions: 0, battles: 0, deaths: 0, nights: 0 },
      nextId: 1,
    };
    for (const s of START.soldiers) this.addSoldier(s.kind, s.name);
    this.rollRecruits();
    this.sync();
  }

  /** Guarda la posición del generador aleatorio en el estado (para el guardado). */
  private sync() {
    this.state.rng = this.rng.state;
  }

  // ───────────────────────── consultas ─────────────────────────

  soldier(id: string): Soldier | undefined {
    return this.state.soldiers.find((s) => s.id === id);
  }

  get hero(): Soldier {
    return this.state.soldiers.find((s) => s.kind === 'hero')!;
  }

  get party(): Soldier[] {
    return (this.state.exp?.party ?? []).map((id) => this.soldier(id)!).filter(Boolean);
  }

  level(s: Soldier) {
    let l = 0;
    CBAL.xpLevels.forEach((xp, i) => s.xp >= xp && (l = i));
    return l;
  }

  maxHp(s: Soldier) {
    return UNITS[s.kind].maxHp + this.level(s) * 3;
  }

  /** Mejoras de herrería y experiencia que el soldado lleva al combate. */
  bonus(s: Soldier) {
    const smith = this.state.buildings.smithy;
    const lvl = this.level(s);
    return { maxHp: lvl * 3, dmg: smith + (lvl >= 2 ? 1 : 0), prot: smith * 0.05, acc: lvl * 0.03 };
  }

  node(id: string): NodeState {
    return this.state.nodes[id];
  }

  status(id: string): NodeStatus {
    const n = this.node(id);
    if (id === 'castle') return 'castle';
    if (!n.seen) return 'unknown';
    if (n.foes.length) return n.everCleared ? 'lost' : 'hostile';
    return n.structure && n.garrison.length ? 'secured' : 'cleared';
  }

  /** Horas que cuesta llegar a un nodo vecino. */
  travelCost(to: string) {
    const st = this.status(to);
    return st === 'secured' || st === 'castle' ? Math.min(CBAL.securedTravel + (to === 'castle' ? 1 : 0), NODE[to].travel) : NODE[to].travel;
  }

  structureCost(kind: Structure): { res: Partial<Resources>; hours: number } {
    const lodge = this.state.buildings.lodge;
    const faster = lodge >= 2 ? 1 : 0;
    if (kind === 'camp') return { res: { materials: lodge >= 1 ? 3 : 4 }, hours: 3 - faster };
    return { res: { materials: 6, stone: 4 }, hours: 5 - faster };
  }

  canAfford(have: Partial<Resources>, cost: Partial<Resources>) {
    return RES.every((k) => (have[k] ?? 0) >= (cost[k] ?? 0));
  }

  // ───────────────────────── soldados y reclutas ─────────────────────────

  private addSoldier(kind: SoldierKind, name: string): Soldier {
    const s: Soldier = { id: `s${this.state.nextId++}`, kind, name, hp: UNITS[kind].maxHp, stress: 0, affliction: null, xp: 0, alive: true, where: 'castle' };
    this.state.soldiers.push(s);
    return s;
  }

  private rollRecruits() {
    const n = 2 + this.state.buildings.tavern;
    const used = new Set(this.state.soldiers.map((s) => s.name));
    const kinds: Exclude<SoldierKind, 'hero'>[] = ['spearman', 'archer', 'chaplain'];
    const offers = [];
    for (let i = 0; i < n; i++) {
      // Siempre hay al menos una capellana en la primera oferta: el grupo la necesita.
      const kind = i === 0 && !this.state.soldiers.some((s) => s.kind === 'chaplain' && s.alive) ? 'chaplain' : this.rng.pick(kinds);
      const pool = NAMES[kind].filter((x) => !used.has(x));
      const name = pool.length ? this.rng.pick(pool) : `${this.rng.pick(NAMES[kind])} ${i + 2}`;
      used.add(name);
      offers.push({ kind, name, cost: RECRUIT_COST[kind] });
    }
    // Si el héroe se ha quedado solo, alguien de la aldea se ofrece sin pedir nada.
    if (!this.state.soldiers.some((s) => s.alive && s.kind !== 'hero')) offers[0].cost = 0;
    this.state.recruits = offers;
  }

  // ───────────────────────── castillo ─────────────────────────

  private inCastle(): string | null {
    if (this.state.phase !== 'castle') return 'Solo desde el castillo.';
    return null;
  }

  upgrade(b: BuildingId): ActionResult {
    const err = this.inCastle();
    if (err) return fail(err);
    const lvl = this.state.buildings[b];
    const cost = BUILDINGS[b].cost[lvl];
    if (!cost) return fail('Ya está al máximo.');
    if (!this.canAfford(this.state.stock, cost)) return fail(`Hace falta ${formatRes(cost)}.`);
    for (const k of RES) this.state.stock[k] -= cost[k] ?? 0;
    this.state.buildings[b] = lvl + 1;
    if (b === 'tavern') this.rollRecruits();
    this.sync();
    return { ok: true, log: [{ text: `${BUILDINGS[b].name}: ${BUILDINGS[b].levels[lvl + 1]}.`, tone: 'good' }] };
  }

  /** Alivio de estrés en la taberna; cura las aflicciones. */
  treatRelief() {
    return 25 + this.state.buildings.tavern * 15;
  }

  treat(id: string): ActionResult {
    const err = this.inCastle();
    if (err) return fail(err);
    const s = this.soldier(id);
    if (!s?.alive || s.where !== 'castle') return fail('No está en el castillo.');
    if (!s.stress && !s.affliction) return fail('No lo necesita.');
    if (this.state.stock.gold < CBAL.treatCost) return fail(`Hacen falta ${CBAL.treatCost} de oro.`);
    this.state.stock.gold -= CBAL.treatCost;
    s.stress = Math.max(0, s.stress - this.treatRelief());
    const cured = !!s.affliction;
    s.affliction = null;
    return { ok: true, log: [{ text: `${s.name} pasa la noche en la taberna${cured ? ' y recupera el temple' : ''}.`, tone: 'good' }] };
  }

  /** Pasar un día en el castillo: descanso gratuito, pero el tiempo corre. */
  rest(): ActionResult {
    const err = this.inCastle();
    if (err) return fail(err);
    for (const s of this.state.soldiers) {
      if (!s.alive || s.where !== 'castle') continue;
      s.stress = Math.max(0, s.stress + CBAL.rest.castle.stress);
      if (s.affliction && s.stress < 40) s.affliction = null;
    }
    const log: LogLine[] = [{ text: `Pasa un día en el castillo (${CBAL.rest.castle.stress} de estrés para todos).`, tone: 'info' }];
    log.push(...this.remoteNight(null));
    this.state.day++;
    this.rollRecruits();
    if (log.length > 1) this.state.report = { title: `Noticias del sendero · día ${this.state.day}`, lines: log };
    this.sync();
    return { ok: true, log };
  }

  recruit(i: number): ActionResult {
    const err = this.inCastle();
    if (err) return fail(err);
    const o = this.state.recruits[i];
    if (!o) return fail('No hay recluta.');
    if (this.state.stock.gold < o.cost) return fail(`Hacen falta ${o.cost} de oro.`);
    this.state.stock.gold -= o.cost;
    this.state.recruits.splice(i, 1);
    const s = this.addSoldier(o.kind, o.name);
    return { ok: true, log: [{ text: `${s.name} (${KIND_NAMES[s.kind]}) se une a la compañía.`, tone: 'good' }] };
  }

  buy(item: 'food' | 'torches', n: number): ActionResult {
    const err = this.inCastle();
    if (err) return fail(err);
    const price = item === 'food' ? CBAL.foodPrice : CBAL.torchPrice;
    const cap = item === 'food' ? CBAL.foodCap : CBAL.torchCap;
    if (n < 0) {
      const back = Math.min(-n, this.state.stock[item]);
      this.state.stock[item] -= back;
      this.state.stock.gold += back * price;
      return { ok: true, log: [] };
    }
    if (this.state.stock[item] + n > cap) return fail(`Como mucho ${cap}.`);
    if (this.state.stock.gold < price * n) return fail('No hay oro suficiente.');
    this.state.stock.gold -= price * n;
    this.state.stock[item] += n;
    return { ok: true, log: [] };
  }

  /** Sale de expedición con el grupo indicado, en orden de posición. */
  depart(ids: string[]): ActionResult {
    const err = this.inCastle();
    if (err) return fail(err);
    if (!ids.length || ids.length > CBAL.partyMax) return fail(`El grupo es de 1 a ${CBAL.partyMax} soldados.`);
    const party = ids.map((id) => this.soldier(id));
    if (party.some((s) => !s?.alive || s.where !== 'castle')) return fail('Hay soldados que no están disponibles.');
    if (!party.some((s) => s!.kind === 'hero')) return fail('El héroe encabeza cada expedición.');
    const st = this.state.stock;
    if (st.food < ids.length) return fail('Lleva al menos una ración por soldado.');
    for (const s of party) s!.where = 'party';
    this.state.exp = {
      party: [...ids],
      node: 'castle',
      prev: null,
      hours: CBAL.maxHours,
      maxHours: CBAL.maxHours,
      food: st.food,
      torches: st.torches,
      bag: { gold: 0, materials: st.materials, stone: st.stone },
      days: 1,
    };
    st.food = 0;
    st.torches = 0;
    st.materials = 0;
    st.stone = 0;
    this.state.phase = 'expedition';
    this.state.stats.expeditions++;
    this.state.report = null;
    this.sync();
    return { ok: true, log: [{ text: 'La compañía cruza la puerta del castillo.', tone: 'info' }] };
  }

  // ───────────────────────── expedición ─────────────────────────

  private onRoad(): string | null {
    if (this.state.phase !== 'expedition' || !this.state.exp) return 'No hay expedición en curso.';
    if (this.state.pending) return 'Primero hay que resolver el combate.';
    return null;
  }

  private spend(hours: number): string | null {
    const e = this.state.exp!;
    if (e.hours < hours) return `Hacen falta ${hours} horas de luz y quedan ${e.hours}. Acampa para pasar la noche.`;
    e.hours -= hours;
    return null;
  }

  move(to: string): ActionResult {
    const err = this.onRoad();
    if (err) return fail(err);
    const e = this.state.exp!;
    if (!NODE[e.node].links.includes(to)) return fail('No hay camino directo.');
    const cost = this.travelCost(to);
    const noLight = this.spend(cost);
    if (noLight) return fail(noLight);
    e.prev = e.node;
    e.node = to;
    const n = this.node(to);
    const firstTime = !n.seen;
    n.seen = true;
    const log: LogLine[] = [{ text: `El grupo llega a ${NODE[to].name} (${cost} h).`, tone: 'info' }];

    if (to === 'castle') return this.returnHome(log);
    if (n.foes.length) {
      log.push({ text: firstTime ? 'Hay criaturas esperando.' : 'Las criaturas guardan el paso.', tone: 'bad' });
      return { ok: true, log, combat: this.startCombat('node', to, n.foes, false) };
    }
    if (this.status(to) === 'cleared' && this.rng.chance(CBAL.roadAmbush)) {
      log.push({ text: 'Sin nadie de guardia, algo os acechaba entre la maleza.', tone: 'bad' });
      return { ok: true, log, combat: this.startCombat('road', to, NIGHT_FOES[0], false) };
    }
    this.sync();
    return { ok: true, log };
  }

  /** Explora los nodos vecinos: revela qué los defiende. */
  scout(): ActionResult {
    const err = this.onRoad();
    if (err) return fail(err);
    const e = this.state.exp!;
    const hidden = NODE[e.node].links.filter((id) => !this.node(id).seen);
    if (!hidden.length) return fail('Ya conocéis los alrededores.');
    const noLight = this.spend(CBAL.scoutHours);
    if (noLight) return fail(noLight);
    for (const id of hidden) this.node(id).seen = true;
    this.sync();
    return { ok: true, log: hidden.map((id) => ({ text: `Exploradores: ${NODE[id].name} — ${this.describeFoes(this.node(id).foes)}.`, tone: 'info' as const })) };
  }

  describeFoes(foes: string[]) {
    if (!foes.length) return 'despejado';
    const count: Record<string, number> = {};
    for (const f of foes) count[UNITS[f].name] = (count[UNITS[f].name] ?? 0) + 1;
    return Object.entries(count).map(([n, c]) => (c > 1 ? `${c} × ${n}` : n)).join(', ');
  }

  loot(): ActionResult {
    const err = this.onRoad();
    if (err) return fail(err);
    const e = this.state.exp!;
    const n = this.node(e.node);
    const def = NODE[e.node];
    if (n.foes.length) return fail('Antes hay que limpiar el nodo.');
    if (n.looted || !Object.keys(def.loot).length) return fail('No queda nada que saquear.');
    const noLight = this.spend(CBAL.lootHours);
    if (noLight) return fail(noLight);
    n.looted = true;
    const got: Partial<Resources> = {};
    for (const k of RES) {
      const v = def.loot[k];
      if (!v) continue;
      got[k] = Math.round(v * (0.8 + this.rng.next() * 0.4));
      e.bag[k] += got[k]!;
    }
    const log: LogLine[] = [{ text: `Botín: ${formatRes(got)}.`, tone: 'good' }];
    // Las ruinas tienen trampas: el miedo cuesta algo de temple.
    if (def.type === 'ruins' && this.rng.chance(0.4)) {
      for (const s of this.party) s.stress = clamp(s.stress + 8, 0, 200);
      log.push({ text: 'Un derrumbe entre los muros: +8 de estrés al grupo.', tone: 'bad' });
    }
    this.sync();
    return { ok: true, log };
  }

  build(kind: Structure): ActionResult {
    const err = this.onRoad();
    if (err) return fail(err);
    const e = this.state.exp!;
    const n = this.node(e.node);
    if (e.node === 'castle') return fail('En el castillo no.');
    if (n.foes.length) return fail('Antes hay que limpiar el nodo.');
    if (n.structure === kind || n.structure === 'tower') return fail('Ya está construido.');
    if (kind === 'tower' && this.state.buildings.lodge < 1) return fail('La logia de constructores aún no tiene los planos de la torre.');
    const { res, hours } = this.structureCost(kind);
    if (!this.canAfford(e.bag, res)) return fail(`Hace falta ${formatRes(res)} en la caravana.`);
    const noLight = this.spend(hours);
    if (noLight) return fail(noLight);
    for (const k of RES) e.bag[k] -= res[k] ?? 0;
    n.structure = kind;
    this.sync();
    return { ok: true, log: [{ text: `${STRUCTURES[kind].name} levantado en ${NODE[e.node].name}.`, tone: 'good' }] };
  }

  /** Deja a un soldado de guardia en la estructura del nodo. */
  garrison(id: string): ActionResult {
    const err = this.onRoad();
    if (err) return fail(err);
    const e = this.state.exp!;
    const n = this.node(e.node);
    const s = this.soldier(id);
    if (!s || s.where !== 'party') return fail('No está en el grupo.');
    if (s.kind === 'hero') return fail('El héroe no se queda atrás.');
    if (!n.structure) return fail('Hace falta un campamento o una torre.');
    if (n.garrison.length >= STRUCTURES[n.structure].garrison) return fail('No cabe nadie más de guardia.');
    if (e.party.length <= 1) return fail('El grupo no puede quedarse vacío.');
    e.party = e.party.filter((x) => x !== id);
    n.garrison.push(id);
    s.where = 'garrison';
    s.post = e.node;
    this.sync();
    return { ok: true, log: [{ text: `${s.name} queda de guardia en ${NODE[e.node].name}.`, tone: 'info' }] };
  }

  recall(id: string): ActionResult {
    const err = this.onRoad();
    if (err) return fail(err);
    const e = this.state.exp!;
    const n = this.node(e.node);
    const s = this.soldier(id);
    if (!s || !n.garrison.includes(id)) return fail('No está de guardia aquí.');
    if (e.party.length >= CBAL.partyMax) return fail('El grupo está completo.');
    n.garrison = n.garrison.filter((x) => x !== id);
    e.party.push(id);
    s.where = 'party';
    s.post = undefined;
    this.sync();
    return { ok: true, log: [{ text: `${s.name} se reincorpora al grupo.`, tone: 'info' }] };
  }

  /** Reordena el grupo (posiciones de combate). */
  reorder(ids: string[]): ActionResult {
    const e = this.state.exp;
    if (!e || this.state.pending) return fail('Ahora no.');
    if (ids.length !== e.party.length || !ids.every((id) => e.party.includes(id))) return fail('Orden no válido.');
    e.party = [...ids];
    return { ok: true, log: [] };
  }

  /** Desde la puerta del castillo aún se puede dar media vuelta. */
  cancel(): ActionResult {
    const err = this.onRoad();
    if (err) return fail(err);
    const e = this.state.exp!;
    if (e.node !== 'castle') return fail('Solo antes de cruzar la puerta.');
    const st = this.state.stock;
    for (const k of RES) st[k] += e.bag[k];
    st.food += e.food;
    st.torches += e.torches;
    for (const s of this.party) s.where = 'castle';
    this.state.exp = null;
    this.state.phase = 'castle';
    this.state.stats.expeditions--;
    this.sync();
    return { ok: true, log: [] };
  }

  // ───────────────────────── combate ─────────────────────────

  private startCombat(kind: PendingCombat['kind'], node: string, foes: string[], night: boolean): PendingCombat {
    const n = this.node(node);
    const lodge = this.state.buildings.lodge;
    const fort = n.structure === 'tower' ? (lodge >= 3 ? 0.18 : 0.12) : 0;
    this.state.pending = { kind, node, seed: this.rng.int(1, 1e9), night, foes: [...foes], fort: kind === 'node' ? 0 : fort };
    this.sync();
    return this.state.pending;
  }

  /** Encuentro para el motor de combate, con los soldados tal como están. */
  encounter(p = this.state.pending!): Encounter {
    const party: Recruit[] = this.party.map((s) => ({ ref: s.id, kind: s.kind, name: s.name, hp: s.hp, stress: s.stress, affliction: s.affliction, bonus: this.bonus(s) }));
    const def = NODE[p.node];
    return {
      id: `${p.kind}-${p.node}`,
      name: p.kind === 'ambush' ? `Emboscada en ${def.name}` : p.kind === 'road' ? `Asalto en ${def.name}` : def.name,
      desc: '',
      party,
      foes: p.foes,
      night: p.night,
      biome: def.biome,
      fort: p.fort,
      carryHero: true,
    };
  }

  /** Devuelve a la campaña el resultado de un combate jugado (o simulado). */
  resolveCombat(combat: Combat): ActionResult {
    const p = this.state.pending;
    const e = this.state.exp;
    if (!p || !e) return fail('No hay combate pendiente.');
    const outcome = combat.state.phase;
    if (outcome !== 'won' && outcome !== 'lost' && outcome !== 'fled') return fail('El combate no ha terminado.');
    this.state.pending = null;
    this.state.stats.battles++;
    const log: LogLine[] = [];

    // Heridas, estrés y bajas vuelven a los soldados; el orden final de filas se conserva.
    const party = combat.state.fighters.filter((f) => f.side === 'party' && f.ref);
    for (const f of party) {
      const s = this.soldier(f.ref!)!;
      s.stress = f.stress;
      s.affliction = f.affliction;
      if (!f.alive) {
        this.bury(s, `Cayó en ${NODE[p.node].name}`);
        log.push({ text: `${s.name} ha muerto. Su nombre queda en el memorial.`, tone: 'bad' });
        continue;
      }
      s.hp = Math.max(1, f.hp);
      if (outcome === 'won') {
        const before = this.level(s);
        s.xp++;
        if (this.level(s) > before) {
          s.hp += 3;
          log.push({ text: `${s.name} sube a nivel ${this.level(s)}: más vida${this.level(s) >= 2 ? ' y más daño' : ''}.`, tone: 'good' });
        }
      }
    }
    e.party = party.filter((f) => f.alive).sort((a, b) => a.rank - b.rank).map((f) => f.ref!);

    if (!this.hero.alive) return this.lose('El héroe ha caído. Sin él, el alba no llegará.', log);
    const n = this.node(p.node);
    if (outcome === 'won') {
      const kills = combat.state.fighters.filter((f) => f.side === 'foe' && !f.alive).length;
      const gold = kills * CBAL.goldPerFoe;
      e.bag.gold += gold;
      log.push({ text: `Victoria. Botín de las criaturas: ${gold} de oro.`, tone: 'good' });
      if (p.kind === 'node' || n.foes.length) {
        n.foes = [];
        n.everCleared = true;
      }
      if (!p.night) e.hours = Math.max(0, e.hours - CBAL.combatHours);
      if (NODE[p.node].boss) return this.win(log);
    } else if (outcome === 'fled') {
      const downed = party.find((f) => f.downed);
      log.push(
        downed
          ? { text: `${downed.name} cae abatido. El grupo se retira cargando con él.`, tone: 'bad' }
          : { text: 'El grupo se retira.', tone: 'bad' },
      );
      if (!p.night && e.prev && p.kind === 'node') {
        e.node = e.prev;
        e.prev = null;
      }
      if (!p.night) e.hours = Math.max(0, e.hours - CBAL.fleeHours);
    }
    if (p.night) {
      log.push(...this.dawn(p.rest ?? { rough: true, torch: false }));
      this.state.report = { title: `Amanecer del día ${this.state.day}`, lines: [...(this.state.report?.lines ?? []), ...log] };
    }
    if (e.node === 'castle') return this.returnHome(log);
    this.sync();
    return { ok: true, log };
  }

  private bury(s: Soldier, fate: string) {
    s.alive = false;
    s.hp = 0;
    s.fate = fate;
    this.state.stats.deaths++;
    if (this.state.exp) this.state.exp.party = this.state.exp.party.filter((x) => x !== s.id);
    for (const n of Object.values(this.state.nodes)) n.garrison = n.garrison.filter((x) => x !== s.id);
  }

  // ───────────────────────── noche ─────────────────────────

  /** Acampa: víveres, ataques a guarniciones, nodos perdidos y, quizá, emboscada. */
  camp(): ActionResult {
    const err = this.onRoad();
    if (err) return fail(err);
    const e = this.state.exp!;
    const here = this.node(e.node);
    const rough = !here.structure;
    const log: LogLine[] = [];
    this.state.stats.nights++;

    // Víveres: al raso se come más.
    const need = rough ? Math.ceil(e.party.length * 1.5) : e.party.length;
    if (e.food >= need) {
      e.food -= need;
      log.push({ text: `El grupo consume ${need} raciones${rough ? ' (al raso se come más)' : ''}.`, tone: 'info' });
    } else {
      e.food = 0;
      for (const s of this.party) {
        s.stress = clamp(s.stress + CBAL.hunger.stress, 0, 200);
        s.hp = Math.max(1, s.hp - CBAL.hunger.hp);
      }
      log.push({ text: `No hay víveres para todos: hambre, +${CBAL.hunger.stress} de estrés y heridas.`, tone: 'bad' });
    }

    log.push(...this.remoteNight(e.node));
    if (!this.hero.alive) return this.lose('El héroe ha caído.', log);

    // ¿Emboscada donde duerme el grupo?
    const torch = rough && e.torches > 0;
    if (torch) e.torches--;
    const chance = here.structure === 'tower' ? CBAL.ambush.tower : here.structure === 'camp' ? CBAL.ambush.camp : torch ? CBAL.ambush.roughTorch : CBAL.ambush.rough;
    const rest = { rough, torch };
    if (this.rng.chance(chance)) {
      const tier = Math.min(NIGHT_FOES.length - 1, Math.floor((this.state.day - 1) / 3));
      log.push({ text: 'En plena noche, algo se arrastra hacia el fuego…', tone: 'bad' });
      this.state.report = { title: `Noche del día ${this.state.day}`, lines: log };
      const combat = this.startCombat('ambush', e.node, NIGHT_FOES[tier], true);
      combat.rest = rest;
      return { ok: true, log, combat };
    }
    log.push(...this.dawn(rest));
    this.state.report = { title: `Amanecer del día ${this.state.day}`, lines: log };
    this.sync();
    return { ok: true, log };
  }

  /** La noche en el resto del sendero: guarniciones atacadas y nodos que se pierden. */
  private remoteNight(except: string | null): LogLine[] {
    const log: LogLine[] = [];
    for (const def of MAP) {
      if (def.id === 'castle' || def.id === except) continue;
      const n = this.node(def.id);
      if (n.foes.length || !n.everCleared) continue;
      if (n.garrison.length) log.push(...this.nightAttack(def.id));
      else if (!def.links.includes('castle') && this.rng.chance(CBAL.retake)) {
        n.foes = [...def.regen];
        const burnt = n.structure;
        n.structure = null;
        log.push({ text: `Las criaturas retoman ${def.name}${burnt ? ` y arrasan ${burnt === 'camp' ? 'el campamento' : 'la torre'}` : ''}.`, tone: 'bad' });
      }
    }
    return log;
  }

  /** Ataque nocturno a una guarnición, resuelto sin escena. */
  private nightAttack(id: string): LogLine[] {
    const n = this.node(id);
    const def = NODE[id];
    if (!this.rng.chance(CBAL.garrisonAttack)) return [];
    const guards = n.garrison.map((g) => this.soldier(g)!);
    const structure = n.structure ? STRUCTURES[n.structure].defense + (n.structure === 'tower' && this.state.buildings.lodge >= 3 ? 0.5 : 0) : 0;
    const defense = structure + guards.reduce((a, s) => a + (1 + this.level(s) * 0.25) * (0.5 + (0.5 * s.hp) / this.maxHp(s)) * (s.affliction ? 0.7 : 1), 0);
    const attack = this.rng.range(0.8, 2.6) + this.state.day * 0.08;
    if (defense >= attack) {
      const soft = n.structure === 'tower' ? 0.5 : 1;
      for (const s of guards) {
        s.hp = Math.max(1, s.hp - Math.round(this.rng.range(0, 0.25) * this.maxHp(s) * soft));
        s.stress = clamp(s.stress + Math.round(this.rng.range(5, 15) * soft), 0, 200);
      }
      return [{ text: `${def.name} resistió un ataque nocturno.`, tone: 'good' }];
    }
    const lines: LogLine[] = [{ text: `${def.name} cayó durante la noche.`, tone: 'bad' }];
    for (const s of guards) {
      if (s.kind !== 'hero' && this.rng.chance(0.5)) {
        this.bury(s, `Murió defendiendo ${def.name}`);
        lines.push({ text: `${s.name} murió en su puesto.`, tone: 'bad' });
      } else {
        s.where = 'castle';
        s.post = undefined;
        s.hp = 1;
        s.stress = clamp(s.stress + 25, 0, 200);
        lines.push({ text: `${s.name} huyó malherido hacia el castillo.`, tone: 'bad' });
      }
    }
    n.garrison = [];
    n.foes = [...def.regen];
    n.structure = null;
    return lines;
  }

  /** Descanso y nuevo día. */
  private dawn(rest: { rough: boolean; torch: boolean }): LogLine[] {
    const e = this.state.exp!;
    const lines: LogLine[] = [];
    if (rest.rough) {
      const stress = rest.torch ? CBAL.rest.rough.torchStress : CBAL.rest.rough.stress;
      for (const s of this.party) s.stress = clamp(s.stress + stress, 0, 200);
      lines.push({ text: `Una noche al raso${rest.torch ? ' (la antorcha ayuda)' : ''}: +${stress} de estrés y menos luz mañana.`, tone: 'bad' });
    } else {
      for (const s of this.party) {
        s.hp = Math.min(this.maxHp(s), s.hp + Math.round(this.maxHp(s) * CBAL.rest.camp.heal));
        s.stress = clamp(s.stress + CBAL.rest.camp.stress, 0, 200);
      }
      lines.push({ text: 'El campamento da cobijo: el grupo se cura algo y descansa.', tone: 'good' });
    }
    for (const s of this.party) if (s.affliction && s.stress < 40) s.affliction = null;
    this.state.day++;
    e.days++;
    e.hours = e.maxHours - (rest.rough ? CBAL.roughNightHours : 0);
    return lines;
  }

  // ───────────────────────── regreso y final ─────────────────────────

  private returnHome(log: LogLine[]): ActionResult {
    const e = this.state.exp!;
    const st = this.state.stock;
    for (const k of RES) st[k] += e.bag[k];
    st.food += e.food;
    st.torches += e.torches;
    const back = this.party;
    for (const s of back) {
      s.where = 'castle';
      s.hp = this.maxHp(s);
      s.stress = Math.max(0, s.stress + CBAL.rest.castle.stress);
      if (s.affliction && s.stress < 40) s.affliction = null;
    }
    log.push({ text: `De vuelta en el castillo tras ${e.days} ${e.days === 1 ? 'día' : 'días'}. Botín: ${formatRes(e.bag) || 'nada'}.`, tone: 'good' });
    log.push({ text: 'Los soldados se curan del todo y descansan algo.', tone: 'good' });
    const posted = this.state.soldiers.filter((s) => s.alive && s.where === 'garrison');
    if (posted.length) log.push({ text: `Siguen de guardia: ${posted.map((s) => `${s.name} (${NODE[s.post!].name})`).join(', ')}.`, tone: 'info' });
    this.state.exp = null;
    this.state.phase = 'castle';
    log.push(...this.remoteNight(null));
    this.state.day++;
    this.rollRecruits();
    this.state.report = { title: 'Regreso al castillo', lines: [...log] };
    this.sync();
    return { ok: true, log };
  }

  private win(log: LogLine[]): ActionResult {
    this.state.phase = 'won';
    this.state.endReason = 'El Heraldo de la Noche ha caído. El camino hacia el Rey está abierto.';
    log.push({ text: this.state.endReason, tone: 'good' });
    this.sync();
    return { ok: true, log };
  }

  private lose(reason: string, log: LogLine[]): ActionResult {
    this.state.phase = 'lost';
    this.state.pending = null;
    this.state.endReason = reason;
    log.push({ text: reason, tone: 'bad' });
    this.sync();
    return { ok: true, log };
  }
}
