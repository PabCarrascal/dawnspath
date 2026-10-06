import { Hex, HexKey, distance, equals, key, neighbors, range } from '../core/hex';
import { Rng } from '../core/rng';
import {
  BALANCE,
  BuildingKind,
  Cost,
  DIFFICULTIES,
  DifficultyId,
  RESOURCES,
  RESOURCE_NAMES,
  RecruitKind,
  UnitKind,
} from './config';
import { HERO_START, KING_START, generateMap } from './mapgen';
import type {
  DawnReport,
  Economy,
  EndReason,
  GameEvent,
  GameState,
  Resources,
  Result,
  SaveData,
  Team,
  Threat,
  Tile,
  Unit,
} from './types';

const fail = (reason: string): Result => ({ ok: false, reason });
const ok = (events: GameEvent[]): Result => ({ ok: true, events });

export interface Reach {
  cost: number;
  prev: HexKey | null;
}

type DamageSource = 'attack' | 'counter' | 'tower' | 'hunger';

const B = BALANCE.buildings;
/** Orden en que los habitantes ocupan los edificios productivos. */
const STAFF_PRIORITY: BuildingKind[] = ['farm', 'sawmill', 'quarry', 'market'];
const TROOPS: UnitKind[] = ['militia', 'soldier', 'archer'];

export const costText = (cost: Cost) =>
  RESOURCES.filter((r) => cost[r])
    .map((r) => `${cost[r]} ${RESOURCE_NAMES[r]}`)
    .join(' · ');

/**
 * Reglas del juego. No sabe nada de Three.js: recibe órdenes, muta el
 * estado y devuelve la lista de eventos que la capa visual debe animar.
 */
export class Game {
  readonly state: GameState;
  private rng: Rng;

  constructor(seed: number, difficulty: DifficultyId = 'normal', save?: SaveData) {
    if (save) {
      this.rng = new Rng(save.rng);
      const { tiles, ...rest } = save.state;
      this.state = { ...rest, tiles: new Map(tiles.map((t) => [key(t), { ...t }])) };
      return;
    }
    const diff = DIFFICULTIES[difficulty];
    this.rng = new Rng(seed);
    const { tiles, lairs } = generateMap(this.rng);
    const lvl = BALANCE.castle.levels[0];
    this.state = {
      seed,
      difficulty,
      day: 1,
      phase: 'day',
      hours: BALANCE.hoursPerDay,
      res: { ...diff.start },
      population: BALANCE.population.start,
      castle: { q: HERO_START.q, r: HERO_START.r, level: 1, hp: lvl.hp, maxHp: lvl.hp, upgrade: 0 },
      forge: false,
      beaconNights: null,
      kingAwake: false,
      tiles,
      units: [],
      nextId: 1,
      stats: { territory: 0, shadesSlain: 0, structuresBuilt: 0, soldiersRecruited: 0, poisFound: 0, lairsDestroyed: 0 },
    };
    tiles.get(key(HERO_START))!.structure = 'castle';

    // El héroe aparece junto al castillo, mirando hacia el centro del mundo.
    const spot = neighbors(HERO_START)
      .filter((n) => {
        const t = this.tile(n);
        return t && this.moveCost(t) < Infinity;
      })
      .sort((a, b) => distance(a, { q: 0, r: 0 }) - distance(b, { q: 0, r: 0 }))[0];
    const hero = this.createUnit('hero', 'dawn', spot);
    hero.renown = 0;
    hero.level = 1;
    this.createUnit('king', 'night', KING_START);
    for (const h of lairs) this.createUnit('lair', 'night', h);
    this.recomputeTerritory();
    this.updateVision();
  }

  static fromSave(save: SaveData): Game {
    return new Game(save.state.seed, save.state.difficulty, save);
  }

  serialize(): SaveData {
    const { tiles, ...rest } = this.state;
    return {
      version: 2,
      rng: this.rng.state,
      state: structuredClone({ ...rest, tiles: [...tiles.values()] }),
    };
  }

  // ───────────────────────── consultas generales ─────────────────────────

  get difficulty() {
    return DIFFICULTIES[this.state.difficulty];
  }

  get castleDef() {
    return BALANCE.castle.levels[this.state.castle.level - 1];
  }

  tile(h: Hex): Tile | undefined {
    return this.state.tiles.get(key(h));
  }

  unit(id: number): Unit | undefined {
    return this.state.units.find((u) => u.id === id);
  }

  unitAt(h: Hex): Unit | undefined {
    return this.state.units.find((u) => equals(u, h));
  }

  get hero(): Unit | undefined {
    return this.state.units.find((u) => u.kind === 'hero');
  }

  get king(): Unit | undefined {
    return this.state.units.find((u) => u.kind === 'king');
  }

  team(team: Team): Unit[] {
    return this.state.units.filter((u) => u.team === team);
  }

  /** Casillas con un edificio terminado de ese tipo. */
  completed(kind: BuildingKind): Tile[] {
    return [...this.state.tiles.values()].filter((t) => t.structure === kind && !t.work);
  }

  hasBuilding(kind: BuildingKind, includeWork = false): boolean {
    return [...this.state.tiles.values()].some((t) => t.structure === kind && (includeWork || !t.work));
  }

  worksActive(): number {
    return [...this.state.tiles.values()].filter((t) => (t.work ?? 0) > 0).length;
  }

  canAfford(cost: Cost): boolean {
    return RESOURCES.every((r) => this.state.res[r] >= (cost[r] ?? 0));
  }

  isUnitVisible(u: Unit): boolean {
    if (u.team === 'dawn') return true;
    const t = this.tile(u);
    // El Rey y las guaridas son enormes: se recuerdan una vez descubiertos.
    return u.kind === 'king' || u.kind === 'lair' ? !!t?.explored : !!t?.visible;
  }

  /** Coste de entrar en una casilla para las unidades del alba (Infinity = no). */
  moveCost(t: Tile): number {
    if (t.structure === 'castle') return Infinity;
    if (t.terrain === 'river') return t.structure === 'bridge' && !t.work ? 1 : Infinity;
    return BALANCE.terrain[t.terrain].moveCost;
  }

