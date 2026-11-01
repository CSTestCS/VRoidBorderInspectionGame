// Surface painting in 3D: brushes are spheres/decals in model space that get
// rasterised into a mesh's UV-space textures. Used for dirt/blood/makeup/wet
// (washable), conditions (bites, discolouration, burns) and clothing overlays.
import * as THREE from 'three';
import { fbm, valueNoise, clamp, smoothstep, hsl } from '../util.js';

export function makeLayer(size, srgb = false) {
  const data = new Uint8Array(size * size * 4);
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.flipY = false;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return { data, tex, size, dirty: false };
}

const _n = new THREE.Vector3(), _t = new THREE.Vector3(), _b = new THREE.Vector3();

export function basis(n) {
  _n.copy(n).normalize();
  const up = Math.abs(_n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  _t.crossVectors(up, _n).normalize();
  _b.crossVectors(_n, _t).normalize();
  return { n: _n.clone(), t: _t.clone(), b: _b.clone() };
}

export class Surface {
  // mesh: original (unsplit) mesh; boneNames: per-skeleton-bone humanoid name
  constructor(mesh, boneNames = null) {
    const g = mesh.geometry;
    this.mesh = mesh;
    this.geometry = g;
    this.index = g.index ? g.index.array : null;
    this.triCount = this.index ? this.index.length / 3 : g.attributes.position.count / 3;
    this.uv = g.attributes.uv ? g.attributes.uv.array : null;
    this.bindPos = new Float32Array(g.attributes.position.array.length);
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) { this.bindPos[i * 3] = pa.getX(i); this.bindPos[i * 3 + 1] = pa.getY(i); this.bindPos[i * 3 + 2] = pa.getZ(i); }
    const na = g.attributes.normal;
    this.normals = new Float32Array(pa.count * 3);
    if (na) for (let i = 0; i < na.count; i++) { this.normals[i * 3] = na.getX(i); this.normals[i * 3 + 1] = na.getY(i); this.normals[i * 3 + 2] = na.getZ(i); }
    this.layers = {};
    this.vertBone = null;
    if (boneNames && g.attributes.skinIndex) {
      const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      this.vertBone = new Array(pa.count);
      for (let i = 0; i < pa.count; i++) {
        let best = 0, bw = -1;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
        this.vertBone[i] = boneNames[best] || null;
      }
    }
    // referenced vertices (for sampling)
    const used = new Uint8Array(pa.count);
    if (this.index) for (const v of this.index) used[v] = 1; else used.fill(1);
    this.usedVerts = [];
    for (let i = 0; i < used.length; i++) if (used[i]) this.usedVerts.push(i);
    this.posSets = new Map();
    this.setPositions('bind', this.bindPos);
  }

  vi(t, k) { return this.index ? this.index[t * 3 + k] : t * 3 + k; }

  // centroid cache for a set of positions (bind pose or baked pose)
  setPositions(key, pos) {
    const cen = new Float32Array(this.triCount * 3);
    let maxR = 0;
    for (let t = 0; t < this.triCount; t++) {
      const a = this.vi(t, 0) * 3, b = this.vi(t, 1) * 3, c = this.vi(t, 2) * 3;
      const cx = (pos[a] + pos[b] + pos[c]) / 3, cy = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3, cz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
      cen[t * 3] = cx; cen[t * 3 + 1] = cy; cen[t * 3 + 2] = cz;
      for (const v of [a, b, c]) { const d = Math.hypot(pos[v] - cx, pos[v + 1] - cy, pos[v + 2] - cz); if (d > maxR) maxR = d; }
    }
    this.posSets.set(key, { pos, cen, maxR });
  }

  addLayer(name, size, srgb = false) {
    this.layers[name] = makeLayer(size, srgb);
    return this.layers[name];
  }

  sampleVertex(rng, bones = null, filter = null, tries = 400) {
    for (let i = 0; i < tries; i++) {
      const v = this.usedVerts[Math.floor(rng.next() * this.usedVerts.length)];
      if (bones && this.vertBone && !bones.includes(this.vertBone[v])) continue;
      const p = new THREE.Vector3(this.bindPos[v * 3], this.bindPos[v * 3 + 1], this.bindPos[v * 3 + 2]);
      const n = new THREE.Vector3(this.normals[v * 3], this.normals[v * 3 + 1], this.normals[v * 3 + 2]);
      if (filter && !filter(p, n)) continue;
      return { v, p, n };
    }
    return null;
  }

  sampleFromTris(rng, tris) {
    const t = tris[Math.floor(rng.next() * tris.length)];
    const v = this.vi(t, Math.floor(rng.next() * 3));
    return {
      v,
      p: new THREE.Vector3(this.bindPos[v * 3], this.bindPos[v * 3 + 1], this.bindPos[v * 3 + 2]),
      n: new THREE.Vector3(this.normals[v * 3], this.normals[v * 3 + 1], this.normals[v * 3 + 2]),
    };
  }

  // Core rasteriser. cb(i4, t, dx, dy, dz, facing) where t = distance/radius.
  paint(layerName, center, radius, cb, opts = {}) {
    const layer = this.layers[layerName];
    if (!layer || !this.uv) return false;
    const set = this.posSets.get(opts.posKey || 'bind');
    const { pos, cen, maxR } = set;
    const S = layer.size;
    const r2 = radius * radius;
    const lim = radius + maxR;
    const lim2 = lim * lim;
    const cx = center.x, cy = center.y, cz = center.z;
    const dir = opts.normal || null; // surfaces must face this way
    const triList = opts.tris || null;
    const n = triList ? triList.length : this.triCount;
    const uv = this.uv;
    let touched = false;
    for (let k = 0; k < n; k++) {
      const t = triList ? triList[k] : k;
      const ex = cen[t * 3] - cx, ey = cen[t * 3 + 1] - cy, ez = cen[t * 3 + 2] - cz;
      if (ex * ex + ey * ey + ez * ez > lim2) continue;
      const ia = this.vi(t, 0), ib = this.vi(t, 1), ic = this.vi(t, 2);
      const ax = pos[ia * 3], ay = pos[ia * 3 + 1], az = pos[ia * 3 + 2];
      const bx = pos[ib * 3], by = pos[ib * 3 + 1], bz = pos[ib * 3 + 2];
      const qx = pos[ic * 3], qy = pos[ic * 3 + 1], qz = pos[ic * 3 + 2];
      let facing = 1;
      if (dir) {
        const ux = bx - ax, uy = by - ay, uz = bz - az, wx = qx - ax, wy = qy - ay, wz = qz - az;
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        facing = (nx * dir.x + ny * dir.y + nz * dir.z) / nl;
        if (facing < (opts.minFacing ?? 0.05)) continue;
      }
      const ua = uv[ia * 2] * S, va = uv[ia * 2 + 1] * S;
      const ub = uv[ib * 2] * S, vb = uv[ib * 2 + 1] * S;
      const uc = uv[ic * 2] * S, vc = uv[ic * 2 + 1] * S;
      const area = (ub - ua) * (vc - va) - (uc - ua) * (vb - va);
      if (Math.abs(area) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ua, ub, uc) - 1)), x1 = Math.min(S - 1, Math.ceil(Math.max(ua, ub, uc) + 1));
      const y0 = Math.max(0, Math.floor(Math.min(va, vb, vc) - 1)), y1 = Math.min(S - 1, Math.ceil(Math.max(va, vb, vc) + 1));
      const eps = -1.2 / Math.max(4, Math.sqrt(Math.abs(area)));
      for (let y = y0; y <= y1; y++) {
        const py = y + 0.5;
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5;
          const w0 = ((ub - px) * (vc - py) - (uc - px) * (vb - py)) / area;
          const w1 = ((uc - px) * (va - py) - (ua - px) * (vc - py)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < eps || w1 < eps || w2 < eps) continue;
          const dx = w0 * ax + w1 * bx + w2 * qx - cx;
          const dy = w0 * ay + w1 * by + w2 * qy - cy;
          const dz = w0 * az + w1 * bz + w2 * qz - cz;
          const d2 = opts.distFn ? opts.distFn(dx, dy, dz) : dx * dx + dy * dy + dz * dz;
          if (d2 > r2) continue;
          cb((y * S + x) * 4, Math.sqrt(d2) / radius, dx, dy, dz, facing);
          touched = true;
        }
      }
    }
    if (touched) layer.dirty = true;
    return touched;
  }

  flush() {
    for (const l of Object.values(this.layers)) if (l.dirty) { l.tex.needsUpdate = true; l.dirty = false; }
  }

  dispose() { for (const l of Object.values(this.layers)) l.tex.dispose(); }
}

