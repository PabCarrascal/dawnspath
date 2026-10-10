import '../combat/combat.css';
import './campaign.css';
import '../ui/theme.css';
import { audio, Track } from '../audio/Audio';
import { soundSection } from '../audio/SoundControl';
import { mountSettings, SettingsSection } from '../ui/settings';
import { Combat } from '../combat/rules/Combat';
import { startCombat } from '../combat/session';
import { seedFromString } from '../core/rng';
import { Campaign } from './rules/Campaign';
import { amount, costHtml, icon } from '../ui/icons';
import { BUILDINGS, CBAL, KIND_NAMES, NODE, STRUCTURES } from './rules/data';
import { EVENT } from './rules/events';
import type { ActionResult, BuildingId, CampaignState, LogLine, NameStyle, Soldier } from './rules/types';
import { MapView } from './view/MapView';
import { Hd2dCombatView } from '../hd2d/battle';
import type { Mode } from '../hd2d/look';
import { portrait } from '../hd2d/portrait';
import { Stage3D } from '../hd2d/stage';

// `?partida=nombre` usa otra ranura de guardado (para probar sin tocar la partida principal).
const slot = new URLSearchParams(location.search).get('partida');
const SAVE_KEY = `dawnspath.campaign.v2${slot ? `.${slot}` : ''}`;
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

const stage = $('#stage');
const overlay = $('#overlay');
const ui = $('#ui');


let campaign: Campaign;
/** La maqueta en pantalla (castillo o nodo); se libera durante los combates. */
let scene: Stage3D | null = null;
/** Clave de la maqueta actual, para reutilizarla al cambiar solo la hora. */
let sceneKey = '';

// ───────────────────────── guardado ─────────────────────────

function load(): CampaignState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as CampaignState;
    return s.version === 2 ? s : null;
  } catch {
    return null;
  }
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(campaign.state));
  } catch {
    // Sin almacenamiento (modo privado): la partida sigue, pero no se guarda.
  }
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* nada */
  }
}

// ───────────────────────── utilidades de interfaz ─────────────────────────

function toast(text: string, tone: LogLine['tone'] = 'info') {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = `cp-toast tone-${tone}`;
  t.textContent = text;
  box.appendChild(t);
  requestAnimationFrame(() => t.classList.add('on'));
  setTimeout(() => t.classList.remove('on'), 3600);
  setTimeout(() => t.remove(), 4200);
}

function logLines(lines: LogLine[]) {
  for (const l of lines) toast(l.text, l.tone);
}

/** Aplica una acción: si falla, avisa; si sale bien, guarda y muestra el registro. */
function act(r: ActionResult, sound: Parameters<typeof audio.play>[0] = 'click'): r is Extract<ActionResult, { ok: true }> {
  // Si empieza un combate, lo presenta el narrador y no los avisos.
  const quiet = r.ok && !!r.combat;
  if (!r.ok) {
    audio.play('error');
    toast(r.reason, 'bad');
    return false;
  }
  audio.play(sound);
  save();
  // Si la acción deja un informe (noche, regreso), lo cuenta el informe y no los avisos.
  if (!campaign.state.report && !quiet) logLines(r.log);
  return true;
}

async function fade(fn: () => void | Promise<void>) {
  const f = $('#fade');
  f.classList.add('on');
  await new Promise((r) => setTimeout(r, 380));
  await fn();
  f.classList.remove('on');
}

function setScene(s: Stage3D | null, key = '') {
  scene?.dispose();
  scene = s;
  sceneKey = key;
}

/** Semilla estable por nodo: la misma maqueta cada vez que se vuelve. */
const nodeSeed = (id: string) => (seedFromString(id) ^ campaign.state.seed) >>> 0;

/**
 * Abre una ventana. Si ya hay una abierta con la misma `key`, solo cambia su
 * contenido (sin parpadeo), para pantallas que se redibujan al pulsar.
 */
function modal(html: string, cls = '', key = ''): HTMLElement {
  const open = key ? $<HTMLElement>(`#modals .cp-modal[data-key="${key}"]`) : null;
  if (open) {
    $('.cp-modal-box', open).innerHTML = html;
    return open;
  }
  closeModal();
  const m = document.createElement('div');
  m.className = `cp-modal ${cls}`;
  if (key) m.dataset.key = key;
  m.innerHTML = `<div class="cp-modal-box">${html}</div>`;
  m.addEventListener('click', (e) => e.target === m && !m.classList.contains('locked') && closeModal());
  $('#modals').appendChild(m);
  requestAnimationFrame(() => m.classList.add('on'));
  return m;
}

function closeModal() {
  $('#modals').innerHTML = '';
}

function bar(value: number, max: number, cls: string) {
  return `<i class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, (value / max) * 100))}%"></i></i>`;
}

function soldierCard(s: Soldier, extra = '') {
  const c = campaign;
  const max = c.maxHp(s);
  const tags = [
    s.affliction ? `<em class="affl">${s.affliction === 'temeroso' ? 'Temeroso' : 'Desesperado'}</em>` : '',
    s.where === 'garrison' ? `<em class="post">De guardia · ${NODE[s.post!].name}</em>` : '',
  ].join('');
  return `
    <div class="cp-soldier k-${s.kind}">
      <div class="cp-soldier-head"><img class="cp-portrait" src="${portrait(s.kind)}" alt=""><div><b>${s.name}</b><span>${KIND_NAMES[s.kind]}${c.level(s) ? ` · nivel ${c.level(s)}` : ''}</span></div></div>
      <div class="cp-soldier-bars">
        <div><span>Vida</span>${bar(s.hp, max, 'hp')}<small>${s.hp}/${max}</small></div>
        <div><span>Estrés</span>${bar(s.stress, 100, 'stress')}<small>${s.stress}</small></div>
      </div>
      ${tags ? `<div class="cp-tags">${tags}</div>` : ''}
      ${extra}
    </div>`;
}

