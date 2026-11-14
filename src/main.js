import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { setMaxAnisotropy } from './tex.js';
import { makeMaterials } from './materials.js';
import { Sky } from './sky.js';
import { Water } from './water.js';
import { Containers } from './containers.js';
import { buildShip } from './ship.js';
import { buildPort } from './port.js';
import { buildCranes } from './cranes.js';
import { buildBoats } from './boats.js';
import { Shots } from './shots.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('view');
const loadMsg = document.getElementById('loadmsg');
const tick = (msg) => new Promise((res) => { loadMsg.textContent = msg; requestAnimationFrame(() => setTimeout(res, 0)); });

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const PR = Math.min(window.devicePixelRatio || 1, Number(params.get('pr')) || 1.5);
renderer.setPixelRatio(PR);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 1, 16000);
camera.position.set(120, 8, 190);

const QUAY_Y = 3.5;
const world = { scene, camera, renderer, QUAY_Y, updaters: [] };

async function init() {
  await tick('Mixing paint');
  const M = makeMaterials();
  world.M = M;

  // ---- sky, light, fog ----
  const sky = new Sky(renderer);
  world.sky = sky;
  scene.add(sky.mesh);
  scene.fog = new THREE.FogExp2(0xffffff, 0.0002);
  scene.fog.color = sky.uniforms.horizon.value;
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const S = 400;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 50, far: 2600 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.35;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd4e6, 0x4a463e, 0.3);
  scene.add(hemi);
  scene.environmentIntensity = 0.9;

  const water = new Water(renderer, sky);
  world.water = water;
  scene.add(water.mesh);
  water.uniforms.fogDensity.value = scene.fog.density;

  const setSun = (deg) => {
    sky.setSun(deg);
    sun.color.copy(sky.uniforms.sunColor.value);
    sun.intensity = sky.sunIntensity;
    hemi.intensity = 0.3 * sky.ambient;
    hemi.color.copy(sky.uniforms.zenith.value).lerp(new THREE.Color(1, 1, 1), 0.55);
    water.uniforms.sunPower.value = sky.sunIntensity;
    sky.updateEnv(scene);
    const h = 6.2 + (deg / 58) * 5.6;                 // a believable morning clock for the HUD
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    document.getElementById('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };
  world.setSun = setSun;
  setSun(Number(params.get('sun')) || 30);

  await tick('Pouring the quay');
  const containers = new Containers();
  world.containers = containers;
  buildPort(world);

  await tick('Bringing the ship alongside');
  world.ship = buildShip(scene, M, containers, { x: 0, z: 22.4, quayY: QUAY_Y, workBays: [-30, 37.5] });
  world.updaters.push(world.ship.update);

  await tick('Raising the cranes');
  buildCranes(world);

  await tick('Stacking 7,500 boxes');
  world.containerCount = containers.build(scene);

  await tick('Launching the tug');
  buildBoats(world);

  // ---- post ----
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.16, 0.7, 1.35);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const shots = new Shots(world);
  world.shots = shots;

  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    water.setSize(w * PR, h * PR);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  // ---- sun shadow frustum follows the view, snapped to shadow texels ----
  const fwd = new THREE.Vector3(), focus = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const texel = (2 * S) / sun.shadow.mapSize.x;
  const aimSun = () => {
    camera.getWorldDirection(fwd);
    const horiz = Math.hypot(fwd.x, fwd.z) || 1;
    let reach = 220;
    if (fwd.y < -0.02) reach = Math.min(340, Math.max(40, (camera.position.y - 4) / -fwd.y * horiz));
    focus.set(camera.position.x + (fwd.x / horiz) * reach, 0, camera.position.z + (fwd.z / horiz) * reach);
    const d = sky.uniforms.sunDir.value;
    right.set(0, 1, 0).cross(d).normalize();
    up.copy(d).cross(right).normalize();
    const fx = focus.dot(right), fy = focus.dot(up);
    focus.addScaledVector(right, Math.round(fx / texel) * texel - fx).addScaledVector(up, Math.round(fy / texel) * texel - fy);
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(d, 1300);
    sun.target.updateMatrixWorld();
  };

  // ---- HUD ----
  const sunInput = document.getElementById('sun');
  sunInput.value = String(Number(params.get('sun')) || 30);
  let sunPending = null;
  sunInput.addEventListener('input', () => { sunPending = Number(sunInput.value); });
  window.addEventListener('keydown', (e) => { if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('nohud'); });
  if (params.get('hud') === '0') document.body.classList.add('nohud');

  // ---- loop ----
  const clock = new THREE.Clock();
  let time = Number(params.get('t')) || 0;
  const frozen = params.has('freeze');
  world.setTime = (v) => { time = v; };
  let frames = 0, fpsT = 0;
  world.fps = 0;
  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!frozen) time += dt;
    frames++; fpsT += dt;
    if (fpsT > 1) { world.fps = frames / fpsT; frames = 0; fpsT = 0; }
    if (sunPending !== null) { setSun(sunPending); sunPending = null; }
    sky.uniforms.time.value = time;
    water.uniforms.time.value = time;
    for (const u of world.updaters) u(time, dt);
    shots.update(time, dt);
    camera.updateMatrixWorld();
    sky.mesh.position.set(camera.position.x, 0, camera.position.z);
    aimSun();
    renderer.shadowMap.needsUpdate = true;
    water.renderMirror(scene, camera);
    composer.render();
    requestAnimationFrame(frame);
  };
  // offline capture: render one exact frame of a given shot at a given scene time
  world.renderAt = (sceneT, shotIndex, k) => {
    sky.uniforms.time.value = sceneT;
    water.uniforms.time.value = sceneT;
    for (const u of world.updaters) u(sceneT, 1 / 60);
    shots.pose(shotIndex, k, sceneT);
    camera.updateMatrixWorld();
    sky.mesh.position.set(camera.position.x, 0, camera.position.z);
    aimSun();
    renderer.shadowMap.needsUpdate = true;
    water.renderMirror(scene, camera);
    composer.render();
  };
  world.composer = composer;
  world.look = (px, py, pz, tx, ty, tz, fov = 38) => {
    shots.mode = 'free'; shots.controls.enabled = true;
    camera.position.set(px, py, pz); shots.controls.target.set(tx, ty, tz);
    camera.fov = fov; camera.updateProjectionMatrix(); shots._label();
  };
  window.__port = world;
  await tick('Opening the gates');
  if (params.has('capture')) { world.renderAt(0, 0, 0); world.ready = true; } else frame();
  document.getElementById('loading').classList.add('done');
}

init().catch((e) => { console.error(e); loadMsg.textContent = 'Build failed: ' + e.message; });
