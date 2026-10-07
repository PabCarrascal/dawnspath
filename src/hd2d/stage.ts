import './battle.css';
import * as THREE from 'three';
import type { Biome } from '../combat/rules/data';
import { buildDiorama, Diorama, SceneSetup } from './diorama/build';
import { LookController, Mode } from './look';
import { buildPost } from './post';

export type Framing = 'node' | 'castle';

/** Encuadres: el claro con el grupo, o el patio del castillo con sus edificios. */
const FRAMES: Record<Framing, { focus: THREE.Vector3; offset: THREE.Vector3 }> = {
  node: { focus: new THREE.Vector3(2, 0.6, 1.4), offset: new THREE.Vector3(0, 9.5, 19.5) },
  castle: { focus: new THREE.Vector3(2, 1.3, -0.6), offset: new THREE.Vector3(0, 10.5, 22) },
};

/**
 * Escenario 3D para las pantallas de la campaña (castillo y nodos): una
 * maqueta, su luz según la hora y una cámara que deriva despacio. El combate
 * usa su propia vista y este escenario se libera mientras dura.
 */
export class Stage3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  diorama: Diorama;
  private post: ReturnType<typeof buildPost>;
  private look: LookController;
  private raf = 0;
  private clock = new THREE.Clock();
  private elapsed = 0;
  private framing: Framing;
  private pointerX = 0;
  /** Se llama cada fotograma (para recolocar etiquetas HTML sobre la escena). */
  onFrame: (() => void) | null = null;

  constructor(
    el: HTMLElement,
    biome: Biome,
    opts: { seed: number; scene?: SceneSetup; mode: Mode; framing?: Framing },
  ) {
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
    this.framing = opts.framing ?? 'node';
    this.diorama = buildDiorama(biome, { seed: opts.seed, scene: opts.scene });
    this.scene.add(this.diorama.group);
    this.post = buildPost(this.renderer, this.scene, this.camera);
    this.look = new LookController(this.scene, this.renderer, this.diorama, this.post, opts.mode);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointermove', this.onPointer);
    this.onResize();
    this.frame();
  }

  get mode() {
    return this.look.mode;
  }

  setMode(mode: Mode) {
    if (mode !== this.look.mode) this.look.set(mode);
  }

  /** Coordenadas de pantalla de un punto de la escena. */
  project(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight, visible: p.z < 1 };
  }

  private onPointer = (e: PointerEvent) => {
    this.pointerX = (e.clientX / window.innerWidth) * 2 - 1;
  };

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    // El encuadre sube un poco: abajo está el panel de la interfaz.
    this.camera.setViewOffset(w, h, 0, Math.round(h * 0.1), w, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.post.setSize(w, h);
  };

  private frame = () => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    const f = FRAMES[this.framing];
    const fit = Math.max(1, 1.7 / this.camera.aspect);
    // Deriva lenta y un leve paralaje con el ratón.
    const sway = Math.sin(this.elapsed * 0.12) * 0.9 + this.pointerX * 0.8;
    this.camera.position.copy(f.focus).add(f.offset.clone().multiplyScalar(fit)).add(new THREE.Vector3(sway, 0, 0));
    this.camera.lookAt(f.focus);
    this.diorama.update(dt, this.elapsed, this.camera);
    this.look.update(dt);
    this.post.composer.render(dt);
    this.onFrame?.();
    this.raf = requestAnimationFrame(this.frame);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointer);
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
  }
}