function resLine(r: { gold: number; materials: number; stone: number }) {
  return `${amount('gold', r.gold)}${amount('materials', r.materials)}${amount('stone', r.stone)}`;
}

function setNight(mode: Mode) {
  audio.setNight(mode === 'night' || mode === 'dark' ? 1 : mode === 'dusk' ? 0.7 : 0.45);
}

/** Música del sendero: el camino de día, de noche o la oscuridad (también en la torre del Heraldo). */
function roadMusic(mode: Mode, node: string): Track {
  return mode === 'dark' || NODE[node].biome === 'lair' ? 'dark' : mode === 'night' ? 'night' : 'road';
}

/** Hora de la escena: en un nodo oscuro reina la oscuridad. */
const timeOfDay = (): Mode => {
  const e = campaign.state.exp;
  if (e && campaign.node(e.node).dark) return 'dark';
  return (e?.hours ?? 12) > 4 ? 'day' : 'dusk';
};

/** Reloj de la oscuridad (o cuenta atrás del asedio) para la barra superior. */
function darkHud() {
  const s = campaign.state;
  if (s.siege !== null) {
    return `<div class="cp-dark siege" title="La oscuridad está a las puertas. Despeja el Prado Ceniciento para levantar el asedio.">☾ <span>Asedio</span><b>${s.siege} ${s.siege === 1 ? 'día' : 'días'}</b></div>`;
  }
  const n = s.darkClock;
  return `<div class="cp-dark" title="Cada ${CBAL.darkEvery} días la oscuridad cubre los nodos vecinos a los que ya son oscuros. Los nodos asegurados resisten.">☾ <span>Oscuridad</span><b>${n} ${n === 1 ? 'día' : 'días'}</b></div>`;
}

// ───────────────────────── arranque ─────────────────────────

// La pantalla de carga (src/boot) importa este módulo, monta la portada
// mientras carga y la descubre tras la presentación.

/** Campaña de la portada: la guardada, o una de muestra para pintar el patio. */
function titleCampaign() {
  const saved = load();
  campaign = new Campaign(saved?.seed ?? 1, saved ?? undefined);
  campaign.setNameStyle(namePref());
  return saved;
}

/**
 * Monta la maqueta de la portada detrás de la pantalla de carga, para que
 * texturas y sombreadores estén listos cuando se descubra.
 */
export function prepareTitle() {
  titleCampaign();
  return castleScene('dusk');
}

/** Portada con el menú. Con `reveal`, la cámara baja hacia el patio y los rótulos entran escalonados. */
export function showTitle(reveal = false) {
  const saved = titleCampaign();
  const s = scene && sceneKey === 'castle' && scene.mode === 'dusk' ? scene : castleScene('dusk');
  if (reveal && !matchMedia('(prefers-reduced-motion: reduce)').matches) s.swoop(1.35, 6000);
  audio.music('castle');
  ui.innerHTML = `
    <div class="cp-title${reveal ? ' reveal' : ''}">
      <p class="kicker">Dawn's Path</p>
      <h1>El Sendero del Alba</h1>
      <div class="cp-buttons">
        ${saved && saved.phase !== 'won' && saved.phase !== 'lost' ? `<button class="primary" data-act="continue">Continuar · día ${saved.day}</button>` : ''}
        <button class="${saved ? '' : 'primary'}" data-act="new">Nueva campaña</button>
      </div>
    </div>`;
  $('[data-act="new"]', ui).addEventListener('click', () => {
    audio.play('click');
    if (saved && saved.phase !== 'won' && saved.phase !== 'lost' && !confirm('¿Empezar de cero? Se perderá la campaña guardada.')) return;
    campaign = new Campaign(Math.floor(Math.random() * 1e9));
    campaign.setNameStyle(namePref());
    save();
    void fade(() => {
      showCastle();
      intro();
    });
  });
  $('[data-act="continue"]', ui)?.addEventListener('click', () => {
    audio.play('click');
    void fade(resume);
  });
}

/** Retoma la campaña guardada donde se quedó. */
function resume() {
  const s = campaign.state;
  if (s.phase === 'won' || s.phase === 'lost') return showEnd();
  if (s.pending) return void fight();
  if (s.phase === 'castle') return showCastle();
  showNode();
  if (s.event) showEvent();
}

function intro() {
  const m = modal(
    `<h2>El castillo del Alba</h2>
    <p>La noche avanza desde el norte. Abre el sendero y derrota al Heraldo antes de que la oscuridad llegue a tus puertas.</p>
    <div class="cp-buttons"><button class="primary" data-act="ok">Adelante</button></div>`,
    'narrow',
  );
  $('[data-act="ok"]', m).addEventListener('click', () => closeModal());
}

// ───────────────────────── castillo ─────────────────────────

