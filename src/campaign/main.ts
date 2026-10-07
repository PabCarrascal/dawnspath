import '../combat/combat.css';
import './campaign.css';
import { audio } from '../audio/Audio';
import { mountSoundControl } from '../audio/SoundControl';
import { Combat } from '../combat/rules/Combat';
import { startCombat } from '../combat/session';
import { seedFromString } from '../core/rng';
import { Campaign, formatRes } from './rules/Campaign';
import { BUILDINGS, CBAL, KIND_NAMES, NODE, STRUCTURES } from './rules/data';
import { EVENT } from './rules/events';
import type { ActionResult, BuildingId, CampaignState, LogLine, Soldier } from './rules/types';
import { MapView } from './view/MapView';
import { Hd2dCombatView } from '../hd2d/battle';
import type { Mode } from '../hd2d/look';
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
      <div class="cp-soldier-head"><b>${s.name}</b><span>${KIND_NAMES[s.kind]} · nivel ${c.level(s)}</span></div>
      <div class="cp-soldier-bars">
        <div><span>Vida</span>${bar(s.hp, max, 'hp')}<small>${s.hp}/${max}</small></div>
        <div><span>Estrés</span>${bar(s.stress, 100, 'stress')}<small>${s.stress}</small></div>
      </div>
      ${tags ? `<div class="cp-tags">${tags}</div>` : ''}
      ${extra}
    </div>`;
}

function resLine(r: { gold: number; materials: number; stone: number }) {
  return `<span title="Oro">◉ ${r.gold}</span><span title="Materiales">▤ ${r.materials}</span><span title="Piedra">◆ ${r.stone}</span>`;
}

function setNight(mode: Mode) {
  audio.setNight(mode === 'night' || mode === 'dark' ? 1 : mode === 'dusk' ? 0.7 : 0.45);
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

async function boot() {
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  showTitle();
}

function showTitle() {
  const saved = load();
  const preview = new Campaign(saved?.seed ?? 1, saved ?? undefined);
  campaign = preview;
  castleScene('dusk');
  ui.innerHTML = `
    <div class="cp-title">
      <p class="kicker">Dawn's Path · fase 2</p>
      <h1>El Sendero del Alba</h1>
      <p class="lead">Mejora el castillo, prepara expediciones cortas por el sendero y abre paso hasta el Heraldo de la Noche.</p>
      <div class="cp-buttons">
        ${saved && saved.phase !== 'won' && saved.phase !== 'lost' ? `<button class="primary" data-act="continue">Continuar · día ${saved.day}</button>` : ''}
        <button class="${saved ? '' : 'primary'}" data-act="new">Nueva campaña</button>
      </div>
      <p class="hint">La partida se guarda sola en este navegador.</p>
    </div>`;
  $('[data-act="new"]', ui).addEventListener('click', () => {
    audio.play('click');
    if (saved && saved.phase !== 'won' && saved.phase !== 'lost' && !confirm('¿Empezar de cero? Se perderá la campaña guardada.')) return;
    campaign = new Campaign(Math.floor(Math.random() * 1e9));
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
    <p>La noche avanza desde el norte. Su lugarteniente, el <b>Heraldo</b>, guarda la torre que cierra el sendero.</p>
    <ul class="cp-list">
      <li><b>Castillo</b> · mejora la herrería, la taberna y la logia con lo que traigas de las expediciones.</li>
      <li><b>Expedición</b> · el héroe y hasta 3 soldados. Cada viaje y cada acción gastan horas de luz.</li>
      <li><b>Noche</b> · acampar en un campamento o una aldea cura; dormir al raso desgasta. Los nodos sin guardia pueden perderse.</li>
      <li><b>Oscuridad</b> · cada ${CBAL.darkEvery} días avanza desde la torre y el cubil. Si llega a las puertas, el castillo resiste ${CBAL.siegeDays} días. Limpia y asegura nodos para frenarla; destruye el cubil para hacerla retroceder.</li>
      <li><b>Muerte</b> · los soldados que caen no vuelven. Si el héroe cae, el grupo se retira cargando con él; si cae solo, todo termina.</li>
    </ul>
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
  const s = castleScene('dusk');

  ui.innerHTML = `
    ${castleHud()}
    <div class="cp-hotspots">
      ${(Object.keys(BUILDINGS) as BuildingId[])
        .map((b) => `<button class="cp-hotspot" data-b="${b}"><b>${BUILDINGS[b].name}</b><span>${c.state.buildings[b] ? `nivel ${c.state.buildings[b]}` : 'sin mejorar'}</span></button>`)
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
      <div class="cp-res">${resLine(c.state.stock)}<span title="Víveres">✤ ${c.state.stock.food}</span><span title="Antorchas">♨ ${c.state.stock.torches}</span></div>
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
  if (b === 'smithy') {
    body = `<p>Bonificación actual para todos: <b>+${lvl} daño</b> y <b>+${lvl * 5}% protección</b>.</p>`;
  } else if (b === 'tavern') {
    const home = c.state.soldiers.filter((s) => s.alive && s.where === 'castle');
    body = `
      <h3>Tratamientos · ${CBAL.treatCost} oro · −${c.treatRelief()} estrés y cura aflicciones</h3>
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
          <button data-recruit="${i}">${r.cost ? `Reclutar · ${r.cost} oro` : 'Se ofrece gratis'}</button></div>`,
          )
          .join('') || '<p class="dim">No hay nadie más esperando. Vuelve tras la próxima expedición.</p>'
      }</div>`;
  } else {
    const camp = c.structureCost('camp');
    const tower = c.structureCost('tower');
    body = `
      <div class="cp-rows">
        <div class="cp-row"><span><b>${STRUCTURES.camp.name}</b> · ${formatRes(camp.res)} · ${camp.hours} h</span><small>${STRUCTURES.camp.desc}</small></div>
        <div class="cp-row ${lvl >= 1 ? '' : 'locked'}"><span><b>${STRUCTURES.tower.name}</b> · ${formatRes(tower.res)} · ${tower.hours} h</span><small>${lvl >= 1 ? STRUCTURES.tower.desc : 'Necesita la logia a nivel 1.'}</small></div>
      </div>
      <p class="dim">Los materiales y la piedra del castillo viajan con la caravana de cada expedición.</p>`;
  }
  const m = modal(
    `<h2>${def.name} <small>· nivel ${lvl}</small></h2>
    <p class="lead">${def.desc}</p>
    <ol class="cp-levels">${def.levels.map((l, i) => `<li class="${i === lvl ? 'cur' : i < lvl ? 'done' : ''}">${l}</li>`).join('')}</ol>
    ${body}
    <div class="cp-buttons">
      ${cost ? `<button class="primary" data-act="up" ${c.canAfford(c.state.stock, cost) ? '' : 'disabled'}>Mejorar · ${formatRes(cost)}</button>` : '<span class="dim">Nivel máximo</span>'}
      <button data-act="close">Cerrar</button>
    </div>
    <p class="cp-stock">En el castillo: ${resLine(c.state.stock)}</p>`,
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
        <h3>Grupo · posición 1 delante</h3>
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
                .map((s) => `<button class="cp-bench-card" data-add="${s.id}" ${party.length >= CBAL.partyMax ? 'disabled' : ''}>${s.name}<small>${KIND_NAMES[s.kind]} · estrés ${s.stress}${s.affliction ? ' · afligido' : ''}</small></button>`)
                .join('')}</div>`
            : ''
        }
      </section>
      <section>
        <h3>Provisiones</h3>
        <div class="cp-row"><span>✤ Víveres <small>${CBAL.foodPrice} oro · 1 por soldado y noche, más al raso</small></span>
          <span class="cp-stepper"><button data-buy="food:-1">−</button><b>${st.food}</b><button data-buy="food:1">+</button></span></div>
        <div class="cp-row"><span>♨ Antorchas <small>${CBAL.torchPrice} oro · hacen más llevaderas las noches al raso</small></span>
          <span class="cp-stepper"><button data-buy="torches:-1">−</button><b>${st.torches}</b><button data-buy="torches:1">+</button></span></div>
        <p class="dim">Recomendado: ${need * 3} víveres para ${need} soldados y unas 2 noches.
          ${st.food < need * 3 ? `<button class="cp-link" data-act="supply">Completar</button>` : ''}</p>
        <h3>Caravana</h3>
        <p>Lleva ${st.materials} materiales y ${st.stone} de piedra para construir campamentos y torres.</p>
        <p class="cp-stock">Oro en el castillo: ◉ ${st.gold}</p>
      </section>
    </div>
    <div class="cp-buttons">
      ${st.food < need ? '<span class="tone-bad">Sin víveres suficientes pasaréis hambre.</span>' : ''}
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
  const key = JSON.stringify([e.node, e.party, n.garrison, n.structure, loot]);
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
      garrison: n.garrison.map((id) => c.soldier(id)!.kind),
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
  actions.push(`<button class="primary" data-act="map">Mapa · viajar</button>`);
  if (atCastle) actions.push(`<button data-act="cancel">Volver a entrar</button>`);
  if (hidden) actions.push(`<button data-act="scout" title="Revela qué defiende los nodos vecinos.">Explorar alrededores · ${CBAL.scoutHours} h</button>`);
  if (canLoot) actions.push(`<button data-act="loot">Saquear · ${CBAL.lootHours} h</button>`);
  if (village) {
    const price = c.villagePrice(e.node);
    actions.push(`<button data-act="trade" title="Con el oro de la caravana.">Comprar 3 víveres · ${price * 3} oro</button>`);
    if (!n.uses) {
      const cost = c.hireCost(e.node);
      actions.push(`<button data-act="hire" title="${KIND_NAMES[village.recruit]}: se une al grupo.">Contratar a ${village.name} · ${cost ? `${cost} oro` : 'gratis'}</button>`);
    }
  }
  if (shrine && n.uses > 0) actions.push(`<button data-act="pray" title="Cura, baja el estrés y quita las aflicciones de todo el grupo.">Rezar · ${CBAL.pray.hours} h · quedan ${n.uses}</button>`);
  if (!atCastle && !n.structure && !village) actions.push(`<button data-act="camp-build" title="${STRUCTURES.camp.desc}">Campamento · ${formatRes(camp.res)} · ${camp.hours} h</button>`);
  if (!atCastle && n.structure !== 'tower' && c.state.buildings.lodge >= 1) actions.push(`<button data-act="tower-build" title="${STRUCTURES.tower.desc}">Torre · ${formatRes(tower.res)} · ${tower.hours} h</button>`);
  if (n.structure && n.garrison.length < cap && e.party.length > 1) actions.push(`<button data-act="guard">Dejar de guardia…</button>`);
  for (const id of n.garrison) actions.push(`<button data-recall="${id}">Recoger a ${c.soldier(id)!.name}</button>`);
  if (!atCastle) actions.push(`<button class="night" data-act="sleep" title="${rough ? 'Al raso: no cura, sube el estrés, se come más y mañana hay menos luz.' : 'A cubierto: cura algo y baja el estrés.'}${n.dark ? ' En la oscuridad la noche pesa más y las emboscadas son más probables.' : ''}">Acampar ${rough ? 'al raso' : village ? 'en la aldea' : 'aquí'} · ${need} víveres</button>`);

  const hoursPct = (e.hours / e.maxHours) * 100;
  ui.innerHTML = `
    <header class="cp-hud">
      <div class="cp-day"><span>Día</span><b>${c.state.day}</b></div>
      <div class="cp-hours ${tod}" title="Horas de luz"><span>Luz</span><i><i style="width:${hoursPct}%"></i></i><b>${e.hours} h</b></div>
      <div class="cp-res"><span title="Víveres">✤ ${e.food}</span><span title="Antorchas">♨ ${e.torches}</span>${resLine(e.bag)}</div>
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
  on('[data-act="loot"]', () => act(c.loot(), 'good') && showNode());
  on('[data-act="camp-build"]', () => act(c.build('camp'), 'build') && showNode());
  on('[data-act="tower-build"]', () => act(c.build('tower'), 'build') && showNode());
  on('[data-act="guard"]', () => chooseGuard());
  on('[data-act="trade"]', () => act(c.trade(3), 'good') && showNode());
  on('[data-act="hire"]', () => act(c.hire(), 'levelUp') && showNode());
  on('[data-act="pray"]', () => act(c.pray(), 'heal') && showNode());
  on('[data-act="sleep"]', () => sleep());
  for (const el of ui.querySelectorAll<HTMLButtonElement>('[data-recall]')) el.addEventListener('click', () => act(c.recall(el.dataset.recall!)) && showNode());
}

function chooseGuard() {
  const c = campaign;
  const options = c.party.filter((s) => s.kind !== 'hero');
  const m = modal(
    `<h2>¿Quién queda de guardia?</h2>
    <p class="lead">Asegura el nodo: se cruza rápido y sin emboscadas. De noche, la guardia puede ser atacada.</p>
    <div class="cp-bench">${options.map((s) => `<button class="cp-bench-card" data-g="${s.id}">${s.name}<small>${KIND_NAMES[s.kind]} · vida ${s.hp}/${c.maxHp(s)} · estrés ${s.stress}</small></button>`).join('')}</div>
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
          ? `<p>Quedan <b>${e.hours} h</b> de luz. Pulsa un nodo vecino para viajar.</p>
             <p class="dim">Los nodos asegurados (campamento o torre con guardia) se cruzan en 1 hora y sin riesgo.</p>`
          : '<p>Prepara una expedición desde el castillo para recorrer el sendero.</p>'
      }
      <p class="cp-dark-line">${
        c.state.siege !== null
          ? `<b>Asedio:</b> el castillo cae en ${c.state.siege} días si no despejas sus puertas.`
          : `La oscuridad avanzará en <b>${c.state.darkClock} ${c.state.darkClock === 1 ? 'día' : 'días'}</b> sobre los nodos marcados.`
      }</p>
      <ul class="cp-legend">
        <li><i class="st-dark"></i>Oscuridad · siempre de noche</li>
        <li><i class="st-hostile"></i>Hostil · hay que combatir</li>
        <li><i class="st-cleared"></i>Limpio · sin guardia</li>
        <li><i class="st-secured"></i>Asegurado</li>
        <li><i class="st-lost"></i>Perdido · retomado de noche</li>
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
  await fade(() => {
    setScene(null);
    ui.innerHTML = '';
  });
  const def = NODE[p.node];
  const intro = p.kind === 'ambush' ? 'Las brasas apenas alumbran. Están aquí.' : p.kind === 'road' ? 'Nadie vigilaba el camino. Algo os esperaba.' : def.boss ? 'El Heraldo alza la guadaña. El norte entero contiene el aliento.' : undefined;
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
  audio.play(won ? 'victory' : 'defeat');
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
    save();
    void fade(() => {
      showCastle();
      intro();
    });
  });
}

if (import.meta.env.DEV) Object.assign(window, { getCampaign: () => campaign });
mountSoundControl();
void boot();
