import './tips.css';
import type { SettingsSection } from './settings';

/**
 * Consejos en el momento: una frase que señala un elemento la primera vez
 * que importa y no vuelve a salir. Se muestran de uno en uno (los demás
 * esperan). Cuentan como vistos al cerrarlos o tras unos segundos a la vista;
 * si el elemento desaparece antes (otra pantalla), se volverán a ofrecer.
 */

const KEY = 'dawnspath.tips.v1';
/** A la vista este tiempo, el consejo cuenta como leído aunque no se cierre. */
const READ_MS = 6000;

interface TipState {
  enabled: boolean;
  seen: string[];
}

function load(): TipState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { enabled: s.enabled !== false, seen: Array.isArray(s.seen) ? s.seen : [] };
  } catch {
    return { enabled: true, seen: [] };
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* sin almacenamiento: valen para esta sesión */
  }
}

const state = load();
type Target = string | (() => Element | null);
const queue: { id: string; text: string; target: Target }[] = [];
let current: { id: string; text: string; el: HTMLElement; target: Target; shownAt: number; raf: number } | null = null;

const find = (t: Target) => (typeof t === 'string' ? document.querySelector(t) : t());
const visible = (el: Element | null): el is Element => {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

/** Pide un consejo. Si ya se vio, está desactivado o ya está pedido, no hace nada. */
export function tip(id: string, text: string, target: Target) {
  if (!state.enabled || state.seen.includes(id) || current?.id === id || queue.some((q) => q.id === id)) return;
  queue.push({ id, text, target });
  // Se espera un cuadro: la pantalla que lo pide suele estar pintándose ahora mismo.
  requestAnimationFrame(next);
}

/** Hay una ventana abierta y el elemento no está dentro: el consejo espera a que se cierre. */
function blocked(el: Element) {
  const modal = document.querySelector('#modals .cp-modal');
  return !!modal && !modal.contains(el);
}

let retry = 0;
function next() {
  if (current) return;
  clearTimeout(retry);
  while (queue.length) {
    const q = queue[0];
    const el = find(q.target);
    if (state.seen.includes(q.id) || !visible(el)) {
      queue.shift();
      continue;
    }
    if (blocked(el)) {
      retry = window.setTimeout(next, 500);
      return;
    }
    queue.shift();
    show(q.id, q.text, q.target);
    return;
  }
}

function show(id: string, text: string, target: Target) {
  const el = document.createElement('div');
  el.className = 'tip';
  el.setAttribute('role', 'status');
  el.innerHTML = `<p></p><button>Entendido</button>`;
  el.querySelector('p')!.textContent = text;
  el.querySelector('button')!.addEventListener('click', () => close(true));
  document.body.appendChild(el);
  current = { id, text, el, target, shownAt: performance.now(), raf: 0 };
  // Pulsar lo que señala el consejo es haberlo entendido.
  find(target)?.addEventListener('click', () => current?.id === id && close(true), { once: true });
  requestAnimationFrame(() => el.classList.add('on'));
  follow();
}

/** Coloca la burbuja encima del elemento (o debajo si no cabe) y la sigue mientras exista. */
function follow() {
  if (!current) return;
  const t = find(current.target);
  if (!visible(t) || blocked(t)) {
    // Otra pantalla u otra ventana delante: si no dio tiempo a leerlo, vuelve a la cola.
    const read = performance.now() - current.shownAt > READ_MS;
    if (!read) queue.unshift({ id: current.id, text: current.text, target: current.target });
    return close(read);
  }
  const r = t.getBoundingClientRect();
  const el = current.el;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const below = r.top - h - 14 < 8;
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const top = below ? r.bottom + 12 : r.top - h - 12;
  el.classList.toggle('below', below);
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  el.style.setProperty('--arrow', `${Math.round(Math.max(14, Math.min(w - 14, r.left + r.width / 2 - left)))}px`);
  current.raf = requestAnimationFrame(follow);
}

function close(read: boolean) {
  if (!current) return;
  cancelAnimationFrame(current.raf);
  if (read && !state.seen.includes(current.id)) {
    state.seen.push(current.id);
    persist();
  }
  const el = current.el;
  el.classList.remove('on');
  setTimeout(() => el.remove(), 250);
  current = null;
  setTimeout(next, 300);
}

/** Sección de ajustes: activar los consejos y volver a verlos desde el principio. */
export function tipsSection(): SettingsSection {
  const body = document.createElement('div');
  body.className = 'set-rows';
  body.innerHTML = `
    <label class="snd-mute"><input type="checkbox" data-k="tips" /> Mostrar consejos</label>
    <button class="set-btn" data-k="reset">Volver a ver los consejos</button>`;
  const box = body.querySelector<HTMLInputElement>('[data-k="tips"]')!;
  const reset = body.querySelector<HTMLButtonElement>('[data-k="reset"]')!;
  const render = () => {
    box.checked = state.enabled;
    reset.disabled = !state.seen.length;
  };
  box.addEventListener('change', () => {
    state.enabled = box.checked;
    if (!state.enabled) {
      queue.length = 0;
      close(false);
    }
    persist();
    render();
  });
  reset.addEventListener('click', () => {
    state.seen = [];
    state.enabled = true;
    persist();
    render();
  });
  render();
  return { title: 'Consejos', body };
}
