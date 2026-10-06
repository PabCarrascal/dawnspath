import './ui/style.css';
import { audio } from './audio/Audio';
import { seedFromString } from './core/rng';
import { Controller } from './Controller';
import { DIFFICULTIES, DifficultyId } from './game/config';
import { Game } from './game/Game';
import { bestRecord, loadSave } from './storage';

const params = new URLSearchParams(location.search);
const parseSeed = (v: string) => (/^\d+$/.test(v) ? Number(v) >>> 0 : seedFromString(v));
const seed = parseSeed(params.get('seed') ?? String(Math.floor(Math.random() * 1e9)));
const paramDiff = params.get('difficulty');
let difficulty: DifficultyId = paramDiff && paramDiff in DIFFICULTIES ? (paramDiff as DifficultyId) : 'normal';

const save = loadSave();
// El fondo del título muestra la partida guardada si existe; si no, un mundo nuevo.
const resume = !!save && !params.has('seed');
const controller = new Controller(
  document.getElementById('scene')!,
  resume ? Game.fromSave(save!) : new Game(seed, difficulty),
);

const title = document.getElementById('title-screen')!;
const seedInput = document.getElementById('seed-input') as HTMLInputElement;
seedInput.value = String(seed);

// ── Continuar ──
const continueWrap = document.getElementById('continue-wrap')!;
if (save) {
  const d = DIFFICULTIES[save.state.difficulty];
  document.getElementById('continue-info')!.textContent = `Día ${save.state.day} · ${d.name} · semilla ${save.state.seed}`;
  document.getElementById('continue-btn')!.addEventListener('click', () => {
    audio.unlock();
    audio.play('click');
    title.classList.remove('on');
    if (!resume) controller.load(Game.fromSave(save));
    controller.begin(true);
  });
} else continueWrap.remove();
if (!save) document.getElementById('start-btn')!.classList.add('primary');

// ── Dificultad ──
const diffEl = document.getElementById('difficulty')!;
const diffDesc = document.getElementById('diff-desc')!;
const renderDifficulty = () => {
  diffEl.innerHTML = '';
  for (const [id, d] of Object.entries(DIFFICULTIES) as [DifficultyId, (typeof DIFFICULTIES)[DifficultyId]][]) {
    const b = document.createElement('button');
    b.className = `diff-option ${id === difficulty ? 'on' : ''}`;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(id === difficulty));
    b.textContent = d.name;
    b.addEventListener('click', () => {
      difficulty = id;
      audio.unlock();
      audio.play('click');
      renderDifficulty();
    });
    diffEl.appendChild(b);
  }
  const best = bestRecord(difficulty);
  diffDesc.textContent = DIFFICULTIES[difficulty].description + (best ? ` Récord: ${best} días.` : '');
};
renderDifficulty();

// ── Ayuda ──
const help = document.getElementById('help')!;
document.getElementById('help-btn')!.addEventListener('click', () => help.classList.add('on'));
document.getElementById('help-close')!.addEventListener('click', () => help.classList.remove('on'));
help.addEventListener('click', (e) => {
  if (e.target === help) help.classList.remove('on');
});

function startNew() {
  audio.unlock();
  audio.play('click');
  const wanted = seedInput.value.trim() || String(seed);
  title.classList.remove('on');
  controller.load(new Game(parseSeed(wanted), difficulty));
  controller.begin();
}

document.getElementById('start-btn')!.addEventListener('click', startNew);
seedInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startNew();
});

if (params.get('play') === '1') {
  title.classList.remove('on');
  controller.begin();
}

// Acceso de depuración desde la consola en desarrollo.
if (import.meta.env.DEV) (window as unknown as { dawn: Controller }).dawn = controller;
