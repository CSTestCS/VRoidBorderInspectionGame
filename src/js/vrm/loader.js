// Loads VRM files, converts materials, analyses clothing geometry into
// connected "pieces" (deterministic across loads) and caches what can be shared.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from 'three-vrm';
import { roleFromName } from './materials.js';

const bufferCache = new Map();
export function fetchBuffer(url) {
  if (!bufferCache.has(url)) {
    bufferCache.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`);
      return r.arrayBuffer();
    }).catch((e) => { bufferCache.delete(url); throw e; }));
  }
  return bufferCache.get(url);
}
export function forgetBuffer(url) { bufferCache.delete(url); }

const sharedTextures = new Map(); // modelId -> Map(key -> Texture)
const analysisCache = new Map(); // modelId -> analysis

export const cleanName = (n) => (n || '').replace(/\s*\(Instance\)\s*/g, '').trim();

function disposeTexture(t) {
  if (!t) return;
  if (t.image && typeof t.image.close === 'function') t.image.close();
  t.dispose();
}

export async function loadVRM(model) {
  const buf = await fetchBuffer(model.url);
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  const gltf = await loader.parseAsync(buf, '');
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error('File is not a VRM model');
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  if (vrm.meta?.metaVersion === '0') VRMUtils.rotateVRM0(vrm);

  let texMap = sharedTextures.get(model.id);
  if (!texMap) { texMap = new Map(); sharedTextures.set(model.id, texMap); }

  const parts = [];
  const counts = {};
  vrm.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const src = Array.isArray(o.material) ? o.material[0] : o.material;
    if (Array.isArray(o.material)) {
      // drop MToon outline passes
      o.geometry.clearGroups();
      for (let i = 1; i < o.material.length; i++) o.material[i].dispose();
      o.material = src;
    }
    const name = cleanName(src.name);
    counts[name] = (counts[name] || 0) + 1;
    const key = counts[name] > 1 ? `${name}#${counts[name]}` : name;
    // share decoded textures between instances of the same model
    for (const slot of ['map', 'normalMap']) {
      const t = src[slot] !== undefined ? src[slot] : src.uniforms?.[slot]?.value;
      if (!t) continue;
      const k = key + ':' + slot;
      const cached = texMap.get(k);
      if (cached && cached !== t) {
        disposeTexture(t);
        if (src.uniforms?.[slot]) src.uniforms[slot].value = cached; else src[slot] = cached;
      } else if (!cached) texMap.set(k, t);
    }
    parts.push({ mesh: o, key, name, src, role: roleFromName(name) });
  });

  return { gltf, vrm, parts, model, analysis: getAnalysis(model.id, parts, vrm) };
}

// ---- geometry analysis --------------------------------------------------------
function connectedComponents(geom) {
  const pos = geom.attributes.position;
  const index = geom.index ? geom.index.array : null;
  const triCount = index ? index.length / 3 : pos.count / 3;
  // weld by position so UV seams don't split a piece
  const keyMap = new Map();
  const weld = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    let w = keyMap.get(k);
    if (w === undefined) { w = keyMap.size; keyMap.set(k, w); }
    weld[i] = w;
  }
  const parent = new Int32Array(keyMap.size);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const vi = (t, k) => (index ? index[t * 3 + k] : t * 3 + k);
  for (let t = 0; t < triCount; t++) {
    const a = find(weld[vi(t, 0)]), b = find(weld[vi(t, 1)]), c = find(weld[vi(t, 2)]);
    parent[b] = a; parent[find(c)] = a;
  }
  const groups = new Map();
  for (let t = 0; t < triCount; t++) {
    const r = find(weld[vi(t, 0)]);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(t);
  }
  const comps = [];
  const v = new THREE.Vector3();
  for (const tris of groups.values()) {
    const box = new THREE.Box3();
    for (const t of tris) for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, vi(t, k)); box.expandByPoint(v); }
    const c = box.getCenter(new THREE.Vector3());
    comps.push({ tris: Uint32Array.from(tris), triCount: tris.length, center: c, box });
  }
  comps.sort((a, b) => b.triCount - a.triCount || a.center.x - b.center.x || a.center.y - b.center.y || a.center.z - b.center.z);
  return comps;
}

function getAnalysis(modelId, parts, vrm) {
  if (analysisCache.has(modelId)) return analysisCache.get(modelId);
  const materials = [];
  const pieces = [];
  let height = 0;
  for (const p of parts) {
    const box = new THREE.Box3().setFromBufferAttribute(p.mesh.geometry.attributes.position);
    materials.push({ key: p.key, name: p.name, role: p.role, box, texture: !!(p.src.map || p.src.uniforms?.map?.value) });
    if (p.role === 'bodySkin' || p.role === 'faceSkin') height = Math.max(height, box.max.y);
    if (p.role === 'cloth' || p.role === 'other') {
      const comps = connectedComponents(p.mesh.geometry);
      // merge tiny fragments (<6 tris) into their nearest larger piece
      const big = comps.filter((c) => c.triCount >= 6);
      const small = comps.filter((c) => c.triCount < 6);
      for (const s of small) {
        if (!big.length) { big.push(s); continue; }
        let best = big[0], bd = Infinity;
        for (const b of big) { const d = b.center.distanceTo(s.center); if (d < bd) { bd = d; best = b; } }
        // keep the triangles, but stray fragments must not distort the piece's size
        best.tris = Uint32Array.from([...best.tris, ...s.tris]);
        best.triCount = best.tris.length;
      }
      big.forEach((c, i) => pieces.push({ id: `${p.key}:${i}`, matKey: p.key, index: i, tris: c.tris, triCount: c.triCount, center: c.center, box: c.box }));
    }
  }
  if (!height) {
    const head = vrm.humanoid.getRawBoneNode('head');
    height = head ? head.getWorldPosition(new THREE.Vector3()).y + 0.12 : 1.6;
  }
  const a = { modelId, materials, pieces, height };
  analysisCache.set(modelId, a);
  return a;
}
