// Underwear catalogue, random selection, compositing and built-in underwear
// removal. All textures are 2048px and already mapped to the VRoid body UVs.
import { RNG, luminance, hsl } from '../util.js';

const BASE = '../assets/underwear/';
let manifest = null;
let regionMask = null; // Uint8Array 1024*1024
const imgCache = new Map();

export function loadImage(url) {
  if (!imgCache.has(url)) {
    imgCache.set(url, new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('failed to load ' + url));
      i.src = url;
    }));
  }
  return imgCache.get(url);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export async function initUnderwear() {
  if (manifest) return manifest;
  manifest = await (await fetch(BASE + 'manifest.json')).json();
  const img = await loadImage(BASE + 'region-mask.png');
  const c = canvas(1024, 1024);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, 1024, 1024);
  const d = g.getImageData(0, 0, 1024, 1024).data;
  regionMask = new Uint8Array(1024 * 1024);
  for (let i = 0; i < regionMask.length; i++) regionMask[i] = d[i * 4] > 127 ? 1 : 0;
  return manifest;
}
export const getManifest = () => manifest;

// ---- selection --------------------------------------------------------------
const MALE_MAIN = ['BoyshortLegoBlack', 'HipstersLegoBlack', 'BriefsLegoBlack', 'TrimmedBriefsLegoBlack', 'TrimmedFullBriefLegoBlack'];
const MALE_EXTRA = ['BikiniHipstersLegoBlack', 'ShapingBriefsLegoBlack', 'TycoonsLegoBlack', 'HalfTycoonsLegoBlack', 'HighRiseLegoBlack', 'EriHighBriefsLegoBlack', 'EorzeanBriefsLegoBlack'];
const FIXED_SETS = [
  { bra: 'BraFloralPastelPink', bottom: 'BikiniBriefFloralPastelPink' },
  { bra: 'StraplessBraFloralPastelPink', bottom: 'BikiniBriefFloralPastelPink' },
  { bra: 'BraFloralNude', bottom: 'BikiniBriefFloralPastelPink' },
];

const MALE_COLORS = [
  [[0.05, 0.05, 0.06], 5], [[0.22, 0.23, 0.25], 3], [[0.92, 0.92, 0.9], 3], [[0.1, 0.13, 0.28], 3],
  [[0.45, 0.47, 0.5], 2], [[0.25, 0.28, 0.16], 1], [[0.36, 0.08, 0.1], 1], [[0.55, 0.68, 0.82], 1.5], [[0.6, 0.55, 0.45], 1],
];
const FEMALE_COLORS = [
  [[0.04, 0.04, 0.05], 5], [[0.95, 0.94, 0.92], 5], [[0.86, 0.72, 0.62], 3], [[0.96, 0.75, 0.8], 3], [[0.78, 0.08, 0.15], 2],
  [[0.55, 0.06, 0.18], 1.5], [[0.62, 0.78, 0.95], 2], [[0.12, 0.16, 0.38], 1.5], [[0.74, 0.65, 0.9], 1.5], [[0.68, 0.9, 0.78], 1.2],
  [[0.98, 0.85, 0.55], 1], [[0.5, 0.5, 0.52], 1.5], [[0.95, 0.45, 0.6], 1.2], [[0.3, 0.12, 0.4], 1], [[0.12, 0.36, 0.3], 1],
];

function jitter(rng, c, amt = 0.04) { return c.map((v) => Math.min(1, Math.max(0, v + rng.float(-amt, amt)))); }
function printColorFor(rng, base) {
  const l = luminance(base);
  if (rng.chance(0.35)) return l > 0.5 ? [0.05, 0.05, 0.06] : [0.97, 0.97, 0.96];
  const h = rng.next();
  return l > 0.55 ? hsl(h, rng.float(0.4, 0.8), rng.float(0.25, 0.45)) : hsl(h, rng.float(0.3, 0.8), rng.float(0.65, 0.85));
}

export function underwearIsFixedColor(file) {
  const e = manifest.bottoms.concat(manifest.bras).find((x) => x.file === file || x.name === file);
  return e ? !e.recolor : false;
}

