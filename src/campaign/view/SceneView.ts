import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Biome } from '../../combat/rules/data';
import { UNITS } from '../../combat/rules/data';
import type { Fighter } from '../../combat/rules/types';
import { GROUND_Y, LAYER_W, SKY_EXTRA, TimeOfDay, VIEW_W, paintBackdrop } from '../../combat/view/backdrop';
import { FighterView } from '../../combat/view/FighterView';
import type { Soldier } from '../rules/types';
import type { Painted } from './props';

/** Mismas posiciones que en combate: el grupo a la izquierda, 1 = la más cercana al centro. */
export const PARTY_X = [560, 418, 276, 134];

interface Layer {
  sprite: Sprite;
  depth: number;
}

/** Un soldado de la campaña como figura de escena (sin combate). */
export function soldierFighter(s: Soldier, rank: number, maxHp: number): Fighter {
  const t = UNITS[s.kind];
  return {
    ...structuredClone(t),
    id: rank,
    side: 'party',
    name: s.name,
    rank,
    hp: s.hp,
    maxHp,
    stress: s.stress,
    statuses: [],
    deathsDoor: false,
    affliction: s.affliction,
    alive: true,
    ref: s.id,
  };
}

/**
 * Escena lateral sin combate (castillo y nodos): capas con paralaje, una
 * antorcha y figuras. Comparte la aplicación Pixi con el combate.
 */
export class SceneView {
  readonly root = new Container();
  readonly world = new Container();
  /** Estructuras, cofres y decorados sobre el suelo. */
  readonly props = new Container();
  readonly actors = new Container();
  private layers: Layer[] = [];
  private textures: Texture[] = [];
  private torch: Sprite;
  private torchBase: number;
  private fog: Sprite;
  private flames: { sprite: Sprite; base: number }[] = [];
  private figures: FighterView[] = [];
  private pointerX = 0.5;
  private time = 0;

  constructor(
    readonly app: Application,
    readonly tod: TimeOfDay,
    seed: number,
    biome: Biome,
    extra?: (layer: (c: HTMLCanvasElement, depth: number) => Sprite) => void,
  ) {
    const bd = paintBackdrop(tod, seed, biome);
    const layer = (c: HTMLCanvasElement, depth: number) => {
      const s = new Sprite(this.tex(c));
      s.x = -(LAYER_W - VIEW_W) / 2;
      if (c === bd.sky) s.y = -SKY_EXTRA;
      this.layers.push({ sprite: s, depth });
      return s;
    };
    this.world.addChild(layer(bd.sky, 0.05), layer(bd.far, 0.15), layer(bd.mid, 0.35));
    extra?.((c, depth) => {
      const s = layer(c, depth);
      this.world.addChild(s);
      return s;
    });
    this.glowTex = this.tex(bd.glow);
    this.torch = new Sprite(this.glowTex);
    this.torch.anchor.set(0.5);
    this.torch.blendMode = 'add';
    this.torch.position.set(360, GROUND_Y - 70);
    this.torchBase = tod === 'day' ? 2.2 : 4.2;
    this.torch.alpha = tod === 'day' ? 0.22 : 0.65;
    this.world.addChild(layer(bd.ground, 0.6), this.props, this.torch, this.actors);

    const fogCanvas = document.createElement('canvas');
    fogCanvas.width = LAYER_W;
    fogCanvas.height = 160;
    const fctx = fogCanvas.getContext('2d')!;
    for (let i = 0; i < 40; i++) {
      const g = fctx.createRadialGradient(0, 0, 0, 0, 0, 140);
      g.addColorStop(0, tod === 'night' ? 'rgba(120,135,180,0.12)' : 'rgba(210,190,160,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      fctx.save();
      fctx.translate(Math.random() * LAYER_W, 60 + Math.random() * 80);
      fctx.scale(2.6, 0.5);
      fctx.fillStyle = g;
      fctx.fillRect(-140, -140, 280, 280);
      fctx.restore();
    }
    this.fog = new Sprite(this.tex(fogCanvas));
    this.fog.position.set(-(LAYER_W - VIEW_W) / 2, GROUND_Y - 90);
    const front = layer(bd.front, 1.1);
    const vignette = new Sprite(this.tex(bd.vignette));
    vignette.position.set(-200, -SKY_EXTRA);
    this.root.addChild(this.world, this.fog, front, vignette);
    app.stage.addChild(this.root);

    app.ticker.add(this.onTick);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointermove', this.onPointer);
    this.resize();
  }

  /** Textura del resplandor, para hogueras y ventanas. */
  readonly glowTex: Texture;

  private tex(c: HTMLCanvasElement) {
    const t = Texture.from(c);
    this.textures.push(t);
    return t;
  }

  private onTick = (t: { deltaMS: number }) => this.tick(t.deltaMS);
  private onResize = () => this.resize();
  private onPointer = (e: PointerEvent) => (this.pointerX = e.clientX / window.innerWidth);

  destroy() {
    this.app.ticker.remove(this.onTick);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointer);
    this.root.destroy({ children: true });
    for (const t of this.textures) t.destroy(true);
    this.textures = [];
  }

  /** Mismo encuadre que el combate: el suelo queda justo encima del panel inferior. */
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const s = Math.min(w / VIEW_W, h / (720 * 0.8));
    this.root.scale.set(s);
    const panel = Math.min(210, h * 0.26);
    this.root.position.set((w - VIEW_W * s) / 2, h - panel - GROUND_Y * s);
  }

  toScreen(x: number, y: number) {
    const p = this.root.toGlobal({ x, y });
    return { x: p.x, y: p.y };
  }

  /** Coloca una figura en el suelo. `facing` -1 la hace mirar a la izquierda. */
  addFigure(f: Fighter, x: number, facing: 1 | -1 = 1, scale = 1): FighterView {
    const v = new FighterView(f);
    v.position.set(x, GROUND_Y);
    if (facing < 0) v.figure.scale.x *= -1;
    v.scale.set(scale);
    this.figures.push(v);
    this.actors.addChild(v);
    return v;
  }

  /** Hoguera o luz que parpadea. */
  addFlame(x: number, y: number, scale: number, alpha = 0.8) {
    const s = new Sprite(this.glowTex);
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.position.set(x, y);
    s.alpha = alpha;
    s.scale.set(scale);
    this.props.addChild(s);
    this.flames.push({ sprite: s, base: scale });
    return s;
  }

  addGraphics(g: Graphics) {
    this.props.addChild(g);
    return g;
  }

  /** Lienzo pintado a tamaño de la vista, con sus luces. */
  addPainted(p: Painted) {
    this.props.addChild(new Sprite(this.tex(p.canvas)));
    for (const l of p.lights) this.addFlame(l.x, l.y, l.scale, l.alpha);
  }

  private tick(dt: number) {
    this.time += dt / 1000;
    for (const v of this.figures) v.tick(dt);
    const off = (this.pointerX - 0.5) * 2;
    for (const l of this.layers) l.sprite.x = -(LAYER_W - VIEW_W) / 2 - off * 60 * l.depth;
    this.fog.x = -(LAYER_W - VIEW_W) / 2 + Math.sin(this.time * 0.07) * 90 - off * 40;
    const flicker = 1 + Math.sin(this.time * 9) * 0.04 + Math.sin(this.time * 23) * 0.03;
    this.torch.scale.set(this.torchBase * flicker);
    this.flames.forEach((f, i) => f.sprite.scale.set(f.base * (1 + Math.sin(this.time * (8 + i) + i) * 0.06 + Math.sin(this.time * 21 + i) * 0.04)));
  }
}
