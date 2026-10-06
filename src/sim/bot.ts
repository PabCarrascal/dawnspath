import { Hex, distance } from '../core/hex';
import type { BuildingKind, RecruitKind } from '../game/config';
import type { Game } from '../game/Game';
import type { Unit } from '../game/types';

/**
 * Jugador automático sencillo para medir el equilibrio: gestiona el
 * castillo con prioridades fijas, explora con el héroe y defiende con
 * las tropas. No es brillante a propósito: representa a un jugador medio.
 */
export class Bot {
  constructor(private g: Game) {}

  playDay() {
    this.manage();
    this.moveHero();
    this.moveTroops();
    this.manage();
  }

  // ───────────────────────── castillo ─────────────────────────

  private manage() {
    const g = this.g;
    if (g.canUpgradeCastle() === null) g.upgradeCastle();
    for (let guard = 0; guard < 6; guard++) {
      const kind = this.nextBuilding();
      if (!kind || g.canBuild(kind) !== null) break;
      const spot = this.pickSpot(kind);
      if (!spot || !g.build(kind, spot).ok) break;
    }
    for (let guard = 0; guard < 4; guard++) {
      const kind = this.nextRecruit();
      if (!kind || !g.recruit(kind).ok) break;
    }
  }

  private count(kind: BuildingKind) {
    return [...this.g.state.tiles.values()].filter((t) => t.structure === kind).length;
  }

  private nextBuilding(): BuildingKind | null {
    const g = this.g;
    const s = g.state;
    const eco = g.economy();
    const lvl = s.castle.level;
    const netFood = eco.production.food - eco.upkeep;
    const wants: [boolean, BuildingKind][] = [
      [netFood < 2, 'farm'],
      [this.count('sawmill') < 1 + lvl, 'sawmill'],
      [this.count('quarry') < Math.min(3, lvl), 'quarry'],
      [eco.understaffed.length > 0 && s.population >= eco.housing, 'house'],
      [lvl >= 2 && this.count('market') < 1, 'market'],
      [lvl >= 2 && this.count('barracks') < 1, 'barracks'],
      [this.count('tower') < lvl && s.day >= 7, 'tower'],
      [g.buildSpots('farm').length + g.buildSpots('house').length < 6, 'outpost'],
      [lvl >= 3 && this.count('forge') < 1, 'forge'],
      [lvl >= 3 && this.count('archery') < 1, 'archery'],
      [lvl >= 4 && this.count('beacon') < 1 && g.team('dawn').length >= 5, 'beacon'],
      [s.population >= eco.housing && netFood >= 3, 'house'],
      [netFood < 4, 'farm'],
    ];
    for (const [want, kind] of wants) if (want && g.canBuild(kind) === null) return kind;
    return null;
  }

  private pickSpot(kind: BuildingKind): Hex | null {
    const g = this.g;
    const spots = g.buildSpots(kind);
    if (!spots.length) return null;
    const king = g.king ?? g.state.castle;
    // Torres y faro mirando hacia el Rey; lo demás, cerca del castillo.
    const score = (h: Hex) =>
      kind === 'tower'
        ? distance(h, king)
        : kind === 'outpost'
          ? -distance(h, g.state.castle) * 10 + distance(h, { q: 0, r: 0 })
          : distance(h, g.state.castle) * 10 + distance(h, king) * -0.1;
    return spots.sort((a, b) => score(a) - score(b))[0];
  }

  private nextRecruit(): RecruitKind | null {
    const g = this.g;
    const s = g.state;
    const eco = g.economy();
    const army = g.team('dawn').length - 1;
    const target = Math.max(0, Math.floor((s.day - 3) / 3)) + (s.kingAwake ? 3 : 0);
    if (army >= target) return null;
    // No vaciar la mano de obra ni hundir los víveres.
    if (s.population <= eco.workersNeeded) return null;
    if (eco.production.food - eco.upkeep < 2 && s.res.food < 40) return null;
    for (const k of ['archer', 'soldier', 'militia'] as RecruitKind[]) if (g.canRecruit(k) === null) return k;
    return null;
  }

  // ───────────────────────── unidades ─────────────────────────

