import { Px } from './pixel';

/** Cuadros de animación de reposo por sprite. */
export const FRAMES = 2;

const OUTLINE = 0x1a1220;
const SKIN = [0xf2c8a0, 0xd8a078];

export type SpriteKind = 'hero' | 'spearman' | 'archer' | 'chaplain' | 'shade' | 'brute' | 'stalker' | 'herald';

/** Tamaño de cada cuadro en píxeles; los pies quedan siempre en la última fila. */
export const SPRITE_SIZE: Record<SpriteKind, [number, number]> = {
  hero: [32, 40],
  spearman: [32, 40],
  archer: [32, 40],
  chaplain: [32, 40],
  shade: [32, 40],
  brute: [48, 48],
  stalker: [44, 34],
  herald: [44, 58],
};

/** Tres tonos por material: luz, base y sombra (la luz viene de arriba a la izquierda). */
const C = {
  steel: [0xd8e0ea, 0xa8b2c0, 0x6a7484],
  blue: [0x4a7ad0, 0x2f5aa8, 0x1f3a78],
  red: [0xe05040, 0xb02a2a, 0x7a1a1a],
  leather: [0xb07a48, 0x8a5a30, 0x5e3a1c],
  green: [0x5a9a48, 0x3a7a34, 0x24502a],
  white: [0xfaf6ea, 0xe0d8c4, 0xa89c84],
  gold: [0xffe08a, 0xd8a83a, 0x9a6a1a],
  pants: [0x5a5a6a, 0x44444e, 0x2e2e38],
  boots: [0x7a5030, 0x5a3820, 0x3a2414],
  wood: [0xa07040, 0x7a5030, 0x553418],
  hair: [0xe0a050, 0xb87830, 0x7a4a1a],
};

/** Rectángulo con su columna izquierda iluminada y las dos derechas en sombra. */
function shaded(p: Px, x: number, y: number, w: number, h: number, tones: number[]) {
  p.rect(x, y, w, h, tones[1]);
  p.rect(x, y, 1, h, tones[0]);
  p.rect(x + w - 2, y, 2, h, tones[2]);
  p.rect(x, y, w, 1, tones[0]);
}

function legs(p: Px, pants: number[], boots: number[]) {
  shaded(p, 13, 31, 3, 6, pants);
  shaded(p, 17, 31, 3, 6, pants);
  shaded(p, 13, 36, 3, 3, boots);
  shaded(p, 17, 36, 4, 3, boots);
}

function face(p: Px, dy: number) {
  shaded(p, 12, 11 + dy, 10, 10, SKIN.concat(SKIN[1]));
  p.rect(13, 12 + dy, 8, 8, SKIN[0]);
  p.rect(20, 12 + dy, 2, 8, SKIN[1]);
  // Ojos mirando a la derecha
  p.rect(18, 15 + dy, 1, 2, 0x2a1a1a);
  p.rect(15, 15 + dy, 1, 2, 0x2a1a1a);
  p.set(18, 15 + dy, 0x4a3a5a);
  p.set(19, 19 + dy, 0xc88070);
}

function drawHero(p: Px, dy: number) {
  // Capa por detrás, ondeando hacia la izquierda
  for (let y = 20; y < 37; y++) {
    const w = 3 + Math.floor((y - 20) / 3);
    p.rect(12 - w + 2, y + (y > 30 ? 0 : dy), w, 1, y % 3 ? C.red[1] : C.red[2]);
  }
  legs(p, C.pants, C.boots);
  shaded(p, 11, 21 + dy, 10, 11, C.blue);
  p.rect(11, 28 + dy, 10, 1, C.leather[2]);
  p.set(16, 28 + dy, C.gold[0]);
  // Hombrera
  shaded(p, 10, 21 + dy, 4, 3, C.steel);
  face(p, dy);
  // Yelmo con penacho
  shaded(p, 11, 8 + dy, 11, 6, C.steel);
  p.rect(11, 14 + dy, 3, 6, C.steel[2]);
  p.rect(14, 13 + dy, 8, 1, C.steel[1]);
  p.rect(14, 4 + dy, 4, 4, C.red[1]);
  p.rect(13, 5 + dy, 1, 2, C.red[0]);
  p.rect(17, 5 + dy, 2, 3, C.red[2]);
  // Brazo, mano y espada en alto
  shaded(p, 19, 22 + dy, 3, 6, C.blue);
  p.rect(20, 28 + dy, 2, 2, SKIN[0]);
  p.rect(23, 12 + dy, 1, 16, C.steel[0]);
  p.rect(24, 12 + dy, 1, 16, C.steel[2]);
  p.rect(21, 28 + dy, 5, 1, C.gold[1]);
  p.rect(23, 29 + dy, 2, 3, C.leather[2]);
}

