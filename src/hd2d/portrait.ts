import { SPRITE_SIZE, SpriteKind, spriteSheet } from './characters';

const cache = new Map<string, string>();

/**
 * Retrato en pixel art para la interfaz: la parte de arriba del primer cuadro
 * del sprite, ampliada sin suavizar. `flip` lo hace mirar a la izquierda.
 */
export function portrait(kind: string, flip = false): string {
  const k = (kind in SPRITE_SIZE ? kind : 'shade') as SpriteKind;
  const key = `${k}${flip ? '-l' : ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const sheet = spriteSheet(k).flush();
  const [w, h] = SPRITE_SIZE[k];
  // Cabeza y torso: el 62 % de arriba del cuadro, recortado a lo ancho.
  const ch = Math.round(h * 0.62);
  const cw = Math.min(w, Math.round(ch * 1.05));
  const cx = Math.round((w - cw) / 2);
  const scale = 3;
  const out = document.createElement('canvas');
  out.width = cw * scale;
  out.height = ch * scale;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  if (flip) {
    ctx.translate(out.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(sheet, cx, 0, cw, ch, 0, 0, cw * scale, ch * scale);
  const url = out.toDataURL();
  cache.set(key, url);
  return url;
}
