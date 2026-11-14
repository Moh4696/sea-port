import * as THREE from 'three';
import { Batch, beamGeo, boxGeo, cylGeo, V, makeRng, smooth, lerp, clamp } from './util.js';
import { labelTex } from './tex.js';
import { CL, CH, CW, pickColor } from './containers.js';
import { RAIL_SEA, RAIL_LAND } from './port.js';

// ----------------------------------------------------------------------
// Ship-to-shore gantry. Local origin: crane centre on the quay surface, quay edge at z = 0.
// ----------------------------------------------------------------------
const STS = { X: 9.5, legTop: 47, girderY: 44, hingeZ: -1.4, out: 62, back: -56, apexY: 79, apexZ: -11, gx: 3.6 };

function spreaderGroup(M) {
  const g = new THREE.Group();
  const b = new Batch();
  b.add(M.yellow, boxGeo(CL - 0.1, 0.4, 0.5, 0, 0.2, -0.75));
  b.add(M.yellow, boxGeo(CL - 0.1, 0.4, 0.5, 0, 0.2, 0.75));
  for (const x of [-CL / 2 + 0.2, CL / 2 - 0.2]) {
    b.add(M.yellow, boxGeo(0.45, 0.45, CW, x, 0.22, 0));
    for (const z of [-CW / 2 + 0.1, CW / 2 - 0.1]) b.add(M.dark, boxGeo(0.3, 0.9, 0.3, x, -0.1, z * 1.08));    // corner guides
  }
  b.add(M.yellow, boxGeo(4.2, 0.6, 2.2, 0, 0.5, 0));
  b.add(M.dark, boxGeo(3.4, 0.9, 1.7, 0, 1.25, 0));                 // headblock
  for (const x of [-1.3, 1.3]) b.add(M.grey, cylGeo(0.42, 0.42, 1.9, x, 1.8, 0, 12, 'z'));  // sheaves
  b.build(g);
  return g;
}

