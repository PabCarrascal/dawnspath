import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/rng';
import { FRAMES, IDLE_FRAMES, Pose, POSE_FRAME } from './characters';

/** Píxeles de sprite por unidad del mundo. */
export const SPRITE_PPU = 22;

/**
 * Luz propia de los personajes: en HD-2D se leen bien aunque esté oscuro. Sube
 * al caer la noche (la fija la luz de la escena) y vale para todos los sprites.
 */
const glowing = new Set<THREE.MeshStandardMaterial>();
let glow = 0.28;

export function setSpriteGlow(v: number) {
  glow = v;
  for (const m of glowing) m.emissiveIntensity = v;
}

export const spriteGlow = () => glow;

/** Personaje en pixel art: un plano que siempre mira a la cámara y alterna cuadros. */
export class PixelSprite {
  readonly mesh: THREE.Mesh;
  /** Alto del sprite en unidades del mundo. */
  readonly height: number;
  /** Mira a la izquierda (enemigos): la textura se invierte en horizontal. */
  flipped: boolean;
  private tex: THREE.Texture;
  private t = Math.random() * 2;
  private frame = 0;
  private pose: Pose = 'idle';

  constructor(sheet: THREE.Texture, scale: number, private fps = 1.6, flipped = false) {
    this.flipped = flipped;
    this.tex = sheet.clone();
    this.tex.needsUpdate = true;
    this.tex.repeat.set((flipped ? -1 : 1) / FRAMES, 1);
    this.tex.offset.x = flipped ? 1 / FRAMES : 0;
    const img = sheet.image as HTMLCanvasElement;
    const w = (img.width / FRAMES / SPRITE_PPU) * scale;
    const h = (img.height / SPRITE_PPU) * scale;
    this.height = h;
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate(0, h / 2 - (1 / SPRITE_PPU) * scale, 0);
    // Algo de luz propia: en HD-2D los personajes se leen bien aunque estén a contraluz.
    const mat = new THREE.MeshStandardMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: glow });
    glowing.add(mat);
    mat.addEventListener('dispose', () => glowing.delete(mat));
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.tex, alphaTest: 0.5 });
  }

  /** Gira el sprite hacia la izquierda o la derecha. */
  face(left: boolean) {
    if (left === this.flipped) return;
    this.flipped = left;
    this.tex.repeat.x = (left ? -1 : 1) / FRAMES;
    this.tex.offset.x = (left ? this.frame + 1 : this.frame) / FRAMES;
  }

  /** Cuadro fijo de golpe o de dolor; `idle` vuelve a respirar. */
  setPose(pose: Pose) {
    this.pose = pose;
  }

  update(dt: number, camera: THREE.Camera) {
    this.t += dt;
    const f = this.pose === 'idle' ? Math.floor(this.t * this.fps) % IDLE_FRAMES : POSE_FRAME[this.pose];
    if (f !== this.frame) {
      this.frame = f;
      this.tex.offset.x = (this.flipped ? f + 1 : f) / FRAMES;
    }
    // Giro solo en vertical (como los sprites de HD-2D: de pie, nunca tumbados).
    const p = this.mesh.position;
    this.mesh.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
  }
}

/** Hierba y flores que se mecen: desplaza la punta con el tiempo y la posición. */
export function swaying(mat: THREE.Material, uniforms: { uTime: { value: number } }) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 swayBase = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(uTime * 1.8 + swayBase.x * 0.9 + swayBase.z * 0.6) * 0.07 + sin(uTime * 3.1 + swayBase.x * 2.0) * 0.02;
        transformed.x += sway * uv.y;
        transformed.z += sway * 0.5 * uv.y;`,
      );
  };
}

/** Plano cruzado (dos quads en aspa), base de la vegetación en sprites. */
export function crossQuad(size: number) {
  const a = new THREE.PlaneGeometry(size, size);
  const b = new THREE.PlaneGeometry(size, size);
  b.rotateY(Math.PI / 2);
  const g = mergeGeometries([a, b])!;
  g.translate(0, size / 2, 0);
  return g;
}

/** Copos que caen despacio y derivan con el viento, en una caja de `area`. */
export function snowfall(count: number, rng: Rng, area: [number, number, number], size = 0.09) {
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rng.next() - 0.5) * area[0];
    pos[i * 3 + 1] = rng.next() * area[1];
    pos[i * 3 + 2] = (rng.next() - 0.5) * area[2];
    phase[i] = rng.next() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uHeight: { value: area[1] }, uSize: { value: size }, uColor: { value: new THREE.Color(0xf4f8ff) } },
    vertexShader: `
      attribute float phase;
      uniform float uTime;
      uniform float uHeight;
      uniform float uSize;
      void main() {
        vec3 p = position;
        p.y = uHeight - mod(uHeight - p.y + uTime * (0.45 + fract(phase) * 0.35), uHeight);
        p.x += sin(uTime * 0.6 + phase) * 0.5 + uTime * 0.12;
        p.x = mod(p.x + 15.0, 30.0) - 15.0;
        p.z += cos(uTime * 0.4 + phase * 1.7) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 0.85);
      }`,
  });
  return new THREE.Points(geo, mat);
}

/** Puntos que flotan: polvo de luz, luciérnagas, chispas o fuegos fatuos. */
export function floaters(count: number, rng: Rng, area: [number, number, number], size: number, color = 0xffe0a0) {
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rng.next() - 0.5) * area[0];
    pos[i * 3 + 1] = rng.next() * area[1];
    pos[i * 3 + 2] = (rng.next() - 0.5) * area[2];
    phase[i] = rng.next() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uSize: { value: size } },
    vertexShader: `
      attribute float phase;
      uniform float uTime;
      uniform float uSize;
      varying float vBlink;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.3 + phase) * 0.8;
        p.y += mod(uTime * 0.15 + phase * 0.37, 1.0) * 1.5 + sin(uTime * 0.7 + phase) * 0.3;
        p.z += cos(uTime * 0.25 + phase * 1.3) * 0.8;
        vBlink = 0.5 + 0.5 * sin(uTime * 2.0 + phase * 7.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vBlink;
      void main() {
        // Cuadrado, no círculo: es pixel art.
        gl_FragColor = vec4(uColor * (0.6 + vBlink), uOpacity * (0.35 + 0.65 * vBlink));
      }`,
  });
  return new THREE.Points(geo, mat);
}
