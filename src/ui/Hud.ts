import { BALANCE, BuildingKind, RESOURCES, RecruitKind, Resource } from '../game/config';
import { Game, costText } from '../game/Game';
import type { Unit } from '../game/types';
import { ICONS } from './icons';

export type Tone = 'info' | 'good' | 'bad' | 'epic';

export interface HudCallbacks {
  onBuild: (kind: BuildingKind) => void;
  onCastle: () => void;
  onUpgrade: () => void;
  onRecruit: (kind: RecruitKind) => void;
  onTrade: (i: number) => void;
  onEndDay: () => void;
  onHelp: () => void;
  onSettings: () => void;
  onToggleThreat: () => void;
  onToggleMute: () => void;
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;

const B = BALANCE.buildings;
const E = BALANCE.effects;

/** Orden de la barra de construcción y atajos de teclado. */
export const BUILD_ORDER: { kind: BuildingKind; key?: string; icon: string }[] = [
  { kind: 'farm', key: '1', icon: ICONS.farm },
  { kind: 'sawmill', key: '2', icon: ICONS.sawmill },
  { kind: 'quarry', key: '3', icon: ICONS.quarry },
  { kind: 'house', key: '4', icon: ICONS.house },
  { kind: 'tower', key: '5', icon: ICONS.tower },
  { kind: 'outpost', key: '6', icon: ICONS.outpost },
  { kind: 'bridge', key: '7', icon: ICONS.bridge },
  { kind: 'wall', key: '8', icon: ICONS.wall },
  { kind: 'market', key: '9', icon: ICONS.market },
  { kind: 'barracks', key: '0', icon: ICONS.barracks },
  { kind: 'archery', icon: ICONS.archery },
  { kind: 'forge', icon: ICONS.forge },
  { kind: 'beacon', icon: ICONS.beacon },
];

const prod = (c: Partial<Record<Resource, number>>) => costText(c).replace(/(\d+)/g, '+$1');

export const BUILD_INFO: Record<BuildingKind, string> = {
  farm: `En llanura. ${prod(B.farm.produces)} al día. Necesita ${B.farm.workers} habitante.`,
  sawmill: `En un bosque o junto a uno. ${prod(B.sawmill.produces)} al día. Necesita ${B.sawmill.workers} habitante.`,
  quarry: `Junto a una montaña. ${prod(B.quarry.produces)} al día. Necesita ${B.quarry.workers} habitantes.`,
  house: `Hogar para ${E.house.housing} habitantes más. La población crece si hay comida y sitio.`,
  tower: `Visión ${E.tower.vision}, amplía el territorio ${E.tower.influence} casilla y dispara ${E.tower.damage} de daño cada noche.`,
  outpost: `Amplía el territorio ${E.outpost.influence} casillas, cura ${E.outpost.heal} PV a quien duerma al lado y permite alistar tropas allí.`,
  bridge: 'Permite cruzar un río dentro o junto a tu territorio.',
  wall: `Bloquea el paso de las criaturas: tienen que derribarla (${B.wall.hp} PV).`,
  market: `${prod(B.market.produces)} al día y comercio de recursos. Necesita ${B.market.workers} habitantes.`,
  barracks: 'Permite alistar soldados.',
  archery: 'Permite alistar arqueros, que atacan a 2 casillas sin recibir contraataque.',
  forge: `+${E.forge.atk} de ataque para milicianos, soldados y arqueros.`,
  beacon: `Si resiste ${E.beacon.nights} noches encendido, la oscuridad es desterrada y ganas. Atrae a todas las criaturas.`,
};

const RECRUIT_INFO: { kind: RecruitKind; icon: string }[] = [
  { kind: 'militia', icon: ICONS.recruit },
  { kind: 'soldier', icon: ICONS.sword },
  { kind: 'archer', icon: ICONS.bow },
];

const RES_ICON: Record<Resource, string> = {
  food: ICONS.food,
  materials: ICONS.materials,
  stone: ICONS.stone,
  gold: ICONS.gold,
};

export class Hud {
  private root: HTMLElement;
  private logEl: HTMLElement;
  private tooltip: HTMLElement;
  private buildButtons = new Map<BuildingKind, HTMLButtonElement>();
  private tipTimer: number | null = null;
  private castleOpen = false;
  readonly minimapSlot: HTMLElement;

