import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/rng';
import { FRAMES, spriteSheet } from './characters';
import * as px from './pixel';

/** Rejilla del diorama: columnas de bloques de 1 × 1, con el frente hacia +z. */
const W = 26;
const D = 16;
const BOTTOM = -3;
const wx = (i: number) => i - W / 2 + 0.5;
const wz = (j: number) => j - D / 2 + 0.5;

type Cell = 'grass' | 'path' | 'river';

const riverX = (j: number) => Math.round(6 + 1.6 * Math.sin(j * 0.45 + 0.5));
const pathX = (j: number) => Math.round(14 + 2.2 * Math.sin(j * 0.32 - 0.4));
const BRIDGE_ROW = 9;

/** Personaje en pixel art: un plano que siempre mira a la cámara y alterna cuadros. */
export class PixelSprite {
  readonly mesh: THREE.Mesh;
  /** Alto del sprite en unidades del mundo. */
  readonly height: number;
  private tex: THREE.Texture;
  private t = Math.random() * 2;
  private frame = 0;

  /** Mira a la izquierda (enemigos): la textura se invierte en horizontal. */
  readonly flipped: boolean;

  constructor(sheet: THREE.Texture, scale: number, private fps = 1.6, flipped = false) {
    this.flipped = flipped;
    this.tex = sheet.clone();
    this.tex.needsUpdate = true;
    this.tex.repeat.set((flipped ? -1 : 1) / FRAMES, 1);
    this.tex.offset.x = flipped ? 1 / FRAMES : 0;
    const img = sheet.image as HTMLCanvasElement;
    const w = (img.width / FRAMES / 22) * scale;
    const h = (img.height / 22) * scale;
    this.height = h;
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate(0, h / 2 - (1 / 22) * scale, 0);
    // Algo de luz propia: en HD-2D los personajes se leen bien aunque estén a contraluz.
    const mat = new THREE.MeshStandardMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.28 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.tex, alphaTest: 0.5 });
  }

  update(dt: number, camera: THREE.Camera) {
    this.t += dt;
    const f = Math.floor(this.t * this.fps) % FRAMES;
    if (f !== this.frame) {
      this.frame = f;
      this.tex.offset.x = (this.flipped ? f + 1 : f) / FRAMES;
    }
    // Giro solo en vertical (como los sprites de HD-2D: de pie, nunca tumbados).
    const p = this.mesh.position;
    this.mesh.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
  }
}

export interface Forest {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  lamp: THREE.PointLight;
  fire: THREE.PointLight;
  lampGlow: THREE.Mesh;
  /** Punto en el que se centra la cámara (el grupo). */
  focus: THREE.Vector3;
  shades: PixelSprite[];
  motes: THREE.Points;
  fireflies: THREE.Points;
  update(dt: number, time: number, camera: THREE.Camera): void;
}

