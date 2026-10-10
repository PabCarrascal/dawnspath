import { Combat } from '../../combat/rules/Combat';
import { autoplay } from '../../combat/rules/autoplay';
import { Campaign } from './Campaign';
import { BUILDINGS, CBAL, NODE } from './data';
import { EVENT } from './events';
import { featsDone } from './feats';
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
  reason?: string;
  maxDark: number;
  day: number;
  expeditions: number;
  battles: number;
  deaths: number;
  nights: number;
  buildings: Record<BuildingId, number>;
  /** Hazañas conseguidas en la campaña. */
  feats: string[];
}

/** Estilo del bot. `guards`: deja guardias en los nodos que lindan con criaturas, para ir cerrando el frente. */
export interface BotStyle {
  guards?: boolean;
}

/**
 * Bot sencillo que juega la campaña entera: prepara, sale, avanza hacia el
 * lugarteniente, saquea, acampa y vuelve cuando el grupo flaquea.
 */
export function playCampaign(seed: number, maxDays = 80, style: BotStyle = {}): BotSummary {
  const c = new Campaign(seed);
  const s = c.state;
  let maxDark = 0;
  for (let step = 0; step < 6000 && s.phase !== 'won' && s.phase !== 'lost' && s.day <= maxDays; step++) {
    maxDark = Math.max(maxDark, Object.values(s.nodes).filter((n) => n.dark).length);
    if (s.phase === 'castle') castleTurn(c);
    else if (s.pending) {
      const combat = new Combat(c.encounter(), s.pending.seed);
      autoplay(combat);
      c.resolveCombat(combat);
    } else roadTurn(c, style);
  }
  return {
    result: s.phase === 'won' ? 'won' : s.phase === 'lost' ? 'lost' : 'timeout',
    reason: s.endReason,
    maxDark,
    day: s.day,
    expeditions: s.stats.expeditions,
    battles: s.stats.battles,
    deaths: s.stats.deaths,
    nights: s.stats.nights,
    buildings: { ...s.buildings },
    feats: featsDone(c),
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

function roadTurn(c: Campaign, style: BotStyle) {
  const st = c.state;
  // Sucesos: la primera opción que se pueda pagar.
  if (st.event) {
    const n = EVENT[st.event.id].choices.length;
    for (let i = 0; i < n; i++) if (!c.eventBlock(i)) return void c.choose(i);
    return;
  }
  const e = st.exp!;
  const here = c.node(e.node);
  const def = NODE[e.node];
  const party = c.party;

  // Aldea: víveres y su recluta. Ermita: rezar si hace falta.
  if (def.village && !here.foes.length) {
    const want = party.length * 3 - e.food;
    if (want > 0 && e.bag.gold >= c.villagePrice(e.node) && c.trade(Math.min(want, Math.floor(e.bag.gold / c.villagePrice(e.node)))).ok) return;
    if (!here.uses && party.length < CBAL.partyMax && e.bag.gold >= c.hireCost(e.node) && c.hire().ok) return;
  }
  if (def.type === 'shrine' && !here.foes.length && here.uses > 0 && e.hours >= CBAL.pray.hours) {
    if (party.some((x) => x.hp < c.maxHp(x) * 0.7 || x.stress >= 30 || x.affliction) && c.pray().ok) return;
  }

  const goHome = e.node !== 'castle' && (party.some((x) => weak(c, x)) || e.food < party.length);
  // Con el castillo asediado, primero hay que despejar sus puertas.
  const target = goHome ? 'castle' : st.siege !== null && c.node('prado').dark ? 'prado' : 'torre';
  const step = e.node === target ? NODE[e.node].links[0] : nextStep(e.node, target)!;

  if (!goHome && !here.foes.length && !here.looted && Object.keys(def.loot).length && e.hours >= CBAL.lootHours) {
    if (c.loot().ok) return;
  }
  // Frente: en un nodo que linda con criaturas, un centinela pagado (no resta al grupo)…
  const borders = def.links.some((l) => c.node(l).foes.length > 0 || c.node(l).dark);
  const open = style.guards && borders && !here.foes.length && !c.guards(e.node) && !def.village && e.node !== 'castle';
  if (open && e.bag.gold >= CBAL.sentinel.cost + 10 && (here.structure || c.build('camp').ok) && c.post().ok) return;
  // …o, de vuelta al castillo, alguien sano del grupo.
  if (open && goHome && party.length >= 3) {
    const guard = party.filter((x) => x.kind !== 'hero' && !weak(c, x) && x.hp >= c.maxHp(x) * 0.7).sort((a, b) => b.hp - a.hp)[0];
    if (guard && (here.structure || c.build('camp').ok) && c.garrison(guard.id).ok) return;
  }
  // Relevo: un herido del grupo se queda descansando de guardia y vuelve el que estaba.
  if (style.guards && here.garrison.length) {
    const tired = party.find((x) => x.kind !== 'hero' && weak(c, x));
    const fresh = here.garrison.map((id) => c.soldier(id)!).find((g) => !weak(c, g));
    if (tired && fresh && c.relieve(fresh.id, tired.id).ok) return;
  }
  if (e.hours < c.travelCost(step)) {
    if (!c.sheltered(e.node) && e.node !== 'castle') c.build('camp');
    c.camp();
    return;
  }
  c.move(step);
}
