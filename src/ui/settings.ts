import '../audio/sound.css';

/** Una sección del panel de ajustes: título y contenido ya enlazado. */
export interface SettingsSection {
  title: string;
  body: HTMLElement;
}

/**
 * Botón de ajustes fijo en la esquina: abre un panel que agrupa la
 * configuración (sonido, nombres…). Cada página monta las secciones que
 * necesita. Se cierra al pulsar fuera o con Escape.
 */
export function mountSettings(sections: SettingsSection[]) {
  const root = document.createElement('div');
  root.className = 'snd';
  root.innerHTML = `
    <button class="snd-toggle" title="Ajustes" aria-label="Ajustes" aria-expanded="false">⚙</button>
    <div class="snd-panel" role="dialog" aria-label="Ajustes"><h3>Ajustes</h3></div>`;
  const panel = root.querySelector<HTMLElement>('.snd-panel')!;
  for (const s of sections) {
    const sec = document.createElement('section');
    sec.innerHTML = `<h4>${s.title}</h4>`;
    sec.appendChild(s.body);
    panel.appendChild(sec);
  }
  document.body.appendChild(root);

  const toggle = root.querySelector<HTMLButtonElement>('.snd-toggle')!;
  const setOpen = (open: boolean) => {
    root.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!root.classList.contains('open'));
  });
  document.addEventListener('pointerdown', (e) => {
    if (!root.contains(e.target as Node)) setOpen(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
  return { root, toggle };
}
