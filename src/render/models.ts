import * as THREE from 'three';
import type { UnitKind } from '../game/config';
import { PALETTE as P, mat } from './materials';

/** Crea una malla, la coloca y activa sombras. */
export function part(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  pos: [number, number, number] = [0, 0, 0],
  rot: [number, number, number] = [0, 0, 0],
  name?: string,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  if (name) m.name = name;
  return m;
}

export const cyl = (rt: number, rb: number, h: number, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
export const cone = (r: number, h: number, seg = 6) => new THREE.ConeGeometry(r, h, seg);
export const ico = (r: number, d = 0) => new THREE.IcosahedronGeometry(r, d);

// ───────────────────────── unidades ─────────────────────────

function humanoid(tunic: number, trim: number): THREE.Group {
  const g = new THREE.Group();
  const legs = mat(P.dirtDark);
  g.add(part(box(0.07, 0.18, 0.08), legs, [-0.06, 0.09, 0]));
  g.add(part(box(0.07, 0.18, 0.08), legs, [0.06, 0.09, 0]));
  g.add(part(cyl(0.14, 0.19, 0.32), mat(tunic), [0, 0.33, 0]));
  g.add(part(cyl(0.195, 0.195, 0.04), mat(trim, { metalness: 0.4, roughness: 0.5 }), [0, 0.22, 0]));
  g.add(part(ico(0.115, 1), mat(P.skin), [0, 0.6, 0], [0, 0, 0], 'head'));
  return g;
}

function hero(): THREE.Group {
  const g = humanoid(P.hero, P.gold);
  const steel = mat(P.steel, { metalness: 0.6, roughness: 0.35 });
  g.add(part(new THREE.SphereGeometry(0.125, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), steel, [0, 0.63, 0]));
  g.add(part(cone(0.04, 0.16, 5), mat(0xd94a3a), [0, 0.8, -0.02], [-0.3, 0, 0]));
  // Capa
  g.add(part(box(0.3, 0.42, 0.025), mat(P.heroDark), [0, 0.36, -0.17], [0.18, 0, 0]));
  // Espada
  const sword = new THREE.Group();
  sword.name = 'weapon';
  sword.add(part(box(0.035, 0.42, 0.015), mat(0xe8eef6, { metalness: 0.8, roughness: 0.2 }), [0, 0.26, 0]));
  sword.add(part(box(0.14, 0.03, 0.04), mat(P.gold, { metalness: 0.6, roughness: 0.4 }), [0, 0.05, 0]));
  sword.add(part(box(0.03, 0.09, 0.03), mat(P.woodDark), [0, -0.01, 0]));
  sword.position.set(0.24, 0.22, 0.06);
  sword.rotation.set(0.35, 0, -0.15);
  g.add(sword);
  // Escudo
  const shield = part(cyl(0.14, 0.14, 0.04, 8), mat(P.heroDark), [-0.22, 0.34, 0.03], [0, 0, Math.PI / 2]);
  shield.add(part(cyl(0.05, 0.05, 0.05, 6), mat(P.gold, { metalness: 0.6 }), [0, 0, 0]));
  g.add(shield);
  // Farol (se enciende de noche)
  g.add(
    part(ico(0.04, 0), mat(P.window, { emissive: P.window, emissiveIntensity: 3, nightGlow: true }), [
      0.12, 0.22, 0.17,
    ]),
  );
  return g;
}

function soldier(): THREE.Group {
  const g = humanoid(P.soldier, P.hero);
  const steel = mat(P.steel, { metalness: 0.6, roughness: 0.35 });
  g.add(part(cone(0.135, 0.18, 7), steel, [0, 0.72, 0]));
  const spear = new THREE.Group();
  spear.name = 'weapon';
  spear.add(part(cyl(0.015, 0.015, 0.85, 5), mat(P.wood), [0, 0.3, 0]));
  spear.add(part(cone(0.035, 0.12, 4), steel, [0, 0.78, 0]));
  spear.position.set(0.22, 0.05, 0.05);
  spear.rotation.set(0.12, 0, 0);
  g.add(spear);
  const shield = part(cyl(0.15, 0.15, 0.04, 8), mat(P.hero), [-0.21, 0.32, 0.04], [0, 0, Math.PI / 2]);
  shield.add(part(cyl(0.155, 0.155, 0.02, 8), mat(P.steel, { metalness: 0.5 }), [0, -0.012, 0]));
  g.add(shield);
  g.scale.setScalar(0.92);
  return g;
}

function militia(): THREE.Group {
  const g = humanoid(0x8a6a44, 0x5a3b24);
  g.add(part(new THREE.SphereGeometry(0.12, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x6b4a32), [0, 0.64, 0]));
  // Horca de labriego
  const fork = new THREE.Group();
  fork.name = 'weapon';
  fork.add(part(cyl(0.014, 0.014, 0.75, 5), mat(P.wood), [0, 0.3, 0]));
  for (const x of [-0.03, 0, 0.03]) fork.add(part(cyl(0.008, 0.008, 0.12, 4), mat(P.steel, { metalness: 0.5 }), [x, 0.72, 0]));
  fork.position.set(0.22, 0.05, 0.05);
  fork.rotation.set(0.15, 0, 0);
  g.add(fork);
  g.scale.setScalar(0.88);
  return g;
}

function archer(): THREE.Group {
  const g = humanoid(0x3f7a3a, 0x5a3b24);
  // Capucha
  g.add(part(cone(0.14, 0.22, 7), mat(0x2f5e2c), [0, 0.7, -0.01]));
  // Arco: un arco de toro con cuerda
  const bow = new THREE.Group();
  bow.name = 'weapon';
  bow.add(part(new THREE.TorusGeometry(0.22, 0.014, 4, 10, Math.PI), mat(P.woodDark), [0, 0, 0], [0, Math.PI / 2, Math.PI / 2]));
  bow.add(part(cyl(0.004, 0.004, 0.44, 3), mat(0xeeeeee), [0, 0, 0]));
  bow.position.set(-0.22, 0.38, 0.06);
  g.add(bow);
  // Carcaj
  g.add(part(cyl(0.05, 0.05, 0.26, 6), mat(0x6b4a32), [0.08, 0.42, -0.16], [0.35, 0, 0.2]));
  g.scale.setScalar(0.9);
  return g;
}

function shade(): THREE.Group {
  const g = new THREE.Group();
  const body = mat(P.shade, { emissive: 0x2a0a40, emissiveIntensity: 0.6, roughness: 1 });
  g.add(part(cone(0.24, 0.62, 7), body, [0, 0.36, 0], [Math.PI, 0, 0]));
  g.add(part(ico(0.17, 0), body, [0, 0.66, 0], [0, 0, 0], 'head'));
  const eye = mat(P.shadeGlow, { emissive: P.shadeGlow, emissiveIntensity: 5 });
  g.add(part(ico(0.028, 0), eye, [-0.06, 0.68, 0.14]));
  g.add(part(ico(0.028, 0), eye, [0.06, 0.68, 0.14]));
  const claw = mat(0x0c0612);
  g.add(part(cone(0.05, 0.32, 4), claw, [-0.24, 0.36, 0.05], [0.4, 0, 0.7]));
  g.add(part(cone(0.05, 0.32, 4), claw, [0.24, 0.36, 0.05], [0.4, 0, -0.7]));
  return g;
}

function king(): THREE.Group {
  const g = new THREE.Group();
  const robe = mat(P.king, { emissive: 0x16002e, emissiveIntensity: 0.8 });
  const dark = mat(0x0d0614, { roughness: 0.6, metalness: 0.3 });
  const glow = mat(P.kingGlow, { emissive: P.kingGlow, emissiveIntensity: 3.5 });
  g.add(part(cyl(0.2, 0.42, 0.85, 8), robe, [0, 0.43, 0]));
  g.add(part(ico(0.16, 0), dark, [-0.24, 0.84, 0]));
  g.add(part(ico(0.16, 0), dark, [0.24, 0.84, 0]));
  g.add(part(ico(0.16, 1), dark, [0, 1.0, 0], [0, 0, 0], 'head'));
  g.add(part(ico(0.03, 0), mat(0xff3bd2, { emissive: 0xff3bd2, emissiveIntensity: 6 }), [-0.06, 1.02, 0.14]));
  g.add(part(ico(0.03, 0), mat(0xff3bd2, { emissive: 0xff3bd2, emissiveIntensity: 6 }), [0.06, 1.02, 0.14]));
  const crown = new THREE.Group();
  crown.name = 'crown';
  crown.add(part(new THREE.TorusGeometry(0.15, 0.025, 4, 8), glow, [0, 0, 0], [Math.PI / 2, 0, 0]));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    crown.add(part(cone(0.035, 0.16 + (i % 2) * 0.08, 4), glow, [Math.sin(a) * 0.15, 0.08, Math.cos(a) * 0.15]));
  }
  crown.position.y = 1.13;
  g.add(crown);
  // Báculo
  const staff = new THREE.Group();
  staff.add(part(cyl(0.025, 0.03, 1.3, 5), dark, [0, 0.65, 0]));
  staff.add(part(ico(0.08, 0), glow, [0, 1.36, 0], [0, 0, 0], 'orb'));
  staff.position.set(0.38, 0, 0.1);
  staff.name = 'weapon';
  g.add(staff);
  // Fragmentos que orbitan
  const orbit = new THREE.Group();
  orbit.name = 'orbit';
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    orbit.add(part(new THREE.OctahedronGeometry(0.06), glow, [Math.sin(a) * 0.55, 0.7 + i * 0.12, Math.cos(a) * 0.55]));
  }
  g.add(orbit);
  g.scale.setScalar(1.25);
  return g;
}