// ---- compositing helpers ---------------------------------------------------
function over(d, i, r, g, b, a) {
  // straight-alpha "over" into RGBA bytes; r,g,b in 0..1
  if (a <= 0) return;
  const da = d[i + 3] / 255;
  const oa = a + da * (1 - a);
  const f = a / oa;
  d[i] = (r * 255) * f + d[i] * (1 - f);
  d[i + 1] = (g * 255) * f + d[i + 1] * (1 - f);
  d[i + 2] = (b * 255) * f + d[i + 2] * (1 - f);
  d[i + 3] = oa * 255;
}
const maxCh = (d, i, v) => { const x = clamp(v) * 255; if (x > d[i]) d[i] = x; };
const addCh = (d, i, v) => { d[i] = Math.min(255, d[i] + clamp(v) * 255); };

function local(dx, dy, dz, B) {
  return [dx * B.t.x + dy * B.t.y + dz * B.t.z, dx * B.b.x + dy * B.b.y + dz * B.b.z];
}

// ---- washable skin layers (fx: r=dirt g=blood b=makeup a=wet) -------------------
export function paintDirt(s, c, n, r, amount, seed) {
  const B = basis(n); const d = s.layers.fx.data;
  s.paint('fx', c, r, (i, t, dx, dy, dz) => {
    const [lx, ly] = local(dx, dy, dz, B);
    const nz = fbm(lx * 22 + seed, ly * 22 - seed, 4, seed | 0);
    const w = Math.pow(1 - t, 1.1) * amount * (0.25 + nz * 1.25);
    addCh(d, i, w * 0.8);
  }, { normal: B.n, minFacing: -0.2 });
}
export function paintGrime(s, c, n, r, amount, seed) {
  const B = basis(n); const d = s.layers.fx.data;
  s.paint('fx', c, r, (i, t, dx, dy, dz) => {
    const [lx, ly] = local(dx, dy, dz, B);
    const nz = fbm(lx * 7 + seed, ly * 18, 3, seed | 0);
    addCh(d, i, smoothstep(1, 0.2, t) * amount * nz);
  }, { normal: B.n, minFacing: -0.3, distFn: (x, y, z) => x * x + y * y * 0.35 + z * z });
}
export function paintBlood(s, c, n, r, amount, seed, rng) {
  const B = basis(n); const d = s.layers.fx.data;
  const drops = [];
  for (let k = 0; k < 9; k++) drops.push([rng.gauss(0, r * 0.7), rng.gauss(0, r * 0.7), r * rng.float(0.04, 0.16)]);
  s.paint('fx', c, r * 2.2, (i, t, dx, dy, dz) => {
    const [lx, ly] = local(dx, dy, dz, B);
    const nz = fbm(lx * 40 + seed, ly * 40, 3, seed | 0);
    let v = smoothstep(0.5, 0.36, Math.hypot(lx, ly) / r + (nz - 0.5) * 0.5);
    for (const [ox, oy, rr] of drops) v = Math.max(v, smoothstep(rr, rr * 0.7, Math.hypot(lx - ox, ly - oy)));
    // drip downward
    if (ly < 0 && Math.abs(lx) < r * 0.08) v = Math.max(v, smoothstep(r * 1.6, 0, -ly) * smoothstep(r * 0.08, 0, Math.abs(lx + Math.sin(ly * 60) * 0.004)) * 0.8);
    maxCh(d, i + 1, v * amount);
  }, { normal: B.n, minFacing: 0 });
}
export function paintMakeup(s, c, n, r) {
  const B = basis(n); const d = s.layers.fx.data;
  s.paint('fx', c, r, (i, t, dx, dy, dz) => {
    const [lx, ly] = local(dx, dy, dz, B);
    const nz = valueNoise(lx * 30, ly * 30, 7);
    maxCh(d, i + 2, smoothstep(1, 0.72, t + nz * 0.12));
  }, { normal: B.n, minFacing: -0.25 });
}

