import { Rng } from '../../core/rng';
import type { Campaign } from '../rules/Campaign';
import { MAP, NODE, STRUCTURES } from '../rules/data';
import type { NodeStatus, NodeType } from '../rules/types';

export const MAP_W = 1000;
export const MAP_H = 620;

const STATUS_LABEL: Record<NodeStatus, string> = {
  unknown: 'Desconocido',
  hostile: 'Hostil',
  lost: 'Perdido',
  cleared: 'Limpio',
  secured: 'Asegurado',
  castle: 'Tu castillo',
};

/** Glifos de tinta para cada tipo de nodo, centrados en (0, 0). */
const GLYPH: Record<NodeType, string> = {
  castle: '<path d="M-22 14 V-8 H-14 V-14 H-8 V-8 H-3 V-22 H3 V-8 H8 V-14 H14 V-8 H22 V14 Z" /><path d="M-4 14 V4 A4 4 0 0 1 4 4 V14" class="hole"/>',
  meadow: '<path d="M-18 10 q4 -14 6 0 M-6 10 q3 -18 6 0 M8 10 q4 -12 6 0 M-22 12 H22" />',
  forest: '<path d="M-14 12 L-6 -10 L2 12 Z M0 12 L8 -16 L16 12 Z M-22 12 L-16 -2 L-10 12 Z" />',
  ruins: '<path d="M-18 12 V-8 H-12 V12 M10 12 V-2 H16 V12 M-18 -8 Q-4 -24 10 -4" /><path d="M-24 12 H22" />',
  ford: '<path d="M-22 -4 q6 -6 11 0 t11 0 t11 0 t11 0 M-22 6 q6 -6 11 0 t11 0 t11 0 t11 0" />',
  lair: '<path d="M-10 14 L-8 -12 L-4 -4 L0 -24 L4 -4 L8 -12 L10 14 Z" /><circle cx="0" cy="2" r="3" class="eye"/>',
  village: '<path d="M-20 12 V-2 L-11 -10 L-2 -2 V12 M2 12 V-6 L11 -16 L20 -6 V12 M-24 12 H24" /><path d="M8 4 h5 v5 h-5 Z" class="hole"/>',
  shrine: '<path d="M-14 12 V-4 L0 -16 L14 -4 V12 Z M0 -16 V-26 M-5 -22 H5" /><path d="M-3 12 V4 Q0 -2 3 4 V12" class="hole"/>',
  mountain: '<path d="M-24 12 L-10 -12 L-3 -2 L6 -20 L24 12 Z M6 -20 L2 -8 M-10 -12 L-13 -2" />',
  den: '<path d="M-22 12 Q-18 -16 0 -16 Q18 -16 22 12 Z" /><path d="M-10 12 Q-8 -4 0 -4 Q8 -4 10 12 Z" class="hole"/><circle cx="-3" cy="5" r="1.8" class="eye"/><circle cx="3" cy="5" r="1.8" class="eye"/>',
  bog: '<path d="M-22 8 q5 -4 10 0 t10 0 t10 0 t10 0 M-14 8 V-10 M-10 8 V-14 M12 8 V-8 M16 8 V-12" />',
};