export function chooseUnderwear(rng, sex) {
  const m = manifest;
  const names = (kind) => m[kind].map((e) => e.name);
  const mk = (name, color, print) => ({ file: name + '.png', color, print });
  const randPrint = (p, base) => (rng.chance(p) ? { file: rng.pick(m.prints).file, color: printColorFor(rng, base) } : null);
  if (sex === 'male') {
    const name = rng.chance(0.9) ? rng.pick(MALE_MAIN) : rng.pick(MALE_EXTRA);
    const color = jitter(rng, rng.weighted(MALE_COLORS));
    return { bottom: mk(name, color, randPrint(0.01, color)), bra: null, matching: false };
  }
  const recolorBottoms = m.bottoms.filter((e) => e.recolor).map((e) => e.name);
  const recolorBras = m.bras.filter((e) => e.recolor).map((e) => e.name);
  const hasBra = rng.chance(0.96);
  const matching = hasBra && rng.chance(0.7);
  if (matching) {
    if (rng.chance(0.1)) {
      const s = rng.pick(FIXED_SETS);
      return { bottom: mk(s.bottom, [1, 1, 1], null), bra: mk(s.bra, [1, 1, 1], null), matching: true };
    }
    const color = jitter(rng, rng.weighted(FEMALE_COLORS));
    const print = randPrint(0.2, color);
    return { bottom: mk(rng.pick(recolorBottoms), color, print), bra: mk(rng.pick(recolorBras), color, print ? { ...print } : null), matching: true };
  }
  const bName = rng.pick(names('bottoms'));
  const bColor = jitter(rng, rng.weighted(FEMALE_COLORS));
  const bottom = mk(bName, bColor, underwearIsFixedColor(bName) ? null : randPrint(0.2, bColor));
  let bra = null;
  if (hasBra) {
    const rName = rng.pick(names('bras'));
    let rColor = jitter(rng, rng.weighted(FEMALE_COLORS));
    bra = mk(rName, rColor, underwearIsFixedColor(rName) ? null : randPrint(0.2, rColor));
  }
  return { bottom, bra, matching: false };
}

// ---- compositing -----------------------------------------------------------
async function drawLayer(ctx, kind, layer, size) {
  const e = manifest[kind].find((x) => x.file === layer.file);
  if (!e) return;
  const img = await loadImage(BASE + kind + '/' + e.file);
  const [x0, y0, x1, y1] = e.bbox;
  const w = x1 - x0, h = y1 - y0;
  const c = canvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, -x0, -y0);
  const d = g.getImageData(0, 0, w, h);
  const px = d.data;
  let pm = null;
  if (layer.print && e.recolor) {
    const pimg = await loadImage(BASE + 'prints/' + layer.print.file);
    const pc = canvas(w, h);
    const pg = pc.getContext('2d', { willReadFrequently: true });
    pg.drawImage(pimg, -x0, -y0);
    pm = pg.getImageData(0, 0, w, h).data;
  }
  if (e.recolor) {
    const base = Math.max(1, e.baseLum);
    const [cr, cg, cb] = layer.color.map((v) => v * 255);
    let pr = 0, pgc = 0, pb = 0;
    if (pm) [pr, pgc, pb] = layer.print.color.map((v) => v * 255);
    let t0 = performance.now();
    for (let i = 0; i < px.length; i += 4) {
      // yield to the frame loop now and then so compositing never causes a hitch
      if ((i & 0xffff) === 0 && performance.now() - t0 > 6) { await new Promise((r) => setTimeout(r, 0)); t0 = performance.now(); }
      if (px[i + 3] === 0) continue;
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      let r, gg, b;
      if (lum <= base) {
        const k = lum / base;
        r = cr * k; gg = cg * k; b = cb * k;
      } else {
        const t = Math.min(1, (lum - base) / (255 - base));
        r = cr + (255 - cr) * t; gg = cg + (255 - cg) * t; b = cb + (255 - cb) * t;
      }
      if (pm) {
        // print textures are masks: only the white parts carry the print colour
        const m = (0.299 * pm[i] + 0.587 * pm[i + 1] + 0.114 * pm[i + 2]) / 255;
        const shade = Math.min(1.15, 0.8 + 0.2 * (lum / base));
        r += (pr * shade - r) * m; gg += (pgc * shade - gg) * m; b += (pb * shade - b) * m;
      }
      px[i] = r; px[i + 1] = gg; px[i + 2] = b;
    }
    g.putImageData(d, 0, 0);
  }
  const s = size / 2048;
  ctx.drawImage(c, x0 * s, y0 * s, w * s, h * s);
}