function buildSTS(M, { raised = false, animated = false, label = 'T2-01' } = {}) {
  const g = new THREE.Group();
  const b = new Batch();
  const { X, legTop, girderY, hingeZ, out, back, apexY, apexZ, gx } = STS;
  const zS = RAIL_SEA, zL = RAIL_LAND;

  // --- travel bogies, sill beams, legs ---
  for (const z of [zS, zL]) {
    b.add(M.teal, boxGeo(2 * X + 9.5, 1.3, 1.5, 0, 3.4, z));
    for (const x of [-X, X]) {
      b.add(M.tealDark, boxGeo(8.6, 0.9, 1.0, x, 2.0, z));
      b.add(M.tealDark, boxGeo(1.2, 1.2, 1.2, x, 2.7, z));
      for (const dx of [-2.2, 2.2]) {
        b.add(M.yellow, boxGeo(3.6, 0.8, 1.15, x + dx, 1.05, z));
        for (const wx of [-1.1, 0, 1.1]) b.add(M.dark, cylGeo(0.36, 0.36, 0.5, x + dx + wx, 0.42, z, 10, 'z'));
      }
      b.add(M.dark, boxGeo(0.5, 1.0, 1.6, x - 4.5, 1.1, z));        // rail buffers
      b.add(M.dark, boxGeo(0.5, 1.0, 1.6, x + 4.5, 1.1, z));
      b.add(M.teal, boxGeo(1.5, legTop - 4, 1.9, x, 4 + (legTop - 4) / 2, z));
    }
    b.add(M.teal, boxGeo(2 * X + 1.5, 1.9, 1.4, 0, legTop, z));     // top cross beams
  }
  b.add(M.teal, boxGeo(2 * X, 1.1, 1.0, 0, 30, zL));               // land-side frame
  b.add(M.teal, beamGeo(V(-X, 16, zL), V(X, 29.5, zL), 0.8, 0.8));
  b.add(M.teal, beamGeo(V(X, 16, zL), V(-X, 29.5, zL), 0.8, 0.8));
  b.add(M.teal, boxGeo(2 * X, 1.1, 1.0, 0, 31, zS));
  for (const x of [-X, X]) {
    b.add(M.teal, beamGeo(V(x, 14.5, zS), V(x, 14.5, zL), 1.3, 2.0));        // portal beam
    b.add(M.teal, beamGeo(V(x, legTop, zS + 1), V(x, legTop, zL - 1), 1.3, 2.1));
    b.add(M.teal, beamGeo(V(x, 15.5, zL + 0.5), V(x, 45.5, zS - 0.5), 0.9, 1.0));   // big diagonal
    b.add(M.teal, beamGeo(V(x, 15.5, (zS + zL) / 2), V(x, 30, zL + 0.6), 0.7, 0.7));
  }
  // lift shaft + stair tower on a land leg
  b.add(M.white, boxGeo(1.7, legTop - 4, 1.7, X + 1.7, 4 + (legTop - 4) / 2, zL + 2.2));
  for (let y = 6; y < legTop; y += 4.1) {
    b.add(M.galv, boxGeo(2.6, 0.08, 2.2, -X - 1.9, y, zL + 1.4));
    b.add(M.galv, beamGeo(V(-X - 3.0, y, zL + 0.5), V(-X - 0.9, y + 4.1, zL + 0.5), 0.9, 0.08, V(0, 0, 1)));
    b.add(M.galv, boxGeo(0.05, 1.1, 2.2, -X - 3.2, y + 0.55, zL + 1.4));
  }
  // --- A-frame ---
  const ax = 6.6;
  for (const x of [-ax, ax]) {
    b.add(M.teal, beamGeo(V(x, legTop + 0.8, zS), V(x, apexY, apexZ), 1.0, 1.3));
    b.add(M.teal, beamGeo(V(x, legTop + 0.8, zL), V(x, apexY, apexZ), 0.9, 1.1));
    b.add(M.teal, beamGeo(V(x, legTop + 0.8, zS), V(x > 0 ? X : -X, legTop + 0.5, zS), 0.9, 0.9));
    b.add(M.teal, beamGeo(V(x, 62, lerp(zS, apexZ, 0.47)), V(x, 62, lerp(zL, apexZ, 0.47)), 0.6, 0.6));
  }
  b.add(M.teal, boxGeo(2 * ax + 1, 1.2, 1.4, 0, apexY, apexZ));
  b.add(M.teal, boxGeo(2 * ax, 0.7, 0.7, 0, 62, lerp(zS, apexZ, 0.47)));
  b.add(M.teal, beamGeo(V(-ax, 48, zS), V(ax, 62, lerp(zS, apexZ, 0.47)), 0.5, 0.5));
  b.add(M.teal, beamGeo(V(ax, 48, zS), V(-ax, 62, lerp(zS, apexZ, 0.47)), 0.5, 0.5));
  b.add(M.galv, cylGeo(0.07, 0.07, 6, 0, apexY + 3.5, apexZ, 6));
  b.add(M.redLamp, boxGeo(0.4, 0.4, 0.4, 0, apexY + 6.6, apexZ));

  // --- fixed girder (backreach) ---
  const girder = (bt, z0, z1) => {
    for (const x of [-gx, gx]) {
      bt.add(M.teal, beamGeo(V(x, girderY, z0), V(x, girderY, z1), 1.1, 3.1));
      bt.add(M.rail, beamGeo(V(x, girderY + 1.62, z0), V(x, girderY + 1.62, z1), 0.3, 0.14));
    }
    const n = Math.round(Math.abs(z1 - z0) / 7.5);
    for (let k = 0; k <= n; k++) {
      const z = lerp(z0, z1, k / n);
      bt.add(M.teal, boxGeo(2 * gx, 0.55, 0.55, 0, girderY + 1.2, z));
    }
    // service walkway outboard of one girder
    const wx = gx + 1.15;
    bt.add(M.galv, beamGeo(V(wx, girderY - 0.9, z0), V(wx, girderY - 0.9, z1), 1.0, 0.07));
    bt.add(M.galv, beamGeo(V(wx + 0.5, girderY + 0.2, z0), V(wx + 0.5, girderY + 0.2, z1), 0.05, 0.05));
    bt.add(M.galv, beamGeo(V(wx + 0.5, girderY - 0.35, z0), V(wx + 0.5, girderY - 0.35, z1), 0.04, 0.04));
    const pn = Math.round(Math.abs(z1 - z0) / 2.5);
    for (let k = 0; k <= pn; k++) bt.add(M.galv, boxGeo(0.05, 1.1, 0.05, wx + 0.5, girderY - 0.35, lerp(z0, z1, k / pn)));
    for (let k = 0; k <= n; k++) bt.add(M.galv, boxGeo(0.7, 0.3, 0.08, wx - 0.4, girderY - 1.1, lerp(z0, z1, k / n)));
  };
  girder(b, back, hingeZ);
  for (const z of [zS, zL, back + 2]) for (const x of [-gx, gx]) b.add(M.teal, boxGeo(0.7, 2.2, 0.9, x, girderY + 2.4, z));   // hangers
  b.add(M.teal, boxGeo(2 * gx + 1.2, 1.0, 1.0, 0, girderY - 1.1, back));
  // machinery house + electrical room
  b.add(M.white, boxGeo(12, 6.2, 14, 0, girderY + 4.75, -45));
  b.add(M.greyLight, boxGeo(12.5, 0.25, 14.5, 0, girderY + 7.95, -45));
  b.add(M.tealDark, boxGeo(12.1, 0.7, 14.1, 0, girderY + 2.0, -45));
  b.add(M.grey, boxGeo(2.2, 1.6, 2.2, -2.5, girderY + 8.8, -47));
  b.add(M.grey, boxGeo(2.2, 1.6, 2.2, 2.5, girderY + 8.8, -43));
  for (const z of [-49, -45, -41]) for (const s of [-1, 1]) b.add(M.glass, boxGeo(0.05, 1.0, 1.4, s * 6.03, girderY + 5.4, z));
  // backstays
  for (const x of [-ax, ax]) {
    b.add(M.teal, beamGeo(V(x, apexY, apexZ), V(x > 0 ? gx : -gx, girderY + 1.8, back + 2), 0.45, 0.45));
    b.add(M.teal, beamGeo(V(x, apexY - 1, apexZ), V(x > 0 ? gx : -gx, girderY + 1.8, -30), 0.3, 0.3));
  }
  // floodlights under the portal
  for (const x of [-X, X]) for (const z of [zS + 2, zL - 2, -18]) b.add(M.lamp, boxGeo(0.9, 0.3, 0.6, x * 0.9, 13.3, z));

  b.build(g);

  // name board
  for (const s of [-1, 1]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.4), new THREE.MeshStandardMaterial({ map: labelTex('HALVARD  ' + label, {}), roughness: 0.6 }));
    pl.position.set(s * 6.02, girderY + 6.6, -45);
    pl.rotation.y = s * Math.PI / 2;
    g.add(pl);
  }

  // --- boom (hinged) ---
  const boom = new THREE.Group();
  boom.position.set(0, girderY, hingeZ);
  const bb = new Batch();
  const tmp = new Batch();
  girder(tmp, 0.4, out - hingeZ);
  for (const [mat, geos] of tmp.groups) for (const ge of geos) { ge.translate(0, -girderY, 0); bb.add(mat, ge); }
  const tip = out - hingeZ;
  bb.add(M.teal, boxGeo(2 * gx + 1.2, 1.2, 1.0, 0, 0.4, tip));
  bb.add(M.redLamp, boxGeo(0.4, 0.4, 0.4, 0, 2.0, tip));
  for (const x of [-gx, gx]) for (const zz of [28, 56]) bb.add(M.teal, boxGeo(0.8, 1.6, 1.4, x, 2.2, zz));    // stay lugs
  bb.build(boom);
  g.add(boom);
  const ang = raised ? -THREE.MathUtils.degToRad(78) : 0;
  boom.rotation.x = ang;

  // forestays, drawn in crane space from the apex to the (possibly raised) boom lugs
  const sb = new Batch();
  const lug = (zz) => { const p = V(0, 2.6, zz).applyAxisAngle(V(1, 0, 0), ang); return V(0, girderY + p.y, hingeZ + p.z); };
  for (const x of [-1, 1]) {
    if (!raised) {
      const a = lug(28), c = lug(56);
      sb.add(M.teal, beamGeo(V(x * ax, apexY, apexZ), V(x * gx, a.y, a.z), 0.3, 0.3));
      sb.add(M.teal, beamGeo(V(x * ax, apexY, apexZ), V(x * gx, c.y, c.z), 0.36, 0.36));
    } else {
      // folded stay links
      const c = lug(56), mid = V(x * (ax + gx) / 2, apexY - 9, apexZ + 14);
      sb.add(M.teal, beamGeo(V(x * ax, apexY, apexZ), mid, 0.34, 0.34));
      sb.add(M.teal, beamGeo(mid, V(x * gx, c.y, c.z), 0.34, 0.34));
    }
  }
  sb.build(g);

  // --- trolley, cab, hoist ---
  const trolley = new THREE.Group();
  const tb = new Batch();
  tb.add(M.dark, boxGeo(2 * gx - 1.2, 1.1, 6.4, 0, girderY - 0.6, 0));
  tb.add(M.grey, boxGeo(2 * gx + 2.4, 0.5, 1.0, 0, girderY + 1.95, -2.4));
  tb.add(M.grey, boxGeo(2 * gx + 2.4, 0.5, 1.0, 0, girderY + 1.95, 2.4));
  for (const x of [-gx, gx]) for (const z of [-2.4, 2.4]) tb.add(M.dark, cylGeo(0.4, 0.4, 0.4, x, girderY + 1.95, z, 10, 'x'));
  tb.add(M.white, boxGeo(2.3, 2.5, 3.2, gx + 2.6, girderY - 3.4, 2.2));         // operator cab
  tb.add(M.glass, boxGeo(2.36, 1.3, 3.26, gx + 2.6, girderY - 3.95, 2.2));
  tb.add(M.white, boxGeo(2.5, 0.12, 3.4, gx + 2.6, girderY - 2.1, 2.2));
  tb.add(M.dark, boxGeo(0.25, 1.6, 0.25, gx + 2.6, girderY - 1.4, 2.2));
  tb.build(trolley);
  g.add(trolley);
  const spreader = spreaderGroup(M);
  g.add(spreader);
  const cables = [];
  const cmat = M.black;
  for (const x of [-1.3, 1.3]) for (const z of [-0.6, 0.6]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 0.05), cmat);
    c.userData.o = [x, z];
    g.add(c);
    cables.push(c);
  }
  const setHoist = (z, y) => {            // z along the boom, y = bottom face of the spreader (local)
    trolley.position.z = z;
    spreader.position.set(0, y, z);
    const top = girderY - 1.1, bot = y + 1.9;
    for (const c of cables) {
      c.position.set(c.userData.o[0], (top + bot) / 2, z + c.userData.o[1]);
      c.scale.y = Math.max(0.1, top - bot);
    }
  };
  if (raised) {
    setHoist(-20, 33);
  } else {
    setHoist(animated ? 20 : -14, 30);
  }
  return { group: g, setHoist, trolley, spreader };
}