  private fight(u: Unit): boolean {
    const g = this.g;
    let fought = false;
    for (let guard = 0; guard < 5 && g.state.hours > 0 && g.unit(u.id); guard++) {
      const targets = g.attackTargets(u.id);
      if (!targets.length) break;
      // El objetivo más débil; evita contraataques suicidas.
      const t = targets.sort((a, b) => a.hp - b.hp)[0];
      const dmg = g.attackDamage(u, t);
      const counter = g.wouldCounter(u, t) && t.hp > dmg ? t.atk : 0;
      if (counter >= u.hp) break;
      g.attack(u.id, t.id);
      fought = true;
    }
    return fought;
  }

  private walkToward(u: Unit, goal: Hex) {
    const g = this.g;
    const reach = g.reachable(u.id);
    let best: Hex | null = null;
    let bestD = distance(u, goal);
    for (const k of reach.keys()) {
      const t = g.state.tiles.get(k)!;
      const d = distance(t, goal);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (best) g.move(u.id, best);
  }

  private moveHero() {
    const g = this.g;
    const hero = g.hero;
    if (!hero) return;
    this.fight(hero);
    if (g.state.hours <= 0 || !g.unit(hero.id)) return;

    const hurt = hero.hp < hero.maxHp * 0.45;
    let goal: Hex | null = null;
    if (hurt) goal = g.state.castle;
    else {
      const tiles = [...g.state.tiles.values()];
      // Guaridas visibles si el héroe es fuerte; si no, lugares sin visitar; si no, explorar.
      const lair = g.team('night').find((e) => e.kind === 'lair' && g.isUnitVisible(e));
      if (lair && (hero.level ?? 1) >= 2) goal = lair;
      else {
        const poi = tiles
          .filter((t) => t.poi && !t.poiUsed && t.explored)
          .sort((a, b) => distance(a, hero) - distance(b, hero))[0];
        const unknown = tiles
          .filter((t) => !t.explored && t.terrain !== 'mountain')
          .sort((a, b) => distance(a, g.state.castle) - distance(b, g.state.castle))[0];
        goal = poi ?? unknown ?? g.state.castle;
      }
    }
    // Evita terminar el día en peligro si va herido.
    this.walkToward(hero, goal);
    this.fight(hero);
  }

  private moveTroops() {
    const g = this.g;
    const castle = g.state.castle;
    for (const u of g.team('dawn')) {
      if (u.kind === 'hero') continue;
      if (g.state.hours <= 0) break;
      if (this.fight(u)) continue;
      // Defensa: quedarse a 1-2 casillas del castillo, hacia el enemigo más cercano.
      const enemy = g
        .team('night')
        .filter((e) => e.kind !== 'lair' && g.isUnitVisible(e) && distance(e, castle) <= 5)
        .sort((a, b) => distance(a, castle) - distance(b, castle))[0];
      if (enemy && distance(u, enemy) > 1) this.walkToward(u, enemy);
      else if (distance(u, castle) > 2) this.walkToward(u, castle);
      this.fight(u);
    }
  }
}

export interface SimResult {
  seed: number;
  victory: boolean;
  reason: string;
  day: number;
  castleLevel: number;
  army: number;
  heroLevel: number;
  levelDays: number[];
  destroyed: number;
  minCastle: number;
  creaturesKilled: number;
}

/** Juega una partida completa sin pantalla. */
export async function simulate(GameCtor: typeof Game, seed: number, difficulty: 'easy' | 'normal' | 'hard', maxDays = 70): Promise<SimResult> {
  const g = new GameCtor(seed, difficulty);
  const bot = new Bot(g);
  const levelDays: number[] = [];
  let lastLevel = 1;
  let destroyed = 0;
  let minCastle = 1;
  while (g.state.phase === 'day' && g.state.day <= maxDays) {
    bot.playDay();
    if (g.state.phase !== 'day') break;
    const res = g.endDay();
    if (res.ok) destroyed += res.events.filter((e) => e.type === 'destroy').length;
    minCastle = Math.min(minCastle, g.state.castle.hp / g.state.castle.maxHp);
    if (g.state.castle.level > lastLevel) {
      lastLevel = g.state.castle.level;
      levelDays.push(g.state.day);
    }
  }
  return {
    seed,
    victory: g.state.phase === 'won',
    reason: g.state.endReason ?? 'timeout',
    day: g.state.day,
    castleLevel: g.state.castle.level,
    army: g.team('dawn').length - 1,
    heroLevel: g.hero?.level ?? 0,
    levelDays,
    destroyed,
    minCastle,
    creaturesKilled: g.state.stats.shadesSlain,
  };
}
