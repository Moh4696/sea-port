// Every texture in the scene is painted here on a 2D canvas. Nothing is loaded from disk.
import * as THREE from 'three';
import { makeRng } from './util.js';

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
let MAX_ANISO = 8;
export function setMaxAnisotropy(n) { MAX_ANISO = n; }

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = MAX_ANISO;
  return t;
}

// ---- tileable value noise ----
function noiseField(w, h, cells, seed, oct = 4, gain = 0.5) {
  const out = new Float32Array(w * h);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const c = cells << o;
    const rng = makeRng(seed + o * 1013);
    const lat = new Float32Array(c * c);
    for (let i = 0; i < lat.length; i++) lat[i] = rng();
    for (let y = 0; y < h; y++) {
      const fy = (y / h) * c;
      const y0 = Math.floor(fy) % c, y1 = (y0 + 1) % c;
      let ty = fy - Math.floor(fy); ty = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < w; x++) {
        const fx = (x / w) * c;
        const x0 = Math.floor(fx) % c, x1 = (x0 + 1) % c;
        let tx = fx - Math.floor(fx); tx = tx * tx * (3 - 2 * tx);
        const a = lat[y0 * c + x0], b = lat[y0 * c + x1];
        const d = lat[y1 * c + x0], e = lat[y1 * c + x1];
        out[y * w + x] += (a + (b - a) * tx + ((d + (e - d) * tx) - (a + (b - a) * tx)) * ty) * amp;
      }
    }
    tot += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

