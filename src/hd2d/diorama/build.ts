import * as THREE from 'three';
import type { Biome } from '../../combat/rules/data';
import { Rng } from '../../core/rng';
import { SpriteKind, spriteSheet } from '../characters';
import * as px from '../pixel';
import { floaters, PixelSprite, snowfall } from '../sprite';
import { BIOMES, BiomeDef } from './biomes';
import { BATTLE, BOTTOM, CellType, D, Grid, slot, W, wx, wz } from './grid';
import { Kit } from './kit';

export type BiomeKey = Biome;

/** Lo que hay en el claro cuando no se combate: el grupo, su campamento, la guardia y el botín. */
export interface SceneSetup {
  /** El grupo en orden de puesto (1 = delante). Del 5 en adelante, en segunda fila. */
  party?: SpriteKind[];
  garrison?: SpriteKind[];
  structure?: 'camp' | 'tower' | null;
  loot?: boolean;
  fire?: boolean;
}

export interface Diorama {
  group: THREE.Group;
  biome: BiomeDef;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** Punto en el que se centra la cámara. */
  focus: THREE.Vector3;
  /** Sombras que acechan en la linde (visibles solo en la oscuridad). */
  shades: PixelSprite[];
  motes: THREE.Points;
  fireflies: THREE.Points;
  /** Sprites del grupo en la escena de nodo, en orden de puesto. */
  party: PixelSprite[];
  /** Puntos con nombre para etiquetas HTML (p. ej. los edificios del castillo). */
  anchors: Record<string, THREE.Vector3>;
  setLights(lamp: number, fire: number): void;
  update(dt: number, time: number, camera: THREE.Camera): void;
}

/** Texturas de bloque por tipo de celda y paleta del bioma. */
function blockMaterials(k: Kit, ground: px.GroundKey) {
  const pal = px.GROUND[ground];
  const s = k.seed;
  const m = (key: string, make: () => px.Px) => k.mat(`${ground}-${key}`, make);
  const grassTop = m('grassTop', () => px.grassTop(s, pal.grass));
  const grassSide = m('grassSide', () => px.grassSide(s + 1, pal.grass, pal.dirt));
  const dirt = m('dirt', () => px.dirt(s + 2, pal.dirt));
  const path = m('path', () => px.pathTop(s + 3, pal.path));
  const stone = m('bed', () => px.stone(s + 4, [0x4a4a52, 0x56565e, 0x62626a, 0x3e3e46]));
  const rock = m('rock', () => px.rock(s + 5));
  const snow = m('snow', () => px.snow(s + 6));
  const cobble = m('cobble', () => px.cobble(s + 7));
  const bricks = m('bricks', () => px.bricks(s + 8));
  const ash = m('ash', () => px.ash(s + 9));
  const sand = m('sand', () => px.sand(s + 10));
  const faces = (top: THREE.Material, side: THREE.Material, bottom = dirt) => [side, side, top, bottom, side, side];
  const top: Record<CellType, THREE.Material[]> = {
    grass: faces(grassTop, grassSide),
    path: faces(path, dirt),
    river: faces(stone, stone),
    pool: faces(m('poolbed', () => px.dirt(s + 11, [0x1e1a12, 0x2a2418, 0x241e14, 0x302a1c])), dirt),
    shallow: faces(sand, dirt),
    rock: faces(rock, rock, rock),
    snow: faces(snow, rock, rock),
    cobble: faces(cobble, bricks),
    ash: faces(ash, dirt),
    sand: faces(sand, dirt),
  };
  const deep = { dirt: faces(dirt, dirt), rock: faces(rock, rock, rock), bricks: faces(bricks, bricks, bricks) };
  return { top, deep };
}

/**
 * Construye la maqueta de un bioma. El claro central queda siempre libre:
 * ahí se pelea y ahí acampa el grupo.
 */
