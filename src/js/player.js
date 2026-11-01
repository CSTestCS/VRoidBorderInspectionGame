// First-person controller and held tools.
import * as THREE from 'three';
import { GLOBAL_UNIFORMS } from './vrm/materials.js';
import { audio } from './audio.js';
import { damp, clamp } from './util.js';

export const TOOLS = [
  { id: 'hand', key: '1', label: 'Hands' },
  { id: 'flashlight', key: '2', label: 'Flashlight' },
  { id: 'uv', key: '3', label: 'UV Lamp' },
  { id: 'geiger', key: '4', label: 'Geiger Counter' },
  { id: 'hose', key: '5', label: 'Hose' },
];

function geigerScreen() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return { c, g: c.getContext('2d'), t };
}

export class Player {
  constructor(engine, world) {
    this.engine = engine;
    this.world = world;
    this.camera = engine.camera;
    this.pos = new THREE.Vector3(0, 0, 2.2);
    this.vel = new THREE.Vector3();
    this.yaw = 0; // facing -z
    this.pitch = -0.05;
    this.eye = 1.66;
    this.crouch = 0;
    this.keys = {};
    this.mouse = { left: false, right: false };
    this.enabled = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.tool = 'hand';
    this.hasHose = false;
    this.carrying = null;
    this.stepDist = 0;
    this.zoom = 0;
    this.radiationFn = () => 0;
    this.geigerReading = 0;
    this.geigerAcc = 0;
    this.extraColliders = () => [];
    this.onSpray = null;
    this.aimDistanceFn = null; // distance along the view ray to whatever the reticle is on
    this.toolGroup = new THREE.Group();
    this.camera.add(this.toolGroup);
    this._buildTools();
    this._bind();
  }

