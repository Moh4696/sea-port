import * as THREE from 'three';

const vert = /* glsl */`
uniform mat4 textureMatrix;
varying vec3 vWorld;
varying vec4 vMirror;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vMirror = textureMatrix * wp;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const frag = /* glsl */`
precision highp float;
uniform sampler2D mirror;
uniform float time;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float sunPower;
uniform vec3 horizon;
uniform vec3 zenith;
uniform vec3 deepColor;
uniform vec3 scatterColor;
uniform float fogDensity;
uniform vec4 wakes[3];        // xz = position, z = heading, w = strength
varying vec3 vWorld;
varying vec4 vMirror;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.07 + vec2(11.3, 5.1); a *= 0.5; }
  return s;
}

// Sum of travelling waves. Returns the surface gradient (dh/dx, dh/dz).
vec2 waveGrad(vec2 p, float px, float gust) {
  vec2 grad = vec2(0.0);
  float lam = 38.0;
  float amp = 0.15;
  vec2 wind = normalize(vec2(-0.35, -1.0));
  for (int i = 0; i < 18; i++) {
    float fi = float(i);
    float ang = fi * 2.39996 + sin(fi * 1.7) * 0.6;
    vec2 dir = normalize(mix(vec2(cos(ang), sin(ang)), wind, 0.22 + 0.2 * sin(fi * 3.1)));
    float k = 6.28318 / lam;
    float w = sqrt(9.81 * k);
    // bend each wave train a little so crests never line up into a grid
    vec2 q = p + 0.35 * lam * vec2(noise(p / (lam * 3.1) + fi), noise(p / (lam * 3.1) - fi * 1.7));
    float ph = dot(dir, q) * k + w * time + fi * 1.31;
    float fade = 1.0 - smoothstep(0.1, 0.42, px / lam);
    float g = fi > 6.0 ? gust : 1.0;
    // sharpened crest: derivative of (0.5+0.5 sin)^1.6-ish, cheap approximation
    float c = cos(ph);
    float s = sin(ph);
    grad += dir * (amp * k * c * (1.0 + 0.35 * s)) * fade * g;
    lam *= 0.74;
    amp *= 0.765;
  }
  return grad;
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float px = sqrt(length(dFdx(vWorld.xz)) * length(dFdy(vWorld.xz)));

  // gust patches: ruffled vs glassy areas, drifting slowly
  float gust = 0.35 + 1.25 * smoothstep(0.3, 0.75, fbm(vWorld.xz * 0.006 + vec2(time * 0.01, 0.0)));

  vec2 grad = waveGrad(vWorld.xz, px, gust);

  // boat wakes: a V of ripples and a churned core behind each hull
  float foam = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 wk = wakes[i];
    if (wk.w <= 0.0) continue;
    vec2 rel = vWorld.xz - wk.xy;
    float cs = cos(wk.z), sn = sin(wk.z);
    // local frame: x = astern distance, y = lateral
    float ax = -(rel.x * sn + rel.y * cs);
    float ay = rel.x * cs - rel.y * sn;
    if (ax > -22.0 && ax < 260.0) {
      float arm = abs(ay) - (2.0 + ax * 0.34);
      float fall = exp(-max(ax, 0.0) * 0.011) * smoothstep(-22.0, -6.0, ax);
      float ripple = sin(arm * 1.7 - time * 1.2) * exp(-arm * arm * 0.035);
      grad += vec2(-cs, sn) * sign(ay) * ripple * 0.22 * fall * wk.w;
      float core = exp(-ay * ay / (9.0 + max(ax, 0.0) * 0.7)) * exp(-max(ax, 0.0) * 0.035) * smoothstep(-14.0, 2.0, ax);
      float fn = fbm(vWorld.xz * 0.9 + vec2(time * 0.2));
      foam += smoothstep(0.42, 0.75, core * (0.55 + fn)) * wk.w;
      foam += smoothstep(0.75, 1.0, exp(-arm * arm * 0.22) * fall * (0.4 + fn)) * 0.6 * wk.w;
      grad += (vec2(noise(vWorld.xz * 1.3 + time), noise(vWorld.xz * 1.3 - time)) - 0.5) * core * 0.5 * wk.w;
    }
  }
  foam = clamp(foam, 0.0, 1.0);

  vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));

  // fresnel with a floor so distant water still reads as sky
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  fres = clamp(fres, 0.0, 1.0);

  // planar reflection, pushed around by the surface normal
  vec2 distort = N.xz * (0.02 + 9.0 / (dist + 30.0));
  vec3 refl = texture2DProj(mirror, vec4(vMirror.xy + distort * vMirror.w, vMirror.zw)).rgb;
  refl = min(refl, vec3(6.0));

  // water body: deep absorption + sunlit forward scatter on wave faces
  float facing = max(dot(N, sunDir), 0.0);
  vec3 body = deepColor + scatterColor * (0.2 + 0.5 * facing) * sunPower * 0.26;
  body += scatterColor * 0.35 * pow(max(dot(V, -sunDir) * 0.5 + 0.5, 0.0), 3.0) * clamp(length(grad) * 3.0, 0.0, 1.0);

  vec3 col = mix(body, refl, fres);

  // sun glitter: roughness grows with distance as waves fall below a pixel
  vec3 R = reflect(-V, N);
  float sp = max(dot(R, sunDir), 0.0);
  float shin = mix(1400.0, 300.0, smoothstep(40.0, 1500.0, dist));
  float glint = pow(sp, shin) * mix(26.0, 6.0, smoothstep(40.0, 1500.0, dist));
  // unresolved wavelets: a broad statistical lobe broken into sparkles at pixel scale
  float l = log2(max(px, 0.02) * 2.5);
  float l0 = floor(l);
  vec2 r1 = vec2(vWorld.x * 0.8 - vWorld.z * 0.6, vWorld.x * 0.6 + vWorld.z * 0.8);
  vec2 r2 = vec2(vWorld.x * 0.33 + vWorld.z * 0.94, -vWorld.x * 0.94 + vWorld.z * 0.33);
  float e0 = exp2(l0), e1 = exp2(l0 + 1.0);
  float s0 = noise(r1 / e0 + time * 0.9) * noise(r2 / e0 * 1.63 - time * 0.7);
  float s1 = noise(r1 / e1 + time * 0.9) * noise(r2 / e1 * 1.63 - time * 0.7);
  float sparkle = smoothstep(0.26, 0.6, mix(s0, s1, l - l0));
  glint += pow(sp, 34.0) * (0.3 + 5.5 * sparkle) * gust;
  col += sunColor * sunPower * glint;

  // foam is diffuse white, lit by sun + sky
  vec3 foamCol = vec3(0.86) * (sunColor * sunPower * 0.32 * max(sunDir.y, 0.15) + zenith * 0.5 + 0.2);
  col = mix(col, foamCol, foam * 0.85);

  float f = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
  col = mix(col, horizon, f);

  gl_FragColor = vec4(col, 1.0);
}`;

export class Water {
  constructor(renderer, sky) {
    this.renderer = renderer;
    this.sky = sky;
    this.scale = 0.5;
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 2 });
    this.target.texture.generateMipmaps = false;
    this.mirrorCam = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
    this.uniforms = {
      mirror: { value: this.target.texture },
      textureMatrix: { value: this.textureMatrix },
      time: { value: 0 },
      sunDir: sky.uniforms.sunDir,
      sunColor: sky.uniforms.sunColor,
      horizon: sky.uniforms.horizon,
      zenith: sky.uniforms.zenith,
      sunPower: { value: 3 },
      deepColor: { value: new THREE.Color().setRGB(0.008, 0.05, 0.062) },
      scatterColor: { value: new THREE.Color().setRGB(0.03, 0.2, 0.2) },
      fogDensity: { value: 0.00028 },
      wakes: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    };
    const geo = new THREE.PlaneGeometry(26000, 26000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, fog: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.hidden = [];        // extra objects to hide in the mirror pass

    this._plane = new THREE.Plane();
    this._normal = new THREE.Vector3(0, 1, 0);
    this._camPos = new THREE.Vector3();
    this._rot = new THREE.Matrix4();
    this._look = new THREE.Vector3();
    this._view = new THREE.Vector3();
    this._tgt = new THREE.Vector3();
    this._clip = new THREE.Vector4();
    this._q = new THREE.Vector4();
  }

  setSize(w, h) {
    this.target.setSize(Math.max(2, Math.floor(w * this.scale)), Math.max(2, Math.floor(h * this.scale)));
  }

  /** Render the mirrored scene. Same maths as three's Reflector, for the plane y = 0. */
  renderMirror(scene, camera) {
    const n = this._normal;
    this._camPos.setFromMatrixPosition(camera.matrixWorld);
    if (this._camPos.y <= 0.01) return;
    const vc = this.mirrorCam;
    this._view.copy(this._camPos).negate().reflect(n).negate();          // mirrored eye
    this._rot.extractRotation(camera.matrixWorld);
    this._look.set(0, 0, -1).applyMatrix4(this._rot).add(this._camPos);
    this._tgt.copy(this._look).negate().reflect(n).negate();
    vc.position.copy(this._view);
    vc.up.set(0, 1, 0).applyMatrix4(this._rot).reflect(n);
    vc.lookAt(this._tgt);
    vc.near = camera.near; vc.far = camera.far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    vc.projectionMatrixInverse.copy(camera.projectionMatrixInverse);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);

    // oblique near plane so nothing below the surface leaks into the reflection
    this._plane.setFromNormalAndCoplanarPoint(n, new THREE.Vector3(0, 0.02, 0));
    this._plane.applyMatrix4(vc.matrixWorldInverse);
    const cp = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = vc.projectionMatrix;
    const q = this._q;
    q.x = (Math.sign(cp.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(cp.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    cp.multiplyScalar(2.0 / cp.dot(q));
    pm.elements[2] = cp.x; pm.elements[6] = cp.y; pm.elements[10] = cp.z + 1.0; pm.elements[14] = cp.w;

    const r = this.renderer;
    const vis = this.hidden.map((o) => o.visible);
    this.mesh.visible = false;
    this.hidden.forEach((o) => { o.visible = false; });
    const disk = this.sky.uniforms.sunDisk.value;
    this.sky.uniforms.sunDisk.value = 0;
    const prevRT = r.getRenderTarget();
    const prevAuto = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.target);
    r.clear();
    r.render(scene, vc);
    r.setRenderTarget(prevRT);
    r.shadowMap.autoUpdate = prevAuto;
    this.sky.uniforms.sunDisk.value = disk;
    this.mesh.visible = true;
    this.hidden.forEach((o, i) => { o.visible = vis[i]; });
  }
}