function brute(): THREE.Group {
  const g = new THREE.Group();
  const hide = mat(0x2a1822, { emissive: 0x200810, emissiveIntensity: 0.6, roughness: 1 });
  const bone = mat(0xcfc3a8, { roughness: 0.7 });
  const eye = mat(0xff7a1a, { emissive: 0xff7a1a, emissiveIntensity: 5 });
  // Cuerpo encorvado y macizo
  g.add(part(new THREE.DodecahedronGeometry(0.3, 0), hide, [0, 0.42, -0.02], [0.3, 0, 0]));
  g.add(part(ico(0.2, 0), hide, [0, 0.62, 0.12], [0, 0, 0], 'head'));
  g.add(part(cone(0.05, 0.18, 4), bone, [-0.13, 0.8, 0.1], [0, 0, 0.5]));
  g.add(part(cone(0.05, 0.18, 4), bone, [0.13, 0.8, 0.1], [0, 0, -0.5]));
  g.add(part(ico(0.03, 0), eye, [-0.07, 0.64, 0.29]));
  g.add(part(ico(0.03, 0), eye, [0.07, 0.64, 0.29]));
  // Brazos largos con garrote
  g.add(part(cyl(0.07, 0.09, 0.42, 6), hide, [-0.3, 0.32, 0.05], [0.2, 0, 0.25]));
  const club = new THREE.Group();
  club.name = 'weapon';
  club.add(part(cyl(0.07, 0.11, 0.42, 6), hide, [0, 0.18, 0]));
  club.add(part(new THREE.DodecahedronGeometry(0.12, 0), bone, [0, 0.42, 0]));
  club.position.set(0.32, 0.1, 0.08);
  club.rotation.set(0.5, 0, -0.2);
  g.add(club);
  g.add(part(box(0.1, 0.16, 0.12), hide, [-0.1, 0.08, 0]));
  g.add(part(box(0.1, 0.16, 0.12), hide, [0.1, 0.08, 0]));
  g.scale.setScalar(1.1);
  return g;
}

