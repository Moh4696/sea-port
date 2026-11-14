import * as THREE from 'three';
import { Batch, beamGeo, rodGeo, boxGeo, cylGeo, V, makeRng, lerp } from './util.js';
import { hullTex, flagTex } from './tex.js';
import { loftHull } from './ship.js';

function hullMeshes(group, hull, info, M, { deckMat, drop = 0.8, inset = 0.25 } = {}) {
  const matS = new THREE.MeshStandardMaterial({ map: hullTex({ ...info, mirrored: false, seed: info.seed }), roughness: 0.5, side: THREE.DoubleSide });
  const matP = new THREE.MeshStandardMaterial({ map: hullTex({ ...info, mirrored: true, seed: info.seed + 3 }), roughness: 0.5, side: THREE.DoubleSide });
  const tr = new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.55, side: THREE.DoubleSide });
  for (const [geo, mat] of [[hull.side(1), matS], [hull.side(-1), matP], [hull.deck(drop, inset), deckMat || M.deckGreen], [hull.transom(), tr]]) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
}

function tyre(b, M, x, y, z, r = 0.55, yaw = 0) {
  const t = new THREE.TorusGeometry(r, r * 0.38, 7, 14);
  t.rotateY(yaw);
  t.translate(x, y, z);
  b.add(M.rubber, t);
}

function makeFlag(scene, world, tex, w = 2.2, h = 1.4) {
  const g = new THREE.PlaneGeometry(w, h, 12, 4);
  g.translate(w / 2, 0, 0);
  const base = g.attributes.position.array.slice();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
  m.castShadow = true;
  const ph = Math.random() * 10;
  world.updaters.push((t) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      const k = x / w;
      p.setZ(i, Math.sin(x * 2.6 - t * 6 + ph) * 0.22 * k + Math.sin(x * 5.1 - t * 9 + y * 2) * 0.06 * k);
      p.setY(i, y - k * k * 0.28 + Math.sin(x * 2.1 - t * 5 + ph) * 0.05 * k);
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
  });
  return m;
}

