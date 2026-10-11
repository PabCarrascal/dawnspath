/**
 * Vuelca a tools/blender/scenes/map.json lo que la escena del mapa necesita del juego:
 * nodos, caminos, río y zonas de la cartela. Lo lanza run.sh antes de renderizar el mapa;
 * solo reescribe el archivo si algo ha cambiado (así el PNG no se rehace sin motivo).
 *
 *   npx vite-node tools/blender/export-map.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { MAP } from '../../src/campaign/rules/data';
import { LABELS, MAP_H, MAP_W, RIVER, roadControl } from '../../src/campaign/view/MapView';

const roads: { a: string; b: string; c: { x: number; y: number } }[] = [];
const seen = new Set<string>();
for (const n of MAP) {
  for (const l of n.links) {
    const key = [n.id, l].sort().join('-');
    if (seen.has(key)) continue;
    seen.add(key);
    const m = MAP.find((x) => x.id === l)!;
    roads.push({ a: n.id, b: l, c: roadControl(n, m) });
  }
}
const data = {
  w: MAP_W,
  h: MAP_H,
  nodes: MAP.map((n) => ({ id: n.id, type: n.type, x: n.x, y: n.y, boss: !!n.boss })),
  roads,
  river: RIVER,
  labels: LABELS,
};
const out = new URL('./scenes/map.json', import.meta.url).pathname;
const text = JSON.stringify(data, null, 1) + '\n';
if (!existsSync(out) || readFileSync(out, 'utf8') !== text) {
  writeFileSync(out, text);
  console.log(`mapa: ${out}`);
}
