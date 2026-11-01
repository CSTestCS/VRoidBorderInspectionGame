// The checkpoint facility: geometry, lights, props, doors, interactables.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeMaterial } from './textures.js';

export const SPOTS = {
  playerStart: new THREE.Vector3(0, 0, 2.2),
  visitorSpawn: new THREE.Vector3(0, 0, -5.4),
  visitorWindow: new THREE.Vector3(0, 0, -0.8),
  platform: new THREE.Vector3(0, 0.06, 15),
  havenDoor: new THREE.Vector3(-3.5, 0, 21.4),
  wasteDoor: new THREE.Vector3(4, 0, 21.4),
  interroSeat: new THREE.Vector3(-12.1, 0, 19),
  washroomEntry: new THREE.Vector3(0, 0, 10.2),
  booth: new THREE.Vector3(0, 0, 2.2),
};
export const TANK_POS = [15, 17.2, 19.4, 21.6].map((z) => new THREE.Vector3(13.6, 0, z));
const V = (x, z) => new THREE.Vector3(x, 0, z);
export const PATHS = {
  windowToDecon: [V(-1.4, -2.5), V(-3.6, -2.5), V(-6.7, -2.5), V(-6.7, 10.4), V(-4.9, 10.4), V(-1.6, 13.6), V(0, 15)],
  deconToInterro: [V(-3.8, 18.8), V(-6.9, 18.8), V(-7.7, 21.3), V(-9.7, 21.3), V(-11.6, 20.6), V(-12.1, 19)],
  interroToDecon: [V(-11.6, 20.6), V(-9.7, 21.3), V(-7.7, 21.3), V(-6.9, 18.8), V(-3.8, 18.8), V(-0.6, 16.8)],
  deconToLab: [V(3.6, 17.8), V(7.2, 17.8)],
  labToDecon: [V(7.2, 17.8), V(3.6, 17.8), V(0.3, 15.6), V(0, 15)],
};
export const tankApproach = (i) => [V(10.4, TANK_POS[i].z), V(12.55, TANK_POS[i].z + 0.95)];