// ----------------------------------------------------------------------
function buildTug(world) {
  const { M } = world;
  const g = new THREE.Group();
  const L = 31, B = 10.6, D = 2.9, T = 4.2, sheer = 1.5;
  const hull = loftHull({ L, B, D, T, sheer, sheerStart: 0.42, bowStart: 0.52, kLow: 1.7, kHigh: 2.5, rake: 2.2, sternLen: 0.3, sternNarrow: 0, sternRound: 0.42, bilge: 1.8, N: 56 });
  hullMeshes(g, hull, { L, T, D, sheer, lineName: '', shipName: 'BRISA', home: '', color: '#15202c', redTop: 0.45, nameH: 0.62, big: false, seed: 61 }, M);
  const b = new Batch();
  const uOf = (x) => (x + L / 2) / L;
  const deck = (x) => hull.deckY(uOf(x)) - 0.8;

  // gunwale rub rail + tyre fenders
  for (const s of [1, -1]) {
    let prev = null;
    for (let i = 0; i <= 40; i++) {
      const u = 0.002 + (i / 40) * 0.996;
      const y = hull.deckY(u);
      const p = V(hull.xAt(u, y), y - 0.05, s * (hull.half(u, y) + 0.04));
      if (prev) b.add(M.rubber, beamGeo(prev, p, 0.24, 0.3));
      if (prev && i % 4 === 2 && u < 0.86) tyre(b, M, p.x, y - 0.85, p.z + s * 0.2, 0.56, 0);
      prev = p;
    }
    // bow pudding: tyres wrapped around the stem
    for (let i = 0; i < 4; i++) {
      const u = 0.88 + i * 0.035;
      const y = hull.deckY(u) - 0.6;
      const hb = hull.half(u, y);
      tyre(b, M, hull.xAt(u, y) + 0.1, y, s * (hb + 0.22), 0.62, s * (0.5 + i * 0.28));
    }
  }
  tyre(b, M, hull.xAt(1, D + sheer) + 0.25, D + sheer - 0.7, 0, 0.66, Math.PI / 2);
  for (const z of [-2.6, 0, 2.6]) tyre(b, M, -L / 2 - 0.25, D - 0.9, z, 0.56, Math.PI / 2);

  // deckhouse
  const d0 = deck(2);
  b.add(M.white, boxGeo(12, 2.5, 6.2, 2.4, d0 + 1.25, 0));
  b.add(M.white, boxGeo(12.6, 0.14, 6.9, 2.4, d0 + 2.57, 0));
  for (let k = 0; k < 5; k++) for (const s of [1, -1]) {
    b.add(M.glass, cylGeo(0.26, 0.26, 0.08, -2.2 + k * 2.1, d0 + 1.55, s * 3.12, 12, 'z'));
    b.add(M.galv, cylGeo(0.32, 0.32, 0.05, -2.2 + k * 2.1, d0 + 1.55, s * 3.1, 12, 'z'));
  }
  b.add(M.dark, boxGeo(0.06, 1.9, 0.8, -3.63, d0 + 1.0, 1.4));                    // aft door
  for (const s of [1, -1]) { const r = new THREE.TorusGeometry(0.33, 0.08, 6, 14); r.translate(6.5, d0 + 1.5, s * 3.16); b.add(M.orange, r); }
  // rails on the house top
  for (const s of [1, -1]) {
    b.add(M.white, beamGeo(V(-3.6, d0 + 3.55, s * 3.3), V(8.4, d0 + 3.55, s * 3.3), 0.05, 0.05));
    b.add(M.white, beamGeo(V(-3.6, d0 + 3.1, s * 3.3), V(8.4, d0 + 3.1, s * 3.3), 0.04, 0.04));
    for (let x = -3.6; x <= 8.41; x += 2) b.add(M.white, boxGeo(0.05, 1.0, 0.05, x, d0 + 3.07, s * 3.3));
  }
  // wheelhouse: all-round glazing, raked front
  const w0 = d0 + 2.64;
  b.add(M.white, boxGeo(5.0, 1.0, 4.9, 4.6, w0 + 0.5, 0));
  b.add(M.glass, boxGeo(4.8, 1.15, 4.75, 4.6, w0 + 1.55, 0));
  for (const x of [2.2, 3.4, 4.6, 5.8, 7.0]) for (const s of [1, -1]) b.add(M.white, boxGeo(0.14, 1.2, 0.1, x, w0 + 1.55, s * 2.4));
  for (const z of [-2.4, -1.2, 0, 1.2, 2.4]) { b.add(M.white, boxGeo(0.1, 1.2, 0.14, 7.02, w0 + 1.55, z)); b.add(M.white, boxGeo(0.1, 1.2, 0.14, 2.18, w0 + 1.55, z)); }
  b.add(M.white, boxGeo(5.9, 0.18, 5.7, 4.75, w0 + 2.22, 0));
  b.add(M.white, boxGeo(5.0, 0.22, 4.9, 4.6, w0 + 2.38, 0));
  // mast, lights, searchlight
  const mt = w0 + 2.5;
  b.add(M.white, cylGeo(0.09, 0.14, 4.6, 4.0, mt + 2.3, 0, 8));
  b.add(M.white, boxGeo(0.1, 0.1, 3.0, 4.0, mt + 2.6, 0));
  b.add(M.white, beamGeo(V(4.0, mt + 3.4, 0), V(2.2, mt, 0), 0.07, 0.07));
  b.add(M.lamp, boxGeo(0.22, 0.22, 0.22, 4.1, mt + 4.4, 0));
  b.add(M.lamp, boxGeo(0.2, 0.2, 0.2, 4.1, mt + 3.7, 0));
  b.add(M.galv, cylGeo(0.3, 0.3, 0.35, 6.2, mt + 0.5, 1.4, 10, 'x'));
  b.add(M.galv, boxGeo(0.1, 0.4, 0.1, 6.2, mt + 0.2, 1.4));
  // twin exhaust stacks
  for (const s of [1, -1]) {
    b.add(M.orange, cylGeo(0.48, 0.55, 2.7, -1.6, d0 + 2.6 + 1.35, s * 1.9, 12));
    b.add(M.black, cylGeo(0.5, 0.5, 0.6, -1.6, d0 + 2.6 + 3.0, s * 1.9, 12));
    b.add(M.black, cylGeo(0.22, 0.22, 0.7, -1.6, d0 + 2.6 + 3.5, s * 1.9, 8));
  }
  // towing winch aft, hook, H-bitt, tow rail
  const a0 = deck(-7);
  b.add(M.yellow, cylGeo(0.95, 0.95, 2.5, -6.2, a0 + 1.35, 0, 16, 'z'));
  b.add(M.yellow, cylGeo(1.25, 1.25, 0.14, -6.2, a0 + 1.35, -1.3, 16, 'z'));
  b.add(M.yellow, cylGeo(1.25, 1.25, 0.14, -6.2, a0 + 1.35, 1.3, 16, 'z'));
  b.add(M.rope, cylGeo(1.08, 1.08, 2.3, -6.2, a0 + 1.35, 0, 16, 'z'));
  b.add(M.dark, boxGeo(2.6, 0.5, 3.4, -6.2, a0 + 0.25, 0));
  b.add(M.dark, boxGeo(1.0, 1.7, 0.5, -6.2, a0 + 0.85, 1.75));
  b.add(M.dark, boxGeo(1.0, 1.7, 0.5, -6.2, a0 + 0.85, -1.75));
  for (const z of [-1.2, 1.2]) b.add(M.dark, cylGeo(0.22, 0.22, 1.5, -11.6, deck(-11.6) + 0.75, z, 10));
  b.add(M.dark, cylGeo(0.14, 0.14, 3.0, -11.6, deck(-11.6) + 1.1, 0, 8, 'z'));
  b.add(M.galv, beamGeo(V(-9.2, a0 + 1.5, -3.6), V(-9.2, a0 + 1.5, 3.6), 0.12, 0.12));
  for (const z of [-3.6, 3.6]) b.add(M.galv, boxGeo(0.12, 1.5, 0.12, -9.2, a0 + 0.75, z));
  // fore winch + bitts
  const f0 = deck(10.5);
  b.add(M.yellow, cylGeo(0.7, 0.7, 1.8, 10.2, f0 + 1.0, 0, 14, 'z'));
  b.add(M.yellow, cylGeo(0.95, 0.95, 0.12, 10.2, f0 + 1.0, -0.95, 14, 'z'));
  b.add(M.yellow, cylGeo(0.95, 0.95, 0.12, 10.2, f0 + 1.0, 0.95, 14, 'z'));
  b.add(M.rope, cylGeo(0.82, 0.82, 1.7, 10.2, f0 + 1.0, 0, 14, 'z'));
  b.add(M.dark, boxGeo(2.0, 0.4, 2.6, 10.2, f0 + 0.2, 0));
  for (const z of [-0.5, 0.5]) b.add(M.dark, cylGeo(0.2, 0.2, 1.1, 13.0, deck(13) + 0.55, z, 10));
  // jackstaff at the stern
  b.add(M.white, cylGeo(0.04, 0.05, 3.2, -14.6, deck(-14.6) + 2.4, 0, 6));
  b.build(g);

  const flag = makeFlag(g, world, flagTex(0), 1.5, 0.95);
  flag.position.set(-14.6, deck(-14.6) + 3.5, 0);
  flag.rotation.y = Math.PI;
  g.add(flag);
  const radar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 2.0), M.whiteClean);
  radar.position.set(4.0, mt + 3.1, 0);
  g.add(radar);
  world.updaters.push((t) => { radar.rotation.y = t * 2.8; });
  return g;
}

