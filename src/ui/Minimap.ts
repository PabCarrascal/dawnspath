import { Hex, fromWorld, toWorld } from '../core/hex';
import { BALANCE } from '../game/config';
import type { Game } from '../game/Game';

const TERRAIN_COLORS = {
  plain: '#7fb24a',
  forest: '#3f7a3a',
  mountain: '#8a857e',
  river: '#2b86b8',
  ford: '#6fb3c8',
};

/**
 * Minimapa 2D en canvas: terreno explorado, territorio, unidades, el Rey
 * y el encuadre de la cámara. Un clic centra la cámara en ese punto.
 */
export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scale = 1;
  private size = 0;
  private time = 0;

  constructor(
    container: HTMLElement,
    private game: Game,
    onPick: (h: Hex) => void,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap-canvas';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    this.canvas.addEventListener('click', (e) => {
      const r = this.canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * this.size - this.size / 2;
      const y = ((e.clientY - r.top) / r.height) * this.size - this.size / 2;
      const h = fromWorld(x / this.scale, y / this.scale, 1);
      if (this.game.tile(h)) onPick(h);
    });
  }

  private resize() {
    const css = this.canvas.clientWidth || 180;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.size = css * dpr;
    this.canvas.width = this.canvas.height = this.size;
    // Ancho del tablero en unidades del mundo, con un pequeño margen.
    this.scale = this.size / (2 * (BALANCE.mapRadius * Math.sqrt(3) + 1.2));
  }

  /** `view` es el punto que mira la cámara, en coordenadas del mundo. */
  draw(dt: number, view: { x: number; z: number; yaw: number }, night: number) {
    this.time += dt / 1000;
    if (this.canvas.width !== Math.round((this.canvas.clientWidth || 180) * Math.min(window.devicePixelRatio || 1, 2))) this.resize();
    const ctx = this.ctx;
    const s = this.scale;
    const c = this.size / 2;
    ctx.clearRect(0, 0, this.size, this.size);

    const hexPath = (h: Hex, r = 0.96) => {
      const w = toWorld(h, 1);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 30);
        const x = c + (w.x + Math.cos(a) * r) * s;
        const y = c + (w.z + Math.sin(a) * r) * s;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };

    for (const t of this.game.state.tiles.values()) {
      hexPath(t);
      if (!t.explored) {
        ctx.fillStyle = 'rgba(30, 34, 52, 0.85)';
      } else {
        ctx.fillStyle = TERRAIN_COLORS[t.terrain];
        ctx.globalAlpha = t.visible ? 1 : 0.45;
      }
      ctx.fill();
      ctx.globalAlpha = 1;
      if (t.owned) {
        ctx.strokeStyle = 'rgba(255, 210, 122, 0.9)';
        ctx.lineWidth = Math.max(1, s * 0.12);
        hexPath(t, 0.78);
        ctx.stroke();
      }
      if (t.poi && t.explored) {
        const w = toWorld(t, 1);
        const colors = { ruins: '#ffd27a', village: '#f4e3b8', shrine: '#8ff0ff' };
        ctx.fillStyle = t.poiUsed && t.poi === 'ruins' ? 'rgba(160,150,130,0.8)' : colors[t.poi];
        ctx.beginPath();
        ctx.moveTo(c + w.x * s, c + w.z * s - s * 0.42);
        ctx.lineTo(c + w.x * s + s * 0.36, c + w.z * s);
        ctx.lineTo(c + w.x * s, c + w.z * s + s * 0.42);
        ctx.lineTo(c + w.x * s - s * 0.36, c + w.z * s);
        ctx.closePath();
        ctx.fill();
      }
      if (t.structure && t.explored) {
        const w = toWorld(t, 1);
        const x = c + w.x * s;
        const y = c + w.z * s;
        if (t.structure === 'castle') {
          ctx.fillStyle = '#ffd27a';
          ctx.fillRect(x - s * 0.5, y - s * 0.5, s, s);
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.lineWidth = Math.max(1, s * 0.1);
          ctx.strokeRect(x - s * 0.5, y - s * 0.5, s, s);
        } else {
          const colors: Record<string, string> = {
            tower: '#e8e2d4',
            outpost: '#ff9a40',
            farm: '#f2d24b',
            sawmill: '#b07a4a',
            quarry: '#a9a39a',
            house: '#e4d3ad',
            bridge: '#8a5a34',
            wall: '#c9c3b8',
            market: '#3f9ad9',
            barracks: '#c0392b',
            archery: '#5aa64a',
            forge: '#555560',
            beacon: '#fff0a0',
          };
          ctx.fillStyle = colors[t.structure] ?? '#ffffff';
          ctx.globalAlpha = t.work ? 0.5 : 1;
          ctx.fillRect(x - s * 0.22, y - s * 0.22, s * 0.44, s * 0.44);
          ctx.globalAlpha = 1;
        }
      }
    }

    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
    for (const u of this.game.state.units) {
      if (!this.game.isUnitVisible(u)) continue;
      const w = toWorld(u, 1);
      const x = c + w.x * s;
      const y = c + w.z * s;
      ctx.beginPath();
      if (u.kind === 'king') {
        ctx.fillStyle = '#c055ff';
        ctx.arc(x, y, s * (0.5 + pulse * 0.12), 0, Math.PI * 2);
      } else if (u.kind === 'lair') {
        ctx.fillStyle = '#8a2cff';
        ctx.arc(x, y, s * 0.42, 0, Math.PI * 2);
      } else if (u.team === 'night') {
        ctx.fillStyle = '#ff4a5a';
        ctx.arc(x, y, s * 0.32, 0, Math.PI * 2);
      } else {
        ctx.fillStyle = u.kind === 'hero' ? '#5ea0ff' : '#d8dee8';
        ctx.arc(x, y, s * (u.kind === 'hero' ? 0.42 : 0.32), 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.lineWidth = Math.max(1, s * 0.08);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.stroke();
    }

    // Faro del Rey si aún no se conoce su posición
    const king = this.game.king;
    if (king && !this.game.isUnitVisible(king)) {
      const w = toWorld(king, 1);
      ctx.fillStyle = `rgba(192, 85, 255, ${0.35 + pulse * 0.35})`;
      ctx.beginPath();
      ctx.arc(c + w.x * s, c + w.z * s, s * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Encuadre de la cámara
    ctx.save();
    ctx.translate(c + view.x * s, c + view.z * s);
    ctx.rotate(-view.yaw);
    ctx.strokeStyle = night > 0.5 ? 'rgba(200, 180, 255, 0.9)' : 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = Math.max(1, s * 0.1);
    ctx.strokeRect(-s * 3.2, -s * 2.2, s * 6.4, s * 4.4);
    ctx.restore();
  }
}
