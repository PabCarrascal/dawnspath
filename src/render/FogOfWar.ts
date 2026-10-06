import * as THREE from 'three';
import { fromWorld, key } from '../core/hex';
import { BALANCE } from '../game/config';
import type { Tile } from '../game/types';
import { HEX_SIZE } from './layout';

const RES = 160;
/** Media anchura del área cubierta: el tablero más un margen. */
const HALF = BALANCE.mapRadius * Math.sqrt(3) * HEX_SIZE + 2;

/**
 * Niebla de guerra en GPU: una textura de visibilidad (1 = visible,
 * 0.5 = explorado, 0 = desconocido) que se muestrea en el shader de cada
 * material del tablero. El filtrado lineal da bordes suaves y los valores
 * se interpolan en el tiempo para que la niebla "respire" al revelarse.
 */
export class FogOfWar {
  readonly uniforms = {
    fowMap: { value: null as THREE.DataTexture | null },
    fowBounds: { value: new THREE.Vector4(-HALF, -HALF, HALF * 2, HALF * 2) },
  };

  private data = new Uint8Array(RES * RES * 4);
  private current = new Float32Array(RES * RES);
  private target = new Float32Array(RES * RES);
  private texelKeys: (string | null)[] = [];
  private texture: THREE.DataTexture;
  private settled = false;

  constructor() {
    this.texture = new THREE.DataTexture(this.data, RES, RES, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    this.uniforms.fowMap.value = this.texture;

    for (let y = 0; y < RES; y++) {
      for (let x = 0; x < RES; x++) {
        const wx = -HALF + ((x + 0.5) / RES) * HALF * 2;
        const wz = -HALF + ((y + 0.5) / RES) * HALF * 2;
        this.texelKeys.push(key(fromWorld(wx, wz, HEX_SIZE)));
      }
    }
    this.current.fill(1);
    this.target.fill(1);
  }

  setTiles(tiles: Map<string, Tile>, instant = false) {
    for (let i = 0; i < this.texelKeys.length; i++) {
      const t = tiles.get(this.texelKeys[i]!);
      this.target[i] = !t ? 1 : t.visible ? 1 : t.explored ? 0.5 : 0;
    }
    if (instant) this.current.set(this.target);
    this.settled = false;
  }

  update(dt: number) {
    if (this.settled) return;
    const k = 1 - Math.exp(-dt / 220);
    let moving = false;
    for (let i = 0; i < this.current.length; i++) {
      const d = this.target[i] - this.current[i];
      if (Math.abs(d) > 0.002) {
        this.current[i] += d * k;
        moving = true;
      } else this.current[i] = this.target[i];
      this.data[i * 4] = this.current[i] * 255;
    }
    this.texture.needsUpdate = true;
    this.settled = !moving;
  }

  /** Inyecta el muestreo de la niebla en un material estándar. */
  patch<T extends THREE.Material>(material: T): T {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.fowMap = this.uniforms.fowMap;
      shader.uniforms.fowBounds = this.uniforms.fowBounds;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFowPos;')
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vec4 fowP = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            fowP = instanceMatrix * fowP;
          #endif
          vFowPos = (modelMatrix * fowP).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vFowPos;\nuniform sampler2D fowMap;\nuniform vec4 fowBounds;',
        )
        .replace(
          '#include <opaque_fragment>',
          `{
            float fow = texture2D(fowMap, (vFowPos.xz - fowBounds.xy) / fowBounds.zw).r;
            vec3 lit = outgoingLight;
            float lum = dot(lit, vec3(0.299, 0.587, 0.114));
            vec3 memory = mix(vec3(lum), lit, 0.3) * vec3(0.42, 0.45, 0.58);
            vec3 unknown = memory * vec3(0.22, 0.24, 0.34);
            outgoingLight = fow > 0.5
              ? mix(memory, lit, (fow - 0.5) * 2.0)
              : mix(unknown, memory, fow * 2.0);
          }
          #include <opaque_fragment>`,
        );
    };
    material.customProgramCacheKey = () => 'fow';
    return material;
  }
}