// ----------------------------------------------------------------------
function buildPilotBoat(world) {
  const { M } = world;
  const g = new THREE.Group();
  const L = 17, B = 5.0, D = 1.7, T = 1.4, sheer = 0.9;
  const hull = loftHull({ L, B, D, T, sheer, sheerStart: 0.4, bowStart: 0.42, kLow: 1.3, kHigh: 1.9, rake: 1.6, sternLen: 0.1, sternNarrow: 0.08, bilge: 0.7, N: 40 });
  hullMeshes(g, hull, { L, T, D, sheer, lineName: 'PILOT', shipName: '', home: '', color: '#c9541f', redTop: 0.2, lineH: 0.9, lineY: 1.0, big: false, seed: 71 }, M, { deckMat: M.grey, drop: 0.25, inset: 0.1 });
  const b = new Batch();
  const d0 = D - 0.25;
  b.add(M.white, boxGeo(6.4, 1.2, 3.6, 0.6, d0 + 0.6, 0));
  b.add(M.glass, boxGeo(5.2, 1.0, 3.5, 0.9, d0 + 1.7, 0));
  b.add(M.white, boxGeo(5.6, 0.14, 3.8, 0.8, d0 + 2.27, 0));
  for (const x of [-1.7, 0, 1.7, 3.5]) for (const s of [1, -1]) b.add(M.white, boxGeo(0.12, 1.05, 0.08, x, d0 + 1.7, s * 1.76));
  b.add(M.white, cylGeo(0.05, 0.08, 2.6, -0.4, d0 + 3.6, 0, 6));
  b.add(M.white, boxGeo(0.08, 0.08, 1.8, -0.4, d0 + 4.1, 0));
  b.add(M.lamp, boxGeo(0.16, 0.16, 0.16, -0.4, d0 + 4.95, 0));
  for (const s of [1, -1]) {
    b.add(M.galv, beamGeo(V(-7.5, d0 + 1.1, s * 2.2), V(5.5, d0 + 1.2, s * 1.9), 0.05, 0.05));
    for (let x = -7.5; x <= 5.5; x += 2.6) b.add(M.galv, boxGeo(0.05, 1.0, 0.05, x, d0 + 0.6, s * lerp(2.2, 1.9, (x + 7.5) / 13)));
    let prev = null;
    for (let i = 0; i <= 24; i++) {
      const u = 0.004 + (i / 24) * 0.99, y = hull.deckY(u);
      const p = V(hull.xAt(u, y), y - 0.05, s * (hull.half(u, y) + 0.03));
      if (prev) b.add(M.rubber, beamGeo(prev, p, 0.2, 0.26));
      prev = p;
    }
  }
  b.build(g);
  return g;
}

