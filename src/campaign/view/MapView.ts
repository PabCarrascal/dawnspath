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

/** El río: dos tramos de Bézier que bajan del norte y cruzan por el vado. */
const RIVER = [
  { x: [680, 640, 700, 605], y: [-10, 120, 260, 385] },
  { x: [605, 540, 680, 650], y: [385, 470, 540, 640] },
];
const bez = (p: number[], t: number) => (1 - t) ** 3 * p[0] + 3 * (1 - t) ** 2 * t * p[1] + 3 * (1 - t) * t * t * p[2] + t ** 3 * p[3];

/** Puntos de nodos, caminos y río: el decorado los esquiva para no tapar nada. */
function busyPoints() {
  const pts: { x: number; y: number; r: number }[] = MAP.map((n) => ({ x: n.x, y: n.y, r: 58 }));
  for (const n of MAP) {
    for (const l of n.links) {
      const m = NODE[l];
      const c = roadControl(n, m);
      for (let t = 0; t <= 1; t += 0.05) {
        const u = 1 - t;
        pts.push({ x: u * u * n.x + 2 * u * t * c.x + t * t * m.x, y: u * u * n.y + 2 * u * t * c.y + t * t * m.y, r: 13 });
      }
    }
  }
  for (const leg of RIVER) for (let t = 0; t <= 1; t += 0.04) pts.push({ x: bez(leg.x, t), y: bez(leg.y, t), r: 16 });
  // La cartela del título y la rosa de los vientos
  pts.push({ x: 170, y: 585, r: 60 }, { x: 290, y: 585, r: 40 }, { x: 920, y: 548, r: 70 });
  return pts;
}

/** Color de la aguada de cada tipo de lugar. */
const TINT: Record<NodeType, [number, number, number]> = {
  castle: [160, 186, 108],
  meadow: [172, 176, 118],
  village: [196, 186, 106],
  forest: [86, 136, 76],
  ruins: [196, 172, 124],
  den: [112, 84, 116],
  ford: [140, 182, 150],
  shrine: [168, 192, 156],
  mountain: [150, 150, 162],
  bog: [110, 132, 92],
  lair: [100, 72, 116],
};
const PEAKS: [number, number, number] = [158, 156, 172];

/** Lugar al que pertenece cada punto: el nodo más cercano (regiones de Voronoi). */
function owner(x: number, y: number) {
  let best = MAP[0];
  let d = Infinity;
  for (const n of MAP) {
    const dd = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (dd < d) [best, d] = [n, dd];
  }
  return best;
}