// ----------------------------------------------------------------------
// Rubber-tyred gantry for the yard blocks (static, merged into a shared batch)
// ----------------------------------------------------------------------
function addRTG(b, M, x, zc, Y, rng, containers) {
  const z0 = zc - 13.2, z1 = zc + 9.6, hx = 5.6, top = 21.5;
  for (const z of [z0, z1]) {
    b.add(M.red, boxGeo(2 * hx + 3.4, 0.9, 1.1, x, Y + 1.9, z));
    for (const dx of [-hx - 0.4, -hx + 1.9, hx - 1.9, hx + 0.4]) {
      b.add(M.rubber, cylGeo(0.82, 0.82, 0.6, x + dx, Y + 0.82, z, 14, 'z'));
      b.add(M.yellow, cylGeo(0.4, 0.4, 0.64, x + dx, Y + 0.82, z, 10, 'z'));
    }
    for (const dx of [-hx, hx]) b.add(M.red, boxGeo(0.9, top - 2.2, 1.0, x + dx, Y + 2.2 + (top - 2.2) / 2, z));
    b.add(M.red, boxGeo(2 * hx + 1, 1.0, 0.9, x, Y + top, z));
    b.add(M.red, beamGeo(V(x - hx, Y + 3, z), V(x + hx, Y + 9, z), 0.4, 0.4));
    b.add(M.red, beamGeo(V(x + hx, Y + 3, z), V(x - hx, Y + 9, z), 0.4, 0.4));
  }
  for (const dx of [-2.3, 2.3]) {
    b.add(M.red, beamGeo(V(x + dx, Y + top + 0.2, z0 - 1.2), V(x + dx, Y + top + 0.2, z1 + 1.2), 0.9, 1.5));
    b.add(M.galv, beamGeo(V(x + dx * 1.5, Y + top + 2.0, z0), V(x + dx * 1.5, Y + top + 2.0, z1), 0.05, 0.05));
  }
  b.add(M.white, boxGeo(3.4, 2.6, 2.4, x + hx + 0.6, Y + 4.6, z0 + 1.8));            // power pack
  b.add(M.dark, boxGeo(2.2, 1.8, 2.0, x - hx - 0.4, Y + 4.2, z0 + 1.6));
  // trolley + cab + spreader
  const tz = lerp(z0 + 5, z1 - 3, rng());
  b.add(M.dark, boxGeo(5.6, 1.0, 3.6, x, Y + top + 1.3, tz));
  b.add(M.white, boxGeo(1.8, 2.2, 2.2, x + 3.3, Y + top - 1.6, tz));
  b.add(M.glass, boxGeo(1.86, 1.0, 2.26, x + 3.3, Y + top - 2.1, tz));
  const sy = Y + 7 + rng() * 9;
  b.add(M.yellow, boxGeo(CL - 0.2, 0.45, 1.8, x, sy + 0.25, tz));
  b.add(M.dark, boxGeo(3, 0.8, 1.4, x, sy + 0.9, tz));
  for (const dx of [-1.2, 1.2]) for (const dz of [-0.5, 0.5]) b.add(M.black, boxGeo(0.05, Y + top + 0.8 - sy - 1.3, 0.05, x + dx, (Y + top + 0.8 + sy + 1.3) / 2, tz + dz));
  if (rng() < 0.6) containers.add(x, sy - CH / 2, tz, 0, pickColor(rng), rng);
}