// ---- conditions (cond = RGBA overlay, glow = UV fluorescence mask) ---------------
export function paintDiscolor(s, c, n, r, color, seed) {
  const B = basis(n); const d = s.layers.cond.data;
  s.paint('cond', c, r, (i, t, dx, dy, dz) => {
    const [lx, ly] = local(dx, dy, dz, B);
    const vein = Math.pow(1 - Math.abs(2 * fbm(lx * 26 + seed, ly * 26, 4, seed | 0) - 1), 7);
    const blot = smoothstep(1, 0.35, t + (fbm(lx * 8, ly * 8 + seed, 3, 3) - 0.5) * 0.5);
    const a = clamp(blot * 0.55 + vein * blot * 0.6) * 0.92;
    const k = vein * 0.5;
    over(d, i, color[0] * (1 - k), color[1] * (1 - k), color[2] * (1 - k), a);
  }, { normal: B.n, minFacing: -0.3 });
}

export function paintBite(s, c, n, scale, rng, infected = true) {
  const B = basis(n); const d = s.layers.cond.data; const gl = s.layers.glow?.data;
  const rx = 0.022 * scale, ry = 0.015 * scale;
  const ang = rng.float(0, Math.PI * 2);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const teeth = [];
  for (let k = 0; k < 7; k++) { const a = Math.PI * (0.15 + 0.7 * k / 6); teeth.push([Math.cos(a) * rx, Math.sin(a) * ry + ry * 0.15]); }
  for (let k = 0; k < 6; k++) { const a = Math.PI * (1.2 + 0.6 * k / 5); teeth.push([Math.cos(a) * rx * 0.92, Math.sin(a) * ry - ry * 0.1]); }
  s.paint('cond', c, rx * 2.6, (i, t, dx, dy, dz) => {
    let [lx, ly] = local(dx, dy, dz, B);
    [lx, ly] = [lx * ca - ly * sa, lx * sa + ly * ca];
    const e = Math.hypot(lx / rx, ly / ry);
    // bruise halo
    over(d, i, 0.62, 0.22, 0.24, 0.45 * Math.exp(-((e - 1) ** 2) / 0.25));
    if (infected) over(d, i, 0.42, 0.45, 0.22, 0.35 * smoothstep(1.9, 0.9, e));
    let tooth = 0;
    for (const [tx, ty] of teeth) tooth = Math.max(tooth, smoothstep(0.0034 * scale, 0.0016 * scale, Math.hypot((lx - tx) * 0.8, ly - ty)));
    over(d, i, 0.3, 0.03, 0.05, tooth * 0.95);
  }, { normal: B.n, minFacing: -0.2 });
  if (gl && infected) {
    s.paint('glow', c, rx * 2.2, (i, t) => maxCh(gl, i, smoothstep(1, 0.4, t)), { normal: B.n, minFacing: -0.2 });
  }
}

