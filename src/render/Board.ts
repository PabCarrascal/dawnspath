import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Hex, HexKey, key, neighbors } from '../core/hex';
import { Rng } from '../core/rng';
import type { StructureKind } from '../game/config';
import type { Tile } from '../game/types';
import { anim, ease } from './anim';
import { FogOfWar } from './FogOfWar';
import { BRIDGE_DECK, HEX_SIZE, WATER_LEVEL, capHeight, standHeight, worldPos } from './layout';
import { PALETTE as P, mat } from './materials';
import { createStructureModel, scaffold } from './buildings';
import { createPoiModel } from './models';
import type { Particles } from './Particles';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

/** Acumula geometrías por material y las fusiona en una sola malla cada una. */
class GeoBatch {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(material: THREE.Material, geo: THREE.BufferGeometry, pos: THREE.Vector3, rotY = 0, scale = new THREE.Vector3(1, 1, 1), rot?: THREE.Euler) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()) as THREE.BufferGeometry;
    _q.setFromEuler(rot ?? _e.set(0, rotY, 0));
    _m.compose(pos, _q, scale);
    g.applyMatrix4(_m);
    if (!this.buckets.has(material)) this.buckets.set(material, []);
    this.buckets.get(material)!.push(g);
  }

  build(parent: THREE.Object3D, shadows = true): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [material, geos] of this.buckets) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeVertexNormals();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      parent.add(mesh);
      out.push(mesh);
      geos.forEach((g) => g.dispose());
    }
    return out;
  }
}

interface StructureView {
  /** Raíz en la casilla; `model` es el edificio en sí (se escala con la obra). */
  group: THREE.Group;
  model: THREE.Group;
  kind: StructureKind;
  flame?: THREE.Object3D;
  scaffold?: THREE.Group;
  damaged: boolean;
}

interface CloudPuff {
  tile: HexKey;
  base: THREE.Vector3;
  scale: THREE.Vector3;
  phase: number;
  fade: number;
}

/**
 * Tablero 3D: casillas fusionadas por material, decoración procedural,
 * agua animada, nubes sobre lo inexplorado, fronteras del territorio,
 * resaltados de interacción y estructuras.
 */
export class Board {
  readonly root = new THREE.Group();
  readonly pickables: THREE.Object3D[] = [];

  private tiles: Map<HexKey, Tile>;
  private waterMat!: THREE.MeshStandardMaterial;
  private clouds!: THREE.InstancedMesh;
  private puffs: CloudPuff[] = [];
  private territory = new THREE.Group();
  private highlights = new Map<HexKey, THREE.Mesh>();
  private highlightGeo: THREE.BufferGeometry;
  private highlightRingGeo: THREE.BufferGeometry;
  private dangerGeo: THREE.BufferGeometry;
  private hoverRing: THREE.Mesh;
  private pathDots: THREE.Mesh[] = [];
  private structures = new Map<HexKey, StructureView>();
  private pois = new Map<HexKey, THREE.Group>();
  /** Luces fijas (cambiar el número de luces recompila los shaders). */
  private campLight: THREE.PointLight;
  private beaconLight: THREE.PointLight;
  private time = 0;
  private forests: Tile[] | null = null;

