import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { anim, ease, lerp } from '../../core/anim';
import type { Combat } from '../rules/Combat';
import type { CombatEvent, Fighter } from '../rules/types';
import { GROUND_Y, LAYER_W, SKY_EXTRA, TimeOfDay, VIEW_H, VIEW_W, paintBackdrop } from './backdrop';
import { FighterView } from './FighterView';

/** Posiciones en escena: el grupo a la izquierda (1 = la más cercana al centro). */
const PARTY_X = [560, 418, 276, 134];
const FOE_X = [720, 862, 1004, 1146];
/** Dónde se colocan atacante y objetivo durante la "cámara de ataque". */
const CINE_PARTY_X = 500;
const CINE_FOE_X = 790;

export interface ViewHooks {
  onHover: (id: number | null) => void;
  onClick: (id: number) => void;
}

interface Layer {
  sprite: Sprite;
  depth: number;
}

/**
 * Escena lateral en PixiJS: capas con paralaje, combatientes y la
 * reproducción animada de los eventos del motor.
 */
export class CombatView {
  private textures: Texture[] = [];
  private root = new Container();
  private world = new Container();
  private actors = new Container();
  private fx = new Container();
  private dim = new Graphics();
  private layers: Layer[] = [];
  private torch!: Sprite;
  private torchBase = 1;
  private fogA!: Sprite;
  private views = new Map<number, FighterView>();
  private pointerX = 0.5;
  private time = 0;
  private cine: { ids: number[] } | null = null;

  private constructor(
    readonly app: Application,
    private combat: Combat,
    private hooks: ViewHooks,
  ) {}