export function paintBurn(s, c, n, r, seed) {
  const B = basis(n); const d = s.layers.cond.data;
  s.paint('cond', c, r, (i, t, dx, dy, dz) => {
    const [lx, ly] = local(dx, dy, dz, B);
    const nz = fbm(lx * 14 + seed, ly * 14, 4, seed | 0);
    const edge = t + (nz - 0.5) * 0.7;
    const a = smoothstep(1, 0.6, edge);
    const core = smoothstep(0.7, 0.15, edge);
    over(d, i, 0.78 - core * 0.3, 0.26 - core * 0.12, 0.18 - core * 0.08, a * 0.88);
    const blister = smoothstep(0.78, 0.86, valueNoise(lx * 160, ly * 160, seed | 0)) * core;
    over(d, i, 0.92, 0.78, 0.62, blister * 0.8);
  }, { normal: B.n, minFacing: -0.2 });
}

export function paintCut(s, c, n, len, rng) {
  const B = basis(n); const d = s.layers.cond.data;
  const ang = rng.float(0, Math.PI);
  const ux = Math.cos(ang), uy = Math.sin(ang);
  s.paint('cond', c, len * 0.75, (i, t, dx, dy, dz) => {
    const [lx, ly] = local(dx, dy, dz, B);
    const along = clamp((lx * ux + ly * uy) / (len * 0.5), -1, 1) * len * 0.5;
    const dist = Math.hypot(lx - ux * along, ly - uy * along);
    const taper = 1 - Math.abs(along) / (len * 0.5);
    over(d, i, 0.85, 0.48, 0.44, 0.35 * smoothstep(0.007, 0.0015, dist));
    over(d, i, 0.38, 0.03, 0.03, smoothstep(0.0012 + 0.0012 * taper, 0.0005, dist) * 0.95);
  }, { normal: B.n, minFacing: -0.2 });
}

