import * as THREE from 'three';

/** Normal map tileable para el agua, generada con suma de ondas. */
export function createWaterNormalMap(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const TAU = Math.PI * 2;
  const waves = [
    { kx: 3, ky: 1, a: 1.0, p: 0.2 },
    { kx: -2, ky: 4, a: 0.7, p: 1.3 },
    { kx: 5, ky: -3, a: 0.45, p: 2.1 },
    { kx: 1, ky: 7, a: 0.3, p: 0.7 },
    { kx: -8, ky: -5, a: 0.18, p: 2.9 },
    { kx: 11, ky: 4, a: 0.12, p: 4.1 },
  ];
  const height = (x: number, y: number) => {
    let h = 0;
    for (const w of waves) h += w.a * Math.sin(TAU * ((w.kx * x + w.ky * y) / size) + w.p);
    return h;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = height(x + 1, y) - height(x - 1, y);
      const dy = height(x, y + 1) - height(x, y - 1);
      const n = new THREE.Vector3(-dx * 0.9, -dy * 0.9, 1).normalize();
      const i = (y * size + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Sprite circular difuso para partículas. */
export function createSoftDot(size = 64): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