function drawSpearman(p: Px, dy: number) {
  // Lanza por detrás del cuerpo
  p.rect(24, 4 + dy, 1, 35 - dy, C.wood[1]);
  p.rect(25, 4 + dy, 1, 35 - dy, C.wood[2]);
  p.rect(24, 0 + dy, 2, 4, C.steel[0]);
  p.set(23, 3 + dy, C.steel[1]);
  p.set(26, 3 + dy, C.steel[2]);
  legs(p, C.pants, C.boots);
  shaded(p, 11, 21 + dy, 10, 11, C.leather);
  // Peto con remaches
  shaded(p, 12, 22 + dy, 8, 5, C.steel);
  p.set(14, 24 + dy, C.steel[2]);
  p.set(17, 24 + dy, C.steel[2]);
  p.rect(11, 28 + dy, 10, 1, C.leather[2]);
  face(p, dy);
  // Barba
  p.rect(16, 18 + dy, 6, 3, C.hair[2]);
  p.rect(17, 18 + dy, 3, 1, C.hair[1]);
  // Capacete de ala ancha
  shaded(p, 11, 8 + dy, 11, 5, C.steel);
  p.rect(9, 13 + dy, 15, 1, C.steel[2]);
  p.rect(10, 12 + dy, 13, 1, C.steel[1]);
  // Escudo redondo en el brazo de atrás
  for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 26) p.set(10 + x, 27 + dy + y, x + y < -3 ? C.red[0] : x + y > 3 ? C.red[2] : C.red[1]);
  p.set(10, 27 + dy, C.gold[0]);
  // Brazo y mano sobre la lanza
  shaded(p, 20, 22 + dy, 3, 6, C.leather);
  p.rect(22, 26 + dy, 3, 2, SKIN[0]);
}

function drawArcher(p: Px, dy: number) {
  // Carcaj a la espalda con plumas
  shaded(p, 8, 17 + dy, 3, 12, C.leather);
  p.rect(8, 14 + dy, 1, 3, C.white[1]);
  p.rect(10, 13 + dy, 1, 4, C.red[1]);
  legs(p, C.leather, C.boots);
  // Capa verde larga
  shaded(p, 10, 20 + dy, 11, 14, C.green);
  p.rect(11, 27 + dy, 9, 1, C.leather[2]);
  face(p, dy);
  // Capucha que deja ver solo la cara
  shaded(p, 10, 8 + dy, 12, 5, C.green);
  p.rect(10, 13 + dy, 4, 9, C.green[1]);
  p.rect(10, 13 + dy, 1, 9, C.green[0]);
  p.rect(21, 9 + dy, 2, 4, C.green[2]);
  p.rect(14, 12 + dy, 8, 1, C.green[2]);
  // Mechón de pelo
  p.rect(14, 13 + dy, 3, 2, C.hair[1]);
  // Arco tensado delante
  for (let y = 13; y <= 35; y++) {
    const t = (y - 24) / 11;
    const x = 25 - Math.round((1 - t * t) * 3);
    p.set(x, y + dy, C.wood[0]);
    p.set(x + 1, y + dy, C.wood[2]);
  }
  p.rect(25, 13 + dy, 1, 23, 0xe8e0d0);
  shaded(p, 19, 22 + dy, 3, 5, C.green);
  p.rect(21, 25 + dy, 2, 2, SKIN[0]);
}

