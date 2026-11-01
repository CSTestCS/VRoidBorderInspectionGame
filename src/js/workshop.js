// Model Workshop: import VRM files and configure how the game uses them.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { el, RNG, hex } from './util.js';
import { listAllModels, importModels, deleteModel, storeSet } from './platform.js';
import { loadVRM, forgetBuffer } from './vrm/loader.js';
import { Character, clearCleanedCache } from './vrm/character.js';
import { CATEGORIES, MATERIAL_ROLES, COLOR_SLOTS, resolveConfig } from './vrm/modelConfig.js';
import { chooseUnderwear, composeUnderwear } from './vrm/underwear.js';
import { SKIN_TONES, HAIR_NATURAL, EYE_COLORS, clothColor } from './palettes.js';
import { POSES } from './vrm/pose.js';

export class Workshop {
  constructor(app) {
    this.app = app;
    this.ui = app.ui;
    this.root = el('div', { id: 'workshop' });
    this.list = el('div', { class: 'ws-list' });
    this.view = el('div', { class: 'ws-view' });
    this.panel = el('div', { class: 'ws-panel' });
    this.root.append(this.list, this.view, this.panel);
    this.current = null;
    this.ch = null;
    this.selectedPiece = null;
    this.uwOn = true;
    this.dirty = false;
  }