/** El patio del castillo con los soldados que esperan en él. */
function castleScene(mode: Mode) {
  const c = campaign;
  const home = c.state.soldiers.filter((x) => x.alive && x.where === 'castle').slice(0, 8);
  const s = new Stage3D(stage, 'castle', { seed: c.state.seed, mode, framing: 'castle', scene: { party: home.map((x) => x.kind), fire: false } });
  setScene(s, 'castle');
  return s;
}

function showCastle() {
  const c = campaign;
  closeModal();
  setNight('dusk');
  audio.music('castle');
  const s = castleScene('dusk');

  ui.innerHTML = `
    ${castleHud()}
    <div class="cp-hotspots">
      ${(Object.keys(BUILDINGS) as BuildingId[])
        .map((b) => `<button class="cp-hotspot" data-b="${b}"><b>${BUILDINGS[b].name}</b>${c.state.buildings[b] ? `<span>nivel ${c.state.buildings[b]}</span>` : ''}</button>`)
        .join('')}
    </div>
    <footer class="cp-panel">
      <section class="cp-roster">
        ${c.state.soldiers
          .filter((x) => x.alive)
          .map((x) => soldierCard(x))
          .join('')}
      </section>
      <section class="cp-actions">
        <button class="primary" data-act="prep">Preparar expedición</button>
        <button data-act="map">Ver el mapa</button>
        <button data-act="rest" title="Todos los soldados del castillo bajan ${-CBAL.rest.castle.stress} de estrés; el tiempo corre.">Pasar un día</button>
        ${c.state.stats.deaths ? `<button data-act="memorial">Memorial (${c.state.stats.deaths})</button>` : ''}
      </section>
    </footer>`;

  // Las etiquetas de los edificios siguen a la maqueta (la cámara deriva despacio).
  const labels = (Object.keys(BUILDINGS) as BuildingId[]).map((b) => [$(`[data-b="${b}"]`, ui), s.diorama.anchors[b]] as const);
  s.onFrame = () => {
    for (const [el, at] of labels) {
      if (!at || !el.isConnected) continue;
      const p = s.project(at);
      const half = el.offsetWidth / 2 + 8;
      el.style.left = `${Math.min(window.innerWidth - half, Math.max(half, p.x))}px`;
      el.style.top = `${p.y}px`;
    }
  };
  for (const el of ui.querySelectorAll<HTMLElement>('[data-b]')) el.addEventListener('click', () => showBuilding(el.dataset.b as BuildingId));
  $('[data-act="prep"]', ui).addEventListener('click', () => showPrep());
  $('[data-act="map"]', ui).addEventListener('click', () => showMap());
  $('[data-act="rest"]', ui).addEventListener('click', () => act(c.rest(), 'dawn') && void fade(showCastle));
  $('[data-act="memorial"]', ui)?.addEventListener('click', () => showMemorial());

  if (c.state.report) showReport(() => void 0);
}

function castleHud() {
  const c = campaign;
  return `
    <header class="cp-hud">
      <div class="cp-day"><span>Día</span><b>${c.state.day}</b></div>
      <div class="cp-res">${resLine(c.state.stock)}${amount('food', c.state.stock.food)}${amount('torches', c.state.stock.torches)}</div>
      ${darkHud()}
      <div class="cp-where">Castillo del Alba</div>
    </header>`;
}

function refreshCastleHud() {
  const h = $('.cp-hud', ui);
  if (h) h.outerHTML = castleHud();
}

function showReport(then: () => void) {
  const r = campaign.state.report;
  if (!r) return then();
  const m = modal(
    `<h2>${r.title}</h2>
    <ul class="cp-report">${r.lines.map((l) => `<li class="tone-${l.tone}">${l.text}</li>`).join('')}</ul>
    <div class="cp-buttons"><button class="primary" data-act="ok">Continuar</button></div>`,
    'narrow locked',
  );
  $('[data-act="ok"]', m).addEventListener('click', () => {
    campaign.state.report = null;
    save();
    closeModal();
    then();
  });
}

function showMemorial() {
  const fallen = campaign.state.soldiers.filter((s) => !s.alive);
  const m = modal(
    `<h2>Memorial</h2>
    <ul class="cp-report">${fallen.map((s) => `<li><b>${s.name}</b> · ${KIND_NAMES[s.kind]} · ${s.fate ?? ''}</li>`).join('')}</ul>
    <div class="cp-buttons"><button data-act="ok">Cerrar</button></div>`,
    'narrow',
  );
  $('[data-act="ok"]', m).addEventListener('click', closeModal);
}