export function buildDiorama(biomeKey: BiomeKey, opts: { seed?: number; scene?: SceneSetup } = {}): Diorama {
  const seed = opts.seed ?? 7;
  const biome = BIOMES[biomeKey] ?? BIOMES.forest;
  const rng = new Rng(seed * 31 + biomeKey.length);
  const grid = new Grid();
  biome.layout(grid, rng);
  const k = new Kit(grid, rng, seed);
  const group = k.group;

  // ── Terreno: columnas de bloques ──
  const mats = blockMaterials(k, biome.ground);
  const buckets = new Map<string, { mats: THREE.Material[]; list: THREE.Matrix4[] }>();
  const push = (key: string, m: THREE.Material[], x: number, y: number, z: number) => {
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mats: m, list: [] }));
    b.list.push(new THREE.Matrix4().makeTranslation(x, y, z));
  };
  grid.each((i, j, c) => {
    const deepKind = c.type === 'rock' || c.type === 'snow' ? 'rock' : c.type === 'cobble' && c.h > 0 ? 'bricks' : 'dirt';
    for (let y = BOTTOM; y < c.h; y++) {
      if (y === c.h - 1) push(`top-${c.type}`, mats.top[c.type], wx(i), y + 0.5, wz(j));
      else push(`deep-${deepKind}`, mats.deep[deepKind], wx(i), y + 0.5, wz(j));
    }
  });
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const { mats: m, list } of buckets.values()) {
    const mesh = new THREE.InstancedMesh(box, m, list.length);
    list.forEach((mx, n) => mesh.setMatrixAt(n, mx));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ── Agua: río claro, vado a ras de suelo y charcas turbias ──
  const waterTex = px.water(seed).texture(true);
  waterTex.repeat.set(2, 2);
  const clear = new THREE.MeshStandardMaterial({ map: waterTex, transparent: true, opacity: 0.88, roughness: 0.15, metalness: 0.1, emissive: 0x0a2a3a });
  const shallowMat = new THREE.MeshStandardMaterial({ map: waterTex, transparent: true, opacity: 0.55, roughness: 0.1, emissive: 0x0a2a3a, depthWrite: false });
  // Agua de charca: verdosa y con reflejos, para que se distinga del suelo oscuro.
  const murky = new THREE.MeshStandardMaterial({ map: waterTex, color: 0x9ab88a, transparent: true, opacity: 0.85, roughness: 0.05, metalness: 0.3, emissive: 0x1a2a14 });
  const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const waters: [CellType, THREE.Material, number][] = [
    ['river', clear, -0.32],
    ['shallow', shallowMat, 0.07],
    ['pool', murky, -0.3],
  ];
  for (const [type, mat, y] of waters) {
    const cells: [number, number][] = [];
    grid.each((i, j, c) => c.type === type && cells.push([i, j]));
    if (!cells.length) continue;
    const mesh = new THREE.InstancedMesh(plane, mat, cells.length);
    cells.forEach(([i, j], n) => mesh.setMatrixAt(n, new THREE.Matrix4().makeTranslation(wx(i), y, wz(j))));
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  // Cascadas donde el río sale por el borde delantero
  const fallTex = px.waterfall(seed).texture(true);
  fallTex.repeat.set(1, 3);
  const fallMat = new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.92 });
  for (let i = 0; i < W; i++) {
    if (grid.at(i, D - 1)!.type !== 'river') continue;
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(1, 2.7), fallMat);
    fall.position.set(wx(i), -1.65, D / 2 + 0.02);
    group.add(fall);
  }
  k.updaters.push((dt) => {
    waterTex.offset.y -= dt * 0.12;
    waterTex.offset.x += dt * 0.02;
    fallTex.offset.y += dt * 0.9;
  });

  // ── Suelo bajo la maqueta y bosque de fondo, que la niebla y el desenfoque suavizan ──
  const pal = px.GROUND[biome.ground];
  const lowTex = px.grassTop(seed + 9, pal.grass).texture(true);
  lowTex.repeat.set(60, 60);
  const low = new THREE.Mesh(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: lowTex, roughness: 1, color: 0x9aa890 }));
  low.position.y = BOTTOM;
  low.receiveShadow = true;
  group.add(low);
  for (let n = 0; n < 60; n++) {
    const a = rng.next() * Math.PI * 2;
    const r = 17 + rng.next() * 18;
    const x = Math.cos(a) * r * 1.2;
    const z = Math.sin(a) * r - 4;
    if (z > 6 && Math.abs(x) < 16) continue;
    const kind = rng.pick(biome.far.kinds);
    k.tree(x, z, 1.6 + rng.next() * 1.6, kind, rng.pick(biome.far.leaves)).position.y = BOTTOM;
  }

  // ── Decorado propio del bioma ──
  biome.decorate(k);

  // ── Escena de nodo: grupo, campamento, guardia y botín ──
  const party: PixelSprite[] = [];
  const scene = opts.scene;
  if (scene) {
    (scene.party ?? []).forEach((kind, n) => {
      const s = new PixelSprite(spriteSheet(kind).texture(), 1.05);
      const pos = n < 4 ? slot('party', n + 1) : slot('foe', n - 3);
      s.mesh.position.set(pos.x, 0, pos.z + (n >= 4 ? -0.3 : 0));
      group.add(s.mesh);
      party.push(s);
    });
    const sx = BATTLE.x;
    const sz = BATTLE.z;
    if (scene.structure === 'tower') k.watchtower(sx + 5.4, sz - 1.1);
    if (scene.structure) k.tent(sx + 3.4, sz - 0.9);
    if (scene.fire ?? !!scene.structure) k.campfire(sx + 1.8, sz + 0.5);
    if (scene.loot) k.chest(sx + 2.6, sz + 1.3);
    (scene.garrison ?? []).forEach((kind, n) => {
      const s = new PixelSprite(spriteSheet(kind).texture(), 1.0, 1.4, true);
      s.mesh.position.set(sx + 4.4 + n * 0.9, 0, sz + 0.4);
      group.add(s.mesh);
      party.push(s);
    });
  }

  // ── Sombras que acechan (solo en la oscuridad) ──
  const shadeTex = spriteSheet('shade').texture();
  const shades = [
    [wx(4), wz(7)],
    [wx(21), wz(6.5)],
    [wx(20), wz(13)],
  ].map(([x, z]) => {
    const s = new PixelSprite(shadeTex, 1.15, 1.1, x > 0);
    s.mesh.position.set(x, 0, z);
    s.mesh.visible = false;
    group.add(s.mesh);
    return s;
  });

  // ── Partículas: polvo de luz y luciérnagas (o fuegos fatuos) ──
  const motes = floaters(160, rng, [W, 4, D], 0.12, biome.motes ?? 0xfff0b0);
  motes.position.y = 0.2;
  const fireflies = floaters(60, rng, [W - 4, 2.2, D - 2], 0.3, biome.fireflies ?? 0xc8ff70);
  fireflies.position.y = 0.3;
  group.add(motes, fireflies);
  const snow = biome.snow ? snowfall(900, rng, [30, 9, D + 6], 0.24) : null;
  if (snow) {
    snow.position.set(0, 0, 1);
    group.add(snow);
  }

  // ── Luces ──
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 14, bottom: -14, far: 80 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  group.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbcd7ff, 0x5a4a30, 0.6);
  group.add(hemi);

  return {
    group,
    biome,
    sun,
    hemi,
    focus: new THREE.Vector3(BATTLE.x, 0.55, BATTLE.z),
    shades,
    motes,
    fireflies,
    party,
    anchors: k.anchors,
    setLights: (lamp, fire) => k.setLights(lamp, fire),
    update(dt, t, cam) {
      k.tick(dt, t, cam);
      for (const s of party) s.update(dt, cam);
      for (const s of shades) {
        s.update(dt, cam);
        s.mesh.position.y = 0.15 + Math.sin(t * 1.4 + s.mesh.position.x) * 0.12;
      }
      (motes.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      (fireflies.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      if (snow) (snow.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    },
  };
}
