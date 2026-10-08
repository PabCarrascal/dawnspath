import './combat.css';
import '../ui/theme.css';
import { audio } from '../audio/Audio';
import { mountSoundControl } from '../audio/SoundControl';
import { Combat } from './rules/Combat';
import { ENCOUNTERS } from './rules/data';
import type { Fighter } from './rules/types';
import { Hd2dCombatView } from '../hd2d/battle';
import { CombatOutcome, startCombat } from './session';
import type { TimeOfDay } from './view/backdrop';

const params = new URLSearchParams(location.search);
const encId = params.get('enc');
const seed = Number(params.get('seed') ?? Math.floor(Math.random() * 1e9)) >>> 0;

mountSoundControl();
if (!encId || !ENCOUNTERS.some((e) => e.id === encId)) showMenu();
else void run(encId, seed);

/** Pantalla inicial: elegir encuentro. */
function showMenu() {
  const el = document.createElement('div');
  el.className = 'cb-screen on';
  el.innerHTML = `
    <div class="cb-menu">
      <p class="kicker">Dawn's Path · fase 0</p>
      <h1>Prototipo de combate</h1>
      <p class="lead">Combate por turnos con posiciones. Elige un encuentro.</p>
      <div class="cb-encounters">
        ${ENCOUNTERS.map(
          (e) => `<button class="cb-enc-card" data-enc="${e.id}"><b>${e.name}</b><span>${e.desc}</span></button>`,
        ).join('')}
      </div>
      <p class="hint">Clic en una habilidad y luego en un objetivo · teclas 1–5 para elegir habilidad</p>
    </div>`;
  document.body.appendChild(el);
  for (const b of el.querySelectorAll<HTMLButtonElement>('[data-enc]')) {
    b.addEventListener('click', () => {
      audio.unlock();
      const url = new URL(location.href);
      url.searchParams.set('enc', b.dataset.enc!);
      url.searchParams.set('seed', String(Math.floor(Math.random() * 1e9)));
      location.href = url.toString();
    });
  }
}

async function run(id: string, seed: number) {
  const combat = new Combat(id, seed);
  const enc = combat.encounter;
  const time: TimeOfDay = enc.night ? 'night' : enc.id === 'patrol' ? 'dusk' : 'day';

  // El audio solo puede arrancar tras un gesto del usuario.
  const unlock = () => {
    audio.unlock();
    audio.setNight(time === 'night' ? 1 : time === 'dusk' ? 0.7 : 0.45);
    audio.music(combat.state.fighters.some((f) => f.kind === 'herald') ? 'boss' : 'battle');
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  unlock();

  // `?vista=2d` usa la escena lateral anterior; por defecto, la maqueta HD-2D.
  const flat = params.get('vista') === '2d';
  const stage = document.getElementById('stage')!;
  const session = await startCombat({
    stage,
    overlay: document.getElementById('overlay')!,
    combat,
    time,
    seed,
    view: flat ? undefined : (hooks) => Hd2dCombatView.create(stage, combat, time, seed, hooks),
  });
  if (import.meta.env.DEV) Object.assign(window, { combat, view: session.view });
  const r = await session.done;
  const party = combat.state.fighters.filter((f) => f.side === 'party');
  showEnd(r, party, party.filter((f) => !f.alive).length);

  function showEnd(r: CombatOutcome, party: Fighter[], fallen: number) {
    const el = document.createElement('div');
    el.className = `cb-screen end ${r}`;
    const title = { won: 'Victoria', lost: 'Derrota', fled: 'Retirada' }[r];
    el.innerHTML = `
      <div class="cb-menu">
        <h1>${title}</h1>
        <p class="lead">${enc.name} · ${combat.state.round} rondas · ${fallen ? `${fallen} ${fallen === 1 ? 'caído' : 'caídos'}` : 'sin bajas'}</p>
        <ul class="cb-roster">
          ${party
            .map(
              (f) => `<li class="${f.alive ? '' : 'dead'}"><b>${f.name}</b><span>${f.alive ? `${f.hp}/${f.maxHp} PV · estrés ${f.stress}${f.affliction ? ` · ${f.affliction}` : ''}${f.deathsDoor ? ' · a las puertas de la muerte' : ''}` : 'muerto'}</span></li>`,
            )
            .join('')}
        </ul>
        <div class="cb-buttons">
          <button data-act="again">Repetir (misma semilla)</button>
          <button data-act="new" class="primary">Otro combate</button>
          <button data-act="menu">Elegir encuentro</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    const go = (enc?: string, s?: number) => {
      const url = new URL(location.href);
      if (enc) url.searchParams.set('enc', enc);
      else url.searchParams.delete('enc');
      if (s !== undefined) url.searchParams.set('seed', String(s));
      location.href = url.toString();
    };
    el.querySelector('[data-act="again"]')!.addEventListener('click', () => go(enc.id, seed));
    el.querySelector('[data-act="new"]')!.addEventListener('click', () => go(enc.id, Math.floor(Math.random() * 1e9)));
    el.querySelector('[data-act="menu"]')!.addEventListener('click', () => go());
  }
}