export function paintBruise(s, c, n, r, seed) {
  const B = basis(n); const d = s.layers.cond.data;
  s.paint('cond', c, r, (i, t, dx, dy, dz) => {
    const [lx, ly] = local(dx, dy, dz, B);
    const nz = fbm(lx * 12 + seed, ly * 12, 3, 5);
    const k = smoothstep(0.2, 0.9, t);
    const a = Math.pow(1 - t, 1.4) * (0.4 + nz * 0.4);
    over(d, i, 0.45 + k * 0.2, 0.25 + k * 0.32, 0.42 - k * 0.12, a * 0.7);
  }, { normal: B.n, minFacing: -0.2 });
}

export function paintTattoo(s, c, n, r, seed) {
  const B = basis(n); const d = s.layers.cond.data;
  s.paint('cond', c, r, (i, t, dx, dy, dz) => {
    const [lx, ly] = local(dx, dy, dz, B);
    const a2 = Math.atan2(ly, lx), rr = Math.hypot(lx, ly) / r;
    const ring = smoothstep(0.08, 0.03, Math.abs(rr - 0.7)) + smoothstep(0.06, 0.02, Math.abs(rr - 0.4 - 0.08 * Math.sin(a2 * 5 + seed)));
    over(d, i, 0.08, 0.1, 0.16, clamp(ring) * 0.8);
  }, { normal: B.n, minFacing: -0.2 });
}

