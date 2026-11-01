// Procedural PBR textures (albedo / roughness / normal) generated on canvases.
import * as THREE from 'three';
import { tileFbm, tileNoise, clamp } from './util.js';

function canvas(s) { const c = document.createElement('canvas'); c.width = c.height = s; return c; }

function heightToNormal(h, s, strength = 2) {
  const c = canvas(s);
  const g = c.getContext('2d');
  const img = g.createImageData(s, s);
  const d = img.data;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const l = h[y * s + ((x - 1 + s) % s)], r = h[y * s + ((x + 1) % s)];
    const u = h[((y - 1 + s) % s) * s + x], dn = h[((y + 1) % s) * s + x];
    let nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz);
    const i = (y * s + x) * 4;
    d[i] = (nx / len * 0.5 + 0.5) * 255; d[i + 1] = (ny / len * 0.5 + 0.5) * 255; d[i + 2] = (nz / len * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function toTex(c, srgb, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}

function build(s, fn, normalStrength) {
  const albedo = canvas(s), rough = canvas(s);
  const ga = albedo.getContext('2d'), gr = rough.getContext('2d');
  const ia = ga.createImageData(s, s), ir = gr.createImageData(s, s);
  const h = new Float32Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const o = fn(x / s, y / s, x, y);
    const i = (y * s + x) * 4;
    ia.data[i] = clamp(o.c[0]) * 255; ia.data[i + 1] = clamp(o.c[1]) * 255; ia.data[i + 2] = clamp(o.c[2]) * 255; ia.data[i + 3] = 255;
    const rv = clamp(o.r) * 255;
    ir.data[i] = ir.data[i + 1] = ir.data[i + 2] = rv; ir.data[i + 3] = 255;
    h[y * s + x] = o.h;
  }
  ga.putImageData(ia, 0, 0); gr.putImageData(ir, 0, 0);
  return { albedo, rough, normal: heightToNormal(h, s, normalStrength) };
}

const cache = new Map();
function cached(key, f) { if (!cache.has(key)) cache.set(key, f()); return cache.get(key); }

export function makeMaterial(kind, repeat = [1, 1], extra = {}) {
  const set = cached(kind, () => GENERATORS[kind]());
  const params = { map: toTex(set.albedo, true, repeat), roughnessMap: toTex(set.rough, false, repeat), normalMap: toTex(set.normal, false, repeat), ...set.params, ...extra };
  return new THREE.MeshStandardMaterial(params);
}

