import { mountSettings, SettingsSection } from '../ui/settings';
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
 * Sección de sonido del panel de ajustes: música, efectos y silencio. La
 * tecla M silencia y vuelve a activar el sonido desde cualquier pantalla.
 */
export function soundSection(): SettingsSection {
  const s = load();
  apply(s);

  const body = document.createElement('div');
  body.className = 'set-rows';
  body.innerHTML = `
    <label>Música <input type="range" min="0" max="1" step="0.05" data-k="music" /></label>
    <label>Efectos <input type="range" min="0" max="1" step="0.05" data-k="sfx" /></label>
    <label class="snd-mute"><input type="checkbox" data-k="muted" /> Silenciar todo <kbd>M</kbd></label>`;
  const music = body.querySelector<HTMLInputElement>('[data-k="music"]')!;
  const sfx = body.querySelector<HTMLInputElement>('[data-k="sfx"]')!;
  const muted = body.querySelector<HTMLInputElement>('[data-k="muted"]')!;

  const render = () => {
    music.value = String(s.music);
    sfx.value = String(s.sfx);
    muted.checked = s.muted;
    // El botón de ajustes avisa si no suena nada.
    document.querySelector('.snd-toggle')?.classList.toggle('off', s.muted || (s.music === 0 && s.sfx === 0));
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
  body.addEventListener('pointerdown', () => audio.unlock());
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'm' || e.metaKey || e.ctrlKey || (e.target as HTMLElement).tagName === 'INPUT') return;
    s.muted = !s.muted;
    change();
  });

  // Si el motor aún no existe (falta un gesto del usuario), `unlock()` aplicará estos valores al crearlo.
  queueMicrotask(render);
  return { title: 'Sonido', body };
}

/** Ajustes con solo el sonido (banco de combate, galería de estilo). */
export function mountSoundControl() {
  mountSettings([soundSection()]);
}