  /** Las criaturas no atraviesan estructuras: las derriban. */
  private blocksNight(t: Tile): boolean {
    return !!t.structure && t.structure !== 'bridge';
  }

  structureMaxHp(t: Tile): number {
    if (t.structure === 'castle') return this.state.castle.maxHp;
    return t.structure ? B[t.structure].hp : 0;
  }

  structureHp(t: Tile): number {
    if (t.structure === 'castle') return this.state.castle.hp;
    return t.shp ?? 0;
  }

  economy(): Economy {
    const s = this.state;
    const production: Resources = { food: this.castleDef.food, materials: this.castleDef.materials, stone: 0, gold: 0 };
    let housing = this.castleDef.housing;
    const productive: Tile[] = [];
    for (const t of s.tiles.values()) {
      if (t.poi === 'village' && t.poiUsed) {
        production.gold += BALANCE.poi.village.gold;
        housing += BALANCE.poi.village.housing;
      }
      if (!t.structure || t.structure === 'castle' || t.work) continue;
      if (t.structure === 'house') housing += BALANCE.effects.house.housing;
      if (B[t.structure].workers > 0) productive.push(t);
    }
    productive.sort(
      (a, b) =>
        STAFF_PRIORITY.indexOf(a.structure as BuildingKind) - STAFF_PRIORITY.indexOf(b.structure as BuildingKind),
    );
    let free = s.population;
    let needed = 0;
    let assigned = 0;
    const understaffed: HexKey[] = [];
    for (const t of productive) {
      const def = B[t.structure as BuildingKind];
      needed += def.workers;
      if (free >= def.workers) {
        free -= def.workers;
        assigned += def.workers;
        for (const r of RESOURCES) production[r] += def.produces[r] ?? 0;
      } else understaffed.push(key(t));
    }
    production.gold += Math.floor(s.population / BALANCE.population.perGold);
    const troopUpkeep = this.team('dawn').reduce((sum, u) => sum + BALANCE.units[u.kind].upkeep, 0);
    const upkeep = troopUpkeep + Math.ceil(s.population / BALANCE.population.perFood);
    return { production, upkeep, housing, workersNeeded: needed, workersAssigned: assigned, understaffed };
  }

  /** Renombre necesario para el siguiente nivel del héroe (null si está al máximo). */
  nextLevelAt(level: number): number | null {
    return BALANCE.hero.levels[level] ?? null;
  }

  // ───────────────────────── movimiento y combate ─────────────────────────

  /** Casillas alcanzables por una unidad con las horas de luz restantes. */
  reachable(unitId: number, budget = this.state.hours): Map<HexKey, Reach> {
    const u = this.unit(unitId);
    const out = new Map<HexKey, Reach>();
    if (!u) return out;
    out.set(key(u), { cost: 0, prev: null });
    const open: Hex[] = [u];
    while (open.length) {
      open.sort((a, b) => out.get(key(a))!.cost - out.get(key(b))!.cost);
      const cur = open.shift()!;
      const base = out.get(key(cur))!.cost;
      for (const n of neighbors(cur)) {
        const t = this.tile(n);
        if (!t || this.unitAt(n)) continue;
        const c = base + this.moveCost(t);
        if (c > budget) continue;
        const prev = out.get(key(n));
        if (!prev || c < prev.cost) {
          out.set(key(n), { cost: c, prev: key(cur) });
          open.push(n);
        }
      }
    }
    out.delete(key(u));
    return out;
  }

  pathFrom(reach: Map<HexKey, Reach>, target: Hex): Hex[] {
    const path: Hex[] = [];
    let k: HexKey | null = key(target);
    while (k && reach.has(k)) {
      const t = this.state.tiles.get(k)!;
      path.unshift({ q: t.q, r: t.r });
      k = reach.get(k)!.prev;
    }
    return path;
  }

  attackRange(u: Unit): number {
    return BALANCE.units[u.kind].range;
  }

  attackTargets(unitId: number): Unit[] {
    const u = this.unit(unitId);
    if (!u || u.team !== 'dawn' || this.state.hours < 1) return [];
    const r = this.attackRange(u);
    return this.team('night').filter((e) => distance(e, u) <= r && this.isUnitVisible(e));
  }

  /** Daño que haría `attacker` a `target` contando el flanqueo. */
  attackDamage(attacker: Unit, target: Unit): number {
    const flankers = this.team(attacker.team).filter(
      (a) => a.id !== attacker.id && distance(a, target) === 1,
    ).length;
    return Math.round(attacker.atk * (1 + BALANCE.flankBonus * flankers));
  }

  /** ¿Recibiría contraataque? No a distancia ni de quien no ataca. */
  wouldCounter(attacker: Unit, target: Unit): boolean {
    return distance(attacker, target) === 1 && target.atk > 0;
  }

  /**
   * Zona de peligro: casillas que las criaturas visibles podrían atacar
   * esta noche (movimiento + adyacencia), y unidades propias en riesgo.
   */
  threat(): Threat {
    const tiles = new Set<HexKey>();
    for (const e of this.team('night')) {
      if (!this.isUnitVisible(e) || e.atk <= 0) continue;
      if (e.kind === 'king' && !this.state.kingAwake) continue;
      const budget = BALANCE.units[e.kind].moveRange;
      const reach = new Map<HexKey, number>([[key(e), 0]]);
      const open: Hex[] = [e];
      while (open.length) {
        const cur = open.shift()!;
        const base = reach.get(key(cur))!;
        for (const n of neighbors(cur)) {
          const t = this.tile(n);
          if (!t || this.blocksNight(t)) continue;
          if (this.unitAt(n)?.team === 'dawn') continue;
          const cost = this.nightMoveCost(t);
          if (cost === Infinity) continue;
          const c = base + Math.max(1, cost);
          if (c > budget || c >= (reach.get(key(n)) ?? Infinity)) continue;
          reach.set(key(n), c);
          open.push(n);
        }
      }
      for (const k of reach.keys()) {
        const t = this.state.tiles.get(k)!;
        for (const n of neighbors(t)) if (this.tile(n)) tiles.add(key(n));
      }
    }
    const endangered = new Set(this.team('dawn').filter((u) => tiles.has(key(u))).map((u) => u.id));
    return { tiles, endangered };
  }