/** Guarida: agujas de obsidiana alrededor de un portal violeta. */
function lair(): THREE.Group {
  const g = new THREE.Group();
  const rock = mat(0x15101c, { roughness: 0.5, metalness: 0.3, emissive: 0x12001e, emissiveIntensity: 0.8 });
  const glow = mat(0x9b3dff, { emissive: 0x9b3dff, emissiveIntensity: 4 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const h = 0.5 + (i % 3) * 0.25;
    g.add(part(cone(0.1, h, 4), rock, [Math.sin(a) * 0.55, h / 2, Math.cos(a) * 0.55], [Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25]));
  }
  g.add(part(cyl(0.45, 0.55, 0.12, 7), rock, [0, 0.06, 0]));
  const portal = new THREE.Group();
  portal.name = 'portal';
  portal.add(part(new THREE.TorusGeometry(0.3, 0.05, 6, 14), glow, [0, 0, 0]));
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(0.27, 16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.1, 1.2), transparent: true, opacity: 0.75, side: THREE.DoubleSide, toneMapped: false }),
  );
  portal.add(core);
  portal.position.y = 0.55;
  g.add(portal);
  return g;
}

export function createUnitModel(kind: UnitKind): THREE.Group {
  switch (kind) {
    case 'militia':
      return militia();
    case 'archer':
      return archer();
    case 'lair':
      return lair();
    case 'brute':
      return brute();
    case 'hero':
      return hero();
    case 'soldier':
      return soldier();
    case 'shade':
      return shade();
    case 'king':
      return king();
  }
}