/** Pergamino envejecido con montañas, bosques, el río y una rosa de los vientos. */
function paintParchment(seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = MAP_W * 2;
  c.height = MAP_H * 2;
  const ctx = c.getContext('2d')!;
  ctx.scale(2, 2);
  const rng = new Rng(seed);

  const base = ctx.createRadialGradient(MAP_W / 2, MAP_H / 2, 80, MAP_W / 2, MAP_H / 2, MAP_W * 0.62);
  base.addColorStop(0, '#e6d4a8');
  base.addColorStop(0.7, '#cdb582');
  base.addColorStop(1, '#8a6a3c');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  // Manchas y vetas
  for (let i = 0; i < 90; i++) {
    const x = rng.next() * MAP_W;
    const y = rng.next() * MAP_H;
    const r = 10 + rng.next() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(110, 80, 40, ${0.04 + rng.next() * 0.08})`);
    g.addColorStop(1, 'rgba(110, 80, 40, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.strokeStyle = 'rgba(90, 64, 30, 0.07)';
  for (let i = 0; i < 400; i++) {
    const y = rng.next() * MAP_H;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(MAP_W, y + (rng.next() - 0.5) * 30);
    ctx.stroke();
  }

  const ink = 'rgba(40, 26, 14, 0.75)';
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Río que baja del norte y cruza por el vado
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(70, 90, 100, 0.45)';
  ctx.beginPath();
  ctx.moveTo(680, -10);
  ctx.bezierCurveTo(640, 120, 700, 260, 605, 385);
  ctx.bezierCurveTo(540, 470, 680, 540, 650, 640);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ink;
  ctx.stroke();

  // Montañas al norte y al este
  const mountain = (x: number, y: number, s: number) => {
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - 22 * s, y);
    ctx.lineTo(x, y - 30 * s);
    ctx.lineTo(x + 22 * s, y);
    ctx.stroke();
    ctx.lineWidth = 0.8;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(x + 2 * s + k * 4 * s, y - 26 * s + k * 7 * s);
      ctx.lineTo(x + 6 * s + k * 4 * s, y - 2 * s);
      ctx.stroke();
    }
  };
  for (let i = 0; i < 26; i++) mountain(560 + rng.next() * 420, 40 + rng.next() * 130, 0.8 + rng.next() * 0.7);
  for (let i = 0; i < 10; i++) mountain(20 + rng.next() * 260, 40 + rng.next() * 140, 0.7 + rng.next() * 0.5);

  // Arboledas alrededor del bosque y dispersas
  const tree = (x: number, y: number, s: number) => {
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 6 * s, y);
    ctx.lineTo(x, y - 16 * s);
    ctx.lineTo(x + 6 * s, y);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 4 * s);
    ctx.stroke();
  };
  for (let i = 0; i < 70; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = 40 + rng.next() * 90;
    tree(NODE.bosque.x + Math.cos(a) * r * 1.3, NODE.bosque.y + Math.sin(a) * r * 0.7, 0.8 + rng.next() * 0.5);
  }
  for (let i = 0; i < 40; i++) tree(rng.next() * MAP_W, 200 + rng.next() * 400, 0.7 + rng.next() * 0.4);

  // Juncos del marjal
  for (let i = 0; i < 26; i++) {
    const x = NODE.marjal.x + (rng.next() - 0.5) * 150;
    const y = NODE.marjal.y + (rng.next() - 0.5) * 90;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.lineTo(x + 5, y);
    ctx.moveTo(x - 2, y);
    ctx.lineTo(x - 3, y - 7);
    ctx.moveTo(x + 2, y);
    ctx.lineTo(x + 3, y - 9);
    ctx.stroke();
  }

  // Rosa de los vientos
  const cx = 920;
  const cy = 548;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, 38, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const len = k % 2 ? 26 : 50;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a + 0.18) * 8, cy + Math.sin(a + 0.18) * 8);
    ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    ctx.lineTo(cx + Math.cos(a - 0.18) * 8, cy + Math.sin(a - 0.18) * 8);
    ctx.closePath();
    if (k % 2 === 0) ctx.fill();
    else ctx.stroke();
  }
  ctx.font = '16px "IM Fell English SC", serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy - 56);

  // Cartela con el título
  ctx.font = '26px "IM Fell English SC", serif';
  ctx.fillText('El Sendero del Alba', 170, 586);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 596);
  ctx.lineTo(300, 596);
  ctx.stroke();

  // Bordes quemados
  const edge = ctx.createRadialGradient(MAP_W / 2, MAP_H / 2, MAP_H * 0.45, MAP_W / 2, MAP_H / 2, MAP_W * 0.6);
  edge.addColorStop(0, 'rgba(40, 20, 5, 0)');
  edge.addColorStop(1, 'rgba(40, 20, 5, 0.65)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  return c;
}

export interface MapHooks {
  onTravel: (id: string) => void;
}

/** El mapa del sendero: pergamino pintado y nodos en SVG por encima. */
export class MapView {
  readonly el: HTMLElement;
  private svg: SVGSVGElement;
  private tip: HTMLElement;

  constructor(
    private campaign: Campaign,
    private hooks: MapHooks,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'cp-map-frame';
    this.el.appendChild(paintParchment(campaign.state.seed));
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${MAP_W} ${MAP_H}`);
    this.el.appendChild(this.svg);
    this.tip = document.createElement('div');
    this.tip.className = 'cp-map-tip';
    this.el.appendChild(this.tip);
    this.render();
  }

  render() {
    const c = this.campaign;
    const exp = c.state.exp;
    const here = exp?.node ?? 'castle';
    const reach = exp && !c.state.pending ? NODE[here].links : [];
    let paths = '';
    const drawn = new Set<string>();
    for (const n of MAP) {
      for (const l of n.links) {
        const key = [n.id, l].sort().join('-');
        if (drawn.has(key)) continue;
        drawn.add(key);
        const m = NODE[l];
        const known = c.node(n.id).seen && c.node(l).seen;
        // Caminos algo curvos, como trazados a mano
        const mx = (n.x + m.x) / 2 + (m.y - n.y) * 0.08;
        const my = (n.y + m.y) / 2 - (m.x - n.x) * 0.08;
        paths += `<path class="road ${known ? '' : 'faint'}" d="M${n.x} ${n.y} Q${mx} ${my} ${m.x} ${m.y}" />`;
      }
    }
    let fog = '';
    let nodes = '';
    const frontier = c.darkFrontier();
    for (const n of MAP) {
      const st = c.status(n.id);
      const ns = c.node(n.id);
      const canGo = reach.includes(n.id);
      if (st === 'unknown') fog += `<ellipse class="fog" cx="${n.x}" cy="${n.y}" rx="74" ry="52" />`;
      // La oscuridad se ve aunque el nodo no se haya explorado.
      if (ns.dark) fog += `<ellipse class="dark" cx="${n.x}" cy="${n.y}" rx="86" ry="62" />`;
      const front = frontier.includes(n.id) ? `<circle class="frontier" cx="${n.x}" cy="${n.y}" r="40" />` : '';
      const struct = ns.structure ? `<text class="struct" x="${n.x + 30}" y="${n.y - 18}">${ns.structure === 'tower' ? '♜' : '△'}</text>` : '';
      const guards = ns.garrison.length ? `<text class="guards" x="${n.x + 30}" y="${n.y + 2}">${'⚑'.repeat(ns.garrison.length)}</text>` : '';
      const foes = st === 'hostile' || st === 'lost' ? `<text class="foes" x="${n.x - 34}" y="${n.y - 18}">${'☠'.repeat(Math.min(4, ns.foes.length))}</text>` : '';
      const cost = canGo ? `<text class="cost" x="${n.x}" y="${n.y + 58}">${c.travelCost(n.id)} h</text>` : '';
      nodes += `
        <g class="node st-${st} ${canGo ? 'reach' : ''} ${here === n.id ? 'here' : ''} ${n.boss ? 'boss' : ''} ${ns.dark ? 'is-dark' : ''}" data-id="${n.id}">
          ${front}
          <circle class="halo" cx="${n.x}" cy="${n.y}" r="34" />
          <circle class="disc" cx="${n.x}" cy="${n.y}" r="26" />
          <g class="glyph" transform="translate(${n.x} ${n.y})">${st === 'unknown' ? '<text class="q" y="10">?</text>' : GLYPH[n.type]}</g>
          <text class="name" x="${n.x}" y="${n.y + 44}">${st === 'unknown' ? '· · ·' : n.name}</text>
          ${cost}${struct}${guards}${foes}
        </g>`;
    }
    const h = NODE[here];
    const token = exp
      ? `<g class="token" transform="translate(${h.x - 6} ${h.y - 36})"><path d="M0 0 V-40" /><path class="flag" d="M0 -40 L28 -34 L18 -28 L28 -22 L0 -18 Z" /></g>`
      : '';
    this.svg.innerHTML = `<defs><filter id="blur"><feGaussianBlur stdDeviation="9" /></filter></defs>${paths}<g filter="url(#blur)">${fog}</g>${nodes}${token}`;

    for (const g of this.svg.querySelectorAll<SVGGElement>('.node')) {
      const id = g.dataset.id!;
      g.addEventListener('pointerenter', () => this.showTip(id));
      g.addEventListener('pointerleave', () => this.tip.classList.remove('on'));
      g.addEventListener('click', () => reach.includes(id) && this.hooks.onTravel(id));
    }
  }

  private showTip(id: string) {
    const c = this.campaign;
    const def = NODE[id];
    const st = c.status(id);
    const ns = c.node(id);
    const exp = c.state.exp;
    const reach = exp && NODE[exp.node].links.includes(id);
    const lines: string[] = [];
    if (st !== 'unknown') lines.push(`<p>${def.desc}</p>`);
    if (st === 'hostile' || st === 'lost') lines.push(`<p class="bad">Lo defienden: ${c.describeFoes(ns.foes)}</p>`);
    if (st === 'unknown') lines.push('<p>Nadie sabe qué espera allí. Explora desde un nodo vecino para descubrirlo.</p>');
    if (ns.dark) lines.push(`<p class="dark">Cubierto por la oscuridad: allí siempre se pelea de noche y las criaturas vuelven.${def.source && !ns.destroyed ? ' Es un foco: desde aquí avanza la noche.' : ''}</p>`);
    else if (c.darkFrontier().includes(id)) lines.push(`<p class="dark">La oscuridad llegará en ${c.state.darkClock} ${c.state.darkClock === 1 ? 'día' : 'días'}${ns.garrison.length && ns.structure ? ', pero su guarnición puede contenerla' : ''}.</p>`);
    if (ns.destroyed) lines.push('<p class="good">Foco destruido: la oscuridad ya no nace aquí.</p>');
    if (def.village && !ns.foes.length) lines.push(`<p class="good">Aldea: víveres a ${c.villagePrice(id)} de oro, cobijo para dormir${ns.uses ? '' : ` y ${def.village.name} dispuesto a unirse`}.</p>`);
    if (def.type === 'shrine' && !ns.foes.length && st !== 'unknown') lines.push(`<p class="good">Ermita: ${ns.uses ? `quedan ${ns.uses} rezos` : 'la llama se ha apagado'}.</p>`);
    if (ns.structure) lines.push(`<p>${STRUCTURES[ns.structure].name}${ns.garrison.length ? ` · ${ns.garrison.length} de guardia: ${ns.garrison.map((g) => c.soldier(g)?.name).join(', ')}` : ' · sin guardia'}</p>`);
    if (st === 'cleared' && id !== 'castle' && def.type !== 'village') lines.push('<p class="warn">Sin guardia: de noche las criaturas pueden retomarlo y al cruzarlo hay riesgo de emboscada.</p>');
    if (st === 'secured') lines.push('<p class="good">Asegurado: se cruza en 1 hora y sin riesgo.</p>');
    if (st !== 'unknown' && !ns.foes.length && !ns.looted && Object.keys(def.loot).length && id !== 'castle') lines.push('<p class="good">Queda botín por saquear.</p>');
    if (reach) lines.push(`<p class="go">Clic para viajar · ${c.travelCost(id)} h de luz</p>`);
    this.tip.innerHTML = `<h4>${st === 'unknown' ? 'Tierra sin explorar' : def.name}</h4><em>${STATUS_LABEL[st]}</em>${lines.join('')}`;
    const box = this.el.getBoundingClientRect();
    const sx = box.width / MAP_W;
    const sy = box.height / MAP_H;
    const left = def.x * sx;
    this.tip.style.left = `${Math.min(box.width - 270, Math.max(10, left + 40))}px`;
    this.tip.style.top = `${Math.max(10, def.y * sy - 40)}px`;
    this.tip.classList.add('on');
  }
}
