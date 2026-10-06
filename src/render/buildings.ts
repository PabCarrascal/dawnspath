import * as THREE from 'three';
import type { StructureKind } from '../game/config';
import { PALETTE as P, mat } from './materials';
import { box, bridge, camp, cone, cyl, farm, part, tower } from './models';

/** Materiales del tablero: todos se oscurecen con la niebla de guerra. */
const M = {
  stone: () => mat(P.stone, { fow: true }),
  stoneDark: () => mat(P.stoneDark, { fow: true }),
  wood: () => mat(P.wood, { fow: true }),
  woodDark: () => mat(P.woodDark, { fow: true }),
  roof: () => mat(P.roof, { fow: true }),
  roofRed: () => mat(0xa0482e, { fow: true }),
  plaster: () => mat(0xe4d3ad, { fow: true }),
  gold: () => mat(P.gold, { fow: true, metalness: 0.6, roughness: 0.35 }),
  window: () => mat(P.window, { emissive: P.window, emissiveIntensity: 2.4, fow: true, nightGlow: true }),
  fire: () => mat(P.fire, { emissive: P.fire, emissiveIntensity: 4 }),
  flag: () => mat(P.dawn, { fow: true }),
};

/** Esquinas de un hexágono "pointy-top" de radio r en el plano XZ. */
function hexCorners(r: number): THREE.Vector2[] {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
  });
}

/** Muro hexagonal: un segmento por lado, con almenas opcionales. */
function hexWall(g: THREE.Group, r: number, height: number, thick: number, material: THREE.Material, crenels = true, gap = -1) {
  const cs = hexCorners(r);
  for (let i = 0; i < 6; i++) {
    if (i === gap) continue;
    const a = cs[i];
    const b = cs[(i + 1) % 6];
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    const angle = -Math.atan2(b.y - a.y, b.x - a.x);
    g.add(part(box(len + thick, height, thick), material, [mid.x, height / 2, mid.y], [0, angle, 0]));
    if (crenels) {
      for (let k = -1; k <= 1; k++) {
        const t = 0.5 + k * 0.3;
        const p = a.clone().lerp(b, t);
        g.add(part(box(0.07, 0.07, thick + 0.01), material, [p.x, height + 0.035, p.y], [0, angle, 0]));
      }
    }
  }
}

function roundTower(g: THREE.Group, x: number, z: number, h: number, r: number, roofMat: THREE.Material) {
  g.add(part(cyl(r, r * 1.1, h, 8), M.stone(), [x, h / 2, z]));
  g.add(part(cyl(r * 1.15, r * 1.15, 0.08, 8), M.stoneDark(), [x, h + 0.04, z]));
  g.add(part(cone(r * 1.2, r * 2.2, 8), roofMat, [x, h + 0.08 + r * 1.1, z]));
}

function banner(g: THREE.Group, x: number, y: number, z: number, name = 'flag') {
  g.add(part(cyl(0.012, 0.012, 0.4, 4), M.woodDark(), [x, y + 0.2, z]));
  g.add(part(box(0.2, 0.12, 0.01), M.flag(), [x + 0.1, y + 0.33, z], [0, 0, 0], name));
}

