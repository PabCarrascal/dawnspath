import { portrait } from '../hd2d/portrait';
import type { Combat } from './rules/Combat';
import type { Fighter, Skill } from './rules/types';

const pct = (x: number) => `${Math.round(x * 100)}%`;

export interface UiHooks {
  onSkill: (skillId: string) => void;
  onRetreat: () => void;
}

/** Interfaz HTML sobre la escena: iniciativa, panel de habilidades, fichas, rótulos y registro. */
export class CombatUi {
  private root: HTMLElement;
  private bubbles: HTMLElement;
  private bannerTimer: number | null = null;

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
      </header>
      <div class="cb-banner" data-id="banner"><h2></h2><p></p></div>
      <ol class="cb-log" data-id="log"></ol>
      <div class="cb-bubbles" data-id="bubbles"></div>
      <nav class="cb-command" data-id="command" aria-label="Habilidades"><ol data-id="skills"></ol></nav>
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
    this.q('enc').textContent = `${combat.encounter.name}${combat.state.night ? ' · de noche' : ''}`;
  }

  /** Vacía la capa de interfaz al terminar el combate. */
  destroy() {
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.root.innerHTML = '';
    this.root.classList.remove('player-turn');
  }

  private q(id: string) {
    return this.root.querySelector(`[data-id="${id}"]`) as HTMLElement;
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
      <div class="cb-stats">
        <span>Daño <b>${f.dmg[0]}–${f.dmg[1]}</b></span>
        <span>Vel. <b>${f.speed}</b></span>
        <span>Esq. <b>${pct(f.dodge)}</b></span>
        <span>Prot. <b>${pct(f.prot)}</b></span>
        <span>Crít. <b>${pct(f.crit)}</b></span>
        <span>Puesto <b>${f.rank}</b></span>
      </div>
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
   * Coloca el menú a un lado del personaje (`x` es su centro, `top` y `feet`
   * la cabeza y los pies en pantalla): a la izquierda si cabe, si no a la
   * derecha, y nunca tapando las fichas de los pies.
   */
  placeCommand(x: number, top: number, feet: number) {
    const menu = this.q('command');
    if (!menu.classList.contains('on')) return;
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const gap = Math.max(26, (feet - top) * 0.32);
    const left = x - gap - w >= 8 ? x - gap - w : Math.min(window.innerWidth - w - 8, x + gap);
    const y = Math.max(64, Math.min(feet - h - 4, (top + feet) / 2 - h / 2));
    menu.classList.toggle('right', left > x);
    menu.style.transform = `translate(${Math.round(left)}px, ${Math.round(y)}px)`;
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
    const details: string[] = [];
    if (skill.dmg) details.push(`daño ×${skill.dmg}`);
    if (skill.acc) details.push(`precisión ${pct(skill.acc)}`);
    if (skill.heal) details.push(`cura ${skill.heal[0]}–${skill.heal[1]}`);
    if (skill.stress) details.push(skill.stress > 0 ? `+${skill.stress} estrés` : `alivia ${-skill.stress} de estrés`);
    if (skill.stun) details.push(`aturdir ${pct(skill.stun)}`);
    if (skill.push) details.push(`empuja ${skill.push}`);
    if (skill.target.all) details.push('a todos');
    this.q('skill-info').innerHTML = `
      <div class="cb-ranks"><span class="own">${own}</span><span class="arrow">→</span><span class="tgt ${skill.target.all ? 'all' : ''}">${tgt}</span></div>
      <div class="cb-desc"><b>${skill.name}</b> · ${skill.desc}${details.length ? `<small>${details.join(' · ')}</small>` : ''}${reason ? `<small class="why">${reason}</small>` : ''}</div>`;
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
    while (ol.children.length > 7) ol.lastElementChild!.remove();
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