export async function composeUnderwear(spec, size = 2048) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  if (spec.bottom) await drawLayer(ctx, 'bottoms', spec.bottom, size);
  if (spec.bra) await drawLayer(ctx, 'bras', spec.bra, size);
  return c;
}

// ---- built-in underwear removal --------------------------------------------
// The VRoid body texture has underwear painted on. Inside the union of all
// underwear shapes, pixels that differ strongly from the skin colour are
// treated as painted underwear and filled in from surrounding skin.
export function cleanBodyTexture(image, threshold = 60) {
  const W = image.width, H = image.height;
  const c = canvas(W, H);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0);
  if (!regionMask || threshold <= 0) return c;
  const d = g.getImageData(0, 0, W, H);
  const px = d.data;
  const inRegion = (x, y) => regionMask[((y * 1024 / H) | 0) * 1024 + ((x * 1024 / W) | 0)];
  // skin reference colour = median outside region
  const rs = [], gs = [], bs = [];
  for (let y = 0; y < H; y += 7) for (let x = 0; x < W; x += 7) {
    const i = (y * W + x) * 4;
    if (px[i + 3] > 128 && !inRegion(x, y)) { rs.push(px[i]); gs.push(px[i + 1]); bs.push(px[i + 2]); }
  }
  const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1] || 255; };
  const R = med(rs), G = med(gs), B = med(bs);
  const th2 = threshold * threshold;
  const mark = new Uint8Array(W * H);
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inRegion(x, y)) continue;
    const i = (y * W + x) * 4;
    const dr = px[i] - R, dg = px[i + 1] - G, db = px[i + 2] - B;
    if (dr * dr + dg * dg + db * db > th2) {
      mark[y * W + x] = 1;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return c;
  // dilate twice (catches anti-aliased edges)
  for (let pass = 0; pass < 2; pass++) {
    const nm = mark.slice();
    for (let y = Math.max(1, minY - 2); y < Math.min(H - 1, maxY + 3); y++) for (let x = Math.max(1, minX - 2); x < Math.min(W - 1, maxX + 3); x++) {
      if (mark[y * W + x]) continue;
      if (mark[y * W + x - 1] || mark[y * W + x + 1] || mark[(y - 1) * W + x] || mark[(y + 1) * W + x]) nm[y * W + x] = 1;
    }
    mark.set(nm);
    minX = Math.max(1, minX - 1); minY = Math.max(1, minY - 1); maxX = Math.min(W - 2, maxX + 1); maxY = Math.min(H - 2, maxY + 1);
  }
  // onion-peel fill from the boundary inwards
  const queue = new Int32Array(W * H);
  let qh = 0, qt = 0;
  const queued = new Uint8Array(W * H);
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const p = y * W + x;
    if (!mark[p]) continue;
    if (!mark[p - 1] || !mark[p + 1] || !mark[p - W] || !mark[p + W]) { queue[qt++] = p; queued[p] = 1; }
  }
  const nb = [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1];
  while (qh < qt) {
    const p = queue[qh++];
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (const o of nb) {
      const q = p + o;
      if (q < 0 || q >= W * H) continue;
      if (!mark[q]) { const i = q * 4; sr += px[i]; sg += px[i + 1]; sb += px[i + 2]; n++; }
    }
    const i = p * 4;
    if (n) { px[i] = sr / n; px[i + 1] = sg / n; px[i + 2] = sb / n; } else { px[i] = R; px[i + 1] = G; px[i + 2] = B; }
    mark[p] = 0;
    for (const o of nb) {
      const q = p + o;
      if (q >= 0 && q < W * H && mark[q] && !queued[q]) { queued[q] = 1; queue[qt++] = q; }
    }
  }
  g.putImageData(d, 0, 0);
  return c;
}
