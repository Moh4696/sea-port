import * as THREE from 'three';
import { Batch, beamGeo, rodGeo, boxGeo, cylGeo, tiledBox, V, clamp, lerp, makeRng } from './util.js';
import { hullTex, sternTex } from './tex.js';
import { CL, CH, CW, pickColor } from './containers.js';

/**
 * Lofted hull. Stern at -L/2, bow at +L/2, centreline on z = 0, waterline y = 0.
 * Returns separate geometries so each side can carry its own lettering.
 */
export function loftHull(p) {
  const o = { sheer: 0, sheerStart: 0.85, bowStart: 0.78, kLow: 1.3, kHigh: 2.6, rake: 0, sternLen: 0.06, sternNarrow: 0.1, sternRound: 0, bilge: 3, N: 96, ...p };
  const { L, B, D, T } = o;
  const Htot = T + D + o.sheer;
  const deckY = (u) => D + o.sheer * Math.pow(clamp((u - o.sheerStart) / (1 - o.sheerStart), 0, 1), 1.6);
  const half = (u, y) => {
    let b = B / 2;
    const hy = clamp((y + T) / (D + T), 0, 1);
    if (u > o.bowStart) {
      const t = (u - o.bowStart) / (1 - o.bowStart);
      b *= Math.max(0, 1 - Math.pow(t, lerp(o.kLow, o.kHigh, hy)));
    }
    if (u < o.sternLen) {
      const t = 1 - u / o.sternLen;
      b *= 1 - o.sternNarrow * t * t - o.sternRound * Math.pow(t, 2.4);
      if (o.sternRound) b *= lerp(1, 0.55 + 0.45 * hy, t);       // tucked-in counter on small craft
    }
    return b;
  };
  const xAt = (u, y) => {
    let x = -L / 2 + u * L;
    if (u > o.bowStart && o.rake) {
      const t = (u - o.bowStart) / (1 - o.bowStart);
      x += o.rake * Math.pow(t, 1.5) * clamp((y + T) / (D + T), 0, 1.3);
    }
    return x;
  };
  // ring: keel centre -> bilge -> side -> deck edge
  const ring = (u) => {
    const dy = deckY(u);
    const pts = [];
    const bK = half(u, -T);
    const r = Math.min(o.bilge, bK * 0.7);
    pts.push([0, -T]);
    pts.push([Math.max(bK - r, 0), -T]);
    for (let k = 1; k <= 3; k++) {
      const a = (k / 3) * Math.PI / 2;
      pts.push([bK - r + Math.sin(a) * r, -T + r - Math.cos(a) * r]);
    }
    const ys = [-T * 0.45, -0.6, 0.6, 1.7, D * 0.35, D * 0.7, dy];
    for (const y of ys) if (y > -T + r + 0.01) pts.push([half(u, y), y]);
    return pts;
  };
  const M = ring(0.5).length;
  const N = o.N;
  const side = (s) => {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const pts = ring(u);
      for (let j = 0; j < M; j++) {
        const [z, y] = pts[Math.min(j, pts.length - 1)];
        pos.push(xAt(u, y), y, s * z);
        uv.push(s > 0 ? u : 1 - u, (y + T) / Htot);
      }
    }
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < M - 1; j++) {
      const a = i * M + j, b = (i + 1) * M + j, c = (i + 1) * M + j + 1, d = i * M + j + 1;
      if (s > 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const deck = (drop = 0, inset = 0) => {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const y = deckY(u) - drop;
      const b = Math.max(half(u, y) - inset, 0);
      const x = xAt(u, y);
      pos.push(x, y, -b, x, y, b);
      uv.push(x / 8, -b / 8, x / 8, b / 8);
    }
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2, b = (i + 1) * 2, c = (i + 1) * 2 + 1, d = i * 2 + 1;
      idx.push(a, c, b, a, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const transom = () => {
    const pts = ring(0);
    const pos = [xAt(0, 0), (D - T) / 2, 0], uv = [0.5, 0.5], idx = [];
    for (const s of [1, -1]) for (const [z, y] of pts) { pos.push(xAt(0, y), y, s * z); uv.push(0.5 + s * z / B, (y + T) / Htot); }
    const n = pts.length;
    for (let j = 0; j < n - 1; j++) { idx.push(0, 1 + j, 2 + j); idx.push(0, 1 + n + j + 1, 1 + n + j); }
    idx.push(0, n, 2 * n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  return { side, deck, transom, half, deckY, xAt, opts: o };
}

function sagLine(a, b, sag, r, mat, parent) {
  const mid = a.clone().add(b).multiplyScalar(0.5); mid.y -= sag;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, r, 5, false), mat);
  m.castShadow = true;
  parent.add(m);
}

export function buildShip(scene, M, containers, cfg) {
  const rng = makeRng(2024);
  const L = 262, B = 40, D = 14.2, T = 12, sheer = 3.2;
  const hull = loftHull({ L, B, D, T, sheer, sheerStart: 0.84, bowStart: 0.76, kLow: 1.25, kHigh: 2.9, rake: 7, sternLen: 0.07, sternNarrow: 0.14, bilge: 3.5, N: 110 });
  const zc = cfg.z;                                   // ship centreline in world z
  const g = new THREE.Group();
  g.position.set(cfg.x, 0, zc);
  scene.add(g);

  const info = { L, B, D, T, lineName: 'HALDEN', shipName: 'AURORA STRAIT', home: 'HALVARD', sheer };
  const matS = new THREE.MeshStandardMaterial({ map: hullTex({ ...info, mirrored: false, seed: 9 }), roughness: 0.5 });
  const matP = new THREE.MeshStandardMaterial({ map: hullTex({ ...info, mirrored: true, seed: 12 }), roughness: 0.5 });
  for (const [geo, mat] of [[hull.side(1), matS], [hull.side(-1), matP], [hull.deck(0, 0), M.deck], [hull.transom(), new THREE.MeshStandardMaterial({ map: sternTex(info), roughness: 0.5 })]]) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }

  const b = new Batch();
  const uOf = (x) => (x + L / 2) / L;
  const dk = (x) => hull.deckY(uOf(x));

  // ---------------- cargo ----------------
  const pitch = 13.5;
  const bays = [];
  for (const x of [-112, -98.5]) bays.push({ x, aft: true });
  for (let k = 0; k < 12; k++) bays.push({ x: -57 + k * pitch });
  const tierPlan = [6, 7, 7, 8, 8, 7, 8, 8, 8, 7, 6, 5];
  let fk = 0;
  const work = [];
  for (const bay of bays) {
    const u = uOf(bay.x + CL / 2 + 0.5);
    const hb = hull.half(u, hull.deckY(u)) - 1.3;
    const rows = Math.min(15, Math.floor((hb * 2) / (CW + 0.06)));
    const baseY = dk(bay.x) + 1.25;
    const width = rows * (CW + 0.06);
    // hatch cover + coaming
    b.add(M.greyLight, boxGeo(CL + 0.5, 0.5, width + 0.3, bay.x, baseY - 0.3, 0));
    b.add(M.dark, boxGeo(CL + 0.9, 0.75, width + 0.9, bay.x, dk(bay.x) + 0.37, 0));
    let tiers = bay.aft ? 5 : tierPlan[fk];
    const working = cfg.workBays.includes(bay.x);
    const colBlock = [];
    for (let r = 0; r < rows; r++) {
      if (r % 3 === 0 || rng() < 0.25) colBlock[r] = pickColor(rng); else colBlock[r] = colBlock[r - 1];
    }
    bay.rows = rows; bay.top = [];
    for (let r = 0; r < rows; r++) {
      const zl = (r - (rows - 1) / 2) * (CW + 0.06);
      let n = tiers - (rng() < 0.3 ? 1 : 0) - (rng() < 0.12 ? 1 : 0);
      // outer rows step down, like a real stow plan
      if (r === 0 || r === rows - 1) n = Math.min(n, tiers - 1);
      if (working) n = r < rows * 0.55 ? 2 + (r % 3 === 0 ? 1 : 0) : Math.min(n, 5);   // quay side partly discharged
      n = Math.max(1, n);
      for (let t = 0; t < n; t++) {
        const ci = rng() < 0.8 ? colBlock[r] : pickColor(rng);
        containers.add(cfg.x + bay.x, baseY + CH / 2 + t * (CH + 0.012), zc + zl, 0, ci, rng);
      }
      bay.top[r] = { z: zc + zl, y: baseY + n * (CH + 0.012) };
    }
    if (working) work.push({ x: cfg.x + bay.x, rows: bay.top.slice(0, Math.floor(rows * 0.55)) });
    // lashing bridge on the forward edge of the bay
    if (!bay.aft) {
      const lx = bay.x + pitch / 2;
      const lu = uOf(lx);
      const lw = hull.half(lu, hull.deckY(lu)) - 1.2;
      const ly = dk(lx);
      if (lw > 6 && fk < 11) {
        const h = 2 * CH + 1.4;
        b.add(M.grey, boxGeo(0.5, 0.35, lw * 2, lx, ly + h, 0));
        b.add(M.grey, boxGeo(0.5, 0.2, lw * 2, lx, ly + h * 0.52, 0));
        for (let zz = -lw; zz <= lw + 0.01; zz += (lw * 2) / 8) b.add(M.grey, boxGeo(0.5, h, 0.3, lx, ly + h / 2, zz));
        for (let zz = -lw; zz < lw - 0.01; zz += (lw * 2) / 8) {
          b.add(M.grey, beamGeo(V(lx, ly, zz), V(lx, ly + h * 0.52, zz + lw / 4), 0.12, 0.12));
        }
      }
      fk++;
    }
  }

  // ---------------- accommodation block ----------------
  const hx = -78, deckH = 2.9, levels = 9;
  const houseTop = D + levels * deckH;
  b.add(M.windows, tiledBox(13, levels * deckH, 34, hx, D + levels * deckH / 2, 0, [12, deckH]));
  b.add(M.white, boxGeo(13.6, 0.3, 34.6, hx, houseTop + 0.15, 0));
  for (let lv = 2; lv < levels; lv += 2) b.add(M.white, boxGeo(14.2, 0.18, 35.6, hx, D + lv * deckH, 0));      // deck overhangs
  // bridge with wings
  b.add(M.bridge, tiledBox(8.5, 3.1, 30, hx + 1.5, houseTop + 1.85, 0, [8, 3.1]));
  b.add(M.white, boxGeo(6, 1.25, 43, hx + 1.5, houseTop + 0.92, 0));
  b.add(M.bridge, tiledBox(3.4, 3.1, 4.2, hx + 2.5, houseTop + 1.85, 19.4, [8, 3.1]));
  b.add(M.bridge, tiledBox(3.4, 3.1, 4.2, hx + 2.5, houseTop + 1.85, -19.4, [8, 3.1]));
  b.add(M.white, boxGeo(10, 0.3, 44, hx + 1.5, houseTop + 3.55, 0));
  // monkey island, mast, radars
  const topY = houseTop + 3.7;
  b.add(M.white, cylGeo(0.35, 0.5, 9, hx + 1, topY + 4.5, 0, 10));
  b.add(M.white, boxGeo(0.4, 0.4, 9, hx + 1, topY + 6.4, 0));
  b.add(M.white, boxGeo(3.6, 0.3, 0.4, hx + 1.2, topY + 3.6, 0));
  b.add(M.white, cylGeo(0.9, 0.9, 1.5, hx - 2.4, topY + 1.2, 5.5, 14));               // satcom dome base
  const dome = new THREE.SphereGeometry(1.25, 14, 10); dome.translate(hx - 2.4, topY + 2.6, 5.5);
  b.add(M.whiteClean, dome);
  const dome2 = new THREE.SphereGeometry(0.8, 12, 8); dome2.translate(hx - 2.4, topY + 1.4, -6);
  b.add(M.whiteClean, dome2);
  for (let zz = -21.5; zz <= 21.5; zz += 43 / 16) b.add(M.white, boxGeo(0.07, 1.1, 0.07, hx + 5.4, topY + 0.55, zz));
  b.add(M.white, boxGeo(0.07, 0.07, 43, hx + 5.4, topY + 1.1, 0));
  // funnel casing + funnel
  b.add(M.white, boxGeo(9, 16, 16, hx - 11.2, D + 8, 0));
  b.add(M.funnel, boxGeo(6.5, 11, 9, hx - 11.5, D + 21.5, 0));
  for (const zz of [-2, 0, 2]) b.add(M.black, cylGeo(0.55, 0.55, 2.6, hx - 12, D + 28, zz, 10));
  b.add(M.white, boxGeo(9.4, 0.25, 16.4, hx - 11.2, D + 16.1, 0));
  // free-fall lifeboat on its ramp at the stern + two rescue boats under davits
  const lb = new THREE.CapsuleGeometry(1.5, 6.2, 5, 12); lb.rotateZ(Math.PI / 2 - 0.5); lb.translate(-L / 2 + 6.5, D + 6.4, 0);
  b.add(M.orange, lb);
  b.add(M.white, beamGeo(V(-L / 2 + 11, D + 8.6, -1.6), V(-L / 2 + 1.5, D + 3.2, -1.6), 0.35, 0.5));
  b.add(M.white, beamGeo(V(-L / 2 + 11, D + 8.6, 1.6), V(-L / 2 + 1.5, D + 3.2, 1.6), 0.35, 0.5));
  for (const xx of [-L / 2 + 10.5, -L / 2 + 5]) for (const zz of [-1.6, 1.6]) b.add(M.white, boxGeo(0.35, (xx > -L / 2 + 8 ? 8.4 : 5.2), 0.35, xx, D + (xx > -L / 2 + 8 ? 4.2 : 2.6), zz));
  for (const s of [1, -1]) {
    const rb = new THREE.CapsuleGeometry(1.0, 4.4, 4, 10); rb.rotateZ(Math.PI / 2); rb.translate(hx, D + 5 * deckH + 1.3, s * 18.4);
    b.add(M.orange, rb);
    for (const dx of [-2.4, 2.4]) {
      b.add(M.white, beamGeo(V(hx + dx, D + 5 * deckH, s * 17), V(hx + dx, D + 5 * deckH + 3.4, s * 18.6), 0.25, 0.3));
    }
  }
  // aft mooring deck gear
  for (const zz of [-9, 9]) {
    b.add(M.deckGreen, cylGeo(0.9, 0.9, 3.4, -L / 2 + 16, D + 1.3, zz, 12, 'z'));
    b.add(M.deckGreen, boxGeo(2.6, 1.2, 4.4, -L / 2 + 16, D + 0.6, zz));
  }

  // ---------------- forecastle ----------------
  const fx = L / 2 - 20;
  const fy = dk(fx);
  b.add(M.white, cylGeo(0.3, 0.45, 13, fx + 6, dk(fx + 6) + 6.5, 0, 10));             // foremast
  b.add(M.white, boxGeo(0.3, 0.3, 5, fx + 6, dk(fx + 6) + 11, 0));
  b.add(M.lamp, boxGeo(0.4, 0.4, 0.4, fx + 6.3, dk(fx + 6) + 12.8, 0));
  for (const zz of [-5.5, 5.5]) {                                                   // windlasses
    b.add(M.deckGreen, cylGeo(1.1, 1.1, 3.2, fx, fy + 1.5, zz, 14, 'z'));
    b.add(M.deckGreen, boxGeo(3.2, 1.4, 4.6, fx, fy + 0.7, zz));
    b.add(M.black, beamGeo(V(fx + 1, fy + 1.4, zz), V(fx + 9, dk(fx + 9) + 0.3, zz * 0.75), 0.35, 0.35));   // anchor chain
  }
  b.add(M.white, boxGeo(10, 2.6, 14, L / 2 - 46, dk(L / 2 - 46) + 1.3, 0));         // breakwater / store on the fo'c'sle break
  // anchors in their pockets
  for (const s of [1, -1]) {
    const ax = L / 2 - 17, ay = 8.4;
    const az = s * (hull.half(uOf(ax), ay) + 0.15);
    b.add(M.black, boxGeo(2.2, 2.6, 0.5, hull.xAt(uOf(ax), ay), ay, az));
    b.add(M.black, boxGeo(3.4, 0.6, 0.6, hull.xAt(uOf(ax), ay), ay - 1.2, az));
  }

  // ---------------- rails along the deck edge ----------------
  for (const s of [1, -1]) {
    let prev = null;
    for (let i = 0; i <= 64; i++) {
      const u = 0.004 + (i / 64) * 0.985;
      const y = hull.deckY(u);
      const p = V(hull.xAt(u, y), y + 1.1, s * Math.max(hull.half(u, y) - 0.12, 0));
      if (prev) {
        b.add(M.white, beamGeo(prev, p, 0.07, 0.07));
        b.add(M.white, beamGeo(V(prev.x, prev.y - 0.5, prev.z), V(p.x, p.y - 0.5, p.z), 0.05, 0.05));
        b.add(M.white, boxGeo(0.07, 1.1, 0.07, p.x, p.y - 0.55, p.z));
      }
      prev = p;
    }
  }

  // ---------------- gangway down to the quay ----------------
  {
    const a = V(-64, D + 0.2, -B / 2 - 0.9), c = V(-47, cfg.quayY + 0.5 - 0, -B / 2 - 3.4);
    b.add(M.galv, beamGeo(a, c, 1.1, 0.14));
    for (const o of [-0.55, 0.55]) {
      b.add(M.galv, beamGeo(V(a.x, a.y + 1.05, a.z + o), V(c.x, c.y + 1.05, c.z + o), 0.06, 0.06));
      for (let k = 0; k <= 8; k++) {
        const p = a.clone().lerp(c, k / 8);
        b.add(M.galv, boxGeo(0.05, 1.05, 0.05, p.x, p.y + 0.52, p.z + o));
      }
    }
    b.add(M.galv, boxGeo(2.4, 0.14, 1.6, -64.8, D + 0.25, -B / 2 - 0.6));
  }

  const meshes = b.build(g);

  // rotating radar scanners
  const radars = [];
  for (const [y, len, sp] of [[topY + 7.4, 3.8, 2.6], [topY + 4.1, 2.6, 3.3]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, len), M.whiteClean);
    r.position.set(hx + (y > topY + 5 ? 1 : 2.8), y, 0);
    r.castShadow = true;
    g.add(r);
    radars.push([r, sp]);
  }

  // ---------------- mooring lines ----------------
  const q = cfg.quayY + 0.55;
  const side = -B / 2;
  const bowY = dk(L / 2 - 8) + 0.3, sternY = D + 0.3;
  const lines = [
    [V(L / 2 - 6, bowY, -1.5), V(L / 2 + 26, q, side - 3.3), 2.2],     // head lines
    [V(L / 2 - 7, bowY, -2.5), V(L / 2 + 38, q, side - 3.3), 2.6],
    [V(L / 2 - 30, dk(L / 2 - 30) + 0.3, -hull.half(uOf(L / 2 - 30), 14) + 0.3), V(L / 2 - 62, q, side - 3.3), 1.6],   // fwd spring
    [V(L / 2 - 26, dk(L / 2 - 26) + 0.3, -hull.half(uOf(L / 2 - 26), 14) + 0.3), V(L / 2 - 8, q, side - 3.3), 1.2],    // breast
    [V(-L / 2 + 2, sternY, -12), V(-L / 2 - 24, q, side - 3.3), 2.2],  // stern lines
    [V(-L / 2 + 2, sternY, -14), V(-L / 2 - 36, q, side - 3.3), 2.6],
    [V(-L / 2 + 14, sternY, side * 0.86 + 0.3), V(-L / 2 + 46, q, side - 3.3), 1.6],  // aft spring
    [V(-L / 2 + 10, sternY, side * 0.84 + 0.3), V(-L / 2 - 6, q, side - 3.3), 1.2],   // breast
  ];
  const bollards = [];
  for (const [a, c, sag] of lines) {
    sagLine(a, c, sag, 0.07, M.rope, g);
    bollards.push(cfg.x + c.x);
  }

  const update = (t) => { for (const [r, sp] of radars) r.rotation.y = t * sp; };
  return { group: g, hull, update, work, bollards, L, B, D, zc, meshes };
}
