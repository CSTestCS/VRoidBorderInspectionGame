// A fully set-up character instance built from a VRM + model config + look.
import * as THREE from 'three';
import { loadVRM } from './loader.js';
import { convertMaterial, patchMaterial, BLANK_TEXTURE, applyFabric, defaultFabric } from './materials.js';
import { applyExpressionConfig } from './expressions.js';
import { cleanBodyTexture } from './underwear.js';
import { Surface, makeLayer } from './fx.js';
import { Animator, Face } from './pose.js';

const cleanedCache = new Map();
function cleanedBody(modelId, image, threshold) {
  const key = modelId + '|' + threshold;
  if (!cleanedCache.has(key)) {
    const c = cleanBodyTexture(image, threshold);
    const t = new THREE.CanvasTexture(c);
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    cleanedCache.set(key, t);
  }
  return cleanedCache.get(key);
}
export function clearCleanedCache(modelId) {
  for (const k of [...cleanedCache.keys()]) if (k.startsWith(modelId + '|')) { cleanedCache.get(k).dispose(); cleanedCache.delete(k); }
}

const ANCHORS = { top: 'chest', outer: 'chest', bottom: 'hips', onepiece: 'spine', socks: 'leftLowerLeg', shoes: 'leftFoot', gloves: 'leftHand', hat: 'head', accessory: 'upperChest' };

const setSRGB = (color, rgb) => color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);

export class Character {
  static async create(model, cfg, look, opts = {}) {
    const c = new Character();
    await c._build(model, cfg, look, opts);
    return c;
  }

  async _build(model, cfg, look, opts) {
    const loaded = await loadVRM(model);
    this.model = model;
    this.cfg = cfg;
    this.look = look;
    this.opts = opts;
    this.vrm = loaded.vrm;
    this.gltf = loaded.gltf;
    this.analysis = loaded.analysis;
    this.root = new THREE.Group();
    this.root.name = 'character:' + model.id;
    this.root.add(this.vrm.scene);
    const scale = look.scale || 1;
    this.vrm.scene.scale.setScalar(scale);
    this.heightM = this.analysis.height * scale;
    this.items = new Map();
    this.clothSurf = new Map();
    this.skinMats = [];
    this.hairMats = [];
    this.irisMats = [];
    this.scleraMats = [];
    this.browMats = [];
    this.materialsByKey = {};
    this.pieceMeshes = new Map();
    this.ownedMaterials = [];
    this.ownedGeometries = [];
    this.layerState = { cond: 1, fx: 1, uw: 1 };
    this.hairWet = 0;
    this.floating = false;

    // humanoid name per skeleton bone index
    const humanOf = new Map();
    for (const name of Object.keys(this.vrm.humanoid.humanBones)) {
      const node = this.vrm.humanoid.getRawBoneNode(name);
      if (node) humanOf.set(node, name);
    }
    const boneNamesFor = (mesh) => mesh.skeleton ? mesh.skeleton.bones.map((b) => {
      let n = b;
      while (n && !humanOf.has(n)) n = n.parent;
      return n ? humanOf.get(n) : null;
    }) : null;

    const fxOn = opts.fx !== false;
    for (const part of loaded.parts) {
      const mc = cfg.materials[part.key] || { role: part.role, visible: true, colorSlot: 'fixed' };
      const role = mc.role || part.role;
      const mesh = part.mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      let mat = convertMaterial(part.src, role);
      if (role === 'bodySkin' && part.src.map !== undefined) {
        const img = (part.src.map || part.src.uniforms?.map?.value)?.image;
        if (img && opts.cleanUnderwear !== false) mat.map = cleanedBody(model.id, img, cfg.uwThreshold ?? 60);
      }
      part.src.dispose();
      mesh.material = mat;
      this.ownedMaterials.push(mat);
      this.materialsByKey[part.key] = { mat, mesh, role, part };
      mesh.visible = mc.visible !== false;

      if (role === 'bodySkin' || role === 'faceSkin') {
        const surf = new Surface(mesh, boneNamesFor(mesh));
        const big = role === 'bodySkin';
        const q = opts.lowRes ? 0.5 : 1;
        surf.addLayer('fx', Math.round((big ? 512 : 256) * q));
        surf.addLayer('cond', Math.round((big ? 1024 : 512) * q), true);
        surf.addLayer('glow', Math.round((big ? 256 : 128) * q));
        const u = {
          hvFx: { value: surf.layers.fx.tex }, hvCond: { value: surf.layers.cond.tex }, hvGlow: { value: surf.layers.glow.tex },
          hvFxOn: { value: fxOn ? 1 : 0 }, hvCondOn: { value: 1 }, hvMakeup: { value: new THREE.Color(1, 0.85, 0.75) }, hvWetAll: { value: 0 },
        };
        if (big) { u.hvUw = { value: opts.uwTexture || BLANK_TEXTURE }; u.hvUwOn = { value: opts.uwTexture ? 1 : 0 }; }
        patchMaterial(mat, 'skin', u);
        this.skinMats.push(mat);
        if (big) this.surfBody = surf; else this.surfFace = surf;
        surf.role = role;
      } else if (role === 'hair') {
        patchMaterial(mat, 'hair', { hvHairWet: { value: 0 } });
        this.hairMats.push(mat);
      } else if (role === 'eyeIris') this.irisMats.push(mat);
      else if (role === 'eyeWhite') this.scleraMats.push(mat);
      else if (role === 'faceDetail' && /Brow/i.test(part.name)) this.browMats.push(mat);
      else if (role === 'cloth' || role === 'other') this._splitCloth(part, mat, mc, boneNamesFor(mesh));
    }

    this.applyColors(look);
    try { applyExpressionConfig(this.vrm, cfg.expressions); } catch (e) { console.warn('expression config', e); }
    this.animator = new Animator(this.vrm);
    this.face = new Face(this.vrm);
    this.springBase = [];
    if (this.vrm.springBoneManager) {
      for (const j of this.vrm.springBoneManager.joints) {
        this.springBase.push({ j, s: { ...j.settings, gravityDir: j.settings.gravityDir.clone() } });
      }
    }
    this.vrm.update(0);
  }

