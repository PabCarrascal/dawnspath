import './sound.css';
import { audio } from './Audio';

interface SoundSettings {
  music: number;
  sfx: number;
  muted: boolean;
}

const KEY = 'dawnspath.audio.v1';
const DEFAULTS: SoundSettings = { music: 0.55, sfx: 0.8, muted: false };

/** localStorage puede no existir o lanzar (modo privado, cookies bloqueadas). */
function load(): SoundSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* sin almacenamiento: valores por defecto */
  }
  return { ...DEFAULTS };
}

function save(s: SoundSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignorado */
  }
}

function apply(s: SoundSettings) {
  audio.musicVolume = s.music;
  audio.sfxVolume = s.sfx;
  audio.muted = s.muted;
  audio.applyVolumes();
}

/**
 * Botón de sonido fijo en la esquina: abre un panel con música, efectos y
 * silencio. La tecla M silencia y vuelve a activar el sonido.
 */
export function mountSoundControl() {
  const s = load();
  apply(s);

  const root = document.createElement('div');
  root.className = 'snd';
  root.innerHTML = `
    <button class="snd-toggle" title="Sonido (M para silenciar)" aria-label="Sonido" aria-expanded="false"></button>
    <div class="snd-panel" role="dialog" aria-label="Sonido">
      <label>Música <input type="range" min="0" max="1" step="0.05" data-k="music" /></label>
      <label>Efectos <input type="range" min="0" max="1" step="0.05" data-k="sfx" /></label>
      <label class="snd-mute"><input type="checkbox" data-k="muted" /> Silenciar todo <kbd>M</kbd></label>
    </div>`;
  document.body.appendChild(root);

  const toggle = root.querySelector<HTMLButtonElement>('.snd-toggle')!;
  const music = root.querySelector<HTMLInputElement>('[data-k="music"]')!;
  const sfx = root.querySelector<HTMLInputElement>('[data-k="sfx"]')!;
  const muted = root.querySelector<HTMLInputElement>('[data-k="muted"]')!;

  const render = () => {
    music.value = String(s.music);
    sfx.value = String(s.sfx);
    muted.checked = s.muted;
    const silent = s.muted || (s.music === 0 && s.sfx === 0);
    toggle.textContent = silent ? '🔇' : '🔊';
    toggle.classList.toggle('off', silent);
  };
  const change = () => {
    apply(s);
    save(s);
    render();
  };

  music.addEventListener('input', () => {
    s.music = Number(music.value);
    change();
  });
  sfx.addEventListener('input', () => {
    s.sfx = Number(sfx.value);
    change();
  });
  sfx.addEventListener('change', () => audio.play('click'));
  muted.addEventListener('change', () => {
    s.muted = muted.checked;
    change();
  });

  const setOpen = (open: boolean) => {
    root.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    audio.unlock();
    setOpen(!root.classList.contains('open'));
  });
  document.addEventListener('pointerdown', (e) => {
    if (!root.contains(e.target as Node)) setOpen(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'm' || e.metaKey || e.ctrlKey || (e.target as HTMLElement).tagName === 'INPUT') return;
    s.muted = !s.muted;
    change();
  });

  // Si el motor aún no existe (falta un gesto del usuario), `unlock()` aplicará estos valores al crearlo.
  render();
}
