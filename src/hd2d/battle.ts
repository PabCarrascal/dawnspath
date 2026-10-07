import './battle.css';
import * as THREE from 'three';
import type { Combat } from '../combat/rules/Combat';
import type { CombatEvent, Fighter, StatusKind } from '../combat/rules/types';
import type { BattleView, ViewHooks } from '../combat/session';
import { anim, ease, lerp } from '../core/anim';
import { Rng } from '../core/rng';
import { SpriteKind, spriteSheet } from './characters';
import { BATTLE, buildForest, PixelSprite } from './forest';
import { LookController, Mode } from './look';
import { Px } from './pixel';
import { buildPost } from './post';

/** Distancia entre posiciones de un mismo bando y hueco entre los dos bandos. */
const RANK_GAP = 1.25;
const SIDE_GAP = 1.0;

/** Habilidades que se lanzan a distancia (flecha o proyectil mágico). */
const ARROWS = new Set(['shot', 'markShot', 'volley', 'pinpoint']);
const BOLTS = new Set(['dart', 'nightBolt', 'blind']);
const DREAD = new Set(['whisper', 'roar', 'dread']);

const STATUS_GLYPH: Record<StatusKind, { glyph: string; title: string }> = {
  bleed: { glyph: '✦', title: 'Sangrando' },
  stun: { glyph: '✸', title: 'Aturdido' },
  mark: { glyph: '◎', title: 'Marcado' },
  guarded: { glyph: '⛨', title: 'Protegido' },
  guarding: { glyph: '⛨', title: 'En guardia' },
  steady: { glyph: '❖', title: 'Firme' },
};

/** Un combatiente en la maqueta: sprite, anillo en el suelo y ficha HTML. */
interface Unit {
  f: Fighter;
  sprite: PixelSprite;
  mat: THREE.MeshStandardMaterial;
  ring: THREE.Mesh;
  plate: HTMLElement;
  /** Posición de su puesto (se anima al cambiar de fila). */
  base: THREE.Vector3;
  /** Desplazamiento y pose de las animaciones, encima del puesto. */
  pose: { dx: number; dy: number; dz: number; tilt: number; alpha: number };
  hp: number;
  stress: number;
  statuses: Set<StatusKind>;
  deathsDoor: boolean;
  dead: boolean;
  target: 'none' | 'enemy' | 'ally';
  active: boolean;
}

/**
 * Combate dentro de la maqueta HD-2D: los dos bandos frente a frente en un
 * claro del bosque, con embestidas, proyectiles y la cámara acercándose a la
 * acción. Reproduce los mismos eventos que la vista 2D.
 */