  _splitCloth(part, baseMat, mc, boneNames) {
    const mesh = part.mesh;
    const pieces = this.analysis.pieces.filter((p) => p.matKey === part.key);
    const surf = new Surface(mesh, boneNames);
    const q = this.opts.lowRes ? 0.5 : 1;
    surf.addLayer('ov', Math.round(512 * q), true);
    surf.addLayer('glow', Math.round(256 * q));
    this.clothSurf.set(part.key, surf);
    const groups = new Map();
    for (const p of pieces) {
      const pc = this.cfg.pieces[p.id] || { item: 'loose', colorSlot: 'item', visible: true };
      const it = this.cfg.items[pc.item] || { name: 'Item', category: 'fixed', slot: 'fixed' };
      const slot = pc.colorSlot && pc.colorSlot !== 'item' ? pc.colorSlot : it.slot || 'A';
      const fabric = pc.fabric && pc.fabric !== 'item' ? pc.fabric : it.fabric || defaultFabric(it.category);
      const key = this.opts.workshop ? p.id : `${pc.item}|${slot}|${fabric}`;
      if (!groups.has(key)) groups.set(key, { itemId: pc.item, slot, fabric, tris: [], pieceIds: [], visible: pc.visible !== false && mc.visible !== false });
      const g = groups.get(key);
      for (const t of p.tris) g.tris.push(t);
      g.pieceIds.push(p.id);
      if (pc.visible === false) g.visible = false;
    }
    const src = mesh.geometry;
    const index = src.index.array;
    for (const g of groups.values()) {
      const idx = new (index.constructor)(g.tris.length * 3);
      g.tris.forEach((t, k) => { idx[k * 3] = index[t * 3]; idx[k * 3 + 1] = index[t * 3 + 1]; idx[k * 3 + 2] = index[t * 3 + 2]; });
      const geom = new THREE.BufferGeometry();
      for (const [n, a] of Object.entries(src.attributes)) geom.setAttribute(n, a);
      for (const [n, arr] of Object.entries(src.morphAttributes)) geom.morphAttributes[n] = arr;
      geom.morphTargetsRelative = src.morphTargetsRelative;
      geom.setIndex(new THREE.BufferAttribute(idx, 1));
      geom.boundingSphere = src.boundingSphere;
      const mat = baseMat.clone();
      mat.userData = { ...baseMat.userData };
      applyFabric(mat, g.fabric);
      patchMaterial(mat, 'cloth', { hvOverlay: { value: surf.layers.ov.tex }, hvGlow: { value: surf.layers.glow.tex }, hvOverlayOn: { value: 1 }, hvHighlight: { value: 0 } });
      const sm = new THREE.SkinnedMesh(geom, mat);
      sm.bind(mesh.skeleton, mesh.bindMatrix);
      sm.morphTargetInfluences = mesh.morphTargetInfluences;
      sm.morphTargetDictionary = mesh.morphTargetDictionary;
      sm.castShadow = sm.receiveShadow = true;
      sm.frustumCulled = false;
      sm.renderOrder = mesh.renderOrder;
      sm.name = mesh.name + ':' + g.itemId;
      sm.visible = g.visible;
      sm.userData.slot = g.slot;
      sm.userData.fabric = g.fabric;
      sm.userData.itemId = g.itemId;
      sm.userData.pieceIds = g.pieceIds;
      sm.userData.matKey = part.key;
      mesh.parent.add(sm);
      this.ownedMaterials.push(mat);
      this.ownedGeometries.push(geom);
      const itemCfg = this.cfg.items[g.itemId] || { name: 'Item', category: 'fixed' };
      if (!this.items.has(g.itemId)) {
        this.items.set(g.itemId, { id: g.itemId, name: itemCfg.name, category: itemCfg.category, pockets: itemCfg.pockets, meshes: [], tris: new Map(), removed: false, anchor: ANCHORS[itemCfg.category] || 'chest' });
      }
      const item = this.items.get(g.itemId);
      item.meshes.push(sm);
      if (!item.tris.has(part.key)) item.tris.set(part.key, []);
      const arr = item.tris.get(part.key);
      for (const t of g.tris) arr.push(t);
      for (const pid of g.pieceIds) this.pieceMeshes.set(pid, sm);
      if (itemCfg.category === 'underwear') sm.visible = false;
    }
    for (const item of this.items.values()) for (const [k, v] of item.tris) if (Array.isArray(v)) item.tris.set(k, Uint32Array.from(v));
    mesh.visible = false;
    mesh.userData.hvHiddenSource = true;
  }

