import { describe, expect, it } from 'vitest';
import { Combat } from './Combat';
import { ENCOUNTERS, MOVE_SKILL } from './data';
import { autoplay } from './autoplay';

const party = (c: Combat) => c.alive('party');
const foes = (c: Combat) => c.alive('foe');

describe('combate por turnos', () => {
  it('coloca a cada bando en sus posiciones', () => {
    const c = new Combat('patrol', 1);
    expect(party(c).map((f) => f.kind)).toEqual(['hero', 'spearman', 'archer']);
    expect(party(c).map((f) => f.rank)).toEqual([1, 2, 3]);
    expect(foes(c).map((f) => f.kind)).toEqual(['brute', 'shade', 'stalker']);
  });

  it('es determinista por semilla', () => {
    const a = JSON.stringify(autoplay(new Combat('patrol', 77)));
    const b = JSON.stringify(autoplay(new Combat('patrol', 77)));
    expect(a).toBe(b);
  });

  it.each(ENCOUNTERS.map((e) => e.id))('el encuentro %s siempre termina', (id) => {
    for (let seed = 1; seed <= 20; seed++) {
      const c = new Combat(id, seed);
      autoplay(c);
      expect(['won', 'lost', 'fled']).toContain(c.state.phase);
    }
  });

  it('las habilidades dependen de la posición', () => {
    const c = new Combat('patrol', 3);
    const archer = party(c).find((f) => f.kind === 'archer')!;
    // Desde la 3 puede usar la flecha marcadora; desde la 1 no podría.
    expect(c.skillsOf(archer.id).find((s) => s.skill.id === 'markShot')!.usable).toBe(true);
    archer.rank = 1;
    expect(c.skillsOf(archer.id).find((s) => s.skill.id === 'markShot')!.usable).toBe(false);
  });

  it('el lancero no alcanza la tercera fila enemiga', () => {
    const c = new Combat('patrol', 3);
    const spear = party(c).find((f) => f.kind === 'spearman')!;
    const reach = c.targets(spear.id, 'thrust').map((id) => c.fighter(id)!.rank);
    expect(reach.every((r) => r <= 2)).toBe(true);
  });

  it('a las puertas de la muerte el siguiente golpe puede matar', () => {
    let died = false;
    let resisted = false;
    for (let seed = 1; seed <= 40 && !(died && resisted); seed++) {
      const c = new Combat('skirmish', seed);
      const events = autoplay(c);
      if (events.some((e) => e.type === 'deathsDoor')) {
        died ||= events.some((e) => e.type === 'death' && c.fighter(e.target)!.side === 'party');
        resisted ||= events.some((e) => e.type === 'resist');
      }
    }
    expect(died).toBe(true);
    expect(resisted).toBe(true);
  });

  it('el estrés llega a poner a prueba el temple', () => {
    let tested = false;
    for (let seed = 1; seed <= 60 && !tested; seed++) {
      const events = autoplay(new Combat('ambush', seed));
      tested = events.some((e) => e.type === 'resolve');
    }
    expect(tested).toBe(true);
  });

  it('cambiar de puesto intercambia posiciones con un compañero contiguo', () => {
    const c = new Combat('patrol', 5);
    c.start();
    // Fuerza el turno del lancero para probar el movimiento.
    const spear = party(c).find((f) => f.kind === 'spearman')!;
    c.state.active = spear.id;
    c.state.phase = 'player';
    const hero = party(c).find((f) => f.kind === 'hero')!;
    expect(c.targets(spear.id, MOVE_SKILL)).toContain(hero.id);
    const res = c.act(MOVE_SKILL, hero.id);
    expect(res.ok).toBe(true);
    if (spear.alive && hero.alive) {
      expect(spear.rank).toBe(1);
      expect(hero.rank).toBe(2);
    }
  });

  it('al morir una unidad, las de detrás avanzan', () => {
    const c = new Combat('patrol', 9);
    const events = autoplay(c);
    const foeDeath = events.findIndex((e) => e.type === 'death' && c.fighter(e.target)!.side === 'foe');
    if (foeDeath >= 0) expect(events.slice(foeDeath).some((e) => e.type === 'ranks')).toBe(true);
  });
});
