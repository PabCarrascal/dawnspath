import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { anim, ease, lerp, smoothstep } from './anim';
import { BALANCE } from '../game/config';
import { PALETTE as P, nightGlow } from './materials';

/**
 * Hora del día como un reloj continuo: 0 = amanecer, 0.25 = mediodía,
 * 0.5 = anochecer, 0.75 = medianoche. Puede crecer más allá de 1.
 */
export const CLOCK = {
  morning: 0.04,
  evening: 0.46,
  midnight: 0.72,
};

const FOV = 38;
/** Radio aproximado del tablero en unidades del mundo. */
const BOARD = BALANCE.mapRadius * Math.sqrt(3);

export type Quality = 'high' | 'medium' | 'low';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.32 },
    uNight: { value: 0 },
    uFlash: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uNight;
    uniform float uFlash;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      vec3 night = mix(vec3(lum), c.rgb, 0.65) * vec3(0.86, 0.95, 1.18);
      c.rgb = mix(c.rgb, night, uNight * 0.6);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.25, length(d * vec2(1.0, 0.85)));
      c.rgb *= mix(1.0 - uVignette, 1.0, v);
      c.rgb = mix(c.rgb, vec3(1.0, 0.98, 1.0), uFlash);
      gl_FragColor = c;
    }
  `,
};

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly fov = FOV;

  /** 0 = pleno día, 1 = noche cerrada. */
  nightFactor = 0;
  clock = CLOCK.morning;

  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private sky: Sky;
  private stars: THREE.Points;
  private key: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private ocean: THREE.Mesh;
  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private envClock = -1;
  private rain: THREE.LineSegments;
  /** Luz del relámpago; existe siempre para no recompilar shaders. */
  private flashLight = new THREE.PointLight(0xdde6ff, 0, 30, 1.2);
  private rainLevel = 0;
  private shakeAmp = 0;
  private shakeOffset = new THREE.Vector3();
  private updaters: ((dt: number) => void)[] = [];
  private resizers: (() => void)[] = [];
  private frameTimes: number[] = [];
  quality: Quality = 'high';
  /** Se llama una vez si el rendimiento es bajo con calidad alta. */
  onSlow: (() => void) | null = null;
  private last = performance.now();
  private keys = new Set<string>();
  private raycaster = new THREE.Raycaster();
  private time = 0;

  constructor(container: HTMLElement, oceanNormal: THREE.Texture) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 46;
    this.controls.minPolarAngle = 0.28;
    this.controls.maxPolarAngle = 1.18;
    this.controls.zoomSpeed = 0.8;
    this.controls.screenSpacePanning = false;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.setCameraHome(true);

    // Cielo físico + estrellas
    this.sky = new Sky();
    this.sky.scale.setScalar(1000);
    const su = this.sky.material.uniforms;
    su.turbidity.value = 5;
    su.rayleigh.value = 1.4;
    su.mieCoefficient.value = 0.004;
    su.mieDirectionalG.value = 0.82;
    this.scene.add(this.sky);
    this.envScene.add(new THREE.Mesh(this.sky.geometry, this.sky.material));
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    this.stars = this.createStars();
    this.scene.add(this.stars);

    this.scene.fog = new THREE.FogExp2(0xbfd8ee, 0.008);

    // Luces
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5a4a3a, 0.8);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffffff, 2.5);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    const sc = this.key.shadow.camera;
    sc.left = sc.bottom = -(BOARD + 4);
    sc.right = sc.top = BOARD + 4;
    sc.near = 1;
    sc.far = 90;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.025;
    this.scene.add(this.key, this.key.target);

    // Océano
    const tex = oceanNormal.clone();
    tex.repeat.set(70, 70);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    this.ocean = new THREE.Mesh(
      new THREE.CircleGeometry(700, 64).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: P.ocean,
        roughness: 0.12,
        metalness: 0.05,
        normalMap: tex,
        normalScale: new THREE.Vector2(0.45, 0.45),
      }),
    );
    this.ocean.position.y = -0.5;
    this.ocean.receiveShadow = true;
    this.scene.add(this.ocean);

    this.rain = this.createRain();
    this.scene.add(this.rain, this.flashLight);

    // Postprocesado: bloom para emisivos + gradación de color nocturna
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.5, 1.6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    this.applyTimeOfDay();
  }

  // ───────────────────────── bucle ─────────────────────────

  onUpdate(fn: (dt: number) => void) {
    this.updaters.push(fn);
  }

  start() {
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private frame() {
    const now = performance.now();
    const raw = now - this.last;
    const dt = Math.min(50, raw);
    this.last = now;
    this.time += dt / 1000;
    this.trackPerformance(raw);

    anim.update(dt);
    this.applyTimeOfDay();
    this.keyboardPan(dt);
    for (const fn of this.updaters) fn(dt);

    const oceanTex = (this.ocean.material as THREE.MeshStandardMaterial).normalMap!;
    oceanTex.offset.set(this.time * 0.004, this.time * 0.003);
    this.updateRain(dt);

    this.controls.update();
    this.clampTarget();
    this.camera.position.sub(this.shakeOffset);
    this.shakeAmp *= Math.exp(-dt / 90);
    this.shakeOffset.set(
      (Math.random() - 0.5) * this.shakeAmp,
      (Math.random() - 0.5) * this.shakeAmp,
      (Math.random() - 0.5) * this.shakeAmp,
    );
    this.camera.position.add(this.shakeOffset);
    this.composer.render();
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    for (const fn of this.resizers) fn();
  }

  onResize(fn: () => void) {
    this.resizers.push(fn);
  }

  setQuality(q: Quality) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    const pr = q === 'high' ? Math.min(dpr, 2) : q === 'medium' ? Math.min(dpr, 1.5) : 1;
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.key.castShadow = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
    if (this.key.shadow.mapSize.x !== size) {
      this.key.shadow.mapSize.set(size, size);
      this.key.shadow.map?.dispose();
      (this.key.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
    }
    this.bloom.enabled = q !== 'low';
    this.resize();
  }

  /** Si los primeros segundos van lentos en calidad alta, avisa una vez. */
  private trackPerformance(frameMs: number) {
    if (!this.onSlow || this.quality !== 'high' || document.hidden) return;
    this.frameTimes.push(frameMs);
    if (this.frameTimes.length < 180) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (avg > 30) {
      const cb = this.onSlow;
      this.onSlow = null;
      cb();
    }
  }

  get bufferHeight(): number {
    return this.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
  }

  // ───────────────────────── cámara ─────────────────────────

  /** Vista inicial: mira hacia `focus` (el héroe) desde detrás y arriba. */
  setCameraHome(instant = false, focus = new THREE.Vector3(-4, 0, 7)) {
    const target = new THREE.Vector3(focus.x * 0.6, 0, focus.z * 0.6);
    const pos = target.clone().add(new THREE.Vector3(-7.3, 15.5, 17));
    if (instant) {
      this.controls.target.copy(target);
      this.camera.position.copy(pos);
      return Promise.resolve();
    }
    return this.flyTo(target, pos, 1200);
  }

  flyTo(target: THREE.Vector3, position: THREE.Vector3, duration = 900) {
    const t0 = this.controls.target.clone();
    const p0 = this.camera.position.clone();
    return anim.tween(duration, (k) => {
      this.controls.target.lerpVectors(t0, target, k);
      this.camera.position.lerpVectors(p0, position, k);
    });
  }

  /** Desplaza la cámara para centrar un punto manteniendo ángulo y zoom. */
  focus(point: THREE.Vector3, duration = 600) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const target = new THREE.Vector3(point.x, 0, point.z);
    return this.flyTo(target, target.clone().add(offset), duration);
  }

  shake(amount = 0.15) {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  private keyboardPan(dt: number) {
    let dx = 0;
    let dz = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) dz -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dz += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;
    const rot = (this.keys.has('e') ? 1 : 0) - (this.keys.has('q') ? 1 : 0);
    if (!dx && !dz && !rot) return;

    const fwd = new THREE.Vector3().subVectors(this.controls.target, this.camera.position).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    const move = fwd.multiplyScalar(-dz).add(right.multiplyScalar(dx)).multiplyScalar((dt / 1000) * 9);
    this.controls.target.add(move);
    this.camera.position.add(move);
    if (rot) {
      const off = this.camera.position.clone().sub(this.controls.target);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot * (dt / 1000) * 1.4);
      this.camera.position.copy(this.controls.target).add(off);
    }
  }

  /** Impide que la cámara se aleje del tablero al desplazarse. */
  private clampTarget() {
    const t = this.controls.target;
    const max = BOARD * 0.85;
    const len = Math.hypot(t.x, t.z);
    if (len > max) {
      const f = max / len;
      const corr = new THREE.Vector3(t.x * f - t.x, 0, t.z * f - t.z);
      t.add(corr);
      this.camera.position.add(corr);
    }
  }

  pick(clientX: number, clientY: number, objects: THREE.Object3D[]): THREE.Intersection | null {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObjects(objects, true)[0] ?? null;
  }

  project(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const v = p.clone().project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
      visible: v.z < 1,
    };
  }

  // ───────────────────────── día y noche ─────────────────────────

  /** Anima el reloj hasta `target` (siempre hacia delante). */
  setClock(target: number, duration = 900): Promise<void> {
    const from = this.clock;
    let to = target;
    while (to < from - 1e-4) to += 1;
    return anim.tween(duration, (k) => (this.clock = lerp(from, to, k)), ease.inOut);
  }

  private applyTimeOfDay() {
    const a = (this.clock % 1) * Math.PI * 2;
    const sunDir = new THREE.Vector3(-Math.cos(a), Math.sin(a), -0.45).normalize();
    const h = sunDir.y;
    const day = smoothstep(-0.12, 0.22, h);
    const golden = 1 - smoothstep(0.05, 0.45, Math.abs(h));
    this.nightFactor = 1 - day;

    this.sky.material.uniforms.sunPosition.value.copy(sunDir);
    this.sky.material.uniforms.rayleigh.value = lerp(0.35, 1.6, day);
    this.sky.material.uniforms.turbidity.value = lerp(8, 4.5, day);

    const sunUp = smoothstep(-0.02, 0.16, h);
    const moonUp = smoothstep(-0.02, 0.16, -h);
    const sunColor = new THREE.Color(0xff9a5a).lerp(new THREE.Color(0xfff2de), smoothstep(0.02, 0.5, h));
    const moonColor = new THREE.Color(0x9fb6ff);
    if (h >= 0) {
      this.key.position.copy(sunDir).multiplyScalar(40);
      this.key.color.copy(sunColor);
      this.key.intensity = 2.1 * sunUp;
    } else {
      this.key.position.copy(sunDir).multiplyScalar(-40);
      this.key.color.copy(moonColor);
      this.key.intensity = 0.75 * moonUp;
    }

    const skyDay = new THREE.Color(0xcfe3ff);
    const skyDusk = new THREE.Color(0xffb489);
    const skyNight = new THREE.Color(0x2c3a78);
    const sky = skyNight.clone().lerp(skyDay, day).lerp(skyDusk, golden * 0.55 * day);
    this.hemi.color.copy(sky);
    this.hemi.groundColor.copy(new THREE.Color(0x0e1020).lerp(new THREE.Color(0x5e4c3a), day));
    this.hemi.intensity = lerp(0.6, 0.55, day);

    const fogDay = new THREE.Color(0xbcd6ee);
    const fogDusk = new THREE.Color(0xe7a27c);
    const fogNight = new THREE.Color(0x0b1128);
    const fog = (this.scene.fog as THREE.FogExp2).color;
    fog.copy(fogNight).lerp(fogDay, day).lerp(fogDusk, golden * 0.6 * day);

    (this.stars.material as THREE.PointsMaterial).opacity = smoothstep(0.35, 0.9, this.nightFactor);
    this.renderer.toneMappingExposure = lerp(0.85, 0.82, day);
    this.scene.environmentIntensity = lerp(0.2, 0.42, day);
    this.grade.uniforms.uNight.value = this.nightFactor;
    this.bloom.strength = lerp(0.5, 0.9, this.nightFactor);

    for (const g of nightGlow) g.mat.emissiveIntensity = g.base * lerp(0.15, 1, this.nightFactor);

    // Regenera el mapa de entorno cuando el cielo cambia lo suficiente.
    if (Math.abs(this.clock - this.envClock) > 0.012) {
      this.envClock = this.clock;
      this.envTarget?.dispose();
      this.envTarget = this.pmrem.fromScene(this.envScene, 0, 0.1, 2000);
      this.scene.environment = this.envTarget.texture;
    }
  }

  private createStars(): THREE.Points {
    const n = 1800;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.acos(Math.random() * 0.95);
      pos[i * 3] = Math.sin(v) * Math.cos(u) * 800;
      pos[i * 3 + 1] = Math.cos(v) * 800;
      pos[i * 3 + 2] = Math.sin(v) * Math.sin(u) * 800;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.7,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    });
    return new THREE.Points(geo, material);
  }

  // ───────────────────────── clima ─────────────────────────

  private createRain(): THREE.LineSegments {
    const n = 1400;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * (BOARD * 2 + 6);
      const y = Math.random() * 18;
      const z = (Math.random() - 0.5) * (BOARD * 2 + 6);
      pos.set([x, y, z, x + 0.05, y + 0.45, z + 0.03], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.LineBasicMaterial({ color: 0x9fb7d9, transparent: true, opacity: 0, depthWrite: false });
    const lines = new THREE.LineSegments(geo, material);
    lines.frustumCulled = false;
    lines.visible = false;
    return lines;
  }

  setRain(on: boolean) {
    const from = this.rainLevel;
    this.rain.visible = true;
    return anim.tween(800, (k) => {
      this.rainLevel = lerp(from, on ? 1 : 0, k);
      (this.rain.material as THREE.LineBasicMaterial).opacity = this.rainLevel * 0.55;
      if (!on && k >= 1) this.rain.visible = false;
    });
  }

  private updateRain(dt: number) {
    if (!this.rain.visible) return;
    const attr = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const fall = (dt / 1000) * 16;
    for (let i = 0; i < arr.length; i += 6) {
      arr[i + 1] -= fall;
      arr[i + 4] -= fall;
      if (arr[i + 1] < -0.5) {
        arr[i + 1] += 18;
        arr[i + 4] += 18;
      }
    }
    attr.needsUpdate = true;
  }

  async lightning(at: THREE.Vector3) {
    const pts: THREE.Vector3[] = [];
    const top = new THREE.Vector3(at.x + (Math.random() - 0.5) * 4, 20, at.z + (Math.random() - 0.5) * 4);
    for (let i = 0; i <= 12; i++) {
      const p = new THREE.Vector3().lerpVectors(top, at, i / 12);
      if (i > 0 && i < 12) p.add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2));
      pts.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const material = new THREE.LineBasicMaterial({ color: new THREE.Color(6, 6, 9), transparent: true, toneMapped: false });
    const bolt = new THREE.Line(geo, material);
    this.scene.add(bolt);
    const flash = this.flashLight;
    flash.position.copy(at).setY(at.y + 2);
    this.shake(0.35);
    await anim.tween(450, (k) => {
      const f = (1 - k) * (k < 0.15 ? 1 : 0.5 + 0.5 * Math.sin(k * 40));
      material.opacity = 1 - k;
      flash.intensity = 60 * f;
      this.grade.uniforms.uFlash.value = 0.35 * f;
    }, ease.linear);
    this.grade.uniforms.uFlash.value = 0;
    flash.intensity = 0;
    this.scene.remove(bolt);
    geo.dispose();
    material.dispose();
  }

  flash(strength = 0.5, duration = 500) {
    return anim.tween(duration, (k) => (this.grade.uniforms.uFlash.value = strength * (1 - k)), ease.out);
  }
}