  static async create(el: HTMLElement, combat: Combat, time: TimeOfDay, seed: number, hooks: ViewHooks) {
    const app = new Application();
    await app.init({ resizeTo: window, antialias: true, background: '#050407', resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
    el.appendChild(app.canvas);
    app.ticker.add((t) => anim.update(t.deltaMS));
    return CombatView.mount(app, combat, time, seed, hooks);
  }

  /** Monta la escena en una aplicación ya creada (la campaña comparte una sola). */
  static mount(app: Application, combat: Combat, time: TimeOfDay, seed: number, hooks: ViewHooks) {
    const v = new CombatView(app, combat, hooks);
    v.build(time, seed);
    app.ticker.add(v.onTick);
    window.addEventListener('resize', v.onResize);
    window.addEventListener('pointermove', v.onPointer);
    v.resize();
    return v;
  }

  private onTick = (t: { deltaMS: number }) => this.tick(t.deltaMS);
  private onResize = () => this.resize();
  private onPointer = (e: PointerEvent) => (this.pointerX = e.clientX / window.innerWidth);

  /** Quita la escena y libera sus texturas; la aplicación sigue viva. */
  destroy() {
    this.app.ticker.remove(this.onTick);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointer);
    this.root.destroy({ children: true });
    for (const t of this.textures) t.destroy(true);
    this.textures = [];
  }

  private tex(c: HTMLCanvasElement) {
    const t = Texture.from(c);
    this.textures.push(t);
    return t;
  }

  private build(time: TimeOfDay, seed: number) {
    const bd = paintBackdrop(time, seed, this.combat.encounter.biome ?? 'forest');
    const layer = (c: HTMLCanvasElement, depth: number) => {
      const s = new Sprite(this.tex(c));
      s.x = -(LAYER_W - VIEW_W) / 2;
      if (c === bd.sky) s.y = -SKY_EXTRA;
      this.layers.push({ sprite: s, depth });
      return s;
    };
    this.world.addChild(layer(bd.sky, 0.05), layer(bd.far, 0.15), layer(bd.mid, 0.35));

    // Antorcha del grupo: un resplandor que parpadea a la izquierda.
    this.torch = new Sprite(this.tex(bd.glow));
    this.torch.anchor.set(0.5);
    this.torch.blendMode = 'add';
    this.torch.position.set(360, GROUND_Y - 70);
    this.torchBase = time === 'day' ? 2.2 : 4.2;
    this.torch.scale.set(this.torchBase);
    this.torch.alpha = time === 'day' ? 0.25 : 0.7;

    this.world.addChild(layer(bd.ground, 0.6), this.torch, this.actors, this.fx);
    this.dim.rect(-200, -200, VIEW_W + 400, VIEW_H + 400).fill({ color: 0x000000 });
    this.dim.alpha = 0;

    // Bruma baja que se desplaza delante de los combatientes.
    const fogCanvas = document.createElement('canvas');
    fogCanvas.width = LAYER_W;
    fogCanvas.height = 160;
    const fctx = fogCanvas.getContext('2d')!;
    for (let i = 0; i < 40; i++) {
      const g = fctx.createRadialGradient(0, 0, 0, 0, 0, 140);
      g.addColorStop(0, time === 'night' ? 'rgba(120,135,180,0.12)' : 'rgba(210,190,160,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      fctx.save();
      fctx.translate(Math.random() * LAYER_W, 60 + Math.random() * 80);
      fctx.scale(2.6, 0.5);
      fctx.fillStyle = g;
      fctx.fillRect(-140, -140, 280, 280);
      fctx.restore();
    }
    this.fogA = new Sprite(this.tex(fogCanvas));
    this.fogA.position.set(-(LAYER_W - VIEW_W) / 2, GROUND_Y - 90);

    const front = layer(bd.front, 1.1);
    const vignette = new Sprite(this.tex(bd.vignette));
    vignette.position.set(-200, -SKY_EXTRA);
    this.root.addChild(this.world, this.fogA, front, vignette);
    this.world.addChildAt(this.dim, this.world.getChildIndex(this.actors));
    this.app.stage.addChild(this.root);

    for (const f of this.combat.state.fighters) this.addFighter(f);
    this.layout(false);
  }

  private addFighter(f: Fighter) {
    const v = new FighterView(f);
    v.on('pointerover', () => this.hooks.onHover(f.id));
    v.on('pointerout', () => this.hooks.onHover(null));
    v.on('pointertap', () => this.hooks.onClick(f.id));
    this.views.set(f.id, v);
    this.actors.addChild(v);
  }

  private slotX(f: Fighter) {
    return (f.side === 'party' ? PARTY_X : FOE_X)[f.rank - 1];
  }

  /** Coloca a cada combatiente en su posición (animado o al instante). */
  layout(animate = true): Promise<void> {
    const moves: Promise<void>[] = [];
    for (const f of this.combat.state.fighters) {
      const v = this.views.get(f.id)!;
      if (!f.alive) continue;
      const x = this.slotX(f);
      if (!animate) v.position.set(x, GROUND_Y);
      else if (Math.abs(v.x - x) > 1) {
        const x0 = v.x;
        moves.push(anim.tween(380, (k) => (v.x = lerp(x0, x, k)), ease.inOut));
      }
    }
    // Los de delante se dibujan encima de los de detrás.
    this.actors.children.sort((a, b) => Math.abs(b.x - 640) - Math.abs(a.x - 640));
    return Promise.all(moves).then(() => {});
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Escala por el ancho, sin pasarse de alto; el suelo queda justo encima del panel inferior.
    const s = Math.min(w / VIEW_W, h / (VIEW_H * 0.8));
    this.root.scale.set(s);
    const panel = Math.min(210, h * 0.26);
    this.root.position.set((w - VIEW_W * s) / 2, h - panel - GROUND_Y * s);
  }

  /** Coordenadas de pantalla (CSS) de un punto de la escena lógica. */
  toScreen(x: number, y: number) {
    const p = this.root.toGlobal({ x, y });
    return { x: p.x, y: p.y };
  }

  /** Punto sobre la cabeza de un combatiente, en pantalla. */
  headOf(id: number) {
    const v = this.views.get(id);
    if (!v) return { x: 0, y: 0 };
    return v.rig.toGlobal({ x: 0, y: v.fighter.kind === 'brute' ? -300 : v.fighter.kind === 'herald' ? -345 : -255 });
  }

  private tick(dt: number) {
    this.time += dt / 1000;
    for (const v of this.views.values()) v.tick(dt);
    // Paralaje suave con el ratón: el fondo se mueve menos que el primer plano.
    const off = (this.pointerX - 0.5) * 2;
    for (const l of this.layers) l.sprite.x = -(LAYER_W - VIEW_W) / 2 - off * 60 * l.depth;
    this.fogA.x = -(LAYER_W - VIEW_W) / 2 + Math.sin(this.time * 0.07) * 90 - off * 40;
    const flicker = 1 + Math.sin(this.time * 9) * 0.04 + Math.sin(this.time * 23) * 0.03;
    this.torch.scale.set(this.torchBase * flicker);
  }

  // ───────────────────────── selección ─────────────────────────

  setActive(id: number | null) {
    for (const v of this.views.values()) v.active = v.fighter.id === id;
  }

  setTargets(ids: number[], mode: 'enemy' | 'ally') {
    for (const v of this.views.values()) v.targetMode = ids.includes(v.fighter.id) ? mode : 'none';
  }

  // ───────────────────────── efectos ─────────────────────────

  floatText(id: number, text: string, color: string, size = 30, dy = 0) {
    const v = this.views.get(id);
    if (!v) return;
    const t = new Text({
      text,
      style: { fontFamily: 'IM Fell English SC, serif', fontSize: size, fill: color, stroke: { color: '#000000', width: 6 }, align: 'center' },
    });
    t.anchor.set(0.5);
    const base = v.toGlobal({ x: v.rig.x, y: -210 + dy });
    const local = this.fx.toLocal(base);
    t.position.copyFrom(local);
    this.fx.addChild(t);
    anim
      .tween(1100, (k) => {
        t.y = local.y - 50 * k;
        t.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        t.scale.set(k < 0.12 ? 0.6 + (k / 0.12) * 0.5 : 1.1 - k * 0.1);
      }, ease.linear)
      .then(() => t.destroy());
  }

  private flash(v: FighterView, color = 0xff6a5a) {
    const parts = v.figure.children.flatMap((c) => [c, ...(c as Container).children]);
    for (const p of parts) (p as Graphics).tint = color;
    setTimeout(() => {
      for (const p of parts) (p as Graphics).tint = 0xffffff;
    }, 140);
  }

  private shake(v: FighterView, amount = 10) {
    const x0 = v.rig.x;
    return anim.tween(260, (k) => (v.rig.x = x0 + Math.sin(k * Math.PI * 6) * amount * (1 - k)), ease.linear);
  }

  // ───────────────────────── cámara de ataque ─────────────────────────

  private async cineIn(actor: FighterView, targets: FighterView[]) {
    const ids = [actor.fighter.id, ...targets.map((t) => t.fighter.id)];
    this.cine = { ids };
    const actorX = actor.fighter.side === 'party' ? CINE_PARTY_X : CINE_FOE_X;
    const dir = actor.fighter.side === 'party' ? 1 : -1;
    const targetBase = actor.fighter.side === 'party' ? CINE_FOE_X : CINE_PARTY_X;
    const moves: [FighterView, number][] = [[actor, actorX]];
    targets.forEach((t, i) => moves.push([t, targetBase + dir * i * 150]));
    for (const v of this.views.values()) if (!ids.includes(v.fighter.id)) v.alpha = 1;
    const from = moves.map(([v]) => ({ x: v.rig.x, s: v.rig.scale.x }));
    // Al frente los protagonistas.
    for (const [v] of moves) this.actors.setChildIndex(v, this.actors.children.length - 1);
    await anim.tween(260, (k) => {
      this.dim.alpha = 0.62 * k;
      moves.forEach(([v, x], i) => {
        v.rig.x = lerp(from[i].x, x - v.x, k);
        v.rig.scale.set(lerp(from[i].s, 1.15, k));
      });
    }, ease.out);
    // Embestida del atacante hacia sus objetivos.
    const weapon = actor.weapon;
    const r0 = weapon.rotation;
    await anim.tween(150, (k) => {
      actor.rig.x = actorX - actor.x + dir * 34 * k;
      weapon.rotation = r0 - 0.9 * k;
    }, ease.in);
    anim.tween(240, (k) => {
      actor.rig.x = actorX - actor.x + dir * 34 * (1 - k);
      weapon.rotation = lerp(r0 - 0.9, r0, k);
    }, ease.out);
  }

  private async cineOut() {
    if (!this.cine) return;
    const views = this.cine.ids.map((id) => this.views.get(id)!).filter(Boolean);
    this.cine = null;
    await anim.wait(380);
    const from = views.map((v) => ({ x: v.rig.x, s: v.rig.scale.x }));
    await anim.tween(260, (k) => {
      this.dim.alpha = 0.62 * (1 - k);
      views.forEach((v, i) => {
        v.rig.x = lerp(from[i].x, 0, k);
        v.rig.scale.set(lerp(from[i].s, 1, k));
      });
    }, ease.inOut);
    this.layout(false);
  }

  // ───────────────────────── reproducción ─────────────────────────

  /**
   * Reproduce los eventos del motor. `say` muestra textos de la interfaz
   * (rótulos, bocadillos) y `sound` los efectos de audio.
   */
  async play(
    events: CombatEvent[],
    ui: {
      banner: (text: string, tone: 'bad' | 'good' | 'epic', sub?: string) => void;
      bark: (id: number, text: string) => void;
      log: (text: string, tone?: 'bad' | 'good' | 'info') => void;
      round: (round: number, order: number[]) => void;
      turn: (id: number) => void;
      sound: (name: string) => void;
    },
  ) {
    const name = (id: number) => this.combat.fighter(id)?.name ?? '';
    for (const ev of events) {
      const endsCine = ev.type === 'turn' || ev.type === 'round' || ev.type === 'skill' || ev.type === 'end' || ev.type === 'ranks';
      if (this.cine && endsCine) await this.cineOut();

      switch (ev.type) {
        case 'round':
          ui.round(ev.round, ev.order);
          break;
        case 'turn':
          this.setActive(ev.id);
          ui.turn(ev.id);
          await anim.wait(120);
          break;
        case 'skip': {
          this.floatText(ev.id, ev.reason === 'stun' ? 'Aturdido' : 'Paralizado', '#f2d24b', 26);
          ui.log(`${name(ev.id)} pierde el turno${ev.reason === 'stun' ? ' (aturdido)' : ' por el miedo'}.`, 'bad');
          await anim.wait(600);
          break;
        }
        case 'skill': {
          const actor = this.views.get(ev.actor)!;
          const skill = this.combat.skill(ev.skill);
          ui.log(`${name(ev.actor)}: ${skill.name}.`);
          ui.banner(skill.name, actor.fighter.side === 'party' ? 'good' : 'bad');
          if (skill.target.side === 'enemy') {
            ui.sound(skill.dmg && skill.from.includes(3) && actor.fighter.kind === 'archer' ? 'zap' : 'swing');
            await this.cineIn(actor, ev.targets.map((id) => this.views.get(id)!).filter(Boolean));
          } else {
            ui.sound('heal');
            const r0 = actor.rig.y;
            await anim.tween(320, (k) => (actor.rig.y = r0 - Math.sin(k * Math.PI) * 18), ease.out);
          }
          break;
        }
        case 'miss':
        case 'dodge':
          this.floatText(ev.target, ev.type === 'miss' ? 'Fallo' : 'Esquiva', '#cfc6b4', 28);
          await anim.wait(260);
          break;
        case 'damage': {
          const v = this.views.get(ev.target)!;
          v.setHp(ev.hp);
          if (ev.amount > 0) {
            this.flash(v);
            this.shake(v, ev.crit ? 18 : 10);
            ui.sound(v.fighter.side === 'party' ? 'hurt' : 'hit');
            if (ev.crit) this.floatText(ev.target, '¡Crítico!', '#ffd27a', 26, -40);
            this.floatText(ev.target, String(ev.amount), ev.source === 'bleed' ? '#d86a3a' : '#e23a2a', ev.crit ? 46 : 38);
          }
          await anim.wait(ev.source === 'bleed' ? 420 : 300);
          break;
        }
        case 'heal':
          this.views.get(ev.target)!.setHp(ev.hp);
          this.floatText(ev.target, `+${ev.amount}`, '#7ed98f', ev.crit ? 42 : 34);
          await anim.wait(300);
          break;
        case 'stress': {
          const v = this.views.get(ev.target)!;
          v.setStress(ev.stress);
          if (ev.amount) {
            this.floatText(ev.target, `${ev.amount > 0 ? '+' : '−'}${Math.abs(ev.amount)} estrés`, ev.amount > 0 ? '#e8e2d0' : '#9fc4ff', 24, 34);
            if (ev.amount > 0) ui.sound('bad');
          }
          await anim.wait(160);
          break;
        }
        case 'status': {
          const v = this.views.get(ev.target)!;
          v.setStatus(ev.status, ev.on);
          if (ev.on) {
            const label = { bleed: 'Sangrando', stun: 'Aturdido', mark: 'Marcado', guarded: 'Protegido', guarding: 'En guardia', steady: 'Firme' }[ev.status];
            this.floatText(ev.target, label, '#f4e7c4', 22, 70);
            await anim.wait(180);
          }
          break;
        }
        case 'guardRedirect':
          this.floatText(ev.to, '¡Intercepta!', '#9fc4ff', 26, -40);
          ui.log(`${name(ev.to)} intercepta el golpe dirigido a ${name(ev.from)}.`, 'good');
          await anim.wait(250);
          break;
        case 'deathsDoor': {
          this.views.get(ev.target)!.setDeathsDoor(true);
          ui.banner('A las puertas de la muerte', 'bad', name(ev.target));
          ui.sound('bad');
          ui.log(`${name(ev.target)} está a las puertas de la muerte.`, 'bad');
          await anim.wait(700);
          break;
        }
        case 'resist':
          this.floatText(ev.target, '¡Resiste!', '#ffd27a', 32, -40);
          ui.log(`${name(ev.target)} se aferra a la vida.`, 'good');
          await anim.wait(500);
          break;
        case 'death': {
          const v = this.views.get(ev.target)!;
          v.dead = true;
          ui.sound('death');
          ui.log(`${name(ev.target)} ha caído.`, v.fighter.side === 'party' ? 'bad' : 'good');
          if (v.fighter.side === 'party') ui.banner(`${name(ev.target)} ha muerto`, 'bad', 'Su nombre se pierde en la oscuridad');
          await anim.tween(650, (k) => {
            v.alpha = 1 - k;
            v.rig.y = k * 20;
            v.rig.rotation = (v.fighter.side === 'party' ? -1 : 1) * k * 0.5;
          }, ease.in);
          v.visible = false;
          break;
        }
        case 'downed': {
          const v = this.views.get(ev.target)!;
          v.setDeathsDoor(false);
          v.setHp(0);
          ui.sound('defeat');
          ui.banner(`${name(ev.target)} cae abatido`, 'bad', 'El grupo se lo lleva a rastras');
          ui.log(`${name(ev.target)} cae abatido; el grupo se retira con él.`, 'bad');
          await anim.tween(700, (k) => {
            v.rig.rotation = -k * 1.2;
            v.rig.y = k * 30;
            v.alpha = 1 - k * 0.4;
          }, ease.out);
          await anim.wait(900);
          break;
        }
        case 'ranks':
          await this.layout(true);
          break;
        case 'resolve': {
          const v = this.views.get(ev.target)!;
          if (ev.result === 'virtue') {
            ui.sound('levelUp');
            ui.banner('Firme', 'epic', `${name(ev.target)} halla valor en la oscuridad`);
            this.flash(v, 0xffe6a0);
          } else {
            ui.sound('defeat');
            ui.banner(ev.result === 'temeroso' ? 'Temeroso' : 'Desesperado', 'bad', `El temple de ${name(ev.target)} se quiebra`);
            this.flash(v, 0x9a6aff);
          }
          await anim.wait(1500);
          break;
        }
        case 'heartAttack':
          ui.banner('¡Infarto!', 'bad', name(ev.target));
          await anim.wait(900);
          break;
        case 'bark':
          ui.bark(ev.target, ev.text);
          await anim.wait(250);
          break;
        case 'end':
          this.setActive(null);
          break;
      }
    }
    if (this.cine) await this.cineOut();
  }
}