/**
 * Mapa ilustrado sobre pergamino. El color y el decorado salen de los lugares:
 * cada nodo tiñe su región con la aguada de su tipo (fundida con las vecinas)
 * y la decora a juego (bosque, campos y casas, ruinas, charcas…). Al norte
 * corre una cordillera continua. El decorado esquiva nodos, caminos y el río.
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
  const INK = 'rgba(40, 26, 14, 0.8)';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // ── Pergamino ──
  const base = ctx.createRadialGradient(MAP_W / 2, MAP_H / 2, 80, MAP_W / 2, MAP_H / 2, MAP_W * 0.62);
  base.addColorStop(0, '#ecdcb2');
  base.addColorStop(0.7, '#d6bf8c');
  base.addColorStop(1, '#9a7a48');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  // ── Aguadas por región: cada punto toma el color de los lugares cercanos, ponderado por distancia ──
  const S = 5;
  const lw = Math.ceil(MAP_W / S);
  const lh = Math.ceil(MAP_H / S);
  const low = document.createElement('canvas');
  low.width = lw;
  low.height = lh;
  const lctx = low.getContext('2d')!;
  const img = lctx.createImageData(lw, lh);
  for (let j = 0; j < lh; j++) {
    for (let i = 0; i < lw; i++) {
      const x = i * S;
      const y = j * S;
      let r = 0;
      let g = 0;
      let b = 0;
      let wsum = 0;
      for (const n of MAP) {
        const w = 1 / ((n.x - x) ** 2 + (n.y - y) ** 2 + 400) ** 2;
        const t = TINT[n.type];
        r += t[0] * w;
        g += t[1] * w;
        b += t[2] * w;
        wsum += w;
      }
      // La cordillera manda en la franja del norte.
      const m = Math.max(0, Math.min(1, (150 - y) / 70));
      const k = (j * lw + i) * 4;
      img.data[k] = (r / wsum) * (1 - m) + PEAKS[0] * m;
      img.data[k + 1] = (g / wsum) * (1 - m) + PEAKS[1] * m;
      img.data[k + 2] = (b / wsum) * (1 - m) + PEAKS[2] * m;
      img.data[k + 3] = 255;
    }
  }
  lctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(low, 0, 0, MAP_W, MAP_H);
  ctx.restore();
  // Grano de acuarela: manchas suaves del mismo pigmento
  for (let i = 0; i < 140; i++) {
    const x = rng.next() * MAP_W;
    const y = rng.next() * MAP_H;
    const r = 12 + rng.next() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(90, 64, 30, ${0.03 + rng.next() * 0.05})`);
    g.addColorStop(1, 'rgba(90, 64, 30, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // ── Río: aguada azul, agua más clara al centro, orillas en tinta y ondas ──
  const river = () => {
    ctx.beginPath();
    ctx.moveTo(RIVER[0].x[0], RIVER[0].y[0]);
    for (const leg of RIVER) ctx.bezierCurveTo(leg.x[1], leg.y[1], leg.x[2], leg.y[2], leg.x[3], leg.y[3]);
  };
  river();
  ctx.strokeStyle = 'rgba(80, 125, 150, 0.35)';
  ctx.lineWidth = 22;
  ctx.stroke();
  river();
  ctx.strokeStyle = 'rgba(120, 170, 195, 0.6)';
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
  ctx.strokeStyle = 'rgba(240, 248, 255, 0.6)';
  ctx.lineWidth = 1;
  for (const leg of RIVER) {
    for (let t = 0.08; t < 1; t += 0.16) {
      const x = bez(leg.x, t);
      const y = bez(leg.y, t);
      ctx.beginPath();
      ctx.moveTo(x - 3, y);
      ctx.quadraticCurveTo(x, y - 2, x + 3, y);
      ctx.stroke();
    }
  }

  // ───────────── piezas de dibujo ─────────────
  const shadow = (x: number, y: number, rx: number) => {
    ctx.fillStyle = 'rgba(40, 26, 14, 0.22)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 1, rx, rx * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const leafy = (x: number, y: number, s: number, autumn = 0.2) => {
    shadow(x, y, 7 * s);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 5 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y - 10 * s, 7 * s, 0, Math.PI * 2);
    ctx.fillStyle = rng.chance(autumn) ? 'rgba(186, 150, 70, 0.95)' : 'rgba(92, 140, 74, 0.95)';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - 2.5 * s, y - 12.5 * s, 2.5 * s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(220, 235, 170, 0.5)';
    ctx.fill();
  };
  const pine = (x: number, y: number, s: number, snowy = false) => {
    shadow(x, y, 5 * s);
    ctx.beginPath();
    ctx.moveTo(x - 6 * s, y);
    ctx.lineTo(x, y - 18 * s);
    ctx.lineTo(x + 6 * s, y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(52, 92, 64, 0.95)';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    if (snowy) {
      ctx.beginPath();
      ctx.moveTo(x - 2 * s, y - 12 * s);
      ctx.lineTo(x, y - 18 * s);
      ctx.lineTo(x + 2 * s, y - 12 * s);
      ctx.closePath();
      ctx.fillStyle = 'rgba(250, 250, 255, 0.95)';
      ctx.fill();
    }
  };
  const deadTree = (x: number, y: number, s: number) => {
    ctx.strokeStyle = 'rgba(46, 30, 34, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 16 * s);
    ctx.moveTo(x, y - 9 * s);
    ctx.lineTo(x - 6 * s, y - 15 * s);
    ctx.moveTo(x, y - 12 * s);
    ctx.lineTo(x + 5 * s, y - 18 * s);
    ctx.moveTo(x - 6 * s, y - 15 * s);
    ctx.lineTo(x - 8 * s, y - 14 * s);
    ctx.stroke();
  };
  const tuft = (x: number, y: number, color = 'rgba(70, 90, 40, 0.7)') => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 3, y);
    ctx.lineTo(x - 4, y - 5);
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 7);
    ctx.moveTo(x + 3, y);
    ctx.lineTo(x + 4, y - 5);
    ctx.stroke();
  };
  const reeds = (x: number, y: number) => {
    tuft(x, y, INK);
    ctx.fillStyle = 'rgba(110, 70, 40, 0.9)';
    ctx.fillRect(x - 0.8, y - 9, 1.6, 3);
  };
  const house = (x: number, y: number, s: number) => {
    shadow(x, y, 8 * s);
    ctx.fillStyle = 'rgba(236, 222, 190, 0.98)';
    ctx.fillRect(x - 6 * s, y - 8 * s, 12 * s, 8 * s);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.1;
    ctx.strokeRect(x - 6 * s, y - 8 * s, 12 * s, 8 * s);
    ctx.beginPath();
    ctx.moveTo(x - 8 * s, y - 8 * s);
    ctx.lineTo(x, y - 15 * s);
    ctx.lineTo(x + 8 * s, y - 8 * s);
    ctx.closePath();
    ctx.fillStyle = 'rgba(178, 72, 46, 0.95)';
    ctx.fill();
    ctx.stroke();
  };
  const field = (x: number, y: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rng.next() - 0.5) * 0.6);
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(214, 182, 88, 0.55)' : 'rgba(150, 168, 80, 0.5)';
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
  };
  const column = (x: number, y: number, s: number) => {
    shadow(x, y, 5 * s);
    const h = (8 + rng.next() * 10) * s;
    ctx.fillStyle = 'rgba(222, 210, 186, 0.98)';
    ctx.fillRect(x - 3 * s, y - h, 6 * s, h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 3 * s, y - h, 6 * s, h);
    ctx.beginPath();
    ctx.moveTo(x - 3 * s, y - h);
    ctx.lineTo(x + 3 * s, y - h - 3 * s);
    ctx.stroke();
  };
  const stone = (x: number, y: number, s: number, dark = false) => {
    shadow(x, y, 5 * s);
    ctx.beginPath();
    ctx.moveTo(x - 4 * s, y);
    ctx.lineTo(x - 3 * s, y - 9 * s);
    ctx.lineTo(x + 1 * s, y - 13 * s);
    ctx.lineTo(x + 4 * s, y - 7 * s);
    ctx.lineTo(x + 4 * s, y);
    ctx.closePath();
    ctx.fillStyle = dark ? 'rgba(70, 52, 78, 0.95)' : 'rgba(176, 172, 164, 0.95)';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  const pool = (x: number, y: number) => {
    ctx.beginPath();
    ctx.ellipse(x, y, 14 + rng.next() * 10, 5 + rng.next() * 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(85, 115, 95, 0.6)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(40, 50, 40, 0.5)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  };
  const peak = (x: number, y: number, s: number, snow: boolean) => {
    const h = 34 * s;
    const w = 26 * s;
    const p = { x: x + (rng.next() - 0.5) * 6 * s, y: y - h };
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.lineTo(p.x, p.y);
    ctx.lineTo(p.x + 2 * s, y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(226, 212, 184, 0.97)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(p.x + 2 * s, y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(128, 118, 132, 0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(40, 30, 30, 0.45)';
    ctx.lineWidth = 0.8;
    for (let k = 1; k < 5; k++) {
      ctx.beginPath();
      ctx.moveTo(p.x + k * 0.18 * w, p.y + k * 0.2 * h);
      ctx.lineTo(p.x + k * 0.12 * w, y);
      ctx.stroke();
    }
    if (snow) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - w * 0.32, p.y + h * 0.3);
      ctx.lineTo(p.x - w * 0.12, p.y + h * 0.24);
      ctx.lineTo(p.x + w * 0.05, p.y + h * 0.34);
      ctx.lineTo(p.x + w * 0.3, p.y + h * 0.3);
      ctx.closePath();
      ctx.fillStyle = 'rgba(252, 252, 255, 0.95)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.lineTo(p.x, p.y);
    ctx.lineTo(x + w, y);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };

  // ── Cordillera del norte: tres filas de oeste a este, con cumbres de alturas muy distintas ──
  const ridge: [number, number, number, boolean][] = [];
  for (const [y0, sMin, sMax, step, gaps] of [
    [52, 1.1, 1.9, 50, 0],
    [84, 0.8, 1.35, 40, 0.1],
    [116, 0.55, 0.9, 32, 0.35],
  ] as const) {
    for (let x = -10; x < MAP_W + 20; x += step * (0.6 + rng.next() * 0.8)) {
      if (rng.chance(gaps)) continue;
      // Picos sueltos más altos de vez en cuando, para que no parezca una valla.
      const s = (sMin + rng.next() * (sMax - sMin)) * (rng.chance(0.12) ? 1.25 : 1);
      const y = y0 + (rng.next() - 0.5) * 16;
      if (free(x, y - 12 * s, 6)) ridge.push([x, y, s, s > 1.15]);
    }
  }
  for (const [x, y, s, snow] of ridge.sort((a, b) => a[1] - b[1])) peak(x, y, s, snow);

  // ── Cada lugar decora su región: piezas dentro de su celda y a su alrededor ──
  type Piece = { y: number; draw: () => void };
  const pieces: Piece[] = [];
  const scatter = (n: (typeof MAP)[number], count: number, radius: number, pad: number, put: (x: number, y: number) => void, minR = 0) => {
    for (let k = 0, placed = 0; k < count * 8 && placed < count; k++) {
      const a = rng.next() * Math.PI * 2;
      const r = minR + Math.sqrt(rng.next()) * (radius - minR);
      const x = n.x + Math.cos(a) * r * 1.25;
      const y = n.y + Math.sin(a) * r * 0.85;
      if (x < 8 || x > MAP_W - 8 || y < 130 || y > MAP_H - 8) continue;
      if (owner(x, y) !== n || !free(x, y - 6, pad)) continue;
      placed++;
      pieces.push({ y, draw: () => put(x, y) });
    }
  };
  const flat: (() => void)[] = [];
  for (const n of MAP) {
    const size = () => 0.8 + rng.next() * 0.45;
    switch (n.type) {
      case 'forest':
        scatter(n, 80, 140, 2, (x, y) => (rng.chance(0.3) ? pine(x, y, size()) : leafy(x, y, size(), 0.3)));
        break;
      case 'village':
        for (let k = 0; k < 6; k++) {
          const a = rng.next() * Math.PI * 2;
          const x = n.x + Math.cos(a) * (75 + rng.next() * 40);
          const y = n.y + Math.sin(a) * (50 + rng.next() * 30);
          if (owner(x, y) === n && free(x, y, 16)) flat.push(() => field(x, y));
        }
        scatter(n, 4, 90, 6, (x, y) => house(x, y, 0.9 + rng.next() * 0.3), 60);
        scatter(n, 12, 130, 2, (x, y) => leafy(x, y, size(), 0.35));
        break;
      case 'castle':
        for (let k = 0; k < 4; k++) {
          const x = n.x + 60 + rng.next() * 60;
          const y = n.y - 30 - rng.next() * 60;
          if (free(x, y, 16)) flat.push(() => field(x, y));
        }
        scatter(n, 10, 120, 2, (x, y) => leafy(x, y, size(), 0.15));
        break;
      case 'meadow':
        scatter(n, 40, 120, 0, (x, y) => tuft(x, y));
        scatter(n, 6, 120, 2, (x, y) => leafy(x, y, size(), 0.5));
        break;
      case 'ruins':
        scatter(n, 7, 110, 4, (x, y) => column(x, y, 1));
        scatter(n, 24, 120, 0, (x, y) => tuft(x, y, 'rgba(120, 100, 50, 0.7)'));
        scatter(n, 4, 120, 2, (x, y) => leafy(x, y, size(), 0.9));
        break;
      case 'ford':
        scatter(n, 16, 120, 0, (x, y) => reeds(x, y));
        scatter(n, 10, 130, 2, (x, y) => leafy(x, y, size(), 0.2));
        break;
      case 'shrine':
        // Corro de piedras alrededor de la ermita
        for (let k = 0; k < 7; k++) {
          const a = Math.PI * (0.15 + (k / 6) * 0.7) + Math.PI;
          const x = n.x + Math.cos(a) * 80;
          const y = n.y - Math.sin(a) * 40 + 30;
          if (free(x, y - 6, 2)) pieces.push({ y, draw: () => stone(x, y, 0.9) });
        }
        scatter(n, 14, 130, 2, (x, y) => pine(x, y, size()));
        break;
      case 'mountain':
        scatter(n, 6, 130, 8, (x, y) => peak(x, y, 0.6 + rng.next() * 0.25, false), 70);
        scatter(n, 16, 130, 2, (x, y) => pine(x, y, size(), rng.chance(0.5)));
        break;
      case 'bog':
        for (let k = 0; k < 10; k++) {
          const x = n.x + (rng.next() - 0.5) * 220;
          const y = n.y + (rng.next() - 0.5) * 150;
          if (owner(x, y) === n && free(x, y, 12)) flat.push(() => pool(x, y));
        }
        scatter(n, 30, 130, 0, (x, y) => reeds(x, y));
        scatter(n, 8, 130, 2, (x, y) => deadTree(x, y, size()));
        break;
      case 'den':
      case 'lair':
        scatter(n, 10, 120, 2, (x, y) => deadTree(x, y, size()));
        scatter(n, 7, 120, 4, (x, y) => stone(x, y, 0.9 + rng.next() * 0.4, true));
        break;
    }
  }
  for (const f of flat) f();
  // De atrás adelante, para que lo de delante tape a lo de detrás.
  for (const p of pieces.sort((a, b) => a.y - b.y)) p.draw();

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
