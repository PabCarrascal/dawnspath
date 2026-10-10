/**
 * Equilibrio de la campaña: `npm run sim [partidas]`.
 * Un bot juega el corte vertical entero con la IA de combate en ambos bandos.
 */
import { playCampaign } from './rules/bot';

declare const process: { argv: string[] };

// `npm run sim -- 200 guardias`: el bot deja guardias en el frente.
const games = Number(process.argv[2] ?? 200);
const guards = process.argv[3] === 'guardias';
const runs = Array.from({ length: games }, (_, i) => playCampaign(9000 + i * 7919, 80, { guards }));
const avg = (f: (r: (typeof runs)[number]) => number, xs = runs) => (xs.reduce((a, r) => a + f(r), 0) / Math.max(1, xs.length)).toFixed(1);
const won = runs.filter((r) => r.result === 'won');
const pct = (n: number) => `${((n / games) * 100).toFixed(0)}%`;

console.log(`\n── Campaña: ${games} campañas${guards ? ' · el bot deja guardias' : ''} ──`);
console.log(`victorias ${pct(won.length)} · derrotas ${pct(runs.filter((r) => r.result === 'lost').length)} · sin terminar ${pct(runs.filter((r) => r.result === 'timeout').length)}`);
console.log(`días ${avg((r) => r.day)} (al ganar ${avg((r) => r.day, won)}) · expediciones ${avg((r) => r.expeditions)} · combates ${avg((r) => r.battles)}`);
console.log(`muertes ${avg((r) => r.deaths)} · noches fuera ${avg((r) => r.nights)}`);
const lost = runs.filter((r) => r.result === 'lost');
const reasons: Record<string, number> = {};
for (const r of lost) reasons[r.reason ?? '?'] = (reasons[r.reason ?? '?'] ?? 0) + 1;
console.log(`derrotas por: ${Object.entries(reasons).map(([k, v]) => `${k} (${v})`).join(' · ')}`);
console.log(`nodos oscuros como máximo ${avg((r) => r.maxDark)}`);
console.log(`edificios al final: herrería ${avg((r) => r.buildings.smithy)} · taberna ${avg((r) => r.buildings.tavern)} · logia ${avg((r) => r.buildings.lodge)}`);