function showBuilding(b: BuildingId) {
  const c = campaign;
  const def = BUILDINGS[b];
  const lvl = c.state.buildings[b];
  const cost = def.cost[lvl];
  let body = '';
  if (b === 'tavern') {
    const home = c.state.soldiers.filter((s) => s.alive && s.where === 'castle');
    body = `
      <h3>Tratar · ${amount('gold', CBAL.treatCost)}</h3>
      <div class="cp-rows">${home
        .map(
          (s) => `<div class="cp-row"><span><b>${s.name}</b> · estrés ${s.stress}${s.affliction ? ` · <em class="affl">${s.affliction}</em>` : ''}</span>
          <button data-treat="${s.id}" ${s.stress || s.affliction ? '' : 'disabled'}>Tratar</button></div>`,
        )
        .join('')}</div>
      <h3>Reclutas</h3>
      <div class="cp-rows">${
        c.state.recruits
          .map(
            (r, i) => `<div class="cp-row"><span><b>${r.name}</b> · ${KIND_NAMES[r.kind]}</span>
          <button data-recruit="${i}">${r.cost ? `Reclutar · ${amount('gold', r.cost)}` : 'Se ofrece gratis'}</button></div>`,
          )
          .join('') || '<p class="dim">Nadie espera.</p>'
      }</div>`;
  }
  // Solo lo que da ahora y lo que daría la siguiente mejora.
  const m = modal(
    `<h2>${def.name} <small>· nivel ${lvl}</small></h2>
    <p class="lead">${lvl ? def.levels[lvl] : def.desc}</p>
    ${cost ? `<p class="dim">Siguiente: ${def.levels[lvl + 1]}</p>` : ''}
    ${body}
    <div class="cp-buttons">
      ${cost ? `<button class="primary" data-act="up" ${c.canAfford(c.state.stock, cost) ? '' : 'disabled'}>Mejorar · ${costHtml(cost)}</button>` : '<span class="dim">Nivel máximo</span>'}
      <button data-act="close">Cerrar</button>
    </div>`,
    '',
    `building-${b}`,
  );
  $('[data-act="close"]', m).addEventListener('click', () => showCastle());
  $('[data-act="up"]', m)?.addEventListener('click', () => {
    if (act(c.upgrade(b), 'levelUp')) {
      showCastle();
      showBuilding(b);
    }
  });
  for (const el of m.querySelectorAll<HTMLButtonElement>('[data-treat]')) {
    el.addEventListener('click', () => act(c.treat(el.dataset.treat!), 'heal') && (refreshCastleHud(), showBuilding(b)));
  }
  for (const el of m.querySelectorAll<HTMLButtonElement>('[data-recruit]')) {
    el.addEventListener('click', () => act(c.recruit(Number(el.dataset.recruit)), 'good') && (showCastle(), showBuilding(b)));
  }
}

/** Preparar la expedición: grupo en orden de posiciones, víveres y antorchas. */
function showPrep(selected?: string[]) {
  const c = campaign;
  const home = c.state.soldiers.filter((s) => s.alive && s.where === 'castle');
  const order = ['hero', 'spearman', 'archer', 'chaplain'];
  let party =
    selected ??
    home
      .filter((s) => !s.affliction)
      .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
      .slice(0, CBAL.partyMax)
      .map((s) => s.id);
  if (!party.includes(c.hero.id) && c.hero.where === 'castle') party = [c.hero.id, ...party].slice(0, CBAL.partyMax);
  const st = c.state.stock;
  const need = party.length;
  const m = modal(
    `<h2>Preparar expedición</h2>
    <div class="cp-prep">
      <section>
        <h3>Grupo</h3>
        <ol class="cp-party">${party
          .map((id, i) => {
            const s = c.soldier(id)!;
            return `<li>${soldierCard(s, `<div class="cp-order"><button data-up="${i}" ${i ? '' : 'disabled'}>▲</button><button data-down="${i}" ${i < party.length - 1 ? '' : 'disabled'}>▼</button>${s.kind === 'hero' ? '' : `<button data-drop="${id}">Quitar</button>`}</div>`)}</li>`;
          })
          .join('')}</ol>
        ${
          home.filter((s) => !party.includes(s.id)).length
            ? `<h3>En el castillo</h3><div class="cp-bench">${home
                .filter((s) => !party.includes(s.id))
                .map((s) => `<button class="cp-bench-card" data-add="${s.id}" ${party.length >= CBAL.partyMax ? 'disabled' : ''}><img class="cp-portrait" src="${portrait(s.kind)}" alt="">${s.name}<small>${KIND_NAMES[s.kind]} · estrés ${s.stress}${s.affliction ? ' · afligido' : ''}</small></button>`)
                .join('')}</div>`
            : ''
        }
      </section>
      <section>
        <h3>Provisiones</h3>
        <div class="cp-row"><span>${icon('food')} Víveres <small>${amount('gold', CBAL.foodPrice)}</small></span>
          <span class="cp-stepper"><button data-buy="food:-1">−</button><b>${st.food}</b><button data-buy="food:1">+</button></span></div>
        <div class="cp-row"><span>${icon('torches')} Antorchas <small>${amount('gold', CBAL.torchPrice)}</small></span>
          <span class="cp-stepper"><button data-buy="torches:-1">−</button><b>${st.torches}</b><button data-buy="torches:1">+</button></span></div>
        ${st.food < need * 3 ? `<p><button class="cp-link" data-act="supply">Completar víveres</button></p>` : ''}
        <p class="cp-stock">${amount('gold', st.gold)}</p>
      </section>
    </div>
    <div class="cp-buttons">
      ${st.food < need ? '<span class="tone-bad">Faltan víveres.</span>' : ''}
      <button class="primary" data-act="go">Partir</button>
      <button data-act="close">Cancelar</button>
    </div>`,
    'wide',
    'prep',
  );
  const swap = (i: number, j: number) => {
    [party[i], party[j]] = [party[j], party[i]];
    showPrep(party);
  };
  for (const el of m.querySelectorAll<HTMLButtonElement>('[data-up]')) el.addEventListener('click', () => swap(+el.dataset.up!, +el.dataset.up! - 1));
  for (const el of m.querySelectorAll<HTMLButtonElement>('[data-down]')) el.addEventListener('click', () => swap(+el.dataset.down!, +el.dataset.down! + 1));
  for (const el of m.querySelectorAll<HTMLButtonElement>('[data-drop]')) el.addEventListener('click', () => showPrep(party.filter((x) => x !== el.dataset.drop)));
  for (const el of m.querySelectorAll<HTMLButtonElement>('[data-add]')) el.addEventListener('click', () => showPrep([...party, el.dataset.add!]));
  for (const el of m.querySelectorAll<HTMLButtonElement>('[data-buy]')) {
    el.addEventListener('click', () => {
      const [item, n] = el.dataset.buy!.split(':');
      if (act(c.buy(item as 'food' | 'torches', Number(n)))) {
        refreshCastleHud();
        showPrep(party);
      }
    });
  }
  $('[data-act="supply"]', m)?.addEventListener('click', () => {
    const want = Math.min(need * 3, CBAL.foodCap) - st.food;
    const afford = Math.min(want, Math.floor(st.gold / CBAL.foodPrice));
    if (afford > 0 && act(c.buy('food', afford))) {
      refreshCastleHud();
      showPrep(party);
    } else if (afford <= 0) toast('No hay oro suficiente.', 'bad');
  });
  $('[data-act="close"]', m).addEventListener('click', closeModal);
  $('[data-act="go"]', m).addEventListener('click', () => {
    if (!act(c.depart(party), 'step')) return;
    void fade(() => showNode());
  });
}

