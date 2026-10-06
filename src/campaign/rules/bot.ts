import { Combat } from '../../combat/rules/Combat';
import { autoplay } from '../../combat/rules/autoplay';
import { Campaign } from './Campaign';
import { BUILDINGS, CBAL, NODE } from './data';
import type { BuildingId, Soldier } from './types';

const RANK_ORDER: Record<string, number> = { hero: 0, spearman: 1, archer: 2, chaplain: 3 };

/** Siguiente paso del camino más corto entre dos nodos. */
export function nextStep(from: string, to: string): string | null {
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const n of NODE[cur].links) {
      if (prev.has(n)) continue;
      prev.set(n, cur);
      queue.push(n);
    }
  }
  if (!prev.has(to)) return null;
  let step = to;
  while (prev.get(step) !== from) {
    const p = prev.get(step);
    if (!p) return null;
    step = p;
  }
  return step;
}

export interface BotSummary {
  result: 'won' | 'lost' | 'timeout';
  day: number;
  expeditions: number;
  battles: number;
  deaths: number;
  nights: number;
  buildings: Record<BuildingId, number>;
}

/**
 * Bot sencillo que juega la campaña entera: prepara, sale, avanza hacia el
 * lugarteniente, saquea, acampa y vuelve cuando el grupo flaquea.
 */
export function playCampaign(seed: number, maxDays = 80): BotSummary {
  const c = new Campaign(seed);
  const s = c.state;
  for (let step = 0; step < 6000 && s.phase !== 'won' && s.phase !== 'lost' && s.day <= maxDays; step++) {
    if (s.phase === 'castle') castleTurn(c);
    else if (s.pending) {
      const combat = new Combat(c.encounter(), s.pending.seed);
      autoplay(combat);
      c.resolveCombat(combat);
    } else roadTurn(c);
  }
  return {
    result: s.phase === 'won' ? 'won' : s.phase === 'lost' ? 'lost' : 'timeout',
    day: s.day,
    expeditions: s.stats.expeditions,
    battles: s.stats.battles,
    deaths: s.stats.deaths,
    nights: s.stats.nights,
    buildings: { ...s.buildings },
  };
}

function castleTurn(c: Campaign) {
  const s = c.state;
  const home = () => s.soldiers.filter((x) => x.alive && x.where === 'castle');
  const reserve = 25;
  for (const x of home()) {
    if ((x.stress >= 35 || x.affliction) && s.stock.gold >= CBAL.treatCost + reserve) c.treat(x.id);
  }
  while (home().length < CBAL.partyMax && s.recruits.length) {
    const needChaplain = !home().some((x) => x.kind === 'chaplain');
    const i = Math.max(0, s.recruits.findIndex((r) => (needChaplain ? r.kind === 'chaplain' : true)));
    if (s.stock.gold < s.recruits[i].cost + reserve) break;
    c.recruit(i);
  }
  for (const b of ['smithy', 'lodge', 'tavern'] as BuildingId[]) {
    const cost = BUILDINGS[b].cost[s.buildings[b]];
    if (cost && s.stock.gold - (cost.gold ?? 0) >= reserve) c.upgrade(b);
  }
  if (c.hero.affliction || c.hero.stress >= 60) {
    c.rest();
    return;
  }
  const party = home()
    .sort((a, b) => (a.kind === 'hero' ? -1 : b.kind === 'hero' ? 1 : a.stress - b.stress))
    .slice(0, CBAL.partyMax)
    .sort((a, b) => RANK_ORDER[a.kind] - RANK_ORDER[b.kind]);
  const food = Math.min(CBAL.foodCap, party.length * 4) - s.stock.food;
  if (food > 0) c.buy('food', Math.min(food, Math.floor(s.stock.gold / CBAL.foodPrice)));
  if (s.stock.torches < 2 && s.stock.gold >= CBAL.torchPrice * 2) c.buy('torches', 2 - s.stock.torches);
  const r = c.depart(party.map((x) => x.id));
  if (!r.ok) {
    // Sin víveres ni oro: se espera a que la taberna y el tiempo hagan lo suyo (no debería pasar).
    s.phase = 'lost';
    s.endReason = r.reason;
  }
}

function weak(c: Campaign, x: Soldier) {
  return x.hp < c.maxHp(x) * 0.4 || x.stress >= 70 || !!x.affliction;
}

function roadTurn(c: Campaign) {
  const e = c.state.exp!;
  const here = c.node(e.node);
  const party = c.party;
  const goHome = e.node !== 'castle' && (party.some((x) => weak(c, x)) || e.food < party.length);
  const target = goHome ? 'castle' : 'torre';
  const step = nextStep(e.node, target)!;

  if (!goHome && !here.foes.length && !here.looted && Object.keys(NODE[e.node].loot).length && e.hours >= CBAL.lootHours) {
    if (c.loot().ok) return;
  }
  if (e.hours < c.travelCost(step)) {
    if (!here.structure && e.node !== 'castle') c.build('camp');
    c.camp();
    return;
  }
  c.move(step);
}
