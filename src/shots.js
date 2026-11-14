import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { smooth, lerp } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Shots {
  constructor(world) {
    this.world = world;
    this.cam = world.camera;
    this.controls = new OrbitControls(this.cam, world.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.5;
    this.controls.maxDistance = 1800;
    this.controls.minDistance = 4;
    this.controls.maxPolarAngle = Math.PI * 0.497;
    this.controls.enabled = false;
    this.fade = document.getElementById('fade');
    this.pos = V(0, 0, 0); this.tgt = V(0, 0, 0);
    const Y = world.QUAY_Y;
    const tug = () => world.tug.position;

    // each shot: p(t, k) fills position + target; k runs 0..1 over the shot
    this.list = [
      { name: 'Harbour approach', fov: 34, dur: 11, f: (t, k, p, q) => {
        const tp = tug();
        p.set(tp.x + 44 - k * 8, 5.4 + k * 1.0, tp.z + 64);
        q.set(lerp(tp.x, 0, 0.5), 12, lerp(tp.z, 22, 0.6));
      } },
      { name: 'Quayside', fov: 40, dur: 10, f: (t, k, p, q) => {
        p.set(-212 + k * 10, Y + 1.72, -1.9);
        q.set(-60, Y + 5.5, 40);
      } },
      { name: 'Crane deck', fov: 44, dur: 11, f: (t, k, p, q) => {
        const cx = world.cranes[2].x;
        p.set(cx + 34 - k * 7, Y + 55 + k * 3, -30 + k * 6);
        q.set(cx - 14, 20, 26);
      } },
      { name: 'Over the terminal', fov: 36, dur: 13, f: (t, k, p, q) => {
        const a = -0.62 + k * 0.42;
        p.set(30 + Math.sin(a) * 430, 150 - k * 20, -30 - Math.cos(a) * 430);
        q.set(30, 8, 60);
      } },
      { name: 'Open water', fov: 52, dur: 11, f: (t, k, p, q) => {
        p.set(120 + k * 26, 4.6, 205 + k * 8);
        q.set(360, 74, 1000);
      } },
      { name: 'Substation T2-04', fov: 42, dur: 9, f: (t, k, p, q) => {
        p.set(-391.5 + k * 1.6, Y + 1.66, -41.2 + k * 0.5);
        q.set(-399.4, Y + 1.75, -51);
      } },
      { name: 'Under the booms', fov: 30, dur: 11, f: (t, k, p, q) => {
        const cx = world.cranes[1].x;
        p.set(cx - 118 + k * 16, Y + 2.2, -20.5);
        q.set(cx + 20, Y + 22, -6);
      } },
    ];
    this.index = 0;
    this.start = 0;
    this.mode = 'auto';
    this.cutAt = -1;
    this.pending = null;
    this._buildHud();
    const qs = new URLSearchParams(location.search);
    if (qs.has('shot')) { this.index = Math.max(0, Math.min(this.list.length - 1, Number(qs.get('shot')) - 1)); this.hold = qs.has('hold'); }
    if (qs.has('k')) this.fixedK = Number(qs.get('k'));
    this._label();
  }

  _buildHud() {
    const wrap = document.getElementById('shots');
    this.chips = this.list.map((s, i) => {
      const b = document.createElement('button');
      b.textContent = String(i + 1).padStart(2, '0');
      b.title = s.name;
      b.setAttribute('aria-label', `Shot ${i + 1}: ${s.name}`);
      b.addEventListener('click', () => this.go(i));
      wrap.appendChild(b);
      return b;
    });
    this.freeBtn = document.getElementById('free');
    this.freeBtn.addEventListener('click', () => (this.mode === 'free' ? this.go(this.index) : this.free()));
    window.addEventListener('keydown', (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= this.list.length) this.go(n - 1);
      if (e.key === 'f' || e.key === 'F') this.free();
    });
  }

  _label() {
    document.getElementById('shotno').textContent = this.mode === 'free' ? '··' : String(this.index + 1).padStart(2, '0');
    document.getElementById('shotlabel').textContent = this.mode === 'free' ? 'Free camera' : this.list[this.index].name;
    this.chips.forEach((c, i) => c.classList.toggle('on', this.mode !== 'free' && i === this.index));
    this.freeBtn.classList.toggle('on', this.mode === 'free');
  }

  /** Deterministic pose for offline capture: shot index, progress 0..1, scene time. */
  pose(i, k, time) {
    const s = this.list[i];
    s.f(time, k, this.pos, this.tgt);
    this.cam.position.copy(this.pos);
    this.cam.position.x += Math.sin(time * 0.31) * 0.05;
    this.cam.position.y += Math.sin(time * 0.43 + 1.3) * 0.04;
    this.cam.lookAt(this.tgt);
    if (this.cam.fov !== s.fov) { this.cam.fov = s.fov; this.cam.updateProjectionMatrix(); }
  }

  go(i) { this.pending = { index: i, mode: 'auto' }; }
  free() { this.pending = { mode: 'free' }; }

  update(time, dt) {
    if (this.start === 0 && this.first === undefined) { this.first = true; this.start = time; }
    const shot = this.list[this.index];
    let k = (time - this.start) / shot.dur;
    // queue a cut at the end of the shot
    if (this.mode === 'auto' && !this.hold && k >= 1 && !this.pending) this.pending = { index: (this.index + 1) % this.list.length, mode: 'auto' };
    // dip to black, swap, come back
    if (this.pending && this.cutAt < 0) this.cutAt = time;
    let fade = 0;
    if (this.cutAt >= 0) {
      const c = (time - this.cutAt) / 0.32;
      if (c >= 1 && this.pending) {
        const p = this.pending; this.pending = null;
        if (p.mode === 'free') {
          this.mode = 'free';
          this.controls.enabled = true;
          this.cam.position.set(175, 36, 205);
          this.controls.target.set(0, 14, 10);
          this.cam.fov = 38; this.cam.updateProjectionMatrix();
        } else {
          this.mode = 'auto';
          this.controls.enabled = false;
          this.index = p.index; this.start = time;
        }
        this._label();
      }
      fade = c < 1 ? c : Math.max(0, 2 - c);
      if (c >= 2) this.cutAt = -1;
    }
    this.fade.style.opacity = String(smooth(fade));

    if (this.mode === 'free') {
      this.controls.update();
      if (this.cam.position.y < 1.6) this.cam.position.y = 1.6;
      return;
    }
    const s = this.list[this.index];
    k = Math.min(1.15, (time - this.start) / s.dur);
    if (this.fixedK !== undefined) k = this.fixedK;
    s.f(time, k, this.pos, this.tgt);
    this.cam.position.copy(this.pos);
    // gentle handheld drift so locked-off frames still breathe
    this.cam.position.x += Math.sin(time * 0.31) * 0.05;
    this.cam.position.y += Math.sin(time * 0.43 + 1.3) * 0.04;
    this.cam.lookAt(this.tgt);
    if (this.cam.fov !== s.fov) { this.cam.fov = s.fov; this.cam.updateProjectionMatrix(); }
  }
}