const GENERATORS = {
  concrete: () => ({ ...build(512, (u, v) => {
    const n = tileFbm(u * 8, v * 8, 8, 5, 1), m = tileFbm(u * 32, v * 32, 32, 3, 2);
    const stain = tileFbm(u * 3, v * 3, 3, 4, 9);
    const g = 0.42 + (n - 0.5) * 0.08 + (m - 0.5) * 0.05 - Math.max(0, stain - 0.62) * 0.2;
    const pit = tileNoise(u * 180, v * 180, 180, 4) > 0.92 ? -0.15 : 0;
    return { c: [g * 0.98, g * 0.97, g * 0.94], r: 0.82 + (m - 0.5) * 0.2, h: n * 0.5 + m * 0.3 + pit };
  }, 3), params: { metalness: 0 } }),
  tiles: () => ({ ...build(512, (u, v) => {
    const N = 8, tu = (u * N) % 1, tv = (v * N) % 1;
    const cx = Math.floor(u * N), cy = Math.floor(v * N);
    const grout = Math.min(tu, 1 - tu, tv, 1 - tv) < 0.035;
    const tileVar = tileNoise(cx * 3.3, cy * 7.1, 1000, 3) * 0.06;
    const grime = tileFbm(u * 6, v * 6, 6, 4, 4);
    const dirt = Math.max(0, grime - 0.55) * 0.6;
    if (grout) { const g = 0.3 - dirt * 0.5; return { c: [g, g * 0.98, g * 0.92], r: 0.95, h: 0 }; }
    const base = 0.78 + tileVar - dirt * 0.5;
    const edge = Math.min(tu, 1 - tu, tv, 1 - tv);
    return { c: [base * 0.88, base * 0.93, base * 0.92], r: 0.18 + dirt * 0.8 + tileNoise(u * 64, v * 64, 64, 6) * 0.08, h: Math.min(1, edge * 12) };
  }, 4), params: { metalness: 0 } }),
  floorTiles: () => ({ ...build(512, (u, v) => {
    const N = 4, tu = (u * N) % 1, tv = (v * N) % 1;
    const grout = Math.min(tu, 1 - tu, tv, 1 - tv) < 0.02;
    const grime = tileFbm(u * 5, v * 5, 5, 4, 7);
    const spk = tileNoise(u * 256, v * 256, 256, 8);
    const dirt = Math.max(0, grime - 0.5) * 0.5;
    if (grout) return { c: [0.18, 0.18, 0.17], r: 0.95, h: 0 };
    const g = 0.36 + (spk - 0.5) * 0.06 - dirt * 0.4;
    return { c: [g * 0.95, g, g * 1.02], r: 0.35 + dirt * 0.5, h: 1 };
  }, 3), params: { metalness: 0 } }),
  metal: () => ({ ...build(512, (u, v) => {
    const brush = tileNoise(u * 2, v * 256, 256, 3) * 0.5 + tileNoise(u * 4, v * 512, 512, 5) * 0.5;
    const scratch = tileNoise(u * 64, v * 4, 64, 6) > 0.93 ? 0.12 : 0;
    const grime = tileFbm(u * 4, v * 4, 4, 4, 2);
    const g = 0.55 + (brush - 0.5) * 0.12 + scratch - Math.max(0, grime - 0.55) * 0.5;
    return { c: [g, g * 1.01, g * 1.03], r: 0.35 + (brush - 0.5) * 0.2 + Math.max(0, grime - 0.55), h: brush * 0.2 };
  }, 1), params: { metalness: 0.85 } }),
  panel: () => ({ ...build(512, (u, v) => {
    const N = 2, tu = (u * N) % 1, tv = (v * N) % 1;
    const seam = Math.min(tu, 1 - tu, tv, 1 - tv);
    const rivet = [[0.06, 0.06], [0.94, 0.06], [0.06, 0.94], [0.94, 0.94]].some(([a, b]) => Math.hypot(tu - a, tv - b) < 0.018);
    const grime = tileFbm(u * 4, v * 4, 4, 4, 12);
    const streak = tileFbm(u * 24, v * 2, 24, 3, 3);
    const g = 0.42 - Math.max(0, grime - 0.5) * 0.4 - (streak - 0.5) * 0.08;
    let h = seam < 0.012 ? 0 : 1;
    if (rivet) h = 1.4;
    return { c: [g * 0.92, g * 0.97, g], r: 0.45 + Math.max(0, grime - 0.5) * 0.8, h };
  }, 3), params: { metalness: 0.6 } }),
  rust: () => ({ ...build(512, (u, v) => {
    const n = tileFbm(u * 6, v * 6, 6, 5, 21), m = tileFbm(u * 40, v * 40, 40, 3, 22);
    const r = n > 0.5 ? 1 : 0;
    const c = r ? [0.4 + m * 0.15, 0.2 + m * 0.06, 0.1] : [0.32, 0.3, 0.28];
    return { c, r: r ? 0.9 : 0.5, h: n + m * 0.3 };
  }, 3), params: { metalness: 0.4 } }),
  rubber: () => ({ ...build(256, (u, v) => {
    const n = tileNoise(u * 128, v * 128, 128, 4);
    return { c: [0.06, 0.06, 0.065], r: 0.8 + n * 0.1, h: n * 0.2 };
  }, 1), params: { metalness: 0 } }),
  grate: () => ({ ...build(256, (u, v) => {
    const N = 16, tu = (u * N) % 1;
    const bar = tu < 0.35;
    return { c: bar ? [0.3, 0.3, 0.31] : [0.02, 0.02, 0.02], r: bar ? 0.5 : 1, h: bar ? 1 : 0 };
  }, 3), params: { metalness: 0.8 } }),
  wood: () => ({ ...build(256, (u, v) => {
    const n = tileFbm(u * 4, v * 1, 4, 4, 31);
    const fine = tileNoise(u * 256, v * 8, 256, 33);
    const g = 0.2 + n * 0.05 + fine * 0.03;
    return { c: [g, g * 0.78, g * 0.6], r: 0.45 + fine * 0.15, h: fine * 0.1 };
  }, 1), params: { metalness: 0 } }),
};
