import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { Fighter, StatusKind } from '../rules/types';

export const INK = 0x0b0907;
const STROKE = { width: 3, color: INK, join: 'round' as const };

/** Figuras de relleno con trazo de tinta, mirando a la derecha. Origen en los pies. */
function drawFigure(kind: string): { body: Container; weapon: Container } {
  const body = new Container();
  const weapon = new Container();
  const g = new Graphics();
  const w = new Graphics();
  body.addChild(g);

  switch (kind) {
    case 'hero': {
      g.poly([-14, -118, -42, -14, -6, -6, 8, -110]).fill({ color: 0x5c1a1a }).stroke(STROKE); // capa
      g.rect(-17, -50, 13, 50).fill({ color: 0x2a2a2e }).stroke(STROKE);
      g.rect(3, -50, 13, 50).fill({ color: 0x2a2a2e }).stroke(STROKE);
      g.poly([-25, -114, 25, -114, 21, -46, -21, -46]).fill({ color: 0x8c96a4 }).stroke(STROKE);
      g.poly([-12, -106, 12, -106, 10, -38, -10, -38]).fill({ color: 0x27406e }).stroke(STROKE);
      g.circle(0, -80, 6).fill({ color: 0xd9a93a }).stroke({ width: 2, color: INK });
      g.roundRect(-15, -146, 30, 34, 9).fill({ color: 0x9aa3ae }).stroke(STROKE);
      g.rect(-2, -136, 14, 4).fill({ color: INK });
      g.poly([-4, -146, 6, -146, -10, -168, -16, -162]).fill({ color: 0x9e2a22 }).stroke({ width: 2, color: INK });
      // Escudo con sol
      g.circle(-24, -78, 22).fill({ color: 0x27406e }).stroke(STROKE);
      g.circle(-24, -78, 9).fill({ color: 0xd9a93a }).stroke({ width: 2, color: INK });
      // Espada (pivota en la mano)
      w.rect(-3, -78, 7, 78).fill({ color: 0xc8cfd8 }).stroke({ width: 2.5, color: INK });
      w.rect(-12, -4, 25, 6).fill({ color: 0xd9a93a }).stroke({ width: 2, color: INK });
      w.rect(-2.5, 2, 6, 14).fill({ color: 0x3a2618 }).stroke({ width: 2, color: INK });
      weapon.addChild(w);
      weapon.position.set(26, -70);
      weapon.rotation = 0.5;
      break;
    }
    case 'spearman': {
      g.rect(-16, -48, 12, 48).fill({ color: 0x2f261c }).stroke(STROKE);
      g.rect(3, -48, 12, 48).fill({ color: 0x2f261c }).stroke(STROKE);
      g.poly([-24, -108, 22, -108, 22, -42, -24, -42]).fill({ color: 0x6b5236 }).stroke(STROKE);
      for (const y of [-96, -82, -68, -54]) g.moveTo(-22, y).lineTo(20, y).stroke({ width: 1.5, color: 0x3a2a1a });
      g.circle(0, -122, 14).fill({ color: 0xb08a6a }).stroke(STROKE);
      g.ellipse(0, -132, 24, 6).fill({ color: 0x7d8590 }).stroke(STROKE);
      g.poly([-12, -132, 12, -132, 8, -146, -8, -146]).fill({ color: 0x7d8590 }).stroke(STROKE);
      g.circle(-22, -74, 20).fill({ color: 0x7a2e22 }).stroke(STROKE);
      g.circle(-22, -74, 6).fill({ color: 0x8c96a4 }).stroke({ width: 2, color: INK });
      // Lanza
      w.moveTo(-60, 30).lineTo(70, -40).stroke({ width: 6, color: INK });
      w.moveTo(-60, 30).lineTo(70, -40).stroke({ width: 3, color: 0x7a5a38 });
      w.poly([66, -46, 92, -54, 74, -32]).fill({ color: 0xc8cfd8 }).stroke({ width: 2.5, color: INK });
      weapon.addChild(w);
      weapon.position.set(10, -80);
      break;
    }
    case 'archer': {
      g.rect(-14, -46, 11, 46).fill({ color: 0x2a2a22 }).stroke(STROKE);
      g.rect(3, -46, 11, 46).fill({ color: 0x2a2a22 }).stroke(STROKE);
      g.poly([-24, -112, 18, -112, 26, -36, -30, -36]).fill({ color: 0x2f4a2e }).stroke(STROKE);
      g.rect(-34, -110, 12, 48).fill({ color: 0x5a3b22 }).stroke(STROKE); // carcaj
      for (const x of [-32, -27]) g.moveTo(x, -110).lineTo(x - 4, -124).stroke({ width: 2, color: 0xd8d2c0 });
      g.poly([-16, -112, 14, -112, 4, -150, -18, -138]).fill({ color: 0x24391f }).stroke(STROKE); // capucha
      g.circle(0, -124, 9).fill({ color: 0x15100c });
      // Arco
      w.arc(0, 0, 46, -1.3, 1.3).stroke({ width: 5, color: INK });
      w.arc(0, 0, 46, -1.3, 1.3).stroke({ width: 2.5, color: 0x7a5a38 });
      w.moveTo(Math.cos(-1.3) * 46, Math.sin(-1.3) * 46).lineTo(Math.cos(1.3) * 46, Math.sin(1.3) * 46).stroke({ width: 1, color: 0xd8d2c0 });
      weapon.addChild(w);
      weapon.position.set(14, -82);
      break;
    }
    case 'chaplain': {
      g.poly([-22, -110, 20, -110, 32, 0, -34, 0]).fill({ color: 0x8a8478 }).stroke(STROKE);
      g.poly([-6, -104, 6, -104, 8, -6, -8, -6]).fill({ color: 0x5c1a1a }).stroke({ width: 2, color: INK });
      g.poly([-18, -110, 16, -110, 6, -152, -16, -140]).fill({ color: 0x77716a }).stroke(STROKE);
      g.circle(0, -124, 9).fill({ color: 0x15100c });
      // Báculo con farol
      w.rect(-3, -60, 6, 140).fill({ color: 0x4a3220 }).stroke({ width: 2, color: INK });
      w.roundRect(-11, -84, 22, 26, 4).fill({ color: 0xffd27a }).stroke({ width: 2.5, color: INK });
      w.circle(0, -71, 5).fill({ color: 0xfff2c8 });
      weapon.addChild(w);
      weapon.position.set(30, -60);
      break;
    }
    case 'shade': {
      g.poly([-26, -120, 20, -128, 34, -70, 28, -8, 16, -22, 6, 0, -6, -18, -18, -2, -26, -24, -36, -10, -30, -70]).fill({ color: 0x120d18 }).stroke(STROKE);
      g.poly([-18, -128, 18, -134, 22, -150, 0, -164, -20, -150]).fill({ color: 0x0d0a12 }).stroke(STROKE);
      g.circle(4, -140, 3.5).fill({ color: 0xff3344 });
      g.circle(14, -140, 3.5).fill({ color: 0xff3344 });
      w.poly([0, 0, 40, -12, 52, 2, 44, 8, 52, 14, 38, 14]).fill({ color: 0x0d0a12 }).stroke({ width: 2.5, color: INK });
      weapon.addChild(w);
      weapon.position.set(18, -86);
      break;
    }
    case 'brute': {
      g.rect(-34, -50, 24, 50).fill({ color: 0x241820 }).stroke(STROKE);
      g.rect(8, -50, 24, 50).fill({ color: 0x241820 }).stroke(STROKE);
      g.ellipse(-4, -100, 58, 60).fill({ color: 0x2a1a22 }).stroke(STROKE);
      g.circle(34, -138, 24).fill({ color: 0x2a1a22 }).stroke(STROKE);
      g.poly([22, -158, 14, -186, 30, -162]).fill({ color: 0xcfc3a8 }).stroke({ width: 2, color: INK });
      g.poly([44, -158, 56, -186, 48, -156]).fill({ color: 0xcfc3a8 }).stroke({ width: 2, color: INK });
      g.circle(40, -140, 4).fill({ color: 0xff8a22 });
      g.circle(50, -136, 4).fill({ color: 0xff8a22 });
      // Garrote
      w.poly([-6, 0, 6, 0, 14, -96, -14, -96]).fill({ color: 0x4a3426 }).stroke({ width: 2.5, color: INK });
      w.circle(0, -100, 20).fill({ color: 0x4a3426 }).stroke({ width: 2.5, color: INK });
      for (const [x, y] of [[-14, -108], [12, -112], [0, -118]] as const) w.poly([x, y, x - 4, y - 10, x + 4, y - 2]).fill({ color: 0xcfc3a8 });
      weapon.addChild(w);
      weapon.position.set(54, -84);
      weapon.rotation = 0.4;
      break;
    }
    case 'herald': {
      // Túnica larga y harapienta, corona de púas y una guadaña
      g.poly([-30, -150, 26, -156, 44, -60, 52, 0, 30, -14, 18, 2, 4, -16, -10, 2, -24, -14, -44, 0, -38, -70]).fill({ color: 0x15101c }).stroke(STROKE);
      g.poly([-22, -150, 22, -154, 18, -92, -16, -90]).fill({ color: 0x2a1a30 }).stroke(STROKE);
      g.roundRect(-16, -192, 32, 40, 12).fill({ color: 0xd8d0bc }).stroke(STROKE);
      g.circle(-4, -174, 4).fill({ color: 0x0b0907 });
      g.circle(8, -174, 4).fill({ color: 0x0b0907 });
      g.circle(-4, -174, 1.6).fill({ color: 0x7ac0ff });
      g.circle(8, -174, 1.6).fill({ color: 0x7ac0ff });
      for (let i = -2; i <= 2; i++) g.poly([i * 7 - 4, -190, i * 9, -212 - Math.abs(i) * -4, i * 7 + 4, -190]).fill({ color: 0x2a2030 }).stroke({ width: 2, color: INK });
      g.circle(0, -110, 7).fill({ color: 0x7ac0ff }).stroke({ width: 2, color: INK });
      w.rect(-3, -150, 6, 170).fill({ color: 0x3a2a22 }).stroke({ width: 2.5, color: INK });
      w.poly([0, -150, 64, -138, 84, -110, 50, -128, 0, -136]).fill({ color: 0xb8bcc8 }).stroke({ width: 2.5, color: INK });
      weapon.addChild(w);
      weapon.position.set(34, -70);
      weapon.rotation = 0.15;
      break;
    }
    case 'stalker': {
      g.moveTo(-30, 0).lineTo(-18, -44).lineTo(-4, -58).stroke({ width: 7, color: INK });
      g.moveTo(24, 0).lineTo(14, -40).lineTo(2, -58).stroke({ width: 7, color: INK });
      g.moveTo(-30, 0).lineTo(-18, -44).lineTo(-4, -58).stroke({ width: 3, color: 0x2a1838 });
      g.moveTo(24, 0).lineTo(14, -40).lineTo(2, -58).stroke({ width: 3, color: 0x2a1838 });
      g.ellipse(0, -76, 30, 20).fill({ color: 0x2a1838 }).stroke(STROKE);
      g.poly([22, -86, 48, -96, 52, -78, 26, -68]).fill({ color: 0x2a1838 }).stroke(STROKE);
      g.circle(44, -88, 3).fill({ color: 0xc055ff });
      g.circle(36, -86, 2.5).fill({ color: 0xc055ff });
      w.moveTo(0, 0).lineTo(46, 10).stroke({ width: 5, color: INK });
      w.moveTo(0, 0).lineTo(46, 10).stroke({ width: 2, color: 0x2a1838 });
      w.poly([44, 4, 60, 12, 44, 16]).fill({ color: 0xa08cc0 }).stroke({ width: 2, color: INK });
      weapon.addChild(w);
      weapon.position.set(8, -70);
      break;
    }
  }
  body.addChild(weapon);
  return { body, weapon };
}