function drawChaplain(p: Px, dy: number) {
  // Túnica larga hasta los pies
  for (let y = 20; y < 39; y++) {
    const spread = Math.floor((y - 20) / 4);
    shaded(p, 11 - spread, y + (y < 34 ? dy : 0), 10 + spread * 2, 1, C.white);
  }
  p.rect(15, 21 + dy, 2, 16, C.gold[1]);
  p.rect(10, 37, 4, 2, C.boots[2]);
  p.rect(17, 37, 4, 2, C.boots[2]);
  face(p, dy);
  // Toca con ribete dorado
  shaded(p, 10, 8 + dy, 12, 5, C.white);
  p.rect(10, 13 + dy, 3, 10, C.white[1]);
  p.rect(10, 13 + dy, 1, 10, C.white[0]);
  p.rect(13, 12 + dy, 9, 1, C.gold[1]);
  // Farol en la mano
  shaded(p, 19, 22 + dy, 3, 5, C.white);
  p.rect(21, 26 + dy, 2, 2, SKIN[0]);
  p.rect(23, 25 + dy, 1, 3, 0x3a3a44);
  shaded(p, 22, 28 + dy, 4, 6, [0xfff4b0, 0xffd860, 0xd89a2a]);
  p.rect(22, 28 + dy, 4, 1, 0x3a3a44);
  p.rect(22, 33 + dy, 4, 1, 0x3a3a44);
}

function drawShade(p: Px, dy: number) {
  // Silueta de humo con ojos rojos; flota, así que todo sube y baja
  const body = [0x3a2a4a, 0x241a30, 0x140e1c];
  for (let y = 8; y < 38; y++) {
    const t = (y - 8) / 30;
    const w = Math.round(6 + Math.sin(t * Math.PI) * 6 + t * 2);
    const x0 = 16 - Math.floor(w / 2) + Math.round(Math.sin(y * 0.6) * (t * 1.5));
    if (y > 34 && (y + dy) % 2) continue;
    shaded(p, x0, y + dy, w, 1, body);
  }
  p.rect(17, 15 + dy, 2, 2, 0xff3a4a);
  p.rect(20, 15 + dy, 2, 2, 0xff3a4a);
  p.set(17, 15 + dy, 0xffc0c0);
  p.set(20, 15 + dy, 0xffc0c0);
}

/** Elipse rellena con luz arriba a la izquierda y sombra abajo a la derecha. */
function blob(p: Px, cx: number, cy: number, rx: number, ry: number, tones: number[]) {
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if (d > 1) continue;
      const lit = x / rx + y / ry;
      p.set(cx + x, cy + y, lit < -0.7 ? tones[0] : lit > 0.6 || d > 0.85 ? tones[2] : tones[1]);
    }
  }
}

function line(p: Px, x0: number, y0: number, x1: number, y1: number, color: number, w = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    p.rect(x, y, w, w, color);
  }
}

function drawBrute(p: Px, dy: number) {
  const hide = [0x6a4a5a, 0x4a3040, 0x2e1c28];
  // Patas cortas y gruesas
  shaded(p, 15, 37, 6, 10, hide);
  shaded(p, 25, 37, 7, 10, hide);
  p.rect(14, 45, 8, 2, 0x1e1218);
  p.rect(24, 45, 9, 2, 0x1e1218);
  // Cuerpo encorvado
  blob(p, 23, 27 + dy, 15, 13, hide);
  blob(p, 27, 31 + dy, 7, 6, [0x8a6a6a, 0x6a4e50, 0x4e3638]);
  // Cabeza hundida entre los hombros, adelantada
  blob(p, 34, 16 + dy, 7, 6, hide);
  line(p, 31, 11 + dy, 28, 3 + dy, 0xe8dcc0, 2);
  line(p, 38, 11 + dy, 42, 3 + dy, 0xd0c4a8, 2);
  p.rect(35, 15 + dy, 2, 2, 0xff8a22);
  p.rect(39, 15 + dy, 2, 2, 0xff8a22);
  p.set(35, 15 + dy, 0xffe0a0);
  p.rect(36, 19 + dy, 5, 1, 0x1e1218);
  p.set(37, 20 + dy, 0xe8dcc0);
  // Brazo y garrote con púas
  shaded(p, 33, 22 + dy, 5, 11, hide);
  line(p, 38, 33 + dy, 44, 8 + dy, C.wood[1], 3);
  line(p, 39, 33 + dy, 45, 8 + dy, C.wood[2], 1);
  blob(p, 44, 9 + dy, 3, 5, C.wood);
  for (const [x, y] of [[41, 6], [47, 9], [43, 3], [46, 13]]) p.set(x, y + dy, 0xe8dcc0);
  p.rect(36, 31 + dy, 4, 3, hide[0]);
}

