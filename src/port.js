import * as THREE from 'three';
import { Batch, beamGeo, rodGeo, boxGeo, cylGeo, tiledBox, scaleUV, V, makeRng, clamp } from './util.js';
import * as TX from './tex.js';
import { CL, CH, CW, pickColor } from './containers.js';

export const RAIL_SEA = -3.2, RAIL_LAND = -33.7;
const X0 = -420, X1 = 1500;                 // apron extent along the quay

function prismRoof(len, depth, rise, x, y, z) {
  const s = new THREE.Shape();
  s.moveTo(-depth / 2, 0); s.lineTo(depth / 2, 0); s.lineTo(0, rise); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  scaleUV(g, 1 / 8, 1 / 8);
  g.rotateY(Math.PI / 2);                    // extrusion axis -> +x
  g.translate(x - len / 2, y, z);
  return g;
}

function buildSubstation(world, b, ox, oz) {
  const { scene, M, QUAY_Y } = world;
  const y0 = QUAY_Y;
  const W = 5.2, H = 3.3, Dp = 4.2;
  b.add(M.block, tiledBox(W, H, Dp, ox, y0 + H / 2, oz, 4));
  b.add(M.concrete, boxGeo(W + 0.7, 0.16, Dp + 0.7, ox, y0 + H + 0.08, oz));
  b.add(M.roof, tiledBox(W + 0.8, 0.07, Dp + 0.8, ox, y0 + H + 0.2, oz, 3));
  b.add(M.concrete, boxGeo(W + 0.5, 0.3, Dp + 0.5, ox, y0 + 0.15, oz));             // plinth
  const fz = oz + Dp / 2;                                                            // front face looks out to sea
  const plane = (w, h, x, y, z, tex, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m);
    return m;
  };
  // door, frame, sign
  b.add(M.galv, boxGeo(1.22, 2.28, 0.1, ox - 1.55, y0 + 1.42, fz));
  plane(1.05, 2.1, ox - 1.55, y0 + 1.38, fz + 0.06, TX.doorTex(5));
  plane(2.0, 0.84, ox + 0.5, y0 + 2.72, fz + 0.03, TX.signTex([['11 kV', 78, 800], ['DANGER · HIGH VOLTAGE', 24, 600], ['SUBSTATION T2-04 · AUTHORISED ACCESS ONLY', 15, 500]]));
  b.add(M.galv, boxGeo(2.08, 0.92, 0.04, ox + 0.5, y0 + 2.72, fz + 0.005));
  // two feeder cabinets with conduits to ground
  for (let i = 0; i < 2; i++) {
    const cx = ox - 0.15 + i * 1.25;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.9, 0.36), [M.tealDark, M.tealDark, M.tealDark, M.tealDark, new THREE.MeshStandardMaterial({ map: TX.cabinetTex(20 + i), roughness: 0.6 }), M.tealDark]);
    cab.position.set(cx, y0 + 1.55, fz + 0.19);
    cab.castShadow = cab.receiveShadow = true;
    scene.add(cab);
    b.add(M.galv, boxGeo(1.15, 0.06, 0.44, cx, y0 + 2.53, fz + 0.2));
    for (const dx of [-0.25, 0.1, 0.32]) b.add(M.galv, rodGeo(V(cx + dx, y0 + 0.6, fz + 0.14), V(cx + dx, y0, fz + 0.14), 0.04, 6));
  }
  // downpipe, louvre, wall lamp
  b.add(M.galv, rodGeo(V(ox + W / 2 - 0.25, y0 + H, fz + 0.09), V(ox + W / 2 - 0.25, y0 + 0.1, fz + 0.09), 0.06, 8));
  b.add(M.grey, boxGeo(0.08, 1.2, 1.5, ox + W / 2 + 0.03, y0 + 2.0, oz + 0.3));
  for (let k = 0; k < 8; k++) b.add(M.dark, boxGeo(0.12, 0.05, 1.42, ox + W / 2 + 0.05, y0 + 1.48 + k * 0.15, oz + 0.3));
  b.add(M.lamp, boxGeo(0.3, 0.12, 0.16, ox - 1.55, y0 + 2.75, fz + 0.1));
  // yellow-railed steps up to a side platform
  const sx = ox - W / 2 - 0.9;
  for (let k = 0; k < 5; k++) b.add(M.yellow, boxGeo(0.9, 0.05, 0.3, sx, y0 + 0.2 + k * 0.2, fz - 0.4 + k * -0.3));
  for (const dx of [-0.48, 0.48]) {
    b.add(M.tealDark, beamGeo(V(sx + dx, y0 + 0.1, fz - 0.25), V(sx + dx, y0 + 1.05, fz - 1.75), 0.06, 0.16));
    b.add(M.yellow, beamGeo(V(sx + dx, y0 + 1.15, fz - 0.25), V(sx + dx, y0 + 2.1, fz - 1.75), 0.05, 0.05));
    b.add(M.yellow, boxGeo(0.05, 1.05, 0.05, sx + dx, y0 + 0.62, fz - 0.25));
    b.add(M.yellow, boxGeo(0.05, 1.05, 0.05, sx + dx, y0 + 1.58, fz - 1.75));
  }
  b.add(M.galv, boxGeo(1.0, 0.06, 1.4, sx, y0 + 1.05, fz - 2.4));
  // chain-link compound
  const fence = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    const g = new THREE.PlaneGeometry(len, 2.3);
    scaleUV(g, len / 0.55, 2.3 / 0.55);
    const m = new THREE.Mesh(g, M.fence);
    m.position.set((ax + bx) / 2, y0 + 1.15, (az + bz) / 2);
    m.rotation.y = -Math.atan2(bz - az, bx - ax);
    m.castShadow = true;
    scene.add(m);
    const n = Math.max(1, Math.round(len / 2.6));
    for (let k = 0; k <= n; k++) b.add(M.tealDark, boxGeo(0.07, 2.45, 0.07, ax + (bx - ax) * k / n, y0 + 1.22, az + (bz - az) * k / n));
    b.add(M.galv, beamGeo(V(ax, y0 + 2.3, az), V(bx, y0 + 2.3, bz), 0.04, 0.04));
  };
  fence(ox + W / 2 + 0.6, fz + 1.2, ox + W / 2 + 7, fz + 1.2);
  fence(ox + W / 2 + 7, fz + 1.2, ox + W / 2 + 7, oz - Dp / 2 - 2);
  fence(ox + W / 2 + 0.6, fz + 1.2, ox + W / 2 + 0.6, fz - 0.2);
  // transformer inside the compound
  b.add(M.grey, boxGeo(2.2, 2.0, 1.5, ox + W / 2 + 3.8, y0 + 1.2, oz - 0.4));
  for (let k = 0; k < 7; k++) b.add(M.grey, boxGeo(0.06, 1.5, 1.9, ox + W / 2 + 2.9 + k * 0.3, y0 + 1.15, oz - 0.4));
  for (const dx of [-0.6, 0, 0.6]) b.add(M.whiteClean, cylGeo(0.09, 0.13, 0.7, ox + W / 2 + 3.8 + dx, y0 + 2.55, oz - 0.4, 8));
  b.add(M.concrete, boxGeo(3.4, 0.2, 2.6, ox + W / 2 + 3.8, y0 + 0.1, oz - 0.4));
}