const STATUS_GLYPH: Record<StatusKind, { glyph: string; color: string }> = {
  bleed: { glyph: '✦', color: '#d23a2a' },
  stun: { glyph: '✸', color: '#f2d24b' },
  mark: { glyph: '◎', color: '#ff9a3a' },
  guarded: { glyph: '⛨', color: '#7aa8ff' },
  guarding: { glyph: '⛨', color: '#d8d2c0' },
  steady: { glyph: '❖', color: '#f4e7c4' },
};

/** Un combatiente en escena: figura, sombra, barras, estados y marcadores. */
export class FighterView extends Container {
  readonly fighter: Fighter;
  readonly figure: Container;
  readonly weapon: Container;
  /** Contenedor que se mueve en las animaciones (la raíz queda en su posición). */
  readonly rig = new Container();
  private hpFill = new Graphics();
  private stressPips = new Graphics();
  private ring = new Graphics();
  private chevron = new Graphics();
  private statusText: Text;
  private doorText: Text;
  private time = Math.random() * 10;
  private baseScaleY = 1;
  hp: number;
  stress: number;
  maxHp: number;
  targetMode: 'none' | 'enemy' | 'ally' = 'none';
  active = false;
  dead = false;
  deathsDoor = false;
  statuses = new Set<StatusKind>();