// ───────────────────────── nodo ─────────────────────────

/** La maqueta del nodo: el grupo en el claro, su campamento o torre, la guardia y el botín. */
function nodeScene(mode: Mode) {
  const c = campaign;
  const e = c.state.exp!;
  const def = NODE[e.node];
  const n = c.node(e.node);
  const loot = !n.foes.length && !n.looted && Object.keys(def.loot).length > 0 && def.id !== 'castle';
  const key = JSON.stringify([e.node, e.party, n.garrison, n.sentinels ?? 0, n.structure, loot]);
  // Si solo cambia la hora (al caer la noche), se reutiliza la maqueta y la luz cambia suavemente.
  if (scene && sceneKey === key) {
    scene.setMode(mode);
    return scene;
  }
  const s = new Stage3D(stage, def.biome, {
    seed: nodeSeed(def.id),
    mode,
    framing: def.id === 'castle' ? 'castle' : 'node',
    scene: {
      party: c.party.map((x) => x.kind),
      // Los centinelas pagados se ven como lanceros de la milicia.
      garrison: [...n.garrison.map((id) => c.soldier(id)!.kind), ...Array<'spearman'>(n.sentinels ?? 0).fill('spearman')],
      structure: n.structure,
      loot,
      fire: !!n.structure || mode === 'night',
    },
  });
  setScene(s, key);
  return s;
}

