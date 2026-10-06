/**
 * Simulación de equilibrio: `npm run sim [partidas] [dificultad]`.
 * Juega partidas completas con el bot y resume resultados.
 */
import { Game } from '../game/Game';
import { SimResult, simulate } from './bot';

declare const process: { argv: string[] };

const games = Number(process.argv[2] ?? 60);
const diffs = (process.argv[3] ? [process.argv[3]] : ['easy', 'normal', 'hard']) as ('easy' | 'normal' | 'hard')[];

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmt = (n: number) => (Number.isNaN(n) ? '—' : n.toFixed(1));

for (const diff of diffs) {
  const results: SimResult[] = [];
  for (let i = 0; i < games; i++) results.push(await simulate(Game, 1000 + i * 7919, diff));
  const wins = results.filter((r) => r.victory);
  const by = (reason: string) => results.filter((r) => r.reason === reason).length;
  const lvlDay = (lvl: number) => avg(results.map((r) => r.levelDays[lvl - 2]).filter((d) => d !== undefined));
  console.log(`\n── ${diff} (${games} partidas) ──`);
  console.log(`victorias ${((wins.length / games) * 100).toFixed(0)}%  · faro ${by('beacon')} · rey ${by('king')} · cae héroe ${by('hero')} · cae castillo ${by('castle')} · sin terminar ${by('timeout')}`);
  console.log(`día final medio ${fmt(avg(results.map((r) => r.day)))} · victoria media día ${fmt(avg(wins.map((r) => r.day)))}`);
  console.log(`castillo: nivel 2 el día ${fmt(lvlDay(2))} · nivel 3 el día ${fmt(lvlDay(3))} · nivel 4 el día ${fmt(lvlDay(4))}`);
  console.log(`edificios destruidos ${fmt(avg(results.map((r) => r.destroyed)))} · vida mínima del castillo ${fmt(avg(results.map((r) => r.minCastle * 100)))}% · criaturas abatidas ${fmt(avg(results.map((r) => r.creaturesKilled)))}`);
  console.log(`ejército final ${fmt(avg(results.map((r) => r.army)))} · nivel del héroe ${fmt(avg(results.map((r) => r.heroLevel)))}`);
}