// ----------------------------------------------------------------------
function buildBuoy(world, x, z, kind) {
  const { M, scene } = world;
  const g = new THREE.Group();
  const b = new Batch();
  const mat = kind === 'red' ? M.buoyRed : M.buoyGreen;
  b.add(mat, cylGeo(1.25, 1.05, 1.5, 0, 0.3, 0, 16));
  b.add(mat, cylGeo(0.9, 1.25, 0.5, 0, 1.3, 0, 16));
  b.add(M.dark, cylGeo(1.06, 0.8, 0.9, 0, -0.9, 0, 16));
  for (let k = 0; k < 4; k++) {
    const a = k / 4 * 6.283 + 0.78;
    b.add(mat, beamGeo(V(Math.cos(a) * 0.75, 1.5, Math.sin(a) * 0.75), V(Math.cos(a) * 0.3, 4.3, Math.sin(a) * 0.3), 0.07, 0.07));
  }
  b.add(mat, cylGeo(0.34, 0.34, 0.08, 0, 3.0, 0, 10));
  if (kind === 'red') b.add(mat, cylGeo(0.5, 0.5, 0.9, 0, 4.75, 0, 12));
  else b.add(mat, cylGeo(0.02, 0.6, 1.0, 0, 4.8, 0, 12));
  b.add(M.galv, boxGeo(0.5, 0.5, 0.04, 0, 3.6, 0.32));                       // radar reflector / solar panel
  b.build(g);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), (kind === 'red' ? M.redLamp : M.greenLamp).clone());
  lamp.position.y = 5.45;
  g.add(lamp);
  g.position.set(x, 0, z);
  scene.add(g);
  const ph = x * 0.37 + z * 0.11;
  world.updaters.push((t) => {
    g.position.y = Math.sin(t * 1.1 + ph) * 0.14 + Math.sin(t * 0.63 + ph * 2) * 0.07;
    g.rotation.x = Math.sin(t * 0.9 + ph) * 0.07;
    g.rotation.z = Math.sin(t * 0.75 + ph * 1.7) * 0.08;
    lamp.material.emissiveIntensity = ((t + ph) % 4) < 0.5 ? 6 : 0.2;
  });
}