export class Hd2dCombatView implements BattleView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private post: ReturnType<typeof buildPost>;
  private forest: ReturnType<typeof buildForest>;
  private look: LookController;
  private layer: HTMLElement;
  private units = new Map<number, Unit>();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(9, 9);
  private hovered: number | null = null;
  private raf = 0;
  private clock = new THREE.Clock();
  private elapsed = 0;
  private rng = new Rng(1);
  /** Cámara: punto al que mira y acercamiento (1 = plano general). */
  private camFocus: THREE.Vector3;
  private camZoom = 1;
  private fit = 1;
  private readonly home: THREE.Vector3;
  private readonly offset = new THREE.Vector3(0, 7.6, 16.5);
  private tint: HTMLElement;

  private constructor(
    el: HTMLElement,
    private combat: Combat,
    mode: Mode,
    seed: number,
    private hooks: ViewHooks,
  ) {
    this.rng = new Rng(seed);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.classList.add('hd-battle-canvas');
    el.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color();
    this.scene.fog = new THREE.Fog(0, 20, 60);
    this.camera = new THREE.PerspectiveCamera(26, window.innerWidth / window.innerHeight, 0.5, 200);
    this.forest = buildForest(7, { clearing: { x: BATTLE.x, z: BATTLE.z, rx: 6.6, rz: 1.9 } });
    this.scene.add(this.forest.group);
    this.home = new THREE.Vector3(BATTLE.x, 0.55, BATTLE.z);
    this.camFocus = this.home.clone();
    this.post = buildPost(this.renderer, this.scene, this.camera);
    this.look = new LookController(this.scene, this.renderer, this.forest, this.post, mode);

    this.layer = document.createElement('div');
    this.layer.className = 'hd-battle-layer';
    this.tint = document.createElement('div');
    this.tint.className = 'hd-battle-tint';
    this.layer.appendChild(this.tint);
    document.body.appendChild(this.layer);

    for (const f of combat.state.fighters) this.addUnit(f);
    this.layout(false);

    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerleave', this.onPointerLeave);
    this.renderer.domElement.addEventListener('click', this.onClick);
    this.onResize();
    this.frame();
  }

  static async create(el: HTMLElement, combat: Combat, mode: Mode, seed: number, hooks: ViewHooks) {
    return new Hd2dCombatView(el, combat, mode, seed, hooks);
  }

  // ───────────────────────── montaje ─────────────────────────

  private addUnit(f: Fighter) {
    const kind = (f.kind in { hero: 1, spearman: 1, archer: 1, chaplain: 1, shade: 1, brute: 1, stalker: 1, herald: 1 } ? f.kind : 'shade') as SpriteKind;
    const sprite = new PixelSprite(spriteSheet(kind).texture(), 1.05, f.side === 'foe' ? 1.3 : 1.6, f.side === 'foe');
    this.scene.add(sprite.mesh);
    const mat = sprite.mesh.material as THREE.MeshStandardMaterial;
    mat.transparent = true;

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.58, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
    ring.renderOrder = 2;
    this.scene.add(ring);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
    shadow.position.y = 0.02;
    ring.add(shadow);

    const plate = document.createElement('div');
    plate.className = `hd-plate ${f.side}`;
    plate.innerHTML = `
      <div class="hd-chevron">▼</div>
      <div class="hd-status"></div>
      <div class="hd-door">☠</div>
      <i class="hd-hp"><i></i></i>
      ${f.side === 'party' ? '<div class="hd-pips">' + '<i></i>'.repeat(10) + '</div>' : ''}`;
    this.layer.appendChild(plate);

    const u: Unit = {
      f,
      sprite,
      mat,
      ring,
      plate,
      base: new THREE.Vector3(),
      pose: { dx: 0, dy: 0, dz: 0, tilt: 0, alpha: 1 },
      hp: f.hp,
      stress: f.stress,
      statuses: new Set(),
      deathsDoor: f.deathsDoor,
      dead: !f.alive,
      target: 'none',
      active: false,
    };
    this.units.set(f.id, u);
    this.renderPlate(u);
  }

  private slot(f: Fighter) {
    const dir = f.side === 'party' ? -1 : 1;
    const x = BATTLE.x + dir * (SIDE_GAP + (f.rank - 1) * RANK_GAP);
    // Filas alternas algo más atrás, para que no se tapen.
    const z = BATTLE.z + (f.rank % 2 === 0 ? -0.45 : 0.25);
    return new THREE.Vector3(x, 0, z);
  }

  /** Coloca a cada combatiente en su puesto (animado al cambiar de fila). */
  layout(animate = true): Promise<void> {
    const moves: Promise<void>[] = [];
    for (const u of this.units.values()) {
      if (!u.f.alive) continue;
      const to = this.slot(u.f);
      if (!animate) u.base.copy(to);
      else if (u.base.distanceTo(to) > 0.01) {
        const from = u.base.clone();
        moves.push(
          anim.tween(420, (k) => {
            u.base.lerpVectors(from, to, k);
            u.pose.dy = Math.sin(k * Math.PI) * 0.18;
          }, ease.inOut),
        );
      }
    }
    return Promise.all(moves).then(() => {});
  }

  // ───────────────────────── bucle ─────────────────────────

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    // En pantallas estrechas, la cámara se aleja para que quepan los dos bandos.
    this.fit = Math.max(1, 1.7 / this.camera.aspect);
    // Desplaza el encuadre hacia arriba: abajo queda el panel de habilidades.
    this.camera.setViewOffset(w, h, 0, Math.round(h * 0.1), w, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.post.setSize(w, h);
  };

  private frame = () => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    anim.update(dt * 1000);
    // Cámara: plano general o acercamiento a la acción, con una deriva suave.
    const sway = new THREE.Vector3(Math.sin(this.elapsed * 0.15) * 0.6, 0, 0);
    this.camera.position.copy(this.camFocus).add(this.offset.clone().multiplyScalar(this.camZoom * this.fit)).add(sway);
    this.camera.lookAt(this.camFocus);
    this.forest.update(dt, this.elapsed, this.camera);
    this.look.update(dt);
    for (const u of this.units.values()) this.tickUnit(u, dt);
    this.pick();
    this.post.composer.render(dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  private tickUnit(u: Unit, dt: number) {
    const m = u.sprite.mesh;
    const breathe = u.f.kind === 'shade' && !u.dead ? 0.14 + Math.sin(this.elapsed * 2.2 + u.f.id) * 0.1 : 0;
    m.position.set(u.base.x + u.pose.dx, u.pose.dy + breathe, u.base.z + u.pose.dz);
    u.sprite.update(dt, this.camera);
    m.rotation.z = u.pose.tilt;
    u.mat.opacity = u.pose.alpha;
    m.visible = u.pose.alpha > 0.01;
    m.castShadow = u.pose.alpha > 0.5;

    u.ring.position.set(u.base.x + u.pose.dx, 0.03, u.base.z + u.pose.dz);
    const ringMat = u.ring.material as THREE.MeshBasicMaterial;
    const pulse = 0.55 + 0.45 * Math.sin(this.elapsed * 5);
    if (u.dead) ringMat.opacity = 0;
    else if (u.target !== 'none') {
      ringMat.color.set(u.target === 'enemy' ? 0xff4a3a : 0x6fe08a).multiplyScalar(1.6);
      ringMat.opacity = pulse;
    } else if (u.active) {
      ringMat.color.set(0xffd27a).multiplyScalar(1.5);
      ringMat.opacity = 0.9;
    } else ringMat.opacity = 0;
    (u.ring.children[0] as THREE.Mesh).visible = !u.dead;

    // Ficha HTML bajo los pies y marcador sobre la cabeza
    const feet = this.project(m.position.x, 0, m.position.z);
    u.plate.style.transform = `translate(${feet.x}px, ${feet.y}px)`;
    u.plate.style.opacity = u.dead ? '0' : '1';
    const head = this.project(m.position.x, m.position.y + u.sprite.height + 0.1, m.position.z);
    u.plate.style.setProperty('--head', `${head.y - feet.y}px`);
    u.plate.classList.toggle('active', u.active && !u.dead);
  }

  private project(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  // ───────────────────────── ratón ─────────────────────────

  private onPointerMove = (e: PointerEvent) => {
    this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  };

  private onPointerLeave = () => {
    this.pointer.set(9, 9);
  };

  /** Combatiente bajo el cursor (comprobado cada fotograma). */
  private pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const live = [...this.units.values()].filter((u) => !u.dead && u.sprite.mesh.visible);
    const hit = this.raycaster.intersectObjects(live.map((u) => u.sprite.mesh), false)[0];
    const id = hit ? live.find((u) => u.sprite.mesh === hit.object)!.f.id : null;
    if (id !== this.hovered) {
      this.hovered = id;
      this.renderer.domElement.style.cursor = id !== null ? 'pointer' : '';
      this.hooks.onHover(id);
    }
  }

  private onClick = (e: MouseEvent) => {
    // Se calcula en el propio clic: en pantallas táctiles no hay movimiento previo.
    this.onPointerMove(e as PointerEvent);
    this.pick();
    if (this.hovered !== null) this.hooks.onClick(this.hovered);
  };

  // ───────────────────────── interfaz de la vista ─────────────────────────

  setActive(id: number | null) {
    for (const u of this.units.values()) u.active = u.f.id === id;
  }

  setTargets(ids: number[], mode: 'enemy' | 'ally') {
    for (const u of this.units.values()) u.target = ids.includes(u.f.id) ? mode : 'none';
  }

  headOf(id: number) {
    const u = this.units.get(id);
    if (!u) return { x: 0, y: 0 };
    const m = u.sprite.mesh;
    return this.project(m.position.x, m.position.y + u.sprite.height + 0.25, m.position.z);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerleave', this.onPointerLeave);
    this.renderer.domElement.removeEventListener('click', this.onClick);
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
    });
    this.post.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.layer.remove();
  }

  // ───────────────────────── efectos ─────────────────────────

  private renderPlate(u: Unit) {
    const hp = u.plate.querySelector<HTMLElement>('.hd-hp > i')!;
    hp.style.width = `${Math.max(0, (u.hp / u.f.maxHp) * 100)}%`;
    u.plate.classList.toggle('door', u.deathsDoor);
    const pips = u.plate.querySelectorAll<HTMLElement>('.hd-pips i');
    pips.forEach((p, i) => {
      p.className = u.stress >= 100 + (i + 1) * 10 ? 'over' : u.stress >= (i + 1) * 10 ? 'on' : '';
    });
    u.plate.querySelector<HTMLElement>('.hd-status')!.innerHTML = [...u.statuses]
      .map((s) => `<span class="st-${s}" title="${STATUS_GLYPH[s].title}">${STATUS_GLYPH[s].glyph}</span>`)
      .join('');
  }

  /** Texto que sube sobre la cabeza: daño, curación, estados. */
  floatText(id: number, text: string, cls: string, delay = 0) {
    const u = this.units.get(id);
    if (!u) return;
    const p = this.headOf(id);
    const t = document.createElement('div');
    t.className = `hd-float ${cls}`;
    t.textContent = text;
    t.style.left = `${p.x + (this.rng.next() - 0.5) * 24}px`;
    t.style.top = `${p.y}px`;
    t.style.animationDelay = `${delay}ms`;
    this.layer.appendChild(t);
    setTimeout(() => t.remove(), 1400 + delay);
  }

  private flash(u: Unit, color: number, ms = 150) {
    u.mat.emissive.set(color);
    u.mat.emissiveIntensity = 1.4;
    setTimeout(() => {
      u.mat.emissive.set(0xffffff);
      u.mat.emissiveIntensity = 0.28;
    }, ms);
  }

  private shake(u: Unit, amount = 0.14) {
    const x0 = u.pose.dx;
    return anim.tween(280, (k) => (u.pose.dx = x0 + Math.sin(k * Math.PI * 6) * amount * (1 - k)), ease.linear);
  }

  private screenTint(color: string, ms = 600) {
    this.tint.style.background = color;
    this.tint.classList.remove('on');
    void this.tint.offsetWidth;
    this.tint.classList.add('on');
    setTimeout(() => this.tint.classList.remove('on'), ms);
  }

  /** Acerca la cámara a un punto (o vuelve al plano general). */
  private focusCam(to: THREE.Vector3 | null, zoom: number, ms = 360) {
    const fromF = this.camFocus.clone();
    const fromZ = this.camZoom;
    const target = to ?? this.home;
    return anim.tween(ms, (k) => {
      this.camFocus.lerpVectors(fromF, target, k);
      this.camZoom = lerp(fromZ, zoom, k);
    }, ease.inOut);
  }

  /** Proyectil: flecha de píxeles o esfera de energía, en parábola. */
  private async projectile(from: Unit, to: Unit, kind: 'arrow' | 'bolt') {
    let mesh: THREE.Mesh;
    if (kind === 'arrow') {
      const p = new Px(16, 4);
      p.rect(0, 1, 12, 1, 0x8a5a30);
      p.rect(12, 0, 3, 3, 0xd8e0ea);
      p.set(15, 1, 0xffffff);
      p.rect(0, 0, 2, 1, 0xf0f0f0);
      p.rect(0, 2, 2, 1, 0xf0f0f0);
      const geo = new THREE.PlaneGeometry(0.7, 0.18);
      mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: p.texture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));
    } else {
      const color = from.f.side === 'foe' ? new THREE.Color(0xb070ff) : new THREE.Color(0xfff0a0);
      mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), new THREE.MeshBasicMaterial({ color: color.multiplyScalar(3), toneMapped: false }));
    }
    this.scene.add(mesh);
    const a = from.sprite.mesh.position.clone().add(new THREE.Vector3(0, from.sprite.height * 0.6, 0));
    const b = to.sprite.mesh.position.clone().add(new THREE.Vector3(0, to.sprite.height * 0.55, 0));
    const dir = Math.sign(b.x - a.x) || 1;
    await anim.tween(260, (k) => {
      mesh.position.lerpVectors(a, b, k);
      mesh.position.y += Math.sin(k * Math.PI) * 0.6;
      mesh.lookAt(this.camera.position);
      if (kind === 'arrow') mesh.rotateZ((dir > 0 ? 0 : Math.PI) - Math.cos(k * Math.PI) * 0.45 * dir);
    }, ease.linear);
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }

  /** Destellos que suben (curación, alivio, virtud). */
  private sparkle(u: Unit, color: number) {
    const n = 14;
    const pos = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: new THREE.Color(color).multiplyScalar(2), size: 0.11, transparent: true, depthWrite: false, toneMapped: false });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    const base = u.sprite.mesh.position.clone();
    const seeds = Array.from({ length: n }, () => [this.rng.next() - 0.5, this.rng.next(), this.rng.next() - 0.5]);
    void anim
      .tween(900, (k) => {
        seeds.forEach(([x, y, z], i) => {
          pos[i * 3] = base.x + x * 0.9;
          pos[i * 3 + 1] = base.y + y * 0.6 + k * 1.4;
          pos[i * 3 + 2] = base.z + z * 0.5;
        });
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 1 - k;
      }, ease.out)
      .then(() => {
        this.scene.remove(pts);
        geo.dispose();
        mat.dispose();
      });
  }

  // ───────────────────────── reproducción ─────────────────────────

  async play(
    events: CombatEvent[],
    ui: {
      banner: (text: string, tone: 'bad' | 'good' | 'epic', sub?: string) => void;
      bark: (id: number, text: string) => void;
      log: (text: string, tone?: 'bad' | 'good' | 'info') => void;
      round: (round: number, order: number[]) => void;
      turn: (id: number) => void;
      sound: (name: string) => void;
    },
  ) {
    const name = (id: number) => this.combat.fighter(id)?.name ?? '';
    // Quién está en primer plano tras una habilidad (para devolverlo a su sitio).
    let acting: Unit | null = null;
    const settle = async () => {
      if (!acting) return;
      const u = acting;
      acting = null;
      await anim.wait(220);
      const from = { dx: u.pose.dx, dy: u.pose.dy };
      await Promise.all([
        anim.tween(300, (k) => {
          u.pose.dx = lerp(from.dx, 0, k);
          u.pose.dy = lerp(from.dy, 0, k) + Math.sin(k * Math.PI) * 0.25;
        }, ease.inOut),
        this.focusCam(null, 1, 380),
      ]);
    };

    for (const ev of events) {
      const ends = ev.type === 'turn' || ev.type === 'round' || ev.type === 'skill' || ev.type === 'end' || ev.type === 'ranks';
      if (acting && ends) await settle();

      switch (ev.type) {
        case 'round':
          ui.round(ev.round, ev.order);
          break;
        case 'turn': {
          this.setActive(ev.id);
          ui.turn(ev.id);
          const u = this.units.get(ev.id)!;
          await anim.tween(200, (k) => (u.pose.dy = Math.sin(k * Math.PI) * 0.15), ease.out);
          break;
        }
        case 'skip':
          this.floatText(ev.id, ev.reason === 'stun' ? 'Aturdido' : 'Paralizado', 'status');
          ui.log(`${name(ev.id)} pierde el turno${ev.reason === 'stun' ? ' (aturdido)' : ' por el miedo'}.`, 'bad');
          await anim.wait(600);
          break;
        case 'skill': {
          const actor = this.units.get(ev.actor)!;
          const skill = this.combat.skill(ev.skill);
          const targets = ev.targets.map((id) => this.units.get(id)!).filter(Boolean);
          ui.log(`${name(ev.actor)}: ${skill.name}.`);
          ui.banner(skill.name, actor.f.side === 'party' ? 'good' : 'bad');
          const mid = targets.length
            ? targets.reduce((v, t) => v.add(t.base), actor.base.clone()).multiplyScalar(1 / (targets.length + 1))
            : actor.base.clone();
          mid.y = 0.55;
          if (skill.target.side === 'enemy') {
            const ranged = ARROWS.has(skill.id) || BOLTS.has(skill.id);
            if (DREAD.has(skill.id) && !skill.dmg) {
              // Grito o susurro: onda violeta y la pantalla se tiñe.
              ui.sound('roar');
              this.screenTint('rgba(120, 40, 180, 0.35)');
              await Promise.all([this.focusCam(mid, 0.9), anim.tween(380, (k) => (actor.pose.dy = Math.sin(k * Math.PI) * 0.3), ease.out)]);
              acting = actor;
            } else if (ranged) {
              ui.sound(ARROWS.has(skill.id) ? 'swing' : 'zap');
              await this.focusCam(mid, 0.9);
              await anim.tween(140, (k) => (actor.pose.dx = (actor.f.side === 'party' ? -1 : 1) * 0.15 * k), ease.out);
              await Promise.all(targets.map((t) => this.projectile(actor, t, ARROWS.has(skill.id) ? 'arrow' : 'bolt')));
              acting = actor;
            } else {
              // Embestida: el atacante corre hasta su objetivo y golpea.
              ui.sound('swing');
              const first = targets[0];
              const dir = actor.f.side === 'party' ? 1 : -1;
              const reach = first ? first.base.x - actor.base.x - dir * 1.0 : 0;
              const zTo = first ? first.base.z - actor.base.z + 0.05 : 0;
              const camGo = this.focusCam(mid, 0.88);
              await anim.tween(260, (k) => {
                actor.pose.dx = reach * k;
                actor.pose.dz = zTo * k;
                actor.pose.dy = Math.sin(k * Math.PI) * 0.35;
              }, ease.inOut);
              await camGo;
              await anim.tween(90, (k) => (actor.pose.dx = reach + dir * 0.25 * k), ease.in);
              actor.pose.dz = 0;
              acting = actor;
            }
          } else {
            ui.sound('heal');
            for (const t of targets) this.sparkle(t, skill.heal ? 0x7ef09a : 0xa8d0ff);
            await anim.tween(340, (k) => (actor.pose.dy = Math.sin(k * Math.PI) * 0.3), ease.out);
          }
          break;
        }
        case 'miss':
        case 'dodge': {
          const u = this.units.get(ev.target)!;
          this.floatText(ev.target, ev.type === 'miss' ? 'Fallo' : 'Esquiva', 'miss');
          if (ev.type === 'dodge') {
            const dir = u.f.side === 'party' ? -1 : 1;
            await anim.tween(220, (k) => (u.pose.dx = dir * Math.sin(k * Math.PI) * 0.4), ease.out);
          } else await anim.wait(260);
          break;
        }
        case 'damage': {
          const u = this.units.get(ev.target)!;
          u.hp = ev.hp;
          this.renderPlate(u);
          if (ev.amount > 0) {
            this.flash(u, ev.source === 'bleed' ? 0xd86a3a : 0xff3a2a);
            void this.shake(u, ev.crit ? 0.24 : 0.14);
            ui.sound(u.f.side === 'party' ? 'hurt' : 'hit');
            if (ev.crit) {
              this.floatText(ev.target, '¡Crítico!', 'crit-label');
              this.screenTint('rgba(255, 220, 140, 0.25)', 250);
            }
            this.floatText(ev.target, String(ev.amount), ev.crit ? 'dmg crit' : ev.source === 'bleed' ? 'dmg bleed' : 'dmg');
          }
          await anim.wait(ev.source === 'bleed' ? 420 : 320);
          break;
        }
        case 'heal': {
          const u = this.units.get(ev.target)!;
          u.hp = ev.hp;
          this.renderPlate(u);
          this.floatText(ev.target, `+${ev.amount}`, ev.crit ? 'heal crit' : 'heal');
          await anim.wait(300);
          break;
        }
        case 'stress': {
          const u = this.units.get(ev.target)!;
          u.stress = ev.stress;
          this.renderPlate(u);
          if (ev.amount) {
            this.floatText(ev.target, `${ev.amount > 0 ? '+' : '−'}${Math.abs(ev.amount)} estrés`, ev.amount > 0 ? 'stress' : 'relief', 120);
            if (ev.amount > 0) ui.sound('bad');
          }
          await anim.wait(160);
          break;
        }
        case 'status': {
          const u = this.units.get(ev.target)!;
          if (ev.on) u.statuses.add(ev.status);
          else u.statuses.delete(ev.status);
          this.renderPlate(u);
          if (ev.on) {
            this.floatText(ev.target, STATUS_GLYPH[ev.status].title, 'status', 200);
            await anim.wait(180);
          }
          break;
        }
        case 'guardRedirect':
          this.floatText(ev.to, '¡Intercepta!', 'status');
          ui.log(`${name(ev.to)} intercepta el golpe dirigido a ${name(ev.from)}.`, 'good');
          await anim.wait(250);
          break;
        case 'deathsDoor': {
          const u = this.units.get(ev.target)!;
          u.deathsDoor = true;
          this.renderPlate(u);
          ui.banner('A las puertas de la muerte', 'bad', name(ev.target));
          ui.sound('bad');
          ui.log(`${name(ev.target)} está a las puertas de la muerte.`, 'bad');
          this.screenTint('rgba(160, 20, 20, 0.3)', 700);
          await anim.wait(700);
          break;
        }
        case 'resist':
          this.floatText(ev.target, '¡Resiste!', 'crit-label');
          ui.log(`${name(ev.target)} se aferra a la vida.`, 'good');
          await anim.wait(500);
          break;
        case 'death': {
          const u = this.units.get(ev.target)!;
          u.dead = true;
          ui.sound('death');
          ui.log(`${name(ev.target)} ha caído.`, u.f.side === 'party' ? 'bad' : 'good');
          if (u.f.side === 'party') ui.banner(`${name(ev.target)} ha muerto`, 'bad', 'Su nombre se pierde en la oscuridad');
          this.flash(u, u.f.side === 'party' ? 0xff2a2a : 0xffffff, 300);
          await anim.tween(700, (k) => {
            u.pose.alpha = 1 - k;
            u.pose.dy = -k * 0.2;
            u.pose.tilt = (u.f.side === 'party' ? 1 : -1) * k * 0.5;
          }, ease.in);
          break;
        }
        case 'downed': {
          const u = this.units.get(ev.target)!;
          u.deathsDoor = false;
          u.hp = 0;
          this.renderPlate(u);
          ui.sound('defeat');
          ui.banner(`${name(ev.target)} cae abatido`, 'bad', 'El grupo se lo lleva a rastras');
          ui.log(`${name(ev.target)} cae abatido; el grupo se retira con él.`, 'bad');
          await anim.tween(700, (k) => {
            u.pose.tilt = k * 1.45;
            u.pose.alpha = 1 - k * 0.3;
          }, ease.out);
          await anim.wait(900);
          break;
        }
        case 'ranks':
          await this.layout(true);
          break;
        case 'resolve': {
          const u = this.units.get(ev.target)!;
          if (ev.result === 'virtue') {
            ui.sound('levelUp');
            ui.banner('Firme', 'epic', `${name(ev.target)} halla valor en la oscuridad`);
            this.flash(u, 0xffe6a0, 500);
            this.sparkle(u, 0xffd27a);
          } else {
            ui.sound('defeat');
            ui.banner(ev.result === 'temeroso' ? 'Temeroso' : 'Desesperado', 'bad', `El temple de ${name(ev.target)} se quiebra`);
            this.flash(u, 0x9a6aff, 500);
            this.screenTint('rgba(90, 40, 160, 0.35)', 900);
          }
          await anim.wait(1500);
          break;
        }
        case 'heartAttack':
          ui.banner('¡Infarto!', 'bad', name(ev.target));
          this.screenTint('rgba(160, 20, 20, 0.45)', 900);
          await anim.wait(900);
          break;
        case 'bark':
          ui.bark(ev.target, ev.text);
          await anim.wait(250);
          break;
        case 'end':
          this.setActive(null);
          this.setTargets([], 'enemy');
          break;
      }
    }
    if (acting) await settle();
  }

  /** Cambia la luz de la escena (por ejemplo, al caer la noche). */
  setMode(mode: Mode) {
    this.look.set(mode);
  }
}