export function buildPort(world) {
  const { scene, M, QUAY_Y, containers } = world;
  const rng = makeRng(77);
  const b = new Batch();
  const Y = QUAY_Y;

  // ---------------- apron, sea wall, edge ----------------
  const LEN = X1 - X0, XC = (X0 + X1) / 2;
  b.add(M.apron, tiledBox(LEN, 1.0, 262, XC, Y - 0.5, -131, 20));
  b.add(M.quayFace, tiledBox(LEN, 8.5, 1.0, XC, Y - 4.25, -0.5, [40, 9]));
  b.add(M.quayFace, tiledBox(1.0, 8.5, 262, X1 - 0.5, Y - 4.25, -131, [40, 9]));
  b.add(M.concrete, boxGeo(LEN, 0.5, 1.0, XC, Y - 0.2, 0.12));                        // cope beam, proud of the wall
  b.add(M.hazard, tiledBox(1140, 0.03, 4.0, 150, Y + 0.012, -2.6, 4));
  b.add(M.markYellow, tiledBox(1140, 0.03, 0.22, 150, Y + 0.02, -4.8, 3));
  // crane rails and their concrete beams
  for (const z of [RAIL_SEA, RAIL_LAND]) {
    b.add(M.rail, boxGeo(1140, 0.09, 0.16, 150, Y + 0.045, z));
    b.add(M.concrete, boxGeo(1140, 0.02, 1.2, 150, Y + 0.008, z));
  }
  // truck lanes between the rails
  for (let k = 0; k < 6; k++) b.add(M.markWhite, tiledBox(1140, 0.02, 0.16, 150, Y + 0.012, -8.2 - k * 4.4, 3));
  b.add(M.markYellow, tiledBox(1140, 0.02, 0.2, 150, Y + 0.012, -38.4, 3));
  for (let x = -400; x < 700; x += 9) b.add(M.markWhite, tiledBox(4.5, 0.02, 0.16, x, Y + 0.012, -44.3, 3));
  // fenders: rubber cone + steel-backed face pad
  for (let x = -404; x <= 716; x += 16) {
    b.add(M.rubber, cylGeo(0.75, 1.05, 1.15, x, 1.7, 0.6, 14, 'z'));
    b.add(M.dark, boxGeo(2.3, 3.4, 0.28, x, 1.6, 1.32));
    b.add(M.rubber, boxGeo(2.1, 3.2, 0.1, x, 1.6, 1.5));
    for (const dx of [-0.9, 0.9]) b.add(M.rail, beamGeo(V(x + dx, 3.2, 1.25), V(x + dx, Y - 0.1, 0.2), 0.05, 0.05));
  }
  // bollards
  const bollardAt = (x) => {
    b.add(M.yellow, cylGeo(0.3, 0.42, 0.62, x, Y + 0.31, -1.25, 12));
    b.add(M.yellow, cylGeo(0.5, 0.36, 0.26, x, Y + 0.72, -1.25, 12));
    b.add(M.dark, boxGeo(1.1, 0.06, 1.1, x, Y + 0.03, -1.25));
  };
  world.bollardAt = bollardAt;
  for (let x = -410; x <= 720; x += 22) bollardAt(x);
  // ladders + life-ring posts along the edge
  for (let x = -380; x <= 700; x += 96) {
    for (const dx of [-0.25, 0.25]) b.add(M.galv, boxGeo(0.05, 4.4, 0.05, x + dx + 8, Y - 2.1, 0.68));
    for (let k = 0; k < 12; k++) b.add(M.galv, boxGeo(0.5, 0.04, 0.04, x + 8, Y - 0.3 - k * 0.34, 0.68));
    b.add(M.orange, boxGeo(0.14, 1.5, 0.14, x + 11, Y + 0.75, -0.7));
    const ring = new THREE.TorusGeometry(0.34, 0.09, 6, 14); ring.translate(x + 11, Y + 1.25, -0.55);
    b.add(M.orange, ring);
  }

  // ---------------- container yard ----------------
  const yard = { blocks: [] };
  world.yard = yard;
  const colX = [[-384, -62], [-22, 300], [340, 662], [740, 1062], [1100, 1422]];
  const rowZ = [-62, -92, -122];
  const pitchX = CL + 0.7, pitchZ = CW + 0.16;
  for (const [xa, xb] of colX) for (const zc of rowZ) {
    const nb = Math.floor((xb - xa) / pitchX);
    const tops = [];
    let level = 2.6 + rng() * 2, col = pickColor(rng);
    for (let k = 0; k < nb; k++) {
      level = clamp(level + (rng() - 0.5) * 1.6, 1.2, 5);
      if (rng() < 0.04) level = rng() * 1.2;
      const x = xa + CL / 2 + k * pitchX;
      let maxH = 0;
      for (let r = 0; r < 6; r++) {
        if (rng() < 0.3) col = pickColor(rng);
        const n = clamp(Math.round(level + (rng() - 0.5) * 2.2), 0, 5);
        for (let t = 0; t < n; t++) containers.add(x, Y + CH / 2 + t * (CH + 0.012), zc + (r - 2.5) * pitchZ, 0, rng() < 0.7 ? col : pickColor(rng), rng);
        maxH = Math.max(maxH, n);
      }
      tops.push(maxH);
    }
    yard.blocks.push({ xa, xb, zc, nb, tops, pitchX });
    b.add(M.markWhite, tiledBox(xb - xa, 0.02, 0.14, (xa + xb) / 2, Y + 0.012, zc + 8.2, 3));
    b.add(M.markWhite, tiledBox(xb - xa, 0.02, 0.14, (xa + xb) / 2, Y + 0.012, zc - 8.2, 3));
    b.add(M.markYellow, tiledBox(xb - xa, 0.02, 0.14, (xa + xb) / 2, Y + 0.012, zc - 12.6, 3));
  }

  // ---------------- high-mast lighting ----------------
  for (let x = -340; x <= 1400; x += 150) for (const z of [-46.5, -140]) {
    b.add(M.galv, cylGeo(0.22, 0.48, 36, x, Y + 18, z, 10));
    b.add(M.galv, cylGeo(1.7, 1.7, 0.35, x, Y + 36, z, 12));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      b.add(M.lamp, boxGeo(0.7, 0.3, 0.5, x + Math.cos(a) * 1.6, Y + 35.7, z + Math.sin(a) * 1.6, -a));
    }
    b.add(M.concrete, cylGeo(0.9, 1.0, 0.8, x, Y + 0.4, z, 10));
  }

  // ---------------- sheds, offices ----------------
  const shed = (x, z, w, d, h, wall, roof, doors = true) => {
    b.add(wall, tiledBox(w, h, d, x, Y + h / 2, z, 8));
    b.add(roof, prismRoof(w + 1.6, d + 1.6, d * 0.11, x, Y + h, z));
    b.add(M.roofRed, boxGeo(w + 1.8, 0.5, 0.25, x, Y + h - 0.1, z + d / 2 + 0.75));
    if (doors) {
      for (let dx = -w / 2 + 12; dx < w / 2 - 8; dx += 22) {
        b.add(M.grey, tiledBox(7, 7.5, 0.3, x + dx, Y + 3.75, z + d / 2 + 0.05, 2));
        b.add(M.yellow, boxGeo(0.3, 7.8, 0.4, x + dx - 3.7, Y + 3.9, z + d / 2 + 0.1));
        b.add(M.yellow, boxGeo(0.3, 7.8, 0.4, x + dx + 3.7, Y + 3.9, z + d / 2 + 0.1));
      }
    }
    for (let dx = -w / 2 + 10; dx < w / 2; dx += 20) b.add(M.galv, cylGeo(0.6, 0.6, 0.9, x + dx, Y + h + d * 0.11 * 0.6, z - d * 0.2, 10));   // roof vents
  };
  shed(-330, -196, 120, 44, 12, M.cladding, M.roof);
  shed(-196, -196, 120, 44, 12, M.cladding, M.roof);
  shed(60, -200, 130, 50, 14, M.claddingBlue, M.roof);
  shed(205, -200, 130, 50, 14, M.claddingBlue, M.roof);
  shed(380, -196, 150, 44, 12, M.claddingCream, M.roof);
  shed(560, -196, 150, 44, 12, M.cladding, M.roof);
  shed(800, -200, 220, 50, 13, M.cladding, M.roof, false);
  shed(1080, -200, 220, 50, 13, M.claddingCream, M.roof, false);
  // terminal office with a control room on top
  b.add(M.windowsOffice, tiledBox(34, 15, 18, -90, Y + 7.5, -190, [12, 3]));
  b.add(M.concrete, boxGeo(35, 0.5, 19, -90, Y + 15.25, -190));
  b.add(M.bridge, tiledBox(12, 3.2, 12, -94, Y + 17.1, -188, [8, 3.2]));
  b.add(M.white, boxGeo(13.4, 0.3, 13.4, -94, Y + 18.85, -188));
  b.add(M.galv, cylGeo(0.12, 0.2, 9, -90, Y + 23.5, -190, 6));
  b.add(M.white, boxGeo(3, 1.4, 2.2, -78, Y + 16.2, -193));
  world.flagBases = [V(-112, Y, -176), V(-108, Y, -176), V(-104, Y, -176)];
  for (const p of world.flagBases) b.add(M.galv, cylGeo(0.06, 0.1, 13, p.x, Y + 6.5, p.z, 6));

  buildSubstation(world, b, -400, -52);

  // ---------------- land behind the terminal + west shore ----------------
  b.add(M.land, tiledBox(5600, 6, 2900, -300, Y - 3.45, -262 - 1450, 90));
  b.add(M.land, tiledBox(2600, 6, 3460, X0 - 1300, Y - 3.6, -1170, 90));
  // tank farm on the west shore
  for (let i = 0; i < 9; i++) {
    const tx = -560 - (i % 3) * 62, tz = 90 + Math.floor(i / 3) * 70, r = 18 + (i % 2) * 4, h = 15 + (i % 3) * 3;
    b.add(M.tank, cylGeo(r, r, h, tx, Y + h / 2, tz, 32));
    b.add(M.tank, cylGeo(1, r, 1.6, tx, Y + h + 0.8, tz, 32));
    b.add(M.galv, cylGeo(r + 0.3, r + 0.3, 0.12, tx, Y + h, tz, 32));
    b.add(M.concrete, cylGeo(r + 4, r + 4, 0.8, tx, Y + 0.2, tz, 24));
  }
  // generic industry inland, lost in haze
  const inland = makeRng(5);
  const boxM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, map: M.white.map, roughness: 0.7 }), 210);
  const dum = new THREE.Object3D(), ccol = new THREE.Color();
  const tones = [0x9c9d98, 0x86898a, 0x707c84, 0x8f8878, 0x6f6b64, 0xa8a69c, 0x5f7382, 0x7a5a4c];
  for (let i = 0; i < 210; i++) {
    const w = 30 + inland() * 110, d = 24 + inland() * 60, h = 6 + inland() * 10 + (inland() < 0.06 ? 22 : 0);
    dum.position.set(-1500 + inland() * 3600, Y + h / 2 - 0.4, -300 - inland() * inland() * 1500);
    dum.scale.set(w, h, d); dum.rotation.y = inland() < 0.2 ? inland() * 0.4 : 0; dum.updateMatrix();
    boxM.setMatrixAt(i, dum.matrix);
    boxM.setColorAt(i, ccol.setHex(inland.pick(tones)));
  }
  boxM.castShadow = boxM.receiveShadow = true;
  scene.add(boxM);
  for (const [cx, cz, h] of [[-700, -520, 95], [-655, -540, 80], [900, -700, 110]]) {
    b.add(M.lighthouse, cylGeo(2.2, 4.2, h, cx, Y + h / 2, cz, 14));
  }
  // hills on the horizon
  {
    const g = new THREE.PlaneGeometry(11000, 2600, 140, 30);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const hr = makeRng(31);
    const ph = [hr() * 9, hr() * 9, hr() * 9, hr() * 9];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const ridge = Math.max(0, 1 - Math.abs(z + 200) / 1300);
      const n = Math.sin(x * 0.0011 + ph[0]) * 0.5 + Math.sin(x * 0.0027 + ph[1]) * 0.3 + Math.sin(x * 0.0061 + z * 0.002 + ph[2]) * 0.14 + Math.sin(x * 0.013 + z * 0.006 + ph[3]) * 0.07;
      p.setY(i, Math.max(0, ridge * ridge * (150 + 190 * (0.5 + n))));
    }
    g.computeVertexNormals();
    scaleUV(g, 60, 16);
    const hills = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: M.land.map, color: 0x9aa48e, roughness: 1 }));
    hills.position.set(-300, Y, -2900);
    scene.add(hills);
  }

  // ---------------- breakwater + lighthouse ----------------
  const BW = { x0: X0 - 30, x1: 150, z: 550 };
  world.breakwater = BW;
  {
    const s = new THREE.Shape();
    s.moveTo(-15, -5); s.lineTo(15, -5); s.lineTo(4, 4.4); s.lineTo(-4, 4.4); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: BW.x1 - BW.x0, bevelEnabled: false });
    scaleUV(g, 1 / 6, 1 / 6);
    g.rotateY(Math.PI / 2); g.translate(BW.x0, 0, BW.z);
    b.add(M.rock, g);
    b.add(M.concrete, boxGeo(BW.x1 - BW.x0, 0.4, 6.4, (BW.x0 + BW.x1) / 2, 4.5, BW.z));
    b.add(M.concrete, boxGeo(BW.x1 - BW.x0, 1.5, 0.7, (BW.x0 + BW.x1) / 2, 5.4, BW.z + 2.9));     // wave wall
    b.add(M.rock, cylGeo(9, 17, 9.4, BW.x1, -0.3, BW.z, 18));                                    // roundhead
    b.add(M.concrete, cylGeo(6.5, 6.5, 0.6, BW.x1, 4.6, BW.z, 18));
    // lighthouse
    const lx = BW.x1, lz = BW.z, ly = 4.9;
    b.add(M.concrete, cylGeo(3.0, 3.4, 2.2, lx, ly + 1.1, lz, 18));
    b.add(M.lighthouse, cylGeo(1.45, 2.3, 15, lx, ly + 9.7, lz, 20));
    b.add(M.dark, cylGeo(2.3, 2.1, 0.35, lx, ly + 17.3, lz, 20));
    for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; b.add(M.dark, boxGeo(0.05, 1.0, 0.05, lx + Math.cos(a) * 2.2, ly + 18, lz + Math.sin(a) * 2.2)); }
    const tr = new THREE.TorusGeometry(2.2, 0.03, 4, 24); tr.rotateX(Math.PI / 2); tr.translate(lx, ly + 18.5, lz); b.add(M.dark, tr);
    b.add(M.glass, cylGeo(1.25, 1.25, 2.2, lx, ly + 18.6, lz, 14));
    b.add(M.buoyRed, cylGeo(0.1, 1.55, 1.3, lx, ly + 20.35, lz, 14));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 2 }));
    lamp.position.set(lx, ly + 18.6, lz);
    scene.add(lamp);
    world.updaters.push((t) => { lamp.material.emissiveIntensity = (t % 5) < 0.6 ? 14 : 0.6; });
  }
  // rock armour: one instanced boulder, scattered over the mound slopes and the west shore
  {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position, rr = makeRng(88);
    for (let i = 0; i < p.count; i++) {
      // deterministic lumpiness (same vertex position -> same offset, so the mesh stays closed)
      const k = Math.sin(p.getX(i) * 12.9 + p.getY(i) * 78.2 + p.getZ(i) * 37.7) * 43758.5;
      const s = 0.78 + 0.4 * (k - Math.floor(k));
      p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
    }
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: M.rock.map, roughness: 0.95, flatShading: true });
    const spots = [];
    for (let x = BW.x0; x < BW.x1 + 6; x += 1.9) for (const s of [1, -1]) for (let k = 0; k < 4; k++) {
      const f = k / 3.4 + rr() * 0.1;
      spots.push([x + rr() * 2, 4.0 - f * 5.6, BW.z + s * (4.4 + f * 9.5), 1.1 + rr() * 1.2]);
    }
    for (let k = 0; k < 150; k++) {
      const a = -Math.PI / 2 + rr() * Math.PI, f = rr();
      spots.push([BW.x1 + Math.cos(a) * (8 + f * 8), 4 - f * 5.4, BW.z + Math.sin(a) * (8 + f * 8), 1.1 + rr() * 1.3]);
    }
    for (let z = 2; z < BW.z - 6; z += 2.0) for (let k = 0; k < 3; k++) {
      const f = k / 2.4 + rr() * 0.1;
      spots.push([X0 + 1 + f * 6.5, Y - 0.6 - f * 4.2, z + rr() * 2, 1.2 + rr() * 1.3]);
    }
    const im = new THREE.InstancedMesh(g, mat, spots.length);
    spots.forEach(([x, y, z, s], i) => {
      dum.position.set(x, y, z); dum.scale.set(s * (0.8 + rr() * 0.6), s * (0.6 + rr() * 0.5), s * (0.8 + rr() * 0.6));
      dum.rotation.set(rr() * 6, rr() * 6, rr() * 6); dum.updateMatrix();
      im.setMatrixAt(i, dum.matrix);
      im.setColorAt(i, ccol.setScalar(0.62 + rr() * 0.4).multiply(y < 1.0 ? new THREE.Color(0.5, 0.56, 0.46) : new THREE.Color(1, 1, 1)));
    });
    im.castShadow = im.receiveShadow = true;
    scene.add(im);
  }

  // ---------------- islands far out ----------------
  for (const [ix, iz, r, h, seed] of [[2600, 3600, 900, 190, 3], [4300, 2300, 700, 240, 7], [-1900, 4600, 1200, 150, 11], [900, 5600, 1500, 260, 13]]) {
    const g = new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = g.attributes.position;
    const ir = makeRng(seed), a1 = ir() * 6, a2 = ir() * 6;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const ang = Math.atan2(z, x);
      const lump = 1 + 0.14 * Math.sin(ang * 3 + a1) + 0.07 * Math.sin(ang * 7 + a2);
      const rho = Math.min(1, Math.hypot(x, z));
      const base = Math.pow(1 - rho, 1.25);
      const mod = 1 + Math.min(1, rho * 2.2) * (0.5 * Math.sin(ang * 2 + a2) + 0.32 * Math.sin(ang * 5 + a1) + 0.2 * Math.sin(ang * 9 + a1 * 2.3));
      p.setXYZ(i, x * r * lump, h * 2.1 * base * Math.max(0.25, mod), z * r * 0.6 * lump);
    }
    g.computeVertexNormals();
    scaleUV(g, 14, 4);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: M.land.map, color: 0x8f9c84, roughness: 1 }));
    m.position.set(ix, -1, iz);
    scene.add(m);
  }

  b.build(scene);
}
