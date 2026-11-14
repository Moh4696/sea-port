import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- seeded random ----------
export function makeRng(seed) {
  let a = seed >>> 0;
  const r = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  return r;
}

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// ---------- geometry helpers ----------
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _dir = new THREE.Vector3();

/** Box of cross-section w (local x) by h (local y) running from a to b. */
export function beamGeo(a, b, w, h, up = null) {
  _dir.subVectors(b, a);
  const len = _dir.length();
  const g = new THREE.BoxGeometry(w, h, len);
  _dir.normalize();
  if (up) _up.copy(up); else _up.set(0, 1, 0);
  if (Math.abs(_dir.dot(_up)) > 0.999) _up.set(1, 0, 0);
  _m.lookAt(a, b, _up);
  _q.setFromRotationMatrix(_m);
  _mid.addVectors(a, b).multiplyScalar(0.5);
  _m.compose(_mid, _q, _s);
  g.applyMatrix4(_m);
  return g;
}

/** Cylinder running from a to b. */
export function rodGeo(a, b, r, seg = 8) {
  _dir.subVectors(b, a);
  const len = _dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _dir.normalize());
  _mid.addVectors(a, b).multiplyScalar(0.5);
  _m.compose(_mid, _q, _s);
  g.applyMatrix4(_m);
  return g;
}

export function boxGeo(w, h, d, x = 0, y = 0, z = 0, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

export function cylGeo(rTop, rBot, h, x = 0, y = 0, z = 0, seg = 16, axis = 'y') {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

export const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Scale the uv attribute so a texture tiles in world units. */
export function scaleUV(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

/** Box whose uvs tile at `tile` metres per texture repeat on every face. */
export function tiledBox(w, h, d, x, y, z, tile = 4) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const tu = Array.isArray(tile) ? tile[0] : tile;
  const tv = Array.isArray(tile) ? tile[1] : tile;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z ; 4 verts each
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] / tu, uv.getY(k) * dims[f][1] / tv);
    }
  }
  g.translate(x, y, z);
  return g;
}

// ---------- static batching ----------
export class Batch {
  constructor() { this.groups = new Map(); }
  add(material, geo, matrix = null) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (matrix) g.applyMatrix4(matrix);
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!this.groups.has(material)) this.groups.set(material, []);
    this.groups.get(material).push(g);
    return this;
  }
  build(parent, { cast = true, receive = true } = {}) {
    const out = [];
    for (const [mat, geos] of this.groups) {
      if (!geos.length) continue;
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      parent.add(mesh);
      out.push(mesh);
    }
    this.groups.clear();
    return out;
  }
}
