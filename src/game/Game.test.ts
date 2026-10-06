import { describe, expect, it } from 'vitest';
import { distance, key, neighbors } from '../core/hex';
import { BALANCE, BuildingKind } from './config';
import { Game } from './Game';
import { HERO_START, KING_START } from './mapgen';
import type { Tile } from './types';

const seeds = [1, 7, 42, 1337, 9001, 123456];

/** Recursos de sobra para probar construcciones sin depender de la economía. */
const rich = (g: Game) => {
  g.state.res = { food: 999, materials: 999, stone: 999, gold: 999 };
  g.state.population = 30;
};

/** Termina todas las obras en curso pasando días. */
const finishWorks = (g: Game) => {
  for (let i = 0; i < 5 && g.worksActive() > 0; i++) g.endDay();
};

const pois = (g: Game, kind: string) => [...g.state.tiles.values()].filter((t) => t.poi === kind);

describe('mapa', () => {
  it.each(seeds)('semilla %i: hay camino del castillo al rey y montaña cerca', (seed) => {
    const g = new Game(seed);
    const seen = new Set([key(HERO_START)]);
    const queue = [HERO_START];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const n of neighbors(cur)) {
        const t = g.tile(n);
        if (!t || seen.has(key(n)) || t.terrain === 'mountain' || t.terrain === 'river') continue;
        seen.add(key(n));
        queue.push(n);
      }
    }
    expect(seen.has(key(KING_START))).toBe(true);
    const mountainNear = [...g.state.tiles.values()].some((t) => t.terrain === 'mountain' && distance(t, HERO_START) <= 3);
    expect(mountainNear).toBe(true);
  });

  it.each(seeds)('semilla %i: reparte aldeas, santuarios, ruinas y guaridas', (seed) => {
    const g = new Game(seed);
    expect(g.state.tiles.size).toBe(3 * BALANCE.mapRadius * (BALANCE.mapRadius + 1) + 1);
    expect(pois(g, 'village').length).toBe(BALANCE.poi.village.count);
    expect(pois(g, 'shrine').length).toBe(BALANCE.poi.shrine.count);
    expect(pois(g, 'ruins').length).toBeGreaterThanOrEqual(3);
    const lairs = g.team('night').filter((u) => u.kind === 'lair');
    expect(lairs.length).toBeGreaterThanOrEqual(2);
    for (const l of lairs) expect(distance(l, HERO_START)).toBeGreaterThanOrEqual(BALANCE.poi.lair.minHeroDistance);
  });

  it('es determinista por semilla', () => {
    const a = [...new Game(99).state.tiles.values()].map((t) => t.terrain + (t.poi ?? '')).join();
    const b = [...new Game(99).state.tiles.values()].map((t) => t.terrain + (t.poi ?? '')).join();
    expect(a).toBe(b);
  });
});

