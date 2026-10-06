import { GROUND_Y, LAYER_W, PALETTES, TimeOfDay, VIEW_H, VIEW_W } from '../../combat/view/backdrop';
import type { BuildingId, Structure } from '../rules/types';

/** Luz que la escena convierte en un resplandor que parpadea. */
export interface Light {
  x: number;
  y: number;
  scale: number;
  alpha?: number;
}

export interface Painted {
  canvas: HTMLCanvasElement;
  lights: Light[];
}

/** Dónde está cada edificio en la escena del castillo (coordenadas lógicas). */
export const BUILDING_X: Record<BuildingId, number> = { smithy: 300, tavern: 650, lodge: 1000 };

const INK = '#0b0907';
const WARM = '#ffb35a';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return [c, ctx];
}

function shape(ctx: CanvasRenderingContext2D, pts: number[], fill: string, stroke = INK, width = 3) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, width = 3) {
  shape(ctx, [x, y, x + w, y, x + w, y + h, x, y + h], fill, INK, width);
}

/** Ventana iluminada: rectángulo cálido con parteluz. */
function lit(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, on = true) {
  rect(ctx, x, y, w, h, on ? WARM : '#1a1410', 2.5);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();
}

/** Estandartes sobre un edificio: uno por nivel de mejora. */
function banners(ctx: CanvasRenderingContext2D, x: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    const bx = x + i * 22;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bx, y);
    ctx.lineTo(bx, y - 46);
    ctx.stroke();
    shape(ctx, [bx, y - 46, bx + 16, y - 42, bx + 16, y - 24, bx + 8, y - 28, bx, y - 24], '#7a1e1a', INK, 2);
    ctx.fillStyle = '#d9a93a';
    ctx.beginPath();
    ctx.arc(bx + 8, y - 36, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Silueta del castillo al fondo: murallas, torres y la torre del homenaje. */
export function paintCastleBack(time: TimeOfDay): HTMLCanvasElement {
  const p = PALETTES[time];
  const [c, ctx] = canvas(LAYER_W, VIEW_H);
  const base = GROUND_Y - 40;
  const wall = p.mid;
  const crenel = (x0: number, x1: number, y: number) => {
    for (let x = x0; x < x1; x += 22) ctx.fillRect(x, y - 12, 12, 12);
  };
  ctx.fillStyle = wall;
  ctx.fillRect(60, base - 170, LAYER_W - 120, 230);
  crenel(60, LAYER_W - 60, base - 170);
  const tower = (x: number, w: number, h: number, roof: boolean) => {
    ctx.fillStyle = wall;
    ctx.fillRect(x - w / 2, base - h, w, h + 60);
    if (roof) {
      ctx.beginPath();
      ctx.moveTo(x - w / 2 - 10, base - h);
      ctx.lineTo(x, base - h - w * 1.1);
      ctx.lineTo(x + w / 2 + 10, base - h);
      ctx.fill();
    } else crenel(x - w / 2, x + w / 2, base - h);
  };
  tower(130, 80, 270, true);
  tower(LAYER_W - 130, 80, 270, true);
  tower(470, 70, 240, false);
  tower(LAYER_W - 470, 70, 240, false);
  tower(740, 150, 380, false);
  tower(740, 70, 440, true);
  // Ventanas encendidas en la torre del homenaje
  ctx.fillStyle = time === 'day' ? 'rgba(255, 190, 110, 0.35)' : 'rgba(255, 180, 90, 0.9)';
  for (const [x, y] of [[728, base - 340], [752, base - 340], [710, base - 260], [770, base - 260], [740, base - 400], [130, base - 220], [LAYER_W - 130, base - 220]]) {
    ctx.fillRect(x - 5, y, 10, 18);
  }
  // Estandarte del alba en lo alto
  ctx.strokeStyle = wall;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(740, base - 517);
  ctx.lineTo(740, base - 590);
  ctx.stroke();
  ctx.fillStyle = '#7a1e1a';
  ctx.beginPath();
  ctx.moveTo(740, base - 590);
  ctx.quadraticCurveTo(775, base - 585, 800, base - 575);
  ctx.quadraticCurveTo(775, base - 570, 740, base - 560);
  ctx.fill();
  // Bruma al pie de la muralla
  const fog = ctx.createLinearGradient(0, base - 120, 0, base + 60);
  fog.addColorStop(0, 'rgba(0,0,0,0)');
  fog.addColorStop(1, p.fog);
  ctx.fillStyle = fog;
  ctx.fillRect(0, base - 120, LAYER_W, 180);
  return c;
}

/** Edificios del patio: herrería, taberna y logia, con estandartes según su nivel. */
export function paintBuildings(time: TimeOfDay, levels: Record<BuildingId, number>): Painted {
  const [c, ctx] = canvas(VIEW_W, VIEW_H);
  const g = GROUND_Y + 6;
  const lights: Light[] = [];
  const stone = time === 'night' ? '#2a2c34' : '#4a4640';
  const wood = time === 'night' ? '#2a1e16' : '#4a3424';
  const roof = time === 'night' ? '#1c1418' : '#3a2420';

  // Herrería: casa de piedra baja, chimenea humeante y la boca de la fragua.
  {
    const x = BUILDING_X.smithy;
    rect(ctx, x - 110, g - 130, 220, 130, stone);
    shape(ctx, [x - 125, g - 128, x - 20, g - 200, x + 125, g - 128], roof);
    rect(ctx, x + 50, g - 230, 34, 80, stone);
    ctx.fillStyle = 'rgba(40, 36, 34, 0.45)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(x + 70 + i * 9, g - 250 - i * 26, 14 + i * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    shape(ctx, [x - 70, g, x - 70, g - 70, x - 40, g - 92, x - 10, g - 70, x - 10, g], levels.smithy ? '#ff7a2a' : '#2a1a10');
    if (levels.smithy) lights.push({ x: x - 40, y: g - 40, scale: 1.4, alpha: 0.9 });
    // Yunque
    shape(ctx, [x + 22, g - 30, x + 72, g - 30, x + 62, g - 20, x + 52, g - 20, x + 56, g, x + 36, g, x + 40, g - 20, x + 30, g - 20], '#2a2a2e');
    lit(ctx, x + 30, g - 100, 26, 26, levels.smithy > 0);
    banners(ctx, x - 100, g - 132, levels.smithy);
  }

  // Taberna: dos plantas de entramado, ventanas encendidas y un letrero colgante.
  {
    const x = BUILDING_X.tavern;
    rect(ctx, x - 120, g - 200, 240, 200, wood);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    for (const lx of [-120, -40, 40, 120]) {
      ctx.beginPath();
      ctx.moveTo(x + lx, g - 200);
      ctx.lineTo(x + lx, g);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x - 120, g - 100);
    ctx.lineTo(x + 120, g - 100);
    ctx.stroke();
    shape(ctx, [x - 140, g - 198, x, g - 300, x + 140, g - 198], roof);
    lit(ctx, x - 95, g - 170, 34, 40);
    lit(ctx, x + 60, g - 170, 34, 40);
    lit(ctx, x - 20, g - 260, 40, 30, levels.tavern > 0);
    rect(ctx, x - 22, g - 76, 44, 76, '#1a120c');
    lit(ctx, x - 100, g - 74, 40, 34);
    lights.push({ x: x - 78, y: g - 150, scale: 1.1, alpha: 0.55 }, { x: x + 78, y: g - 150, scale: 1.1, alpha: 0.55 });
    // Letrero
    ctx.beginPath();
    ctx.moveTo(x + 120, g - 120);
    ctx.lineTo(x + 170, g - 120);
    ctx.stroke();
    rect(ctx, x + 140, g - 116, 44, 30, '#6a4a2a', 2.5);
    ctx.fillStyle = '#d9a93a';
    ctx.font = 'bold 18px serif';
    ctx.fillText('⚱', x + 152, g - 94);
    banners(ctx, x - 112, g - 202, levels.tavern);
  }

  // Logia de constructores: nave de madera con andamio y una grúa.
  {
    const x = BUILDING_X.lodge;
    rect(ctx, x - 110, g - 140, 200, 140, wood);
    shape(ctx, [x - 124, g - 138, x - 10, g - 206, x + 104, g - 138], roof);
    rect(ctx, x - 40, g - 80, 60, 80, '#1a120c');
    lit(ctx, x + 40, g - 110, 28, 28, levels.lodge > 0);
    // Andamio
    ctx.strokeStyle = '#6a5038';
    ctx.lineWidth = 4;
    for (const ax of [x + 100, x + 150]) {
      ctx.beginPath();
      ctx.moveTo(ax, g);
      ctx.lineTo(ax, g - 200);
      ctx.stroke();
    }
    for (const ay of [g - 60, g - 130, g - 196]) {
      ctx.beginPath();
      ctx.moveTo(x + 94, ay);
      ctx.lineTo(x + 156, ay);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x + 100, g);
    ctx.lineTo(x + 150, g - 130);
    ctx.stroke();
    // Grúa
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + 125, g - 196);
    ctx.lineTo(x + 125, g - 270);
    ctx.lineTo(x + 30, g - 250);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 40, g - 252);
    ctx.lineTo(x + 40, g - 215);
    ctx.stroke();
    rect(ctx, x + 30, g - 215, 22, 16, stone, 2);
    // Pila de piedra y troncos
    for (let i = 0; i < 3; i++) rect(ctx, x - 100 + i * 20, g - 18 - (i % 2) * 6, 26, 16, stone, 2);
    banners(ctx, x - 104, g - 142, levels.lodge);
  }
  if (time !== 'day') {
    lights.push({ x: 120, y: g - 60, scale: 1.6, alpha: 0.5 }, { x: 1180, y: g - 60, scale: 1.6, alpha: 0.5 });
  }
  return { canvas: c, lights };
}

