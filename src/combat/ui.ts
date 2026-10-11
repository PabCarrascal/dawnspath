import { portrait } from '../hd2d/portrait';
import type { Combat } from './rules/Combat';
import type { Fighter, Skill } from './rules/types';
import type { Box } from './session';

/** Área en común de dos rectángulos. */
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

const pct = (x: number) => `${Math.round(x * 100)}%`;

export interface UiHooks {
  onSkill: (skillId: string) => void;
  onRetreat: () => void;
  /** Tocar la casilla de un combatiente es como pulsarlo en la escena. */
  onTarget: (id: number) => void;
  onHover: (id: number | null) => void;
}

/** Interfaz HTML sobre la escena: iniciativa, panel de habilidades, fichas, rótulos y registro. */
export class CombatUi {
  private root: HTMLElement;
  private bubbles: HTMLElement;
  private bannerTimer: number | null = null;
  /** Sitio elegido para el menú en el último fotograma (índice de los que prueba placeCommand). */
  private commandSpot = -1;
  /** Tamaño del menú en una y en dos columnas; se mide al cambiar sus habilidades. */
  private commandSize: { tall: [number, number]; cols: [number, number] } | null = null;

  constructor(
    root: HTMLElement,
    private combat: Combat,
    private hooks: UiHooks,
  ) {
    this.root = root;
    this.root.innerHTML = `
      <header class="cb-top">
        <div class="cb-round"><span>Ronda</span><b data-id="round">1</b></div>
        <ol class="cb-order" data-id="order"></ol>
        <div class="cb-enc" data-id="enc"></div>
        <button class="cb-log-toggle" data-id="log-toggle" title="Registro del combate (L)" aria-expanded="false" aria-controls="cb-log">☰<span> Registro</span></button>
      </header>
      <div class="cb-banner" data-id="banner"><h2></h2><p></p></div>
      <ol class="cb-log" id="cb-log" data-id="log"></ol>
      <div class="cb-bubbles" data-id="bubbles"></div>
      <nav class="cb-command" data-id="command" aria-label="Habilidades"><ol data-id="skills"></ol></nav>
      <div class="cb-roster" data-id="roster" aria-label="Combatientes">
        <div class="cb-side party" data-id="r-party"></div>
        <span class="cb-vs" aria-hidden="true">⚔</span>
        <div class="cb-side foe" data-id="r-foe"></div>
      </div>
      <footer class="cb-panel" data-id="panel">
        <section class="cb-card" data-id="actor"></section>
        <section class="cb-skills">
          <div class="cb-skill-info" data-id="skill-info"></div>
        </section>
        <section class="cb-card cb-target" data-id="target"></section>
      </footer>
      <div class="cb-tip" data-id="tip"></div>
    `;
    this.bubbles = this.q('bubbles');
    // "De noche" solo si el nombre no lo dice ya ("Emboscada nocturna").
    const night = combat.state.night && !/noct|noche/i.test(combat.encounter.name);
    this.q('enc').textContent = `${combat.encounter.name}${night ? ' · de noche' : ''}`;
    // El registro va plegado: lo que pasa ya se ve en la escena y en los rótulos.
    this.q('log-toggle').addEventListener('click', () => this.toggleLog());
    window.addEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() === 'l' && !e.metaKey && !e.ctrlKey && !e.altKey) this.toggleLog();
  };

  private toggleLog() {
    const open = this.root.classList.toggle('log-open');
    this.q('log-toggle').setAttribute('aria-expanded', String(open));
  }

  /** Vacía la capa de interfaz al terminar el combate. */
  destroy() {
    window.removeEventListener('keydown', this.onKey);
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.root.innerHTML = '';
    this.root.classList.remove('player-turn', 'log-open');
  }

  private q(id: string) {
    return this.root.querySelector(`[data-id="${id}"]`) as HTMLElement;
  }

  // ───────────────────────── casillas de combatientes ─────────────────────────

  /**
   * Fila de casillas abajo (en pantallas táctiles o estrechas): el grupo a la
   * izquierda y los enemigos a la derecha, en el mismo orden que en la escena.
   * Tocar una casilla es como pulsar al combatiente: elige objetivo.
   */
  renderRoster() {
    const fill = (side: 'party' | 'foe') => {
      const box = this.q(side === 'party' ? 'r-party' : 'r-foe');
      const list = this.combat.state.fighters
        .filter((f) => f.side === side && f.alive)
        .sort((a, b) => (side === 'party' ? b.rank - a.rank : a.rank - b.rank));
      box.innerHTML = '';
      for (const f of list) {
        const b = document.createElement('button');
        b.className = `cb-tile ${side} ${f.id === this.combat.state.active ? 'active' : ''}`;
        b.dataset.fid = String(f.id);
        b.title = `${f.name} · ${f.hp}/${f.maxHp}`;
        b.innerHTML = `<img src="${portrait(f.kind, side === 'foe')}" alt=""><i class="bar hp"><i style="width:${Math.max(0, (f.hp / f.maxHp) * 100)}%"></i></i>`;
        b.addEventListener('click', () => this.hooks.onTarget(f.id));
        b.addEventListener('pointerenter', () => this.hooks.onHover(f.id));
        b.addEventListener('pointerleave', () => this.hooks.onHover(null));
        box.appendChild(b);
      }
    };
    fill('party');
    fill('foe');
  }

  /** Marca las casillas que son objetivo válido de la habilidad elegida. */
  setTargets(ids: number[], mode: 'enemy' | 'ally') {
    for (const b of this.root.querySelectorAll<HTMLElement>('.cb-tile')) {
      const on = ids.includes(Number(b.dataset.fid));
      b.classList.toggle('target-enemy', on && mode === 'enemy');
      b.classList.toggle('target-ally', on && mode === 'ally');
    }
  }

  setPlayerTurn(on: boolean) {
    this.root.classList.toggle('player-turn', on);
  }

  // ───────────────────────── iniciativa ─────────────────────────

  round(round: number, order: number[]) {
    this.q('round').textContent = String(round);
    this.renderOrder(order, null);
  }

  turn(id: number) {
    const queue = [id, ...this.combat.state.queue];
    this.renderOrder(queue, id);
  }

  private renderOrder(ids: number[], active: number | null) {
    const ol = this.q('order');
    ol.innerHTML = '';
    for (const id of ids) {
      const f = this.combat.fighter(id);
      if (!f?.alive) continue;
      const li = document.createElement('li');
      li.className = `side-${f.side} ${id === active ? 'active' : ''}`;
      li.title = f.name;
      li.innerHTML = `<img src="${portrait(f.kind, f.side === 'foe')}" alt=""><span>${f.name}</span>`;
      ol.appendChild(li);
    }
  }

  // ───────────────────────── fichas ─────────────────────────

  private card(f: Fighter, extra = ''): string {
    const affl = f.affliction ? `<em class="affl">${f.affliction === 'temeroso' ? 'Temeroso' : 'Desesperado'}</em>` : '';
    const door = f.deathsDoor ? '<em class="door">A las puertas de la muerte</em>' : '';
    const stress = f.side === 'party' ? `<div class="cb-row"><span>Estrés</span><b>${f.stress}</b><i class="bar stress"><i style="width:${Math.min(100, f.stress)}%"></i></i></div>` : '';
    return `
      <div class="cb-card-head">
        <img class="cb-portrait ${f.side}" src="${portrait(f.kind, f.side === 'foe')}" alt="">
        <div><div class="cb-name">${f.name}</div><div class="cb-tags">${affl}${door}</div></div>
      </div>
      <div class="cb-row"><span>Vida</span><b>${f.hp}/${f.maxHp}</b><i class="bar hp"><i style="width:${(f.hp / f.maxHp) * 100}%"></i></i></div>
      ${stress}
      ${extra}`;
  }

  showActor(f: Fighter | null) {
    const el = this.q('actor');
    el.innerHTML = f ? this.card(f) : '';
    el.classList.toggle('on', !!f);
  }

  /** Ficha del objetivo bajo el cursor, con la previsión del golpe si hay habilidad elegida. */
  showTarget(f: Fighter | null, actor?: Fighter, skill?: Skill, valid = false) {
    const el = this.q('target');
    if (!f) {
      el.classList.remove('on');
      return;
    }
    let extra = '';
    if (actor && skill && valid && skill.target.side === 'enemy') {
      const [lo, hi] = this.combat.damageRange(actor, skill, f);
      const hit = this.combat.hitChance(actor, skill, f);
      const crit = this.combat.critChance(actor, skill);
      extra = `<div class="cb-forecast">
        <span>Acierto <b>${pct(hit)}</b></span>
        ${skill.dmg ? `<span>Daño <b>${lo}–${hi}</b></span><span>Crít. <b>${pct(crit)}</b></span>` : ''}
        ${skill.stress ? `<span>Estrés <b>+${skill.stress}</b></span>` : ''}
        ${skill.stun ? `<span>Aturdir <b>${pct(skill.stun)}</b></span>` : ''}
      </div>`;
    }
    el.innerHTML = this.card(f, extra);
    el.classList.add('on');
  }

  // ───────────────────────── habilidades ─────────────────────────

  /**
   * Lista vertical de habilidades junto al personaje activo (como el menú de
   * órdenes de Octopath). Se coloca con `placeCommand` cada fotograma.
   */
  showSkills(actor: Fighter | null, selected: string | null) {
    const list = this.q('skills');
    const menu = this.q('command');
    list.innerHTML = '';
    this.commandSize = null;
    menu.classList.toggle('on', !!actor);
    if (!actor) {
      this.q('skill-info').innerHTML = '';
      return;
    }
    const item = (cls: string, html: string, title: string) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.className = `cb-cmd ${cls}`;
      b.title = title;
      b.innerHTML = html;
      li.appendChild(b);
      list.appendChild(li);
      return b;
    };
    this.combat.skillsOf(actor.id).forEach(({ skill, usable, reason }, i) => {
      const b = item(skill.id === selected ? 'selected' : '', `<span class="glyph">${skill.icon}</span><span class="nm">${skill.name}</span><kbd>${i + 1}</kbd>`, reason ?? '');
      b.disabled = !usable;
      b.addEventListener('click', () => this.hooks.onSkill(skill.id));
      b.addEventListener('pointerenter', () => this.skillInfo(skill, actor, reason));
      b.addEventListener('pointerleave', () => {
        const cur = selected ? this.combat.skill(selected) : null;
        if (cur) this.skillInfo(cur, actor);
      });
    });
    const retreat = item('retreat', '<span class="glyph">⚑</span><span class="nm">Retirada</span>', 'Abandona el combate. Todo el grupo sufre +10 de estrés.');
    retreat.addEventListener('click', () => this.hooks.onRetreat());
    if (selected) this.skillInfo(this.combat.skill(selected), actor);
  }

  /**
   * Coloca el menú cerca del personaje (`x` es su centro, `top` y `feet` la
   * cabeza y los pies en pantalla) sin tapar a nadie: prueba a cada lado, bajo
   * las fichas y sobre la cabeza, y se queda con el sitio que menos tapa a los
   * combatientes (`avoid`); a igualdad, el más cercano. Nunca baja del panel
   * inferior. Bajo las fichas va en dos columnas: más bajo, cabe en la hierba.
   */
  placeCommand(x: number, top: number, feet: number, avoid: Box[] = []) {
    const menu = this.q('command');
    if (!menu.classList.contains('on')) return;
    // En pantallas estrechas el menú va fijo abajo (lo coloca el CSS) para no tapar a nadie.
    if (window.innerWidth <= 640) {
      menu.style.transform = '';
      return;
    }
    if (!this.commandSize) {
      const size = (): [number, number] => [menu.offsetWidth, menu.offsetHeight];
      const had = menu.classList.contains('cols');
      menu.classList.remove('cols');
      const tall = size();
      menu.classList.add('cols');
      this.commandSize = { tall, cols: size() };
      menu.classList.toggle('cols', had);
    }
    const [w, h] = this.commandSize.tall;
    const [cw, ch] = this.commandSize.cols;
    const gap = Math.max(26, (feet - top) * 0.32);
    const mid = (top + feet) / 2 - h / 2;
    const spots: [number, number, 'left' | 'right' | 'free' | 'cols'][] = [
      [x - gap - w, mid, 'left'],
      [x + gap, mid, 'right'],
      [x - cw / 2, feet + 40, 'cols'],
      [x - gap - w, top - h - 12, 'free'],
      [x + gap, top - h - 12, 'free'],
      [x - w / 2, top - h - 12, 'free'],
    ];
    const floor = Math.min(
      window.innerHeight,
      ...['panel', 'roster'].map((id) => this.q(id).getBoundingClientRect()).filter((r) => r.height > 0).map((r) => r.top),
    );
    const scores = spots.map(([sx, sy, kind], i) => {
      const [sw, sh] = kind === 'cols' ? [cw, ch] : [w, h];
      const l = Math.max(8, Math.min(window.innerWidth - sw - 8, sx));
      const t = Math.max(64, Math.min(floor - sh - 8, sy));
      const r = { x0: l, y0: t, x1: l + sw, y1: t + sh };
      let s = i * 40 + Math.hypot(l + sw / 2 - x, t + sh / 2 - (top + feet) / 2) * 0.05;
      for (const b of avoid) s += overlap(r, b);
      return { l, t, s, side: spots[i][2] };
    });
    // Se mantiene el sitio anterior mientras siga casi tan bien: así no salta con la deriva de la cámara.
    let best = scores.reduce((a, b) => (b.s < a.s ? b : a));
    const prev = scores[this.commandSpot];
    if (prev && prev.s <= best.s + 400) best = prev;
    this.commandSpot = scores.indexOf(best);
    menu.classList.toggle('right', best.side === 'right');
    menu.classList.toggle('free', best.side === 'free' || best.side === 'cols');
    menu.classList.toggle('cols', best.side === 'cols');
    menu.style.transform = `translate(${Math.round(best.l)}px, ${Math.round(best.t)}px)`;
  }

  /** Descripción y el diagrama de posiciones: desde dónde se usa y a quién alcanza. */
  private skillInfo(skill: Skill, actor: Fighter, reason?: string) {
    const ally = skill.target.side !== 'enemy';
    // Posiciones propias de 4 a 1 (de atrás hacia el centro), y las del objetivo de 1 a 4.
    const own = [4, 3, 2, 1]
      .map((r) => `<i class="${skill.from.includes(r) ? 'on' : ''} ${actor.rank === r ? 'me' : ''}"></i>`)
      .join('');
    const tgt =
      skill.target.side === 'self'
        ? '<span class="self">a sí mismo</span>'
        : [1, 2, 3, 4].map((r) => `<i class="${skill.target.ranks.includes(r) ? (ally ? 'ally' : 'foe') : ''}"></i>`).join('');
    this.q('skill-info').innerHTML = `
      <div class="cb-ranks"><span class="own">${own}</span><span class="arrow">→</span><span class="tgt ${skill.target.all ? 'all' : ''}">${tgt}</span></div>
      <div class="cb-desc"><b>${skill.name}</b> · ${skill.desc}${reason ? `<small class="why">${reason}</small>` : ''}</div>`;
  }

  // ───────────────────────── rótulos ─────────────────────────

  banner(text: string, tone: 'bad' | 'good' | 'epic', sub = '') {
    const el = this.q('banner');
    el.className = `cb-banner ${tone}`;
    el.querySelector('h2')!.textContent = text;
    el.querySelector('p')!.textContent = sub;
    void el.offsetWidth;
    el.classList.add('on');
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => el.classList.remove('on'), sub ? 1900 : 1100);
  }

  bark(x: number, y: number, text: string) {
    const b = document.createElement('div');
    b.className = 'cb-bubble';
    b.textContent = text;
    b.style.left = `${x}px`;
    b.style.top = `${y}px`;
    this.bubbles.appendChild(b);
    setTimeout(() => b.remove(), 2600);
  }

  log(text: string, tone: 'bad' | 'good' | 'info' = 'info') {
    const ol = this.q('log');
    const li = document.createElement('li');
    li.className = `tone-${tone}`;
    li.textContent = text;
    ol.prepend(li);
    while (ol.children.length > 40) ol.lastElementChild!.remove();
  }

  narrate(text: string) {
    const n = document.createElement('div');
    n.className = 'cb-narrator';
    n.textContent = text;
    this.root.appendChild(n);
    requestAnimationFrame(() => n.classList.add('on'));
    setTimeout(() => n.classList.remove('on'), 4200);
    setTimeout(() => n.remove(), 5200);
  }
}