describe('castillo y territorio', () => {
  it('el reino empieza con un torreón, territorio de radio 2 y el héroe al lado', () => {
    const g = new Game(42);
    const c = g.state.castle;
    expect(g.tile(c)!.structure).toBe('castle');
    expect(distance(g.hero!, c)).toBe(1);
    for (const t of g.state.tiles.values()) expect(t.owned).toBe(distance(t, c) <= 2);
  });

  it('caminar ya no reclama territorio', () => {
    const g = new Game(42);
    const hero = g.hero!;
    const far = [...g.reachable(hero.id).entries()].find(([k]) => !g.state.tiles.get(k)!.owned);
    if (!far) return;
    const t = g.state.tiles.get(far[0])!;
    expect(g.move(hero.id, t).ok).toBe(true);
    expect(t.owned).toBe(false);
  });

  it('las casillas no producen solas: produce el castillo', () => {
    const g = new Game(42);
    const eco = g.economy();
    expect(eco.production.food).toBe(BALANCE.castle.levels[0].food);
    expect(eco.production.materials).toBe(BALANCE.castle.levels[0].materials);
    expect(eco.production.stone).toBe(0);
  });

  it('construir lleva días y ocupa una cuadrilla', () => {
    const g = new Game(42);
    rich(g);
    const spot = g.buildSpots('farm')[0];
    expect(g.build('farm', spot).ok).toBe(true);
    expect(g.tile(spot)!.work).toBe(BALANCE.buildings.farm.days);
    // El torreón tiene un número limitado de cuadrillas.
    for (let i = 1; i < g.castleDef.slots; i++) g.build('house', g.buildSpots('house')[0]);
    expect(g.canBuild('house')).toMatch(/cuadrillas/);
    const before = g.economy().production.food;
    g.endDay();
    expect(g.tile(spot)!.work).toBe(0);
    expect(g.economy().production.food).toBe(before + (BALANCE.buildings.farm.produces.food ?? 0));
  });

  it('sin habitantes los edificios no producen', () => {
    const g = new Game(42);
    rich(g);
    g.build('farm', g.buildSpots('farm')[0]);
    finishWorks(g);
    g.state.population = 0;
    const eco = g.economy();
    expect(eco.understaffed.length).toBe(1);
    expect(eco.production.food).toBe(g.castleDef.food);
  });

  it('mejorar el castillo amplía el territorio y desbloquea edificios', () => {
    const g = new Game(42);
    rich(g);
    expect(g.canBuild('barracks')).toMatch(/Requiere/);
    expect(g.upgradeCastle().ok).toBe(true);
    for (let i = 0; i < 3; i++) g.endDay();
    expect(g.state.castle.level).toBe(2);
    expect(g.state.castle.maxHp).toBe(BALANCE.castle.levels[1].hp);
    const owned = [...g.state.tiles.values()].filter((t) => t.owned);
    expect(owned.some((t) => distance(t, g.state.castle) === 3)).toBe(true);
    expect(g.canBuild('barracks')).toBeNull();
  });

  it('las torres y los puestos de avanzada amplían el territorio', () => {
    const g = new Game(42);
    rich(g);
    const edge = g.buildSpots('outpost').sort((a, b) => distance(b, g.state.castle) - distance(a, g.state.castle))[0];
    g.build('outpost', edge);
    const before = [...g.state.tiles.values()].filter((t) => t.owned).length;
    finishWorks(g);
    const after = [...g.state.tiles.values()].filter((t) => t.owned).length;
    expect(after).toBeGreaterThan(before);
  });

  it('reclutar consume un habitante y aparece junto al castillo', () => {
    const g = new Game(42);
    rich(g);
    const pop = g.state.population;
    const res = g.recruit('militia');
    expect(res.ok).toBe(true);
    expect(g.state.population).toBe(pop - 1);
    const militia = g.team('dawn').find((u) => u.kind === 'militia')!;
    expect(distance(militia, g.state.castle)).toBe(1);
    expect(g.canRecruit('soldier')).toMatch(/Requiere/);
  });

  it('el mercado cambia recursos', () => {
    const g = new Game(42);
    rich(g);
    expect(g.canTrade(0)).toMatch(/mercado/);
    g.state.castle.level = 2;
    g.build('market', g.buildSpots('market')[0]);
    finishWorks(g);
    const gold = g.state.res.gold;
    expect(g.trade(0).ok).toBe(true);
    expect(g.state.res.gold).toBe(gold + (BALANCE.market[0].get.gold ?? 0));
  });

  it('la herrería mejora el ataque de las tropas', () => {
    const g = new Game(42);
    rich(g);
    g.state.castle.level = 3;
    g.recruit('militia');
    g.build('forge', g.buildSpots('forge')[0]);
    finishWorks(g);
    const militia = g.team('dawn').find((u) => u.kind === 'militia');
    // Puede haber caído de noche; si sigue viva, tiene el bonus.
    if (militia) expect(militia.atk).toBe(BALANCE.units.militia.atk + BALANCE.effects.forge.atk);
    expect(g.state.forge).toBe(true);
  });

  it('los habitantes crecen si hay comida y casas', () => {
    const g = new Game(42);
    g.state.res.materials = 50;
    g.build('farm', g.buildSpots('farm')[0]);
    finishWorks(g);
    const pop = g.state.population;
    g.endDay();
    expect(g.state.population).toBeGreaterThanOrEqual(pop + 1);
  });
});