  async open() {
    document.body.append(this.root);
    const r = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(1.5, devicePixelRatio));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    this.view.append(r.domElement);
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b2024);
    this.scene.environment = this.app.engine.envMap;
    this.scene.environmentIntensity = 0.5;
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1.5, 3, 2.5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(0xe6eeff, 0x40362e, 0.9));
    const rim = new THREE.DirectionalLight(0x9fc4ff, 1.2); rim.position.set(-2, 2, -2); this.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.5, 64), new THREE.MeshStandardMaterial({ color: 0x30363b, roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
    this.camera.position.set(0, 1.2, 3.4);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.target.set(0, 0.95, 0);
    this.controls.enableDamping = true;
    this.view.append(el('div', { class: 'ws-toolbar' },
      el('button', { onclick: () => this.randomize() }, 'Randomize preview'),
      el('button', { onclick: () => { this.uwOn = !this.uwOn; this.ch?.setLayers({ uw: this.uwOn ? 1 : 0 }); } }, 'Toggle new underwear'),
      el('button', { onclick: () => this.frame('head') }, 'Face'),
      el('button', { onclick: () => this.frame('body') }, 'Full body'),
      this.poseSel = el('select', { onchange: () => this.ch?.animator.setPose(this.poseSel.value) }, Object.keys(POSES).filter((p) => p !== 'turnAway').map((p) => el('option', { value: p, selected: p === 'idle' }, 'Pose: ' + p))),
      this.exprSel = el('select', { onchange: () => { this.ch?.face.setBase(this.exprSel.value === 'neutral' ? {} : { [this.exprSel.value]: 1 }); } }, ['neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised'].map((e) => el('option', { value: e }, 'Expression: ' + e)))));
    this.view.append(el('div', { class: 'ws-hint' }, 'Drag to orbit · right-drag to pan · wheel to zoom · click a clothing piece to select it'));
    r.domElement.addEventListener('click', (e) => this.pick(e));
    this.resize = () => { const w = this.view.clientWidth, h = this.view.clientHeight; r.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); };
    window.addEventListener('resize', this.resize);
    this.resize();
    this.clock = new THREE.Clock();
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, this.clock.getDelta());
      this.controls.update();
      this.ch?.update(dt);
      r.render(this.scene, this.camera);
    };
    loop();
    await this.refreshList();
    const first = this.models[0];
    if (first) this.select(first.id);
  }

  close() {
    this.running = false;
    window.removeEventListener('resize', this.resize);
    this.ch?.dispose();
    this.renderer.dispose();
    this.root.remove();
  }

  async refreshList() {
    this.models = await listAllModels();
    this.list.innerHTML = '';
    this.list.append(el('div', { class: 'logo', style: { fontSize: '22px', letterSpacing: '3px', textAlign: 'left' } }, 'MODEL', el('span', { style: { fontSize: '12px', letterSpacing: '6px' } }, 'WORKSHOP')));
    this.list.append(el('div', { class: 'row', style: { display: 'flex', gap: '6px', margin: '12px 0' } },
      el('button', { class: 'primary', onclick: () => this.importNew() }, 'Import .vrm…'),
      el('button', { onclick: () => this.leave() }, 'Back')));
    for (const m of this.models) {
      const cfg = this.app.configs[m.id] || this.app.models.find((x) => x.entry.id === m.id)?.cfg;
      this.list.append(el('div', { class: 'ws-model' + (this.current?.id === m.id ? ' active' : ''), onclick: () => this.select(m.id) },
        cfg?.name || m.name, el('small', {}, `${m.builtin ? 'Built-in' : 'Imported'} · ${cfg ? `${cfg.sex}, ${cfg.age}` : 'not configured'}${cfg && cfg.enabled === false ? ' · disabled' : ''}`)));
    }
    this.list.append(el('p', { class: 'muted', style: { fontSize: '12px', lineHeight: 1.5 } }, 'Imported models are copied into the game\'s data folder. Any VRoid Studio export (VRM 0.x or 1.0) works best. Configure which parts are clothing, how pieces group into items, and which colour each takes. Visitors are generated from every enabled model.'));
  }

  async importNew() {
    const added = await importModels();
    if (!added?.length) return;
    await this.refreshList();
    this.ui.toast(`Imported ${added.length} model(s).`, 'good');
    await this.select(added[added.length - 1].id);
  }

  async select(id) {
    if (this.dirty && !(await this.ui.confirm('Unsaved changes', 'Discard unsaved changes to this model?', 'Discard', 'Cancel'))) return;
    const entry = this.models.find((m) => m.id === id);
    if (!entry) return;
    this.current = entry;
    this.dirty = false;
    this.panel.innerHTML = '<p class="muted">Loading model…</p>';
    try {
      const pre = await loadVRM(entry);
      pre.vrm.scene.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      this.analysis = pre.analysis;
      this.cfg = JSON.parse(JSON.stringify(resolveConfig(entry, pre.analysis, this.app.configs[id] || (entry.builtin ? this.app.builtinDefaults?.[id] : null))));
      await this.rebuild();
      this.renderPanel();
      this.refreshList();
    } catch (e) {
      console.error(e);
      this.panel.innerHTML = '';
      this.panel.append(el('p', { class: 'bad' }, 'Failed to load model: ' + e.message));
    }
  }

  lookFor(rng) {
    return {
      scale: 1,
      skin: rng.weighted(SKIN_TONES), hair: rng.weighted(HAIR_NATURAL).rgb, eye: rng.weighted(EYE_COLORS).rgb,
      slots: { A: clothColor(rng, 'top'), B: clothColor(rng, 'bottom'), C: clothColor(rng, 'top'), D: clothColor(rng, 'shoes'), dark: [0.1, 0.1, 0.1], light: [0.85, 0.85, 0.82] },
    };
  }

  async rebuild(rng = new RNG(7)) {
    const pose = this.poseSel?.value || 'idle';
    this.ch?.dispose();
    this.ch = null;
    const look = this.look || this.lookFor(rng);
    this.look = look;
    const uwSpec = chooseUnderwear(rng, this.cfg.sex);
    const uw = await composeUnderwear(uwSpec, 2048);
    const tex = new THREE.CanvasTexture(uw); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
    this.ch = await Character.create(this.current, this.cfg, look, { uwTexture: tex, workshop: true });
    this.ch.setLayers({ uw: this.uwOn ? 1 : 0 });
    this.ch.animator.setPose(pose, true);
    this.scene.add(this.ch.root);
    this.applyPieceState();
  }

  async randomize() {
    const rng = new RNG((Math.random() * 1e9) | 0);
    this.look = this.lookFor(rng);
    await this.rebuild(rng);
  }

  frame(what) {
    if (!this.ch) return;
    if (what === 'head') { const h = this.ch.boneWorld('head'); this.controls.target.copy(h).add(new THREE.Vector3(0, 0.06, 0)); this.camera.position.set(h.x, h.y + 0.1, h.z + 0.75); }
    else { this.controls.target.set(0, this.ch.heightM * 0.55, 0); this.camera.position.set(0, this.ch.heightM * 0.7, 3.4); }
  }

  applyPieceState() {
    if (!this.ch) return;
    for (const [key, info] of Object.entries(this.ch.materialsByKey)) {
      const mc = this.cfg.materials[key];
      if (info.role !== 'cloth' && info.role !== 'other') info.mesh.visible = mc?.visible !== false;
    }
    for (const [pid, mesh] of this.ch.pieceMeshes) {
      const pc = this.cfg.pieces[pid];
      const mc = this.cfg.materials[mesh.userData.matKey];
      const it = this.cfg.items[pc?.item];
      mesh.visible = pc?.visible !== false && mc?.visible !== false && it?.category !== 'underwear';
      mesh.userData.slot = pc?.colorSlot && pc.colorSlot !== 'item' ? pc.colorSlot : it?.slot || 'fixed';
      mesh.material.userData.hv.hvHighlight.value = pid === this.selectedPiece ? 1 : 0;
    }
    this.ch.applyColors(this.look);
  }

  pick(e) {
    if (!this.ch || e.detail === 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const m = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(m, this.camera);
    const meshes = [...this.ch.pieceMeshes.values()].filter((x) => x.visible);
    const hit = rc.intersectObjects(meshes, false)[0];
    this.selectedPiece = hit ? hit.object.userData.pieceIds[0] : null;
    this.applyPieceState();
    this.renderPanel();
    if (this.selectedPiece) this.panel.querySelector(`[data-piece="${CSS.escape(this.selectedPiece)}"]`)?.scrollIntoView({ block: 'center' });
  }

  markDirty() { this.dirty = true; this.saveBtn && (this.saveBtn.disabled = false); }

  renderPanel() {
    const cfg = this.cfg, P = this.panel;
    const scroll = P.scrollTop;
    P.innerHTML = '';
    const field = (label, input) => el('div', { class: 'ws-field' }, el('label', {}, label), input);
    const sel = (opts, value, onchange) => el('select', { onchange: (e) => { onchange(e.target.value); } }, opts.map(([v, l]) => el('option', { value: v, selected: v === value }, l)));
    this.saveBtn = el('button', { class: 'primary', disabled: !this.dirty, onclick: () => this.save() }, 'Save configuration');
    P.append(el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, this.saveBtn,
      el('button', { onclick: async () => { if (await this.ui.confirm('Reset', 'Reset this model to automatic defaults?', 'Reset')) { delete this.app.configs[this.current.id]; this.cfg = JSON.parse(JSON.stringify(resolveConfig(this.current, this.analysis, this.current.builtin ? this.app.builtinDefaults?.[this.current.id] : null))); this.markDirty(); await this.rebuild(); this.renderPanel(); } } }, 'Reset to defaults'),
      !this.current.builtin ? el('button', { class: 'danger', onclick: () => this.remove() }, 'Delete model') : null));

    P.append(el('h3', {}, 'Model'));
    P.append(field('Display name', el('input', { value: cfg.name, oninput: (e) => { cfg.name = e.target.value; this.markDirty(); } })));
    P.append(field('Body type', sel([['female', 'Female (bras + all underwear, 20% prints)'], ['male', 'Male (briefs/boxers, no bra)']], cfg.sex, (v) => { cfg.sex = v; this.markDirty(); this.rebuild(); })));
    P.append(field('Age group', sel([['young', 'Young (18-32)'], ['adult', 'Adult (30-52)'], ['old', 'Old (58+)']], cfg.age, (v) => { cfg.age = v; this.markDirty(); })));
    P.append(field('Use for visitors', el('input', { type: 'checkbox', checked: cfg.enabled !== false, onchange: (e) => { cfg.enabled = e.target.checked; this.markDirty(); } })));
    const thr = el('input', { type: 'range', min: 0, max: 160, value: cfg.uwThreshold ?? 60, onchange: async (e) => { cfg.uwThreshold = Number(e.target.value); clearCleanedCache(this.current.id); this.markDirty(); await this.rebuild(); } });
    P.append(field('Built-in underwear removal', thr));
    P.append(el('p', { class: 'muted', style: { fontSize: '12px' } }, 'Underwear painted into the body texture is erased and replaced. Lower = more aggressive removal; 0 disables. Use "Toggle new underwear" to see the cleaned skin.'));

    P.append(el('h3', {}, 'Textures / materials'));
    for (const m of this.analysis.materials) {
      const mc = cfg.materials[m.key];
      const row = el('div', { class: 'ws-row' },
        el('input', { type: 'checkbox', title: 'Visible', checked: mc.visible !== false, onchange: (e) => { mc.visible = e.target.checked; this.markDirty(); this.applyPieceState(); } }),
        el('span', { class: 'name', title: m.name }, m.name.replace(/^N00_\d+_\d+_/, '')),
        el('span', {}, sel(MATERIAL_ROLES, mc.role, async (v) => { mc.role = v; this.markDirty(); await this.rebuild(); this.renderPanel(); })));
      P.append(row);
      if (!['cloth', 'other'].includes(mc.role)) {
        if (['faceDetail', 'other'].includes(mc.role)) P.append(el('div', { class: 'ws-row ws-sub' }, el('span'), el('span', { class: 'muted' }, 'Colour'), sel(COLOR_SLOTS, mc.colorSlot || 'fixed', (v) => { mc.colorSlot = v; this.markDirty(); this.applyPieceState(); })));
        continue;
      }
      // pieces of this material
      const pieces = this.analysis.pieces.filter((p) => p.matKey === m.key);
      pieces.forEach((p, idx) => {
        const pc = cfg.pieces[p.id];
        const itemOpts = Object.entries(cfg.items).map(([id, it]) => [id, it.name]).concat([['__new', '+ New item…']]);
        const r = el('div', { class: 'ws-row ws-sub', 'data-piece': p.id, style: p.id === this.selectedPiece ? { background: '#2a2410' } : {} },
          el('input', { type: 'checkbox', checked: pc.visible !== false, title: 'Visible', onchange: (e) => { pc.visible = e.target.checked; this.markDirty(); this.applyPieceState(); } }),
          el('span', { class: 'name', style: { cursor: 'pointer' }, onclick: () => { this.selectedPiece = p.id; this.applyPieceState(); this.renderPanel(); } }, `Piece ${idx + 1} · ${p.triCount} tris · y ${p.box.min.y.toFixed(2)}–${p.box.max.y.toFixed(2)}`),
          el('span', { style: { display: 'flex', gap: '4px' } },
            sel(itemOpts, pc.item, (v) => {
              if (v === '__new') { const id = 'item' + Date.now().toString(36); cfg.items[id] = { name: 'New item', category: 'accessory', pockets: false, slot: 'A' }; pc.item = id; }
              else pc.item = v;
              for (const iid of Object.keys(cfg.items)) if (!Object.values(cfg.pieces).some((q) => q.item === iid)) delete cfg.items[iid];
              this.markDirty(); this.applyPieceState(); this.renderPanel();
            }),
            sel([['item', 'Item colour'], ...COLOR_SLOTS], pc.colorSlot || 'item', (v) => { pc.colorSlot = v; this.markDirty(); this.applyPieceState(); })));
        P.append(r);
      });
    }

    P.append(el('h3', {}, 'Clothing items'));
    P.append(el('p', { class: 'muted', style: { fontSize: '12px' } }, 'Pieces assigned to the same item are inspected and removed together (e.g. both shoes, or a boot made of several pieces). The category decides removal order (shoes before socks) and where items can hide things.'));
    for (const [id, it] of Object.entries(cfg.items)) {
      const count = Object.values(cfg.pieces).filter((p) => p.item === id).length;
      const sw = el('span', { class: 'swatch', style: { background: hex(this.ch?.slotColor(it.slot) || [0.5, 0.5, 0.5]) } });
      P.append(el('div', { class: 'ws-item' },
        el('div', { class: 'ws-field' }, el('label', {}, 'Name'), el('input', { value: it.name, oninput: (e) => { it.name = e.target.value; this.markDirty(); } })),
        el('div', { class: 'ws-field' }, el('label', {}, 'Category'), sel(CATEGORIES.map((c) => [c.id, c.label]), it.category, (v) => { it.category = v; it.pockets = !!CATEGORIES.find((c) => c.id === v)?.pockets; this.markDirty(); this.applyPieceState(); this.renderPanel(); })),
        el('div', { class: 'ws-field' }, el('label', {}, 'Colour'), el('span', {}, sw, ' ', sel(COLOR_SLOTS, it.slot || 'A', (v) => { it.slot = v; this.markDirty(); this.applyPieceState(); this.renderPanel(); }))),
        el('div', { class: 'ws-field' }, el('label', {}, 'Can hide items'), el('input', { type: 'checkbox', checked: !!it.pockets, onchange: (e) => { it.pockets = e.target.checked; this.markDirty(); } })),
        el('div', { class: 'muted', style: { fontSize: '12px' } }, `${count} piece(s)`)));
    }
    P.scrollTop = scroll;
  }

  async save() {
    this.app.configs[this.current.id] = JSON.parse(JSON.stringify(this.cfg));
    await storeSet('modelConfigs', this.app.configs);
    this.dirty = false;
    this.saveBtn.disabled = true;
    this.ui.toast('Configuration saved.', 'good');
    this.refreshList();
    this.app.modelsChanged = true;
  }

  async remove() {
    if (!(await this.ui.confirm('Delete model', `Delete "${this.cfg.name}" from the game?`, 'Delete'))) return;
    await deleteModel(this.current.id);
    forgetBuffer(this.current.url);
    delete this.app.configs[this.current.id];
    await storeSet('modelConfigs', this.app.configs);
    this.ch?.dispose(); this.ch = null;
    this.current = null; this.dirty = false;
    this.app.modelsChanged = true;
    await this.refreshList();
    if (this.models[0]) this.select(this.models[0].id);
  }

  async leave() {
    if (this.dirty && !(await this.ui.confirm('Unsaved changes', 'Leave without saving?', 'Leave', 'Stay'))) return;
    this.close();
    this.app.toMenu();
  }
}
