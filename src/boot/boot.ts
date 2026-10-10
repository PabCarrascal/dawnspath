import { ALL_MUSIC, audio } from '../audio/Audio';

/**
 * Pantalla de carga y presentación del juego. Mientras amanece sobre el
 * castillo (el sol sube con el progreso) se descargan las fuentes, la música
 * y el código, y se monta la maqueta de la portada. Luego pide un gesto (el
 * navegador no deja sonar música sin él), cuenta el prólogo con la música
 * del castillo y descubre la portada.
 */

const root = document.getElementById('boot')!;
const status = root.querySelector<HTMLElement>('.boot-status')!;
const line = root.querySelector<HTMLElement>('.boot-line')!;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

const PROLOGUE = [
  'Hace un siglo, la Noche cayó sobre el norte.',
  'Uno a uno, los reinos se apagaron. Solo el castillo del Alba sigue en pie.',
  'Su luz es la última. Y la oscuridad ya viene a por ella.',
];

// ───────────────────────── progreso ─────────────────────────

/** Fases de la carga, con su peso en la barra y lo que se cuenta mientras tanto. */
const PHASES = {
  fonts: { weight: 0.05, text: 'Encendiendo las antorchas…' },
  music: { weight: 0.5, text: 'Afinando a los juglares…' },
  code: { weight: 0.3, text: 'Forjando espadas y escudos…' },
  scene: { weight: 0.15, text: 'Levantando el castillo…' },
};
type Phase = keyof typeof PHASES;
const done: Record<Phase, number> = { fonts: 0, music: 0, code: 0, scene: 0 };

const target = () => (Object.keys(PHASES) as Phase[]).reduce((sum, k) => sum + PHASES[k].weight * done[k], 0);

/** La barra (y el sol) avanzan suavemente hacia el progreso real. */
let shown = 0.03;
let last = performance.now();
let raf = 0;
const tick = (now: number) => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  shown += (Math.max(shown, target()) - shown) * Math.min(1, dt * 5);
  root.style.setProperty('--p', shown.toFixed(4));
  const pending = (Object.keys(PHASES) as Phase[]).find((k) => done[k] < 1);
  if (pending && !root.classList.contains('error')) status.textContent = PHASES[pending].text;
  raf = requestAnimationFrame(tick);
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function frames(n: number) {
  for (let k = 0; k < n; k++) await new Promise((r) => requestAnimationFrame(r));
}

/** Cielo estrellado: puntos con `box-shadow` sobre un píxel. */
function stars() {
  const el = root.querySelector<HTMLElement>('.boot-stars')!;
  const dots: string[] = [];
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 100;
    const y = Math.random() * 62;
    const a = 0.35 + Math.random() * 0.65;
    dots.push(`${x.toFixed(2)}vw ${y.toFixed(2)}vh 0 ${Math.random() < 0.15 ? 1 : 0}px rgba(255, 248, 225, ${a.toFixed(2)})`);
  }
  el.style.boxShadow = dots.join(',');
}

async function loadFonts() {
  // Si Google Fonts no responde, se sigue con las de respaldo.
  await Promise.race([
    Promise.all(['700 48px Cinzel', '400 18px "EB Garamond"', 'italic 400 18px "EB Garamond"'].map((f) => document.fonts.load(f))),
    wait(3000),
  ]).catch(() => undefined);
  done.fonts = 1;
}

/** Toda la banda sonora, en paralelo. Si falla una pista, el juego sigue sin ella. */
async function loadMusic() {
  const parts = ALL_MUSIC.map(() => 0);
  await Promise.all(
    ALL_MUSIC.map((name, i) =>
      audio.preload(name, (f) => {
        parts[i] = f;
        done.music = parts.reduce((a, b) => a + b, 0) / parts.length;
      }),
    ),
  );
  done.music = 1;
}

/** El código del juego (Three.js y la campaña). No da progreso: la barra avanza sola mientras llega. */
async function loadGame() {
  const t0 = performance.now();
  const creep = setInterval(() => (done.code = Math.min(0.9, (performance.now() - t0) / 5000)), 100);
  try {
    return await import('../campaign/main');
  } finally {
    clearInterval(creep);
    done.code = 1;
  }
}

// ───────────────────────── presentación ─────────────────────────

/** Espera a un clic, un toque o una tecla (que no sean del control de sonido). */
function gesture() {
  return new Promise<void>((resolve) => {
    const on = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('.snd')) return;
      if (e instanceof KeyboardEvent && (e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() === 'm')) return;
      window.removeEventListener('pointerdown', on);
      window.removeEventListener('keydown', on);
      resolve();
    };
    window.addEventListener('pointerdown', on);
    window.addEventListener('keydown', on);
  });
}

/** Cuenta el prólogo línea a línea; un clic o una tecla lo salta entero. */
async function prologue() {
  let skipped = false;
  const skip = gesture().then(() => (skipped = true));
  const hold = (ms: number) => Promise.race([wait(ms), skip]);
  await hold(calm ? 300 : 1400);
  for (const text of PROLOGUE) {
    if (skipped) break;
    line.textContent = text;
    line.classList.add('on');
    await hold(calm ? 2400 : 3800);
    line.classList.remove('on');
    await hold(900);
  }
}

async function main() {
  stars();
  raf = requestAnimationFrame(tick);
  try {
    const [, , game] = await Promise.all([loadFonts(), loadMusic(), loadGame()]);
    game.prepareTitle();
    // Unos cuadros con la maqueta ya en pantalla: se generan texturas y se compilan los sombreadores.
    await frames(4);
    done.scene = 1;
    await wait(500);

    root.classList.add('ready');
    status.textContent = 'El alba te espera';
    await gesture();
    audio.unlock();
    audio.music('castle');
    audio.play('dawn');

    root.classList.add('story');
    await prologue();

    game.showTitle(true);
    root.classList.add('out');
    await wait(1900);
    cancelAnimationFrame(raf);
    root.remove();
  } catch (err) {
    console.error(err);
    root.classList.add('error');
    status.textContent = 'No se pudo cargar el juego. Recarga la página.';
  }
}

void main();
