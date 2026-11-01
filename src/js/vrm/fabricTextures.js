// Procedural, tileable fabric detail: normal map (RGB) + height in alpha, and a
// roughness map. Applied to clothing at a high UV repeat so the cloth weave,
// knit, twill or grain shows under lighting.
import * as THREE from 'three';
import { tileNoise, tileFbm } from '../util.js';

const S = 256;
const TAU = Math.PI * 2;

// height functions over the unit square (must tile)
const H = {
  cotton: (u, v) => {
    // plain weave: threads alternate over/under, with slubby yarn variation
    const cu = u * 8, cv = v * 8;
    const over = Math.sign(Math.sin(Math.floor(cu) * Math.PI + Math.PI / 2) * Math.sin(Math.floor(cv) * Math.PI + Math.PI / 2));
    const tu = Math.sin((cu % 1) * Math.PI), tv = Math.sin((cv % 1) * Math.PI);
    const w = over > 0 ? tu * 0.7 + tv * 0.3 : tv * 0.7 + tu * 0.3;
    return 0.5 + 0.25 * w + (tileFbm(u * 4, v * 32, 4, 3, 3) - 0.5) * 0.3;
  },
  knit: (u, v) => {
    // stockinette: columns of interlocking V loops
    const cu = u * 8, cv = v * 12;
    const col = cu % 1, row = cv % 1;
    const leg = Math.abs(col - 0.5) * 2;
    const loop = Math.sin(((row + leg * 0.5) % 1) * Math.PI);
    const groove = Math.pow(Math.sin(col * Math.PI), 0.35);
    return 0.35 + 0.4 * loop * groove + (tileNoise(u * 64, v * 64, 64, 5) - 0.5) * 0.1;
  },
  denim: (u, v) => {
    const tw = Math.sin(((u * 6 + v * 6) % 1) * Math.PI);
    return 0.5 + 0.22 * tw + (tileFbm(u * 3, v * 24, 3, 3, 8) - 0.5) * 0.4;
  },
  silk: (u, v) => 0.5 + 0.06 * Math.sin(u * TAU * 8) + (tileNoise(u * 2, v * 32, 2, 2) - 0.5) * 0.1,
  sheer: (u, v) => {
    const a = Math.abs(Math.sin(u * Math.PI * 10)), b = Math.abs(Math.sin(v * Math.PI * 10));
    return 0.3 + 0.35 * Math.pow(a, 3) + 0.35 * Math.pow(b, 3);
  },
  leather: (u, v) => {
    const n = tileFbm(u * 12, v * 12, 12, 3, 12);
    const crease = 1 - Math.abs(tileNoise(u * 6, v * 6, 6, 13) * 2 - 1);
    return 0.5 + (n - 0.5) * 0.7 - Math.pow(crease, 6) * 0.35;
  },
  rubber: (u, v) => 0.5 + (tileNoise(u * 48, v * 48, 48, 21) - 0.5) * 0.3,
  metal: (u, v) => 0.5 + (tileNoise(u * 2, v * 128, 128, 31) - 0.5) * 0.4,
  latex: () => 0.5,
  plastic: (u, v) => 0.5 + (tileNoise(u * 32, v * 32, 32, 41) - 0.5) * 0.05,
};
const STRENGTH = { cotton: 1.6, knit: 2.6, denim: 3.4, silk: 0.8, sheer: 2.0, leather: 2.5, rubber: 1.2, metal: 1.0, latex: 0, plastic: 0.4 };
export const FABRIC_REPEAT = { cotton: 60, knit: 40, denim: 60, silk: 60, sheer: 60, leather: 30, rubber: 40, metal: 12, latex: 1, plastic: 20 };
// physical size (metres) of one texture tile on the garment
export const FABRIC_TILE_M = { cotton: 0.022, knit: 0.035, denim: 0.03, silk: 0.03, sheer: 0.02, leather: 0.05, rubber: 0.03, metal: 0.12, latex: 1, plastic: 0.06 };
const ROUGH_VAR = { cotton: 0.12, knit: 0.15, denim: 0.15, silk: 0.25, sheer: 0.1, leather: 0.3, rubber: 0.1, metal: 0.3, latex: 0.04, plastic: 0.05 };