function noiseCanvas(size, cells, seed, oct = 4, lo = 170, hi = 255, contrast = 1) {
  const [c, ctx] = mk(size, size);
  const f = noiseField(size, size, cells, seed, oct);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < f.length; i++) {
    let v = (f[i] - 0.5) * contrast + 0.5;
    v = Math.min(1, Math.max(0, v));
    const g = lo + (hi - lo) * v;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

let _n = null;
function noises() {
  if (!_n) {
    _n = {
      fine: noiseCanvas(512, 32, 11, 4, 150, 255, 1.6),
      mid: noiseCanvas(512, 6, 23, 5, 150, 255, 1.8),
      blotch: noiseCanvas(512, 3, 37, 4, 110, 255, 2.4),
    };
  }
  return _n;
}

function multiply(ctx, w, h, src, alpha = 1, sx = 1, sy = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha;
  const pw = src.width * sx, ph = src.height * sy;
  for (let y = 0; y < h; y += ph) for (let x = 0; x < w; x += pw) ctx.drawImage(src, x, y, pw, ph);
  ctx.restore();
}

function streak(ctx, x, y, len, wid, rgb, alpha) {
  const g = ctx.createLinearGradient(0, y, 0, y + len);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(0.35, `rgba(${rgb},${alpha * 0.55})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - wid / 2, y, wid, len);
}

function speckle(ctx, w, h, rng, count, rgb, aMax, rMax) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = `rgba(${rgb},${rng() * aMax})`;
    const r = 0.5 + rng() * rMax;
    ctx.beginPath();
    ctx.ellipse(rng() * w, rng() * h, r, r * (0.5 + rng()), rng() * 3, 0, 6.3);
    ctx.fill();
  }
}

// ======================================================================
// Containers: atlas 1024x256. Left 75% = long side, right 25% = door end.
// Greyscale; tinted per instance. Logo lives in a separate mask atlas.
// ======================================================================
export const CONTAINER_SIDE_U = 0.75;

export function containerTex(seed) {
  const W = 1024, H = 256, SW = 768;
  const [c, ctx] = mk(W, H);
  const rng = makeRng(seed);
  const img = ctx.createImageData(W, H);
  const period = SW / 44;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v;
      if (x < SW) {
        const p = (x / period) % 1;
        if (p < 0.14) v = 0.66; else if (p < 0.22) v = 0.8; else if (p < 0.55) v = 0.9;
        else if (p < 0.64) v = 1.0; else if (p < 0.9) v = 0.86; else v = 0.74;
        if (y < 13 || y > 241) v = 0.8;
        if (y === 13 || y === 14 || y === 241) v = 0.5;
        if (x < 13 || x > SW - 14) v = 0.77;
        if (x === 13 || x === SW - 14) v = 0.5;
      } else {
        const dx = x - SW, dw = W - SW;
        v = 0.86;
        const py = (y / 21) % 1;                    // shallow horizontal door ribs
        v *= py < 0.12 ? 0.86 : (py > 0.88 ? 1.04 : 1);
        if (dx < 8 || dx > dw - 9 || y < 10 || y > 244) v = 0.74;
        if (Math.abs(dx - dw / 2) < 2) v = 0.45;     // door split
        for (const bx of [0.16, 0.36, 0.64, 0.84]) {  // locking bars
          const d = Math.abs(dx - dw * bx);
          if (d < 2.2) v = 1.0; else if (d < 3.6) v = 0.55;
        }
        for (const bx of [0.16, 0.36, 0.64, 0.84]) {  // cam handles
          if (Math.abs(y - 150) < 3 && dx > dw * bx - 12 && dx < dw * bx + 12) v = 0.98;
        }
      }
      const g = Math.round(v * 232);
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const n = noises();
  multiply(ctx, W, H, n.mid, 0.55, 1, 0.5);
  multiply(ctx, W, H, n.fine, 0.35, 0.5, 0.5);
  // grime rising from the bottom rail and dripping from the top rail
  let g = ctx.createLinearGradient(0, 150, 0, H);
  g.addColorStop(0, 'rgba(40,34,28,0)'); g.addColorStop(1, 'rgba(40,34,28,0.34)');
  ctx.fillStyle = g; ctx.fillRect(0, 150, W, H - 150);
  for (let i = 0; i < 70; i++) streak(ctx, rng() * W, 12 + rng() * 6, 30 + rng() * 150, 1 + rng() * 5, '30,26,22', 0.1 + rng() * 0.2);
  // rust: streaks, patches at the rails, scuffs
  for (let i = 0; i < 26; i++) streak(ctx, rng() * W, rng() < 0.6 ? 10 : rng() * 200, 20 + rng() * 110, 1.5 + rng() * 4, '112,58,26', 0.25 + rng() * 0.4);
  for (let i = 0; i < 26; i++) {
    const x = rng() * W, y = rng() < 0.5 ? 236 + rng() * 14 : rng() * H;
    ctx.fillStyle = `rgba(104,52,24,${0.25 + rng() * 0.4})`;
    ctx.beginPath(); ctx.ellipse(x, y, 3 + rng() * 14, 2 + rng() * 5, 0, 0, 6.3); ctx.fill();
  }
  speckle(ctx, W, H, rng, 500, '90,48,24', 0.5, 1.6);
  speckle(ctx, W, H, rng, 300, '250,250,250', 0.25, 1.2);
  for (let i = 0; i < 14; i++) {                 // forklift / spreader scrapes
    ctx.strokeStyle = `rgba(235,235,235,${0.08 + rng() * 0.16})`;
    ctx.lineWidth = 0.6 + rng() * 1.6;
    const x = rng() * W, y = rng() * H;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rng() - 0.5) * 120, y + (rng() - 0.5) * 16); ctx.stroke();
  }
  return toTex(c, { repeat: false });
}

export function containerLogoTex(brand, seed) {
  const W = 1024, H = 256, SW = 768;
  const [c, ctx] = mk(W, H);
  const rng = makeRng(seed);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  if (brand) {
    ctx.font = `${brand.italic ? 'italic ' : ''}${brand.weight || 800} ${brand.size || 74}px ${FONT}`;
    ctx.textAlign = brand.align || 'right';
    const tx = brand.align === 'center' ? SW / 2 : (brand.align === 'left' ? 60 : SW - 60);
    ctx.save();
    ctx.translate(tx, brand.y || 92);
    ctx.scale(0.62, 1);                        // atlas is squeezed horizontally (12.2 m over 768 px)
    ctx.fillText(brand.name, 0, 0);
    if (brand.sub) {
      ctx.font = `500 22px ${FONT}`;
      ctx.fillText(brand.sub, 0, (brand.size || 74) * 0.62 + 8);
    }
    if (brand.bar) {
      const m = ctx.measureText(brand.name);
      ctx.fillRect(brand.align === 'left' ? 0 : -330, -(brand.size || 74) * 0.62 - 6, 330, 9);
    }
    ctx.restore();
  }
  // ownership code + weights panel (every box carries these)
  const code = () => {
    const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
    let s = '';
    for (let i = 0; i < 3; i++) s += L[Math.floor(rng() * L.length)];
    return s + 'U ' + String(Math.floor(100000 + rng() * 899999)) + ' ' + Math.floor(rng() * 10);
  };
  ctx.save();
  ctx.font = `700 19px ${FONT}`; ctx.textAlign = 'right';
  ctx.translate(SW - 28, 34); ctx.scale(0.62, 1);
  ctx.fillText(code(), 0, 0);
  ctx.font = `500 13px ${FONT}`;
  ctx.fillText('45G1', 0, 20);
  ctx.restore();
  // door end: code + data block
  ctx.save();
  ctx.translate(SW + 190, 40); ctx.scale(0.8, 1);
  ctx.font = `700 17px ${FONT}`; ctx.textAlign = 'right';
  ctx.fillText(code(), 0, 0);
  ctx.font = `500 9px ${FONT}`;
  ['MAX GROSS  30,480 KG', 'TARE        3,750 KG', 'NET        26,730 KG', 'CU. CAP.    67.7 CU.M'].forEach((t, i) => ctx.fillText(t, 0, 22 + i * 12));
  ctx.restore();
  const t = toTex(c, { srgb: false, repeat: false });
  return t;
}

// ======================================================================
// Ship hull side. u = stern->bow (or mirrored), v = keel->forecastle top.
// ======================================================================
export function hullTex({ L, T, D, sheer, lineName, shipName, home, mirrored, seed, color = '#1d262e', redTop = 1.7, lineH = 5.4, lineY = 7.4, nameH = 1.5, big = true }) {
  const W = 4096, H = 512;
  const [c, ctx] = mk(W, H);
  const rng = makeRng(seed);
  const Htot = T + D + sheer;
  const py = (y) => H - ((y + T) / Htot) * H;          // world y -> canvas y
  const pxm = W / L, pym = H / Htot;
  const X = (u) => (mirrored ? (1 - u) : u) * W;        // u along ship -> canvas x

  ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
  // subtle strake tone variation
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '0,0,0'},${0.015 + rng() * 0.03})`;
    ctx.fillRect(0, py(D + sheer) + i * (py(0) - py(D + sheer)) / 12, W, (py(0) - py(D + sheer)) / 12);
  }
  // antifouling + boot top
  const yRed = py(redTop);
  ctx.fillStyle = '#6f2a22'; ctx.fillRect(0, yRed, W, H - yRed);
  ctx.fillStyle = '#12161a'; ctx.fillRect(0, yRed - 5, W, 5);
  // plate seams
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1;
  for (let y = py(D + sheer); y < H; y += 2.6 * pym) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  for (let x = 0; x < W; x += 9.5 * pxm) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let y = py(D + sheer) + 1; y < H; y += 2.6 * pym) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // lettering
  const text = (str, u, yWorld, hWorld, weight = 800, spacing = 0) => {
    ctx.save();
    ctx.translate(X(u), py(yWorld));
    ctx.scale(pxm / pym, 1);
    ctx.font = `${weight} ${hWorld * pym * 1.38}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (spacing) { try { ctx.letterSpacing = spacing + 'px'; } catch (e) { /* older engines */ } }
    ctx.fillStyle = 'rgba(232,232,226,0.96)';
    ctx.fillText(str, 0, 0);
    ctx.restore();
  };
  if (lineName) text(lineName, 0.5, lineY, lineH, 800, big ? 26 : 4);
  if (big) {
    text(shipName, 0.905, 12.6, nameH, 700, 6);
    text(shipName, 0.045, 11.2, 1.1, 700, 4);
    text(home, 0.045, 9.6, 0.7, 600, 3);
  } else if (shipName) {
    text(shipName, 0.8, D * 0.62, nameH, 700, 2);
  }
  // draft marks
  for (const u of (big ? [0.035, 0.5, 0.955] : [])) {
    for (let m = 0; m < 9; m++) {
      ctx.save();
      ctx.translate(X(u), py(-0.2 + m * 0.6));
      ctx.scale(pxm / pym, 1);
      ctx.font = `700 ${0.34 * pym * 1.4}px ${FONT}`;
      ctx.fillStyle = 'rgba(236,236,230,0.9)'; ctx.textAlign = 'center';
      ctx.fillText(String(10 + m * 2 / 2 | 0) + (m % 2 ? '' : 'M'), 0, 0);
      ctx.restore();
    }
  }
  // load line disc
  if (big) {
  ctx.strokeStyle = 'rgba(236,236,230,0.9)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(X(0.5) + 34 * (mirrored ? -1 : 1), py(1.2), 0.45 * pxm, 0.45 * pym, 0, 0, 6.3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(X(0.5) + 34 * (mirrored ? -1 : 1) - 0.7 * pxm, py(1.2)); ctx.lineTo(X(0.5) + 34 * (mirrored ? -1 : 1) + 0.7 * pxm, py(1.2)); ctx.stroke();
  }

  const n = noises();
  multiply(ctx, W, H, n.mid, 0.6, 1, 1);
  multiply(ctx, W, H, n.blotch, 0.35, 2, 1);
  // rust weeping from scuppers / freeing ports and the anchor pocket
  for (let x = 20; x < W; x += (8 + rng() * 14) * pxm) {
    const y0 = py(D) + rng() * 8;
    streak(ctx, x, y0, (3 + rng() * 9) * pym, 2 + rng() * 5, '120,62,30', 0.35 + rng() * 0.4);
    if (rng() < 0.5) streak(ctx, x + 3, y0, (2 + rng() * 4) * pym, 6 + rng() * 6, '70,44,30', 0.2);
  }
  if (big) for (let i = 0; i < 9; i++) streak(ctx, X(0.93) + (rng() - 0.5) * 60, py(8.5), (5 + rng() * 5) * pym, 3 + rng() * 9, '126,64,28', 0.5);
  speckle(ctx, W, py(redTop), rng, 900, '112,60,30', 0.4, 2.2);
  // fender rub marks and tug-push scuffs
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(${rng() < 0.5 ? '10,10,10' : '150,150,145'},${0.05 + rng() * 0.12})`;
    ctx.fillRect(rng() * W, py(redTop + rng() * (D - redTop) * 0.7), 20 + rng() * 80, 2 + rng() * 10);
  }
  // waterline: salt bloom above, weed below
  const wTop = Math.min(1.3, redTop + 0.4);
  let g = ctx.createLinearGradient(0, py(wTop), 0, py(-0.6));
  g.addColorStop(0, 'rgba(190,196,190,0)'); g.addColorStop(0.55, 'rgba(176,184,176,0.28)');
  g.addColorStop(0.8, 'rgba(70,84,52,0.55)'); g.addColorStop(1, 'rgba(40,52,36,0.75)');
  ctx.fillStyle = g; ctx.fillRect(0, py(wTop), W, py(-0.6) - py(wTop));
  ctx.fillStyle = 'rgba(36,46,34,0.75)'; ctx.fillRect(0, py(-0.6), W, H - py(-0.6));
  for (let i = 0; i < 500; i++) streak(ctx, rng() * W, py(wTop * 0.7) + rng() * 6, 6 + rng() * 22, 1 + rng() * 3, '205,208,198', 0.12 + rng() * 0.2);
  return toTex(c, { repeat: false });
}

