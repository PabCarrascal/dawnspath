import * as THREE from 'three';
import { Hex, key } from '../core/hex';
import type { Unit } from '../game/types';
import type { UnitKind } from '../game/config';
import { anim, ease, lerp } from './anim';
import type { Board } from './Board';
import { worldPos } from './layout';
import { PALETTE as P } from './materials';
import { createUnitModel } from './models';
import type { Particles } from './Particles';
import type { World } from './World';

const LABEL_HEIGHT: Record<UnitKind, number> = {
  hero: 1.05,
  militia: 0.95,
  soldier: 1.0,
  archer: 1.0,
  shade: 1.0,
  brute: 1.05,
  king: 2.05,
  lair: 1.3,
};

class UnitView {
  readonly root = new THREE.Group();
  readonly model: THREE.Group;
  readonly label: HTMLDivElement;
  private bar: HTMLDivElement;
  private emissives: { m: THREE.MeshStandardMaterial; color: THREE.Color; intensity: number }[] = [];
  hex: Hex;
  hp: number;
  maxHp: number;
  private badge: HTMLSpanElement;
  shown = true;
  phase = Math.random() * 10;
  /** Desplazamiento animado (saltos, embestidas) sobre la posición base. */
  offset = new THREE.Vector3();
  baseY = 0;
  awake = false;

  constructor(readonly unit: Unit, labels: HTMLElement) {
    this.hex = { q: unit.q, r: unit.r };
    this.hp = unit.hp;
    this.maxHp = unit.maxHp;
    this.model = createUnitModel(unit.kind);
    // Materiales propios para poder hacer destellos por unidad.
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = (mesh.material as THREE.MeshStandardMaterial).clone();
      mesh.material = m;
      // Los materiales básicos (portales, halos) no tienen emisivo que animar.
      if (m.emissive) this.emissives.push({ m, color: m.emissive.clone(), intensity: m.emissiveIntensity });
    });
    this.root.add(this.model);
    this.root.userData.unitId = unit.id;

    this.label = document.createElement('div');
    this.label.className = `unit-label team-${unit.team} kind-${unit.kind}`;
    this.bar = document.createElement('div');
    this.bar.className = 'unit-hp-fill';
    const track = document.createElement('div');
    track.className = 'unit-hp';
    track.appendChild(this.bar);
    this.badge = document.createElement('span');
    this.badge.className = 'unit-badge';
    this.label.append(this.badge, track);
    labels.appendChild(this.label);
    if (unit.level) this.setLevel(unit.level);
    this.setHp(unit.hp);
  }

  setLevel(level: number) {
    this.badge.textContent = level > 1 ? String(level) : '';
    this.badge.classList.toggle('on', level > 1);
  }

  setDanger(on: boolean) {
    this.label.classList.toggle('danger', on);
  }

  setHp(hp: number, maxHp = this.maxHp) {
    this.hp = hp;
    this.maxHp = maxHp;
    const pct = Math.max(0, hp / maxHp);
    this.bar.style.width = `${pct * 100}%`;
    this.bar.dataset.level = pct > 0.6 ? 'high' : pct > 0.3 ? 'mid' : 'low';
  }

  flash(color: number, strength = 1) {
    const c = new THREE.Color(color);
    return anim.tween(380, (k) => {
      const f = (1 - k) * strength;
      for (const e of this.emissives) {
        e.m.emissive.copy(e.color).lerp(c, f);
        e.m.emissiveIntensity = lerp(e.intensity, 2.5, f);
      }
    }, ease.out);
  }

  setGlow(mult: number) {
    for (const e of this.emissives) {
      if (e.color.getHex() !== 0) e.m.emissiveIntensity = e.intensity * mult;
    }
  }

  dispose() {
    this.label.remove();
  }
}

/** Gestiona la representación 3D de todas las unidades y sus animaciones. */
export class Units {
  readonly root = new THREE.Group();
  private views = new Map<number, UnitView>();
  private labels: HTMLElement;
  private selection: THREE.Mesh;
  private selectedId: number | null = null;
  private lantern = new THREE.PointLight(0xffb35a, 0, 3.4, 1.4);
  private aura = new THREE.PointLight(P.kingGlow, 0, 7, 1.3);
  private beacon: THREE.Mesh;
  private time = 0;