  move(unitId: number, to: Hex): Result {
    if (this.state.phase !== 'day') return fail('Solo de día.');
    const u = this.unit(unitId);
    if (!u || u.team !== 'dawn') return fail('Unidad no válida.');
    const reach = this.reachable(unitId);
    const r = reach.get(key(to));
    if (!r) return fail('No llegas antes del anochecer.');
    const path = this.pathFrom(reach, to);
    const origin = { q: u.q, r: u.r };
    this.state.hours -= r.cost;
    u.q = to.q;
    u.r = to.r;

    const events: GameEvent[] = [{ type: 'move', unitId, path: [origin, ...path] }];
    for (const h of path) events.push(...this.visit(u, h));
    this.updateVision();
    events.push({ type: 'vision' });
    events.push(...this.checkKingWake());
    return ok(events);
  }

  attack(attackerId: number, targetId: number): Result {
    if (this.state.phase !== 'day') return fail('Solo de día.');
    const a = this.unit(attackerId);
    const t = this.unit(targetId);
    if (!a || !t || a.team !== 'dawn' || t.team !== 'night') return fail('Objetivo no válido.');
    if (this.state.hours < 1) return fail('No quedan horas de luz.');
    const dist = distance(a, t);
    if (dist > this.attackRange(a)) return fail('Demasiado lejos.');

    this.state.hours -= 1;
    const counter = this.wouldCounter(a, t);
    const events: GameEvent[] = [{ type: 'attack', attackerId, targetId, ranged: dist > 1 }];
    events.push(...this.damage(t, this.attackDamage(a, t), 'attack'));

    if (this.unit(targetId)) {
      if (t.kind === 'king' && !this.state.kingAwake) events.push(...this.wakeKing());
      if (counter) {
        events.push({ type: 'attack', attackerId: targetId, targetId: attackerId });
        events.push(...this.damage(a, t.atk, 'counter'));
      }
    }
    this.updateVision();
    events.push({ type: 'vision' });
    return ok(events);
  }

  // ───────────────────────── castillo y construcción ─────────────────────────

  /** Casillas válidas para levantar un edificio. */
  buildSpots(kind: BuildingKind): Hex[] {
    const def = B[kind];
    const terrains = def.terrain as readonly string[];
    return [...this.state.tiles.values()].filter((t) => {
      if (t.structure || t.poi || !terrains.includes(t.terrain)) return false;
      const occupant = this.unitAt(t);
      if (occupant && (occupant.team === 'night' || kind === 'wall')) return false;
      if (kind === 'bridge') return t.owned || neighbors(t).some((n) => this.tile(n)?.owned);
      if (!t.owned) return false;
      if (kind === 'quarry') return neighbors(t).some((n) => this.tile(n)?.terrain === 'mountain');
      // El aserradero va en el bosque o en su linde.
      if (kind === 'sawmill' && t.terrain === 'plain') return neighbors(t).some((n) => this.tile(n)?.terrain === 'forest');
      return true;
    });
  }

  /** Motivo por el que no se puede construir (null si se puede). */
  canBuild(kind: BuildingKind): string | null {
    const def = B[kind];
    if (this.state.phase !== 'day') return 'Solo de día.';
    if (this.state.castle.level < def.level) return `Requiere ${BALANCE.castle.levels[def.level - 1].name}.`;
    if (def.unique && this.hasBuilding(kind, true)) return 'Solo puedes tener uno.';
    if (this.worksActive() >= this.castleDef.slots) return 'Todas las cuadrillas están ocupadas.';
    if (!this.canAfford(def.cost)) return `Necesitas ${costText(def.cost)}.`;
    if (!this.buildSpots(kind).length)
      return kind === 'quarry' ? 'Necesitas territorio junto a una montaña.' : 'No hay sitio válido en tu territorio.';
    return null;
  }

  build(kind: BuildingKind, at: Hex): Result {
    const err = this.canBuild(kind);
    if (err) return fail(err);
    if (!this.buildSpots(kind).some((h) => equals(h, at))) return fail('No puedes construir ahí.');
    const def = B[kind];
    this.pay(def.cost);
    const t = this.tile(at)!;
    t.structure = kind;
    t.work = def.days;
    t.workTotal = def.days;
    t.shp = Math.max(1, Math.round(def.hp * 0.5));
    return ok([
      { type: 'build', at: { q: t.q, r: t.r }, structure: kind, days: def.days },
      { type: 'log', text: `Obras: ${def.name} (${def.days} ${def.days === 1 ? 'día' : 'días'}).`, tone: 'info' },
    ]);
  }

  canUpgradeCastle(): string | null {
    const c = this.state.castle;
    if (this.state.phase !== 'day') return 'Solo de día.';
    const next = BALANCE.castle.levels[c.level];
    if (!next) return 'El castillo está al máximo.';
    if (c.upgrade > 0) return 'La mejora ya está en marcha.';
    if (!this.canAfford(next.cost)) return `Necesitas ${costText(next.cost)}.`;
    return null;
  }

  upgradeCastle(): Result {
    const err = this.canUpgradeCastle();
    if (err) return fail(err);
    const next = BALANCE.castle.levels[this.state.castle.level];
    this.pay(next.cost);
    this.state.castle.upgrade = next.days;
    return ok([
      { type: 'castleWork', days: next.days },
      { type: 'log', text: `Comienzan las obras: ${next.name} (${next.days} días).`, tone: 'good' },
    ]);
  }

  /** Casillas libres junto al castillo o a un puesto de avanzada. */
  recruitSpots(): Hex[] {
    const anchors: Hex[] = [this.state.castle, ...this.completed('outpost')];
    const spots = new Map<HexKey, Hex>();
    for (const a of anchors) {
      for (const n of neighbors(a)) {
        const t = this.tile(n);
        if (t && this.moveCost(t) < Infinity && !this.unitAt(t) && t.structure !== 'wall')
          spots.set(key(t), { q: t.q, r: t.r });
      }
    }
    return [...spots.values()];
  }

