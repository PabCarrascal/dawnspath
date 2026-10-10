import type { Campaign } from './Campaign';

/**
 * Hazañas: retos para volver a jugar. No dan recompensas que cambien el
 * equilibrio; solo se apuntan. Cada una se comprueba sobre el estado de la
 * campaña (las reglas llevan los contadores que hacen falta).
 */
export interface Feat {
  id: string;
  name: string;
  desc: string;
  done: (c: Campaign) => boolean;
}

const won = (c: Campaign) => c.state.phase === 'won';

export const FEATS: Feat[] = [
  { id: 'primera-luz', name: 'Primera luz', desc: 'Gana una campaña.', done: won },
  { id: 'nadie-atras', name: 'Nadie se queda atrás', desc: 'Gana sin perder a ningún soldado.', done: (c) => won(c) && c.state.stats.deaths === 0 },
  { id: 'alba-temprana', name: 'Alba temprana', desc: 'Gana antes del día 9.', done: (c) => won(c) && c.state.day <= 8 },
  { id: 'muralla-viva', name: 'Muralla viva', desc: 'Ten tres nodos en retaguardia a la vez.', done: (c) => (c.state.stats.maxShielded ?? 0) >= 3 },
  { id: 'a-sueldo', name: 'A sueldo', desc: 'Apuesta cinco centinelas en una campaña.', done: (c) => (c.state.stats.sentinels ?? 0) >= 5 },
  { id: 'no-todo-brilla', name: 'No todo lo que brilla', desc: 'Vence a un mímico.', done: (c) => (c.state.stats.mimics ?? 0) >= 1 },
  { id: 'fuego-purificador', name: 'Fuego purificador', desc: 'Destruye el Cubil de las Sombras.', done: (c) => !!c.node('cubil').destroyed },
  { id: 'puertas-aguantan', name: 'Las puertas aguantan', desc: 'Levanta un asedio al castillo.', done: (c) => (c.state.stats.siegesLifted ?? 0) >= 1 },
  { id: 'firme', name: 'Firme en la noche', desc: 'Que un soldado halle valor con el estrés al máximo.', done: (c) => (c.state.stats.virtues ?? 0) >= 1 },
  { id: 'a-rastras', name: 'A rastras', desc: 'Gana una campaña en la que el héroe cayó abatido.', done: (c) => won(c) && (c.state.stats.heroDowned ?? 0) >= 1 },
];

/** Hazañas que la campaña cumple ahora mismo. */
export function featsDone(c: Campaign) {
  return FEATS.filter((f) => f.done(c)).map((f) => f.id);
}