// ======================================================================
// Generic painted steel: near-white, tinted by material colour.
// ======================================================================
export function paintedSteelTex(seed, { rust = 1, size = 512 } = {}) {
  const [c, ctx] = mk(size, size);
  const rng = makeRng(seed);
  ctx.fillStyle = '#eeeeee'; ctx.fillRect(0, 0, size, size);
  const n = noises();
  multiply(ctx, size, size, n.blotch, 0.1, 1, 1);
  multiply(ctx, size, size, n.fine, 0.1, 1, 1);
  for (let i = 0; i < 8 * rust; i++) streak(ctx, rng() * size, rng() * size, 20 + rng() * 60, 1 + rng() * 3, '128,70,34', 0.08 + rng() * 0.16);
  speckle(ctx, size, size, rng, 110 * rust, '120,66,32', 0.45, 1.8);
  // weld seams

  return toTex(c);
}

// ======================================================================
// Ground + quay
// ======================================================================
export function apronTex(seed) {
  const S = 1024;                                   // one repeat = 20 m
  const [c, ctx] = mk(S, S);
  const rng = makeRng(seed);
  ctx.fillStyle = '#a6a49d'; ctx.fillRect(0, 0, S, S);
  const slab = S / 4;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const t = rng();
    ctx.fillStyle = `rgba(${t < 0.5 ? '0,0,0' : '255,255,255'},${rng() * 0.07})`;
    ctx.fillRect(i * slab, j * slab, slab, slab);
  }
  const n = noises();
  multiply(ctx, S, S, n.blotch, 0.5, 2, 2);
  multiply(ctx, S, S, n.mid, 0.6, 1, 1);
  multiply(ctx, S, S, n.fine, 0.5, 0.5, 0.5);
  // joints
  ctx.strokeStyle = 'rgba(30,30,28,0.6)'; ctx.lineWidth = 2.2;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * slab, 0); ctx.lineTo(i * slab, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * slab); ctx.lineTo(S, i * slab); ctx.stroke();
  }
  // cracks
  ctx.strokeStyle = 'rgba(30,30,28,0.35)'; ctx.lineWidth = 1;
  for (let i = 0; i < 16; i++) {
    let x = rng() * S, y = rng() * S;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 9; k++) { x += (rng() - 0.5) * 50; y += (rng() - 0.5) * 50; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // oil + tyre marks
  for (let i = 0; i < 26; i++) {
    const x = rng() * S, y = rng() * S, r = 6 + rng() * 34;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(20,20,22,${0.15 + rng() * 0.3})`); g.addColorStop(1, 'rgba(20,20,22,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 9; i++) {
    ctx.strokeStyle = `rgba(22,22,24,${0.06 + rng() * 0.1})`; ctx.lineWidth = 9 + rng() * 8;
    const y = rng() * S;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(S * 0.3, y + (rng() - 0.5) * 60, S * 0.6, y + (rng() - 0.5) * 60, S, y); ctx.stroke();
  }
  speckle(ctx, S, S, rng, 500, '230,230,225', 0.25, 1.4);
  // aggregate grain so the surface holds up at eye level
  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rng() - 0.5) * 34 + (rng() < 0.03 ? 26 : 0);
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return toTex(c);
}

export function quayFaceTex(seed) {
  // 40 m x 9 m of sea wall; waterline 5 m above the bottom of the image
  const W = 2048, H = 512;
  const [c, ctx] = mk(W, H);
  const rng = makeRng(seed);
  ctx.fillStyle = '#77756e'; ctx.fillRect(0, 0, W, H);
  const n = noises();
  multiply(ctx, W, H, n.blotch, 0.6, 2, 1);
  multiply(ctx, W, H, n.fine, 0.6, 0.5, 0.5);
  ctx.strokeStyle = 'rgba(20,20,20,0.4)'; ctx.lineWidth = 2;
  for (let x = 0; x < W; x += W / 8) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(0, 46); ctx.lineTo(W, 46); ctx.stroke();           // cope beam
  for (let i = 0; i < 160; i++) streak(ctx, rng() * W, 30 + rng() * 40, 40 + rng() * 200, 2 + rng() * 10, rng() < 0.3 ? '110,64,34' : '34,32,30', 0.1 + rng() * 0.3);
  const wl = H * (1 - 5 / 9);
  let g = ctx.createLinearGradient(0, wl - 90, 0, wl + 20);
  g.addColorStop(0, 'rgba(30,34,30,0)'); g.addColorStop(0.45, 'rgba(30,34,30,0.55)');
  g.addColorStop(0.75, 'rgba(46,62,34,0.85)'); g.addColorStop(1, 'rgba(22,30,24,0.95)');
  ctx.fillStyle = g; ctx.fillRect(0, wl - 90, W, 110);
  ctx.fillStyle = 'rgba(20,28,24,0.95)'; ctx.fillRect(0, wl + 20, W, H);
  for (let i = 0; i < 1400; i++) {                // barnacle band
    ctx.fillStyle = `rgba(${170 + rng() * 60},${170 + rng() * 60},${150 + rng() * 50},${0.2 + rng() * 0.5})`;
    ctx.fillRect(rng() * W, wl - 34 + rng() * 26, 1 + rng() * 3, 1 + rng() * 3);
  }
  return toTex(c);
}

export function hazardTex() {
  // 4 m x 4 m tile of dark apron with yellow diagonals + solid edge line
  const S = 512;
  const [c, ctx] = mk(S, S);
  ctx.fillStyle = '#3c3c3b'; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#d6a51c';
  for (let i = -2; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 256, S); ctx.lineTo(i * 256 + 256, 0); ctx.lineTo(i * 256 + 256 + 62, 0); ctx.lineTo(i * 256 + 62, S);
    ctx.fill();
  }
  const n = noises();
  multiply(ctx, S, S, n.mid, 0.8, 1, 1);
  multiply(ctx, S, S, n.fine, 0.6, 1, 1);
  const rng = makeRng(77);
  speckle(ctx, S, S, rng, 500, '50,50,48', 0.7, 3.5);     // worn paint
  return toTex(c);
}

export function markingTex(rgb = '232,232,224', seed = 5) {
  const S = 256;
  const [c, ctx] = mk(S, S);
  ctx.fillStyle = `rgb(${rgb})`; ctx.fillRect(0, 0, S, S);
  multiply(ctx, S, S, noises().fine, 0.7, 1, 1);
  speckle(ctx, S, S, makeRng(seed), 420, '110,110,106', 0.8, 4);
  return toTex(c);
}

// ======================================================================
// Buildings
// ======================================================================
export function claddingTex(seed, base = '#d9dad6') {
  const S = 512;                                     // 8 m tile, vertical ribs
  const [c, ctx] = mk(S, S);
  const rng = makeRng(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 16) {
    ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(x, 0, 3, S);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x + 3, 0, 2, S);
    ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.fillRect(x + 9, 0, 7, S);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, S / 2 - 1, S, 2);
  multiply(ctx, S, S, noises().mid, 0.45, 1, 1);
  for (let i = 0; i < 50; i++) streak(ctx, rng() * S, rng() * S * 0.6, 60 + rng() * 240, 2 + rng() * 9, rng() < 0.3 ? '124,74,40' : '50,48,44', 0.06 + rng() * 0.16);
  let g = ctx.createLinearGradient(0, S * 0.8, 0, S);
  g.addColorStop(0, 'rgba(60,54,44,0)'); g.addColorStop(1, 'rgba(60,54,44,0.3)');
  ctx.fillStyle = g; ctx.fillRect(0, S * 0.8, S, S * 0.2);
  return toTex(c);
}

export function roofTex(seed) {
  const S = 512;
  const [c, ctx] = mk(S, S);
  const rng = makeRng(seed);
  ctx.fillStyle = '#878d90'; ctx.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 12) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x, 0, 2, S);
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x + 2, 0, 2, S);
  }
  multiply(ctx, S, S, noises().mid, 0.22, 1, 1);
  for (let i = 0; i < 40; i++) streak(ctx, rng() * S, rng() * S, 50 + rng() * 200, 3 + rng() * 14, '116,70,40', 0.08 + rng() * 0.2);
  return toTex(c);
}

export function windowBandTex(seed, { wall = '#e4e4de', glass = '#16222c', cols = 4 } = {}) {
  // one storey: 12 m x 3 m
  const W = 512, H = 128;
  const [c, ctx] = mk(W, H);
  const rng = makeRng(seed);
  ctx.fillStyle = wall; ctx.fillRect(0, 0, W, H);
  multiply(ctx, W, H, noises().mid, 0.35, 1, 0.25);
  const cw = W / cols;
  for (let i = 0; i < cols; i++) {
    const x = i * cw + cw * 0.2, w = cw * 0.6, y = 34, h = 52;
    ctx.fillStyle = '#5a5f62'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#3c5466'); g.addColorStop(1, glass);
    ctx.fillStyle = rng() < 0.12 ? '#c9b98a' : g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y, w * 0.4, h);
    streak(ctx, x + rng() * w, y + h + 3, 20 + rng() * 22, 2 + rng() * 4, '96,64,40', 0.3);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, H - 4, W, 4);
  return toTex(c);
}

export function bridgeGlassTex() {
  const W = 512, H = 128;
  const [c, ctx] = mk(W, H);
  ctx.fillStyle = '#e6e6e0'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 26, 0, 96);
  g.addColorStop(0, '#31485a'); g.addColorStop(1, '#0f1920');
  ctx.fillStyle = g; ctx.fillRect(0, 26, W, 70);
  ctx.fillStyle = '#d8d8d2';
  for (let x = 0; x < W; x += 64) ctx.fillRect(x - 4, 22, 8, 78);
  multiply(ctx, W, H, noises().mid, 0.3, 1, 0.25);
  return toTex(c);
}

export function blockWallTex(seed) {
  const S = 512;                                     // 4 m tile, 0.4 x 0.2 m blocks
  const [c, ctx] = mk(S, S);
  const rng = makeRng(seed);
  ctx.fillStyle = '#cfc6b2'; ctx.fillRect(0, 0, S, S);
  const bw = S / 8, bh = S / 16;
  for (let j = 0; j < 16; j++) for (let i = -1; i < 8; i++) {
    const x = i * bw + (j % 2 ? bw / 2 : 0), y = j * bh;
    ctx.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '255,255,255'},${rng() * 0.1})`;
    ctx.fillRect(x, y, bw, bh);
    ctx.strokeStyle = 'rgba(60,56,50,0.55)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, bw, bh);
  }
  const n = noises();
  multiply(ctx, S, S, n.blotch, 0.7, 1, 1);
  multiply(ctx, S, S, n.fine, 0.6, 1, 1);
  for (let i = 0; i < 46; i++) streak(ctx, rng() * S, rng() * S * 0.5, 40 + rng() * 200, 3 + rng() * 14, rng() < 0.25 ? '60,80,44' : '56,52,46', 0.08 + rng() * 0.2);
  let g = ctx.createLinearGradient(0, S * 0.78, 0, S);
  g.addColorStop(0, 'rgba(70,66,52,0)'); g.addColorStop(1, 'rgba(60,62,44,0.5)');
  ctx.fillStyle = g; ctx.fillRect(0, S * 0.78, S, S * 0.22);
  return toTex(c);
}

