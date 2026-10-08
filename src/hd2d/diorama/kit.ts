import * as THREE from 'three';
import { Rng } from '../../core/rng';
import * as px from '../pixel';
import { crossQuad, floaters, swaying } from '../sprite';
import { BOTTOM, Grid, inClear, W, D, wx, wz } from './grid';

type LeafKey = keyof typeof px.LEAF_TONES;
export type TreeKind = 'round' | 'pine' | 'dead' | 'willow';

/** Luz que depende de la hora: farolas y ventanas se encienden de noche; los cristales siempre brillan. */
type LightKind = 'lamp' | 'fire' | 'always';

/**
 * Caja de herramientas para decorar una maqueta: árboles, rocas, casas,
 * ruinas, luces… Todo con texturas de píxeles generadas en código y
 * materiales compartidos. Respeta el claro central salvo que se fuerce.
 */
export class Kit {
  readonly group = new THREE.Group();
  readonly updaters: ((dt: number, t: number, cam: THREE.Camera) => void)[] = [];
  readonly sway = { uTime: { value: 0 } };
  /** Copas de árbol, para mecerlas con el viento. */
  readonly crowns: { obj: THREE.Object3D; phase: number }[] = [];
  /** Puntos con nombre (edificios, etc.) para etiquetas HTML. */
  readonly anchors: Record<string, THREE.Vector3> = {};
  private glows: { mat: THREE.MeshBasicMaterial; color: THREE.Color; kind: LightKind }[] = [];
  private lights: { light: THREE.PointLight; base: number; kind: LightKind }[] = [];
  private tex = new Map<string, THREE.Texture>();
  private mats = new Map<string, THREE.Material>();
  private geos = new Map<string, THREE.BufferGeometry>();
  private fireBase = 0;
  private lampBase = 0;

  constructor(
    readonly grid: Grid,
    readonly rng: Rng,
    readonly seed: number,
  ) {}

  // ───────────────────────── recursos compartidos ─────────────────────────

  texture(key: string, make: () => px.Px, repeat = false) {
    let t = this.tex.get(key);
    if (!t) {
      t = make().texture(repeat);
      this.tex.set(key, t);
    }
    return t;
  }