/** Lo que hay en un nodo: campamento o torre, botín sin recoger y fogata. */
export function paintNodeProps(time: TimeOfDay, o: { structure: Structure | null; loot: boolean; castle?: boolean }): Painted {
  const [c, ctx] = canvas(VIEW_W, VIEW_H);
  const g = GROUND_Y + 4;
  const lights: Light[] = [];
  const wood = time === 'night' ? '#2a1e16' : '#4a3424';
  const cloth = time === 'night' ? '#3a3226' : '#7a6a4a';

  if (o.structure === 'camp' || o.structure === 'tower') {
    // Tienda
    const x = 860;
    shape(ctx, [x - 80, g, x, g - 110, x + 80, g], cloth);
    shape(ctx, [x - 18, g, x, g - 64, x + 18, g], '#1a140e', INK, 2);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, g - 110);
    ctx.lineTo(x, g - 130);
    ctx.stroke();
    // Hoguera
    const fx = 720;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = '#5a5048';
      ctx.beginPath();
      ctx.ellipse(fx - 30 + i * 15, g + 2, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#3a2416';
    ctx.beginPath();
    ctx.moveTo(fx - 26, g - 2);
    ctx.lineTo(fx + 22, g - 18);
    ctx.moveTo(fx + 26, g - 2);
    ctx.lineTo(fx - 22, g - 18);
    ctx.stroke();
    shape(ctx, [fx - 18, g - 8, fx - 8, g - 46, fx + 1, g - 26, fx + 8, g - 58, fx + 20, g - 8], '#d8461a', '#5a1a08', 2);
    shape(ctx, [fx - 8, g - 8, fx - 2, g - 30, fx + 4, g - 20, fx + 8, g - 36, fx + 11, g - 8], '#ffb040', '#d8461a', 1);
    lights.push({ x: fx, y: g - 30, scale: 2.4, alpha: 0.85 });
  }
  if (o.structure === 'tower') {
    // Torre de vigía de madera
    const x = 1050;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    for (const [x0, x1] of [[-60, -36], [60, 36]]) {
      shape(ctx, [x + x0 - 6, g, x + x1 - 6, g - 250, x + x1 + 6, g - 250, x + x0 + 6, g], wood);
    }
    for (const y of [g - 70, g - 150]) {
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#3a2416';
      ctx.beginPath();
      ctx.moveTo(x - 56, y);
      ctx.lineTo(x + 56, y - 60);
      ctx.moveTo(x + 56, y);
      ctx.lineTo(x - 56, y - 60);
      ctx.stroke();
    }
    rect(ctx, x - 60, g - 290, 120, 44, wood);
    for (let i = 0; i < 6; i++) rect(ctx, x - 56 + i * 20, g - 310, 12, 22, wood, 2);
    shape(ctx, [x - 74, g - 310, x, g - 370, x + 74, g - 310], '#3a2420');
    // Brasero en lo alto
    lights.push({ x, y: g - 280, scale: 1.3, alpha: 0.7 });
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, g - 370);
    ctx.lineTo(x, g - 400);
    ctx.stroke();
    shape(ctx, [x, g - 400, x + 26, g - 394, x, g - 386], '#7a1e1a', INK, 2);
  }
  if (o.loot) {
    // Cofre entreabierto con un brillo
    const x = 790;
    rect(ctx, x - 30, g - 34, 60, 34, '#5a3a20');
    shape(ctx, [x - 32, g - 34, x - 26, g - 52, x + 26, g - 52, x + 32, g - 34], '#6a4a28');
    rect(ctx, x - 6, g - 30, 12, 12, '#d9a93a', 2);
    lights.push({ x, y: g - 30, scale: 0.7, alpha: 0.6 });
  }
  return { canvas: c, lights };
}