  canRecruit(kind: RecruitKind): string | null {
    const def = BALANCE.recruit[kind];
    if (this.state.phase !== 'day') return 'Solo de día.';
    if (this.state.castle.level < def.castleLevel) return `Requiere ${BALANCE.castle.levels[def.castleLevel - 1].name}.`;
    if (def.requires && !this.hasBuilding(def.requires as BuildingKind))
      return `Requiere ${B[def.requires as BuildingKind].name}.`;
    if (this.state.population < 1) return 'No quedan habitantes que alistar.';
    if (!this.canAfford(def.cost)) return `Necesitas ${costText(def.cost)}.`;
    if (!this.recruitSpots().length) return 'No hay sitio libre junto al castillo.';
    return null;
  }

  recruit(kind: RecruitKind): Result {
    const err = this.canRecruit(kind);
    if (err) return fail(err);
    this.pay(BALANCE.recruit[kind].cost);
    this.state.population--;
    const spot = this.recruitSpots().sort(
      (a, b) => distance(a, this.state.castle) - distance(b, this.state.castle),
    )[0];
    const u = this.createUnit(kind, 'dawn', spot);
    this.state.stats.soldiersRecruited++;
    this.updateVision();
    return ok([
      { type: 'spawn', unit: { ...u } },
      { type: 'vision' },
      { type: 'log', text: `${BALANCE.units[kind].name} alistado.`, tone: 'good' },
    ]);
  }

  canTrade(i: number): string | null {
    const offer = BALANCE.market[i];
    if (!offer) return 'Oferta no válida.';
    if (this.state.phase !== 'day') return 'Solo de día.';
    if (!this.hasBuilding('market')) return 'Necesitas un mercado.';
    if (!this.canAfford(offer.give)) return `Necesitas ${costText(offer.give)}.`;
    return null;
  }

  trade(i: number): Result {
    const err = this.canTrade(i);
    if (err) return fail(err);
    const offer = BALANCE.market[i];
    this.pay(offer.give);
    this.gain(offer.get);
    return ok([{ type: 'log', text: `Mercado: ${costText(offer.give)} → ${costText(offer.get)}.`, tone: 'good' }]);
  }

  /** Termina el día: resuelve la noche entera y el amanecer. */
  endDay(): Result {
    if (this.state.phase !== 'day') return fail('Ya es de noche.');
    this.state.phase = 'night';
    const events: GameEvent[] = [{ type: 'nightfall' }];
    const over = () => this.state.phase === 'lost' || this.state.phase === 'won';

    events.push(...this.towerShots());
    if (!over()) events.push(...this.spawnCreatures());
    if (!over()) events.push(...this.nightMoves());
    if (!over()) events.push(...this.storm());
    if (!over()) events.push(...this.dawn());
    return ok(events);
  }

  // ───────────────────────── noche ─────────────────────────

  private towerShots(): GameEvent[] {
    const events: GameEvent[] = [];
    const shooters: { at: Hex; damage: number; castle: boolean }[] = [
      { at: this.state.castle, damage: this.castleDef.damage, castle: true },
      ...this.completed('tower').map((t) => ({ at: t as Hex, damage: BALANCE.effects.tower.damage as number, castle: false })),
    ];
    for (const s of shooters) {
      const range = s.castle ? BALANCE.castle.range : BALANCE.effects.tower.range;
      const target = this.team('night')
        .filter((e) => distance(e, s.at) <= range && e.kind !== 'lair')
        .sort((a, b) => a.hp - b.hp)[0];
      if (!target) continue;
      events.push({ type: 'towerShot', from: { q: s.at.q, r: s.at.r }, targetId: target.id, castle: s.castle });
      events.push(...this.damage(target, s.damage, 'tower'));
      if (this.state.phase === 'won') break;
    }
    return events;
  }

  private creatureCount(): number {
    return this.team('night').filter((u) => u.kind === 'shade' || u.kind === 'brute').length;
  }

  private creatureKind(): UnitKind {
    const n = BALANCE.night;
    return this.state.day >= n.bruteFromDay && this.rng.chance(n.bruteChance) ? 'brute' : 'shade';
  }

  /** Multiplicador de apariciones: dificultad y, si arde, el Faro del Alba. */
  private spawnMultiplier(): number {
    const beacon = this.state.beaconNights !== null ? BALANCE.effects.beacon.spawnBoost : 1;
    return this.difficulty.spawn * beacon;
  }

  private spawnCreatures(): GameEvent[] {
    const events = this.spawnFromLairs();
    const king = this.king;
    if (!king) return events;
    const n = BALANCE.night;
    const p = Math.min(n.spawnMax, (n.spawnBase + n.spawnPerDay * this.state.day) * this.spawnMultiplier());
    const count = (this.rng.chance(p) ? 1 : 0) + (this.state.kingAwake && this.rng.chance(p / 2) ? 1 : 0);
    for (let i = 0; i < count && this.creatureCount() < BALANCE.poi.maxCreatures; i++) {
      const spots = range(king, 2).filter((h) => {
        const t = this.tile(h);
        return t && this.nightMoveCost(t) < Infinity && !this.unitAt(h) && !t.structure;
      });
      if (!spots.length) break;
      const s = this.createUnit(this.creatureKind(), 'night', this.rng.pick(spots));
      events.push({ type: 'spawn', unit: { ...s } });
    }
    return events;
  }

  /** Cada guarida puede engendrar una criatura a su lado si hay héroes cerca. */
  private spawnFromLairs(): GameEvent[] {
    const events: GameEvent[] = [];
    const L = BALANCE.poi.lair;
    for (const lair of this.team('night').filter((u) => u.kind === 'lair')) {
      if (this.creatureCount() >= BALANCE.poi.maxCreatures) break;
      const near = this.team('dawn').some((u) => distance(u, lair) <= L.minHeroDistance);
      if (!near && this.state.day < 5) continue;
      if (!this.rng.chance(Math.min(0.95, L.spawnChance * this.spawnMultiplier()))) continue;
      const spots = neighbors(lair).filter((h) => {
        const t = this.tile(h);
        return t && this.nightMoveCost(t) < Infinity && !this.unitAt(h) && !t.structure;
      });
      if (!spots.length) continue;
      const s = this.createUnit(this.creatureKind(), 'night', this.rng.pick(spots));
      events.push({ type: 'spawn', unit: { ...s } });
    }
    return events;
  }