// ───────────────────────── estructuras ─────────────────────────

export function tower(): THREE.Group {
  const g = new THREE.Group();
  const stone = mat(P.stone, { fow: true });
  const stoneDark = mat(P.stoneDark, { fow: true });
  g.add(part(cyl(0.32, 0.36, 0.2, 8), stoneDark, [0, 0.1, 0]));
  g.add(part(cyl(0.23, 0.27, 0.85, 8), stone, [0, 0.62, 0]));
  g.add(part(cyl(0.31, 0.29, 0.14, 8), stoneDark, [0, 1.1, 0]));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(part(box(0.08, 0.1, 0.08), stone, [Math.sin(a) * 0.27, 1.21, Math.cos(a) * 0.27], [0, a, 0]));
  }
  g.add(part(cone(0.3, 0.45, 8), mat(P.roof, { fow: true }), [0, 1.45, 0]));
  const win = mat(P.window, { emissive: P.window, emissiveIntensity: 2.5, fow: true, nightGlow: true });
  g.add(part(box(0.07, 0.13, 0.04), win, [0, 0.75, 0.25]));
  g.add(part(box(0.04, 0.13, 0.07), win, [0.25, 0.55, 0]));
  // Banderín
  g.add(part(cyl(0.01, 0.01, 0.3, 4), mat(P.woodDark, { fow: true }), [0, 1.8, 0]));
  g.add(part(box(0.18, 0.1, 0.01), mat(P.dawn, { fow: true }), [0.09, 1.88, 0], [0, 0, 0], 'flag'));
  return g;
}

export function bridge(angle: number): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(P.wood, { fow: true });
  const dark = mat(P.woodDark, { fow: true });
  for (let i = 0; i < 8; i++) {
    g.add(part(box(0.23, 0.05, 0.56), i % 2 ? wood : dark, [-0.875 + i * 0.25, 0.5, 0], [0, 0, (i % 3) * 0.02 - 0.02]));
  }
  for (const z of [-0.3, 0.3]) {
    g.add(part(box(1.95, 0.04, 0.04), dark, [0, 0.68, z]));
    for (const x of [-0.85, 0, 0.85]) g.add(part(cyl(0.025, 0.03, 0.55, 5), dark, [x, 0.42, z]));
  }
  g.rotation.y = angle;
  return g;
}