  constructor(private cb: HudCallbacks) {
    this.root = $('#hud');
    this.root.innerHTML = `
      <header class="top">
        <div class="left-col">
          <section class="panel day-panel">
            <div class="day-row">
              <span class="sun-icon">${ICONS.sun}</span>
              <span class="day-label">Día <b data-id="day">1</b></span>
              <span class="diff-tag" data-id="difficulty"></span>
            </div>
            <div class="dial" data-id="dial">${'<i></i>'.repeat(BALANCE.hoursPerDay)}</div>
            <div class="hours-text" data-id="hours"></div>
          </section>
          <button class="panel castle-chip" data-id="castle-chip" title="Castillo (C)">
            <span class="ico">${ICONS.castle}</span>
            <span class="castle-chip-body">
              <b data-id="castle-name"></b>
              <span class="castle-hp"><i data-id="castle-hp"></i></span>
              <small data-id="castle-sub"></small>
            </span>
          </button>
        </div>
        <section class="panel resources" data-id="resources">
          ${RESOURCES.map(
            (r) => `<div class="res res-${r}" data-res="${r}">
              <span class="ico">${RES_ICON[r]}</span>
              <div><b data-id="res-${r}">0</b><small data-id="delta-${r}"></small></div>
            </div>`,
          ).join('')}
          <div class="res res-pop" data-res="pop">
            <span class="ico">${ICONS.people}</span>
            <div><b data-id="pop">0</b><small data-id="pop-sub"></small></div>
          </div>
        </section>
        <div class="right-col">
          <section class="panel boss" data-id="boss">
            <div class="boss-head"><span class="ico">${ICONS.crown}</span><span>Rey de la Noche</span></div>
            <div class="boss-bar"><div data-id="boss-fill"></div></div>
            <div class="boss-state" data-id="boss-state"></div>
          </section>
          <section class="panel minimap" data-id="minimap"></section>
          <ol class="log" data-id="log"></ol>
        </div>
      </header>

      <aside class="panel castle-panel" data-id="castle-panel"></aside>

      <div class="advisor" data-id="advisor"><span class="ico">${ICONS.bulb}</span><p data-id="advisor-text"></p></div>
      <aside class="panel unit-card" data-id="unit-card"></aside>

      <nav class="build-bar panel" data-id="build-bar">
        <button class="build-castle" data-id="castle-btn" title="Castillo (C)"><span class="ico">${ICONS.castle}</span><span>Castillo</span><kbd>C</kbd></button>
        <div class="build-sep"></div>
        <div class="build-list" data-id="build-list"></div>
        <span class="works" data-id="works"></span>
      </nav>

      <div class="corner-buttons">
        <button class="round-btn" data-id="threat" title="Zona de amenaza (T)">${ICONS.eye}</button>
        <button class="round-btn" data-id="mute" title="Silenciar (M)">${ICONS.volume}</button>
        <button class="round-btn" data-id="settings" title="Ajustes">${ICONS.gear}</button>
        <button class="round-btn" data-id="help" title="Cómo se juega (H)">${ICONS.help}</button>
      </div>
      <button class="end-day" data-id="end-day">
        <span class="ico">${ICONS.moon}</span>
        <span><b>Dormir</b><small>Terminar el día · Espacio</small></span>
      </button>
      <div class="mode-hint" data-id="mode-hint"></div>
    `;

    this.logEl = this.q('log');
    this.tooltip = $('#tooltip');
    this.minimapSlot = this.q('minimap');

    const list = this.q('build-list');
    for (const b of BUILD_ORDER) {
      const def = B[b.kind];
      const el = document.createElement('button');
      el.className = `build build-${b.kind}`;
      el.innerHTML = `<span class="ico">${b.icon}</span><span class="label">${def.name}</span>${b.key ? `<kbd>${b.key}</kbd>` : ''}<i class="lock">${ICONS.lock}</i>`;
      el.addEventListener('click', () => cb.onBuild(b.kind));
      el.addEventListener('pointerenter', (e) =>
        this.showTip(
          e as PointerEvent,
          `<b>${def.name}</b><p class="tip-cost">${costText(def.cost)} · ${def.days} ${def.days === 1 ? 'día' : 'días'} de obra</p><p>${BUILD_INFO[b.kind]}</p><p class="tip-reason" data-reason></p>`,
          el,
        ),
      );
      el.addEventListener('pointerleave', () => this.hideTip());
      list.appendChild(el);
      this.buildButtons.set(b.kind, el);
    }

    this.q('castle-btn').addEventListener('click', () => cb.onCastle());
    this.q('castle-chip').addEventListener('click', () => cb.onCastle());
    this.q('end-day').addEventListener('click', () => cb.onEndDay());
    this.q('help').addEventListener('click', () => cb.onHelp());
    this.q('settings').addEventListener('click', () => cb.onSettings());
    this.q('threat').addEventListener('click', () => cb.onToggleThreat());
    this.q('mute').addEventListener('click', () => cb.onToggleMute());
    this.q('advisor').addEventListener('click', () => this.q('advisor').classList.remove('on'));

    for (const el of this.root.querySelectorAll<HTMLElement>('[data-res]')) {
      el.addEventListener('pointerenter', (e) => this.showTip(e as PointerEvent, el.dataset.tip ?? '', el));
      el.addEventListener('pointerleave', () => this.hideTip());
    }
  }

