import * as THREE from 'three';
import { containerTex, containerLogoTex, CONTAINER_SIDE_U } from './tex.js';

export const CL = 12.19, CH = 2.59, CW = 2.44;   // 40 ft standard box

// Invented shipping lines.
const BRANDS = [
  { name: 'KORVA', size: 86, weight: 900 },
  { name: 'NORDLINE', size: 66, italic: true, weight: 800, sub: 'CONTAINER SERVICE' },
  { name: 'SEALINK', size: 70, weight: 700, align: 'center', y: 110 },
  null,
  { name: 'HALDEN', size: 78, weight: 800, bar: true, align: 'left', y: 104 },
];

// colour, brand, weight
export const PALETTE = [
  [0x2c6aa0, 0, 16], [0x8d2e26, 2, 16], [0x65221e, 3, 9], [0x2c6646, 1, 12],
  [0xc45f26, 4, 10], [0x858a8e, 0, 8], [0xcfcdc3, 1, 8], [0x1d3252, 4, 10],
  [0x27777a, 2, 8], [0x6a4932, 3, 5], [0xc59d2a, 3, 3], [0x3f8fb8, 0, 5],
];
const TOTAL_W = PALETTE.reduce((s, p) => s + p[2], 0);

export function pickColor(rng) {
  let r = rng() * TOTAL_W;
  for (let i = 0; i < PALETTE.length; i++) { r -= PALETTE[i][2]; if (r <= 0) return i; }
  return 0;
}

function containerGeo() {
  const g = new THREE.BoxGeometry(CL, CH, CW);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    uv.setX(i, i < 8 ? CONTAINER_SIDE_U + u * (1 - CONTAINER_SIDE_U) : u * CONTAINER_SIDE_U);
  }
  return g;
}

function patchLogo(mat, logo) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.logoMap = { value: logo };
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform sampler2D logoMap;\nvoid main() {')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float lm = texture2D(logoMap, vMapUv).r;
        float lum = dot(diffuseColor.rgb, vec3(0.3333));
        vec3 ink = lum > 0.42 ? vec3(0.06, 0.1, 0.2) : vec3(0.84, 0.84, 0.8);
        diffuseColor.rgb = mix(diffuseColor.rgb, ink, lm * 0.9);`);
  };
}

export class Containers {
  constructor() {
    this.geo = containerGeo();
    this.maps = BRANDS.map((b, i) => containerTex(100 + i * 7));
    this.logos = BRANDS.map((b, i) => containerLogoTex(b, 500 + i * 13));
    this.items = BRANDS.map(() => []);
    this._c = new THREE.Color();
    this._hsl = {};
  }

  material(brand, color = 0xffffff) {
    const m = new THREE.MeshStandardMaterial({ map: this.maps[brand], roughness: 0.58, metalness: 0.0, color });
    patchLogo(m, this.logos[brand]);
    return m;
  }

  /** queue a static container (world space, centre position) */
  add(x, y, z, rotY, colorIdx, rng) {
    const [hex, brand] = PALETTE[colorIdx];
    const c = this._c.setHex(hex);
    c.getHSL(this._hsl);
    // sun-fade and batch variation: every box is a slightly different age
    const fade = rng();
    c.setHSL(this._hsl.h + (rng() - 0.5) * 0.012, this._hsl.s * (0.72 + 0.28 * (1 - fade * fade)), this._hsl.l * (0.9 + rng() * 0.2) + fade * 0.035);
    this.items[brand].push({ x: x + (rng() - 0.5) * 0.05, y, z: z + (rng() - 0.5) * 0.05, r: rotY + (rng() - 0.5) * 0.006, c: c.getHex() });
  }

  /** a free-standing container mesh for things that move */
  single(colorIdx) {
    const [hex, brand] = PALETTE[colorIdx];
    const m = new THREE.Mesh(this.geo, this.material(brand, hex));
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  build(parent) {
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    let total = 0;
    this.items.forEach((list, b) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(this.geo, this.material(b), list.length);
      list.forEach((it, i) => {
        d.position.set(it.x, it.y, it.z);
        d.rotation.set(0, it.r, 0);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
        mesh.setColorAt(i, col.setHex(it.c));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      parent.add(mesh);
      total += list.length;
    });
    return total;
  }
}