  private nightMoveCost(t: Tile): number {
    if (t.terrain === 'river') return t.structure === 'bridge' && !t.work ? 1 : Infinity;
    return BALANCE.terrain[t.terrain].moveCost;
  }

  /**
   * Objetivo de una criatura. Las sombras van a lo más cercano; los brutos
   * son asaltantes y solo buscan estructuras; el Rey marcha sobre el
   * castillo. Si el Faro arde, todos van a por él.
   */
  private nightTarget(e: Unit): Hex | null {
    const beacon = this.completed('beacon')[0];
    if (beacon && (e.kind === 'king' || distance(beacon, e) <= 10)) return beacon;
    if (e.kind === 'king') return this.state.castle;
    let best: Hex | null = null;
    let bestScore = Infinity;
    const consider = (h: Hex, bias: number) => {
      const d = distance(h, e) + bias;
      if (d < bestScore) {
        bestScore = d;
        best = h;
      }
    };
    if (e.kind !== 'brute') for (const u of this.team('dawn')) consider(u, 0);
    for (const t of this.state.tiles.values()) {
      if (!t.structure || t.structure === 'bridge') continue;
      consider(t, t.structure === 'castle' && e.kind === 'brute' ? -2 : 0.5);
    }
    return best;
  }

  private nightMoves(): GameEvent[] {
    const events: GameEvent[] = [];
    if (!this.state.kingAwake && this.state.day >= this.difficulty.kingWakeDay) events.push(...this.wakeKing());

    const movers = this.team('night').filter(
      (u) => u.kind !== 'lair' && (u.kind !== 'king' || this.state.kingAwake),
    );
    for (const e of movers) {
      if (!this.unit(e.id) || this.state.phase === 'lost') continue;
      const target = this.nightTarget(e);
      if (!target) break;

      let blocker: Tile | null = null;
      if (distance(target, e) > 1) {
        const budget = BALANCE.units[e.kind].moveRange;
        const route = this.nightPath(e, target);
        const steps: Hex[] = [];
        let spent = 0;
        for (const h of route) {
          if (equals(h, target) || this.unitAt(h)) break;
          const t = this.tile(h)!;
          if (this.blocksNight(t)) {
            blocker = t;
            break;
          }
          const c = Math.max(1, this.nightMoveCost(t));
          // Siempre pueden dar al menos un paso, aunque el terreno cueste más.
          if (spent + c > budget && spent > 0) break;
          spent += c;
          steps.push(h);
          if (distance(h, target) === 1) break;
        }
        if (steps.length) {
          events.push({ type: 'move', unitId: e.id, path: [{ q: e.q, r: e.r }, ...steps] });
          const last = steps[steps.length - 1];
          e.q = last.q;
          e.r = last.r;
        }
        if (blocker && distance(blocker, e) > 1) blocker = null;
      }

      if (e.atk <= 0) continue;
      const adjacent = this.team('dawn')
        .filter((u) => distance(u, e) === 1)
        .sort((a, b) => a.hp - b.hp)[0];
      // Los asaltantes ignoran a las tropas si tienen una estructura a mano.
      const raider = e.kind === 'brute' || e.kind === 'king';
      const structureNear = neighbors(e).some((n) => {
        const t = this.tile(n);
        return t && this.blocksNight(t);
      });
      if (adjacent && !(raider && structureNear)) {
        events.push({ type: 'attack', attackerId: e.id, targetId: adjacent.id });
        events.push(...this.damage(adjacent, e.atk, 'attack'));
        continue;
      }
      // Asedio: el objetivo si está al lado; si no, lo que le corta el paso; si no, lo que tenga cerca.
      const targetTile = this.tile(target);
      const siege =
        (targetTile && this.blocksNight(targetTile) && distance(targetTile, e) === 1 ? targetTile : null) ??
        blocker ??
        neighbors(e)
          .map((n) => this.tile(n))
          .find((t): t is Tile => !!t && this.blocksNight(t));
      if (siege) {
        events.push({ type: 'siege', attackerId: e.id, at: { q: siege.q, r: siege.r } });
        events.push(...this.damageStructure(siege, e.atk, 'shade'));
      }
    }
    this.updateVision();
    events.push({ type: 'vision' });
    return events;
  }

  /**
   * A* para las criaturas: rodean estructuras si pueden, si no las derriban.
   * Primero evitan casillas ocupadas; si no hay otra ruta, las atraviesan.
   */
  private nightPath(from: Hex, to: Hex): Hex[] {
    return this.nightPathInner(from, to, true) ?? this.nightPathInner(from, to, false) ?? [];
  }

  private nightPathInner(from: Hex, to: Hex, avoidUnits: boolean): Hex[] | null {
    const g = new Map<HexKey, number>([[key(from), 0]]);
    const prev = new Map<HexKey, HexKey>();
    const open: Hex[] = [from];
    while (open.length) {
      open.sort((a, b) => g.get(key(a))! + distance(a, to) - (g.get(key(b))! + distance(b, to)));
      const cur = open.shift()!;
      if (equals(cur, to)) break;
      for (const nb of neighbors(cur)) {
        const t = this.tile(nb);
        if (!t) continue;
        const c = this.nightMoveCost(t);
        if (c === Infinity) continue;
        const occupant = this.unitAt(nb);
        if (avoidUnits && occupant && !equals(nb, to)) continue;
        let extra = occupant && occupant.team === 'night' ? 3 : 0;
        if (this.blocksNight(t) && !equals(nb, to)) extra += 6;
        const d = g.get(key(cur))! + c + extra;
        if (d < (g.get(key(nb)) ?? Infinity)) {
          g.set(key(nb), d);
          prev.set(key(nb), key(cur));
          open.push(nb);
        }
      }
    }
    const path: Hex[] = [];
    let k: HexKey | undefined = key(to);
    if (!prev.has(k)) return null;
    while (k && k !== key(from)) {
      const t = this.state.tiles.get(k)!;
      path.unshift({ q: t.q, r: t.r });
      k = prev.get(k);
    }
    return path;
  }