  constructor(
    tiles: Map<HexKey, Tile>,
    readonly fow: FogOfWar,
    waterNormal: THREE.Texture,
    private particles: Particles,
  ) {
    this.tiles = tiles;
    this.buildTiles(waterNormal);
    this.buildPois();
    this.buildClouds();
    this.root.add(this.territory);

    this.highlightGeo = new THREE.CircleGeometry(0.86, 6, Math.PI / 6).rotateX(-Math.PI / 2);
    this.highlightRingGeo = new THREE.RingGeometry(0.7, 0.8, 6, 1, Math.PI / 6).rotateX(-Math.PI / 2);
    this.dangerGeo = new THREE.CircleGeometry(0.95, 6, Math.PI / 6).rotateX(-Math.PI / 2).translate(0, -0.008, 0);
    const ringGeo = new THREE.RingGeometry(0.8, 0.94, 6, 1, Math.PI / 6).rotateX(-Math.PI / 2);
    this.hoverRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.hoverRing.visible = false;
    this.hoverRing.renderOrder = 5;
    this.root.add(this.hoverRing);

    const dotGeo = new THREE.SphereGeometry(0.06, 8, 6);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xbff6ff });
    for (let i = 0; i < 16; i++) {
      const d = new THREE.Mesh(dotGeo, dotMat);
      d.visible = false;
      this.pathDots.push(d);
      this.root.add(d);
    }

    this.campLight = new THREE.PointLight(0xff9a40, 0, 3.2, 1.6);
    this.beaconLight = new THREE.PointLight(P.dawn, 0, 9, 1.4);
    this.root.add(this.campLight, this.beaconLight);

    this.fow.setTiles(tiles, true);
  }

  // ───────────────────────── construcción ─────────────────────────

  private buildTiles(waterNormal: THREE.Texture) {
    const batch = new GeoBatch();
    const rng = new Rng(1234);
    const fow = { fow: true };
    const column = new THREE.CylinderGeometry(0.93, 0.9, 1, 6);
    const cap = new THREE.CylinderGeometry(0.965, 0.95, 0.12, 6);
    const dirt = mat(P.dirt, fow);
    const dirtDark = mat(P.dirtDark, fow);

    const pineLeaf = P.pine.map((c) => mat(c, fow));
    const trunk = mat(P.trunk, fow);
    const rocks = P.rock.map((c) => mat(c, fow));
    const snow = mat(P.snow, fow);
    const grass = mat(P.grass, fow);
    const flowers = P.flowers.map((c) => mat(c, fow));
    const sand = mat(P.sand, fow);

    const coneG = new THREE.ConeGeometry(1, 1, 6);
    const pineG = new THREE.ConeGeometry(1, 1, 7);
    const trunkG = new THREE.CylinderGeometry(0.03, 0.04, 0.16, 5);
    const rockG = new THREE.DodecahedronGeometry(1);
    const tuftG = new THREE.ConeGeometry(0.035, 0.12, 4);
    const flowerG = new THREE.IcosahedronGeometry(0.03);
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();

    for (const t of this.tiles.values()) {
      const { x, z } = worldPos(t);
      const top = capHeight(t);
      const bottom = -1.2;
      batch.add(t.variant > 0.5 ? dirt : dirtDark, column, v.set(x, (top - 0.1 + bottom) / 2, z), 0, s.set(1, top - 0.1 - bottom, 1));

      let capMat: THREE.Material;
      switch (t.terrain) {
        case 'plain':
          capMat = mat(P.plain[Math.floor(t.variant * 3)], fow);
          break;
        case 'forest':
          capMat = mat(P.forestFloor[Math.floor(t.variant * 2)], fow);
          break;
        case 'mountain':
          capMat = mat(P.mountainCap, fow);
          break;
        case 'ford':
          capMat = sand;
          break;
        case 'river':
          capMat = mat(P.riverBed, fow);
          break;
      }
      batch.add(capMat, cap, v.set(x, top - 0.06, z));

      // Las casillas con punto de interés quedan despejadas para su modelo.
      if (t.poi) continue;
      const jitter = (r: number) => ({ dx: rng.range(-r, r), dz: rng.range(-r, r) });

      if (t.terrain === 'forest') {
        const n = 3 + Math.floor(rng.next() * 3);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rng.next();
          const d = i === 0 && n > 3 ? 0 : rng.range(0.3, 0.55);
          const px = x + Math.cos(a) * d;
          const pz = z + Math.sin(a) * d;
          const h = rng.range(0.45, 0.75);
          const r = h * rng.range(0.32, 0.4);
          const leaf = rng.pick(pineLeaf);
          batch.add(trunk, trunkG, v.set(px, top + 0.08, pz));
          batch.add(leaf, pineG, v.set(px, top + 0.14 + h / 2, pz), rng.next() * 6, s.set(r, h, r));
          batch.add(leaf, pineG, v.set(px, top + 0.14 + h * 0.85, pz), rng.next() * 6, s.set(r * 0.7, h * 0.55, r * 0.7));
        }
      } else if (t.terrain === 'mountain') {
        const n = 1 + Math.floor(rng.next() * 3);
        for (let i = 0; i < n; i++) {
          const { dx, dz } = i === 0 ? { dx: 0, dz: 0 } : jitter(0.42);
          const h = i === 0 ? rng.range(1.0, 1.45) : rng.range(0.5, 0.8);
          const r = i === 0 ? rng.range(0.55, 0.68) : rng.range(0.3, 0.42);
          const rot = rng.next() * 6;
          batch.add(rng.pick(rocks), coneG, v.set(x + dx, top + h / 2, z + dz), rot, s.set(r, h, r));
          if (h > 0.7) {
            const k = 0.34;
            batch.add(snow, coneG, v.set(x + dx, top + h - (h * k) / 2 + 0.005, z + dz), rot, s.set(r * k * 1.04, h * k, r * k * 1.04));
          }
        }
      } else if (t.terrain === 'plain') {
        const tufts = Math.floor(rng.next() * 5);
        for (let i = 0; i < tufts; i++) {
          const { dx, dz } = jitter(0.65);
          batch.add(grass, tuftG, v.set(x + dx, top + 0.05, z + dz), rng.next() * 6);
        }
        if (rng.chance(0.4)) {
          const f = rng.pick(flowers);
          for (let i = 0; i < 3; i++) {
            const { dx, dz } = jitter(0.6);
            batch.add(f, flowerG, v.set(x + dx, top + 0.03, z + dz));
          }
        }
        if (rng.chance(0.2)) {
          const { dx, dz } = jitter(0.55);
          const r = rng.range(0.07, 0.13);
          batch.add(rng.pick(rocks), rockG, v.set(x + dx, top + r * 0.4, z + dz), rng.next() * 6, s.set(r, r * 0.7, r));
        }
      } else if (t.terrain === 'ford') {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + rng.next() * 0.5;
          const d = rng.range(0.15, 0.6);
          const r = rng.range(0.09, 0.14);
          batch.add(rng.pick(rocks), rockG, v.set(x + Math.cos(a) * d, WATER_LEVEL - 0.02, z + Math.sin(a) * d), rng.next() * 6, s.set(r, r * 0.5, r));
        }
      }
    }

    const meshes = batch.build(this.root);
    this.pickables.push(...meshes);

    // Agua: una superficie hexagonal por casilla de río o vado.
    this.waterMat = this.fow.patch(
      new THREE.MeshStandardMaterial({
        color: P.water,
        roughness: 0.08,
        metalness: 0.1,
        transparent: true,
        opacity: 0.86,
        normalMap: waterNormal,
        normalScale: new THREE.Vector2(0.35, 0.35),
      }),
    );
    const waterBatch = new GeoBatch();
    const waterG = new THREE.CylinderGeometry(0.985, 0.985, 0.04, 6);
    for (const t of this.tiles.values()) {
      if (t.terrain !== 'river' && t.terrain !== 'ford') continue;
      const { x, z } = worldPos(t);
      waterBatch.add(this.waterMat, waterG, v.set(x, WATER_LEVEL - 0.02, z));
    }
    const water = waterBatch.build(this.root, false);
    this.pickables.push(...water);
  }

  private buildClouds() {
    const rng = new Rng(77);
    const per = 3;
    const geo = new THREE.IcosahedronGeometry(0.5, 0);
    const material = new THREE.MeshStandardMaterial({ color: 0xa9b2c8, roughness: 1, flatShading: true });
    this.clouds = new THREE.InstancedMesh(geo, material, this.tiles.size * per);
    this.clouds.castShadow = true;
    this.clouds.receiveShadow = true;
    for (const t of this.tiles.values()) {
      const { x, z } = worldPos(t);
      for (let k = 0; k < per; k++) {
        const a = rng.next() * Math.PI * 2;
        const big = k === 0;
        const d = big ? rng.range(0, 0.2) : rng.range(0.3, 0.65);
        const sc = big ? rng.range(1.5, 1.9) : rng.range(0.7, 1.05);
        this.puffs.push({
          tile: key(t),
          base: new THREE.Vector3(x + Math.cos(a) * d, big ? 0.95 : 1.1 + rng.range(0, 0.25), z + Math.sin(a) * d),
          scale: new THREE.Vector3(sc, sc * (big ? 0.38 : 0.7), sc),
          phase: rng.next() * Math.PI * 2,
          fade: t.explored ? 0 : 1,
        });
      }
    }
    this.clouds.count = this.puffs.length;
    this.root.add(this.clouds);
    this.updateClouds();
  }

  // ───────────────────────── actualización ─────────────────────────

  update(dt: number, nightFactor: number) {
    this.time += dt / 1000;
    const tex = this.waterMat.normalMap!;
    tex.offset.set(this.time * 0.02, this.time * 0.013);

    this.fow.update(dt);
    this.updateClouds();

    const pulse = 0.5 + 0.5 * Math.sin(this.time * 3.2);
    for (const m of this.highlights.values()) {
      const material = m.material as THREE.MeshBasicMaterial;
      if (m.userData.pulse) material.opacity = 0.25 + pulse * 0.35;
    }
    (this.hoverRing.material as THREE.MeshBasicMaterial).opacity = 0.55 + pulse * 0.35;
    this.territory.children.forEach((c) => {
      ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 1.1 + nightFactor * 0.5;
    });

    for (const [k, g] of this.pois) {
      const relic = g.getObjectByName('relic');
      if (relic) {
        relic.position.y = 0.45 + Math.sin(this.time * 2 + p0(k)) * 0.06;
        relic.rotation.y = this.time * 1.5;
      }
      const crystal = g.getObjectByName('crystal');
      if (crystal) {
        crystal.position.y = 0.55 + Math.sin(this.time * 1.4) * 0.05;
        crystal.rotation.y = this.time * 0.7;
      }
      const flag = g.getObjectByName('flag');
      if (flag) flag.rotation.y = Math.sin(this.time * 2.2 + p0(k)) * 0.35;
    }

    const flicker = 1 + Math.sin(this.time * 17) * 0.08 + Math.sin(this.time * 31) * 0.05;
    this.campLight.intensity = 0;
    this.beaconLight.intensity = 0;
    for (const [k, sv] of this.structures) {
      const p = sv.group.position;
      const visible = this.tiles.get(k)?.visible;
      if (sv.flame && !sv.scaffold) {
        sv.flame.scale.set(1, flicker, 1);
        if (sv.kind === 'castle') {
          const f = sv.flame.getWorldPosition(_p);
          this.campLight.position.set(f.x, f.y + 0.25, f.z);
          this.campLight.intensity = (0.6 + nightFactor * 3.2) * flicker;
        }
        if (sv.kind === 'beacon') {
          sv.flame.position.y = 1.5 + Math.sin(this.time * 2) * 0.05;
          sv.flame.rotation.y = this.time;
          this.beaconLight.position.set(p.x, p.y + 1.9, p.z);
          this.beaconLight.intensity = 3 + nightFactor * 9;
        }
        if (visible && Math.random() < dt / 110) {
          const f = sv.flame.getWorldPosition(_p);
          this.particles.emit({ pos: f, count: 1, color: 0xffa040, speed: 0.25, up: 0.9, life: 1400, size: 0.07, gravity: -0.15 });
        }
      }
      // Humo en los edificios dañados.
      if (sv.damaged && visible && Math.random() < dt / 140) {
        this.particles.emit({ pos: _p.set(p.x, p.y + 0.5, p.z), count: 1, color: 0x2a2a2a, speed: 0.15, up: 0.6, life: 1800, size: 0.22, gravity: -0.1, spread: 0.3 });
      }
      const crown = sv.model.getObjectByName('crown');
      if (crown) crown.rotation.y = this.time * 1.2;
      const mill = sv.model.getObjectByName('mill');
      if (mill && !sv.scaffold) mill.rotation.z += dt * 0.0012;
      for (const name of ['flag', 'flag2']) {
        const flag = sv.model.getObjectByName(name);
        if (flag) flag.rotation.y = Math.sin(this.time * 2.4 + p0(k) + name.length) * 0.35;
      }
    }
  }

  private updateClouds() {
    const visible = (k: HexKey) => this.tiles.get(k)?.explored ?? true;
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      const target = visible(p.tile) ? 0 : 1;
      p.fade += (target - p.fade) * 0.06;
      const f = p.fade < 0.01 ? 0 : p.fade;
      const bob = Math.sin(this.time * 0.6 + p.phase) * 0.06;
      _p.copy(p.base).setY(p.base.y + bob + (1 - f) * 0.8);
      _s.copy(p.scale).multiplyScalar(f);
      _q.setFromEuler(_e.set(0, this.time * 0.05 + p.phase, 0));
      _m.compose(_p, _q, _s);
      this.clouds.setMatrixAt(i, _m);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  private buildPois() {
    for (const t of this.tiles.values()) {
      if (!t.poi) continue;
      const g = createPoiModel(t.poi);
      const { x, z } = worldPos(t);
      g.position.set(x, capHeight(t), z);
      g.rotation.y = t.variant * Math.PI * 2;
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      this.root.add(g);
      this.pois.set(key(t), g);
      this.applyPoiState(t);
    }
  }

  /** Refleja si el punto de interés ya se usó (reliquia, estandarte…). */
  applyPoiState(h: Hex) {
    const t = this.tiles.get(key(h));
    const g = this.pois.get(key(h));
    if (!t || !g) return;
    const relic = g.getObjectByName('relic');
    if (relic) relic.visible = !t.poiUsed;
    const flag = g.getObjectByName('flag') as THREE.Mesh | undefined;
    if (flag) flag.material = mat(t.poiUsed && t.owned ? P.dawn : 0x8a8a8a, { fow: true });
  }

  /** Destello al descubrir un punto de interés. */
  celebratePoi(h: Hex, color: number) {
    this.applyPoiState(h);
    const t = this.tiles.get(key(h));
    if (!t) return;
    const { x, z } = worldPos(h);
    this.particles.emit({ pos: _p.set(x, capHeight(t) + 0.4, z), count: 60, color, speed: 1.1, up: 2, life: 1600, size: 0.12, gravity: 0.5, spread: 0.5 });
  }

  syncVision() {
    this.fow.setTiles(this.tiles);
  }

  // ───────────────────────── territorio ─────────────────────────

  rebuildTerritory(pulse: Hex[] = []) {
    for (const k of this.pois.keys()) this.applyPoiState(this.tiles.get(k)!);
    for (const c of this.territory.children) (c as THREE.Mesh).geometry.dispose();
    this.territory.clear();
    const material = mat(P.dawn, { emissive: P.dawn, emissiveIntensity: 1.4 });
    const geos: THREE.BufferGeometry[] = [];
    const corners = (cx: number, cz: number) =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 180) * (60 * i - 30);
        return new THREE.Vector2(cx + Math.cos(a) * 0.9 * HEX_SIZE, cz + Math.sin(a) * 0.9 * HEX_SIZE);
      });

    for (const t of this.tiles.values()) {
      if (!t.owned) continue;
      const c = worldPos(t);
      const cs = corners(c.x, c.z);
      const y = (t.terrain === 'river' && !t.structure ? WATER_LEVEL : t.terrain === 'river' ? BRIDGE_DECK : capHeight(t)) + 0.02;
      for (const n of neighbors(t)) {
        const nt = this.tiles.get(key(n));
        if (nt?.owned) continue;
        const nc = worldPos(n);
        const mid = new THREE.Vector2((c.x + nc.x) / 2, (c.z + nc.z) / 2);
        const [a, b] = [...cs].sort((p, q) => p.distanceTo(mid) - q.distanceTo(mid));
        const len = a.distanceTo(b);
        const g = new THREE.BoxGeometry(len + 0.05, 0.035, 0.05).toNonIndexed();
        _q.setFromEuler(_e.set(0, -Math.atan2(b.y - a.y, b.x - a.x), 0));
        _m.compose(_p.set((a.x + b.x) / 2, y, (a.y + b.y) / 2), _q, _s.set(1, 1, 1));
        g.applyMatrix4(_m);
        geos.push(g);
      }
    }
    if (geos.length) {
      const merged = mergeGeometries(geos);
      geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, material.clone());
      this.territory.add(mesh);
    }
    for (const h of pulse) {
      const t = this.tiles.get(key(h));
      if (!t) continue;
      const { x, z } = worldPos(h);
      this.particles.emit({
        pos: _p.set(x, standHeight(t) + 0.05, z),
        count: 10,
        color: P.dawn,
        speed: 0.5,
        up: 0.6,
        life: 900,
        size: 0.08,
        spread: 0.6,
      });
    }
  }

  // ───────────────────────── resaltados ─────────────────────────

  clearHighlights() {
    for (const m of this.highlights.values()) m.visible = false;
  }

  highlight(
    hexes: Hex[],
    color: number,
    opacity = 0.32,
    pulse = false,
    style: 'fill' | 'ring' | 'danger' = 'fill',
  ) {
    for (const h of hexes) {
      const k = key(h);
      const t = this.tiles.get(k);
      if (!t) continue;
      const id = `${style}:${k}`;
      let m = this.highlights.get(id);
      if (!m) {
        m = new THREE.Mesh(
          style === 'ring' ? this.highlightRingGeo : style === 'danger' ? this.dangerGeo : this.highlightGeo,
          new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
        );
        m.renderOrder = style === 'danger' ? 3 : 4;
        this.root.add(m);
        this.highlights.set(id, m);
      }
      const { x, z } = worldPos(t);
      m.position.set(x, standHeight(t) + 0.03, z);
      const material = m.material as THREE.MeshBasicMaterial;
      material.color.setHex(color);
      material.opacity = opacity;
      m.userData.pulse = pulse;
      m.visible = true;
    }
  }

  setHover(h: Hex | null, color = 0xffffff) {
    const t = h && this.tiles.get(key(h));
    if (!t) {
      this.hoverRing.visible = false;
      return;
    }
    const { x, z } = worldPos(t);
    this.hoverRing.position.set(x, standHeight(t) + 0.04, z);
    (this.hoverRing.material as THREE.MeshBasicMaterial).color.setHex(color);
    this.hoverRing.visible = true;
  }

  showPath(path: Hex[]) {
    this.pathDots.forEach((d) => (d.visible = false));
    const pts: THREE.Vector3[] = path.map((h) => {
      const t = this.tiles.get(key(h))!;
      const { x, z } = worldPos(h);
      return new THREE.Vector3(x, standHeight(t) + 0.12, z);
    });
    let i = 0;
    for (let s = 0; s < pts.length - 1 && i < this.pathDots.length; s++) {
      for (const f of [0.33, 0.66, 1]) {
        if (i >= this.pathDots.length) break;
        const d = this.pathDots[i++];
        d.position.lerpVectors(pts[s], pts[s + 1], f);
        d.scale.setScalar(f === 1 ? 1.6 : 1);
        d.visible = true;
      }
    }
  }

  // ───────────────────────── estructuras ─────────────────────────

  addStructure(
    at: Hex,
    kind: StructureKind,
    opts: { animate?: boolean; work?: number; total?: number; level?: number } = {},
  ): Promise<void> {
    const t = this.tiles.get(key(at))!;
    const { x, z } = worldPos(at);
    let angle = 0;
    if (kind === 'bridge') {
      // Orienta el puente hacia el par de vecinos opuestos más transitable.
      const ns = neighbors(at).map((n) => this.tiles.get(key(n)));
      let best = 0;
      let bestScore = -1;
      for (let i = 0; i < 3; i++) {
        const ok = (t?: Tile) => (t && t.terrain !== 'river' && t.terrain !== 'mountain' ? 1 : 0);
        const score = ok(ns[i]) + ok(ns[i + 3]);
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
      angle = (best * Math.PI) / 3;
    }
    const built = createStructureModel(kind, { bridgeAngle: angle, level: opts.level });
    const group = new THREE.Group();
    group.position.set(x, kind === 'bridge' ? 0 : standHeight({ ...t, structure: null }), z);
    if (kind !== 'bridge' && kind !== 'wall' && kind !== 'castle') built.group.rotation.y += t.variant * Math.PI * 2;
    group.add(built.group);
    const sv: StructureView = { group, model: built.group, kind, flame: built.flame, damaged: false };
    this.root.add(group);
    this.structures.set(key(at), sv);

    const work = opts.work ?? 0;
    if (work > 0) {
      sv.scaffold = scaffold();
      if (kind !== 'bridge') group.add(sv.scaffold);
      this.applyProgress(sv, work, opts.total ?? work);
    }
    if (!opts.animate) return Promise.resolve();

    this.particles.emit({ pos: _p.set(x, standHeight(t), z), count: 24, color: 0xd8c7a3, speed: 1.2, up: 0.8, life: 900, size: 0.12, gravity: 1.2, spread: 0.5 });
    const target = sv.model.scale.y;
    sv.model.scale.y = 0.01;
    return anim.tween(650, (k) => (sv.model.scale.y = Math.max(0.01, k * target)), ease.elasticOut);
  }

  /** Durante la obra el edificio "crece" entre los andamios. */
  private applyProgress(sv: StructureView, left: number, total: number) {
    const done = 1 - left / Math.max(1, total);
    sv.model.scale.y = 0.15 + done * 0.6;
  }

  setProgress(at: Hex, left: number, total: number) {
    const sv = this.structures.get(key(at));
    if (!sv) return;
    const from = sv.model.scale.y;
    const to = 0.15 + (1 - left / Math.max(1, total)) * 0.6;
    const p = sv.group.position;
    this.particles.emit({ pos: _p.set(p.x, p.y + 0.4, p.z), count: 10, color: 0xd8c7a3, speed: 0.6, up: 0.8, life: 700, size: 0.08, gravity: 1, spread: 0.4 });
    return anim.tween(500, (k) => (sv.model.scale.y = from + (to - from) * k), ease.out);
  }

  async completeStructure(at: Hex) {
    const sv = this.structures.get(key(at));
    if (!sv) return;
    if (sv.scaffold) {
      sv.group.remove(sv.scaffold);
      sv.scaffold = undefined;
    }
    const p = sv.group.position;
    this.particles.emit({ pos: _p.set(p.x, p.y + 0.4, p.z), count: 40, color: P.dawn, speed: 1, up: 1.6, life: 1200, size: 0.1, gravity: 0.6, spread: 0.5 });
    const from = sv.model.scale.y;
    await anim.tween(700, (k) => (sv.model.scale.y = from + (1 - from) * k), ease.elasticOut);
  }

  /** Sustituye el modelo del castillo por el del nuevo nivel. */
  async setCastleLevel(at: Hex, level: number) {
    const sv = this.structures.get(key(at));
    if (!sv) return;
    const p = sv.group.position;
    this.particles.emit({ pos: _p.set(p.x, p.y + 0.3, p.z), count: 60, color: 0xd8c7a3, speed: 1.6, up: 1.4, life: 1200, size: 0.14, gravity: 1, spread: 0.8 });
    await anim.tween(300, (k) => sv.model.scale.set(1 + k * 0.05, 1 - k * 0.9, 1 + k * 0.05), ease.in);
    sv.group.remove(sv.model);
    const built = createStructureModel('castle', { level });
    sv.model = built.group;
    sv.flame = built.flame;
    sv.group.add(sv.model);
    this.particles.emit({ pos: _p.set(p.x, p.y + 0.8, p.z), count: 90, color: P.dawn, speed: 1.4, up: 2.4, life: 1800, size: 0.13, gravity: 0.4, spread: 0.6 });
    sv.model.scale.y = 0.1;
    await anim.tween(900, (k) => (sv.model.scale.y = Math.max(0.1, k)), ease.elasticOut);
  }

  structureHit(at: Hex, hp: number, max: number) {
    const sv = this.structures.get(key(at));
    if (!sv) return;
    sv.damaged = hp < max * 0.5;
    const p = sv.group.position;
    this.particles.emit({ pos: _p.set(p.x, p.y + 0.35, p.z), count: 16, color: 0xffb070, speed: 1.4, up: 1, life: 600, size: 0.08, gravity: 2.5, spread: 0.3 });
    const base = sv.model.position.clone();
    anim.tween(300, (k) => {
      const a = Math.sin(k * Math.PI * 6) * (1 - k) * 0.05;
      sv.model.position.set(base.x + a, base.y, base.z - a);
    }, ease.linear);
  }

  repaired(at: Hex, hp: number, max: number) {
    const sv = this.structures.get(key(at));
    if (!sv) return;
    sv.damaged = hp < max * 0.5;
  }

  async removeStructure(at: Hex) {
    const k = key(at);
    const sv = this.structures.get(k);
    if (!sv) return;
    this.structures.delete(k);
    const p = sv.group.position;
    this.particles.emit({ pos: _p.set(p.x, p.y + 0.3, p.z), count: 30, color: 0x6a5a4a, speed: 1.6, up: 1.2, life: 1100, size: 0.13, gravity: 2, spread: 0.5 });
    await anim.tween(500, (q) => {
      sv.group.scale.set(1 + q * 0.2, 1 - q, 1 + q * 0.2);
      sv.group.rotation.z = q * 0.3;
    }, ease.in);
    this.root.remove(sv.group);
  }

  /** Luciérnagas sobre los bosques visibles al anochecer. */
  ambient(dt: number, nightFactor: number) {
    if (nightFactor < 0.45) return;
    if (!this.forests) this.forests = [...this.tiles.values()].filter((t) => t.terrain === 'forest');
    const rate = (dt / 1000) * 14 * nightFactor;
    const count = Math.min(4, Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0));
    for (let i = 0; i < count; i++) {
      const t = this.forests[Math.floor(Math.random() * this.forests.length)];
      if (!t?.visible) continue;
      const { x, z } = worldPos(t);
      this.particles.emit({
        pos: _p.set(x + (Math.random() - 0.5) * 1.4, capHeight(t) + 0.3 + Math.random() * 0.6, z + (Math.random() - 0.5) * 1.4),
        count: 1,
        color: 0xc8ff6a,
        speed: 0.12,
        up: 0.08,
        life: 2600,
        size: 0.06,
        gravity: 0,
        spread: 0.05,
      });
    }
  }

  dispose() {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.clouds.dispose();
    for (const m of this.highlights.values()) (m.material as THREE.Material).dispose();
    this.root.removeFromParent();
  }

  tileTop(h: Hex): number {
    const t = this.tiles.get(key(h));
    return t ? standHeight(t) : 0.4;
  }
}

const p0 = (k: string) => k.length * 1.7;
