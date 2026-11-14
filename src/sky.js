import * as THREE from 'three';
import { smooth } from './util.js';

const vert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
}`;

const frag = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 zenith;
uniform vec3 horizon;
uniform float time;
uniform float cover;
uniform float sunDisk;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.1, 3.7); a *= 0.5; }
  return s;
}
float cloudField(vec2 uv) {
  vec2 w = vec2(fbm(uv * 0.55 + 3.1), fbm(uv * 0.55 + 9.7));
  return fbm(uv + 0.9 * w);
}

void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  float sd = max(dot(d, sunDir), 0.0);

  vec3 col = mix(horizon, zenith, 1.0 - exp(-h * 3.4));
  // forward scattering around the sun
  col += sunColor * (0.07 * pow(sd, 6.0) + 0.2 * pow(sd, 48.0) + 0.7 * pow(sd, 500.0));
  col += sunColor * sunDisk * smoothstep(0.99962, 0.99985, sd) * 60.0;

  if (d.y > 0.0) {
    vec2 plane = d.xz / (d.y + 0.07);
    vec2 uv = plane * 0.9 + vec2(time * 0.007, time * 0.0025);
    float n = cloudField(uv);
    float dens = smoothstep(cover, cover + 0.13, n);
    if (dens > 0.001) {
      vec2 sunPlane = sunDir.xz / (sunDir.y + 0.07) * 0.9;
      vec2 toSun = sunPlane - plane * 0.9;
      vec2 ld = toSun / (length(toSun) + 0.001);
      float n2 = cloudField(uv + ld * 0.09);
      float lit = clamp(0.55 + (n - n2) * 5.5, 0.0, 1.0);
      float core = smoothstep(cover + 0.06, cover + 0.34, n);
      vec3 shadowCol = mix(vec3(0.44, 0.50, 0.60), horizon, 0.25) * (0.55 + 0.45 * sunColor);
      vec3 litCol = mix(vec3(1.0), sunColor, 0.5) * 1.32;
      vec3 cc = mix(shadowCol, litCol, lit * (1.0 - core * 0.6));
      cc += sunColor * pow(sd, 12.0) * 0.6 * (1.0 - core);            // silver lining
      float fade = smoothstep(0.0, 0.16, d.y);
      col = mix(col, cc, dens * fade * 0.96);
    }
    // thin high cirrus
    vec2 cu = plane * vec2(0.16, 0.5) + vec2(time * 0.002, 4.0);
    float ci = smoothstep(0.52, 0.85, fbm(cu * 2.3)) * smoothstep(0.05, 0.4, d.y) * 0.22;
    col = mix(col, vec3(1.0) * (0.9 + 0.3 * sunColor), ci);
  }
  // sea-level haze band
  float haze = exp(-max(d.y, 0.0) * 17.0);
  col = mix(col, horizon * (1.0 + 0.3 * pow(sd, 3.0)), haze * 0.9);
  if (d.y < 0.0) col = mix(col, horizon * 0.82, smoothstep(0.0, -0.25, d.y));

  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor(renderer) {
    this.renderer = renderer;
    this.uniforms = {
      sunDir: { value: new THREE.Vector3() },
      sunColor: { value: new THREE.Color() },
      zenith: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      time: { value: 0 },
      cover: { value: 0.475 },
      sunDisk: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(11000, 48, 24), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.envScene = new THREE.Scene();
    this.envMesh = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat);
    this.envScene.add(this.envMesh);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.sunIntensity = 3;
    this.ambient = 1;
  }

  /** elevation in degrees; azimuth fixed so the sun sits out to sea. */
  setSun(elevDeg) {
    const el = THREE.MathUtils.degToRad(elevDeg);
    const az = THREE.MathUtils.degToRad(24);
    this.uniforms.sunDir.value.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    const t = smooth((elevDeg - 4) / 30);
    this.uniforms.sunColor.value.setRGB(1.0, 0.56 + 0.40 * t, 0.26 + 0.64 * t);
    this.uniforms.zenith.value.setRGB(0.15 - 0.07 * t, 0.22 + 0.04 * t, 0.42 + 0.17 * t);
    this.uniforms.horizon.value.setRGB(0.84 - 0.3 * t, 0.6 + 0.09 * t, 0.44 + 0.38 * t);
    this.sunIntensity = 2.0 + 1.5 * t;
    this.ambient = 0.55 + 0.45 * t;
    this.t = t;
  }

  updateEnv(scene) {
    const disk = this.uniforms.sunDisk.value;
    this.uniforms.sunDisk.value = 0;            // the directional light already supplies the sun
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 200);
    this.uniforms.sunDisk.value = disk;
    scene.environment = this.envRT.texture;
    if (old) old.dispose();
  }
}