// ----------------------------------------------------------------------
function buildDistantShip(world, x, z, heading, variant) {
  const { M, scene } = world;
  const g = new THREE.Group();
  const L = 230, B = 34, D = 12, T = 10;
  const hull = loftHull({ L, B, D, T, sheer: 2.5, bowStart: 0.78, kLow: 1.3, kHigh: 2.6, rake: 5, N: 36 });
  const hm = variant ? M.navy : M.dark;
  for (const geo of [hull.side(1), hull.side(-1), hull.transom()]) g.add(new THREE.Mesh(geo, hm));
  g.add(new THREE.Mesh(hull.deck(0, 0), M.deck));
  const b = new Batch();
  const rr = makeRng(variant * 31 + 7);
  const mats = [M.red, M.navy, M.teal, M.grey, M.orange, M.white, M.deckGreen];
  if (variant === 0) {
    for (let k = 0; k < 11; k++) {
      const x0 = -52 + k * 13.6, h = 2.6 * (3 + Math.floor(rr() * 4));
      for (let r = 0; r < 3; r++) b.add(mats[Math.floor(rr() * mats.length)], boxGeo(12.4, h - r * 1.3 * rr(), 10, x0, D + 1 + h / 2, (r - 1) * 10.4));
    }
  } else {
    for (let k = 0; k < 5; k++) b.add(M.roofRed, boxGeo(22, 2.2, 26, -50 + k * 30, D + 1.1, 0));      // bulk carrier hatches
    for (let k = 0; k < 4; k++) { b.add(M.yellow, cylGeo(0.9, 1.2, 16, -35 + k * 30, D + 8, 0, 8)); b.add(M.yellow, beamGeo(V(-35 + k * 30, D + 14, 0), V(-21 + k * 30, D + 9, 0), 0.8, 0.8)); }
  }
  b.add(M.white, boxGeo(13, 24, 28, -88, D + 12, 0));
  b.add(M.bridge, boxGeo(8, 3, 36, -87, D + 25.5, 0));
  b.add(variant ? M.orange : M.navy, boxGeo(6, 9, 8, -100, D + 18, 0));
  b.build(g, { cast: false, receive: false });
  g.position.set(x, 0, z);
  g.rotation.y = heading;
  scene.add(g);
}

