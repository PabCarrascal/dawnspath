import * as THREE from 'three';

export interface EmitOpts {
  pos: THREE.Vector3;
  count: number;
  color: number;
  /** Velocidad horizontal máxima (u/s). */
  speed?: number;
  /** Velocidad vertical inicial (u/s). */
  up?: number;
  life?: number;
  size?: number;
  /** Gravedad (u/s²). Negativa = flota hacia arriba. */
  gravity?: number;
  /** Radio de dispersión del punto de origen. */
  spread?: number;
}

const MAX = 4000;

const vertex = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor * 2.2, t.a * vAlpha);
  }
`;

/** Sistema de partículas aditivas en un solo draw call. */
export class Particles {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private size = new Float32Array(MAX);
  private baseSize = new Float32Array(MAX);
  private alpha = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private cursor = 0;
  private geo: THREE.BufferGeometry;
  private c = new THREE.Color();

  constructor(map: THREE.Texture) {
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: { uMap: { value: map }, uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  /** Altura del framebuffer en píxeles y fov vertical en grados. */
  setViewport(bufferHeight: number, fovDeg: number) {
    const scale = bufferHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = scale;
  }

  emit(o: EmitOpts) {
    this.c.setHex(o.color);
    const speed = o.speed ?? 1;
    const spread = o.spread ?? 0.1;
    for (let n = 0; n < o.count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random());
      this.pos[i * 3] = o.pos.x + Math.cos(a) * r * spread;
      this.pos[i * 3 + 1] = o.pos.y + Math.random() * spread * 0.5;
      this.pos[i * 3 + 2] = o.pos.z + Math.sin(a) * r * spread;
      const sp = speed * (0.3 + Math.random() * 0.7);
      this.vel[i * 3] = Math.cos(a) * sp;
      this.vel[i * 3 + 1] = (o.up ?? 1) * (0.5 + Math.random() * 0.5);
      this.vel[i * 3 + 2] = Math.sin(a) * sp;
      this.col[i * 3] = this.c.r;
      this.col[i * 3 + 1] = this.c.g;
      this.col[i * 3 + 2] = this.c.b;
      this.baseSize[i] = (o.size ?? 0.1) * (0.6 + Math.random() * 0.8);
      this.maxLife[i] = this.life[i] = (o.life ?? 800) * (0.7 + Math.random() * 0.6);
      this.grav[i] = o.gravity ?? 1.5;
    }
  }

  update(dt: number) {
    const s = dt / 1000;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] -= this.grav[i] * s;
      this.vel[i * 3] *= 0.98;
      this.vel[i * 3 + 2] *= 0.98;
      this.pos[i * 3] += this.vel[i * 3] * s;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * s;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * s;
      this.alpha[i] = Math.min(1, k * 2.5);
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * k);
    }
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) this.geo.getAttribute(name).needsUpdate = true;
  }
}