function showNode(mode: Mode = timeOfDay()) {
  const c = campaign;
  const e = c.state.exp!;
  const def = NODE[e.node];
  const n = c.node(e.node);
  closeModal();
  setNight(mode);
  audio.music(roadMusic(mode, e.node));
  nodeScene(mode);
  const tod = mode;

  const hidden = def.links.filter((id) => !c.node(id).seen).length;
  const canLoot = !n.foes.length && !n.looted && Object.keys(def.loot).length > 0 && e.node !== 'castle';
  const camp = c.structureCost('camp');
  const tower = c.structureCost('tower');
  const rough = !c.sheltered(e.node);
  const need = rough ? Math.ceil(e.party.length * 1.5) : e.party.length;
  const village = def.village && !n.foes.length ? def.village : null;
  const shrine = def.type === 'shrine' && !n.foes.length;
  const cap = n.structure ? STRUCTURES[n.structure].garrison : 0;
  const atCastle = e.node === 'castle';

  const actions: string[] = [];
  actions.push(`<button class="primary" data-act="map">Viajar</button>`);
  if (atCastle) actions.push(`<button data-act="cancel">Volver a entrar</button>`);
  if (hidden) actions.push(`<button data-act="scout" title="Revela qué defiende los nodos vecinos.">Explorar · ${CBAL.scoutHours} h</button>`);
  if (canLoot) actions.push(`<button data-act="loot">Saquear · ${CBAL.lootHours} h</button>`);
  if (village) {
    const price = c.villagePrice(e.node);
    actions.push(`<button data-act="trade" title="Con el oro de la caravana.">Comprar 3 ${icon('food')} · ${amount('gold', price * 3)}</button>`);
    if (!n.uses) {
      const cost = c.hireCost(e.node);
      actions.push(`<button data-act="hire" title="${KIND_NAMES[village.recruit]}: se une al grupo.">Contratar a ${village.name} · ${cost ? amount('gold', cost) : 'gratis'}</button>`);
    }
  }
  if (shrine && n.uses > 0) actions.push(`<button data-act="pray" title="Cura, baja el estrés y quita las aflicciones de todo el grupo.">Rezar · ${CBAL.pray.hours} h</button>`);
  if (!atCastle && !n.structure && !village) actions.push(`<button data-act="camp-build" title="${STRUCTURES.camp.desc}">Campamento · ${costHtml(camp.res)} · ${camp.hours} h</button>`);
  if (!atCastle && n.structure !== 'tower' && c.state.buildings.lodge >= 1) actions.push(`<button data-act="tower-build" title="${STRUCTURES.tower.desc}">Torre · ${costHtml(tower.res)} · ${tower.hours} h</button>`);
  const room = n.structure && c.guards(e.node) < cap;
  if (room && !n.foes.length) actions.push(`<button data-act="post" title="Hace guardia sin restar al grupo.">Centinela · ${amount('gold', CBAL.sentinel.cost)}</button>`);
  if (room && e.party.length > 1) actions.push(`<button data-act="guard">Dejar de guardia…</button>`);
  // Cada soldado de guardia: relevarlo por alguien del grupo o recogerlo si hay sitio.
  for (const id of n.garrison) actions.push(`<button data-relieve="${id}">${e.party.length < CBAL.partyMax ? 'Recoger o relevar' : 'Relevar'} a ${c.soldier(id)!.name}…</button>`);
  if (!atCastle) actions.push(`<button class="night" data-act="sleep" title="${rough ? 'Al raso: no cura, sube el estrés, se come más y mañana hay menos luz.' : 'A cubierto: cura algo y baja el estrés.'}${n.dark ? ' En la oscuridad la noche pesa más y las emboscadas son más probables.' : ''}">Acampar${rough ? ' al raso' : ''} · ${amount('food', need)}</button>`);

  const hoursPct = (e.hours / e.maxHours) * 100;
  ui.innerHTML = `
    <header class="cp-hud">
      <div class="cp-day"><span>Día</span><b>${c.state.day}</b></div>
      <div class="cp-hours ${tod}" title="Horas de luz"><span>Luz</span><i><i style="width:${hoursPct}%"></i></i><b>${e.hours} h</b></div>
      <div class="cp-res">${amount('food', e.food)}${amount('torches', e.torches)}${resLine(e.bag)}</div>
      ${darkHud()}
      <div class="cp-where">${def.name}<small>${{ castle: 'puerta del castillo', cleared: village ? 'aldea' : 'limpio', secured: 'asegurado', hostile: 'hostil', lost: 'perdido', unknown: '' }[c.status(e.node)]}${n.structure ? ` · ${STRUCTURES[n.structure].name.toLowerCase()}` : ''}${n.dark ? ' · en la oscuridad' : ''}</small></div>
    </header>
    <footer class="cp-panel">
      <section class="cp-roster">${c.party.map((x) => soldierCard(x)).join('')}</section>
      <section class="cp-actions">${actions.join('')}</section>
    </footer>`;

  const on = (sel: string, fn: () => void) => $(sel, ui)?.addEventListener('click', fn);
  on('[data-act="map"]', () => showMap());
  on('[data-act="cancel"]', () => act(c.cancel()) && void fade(showCastle));
  on('[data-act="scout"]', () => act(c.scout(), 'select') && showNode());
  on('[data-act="loot"]', () => {
    const r = c.loot();
    if (!act(r, r.ok && r.combat ? 'roar' : 'good')) return;
    if (!r.combat) return showNode();
    // El cofre era un mímico: aviso y combate.
    const m = modal(
      `<h2>¡El cofre era un mímico!</h2>
      <p>${r.log.map((l) => l.text).join(' ')}</p>
      <div class="cp-buttons"><button class="primary" data-act="ok">¡A las armas!</button></div>`,
      'narrow',
    );
    $('[data-act="ok"]', m).addEventListener('click', () => void fight());
  });
  on('[data-act="camp-build"]', () => act(c.build('camp'), 'build') && showNode());
  on('[data-act="tower-build"]', () => act(c.build('tower'), 'build') && showNode());
  on('[data-act="guard"]', () => chooseGuard());
  on('[data-act="trade"]', () => act(c.trade(3), 'good') && showNode());
  on('[data-act="hire"]', () => act(c.hire(), 'levelUp') && showNode());
  on('[data-act="pray"]', () => act(c.pray(), 'heal') && showNode());
  on('[data-act="sleep"]', () => sleep());
  on('[data-act="post"]', () => act(c.post(), 'build') && showNode());
  for (const el of ui.querySelectorAll<HTMLButtonElement>('[data-relieve]')) el.addEventListener('click', () => chooseRelief(el.dataset.relieve!));
}

/** Relevo de un soldado de guardia: alguien del grupo ocupa su puesto (o se recoge sin relevo si cabe). */
function chooseRelief(guardId: string) {
  const c = campaign;
  const g = c.soldier(guardId)!;
  const options = c.party.filter((s) => s.kind !== 'hero');
  const room = c.state.exp!.party.length < CBAL.partyMax;
  const m = modal(
    `<h2>Relevar a ${g.name}</h2>
    <div class="cp-bench">${options.map((s) => `<button class="cp-bench-card" data-swap="${s.id}"><img class="cp-portrait" src="${portrait(s.kind)}" alt="">${s.name}<small>vida ${s.hp}/${c.maxHp(s)} · estrés ${s.stress}</small></button>`).join('')}</div>
    <div class="cp-buttons">${room ? `<button data-act="recall">Recoger sin relevo</button>` : ''}<button data-act="close">Cancelar</button></div>`,
    'narrow',
  );
  $('[data-act="close"]', m).addEventListener('click', closeModal);
  $('[data-act="recall"]', m)?.addEventListener('click', () => act(c.recall(guardId)) && showNode());
  for (const el of m.querySelectorAll<HTMLButtonElement>('[data-swap]')) el.addEventListener('click', () => act(c.relieve(guardId, el.dataset.swap!)) && showNode());
}