  constructor(f: Fighter) {
    super();
    this.fighter = f;
    this.hp = f.hp;
    this.maxHp = f.maxHp;
    this.stress = f.stress;

    const shadow = new Graphics().ellipse(0, 4, 62, 12).fill({ color: 0x000000, alpha: 0.55 });
    this.addChild(shadow, this.ring, this.rig);
    const { body, weapon } = drawFigure(f.kind);
    this.figure = body;
    this.weapon = weapon;
    if (f.side === 'foe') this.figure.scale.x = -1;
    const size = f.kind === 'brute' ? 1.6 : f.kind === 'herald' ? 1.55 : f.kind === 'stalker' ? 1.35 : 1.45;
    this.figure.scale.set(this.figure.scale.x * size, size);
    this.baseScaleY = size;
    this.rig.addChild(this.figure);

    // Barras bajo los pies, como en Darkest Dungeon.
    const bars = new Container();
    bars.position.set(0, 18);
    bars.addChild(new Graphics().rect(-34, 0, 68, 7).fill({ color: 0x1a0c0c }).stroke({ width: 1.5, color: INK }));
    bars.addChild(this.hpFill);
    if (f.side === 'party') bars.addChild(this.stressPips);
    this.addChild(bars);

    this.statusText = new Text({ text: '', style: { fontFamily: 'serif', fontSize: 20, fill: '#ffffff', stroke: { color: '#000', width: 4 } } });
    this.statusText.anchor.set(0.5, 1);
    this.statusText.position.set(0, -270);
    this.doorText = new Text({ text: '☠', style: { fontFamily: 'serif', fontSize: 30, fill: '#d23a2a', stroke: { color: '#000', width: 5 } } });
    this.doorText.anchor.set(0.5);
    this.doorText.position.set(0, -292);
    this.doorText.visible = false;
    this.chevron.poly([-14, -318, 14, -318, 0, -300]).fill({ color: 0xffd27a }).stroke({ width: 2, color: INK });
    this.chevron.visible = false;
    this.addChild(this.statusText, this.doorText, this.chevron);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(-70, -290, 140, 330);
    this.redrawBars();
    if (f.deathsDoor) this.setDeathsDoor(true);
  }

