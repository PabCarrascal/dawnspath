import { describe, expect, it } from 'vitest';
import { Combat } from '../../combat/rules/Combat';
import { autoplay } from '../../combat/rules/autoplay';
import { playCampaign } from './bot';
import { Campaign } from './Campaign';
import { CBAL } from './data';

/** Campaña recién empezada con víveres y el grupo inicial en la puerta. */
function departed(seed = 1) {
  const c = new Campaign(seed);
  c.buy('food', 9);
  c.buy('torches', 1);
  const ids = c.state.soldiers.map((s) => s.id);
  expect(c.depart(ids).ok).toBe(true);
  return c;
}

/** Gana el combate pendiente dejando a todas las criaturas muertas. */
function winPending(c: Campaign) {
  const combat = new Combat(c.encounter(), c.state.pending!.seed);
  combat.start();
  for (const f of combat.state.fighters) if (f.side === 'foe') f.alive = false;
  combat.state.phase = 'won';
  return c.resolveCombat(combat);
}

describe('campaña: castillo', () => {
  it('empieza con el héroe, un lancero y una arquera', () => {
    const c = new Campaign(1);
    expect(c.state.soldiers.map((s) => s.kind)).toEqual(['hero', 'spearman', 'archer']);
    expect(c.state.phase).toBe('castle');
    expect(c.state.recruits.some((r) => r.kind === 'chaplain')).toBe(true);
  });

  it('mejora edificios pagando sus costes', () => {
    const c = new Campaign(1);
    c.state.stock.materials = 10;
    const gold = c.state.stock.gold;
    expect(c.upgrade('smithy').ok).toBe(true);
    expect(c.state.buildings.smithy).toBe(1);
    expect(c.state.stock.gold).toBe(gold - 40);
    expect(c.bonus(c.hero).dmg).toBe(1);
    expect(c.upgrade('smithy').ok).toBe(false);
  });

  it('el héroe encabeza cada expedición', () => {
    const c = new Campaign(1);
    const [hero, spear] = c.state.soldiers;
    expect(c.depart([spear.id]).ok).toBe(false);
    expect(c.depart([hero.id]).ok).toBe(true);
    expect(c.state.exp!.bag.materials).toBe(6);
    expect(c.state.stock.materials).toBe(0);
  });
});