function chooseGuard() {
  const c = campaign;
  const options = c.party.filter((s) => s.kind !== 'hero');
  const m = modal(
    `<h2>¿Quién queda de guardia?</h2>
    <div class="cp-bench">${options.map((s) => `<button class="cp-bench-card" data-g="${s.id}"><img class="cp-portrait" src="${portrait(s.kind)}" alt="">${s.name}<small>${KIND_NAMES[s.kind]} · vida ${s.hp}/${c.maxHp(s)} · estrés ${s.stress}</small></button>`).join('')}</div>
    <div class="cp-buttons"><button data-act="close">Cancelar</button></div>`,
    'narrow',
  );
  $('[data-act="close"]', m).addEventListener('click', closeModal);
  for (const el of m.querySelectorAll<HTMLButtonElement>('[data-g]')) el.addEventListener('click', () => act(c.garrison(el.dataset.g!)) && showNode());
}

function sleep() {
  const r = campaign.camp();
  if (!act(r, 'nightfall')) return;
  void fade(() => {
    showNode('night');
    ui.querySelector('.cp-actions')!.innerHTML = '';
    if (r.combat) {
      setTimeout(() => void fight(), 1400);
      return;
    }
    setTimeout(() => {
      audio.play('dawn');
      showReport(() => void fade(() => showNode()));
    }, 900);
  });
}

// ───────────────────────── sucesos ─────────────────────────

/** Muestra el suceso pendiente: texto, opciones y, al elegir, lo que pasó. */
function showEvent() {
  const c = campaign;
  const ev = c.state.event;
  if (!ev) return;
  const def = EVENT[ev.id];
  audio.play('select');
  const m = modal(
    `<p class="kicker">${NODE[ev.node].name}</p>
    <h2>${def.title}</h2>
    <p class="cp-event-text">${def.text}</p>
    <div class="cp-choices">${def.choices
      .map((ch, i) => {
        const block = c.eventBlock(i);
        return `<button data-choice="${i}" ${block ? `disabled title="${block}"` : ''}><b>${ch.label}</b>${ch.hint ? `<small>${ch.hint}</small>` : ''}${block ? `<small class="why">${block}</small>` : ''}</button>`;
      })
      .join('')}</div>`,
    'narrow locked event',
  );
  for (const el of m.querySelectorAll<HTMLButtonElement>('[data-choice]')) {
    el.addEventListener('click', () => {
      const r = c.choose(Number(el.dataset.choice));
      if (!r.ok) return void act(r);
      save();
      const good = r.log.some((l) => l.tone === 'good');
      audio.play(r.combat ? 'roar' : good ? 'good' : 'click');
      $('.cp-modal-box', m).innerHTML = `
        <p class="kicker">${NODE[ev.node].name}</p>
        <h2>${def.title}</h2>
        <ul class="cp-report">${r.log.map((l) => `<li class="tone-${l.tone}">${l.text}</li>`).join('')}</ul>
        <div class="cp-buttons"><button class="primary" data-act="ok">${r.combat ? '¡A las armas!' : 'Seguir'}</button></div>`;
      $('[data-act="ok"]', m).addEventListener('click', () => {
        closeModal();
        if (r.combat) return void fight();
        showNode();
      });
    });
  }
}

// ───────────────────────── mapa ─────────────────────────

function showMap() {
  const c = campaign;
  const e = c.state.exp;
  const m = modal(
    `<div class="cp-map-wrap"></div>
    <aside class="cp-map-side">
      <h2>${e ? NODE[e.node].name : 'El sendero'}</h2>
      ${
        e
          ? `<p>Quedan <b>${e.hours} h</b> de luz.</p>`
          : ''
      }
      <p class="cp-dark-line">${
        c.state.siege !== null
          ? `<b>Asedio:</b> ${c.state.siege} ${c.state.siege === 1 ? 'día' : 'días'}.`
          : `La oscuridad avanza en <b>${c.state.darkClock} ${c.state.darkClock === 1 ? 'día' : 'días'}</b>.`
      }</p>
      <ul class="cp-legend">
        <li><i class="st-dark"></i>Oscuro</li>
        <li><i class="st-hostile"></i>Hostil</li>
        <li><i class="st-cleared"></i>Limpio</li>
        <li><i class="st-secured"></i>Asegurado</li>
        <li><i class="st-safe">⛨</i>Retaguardia</li>
        <li><i class="st-lost"></i>Perdido</li>
      </ul>
      <div class="cp-buttons"><button data-act="close">Cerrar</button></div>
    </aside>`,
    'map',
  );
  const view = new MapView(c, {
    onTravel: (id) => {
      const r = c.move(id);
      if (!act(r, 'step')) return;
      closeModal();
      if (c.state.phase === 'castle') return void fade(showCastle);
      if (r.combat) return void fight();
      void fade(() => {
        showNode();
        if (r.event) showEvent();
      });
    },
  });
  $('.cp-map-wrap', m).appendChild(view.el);
  $('[data-act="close"]', m).addEventListener('click', closeModal);
}

// ───────────────────────── combate ─────────────────────────

