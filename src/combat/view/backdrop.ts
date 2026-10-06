import { Rng } from '../../core/rng';
import type { Biome } from '../rules/data';

export type TimeOfDay = 'day' | 'dusk' | 'night';

/** Lienzo lógico de la escena; las capas son algo más anchas para el paralaje. */
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const LAYER_W = 1480;
export const GROUND_Y = 568;
/** Cielo y viñeta se prolongan hacia arriba para ventanas más altas que 16:9. */
export const SKY_EXTRA = 700;

interface Palette {
  skyTop: string;
  skyBottom: string;
  far: string;
  mid: string;
  ground: string;
  groundEdge: string;
  fog: string;
  glow: string;
  ink: string;
}

export const PALETTES: Record<TimeOfDay, Palette> = {
  day: {
    skyTop: '#5e605c',
    skyBottom: '#b3a27f',
    far: '#6b6a5f',
    mid: '#2b2b25',
    ground: '#1c1915',
    groundEdge: '#3a342a',
    fog: 'rgba(205, 192, 160, 0.28)',
    glow: 'rgba(255, 236, 190, 0.35)',
    ink: '#0b0907',
  },
  dusk: {
    skyTop: '#1c1422',
    skyBottom: '#8c4a2f',
    far: '#3a2629',
    mid: '#170f14',
    ground: '#120c0c',
    groundEdge: '#2e1d18',
    fog: 'rgba(170, 92, 64, 0.22)',
    glow: 'rgba(255, 150, 90, 0.45)',
    ink: '#070405',
  },
  night: {
    skyTop: '#04050b',
    skyBottom: '#1a1f34',
    far: '#141a2b',
    mid: '#0a0c15',
    ground: '#07070b',
    groundEdge: '#151827',
    fog: 'rgba(90, 104, 150, 0.2)',
    glow: 'rgba(160, 180, 255, 0.25)',
    ink: '#020205',
  },
};

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Línea de cresta suave generada con ruido por octavas. */
function ridge(rng: Rng, w: number, base: number, amp: number, steps = 60): [number, number][] {
  const phases = [rng.next() * 6, rng.next() * 6, rng.next() * 6];
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * w;
    const t = x / w;
    const y =
      base -
      amp *
        (0.55 * Math.sin(t * 5 + phases[0]) +
          0.3 * Math.sin(t * 13 + phases[1]) +
          0.15 * Math.sin(t * 31 + phases[2]) +
          0.5);
    pts.push([x, y]);
  }
  return pts;
}

function fillRidge(ctx: CanvasRenderingContext2D, pts: [number, number][], h: number, fill: string | CanvasGradient) {
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineTo(pts[pts.length - 1][0], h);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Trazos de tinta sueltos que dan textura de grabado. */
function hatch(ctx: CanvasRenderingContext2D, rng: Rng, x0: number, y0: number, w: number, h: number, n: number, color: string, alpha = 0.18) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const x = x0 + rng.next() * w;
    const y = y0 + rng.next() * h;
    const len = 4 + rng.next() * 10;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y - len * 0.35);
    ctx.stroke();
  }
  ctx.restore();
}

function deadTree(ctx: CanvasRenderingContext2D, rng: Rng, x: number, y: number, h: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  const branch = (bx: number, by: number, len: number, angle: number, width: number, depth: number) => {
    const ex = bx + Math.cos(angle) * len;
    const ey = by - Math.sin(angle) * len;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo((bx + ex) / 2 + (rng.next() - 0.5) * len * 0.3, (by + ey) / 2, ex, ey);
    ctx.stroke();
    if (depth > 0) {
      const n = 2 + Math.floor(rng.next() * 2);
      for (let i = 0; i < n; i++) {
        branch(ex, ey, len * (0.55 + rng.next() * 0.2), angle + (rng.next() - 0.5) * 1.4, width * 0.62, depth - 1);
      }
    }
  };
  branch(x, y, h * 0.42, Math.PI / 2 + (rng.next() - 0.5) * 0.2, h * 0.06, 4);
  ctx.restore();
}

function pine(ctx: CanvasRenderingContext2D, rng: Rng, x: number, y: number, h: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  const tiers = 5 + Math.floor(rng.next() * 3);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const ty = y - h * t * 0.85;
    const w = h * 0.32 * (1 - t * 0.8);
    ctx.beginPath();
    ctx.moveTo(x - w, ty);
    ctx.lineTo(x, ty - h * 0.28);
    ctx.lineTo(x + w, ty);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillRect(x - h * 0.02, y - h * 0.1, h * 0.04, h * 0.12);
  ctx.restore();
}