// ----------------------------------------------------------------------
// Terminal tractor + skeletal trailer. Faces +x.
// ----------------------------------------------------------------------
function truckGeoBatch(M) {
  const b = new Batch();
  b.add(M.dark, boxGeo(12.6, 0.28, 1.1, -1.2, 1.2, 0));
  b.add(M.dark, boxGeo(12.4, 0.16, 2.44, -1.2, 1.37, 0));
  for (const x of [-6.6, -5.3]) for (const z of [-1.0, 1.0]) b.add(M.rubber, cylGeo(0.52, 0.52, 0.55, x, 0.52, z, 12, 'z'));
  b.add(M.yellow, boxGeo(0.3, 0.5, 2.5, -7.4, 1.0, 0));
  // tractor
  b.add(M.dark, boxGeo(4.8, 0.45, 1.9, 6.6, 0.95, 0));
  b.add(M.yellow, boxGeo(1.9, 1.1, 2.3, 7.9, 1.75, 0));
  b.add(M.yellow, boxGeo(1.7, 0.95, 2.3, 7.8, 2.75, 0));
  b.add(M.glass, boxGeo(1.76, 0.72, 2.34, 7.84, 2.78, 0));
  b.add(M.yellow, boxGeo(1.8, 0.1, 2.36, 7.8, 3.27, 0));
  b.add(M.dark, boxGeo(0.3, 0.5, 2.4, 9.0, 0.95, 0));
  b.add(M.lamp, boxGeo(0.08, 0.2, 0.4, 8.88, 1.5, 0.8));
  b.add(M.lamp, boxGeo(0.08, 0.2, 0.4, 8.88, 1.5, -0.8));
  b.add(M.galv, cylGeo(0.09, 0.09, 2.4, 6.75, 2.5, 0.95, 8));
  b.add(M.dark, boxGeo(1.4, 0.9, 1.9, 6.0, 1.6, 0));
  b.add(M.dark, cylGeo(0.5, 0.5, 0.14, 4.6, 1.3, 0, 12));
  b.add(M.orange, boxGeo(0.3, 0.16, 0.3, 7.8, 3.4, 0));
  for (const x of [5.0, 8.0]) for (const z of [-1.05, 1.05]) {
    b.add(M.rubber, cylGeo(0.52, 0.52, 0.5, x, 0.52, z, 12, 'z'));
    b.add(M.dark, boxGeo(1.3, 0.08, 0.56, x, 1.12, z));
  }
  return b;
}