  /** Material estándar con textura de píxeles (cacheado por clave). */
  mat(key: string, make: () => px.Px, opts: THREE.MeshStandardMaterialParameters = {}) {
    let m = this.mats.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!m) {
      m = new THREE.MeshStandardMaterial({ map: this.texture(key, make, true), roughness: 1, ...opts });
      this.mats.set(key, m);
    }
    return m;
  }

  color(hex: number, opts: THREE.MeshStandardMaterialParameters = {}) {
    const key = `c${hex}${JSON.stringify(opts)}`;
    let m = this.mats.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: hex, roughness: 1, ...opts });
      this.mats.set(key, m);
    }
    return m;
  }

  geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
    let g = this.geos.get(key) as T | undefined;
    if (!g) {
      g = make();
      this.geos.set(key, g);
    }
    return g;
  }

  /** Material que brilla (no le afecta la luz y alimenta el bloom). */
  glow(color: number, kind: LightKind = 'lamp') {
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    this.glows.push({ mat, color: new THREE.Color(color), kind });
    return mat;
  }

  pointLight(x: number, y: number, z: number, color: number, base: number, kind: LightKind, distance = 8) {
    const l = new THREE.PointLight(color, 0, distance, 1.4);
    l.position.set(x, y, z);
    this.group.add(l);
    this.lights.push({ light: l, base, kind });
    return l;
  }

  /** Nivel de farolas (0 de día, ~40 de noche) y de hoguera, desde la hora. */
  setLights(lamp: number, fire: number) {
    this.lampBase = lamp;
    this.fireBase = fire;
    const f = Math.min(1.2, lamp / 40);
    for (const g of this.glows) {
      if (g.kind === 'always') g.mat.color.copy(g.color).multiplyScalar(2.2);
      else if (g.kind === 'fire') g.mat.color.copy(g.color).multiplyScalar(2.5);
      else g.mat.color.copy(g.color).multiplyScalar(0.35 + f * 2.4);
    }
    for (const l of this.lights) {
      if (l.kind === 'lamp') l.light.intensity = l.base * f;
      else if (l.kind === 'always') l.light.intensity = l.base;
    }
  }

  tick(dt: number, t: number, cam: THREE.Camera) {
    this.sway.uTime.value = t;
    for (const u of this.updaters) u(dt, t, cam);
    for (const c of this.crowns) c.obj.rotation.z = Math.sin(t * 0.8 + c.phase) * 0.015;
    for (const l of this.lights) {
      if (l.kind === 'fire') l.light.intensity = this.fireBase * (l.base / 10) * (1 + Math.sin(t * 13 + l.base) * 0.08 + Math.sin(t * 29) * 0.06);
    }
    void this.lampBase;
  }

  // ───────────────────────── utilidades ─────────────────────────

  /** Está libre: dentro del diorama, fuera del claro y del agua. */
  free(x: number, z: number, margin = 1.15) {
    const i = Math.round(x + W / 2 - 0.5);
    const j = Math.round(z + D / 2 - 0.5);
    if (i < 0 || j < 0 || i >= W || j >= D) return true;
    return !inClear(x, z, margin) && !this.grid.isWater(i, j);
  }

  y(x: number, z: number) {
    return this.grid.height(x, z);
  }

  add<T extends THREE.Object3D>(o: T, x: number, z: number, y = this.y(x, z), rot = 0): T {
    o.position.set(x, y, z);
    o.rotation.y = rot;
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    this.group.add(o);
    return o;
  }

  box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(this.geo(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat);
    m.position.set(x, y, z);
    return m;
  }

  /** Prisma triangular (tejado a dos aguas) a lo largo de x. */
  gable(len: number, span: number, rise: number, mat: THREE.Material) {
    const g = this.geo(`gable${len},${span},${rise}`, () => {
      const s = new THREE.Shape();
      s.moveTo(-span / 2, 0);
      s.lineTo(0, rise);
      s.lineTo(span / 2, 0);
      s.closePath();
      const e = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
      e.translate(0, 0, -len / 2);
      e.rotateY(Math.PI / 2);
      return e;
    });
    return new THREE.Mesh(g, mat);
  }

  // ───────────────────────── vegetación ─────────────────────────

  tree(x: number, z: number, s: number, kind: TreeKind, leaf: LeafKey = 'green') {
    const t = new THREE.Group();
    const bark = this.mat('bark', () => px.bark(this.seed));
    const trunkH = s * (kind === 'pine' ? 1.2 : kind === 'dead' ? 2.2 : 1.4);
    const trunk = new THREE.Mesh(this.geo('trunk', () => new THREE.CylinderGeometry(0.12, 0.18, 1, 6)), kind === 'dead' ? this.color(0x3a2e2a) : bark);
    trunk.scale.set(s, trunkH, s);
    trunk.position.y = trunkH / 2;
    t.add(trunk);
    const crown = new THREE.Group();
    const leafMat = this.mat(`leaf-${leaf}`, () => px.leaves(this.seed + leaf.length * 7, px.LEAF_TONES[leaf]), { flatShading: true, roughness: 0.9 });
    if (kind === 'pine') {
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(this.geo('cone', () => new THREE.ConeGeometry(1, 1.4, 7)), leafMat);
        const r = (0.95 - k * 0.22) * s;
        c.scale.set(r, s * 0.9, r);
        c.position.y = s * (1.1 + k * 0.62);
        crown.add(c);
      }
    } else if (kind === 'dead') {
      // Ramas desnudas y retorcidas
      const branch = this.color(0x2e2422);
      for (let k = 0; k < 5; k++) {
        const b = new THREE.Mesh(this.geo('branch', () => new THREE.CylinderGeometry(0.03, 0.07, 1, 4)), branch);
        const a = this.rng.next() * Math.PI * 2;
        const len = s * (0.6 + this.rng.next() * 0.6);
        b.scale.set(s, len, s);
        b.position.set(Math.cos(a) * 0.25 * s, trunkH * (0.55 + k * 0.08), Math.sin(a) * 0.25 * s);
        b.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
        crown.add(b);
      }
    } else {
      const n = 3 + this.rng.int(0, 2);
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(this.geo('blob', () => new THREE.IcosahedronGeometry(1, 1)), leafMat);
        const r = s * (0.55 + this.rng.next() * 0.3);
        const droop = kind === 'willow' ? 1.35 : 0.85;
        b.scale.set(r, r * droop, r);
        b.position.set((this.rng.next() - 0.5) * s * 0.9, s * (kind === 'willow' ? 1.3 : 1.5 + this.rng.next() * 0.6), (this.rng.next() - 0.5) * s * 0.9);
        crown.add(b);
      }
    }
    t.add(crown);
    this.crowns.push({ obj: crown, phase: this.rng.next() * 10 });
    return this.add(t, x, z, this.y(x, z), this.rng.next() * Math.PI * 2);
  }

  /** Hierba, flores, helechos o juncos instanciados, en las celdas que cumplan el filtro. */
  scatter(textures: THREE.Texture[], size: number, density: number, filter: (i: number, j: number) => boolean, tint = 0xffffff) {
    for (const t of textures) {
      const mat = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, color: tint });
      swaying(mat, this.sway);
      const items: THREE.Matrix4[] = [];
      this.grid.each((i, j) => {
        if (!filter(i, j)) return;
        const n = Math.floor(density + this.rng.next());
        for (let k = 0; k < n; k++) {
          const x = wx(i) + (this.rng.next() - 0.5) * 0.95;
          const z = wz(j) + (this.rng.next() - 0.5) * 0.95;
          if (inClear(x, z, 0.95)) continue;
          const s = 0.7 + this.rng.next() * 0.6;
          items.push(new THREE.Matrix4().compose(new THREE.Vector3(x, this.grid.at(i, j)!.h, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng.next() * Math.PI), new THREE.Vector3(s, s, s)));
        }
      });
      if (!items.length) continue;
      const mesh = new THREE.InstancedMesh(crossQuad(size), mat, items.length);
      items.forEach((mx, n) => mesh.setMatrixAt(n, mx));
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  rock(x: number, z: number, r: number, tones?: number[], snowy = false) {
    const m = new THREE.Mesh(this.geo('dodeca', () => new THREE.DodecahedronGeometry(1, 0)), tones ? this.mat(`stone${tones[0]}`, () => px.stone(this.seed + 4, tones)) : this.mat('stone', () => px.stone(this.seed + 4)));
    m.scale.set(r * 1.3, r * 0.8, r);
    m.rotation.set(this.rng.next() * 0.4, this.rng.next() * 3, this.rng.next() * 0.4);
    if (snowy) {
      // Gorro de nieve: la misma piedra, aplastada y algo más ancha por arriba.
      const cap = new THREE.Mesh(this.geo('dodeca', () => new THREE.DodecahedronGeometry(1, 0)), this.mat('snow', () => px.snow(this.seed + 6)));
      cap.scale.set(0.8, 0.3, 0.8);
      cap.position.y = 0.72;
      m.add(cap);
    }
    return this.add(m, x, z, this.y(x, z) + r * 0.3);
  }

  mushroom(x: number, z: number, s: number) {
    const g = new THREE.Group();
    const cap = this.mat('cap', () => {
      const p = new px.Px(8, 8);
      p.rect(0, 0, 8, 8, 0xc8302a);
      for (const [a, b] of [[1, 2], [5, 1], [3, 5], [6, 5]]) p.rect(a, b, 2, 1, 0xf8f0e0);
      return p;
    }, { flatShading: true, roughness: 0.7 });
    const stem = new THREE.Mesh(this.geo('stem', () => new THREE.CylinderGeometry(0.04, 0.05, 0.16, 6)), this.color(0xf0e8d8));
    stem.position.y = 0.08;
    const top = new THREE.Mesh(this.geo('capgeo', () => new THREE.SphereGeometry(0.12, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2)), cap);
    top.position.y = 0.15;
    g.add(stem, top);
    g.scale.setScalar(s);
    return this.add(g, x, z);
  }

  // ───────────────────────── objetos de camino ─────────────────────────

  lamp(x: number, z: number) {
    const iron = this.color(0x2a2a30, { roughness: 0.6, metalness: 0.4 });
    const g = new THREE.Group();
    g.add(this.box(0.1, 1.8, 0.1, iron, 0, 0.9, 0));
    g.add(this.box(0.24, 0.3, 0.24, this.glow(0xffc070, 'lamp'), 0, 1.85, 0));
    const cap = new THREE.Mesh(this.geo('lampcap', () => new THREE.ConeGeometry(0.22, 0.16, 4)), iron);
    cap.position.y = 2.08;
    cap.rotation.y = Math.PI / 4;
    g.add(cap);
    this.add(g, x, z);
    this.pointLight(x, this.y(x, z) + 1.85, z, 0xffb060, 40, 'lamp', 9);
    return g;
  }

  sign(x: number, z: number, rot = 0.3) {
    const wood = this.mat('planks', () => px.planks(this.seed));
    const g = new THREE.Group();
    g.add(this.box(0.08, 0.9, 0.08, wood, 0, 0.45, 0));
    g.add(this.box(0.6, 0.2, 0.05, wood, 0.18, 0.75, 0));
    return this.add(g, x, z, this.y(x, z), rot);
  }

  fence(x0: number, z0: number, x1: number, z1: number) {
    const wood = this.mat('planks', () => px.planks(this.seed));
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(2, Math.round(len / 0.6) + 1);
    const g = new THREE.Group();
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      g.add(this.box(0.08, 0.5, 0.08, wood, (x1 - x0) * t, 0.25, (z1 - z0) * t));
    }
    const ang = Math.atan2(z1 - z0, x1 - x0);
    for (const h of [0.2, 0.4]) {
      const rail = this.box(len, 0.05, 0.04, wood, (x1 - x0) / 2, h, (z1 - z0) / 2);
      rail.rotation.y = -ang;
      g.add(rail);
    }
    return this.add(g, x0, z0);
  }

  bridge(x: number, z: number, span = 2.6) {
    const wood = this.mat('planks-bridge', () => px.planks(this.seed + 5, [0x9a6a40, 0xa8784a, 0xb48454, 0x6a4428]));
    const g = new THREE.Group();
    const n = Math.round(span / 0.25);
    for (let k = 0; k < n; k++) g.add(this.box(0.2, 0.08, 1.05, wood, -span / 2 + 0.12 + k * (span / n), 0.04 + Math.sin((k / (n - 1)) * Math.PI) * 0.18, 0));
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) g.add(this.box(0.1, 0.55, 0.1, wood, end * (span / 2 - 0.05), 0.27, side * 0.52));
      g.add(this.box(span, 0.06, 0.06, wood, 0, 0.5, side * 0.52));
    }
    return this.add(g, x, z, 0);
  }

  barrel(x: number, z: number) {
    const m = new THREE.Mesh(this.geo('barrel', () => new THREE.CylinderGeometry(0.2, 0.18, 0.5, 8)), this.mat('planks', () => px.planks(this.seed)));
    m.position.y = 0.25;
    const g = new THREE.Group();
    g.add(m);
    return this.add(g, x, z);
  }

  crate(x: number, z: number, s = 0.4) {
    const g = new THREE.Group();
    g.add(this.box(s, s, s, this.mat('planks', () => px.planks(this.seed)), 0, s / 2, 0));
    return this.add(g, x, z, this.y(x, z), this.rng.next());
  }

  haystack(x: number, z: number) {
    const m = new THREE.Mesh(this.geo('hay', () => new THREE.SphereGeometry(0.5, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2)), this.mat('thatch', () => px.thatch(this.seed), { flatShading: true }));
    const g = new THREE.Group();
    g.add(m);
    g.scale.set(1, 1.2, 1);
    return this.add(g, x, z);
  }

  // ───────────────────────── aldea y castillo ─────────────────────────

  /** Casa de entramado con tejado a dos aguas, puerta y ventanas que se encienden de noche. */
  house(x: number, z: number, w: number, d: number, h: number, rot = 0, opts: { roof?: 'tile' | 'thatch' | 'slate'; walls?: 'plaster' | 'stone' | 'wood'; chimney?: boolean } = {}) {
    const walls =
      opts.walls === 'stone' ? this.mat('bricks', () => px.bricks(this.seed)) : opts.walls === 'wood' ? this.mat('planks', () => px.planks(this.seed)) : this.mat('plaster', () => px.plaster(this.seed));
    const roofMat =
      opts.roof === 'thatch'
        ? this.mat('thatch', () => px.thatch(this.seed))
        : opts.roof === 'slate'
          ? this.mat('slate', () => px.roof(this.seed + 2, [0x4a4a5a, 0x56566a, 0x62627a, 0x34343e]))
          : this.mat('roof', () => px.roof(this.seed));
    const g = new THREE.Group();
    g.add(this.box(w, h, d, walls, 0, h / 2, 0));
    const roof = this.gable(w + 0.3, d + 0.35, d * 0.6, roofMat);
    roof.position.y = h;
    g.add(roof);
    g.add(this.box(0.32, 0.55, 0.06, this.color(0x3a2414), 0, 0.28, d / 2 + 0.01));
    const win = this.glow(0xffc070, 'lamp');
    for (const wxp of [-w / 2 + 0.3, w / 2 - 0.3]) if (w > 0.9) g.add(this.box(0.22, 0.26, 0.05, win, wxp, h * 0.62, d / 2 + 0.01));
    if (h > 1.2) g.add(this.box(0.22, 0.26, 0.05, win, 0, h * 0.85, d / 2 + 0.01));
    if (opts.chimney) g.add(this.box(0.25, 0.7, 0.25, this.mat('bricks', () => px.bricks(this.seed)), w * 0.25, h + d * 0.45, 0));
    return this.add(g, x, z, this.y(x, z), rot);
  }

  well(x: number, z: number) {
    const stone = this.mat('bricks', () => px.bricks(this.seed));
    const wood = this.mat('planks', () => px.planks(this.seed));
    const g = new THREE.Group();
    const ring = new THREE.Mesh(this.geo('wellring', () => new THREE.CylinderGeometry(0.42, 0.45, 0.5, 10, 1, true)), stone);
    ring.position.y = 0.25;
    (ring.material as THREE.Material).side = THREE.DoubleSide;
    g.add(ring);
    const water = new THREE.Mesh(this.geo('wellwater', () => new THREE.CircleGeometry(0.38, 10).rotateX(-Math.PI / 2)), this.color(0x1a3a4a));
    water.position.y = 0.3;
    g.add(water);
    for (const s of [-1, 1]) g.add(this.box(0.08, 0.9, 0.08, wood, s * 0.38, 0.7, 0));
    const roof = this.gable(1.0, 0.9, 0.35, this.mat('roof', () => px.roof(this.seed)));
    roof.position.y = 1.12;
    g.add(roof);
    return this.add(g, x, z);
  }

  stall(x: number, z: number, stripe: number) {
    const wood = this.mat('planks', () => px.planks(this.seed));
    const cloth = this.mat(`awning${stripe}`, () => {
      const p = new px.Px(16, 16);
      for (let i = 0; i < 16; i++) p.rect(i, 0, 1, 16, Math.floor(i / 2) % 2 ? stripe : 0xf4ecd8);
      return p;
    });
    const g = new THREE.Group();
    g.add(this.box(1.2, 0.5, 0.6, wood, 0, 0.25, 0));
    for (const sx of [-0.55, 0.55]) g.add(this.box(0.06, 1.1, 0.06, wood, sx, 0.55, -0.25));
    const awning = this.box(1.35, 0.06, 0.8, cloth, 0, 1.1, 0.05);
    awning.rotation.x = 0.25;
    g.add(awning);
    for (let k = 0; k < 4; k++) g.add(this.box(0.16, 0.12, 0.16, this.color([0xd8642a, 0xe8c040, 0x6aa040, 0xb83a3a][k]), -0.4 + k * 0.27, 0.56, 0));
    return this.add(g, x, z, this.y(x, z), this.rng.next() * 0.3 - 0.15);
  }

  banner(x: number, z: number, h: number, color: number) {
    const g = new THREE.Group();
    g.add(this.box(0.06, h, 0.06, this.color(0x2a2a30), 0, h / 2, 0));
    const cloth = this.box(0.45, 0.8, 0.03, this.color(color, { side: THREE.DoubleSide }), 0.25, h - 0.5, 0);
    g.add(cloth);
    g.add(this.box(0.14, 0.14, 0.035, this.color(0xd9a93a), 0.25, h - 0.45, 0));
    return this.add(g, x, z);
  }

  castleTower(x: number, z: number, r: number, h: number, roofColor = 0x3a4a7a) {
    const stone = this.mat('bricks', () => px.bricks(this.seed));
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.geo(`tower${r},${h}`, () => new THREE.CylinderGeometry(r, r * 1.08, h, 10)), stone);
    body.position.y = h / 2;
    g.add(body);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      g.add(this.box(0.25, 0.3, 0.25, stone, Math.cos(a) * r * 0.95, h + 0.15, Math.sin(a) * r * 0.95));
    }
    const roof = new THREE.Mesh(this.geo(`troof${r}`, () => new THREE.ConeGeometry(r * 1.15, r * 1.8, 10)), this.color(roofColor, { flatShading: true }));
    roof.position.y = h + 0.3 + r * 0.9;
    g.add(roof);
    g.add(this.box(0.18, 0.3, 0.05, this.glow(0xffc070, 'lamp'), 0, h * 0.7, r + 0.01));
    return this.add(g, x, z);
  }

  // ───────────────────────── ruinas y lugares sagrados ─────────────────────────

  column(x: number, z: number, h: number, broken = false) {
    const stone = this.mat('bricks-old', () => px.bricks(this.seed + 6, [0xa09a88, 0xb0aa98, 0xbcb6a4, 0x7a7466]));
    const g = new THREE.Group();
    g.add(this.box(0.6, 0.18, 0.6, stone, 0, 0.09, 0));
    const shaft = new THREE.Mesh(this.geo(`col${h}`, () => new THREE.CylinderGeometry(0.2, 0.22, h, 8)), stone);
    shaft.position.y = 0.18 + h / 2;
    g.add(shaft);
    if (!broken) g.add(this.box(0.55, 0.16, 0.55, stone, 0, 0.18 + h + 0.08, 0));
    else shaft.rotation.z = (this.rng.next() - 0.5) * 0.12;
    return this.add(g, x, z);
  }

  arch(x: number, z: number, span: number, h: number) {
    const stone = this.mat('bricks-old', () => px.bricks(this.seed + 6, [0xa09a88, 0xb0aa98, 0xbcb6a4, 0x7a7466]));
    const g = new THREE.Group();
    for (const s of [-1, 1]) g.add(this.box(0.5, h, 0.5, stone, (s * span) / 2, h / 2, 0));
    // Arco de dovelas
    const n = 7;
    for (let k = 0; k < n; k++) {
      const a = Math.PI * (k / (n - 1));
      const b = this.box(0.45, 0.35, 0.5, stone, (-Math.cos(a) * span) / 2, h + Math.sin(a) * span * 0.45, 0);
      b.rotation.z = a - Math.PI / 2;
      if (k === 2 && this.rng.chance(0.5)) continue;
      g.add(b);
    }
    return this.add(g, x, z);
  }

  wall(x: number, z: number, len: number, h: number, rot = 0, broken = true) {
    const stone = this.mat('bricks-old', () => px.bricks(this.seed + 6, [0xa09a88, 0xb0aa98, 0xbcb6a4, 0x7a7466]));
    const g = new THREE.Group();
    const n = Math.round(len / 0.5);
    for (let k = 0; k < n; k++) {
      const hh = broken ? h * (0.35 + this.rng.next() * 0.65) : h;
      g.add(this.box(0.5, hh, 0.4, stone, -len / 2 + 0.25 + k * 0.5, hh / 2, 0));
    }
    return this.add(g, x, z, this.y(x, z), rot);
  }

  rubble(x: number, z: number) {
    const stone = this.mat('bricks-old', () => px.bricks(this.seed + 6, [0xa09a88, 0xb0aa98, 0xbcb6a4, 0x7a7466]));
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const b = this.box(0.3, 0.2, 0.25, stone, (this.rng.next() - 0.5) * 0.7, 0.1, (this.rng.next() - 0.5) * 0.5);
      b.rotation.set(this.rng.next() * 0.4, this.rng.next() * 3, 0);
      g.add(b);
    }
    return this.add(g, x, z);
  }

  menhir(x: number, z: number, h: number) {
    const g = new THREE.Group();
    const m = this.box(0.45, h, 0.3, this.mat('rock', () => px.rock(this.seed)), 0, h / 2, 0);
    m.rotation.z = (this.rng.next() - 0.5) * 0.15;
    g.add(m);
    if (this.rng.chance(0.5)) g.add(this.box(0.08, 0.3, 0.02, this.glow(0x9adcff, 'always'), 0, h * 0.6, 0.16));
    return this.add(g, x, z, this.y(x, z), this.rng.next() * 0.6);
  }

  candle(x: number, z: number) {
    const g = new THREE.Group();
    g.add(this.box(0.06, 0.18, 0.06, this.color(0xf0e8d0), 0, 0.09, 0));
    g.add(this.box(0.04, 0.06, 0.04, this.glow(0xffb050, 'fire'), 0, 0.21, 0));
    return this.add(g, x, z);
  }

  chapel(x: number, z: number) {
    const stone = this.mat('bricks', () => px.bricks(this.seed));
    const slate = this.mat('slate', () => px.roof(this.seed + 2, [0x4a4a5a, 0x56566a, 0x62627a, 0x34343e]));
    const g = new THREE.Group();
    g.add(this.box(2.2, 1.7, 1.6, stone, 0, 0.85, 0));
    const roof = this.gable(2.4, 1.9, 1.1, slate);
    roof.position.y = 1.7;
    g.add(roof);
    // Campanario y cruz
    g.add(this.box(0.6, 1.2, 0.6, stone, -0.7, 2.3, 0));
    const spire = new THREE.Mesh(this.geo('chapelspire', () => new THREE.ConeGeometry(0.45, 0.8, 4)), slate);
    spire.position.set(-0.7, 3.3, 0);
    spire.rotation.y = Math.PI / 4;
    g.add(spire);
    g.add(this.box(0.06, 0.45, 0.06, this.color(0xd9a93a), -0.7, 3.9, 0));
    g.add(this.box(0.25, 0.06, 0.06, this.color(0xd9a93a), -0.7, 3.95, 0));
    // Puerta en arco iluminada y vidriera
    g.add(this.box(0.5, 0.8, 0.05, this.glow(0xffd890, 'lamp'), 0.3, 0.4, 0.81));
    g.add(this.box(0.3, 0.4, 0.05, this.glow(0xa8d0ff, 'always'), 0.3, 1.3, 0.81));
    this.add(g, x, z);
    this.pointLight(x + 0.3, this.y(x, z) + 0.8, z + 1.2, 0xffd890, 25, 'lamp', 7);
    return g;
  }

  // ───────────────────────── oscuridad ─────────────────────────

  stake(x: number, z: number, h: number) {
    const m = new THREE.Mesh(this.geo('stake', () => new THREE.ConeGeometry(0.07, 1, 5)), this.color(0x2a2024));
    m.scale.y = h;
    m.position.y = h / 2;
    m.rotation.z = (this.rng.next() - 0.5) * 0.4;
    const g = new THREE.Group();
    g.add(m);
    return this.add(g, x, z);
  }

  bones(x: number, z: number) {
    const bone = this.color(0xe8dcc0);
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const b = this.box(0.35, 0.05, 0.05, bone, (this.rng.next() - 0.5) * 0.4, 0.03, (this.rng.next() - 0.5) * 0.3);
      b.rotation.y = this.rng.next() * 3;
      g.add(b);
    }
    const skull = new THREE.Mesh(this.geo('skull', () => new THREE.IcosahedronGeometry(0.1, 0)), bone);
    skull.position.set(0.1, 0.08, 0.05);
    g.add(skull);
    return this.add(g, x, z);
  }

  crystal(x: number, z: number, s: number, color = 0xff3a5a) {
    const g = new THREE.Group();
    const mat = this.glow(color, 'always');
    for (let k = 0; k < 3; k++) {
      const c = new THREE.Mesh(this.geo('crystal', () => new THREE.OctahedronGeometry(0.2, 0)), mat);
      c.scale.set(s * 0.6, s * (1.2 + this.rng.next()), s * 0.6);
      c.position.set((this.rng.next() - 0.5) * 0.3 * s, 0.2 * s, (this.rng.next() - 0.5) * 0.3 * s);
      c.rotation.z = (this.rng.next() - 0.5) * 0.6;
      g.add(c);
    }
    this.add(g, x, z);
    g.traverse((o) => (o.castShadow = false));
    return g;
  }

  /** Torre del Heraldo: piedra negra que se estrecha, púas y ventanas rojas. */
  spire(x: number, z: number) {
    const dark = this.mat('bricks-dark', () => px.bricks(this.seed + 9, [0x2e2638, 0x3a3046, 0x463a54, 0x1a1420]));
    const g = new THREE.Group();
    let y = 0;
    for (const [w, h] of [[2.4, 2.2], [1.8, 2.0], [1.2, 1.8]] as const) {
      g.add(this.box(w, h, w, dark, 0, y + h / 2, 0));
      for (const s of [-1, 1]) {
        const spike = new THREE.Mesh(this.geo('spike', () => new THREE.ConeGeometry(0.12, 0.7, 4)), this.color(0x1a1420));
        spike.position.set((s * w) / 2, y + h, w / 2);
        spike.rotation.z = -s * 0.5;
        g.add(spike);
      }
      g.add(this.box(0.2, 0.5, 0.05, this.glow(0xff2a3a, 'always'), 0, y + h * 0.55, w / 2 + 0.01));
      y += h;
    }
    const top = new THREE.Mesh(this.geo('spiretop', () => new THREE.ConeGeometry(0.9, 2.2, 4)), dark);
    top.position.y = y + 1.1;
    top.rotation.y = Math.PI / 4;
    g.add(top);
    this.add(g, x, z);
    this.pointLight(x, y * 0.5, z + 1.8, 0xff3a4a, 14, 'always', 9);
    return g;
  }

  /** Boca del cubil: un montículo de roca con una abertura negra y ojos rojos. */
  cave(x: number, z: number) {
    const g = new THREE.Group();
    const mound = new THREE.Mesh(this.geo('mound', () => new THREE.IcosahedronGeometry(1, 1)), this.mat('rock-dark', () => px.rock(this.seed + 3, [0x3a3238, 0x463c44, 0x524650, 0x2a2228]), { flatShading: true }));
    mound.scale.set(3, 1.9, 2);
    mound.position.y = 0.6;
    g.add(mound);
    const mouth = new THREE.Mesh(this.geo('mouth', () => new THREE.CircleGeometry(0.9, 12, 0, Math.PI)), this.color(0x050308));
    mouth.position.set(0, 0.05, 1.93);
    g.add(mouth);
    for (const s of [-1, 1]) g.add(this.box(0.1, 0.06, 0.02, this.glow(0xff3a2a, 'always'), s * 0.18, 0.5, 1.95));
    this.add(g, x, z);
    this.pointLight(x, 0.6, z + 2.4, 0xff4a3a, 8, 'always', 6);
    return g;
  }

  lily(x: number, z: number) {
    const m = new THREE.Mesh(this.geo('lily', () => new THREE.CircleGeometry(0.18, 7).rotateX(-Math.PI / 2)), this.color(0x3a6a2a));
    const g = new THREE.Group();
    g.add(m);
    if (this.rng.chance(0.4)) g.add(this.box(0.06, 0.05, 0.06, this.color(0xf0d0e0), 0.05, 0.03, 0));
    return this.add(g, x, z, -0.3);
  }

  boardwalk(x0: number, z0: number, x1: number, z1: number) {
    const wood = this.mat('planks', () => px.planks(this.seed));
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.Group();
    const n = Math.round(len / 0.3);
    const ang = Math.atan2(z1 - z0, x1 - x0);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const p = this.box(0.24, 0.06, 0.8, wood, (x1 - x0) * t, 0.05 + (this.rng.next() - 0.5) * 0.03, (z1 - z0) * t);
      p.rotation.y = -ang;
      g.add(p);
    }
    return this.add(g, x0, z0, 0);
  }

  // ───────────────────────── montaña ─────────────────────────

  /** Cordillera lejana detrás de la maqueta: picos de roca con la cumbre nevada. */
  peaks(n: number) {
    const rock = this.color(0x4a5060, { flatShading: true });
    const snow = this.color(0xf2f6ff, { flatShading: true });
    for (let k = 0; k < n; k++) {
      const x = -40 + (k / (n - 1)) * 80 + (this.rng.next() - 0.5) * 6;
      const z = -19 - this.rng.next() * 8 - (Math.abs(x) < 12 ? 3 : 0);
      const h = 15 + this.rng.next() * 12 + (Math.abs(x) < 20 ? 5 : 0);
      const r = h * (0.5 + this.rng.next() * 0.25);
      const seg = this.rng.int(5, 7);
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg, 1), rock);
      body.position.y = h / 2;
      // La cumbre: el mismo cono a escala, un pelo más ancho para no parpadear.
      const capH = h * (0.28 + this.rng.next() * 0.12);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * (capH / h) * 1.03, capH, seg, 1), snow);
      cap.position.y = h - capH / 2 + 0.02;
      g.add(body, cap);
      g.rotation.y = this.rng.next() * Math.PI;
      g.position.set(x, BOTTOM, z);
      this.group.add(g);
    }
  }

  /** Cascada que cae por una pared hasta su poza, con espuma y rocío. */
  cascade(x: number, z: number, top: number, width = 1.6) {
    const tex = px.waterfall(this.seed + 12).texture(true);
    tex.repeat.set(width / 1.2, (top + 0.3) / 2.2);
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0.92, roughness: 0.2, emissive: 0x2a4a5a, emissiveMap: tex, emissiveIntensity: 0.6 });
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(width, top + 0.3), mat);
    fall.position.set(x, (top - 0.3) / 2, z);
    this.group.add(fall);
    // Labio de espuma arriba y abajo
    const foam = this.color(0xf0faff, { emissive: 0x6a8a9a });
    this.add(this.box(width + 0.1, 0.1, 0.18, foam), x, z - 0.05, top - 0.02);
    const spray = floaters(40, this.rng, [width + 1.2, 0.9, 1.2], 0.14, 0xe8f8ff);
    spray.position.set(x, -0.2, z + 0.6);
    this.group.add(spray);
    this.updaters.push((dt, t) => {
      tex.offset.y += dt * 1.1;
      (spray.material as THREE.ShaderMaterial).uniforms.uTime.value = t * 2.5;
    });
  }

  /** Lobo de piedra sentado sobre un pedestal, con ojos que brillan de noche. */
  wolfStatue(x: number, z: number, rot = 0, scale = 1) {
    const stone = this.mat('bricks-old', () => px.bricks(this.seed + 6, [0xa09a88, 0xb0aa98, 0xbcb6a4, 0x7a7466]));
    const carved = this.color(0x9a968c, { flatShading: true });
    const g = new THREE.Group();
    g.add(this.box(0.9, 0.5, 0.9, stone, 0, 0.25, 0));
    const wolf = new THREE.Group();
    wolf.position.y = 0.5;
    wolf.add(this.box(0.5, 0.42, 0.62, carved, 0, 0.21, -0.05)); // ancas
    const chest = this.box(0.38, 0.62, 0.34, carved, 0, 0.5, 0.18);
    chest.rotation.x = -0.25;
    wolf.add(chest);
    for (const s of [-1, 1]) wolf.add(this.box(0.1, 0.42, 0.1, carved, s * 0.12, 0.21, 0.3)); // patas
    wolf.add(this.box(0.3, 0.28, 0.3, carved, 0, 0.92, 0.28)); // cabeza
    wolf.add(this.box(0.16, 0.14, 0.24, carved, 0, 0.86, 0.5)); // hocico
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(this.geo('wolfear', () => new THREE.ConeGeometry(0.07, 0.2, 4)), carved);
      ear.position.set(s * 0.1, 1.14, 0.24);
      wolf.add(ear);
      wolf.add(this.box(0.05, 0.04, 0.02, this.glow(0x8ad8ff, 'lamp'), s * 0.08, 0.96, 0.44));
    }
    const tail = this.box(0.1, 0.1, 0.45, carved, 0.18, 0.08, -0.4);
    tail.rotation.y = 0.5;
    wolf.add(tail);
    g.add(wolf);
    g.scale.setScalar(scale);
    return this.add(g, x, z, this.y(x, z), rot);
  }

  /** Brasero de hierro sobre trípode, con fuego que alumbra. */
  brazier(x: number, z: number, h = 0.9) {
    const iron = this.color(0x2a2a30, { roughness: 0.6, metalness: 0.4 });
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const leg = this.box(0.05, h, 0.05, iron, Math.cos(a) * 0.14, h / 2, Math.sin(a) * 0.14);
      leg.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2);
      g.add(leg);
    }
    const bowl = new THREE.Mesh(this.geo('bowl', () => new THREE.CylinderGeometry(0.26, 0.14, 0.2, 8)), iron);
    bowl.position.y = h;
    g.add(bowl);
    g.add(this.box(0.3, 0.14, 0.3, this.glow(0xff8a2a, 'fire'), 0, h + 0.12, 0));
    this.add(g, x, z);
    const y = this.y(x, z) + h + 0.4;
    this.pointLight(x, y, z, 0xff8a3a, 6, 'fire', 6);
    const embers = floaters(10, this.rng, [0.4, 1, 0.4], 0.12, 0xff7a2a);
    embers.position.set(x, y - 0.2, z);
    this.group.add(embers);
    this.updaters.push((_dt, t) => ((embers.material as THREE.ShaderMaterial).uniforms.uTime.value = t * 3));
    return g;
  }

  /** Guirnalda de banderines colgando entre dos puntos. */
  bunting(a: THREE.Vector3, b: THREE.Vector3, colors: number[], sag = 0.5) {
    const n = Math.max(4, Math.round(a.distanceTo(b) / 0.42));
    const rope: THREE.Vector3[] = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      rope.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * sag, 0)));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(rope), new THREE.LineBasicMaterial({ color: 0x3a2a1a }));
    this.group.add(line);
    const geo = this.geo('pennant', () => new THREE.PlaneGeometry(0.26, 0.26).translate(0, -0.13, 0));
    const flags: THREE.Mesh[] = [];
    for (let k = 1; k < n; k++) {
      const c = colors[k % colors.length];
      const mat = this.mat(`pennant${c}`, () => px.pennant(c, 0xf4ecd8), { side: THREE.DoubleSide, alphaTest: 0.5 });
      const f = new THREE.Mesh(geo, mat);
      f.position.copy(rope[k]);
      // Primero se mece sobre la cuerda (x local) y luego se orienta con ella (y).
      f.rotation.order = 'YXZ';
      f.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
      f.castShadow = true;
      this.group.add(f);
      flags.push(f);
    }
    this.updaters.push((_dt, t) => flags.forEach((f, k) => (f.rotation.x = Math.sin(t * 2.2 + k * 0.8) * 0.35)));
  }

  // ───────────────────────── marjal ─────────────────────────

  /** Árbol muerto del que cuelga musgo en hebras. */
  mossTree(x: number, z: number, s: number) {
    const t = this.tree(x, z, s, this.rng.chance(0.5) ? 'dead' : 'willow', 'green');
    const moss = this.mat('moss', () => px.moss(this.seed + 40), { side: THREE.DoubleSide, alphaTest: 0.5 });
    const h = s * 2.2;
    for (let k = 0; k < 5; k++) {
      const len = s * (0.7 + this.rng.next() * 0.6);
      const strand = new THREE.Mesh(this.geo('mossquad', () => crossQuad(1).translate(0, -1, 0)), moss);
      strand.scale.set(s * 0.5, len, s * 0.5);
      const a = this.rng.next() * Math.PI * 2;
      strand.position.set(Math.cos(a) * s * 0.45, h * (0.75 + this.rng.next() * 0.25), Math.sin(a) * s * 0.45);
      t.add(strand);
    }
    return t;
  }

  /** Corro de setas que brillan en la penumbra. */
  glowShrooms(x: number, z: number, color = 0x5af0c8) {
    const g = new THREE.Group();
    const stem = this.color(0xd8e8d0);
    const cap = this.glow(color, 'always');
    const n = this.rng.int(3, 5);
    for (let k = 0; k < n; k++) {
      const s = 0.5 + this.rng.next() * 0.8;
      const ox = (this.rng.next() - 0.5) * 0.5;
      const oz = (this.rng.next() - 0.5) * 0.4;
      g.add(this.box(0.04 * s, 0.18 * s, 0.04 * s, stem, ox, 0.09 * s, oz));
      const c = new THREE.Mesh(this.geo('capgeo', () => new THREE.SphereGeometry(0.12, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2)), cap);
      c.scale.setScalar(s);
      c.position.set(ox, 0.17 * s, oz);
      g.add(c);
    }
    this.add(g, x, z);
    g.traverse((o) => (o.castShadow = false));
    this.pointLight(x, this.y(x, z) + 0.4, z, color, 6, 'lamp', 3.5);
    return g;
  }

  /** Farol de marjal: un palo torcido con un farolillo colgando. */
  bogLantern(x: number, z: number) {
    const wood = this.color(0x3a2e24);
    const g = new THREE.Group();
    const pole = this.box(0.08, 1.7, 0.08, wood, 0, 0.85, 0);
    pole.rotation.z = 0.08;
    g.add(pole);
    g.add(this.box(0.5, 0.06, 0.06, wood, 0.22, 1.66, 0));
    g.add(this.box(0.02, 0.18, 0.02, wood, 0.42, 1.54, 0));
    g.add(this.box(0.16, 0.2, 0.16, this.glow(0xd8f070, 'lamp'), 0.42, 1.36, 0));
    this.add(g, x, z);
    this.pointLight(x + 0.42, this.y(x, z) + 1.3, z, 0xc8f070, 22, 'lamp', 6);
    return g;
  }

  /** Choza sobre pilotes, con escalera y ventana encendida. */
  stiltHut(x: number, z: number, rot = 0) {
    const wood = this.mat('planks', () => px.planks(this.seed));
    const dark = this.color(0x3a2e24);
    const g = new THREE.Group();
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(this.box(0.1, 1.5, 0.1, dark, sx * 0.75, 0.45, sz * 0.6));
    g.add(this.box(1.9, 0.1, 1.6, wood, 0, 1.2, 0.1));
    g.add(this.box(1.4, 1.0, 1.1, wood, 0, 1.75, -0.05));
    const roof = this.gable(1.7, 1.5, 0.7, this.mat('thatch', () => px.thatch(this.seed)));
    roof.position.y = 2.25;
    g.add(roof);
    g.add(this.box(0.3, 0.5, 0.05, this.color(0x1e1610), -0.3, 1.5, 0.51));
    g.add(this.box(0.24, 0.22, 0.05, this.glow(0xffc070, 'lamp'), 0.35, 1.8, 0.51));
    // Escalera hasta el agua
    for (const sx of [-0.15, 0.15]) {
      const rail = this.box(0.05, 1.3, 0.05, dark, -0.3 + sx, 0.65, 1.05);
      rail.rotation.x = -0.35;
      g.add(rail);
    }
    for (let k = 0; k < 4; k++) g.add(this.box(0.32, 0.04, 0.05, dark, -0.3, 0.2 + k * 0.3, 1.2 - k * 0.1));
    this.add(g, x, z, -0.3, rot);
    this.pointLight(x, 1.9, z + 0.9, 0xffb060, 16, 'lamp', 5);
    return g;
  }

  /** Barca medio hundida. */
  sunkenBoat(x: number, z: number, rot = 0) {
    const wood = this.mat('planks-bridge', () => px.planks(this.seed + 5, [0x6a5038, 0x7a5a40, 0x846448, 0x4a3424]));
    const g = new THREE.Group();
    g.add(this.box(1.4, 0.12, 0.6, wood, 0, 0, 0));
    for (const s of [-1, 1]) g.add(this.box(1.5, 0.3, 0.08, wood, 0, 0.15, s * 0.32));
    const bow = this.box(0.3, 0.3, 0.5, wood, 0.8, 0.18, 0);
    bow.rotation.y = Math.PI / 4;
    g.add(bow);
    g.rotation.set(0.15, rot, 0.25);
    return this.add(g, x, z, -0.32);
  }

  /** Bancos de niebla baja que derivan despacio sobre el agua. */
  mist(n: number, y: number, color = 0xdce8dc, opacity = 0.32) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshLambertMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false });
    const banks: { m: THREE.Mesh; x: number; speed: number }[] = [];
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(this.geo('mist', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), mat);
      m.scale.set(5 + this.rng.next() * 5, 1, 2.5 + this.rng.next() * 2);
      const x = (this.rng.next() - 0.5) * W;
      m.position.set(x, y + this.rng.next() * 0.25, (this.rng.next() - 0.5) * (D - 2));
      m.renderOrder = 3;
      this.group.add(m);
      banks.push({ m, x, speed: 0.15 + this.rng.next() * 0.2 });
    }
    this.updaters.push((_dt, t) => {
      for (const b of banks) b.m.position.x = ((b.x + t * b.speed + W / 2) % W) - W / 2;
    });
  }

  // ───────────────────────── campamento ─────────────────────────

  campfire(x: number, z: number) {
    const stone = this.mat('stone', () => px.stone(this.seed + 4));
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const st = new THREE.Mesh(this.geo('dodeca', () => new THREE.DodecahedronGeometry(1, 0)), stone);
      st.scale.set(0.12, 0.08, 0.1);
      this.add(st, x + Math.cos(a) * 0.3, z + Math.sin(a) * 0.3, 0.05);
    }
    for (const a of [0.4, -0.5, 1.6]) {
      const log = new THREE.Mesh(this.geo('log', () => new THREE.CylinderGeometry(0.05, 0.05, 0.5, 5)), this.mat('bark', () => px.bark(this.seed)));
      log.rotation.set(Math.PI / 2 - 0.3, a, 0);
      log.position.set(x, 0.08, z);
      this.group.add(log);
    }
    const frames = [0, 1, 2].map((f) => {
      const p = new px.Px(12, 16);
      const r = new Rng(this.seed + 50 + f);
      for (let y = 15; y >= 2; y--) {
        const t = (15 - y) / 13;
        const half = Math.round((1 - t) * 5 + r.next() * 1.5);
        for (let xx = 6 - half; xx <= 5 + half; xx++) {
          const core = Math.abs(xx - 5.5) < half * 0.45 && t < 0.6;
          p.set(xx + (t > 0.5 ? r.int(-1, 1) : 0), y, core ? 0xfff0a0 : t > 0.7 ? 0xd83a1a : 0xff8a2a);
        }
      }
      return p.texture();
    });
    const flameMat = new THREE.MeshBasicMaterial({ map: frames[0], transparent: true, alphaTest: 0.3, toneMapped: false, side: THREE.DoubleSide });
    const flame = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.75), flameMat);
    flame.position.set(x, 0.42, z);
    this.group.add(flame);
    const light = this.pointLight(x, 0.7, z, 0xff8a3a, 10, 'fire', 8);
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    const embers = floaters(24, this.rng, [0.6, 1.2, 0.6], 0.16, 0xff7a2a);
    embers.position.set(x, 0.4, z);
    this.group.add(embers);
    let ft = 0;
    this.updaters.push((dt, t, cam) => {
      ft += dt;
      flameMat.map = frames[Math.floor(ft * 8) % 3];
      flame.rotation.y = Math.atan2(cam.position.x - flame.position.x, cam.position.z - flame.position.z);
      (embers.material as THREE.ShaderMaterial).uniforms.uTime.value = t * 3;
    });
  }

  tent(x: number, z: number) {
    const cloth = this.mat('cloth', () => {
      const p = new px.Px(16, 16);
      p.noise(this.rng, [0x9a8a64, 0xa89870, 0x8a7a58], [3, 3, 2]);
      for (let i = 0; i < 16; i += 5) p.rect(i, 0, 1, 16, 0x6a5a3e);
      return p;
    }, { side: THREE.DoubleSide });
    const g = new THREE.Group();
    const roof = this.gable(1.5, 1.5, 1.1, cloth);
    roof.rotation.y = Math.PI / 2;
    g.add(roof);
    g.add(this.box(0.3, 0.7, 0.04, this.color(0x2a2014), 0, 0.35, 0.74));
    g.add(this.box(0.05, 1.35, 0.05, this.color(0x4a3424), 0, 0.67, 0.78));
    return this.add(g, x, z, this.y(x, z), -0.2);
  }

  watchtower(x: number, z: number) {
    const wood = this.mat('planks', () => px.planks(this.seed));
    const g = new THREE.Group();
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = this.box(0.12, 3, 0.12, wood, sx * 0.55, 1.5, sz * 0.55);
      leg.rotation.set(sz * 0.05, 0, -sx * 0.05);
      g.add(leg);
    }
    g.add(this.box(1.5, 0.12, 1.5, wood, 0, 2.9, 0));
    for (const [sx, sz, w, d] of [[0, -0.7, 1.5, 0.08], [0, 0.7, 1.5, 0.08], [-0.7, 0, 0.08, 1.5], [0.7, 0, 0.08, 1.5]] as const) g.add(this.box(w, 0.45, d, wood, sx, 3.18, sz));
    const roof = new THREE.Mesh(this.geo('wtroof', () => new THREE.ConeGeometry(1.2, 0.9, 4)), this.mat('roof', () => px.roof(this.seed)));
    roof.position.y = 4.1;
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    for (const s of [-1, 1]) g.add(this.box(0.08, 0.9, 0.08, wood, s * 0.6, 3.6, 0.6));
    g.add(this.box(0.3, 0.2, 0.3, this.glow(0xffa040, 'lamp'), 0, 3.15, 0));
    this.add(g, x, z);
    this.pointLight(x, 3.4, z, 0xffa050, 20, 'lamp', 8);
    return g;
  }

  chest(x: number, z: number) {
    const wood = this.mat('planks-bridge', () => px.planks(this.seed + 5, [0x9a6a40, 0xa8784a, 0xb48454, 0x6a4428]));
    const g = new THREE.Group();
    g.add(this.box(0.55, 0.32, 0.38, wood, 0, 0.16, 0));
    const lid = this.box(0.57, 0.12, 0.4, wood, 0, 0.38, -0.08);
    lid.rotation.x = -0.6;
    g.add(lid);
    g.add(this.box(0.1, 0.1, 0.03, this.glow(0xffd060, 'always'), 0, 0.22, 0.2));
    return this.add(g, x, z, this.y(x, z), -0.3);
  }
}