function ruinArch(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(x, y - 150 * s, 26 * s, 150 * s);
  ctx.fillRect(x + 110 * s, y - 120 * s, 26 * s, 120 * s);
  ctx.beginPath();
  ctx.moveTo(x, y - 150 * s);
  ctx.quadraticCurveTo(x + 68 * s, y - 230 * s, x + 136 * s, y - 120 * s);
  ctx.lineTo(x + 110 * s, y - 120 * s);
  ctx.quadraticCurveTo(x + 68 * s, y - 190 * s, x + 26 * s, y - 150 * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export interface Backdrop {
  sky: HTMLCanvasElement;
  far: HTMLCanvasElement;
  mid: HTMLCanvasElement;
  ground: HTMLCanvasElement;
  front: HTMLCanvasElement;
  vignette: HTMLCanvasElement;
  glow: HTMLCanvasElement;
}

function column(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(x - 12, y - h, 24, h);
  ctx.fillRect(x - 18, y - 10, 36, 10);
  // Fuste partido
  ctx.beginPath();
  ctx.moveTo(x - 14, y - h);
  ctx.lineTo(x - 4, y - h - 14);
  ctx.lineTo(x + 3, y - h - 4);
  ctx.lineTo(x + 14, y - h - 18);
  ctx.lineTo(x + 14, y - h);
  ctx.fill();
  ctx.restore();
}

function reeds(ctx: CanvasRenderingContext2D, rng: Rng, x: number, y: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const h = 30 + rng.next() * 50;
    const bx = x + (rng.next() - 0.5) * 30;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, y);
    ctx.quadraticCurveTo(bx + (rng.next() - 0.5) * 16, y - h * 0.6, bx + (rng.next() - 0.5) * 22, y - h);
    ctx.stroke();
  }
  ctx.restore();
}