/** Hierba y flores que se mecen: desplaza la punta con el tiempo y la posición. */
function swaying(mat: THREE.Material, uniforms: { uTime: { value: number } }) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 swayBase = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(uTime * 1.8 + swayBase.x * 0.9 + swayBase.z * 0.6) * 0.07 + sin(uTime * 3.1 + swayBase.x * 2.0) * 0.02;
        transformed.x += sway * uv.y;
        transformed.z += sway * 0.5 * uv.y;`,
      );
  };
}

/** Plano cruzado (dos quads en aspa), base de la vegetación en sprites. */
function crossQuad(size: number) {
  const a = new THREE.PlaneGeometry(size, size);
  const b = new THREE.PlaneGeometry(size, size);
  b.rotateY(Math.PI / 2);
  const g = mergeGeometries([a, b])!;
  g.translate(0, size / 2, 0);
  return g;
}

/** Puntos que flotan: polvo dorado de día, luciérnagas de noche. */
function floaters(count: number, rng: Rng, area: [number, number, number], size: number) {
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rng.next() - 0.5) * area[0];
    pos[i * 3 + 1] = rng.next() * area[1];
    pos[i * 3 + 2] = (rng.next() - 0.5) * area[2];
    phase[i] = rng.next() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xffe0a0) }, uOpacity: { value: 1 }, uSize: { value: size } },
    vertexShader: `
      attribute float phase;
      uniform float uTime;
      uniform float uSize;
      varying float vBlink;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.3 + phase) * 0.8;
        p.y += mod(uTime * 0.15 + phase * 0.37, 1.0) * 1.5 + sin(uTime * 0.7 + phase) * 0.3;
        p.z += cos(uTime * 0.25 + phase * 1.3) * 0.8;
        vBlink = 0.5 + 0.5 * sin(uTime * 2.0 + phase * 7.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vBlink;
      void main() {
        // Cuadrado, no círculo: es pixel art.
        gl_FragColor = vec4(uColor * (0.6 + vBlink), uOpacity * (0.35 + 0.65 * vBlink));
      }`,
  });
  return new THREE.Points(geo, mat);
}

export interface ForestOptions {
  /** Campamento con hoguera y el grupo de pie (escena de nodo). */
  camp?: boolean;
  /**
   * Claro despejado (sin árboles ni matas): centro y semiejes de una elipse.
   * Por defecto, el del campamento.
   */
  clearing?: { x: number; z: number; rx: number; rz: number };
}

/** Línea de combate: los dos bandos se colocan a lo largo de esta fila del bosque. */
export const BATTLE = { x: wx(14) + 0.5, z: wz(10) };

export function buildForest(seed = 7, opts: ForestOptions = { camp: true }): Forest {
  const rng = new Rng(seed);
  const group = new THREE.Group();
  const swayUniforms = { uTime: { value: 0 } };
  const updaters: ((dt: number, t: number, cam: THREE.Camera) => void)[] = [];

  // ── Mapa de celdas: hierba, camino y río; alturas con dos lomas al fondo ──
  const cell: Cell[][] = [];
  const height: number[][] = [];
  for (let i = 0; i < W; i++) {
    cell[i] = [];
    height[i] = [];
    for (let j = 0; j < D; j++) {
      const rx = riverX(j);
      const pxx = pathX(j);
      let c: Cell = 'grass';
      if (i === rx || i === rx + 1) c = 'river';
      else if (i === pxx || i === pxx + 1) c = 'path';
      else if (j === BRIDGE_ROW && ((i > rx + 1 && i < pxx) || (i < rx && i >= rx - 3))) c = 'path';
      let h = 0;
      if (j <= 3 && (i <= 8 || i >= 19)) h = 1;
      if (j <= 1 && (i <= 4 || i >= 22)) h = 2;
      if (c === 'river') h = -1;
      cell[i][j] = c;
      height[i][j] = h;
    }
  }

  // ── Terreno: columnas de bloques con textura de píxeles ──
  const tex = {
    grassTop: px.grassTop(seed).texture(),
    grassSide: px.grassSide(seed + 1).texture(),
    dirt: px.dirt(seed + 2).texture(),
    path: px.pathTop(seed + 3).texture(),
    stone: px.stone(seed + 4).texture(),
  };
  const m = (t: THREE.Texture) => new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
  const mats = {
    grassTop: m(tex.grassTop),
    grassSide: m(tex.grassSide),
    dirt: m(tex.dirt),
    path: m(tex.path),
    stone: m(tex.stone),
  };
  // Orden de caras de BoxGeometry: +x, −x, +y, −y, +z, −z
  const kinds = {
    grass: [mats.grassSide, mats.grassSide, mats.grassTop, mats.dirt, mats.grassSide, mats.grassSide],
    path: [mats.dirt, mats.dirt, mats.path, mats.dirt, mats.dirt, mats.dirt],
    bed: [mats.stone, mats.stone, mats.stone, mats.dirt, mats.stone, mats.stone],
    dirt: [mats.dirt, mats.dirt, mats.dirt, mats.dirt, mats.dirt, mats.dirt],
  };
  const blocks: Record<keyof typeof kinds, THREE.Matrix4[]> = { grass: [], path: [], bed: [], dirt: [] };
  for (let i = 0; i < W; i++) {
    for (let j = 0; j < D; j++) {
      const h = height[i][j];
      for (let y = BOTTOM; y < h; y++) {
        const top = y === h - 1;
        const kind = !top ? 'dirt' : cell[i][j] === 'river' ? 'bed' : cell[i][j] === 'path' ? 'path' : 'grass';
        blocks[kind].push(new THREE.Matrix4().makeTranslation(wx(i), y + 0.5, wz(j)));
      }
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const k of Object.keys(blocks) as (keyof typeof kinds)[]) {
    const list = blocks[k];
    const mesh = new THREE.InstancedMesh(box, kinds[k], list.length);
    list.forEach((mx, n) => mesh.setMatrixAt(n, mx));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ── Agua: superficie animada y cascada por el borde del diorama ──
  const waterTex = px.water(seed).texture(true);
  waterTex.repeat.set(2, 2);
  const waterMat = new THREE.MeshStandardMaterial({ map: waterTex, transparent: true, opacity: 0.88, roughness: 0.15, metalness: 0.1, emissive: 0x0a2a3a });
  const waterGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const riverCells: [number, number][] = [];
  for (let i = 0; i < W; i++) for (let j = 0; j < D; j++) if (cell[i][j] === 'river') riverCells.push([i, j]);
  const water = new THREE.InstancedMesh(waterGeo, waterMat, riverCells.length);
  riverCells.forEach(([i, j], n) => water.setMatrixAt(n, new THREE.Matrix4().makeTranslation(wx(i), -0.32, wz(j))));
  water.receiveShadow = true;
  group.add(water);

  const fallTex = px.waterfall(seed).texture(true);
  fallTex.repeat.set(2, 3);
  const fallMat = new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.92 });
  const exit = riverX(D - 1);
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.7), fallMat);
  fall.position.set(wx(exit) + 0.5, -1.65, D / 2 + 0.02);
  group.add(fall);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.6, 20).rotateX(-Math.PI / 2), waterMat);
  pool.position.set(wx(exit) + 0.5, BOTTOM + 0.02, D / 2 + 2.2);
  pool.scale.set(1, 1, 0.6);
  group.add(pool);
  updaters.push((dt) => {
    waterTex.offset.y -= dt * 0.12;
    waterTex.offset.x += dt * 0.02;
    fallTex.offset.y += dt * 0.9;
  });

  // ── Suelo bajo el diorama: bosque desenfocado alrededor ──
  const lowGrass = px.grassTop(seed + 9).texture(true);
  lowGrass.repeat.set(60, 60);
  const low = new THREE.Mesh(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: lowGrass, roughness: 1, color: 0x9aa890 }));
  low.position.y = BOTTOM;
  low.receiveShadow = true;
  group.add(low);

  // ── Árboles ──
  const leafMats = Object.fromEntries(
    Object.entries(px.LEAF_TONES).map(([k, tones], n) => [k, new THREE.MeshStandardMaterial({ map: px.leaves(seed + 20 + n, tones).texture(true), roughness: 0.9, flatShading: true })]),
  ) as Record<keyof typeof px.LEAF_TONES, THREE.MeshStandardMaterial>;
  const barkMat = new THREE.MeshStandardMaterial({ map: px.bark(seed).texture(true), roughness: 1 });
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const cone = new THREE.ConeGeometry(1, 1.4, 7);
  const trunk = new THREE.CylinderGeometry(0.12, 0.18, 1, 6);
  const trees: { obj: THREE.Group; phase: number }[] = [];

  const addTree = (x: number, y: number, z: number, s: number, kind: 'round' | 'pine', leaf: keyof typeof px.LEAF_TONES) => {
    const t = new THREE.Group();
    const tr = new THREE.Mesh(trunk, barkMat);
    tr.scale.set(s, s * (kind === 'pine' ? 1.2 : 1.4), s);
    tr.position.y = (s * (kind === 'pine' ? 1.2 : 1.4)) / 2;
    tr.castShadow = true;
    t.add(tr);
    const crown = new THREE.Group();
    if (kind === 'pine') {
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(cone, leafMats[leaf]);
        const r = (0.95 - k * 0.22) * s;
        c.scale.set(r, s * 0.9, r);
        c.position.y = s * (1.1 + k * 0.62);
        c.castShadow = true;
        c.receiveShadow = true;
        crown.add(c);
      }
    } else {
      const n = 3 + rng.int(0, 2);
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(blob, leafMats[leaf]);
        const r = s * (0.55 + rng.next() * 0.3);
        b.scale.set(r, r * 0.85, r);
        b.position.set((rng.next() - 0.5) * s * 0.9, s * (1.5 + rng.next() * 0.6), (rng.next() - 0.5) * s * 0.9);
        b.castShadow = true;
        b.receiveShadow = true;
        crown.add(b);
      }
    }
    t.add(crown);
    t.position.set(x, y, z);
    t.rotation.y = rng.next() * Math.PI * 2;
    group.add(t);
    trees.push({ obj: crown, phase: rng.next() * 10 });
  };

  // Zona despejada donde acampa el grupo
  const party = new THREE.Vector3(wx(14), 0, wz(11));
  const clear = opts.clearing ?? { x: party.x + 1.2, z: party.z, rx: 1, rz: 1 };
  /** Dentro del claro, con un margen `r` (en el campamento, un círculo). */
  const nearParty = (x: number, z: number, r: number) => {
    const dx = (x - clear.x) / (clear.rx * r);
    const dz = (z - clear.z) / (clear.rz * r);
    return dx * dx + dz * dz < 1;
  };
  const busy = (i: number, j: number) => {
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (cell[i + a]?.[j + b] && cell[i + a][j + b] !== 'grass') return true;
    return false;
  };
  const autumn = (): keyof typeof px.LEAF_TONES => {
    const r = rng.next();
    return r < 0.5 ? 'green' : r < 0.72 ? 'orange' : r < 0.86 ? 'gold' : 'red';
  };
  for (let i = 0; i < W; i++) {
    for (let j = 0; j < D; j++) {
      if (cell[i][j] !== 'grass' || busy(i, j)) continue;
      const x = wx(i) + (rng.next() - 0.5) * 0.5;
      const z = wz(j) + (rng.next() - 0.5) * 0.5;
      if (nearParty(x, z, 4)) continue;
      const back = j <= 4;
      const side = i <= 2 || i >= W - 3;
      const p = back ? 0.45 : side && j < D - 2 ? 0.35 : j >= D - 3 ? 0.03 : 0.08;
      if (!rng.chance(p)) continue;
      const pine = back && rng.chance(0.45);
      addTree(x, height[i][j], z, 0.8 + rng.next() * 0.6, pine ? 'pine' : 'round', pine ? 'pine' : autumn());
    }
  }
  // Fondo: árboles grandes fuera del diorama, que el desenfoque y la niebla suavizan
  for (let k = 0; k < 70; k++) {
    const a = rng.next() * Math.PI * 2;
    const r = 17 + rng.next() * 18;
    const x = Math.cos(a) * r * 1.2;
    const z = Math.sin(a) * r - 4;
    if (z > 6 && Math.abs(x) < 16) continue;
    const pine = rng.chance(0.5);
    addTree(x, BOTTOM, z, 1.6 + rng.next() * 1.6, pine ? 'pine' : 'round', pine ? 'pine' : autumn());
  }

  // ── Vegetación en sprites (instanciada y mecida por el viento) ──
  const veg = (texList: THREE.Texture[], size: number, density: number, filter: (i: number, j: number) => boolean) => {
    for (const t of texList) {
      const mat = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
      swaying(mat, swayUniforms);
      const items: THREE.Matrix4[] = [];
      for (let i = 0; i < W; i++) {
        for (let j = 0; j < D; j++) {
          if (!filter(i, j)) continue;
          const n = Math.floor(density + rng.next());
          for (let k = 0; k < n; k++) {
            const x = wx(i) + (rng.next() - 0.5) * 0.95;
            const z = wz(j) + (rng.next() - 0.5) * 0.95;
            if (nearParty(x, z, 1.6)) continue;
            const s = 0.7 + rng.next() * 0.6;
            items.push(new THREE.Matrix4().compose(new THREE.Vector3(x, height[i][j], z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.next() * Math.PI), new THREE.Vector3(s, s, s)));
          }
        }
      }
      const mesh = new THREE.InstancedMesh(crossQuad(size), mat, items.length);
      items.forEach((mx, n) => mesh.setMatrixAt(n, mx));
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  };
  const isGrass = (i: number, j: number) => cell[i][j] === 'grass';
  veg([px.tuft(seed + 30).texture(), px.tuft(seed + 31).texture()], 0.5, 0.7, isGrass);
  veg([px.fern(seed + 32).texture()], 0.7, 0.18, isGrass);
  veg(
    [px.flowers(seed + 33, 0xf080a8, 0xffe070).texture(), px.flowers(seed + 34, 0xf8f8f0, 0xf0c040).texture(), px.flowers(seed + 35, 0xf0d040, 0xc06020).texture()],
    0.5,
    0.12,
    isGrass,
  );
  // Juncos en las orillas
  veg([px.tuft(seed + 36).texture()], 0.8, 0.5, (i, j) => isGrass(i, j) && (cell[i - 1]?.[j] === 'river' || cell[i + 1]?.[j] === 'river'));

  // ── Piedras y setas ──
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  for (let k = 0; k < 26; k++) {
    const j = rng.int(0, D - 1);
    const i = rng.chance(0.6) ? riverX(j) + (rng.chance(0.5) ? -1 : 2) : rng.int(0, W - 1);
    if (!cell[i]?.[j] || cell[i][j] === 'path') continue;
    const x = wx(i) + (rng.next() - 0.5) * 0.6;
    const z = wz(j) + (rng.next() - 0.5) * 0.6;
    if (nearParty(x, z, 2.5)) continue;
    const r = 0.15 + rng.next() * 0.3;
    const rock = new THREE.Mesh(rockGeo, mats.stone);
    rock.scale.set(r * 1.3, r * 0.8, r);
    rock.position.set(x, height[i][j] + r * 0.3, z);
    rock.rotation.set(rng.next(), rng.next() * 3, rng.next());
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }
  const capTex = (() => {
    const p = new px.Px(8, 8);
    p.rect(0, 0, 8, 8, 0xc8302a);
    for (const [x, y] of [[1, 2], [5, 1], [3, 5], [6, 5]]) p.rect(x, y, 2, 1, 0xf8f0e0);
    return p.texture();
  })();
  const capMat = new THREE.MeshStandardMaterial({ map: capTex, roughness: 0.7, flatShading: true });
  const stemMat = new THREE.MeshStandardMaterial({ color: 0xf0e8d8, roughness: 1 });
  for (let k = 0; k < 14; k++) {
    const i = rng.int(1, W - 2);
    const j = rng.int(1, D - 3);
    if (cell[i][j] !== 'grass') continue;
    const x = wx(i) + (rng.next() - 0.5) * 0.8;
    const z = wz(j) + (rng.next() - 0.5) * 0.8;
    if (nearParty(x, z, 2)) continue;
    const s = 0.6 + rng.next() * 0.8;
    const mush = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 6), stemMat);
    stem.position.y = 0.08;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    cap.position.y = 0.15;
    mush.add(stem, cap);
    mush.scale.setScalar(s);
    mush.position.set(x, height[i][j], z);
    mush.traverse((o) => (o.castShadow = true));
    group.add(mush);
  }

  // ── Puente de tablones sobre el río ──
  const plankMat = new THREE.MeshStandardMaterial({ map: px.bark(seed + 5).texture(), roughness: 1, color: 0xc89060 });
  const bx = wx(riverX(BRIDGE_ROW)) + 0.5;
  const bz = wz(BRIDGE_ROW);
  for (let k = 0; k < 11; k++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 1.05), plankMat);
    plank.position.set(bx - 1.35 + k * 0.27, 0.04 + Math.sin((k / 10) * Math.PI) * 0.18, bz);
    plank.castShadow = true;
    plank.receiveShadow = true;
    group.add(plank);
  }
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), plankMat);
      post.position.set(bx + end * 1.25, 0.27, bz + side * 0.52);
      post.castShadow = true;
      group.add(post);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.06), plankMat);
    rail.position.set(bx, 0.5, bz + side * 0.52);
    rail.castShadow = true;
    group.add(rail);
  }

  // ── Farola junto al puente ──
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.6, metalness: 0.4 });
  const lampPos = new THREE.Vector3(bx + 2.1, 0, bz - 0.8);
  const postMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 0.1), ironMat);
  postMesh.position.set(lampPos.x, 0.9, lampPos.z);
  postMesh.castShadow = true;
  const lampGlow = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.24), new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false }));
  lampGlow.position.set(lampPos.x, 1.85, lampPos.z);
  const lampCap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 4), ironMat);
  lampCap.position.set(lampPos.x, 2.08, lampPos.z);
  lampCap.rotation.y = Math.PI / 4;
  group.add(postMesh, lampGlow, lampCap);
  const lamp = new THREE.PointLight(0xffb060, 0, 9, 1.4);
  lamp.position.set(lampPos.x, 1.85, lampPos.z);
  group.add(lamp);

  // ── Señal de madera en el cruce ──
  const sign = new THREE.Group();
  const sp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), plankMat);
  sp.position.y = 0.45;
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.05), plankMat);
  board.position.set(0.18, 0.75, 0);
  sign.add(sp, board);
  sign.position.set(wx(pathX(BRIDGE_ROW)) - 0.6, 0, bz + 0.7);
  sign.rotation.y = 0.3;
  sign.traverse((o) => (o.castShadow = true));
  if (!nearParty(sign.position.x, sign.position.z, 1.1)) group.add(sign);

  // ── Hoguera del campamento ──
  const firePos = new THREE.Vector3(party.x + 3.6, 0, party.z + 0.3);
  const fire = new THREE.PointLight(0xff8a3a, 0, 8, 1.5);
  let fireBase = 0;
  if (opts.camp) {
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const st = new THREE.Mesh(rockGeo, mats.stone);
    st.scale.set(0.12, 0.08, 0.1);
    st.position.set(firePos.x + Math.cos(a) * 0.3, 0.05, firePos.z + Math.sin(a) * 0.3);
    st.castShadow = true;
    group.add(st);
  }
  for (const a of [0.4, -0.5, 1.6]) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 5), barkMat);
    log.rotation.set(Math.PI / 2 - 0.3, a, 0);
    log.position.set(firePos.x, 0.08, firePos.z);
    group.add(log);
  }
  const flameFrames = [0, 1, 2].map((f) => {
    const p = new px.Px(12, 16);
    const r = new Rng(seed + 50 + f);
    for (let y = 15; y >= 2; y--) {
      const t = (15 - y) / 13;
      const half = Math.round((1 - t) * 5 + r.next() * 1.5);
      for (let x = 6 - half; x <= 5 + half; x++) {
        const core = Math.abs(x - 5.5) < half * 0.45 && t < 0.6;
        p.set(x + (t > 0.5 ? r.int(-1, 1) : 0), y, core ? 0xfff0a0 : t > 0.7 ? 0xd83a1a : 0xff8a2a);
      }
    }
    return p.texture();
  });
  const flameMat = new THREE.MeshBasicMaterial({ map: flameFrames[0], transparent: true, alphaTest: 0.3, toneMapped: false, side: THREE.DoubleSide });
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.75), flameMat);
  flame.position.set(firePos.x, 0.42, firePos.z);
  group.add(flame);
  fire.position.set(firePos.x, 0.7, firePos.z);
  fire.castShadow = true;
  fire.shadow.mapSize.set(512, 512);
  group.add(fire);
  const embers = floaters(24, rng, [0.6, 1.2, 0.6], 0.16);
  embers.position.copy(firePos).add(new THREE.Vector3(0, 0.4, 0));
  (embers.material as THREE.ShaderMaterial).uniforms.uColor.value.set(0xff7a2a);
  group.add(embers);
  let fireT = 0;
  updaters.push((dt, t, cam) => {
    fireT += dt;
    flameMat.map = flameFrames[Math.floor(fireT * 8) % 3];
    flame.rotation.y = Math.atan2(cam.position.x - flame.position.x, cam.position.z - flame.position.z);
    fire.intensity = fireBase * (1 + Math.sin(t * 13) * 0.08 + Math.sin(t * 29) * 0.06);
    (embers.material as THREE.ShaderMaterial).uniforms.uTime.value = t * 3;
  });
  }

  // ── El grupo: los cuatro soldados, en fila y mirando al camino ──
  const roster = ['chaplain', 'archer', 'spearman', 'hero'] as const;
  const sprites = opts.camp
    ? roster.map((k, n) => {
        const s = new PixelSprite(spriteSheet(k).texture(), 1.05);
        s.mesh.position.set(party.x - 1.4 + n * 1.0, 0, party.z + (n % 2) * 0.25);
        group.add(s.mesh);
        return s;
      })
    : [];
  // Sombras que acechan en la linde (solo en la oscuridad)
  const shadeTex = spriteSheet('shade').texture();
  const shades = [
    [wx(11), wz(6)],
    [wx(20), wz(7)],
    [wx(19), wz(13)],
  ].map(([x, z]) => {
    const s = new PixelSprite(shadeTex, 1.15, 1.1);
    s.mesh.position.set(x, 0, z);
    s.mesh.visible = false;
    group.add(s.mesh);
    return s;
  });

  // ── Partículas: polvo de luz y luciérnagas ──
  const motes = floaters(160, rng, [W, 4, D], 0.12);
  motes.position.y = 0.2;
  const fireflies = floaters(60, rng, [W - 4, 2.2, D - 2], 0.3);
  fireflies.position.y = 0.3;
  (fireflies.material as THREE.ShaderMaterial).uniforms.uColor.value.set(0xc8ff70);
  group.add(motes, fireflies);

  // ── Luces ──
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.target.position.set(0, 0, 0);
  group.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbcd7ff, 0x5a4a30, 0.6);
  group.add(hemi);

  return {
    group,
    sun,
    hemi,
    lamp,
    fire,
    lampGlow,
    focus: opts.camp ? party.clone().add(new THREE.Vector3(-2.2, 0.4, -1.2)) : new THREE.Vector3(BATTLE.x, 0.7, BATTLE.z),
    shades,
    motes,
    fireflies,
    update(dt, t, cam) {
      swayUniforms.uTime.value = t;
      fireBase = fire.userData.base ?? 0;
      for (const u of updaters) u(dt, t, cam);
      for (const s of sprites) s.update(dt, cam);
      for (const s of shades) {
        s.update(dt, cam);
        s.mesh.position.y = 0.15 + Math.sin(t * 1.4 + s.mesh.position.x) * 0.12;
      }
      for (const tr of trees) tr.obj.rotation.z = Math.sin(t * 0.8 + tr.phase) * 0.015;
      (motes.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      (fireflies.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    },
  };
}