  constructor(
    private world: World,
    private board: Board,
    private particles: Particles,
  ) {
    this.labels = document.getElementById('labels')!;
    const ring = new THREE.RingGeometry(0.62, 0.78, 6, 1, Math.PI / 6).rotateX(-Math.PI / 2);
    this.selection = new THREE.Mesh(
      ring,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 0.6), transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
    );
    this.selection.visible = false;
    this.selection.renderOrder = 6;
    this.root.add(this.selection, this.lantern, this.aura);

    // Columna de luz sobre el Rey: visible desde el principio, guía al jugador.
    const beaconGeo = new THREE.CylinderGeometry(0.35, 0.6, 40, 16, 1, true);
    beaconGeo.translate(0, 20, 0);
    this.beacon = new THREE.Mesh(
      beaconGeo,
      new THREE.MeshBasicMaterial({
        color: P.kingGlow,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    this.root.add(this.beacon);
  }

  get pickables(): THREE.Object3D[] {
    return [...this.views.values()].filter((v) => v.shown).map((v) => v.root);
  }

  idFromObject(o: THREE.Object3D | null): number | null {
    while (o) {
      if (o.userData.unitId !== undefined) return o.userData.unitId;
      o = o.parent;
    }
    return null;
  }

  has(id: number) {
    return this.views.has(id);
  }

  positionOf(id: number): THREE.Vector3 | null {
    const v = this.views.get(id);
    return v ? v.root.position.clone() : null;
  }

  private place(v: UnitView, h: Hex) {
    const { x, z } = worldPos(h);
    v.hex = { q: h.q, r: h.r };
    v.baseY = this.board.tileTop(h);
    v.root.position.set(x, v.baseY, z);
  }

  /** Quita todas las unidades (al cargar otra partida). */
  clear() {
    for (const v of this.views.values()) {
      this.root.remove(v.root);
      v.dispose();
    }
    this.views.clear();
    this.selectedId = null;
  }

  /** El tablero puede cambiar al cargar otra partida. */
  setBoard(board: Board) {
    this.board = board;
  }

  add(unit: Unit, spawnAnim = false): Promise<void> {
    const v = new UnitView(unit, this.labels);
    this.place(v, unit);
    // Mira hacia el centro del tablero.
    v.root.rotation.y = Math.atan2(-v.root.position.x, -v.root.position.z);
    this.views.set(unit.id, v);
    this.root.add(v.root);
    if (!spawnAnim) return Promise.resolve();

    const p = v.root.position.clone();
    const color = unit.team === 'night' ? 0x7a2cff : P.dawn;
    this.particles.emit({ pos: p, count: 26, color, speed: 0.8, up: 1.4, life: 1000, size: 0.12, gravity: 0.6, spread: 0.4 });
    v.model.scale.setScalar(0.01);
    v.offset.y = -0.4;
    return anim.tween(700, (k) => {
      v.model.scale.setScalar(Math.max(0.01, k));
      v.offset.y = -0.4 * (1 - k);
    }, ease.backOut);
  }

  setVisible(id: number, visible: boolean) {
    const v = this.views.get(id);
    if (!v) return;
    v.shown = visible;
    v.root.visible = visible;
  }

  select(id: number | null) {
    this.selectedId = id;
  }

  setDanger(ids: Set<number>) {
    for (const [id, v] of this.views) v.setDanger(ids.has(id));
  }

  levelUp(id: number, level: number, hp: number, maxHp: number) {
    const v = this.views.get(id);
    if (!v) return;
    v.setHp(hp, maxHp);
    v.setLevel(level);
    v.flash(P.dawn, 1);
    const p = v.root.position.clone();
    this.particles.emit({ pos: p, count: 70, color: P.dawn, speed: 1.2, up: 2.4, life: 1500, size: 0.12, gravity: 0.6, spread: 0.5 });
    this.floatText(p.add(new THREE.Vector3(0, 1.4, 0)), `¡Nivel ${level}!`, 'level');
    anim.tween(700, (k) => v.model.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.25), ease.out);
  }

  setKingAwake(awake: boolean) {
    for (const v of this.views.values()) if (v.unit.kind === 'king') v.awake = awake;
  }

  // ───────────────────────── animaciones ─────────────────────────

  async walk(id: number, path: Hex[]) {
    const v = this.views.get(id);
    if (!v || path.length < 2) return;
    const night = v.unit.team === 'night';
    const stepMs = night ? 260 : 230;
    for (let i = 1; i < path.length; i++) {
      const from = worldPos(path[i - 1]);
      const to = worldPos(path[i]);
      const y0 = this.board.tileTop(path[i - 1]);
      const y1 = this.board.tileTop(path[i]);
      const targetRot = Math.atan2(to.x - from.x, to.z - from.z);
      const startRot = v.root.rotation.y;
      let dRot = targetRot - startRot;
      dRot = Math.atan2(Math.sin(dRot), Math.cos(dRot));
      v.hex = { q: path[i].q, r: path[i].r };
      await anim.tween(stepMs, (k) => {
        v.root.position.x = lerp(from.x, to.x, k);
        v.root.position.z = lerp(from.z, to.z, k);
        v.baseY = lerp(y0, y1, k);
        v.offset.y = Math.sin(k * Math.PI) * (night ? 0.12 : 0.22);
        v.root.rotation.y = startRot + dRot * Math.min(1, k * 2.5);
      }, ease.linear);
      v.offset.y = 0;
      if (v.shown) {
        this.particles.emit({
          pos: v.root.position.clone(),
          count: night ? 6 : 4,
          color: night ? 0x5a1a8a : 0xcdb88f,
          speed: 0.4,
          up: 0.3,
          life: 500,
          size: 0.09,
          gravity: 0.4,
          spread: 0.2,
        });
      }
    }
    this.place(v, path[path.length - 1]);
  }

  async lunge(attackerId: number, targetId: number) {
    const t = this.views.get(targetId);
    if (t) await this.lungeAt(attackerId, t.root.position);
  }

  /** Embestida hacia un punto (una unidad o una estructura). */
  async lungeAt(attackerId: number, point: THREE.Vector3) {
    const a = this.views.get(attackerId);
    if (!a) return;
    const dir = point.clone().sub(a.root.position).setY(0);
    a.root.rotation.y = Math.atan2(dir.x, dir.z);
    const weapon = a.model.getObjectByName('weapon');
    const w0 = weapon?.rotation.x ?? 0;
    dir.multiplyScalar(0.35);
    await anim.tween(140, (k) => {
      a.offset.set(-dir.x * 0.3 * k, 0.05 * k, -dir.z * 0.3 * k);
      if (weapon) weapon.rotation.x = w0 - 0.8 * k;
    }, ease.out);
    await anim.tween(110, (k) => {
      a.offset.set(lerp(-dir.x * 0.3, dir.x, k), 0.05, lerp(-dir.z * 0.3, dir.z, k));
      if (weapon) weapon.rotation.x = w0 - 0.8 + 2 * k;
    }, ease.in);
    anim.tween(260, (k) => {
      a.offset.set(dir.x * (1 - k), 0.05 * (1 - k), dir.z * (1 - k));
      if (weapon) weapon.rotation.x = lerp(w0 + 1.2, w0, k);
    }, ease.out);
  }

  hit(id: number, amount: number, hp: number, source: string) {
    const v = this.views.get(id);
    if (!v) return;
    v.setHp(hp);
    v.flash(source === 'hunger' ? 0xffaa00 : 0xffffff, 1);
    const p = v.root.position.clone().add(new THREE.Vector3(0, 0.5, 0));
    const isNight = v.unit.team === 'night';
    if (v.shown) {
      this.particles.emit({
        pos: p,
        count: 16,
        color: isNight ? 0xb04dff : 0xff4a3a,
        speed: 1.6,
        up: 1.2,
        life: 600,
        size: 0.09,
        gravity: 3,
        spread: 0.15,
      });
      this.floatText(p.setY(p.y + 0.5), `-${amount}`, isNight ? 'dmg-night' : 'dmg-dawn');
    }
    if (!isNight) this.world.shake(v.unit.kind === 'hero' ? 0.22 : 0.12);
    // Retroceso
    const back = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().multiplyScalar(0.12);
    anim.tween(260, (k) => v.offset.set(back.x * Math.sin(k * Math.PI), v.offset.y, back.z * Math.sin(k * Math.PI)), ease.out);
  }

  heal(id: number, amount: number, hp: number) {
    const v = this.views.get(id);
    if (!v) return;
    v.setHp(hp);
    const p = v.root.position.clone();
    this.particles.emit({ pos: p, count: 14, color: 0x7dff9a, speed: 0.3, up: 1.1, life: 1100, size: 0.08, gravity: -0.2, spread: 0.35 });
    this.floatText(p.add(new THREE.Vector3(0, 1.1, 0)), `+${amount}`, 'heal');
    v.flash(0x7dff9a, 0.5);
  }

  async die(id: number) {
    const v = this.views.get(id);
    if (!v) return;
    const p = v.root.position.clone().add(new THREE.Vector3(0, 0.4, 0));
    const kind = v.unit.kind;
    v.label.style.opacity = '0';
    if (v.shown) {
      if (kind === 'king') {
        this.particles.emit({ pos: p.clone().setY(p.y + 0.6), count: 260, color: P.kingGlow, speed: 3.5, up: 3, life: 2200, size: 0.18, gravity: 0.8, spread: 0.6 });
        this.particles.emit({ pos: p, count: 160, color: P.dawn, speed: 2.4, up: 4, life: 2600, size: 0.15, gravity: -0.3, spread: 0.6 });
      } else {
        const night = v.unit.team === 'night';
        this.particles.emit({ pos: p, count: 50, color: night ? 0x6c2bd9 : 0xffe0a0, speed: 1.4, up: 1.8, life: 1300, size: 0.12, gravity: night ? -0.5 : 1.2, spread: 0.3 });
      }
    }
    await anim.tween(kind === 'king' ? 1600 : 650, (k) => {
      v.model.scale.setScalar(Math.max(0.001, 1 - k));
      v.offset.y = kind === 'shade' || kind === 'brute' || kind === 'king' ? k * 0.8 : -k * 0.3;
      v.model.rotation.y = k * (kind === 'king' ? 8 : 3);
    }, ease.in);
    this.root.remove(v.root);
    v.dispose();
    this.views.delete(id);
  }

  async kingRoar(id: number) {
    const v = this.views.get(id);
    if (!v) return;
    v.awake = true;
    this.world.shake(0.4);
    const p = v.root.position.clone().add(new THREE.Vector3(0, 1, 0));
    this.particles.emit({ pos: p, count: 120, color: P.kingGlow, speed: 3, up: 1.5, life: 1600, size: 0.16, gravity: 0.2, spread: 0.4 });
    await anim.tween(900, (k) => v.model.scale.setScalar(1.25 + Math.sin(k * Math.PI) * 0.25), ease.inOut);
  }

  /** Disparo a distancia: la unidad se gira y lanza una flecha. */
  async shoot(attackerId: number, targetId: number) {
    const a = this.views.get(attackerId);
    const t = this.views.get(targetId);
    if (!a || !t) return;
    const dir = t.root.position.clone().sub(a.root.position);
    a.root.rotation.y = Math.atan2(dir.x, dir.z);
    const from = a.root.position.clone().add(new THREE.Vector3(0, 0.45, 0));
    await this.projectile(from, targetId, 0xfff2c0);
  }

  async projectile(from: THREE.Vector3, toId: number, color = 0xffd27a) {
    const t = this.views.get(toId);
    if (!t) return;
    const to = t.root.position.clone().add(new THREE.Vector3(0, 0.45, 0));
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(4), toneMapped: false }),
    );
    this.root.add(orb);
    await anim.tween(420, (k) => {
      orb.position.lerpVectors(from, to, k);
      orb.position.y += Math.sin(k * Math.PI) * 1.2;
      this.particles.emit({ pos: orb.position, count: 1, color, speed: 0.1, up: 0.1, life: 350, size: 0.08, gravity: 0 });
    }, ease.inOut);
    this.root.remove(orb);
    orb.geometry.dispose();
  }

  floatText(p: THREE.Vector3, text: string, cls: string) {
    const s = this.world.project(p);
    if (!s.visible) return;
    const el = document.createElement('div');
    el.className = `float-text ${cls}`;
    el.textContent = text;
    el.style.left = `${s.x}px`;
    el.style.top = `${s.y}px`;
    this.labels.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  // ───────────────────────── frame ─────────────────────────

  update(dt: number, nightFactor: number) {
    this.time += dt / 1000;
    const t = this.time;
    let hero: UnitView | null = null;
    let king: UnitView | null = null;

    for (const v of this.views.values()) {
      const kind = v.unit.kind;
      if (kind === 'hero') hero = v;
      if (kind === 'king') king = v;

      let bob = 0;
      if (kind === 'shade') bob = 0.12 + Math.sin(t * 2.2 + v.phase) * 0.06;
      else if (kind === 'brute') bob = Math.abs(Math.sin(t * 1.4 + v.phase)) * 0.04;
      else if (kind === 'king') bob = (v.awake ? 0.2 : 0.05) + Math.sin(t * 1.3) * 0.06;
      else bob = Math.abs(Math.sin(t * 2 + v.phase)) * 0.015;
      v.model.position.set(v.offset.x, bob + v.offset.y, v.offset.z);
      v.root.position.y = v.baseY;

      if (kind === 'king') {
        const orbit = v.model.getObjectByName('orbit');
        if (orbit) orbit.rotation.y = t * (v.awake ? 1.6 : 0.4);
        const crown = v.model.getObjectByName('crown');
        if (crown) crown.rotation.y = -t * 0.5;
        v.setGlow(v.awake ? 1 + Math.sin(t * 4) * 0.25 : 0.45);
      }
      if (kind === 'lair') {
        const portal = v.model.getObjectByName('portal');
        if (portal) {
          portal.rotation.y = t * 0.8;
          portal.scale.setScalar(1 + Math.sin(t * 3 + v.phase) * 0.06);
        }
        if (v.shown && Math.random() < dt / 120) {
          this.particles.emit({
            pos: v.root.position.clone().add(new THREE.Vector3(0, 0.5, 0)),
            count: 1,
            color: 0x8a2cff,
            speed: 0.3,
            up: 0.7,
            life: 1400,
            size: 0.1,
            gravity: -0.1,
            spread: 0.3,
          });
        }
      }
      if (kind === 'shade' && v.shown && Math.random() < dt / 160) {
        this.particles.emit({
          pos: v.root.position.clone().add(new THREE.Vector3(0, 0.3, 0)),
          count: 1,
          color: 0x4a1a7a,
          speed: 0.15,
          up: 0.4,
          life: 900,
          size: 0.12,
          gravity: -0.2,
          spread: 0.2,
        });
      }

      // Etiqueta HTML con la vida
      const head = v.root.position.clone().add(new THREE.Vector3(0, LABEL_HEIGHT[kind] + v.offset.y, 0));
      const s = this.world.project(head);
      const show = v.shown && s.visible;
      v.label.style.display = show ? 'block' : 'none';
      if (show) v.label.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
    }

    if (hero) {
      this.lantern.position.copy(hero.root.position).add(new THREE.Vector3(0.15, 0.6, 0.2));
      this.lantern.intensity = nightFactor * 2.2 * (1 + Math.sin(t * 9) * 0.05);
    } else this.lantern.intensity = 0;

    if (king) {
      this.aura.position.copy(king.root.position).add(new THREE.Vector3(0, 1.3, 0));
      this.aura.intensity = king.shown ? (king.awake ? 6 : 2.5) * (0.4 + nightFactor * 0.6) : 0;
      this.beacon.position.copy(king.root.position);
      const mat = this.beacon.material as THREE.MeshBasicMaterial;
      mat.opacity = (king.awake ? 0.2 : 0.1) * (0.6 + 0.4 * Math.sin(t * 1.5)) * (0.5 + nightFactor * 0.8);
      this.beacon.visible = true;
    } else {
      this.aura.intensity = 0;
      this.beacon.visible = false;
    }

    const sel = this.selectedId !== null ? this.views.get(this.selectedId) : null;
    if (sel) {
      this.selection.visible = true;
      this.selection.position.set(sel.root.position.x, sel.root.position.y + 0.03, sel.root.position.z);
      this.selection.rotation.y = t * 0.6;
      this.selection.scale.setScalar(1 + Math.sin(t * 4) * 0.04);
    } else this.selection.visible = false;
  }

  keyOf(id: number): string | null {
    const v = this.views.get(id);
    return v ? key(v.hex) : null;
  }
}