  private q<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.root.querySelector(`[data-id="${id}"]`) as T;
  }

  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
  }

  setNight(on: boolean) {
    document.body.classList.toggle('is-night', on);
  }

  setToggles(threat: boolean, muted: boolean) {
    this.q('threat').classList.toggle('active', threat);
    const mute = this.q('mute');
    mute.innerHTML = muted ? ICONS.mute : ICONS.volume;
    mute.classList.toggle('active', muted);
  }

  /** Al caer la noche: apaga el reloj de luz sin adelantar el día siguiente. */
  showNightfall() {
    for (const pip of this.q('dial').children) pip.classList.remove('on');
    this.q('hours').textContent = 'Noche';
    this.q('unit-card').classList.remove('on');
    this.setCastleOpen(false);
  }

  setBusy(on: boolean) {
    this.root.classList.toggle('busy', on);
  }

  get isCastleOpen() {
    return this.castleOpen;
  }

  setCastleOpen(on: boolean) {
    this.castleOpen = on;
    this.q('castle-panel').classList.toggle('on', on);
    this.q('castle-btn').classList.toggle('active', on);
  }

  update(game: Game, selected: Unit | null, building: BuildingKind | null, endangered = 0) {
    const s = game.state;
    const eco = game.economy();
    this.q('day').textContent = String(s.day);
    this.q('difficulty').textContent = game.difficulty.name;
    this.q('difficulty').dataset.level = s.difficulty;
    const pips = this.q('dial').children;
    for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i < s.hours);
    this.q('hours').textContent =
      s.phase === 'night'
        ? 'Noche'
        : s.hours === 0
          ? 'Sin luz para el héroe: hora de dormir'
          : `${s.hours} ${s.hours === 1 ? 'hora' : 'horas'} de luz`;

    // Recursos
    for (const r of RESOURCES) {
      this.setNumber(`res-${r}`, s.res[r]);
      const net = eco.production[r] - (r === 'food' ? eco.upkeep : 0);
      const d = this.q(`delta-${r}`);
      d.textContent = `${net >= 0 ? '+' : ''}${net}/día`;
      d.className = net > 0 ? 'pos' : net < 0 ? 'neg' : '';
    }
    const resTips: Record<string, string> = {
      food: `<b>Víveres</b><p>Producción ${eco.production.food} (castillo y granjas) · consumo ${eco.upkeep} (tropas y habitantes). Si se agotan, hay hambruna.</p>`,
      materials: '<b>Materiales</b><p>De los aserraderos y de las criaturas derrotadas. Casi todo se construye con ellos.</p>',
      stone: '<b>Piedra</b><p>De las canteras junto a montañas. Necesaria para mejorar el castillo, murallas y edificios avanzados.</p>',
      gold: '<b>Oro</b><p>Del mercado y de las aldeas anexionadas. Para tropas de élite y los niveles altos del castillo.</p>',
      pop: `<b>Habitantes</b><p>${s.population} de ${eco.housing} plazas. Trabajan ${eco.workersAssigned} de ${eco.workersNeeded} puestos${eco.understaffed.length ? ` · <em>${eco.understaffed.length} edificio(s) sin personal</em>` : ''}. Crecen +1 al día si hay comida y casas; cada tropa alistada sale de aquí.</p>`,
    };
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-res]')) el.dataset.tip = resTips[el.dataset.res!];
    this.setNumber('pop', s.population);
    const popSub = this.q('pop-sub');
    popSub.textContent = `de ${eco.housing}${eco.understaffed.length ? ' · faltan manos' : ''}`;
    popSub.className = eco.understaffed.length ? 'neg' : '';

    // Castillo (resumen)
    const c = s.castle;
    this.q('castle-name').textContent = game.castleDef.name;
    this.q('castle-hp').style.width = `${(c.hp / c.maxHp) * 100}%`;
    this.q('castle-hp').dataset.level = c.hp / c.maxHp > 0.6 ? 'high' : c.hp / c.maxHp > 0.3 ? 'mid' : 'low';
    this.q('castle-sub').textContent = `${c.hp}/${c.maxHp} PV · obras ${game.worksActive()}/${game.castleDef.slots}${
      c.upgrade ? ` · mejora en ${c.upgrade} d` : ''
    }${s.beaconNights !== null ? ` · faro ${s.beaconNights}/${E.beacon.nights}` : ''}`;
    this.q('works').textContent = `Cuadrillas ${game.worksActive()}/${game.castleDef.slots}`;

    // Rey
    const king = game.king;
    const boss = this.q('boss');
    const known = !!king && game.isUnitVisible(king);
    boss.classList.toggle('known', known);
    boss.classList.toggle('awake', s.kingAwake);
    if (king) {
      this.q('boss-fill').style.width = known ? `${(king.hp / king.maxHp) * 100}%` : '100%';
      this.q('boss-state').textContent = s.kingAwake
        ? known
          ? `${king.hp} / ${king.maxHp} PV · Despierto`
          : 'Ha despertado y avanza…'
        : `Duerme · despertará la noche del día ${game.difficulty.kingWakeDay}`;
    }

    this.updateUnitCard(game, selected);

    // Barra de construcción
    for (const [kind, el] of this.buildButtons) {
      const reason = game.canBuild(kind);
      const locked = s.castle.level < B[kind].level;
      el.disabled = !!reason || s.phase !== 'day';
      el.dataset.reason = reason ?? '';
      el.classList.toggle('locked', locked);
      el.classList.toggle('active', building === kind);
    }
    const endDay = this.q('end-day');
    endDay.classList.toggle('urgent', s.phase === 'day' && s.hours === 0);
    endDay.classList.toggle('warn', s.phase === 'day' && endangered > 0);
    endDay.querySelector('small')!.textContent =
      endangered > 0
        ? `${endangered} ${endangered === 1 ? 'unidad' : 'unidades'} en peligro · Espacio`
        : 'Terminar el día · Espacio';

    if (this.castleOpen) this.renderCastle(game);
  }

  private updateUnitCard(game: Game, selected: Unit | null) {
    const card = this.q('unit-card');
    if (!selected) {
      card.classList.remove('on');
      return;
    }
    const b = BALANCE.units[selected.kind];
    const pct = (selected.hp / selected.maxHp) * 100;
    const isHero = selected.kind === 'hero';
    let renown = '';
    if (isHero) {
      const lvl = selected.level ?? 1;
      const prev = BALANCE.hero.levels[lvl - 1] ?? 0;
      const next = game.nextLevelAt(lvl);
      const r = selected.renown ?? 0;
      const rp = next === null ? 100 : ((r - prev) / (next - prev)) * 100;
      renown = `<div class="renown-row" title="Renombre: se gana derrotando criaturas"><span class="ico">${ICONS.star}</span><div class="renown-bar"><div style="width:${rp}%"></div></div><span>${next === null ? 'máx.' : `${r}/${next}`}</span></div>`;
    }
    const icon = isHero ? ICONS.crown : selected.kind === 'archer' ? ICONS.bow : selected.kind === 'soldier' ? ICONS.sword : ICONS.recruit;
    card.innerHTML = `
      <div class="unit-portrait kind-${selected.kind}"><span>${icon}</span>${isHero ? `<i class="lvl">${selected.level ?? 1}</i>` : ''}</div>
      <div class="unit-info">
        <div class="unit-name">${b.name}${isHero ? ` <small>nivel ${selected.level ?? 1}</small>` : ''}</div>
        <div class="unit-hp-row"><span class="ico">${ICONS.heart}</span><div class="hpbar"><div style="width:${pct}%"></div></div><span>${selected.hp}/${selected.maxHp}</span></div>
        ${renown}
        <div class="unit-stats">
          <span><span class="ico">${ICONS.sword}</span>${selected.atk} ATQ${b.range > 1 ? ` · alcance ${b.range}` : ''}</span>
          <span><span class="ico">${ICONS.food}</span>${b.upkeep}/día</span>
          <span>Visión ${b.vision}</span>
        </div>
      </div>`;
    card.classList.add('on');
  }

  /** Panel del castillo: mejora, reclutamiento, mercado y población. */
  private renderCastle(game: Game) {
    const s = game.state;
    const c = s.castle;
    const def = game.castleDef;
    const next = BALANCE.castle.levels[c.level];
    const eco = game.economy();
    const upErr = game.canUpgradeCastle();

    const upgrade = next
      ? c.upgrade > 0
        ? `<p class="cp-note">Las obras de la <b>${next.name}</b> terminan en ${c.upgrade} ${c.upgrade === 1 ? 'día' : 'días'}.</p>`
        : `<div class="cp-upgrade">
            <div><b>${next.name}</b>
              <p>Territorio radio ${next.radius} · ${next.slots} cuadrillas · ${next.hp} PV · +${next.food} víveres · ${next.housing} plazas</p>
              <p class="cp-unlocks">${unlocksFor(c.level + 1)}</p>
              <p class="cp-cost">${costText(next.cost)} · ${next.days} días</p>
            </div>
            <button class="btn small ${upErr ? '' : 'primary'}" data-act="upgrade" ${upErr ? 'disabled' : ''} title="${upErr ?? ''}">Mejorar</button>
          </div>`
      : '<p class="cp-note">La Ciudadela del Alba está completa. Enciende el Faro para desterrar la noche.</p>';

    const recruit = RECRUIT_INFO.map(({ kind, icon }) => {
      const r = BALANCE.recruit[kind];
      const u = BALANCE.units[kind];
      const err = game.canRecruit(kind);
      const atk = u.atk + (s.forge ? E.forge.atk : 0);
      return `<div class="cp-row ${err ? 'off' : ''}">
        <span class="ico">${icon}</span>
        <div><b>${u.name}</b><p>${u.hp} PV · ${atk} ATQ${u.range > 1 ? ` · alcance ${u.range}` : ''} · ${costText(r.cost)} · 1 habitante</p>${err ? `<p class="cp-err">${err}</p>` : ''}</div>
        <button class="btn small" data-act="recruit" data-kind="${kind}" ${err ? 'disabled' : ''}>Alistar</button>
      </div>`;
    }).join('');

    const market = game.hasBuilding('market')
      ? `<h4>Mercado</h4><div class="cp-trades">${BALANCE.market
          .map((o, i) => {
            const err = game.canTrade(i);
            return `<button class="btn small trade" data-act="trade" data-i="${i}" ${err ? 'disabled' : ''}>${costText(o.give)} → ${costText(o.get)}</button>`;
          })
          .join('')}</div>`
      : '';

    const works = [...s.tiles.values()].filter((t) => (t.work ?? 0) > 0);
    const worksHtml = works.length
      ? works.map((t) => `<li>${B[t.structure as BuildingKind].name}: ${t.work} ${t.work === 1 ? 'día' : 'días'}</li>`).join('')
      : '<li class="muted">Ninguna. Elige un edificio en la barra inferior.</li>';

    const panel = this.q('castle-panel');
    panel.innerHTML = `
      <header class="cp-head">
        <span class="ico">${ICONS.castle}</span>
        <div><h3>${def.name}</h3><div class="castle-hp big"><i style="width:${(c.hp / c.maxHp) * 100}%"></i></div><small>${c.hp}/${c.maxHp} PV · nivel ${c.level} · dispara ${def.damage} por noche</small></div>
        <button class="cp-close" data-act="close" title="Cerrar (C)">×</button>
      </header>
      <h4>Mejorar</h4>${upgrade}
      <h4>Alistar tropas</h4>${recruit}
      ${market}
      <h4>El reino</h4>
      <ul class="cp-stats">
        <li><span class="ico">${ICONS.people}</span>${s.population} habitantes de ${eco.housing} plazas</li>
        <li><span class="ico">${ICONS.hammer}</span>Trabajando ${eco.workersAssigned}/${eco.workersNeeded}${eco.understaffed.length ? ` · <em>${eco.understaffed.length} edificio(s) parados</em>` : ''}</li>
        <li><span class="ico">${ICONS.food}</span>Producción: ${RESOURCES.filter((r) => eco.production[r]).map((r) => `+${eco.production[r]} ${r === 'food' ? 'víveres' : r === 'materials' ? 'mat.' : r === 'stone' ? 'piedra' : 'oro'}`).join(' · ') || 'nada'}</li>
      </ul>
      <h4>Obras en curso (${works.length}/${def.slots})</h4>
      <ul class="cp-works">${worksHtml}</ul>
    `;
    panel.querySelector('[data-act="close"]')!.addEventListener('click', () => this.cb.onCastle());
    panel.querySelector('[data-act="upgrade"]')?.addEventListener('click', () => this.cb.onUpgrade());
    for (const b of panel.querySelectorAll<HTMLButtonElement>('[data-act="recruit"]'))
      b.addEventListener('click', () => this.cb.onRecruit(b.dataset.kind as RecruitKind));
    for (const b of panel.querySelectorAll<HTMLButtonElement>('[data-act="trade"]'))
      b.addEventListener('click', () => this.cb.onTrade(Number(b.dataset.i)));
  }

  /** Cambia un número con un pequeño destello si sube o baja. */
  private setNumber(id: string, value: number) {
    const el = this.q(id);
    const prev = Number(el.textContent);
    el.textContent = String(value);
    if (!Number.isNaN(prev) && prev !== value && el.dataset.ready) {
      el.classList.remove('bump-up', 'bump-down');
      void el.offsetWidth;
      el.classList.add(value > prev ? 'bump-up' : 'bump-down');
    }
    el.dataset.ready = '1';
  }

  setModeHint(text: string | null) {
    const el = this.q('mode-hint');
    el.textContent = text ?? '';
    el.classList.toggle('on', !!text);
  }

  log(text: string, tone: Tone = 'info') {
    const li = document.createElement('li');
    li.className = `tone-${tone}`;
    li.textContent = text;
    this.logEl.prepend(li);
    while (this.logEl.children.length > 5) this.logEl.lastElementChild!.remove();
    setTimeout(() => li.classList.add('old'), 9000);
  }

  /** Consejo contextual del consejero, se cierra solo o con un clic. */
  advise(text: string) {
    const el = this.q('advisor');
    this.q('advisor-text').textContent = text;
    el.classList.add('on');
    if (this.tipTimer) clearTimeout(this.tipTimer);
    this.tipTimer = window.setTimeout(() => el.classList.remove('on'), 9000);
  }

  // ───────────────────────── tooltip ─────────────────────────

  showTip(e: PointerEvent | { clientX: number; clientY: number }, html: string, anchor?: HTMLElement) {
    if (!html) return;
    this.tooltip.innerHTML = html;
    const reason = anchor?.dataset.reason;
    const r = this.tooltip.querySelector<HTMLElement>('[data-reason]');
    if (r) r.textContent = reason ?? '';
    this.tooltip.classList.add('on');
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      const below = rect.top < 140;
      this.placeTip(rect.left + rect.width / 2, below ? rect.bottom : rect.top, !below, below);
    } else this.placeTip(e.clientX, e.clientY, false);
  }

  placeTip(x: number, y: number, above: boolean, centeredBelow = false) {
    const t = this.tooltip;
    const w = t.offsetWidth;
    const h = t.offsetHeight;
    let left = above || centeredBelow ? x - w / 2 : x + 18;
    let top = above ? y - h - 12 : centeredBelow ? y + 10 : y + 18;
    left = Math.max(10, Math.min(window.innerWidth - w - 10, left));
    top = Math.max(10, Math.min(window.innerHeight - h - 10, top));
    t.style.transform = `translate(${left}px, ${top}px)`;
  }

  hideTip() {
    this.tooltip.classList.remove('on');
  }

  // ───────────────────────── pantallas ─────────────────────────

  async banner(title: string, subtitle = '', duration = 2200, tone = '') {
    const el = $('#banner');
    el.className = `banner ${tone}`;
    el.innerHTML = `<h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}`;
    void el.offsetWidth;
    el.classList.add('on');
    await new Promise((r) => setTimeout(r, duration));
    el.classList.remove('on');
  }

  /** Tarjeta de suceso (presagio o descubrimiento). */
  omen(title: string, text: string, tone: 'good' | 'bad') {
    const el = $('#omen');
    el.className = `omen ${tone}`;
    el.innerHTML = `<span class="ico">${tone === 'good' ? ICONS.star : ICONS.moon}</span><div><b>${title}</b><p>${text}</p></div>`;
    void el.offsetWidth;
    el.classList.add('on');
    setTimeout(() => el.classList.remove('on'), 4200);
  }

  showEnd(
    victory: boolean,
    game: Game,
    record: { best: number | null; isNew: boolean },
    onRestart: (sameSeed: boolean) => void,
  ) {
    const { day, stats, endReason } = game.state;
    const hero = game.hero;
    const lead = {
      king: `El Rey de la Noche ha caído el día ${day}. La luz vuelve a la tierra.`,
      beacon: `El Faro del Alba ha resistido. El día ${day} la noche fue desterrada para siempre.`,
      hero: `El héroe cayó el día ${day} y con él, la esperanza.`,
      castle: `El castillo cayó el día ${day}. La oscuridad reina sobre sus ruinas.`,
    }[endReason ?? (victory ? 'king' : 'hero')];
    const el = $('#end-screen');
    el.className = `screen end ${victory ? 'victory' : 'defeat'}`;
    el.innerHTML = `
      <div class="screen-card">
        <div class="end-ico">${victory ? ICONS.sun : ICONS.moon}</div>
        <h1>${victory ? 'Amanece' : 'Derrota'}</h1>
        <p class="lead">${lead}</p>
        <p class="end-meta">Dificultad ${game.difficulty.name} · Semilla ${game.state.seed} · ${game.castleDef.name}${hero ? ` · Héroe nivel ${hero.level ?? 1}` : ''}</p>
        ${
          victory && record.best !== null
            ? `<p class="record ${record.isNew ? 'new' : ''}">${record.isNew ? '¡Nuevo récord!' : 'Récord'}: victoria en ${record.best} días</p>`
            : ''
        }
        <div class="stats">
          <div><b>${day}</b><span>días</span></div>
          <div><b>${stats.territory}</b><span>casillas de territorio</span></div>
          <div><b>${stats.structuresBuilt}</b><span>edificios levantados</span></div>
          <div><b>${stats.soldiersRecruited}</b><span>tropas alistadas</span></div>
          <div><b>${stats.shadesSlain}</b><span>criaturas disipadas</span></div>
          <div><b>${stats.lairsDestroyed}</b><span>guaridas destruidas</span></div>
        </div>
        <div class="buttons">
          <button class="btn primary" data-act="new">Nuevo mundo</button>
          <button class="btn" data-act="same">Repetir este mapa</button>
        </div>
      </div>`;
    el.querySelector('[data-act="new"]')!.addEventListener('click', () => onRestart(false));
    el.querySelector('[data-act="same"]')!.addEventListener('click', () => onRestart(true));
    requestAnimationFrame(() => el.classList.add('on'));
  }
}

/** Qué desbloquea cada nivel del castillo. */
function unlocksFor(level: number): string {
  const names = (Object.keys(B) as BuildingKind[]).filter((k) => B[k].level === level).map((k) => B[k].name);
  const troops = (Object.keys(BALANCE.recruit) as RecruitKind[])
    .filter((k) => BALANCE.recruit[k].castleLevel === level)
    .map((k) => BALANCE.units[k].name.toLowerCase() + 's');
  const all = [...names, ...troops.map((t) => `alistar ${t}`)];
  return all.length ? `Desbloquea: ${all.join(', ')}` : '';
}
