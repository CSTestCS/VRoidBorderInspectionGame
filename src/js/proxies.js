// Posed snapshots of the visitor's meshes (with BVH) for picking clothing items
// and for hose raycasts + washing.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const _v = new THREE.Vector3();

function bakePositions(mesh) {
  const pos = mesh.geometry.attributes.position;
  const out = new Float32Array(pos.count * 3);
  mesh.updateMatrixWorld(true);
  for (let i = 0; i < pos.count; i++) {
    mesh.getVertexPosition(i, _v);
    _v.applyMatrix4(mesh.matrixWorld);
    out[i * 3] = _v.x; out[i * 3 + 1] = _v.y; out[i * 3 + 2] = _v.z;
  }
  return out;
}

function proxyMesh(positions, index, data) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(index), 1));
  g.boundsTree = new MeshBVH(g);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  m.userData = data;
  return m;
}

export class Proxies {
  constructor(ch) {
    this.ch = ch;
    this.list = [];
    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = true;
    this.hairHits = 0;
    this.faceHitTime = 0;
  }

  dispose() { for (const p of this.list) { p.geometry.disposeBoundsTree?.(); p.geometry.dispose(); } this.list = []; }

  // Rebuild without blocking: build the new set over several frames, then swap.
  async bakeAsync() {
    const old = this.list;
    this.list = [];
    try { await this._build(true); } catch (e) { console.warn(e); }
    const fresh = this.list;
    this.list = fresh.length ? fresh : old;
    if (fresh.length) for (const p of old) { p.geometry.disposeBoundsTree?.(); p.geometry.dispose(); }
  }

  bake() {
    this.dispose();
    this._build(false);
  }

  _build(slice) {
    const yieldIf = slice ? (() => { let t0 = performance.now(); return async () => { if (performance.now() - t0 > 6) { await new Promise((r) => setTimeout(r, 0)); t0 = performance.now(); } }; })() : null;
    const run = async () => {
    const list = [];
    const ch = this.ch;
    ch.root.updateMatrixWorld(true);
    for (const surf of [ch.surfBody, ch.surfFace]) {
      if (!surf) continue;
      const pos = bakePositions(surf.mesh);
      surf.setPositions('baked', pos);
      list.push(proxyMesh(pos, surf.index, { kind: 'skin', surf }));
      if (yieldIf) await yieldIf();
    }
    for (const info of Object.values(ch.materialsByKey)) {
      // hair only matters for the hose; skipping it keeps picking cheap
      if (!this.includeHair || info.role !== 'hair' || !info.mesh.visible) continue;
      const pos = bakePositions(info.mesh);
      list.push(proxyMesh(pos, info.mesh.geometry.index.array, { kind: 'hair' }));
      if (yieldIf) await yieldIf();
    }
    // clothing: bake each source mesh once, one proxy per item mesh
    const baked = new Map();
    for (const it of ch.items.values()) {
      if (['underwear', 'fixed'].includes(it.category)) continue;
      for (const m of it.meshes) {
        const key = m.userData.matKey;
        const src = ch.materialsByKey[key].mesh;
        if (!baked.has(key)) baked.set(key, bakePositions(src));
        list.push(proxyMesh(baked.get(key), m.geometry.index.array, { kind: 'item', itemId: it.id, mesh: m }));
        if (yieldIf) await yieldIf();
      }
    }
    this.list = list;
    };
    if (!slice) {
      // synchronous path: run the async body without yielding
      let done = false;
      run().then(() => (done = true));
      return null;
    }
    return run();
  }

  // nearest hit, ignoring hidden items
  raycast(origin, dir, far = 6, kinds = null) {
    this.raycaster.set(origin, dir);
    this.raycaster.far = far;
    let best = null;
    for (const p of this.list) {
      if (kinds && !kinds.includes(p.userData.kind)) continue;
      if (p.userData.kind === 'item' && !p.userData.mesh.visible) continue;
      const hit = this.raycaster.intersectObject(p, false)[0];
      if (hit && (!best || hit.distance < best.distance)) best = { ...hit, data: p.userData };
    }
    return best;
  }

  // One frame of hose spray. Returns { hitSkin, hitFace, hitHair }.
  spray(origin, dir, dt) {
    const ch = this.ch;
    const res = { hitSkin: false, hitFace: false, hitHair: false };
    const rays = 12;
    const d = new THREE.Vector3();
    const back = dir.clone().negate();
    for (let r = 0; r < rays; r++) {
      d.copy(dir);
      d.x += (Math.random() - 0.5) * 0.09; d.y += (Math.random() - 0.5) * 0.09 - 0.015; d.z += (Math.random() - 0.5) * 0.09;
      d.normalize();
      const hit = this.raycast(origin, d, 5.5);
      if (!hit) continue;
      const falloff = Math.max(0.15, 1 - Math.max(0, hit.distance - 1.8) / 3.5);
      if (hit.data.kind === 'hair') {
        res.hitHair = true;
        ch.setHairWet(Math.min(1, ch.hairWet + dt * 0.09 * falloff));
        continue;
      }
      if (hit.data.kind !== 'skin') continue;
      res.hitSkin = true;
      const surf = hit.data.surf;
      if (surf === ch.surfFace) res.hitFace = true;
      const fx = surf.layers.fx.data;
      const amt = dt * 255 * 2.2 * falloff;
      const radius = surf === ch.surfFace ? 0.03 : 0.05;
      surf.paint('fx', hit.point, radius, (i, t) => {
        const w = 1 - t;
        fx[i] = Math.max(0, fx[i] - amt * w);
        fx[i + 1] = Math.max(0, fx[i + 1] - amt * w * 0.85);
        fx[i + 2] = Math.max(0, fx[i + 2] - amt * w * 0.4);
        fx[i + 3] = Math.max(fx[i + 3], 255 * Math.min(1, w * 2.5));
      }, { posKey: 'baked', normal: back, minFacing: -0.1 });
      // water runs downward: elongated wet streak
      if (Math.random() < 0.35) {
        surf.paint('fx', hit.point, radius * 3.5, (i, t) => {
          fx[i + 3] = Math.max(fx[i + 3], 255 * Math.min(1, (1 - t) * 1.8));
        }, { posKey: 'baked', distFn: (x, y, z) => x * x * 6 + z * z * 6 + (y > 0 ? y * y * 30 : y * y * 0.6) });
      }
    }
    return res;
  }
}