  private damageStructure(t: Tile, amount: number, cause: 'shade' | 'storm'): GameEvent[] {
    const at = { q: t.q, r: t.r };
    if (t.structure === 'castle') {
      const c = this.state.castle;
      c.hp = Math.max(0, c.hp - amount);
      const events: GameEvent[] = [{ type: 'structureHit', at, amount, hp: c.hp, maxHp: c.maxHp }];
      if (c.hp <= 0) events.push(...this.end(false, 'castle'));
      return events;
    }
    const max = this.structureMaxHp(t);
    t.shp = Math.max(0, (t.shp ?? max) - amount);
    const events: GameEvent[] = [{ type: 'structureHit', at, amount, hp: t.shp, maxHp: max }];
    if (t.shp > 0) return events;

    const kind = t.structure as BuildingKind;
    t.structure = null;
    t.work = 0;
    t.shp = 0;
    if (kind === 'beacon') this.state.beaconNights = null;
    events.push({ type: 'destroy', at, structure: kind, cause });
    events.push({ type: 'log', text: `¡${B[kind].name} destruida!`, tone: 'bad' });
    events.push({ type: 'claim', tiles: this.recomputeTerritory() });
    return events;
  }

  private storm(): GameEvent[] {
    if (this.state.day < BALANCE.storm.fromDay || !this.rng.chance(BALANCE.storm.chance)) return [];
    const targets = [...this.state.tiles.values()].filter(
      (t) => t.structure && t.structure !== 'bridge' && t.structure !== 'castle' && !t.work && (t.shp ?? 0) > 1,
    );
    if (!targets.length) return [{ type: 'storm', at: null }];
    const t = this.rng.pick(targets);
    const events: GameEvent[] = [{ type: 'storm', at: { q: t.q, r: t.r } }];
    const amount = Math.min(BALANCE.storm.damage, (t.shp ?? 1) - 1);
    events.push(...this.damageStructure(t, amount, 'storm'));
    events.push({ type: 'log', text: `Un rayo daña tu ${BALANCE.buildings[t.structure as BuildingKind].name.toLowerCase()}.`, tone: 'bad' });
    this.updateVision();
    events.push({ type: 'vision' });
    return events;
  }

  private dawn(): GameEvent[] {
    const s = this.state;
    const eco = this.economy();
    s.day++;
    s.hours = BALANCE.hoursPerDay;
    this.gain(eco.production);
    s.res.food -= eco.upkeep;
    const starving = s.res.food < 0;
    if (starving) s.res.food = 0;

    let newSettlers = 0;
    if (starving) s.population = Math.max(0, s.population - 1);
    else if (s.population < eco.housing && s.res.food > 0) {
      // Solo llegan colonos si la despensa aguanta sus bocas.
      const extraMouths = Math.ceil((s.population + 1) / BALANCE.population.perFood) - Math.ceil(s.population / BALANCE.population.perFood);
      if (eco.production.food - eco.upkeep - extraMouths >= 0) {
        newSettlers = Math.min(BALANCE.population.growth, eco.housing - s.population);
        s.population += newSettlers;
      }
    }

    const report: DawnReport = { day: s.day, production: eco.production, upkeep: eco.upkeep, starving, newSettlers };
    const events: GameEvent[] = [{ type: 'dawn', report }];

    // Curación: territorio, castillo, puestos de avanzada y santuarios.
    const outposts = this.completed('outpost');
    for (const u of this.team('dawn')) {
      if (starving) {
        events.push(...this.damage(u, BALANCE.starvationDamage, 'hunger'));
        if (!this.unit(u.id)) continue;
      }
      const t = this.tile(u);
      let heal = t?.owned ? 5 : 0;
      if (distance(u, s.castle) <= 1) heal = Math.max(heal, 15);
      if (outposts.some((o) => distance(o, u) <= 1)) heal = Math.max(heal, BALANCE.effects.outpost.heal);
      if (t?.poi === 'shrine') heal = Math.max(heal, BALANCE.poi.shrine.heal);
      events.push(...this.heal(u, heal));
    }
    if (s.phase !== 'night') return events;

    events.push(...this.repairs());
    events.push(...this.progressWorks());
    if (s.phase !== 'night') return events;

    // El Faro cuenta las noches que ha resistido.
    if (s.beaconNights !== null && this.hasBuilding('beacon')) {
      s.beaconNights++;
      const needed = BALANCE.effects.beacon.nights;
      events.push({ type: 'beacon', nights: s.beaconNights, needed });
      if (s.beaconNights >= needed) {
        events.push(...this.end(true, 'beacon'));
        return events;
      }
    }

    s.phase = 'day';
    events.push(...this.omen());
    this.updateVision();
    events.push({ type: 'vision' });
    return events;
  }

  /** Las estructuras sin enemigos al lado se reparan un poco cada amanecer. */
  private repairs(): GameEvent[] {
    const events: GameEvent[] = [];
    const enemies = this.team('night');
    const safe = (t: Hex) => !enemies.some((e) => e.atk > 0 && distance(e, t) <= 1);
    const c = this.state.castle;
    if (c.hp < c.maxHp && safe(c)) {
      c.hp = Math.min(c.maxHp, c.hp + BALANCE.castle.regen);
      events.push({ type: 'repair', at: { q: c.q, r: c.r }, hp: c.hp, maxHp: c.maxHp });
    }
    for (const t of this.state.tiles.values()) {
      if (!t.structure || t.structure === 'castle' || t.structure === 'bridge' || t.work) continue;
      const max = this.structureMaxHp(t);
      if ((t.shp ?? max) >= max || !safe(t)) continue;
      t.shp = Math.min(max, (t.shp ?? 0) + Math.ceil(max * BALANCE.effects.repair));
      events.push({ type: 'repair', at: { q: t.q, r: t.r }, hp: t.shp, maxHp: max });
    }
    return events;
  }