export function rockTex(seed) {
  const S = 512;
  const [c, ctx] = mk(S, S);
  ctx.fillStyle = '#8a8780'; ctx.fillRect(0, 0, S, S);
  const n = noises();
  multiply(ctx, S, S, n.blotch, 0.9, 1, 1);
  multiply(ctx, S, S, n.mid, 0.8, 0.5, 0.5);
  multiply(ctx, S, S, n.fine, 0.8, 0.5, 0.5);
  speckle(ctx, S, S, makeRng(seed), 300, '220,220,210', 0.3, 3);
  return toTex(c);
}

export function landTex(seed) {
  const S = 1024;
  const [c, ctx] = mk(S, S);
  const rng = makeRng(seed);
  ctx.fillStyle = '#77796a'; ctx.fillRect(0, 0, S, S);
  const n = noises();
  multiply(ctx, S, S, n.blotch, 0.9, 2, 2);
  multiply(ctx, S, S, n.mid, 0.7, 1, 1);
  for (let i = 0; i < 240; i++) {
    const x = rng() * S, y = rng() * S, r = 10 + rng() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const col = rng() < 0.5 ? '70,86,54' : '132,124,104';
    g.addColorStop(0, `rgba(${col},${0.2 + rng() * 0.3})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTex(c);
}

export function chainLinkTex() {
  const S = 128;
  const [c, ctx] = mk(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(150,156,158,1)'; ctx.lineWidth = 3;
  for (let i = -S; i < S * 2; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + S, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i + S, 0); ctx.lineTo(i, S); ctx.stroke();
  }
  const t = toTex(c);
  return t;
}

// ======================================================================
// Signs, flags, one-off decals
// ======================================================================
export function signTex(lines, { bg = '#b2281f', fg = '#f1ede4', w = 512, h = 256, seed = 3 } = {}) {
  const [c, ctx] = mk(w, h);
  const rng = makeRng(seed);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = fg; ctx.lineWidth = 4; ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.fillStyle = fg; ctx.textBaseline = 'top';
  let y = 28;
  for (const [txt, size, weight] of lines) {
    ctx.font = `${weight || 700} ${size}px ${FONT}`;
    ctx.fillText(txt, 30, y);
    y += size * 1.2;
  }
  multiply(ctx, w, h, noises().mid, 0.5, 1, 0.5);
  for (let i = 0; i < 14; i++) streak(ctx, rng() * w, rng() * 30, 40 + rng() * 160, 2 + rng() * 6, '70,40,24', 0.15 + rng() * 0.2);
  return toTex(c, { repeat: false });
}

export function doorTex(seed) {
  const W = 256, H = 512;
  const [c, ctx] = mk(W, H);
  const rng = makeRng(seed);
  ctx.fillStyle = '#9a2c24'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, W - 16, H - 16);
  ctx.strokeRect(26, 30, W - 52, H / 2 - 50);
  ctx.strokeRect(26, H / 2 + 6, W - 52, H / 2 - 110);
  ctx.fillStyle = '#c9c7bd'; ctx.fillRect(40, H - 92, W - 80, 56);            // kick-plate vent
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = H - 88; y < H - 40; y += 8) ctx.fillRect(44, y, W - 88, 3);
  ctx.fillStyle = '#e7d35a'; ctx.fillRect(60, 210, 54, 48);                    // warning plate
  ctx.fillStyle = '#222'; ctx.font = `700 34px ${FONT}`; ctx.fillText('⚡', 72, 246);
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(W - 46, H / 2 - 6, 26, 9);
  multiply(ctx, W, H, noises().mid, 0.6, 0.5, 1);
  for (let i = 0; i < 20; i++) streak(ctx, rng() * W, rng() * H, 30 + rng() * 150, 2 + rng() * 6, '60,34,22', 0.12 + rng() * 0.25);
  speckle(ctx, W, H, rng, 160, '210,190,170', 0.4, 2.5);
  return toTex(c, { repeat: false });
}

export function cabinetTex(seed) {
  const W = 256, H = 512;
  const [c, ctx] = mk(W, H);
  const rng = makeRng(seed);
  ctx.fillStyle = '#2f6f6a'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 4; ctx.strokeRect(6, 6, W - 12, H - 12);
  ctx.fillStyle = '#ded9c8'; ctx.fillRect(40, 44, 120, 60);
  ctx.fillStyle = '#333'; ctx.font = `700 22px ${FONT}`; ctx.fillText(seed % 2 ? 'L1 L2 L3' : 'ON  OFF', 48, 82);
  for (const [x, col] of [[70, '#c6c2b4'], [128, '#c9a53a'], [186, '#b2322a']]) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, 250, 13, 0, 6.3); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.fillStyle = '#c9c7bd'; ctx.fillRect(34, 380, W - 68, 80);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  for (let y = 386; y < 456; y += 9) ctx.fillRect(38, y, W - 76, 4);
  multiply(ctx, W, H, noises().mid, 0.6, 0.5, 1);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(116,62,30,${0.3 + rng() * 0.5})`;
    ctx.beginPath(); ctx.ellipse(rng() < 0.5 ? rng() * 20 : W - rng() * 20, rng() * H, 3 + rng() * 9, 5 + rng() * 16, 0, 0, 6.3); ctx.fill();
  }
  for (let i = 0; i < 16; i++) streak(ctx, rng() * W, rng() * H, 30 + rng() * 120, 2 + rng() * 5, '100,56,28', 0.15 + rng() * 0.3);
  return toTex(c, { repeat: false });
}

export function flagTex(kind = 0) {
  const W = 256, H = 160;
  const [c, ctx] = mk(W, H);
  if (kind === 0) {             // invented house flag: navy field, white diamond, orange dot
    ctx.fillStyle = '#17324f'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ecebe4';
    ctx.beginPath(); ctx.moveTo(W / 2, 18); ctx.lineTo(W - 46, H / 2); ctx.lineTo(W / 2, H - 18); ctx.lineTo(46, H / 2); ctx.fill();
    ctx.fillStyle = '#d6622a'; ctx.beginPath(); ctx.arc(W / 2, H / 2, 22, 0, 6.3); ctx.fill();
  } else {                      // invented port-authority flag: teal / white / teal
    ctx.fillStyle = '#1f6d72'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ecebe4'; ctx.fillRect(0, H / 3, W, H / 3);
    ctx.fillStyle = '#c9a53a'; ctx.fillRect(0, H / 2 - 6, W, 12);
  }
  return toTex(c, { repeat: false });
}

export function labelTex(text, { w = 1024, h = 128, fg = '#17324f', bg = '#e9e8e2', size = 84, weight = 800, spacing = 8 } = {}) {
  const [c, ctx] = mk(w, h);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg; ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  try { ctx.letterSpacing = spacing + 'px'; } catch (e) { /* ignore */ }
  ctx.fillText(text, w / 2, h / 2 + 4);
  multiply(ctx, w, h, noises().mid, 0.45, 2, 0.5);
  const rng = makeRng(text.length * 7);
  for (let i = 0; i < 24; i++) streak(ctx, rng() * w, 0, 30 + rng() * 90, 2 + rng() * 7, '110,64,34', 0.12 + rng() * 0.2);
  return toTex(c, { repeat: false });
}

export function funnelTex() {
  const W = 256, H = 256;
  const [c, ctx] = mk(W, H);
  ctx.fillStyle = '#17324f'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#111417'; ctx.fillRect(0, 0, W, 44);
  ctx.fillStyle = '#ecebe4'; ctx.fillRect(0, 92, W, 70);
  ctx.fillStyle = '#d6622a'; ctx.beginPath(); ctx.arc(W / 2, 127, 24, 0, 6.3); ctx.fill();
  multiply(ctx, W, H, noises().mid, 0.5, 0.5, 0.5);
  const rng = makeRng(91);
  for (let i = 0; i < 18; i++) streak(ctx, rng() * W, 0, 40 + rng() * 120, 4 + rng() * 14, '14,14,14', 0.2 + rng() * 0.25);
  return toTex(c, { repeat: false });
}

export function lighthouseTex() {
  const W = 64, H = 256;
  const [c, ctx] = mk(W, H);
  for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#e8e6de' : '#b0302a'; ctx.fillRect(0, i * H / 4, W, H / 4); }
  multiply(ctx, W, H, noises().mid, 0.5, 0.25, 0.5);
  const rng = makeRng(8);
  for (let i = 0; i < 20; i++) streak(ctx, rng() * W, rng() * H, 20 + rng() * 80, 2 + rng() * 5, '70,50,40', 0.15 + rng() * 0.2);
  return toTex(c, { repeat: false });
}

export function sternTex({ B, T, D, sheer, shipName, home, color = '#1d262e', redTop = 1.7, seed = 4 }) {
  const W = 1024, H = 512;
  const [c, ctx] = mk(W, H);
  const rng = makeRng(seed);
  const Htot = T + D + sheer;
  const py = (y) => H - ((y + T) / Htot) * H;
  const pxm = W / B, pym = H / Htot;
  ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#6f2a22'; ctx.fillRect(0, py(redTop), W, H);
  ctx.fillStyle = '#12161a'; ctx.fillRect(0, py(redTop) - 5, W, 5);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
  for (let y = 0; y < H; y += 2.6 * pym) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  for (let x = 0; x < W; x += 5 * pxm) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  const text = (str, yWorld, hWorld, weight, sp) => {
    ctx.save(); ctx.translate(W / 2, py(yWorld)); ctx.scale(pxm / pym, 1);
    ctx.font = `${weight} ${hWorld * pym * 1.38}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    try { ctx.letterSpacing = sp + 'px'; } catch (e) { /* ignore */ }
    ctx.fillStyle = 'rgba(232,232,226,0.95)'; ctx.fillText(str, 0, 0); ctx.restore();
  };
  text(shipName, D * 0.72, 1.5, 700, 8);
  text(home, D * 0.52, 1.0, 600, 10);
  multiply(ctx, W, H, noises().mid, 0.6, 1, 1);
  for (let i = 0; i < 40; i++) streak(ctx, rng() * W, py(D) + rng() * 10, (3 + rng() * 9) * pym, 2 + rng() * 6, '120,62,30', 0.3 + rng() * 0.35);
  const g = ctx.createLinearGradient(0, py(1.3), 0, py(-0.6));
  g.addColorStop(0, 'rgba(190,196,190,0)'); g.addColorStop(0.55, 'rgba(176,184,176,0.28)'); g.addColorStop(1, 'rgba(40,52,36,0.75)');
  ctx.fillStyle = g; ctx.fillRect(0, py(1.3), W, py(-0.6) - py(1.3));
  return toTex(c, { repeat: false });
}

export function concreteTex(seed) {
  const S = 512;
  const [c, ctx] = mk(S, S);
  const rng = makeRng(seed);
  ctx.fillStyle = '#b3b0a6'; ctx.fillRect(0, 0, S, S);
  const n = noises();
  multiply(ctx, S, S, n.mid, 0.4, 1, 1);
  multiply(ctx, S, S, n.fine, 0.4, 1, 1);
  for (let i = 0; i < 30; i++) streak(ctx, rng() * S, rng() * S, 30 + rng() * 160, 2 + rng() * 10, '50,48,44', 0.05 + rng() * 0.12);
  speckle(ctx, S, S, rng, 300, '70,70,66', 0.3, 1.6);
  return toTex(c);
}
