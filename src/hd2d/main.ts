import './hd2d.css';
import '../ui/theme.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { audio, Track } from '../audio/Audio';
import { mountSoundControl } from '../audio/SoundControl';
import type { Biome } from '../combat/rules/data';
import { buildDiorama } from './diorama/build';
import { LookController, Mode } from './look';
import { buildPost } from './post';

/**
 * Prueba de estilo HD-2D: cada bioma como maqueta en 3D con personajes en
 * pixel art, desenfoque de maqueta, bloom y luz según la hora.
 * `?bioma=forest|meadow|…` y `?hora=day|dusk|night|dark`.
 */
const BIOME_NAMES: Record<Biome, string> = {
  forest: 'Bosque Hondo',
  meadow: 'Prado Ceniciento',
  ruins: 'Ruinas de Velar',
  ford: 'Vado del Cuervo',
  village: 'Aldea de Robledal',
  shrine: 'Ermita del Alba',
  mountain: 'Paso del Lobo',
  bog: 'Marjal Negro',
  den: 'Cubil de las Sombras',
  lair: 'Torre del Heraldo',
  castle: 'Castillo del Alba',
};
const params = new URLSearchParams(location.search);
const biome = ((Object.keys(BIOME_NAMES) as Biome[]).find((b) => b === params.get('bioma')) ?? 'forest') as Biome;
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('stage')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8dcc0);
scene.fog = new THREE.Fog(0xd8dcc0, 26, 70);

// Teleobjetivo y cámara alta: aplana la perspectiva, como en una maqueta fotografiada.
const camera = new THREE.PerspectiveCamera(26, window.innerWidth / window.innerHeight, 0.5, 200);
const forest = buildDiorama(biome, {
  scene: { party: ['hero', 'spearman', 'archer', 'chaplain'], structure: biome === 'castle' || biome === 'village' ? null : 'camp', fire: true, loot: biome !== 'castle' },
});
scene.add(forest.group);
camera.position.copy(forest.focus).add(new THREE.Vector3(0, 13.5, 25));

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(forest.focus);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 12;
controls.maxDistance = 34;
controls.minPolarAngle = 0.75;
controls.maxPolarAngle = 1.22;
controls.minAzimuthAngle = -0.7;
controls.maxAzimuthAngle = 0.7;
controls.update();

const post = buildPost(renderer, scene, camera);
const initial = (['day', 'dusk', 'night', 'dark'] as Mode[]).find((m) => m === params.get('hora')) ?? 'dusk';
const look = new LookController(scene, renderer, forest, post, initial);

// Deriva lenta de cámara mientras nadie la toca.
let idle = 0;
let drift = 0;
controls.addEventListener('start', () => (idle = -1e9));
controls.addEventListener('end', () => (idle = 0));

const clock = new THREE.Clock();
let elapsed = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  idle += dt;
  if (idle > 4 && autoCam) {
    drift += dt;
    const az = Math.sin(drift * 0.08) * 0.35;
    const r = camera.position.clone().sub(controls.target);
    const len = Math.hypot(r.x, r.z);
    r.x += (Math.sin(az) * len - r.x) * 0.01;
    r.z += (Math.cos(az) * len - r.z) * 0.01;
    camera.position.copy(controls.target).add(r);
  }
  controls.update();
  forest.update(dt, elapsed, camera);
  look.update(dt);
  post.composer.render(dt);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  post.setSize(w, h);
});

// ── Panel ──
const LABELS: Record<Mode, string> = { day: 'Día', dusk: 'Atardecer', night: 'Noche', dark: 'Oscuridad' };
let autoCam = true;
const ui = document.getElementById('ui')!;
ui.innerHTML = `
  <header class="hd-title">
    <p>Prueba de estilo · HD-2D</p>
    <h1>${BIOME_NAMES[biome]}</h1>
  </header>
  <nav class="hd-biomes">${(Object.keys(BIOME_NAMES) as Biome[]).map((b) => `<button data-biome="${b}" class="${b === biome ? 'on' : ''}">${BIOME_NAMES[b]}</button>`).join('')}</nav>
  <nav class="hd-panel">
    <div class="hd-group">${(Object.keys(LABELS) as Mode[]).map((m) => `<button data-mode="${m}">${LABELS[m]}</button>`).join('')}</div>
    <div class="hd-group">
      <button data-fx="tilt" class="on">Desenfoque</button>
      <button data-fx="bloom" class="on">Resplandor</button>
      <button data-fx="cam" class="on">Cámara lenta</button>
    </div>
  </nav>
  <p class="hd-hint">Arrastra para girar · rueda para acercar</p>`;
/** La pista que sonaría en el juego con este bioma y esta hora. */
const galleryMusic = (m: Mode): Track => (biome === 'castle' ? 'castle' : m === 'dark' || biome === 'lair' || biome === 'den' ? 'dark' : m === 'night' ? 'night' : 'road');
const syncModes = () => {
  for (const b of ui.querySelectorAll<HTMLButtonElement>('[data-mode]')) b.classList.toggle('on', b.dataset.mode === look.mode);
};
for (const b of ui.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
  b.addEventListener('click', () => {
    audio.unlock();
    const m = b.dataset.mode as Mode;
    look.set(m);
    audio.setNight(m === 'day' ? 0.2 : m === 'dusk' ? 0.6 : 1);
    audio.music(galleryMusic(m));
    audio.play(m === 'night' || m === 'dark' ? 'nightfall' : 'dawn');
    syncModes();
  });
}
for (const b of ui.querySelectorAll<HTMLButtonElement>('[data-biome]')) {
  b.addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.set('bioma', b.dataset.biome!);
    url.searchParams.set('hora', look.mode);
    location.href = url.toString();
  });
}
for (const b of ui.querySelectorAll<HTMLButtonElement>('[data-fx]')) {
  b.addEventListener('click', () => {
    const on = !b.classList.contains('on');
    b.classList.toggle('on', on);
    if (b.dataset.fx === 'tilt') post.setTiltShift(on);
    if (b.dataset.fx === 'bloom') post.setBloom(on);
    if (b.dataset.fx === 'cam') autoCam = on;
  });
}
syncModes();
mountSoundControl();
audio.music(galleryMusic(look.mode));
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

if (import.meta.env.DEV) Object.assign(window, { scene, camera, look, forest, post, renderer });
frame();