export function farm(): THREE.Group {
  const g = new THREE.Group();
  const soil = mat(0x7a5232, { fow: true });
  const crop = mat(0xe8c64a, { fow: true });
  const leaf = mat(0x8fbf4a, { fow: true });
  // Surcos de cultivo
  for (let i = 0; i < 4; i++) {
    const z = -0.35 + i * 0.2;
    g.add(part(box(0.8, 0.05, 0.12), soil, [-0.1, 0.025, z]));
    for (let k = 0; k < 5; k++) {
      g.add(part(cone(0.035, 0.16, 4), i % 2 ? crop : leaf, [-0.42 + k * 0.16, 0.12, z]));
    }
  }
  // Cabaña con tejado
  const wall = mat(0xd9c49a, { fow: true });
  g.add(part(box(0.26, 0.22, 0.24), wall, [0.48, 0.11, 0.3]));
  g.add(part(cone(0.24, 0.2, 4), mat(0xa0482e, { fow: true }), [0.48, 0.32, 0.3], [0, Math.PI / 4, 0]));
  g.add(part(box(0.06, 0.1, 0.01), mat(P.window, { emissive: P.window, emissiveIntensity: 2, fow: true, nightGlow: true }), [0.48, 0.12, 0.425]));
  // Molinillo
  const mill = new THREE.Group();
  mill.name = 'mill';
  for (let i = 0; i < 4; i++) {
    mill.add(part(box(0.03, 0.22, 0.01), mat(P.wood, { fow: true }), [0, 0.11, 0], [0, 0, (i * Math.PI) / 2]));
  }
  mill.children.forEach((c, i) => {
    c.position.set(Math.sin((i * Math.PI) / 2) * 0.11, Math.cos((i * Math.PI) / 2) * 0.11, 0);
  });
  mill.position.set(0.48, 0.32, 0.44);
  g.add(mill);
  return g;
}

export function camp(): { group: THREE.Group; flame: THREE.Object3D } {
  const g = new THREE.Group();
  const t1 = part(cone(0.32, 0.46, 4), mat(P.tent, { fow: true }), [-0.3, 0.23, -0.2], [0, Math.PI / 4 + 0.3, 0]);
  const t2 = part(cone(0.24, 0.36, 4), mat(P.tentAlt, { fow: true }), [0.3, 0.18, -0.28], [0, Math.PI / 4 - 0.4, 0]);
  g.add(t1, t2);
  const logs = mat(P.woodDark, { fow: true });
  g.add(part(cyl(0.025, 0.025, 0.3, 5), logs, [0.05, 0.03, 0.22], [0, 0.6, Math.PI / 2]));
  g.add(part(cyl(0.025, 0.025, 0.3, 5), logs, [0.05, 0.03, 0.22], [0, -0.6, Math.PI / 2]));
  const stones = mat(P.stoneDark, { fow: true });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    g.add(part(new THREE.DodecahedronGeometry(0.04), stones, [0.05 + Math.sin(a) * 0.16, 0.02, 0.22 + Math.cos(a) * 0.16]));
  }
  const flame = new THREE.Group();
  flame.add(part(cone(0.08, 0.24, 5), mat(P.fire, { emissive: P.fire, emissiveIntensity: 4 }), [0, 0.12, 0]));
  flame.add(part(cone(0.045, 0.16, 5), mat(0xffe08a, { emissive: 0xffe08a, emissiveIntensity: 5 }), [0, 0.1, 0]));
  flame.position.set(0.05, 0.02, 0.22);
  g.add(flame);
  return { group: g, flame };
}

// ───────────────────────── puntos de interés ─────────────────────────