  applyColors(look) {
    this.look = look;
    const skin = look.skin || [1, 0.85, 0.75];
    for (const m of this.skinMats) { setSRGB(m.color, skin); m.userData.hv.hvMakeup.value.setRGB(skin[0] * 1.03, skin[1] * 1.02, skin[2] * 0.98, THREE.SRGBColorSpace); }
    const hair = look.hair || [0.3, 0.2, 0.12];
    for (const m of this.hairMats) setSRGB(m.color, hair);
    for (const m of this.browMats) setSRGB(m.color, hair.map((v) => v * 0.75));
    for (const m of this.irisMats) setSRGB(m.color, look.eye || [0.4, 0.25, 0.15]);
    for (const m of this.scleraMats) setSRGB(m.color, look.sclera || [1, 0.98, 0.96]);
    for (const [key, info] of Object.entries(this.materialsByKey)) {
      const mc = this.cfg.materials[key];
      if (!mc || info.role === 'cloth' || info.role === 'other') continue;
      if (['bodySkin', 'faceSkin', 'hair', 'eyeIris', 'eyeWhite'].includes(info.role)) continue;
      if (mc.colorSlot && mc.colorSlot !== 'fixed') setSRGB(info.mat.color, this.slotColor(mc.colorSlot, info.mat));
    }
    this.root.traverse((o) => {
      if (!o.isSkinnedMesh || !o.userData.slot) return;
      setSRGB(o.material.color, this.slotColor(o.userData.slot, o.material));
    });
  }

