import type { Combat } from './Combat';
import type { CombatEvent } from './types';

/** Juega un combate entero con la IA en ambos bandos (tests, simulador y bot de campaña). */
export function autoplay(c: Combat, maxSteps = 400): CombatEvent[] {
  const all = [...c.start()];
  for (let i = 0; i < maxSteps && c.state.phase === 'player'; i++) {
    const o = c.choose(c.active!);
    const res = o ? c.act(o.skill, o.target) : c.retreat();
    if (res.ok) all.push(...res.events);
  }
  return all;
}