const cache = new Map();
export function fabricTextures(fabric) {
  if (cache.has(fabric)) return cache.get(fabric);
  const fn = H[fabric] || H.cotton;
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = fn(x / S, y / S);
  const nd = new Uint8Array(S * S * 4), rd = new Uint8Array(S * S * 4);
  const k = STRENGTH[fabric] ?? 2;
  const rv = ROUGH_VAR[fabric] ?? 0.1;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const l = h[y * S + ((x - 1 + S) % S)], r = h[y * S + ((x + 1) % S)];
    const t = h[((y - 1 + S) % S) * S + x], b = h[((y + 1) % S) * S + x];
    let nx = (l - r) * k, ny = (t - b) * k, nz = 1;
    const len = Math.hypot(nx, ny, nz);
    const i = (y * S + x) * 4;
    nd[i] = (nx / len * 0.5 + 0.5) * 255; nd[i + 1] = (ny / len * 0.5 + 0.5) * 255; nd[i + 2] = (nz / len * 0.5 + 0.5) * 255;
    nd[i + 3] = Math.max(0, Math.min(1, h[y * S + x])) * 255;
    // roughness: grooves rougher, raised threads a bit smoother
    const rr = Math.max(0, Math.min(1, 1 - (h[y * S + x] - 0.5) * rv * 2)) * 255;
    rd[i] = rd[i + 1] = rd[i + 2] = rr; rd[i + 3] = 255;
  }
  const mk = (data) => {
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    const rep = FABRIC_REPEAT[fabric] || 50;
    t.repeat.set(rep, rep);
    t.needsUpdate = true;
    return t;
  };
  const out = { normal: mk(nd), rough: mk(rd), flat: fabric === 'latex' };
  cache.set(fabric, out);
  return out;
}

// Per-garment copy with a repeat matched to the garment's UV density
// (metres of surface per UV unit). Clones share the GPU image.
const scaled = new Map();
export function scaledFabricTextures(fabric, uvDensity) {
  const base = fabricTextures(fabric);
  if (!uvDensity || base.flat) return base;
  const rep = Math.max(2, Math.round(uvDensity / (FABRIC_TILE_M[fabric] || 0.03)));
  const key = fabric + ':' + rep;
  if (!scaled.has(key)) {
    const n = base.normal.clone(); n.repeat.set(rep, rep); n.needsUpdate = true;
    const r = base.rough.clone(); r.repeat.set(rep, rep); r.needsUpdate = true;
    scaled.set(key, { normal: n, rough: r, flat: false });
  }
  return scaled.get(key);
}

// metres of surface per UV unit, measured over the given triangles
export function uvDensity(geometry, tris = null) {
  const p = geometry.attributes.position, uv = geometry.attributes.uv;
  const idx = geometry.index ? geometry.index.array : null;
  if (!uv) return 0;
  let a3 = 0, a2 = 0;
  const n = tris ? tris.length : (idx ? idx.length / 3 : p.count / 3);
  for (let k = 0; k < n; k++) {
    const t = tris ? tris[k] : k;
    const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
    const ax = p.getX(i1) - p.getX(i0), ay = p.getY(i1) - p.getY(i0), az = p.getZ(i1) - p.getZ(i0);
    const bx = p.getX(i2) - p.getX(i0), by = p.getY(i2) - p.getY(i0), bz = p.getZ(i2) - p.getZ(i0);
    a3 += Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2;
    const u1 = uv.getX(i1) - uv.getX(i0), v1 = uv.getY(i1) - uv.getY(i0), u2 = uv.getX(i2) - uv.getX(i0), v2 = uv.getY(i2) - uv.getY(i0);
    a2 += Math.abs(u1 * v2 - u2 * v1) / 2;
  }
  return a2 > 1e-9 ? Math.sqrt(a3 / a2) : 0;
}