function signTexture(lines, { w = 512, h = 128, bg = '#1b1f22', fg = '#e8e2c8', border = '#c9a227', font = 'bold 54px "Segoe UI", Arial', glow = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font;
  if (glow) { g.shadowColor = fg; g.shadowBlur = 18; }
  const arr = Array.isArray(lines) ? lines : [lines];
  arr.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (arr.length - 1) / 2) * (h / (arr.length + 0.4))));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function hazardTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d6a91c'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#151515';
  for (let i = -128; i < 256; i += 48) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 24, 0); g.lineTo(i + 24 - 128, 128); g.lineTo(i - 128, 128); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function heightChartTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#d9d4c3'; g.fillRect(0, 0, 256, 1024);
  // covers 130cm (bottom) .. 210cm (top)
  for (let cm = 130; cm <= 210; cm++) {
    const y = 1024 - ((cm - 130) / 80) * 1024;
    g.fillStyle = '#1b1b1b';
    const major = cm % 10 === 0, mid = cm % 5 === 0;
    const len = major ? 256 : mid ? 120 : 60;
    g.fillRect(0, y - (major ? 2 : 1), len, major ? 4 : 2);
    g.fillRect(256 - len, y - (major ? 2 : 1), len, major ? 4 : 2);
    if (major) { g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.fillText(String(cm), 128, y + (cm === 210 ? 36 : -12)); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export class World {
  constructor(scene, settings = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = []; // [minX, maxX, minZ, maxZ]
    this.interact = {};
    this.doors = {};
    this.autoDoors = [];
    this.updaters = [];
    this.lights = [];
    this.shadowQuality = settings.quality === 'low' ? 1024 : 2048;
    this.M = {
      concrete: makeMaterial('concrete', [2, 2]),
      concreteFloor: makeMaterial('concrete', [4, 4], { color: 0x9a9a9a }),
      tiles: makeMaterial('tiles', [3, 1.5]),
      floorTiles: makeMaterial('floorTiles', [4, 4]),
      panel: makeMaterial('panel', [2, 1]),
      panelLight: makeMaterial('panel', [2, 1], { color: 0xd8dde0, metalness: 0.3 }),
      metal: makeMaterial('metal', [1, 1]),
      darkMetal: makeMaterial('metal', [1, 1], { color: 0x444850 }),
      rust: makeMaterial('rust', [1, 1]),
      rubber: makeMaterial('rubber', [1, 1]),
      grate: makeMaterial('grate', [2, 2]),
      wood: makeMaterial('wood', [1, 1]),
      ceiling: makeMaterial('panel', [3, 3], { color: 0x6a6e72 }),
      hazard: new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.7 }),
      glass: new THREE.MeshBasicMaterial({ color: 0xd8eaea, transparent: true, opacity: 0.05, depthWrite: false }),
      emissive: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f6ff, emissiveIntensity: 2.2 }),
      black: new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.6 }),
    };
    this.build();
  }

  box(w, h, d, mat, x, y, z, { cast = true, receive = true, collide = false, parent = this.group, rounded = 0 } = {}) {
    const geo = rounded ? new RoundedBoxGeometry(w, h, d, 2, rounded) : new THREE.BoxGeometry(w, h, d);
    this._uvScale(geo, w, h, d);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast; m.receiveShadow = receive;
    parent.add(m);
    if (collide) this.colliders.push([x - w / 2, x + w / 2, z - d / 2, z + d / 2]);
    return m;
  }
  _uvScale(geo, w, h, d) {
    // world-scale UVs on boxes so textures tile consistently (1 repeat ~ 2m)
    const uv = geo.attributes.uv, n = geo.attributes.normal;
    if (!uv || !n) return;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
      const sx = nx > 0.5 ? d : w, sy = ny > 0.5 ? d : h;
      uv.setXY(i, uv.getX(i) * sx / 2, uv.getY(i) * sy / 2);
    }
  }

  // axis-aligned wall from (x1,z1) to (x2,z2) with door gaps [{c, w, h}]
  wall(x1, z1, x2, z2, h, mat, gaps = [], t = 0.2) {
    const horiz = z1 === z2;
    const a = horiz ? Math.min(x1, x2) : Math.min(z1, z2);
    const b = horiz ? Math.max(x1, x2) : Math.max(z1, z2);
    const segs = [];
    let cur = a;
    for (const g of [...gaps].sort((p, q) => p.c - q.c)) {
      segs.push([cur, g.c - g.w / 2, 0, h]);
      if (g.h < h) segs.push([g.c - g.w / 2, g.c + g.w / 2, g.h, h]);
      if (g.sill) segs.push([g.c - g.w / 2, g.c + g.w / 2, 0, g.sill]);
      cur = g.c + g.w / 2;
    }
    segs.push([cur, b, 0, h]);
    for (const [s0, s1, y0, y1] of segs) {
      const len = s1 - s0;
      if (len <= 0.001) continue;
      const mid = (s0 + s1) / 2, hh = y1 - y0;
      if (horiz) this.box(len, hh, t, mat, mid, y0 + hh / 2, z1, { collide: y0 < 0.5 });
      else this.box(t, hh, len, mat, x1, y0 + hh / 2, mid, { collide: y0 < 0.5 });
    }
    // glass/blocked gaps still block movement
    for (const g of gaps) if (g.block) {
      if (horiz) this.colliders.push([g.c - g.w / 2, g.c + g.w / 2, z1 - t / 2, z1 + t / 2]);
      else this.colliders.push([x1 - t / 2, x1 + t / 2, g.c - g.w / 2, g.c + g.w / 2]);
    }
  }

  room(x0, x1, z0, z1, h, floorMat, ceilMat) {
    const w = x1 - x0, d = z1 - z0;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    f.rotation.x = -Math.PI / 2; f.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); f.receiveShadow = true;
    f.geometry.attributes.uv.array.forEach((v, i, arr) => { arr[i] = v * (i % 2 === 0 ? w : d) / 2.5; });
    this.group.add(f);
    const c = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilMat);
    c.rotation.x = Math.PI / 2; c.position.set((x0 + x1) / 2, h, (z0 + z1) / 2);
    this.group.add(c);
  }

  ceilingLight(x, y, z, w, d, intensity = 6, color = 0xf2f5ff, rect = true) {
    this.box(w + 0.08, 0.06, d + 0.08, this.M.darkMetal, x, y - 0.03, z, { cast: false });
    const lm = this.M.emissive.clone();
    lm.emissive = new THREE.Color(color);
    const panel = this.box(w, 0.02, d, lm, x, y - 0.065, z, { cast: false, receive: false });
    if (rect) {
      const l = new THREE.RectAreaLight(color, intensity, w, d);
      l.position.set(x, y - 0.08, z);
      l.lookAt(x, 0, z);
      this.group.add(l);
      this.lights.push(l);
    }
    return panel;
  }

  spot(x, y, z, tx, ty, tz, intensity, angle, color = 0xffffff, shadow = false, distance = 12) {
    const s = new THREE.SpotLight(color, intensity, distance, angle, 0.5, 1.6);
    s.position.set(x, y, z);
    s.target.position.set(tx, ty, tz);
    this.group.add(s, s.target);
    if (shadow) {
      s.castShadow = true;
      s.shadow.mapSize.set(this.shadowQuality, this.shadowQuality);
      s.shadow.bias = -0.0005;
      s.shadow.normalBias = 0.03;
      s.shadow.camera.near = 0.3;
    }
    this.lights.push(s);
    return s;
  }

  sign(text, x, y, z, ry, w = 1.2, h = 0.3, opts = {}) {
    const t = signTexture(text, opts);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: opts.glow ? 0xffffff : 0x000000, emissiveMap: opts.glow ? t : null, emissiveIntensity: opts.glow ? 0.9 : 0 }));
    m.position.set(x, y, z); m.rotation.y = ry;
    this.group.add(m);
    return m;
  }

  slidingDoor(name, x, z, axis, width, height, mat, { auto = true, label = null, charOnly = false } = {}) {
    // axis 'x' => door plane spans x (wall along x), slides along x
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    this.group.add(g);
    const leafW = width / 2;
    const mk = (side) => {
      const leaf = this.box(leafW, height, 0.08, mat, 0, height / 2, 0, { parent: g });
      leaf.userData.side = side;
      return leaf;
    };
    const L = mk(-1), R = mk(1);
    const stripe = this.M.hazard;
    for (const leaf of [L, R]) this.box(leafW * 0.98, 0.12, 0.085, stripe, 0, -height / 2 + 0.5, 0, { parent: leaf, cast: false });
    if (axis === 'z') g.rotation.y = Math.PI / 2;
    this.box(width + 0.3, 0.25, 0.3, this.M.darkMetal, 0, height + 0.125, 0, { parent: g });
    const door = { g, L, R, open: 0, target: 0, width, auto, x, z, axis, locked: false, charOnly };
    door.set = (t) => { door.target = t; };
    door.colliderIndex = this.colliders.length;
    this.colliders.push(axis === 'x' ? [x - width / 2, x + width / 2, z - 0.1, z + 0.1] : [x - 0.1, x + 0.1, z - width / 2, z + width / 2]);
    this.doors[name] = door;
    if (auto) this.autoDoors.push(door);
    return door;
  }

  updateDoors(dt, playerPos, extraPositions = []) {
    for (const d of Object.values(this.doors)) {
      if (d.auto && !d.locked) {
        const near = [...(d.charOnly ? [] : [playerPos]), ...extraPositions].some((p) => p && Math.hypot(p.x - d.x, p.z - d.z) < 2.0);
        d.target = near ? 1 : 0;
      }
      d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * 2.2);
      const off = d.open * (d.width / 2) * 0.95;
      d.L.position.x = -d.width / 4 - off;
      d.R.position.x = d.width / 4 + off;
      const c = this.colliders[d.colliderIndex];
      const inside = playerPos && playerPos.x > c[0] - 0.35 && playerPos.x < c[1] + 0.35 && playerPos.z > c[2] - 0.35 && playerPos.z < c[3] + 0.35;
      if (d.open > 0.8) c.disabled = true;
      else if (!inside) c.disabled = false;
      if (inside && d.auto && !d.locked && !d.charOnly) d.target = 1;
    }
  }

  build() {
    const M = this.M;
    // ---------- Airlock (visitor queue) ----------
    this.room(-3, 3, -6, 0, 3.2, M.concreteFloor, M.ceiling);
    this.wall(-3, -6, 3, -6, 3.2, M.concrete, [{ c: 0, w: 2.2, h: 2.6 }]);
    this.wall(-3, -6, -3, 0, 3.2, M.concrete, [{ c: -2.5, w: 1.2, h: 2.3 }]);
    this.wall(3, -6, 3, 0, 3.2, M.concrete);
    this.slidingDoor('airlockSide', -3, -2.5, 'z', 1.2, 2.3, M.panel, { charOnly: true });
    this.sign('DECONTAMINATION ▶', -2.88, 2.55, -2.5, Math.PI / 2, 0.9, 0.18);
    // visitor corridor: airlock -> decontamination (visitor entry)
    this.room(-7.4, -3, -3.2, -1.8, 2.6, M.concreteFloor, M.ceiling);
    this.room(-7.4, -6, -1.8, 11.2, 2.6, M.concreteFloor, M.ceiling);
    this.wall(-7.4, -3.2, -3, -3.2, 2.6, M.panel);
    this.wall(-6, -1.8, -3, -1.8, 2.6, M.panel);
    this.wall(-7.4, -3.2, -7.4, 11.2, 2.6, M.panel);
    this.wall(-6, -1.8, -6, 9, 2.6, M.panel);
    this.wall(-7.4, 11.2, -6, 11.2, 2.6, M.panel);
    for (const z of [-2.5, 2.5, 7.5]) { this.ceilingLight(-6.7, 2.6, z, 0.25, 1.0, 1.5, 0xe8eeff, false); const pl = new THREE.PointLight(0xe8eeff, 0.8, 5, 2); pl.position.set(-6.7, 2.3, z); this.group.add(pl); }
    const outer = this.slidingDoor('outer', 0, -6, 'x', 2.2, 2.6, M.rust, { auto: false });
    outer.locked = true;
    // dusty light from outside
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: 0xe0a060 }));
    outside.position.set(0, 1.4, -8.6); this.group.add(outside);
    this.outsidePlane = outside;
    const rainN = 500;
    this.rain = new THREE.InstancedMesh(new THREE.BoxGeometry(0.004, 0.22, 0.004), new THREE.MeshBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0.45 }), rainN);
    this.rain.visible = false; this.rain.frustumCulled = false;
    const rd = Array.from({ length: rainN }, () => [Math.random() * 3 - 1.5, Math.random() * 3, -6.4 - Math.random() * 2]);
    const rm = new THREE.Matrix4();
    this.group.add(this.rain);
    this.updaters.push((dt) => {
      if (!this.rain.visible) return;
      for (let k = 0; k < rainN; k++) { const d = rd[k]; d[1] -= dt * 7; if (d[1] < 0) d[1] += 3; rm.makeTranslation(d[0], d[1], d[2]); this.rain.setMatrixAt(k, rm); }
      this.rain.instanceMatrix.needsUpdate = true;
    });
    this.spot(0, 2.75, 0.2, 0, 1.2, -0.9, 4, 0.6, 0xfff1dc, true, 8);
    this.spot(0, 3.05, -2.2, 0, 0.5, -0.8, 1.5, 0.7, 0xffe0c0, false, 6);
    this.spot(0, 2.4, -6.3, 0, 0, -2, 6, 0.6, 0xffb070, false, 9);
    this.ceilingLight(0, 3.2, -4, 1.2, 0.3, 3, 0xfff0d8);
    // height chart on a post beside the visitor (130-210 cm marks)
    const chart = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.8), new THREE.MeshStandardMaterial({ map: heightChartTexture(), roughness: 0.8, color: 0xb8b8b8 }));
    chart.position.set(0.42, 1.7, -0.77);
    this.group.add(chart);
    this.box(0.24, 0.84, 0.03, M.darkMetal, 0.42, 1.7, -0.79);
    this.box(0.05, 2.15, 0.05, M.darkMetal, 0.42, 1.075, -0.82);
    this.box(0.3, 0.03, 0.3, M.darkMetal, 0.42, 0.015, -0.82);
    this.colliders.push([0.3, 0.55, -0.9, -0.7]);
    this.box(0.5, 0.01, 0.5, M.hazard, 0, 0.006, -0.8, { cast: false });
    this.sign('STAND HERE', 0, 0.008, -0.42, 0, 0.5, 0.08, { font: 'bold 60px Arial', border: null, bg: '#151515', fg: '#d6a91c' }).rotation.x = -Math.PI / 2;
    this.sign(['CHECKPOINT 7', 'HAVEN ENTRY'], 1.9, 2.4, -5.88, 0, 1.4, 0.5, { h: 180 });

    // ---------- Booth ----------
    this.room(-3, 3, 0, 4.5, 2.8, M.concreteFloor, M.ceiling);
    this.wall(-3, 0, 3, 0, 2.8, M.panel, [{ c: 0, w: 2.8, h: 2.35, sill: 1.05, block: true }]);
    this.wall(-3, 0, -3, 4.5, 2.8, M.panel);
    this.wall(3, 0, 3, 4.5, 2.8, M.panel);
    this.wall(-3, 4.5, 3, 4.5, 2.8, M.panel, [{ c: 0, w: 1.4, h: 2.3 }]);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.3), M.glass);
    glass.position.set(0, 1.7, 0); this.group.add(glass);
    this.box(2.8, 0.06, 0.06, M.darkMetal, 0, 1.05, 0); this.box(2.8, 0.06, 0.06, M.darkMetal, 0, 2.35, 0);
    // desk
    this.box(4.6, 0.06, 0.8, M.wood, 0, 0.95, 0.5, { collide: true });
    this.box(4.6, 0.92, 0.06, M.panel, 0, 0.46, 0.88);
    // card slot tray (visitor pushes ID through)
    this.box(0.5, 0.04, 0.5, M.metal, 0, 1.0, 0.0);
    this.interact.cardTray = this.box(0.34, 0.012, 0.26, M.darkMetal, 0.0, 0.985, 0.28, { cast: false });
    // intercom
    const mic = new THREE.Group(); mic.position.set(-0.85, 0.98, 0.35); this.group.add(mic);
    this.box(0.16, 0.04, 0.12, M.black, 0, 0.02, 0, { parent: mic });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.25), M.metal); stem.position.set(0, 0.16, 0); stem.rotation.x = 0.4; mic.add(stem);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), M.black); head.position.set(0, 0.27, -0.05); mic.add(head);
    this.interact.intercom = this.box(0.25, 0.35, 0.25, new THREE.MeshBasicMaterial({ visible: false }), -0.85, 1.12, 0.35, { cast: false });
    // call-next button + decon button panel
    const panel = this.box(0.6, 0.04, 0.3, M.darkMetal, 1.1, 1.0, 0.45);
    const btn = (color, x, label) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.035, 24), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.4 }));
      b.position.set(x, 1.035, 0.45); this.group.add(b);
      this.sign(label, x, 1.0215, 0.56, 0, 0.16, 0.04, { font: 'bold 64px Arial', border: null, h: 128 }).rotation.x = -Math.PI / 2;
      return b;
    };
    this.interact.callNext = btn(0x2a9d3a, 0.9, 'NEXT');
    this.interact.sendDecon = btn(0x2a6fd6, 1.1, 'DECON');
    this.interact.sendAway = btn(0xb02a2a, 1.3, 'REJECT');
    // stamps
    const stamp = (color, x, text) => {
      const s = new THREE.Group(); s.position.set(x, 0.98, 0.62); this.group.add(s);
      const h2 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.08, 16), M.wood); h2.position.y = 0.09; s.add(h2);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.05), new THREE.MeshStandardMaterial({ color, roughness: 0.5 })); base.position.y = 0.035; s.add(base);
      this.sign(text, x, 0.981, 0.72, 0, 0.14, 0.035, { font: 'bold 60px Arial', border: null, bg: '#ddd', fg: '#222', h: 128 }).rotation.x = -Math.PI / 2;
      const hit = this.box(0.12, 0.16, 0.12, new THREE.MeshBasicMaterial({ visible: false }), x, 1.06, 0.62, { cast: false });
      return hit;
    };
    this.interact.stampApprove = stamp(0x1f7a35, -0.35, 'APPROVED');
    this.interact.stampFlag = stamp(0x8a1c1c, -0.15, 'FLAG');
    // rulebook
    const book = this.box(0.22, 0.04, 0.3, new THREE.MeshStandardMaterial({ color: 0x5a1f14, roughness: 0.7 }), -1.5, 0.995, 0.5);
    this.interact.rulebook = book;
    this.sign(['HAVEN', 'PROCEDURES'], -1.5, 1.016, 0.5, 0, 0.18, 0.12, { bg: '#5a1f14', fg: '#d8c27a', border: '#d8c27a', h: 256, w: 384 }).rotation.x = -Math.PI / 2;
    // lamp and lights
    this.ceilingLight(0, 2.8, 2.4, 1.2, 0.35, 4, 0xfff4e6);
    const desk = new THREE.PointLight(0xffd9a0, 1.2, 3, 2); desk.position.set(-1.6, 1.5, 0.7); this.group.add(desk);
    this.sign(['PROCESS EVERY VISITOR', 'TRUST NOTHING'], 0, 2.55, 4.38, Math.PI, 1.4, 0.35, { h: 160 });
    this.sign('DECONTAMINATION ▶', 0, 2.45, 4.38 + 0.0, Math.PI, 0.9, 0.18, {}).position.set(0, 2.42, 4.39);

    // ---------- Corridor ----------
    this.room(-1, 1, 4.5, 9, 2.6, M.concreteFloor, M.ceiling);
    this.wall(-1, 4.5, -1, 9, 2.6, M.panel);
    this.wall(1, 4.5, 1, 9, 2.6, M.panel);
    this.ceilingLight(0, 2.6, 6.8, 0.25, 1.2, 2.5);
    this.slidingDoor('booth', 0, 4.5, 'x', 1.4, 2.3, M.panelLight);

    // ---------- Washroom ----------
    this.room(-6, 6, 9, 21, 3.4, M.floorTiles, M.ceiling);
    this.wall(-6, 9, 6, 9, 3.4, M.tiles, [{ c: 0, w: 1.4, h: 2.3 }]);
    this.wall(-6, 9, -6, 21, 3.4, M.tiles, [{ c: 18.8, w: 1.4, h: 2.3 }, { c: 10.4, w: 1.2, h: 2.3 }]);
    this.wall(6, 9, 6, 21, 3.4, M.tiles, [{ c: 17.8, w: 1.4, h: 2.3 }]);
    this.wall(-6, 21, 6, 21, 3.4, M.tiles, [{ c: -3.5, w: 1.8, h: 2.6, block: true }, { c: 4, w: 1.8, h: 2.6, block: true }]);
    this.slidingDoor('washroom', 0, 9, 'x', 1.4, 2.3, M.panelLight);
    this.slidingDoor('lab', 6, 17.8, 'z', 1.4, 2.3, M.panelLight);
    this.slidingDoor('interro', -6, 18.8, 'z', 1.4, 2.3, M.panelLight);
    const decon = this.slidingDoor('deconEntry', -6, 10.4, 'z', 1.2, 2.3, M.rust, { charOnly: true });
    const haven = this.slidingDoor('haven', -3.5, 21, 'x', 1.8, 2.6, new THREE.MeshStandardMaterial({ color: 0xc8d4d6, metalness: 0.6, roughness: 0.3 }), { auto: false });
    const waste = this.slidingDoor('waste', 4, 21, 'x', 1.8, 2.6, M.rust, { auto: false });
    this.sign('HAVEN ▲', -3.5, 2.95, 20.88, Math.PI, 1.3, 0.3, { bg: '#0d2a2a', fg: '#7ff0e0', border: '#7ff0e0', glow: true });
    this.sign('WASTELAND ▲', 4, 2.95, 20.88, Math.PI, 1.3, 0.3, { bg: '#2a120d', fg: '#ff9c6b', border: '#ff9c6b', glow: true });
    this.sign('MEDICAL LAB', 5.88, 2.6, 17.8, -Math.PI / 2, 1.1, 0.26);
    this.sign('INTERROGATION', -5.88, 2.6, 18.8, Math.PI / 2, 1.2, 0.26);
    this.sign('VISITOR ENTRY', -5.88, 2.6, 10.4, Math.PI / 2, 1.1, 0.24);
    this.sign(['DECONTAMINATION', 'STRIP • SORT • WASH • INSPECT'], 0, 2.9, 9.12, 0, 2.2, 0.55, { h: 200, w: 800 });
    // platform + drain
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.06, 48), M.grate);
    plat.position.set(0, 0.03, 15); plat.receiveShadow = true; this.group.add(plat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.03, 8, 48), M.hazard); ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.06, 15); this.group.add(ring);
    this.colliders.push([-0.45, 0.45, 14.55, 15.45]);
    // puddle (grows while hosing)
    this.puddle = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.MeshPhysicalMaterial({ color: 0x223035, roughness: 0.03, metalness: 0, transparent: true, opacity: 0, clearcoat: 1, depthWrite: false }));
    this.puddle.rotation.x = -Math.PI / 2; this.puddle.position.set(0, 0.004, 15); this.group.add(this.puddle);
    // washer
    const washer = new THREE.Group(); washer.position.set(-5.5, 0, 12); this.group.add(washer);
    this.box(0.8, 1.0, 0.75, M.panelLight, 0, 0.5, 0, { parent: washer });
    const port = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.04, 12, 36), M.metal); port.position.set(0.41, 0.5, 0); port.rotation.y = Math.PI / 2; washer.add(port);
    const wglass = new THREE.Mesh(new THREE.CircleGeometry(0.22, 32), new THREE.MeshPhysicalMaterial({ color: 0x223344, roughness: 0.05, transmission: 0.3, transparent: true, opacity: 0.7 })); wglass.position.set(0.42, 0.5, 0); wglass.rotation.y = Math.PI / 2; washer.add(wglass);
    this.washerDrum = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.5 })); this.washerDrum.position.set(0.39, 0.5, 0); this.washerDrum.rotation.y = Math.PI / 2; washer.add(this.washerDrum);
    this.washerLamp = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x00ff44, emissiveIntensity: 0 })); this.washerLamp.position.set(0.41, 0.9, 0.25); washer.add(this.washerLamp);
    this.colliders.push([-5.9, -5.1, 11.6, 12.4]);
    this.interact.washer = this.box(0.9, 1.1, 0.85, new THREE.MeshBasicMaterial({ visible: false }), -5.5, 0.55, 12, { cast: false });
    this.sign('WASHER', -5.08, 1.15, 12, Math.PI / 2, 0.5, 0.12);
    // incinerator
    const inc = new THREE.Group(); inc.position.set(-5.4, 0, 15.6); this.group.add(inc);
    this.box(1.0, 1.7, 1.2, M.darkMetal, 0, 0.85, 0, { parent: inc });
    this.box(0.04, 0.5, 0.7, M.hazard, 0.51, 1.35, 0, { parent: inc });
    this.incGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.35), new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff5a10, emissiveIntensity: 0.6 }));
    this.incGlow.position.set(0.515, 0.75, 0); this.incGlow.rotation.y = Math.PI / 2; inc.add(this.incGlow);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.8, 16), M.rust); pipe.position.set(-0.2, 2.5, 0); inc.add(pipe);
    this.incLight = new THREE.PointLight(0xff6020, 0.6, 3, 2); this.incLight.position.set(-4.6, 0.8, 15.6); this.group.add(this.incLight);
    this.colliders.push([-5.95, -4.85, 15.0, 16.2]);
    this.interact.incinerator = this.box(1.1, 1.7, 1.3, new THREE.MeshBasicMaterial({ visible: false }), -5.4, 0.85, 15.6, { cast: false });
    this.sign('INCINERATOR', -4.88, 1.85, 15.6, Math.PI / 2, 0.9, 0.18, { fg: '#ffb080' });
    // contraband bin
    this.box(0.6, 0.85, 0.6, new THREE.MeshStandardMaterial({ color: 0x7a1414, roughness: 0.55, metalness: 0.3 }), 5.5, 0.425, 11, { collide: true });
    this.box(0.64, 0.05, 0.64, M.darkMetal, 5.5, 0.87, 11);
    this.interact.bin = this.box(0.7, 0.95, 0.7, new THREE.MeshBasicMaterial({ visible: false }), 5.5, 0.45, 11, { cast: false });
    this.sign('CONTRABAND', 5.19, 0.55, 11, -Math.PI / 2, 0.5, 0.12, { fg: '#ffffff', bg: '#7a1414', border: null });
    // hose reel
    const reel = new THREE.Group(); reel.position.set(5.82, 1.25, 14.2); this.group.add(reel);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 32), new THREE.MeshStandardMaterial({ color: 0xb8a018, roughness: 0.5, metalness: 0.4 })); drum.rotation.z = Math.PI / 2; reel.add(drum);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 10, 32), M.rubber); coil.rotation.y = Math.PI / 2; reel.add(coil);
    this.hoseNozzleRest = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.25, 12), M.metal); this.hoseNozzleRest.position.set(-0.15, -0.45, 0); reel.add(this.hoseNozzleRest);
    this.interact.hose = this.box(0.4, 1.0, 0.8, new THREE.MeshBasicMaterial({ visible: false }), 5.7, 1.0, 14.2, { cast: false });
    this.sign('HOSE', 5.88, 1.85, 14.2, -Math.PI / 2, 0.4, 0.12);
    // disposition terminal
    this.box(0.9, 0.6, 0.12, M.darkMetal, 0.5, 1.45, 20.88);
    this.terminalScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.48), new THREE.MeshStandardMaterial({ color: 0x001a10, emissive: 0x00ff88, emissiveIntensity: 0.35, emissiveMap: signTexture(['DISPOSITION', 'TERMINAL'], { bg: '#001a10', fg: '#55ffaa', border: '#55ffaa', h: 320 }) }));
    this.terminalScreen.position.set(0.5, 1.45, 20.81); this.terminalScreen.rotation.y = Math.PI; this.group.add(this.terminalScreen);
    this.interact.terminal = this.box(0.95, 0.7, 0.3, new THREE.MeshBasicMaterial({ visible: false }), 0.5, 1.45, 20.8, { cast: false });
    // lights
    this.ceilingLight(-3, 3.4, 12, 1.4, 0.35, 2.6); this.ceilingLight(3, 3.4, 12, 1.4, 0.35, 2.6);
    this.ceilingLight(-3, 3.4, 18.5, 1.4, 0.35, 2.6); this.ceilingLight(3, 3.4, 18.5, 1.4, 0.35, 2.6);
    this.platformLight = this.spot(0, 3.35, 14.2, 0, 0.9, 15, 9, 0.6, 0xffffff, true, 8);
    this.spot(0, 3.3, 12.0, 0, 1.0, 15, 4, 0.5, 0xeef4ff, false, 9);
    // pipes along ceiling
    for (const x of [-5.6, 5.6]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 12, 12), M.metal); p.rotation.x = Math.PI / 2; p.position.set(x, 3.2, 15); this.group.add(p); }

    // ---------- Lab ----------
    this.room(6, 15, 13, 23, 3.4, M.floorTiles, M.ceiling);
    this.wall(6, 13, 15, 13, 3.4, M.panelLight);
    this.wall(6, 23, 15, 23, 3.4, M.panelLight);
    this.wall(15, 13, 15, 23, 3.4, M.panelLight);
    this.wall(6, 21, 6, 23, 3.4, M.panelLight);
    this.sign(['MEDICAL LAB', 'CURE IMMERSION TANKS'], 10, 2.8, 13.12, 0, 1.8, 0.45, { h: 180, w: 720 });
    this.tanks = [];
    TANK_POS.forEach((p, i) => {
      const t = new THREE.Group(); t.position.copy(p); this.group.add(t);
      this.box(1.3, 0.35, 1.3, M.darkMetal, 0, 0.175, 0, { parent: t, rounded: 0.04 });
      this.box(1.3, 0.35, 1.3, M.darkMetal, 0, 2.85, 0, { parent: t, rounded: 0.04 });
      const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 2.25, 40, 1, true), new THREE.MeshPhysicalMaterial({ color: 0x6fe3c4, emissive: 0x0c5a48, emissiveIntensity: 0.6, roughness: 0.1, transmission: 0.6, thickness: 1.0, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
      liquid.position.y = 1.475; t.add(liquid);
      const glassT = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.3, 40, 1, true), M.glass); glassT.position.y = 1.5; t.add(glassT);
      for (let k = 0; k < 4; k++) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.3), M.metal); rod.position.set(Math.cos(k * Math.PI / 2 + 0.78) * 0.62, 1.5, Math.sin(k * Math.PI / 2 + 0.78) * 0.62); t.add(rod); }
      const light = new THREE.PointLight(0x5fffd0, 1.4, 3.5, 2); light.position.set(-0.9, 1.5, 0); t.add(light);
      // bubbles
      const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 6, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, roughness: 0.1 }), 40);
      const bd = [];
      for (let k = 0; k < 40; k++) bd.push([Math.random() * 6.28, Math.random() * 0.5, Math.random() * 2.2, 0.2 + Math.random() * 0.4]);
      t.add(bubbles);
      const m4 = new THREE.Matrix4();
      this.updaters.push((dt) => {
        for (let k = 0; k < 40; k++) {
          const b = bd[k]; b[2] += dt * b[3]; if (b[2] > 2.2) b[2] = 0;
          m4.makeTranslation(Math.cos(b[0]) * b[1], 0.4 + b[2], Math.sin(b[0]) * b[1]);
          bubbles.setMatrixAt(k, m4);
        }
        bubbles.instanceMatrix.needsUpdate = true;
      });
      // console
      const con = new THREE.Group(); con.position.set(p.x - 1.3, 0, p.z); this.group.add(con);
      this.box(0.4, 1.0, 0.5, M.darkMetal, 0, 0.5, 0, { parent: con });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.26), new THREE.MeshStandardMaterial({ color: 0x001018, emissive: 0x44ccff, emissiveIntensity: 0.3 }));
      scr.position.set(-0.205, 1.12, 0); scr.rotation.y = -Math.PI / 2; scr.rotation.x = 0; con.add(scr);
      this.box(0.06, 0.3, 0.4, M.darkMetal, -0.17, 1.12, 0, { parent: con });
      this.interact['tank' + i] = this.box(0.5, 1.3, 0.6, new THREE.MeshBasicMaterial({ visible: false }), p.x - 1.3, 0.7, p.z, { cast: false });
      this.colliders.push([p.x - 1.55, p.x + 0.7, p.z - 0.68, p.z + 0.68]);
      this.sign(`TANK ${i + 1}`, p.x - 1.08, 1.45, p.z, -Math.PI / 2, 0.3, 0.08, { border: null });
      this.tanks.push({ group: t, screen: scr, light, liquid, index: i });
    });
    this.ceilingLight(9, 3.4, 16, 1.2, 0.35, 4, 0xe8fbff); this.ceilingLight(9, 3.4, 20, 1.2, 0.35, 4, 0xe8fbff);
    // lab bench
    this.box(0.7, 0.9, 3.0, M.panelLight, 7.0, 0.45, 20, { collide: true });
    for (let k = 0; k < 5; k++) { const v = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 12), new THREE.MeshPhysicalMaterial({ color: [0x66ffcc, 0xffcc44, 0x88aaff][k % 3], transmission: 0.5, roughness: 0.1, transparent: true, opacity: 0.8 })); v.position.set(7.0, 0.99, 19 + k * 0.4); this.group.add(v); }

    // ---------- Interrogation ----------
    this.room(-14, -6, 16, 22, 2.9, M.concreteFloor, M.ceiling);
    this.wall(-14, 16, -6, 16, 2.9, M.concrete);
    this.wall(-14, 22, -6, 22, 2.9, M.concrete);
    this.wall(-14, 16, -14, 22, 2.9, M.concrete);
    this.wall(-6, 21, -6, 22, 2.9, M.concrete);
    this.wall(-9, 16, -9, 22, 2.9, M.concrete, [{ c: 19, w: 3.4, h: 2.3, sill: 0.95, block: true }, { c: 21.35, w: 0.9, h: 2.2 }]);
    this.slidingDoor('interroCell', -9, 21.35, 'z', 0.9, 2.2, M.darkMetal, { charOnly: true });
    const iglass = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.35), new THREE.MeshPhysicalMaterial({ color: 0x8899aa, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.22 }));
    iglass.position.set(-9, 1.625, 19); iglass.rotation.y = Math.PI / 2; this.group.add(iglass);
    this.box(0.9, 0.05, 1.4, M.metal, -11.1, 0.76, 19); this.box(0.06, 0.74, 0.06, M.metal, -11.1, 0.37, 19);
    // chairs
    const chair = (x, z, ry) => {
      const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = ry; this.group.add(c);
      this.box(0.45, 0.05, 0.45, M.darkMetal, 0, 0.46, 0, { parent: c });
      this.box(0.45, 0.5, 0.05, M.darkMetal, 0, 0.72, -0.21, { parent: c });
      for (const [a, b] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) this.box(0.03, 0.46, 0.03, M.darkMetal, a, 0.23, b, { parent: c });
      return c;
    };
    chair(-12.15, 19, Math.PI / 2);
    chair(-10.2, 19, -Math.PI / 2);
    this.interroLight = this.spot(-11.3, 2.85, 19, -11.6, 0, 19, 14, 0.7, 0xffe2b0, true, 6);
    const bulb = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.18, 24, 1, true), M.darkMetal); bulb.position.set(-11.3, 2.55, 19); this.group.add(bulb);
    this.ceilingLight(-7.5, 2.9, 19, 0.3, 1.0, 1.5, 0xccd8ff);
    this.box(0.5, 1.05, 0.5, M.darkMetal, -8.6, 0.525, 16.6, { collide: true });
    this.interroConsoleScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshStandardMaterial({ color: 0x100800, emissive: 0xffaa33, emissiveIntensity: 0.35, emissiveMap: signTexture(['INTERROGATION', 'RECORD'], { bg: '#100800', fg: '#ffbb55', border: '#ffbb55', h: 320 }) }));
    this.interroConsoleScreen.position.set(-8.6, 1.2, 16.86); this.interroConsoleScreen.rotation.y = 0;
    this.group.add(this.interroConsoleScreen);
    this.interact.interroConsole = this.box(0.6, 0.8, 0.6, new THREE.MeshBasicMaterial({ visible: false }), -8.6, 1.0, 16.6, { cast: false });

    // global ambient
    const hemi = new THREE.HemisphereLight(0xb8c4d0, 0x2a2420, 0.35);
    this.group.add(hemi);
  }

  setRain(on) {
    this.raining = on;
    this.rain.visible = on;
    this.outsidePlane.material.color.set(on ? 0x56606a : 0xe0a060);
  }

  update(dt, playerPos, extra) {
    this.updateDoors(dt, playerPos, extra);
    for (const u of this.updaters) u(dt);
  }

  // circle vs AABB collision resolution
  collide(pos, radius = 0.3, extraCircles = []) {
    for (const c of this.colliders) {
      if (c.disabled) continue;
      const cx = Math.max(c[0], Math.min(pos.x, c[1]));
      const cz = Math.max(c[2], Math.min(pos.z, c[3]));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        const d = Math.sqrt(d2) || 1e-4;
        if (d2 === 0) { pos.z += radius; continue; }
        pos.x += (dx / d) * (radius - d);
        pos.z += (dz / d) * (radius - d);
      }
    }
    for (const e of extraCircles) {
      const dx = pos.x - e.x, dz = pos.z - e.z, d = Math.hypot(dx, dz), r = radius + e.r;
      if (d < r && d > 1e-4) { pos.x += (dx / d) * (r - d); pos.z += (dz / d) * (r - d); }
    }
  }
}