describe('campaña: expedición', () => {
  it('moverse gasta horas y un nodo con criaturas obliga a combatir', () => {
    const c = departed();
    const r = c.move('prado');
    expect(r.ok && r.combat?.kind).toBe('node');
    expect(c.state.exp!.hours).toBe(CBAL.maxHours - 2);
    expect(c.move('bosque').ok).toBe(false);
  });

  it('ganar limpia el nodo, da oro y experiencia', () => {
    const c = departed();
    c.move('prado');
    const r = winPending(c);
    expect(r.ok).toBe(true);
    expect(c.status('prado')).toBe('cleared');
    expect(c.state.exp!.bag.gold).toBe(2 * CBAL.goldPerFoe);
    expect(c.hero.xp).toBe(1);
  });

  it('las heridas y el estrés del combate vuelven a los soldados', () => {
    const c = departed();
    c.move('prado');
    const combat = new Combat(c.encounter(), c.state.pending!.seed);
    autoplay(combat);
    c.resolveCombat(combat);
    for (const f of combat.state.fighters.filter((x) => x.side === 'party' && x.alive)) {
      const s = c.soldier(f.ref!)!;
      expect(s.stress).toBe(f.stress);
      expect(s.hp).toBe(Math.max(1, f.hp));
    }
  });

  it('el héroe abatido se retira con el grupo en vez de morir', () => {
    const c = departed();
    c.move('prado');
    const combat = new Combat(c.encounter(), 3);
    combat.start();
    const hero = combat.state.fighters.find((f) => f.kind === 'hero')!;
    hero.hp = 0;
    hero.deathsDoor = true;
    // Forzamos el golpe mortal desde fuera del flujo normal.
    (combat as unknown as { fatal: (f: unknown, e: unknown[]) => void }).fatal(hero, []);
    expect(hero.alive).toBe(true);
    expect(combat.state.phase).toBe('fled');
    c.resolveCombat(combat);
    expect(c.hero.alive).toBe(true);
    expect(c.state.phase).toBe('castle');
  });

  it('saquear, construir y dejar guardia', () => {
    const c = departed();
    c.move('prado');
    winPending(c);
    expect(c.loot().ok).toBe(true);
    expect(c.loot().ok).toBe(false);
    expect(c.build('tower').ok).toBe(false);
    expect(c.build('camp').ok).toBe(true);
    const spear = c.party.find((s) => s.kind === 'spearman')!;
    expect(c.garrison(c.hero.id).ok).toBe(false);
    expect(c.garrison(spear.id).ok).toBe(true);
    expect(c.status('prado')).toBe('secured');
    expect(c.travelCost('prado')).toBe(CBAL.securedTravel);
    expect(c.recall(spear.id).ok).toBe(true);
  });

  it('explorar revela los nodos vecinos', () => {
    const c = departed();
    c.move('prado');
    winPending(c);
    expect(c.status('bosque')).toBe('unknown');
    const r = c.scout();
    expect(r.ok).toBe(true);
    // El aviso no cuenta qué hay: eso se ve en el mapa.
    expect(r.ok && r.log.map((l) => l.text)).toEqual(['Se han explorado los territorios cercanos.']);
    expect(c.status('bosque')).toBe('hostile');
    expect(c.status('ruinas')).toBe('hostile');
  });

  it('acampar consume víveres y empieza un nuevo día', () => {
    const c = departed(5);
    c.move('prado');
    winPending(c);
    const food = c.state.exp!.food;
    const day = c.state.day;
    const r = c.camp();
    expect(r.ok).toBe(true);
    if (r.ok && r.combat) winPending(c);
    expect(c.state.exp!.food).toBeLessThan(food);
    expect(c.state.day).toBe(day + 1);
    // Al raso: menos horas de luz al día siguiente.
    expect(c.state.exp!.hours).toBe(CBAL.maxHours - CBAL.roughNightHours);
  });

  it('volver al castillo descarga la caravana y cura', () => {
    const c = departed();
    c.move('prado');
    winPending(c);
    c.loot();
    const bag = { ...c.state.exp!.bag };
    c.hero.hp = 3;
    const r = c.move('castle');
    expect(r.ok).toBe(true);
    expect(c.state.phase).toBe('castle');
    expect(c.state.stock.gold).toBeGreaterThanOrEqual(bag.gold);
    expect(c.hero.hp).toBe(c.maxHp(c.hero));
  });

  it('se puede guardar y cargar a mitad de expedición', () => {
    const c = departed(9);
    c.move('prado');
    const saved = JSON.parse(JSON.stringify(c.state));
    const d = new Campaign(0, saved);
    expect(d.state.pending?.seed).toBe(c.state.pending?.seed);
    winPending(c);
    winPending(d);
    expect(c.camp()).toEqual(d.camp());
  });

  it('vencer al lugarteniente gana el corte vertical', () => {
    const c = departed();
    for (const n of ['prado', 'bosque', 'ermita', 'paso', 'torre']) {
      c.state.exp!.hours = 99;
      c.move(n);
      if (c.state.event) c.choose(c.eventBlock(0) ? 1 : 0);
      if (c.state.pending) winPending(c);
      c.state.event = null;
    }
    expect(c.state.phase).toBe('won');
  });
});

/** Pasa días en el castillo (sin expedición). */
function waitDays(c: Campaign, n: number) {
  for (let i = 0; i < n && c.state.phase === 'castle'; i++) {
    c.state.report = null;
    c.rest();
  }
}