/** El castillo crece con cada nivel: empalizada → fortaleza → castillo → ciudadela. */
export function castle(level: number): { group: THREE.Group; flame: THREE.Object3D } {
  const g = new THREE.Group();
  const flame = new THREE.Group();

  if (level === 1) {
    // Empalizada de troncos alrededor de un torreón de piedra.
    const cs = hexCorners(0.8);
    for (let i = 0; i < 6; i++) {
      const a = cs[i];
      const b = cs[(i + 1) % 6];
      if (i === 1) continue; // Entrada
      for (let k = 0; k < 5; k++) {
        const p = a.clone().lerp(b, k / 5);
        g.add(part(cyl(0.035, 0.04, 0.32 + (k % 2) * 0.05, 5), M.wood(), [p.x, 0.17, p.y]));
      }
    }
    g.add(part(box(0.45, 0.6, 0.45), M.stone(), [0, 0.3, 0]));
    g.add(part(cone(0.42, 0.35, 4), M.roofRed(), [0, 0.78, 0], [0, Math.PI / 4, 0]));
    g.add(part(box(0.07, 0.11, 0.02), M.window(), [0, 0.42, 0.23]));
    banner(g, 0.12, 0.9, 0.1);
  } else {
    const wallH = level === 2 ? 0.32 : 0.42;
    hexWall(g, 0.84, wallH, 0.09, M.stone(), true, 1);
    // Torres en esquinas alternas
    const cs = hexCorners(0.84);
    const towers = level === 2 ? [0, 3] : [0, 2, 3, 5];
    for (const i of towers) roundTower(g, cs[i].x, cs[i].y, wallH + 0.25, 0.11, M.roof());
    // Torre del homenaje
    const keepH = level === 2 ? 0.75 : 0.95;
    g.add(part(box(0.46, keepH, 0.46), M.stone(), [0, keepH / 2, -0.05]));
    for (const [x, z] of [[-0.23, -0.28], [0.23, -0.28], [-0.23, 0.18], [0.23, 0.18]] as const) {
      g.add(part(box(0.08, 0.08, 0.08), M.stoneDark(), [x, keepH + 0.04, z]));
    }
    g.add(part(box(0.07, 0.12, 0.02), M.window(), [0, keepH * 0.6, 0.19]));
    g.add(part(box(0.07, 0.12, 0.02), M.window(), [0.12, keepH * 0.35, 0.19]));
    // Puerta
    g.add(part(box(0.2, 0.22, 0.04), M.woodDark(), [cs[1].x * 0.5 + cs[2].x * 0.5, 0.11, cs[1].y * 0.5 + cs[2].y * 0.5], [0, -Math.PI / 3, 0]));
    banner(g, 0, keepH, -0.05);
    if (level >= 3) {
      roundTower(g, 0.2, 0.2, keepH + 0.15, 0.09, M.roof());
      banner(g, cs[0].x, wallH + 0.55, cs[0].y, 'flag2');
    }
    if (level >= 4) {
      // Aguja de la ciudadela coronada por la llama del alba.
      g.add(part(cyl(0.07, 0.12, 0.6, 8), M.stone(), [0, keepH + 0.3, -0.05]));
      g.add(part(new THREE.TorusGeometry(0.1, 0.02, 4, 10), M.gold(), [0, keepH + 0.62, -0.05], [Math.PI / 2, 0, 0]));
      const crown = part(new THREE.OctahedronGeometry(0.1), mat(P.dawn, { emissive: P.dawn, emissiveIntensity: 5 }), [0, keepH + 0.78, -0.05]);
      crown.name = 'crown';
      g.add(crown);
    }
  }

  // Brasero junto a la entrada (luz de la noche).
  const brazier = level === 1 ? new THREE.Vector3(0.38, 0, 0.5) : new THREE.Vector3(0.62, 0, 0.42);
  g.add(part(cyl(0.05, 0.03, 0.14, 6), M.stoneDark(), [brazier.x, 0.07, brazier.z]));
  flame.add(part(cone(0.05, 0.14, 5), M.fire(), [0, 0.07, 0]));
  flame.position.set(brazier.x, 0.14, brazier.z);
  g.add(flame);
  return { group: g, flame };
}

function sawmill(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(box(0.5, 0.28, 0.36), M.wood(), [-0.1, 0.14, -0.15]));
  g.add(part(cone(0.38, 0.22, 4), M.woodDark(), [-0.1, 0.39, -0.15], [0, Math.PI / 4, 0]));
  // Pila de troncos
  for (let i = 0; i < 3; i++) {
    for (let k = 0; k < 3 - i; k++) {
      g.add(part(cyl(0.045, 0.045, 0.42, 6), M.wood(), [0.2 + k * 0.095 + i * 0.047, 0.045 + i * 0.08, 0.2], [Math.PI / 2, 0, 0]));
    }
  }
  // Sierra circular
  const saw = part(cyl(0.12, 0.12, 0.02, 12), mat(P.steel, { fow: true, metalness: 0.7, roughness: 0.3 }), [0.25, 0.22, -0.2], [Math.PI / 2, 0, 0], 'mill');
  g.add(saw);
  g.add(part(box(0.3, 0.12, 0.12), M.woodDark(), [0.25, 0.06, -0.2]));
  return g;
}

function quarry(): THREE.Group {
  const g = new THREE.Group();
  const rock = mat(0x9a948c, { fow: true });
  // Bloques tallados apilados
  for (const [x, y, z, s] of [
    [-0.25, 0.08, 0.15, 0.16],
    [-0.08, 0.08, 0.2, 0.16],
    [-0.17, 0.24, 0.17, 0.15],
    [0.25, 0.07, -0.25, 0.14],
  ] as const) {
    g.add(part(box(s, s, s), rock, [x, y, z], [0, x * 3, 0]));
  }
  // Grúa de madera
  g.add(part(cyl(0.025, 0.03, 0.75, 5), M.woodDark(), [0.15, 0.37, 0.1]));
  g.add(part(box(0.55, 0.035, 0.035), M.woodDark(), [0.32, 0.72, 0.1], [0, 0, -0.25]));
  g.add(part(cyl(0.006, 0.006, 0.35, 3), mat(0x333333, { fow: true }), [0.55, 0.5, 0.1]));
  g.add(part(box(0.1, 0.1, 0.1), rock, [0.55, 0.3, 0.1]));
  // Carretilla
  g.add(part(box(0.18, 0.06, 0.12), M.wood(), [-0.25, 0.08, -0.2]));
  return g;
}

