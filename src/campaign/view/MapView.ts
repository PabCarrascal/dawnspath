import { Rng } from '../../core/rng';
import type { Campaign } from '../rules/Campaign';
import { MAP, NODE, STRUCTURES } from '../rules/data';
import type { NodeStatus, NodeType } from '../rules/types';

export const MAP_W = 1000;
export const MAP_H = 620;

const STATUS_LABEL: Record<NodeStatus, string> = {
  unknown: 'Desconocido',
  hostile: 'Hostil',
  lost: 'Perdido',
  cleared: 'Limpio',
  secured: 'Asegurado',
  castle: 'Tu castillo',
};

/** Glifos de tinta para cada tipo de nodo, centrados en (0, 0). */
const GLYPH: Record<NodeType, string> = {
  castle: '<path d="M-22 14 V-8 H-14 V-14 H-8 V-8 H-3 V-22 H3 V-8 H8 V-14 H14 V-8 H22 V14 Z" /><path d="M-4 14 V4 A4 4 0 0 1 4 4 V14" class="hole"/>',
  meadow: '<path d="M-18 10 q4 -14 6 0 M-6 10 q3 -18 6 0 M8 10 q4 -12 6 0 M-22 12 H22" />',
  forest: '<path d="M-14 12 L-6 -10 L2 12 Z M0 12 L8 -16 L16 12 Z M-22 12 L-16 -2 L-10 12 Z" />',
  ruins: '<path d="M-18 12 V-8 H-12 V12 M10 12 V-2 H16 V12 M-18 -8 Q-4 -24 10 -4" /><path d="M-24 12 H22" />',
  ford: '<path d="M-22 -4 q6 -6 11 0 t11 0 t11 0 t11 0 M-22 6 q6 -6 11 0 t11 0 t11 0 t11 0" />',
  lair: '<path d="M-10 14 L-8 -12 L-4 -4 L0 -24 L4 -4 L8 -12 L10 14 Z" /><circle cx="0" cy="2" r="3" class="eye"/>',
  village: '<path d="M-20 12 V-2 L-11 -10 L-2 -2 V12 M2 12 V-6 L11 -16 L20 -6 V12 M-24 12 H24" /><path d="M8 4 h5 v5 h-5 Z" class="hole"/>',
  shrine: '<path d="M-14 12 V-4 L0 -16 L14 -4 V12 Z M0 -16 V-26 M-5 -22 H5" /><path d="M-3 12 V4 Q0 -2 3 4 V12" class="hole"/>',
  mountain: '<path d="M-24 12 L-10 -12 L-3 -2 L6 -20 L24 12 Z M6 -20 L2 -8 M-10 -12 L-13 -2" />',
  den: '<path d="M-22 12 Q-18 -16 0 -16 Q18 -16 22 12 Z" /><path d="M-10 12 Q-8 -4 0 -4 Q8 -4 10 12 Z" class="hole"/><circle cx="-3" cy="5" r="1.8" class="eye"/><circle cx="3" cy="5" r="1.8" class="eye"/>',
  bog: '<path d="M-22 8 q5 -4 10 0 t10 0 t10 0 t10 0 M-14 8 V-10 M-10 8 V-14 M12 8 V-8 M16 8 V-12" />',
};

/** Punto de control de cada camino: algo curvo, como trazado a mano. */
function roadControl(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2 + (b.y - a.y) * 0.08, y: (a.y + b.y) / 2 - (b.x - a.x) * 0.08 };
}

/** Puntos de nodos y caminos: el decorado los esquiva para no tapar nada. */
function busyPoints() {
  const pts: { x: number; y: number; r: number }[] = MAP.map((n) => ({ x: n.x, y: n.y, r: 62 }));
  for (const n of MAP) {
    for (const l of n.links) {
      const m = NODE[l];
      const c = roadControl(n, m);
      for (let t = 0; t <= 1; t += 0.05) {
        const u = 1 - t;
        pts.push({ x: u * u * n.x + 2 * u * t * c.x + t * t * m.x, y: u * u * n.y + 2 * u * t * c.y + t * t * m.y, r: 16 });
      }
    }
  }
  // La cartela del título y la rosa de los vientos
  pts.push({ x: 170, y: 585, r: 60 }, { x: 290, y: 585, r: 40 }, { x: 920, y: 548, r: 70 });
  return pts;
}