async function fight() {
  const c = campaign;
  const p = c.state.pending!;
  closeModal();
  const tod: Mode = c.node(p.node).dark ? 'dark' : p.night ? 'night' : timeOfDay();
  setNight(tod);
  const combat = new Combat(c.encounter(), p.seed);
  audio.music(combat.state.fighters.some((f) => f.kind === 'herald') ? 'boss' : 'battle');
  await fade(() => {
    setScene(null);
    ui.innerHTML = '';
  });
  const def = NODE[p.node];
  const intro = p.kind === 'ambush' ? 'Las brasas apenas alumbran. Están aquí.' : p.kind === 'road' ? 'Nadie vigilaba el camino. Algo os esperaba.' : p.kind === 'mimic' ? 'El cofre se relame. El oro habrá que ganárselo.' : def.boss ? 'El Heraldo alza la guadaña. El norte entero contiene el aliento.' : undefined;
  const session = await startCombat({
    stage,
    overlay,
    combat,
    time: tod === 'dark' ? 'night' : tod,
    seed: p.seed,
    intro,
    view: (hooks) => Hd2dCombatView.create(stage, combat, tod, p.seed, hooks, nodeSeed(p.node)),
  });
  if (import.meta.env.DEV) Object.assign(window, { combat, view: session.view });
  await session.done;
  const r = c.resolveCombat(combat);
  save();
  await fade(() => session.dispose());
  if (!r.ok) return toast(r.reason, 'bad');
  if (c.state.phase === 'won' || c.state.phase === 'lost') return showEnd();
  if (c.state.phase === 'castle') return showCastle();
  if (p.kind === 'ambush') {
    showNode();
    return showReport(() => void 0);
  }
  logLines(r.log);
  showNode();
  if (c.state.event) showEvent();
}

// ───────────────────────── final ─────────────────────────

function showEnd() {
  const c = campaign;
  const s = c.state;
  const won = s.phase === 'won';
  closeModal();
  setNight(won ? 'day' : 'night');
  castleScene(won ? 'day' : 'dark');
  audio.music(won ? 'castle' : 'dark');
  void audio.jingle(won ? 'victory' : 'defeat');
  const fallen = s.soldiers.filter((x) => !x.alive);
  ui.innerHTML = `
    <div class="cp-title end ${won ? 'won' : 'lost'}">
      <p class="kicker">Día ${s.day} · ${s.stats.expeditions} expediciones · ${s.stats.battles} combates</p>
      <h1>${won ? 'El alba avanza' : 'La noche vence'}</h1>
      <p class="lead">${s.endReason ?? ''}</p>
      ${won ? '<p class="dim">Fin de esta campaña. Aquí empezaría el camino hacia el Rey de la Noche.</p>' : ''}
      <h3>Memorial</h3>
      <ul class="cp-report">${fallen.length ? fallen.map((x) => `<li><b>${x.name}</b> · ${KIND_NAMES[x.kind]} · ${x.fate ?? ''}</li>`).join('') : '<li>Nadie cayó. Una hazaña rara.</li>'}</ul>
      <div class="cp-buttons"><button class="primary" data-act="new">Nueva campaña</button></div>
    </div>`;
  $('[data-act="new"]', ui).addEventListener('click', () => {
    clearSave();
    campaign = new Campaign(Math.floor(Math.random() * 1e9));
    campaign.setNameStyle(namePref());
    save();
    void fade(() => {
      showCastle();
      intro();
    });
  });
}

if (import.meta.env.DEV) Object.assign(window, { getCampaign: () => campaign });
// ───────────────────────── ajustes ─────────────────────────

const PREFS_KEY = 'dawnspath.settings.v1';

/** Estilo de nombres elegido por el jugador (vale para todas las partidas). */
function namePref(): NameStyle {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}').names === 'fun' ? 'fun' : 'classic';
  } catch {
    return 'classic';
  }
}

function setNamePref(names: NameStyle) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ names }));
  } catch {
    /* sin almacenamiento: vale para esta sesión */
  }
}

/** Nombres de los soldados: los de siempre o los de chiste. Renombra la partida en curso. */
function namesSection(): SettingsSection {
  const body = document.createElement('div');
  body.className = 'set-rows';
  body.innerHTML = `
    <p class="set-label">Nombres de los soldados</p>
    <label class="set-choice"><input type="radio" name="names" value="classic" /> Clásicos <small>Bram, Ilse…</small></label>
    <label class="set-choice"><input type="radio" name="names" value="fun" /> Con gracia <small>Susana Oria, Elena Nito del Bosque…</small></label>`;
  const radios = [...body.querySelectorAll<HTMLInputElement>('input[name="names"]')];
  const pref = namePref();
  for (const r of radios) {
    r.checked = r.value === pref;
    r.addEventListener('change', () => {
      const style = r.value as NameStyle;
      setNamePref(style);
      if (!campaign) return;
      campaign.setNameStyle(style);
      save();
      // Se vuelve a pintar la pantalla con los nombres nuevos (en combate, al terminar).
      const s = campaign.state;
      if ($('.cp-title', ui) || s.pending) return;
      if (s.phase === 'castle') showCastle();
      else if (s.exp) showNode();
    });
  }
  return { title: 'Partida', body };
}

// Por si se pulsa antes de que la pantalla de carga pida el gesto.
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });
mountSettings([soundSection(), namesSection()]);