  slotColor(slot, mat) {
    const L = this.look;
    switch (slot) {
      case 'skin': return L.skin || [1, 0.85, 0.75];
      case 'hair': return L.hair || [0.3, 0.2, 0.1];
      case 'eye': return L.eye || [0.4, 0.3, 0.2];
      case 'fixed': { const c = mat?.userData?.baseColor; return c ? [c.r, c.g, c.b].map((v) => Math.pow(v, 1 / 2.2)) : [1, 1, 1]; }
      default: return (L.slots && L.slots[slot]) || [0.6, 0.6, 0.6];
    }
  }

  setItemVisible(id, v) {
    const it = this.items.get(id);
    if (!it) return;
    for (const m of it.meshes) m.visible = v;
    it.removed = !v;
  }
  setItemHighlight(id, v) {
    for (const it of this.items.values()) for (const m of it.meshes) m.material.userData.hv.hvHighlight.value = it.id === id && v ? 1 : 0;
  }
  setLayers({ cond, fx, uw, overlay } = {}) {
    for (const m of this.skinMats) {
      const u = m.userData.hv;
      if (cond !== undefined) u.hvCondOn.value = cond;
      if (fx !== undefined) u.hvFxOn.value = fx;
      if (uw !== undefined && u.hvUwOn) u.hvUwOn.value = uw;
    }
    if (overlay !== undefined) for (const it of this.items.values()) for (const m of it.meshes) m.material.userData.hv.hvOverlayOn.value = overlay;
  }
  setUnderwearTexture(tex) {
    for (const m of this.skinMats) if (m.userData.hv.hvUw) { m.userData.hv.hvUw.value = tex || BLANK_TEXTURE; m.userData.hv.hvUwOn.value = tex ? 1 : 0; }
  }
  setWetAll(v) { for (const m of this.skinMats) m.userData.hv.hvWetAll.value = v; }
  setHairWet(w) {
    this.hairWet = w;
    for (const m of this.hairMats) m.userData.hv.hvHairWet.value = w;
    this._applySprings();
  }
  setFloating(f) { this.floating = f; this.animator.floatMode = f; this._applySprings(); }
  _applySprings() {
    const w = this.hairWet;
    for (const { j, s } of this.springBase) {
      if (this.floating) {
        j.settings.gravityDir.set(0, 1, 0);
        j.settings.gravityPower = 0.06;
        j.settings.dragForce = Math.min(0.9, s.dragForce + 0.45);
        j.settings.stiffness = s.stiffness * 0.35;
      } else {
        j.settings.gravityDir.copy(s.gravityDir);
        j.settings.gravityPower = s.gravityPower + w * 1.1 + w * 0.2;
        j.settings.dragForce = Math.min(0.92, s.dragForce + w * 0.3);
        j.settings.stiffness = s.stiffness * (1 - 0.65 * w);
      }
    }
  }

  bone(name) { return this.vrm.humanoid.getRawBoneNode(name) || this.vrm.humanoid.getRawBoneNode('hips'); }
  boneWorld(name, target = new THREE.Vector3()) { return this.bone(name).getWorldPosition(target); }

  update(dt) {
    this.animator.update(dt);
    this.face.update(dt);
    this.vrm.update(dt);
    this.surfBody?.flush();
    this.surfFace?.flush();
    for (const s of this.clothSurf.values()) s.flush();
  }

  dispose() {
    this.root.removeFromParent();
    for (const m of this.ownedMaterials) m.dispose();
    for (const g of this.ownedGeometries) g.dispose();
    this.vrm.scene.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.surfBody?.dispose(); this.surfFace?.dispose();
    for (const s of this.clothSurf.values()) s.dispose();
    // textures in materials.map are shared per model; only own textures disposed
    if (this.opts.uwTexture) this.opts.uwTexture.dispose();
  }
}