describe('noche y asedio', () => {
  /** Coloca una criatura junto a una casilla. */
  const placeCreature = (g: Game, near: { q: number; r: number }) => {
    const spot = neighbors(near).find((n) => {
      const t = g.tile(n);
      return t && !t.structure && !g.unitAt(n) && t.terrain !== 'river' && t.terrain !== 'mountain';
    })!;
    const u = { id: 900 + g.state.units.length, kind: 'shade' as const, team: 'night' as const, q: spot.q, r: spot.r, hp: 999, maxHp: 999, atk: 30 };
    g.state.units.push(u);
    return u;
  };

  it('las criaturas asedian edificios y los destruyen', () => {
    const g = new Game(42);
    rich(g);
    const spot = g.buildSpots('farm').sort((a, b) => distance(b, g.state.castle) - distance(a, g.state.castle))[0];
    g.build('farm', spot);
    finishWorks(g);
    const hero = g.hero!;
    hero.hp = hero.maxHp = 99999;
    hero.q = KING_START.q - 2;
    hero.r = KING_START.r + 3;
    g.state.units = g.state.units.filter((u) => u.team === 'dawn');
    placeCreature(g, spot);
    let destroyed = false;
    for (let i = 0; i < 4 && !destroyed; i++) {
      const res = g.endDay();
      if (res.ok) destroyed = res.events.some((e) => e.type === 'destroy' && key(e.at) === key(spot));
    }
    expect(destroyed).toBe(true);
    expect(g.tile(spot)!.structure).toBeNull();
  });

  it('si cae el castillo se pierde la partida', () => {
    const g = new Game(42);
    g.state.castle.hp = 5;
    g.state.units = g.state.units.filter((u) => u.team === 'dawn');
    const hero = g.hero!;
    hero.q = KING_START.q - 2;
    hero.r = KING_START.r + 3;
    placeCreature(g, g.state.castle);
    g.endDay();
    expect(g.state.phase).toBe('lost');
    expect(g.state.endReason).toBe('castle');
  });

  it('las murallas tienen vida propia', () => {
    const g = new Game(42);
    rich(g);
    g.state.castle.level = 2;
    const wallSpot = g.buildSpots('wall')[0];
    g.build('wall', wallSpot);
    finishWorks(g);
    const t = g.tile(wallSpot) as Tile;
    expect(t.structure).toBe('wall');
    expect(t.shp).toBe(BALANCE.buildings.wall.hp);
  });

  it('el Faro del Alba da la victoria tras resistir', () => {
    const g = new Game(42);
    rich(g);
    g.state.castle.level = 4;
    g.hero!.hp = g.hero!.maxHp = 99999;
    g.build('beacon', g.buildSpots('beacon')[0]);
    for (let i = 0; i < 10 && g.state.phase === 'day'; i++) {
      g.state.units = g.state.units.filter((u) => u.team === 'dawn');
      g.endDay();
    }
    expect(g.state.phase).toBe('won');
    expect(g.state.endReason).toBe('beacon');
  });

  it('las criaturas nunca superan el tope', () => {
    const g = new Game(9001, 'hard');
    g.hero!.hp = g.hero!.maxHp = 99999;
    g.state.castle.hp = g.state.castle.maxHp = 99999;
    for (let i = 0; i < 40 && g.state.phase === 'day'; i++) {
      g.endDay();
      const n = g.team('night').filter((u) => u.kind === 'shade' || u.kind === 'brute').length;
      expect(n).toBeLessThanOrEqual(BALANCE.poi.maxCreatures);
    }
  });
});

