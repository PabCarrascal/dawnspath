/**
 * Equilibrio de la campaña: `npm run sim [partidas]`.
 * Un bot juega el corte vertical entero con la IA de combate en ambos bandos.
 */
import { playCampaign } from './rules/bot';

declare const process: { argv: string[] };

const games = Number(process.argv[2] ?? 200);
const runs = Array.from({ length: games }, (_, i) => playCampaign(9000 + i * 7919));
const avg = (f: (r: (typeof runs)[number]) => number, xs = runs) => (xs.reduce((a, r) => a + f(r), 0) / Math.max(1, xs.length)).toFixed(1);
const won = runs.filter((r) => r.result === 'won');
const pct = (n: number) => `${((n / games) * 100).toFixed(0)}%`;

console.log(`\n── Corte vertical: ${games} campañas ──`);
console.log(`victorias ${pct(won.length)} · derrotas ${pct(runs.filter((r) => r.result === 'lost').length)} · sin terminar ${pct(runs.filter((r) => r.result === 'timeout').length)}`);
console.log(`días ${avg((r) => r.day)} (al ganar ${avg((r) => r.day, won)}) · expediciones ${avg((r) => r.expeditions)} · combates ${avg((r) => r.battles)}`);
console.log(`muertes ${avg((r) => r.deaths)} · noches fuera ${avg((r) => r.nights)}`);
console.log(`edificios al final: herrería ${avg((r) => r.buildings.smithy)} · taberna ${avg((r) => r.buildings.tavern)} · logia ${avg((r) => r.buildings.lodge)}`);