function house(): THREE.Group {
  const g = new THREE.Group();
  const spots: [number, number, number][] = [
    [-0.22, -0.12, 0.3],
    [0.24, 0.1, -0.5],
  ];
  for (const [x, z, rot] of spots) {
    const h = new THREE.Group();
    h.add(part(box(0.34, 0.26, 0.3), M.plaster(), [0, 0.13, 0]));
    h.add(part(box(0.36, 0.04, 0.32), M.woodDark(), [0, 0.27, 0]));
    h.add(part(cone(0.3, 0.24, 4), M.roofRed(), [0, 0.41, 0], [0, Math.PI / 4, 0]));
    h.add(part(box(0.06, 0.08, 0.01), M.window(), [0.08, 0.15, 0.155]));
    h.add(part(box(0.07, 0.14, 0.01), M.woodDark(), [-0.08, 0.07, 0.155]));
    h.add(part(box(0.05, 0.16, 0.05), M.stoneDark(), [0.1, 0.42, -0.06]));
    h.position.set(x, 0, z);
    h.rotation.y = rot;
    g.add(h);
  }
  return g;
}

function outpost(): { group: THREE.Group; flame: THREE.Object3D } {
  const c = camp();
  // Empalizada parcial alrededor del campamento
  const cs = hexCorners(0.78);
  for (let i = 3; i < 6; i++) {
    const a = cs[i];
    const b = cs[(i + 1) % 6];
    for (let k = 0; k < 4; k++) {
      const p = a.clone().lerp(b, k / 4);
      c.group.add(part(cyl(0.03, 0.035, 0.3, 5), M.wood(), [p.x, 0.15, p.y]));
    }
  }
  banner(c.group, -0.5, 0, 0.3);
  return c;
}

function market(): THREE.Group {
  const g = new THREE.Group();
  const cloths = [mat(0xd9823b, { fow: true }), mat(0x3f6b9a, { fow: true }), mat(0xc0392b, { fow: true })];
  const stalls: [number, number][] = [
    [-0.3, -0.15],
    [0.1, -0.35],
    [0.3, 0.15],
  ];
  stalls.forEach(([x, z], i) => {
    const s = new THREE.Group();
    s.add(part(box(0.3, 0.1, 0.2), M.wood(), [0, 0.1, 0]));
    for (const [px, pz] of [[-0.13, -0.08], [0.13, -0.08], [-0.13, 0.08], [0.13, 0.08]] as const) {
      s.add(part(cyl(0.012, 0.012, 0.32, 4), M.woodDark(), [px, 0.16, pz]));
    }
    s.add(part(box(0.34, 0.02, 0.26), cloths[i], [0, 0.33, 0], [0.15, 0, 0]));
    s.position.set(x, 0, z);
    s.rotation.y = i * 1.1;
    g.add(s);
  });
  // Monedas
  g.add(part(cyl(0.05, 0.05, 0.03, 8), M.gold(), [-0.05, 0.02, 0.2]));
  g.add(part(cyl(0.05, 0.05, 0.03, 8), M.gold(), [-0.02, 0.05, 0.22]));
  return g;
}

function barracks(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(box(0.75, 0.3, 0.34), M.stone(), [0, 0.15, -0.1]));
  g.add(part(box(0.8, 0.05, 0.38), M.woodDark(), [0, 0.32, -0.1]));
  g.add(part(cyl(0.2, 0.2, 0.8, 3), M.roof(), [0, 0.42, -0.1], [0, 0, Math.PI / 2]));
  for (const x of [-0.25, 0, 0.25]) g.add(part(box(0.06, 0.09, 0.01), M.window(), [x, 0.17, 0.075]));
  // Patio de armas: estacas de entrenamiento
  for (const x of [-0.25, 0.05, 0.3]) {
    g.add(part(cyl(0.025, 0.025, 0.3, 5), M.wood(), [x, 0.15, 0.32]));
    g.add(part(box(0.14, 0.03, 0.03), M.wood(), [x, 0.22, 0.32]));
  }
  banner(g, 0.38, 0.32, -0.1);
  return g;
}

function wall(): THREE.Group {
  const g = new THREE.Group();
  hexWall(g, 0.78, 0.38, 0.14, M.stone(), true);
  g.add(part(cyl(0.65, 0.7, 0.12, 6), M.stoneDark(), [0, 0.06, 0], [0, Math.PI / 6, 0]));
  return g;
}