  /** Avanzan las obras y la mejora del castillo. */
  private progressWorks(): GameEvent[] {
    const events: GameEvent[] = [];
    let territoryChanged = false;
    for (const t of this.state.tiles.values()) {
      if (!t.work || !t.structure || t.structure === 'castle') continue;
      t.work--;
      const at = { q: t.q, r: t.r };
      if (t.work > 0) {
        events.push({ type: 'progress', at, left: t.work, total: t.workTotal ?? t.work });
        continue;
      }
      const kind = t.structure;
      const def = B[kind];
      t.shp = def.hp;
      this.state.stats.structuresBuilt++;
      events.push({ type: 'built', at, structure: kind });
      events.push({ type: 'log', text: `${def.name}: obra terminada.`, tone: 'good' });
      if (kind === 'tower' || kind === 'outpost') territoryChanged = true;
      if (kind === 'forge') {
        this.state.forge = true;
        for (const u of this.team('dawn')) if (TROOPS.includes(u.kind)) u.atk += BALANCE.effects.forge.atk;
        events.push({
          type: 'log',
          text: `La herrería forja mejores armas: +${BALANCE.effects.forge.atk} ATQ a tus tropas.`,
          tone: 'good',
        });
      }
      if (kind === 'beacon') {
        this.state.beaconNights = 0;
        events.push({
          type: 'log',
          text: `¡El Faro del Alba arde! Resiste ${BALANCE.effects.beacon.nights} noches y la oscuridad será desterrada.`,
          tone: 'epic',
        });
        events.push(...this.wakeKing());
      }
    }

    const c = this.state.castle;
    if (c.upgrade > 0) {
      c.upgrade--;
      if (c.upgrade === 0) {
        c.level++;
        const def = this.castleDef;
        c.hp += def.hp - c.maxHp;
        c.maxHp = def.hp;
        events.push({ type: 'castleUpgraded', level: c.level, hp: c.hp, maxHp: c.maxHp });
        events.push({ type: 'log', text: `¡El castillo es ahora ${def.name}!`, tone: 'epic' });
        territoryChanged = true;
      } else events.push({ type: 'castleWork', days: c.upgrade });
    }
    if (territoryChanged) events.push({ type: 'claim', tiles: this.recomputeTerritory() });
    return events;
  }

  /** Sucesos aleatorios al amanecer: pequeñas alegrías y desgracias. */
  private omen(): GameEvent[] {
    if (!this.rng.chance(BALANCE.omenChance)) return [];
    const s = this.state;
    const options: { weight: number; run: () => GameEvent[] }[] = [
      {
        weight: 3,
        run: () => {
          s.res.food += 8;
          return [{ type: 'omen', title: 'Lluvia fértil', text: 'Las cosechas rebosan: +8 víveres.', tone: 'good' }];
        },
      },
      {
        weight: 3,
        run: () => {
          s.res.materials += 8;
          return [{ type: 'omen', title: 'Hallazgo', text: 'Un carro abandonado en el camino: +8 materiales.', tone: 'good' }];
        },
      },
      {
        weight: 2,
        run: () => {
          s.res.stone += 6;
          return [{ type: 'omen', title: 'Filón', text: 'Los canteros hallan una veta limpia: +6 piedra.', tone: 'good' }];
        },
      },
      {
        weight: 2,
        run: () => {
          const loss = Math.min(s.res.food, 6);
          s.res.food -= loss;
          return [{ type: 'omen', title: 'Plaga', text: `Las ratas asaltan el granero: −${loss} víveres.`, tone: 'bad' }];
        },
      },
      {
        weight: 2,
        run: () => {
          s.population += 2;
          return [
            { type: 'omen', title: 'Colonos', text: 'Una familia llega al castillo buscando refugio: +2 habitantes.', tone: 'good' },
          ];
        },
      },
      {
        weight: 1,
        run: () => {
          s.res.gold += 5;
          return [{ type: 'omen', title: 'Mercader errante', text: 'Paga bien por tu hospitalidad: +5 oro.', tone: 'good' }];
        },
      },
    ];
    const total = options.reduce((acc, o) => acc + o.weight, 0);
    let roll = this.rng.next() * total;
    for (const o of options) {
      roll -= o.weight;
      if (roll <= 0) return o.run();
    }
    return [];
  }

  // ───────────────────────── puntos de interés ─────────────────────────

  /** Efecto de pisar un punto de interés por primera vez. */
  private visit(u: Unit, h: Hex): GameEvent[] {
    const t = this.tile(h);
    if (!t?.poi || t.poiUsed) return [];
    t.poiUsed = true;
    const s = this.state;
    s.stats.poisFound++;
    const at = { q: t.q, r: t.r };
    const P = BALANCE.poi;

    if (t.poi === 'ruins') {
      const roll = this.rng.next();
      const loot = (title: string, text: string, gain: Cost): GameEvent[] => {
        this.gain(gain);
        return [{ type: 'discover', at, poi: 'ruins', title, text }];
      };
      if (roll < 0.35) return loot('Ruinas antiguas', 'Entre los escombros hallas madera útil: +15 materiales.', { materials: 15 });
      if (roll < 0.6) return loot('Despensa olvidada', 'Una bodega intacta bajo las ruinas: +12 víveres.', { food: 12 });
      if (roll < 0.8) return loot('Sillares', 'Piedra tallada lista para usar: +10 piedra.', { stone: 10 });
      if (roll < 0.9) return loot('Tesoro', 'Un cofre de los antiguos reyes del alba: +8 oro.', { gold: 8 });
      return [
        { type: 'discover', at, poi: 'ruins', title: 'Reliquia', text: 'Un emblema de los antiguos reyes del alba: +2 de renombre.' },
        ...this.gainRenown(2),
      ];
    }

    if (t.poi === 'village') {
      s.population += P.village.settlers;
      return [
        {
          type: 'discover',
          at,
          poi: 'village',
          title: 'Aldea anexionada',
          text: `Se une al reino: +${P.village.settlers} habitantes, +${P.village.gold} oro al día y su comarca pasa a ser tuya.`,
        },
        { type: 'claim', tiles: this.recomputeTerritory() },
      ];
    }

    return [
      {
        type: 'discover',
        at,
        poi: 'shrine',
        title: 'Santuario del alba',
        text: `Una luz cálida te envuelve: +${P.shrine.blessing} PV y +${P.shrine.renown} de renombre. Dormir aquí cura cada noche.`,
      },
      ...this.heal(u, P.shrine.blessing),
      ...this.gainRenown(P.shrine.renown),
    ];
  }

  // ───────────────────────── utilidades ─────────────────────────

  private pay(cost: Cost) {
    for (const r of RESOURCES) this.state.res[r] -= cost[r] ?? 0;
  }

