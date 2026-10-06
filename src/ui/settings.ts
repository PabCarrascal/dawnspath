import type { Quality } from '../render/World';

export interface Settings {
  music: number;
  sfx: number;
  muted: boolean;
  /** Multiplicador de velocidad de las animaciones nocturnas. */
  nightSpeed: 1 | 2 | 3;
  quality: Quality;
  threat: boolean;
  autoCamera: boolean;
  tips: boolean;
}

const KEY = 'dawnspath.settings.v1';

const DEFAULTS: Settings = {
  music: 0.55,
  sfx: 0.8,
  muted: false,
  nightSpeed: 1,
  quality: 'high',
  threat: true,
  autoCamera: true,
  tips: true,
};

/** localStorage puede no existir o lanzar (modo privado, cookies bloqueadas). */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* sin almacenamiento: valores por defecto */
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignorado */
  }
}

/** Panel de ajustes: se construye una vez y avisa de cada cambio. */
export function mountSettingsPanel(settings: Settings, onChange: (s: Settings) => void) {
  const el = document.getElementById('settings')!;
  el.innerHTML = `
    <div class="screen-card settings-card">
      <h2>Ajustes</h2>
      <div class="settings-grid">
        <label>Música<input type="range" min="0" max="1" step="0.05" data-k="music" /></label>
        <label>Efectos<input type="range" min="0" max="1" step="0.05" data-k="sfx" /></label>
        <label class="check"><input type="checkbox" data-k="muted" />Silenciar todo <kbd>M</kbd></label>
        <label>Velocidad de la noche
          <select data-k="nightSpeed">
            <option value="1">Normal</option>
            <option value="2">Rápida</option>
            <option value="3">Muy rápida</option>
          </select>
        </label>
        <label>Calidad gráfica
          <select data-k="quality">
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja (sin sombras ni resplandor)</option>
          </select>
        </label>
        <label class="check"><input type="checkbox" data-k="threat" />Mostrar zona de amenaza <kbd>T</kbd></label>
        <label class="check"><input type="checkbox" data-k="autoCamera" />Cámara sigue los combates nocturnos</label>
        <label class="check"><input type="checkbox" data-k="tips" />Consejos del consejero</label>
      </div>
      <div class="buttons">
        <button class="btn primary" data-act="close">Listo</button>
      </div>
    </div>`;

  const inputs = el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]');
  const sync = () => {
    for (const input of inputs) {
      const k = input.dataset.k as keyof Settings;
      if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = settings[k] as boolean;
      else input.value = String(settings[k]);
    }
  };
  sync();
  for (const input of inputs) {
    input.addEventListener('input', () => {
      const k = input.dataset.k as keyof Settings;
      let value: unknown;
      if (input instanceof HTMLInputElement && input.type === 'checkbox') value = input.checked;
      else if (input instanceof HTMLInputElement && input.type === 'range') value = Number(input.value);
      else if (k === 'nightSpeed') value = Number(input.value);
      else value = input.value;
      (settings as unknown as Record<string, unknown>)[k] = value;
      saveSettings(settings);
      onChange(settings);
    });
  }
  el.querySelector('[data-act="close"]')!.addEventListener('click', () => el.classList.remove('on'));
  el.addEventListener('click', (e) => {
    if (e.target === el) el.classList.remove('on');
  });

  return {
    open: () => {
      sync();
      el.classList.add('on');
    },
    toggle: () => {
      sync();
      el.classList.toggle('on');
    },
    sync,
  };
}
