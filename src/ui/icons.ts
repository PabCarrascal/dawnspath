/**
 * Iconos de recursos en pixel art, dibujados en código como los sprites:
 * moneda (oro), troncos (materiales), roca (piedra), hogaza (víveres) y
 * antorcha. Cada mapa es de 12 × 12; `.` es transparente.
 */

export type IconName = 'gold' | 'materials' | 'stone' | 'food' | 'torches';

const MAPS: Record<IconName, { pal: Record<string, string>; rows: string[] }> = {
  gold: {
    pal: { o: '#4a2e08', y: '#e8b830', Y: '#fff2a8', d: '#b07c18' },
    rows: [
      '...oooooo...',
      '..oyyyyyyo..',
      '.oyYYyyyyyo.',
      'oyYyddddyydo',
      'oyYdyyyydydo',
      'oyydyyyydydo',
      'oyydyyyydydo',
      'oyyyddddyydo',
      'oyyyyyyyyddo',
      '.oyyyyyyddo.',
      '..oddddddo..',
      '...oooooo...',
    ],
  },
  materials: {
    pal: { o: '#2e1c0e', r: '#e8c088', R: '#a87040', b: '#8a5a30', B: '#a8743e' },
    rows: [
      '............',
      '..oooooooooo',
      '.orrrBBBBBBo',
      '.orRrbbbbbbo',
      '.orrrbbbbbbo',
      '..oooooooooo',
      '.oooooooooo.',
      'orrrBBBBBBo.',
      'orRrbbbbbbo.',
      'orrrbbbbbbo.',
      '.oooooooooo.',
      '............',
    ],
  },
  stone: {
    pal: { o: '#23232c', g: '#9a9aa6', G: '#d4d4dc', d: '#62626e' },
    rows: [
      '............',
      '....oooo....',
      '..ooGGggoo..',
      '.oGGGggggdo.',
      '.oGggggggdo.',
      'oGgggggggddo',
      'oggggggdgddo',
      'ogggggggdddo',
      'oggggggddddo',
      '.ogggdddddo.',
      '..oooooooo..',
      '............',
    ],
  },
  food: {
    pal: { o: '#3a1e08', b: '#d89a48', B: '#f8d488', c: '#9a5a22', d: '#a8682a' },
    rows: [
      '............',
      '............',
      '...oooooo...',
      '..oBBBBBBo..',
      '.oBBcBBcBBo.',
      'obBcbBcbBbbo',
      'obbbbbbbbbbo',
      'obbbbbbbbbdo',
      'obbbbbbbbddo',
      '.oddddddddo.',
      '..oooooooo..',
      '............',
    ],
  },
  torches: {
    pal: { f: '#e0501a', F: '#ff9a2a', Y: '#ffe680', o: '#2a1a0e', H: '#74747e', w: '#9a6a3a', W: '#5e3c1c' },
    rows: [
      '.....f......',
      '....fFf.....',
      '...fFYFf....',
      '...fYYFf....',
      '...fFYFf....',
      '....oHHo....',
      '....oHHo....',
      '.....wW.....',
      '.....wW.....',
      '.....wW.....',
      '.....wW.....',
      '.....oo.....',
    ],
  },
};

export const ICON_NAMES: Record<IconName, string> = { gold: 'Oro', materials: 'Materiales', stone: 'Piedra', food: 'Víveres', torches: 'Antorchas' };

const cache = new Map<IconName, string>();

function draw(name: IconName) {
  const { pal, rows } = MAPS[name];
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const ctx = c.getContext('2d')!;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(x, y, 1, 1);
    }),
  );
  return c.toDataURL();
}

/** `<img>` del icono, listo para meter en el HTML de la interfaz. */
export function icon(name: IconName) {
  let url = cache.get(name);
  if (!url) cache.set(name, (url = draw(name)));
  return `<img class="ic" src="${url}" alt="${ICON_NAMES[name]}">`;
}

/** Cantidad con su icono: `<span title="Oro"><img…>40</span>`. */
export function amount(name: IconName, n: number) {
  return `<span class="amt" title="${ICON_NAMES[name]}">${icon(name)}${n}</span>`;
}

/** Coste o botín en iconos, en el orden oro, materiales, piedra. */
export function costHtml(r: Partial<Record<'gold' | 'materials' | 'stone', number>>) {
  return (['gold', 'materials', 'stone'] as const)
    .filter((k) => r[k])
    .map((k) => amount(k, r[k]!))
    .join(' ');
}