  private gain(cost: Cost) {
    for (const r of RESOURCES) this.state.res[r] += cost[r] ?? 0;
  }

  /**
   * Territorio por influencia: castillo, torres, puestos de avanzada y
   * aldeas anexionadas. Devuelve las casillas recién ganadas.
   */
  private recomputeTerritory(): Hex[] {
    const sources: [Hex, number][] = [[this.state.castle, this.castleDef.radius]];
    for (const t of this.state.tiles.values()) {
      if (t.structure === 'tower' && !t.work) sources.push([t, BALANCE.effects.tower.influence]);
      if (t.structure === 'outpost' && !t.work) sources.push([t, BALANCE.effects.outpost.influence]);
      if (t.poi === 'village' && t.poiUsed) sources.push([t, BALANCE.poi.village.influence]);
    }
    const gained: Hex[] = [];
    let count = 0;
    for (const t of this.state.tiles.values()) {
      const was = t.owned;
      t.owned = sources.some(([c, r]) => distance(c, t) <= r);
      if (t.owned) count++;
      if (t.owned && !was) gained.push({ q: t.q, r: t.r });
    }
    this.state.stats.territory = Math.max(this.state.stats.territory, count);
    return gained;
  }

  private heal(u: Unit, amount: number): GameEvent[] {
    const real = Math.min(amount, u.maxHp - u.hp);
    if (real <= 0) return [];
    u.hp += real;
    return [{ type: 'heal', unitId: u.id, amount: real, hp: u.hp }];
  }

  private end(victory: boolean, reason: EndReason): GameEvent[] {
    this.state.phase = victory ? 'won' : 'lost';
    this.state.endReason = reason;
    return [{ type: 'gameOver', victory, reason }];
  }

  private damage(u: Unit, amount: number, source: DamageSource): GameEvent[] {
    u.hp = Math.max(0, u.hp - amount);
    const events: GameEvent[] = [{ type: 'damage', unitId: u.id, amount, hp: u.hp, source }];
    if (u.hp > 0) return events;

    this.state.units = this.state.units.filter((x) => x.id !== u.id);
    events.push({ type: 'death', unitId: u.id });
    const b = BALANCE.units[u.kind];
    if (u.kind === 'lair') {
      this.state.res.materials += b.reward;
      this.state.stats.lairsDestroyed++;
      events.push({ type: 'log', text: `¡Guarida destruida! +${b.reward} materiales.`, tone: 'epic' });
      events.push(...this.gainRenown(b.renown));
    } else if (u.kind === 'shade' || u.kind === 'brute') {
      this.state.res.materials += b.reward;
      this.state.stats.shadesSlain++;
      events.push({ type: 'log', text: `${b.name} disipado. +${b.reward} materiales.`, tone: 'good' });
      events.push(...this.gainRenown(b.renown));
    } else if (TROOPS.includes(u.kind)) {
      events.push({ type: 'log', text: `Has perdido un ${b.name.toLowerCase()}.`, tone: 'bad' });
    } else if (u.kind === 'king') {
      events.push(...this.end(true, 'king'));
    } else if (u.kind === 'hero') {
      events.push(...this.end(false, 'hero'));
    }
    return events;
  }

  private gainRenown(amount: number): GameEvent[] {
    const hero = this.hero;
    if (!hero || !amount) return [];
    hero.renown = (hero.renown ?? 0) + amount;
    const events: GameEvent[] = [];
    const per = BALANCE.hero.perLevel;
    let next = this.nextLevelAt(hero.level ?? 1);
    while (next !== null && hero.renown >= next) {
      hero.level = (hero.level ?? 1) + 1;
      hero.maxHp += per.hp;
      hero.atk += per.atk;
      hero.hp = Math.min(hero.maxHp, hero.hp + per.heal);
      events.push({ type: 'levelUp', unitId: hero.id, level: hero.level, hp: hero.hp, maxHp: hero.maxHp, atk: hero.atk });
      events.push({ type: 'log', text: `¡El héroe alcanza el nivel ${hero.level}! +${per.atk} ATQ, +${per.hp} PV máx.`, tone: 'epic' });
      next = this.nextLevelAt(hero.level);
    }
    return events;
  }

  private wakeKing(): GameEvent[] {
    if (this.state.kingAwake || !this.king) return [];
    this.state.kingAwake = true;
    return [{ type: 'kingWakes' }, { type: 'log', text: '¡El Rey de la Noche ha despertado!', tone: 'epic' }];
  }

  private checkKingWake(): GameEvent[] {
    const king = this.king;
    if (!king || this.state.kingAwake) return [];
    const near = this.team('dawn').some((u) => distance(u, king) <= BALANCE.night.kingWakeDistance);
    return near ? this.wakeKing() : [];
  }

  private createUnit(kind: UnitKind, team: Team, at: Hex): Unit {
    const b = BALANCE.units[kind];
    let atk: number = b.atk;
    if (team === 'night') atk = Math.round(atk * this.difficulty.enemyAtk);
    else if (this.state.forge && TROOPS.includes(kind)) atk += BALANCE.effects.forge.atk;
    const u: Unit = { id: this.state.nextId++, kind, team, q: at.q, r: at.r, hp: b.hp, maxHp: b.hp, atk };
    this.state.units.push(u);
    return u;
  }

  updateVision() {
    const tiles = this.state.tiles;
    for (const t of tiles.values()) t.visible = false;
    const reveal = (center: Hex, radius: number) => {
      for (const h of range(center, radius)) {
        const t = tiles.get(key(h));
        if (t) {
          t.visible = true;
          t.explored = true;
        }
      }
    };
    reveal(this.state.castle, BALANCE.castle.vision);
    for (const u of this.team('dawn')) reveal(u, BALANCE.units[u.kind].vision);
    for (const t of tiles.values()) {
      if (t.owned) reveal(t, 0);
      if (t.structure === 'tower' && !t.work) reveal(t, BALANCE.effects.tower.vision);
      if (t.structure === 'outpost' && !t.work) reveal(t, BALANCE.effects.outpost.vision);
      if (t.poi === 'village' && t.poiUsed) reveal(t, BALANCE.poi.village.vision);
    }
  }
}
