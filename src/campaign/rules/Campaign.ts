import { Rng } from '../../core/rng';
import type { Combat } from '../../combat/rules/Combat';
import { Encounter, Recruit, UNITS } from '../../combat/rules/data';
import { BUILDINGS, CBAL, FUN_NAMES, KIND_NAMES, MAP, NAMES, NIGHT_FOES, NODE, RECRUIT_COST, START, STRUCTURES } from './data';
import { EVENT, EVENTS, EventApi, EventDef } from './events';
import type {
  ActionResult,
  BuildingId,
  CampaignState,
  LogLine,
  Names,
  NameStyle,
  NodeState,
  NodeStatus,
  PendingCombat,
  PendingEvent,
  RecruitOffer,
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
      nodes[n.id] = {
        seen: n.id === 'castle' || n.id === 'prado',
        foes: [...n.foes],
        everCleared: n.id === 'castle' || (n.type === 'village' && !n.foes.length),
        looted: false,
        structure: null,
        garrison: [],
        dark: !!n.source,
        uses: n.prayers ?? 0,
      };
    }
    this.state = {
      version: 2,
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
      event: null,
      eventsSeen: [],
      darkClock: CBAL.darkEvery,
      siege: null,
      report: null,
      stats: { expeditions: 0, battles: 0, deaths: 0, nights: 0 },
      nextId: 1,
    };
    for (const s of START.soldiers) this.addSoldier(s.kind, s.name);
    this.rollRecruits();
    this.sync();
  }

  /** La campaña ha terminado (getter: TypeScript no estrecha el tipo a través de él). */
  get over() {
    return this.state.phase === 'lost' || this.state.phase === 'won';
  }

  /** Guarda la posición del generador aleatorio en el estado (para el guardado). */
  private sync() {
    this.state.rng = this.rng.state;
    // Hazaña "Muralla viva": cuántos nodos llegan a estar en retaguardia a la vez.
    const exposed = this.exposed();
    const shielded = MAP.filter((d) => this.status(d.id) === 'cleared' && this.shielded(d.id, exposed)).length;
    if (shielded > (this.state.stats.maxShielded ?? 0)) this.state.stats.maxShielded = shielded;
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
    return n.structure && this.guards(id) ? 'secured' : 'cleared';
  }

  /** Suma a un contador de las estadísticas (los que usan las hazañas). */
  private count(key: 'mimics' | 'sentinels' | 'siegesLifted' | 'virtues' | 'heroDowned', n = 1) {
    if (n) this.state.stats[key] = (this.state.stats[key] ?? 0) + n;
  }

  /** Guardias de un nodo: soldados y centinelas. */
  guards(id: string) {
    const n = this.node(id);
    return n.garrison.length + (n.sentinels ?? 0);
  }

  /**
   * Nodos a los que pueden llegar las criaturas: se parte de cada nodo con
   * criaturas u oscuridad y se avanza por los caminos sin cruzar los nodos con
   * guardia. Lo que queda fuera es retaguardia: ni se retoma ni hay emboscadas.
   */
  exposed(): Set<string> {
    const reached = new Set<string>();
    const queue = MAP.filter((d) => this.node(d.id).foes.length > 0 || this.node(d.id).dark).map((d) => d.id);
    while (queue.length) {
      const id = queue.pop()!;
      if (reached.has(id) || id === 'castle' || this.guards(id)) continue;
      reached.add(id);
      queue.push(...NODE[id].links);
    }
    return reached;
  }

  /** Retaguardia: nodos limpios que ningún camino de las criaturas alcanza sin pasar por una guardia. */
  shielded(id: string, exposed = this.exposed()) {
    return id !== 'castle' && !exposed.has(id) && !this.guards(id) && !this.node(id).foes.length;
  }

  /** Guarnición en primera línea: linda con algún nodo expuesto. */
  frontline(id: string, exposed = this.exposed()) {
    return this.guards(id) > 0 && NODE[id].links.some((l) => exposed.has(l));
  }

  /** Duerme a cubierto: campamento, torre o una aldea libre. */
  sheltered(id: string) {
    const n = this.node(id);
    return !!n.structure || (NODE[id].type === 'village' && !n.foes.length);
  }

  /** Precio de los víveres en la aldea del nodo (puede subir por los sucesos). */
  villagePrice(id: string) {
    const v = NODE[id].village;
    return v ? v.foodPrice + (this.state.villagePrices?.[id] ?? 0) : 0;
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

  private addSoldier(kind: SoldierKind, name: string, names: Names = {}): Soldier {
    const s: Soldier = { id: `s${this.state.nextId++}`, kind, name, hp: UNITS[kind].maxHp, stress: 0, affliction: null, xp: 0, alive: true, where: 'castle', ...names };
    this.applyName(s);
    this.state.soldiers.push(s);
    return s;
  }

  /** Cambia el estilo de nombres y renombra a soldados y reclutas (salvo el héroe y los personajes con nombre propio). */
  setNameStyle(style: NameStyle) {
    this.state.names = style;
    for (const x of [...this.state.soldiers, ...this.state.recruits]) this.applyName(x);
  }

  private applyName(x: Soldier | RecruitOffer) {
    if (x.kind === 'hero' || x.unique) return;
    x.classic ??= x.name;
    x.fun ??= this.funName(x);
    x.name = this.state.names === 'fun' ? x.fun : x.classic;
  }

  /** Nombre con gracia libre para un soldado; siempre el mismo para el mismo nombre clásico. */
  private funName(x: Soldier | RecruitOffer) {
    const pool = x.kind === 'spearman' ? FUN_NAMES.male : FUN_NAMES.female;
    const used = new Set([...this.state.soldiers, ...this.state.recruits].map((y) => y.fun));
    const free = pool.filter((n) => !used.has(n));
    const hash = [...(x.classic ?? x.name)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
    return free.length ? free[hash % free.length] : `${pool[hash % pool.length]} II`;
  }

  private rollRecruits() {
    const n = 2 + this.state.buildings.tavern;
    const used = new Set(this.state.soldiers.map((s) => s.classic ?? s.name));
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
    this.state.recruits = [];
    for (const o of offers) {
      this.applyName(o);
      this.state.recruits.push(o);
    }
    // Si el héroe se ha quedado solo, alguien de la aldea se ofrece sin pedir nada.
    if (!this.state.soldiers.some((s) => s.alive && s.kind !== 'hero')) offers[0].cost = 0;
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
    log.push(...this.advanceDay());
    if (this.over) return { ok: true, log };
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
    const s = this.addSoldier(o.kind, o.classic ?? o.name, { classic: o.classic, fun: o.fun });
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
    if (this.state.event) return 'Primero hay que decidir qué hacer.';
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
    const enter = NODE[to].enterStress;
    if (enter) {
      for (const s of this.party) s.stress = clamp(s.stress + enter, 0, 200);
      log.push({ text: `${NODE[to].name} pesa en el ánimo: +${enter} de estrés.`, tone: 'bad' });
    }
    if (n.foes.length) {
      log.push({ text: n.dark ? 'La oscuridad cubre el lugar. Aquí siempre es de noche.' : firstTime ? 'Hay criaturas esperando.' : 'Las criaturas guardan el paso.', tone: 'bad' });
      return { ok: true, log, combat: this.startCombat('node', to, n.foes, false) };
    }
    if (this.status(to) === 'cleared' && NODE[to].type !== 'village' && !this.shielded(to) && this.rng.chance(n.dark ? CBAL.roadAmbush * 2 : CBAL.roadAmbush)) {
      log.push({ text: 'Sin nadie de guardia, algo os acechaba entre la maleza.', tone: 'bad' });
      return { ok: true, log, combat: this.startCombat('road', to, NIGHT_FOES[0], false) };
    }
    const event = this.rollEvent(to);
    this.sync();
    return event ? { ok: true, log, event } : { ok: true, log };
  }

  // ───────────────────────── sucesos ─────────────────────────

  /** Al llegar a un nodo tranquilo: el suceso propio del lugar o, a veces, uno del camino. */
  private rollEvent(id: string, road = true): PendingEvent | undefined {
    const def = NODE[id];
    const n = this.node(id);
    let ev: EventDef | undefined;
    if (!n.visited && def.type === 'village' && !n.foes.length) ev = EVENT[n.everCleared && def.foes.length ? 'liberada' : 'aldea'];
    else if (!n.visited && def.type === 'shrine' && !n.foes.length) ev = EVENT.ermitano;
    if (ev) n.visited = true;
    else if (road && this.rng.chance(CBAL.eventChance)) {
      const api = this.eventApi(id);
      const pool = EVENTS.filter((e) => e.where === 'road' && !(e.once && this.state.eventsSeen.includes(e.id)) && (!e.when || e.when(api)));
      if (pool.length) ev = this.rng.pick(pool);
    }
    if (!ev) return undefined;
    if (ev.once || ev.where !== 'road') this.state.eventsSeen.push(ev.id);
    this.state.event = { id: ev.id, node: id };
    return this.state.event;
  }

  /** Motivo por el que una opción del suceso no se puede elegir, o null. */
  eventBlock(i: number): string | null {
    const ev = this.state.event;
    const c = ev && EVENT[ev.id].choices[i];
    if (!ev || !c) return 'No hay suceso.';
    return c.can?.(this.eventApi(ev.node)) ?? null;
  }

  /** Elige una opción del suceso pendiente. */
  choose(i: number): ActionResult {
    const ev = this.state.event;
    if (!ev) return fail('No hay suceso.');
    const choice = EVENT[ev.id].choices[i];
    if (!choice) return fail('Opción no válida.');
    const block = this.eventBlock(i);
    if (block) return fail(block);
    this.state.event = null;
    const log = choice.run(this.eventApi(ev.node));
    this.sync();
    return this.state.pending ? { ok: true, log, combat: this.state.pending } : { ok: true, log };
  }

  private eventApi(id: string): EventApi {
    const e = () => this.state.exp!;
    return {
      chance: (p) => this.rng.chance(p),
      int: (lo, hi) => this.rng.int(lo, hi),
      stress: (n) => {
        for (const s of this.party) s.stress = clamp(s.stress + n, 0, 200);
      },
      heal: (frac) => {
        for (const s of this.party) s.hp = Math.min(this.maxHp(s), s.hp + Math.round(this.maxHp(s) * frac));
      },
      hurt: (n) => {
        for (const s of this.party) s.hp = Math.max(1, s.hp - n);
      },
      food: (n) => (e().food = clamp(e().food + n, 0, CBAL.foodCap)),
      torches: (n) => (e().torches = clamp(e().torches + n, 0, CBAL.torchCap)),
      bag: (r) => {
        for (const k of RES) e().bag[k] = Math.max(0, e().bag[k] + (r[k] ?? 0));
      },
      gold: () => e().bag.gold,
      foodLeft: () => e().food,
      hoursLeft: () => e().hours,
      hours: (n) => (e().hours = Math.max(0, e().hours - n)),
      recruit: (kind, name) => {
        const s = this.addSoldier(kind, name, { unique: true });
        if (e().party.length < CBAL.partyMax) {
          s.where = 'party';
          e().party.push(s.id);
          return 'con el grupo';
        }
        return 'al castillo a esperar';
      },
      fight: (foes) => void this.startCombat('road', id, foes, false),
      reveal: () => {
        const hidden = NODE[id].links.filter((l) => !this.node(l).seen);
        for (const l of hidden) this.node(l).seen = true;
        return hidden.map((l) => NODE[l].name);
      },
      dark: () => this.node(id).dark,
      extraPrayer: () => void this.node(id).uses++,
      villagePrice: (d) => {
        this.state.villagePrices = { ...(this.state.villagePrices ?? {}), [id]: (this.state.villagePrices?.[id] ?? 0) + d };
      },
      freeHire: () => {
        this.state.freeHire = [...(this.state.freeHire ?? []), id];
      },
    };
  }

  // ───────────────────────── aldeas y ermitas ─────────────────────────

  /** Compra víveres en la aldea con el oro de la caravana. */
  trade(n: number): ActionResult {
    const err = this.onRoad();
    if (err) return fail(err);
    const e = this.state.exp!;
    const def = NODE[e.node];
    if (!def.village || this.node(e.node).foes.length) return fail('Aquí no hay a quién comprar.');
    const price = this.villagePrice(e.node);
    n = Math.min(n, CBAL.foodCap - e.food);
    if (n <= 0) return fail(`Como mucho ${CBAL.foodCap} víveres.`);
    if (e.bag.gold < price * n) return fail(`Hacen falta ${price * n} de oro en la caravana.`);
    e.bag.gold -= price * n;
    e.food += n;
    this.sync();
    return { ok: true, log: [{ text: `Compráis ${n} víveres por ${price * n} de oro.`, tone: 'good' }] };
  }

  /** Coste del recluta de la aldea (0 si se ofreció gratis). */
  hireCost(id: string) {
    return this.state.freeHire?.includes(id) ? 0 : CBAL.villageHire;
  }

  /** Contrata al recluta de la aldea; se une al grupo. */
  hire(): ActionResult {
    const err = this.onRoad();
    if (err) return fail(err);
    const e = this.state.exp!;
    const def = NODE[e.node];
    const n = this.node(e.node);
    if (!def.village || n.foes.length) return fail('Aquí no hay nadie que contratar.');
    if (n.uses) return fail(`${def.village.name} ya está con vosotros.`);
    if (e.party.length >= CBAL.partyMax) return fail('El grupo está completo.');
    const cost = this.hireCost(e.node);
    if (e.bag.gold < cost) return fail(`Hacen falta ${cost} de oro en la caravana.`);
    e.bag.gold -= cost;
    n.uses = 1;
    const s = this.addSoldier(def.village.recruit, def.village.name, { unique: true });
    s.where = 'party';
    e.party.push(s.id);
    this.sync();
    return { ok: true, log: [{ text: `${s.name} (${KIND_NAMES[s.kind]}) se une al grupo.`, tone: 'good' }] };
  }

  /** Reza en la ermita: cura, baja el estrés y quita las aflicciones. */
  pray(): ActionResult {
    const err = this.onRoad();
    if (err) return fail(err);
    const e = this.state.exp!;
    const n = this.node(e.node);
    if (NODE[e.node].type !== 'shrine' || n.foes.length) return fail('Aquí no hay dónde rezar.');
    if (n.uses <= 0) return fail('La llama de la ermita se ha apagado.');
    const noLight = this.spend(CBAL.pray.hours);
    if (noLight) return fail(noLight);
    n.uses--;
    for (const s of this.party) {
      s.hp = Math.min(this.maxHp(s), s.hp + Math.round(this.maxHp(s) * CBAL.pray.heal));
      s.stress = clamp(s.stress + CBAL.pray.stress, 0, 200);
      s.affliction = null;
    }
    this.sync();
    return { ok: true, log: [{ text: n.uses ? 'La llama del alba os reconforta.' : 'La llama os reconforta y se apaga.', tone: 'good' }] };
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
    // Lo que defiende cada nodo se ve en el mapa; el aviso no lo cuenta.
    return { ok: true, log: [{ text: 'Se han explorado los territorios cercanos.', tone: 'info' }] };
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
    // Donde ya hubo combate, el cofre puede ser un mímico: el grupo toma aliento y pelea por el botín.
    if (n.everCleared && this.rng.chance(CBAL.mimic.chance)) {
      for (const s of this.party) s.hp = Math.min(this.maxHp(s), s.hp + Math.round(this.maxHp(s) * CBAL.mimic.heal));
      const combat = this.startCombat('mimic', e.node, ['mimic'], false);
      return { ok: true, log: [{ text: `Recobráis el aliento (+${Math.round(CBAL.mimic.heal * 100)} % de vida).`, tone: 'good' }], combat };
    }
    const log = this.takeLoot(e.node, 1);
    this.sync();
    return { ok: true, log };
  }

  /** Reparte el botín de un nodo (`mult` lo aumenta, p. ej. tras vencer a un mímico). */
  private takeLoot(node: string, mult: number): LogLine[] {
    const e = this.state.exp!;
    const def = NODE[node];
    this.node(node).looted = true;
    const got: Partial<Resources> = {};
    for (const k of RES) {
      const v = def.loot[k];
      if (!v) continue;
      got[k] = Math.round(v * mult * (0.8 + this.rng.next() * 0.4));
      e.bag[k] += got[k]!;
    }
    const log: LogLine[] = [{ text: `Botín: ${formatRes(got)}.`, tone: 'good' }];
    // Las ruinas tienen trampas: el miedo cuesta algo de temple.
    if (def.type === 'ruins' && this.rng.chance(0.4)) {
      for (const s of this.party) s.stress = clamp(s.stress + 8, 0, 200);
      log.push({ text: 'Un derrumbe: +8 de estrés.', tone: 'bad' });
    }
    return log;
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
    if (this.guards(e.node) >= STRUCTURES[n.structure].garrison) return fail('No cabe nadie más de guardia.');
    if (e.party.length <= 1) return fail('El grupo no puede quedarse vacío.');
    e.party = e.party.filter((x) => x !== id);
    n.garrison.push(id);
    s.where = 'garrison';
    s.post = e.node;
    this.sync();
    return { ok: true, log: [{ text: `${s.name} queda de guardia en ${NODE[e.node].name}.`, tone: 'info' }] };
  }

  /** Paga a un centinela para que haga guardia: asegura el nodo sin restar al grupo. */
  post(): ActionResult {
    const err = this.onRoad();
    if (err) return fail(err);
    const e = this.state.exp!;
    const n = this.node(e.node);
    if (!n.structure) return fail('Hace falta un campamento o una torre.');
    if (n.foes.length) return fail('Antes hay que limpiar el nodo.');
    if (this.guards(e.node) >= STRUCTURES[n.structure].garrison) return fail('No cabe nadie más de guardia.');
    if (e.bag.gold < CBAL.sentinel.cost) return fail(`Hacen falta ${CBAL.sentinel.cost} de oro.`);
    e.bag.gold -= CBAL.sentinel.cost;
    n.sentinels = (n.sentinels ?? 0) + 1;
    this.count('sentinels');
    this.sync();
    return { ok: true, log: [{ text: `Un centinela queda de guardia en ${NODE[e.node].name}.`, tone: 'info' }] };
  }

  /** Relevo: un soldado del grupo ocupa el puesto de uno de guardia, que vuelve al grupo. Sin gastar horas. */
  relieve(guardId: string, partyId: string): ActionResult {
    const err = this.onRoad();
    if (err) return fail(err);
    const e = this.state.exp!;
    const n = this.node(e.node);
    const g = this.soldier(guardId);
    const s = this.soldier(partyId);
    if (!g || !n.garrison.includes(guardId)) return fail('No está de guardia aquí.');
    if (!s || s.where !== 'party') return fail('No está en el grupo.');
    if (s.kind === 'hero') return fail('El héroe no se queda atrás.');
    n.garrison = n.garrison.map((x) => (x === guardId ? partyId : x));
    e.party = e.party.map((x) => (x === partyId ? guardId : x));
    g.where = 'party';
    g.post = undefined;
    s.where = 'garrison';
    s.post = e.node;
    this.sync();
    return { ok: true, log: [{ text: `${s.name} releva a ${g.name}.`, tone: 'info' }] };
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
    this.state.pending = { kind, node, seed: this.rng.int(1, 1e9), night: night || n.dark, foes: [...foes], fort: kind === 'node' ? 0 : fort };
    this.sync();
    return this.state.pending;
  }

  /** Encuentro para el motor de combate, con los soldados tal como están. */
  encounter(p = this.state.pending!): Encounter {
    const party: Recruit[] = this.party.map((s) => ({ ref: s.id, kind: s.kind, name: s.name, hp: s.hp, stress: s.stress, affliction: s.affliction, bonus: this.bonus(s) }));
    const def = NODE[p.node];
    return {
      id: `${p.kind}-${p.node}`,
      name: p.kind === 'ambush' ? `Emboscada en ${def.name}` : p.kind === 'road' ? `Asalto en ${def.name}` : p.kind === 'mimic' ? `Mímico en ${def.name}` : def.name,
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
    this.count('virtues', combat.state.virtues ?? 0);
    if (outcome === 'won' && p.kind === 'mimic') this.count('mimics');
    if (combat.state.fighters.some((f) => f.kind === 'hero' && f.downed)) this.count('heroDowned');
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
          log.push({ text: `${s.name} sube a nivel ${this.level(s)}.`, tone: 'good' });
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
      log.push({ text: `Victoria: +${gold} de oro.`, tone: 'good' });
      const def = NODE[p.node];
      if (p.kind === 'node' || n.foes.length) {
        n.foes = [];
        n.everCleared = true;
      }
      if (n.dark) {
        n.dark = false;
        log.push({ text: `La luz vuelve a ${def.name}.`, tone: 'good' });
      }
      if (def.source && !def.boss && !n.destroyed) {
        n.destroyed = true;
        this.state.darkClock += CBAL.darkEvery;
        for (const l of def.links) this.node(l).dark = false;
        log.push({ text: `El ${def.name.toLowerCase()} se derrumba. La oscuridad retrocede y tardará más en volver.`, tone: 'good' });
      }
      if (p.kind !== 'ambush') e.hours = Math.max(0, e.hours - CBAL.combatHours);
      if (p.kind === 'mimic') {
        log.push({ text: 'El mímico escupe todo lo que se había tragado.', tone: 'good' });
        log.push(...this.takeLoot(p.node, CBAL.mimic.lootBonus));
      }
      if (def.boss) return this.win(log);
      // Tras un combate solo salen los sucesos propios del lugar (aldea liberada, ermita).
      if (p.kind === 'node') this.rollEvent(p.node, false);
    } else if (outcome === 'fled') {
      const downed = party.find((f) => f.downed);
      log.push(
        downed
          ? { text: `${downed.name} cae abatido. El grupo se retira cargando con él.`, tone: 'bad' }
          : { text: 'El grupo se retira.', tone: 'bad' },
      );
      if (p.kind === 'mimic') {
        n.looted = true;
        log.push({ text: 'El mímico se escabulle con el botín dentro.', tone: 'bad' });
      }
      if (e.prev && p.kind === 'node') {
        e.node = e.prev;
        e.prev = null;
      }
      if (p.kind !== 'ambush') e.hours = Math.max(0, e.hours - CBAL.fleeHours);
    }
    if (p.kind === 'ambush') {
      log.push(...this.dawn(p.rest ?? { rough: true, torch: false }));
      this.state.report = { title: `Amanecer del día ${this.state.day}`, lines: [...(this.state.report?.lines ?? []), ...log] };
      if (this.over) return { ok: true, log };
    }
    if (e.node === 'castle') return this.returnHome(log);
    this.sync();
    return this.state.event ? { ok: true, log, event: this.state.event } : { ok: true, log };
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
    const rough = !this.sheltered(e.node);
    const log: LogLine[] = [];
    this.state.stats.nights++;
    if (here.dark) {
      for (const s of this.party) s.stress = clamp(s.stress + CBAL.darkNightStress, 0, 200);
      log.push({ text: `Una noche en la oscuridad: +${CBAL.darkNightStress} de estrés.`, tone: 'bad' });
    }

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
      log.push({ text: `Hambre: +${CBAL.hunger.stress} de estrés y heridas.`, tone: 'bad' });
    }

    log.push(...this.remoteNight(e.node));
    if (!this.hero.alive) return this.lose('El héroe ha caído.', log);

    // ¿Emboscada donde duerme el grupo?
    const torch = rough && e.torches > 0;
    if (torch) e.torches--;
    const base = here.structure === 'tower' ? CBAL.ambush.tower : !rough ? CBAL.ambush.camp : torch ? CBAL.ambush.roughTorch : CBAL.ambush.rough;
    const chance = here.dark ? Math.min(0.9, base * 1.6) : base;
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
    this.state.report = { title: this.state.phase === 'lost' ? 'La última noche' : `Amanecer del día ${this.state.day}`, lines: log };
    this.sync();
    return { ok: true, log };
  }

  // ───────────────────────── oscuridad ─────────────────────────

  /** Pasa un día: avanza el reloj de la oscuridad y el asedio. */
  private advanceDay(): LogLine[] {
    const log: LogLine[] = [];
    this.state.day++;
    this.state.darkClock--;
    if (this.state.darkClock <= 0) {
      this.state.darkClock = CBAL.darkEvery;
      log.push(...this.spreadDarkness());
    }
    const threatened = NODE.castle.links.some((l) => this.node(l).dark);
    if (threatened) {
      if (this.state.siege === null) {
        this.state.siege = CBAL.siegeDays;
        log.push({ text: `¡La oscuridad llega a las puertas del castillo! Si no retrocede, caerá en ${CBAL.siegeDays} días.`, tone: 'bad' });
      } else {
        this.state.siege--;
        if (this.state.siege <= 0) {
          this.lose('La oscuridad ha engullido el castillo del Alba.', log);
          return log;
        }
        log.push({ text: `Asedio: el castillo resistirá ${this.state.siege} ${this.state.siege === 1 ? 'día' : 'días'} más.`, tone: 'bad' });
      }
      for (const s of this.state.soldiers) if (s.alive && s.where === 'castle') s.stress = clamp(s.stress + 8, 0, 200);
    } else if (this.state.siege !== null) {
      this.state.siege = null;
      this.count('siegesLifted');
      log.push({ text: 'La oscuridad se aleja de las murallas. El asedio termina.', tone: 'good' });
    }
    return log;
  }

  /** Nodos que la oscuridad cubrirá en su próximo avance. */
  darkFrontier(): string[] {
    const here = this.state.exp?.node;
    return MAP.filter((d) => {
      const n = this.node(d.id);
      if (d.id === 'castle' || n.dark || n.destroyed || d.id === here) return false;
      return d.links.some((l) => this.node(l).dark);
    }).map((d) => d.id);
  }

  /** La oscuridad avanza un paso desde cada nodo oscuro. Los nodos asegurados resisten. */
  private spreadDarkness(): LogLine[] {
    const log: LogLine[] = [];
    const covered: string[] = [];
    for (const id of this.darkFrontier()) {
      const n = this.node(id);
      if (this.guards(id) && n.structure) {
        const lines = this.nightAttack(id, CBAL.darkAttack, true);
        if (this.guards(id)) {
          log.push({ text: `La guarnición de ${NODE[id].name} contiene a la oscuridad.`, tone: 'good' });
          continue;
        }
        log.push(...lines);
      }
      n.dark = true;
      covered.push(NODE[id].name);
      if (!n.foes.length) n.foes = [...NODE[id].regen];
      else if (n.foes.length < 4) n.foes.push('shade');
      n.structure = null;
    }
    if (covered.length) log.push({ text: `La oscuridad avanza: cubre ${covered.join(', ')}.`, tone: 'bad' });
    return log;
  }

  /** La noche en el resto del sendero: guarniciones atacadas y nodos que se pierden. */
  private remoteNight(except: string | null): LogLine[] {
    const log: LogLine[] = [];
    // Se calcula una vez: lo que cae esta noche no abre camino hasta la siguiente.
    const exposed = this.exposed();
    const attacked = new Set<string>();
    for (const def of MAP) {
      if (def.id === 'castle' || def.id === except) continue;
      const n = this.node(def.id);
      if (n.foes.length || !n.everCleared) continue;
      // Solo se ataca a la primera línea; tras ella, la retaguardia está a salvo.
      if (this.guards(def.id)) {
        if (this.frontline(def.id, exposed)) {
          const lines = this.nightAttack(def.id, CBAL.front.extra, false, CBAL.front.attack);
          if (lines.length) attacked.add(def.id);
          log.push(...lines);
        }
      } else if (exposed.has(def.id) && (n.dark || !def.links.includes('castle')) && this.rng.chance(n.dark ? CBAL.retake * 2 : CBAL.retake)) {
        n.foes = [...def.regen];
        const burnt = n.structure;
        n.structure = null;
        log.push({ text: `Las criaturas retoman ${def.name}${burnt ? ` y arrasan ${burnt === 'camp' ? 'el campamento' : 'la torre'}` : ''}.`, tone: 'bad' });
      }
    }
    this.restGuards(attacked);
    return log;
  }

  /** Los soldados de guardia que pasan la noche tranquilos se curan algo y bajan el estrés. */
  private restGuards(attacked: Set<string>) {
    for (const def of MAP) {
      if (attacked.has(def.id)) continue;
      for (const id of this.node(def.id).garrison) {
        const s = this.soldier(id)!;
        s.hp = Math.min(this.maxHp(s), s.hp + Math.round(this.maxHp(s) * CBAL.guardRest.heal));
        s.stress = clamp(s.stress + CBAL.guardRest.stress, 0, 200);
      }
    }
  }

  /** Ataque nocturno a una guarnición, resuelto sin escena. */
  private nightAttack(id: string, extra = 0, force = false, chanceMult = 1): LogLine[] {
    const n = this.node(id);
    const def = NODE[id];
    if (!force && !this.rng.chance((n.dark ? CBAL.garrisonAttack * 1.5 : CBAL.garrisonAttack) * chanceMult)) return [];
    const guards = n.garrison.map((g) => this.soldier(g)!);
    const structure = n.structure ? STRUCTURES[n.structure].defense + (n.structure === 'tower' && this.state.buildings.lodge >= 3 ? 0.5 : 0) : 0;
    const defense = structure + (n.sentinels ?? 0) * CBAL.sentinel.defense + guards.reduce((a, s) => a + (1 + this.level(s) * 0.25) * (0.5 + (0.5 * s.hp) / this.maxHp(s)) * (s.affliction ? 0.7 : 1), 0);
    const attack = this.rng.range(0.8, 2.6) + this.state.day * 0.08 + extra;
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
    if (n.sentinels) lines.push({ text: n.sentinels === 1 ? 'El centinela cae en su puesto.' : 'Los centinelas caen en su puesto.', tone: 'bad' });
    n.garrison = [];
    n.sentinels = 0;
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
      lines.push({ text: `Noche al raso: +${stress} de estrés.`, tone: 'bad' });
    } else {
      for (const s of this.party) {
        s.hp = Math.min(this.maxHp(s), s.hp + Math.round(this.maxHp(s) * CBAL.rest.camp.heal));
        s.stress = clamp(s.stress + CBAL.rest.camp.stress, 0, 200);
      }
      lines.push({ text: 'El campamento da cobijo: el grupo se cura algo y descansa.', tone: 'good' });
    }
    for (const s of this.party) if (s.affliction && s.stress < 40) s.affliction = null;
    lines.push(...this.advanceDay());
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
    log.push(...this.advanceDay());
    if (this.over) return { ok: true, log };
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