  setHp(hp: number) {
    this.hp = hp;
    this.redrawBars();
  }

  setStress(stress: number) {
    this.stress = stress;
    this.redrawBars();
  }

  setStatus(kind: StatusKind, on: boolean) {
    if (on) this.statuses.add(kind);
    else this.statuses.delete(kind);
    this.statusText.text = [...this.statuses].map((s) => STATUS_GLYPH[s].glyph).join(' ');
    // El color de la fila lo marca el primer estado; basta para un prototipo.
    const first = [...this.statuses][0];
    this.statusText.style.fill = first ? STATUS_GLYPH[first].color : '#ffffff';
  }

  setDeathsDoor(on: boolean) {
    this.deathsDoor = on;
    this.doorText.visible = on;
  }

  private redrawBars() {
    const pct = Math.max(0, this.hp / this.maxHp);
    this.hpFill.clear().rect(-33, 1, 66 * pct, 5).fill({ color: this.deathsDoor ? 0x5a0c0c : 0xa11d1d });
    if (this.fighter.side !== 'party') return;
    this.stressPips.clear();
    for (let i = 0; i < 10; i++) {
      const filled = this.stress >= (i + 1) * 10;
      const over = this.stress >= 100 + (i + 1) * 10;
      this.stressPips
        .rect(-33 + i * 6.8, 11, 5, 5)
        .fill({ color: over ? 0xd23a2a : filled ? 0xe8e2d0 : 0x2a2622 })
        .stroke({ width: 1, color: INK });
    }
  }

  /** Animación de reposo y marcadores; se llama cada fotograma. */
  tick(dt: number) {
    this.time += dt / 1000;
    if (this.dead) return;
    const k = this.fighter.kind;
    const breathe = k === 'shade' ? Math.sin(this.time * 2.2) * 6 : Math.sin(this.time * 2) * 1.2;
    this.figure.y = k === 'shade' ? -6 + breathe : 0;
    if (k !== 'shade') this.figure.scale.y = this.baseScaleY * (1 + breathe * 0.004);

    const pulse = 0.55 + 0.45 * Math.sin(this.time * 5);
    this.ring.clear();
    if (this.targetMode !== 'none') {
      const color = this.targetMode === 'enemy' ? 0xd23a2a : 0x6fd18a;
      this.ring.ellipse(0, 4, 68, 15).stroke({ width: 3, color, alpha: pulse });
    } else if (this.active) {
      this.ring.ellipse(0, 4, 68, 15).stroke({ width: 3, color: 0xffd27a, alpha: 0.9 });
    }
    this.chevron.visible = this.active;
    if (this.active) this.chevron.y = Math.sin(this.time * 4) * 4;
    if (this.deathsDoor) this.doorText.alpha = 0.6 + 0.4 * Math.sin(this.time * 6);
  }
}