function archery(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(box(0.4, 0.26, 0.3), M.wood(), [-0.2, 0.13, -0.15]));
  g.add(part(cone(0.33, 0.22, 4), mat(0x3f7a3a, { fow: true }), [-0.2, 0.37, -0.15], [0, Math.PI / 4, 0]));
  // Dianas
  for (const [x, z] of [[0.3, 0.1], [0.3, -0.25]] as const) {
    g.add(part(cyl(0.12, 0.12, 0.03, 12), mat(0xeeeeee, { fow: true }), [x, 0.2, z], [0, 0, Math.PI / 2]));
    g.add(part(cyl(0.07, 0.07, 0.035, 12), mat(0xc0392b, { fow: true }), [x, 0.2, z], [0, 0, Math.PI / 2]));
    g.add(part(cyl(0.015, 0.015, 0.2, 4), M.woodDark(), [x, 0.08, z]));
  }
  return g;
}

function forge(): { group: THREE.Group; flame: THREE.Object3D } {
  const g = new THREE.Group();
  g.add(part(box(0.5, 0.26, 0.4), M.stoneDark(), [0, 0.13, -0.05]));
  g.add(part(box(0.56, 0.04, 0.46), M.woodDark(), [0, 0.28, -0.05]));
  g.add(part(box(0.12, 0.42, 0.12), M.stone(), [0.16, 0.4, -0.15]));
  // Fragua encendida
  const flame = new THREE.Group();
  flame.add(part(box(0.18, 0.06, 0.02), M.fire(), [0, 0, 0]));
  flame.position.set(-0.05, 0.1, 0.16);
  g.add(flame);
  // Yunque
  g.add(part(box(0.12, 0.08, 0.06), mat(0x3a3a40, { fow: true, metalness: 0.7, roughness: 0.4 }), [-0.25, 0.08, 0.3]));
  g.add(part(box(0.06, 0.06, 0.05), M.woodDark(), [-0.25, 0.03, 0.3]));
  return { group: g, flame };
}

function beacon(): { group: THREE.Group; flame: THREE.Object3D } {
  const g = new THREE.Group();
  g.add(part(cyl(0.38, 0.45, 0.15, 6), M.stoneDark(), [0, 0.075, 0], [0, Math.PI / 6, 0]));
  g.add(part(cyl(0.16, 0.24, 1.25, 8), M.stone(), [0, 0.75, 0]));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(part(box(0.06, 0.5, 0.06), M.gold(), [Math.sin(a) * 0.2, 1.55, Math.cos(a) * 0.2], [Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25]));
  }
  g.add(part(cyl(0.22, 0.16, 0.08, 8), M.gold(), [0, 1.42, 0]));
  const flame = new THREE.Group();
  flame.add(part(new THREE.OctahedronGeometry(0.18), mat(P.dawn, { emissive: P.dawn, emissiveIntensity: 6 }), [0, 0.1, 0]));
  flame.add(part(cone(0.12, 0.4, 6), mat(0xfff0c0, { emissive: 0xfff0c0, emissiveIntensity: 6 }), [0, 0.3, 0]));
  flame.position.set(0, 1.5, 0);
  flame.name = 'beaconFlame';
  g.add(flame);
  return { group: g, flame };
}

/** Andamios de obra: postes, tablones y una polea. */
export function scaffold(): THREE.Group {
  const g = new THREE.Group();
  const wood = M.wood();
  const dark = M.woodDark();
  const s = 0.36;
  for (const [x, z] of [[-s, -s], [s, -s], [-s, s], [s, s]] as const) g.add(part(cyl(0.018, 0.018, 0.8, 4), dark, [x, 0.4, z]));
  for (const y of [0.3, 0.6]) {
    g.add(part(box(s * 2 + 0.06, 0.025, 0.08), wood, [0, y, s]));
    g.add(part(box(s * 2 + 0.06, 0.025, 0.08), wood, [0, y, -s]));
    g.add(part(box(0.08, 0.025, s * 2 + 0.06), wood, [s, y, 0]));
  }
  g.add(part(box(0.02, 0.6, 0.02), dark, [-s, 0.4, 0], [0.9, 0, 0]));
  return g;
}

export function createStructureModel(
  kind: StructureKind,
  opts: { bridgeAngle?: number; level?: number } = {},
): { group: THREE.Group; flame?: THREE.Object3D } {
  switch (kind) {
    case 'castle':
      return castle(opts.level ?? 1);
    case 'tower':
      return { group: tower() };
    case 'bridge':
      return { group: bridge(opts.bridgeAngle ?? 0) };
    case 'farm':
      return { group: farm() };
    case 'sawmill':
      return { group: sawmill() };
    case 'quarry':
      return { group: quarry() };
    case 'house':
      return { group: house() };
    case 'outpost':
      return outpost();
    case 'market':
      return { group: market() };
    case 'barracks':
      return { group: barracks() };
    case 'wall':
      return { group: wall() };
    case 'archery':
      return { group: archery() };
    case 'forge':
      return forge();
    case 'beacon':
      return beacon();
  }
}