/** Pinta las capas de una escena lateral para una hora del día y un bioma. */
export function paintBackdrop(time: TimeOfDay, seed: number, biome: Biome = 'forest'): Backdrop {
  const p = PALETTES[time];
  const rng = new Rng(seed);
  const W = LAYER_W;
  const H = VIEW_H;

  // Cielo (con margen superior: se dibuja desplazado SKY_EXTRA hacia abajo)
  const [sky, s] = canvas(W, H + SKY_EXTRA);
  const sg = s.createLinearGradient(0, 0, 0, SKY_EXTRA + GROUND_Y);
  sg.addColorStop(0, '#000000');
  sg.addColorStop(0.35, p.skyTop);
  sg.addColorStop(1, p.skyBottom);
  s.fillStyle = sg;
  s.fillRect(0, 0, W, H + SKY_EXTRA);
  s.translate(0, SKY_EXTRA);
  if (time === 'night') {
    for (let i = 0; i < 160; i++) {
      s.fillStyle = `rgba(220, 225, 255, ${0.2 + rng.next() * 0.6})`;
      s.fillRect(rng.next() * W, rng.next() * GROUND_Y * 0.7, 1.4, 1.4);
    }
    const mg = s.createRadialGradient(1020, 130, 4, 1020, 130, 160);
    mg.addColorStop(0, 'rgba(230, 235, 255, 0.95)');
    mg.addColorStop(0.12, 'rgba(210, 220, 255, 0.6)');
    mg.addColorStop(0.13, 'rgba(160, 180, 255, 0.18)');
    mg.addColorStop(1, 'rgba(160, 180, 255, 0)');
    s.fillStyle = mg;
    s.fillRect(0, 0, W, H);
  } else {
    const sunX = time === 'dusk' ? 980 : 760;
    const sunY = time === 'dusk' ? GROUND_Y - 120 : 120;
    const sun = s.createRadialGradient(sunX, sunY, 6, sunX, sunY, 380);
    sun.addColorStop(0, p.glow.replace(/[\d.]+\)$/, '0.9)'));
    sun.addColorStop(0.08, p.glow);
    sun.addColorStop(1, 'rgba(0,0,0,0)');
    s.fillStyle = sun;
    s.fillRect(0, 0, W, H);
  }
  // Nubes rasgadas
  s.save();
  s.globalAlpha = time === 'night' ? 0.25 : 0.18;
  s.fillStyle = time === 'day' ? '#e8dcc0' : time === 'dusk' ? '#d07a50' : '#4a5577';
  for (let i = 0; i < 9; i++) {
    const cx = rng.next() * W;
    const cy = 60 + rng.next() * 220;
    for (let k = 0; k < 6; k++) {
      s.beginPath();
      s.ellipse(cx + k * 34 + rng.next() * 20, cy + rng.next() * 10, 70 + rng.next() * 60, 6 + rng.next() * 8, 0, 0, Math.PI * 2);
      s.fill();
    }
  }
  s.restore();

  // Montañas lejanas, dos crestas con bruma
  const [far, f] = canvas(W, H);
  fillRidge(f, ridge(rng, W, GROUND_Y - 150, 120), H, p.far);
  const fogBand = f.createLinearGradient(0, GROUND_Y - 200, 0, GROUND_Y);
  fogBand.addColorStop(0, 'rgba(0,0,0,0)');
  fogBand.addColorStop(1, p.fog);
  f.fillStyle = fogBand;
  f.fillRect(0, 0, W, H);
  fillRidge(f, ridge(rng, W, GROUND_Y - 70, 70), H, p.mid);
  hatch(f, rng, 0, GROUND_Y - 260, W, 200, 260, p.ink, 0.12);

  // Plano medio según el bioma: bosque cerrado, pradera abierta, ruinas, vado o guarida
  const [mid, m] = canvas(W, H);
  const trees = { forest: [34, 40, 0.3], meadow: [150, 220, 0.4], ruins: [90, 140, 0.6], ford: [70, 120, 0.25], lair: [60, 90, 1], castle: [200, 300, 0.5] }[biome] as [number, number, number];
  if (biome === 'ruins') {
    ruinArch(m, 820, GROUND_Y + 6, 1.15, p.mid);
    ruinArch(m, 180, GROUND_Y + 6, 0.8, p.mid);
    for (const cx of [420, 520, 1120, 1240]) column(m, cx, GROUND_Y + 8, 70 + rng.next() * 90, p.mid);
  }
  if (biome === 'meadow') {
    fillRidge(m, ridge(rng, W, GROUND_Y - 10, 34), H, p.mid);
  }
  for (let x = -20; x < W + 40; x += trees[0] + rng.next() * trees[1]) {
    const h = (biome === 'forest' ? 150 : 120) + rng.next() * 170;
    if (rng.chance(trees[2])) deadTree(m, rng, x, GROUND_Y + 10, h * 1.2, p.ink);
    else pine(m, rng, x, GROUND_Y + 14, h, p.ink);
  }
  if (biome === 'lair') {
    // Estacas y un resplandor rojizo bajo la bruma
    const red = m.createLinearGradient(0, GROUND_Y - 200, 0, GROUND_Y);
    red.addColorStop(0, 'rgba(120, 20, 30, 0)');
    red.addColorStop(1, 'rgba(150, 30, 40, 0.35)');
    m.fillStyle = red;
    m.fillRect(0, GROUND_Y - 200, W, 220);
    m.fillStyle = p.ink;
    for (let x = 0; x < W; x += 40 + rng.next() * 70) {
      const h = 30 + rng.next() * 60;
      m.beginPath();
      m.moveTo(x - 5, GROUND_Y + 10);
      m.lineTo(x + (rng.next() - 0.5) * 16, GROUND_Y + 10 - h);
      m.lineTo(x + 5, GROUND_Y + 10);
      m.fill();
    }
  }
  const midFog = m.createLinearGradient(0, GROUND_Y - 120, 0, GROUND_Y + 20);
  midFog.addColorStop(0, 'rgba(0,0,0,0)');
  midFog.addColorStop(1, p.fog);
  m.fillStyle = midFog;
  m.fillRect(0, GROUND_Y - 120, W, 140);

  // Suelo
  const [ground, gr] = canvas(W, H);
  const gg = gr.createLinearGradient(0, GROUND_Y - 20, 0, H);
  gg.addColorStop(0, p.groundEdge);
  gg.addColorStop(0.25, p.ground);
  gg.addColorStop(1, p.ink);
  gr.fillStyle = gg;
  gr.beginPath();
  gr.moveTo(0, GROUND_Y - 8);
  for (let x = 0; x <= W; x += 20) gr.lineTo(x, GROUND_Y - 8 + Math.sin(x * 0.05) * 3 + rng.next() * 4);
  gr.lineTo(W, H);
  gr.lineTo(0, H);
  gr.closePath();
  gr.fill();
  // Piedras del camino
  for (let i = 0; i < 70; i++) {
    gr.fillStyle = `rgba(120, 110, 95, ${0.08 + rng.next() * 0.12})`;
    gr.beginPath();
    gr.ellipse(rng.next() * W, GROUND_Y + 20 + rng.next() * 90, 6 + rng.next() * 18, 2 + rng.next() * 4, 0, 0, Math.PI * 2);
    gr.fill();
  }
  hatch(gr, rng, 0, GROUND_Y, W, H - GROUND_Y, 700, '#000', 0.28);
  if (biome === 'ford') {
    // Vado: una franja de agua que refleja el cielo, con juncos en la orilla
    // A la altura de los pies: el grupo cruza el vado con el agua por los tobillos.
    const wy = GROUND_Y - 6;
    const wg = gr.createLinearGradient(0, wy, 0, wy + 60);
    wg.addColorStop(0, p.skyBottom);
    wg.addColorStop(1, p.ink);
    gr.save();
    gr.globalAlpha = 0.55;
    gr.fillStyle = wg;
    gr.beginPath();
    gr.moveTo(0, wy);
    for (let x = 0; x <= W; x += 30) gr.lineTo(x, wy + Math.sin(x * 0.02) * 6);
    gr.lineTo(W, wy + 44);
    for (let x = W; x >= 0; x -= 30) gr.lineTo(x, wy + 44 + Math.sin(x * 0.03) * 5);
    gr.fill();
    gr.globalAlpha = 0.35;
    gr.strokeStyle = p.glow;
    for (let i = 0; i < 40; i++) {
      const x = rng.next() * W;
      const y = wy + 6 + rng.next() * 34;
      gr.beginPath();
      gr.moveTo(x, y);
      gr.lineTo(x + 12 + rng.next() * 30, y);
      gr.stroke();
    }
    gr.restore();
    for (let x = 20; x < W; x += 120 + rng.next() * 200) if (x < 200 || x > 900) reeds(gr, rng, x, wy + 4, p.ink);
  }

  // Primer plano: hierbas y ramas que enmarcan la escena
  const [front, fr] = canvas(W, H);
  fr.fillStyle = p.ink;
  for (let x = 0; x < W; x += 6 + rng.next() * 10) {
    const edge = Math.min(x, W - x) < 260;
    const h = (edge ? 40 : 14) + rng.next() * (edge ? 90 : 26);
    fr.beginPath();
    fr.moveTo(x, H);
    fr.quadraticCurveTo(x + (rng.next() - 0.5) * 20, H - h * 0.6, x + (rng.next() - 0.5) * 30, H - h);
    fr.lineTo(x + 3, H);
    fr.fill();
  }
  for (const side of [0, 1]) {
    fr.save();
    if (side) {
      fr.translate(W, 0);
      fr.scale(-1, 1);
    }
    fr.strokeStyle = p.ink;
    fr.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      fr.lineWidth = 9 - i * 2;
      fr.beginPath();
      fr.moveTo(-10, 40 + i * 30);
      fr.quadraticCurveTo(120 + rng.next() * 80, 30 + i * 40, 160 + rng.next() * 140, 120 + i * 50 + rng.next() * 40);
      fr.stroke();
    }
    fr.restore();
  }

  // Viñeta (sobre todo lo demás)
  const [vignette, v] = canvas(VIEW_W + 400, VIEW_H + SKY_EXTRA);
  const cx = (VIEW_W + 400) / 2;
  const cy = SKY_EXTRA + VIEW_H * 0.6;
  const vg = v.createRadialGradient(cx, cy, VIEW_H * 0.3, cx, cy, VIEW_W * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.88)');
  v.fillStyle = vg;
  v.fillRect(0, 0, VIEW_W + 400, VIEW_H + SKY_EXTRA);

  // Resplandor de antorcha
  const [glow, gl] = canvas(256, 256);
  const lg = gl.createRadialGradient(128, 128, 0, 128, 128, 128);
  lg.addColorStop(0, 'rgba(255, 190, 110, 0.9)');
  lg.addColorStop(0.35, 'rgba(255, 140, 60, 0.35)');
  lg.addColorStop(1, 'rgba(255, 120, 40, 0)');
  gl.fillStyle = lg;
  gl.fillRect(0, 0, 256, 256);

  return { sky, far, mid, ground, front, vignette, glow };
}