function ruins(): THREE.Group {
  const g = new THREE.Group();
  const stone = mat(0xbdb4a2, { fow: true });
  const dark = mat(0x8f8674, { fow: true });
  const heights = [0.7, 0.35, 0.55, 0.2];
  heights.forEach((h, i) => {
    const a = (i / heights.length) * Math.PI * 2 + 0.4;
    g.add(part(cyl(0.08, 0.09, h, 7), i % 2 ? dark : stone, [Math.sin(a) * 0.45, h / 2, Math.cos(a) * 0.45]));
  });
  g.add(part(box(0.7, 0.08, 0.16), stone, [0.1, 0.74, 0.1], [0, 0.6, 0.08]));
  g.add(part(box(0.3, 0.14, 0.2), dark, [-0.2, 0.07, -0.1], [0.2, 0.5, 0.1]));
  g.add(part(new THREE.DodecahedronGeometry(0.1), stone, [0.25, 0.05, -0.3]));
  // Reliquia flotante: desaparece al saquear las ruinas.
  const relic = part(new THREE.OctahedronGeometry(0.1), mat(P.dawn, { emissive: P.dawn, emissiveIntensity: 3.5 }), [0, 0.45, 0], [0, 0, 0], 'relic');
  g.add(relic);
  return g;
}

function village(): THREE.Group {
  const g = new THREE.Group();
  const wall = mat(0xe4d3ad, { fow: true });
  const roofs = [mat(0xa0482e, { fow: true }), mat(0x6c4a8a, { fow: true }), mat(0x3f6b9a, { fow: true })];
  const win = mat(P.window, { emissive: P.window, emissiveIntensity: 2.2, fow: true, nightGlow: true });
  const houses: [number, number, number][] = [
    [-0.35, -0.2, 1],
    [0.3, -0.3, 0.85],
    [0.05, 0.35, 0.95],
  ];
  houses.forEach(([x, z, sc], i) => {
    const hut = new THREE.Group();
    hut.add(part(box(0.32, 0.26, 0.28), wall, [0, 0.13, 0]));
    hut.add(part(cone(0.3, 0.24, 4), roofs[i], [0, 0.38, 0], [0, Math.PI / 4, 0]));
    hut.add(part(box(0.07, 0.09, 0.01), win, [0.06, 0.14, 0.145]));
    hut.position.set(x, 0, z);
    hut.rotation.y = i * 1.3;
    hut.scale.setScalar(sc);
    g.add(hut);
  });
  // Pozo
  g.add(part(cyl(0.09, 0.1, 0.1, 8), mat(P.stoneDark, { fow: true }), [0.35, 0.05, 0.25]));
  // Estandarte: gris hasta que la aldea se une a ti.
  g.add(part(cyl(0.012, 0.012, 0.75, 4), mat(P.woodDark, { fow: true }), [-0.05, 0.37, -0.05]));
  const flag = part(box(0.22, 0.13, 0.01), mat(0x8a8a8a, { fow: true }), [0.06, 0.66, -0.05], [0, 0, 0], 'flag');
  g.add(flag);
  return g;
}

function shrine(): THREE.Group {
  const g = new THREE.Group();
  const stone = mat(0xa7a3b4, { fow: true });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const h = 0.32 + (i % 2) * 0.12;
    g.add(part(box(0.1, h, 0.08), stone, [Math.sin(a) * 0.5, h / 2, Math.cos(a) * 0.5], [0, a, 0]));
  }
  g.add(part(cyl(0.22, 0.26, 0.08, 8), stone, [0, 0.04, 0]));
  const crystal = part(new THREE.OctahedronGeometry(0.14), mat(0x8ff0ff, { emissive: 0x7fe6ff, emissiveIntensity: 3 }), [0, 0.5, 0], [0, 0, 0], 'crystal');
  crystal.scale.set(1, 1.6, 1);
  g.add(crystal);
  return g;
}

export function createPoiModel(kind: 'ruins' | 'village' | 'shrine'): THREE.Group {
  if (kind === 'ruins') return ruins();
  if (kind === 'village') return village();
  return shrine();
}