// ---- clothing overlays (ov = RGBA, glow = UV mask) ---------------------------------
export function paintWear(s, c, n, r, seed, tris) {
  const d = s.layers.ov.data;
  s.paint('ov', c, r, (i, t, dx, dy, dz) => {
    const nz = fbm(dx * 9 + seed, dy * 9 + dz * 9, 4, seed | 0);
    over(d, i, 0.42, 0.37, 0.3, smoothstep(0.45, 0.85, nz) * (1 - t) * 0.45);
  }, { tris });
}
export function paintMud(s, c, n, r, seed, tris) {
  const d = s.layers.ov.data;
  s.paint('ov', c, r, (i, t, dx, dy, dz) => {
    const nz = fbm(dx * 30 + seed, dy * 30 + dz * 17, 4, seed | 0);
    const v = smoothstep(0.62, 0.5, t * 0.75 + (1 - nz) * 0.45);
    over(d, i, 0.29 + nz * 0.06, 0.21 + nz * 0.04, 0.13, v * 0.85);
  }, { tris });
}
export function paintSlime(s, c, n, r, seed, tris) {
  const d = s.layers.ov.data; const gl = s.layers.glow.data;
  s.paint('ov', c, r, (i, t, dx, dy, dz) => {
    const nz = fbm(dx * 26 + seed, dy * 26 - dz * 11, 4, seed | 0);
    const v = smoothstep(0.6, 0.45, t * 0.7 + (1 - nz) * 0.5);
    over(d, i, 0.4, 0.5 + nz * 0.1, 0.1, v * 0.82);
    const spot = smoothstep(0.82, 0.9, valueNoise(dx * 260, dy * 260 + dz * 190, seed | 0)) * v;
    over(d, i, 0.08, 0.12, 0.04, spot);
  }, { tris });
  s.paint('glow', c, r, (i, t) => maxCh(gl, i, smoothstep(1, 0.5, t) * 0.7), { tris });
}
export function paintUVStain(s, c, n, r, seed, tris) {
  const d = s.layers.ov.data; const gl = s.layers.glow.data;
  s.paint('ov', c, r, (i, t, dx, dy, dz) => {
    const nz = fbm(dx * 20 + seed, dy * 20 + dz * 13, 3, seed | 0);
    over(d, i, 0.78, 0.74, 0.58, smoothstep(0.7, 0.4, t * 0.7 + (1 - nz) * 0.4) * 0.12);
  }, { tris });
  s.paint('glow', c, r, (i, t, dx, dy, dz) => {
    const nz = fbm(dx * 20 + seed, dy * 20 + dz * 13, 3, seed | 0);
    maxCh(gl, i, smoothstep(0.7, 0.4, t * 0.7 + (1 - nz) * 0.4));
  }, { tris });
}
export function paintChem(s, c, n, r, seed, tris) {
  const d = s.layers.ov.data;
  s.paint('ov', c, r, (i, t, dx, dy, dz) => {
    const nz = fbm(dx * 18 + seed, dy * 18 + dz * 9, 4, seed | 0);
    const e = t * 0.8 + (1 - nz) * 0.4;
    const core = smoothstep(0.62, 0.45, e);
    const rim = smoothstep(0.12, 0.0, Math.abs(e - 0.6));
    over(d, i, 0.09, 0.08, 0.11, core * 0.8);
    const [r1, g1, b1] = hsl(e * 3 + nz, 0.8, 0.45);
    over(d, i, r1, g1, b1, rim * 0.6);
  }, { tris });
}
export function paintLice(s, c, n, r, seed, tris) {
  const d = s.layers.ov.data;
  const cell = 0.009;
  s.paint('ov', c, r, (i, t, dx, dy, dz) => {
    // project to the dominant plane for a cheap 2D scatter
    const u = dx + dz * 0.7, v = dy - dz * 0.5;
    const cx = Math.floor(u / cell), cy = Math.floor(v / cell);
    const h = valueNoise(cx * 7.13, cy * 3.71, seed | 0);
    if (h < 0.55) return;
    const ox = (cx + valueNoise(cx, cy, 11)) * cell, oy = (cy + valueNoise(cx, cy, 23)) * cell;
    const dd = Math.hypot((u - ox) * 0.7, v - oy);
    if (h > 0.9) over(d, i, 0.93, 0.92, 0.85, smoothstep(0.0011, 0.0005, dd) * (1 - t));
    else over(d, i, 0.12, 0.08, 0.05, smoothstep(0.0016, 0.0008, dd) * (1 - t * 0.5));
  }, { tris });
}