  _bind() {
    const dom = this.engine.renderer.domElement;
    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.mouse.left = this.mouse.right = false; });
    dom.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this._ignoreMoves = 3; });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement !== dom) return;
      // browsers sometimes report a bogus huge delta (on lock, focus changes, or
      // OS cursor warps); drop those so the view never jumps
      if (this._ignoreMoves > 0) { this._ignoreMoves--; return; }
      let mx = e.movementX, my = e.movementY;
      if (Math.abs(mx) > 250 || Math.abs(my) > 250) return;
      const s = 0.0022 * this.sensitivity * (1 - this.zoom * 0.6);
      this.yaw -= mx * s;
      this.pitch -= my * s * (this.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.45, 1.45);
    });
  }

  lock() {
    const d = this.engine.renderer.domElement;
    if (document.pointerLockElement === d || !d.requestPointerLock) return;
    // raw input (no OS acceleration) avoids sudden speed-ups; fall back if unsupported
    let p;
    try { p = d.requestPointerLock({ unadjustedMovement: true }); } catch { p = null; }
    if (p && p.catch) p.catch(() => { try { d.requestPointerLock()?.catch?.(() => {}); } catch {} });
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  get locked() { return document.pointerLockElement === this.engine.renderer.domElement; }

  _buildTools() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.7, roughness: 0.4 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.5 });
    const T = {};
    // flashlight
    const fl = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.18, 16), metal); body.rotation.x = Math.PI / 2; fl.add(body);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.02, 0.04, 16), metal); head.rotation.x = Math.PI / 2; head.position.z = -0.1; fl.add(head);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 16), new THREE.MeshStandardMaterial({ emissive: 0xfff6e0, emissiveIntensity: 2 })); lens.position.z = -0.121; lens.rotation.y = Math.PI; fl.add(lens);
    T.flashlight = fl;
    this.flashLight = new THREE.SpotLight(0xfff2dd, 0, 9, 0.42, 0.45, 1.5);
    this.flashLight.position.set(0.2, -0.15, -0.3);
    this.flashLight.target.position.set(0.05, -0.05, -3);
    this.camera.add(this.flashLight, this.flashLight.target);
    // UV lamp
    const uv = fl.clone(true);
    uv.children[2] = uv.children[2].clone(); uv.children[2].material = new THREE.MeshStandardMaterial({ emissive: 0x7a3cff, emissiveIntensity: 3 });
    uv.remove(uv.children[2]); const uvl = new THREE.Mesh(new THREE.CircleGeometry(0.024, 16), new THREE.MeshStandardMaterial({ emissive: 0x7a3cff, emissiveIntensity: 3 })); uvl.position.z = -0.121; uvl.rotation.y = Math.PI; uv.add(uvl);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.02, 16), new THREE.MeshStandardMaterial({ color: 0x5522aa })); band.rotation.x = Math.PI / 2; band.position.z = 0.03; uv.add(band);
    T.uv = uv;
    this.uvLight = new THREE.SpotLight(0x6a2cff, 0, 6, 0.32, 0.4, 1.5);
    this.uvLight.position.copy(this.flashLight.position);
    this.uvLight.target.position.set(0.05, -0.05, -3);
    this.camera.add(this.uvLight, this.uvLight.target);
    // geiger
    const gg = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.14), yellow); gg.add(box);
    this.geigerScr = geigerScreen();
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.035), new THREE.MeshStandardMaterial({ map: this.geigerScr.t, emissive: 0xffffff, emissiveMap: this.geigerScr.t, emissiveIntensity: 0.8 }));
    scr.rotation.x = -Math.PI / 2 + 0.0; scr.position.set(0, 0.0251, 0.02); gg.add(scr);
    const probe = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 12), metal); probe.rotation.x = Math.PI / 2; probe.position.set(0.03, -0.01, -0.12); gg.add(probe);
    gg.rotation.x = 0.55;
    T.geiger = gg;
    // hose nozzle
    const hz = new THREE.Group();
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.04), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 })); grip.position.set(0, -0.04, 0.03); grip.rotation.x = -0.25; hz.add(grip);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.2, 14), new THREE.MeshStandardMaterial({ color: 0xb8a018, metalness: 0.6, roughness: 0.35 })); barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.06; hz.add(barrel);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.04, 14), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.9, roughness: 0.25 })); tip.rotation.x = Math.PI / 2; tip.position.z = -0.17; hz.add(tip);
    T.hose = hz;
    // bundle (carried clothes)
    const bundle = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.22, 4, 2, 4), new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.95 }));
    const p = bundle.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.sin(p.getX(i) * 20) * 0.01 + Math.cos(p.getZ(i) * 25) * 0.008);
    bundle.geometry.computeVertexNormals();
    T.bundle = bundle;
    for (const [k, o] of Object.entries(T)) {
      o.visible = false;
      o.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.renderOrder = 10; } });
      this.toolGroup.add(o);
    }
    T.bundle.position.set(0, -0.32, -0.5);
    this.T = T;
    // water droplets
    const N = 420;
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 6, 5), new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, roughness: 0.05, metalness: 0, transmission: 0.6, transparent: true, opacity: 0.55, depthWrite: false }), N);
    this.drops.frustumCulled = false;
    this.dropData = Array.from({ length: N }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }));
    this.dropIdx = 0;
    this.world.scene.add(this.drops);
    this._m4 = new THREE.Matrix4();
  }

  setTool(id) {
    if (id === 'hose' && !this.hasHose) return false;
    if (this.carrying && id !== 'hand') return false;
    this.tool = id;
    audio.click();
    return true;
  }

  carry(obj) {
    if (this.carrying?.model) {
      this.toolGroup.remove(this.carrying.model);
      this.carrying.model.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    }
    this.carrying = obj;
    if (!obj) return;
    this.tool = 'hand';
    this.T.bundle.material.color.setRGB(...(obj.color || [0.5, 0.5, 0.5]), THREE.SRGBColorSpace);
    if (obj.model) {
      const m = obj.model;
      const size = m.userData.size;
      const holder = new THREE.Group();
      holder.add(m);
      m.scale.setScalar(m.userData.scale || 1);
      const longest = Math.max(size.x, size.y, size.z);
      if (size.y >= Math.max(size.x, size.z) && size.y > 0.22) {
        // tall things (boots, stockings, gloves) lie across the arms
        m.rotation.set(0.35, 0, Math.PI / 2);
      } else {
        m.rotation.set(0.45, 0, 0); // front faces you, top tilted toward you
      }
      const fit = Math.min(1, 0.62 / Math.max(0.01, longest));
      holder.scale.setScalar(fit);
      const small = longest < 0.25;
      holder.position.set(0, small ? -0.17 : -0.3, small ? -0.38 : -0.55);
      holder.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 10; } });
      obj.model = holder;
      this.toolGroup.add(holder);
    }
  }

  nozzleWorld(target = new THREE.Vector3()) {
    return this.T.hose.localToWorld(target.set(0, 0, -0.2));
  }

  forward(target = new THREE.Vector3()) { return this.camera.getWorldDirection(target); }

  // direction from the nozzle to the point under the reticle
  sprayDir(target = new THREE.Vector3()) {
    const cam = this.camera.getWorldPosition(new THREE.Vector3());
    const fwd = this.forward();
    const dist = Math.max(0.6, Math.min(6, this.aimDistanceFn?.(cam, fwd) ?? 3));
    const aim = cam.addScaledVector(fwd, dist);
    return target.copy(aim).sub(this.nozzleWorld()).normalize();
  }

  update(dt) {
    const k = this.keys;
    const moving = this.enabled;
    // movement
    const speed = (k.ShiftLeft || k.ShiftRight ? 3.8 : 2.3) * (1 - this.crouch * 0.5);
    const f = (moving && (k.KeyW || k.ArrowUp) ? 1 : 0) - (moving && (k.KeyS || k.ArrowDown) ? 1 : 0);
    const s = (moving && (k.KeyD || k.ArrowRight) ? 1 : 0) - (moving && (k.KeyA || k.ArrowLeft) ? 1 : 0);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * -f + Math.cos(this.yaw) * s, 0, Math.cos(this.yaw) * -f - Math.sin(this.yaw) * s);
    if (dir.lengthSq() > 0) dir.normalize().multiplyScalar(speed);
    this.vel.x = damp(this.vel.x, dir.x, 12, dt);
    this.vel.z = damp(this.vel.z, dir.z, 12, dt);
    const before = this.pos.clone();
    this.pos.addScaledVector(this.vel, dt);
    this.world.collide(this.pos, 0.28);
    // characters push gently instead of snapping the camera
    const pushed = this.pos.clone();
    this.world.collide(pushed, 0.28, this.extraColliders());
    const maxPush = 1.5 * dt;
    const dx = pushed.x - this.pos.x, dz = pushed.z - this.pos.z, dl = Math.hypot(dx, dz);
    if (dl > 0) { const k = Math.min(1, maxPush / dl); this.pos.x += dx * k; this.pos.z += dz * k; this.world.collide(this.pos, 0.28); }
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    this.stepDist += moved;
    if (this.stepDist > 0.75) { this.stepDist = 0; audio.step(); }
    this.crouch = damp(this.crouch, moving && (k.ControlLeft || k.KeyC) ? 1 : 0, 10, dt);
    this.zoom = damp(this.zoom, moving && this.mouse.right ? 1 : 0, 10, dt);
    const fov = 70 - this.zoom * 44;
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    const bob = Math.sin(performance.now() * 0.009) * Math.min(1, this.vel.length() / 2) * 0.018;
    this.camera.position.set(this.pos.x, this.eye - this.crouch * 0.55 + bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    // tools
    const tool = this.carrying ? (this.carrying.model ? 'model' : 'bundle') : this.tool;
    for (const [id, o] of Object.entries(this.T)) o.visible = id === tool;
    const sway = Math.sin(performance.now() * 0.002) * 0.004;
    for (const id of ['flashlight', 'uv', 'geiger', 'hose']) this.T[id].position.set(0.22, -0.2 + sway, -0.38);
    this.T.geiger.position.set(0.18, -0.2 + sway, -0.36);
    this.flashLight.intensity = tool === 'flashlight' ? 14 : 0;
    this.uvLight.intensity = tool === 'uv' ? 5 : 0;
    const U = GLOBAL_UNIFORMS;
    U.hvUvOn.value = tool === 'uv' ? 1 : 0;
    if (tool === 'uv') {
      this.camera.updateMatrixWorld();
      this.uvLight.getWorldPosition(U.hvUvPos.value);
      const tgt = this.uvLight.target.getWorldPosition(new THREE.Vector3());
      U.hvUvDir.value.copy(tgt).sub(U.hvUvPos.value).normalize();
    }
    // geiger
    if (tool === 'geiger') {
      const probe = this.T.geiger.localToWorld(new THREE.Vector3(0.03, -0.01, -0.18));
      const target = this.radiationFn(probe, this.forward());
      this.geigerReading = damp(this.geigerReading, target, 3, dt);
      const cps = 0.6 + this.geigerReading * 18;
      this.geigerAcc += dt * cps;
      while (this.geigerAcc > 0) { if (Math.random() < 0.85) audio.geigerTick(); this.geigerAcc -= -Math.log(1 - Math.random()) ; }
      this._drawGeiger();
    }
    // hose
    const spraying = tool === 'hose' && this.mouse.left && this.enabled;
    this.spraying = spraying;
    audio.loop('hose', spraying, { freq: 1400, q: 0.5, gain: 0.22 });
    this.camera.updateMatrixWorld();
    const sprayDir = spraying ? this.sprayDir() : null;
    this._updateDrops(dt, spraying, sprayDir);
    if (spraying && this.onSpray) {
      const o = this.nozzleWorld();
      this.onSpray(o, sprayDir, dt);
    }
  }

  _drawGeiger() {
    const { g, t } = this.geigerScr;
    const r = this.geigerReading;
    g.fillStyle = '#0b1a0b'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = r > 2 ? '#ff5544' : r > 0.8 ? '#ffcc33' : '#66ff66';
    g.font = 'bold 54px Consolas, monospace'; g.textAlign = 'right';
    g.fillText((0.1 + r * 1.8).toFixed(2), 200, 64);
    g.font = '20px Consolas, monospace'; g.fillText('µSv/h', 248, 64);
    const w = Math.min(236, r * 60);
    g.fillRect(10, 90, w, 22);
    g.strokeStyle = '#335533'; g.strokeRect(10, 90, 236, 22);
    t.needsUpdate = true;
  }

  _updateDrops(dt, spraying, dir) {
    const D = this.dropData;
    if (spraying) {
      const o = this.nozzleWorld();
      const fwd = dir || this.forward();
      const n = Math.floor(dt * 900);
      for (let i = 0; i < n; i++) {
        const d = D[this.dropIdx]; this.dropIdx = (this.dropIdx + 1) % D.length;
        d.p.copy(o);
        d.v.copy(fwd).multiplyScalar(9 + Math.random() * 2);
        d.v.x += (Math.random() - 0.5) * 0.9; d.v.y += (Math.random() - 0.5) * 0.9; d.v.z += (Math.random() - 0.5) * 0.9;
        d.life = 0.45 + Math.random() * 0.2;
      }
    }
    for (let i = 0; i < D.length; i++) {
      const d = D[i];
      if (d.life > 0) {
        d.life -= dt; d.v.y -= 9.8 * dt; d.p.addScaledVector(d.v, dt);
        if (d.p.y < 0.01) { d.life = 0; }
        const sc = 0.6 + d.v.length() * 0.05;
        this._m4.makeScale(sc, sc, sc * 2.2);
        this._m4.setPosition(d.p);
      } else this._m4.makeScale(0, 0, 0);
      this.drops.setMatrixAt(i, this._m4);
    }
    this.drops.instanceMatrix.needsUpdate = true;
  }

  teleport(pos, yaw = this.yaw, pitch = 0) { this.pos.copy(pos); this.yaw = yaw; this.pitch = pitch; this.vel.set(0, 0, 0); }
}