function buildGulls(world) {
  const { scene } = world;
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.9, side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.16, 0, 0, -0.18, 0.75, 0, -0.02, 0.75, 0, -0.02, 0, 0, -0.18, 1.3, 0, -0.3], 3));
  wingGeo.computeVertexNormals();
  const bodyGeo = new THREE.ConeGeometry(0.11, 0.7, 5); bodyGeo.rotateX(Math.PI / 2);
  const rr = makeRng(12);
  const birds = [];
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    const wl = new THREE.Mesh(wingGeo, mat), wr = new THREE.Mesh(wingGeo, mat);
    wr.scale.x = -1;
    g.add(wl, wr, new THREE.Mesh(bodyGeo, mat));
    scene.add(g);
    const anchor = i < 8 ? [20 + rr() * 80, 0, 30 + rr() * 60] : [rr.range(-200, 300), 0, rr.range(60, 320)];
    birds.push({ g, wl, wr, cx: anchor[0], cz: anchor[2], r: 18 + rr() * 60, h: 22 + rr() * 48, sp: (0.12 + rr() * 0.12) * (rr() < 0.5 ? 1 : -1), ph: rr() * 6.28, flap: 5 + rr() * 3 });
  }
  world.updaters.push((t) => {
    for (const bd of birds) {
      const a = bd.ph + t * bd.sp;
      const r = bd.r * (1 + 0.2 * Math.sin(t * 0.13 + bd.ph));
      bd.g.position.set(bd.cx + Math.cos(a) * r, bd.h + Math.sin(t * 0.3 + bd.ph) * 4, bd.cz + Math.sin(a) * r);
      bd.g.rotation.y = -a + (bd.sp > 0 ? Math.PI : 0);
      bd.g.rotation.z = (bd.sp > 0 ? 1 : -1) * 0.35;
      // glide most of the time, flap in bursts
      const burst = Math.max(0, Math.sin(t * 0.45 + bd.ph * 3));
      const f = Math.sin(t * bd.flap + bd.ph) * (0.15 + 0.6 * burst);
      bd.wl.rotation.z = f + 0.12;
      bd.wr.rotation.z = -f - 0.12;
    }
  });
}

// ----------------------------------------------------------------------
export function buildBoats(world) {
  const { scene, water } = world;
  const wakes = water.uniforms.wakes.value;

  const tug = buildTug(world);
  scene.add(tug);
  world.tug = tug;
  const TP = { cx: 80, cz: 132, rx: 150, rz: 52, w: 0.024, ph: 1.15 };
  world.updaters.push((t) => {
    const a = TP.ph + t * TP.w;
    const x = TP.cx + Math.cos(a) * TP.rx, z = TP.cz + Math.sin(a) * TP.rz;
    const vx = -Math.sin(a) * TP.rx, vz = Math.cos(a) * TP.rz;
    const h = Math.atan2(vx, vz);
    tug.position.set(x, Math.sin(t * 0.9) * 0.06 - 0.05, z);
    tug.rotation.set(Math.sin(t * 0.7) * 0.018, h - Math.PI / 2, Math.sin(t * 0.55 + 1) * 0.012 + 0.01, 'YXZ');
    wakes[0].set(x - Math.sin(h) * 2, z - Math.cos(h) * 2, h, 0.75);
  });

  const pilot = buildPilotBoat(world);
  scene.add(pilot);
  world.pilot = pilot;
  const PP = { cx: 470, cz: 520, rx: 300, rz: 190, w: 0.035, ph: 4.2 };
  world.updaters.push((t) => {
    const a = PP.ph + t * PP.w;
    const x = PP.cx + Math.cos(a) * PP.rx, z = PP.cz + Math.sin(a) * PP.rz;
    const vx = -Math.sin(a) * PP.rx, vz = Math.cos(a) * PP.rz;
    const h = Math.atan2(vx, vz);
    pilot.position.set(x, 0.12 + Math.sin(t * 2.2) * 0.07, z);
    pilot.rotation.set(Math.sin(t * 1.4) * 0.03, h - Math.PI / 2, 0.045 + Math.sin(t * 2.1) * 0.012, 'YXZ');
    wakes[1].set(x - Math.sin(h) * 3, z - Math.cos(h) * 3, h, 1.0);
  });

  // lateral buoys marking the channel out past the breakwater
  for (const [z, x] of [[330, 250], [560, 285], [800, 320], [1060, 355]]) {
    buildBuoy(world, x - 48, z, 'red');
    buildBuoy(world, x + 48, z, 'green');
  }

  buildDistantShip(world, 1500, 2500, 0.5, 0);
  buildDistantShip(world, -700, 3300, -0.3, 1);
  buildGulls(world);
  (world.flagBases || []).forEach((p, i) => {
    const f = makeFlag(scene, world, flagTex(i % 2), 2.6, 1.6);
    f.position.set(p.x, p.y + 12, p.z);
    f.rotation.y = 0.5;
    scene.add(f);
  });
}
