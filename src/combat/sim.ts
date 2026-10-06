/**
 * Equilibrio del combate: `npm run sim:combat [combates]`.
 * La IA juega ambos bandos; mide victorias, duración, bajas y estrés.
 */
import { Combat } from './rules/Combat';
import { ENCOUNTERS } from './rules/data';

declare const process: { argv: string[] };

const games = Number(process.argv[2] ?? 300);
const pct = (n: number) => `${((n / games) * 100).toFixed(0)}%`;

for (const enc of ENCOUNTERS) {
  let won = 0;
  let rounds = 0;
  let deaths = 0;
  let doors = 0;
  let afflicted = 0;
  let virtues = 0;
  let stress = 0;
  let hpLeft = 0;
  for (let i = 0; i < games; i++) {
    const c = new Combat(enc, 5000 + i * 7919);
    const events = [...c.start()];
    for (let step = 0; step < 400 && c.state.phase === 'player'; step++) {
      const o = c.choose(c.active!);
      const r = o ? c.act(o.skill, o.target) : c.retreat();
      if (r.ok) events.push(...r.events);
    }
    if (c.state.phase === 'won') won++;
    rounds += c.state.round;
    const party = c.state.fighters.filter((f) => f.side === 'party');
    deaths += party.filter((f) => !f.alive).length;
    doors += events.filter((e) => e.type === 'deathsDoor').length;
    afflicted += events.filter((e) => e.type === 'resolve' && e.result !== 'virtue').length;
    virtues += events.filter((e) => e.type === 'resolve' && e.result === 'virtue').length;
    stress += party.reduce((a, f) => a + f.stress, 0) / party.length;
    hpLeft += party.filter((f) => f.alive).reduce((a, f) => a + f.hp / f.maxHp, 0) / party.length;
  }
  console.log(`\n── ${enc.name} (${enc.party.length} contra ${enc.foes.length}${enc.night ? ', de noche' : ''}) ──`);
  console.log(`victorias ${pct(won)} · rondas ${(rounds / games).toFixed(1)} · bajas por combate ${(deaths / games).toFixed(2)}`);
  console.log(`puertas de la muerte ${(doors / games).toFixed(2)} · aflicciones ${(afflicted / games).toFixed(2)} · virtudes ${(virtues / games).toFixed(2)}`);
  console.log(`estrés final medio ${(stress / games).toFixed(0)} · vida restante del grupo ${((hpLeft / games) * 100).toFixed(0)}%`);
}