export function buildCranes(world) {
  const { scene, M, QUAY_Y, containers, ship } = world;
  const Y = QUAY_Y;
  const rng = makeRng(404);
  const cranes = [];
  const place = (x, opts) => {
    const c = buildSTS(M, opts);
    c.group.position.set(x, Y, 0);
    c.x = x;
    scene.add(c.group);
    cranes.push(c);
    return c;
  };
  place(-98.5, { label: 'T2-01' });
  const w1 = place(ship.work[0].x, { animated: true, label: 'T2-02' });
  const w2 = place(ship.work[1].x, { animated: true, label: 'T2-03' });
  place(106, { raised: true, label: 'T2-04' });
  // the next berth down the quay, idle
  place(830, { raised: true, label: 'T3-01' });
  place(905, { label: 'T3-02' });
  place(985, { raised: true, label: 'T3-03' });
  world.cranes = cranes;

  // RTGs over the yard blocks
  const b = new Batch();
  for (const blk of world.yard.blocks) {
    const n = blk.xa > 700 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const k = Math.floor((0.12 + (i + rng() * 0.7) / n * 0.8) * blk.nb);
      addRTG(b, M, blk.xa + CL / 2 + k * blk.pitchX, blk.zc, Y, rng, containers);
    }
  }
  b.build(scene);

  // trucks
  const tb = truckGeoBatch(M);
  const proto = new THREE.Group();
  tb.build(proto);
  const makeTruck = () => {
    const t = new THREE.Group();
    for (const m of proto.children) { const c = new THREE.Mesh(m.geometry, m.material); c.castShadow = c.receiveShadow = true; t.add(c); }
    scene.add(t);
    return t;
  };
  const DECK = 1.45;

  // --- working cranes: discharge loop ---
  const CYCLE = 38;
  const jobs = [w1, w2].map((crane, i) => {
    const truck = makeTruck();
    const lane = -12.6 - i * 4.4;
    truck.position.set(crane.x - 150, Y, lane);
    const box = containers.single(pickColor(rng));
    scene.add(box);
    return { crane, truck, lane, box, rows: ship.work[i].rows, offset: i * 17.3, lastCycle: -1, row: 0 };
  });
  const ease = (a, b, t) => smooth((t - a) / (b - a));
  world.updaters.push((time) => {
    for (const j of jobs) {
      const tt = time + j.offset;
      const cyc = Math.floor(tt / CYCLE), c = tt - cyc * CYCLE;
      if (cyc !== j.lastCycle) {
        j.lastCycle = cyc;
        j.row = (cyc * 3) % j.rows.length;
        j.nextColor = true;
      }
      const row = j.rows[j.row];
      const zShip = row.z, yPick = row.y - Y;           // local to the crane (group sits at quay level)
      const zLane = j.lane, yTruck = DECK + CH, yHigh = 34;
      let z, y;
      if (c < 5) { z = zShip; y = lerp(yHigh, yPick, ease(0, 5, c)); }
      else if (c < 6.5) { z = zShip; y = yPick; }
      else if (c < 12) { z = zShip; y = lerp(yPick, yHigh, ease(6.5, 12, c)); }
      else if (c < 20) { z = lerp(zShip, zLane, ease(12, 20, c)); y = yHigh; }
      else if (c < 25) { z = zLane; y = lerp(yHigh, yTruck, ease(20, 25, c)); }
      else if (c < 26.5) { z = zLane; y = yTruck; }
      else if (c < 30) { z = zLane; y = lerp(yTruck, yHigh, ease(26.5, 30, c)); }
      else { z = lerp(zLane, zShip, ease(30, 38, c)); y = yHigh; }
      // a little pendulum sway while travelling
      const sway = (c > 12 && c < 21) || c > 30 ? Math.sin(tt * 1.3) * 0.25 * Math.sin(Math.PI * clamp(c > 30 ? (c - 30) / 8 : (c - 12) / 9, 0, 1)) : 0;
      j.crane.setHoist(z + sway, y);

      // truck
      let tx, loaded;
      if (c >= 6 && c < 18) { tx = lerp(-150, 0, 1 - Math.pow(1 - (c - 6) / 12, 2.2)); loaded = false; }
      else if (c >= 18 && c < 28) { tx = 0; loaded = c >= 26.5; }
      else { const d = c >= 28 ? c - 28 : c + 10; tx = 0.5 * d * d; loaded = true; }
      j.truck.position.x = j.crane.x + tx + 1.2;
      // the box
      if (c >= 6.5 && c < 26.5) {
        if (j.nextColor && c < 7) { j.nextColor = false; }
        j.box.visible = true;
        j.box.position.set(j.crane.x, Y + y - CH / 2, z + sway);
      } else if (loaded) {
        j.box.visible = true;
        j.box.position.set(j.truck.position.x - 1.2, Y + DECK + CH / 2, j.lane);
      } else {
        j.box.visible = false;
      }
    }
  });

  // --- through traffic on the back lanes ---
  const traffic = [];
  for (let i = 0; i < 9; i++) {
    const t = makeTruck();
    const dir = i % 2 ? -1 : 1;
    const lane = dir > 0 ? -42.2 : -46.2;
    t.rotation.y = dir > 0 ? 0 : Math.PI;
    let box = null;
    if (rng() < 0.75) { box = containers.single(pickColor(rng)); box.position.set(-1.2, DECK + CH / 2, 0); t.add(box); }
    t.position.set(0, Y, lane);
    traffic.push({ t, dir, speed: 6.5 + rng() * 3, phase: rng() * 1500 });
  }
  world.updaters.push((time) => {
    for (const tr of traffic) {
      const span = 1420;
      const s = (time * tr.speed + tr.phase) % span;
      tr.t.position.x = tr.dir > 0 ? -330 + s : 1090 - s;
    }
  });
}
