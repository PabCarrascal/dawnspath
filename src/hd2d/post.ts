import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * Desenfoque de maqueta (tilt-shift): nítido en una franja horizontal y cada
 * vez más borroso hacia arriba y hacia abajo. Se aplica en dos pasadas.
 */
const TiltShift = (dir: 'h' | 'v') => ({
  uniforms: {
    tDiffuse: { value: null },
    uStep: { value: 1 / 1000 },
    uFocus: { value: 0.52 },
    uBand: { value: 0.14 },
    uAmount: { value: 1 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uStep;
    uniform float uFocus;
    uniform float uBand;
    uniform float uAmount;
    varying vec2 vUv;
    void main() {
      float d = max(0.0, abs(vUv.y - uFocus) - uBand);
      float r = clamp(d * 3.2, 0.0, 1.0) * uAmount;
      vec2 dir = ${dir === 'h' ? 'vec2(1.0, 0.0)' : 'vec2(0.0, 1.0)'} * uStep * r * 6.0;
      vec4 sum = vec4(0.0);
      sum += texture2D(tDiffuse, vUv - 4.0 * dir) * 0.051;
      sum += texture2D(tDiffuse, vUv - 3.0 * dir) * 0.0918;
      sum += texture2D(tDiffuse, vUv - 2.0 * dir) * 0.12245;
      sum += texture2D(tDiffuse, vUv - 1.0 * dir) * 0.1531;
      sum += texture2D(tDiffuse, vUv) * 0.1633;
      sum += texture2D(tDiffuse, vUv + 1.0 * dir) * 0.1531;
      sum += texture2D(tDiffuse, vUv + 2.0 * dir) * 0.12245;
      sum += texture2D(tDiffuse, vUv + 3.0 * dir) * 0.0918;
      sum += texture2D(tDiffuse, vUv + 4.0 * dir) * 0.051;
      gl_FragColor = sum;
    }`,
});

/** Gradación: saturación, tinte cálido o frío según la hora y viñeta. */
const Grade = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.2 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uVignette: { value: 0.55 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform vec3 uTint;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 col = mix(vec3(l), c.rgb, uSaturation) * uTint;
      float d = distance(vUv, vec2(0.5, 0.48));
      col *= mix(1.0, smoothstep(0.82, 0.25, d), uVignette);
      gl_FragColor = vec4(col, c.a);
    }`,
};

export interface Post {
  composer: EffectComposer;
  setSize(w: number, h: number): void;
  setGrade(saturation: number, tint: number, bloom: number): void;
  setTiltShift(on: boolean): void;
  setBloom(on: boolean): void;
}

export function buildPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Post {
  const size = renderer.getSize(new THREE.Vector2());
  // Antialiasing por muestreo múltiple en el render inicial.
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(size, 0.4, 0.55, 0.82);
  composer.addPass(bloom);
  const h1 = new ShaderPass(TiltShift('h'));
  const v1 = new ShaderPass(TiltShift('v'));
  const h2 = new ShaderPass(TiltShift('h'));
  const v2 = new ShaderPass(TiltShift('v'));
  const tilt = [h1, v1, h2, v2];
  for (const p of tilt) composer.addPass(p);
  const grade = new ShaderPass(Grade);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  let bloomOn = true;
  let bloomStrength = 0.4;

  const setSize = (w: number, h: number) => {
    composer.setSize(w, h);
    bloom.setSize(w, h);
    h1.uniforms.uStep.value = h2.uniforms.uStep.value = 1 / w;
    v1.uniforms.uStep.value = v2.uniforms.uStep.value = 1 / h;
    // La segunda pasada, más fina, suaviza las bandas de la primera.
    h2.uniforms.uAmount.value = v2.uniforms.uAmount.value = 0.5;
  };
  setSize(size.x, size.y);

  return {
    composer,
    setSize,
    setGrade(saturation, tint, strength) {
      grade.uniforms.uSaturation.value = saturation;
      grade.uniforms.uTint.value.set(tint);
      bloomStrength = strength;
      bloom.strength = bloomOn ? strength : 0;
    },
    setTiltShift(on) {
      for (const p of tilt) p.enabled = on;
    },
    setBloom(on) {
      bloomOn = on;
      bloom.strength = on ? bloomStrength : 0;
    },
  };
}