/**
 * Mapa ilustrado sobre pergamino: aguadas de color por regiones (prados,
 * bosques, cordilleras, marjal, tierras de la noche), cordilleras con cara
 * iluminada y nieve, arboledas, el río con sus orillas, campos de labor junto
 * a las aldeas, charcas, rosa de los vientos y cartela. El decorado esquiva
 * nodos y caminos.
 */
function paintParchment(seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = MAP_W * 2;
  c.height = MAP_H * 2;
  const ctx = c.getContext('2d')!;
  ctx.scale(2, 2);
  const rng = new Rng(seed);
  const busy = busyPoints();
  const free = (x: number, y: number, pad = 0) => busy.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 > (p.r + pad) ** 2);

  // ── Pergamino ──
  const base = ctx.createRadialGradient(MAP_W / 2, MAP_H / 2, 80, MAP_W / 2, MAP_H / 2, MAP_W * 0.62);
  base.addColorStop(0, '#ecdcb2');
  base.addColorStop(0.7, '#d6bf8c');
  base.addColorStop(1, '#9a7a48');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  for (let i = 0; i < 90; i++) {
    const x = rng.next() * MAP_W;
    const y = rng.next() * MAP_H;
    const r = 10 + rng.next() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(110, 80, 40, ${0.03 + rng.next() * 0.06})`);
    g.addColorStop(1, 'rgba(110, 80, 40, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // ── Aguadas de color: manchas suaves superpuestas, como acuarela ──
  const wash = (cx: number, cy: number, rx: number, ry: number, rgb: string, alpha: number, blobs = 14) => {
    for (let i = 0; i < blobs; i++) {
      const x = cx + (rng.next() - 0.5) * rx * 1.6;
      const y = cy + (rng.next() - 0.5) * ry * 1.6;
      const r = Math.min(rx, ry) * (0.45 + rng.next() * 0.5);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
      g.addColorStop(0.7, `rgba(${rgb}, ${alpha * 0.5})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  };
  wash(220, 470, 170, 120, '150, 175, 95', 0.22); // prados del castillo
  wash(330, 290, 190, 130, '80, 125, 70', 0.26); // bosques de Robledal y Bosque Hondo
  wash(470, 520, 120, 80, '170, 150, 110', 0.2); // tierras secas de las ruinas
  wash(760, 110, 260, 110, '120, 125, 145', 0.26); // cordillera del norte
  wash(140, 110, 150, 90, '120, 125, 145', 0.2); // sierra del noroeste
  wash(890, 400, 110, 90, '95, 115, 75', 0.3); // Marjal Negro
  wash(890, 170, 90, 80, '90, 55, 105', 0.22); // tierras del Heraldo
  wash(600, 560, 80, 60, '90, 55, 105', 0.18); // el cubil

  const INK = 'rgba(40, 26, 14, 0.8)';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // ── Río: aguada azul, agua más clara al centro y las dos orillas en tinta ──
  const river = () => {
    ctx.beginPath();
    ctx.moveTo(680, -10);
    ctx.bezierCurveTo(640, 120, 700, 260, 605, 385);
    ctx.bezierCurveTo(540, 470, 680, 540, 650, 640);
  };
  river();
  ctx.strokeStyle = 'rgba(80, 125, 150, 0.35)';
  ctx.lineWidth = 22;
  ctx.stroke();
  river();
  ctx.strokeStyle = 'rgba(120, 170, 195, 0.55)';
  ctx.lineWidth = 11;
  ctx.stroke();
  for (const off of [-7, 7]) {
    ctx.save();
    ctx.translate(off, 0);
    river();
    ctx.strokeStyle = 'rgba(40, 50, 60, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }
  // Ondas en el agua
  ctx.strokeStyle = 'rgba(240, 248, 255, 0.6)';
  ctx.lineWidth = 1;
  const bez = (p: number[], t: number) => (1 - t) ** 3 * p[0] + 3 * (1 - t) ** 2 * t * p[1] + 3 * (1 - t) * t * t * p[2] + t ** 3 * p[3];
  const legs = [
    [[680, 640, 700, 605], [-10, 120, 260, 385]],
    [[605, 540, 680, 650], [385, 470, 540, 640]],
  ];
  for (const [xs, ys] of legs) for (let t = 0.08; t < 1; t += 0.16) {
    const x = bez(xs, t);
    const y = bez(ys, t);
    ctx.beginPath();
    ctx.moveTo(x - 3, y);
    ctx.quadraticCurveTo(x, y - 2, x + 3, y);
    ctx.stroke();
  }

  // ── Cordilleras: cara al sol clara, cara en sombra rayada, nieve en las altas ──
  const mountain = (x: number, y: number, s: number, snow: boolean) => {
    const h = 34 * s;
    const w = 26 * s;
    const peak = { x: x + (rng.next() - 0.5) * 6 * s, y: y - h };
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.lineTo(peak.x, peak.y);
    ctx.lineTo(peak.x + 2 * s, y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(226, 212, 184, 0.95)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(peak.x, peak.y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(peak.x + 2 * s, y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(128, 118, 128, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(40, 30, 30, 0.45)';
    ctx.lineWidth = 0.8;
    for (let k = 1; k < 5; k++) {
      ctx.beginPath();
      ctx.moveTo(peak.x + k * 0.18 * w, peak.y + k * 0.2 * h);
      ctx.lineTo(peak.x + k * 0.12 * w, y);
      ctx.stroke();
    }
    if (snow) {
      ctx.beginPath();
      ctx.moveTo(peak.x, peak.y);
      ctx.lineTo(peak.x - w * 0.32, peak.y + h * 0.3);
      ctx.lineTo(peak.x - w * 0.12, peak.y + h * 0.24);
      ctx.lineTo(peak.x + w * 0.05, peak.y + h * 0.34);
      ctx.lineTo(peak.x + w * 0.3, peak.y + h * 0.3);
      ctx.closePath();
      ctx.fillStyle = 'rgba(252, 252, 255, 0.95)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.lineTo(peak.x, peak.y);
    ctx.lineTo(x + w, y);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };
  const range = (x0: number, x1: number, y0: number, y1: number, n: number, sMin: number, sMax: number, snowAbove: number) => {
    const peaks: [number, number, number][] = [];
    for (let i = 0; i < n * 6 && peaks.length < n; i++) {
      const x = x0 + rng.next() * (x1 - x0);
      const y = y0 + rng.next() * (y1 - y0);
      const s = sMin + rng.next() * (sMax - sMin);
      if (free(x, y - 15 * s, 8)) peaks.push([x, y, s]);
    }
    // De atrás adelante, para que las de delante tapen a las de detrás.
    for (const [x, y, s] of peaks.sort((a, b) => a[1] - b[1])) mountain(x, y, s, s > snowAbove);
  };
  range(470, 990, 40, 140, 30, 0.7, 1.5, 1.05);
  range(20, 320, 50, 160, 12, 0.6, 1.1, 0.95);
  range(640, 860, 300, 330, 4, 0.5, 0.7, 2);

  // ── Arboledas: frondosos y pinos con su sombra ──
  const leafy = (x: number, y: number, s: number) => {
    ctx.fillStyle = 'rgba(40, 26, 14, 0.25)';
    ctx.beginPath();
    ctx.ellipse(x + 2 * s, y + 1, 7 * s, 2.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 5 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y - 10 * s, 7 * s, 0, Math.PI * 2);
    ctx.fillStyle = rng.chance(0.25) ? 'rgba(175, 150, 70, 0.9)' : 'rgba(95, 140, 75, 0.92)';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - 2.5 * s, y - 12.5 * s, 2.5 * s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(220, 235, 170, 0.5)';
    ctx.fill();
  };
  const pine = (x: number, y: number, s: number) => {
    ctx.fillStyle = 'rgba(40, 26, 14, 0.25)';
    ctx.beginPath();
    ctx.ellipse(x + 2 * s, y + 1, 5 * s, 2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 6 * s, y);
    ctx.lineTo(x, y - 18 * s);
    ctx.lineTo(x + 6 * s, y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(55, 95, 65, 0.95)';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  };
  const grove = (cx: number, cy: number, rx: number, ry: number, n: number, pines: number) => {
    const trees: [number, number, number, boolean][] = [];
    for (let i = 0; i < n * 5 && trees.length < n; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = Math.sqrt(rng.next());
      const x = cx + Math.cos(a) * r * rx;
      const y = cy + Math.sin(a) * r * ry;
      if (free(x, y - 8, 2)) trees.push([x, y, 0.8 + rng.next() * 0.5, rng.chance(pines)]);
    }
    for (const [x, y, s, p] of trees.sort((a, b) => a[1] - b[1])) (p ? pine : leafy)(x, y, s);
  };
  grove(420, 300, 150, 95, 70, 0.3);
  grove(225, 250, 110, 70, 30, 0.2);
  grove(560, 220, 90, 60, 18, 0.6);
  grove(750, 300, 90, 40, 12, 0.9);
  grove(330, 560, 80, 40, 10, 0.2);
  grove(80, 330, 70, 60, 14, 0.4);

  // ── Campos de labor junto a las aldeas ──
  const fields = (cx: number, cy: number) => {
    for (let k = 0; k < 5; k++) {
      const x = cx + (rng.next() - 0.5) * 120;
      const y = cy + (rng.next() - 0.5) * 70;
      if (!free(x, y, 18)) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((rng.next() - 0.5) * 0.6);
      ctx.fillStyle = rng.chance(0.5) ? 'rgba(210, 180, 90, 0.5)' : 'rgba(150, 165, 80, 0.45)';
      ctx.fillRect(-16, -9, 32, 18);
      ctx.strokeStyle = 'rgba(90, 70, 30, 0.45)';
      ctx.lineWidth = 0.8;
      for (let l = -12; l <= 12; l += 4) {
        ctx.beginPath();
        ctx.moveTo(l, -9);
        ctx.lineTo(l, 9);
        ctx.stroke();
      }
      ctx.restore();
    }
  };
  fields(NODE.robledal.x, NODE.robledal.y);
  fields(NODE.molino.x, NODE.molino.y);
  fields(NODE.castle.x + 40, NODE.castle.y - 40);

  // ── Marjal: charcas y juncos ──
  for (let i = 0; i < 9; i++) {
    const x = NODE.marjal.x + (rng.next() - 0.5) * 170;
    const y = NODE.marjal.y + (rng.next() - 0.5) * 120;
    if (!free(x, y, 10)) continue;
    ctx.beginPath();
    ctx.ellipse(x, y, 14 + rng.next() * 10, 5 + rng.next() * 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(85, 115, 95, 0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(40, 50, 40, 0.5)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  for (let i = 0; i < 30; i++) {
    const x = NODE.marjal.x + (rng.next() - 0.5) * 170;
    const y = NODE.marjal.y + (rng.next() - 0.5) * 120;
    if (!free(x, y, 4)) continue;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 2, y);
    ctx.lineTo(x - 3, y - 8);
    ctx.moveTo(x + 2, y);
    ctx.lineTo(x + 3, y - 10);
    ctx.stroke();
  }

  // ── Rosa de los vientos, con el norte en rojo ──
  const cx = 920;
  const cy = 548;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, 38, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 - Math.PI / 2;
    const len = k % 2 ? 26 : 50;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a + 0.18) * 8, cy + Math.sin(a + 0.18) * 8);
    ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    ctx.lineTo(cx + Math.cos(a - 0.18) * 8, cy + Math.sin(a - 0.18) * 8);
    ctx.closePath();
    ctx.fillStyle = k === 0 ? 'rgba(160, 40, 30, 0.9)' : INK;
    if (k % 2 === 0) ctx.fill();
    else ctx.stroke();
  }
  ctx.fillStyle = INK;
  ctx.font = '16px "IM Fell English SC", serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy - 56);

  // ── Cartela: cinta con el título ──
  const tx = 170;
  const ty = 580;
  ctx.beginPath();
  ctx.moveTo(tx - 140, ty - 18);
  ctx.lineTo(tx + 140, ty - 18);
  ctx.lineTo(tx + 128, ty);
  ctx.lineTo(tx + 140, ty + 18);
  ctx.lineTo(tx - 140, ty + 18);
  ctx.lineTo(tx - 128, ty);
  ctx.closePath();
  ctx.fillStyle = 'rgba(238, 224, 186, 0.95)';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = 'rgba(40, 26, 14, 0.9)';
  ctx.font = '24px "IM Fell English SC", serif';
  ctx.fillText('El Sendero del Alba', tx, ty + 8);

  // ── Bordes quemados ──
  const edge = ctx.createRadialGradient(MAP_W / 2, MAP_H / 2, MAP_H * 0.45, MAP_W / 2, MAP_H / 2, MAP_W * 0.6);
  edge.addColorStop(0, 'rgba(40, 20, 5, 0)');
  edge.addColorStop(1, 'rgba(40, 20, 5, 0.6)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  return c;
}

export interface MapHooks {
  onTravel: (id: string) => void;
}

/** El mapa del sendero: pergamino pintado y nodos en SVG por encima. */
export class MapView {
  readonly el: HTMLElement;
  private svg: SVGSVGElement;
  private tip: HTMLElement;

  constructor(
    private campaign: Campaign,
    private hooks: MapHooks,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'cp-map-frame';
    this.el.appendChild(paintParchment(campaign.state.seed));
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${MAP_W} ${MAP_H}`);
    this.el.appendChild(this.svg);
    this.tip = document.createElement('div');
    this.tip.className = 'cp-map-tip';
    this.el.appendChild(this.tip);
    this.render();
  }

  render() {
    const c = this.campaign;
    const exp = c.state.exp;
    const here = exp?.node ?? 'castle';
    const reach = exp && !c.state.pending ? NODE[here].links : [];
    let paths = '';
    const drawn = new Set<string>();
    for (const n of MAP) {
      for (const l of n.links) {
        const key = [n.id, l].sort().join('-');
        if (drawn.has(key)) continue;
        drawn.add(key);
        const m = NODE[l];
        const known = c.node(n.id).seen && c.node(l).seen;
        const q = roadControl(n, m);
        const d = `M${n.x} ${n.y} Q${q.x} ${q.y} ${m.x} ${m.y}`;
        // Senda de tierra clara y, encima, el trazo de tinta a puntos.
        paths += `<path class="road-bed ${known ? '' : 'faint'}" d="${d}" /><path class="road ${known ? '' : 'faint'}" d="${d}" />`;
      }
    }
    let fog = '';
    let nodes = '';
    const frontier = c.darkFrontier();
    const exposed = c.exposed();
    for (const n of MAP) {
      const st = c.status(n.id);
      const ns = c.node(n.id);
      const canGo = reach.includes(n.id);
      if (st === 'unknown') fog += `<ellipse class="fog" cx="${n.x}" cy="${n.y}" rx="74" ry="52" />`;
      // La oscuridad se ve aunque el nodo no se haya explorado.
      if (ns.dark) fog += `<ellipse class="dark" cx="${n.x}" cy="${n.y}" rx="86" ry="62" />`;
      const front = frontier.includes(n.id) ? `<circle class="frontier" cx="${n.x}" cy="${n.y}" r="40" />` : '';
      const struct = ns.structure ? `<text class="struct" x="${n.x + 30}" y="${n.y - 18}">${ns.structure === 'tower' ? '♜' : '△'}</text>` : '';
      const guards = c.guards(n.id) ? `<text class="guards" x="${n.x + 30}" y="${n.y + 2}">${'⚑'.repeat(c.guards(n.id))}</text>` : '';
      // Retaguardia: un resplandor cálido y un escudo pequeño.
      const safe = st === 'cleared' && c.shielded(n.id, exposed);
      const glow = safe ? `<circle class="safe" cx="${n.x}" cy="${n.y}" r="44" />` : '';
      const shield = safe ? `<text class="shield" x="${n.x - 30}" y="${n.y - 12}">⛨</text>` : '';
      const foes = st === 'hostile' || st === 'lost' ? `<text class="foes" x="${n.x - 34}" y="${n.y - 18}">${'☠'.repeat(Math.min(4, ns.foes.length))}</text>` : '';
      const cost = canGo ? `<text class="cost" x="${n.x}" y="${n.y + 58}">${c.travelCost(n.id)} h</text>` : '';
      nodes += `
        <g class="node st-${st} ${canGo ? 'reach' : ''} ${here === n.id ? 'here' : ''} ${n.boss ? 'boss' : ''} ${ns.dark ? 'is-dark' : ''}" data-id="${n.id}">
          ${front}${glow}
          <circle class="halo" cx="${n.x}" cy="${n.y}" r="34" />
          <circle class="disc" cx="${n.x}" cy="${n.y}" r="26" />
          <g class="glyph" transform="translate(${n.x} ${n.y})">${st === 'unknown' ? '<text class="q" y="10">?</text>' : GLYPH[n.type]}</g>
          <text class="name" x="${n.x}" y="${n.y + 44}">${st === 'unknown' ? '· · ·' : n.name}</text>
          ${cost}${struct}${guards}${foes}${shield}
        </g>`;
    }
    const h = NODE[here];
    const token = exp
      ? `<g class="token" transform="translate(${h.x - 6} ${h.y - 36})"><path d="M0 0 V-40" /><path class="flag" d="M0 -40 L28 -34 L18 -28 L28 -22 L0 -18 Z" /></g>`
      : '';
    this.svg.innerHTML = `<defs><filter id="blur"><feGaussianBlur stdDeviation="9" /></filter></defs>${paths}<g filter="url(#blur)">${fog}</g>${nodes}${token}`;

    for (const g of this.svg.querySelectorAll<SVGGElement>('.node')) {
      const id = g.dataset.id!;
      g.addEventListener('pointerenter', () => this.showTip(id));
      g.addEventListener('pointerleave', () => this.tip.classList.remove('on'));
      g.addEventListener('click', () => reach.includes(id) && this.hooks.onTravel(id));
    }
  }

  private showTip(id: string) {
    const c = this.campaign;
    const def = NODE[id];
    const st = c.status(id);
    const ns = c.node(id);
    const exp = c.state.exp;
    const reach = exp && NODE[exp.node].links.includes(id);
    const lines: string[] = [];
    if (st !== 'unknown') lines.push(`<p>${def.desc}</p>`);
    if (st === 'hostile' || st === 'lost') lines.push(`<p class="bad">Lo defienden: ${c.describeFoes(ns.foes)}</p>`);
    if (st === 'unknown') lines.push('<p>Nadie sabe qué espera allí. Explora desde un nodo vecino para descubrirlo.</p>');
    if (ns.dark) lines.push(`<p class="dark">Cubierto por la oscuridad: allí siempre se pelea de noche y las criaturas vuelven.${def.source && !ns.destroyed ? ' Es un foco: desde aquí avanza la noche.' : ''}</p>`);
    else if (c.darkFrontier().includes(id)) lines.push(`<p class="dark">La oscuridad llegará en ${c.state.darkClock} ${c.state.darkClock === 1 ? 'día' : 'días'}${ns.garrison.length && ns.structure ? ', pero su guarnición puede contenerla' : ''}.</p>`);
    if (ns.destroyed) lines.push('<p class="good">Foco destruido: la oscuridad ya no nace aquí.</p>');
    if (def.village && !ns.foes.length) lines.push(`<p class="good">Aldea: víveres a ${c.villagePrice(id)} de oro, cobijo para dormir${ns.uses ? '' : ` y ${def.village.name} dispuesto a unirse`}.</p>`);
    if (def.type === 'shrine' && !ns.foes.length && st !== 'unknown') lines.push(`<p class="good">Ermita: ${ns.uses ? `quedan ${ns.uses} rezos` : 'la llama se ha apagado'}.</p>`);
    if (ns.structure) {
      const who = [...ns.garrison.map((g) => c.soldier(g)?.name), ...(ns.sentinels ? [ns.sentinels === 1 ? 'un centinela' : `${ns.sentinels} centinelas`] : [])];
      lines.push(`<p>${STRUCTURES[ns.structure].name} · ${who.length ? `de guardia: ${who.join(', ')}` : 'sin guardia'}</p>`);
    }
    if (st === 'cleared' && c.shielded(id)) lines.push('<p class="good">Retaguardia: a salvo.</p>');
    else if (st === 'cleared' && id !== 'castle' && def.type !== 'village') lines.push('<p class="warn">Sin guardia: pueden retomarlo.</p>');
    if (st === 'secured') lines.push('<p class="good">Asegurado: se cruza en 1 hora y sin riesgo.</p>');
    if (st !== 'unknown' && !ns.foes.length && !ns.looted && Object.keys(def.loot).length && id !== 'castle') lines.push('<p class="good">Queda botín por saquear.</p>');
    if (reach) lines.push(`<p class="go">Clic para viajar · ${c.travelCost(id)} h de luz</p>`);
    this.tip.innerHTML = `<h4>${st === 'unknown' ? 'Tierra sin explorar' : def.name}</h4><em>${STATUS_LABEL[st]}</em>${lines.join('')}`;
    const box = this.el.getBoundingClientRect();
    const sx = box.width / MAP_W;
    const sy = box.height / MAP_H;
    const left = def.x * sx;
    this.tip.style.left = `${Math.min(box.width - 270, Math.max(10, left + 40))}px`;
    this.tip.style.top = `${Math.max(10, def.y * sy - 40)}px`;
    this.tip.classList.add('on');
  }
}