describe('campaña: oscuridad', () => {
  it('empieza en la torre y el cubil, y avanza a sus vecinos', () => {
    const c = new Campaign(1);
    const dark = () => Object.entries(c.state.nodes).filter(([, n]) => n.dark).map(([id]) => id).sort();
    expect(dark()).toEqual(['cubil', 'torre']);
    expect(c.darkFrontier().sort()).toEqual(['marjal', 'molino', 'paso', 'ruinas']);
    waitDays(c, CBAL.darkEvery);
    expect(dark()).toEqual(['cubil', 'marjal', 'molino', 'paso', 'ruinas', 'torre']);
    // Un nodo limpio que se oscurece vuelve a tener criaturas.
    expect(c.node('ruinas').foes.length).toBeGreaterThan(0);
  });

  it('si llega a las puertas, el castillo cae tras el asedio', () => {
    const c = new Campaign(1);
    c.state.nodes.prado.dark = true;
    c.state.darkClock = 99;
    waitDays(c, 1);
    expect(c.state.siege).toBe(CBAL.siegeDays);
    waitDays(c, CBAL.siegeDays);
    expect(c.state.phase).toBe('lost');
  });

  it('limpiar un nodo oscuro devuelve la luz y levanta el asedio', () => {
    const c = departed();
    c.state.nodes.prado.dark = true;
    c.state.siege = 2;
    const r = c.move('prado');
    expect(r.ok && r.combat?.night).toBe(true);
    winPending(c);
    expect(c.node('prado').dark).toBe(false);
  });

  it('destruir el cubil hace retroceder la oscuridad', () => {
    const c = departed();
    c.state.nodes.ruinas.dark = true;
    c.state.exp!.node = 'ruinas';
    c.state.nodes.ruinas.foes = [];
    const clock = c.state.darkClock;
    c.move('cubil');
    winPending(c);
    expect(c.node('cubil').destroyed).toBe(true);
    expect(c.node('cubil').dark).toBe(false);
    expect(c.node('ruinas').dark).toBe(false);
    expect(c.state.darkClock).toBe(clock + CBAL.darkEvery);
    expect(c.darkFrontier()).not.toContain('cubil');
  });

  it('una guarnición puede contener a la oscuridad', () => {
    let held = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const c = departed(seed);
      const guard = c.party[1];
      Object.assign(c.state.nodes.ruinas, { seen: true, foes: [], everCleared: true, structure: 'tower', garrison: [guard.id] });
      Object.assign(guard, { where: 'garrison', post: 'ruinas' });
      c.state.exp!.party = c.state.exp!.party.filter((id) => id !== guard.id);
      Object.assign(c.state.nodes.prado, { foes: [], everCleared: true });
      c.state.exp!.node = 'prado';
      c.state.darkClock = 1;
      c.camp();
      if (c.state.pending) winPending(c);
      if (!c.node('ruinas').dark) held++;
    }
    expect(held).toBeGreaterThan(5);
  });
});

describe('campaña: aldeas, ermitas y sucesos', () => {
  it('la aldea vende víveres, da cobijo y ofrece un recluta', () => {
    const c = departed();
    c.move('prado');
    winPending(c);
    c.state.exp!.bag.gold = 100;
    c.move('robledal');
    expect(c.state.event?.id).toBe('aldea');
    expect(c.move('prado').ok).toBe(false);
    c.choose(1);
    expect(c.sheltered('robledal')).toBe(true);
    const food = c.state.exp!.food;
    expect(c.trade(2).ok).toBe(true);
    expect(c.state.exp!.food).toBe(food + 2);
    expect(c.hire().ok).toBe(true);
    expect(c.party.length).toBe(4);
    expect(c.hire().ok).toBe(false);
  });

  it('en la ermita se reza un número limitado de veces', () => {
    const c = departed();
    Object.assign(c.state.nodes.ermita, { seen: true, foes: [], everCleared: true, visited: true });
    c.state.exp!.node = 'ermita';
    c.hero.stress = 50;
    c.hero.affliction = 'temeroso';
    expect(c.pray().ok).toBe(true);
    expect(c.hero.stress).toBe(50 + CBAL.pray.stress);
    expect(c.hero.affliction).toBeNull();
    expect(c.pray().ok).toBe(true);
    expect(c.pray().ok).toBe(false);
  });

  it('los sucesos bloquean opciones que no se pueden pagar', () => {
    const c = departed();
    c.state.event = { id: 'mercader', node: 'castle' };
    c.state.exp!.bag.gold = 0;
    expect(c.eventBlock(0)).not.toBeNull();
    expect(c.choose(0).ok).toBe(false);
    expect(c.choose(2).ok).toBe(true);
    expect(c.state.event).toBeNull();
  });
});

describe('campaña: bot (sigue)', () => {
  it('cada campaña acaba en victoria o derrota', () => {
    for (let seed = 100; seed < 110; seed++) expect(['won', 'lost']).toContain(playCampaign(seed).result);
  });
});

describe('campaña: bot', () => {
  it('juega campañas enteras hasta el final', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const r = playCampaign(seed);
      expect(['won', 'lost']).toContain(r.result);
    }
  });
});