function drawStalker(p: Px, dy: number) {
  const shell = [0x6a3a8a, 0x4a2464, 0x2a123c];
  const leg = 0x1e1028;
  // Patas articuladas: alternan al respirar
  const sw = dy ? 1 : 0;
  for (const [hx, kx, fx] of [[14, 8 - sw, 5], [18, 14 + sw, 13], [24, 28 - sw, 26], [28, 36 + sw, 37]]) {
    line(p, hx, 18, kx, 10 + dy, leg, 2);
    line(p, kx, 10 + dy, fx, 33, leg, 2);
  }
  // Aguijón curvado hacia arriba por detrás
  line(p, 9, 16 + dy, 4, 8 + dy, shell[1], 2);
  line(p, 4, 8 + dy, 6, 3 + dy, shell[2], 2);
  p.set(7, 2 + dy, 0xc080ff);
  blob(p, 18, 17 + dy, 10, 6, shell);
  blob(p, 31, 15 + dy, 6, 5, shell);
  // Ojos en racimo
  for (const [x, y] of [[33, 13], [35, 14], [34, 16], [36, 12]]) p.set(x, y + dy, 0xd080ff);
  p.set(35, 14 + dy, 0xffffff);
  line(p, 36, 18 + dy, 40, 20 + dy, 0xa08cc0, 1);
}

function drawHerald(p: Px, dy: number) {
  const robe = [0x3a2a4e, 0x241a34, 0x140e1e];
  // Guadaña detrás: asta y hoja curva
  line(p, 33, 12 + dy, 33, 57, C.wood[2], 2);
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const x = Math.round(34 + t * 9);
    const y = Math.round(12 + dy - Math.sin(t * Math.PI) * 6 + t * 7);
    p.rect(x, y, 2, 2, t > 0.8 ? 0xe8ecf4 : 0xb8bcc8);
    p.set(x, y + 2, 0x6a7080);
  }
  // Túnica larga y deshilachada
  for (let y = 18; y < 58; y++) {
    const t = (y - 18) / 40;
    const w = Math.round(10 + t * 12);
    const x0 = 20 - Math.floor(w / 2);
    if (y > 54 && (y + Math.floor(t * 9)) % 3 === 0) continue;
    shaded(p, x0, y + (y < 50 ? dy : 0), w, 1, robe);
  }
  p.rect(18, 30 + dy, 6, 2, 0x5a4a7a);
  blob(p, 21, 34 + dy, 2, 2, [0xb0e0ff, 0x6ab0ff, 0x2a6ac0]);
  // Calavera con corona de púas
  blob(p, 21, 13 + dy, 6, 7, [0xf4ecd8, 0xd8d0bc, 0xa89c88]);
  p.rect(18, 12 + dy, 3, 3, 0x14101c);
  p.rect(23, 12 + dy, 3, 3, 0x14101c);
  p.set(19, 13 + dy, 0x7ac0ff);
  p.set(24, 13 + dy, 0x7ac0ff);
  p.rect(20, 18 + dy, 5, 1, 0x14101c);
  for (let k = 0; k < 5; k++) line(p, 15 + k * 3, 7 + dy, 14 + k * 3 + (k - 2), 0 + dy + Math.abs(k - 2), 0x2a2034, 2);
  // Brazo huesudo sobre el asta
  line(p, 26, 24 + dy, 32, 28 + dy, robe[1], 3);
  p.rect(31, 27 + dy, 3, 3, 0xd8d0bc);
}

const DRAW: Record<SpriteKind, (p: Px, dy: number) => void> = {
  hero: drawHero,
  spearman: drawSpearman,
  archer: drawArcher,
  chaplain: drawChaplain,
  shade: drawShade,
  brute: drawBrute,
  stalker: drawStalker,
  herald: drawHerald,
};

/** Hoja de sprites de un personaje: cuadros de reposo en fila, con contorno. */
export function spriteSheet(kind: SpriteKind): Px {
  const [w, h] = SPRITE_SIZE[kind];
  const sheet = new Px(w * FRAMES, h);
  for (let f = 0; f < FRAMES; f++) {
    const frame = new Px(w, h);
    DRAW[kind](frame, f);
    frame.outline(OUTLINE);
    sheet.blit(frame, f * w, 0);
  }
  return sheet;
}