describe('combate y exploración', () => {
  it('los arqueros atacan a distancia sin recibir contraataque', () => {
    const g = new Game(42);
    const archer = { id: 800, kind: 'archer' as const, team: 'dawn' as const, q: 0, r: 0, hp: 25, maxHp: 25, atk: 10 };
    const shade = { id: 801, kind: 'shade' as const, team: 'night' as const, q: 2, r: 0, hp: 30, maxHp: 30, atk: 8 };
    g.state.units.push(archer, shade);
    g.updateVision();
    const res = g.attack(archer.id, shade.id);
    expect(res.ok).toBe(true);
    expect(archer.hp).toBe(25);
    expect(shade.hp).toBeLessThan(30);
  });

  it('anexionar una aldea da habitantes, oro y territorio', () => {
    const g = new Game(42);
    const village = pois(g, 'village')[0];
    const hero = g.hero!;
    const from = neighbors(village).find((n) => {
      const t = g.tile(n);
      return t && g.moveCost(t) <= 1 && !g.unitAt(n);
    })!;
    hero.q = from.q;
    hero.r = from.r;
    const pop = g.state.population;
    expect(g.move(hero.id, village).ok).toBe(true);
    expect(g.state.population).toBe(pop + BALANCE.poi.village.settlers);
    expect(village.owned).toBe(true);
    const taxes = Math.floor(g.state.population / BALANCE.population.perGold);
    expect(g.economy().production.gold).toBe(BALANCE.poi.village.gold + taxes);
  });

  it('matar criaturas da renombre y sube de nivel al héroe', () => {
    const g = new Game(42);
    const hero = g.hero!;
    const atk0 = hero.atk;
    for (let i = 0; i < 2; i++) {
      const spot = neighbors(hero).find((n) => g.tile(n) && !g.unitAt(n) && g.tile(n)!.structure !== 'castle')!;
      g.state.units.push({ id: 500 + i, kind: 'shade', team: 'night', q: spot.q, r: spot.r, hp: 1, maxHp: 30, atk: 8 });
      g.state.hours = 5;
      g.updateVision();
      expect(g.attack(hero.id, 500 + i).ok).toBe(true);
    }
    expect(hero.level).toBe(2);
    expect(hero.atk).toBe(atk0 + BALANCE.hero.perLevel.atk);
  });

  it('guardar y cargar reproduce exactamente la partida', () => {
    const a = new Game(2024, 'hard');
    rich(a);
    a.build('farm', a.buildSpots('farm')[0]);
    a.endDay();
    const b = Game.fromSave(JSON.parse(JSON.stringify(a.serialize())));
    for (let i = 0; i < 6; i++) {
      a.endDay();
      b.endDay();
    }
    expect(JSON.stringify(b.serialize())).toBe(JSON.stringify(a.serialize()));
  });

  it('cada edificio tiene casillas válidas', () => {
    const g = new Game(42);
    rich(g);
    g.state.castle.level = 4;
    for (const k of Object.keys(BALANCE.buildings) as BuildingKind[]) {
      if (k === 'bridge') continue;
      expect(g.buildSpots(k).length, k).toBeGreaterThan(0);
    }
  });
});

describe('tormentas', () => {
  it('nunca derriban edificios ni tocan obras', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = new Game(seed);
      rich(g);
      g.state.units = g.state.units.filter((u) => u.team === 'dawn');
      g.build('farm', g.buildSpots('farm')[0]);
      for (let i = 0; i < 30; i++) {
        g.state.units = g.state.units.filter((u) => u.team === 'dawn');
        const res = g.endDay();
        if (res.ok) expect(res.events.some((e) => e.type === 'destroy')).toBe(false);
      }
      expect(g.hasBuilding('farm')).toBe(true);
    }
  });
});

describe('marcha nocturna', () => {
  it('el Rey despierto avanza hacia el castillo aunque haya bosques', () => {
    const g = new Game(1000);
    g.state.kingAwake = true;
    g.hero!.hp = g.hero!.maxHp = 99999;
    g.state.castle.hp = g.state.castle.maxHp = 99999;
    const king = g.king!;
    const d0 = distance(king, g.state.castle);
    for (let i = 0; i < 8; i++) {
      g.state.units = g.state.units.filter((u) => u.team === 'dawn' || u.kind === 'king');
      g.endDay();
    }
    expect(distance(g.king!, g.state.castle)).toBeLessThan(d0 - 2);
  });
});
