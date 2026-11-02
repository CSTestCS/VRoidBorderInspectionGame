// Premade characters: hand-made visitors that may each show up once per save.
// The player picks name, model, colours, voice, personality, height and which
// clothing items they wear. Problems (contraband, infection...) stay random.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { el, RNG, hex, fromHex } from './util.js';
import { storeGet, storeSet } from './platform.js';
import { Character } from './vrm/character.js';
import { chooseUnderwear, composeUnderwear } from './vrm/underwear.js';
import { SKIN_TONES, HAIR_NATURAL, HAIR_OLD, HAIR_DYED, EYE_COLORS, SCLERA, clothColor } from './palettes.js';
import { FIRST_F, FIRST_M, LAST } from './data.js';
import { makeVoiceProfile } from './voice.js';
import { audio } from './audio.js';

export const PERSONALITIES = {
  friendly: { label: 'Friendly — warm, chatty, gives you the benefit of the doubt', favor: 25, nervous: 0.1, styles: ['relaxed', 'clasped', 'relaxed'], gesture: 0.85 },
  calm: { label: 'Calm — patient and composed', favor: 8, nervous: 0, styles: ['relaxed', 'behind', 'clasped'], gesture: 0.4 },
  shy: { label: 'Shy — quiet, easily embarrassed', favor: 5, nervous: 0.55, styles: ['modest', 'clasped', 'hug'], gesture: 0.25 },
  nervous: { label: 'Nervous — fidgety, on edge', favor: 0, nervous: 0.85, styles: ['clasped', 'hug', 'modest'], gesture: 0.6 },
  proud: { label: 'Proud — confident, dislikes being ordered around', favor: -10, nervous: 0.05, styles: ['hipHand', 'behind', 'crossed'], gesture: 0.7 },
  grumpy: { label: 'Grumpy — impatient, starts out annoyed', favor: -25, nervous: 0.1, styles: ['crossed', 'hipHand', 'crossed'], gesture: 0.5 },
};

const nearest = (list, rgb) => {
  let best = list[0][0], bd = 1e9;
  for (const [e] of list) { const d = Math.abs(e.rgb[0] - rgb[0]) + Math.abs(e.rgb[1] - rgb[1]) + Math.abs(e.rgb[2] - rgb[2]); if (d < bd) { bd = d; best = e; } }
  return best;
};
export const eyeNameFor = (rgb) => nearest(EYE_COLORS, rgb).name;
export const hairNameFor = (rgb) => nearest([...HAIR_NATURAL, ...HAIR_OLD, ...HAIR_DYED], rgb).name;

export async function loadPremades() { return (await storeGet('premades')) || []; }

export function randomPremade(models, rng = new RNG((Math.random() * 1e9) | 0)) {
  const M = rng.pick(models);
  const sex = M.cfg.sex;
  const hairE = rng.weighted(M.cfg.age === 'old' ? HAIR_OLD : HAIR_NATURAL);
  const eyeE = rng.weighted(EYE_COLORS);
  const v = makeVoiceProfile(rng.int(1, 1e9), sex, M.cfg.age);
  return {
    id: 'pm_' + Date.now().toString(36) + rng.int(100, 999), enabled: true,
    first: rng.pick(sex === 'male' ? FIRST_M : FIRST_F), last: rng.pick(LAST), modelId: M.entry.id,
    heightCm: Math.round(M.height * 100),
    look: {
      skin: rng.weighted(SKIN_TONES), hair: hairE.rgb, eye: eyeE.rgb,
      slots: { A: clothColor(rng, 'top'), B: clothColor(rng, 'bottom'), C: clothColor(rng, 'top'), D: clothColor(rng, 'shoes'), dark: clothColor(rng, 'shoes').map((x) => x * 0.6), light: [0.86, 0.86, 0.83] },
    },
    voice: { pitch: Math.round(v.pitch), rate: +v.rate.toFixed(2), breath: +v.breath.toFixed(2), rasp: +v.rasp.toFixed(2), formant: +v.formant.toFixed(2), shrill: +v.shrill.toFixed(2) },
    personality: rng.pick(Object.keys(PERSONALITIES)),
    hidden: [],
  };
}

export class CharacterCreator {
  constructor(app) {
    this.app = app;
    this.ui = app.ui;
    this.root = el('div', { id: 'workshop', class: 'creator' });
    this.list = el('div', { class: 'ws-list' });
    this.view = el('div', { class: 'ws-view' });
    this.panel = el('div', { class: 'ws-panel' });
    this.root.append(this.list, this.view, this.panel);
    this.ch = null;
    this.cur = null;
    this.dirty = false;
    this.buildSeq = 0;
  }

  get models() { return this.app.activeModels(); }
  modelOf(id) { return this.models.find((m) => m.entry.id === id); }

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
    const key = new THREE.DirectionalLight(0xffffff, 2.7); key.position.set(1.5, 3, 2.5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03; this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(0xe6eeff, 0x40362e, 0.5));
    const rim = new THREE.DirectionalLight(0x9fc4ff, 1.2); rim.position.set(-2, 2, -2); this.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.5, 64), new THREE.MeshStandardMaterial({ color: 0x30363b, roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    // height reference so the chosen height reads at a glance
    const chart = new THREE.Group();
    for (let cm = 140; cm <= 200; cm += 10) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(cm % 50 === 0 ? 0.16 : 0.1, 0.006, 0.01), new THREE.MeshBasicMaterial({ color: 0x8a949b }));
      m.position.set(0, cm / 100, 0); chart.add(m);
    }
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.05, 0.02), new THREE.MeshStandardMaterial({ color: 0x555b60 })); pole.position.y = 1.025; chart.add(pole);
    chart.position.set(0.7, 0, -0.1); this.scene.add(chart);
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
    this.camera.position.set(0, 1.2, 3.4);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.target.set(0, 0.95, 0);
    this.controls.enableDamping = true;
    this.view.append(el('div', { class: 'ws-toolbar' },
      el('button', { onclick: () => this.frame('head') }, 'Face'),
      el('button', { onclick: () => this.frame('body') }, 'Full body'),
      el('button', { onclick: () => this.previewVoice() }, 'Hear voice'),
      this.exprSel = el('select', { onchange: () => this.ch?.face.setBase(this.exprSel.value === 'neutral' ? {} : { [this.exprSel.value]: 1 }) }, ['neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised'].map((e) => el('option', { value: e }, 'Expression: ' + e)))));
    this.view.append(el('div', { class: 'ws-hint' }, 'Drag to orbit · right-drag to pan · wheel to zoom. The bar on the right marks 140–200 cm.'));
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
    this.premades = await loadPremades();
    this.renderList();
    if (this.premades.length) this.select(this.premades[0].id); else this.panel.append(el('p', { class: 'muted' }, 'No premade characters yet. Press "New character" to make one.'));
  }

  close() {
    this.running = false;
    window.removeEventListener('resize', this.resize);
    this.ch?.dispose();
    this.renderer.dispose();
    this.root.remove();
  }

  async leave() {
    if (this.dirty && !(await this.ui.confirm('Unsaved changes', 'Leave without saving this character?', 'Leave', 'Stay'))) return;
    this.close();
    this.app.toMenu();
  }

  renderList() {
    const L = this.list;
    L.innerHTML = '';
    L.append(el('div', { class: 'logo', style: { fontSize: '22px', letterSpacing: '3px', textAlign: 'left' } }, 'PREMADE', el('span', { style: { fontSize: '12px', letterSpacing: '6px' } }, 'CHARACTERS')));
    L.append(el('div', { class: 'row', style: { display: 'flex', gap: '6px', margin: '12px 0' } },
      el('button', { class: 'primary', onclick: () => this.create() }, 'New character'),
      el('button', { onclick: () => this.leave() }, 'Back')));
    for (const p of this.premades) {
      const M = this.modelOf(p.modelId);
      L.append(el('div', { class: 'ws-model' + (this.cur?.id === p.id ? ' active' : ''), onclick: () => this.select(p.id) },
        `${p.first} ${p.last}`, el('small', {}, `${M ? M.cfg.name || M.entry.name : 'model missing'} · ${PERSONALITIES[p.personality] ? p.personality : 'calm'}${p.enabled === false ? ' · off' : ''}`)));
    }
    L.append(el('p', { class: 'muted', style: { fontSize: '12px', lineHeight: 1.5 } }, 'Each enabled character has a small chance to show up on any day, at most once per save. Their contraband, ID problems and illnesses are still rolled at random, so check them like anyone else.'));
  }

  async create() {
    if (!this.models.length) { this.ui.toast('No visitor models are enabled. Enable one in the Model Workshop first.', 'bad'); return; }
    if (this.dirty && !(await this.ui.confirm('Unsaved changes', 'Discard unsaved changes?', 'Discard', 'Cancel'))) return;
    this.cur = randomPremade(this.models);
    this.isNew = true;
    this.dirty = true;
    this.renderList();
    await this.rebuild();
    this.renderPanel();
  }

  async select(id) {
    if (this.cur?.id === id) return;
    if (this.dirty && !(await this.ui.confirm('Unsaved changes', 'Discard unsaved changes?', 'Discard', 'Cancel'))) return;
    const p = this.premades.find((x) => x.id === id);
    if (!p) return;
    this.cur = JSON.parse(JSON.stringify(p));
    this.isNew = false;
    this.dirty = false;
    this.renderList();
    if (!this.modelOf(this.cur.modelId) && this.models.length) this.cur.modelId = this.models[0].entry.id;
    await this.rebuild();
    this.renderPanel();
  }

  lookFor(p) {
    const M = this.modelOf(p.modelId);
    return { ...p.look, sclera: SCLERA.normal, scale: M ? p.heightCm / (M.height * 100) : 1 };
  }

  async rebuild() {
    const p = this.cur;
    const M = this.modelOf(p.modelId);
    if (!M) return;
    const seq = ++this.buildSeq;
    const rng = new RNG(1234);
    const uw = await composeUnderwear(chooseUnderwear(rng, M.cfg.sex), 1024);
    const tex = new THREE.CanvasTexture(uw); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
    const ch = await Character.create(M.entry, M.cfg, this.lookFor(p), { uwTexture: tex, lowRes: true });
    if (seq !== this.buildSeq) { ch.dispose(); return; }
    this.ch?.dispose();
    this.ch = ch;
    this.scene.add(ch.root);
    this.applyHidden();
    const P = PERSONALITIES[p.personality] || PERSONALITIES.calm;
    ch.animator.setPersonality(new RNG(99), P.nervous);
    ch.animator.armStyle = P.styles[0];
  }

  applyHidden() {
    if (!this.ch) return;
    for (const it of this.ch.items.values()) if (it.category !== 'underwear') this.ch.setItemVisible(it.id, !this.cur.hidden.includes(it.id));
  }

  applyLook() { this.ch?.applyColors(this.lookFor(this.cur)); }

  frame(what) {
    if (!this.ch) return;
    if (what === 'head') { const h = this.ch.boneWorld('head'); this.controls.target.copy(h).add(new THREE.Vector3(0, 0.06, 0)); this.camera.position.set(h.x, h.y + 0.1, h.z + 0.75); }
    else { this.controls.target.set(0, this.ch.heightM * 0.55, 0); this.camera.position.set(0, this.ch.heightM * 0.7, 3.4); }
  }

  nameSay() {
    const p = this.cur, o = {};
    if (p.say?.first) o[p.first.toLowerCase()] = p.say.first;
    if (p.say?.last) o[p.last.toLowerCase()] = p.say.last;
    return o;
  }

  voiceProfile() {
    const p = this.cur, M = this.modelOf(p.modelId);
    return { ...makeVoiceProfile(7, M?.cfg.sex, M?.cfg.age), ...p.voice, seed: 7 };
  }

  previewVoice() {
    if (!this.cur) return;
    // always say the name, so a "say as" spelling can be checked right away
    const text = `My name is ${this.cur.first} ${this.cur.last}.`;
    const v = audio.voice(text, this.modelOf(this.cur.modelId)?.cfg.sex !== 'male', { profile: this.voiceProfile(), emotion: 'neutral', overrides: this.nameSay() });
    this.ch?.face.talk(v.duration + 0.3, v.syllables);
  }

  markDirty() { this.dirty = true; if (this.saveBtn) this.saveBtn.disabled = false; }

  renderPanel() {
    const p = this.cur, P = this.panel;
    const scroll = P.scrollTop;
    P.innerHTML = '';
    if (!p) return;
    const M = this.modelOf(p.modelId);
    const field = (label, input) => el('div', { class: 'ws-field' }, el('label', {}, label), input);
    const sel = (opts, value, onchange) => el('select', { onchange: (e) => onchange(e.target.value) }, opts.map(([v, l]) => el('option', { value: v, selected: v === value }, l)));
    const slider = (min, max, step, value, fmt, oninput) => {
      const out = el('span', { class: 'muted', style: { minWidth: '64px', textAlign: 'right' } }, fmt(value));
      const inp = el('input', { type: 'range', min, max, step, value, oninput: (e) => { const v = +e.target.value; out.textContent = fmt(v); oninput(v); } });
      return el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, inp, out);
    };
    const color = (rgb, onchange) => el('input', { type: 'color', value: hex(rgb), oninput: (e) => onchange(fromHex(e.target.value)) });
    const presets = (list, onpick) => el('div', { style: { display: 'flex', gap: '3px', flexWrap: 'wrap', marginTop: '4px' } },
      list.map(([e]) => { const rgb = e.rgb || e; return el('button', { title: e.name || '', style: { width: '20px', height: '20px', padding: 0, minWidth: 0, background: hex(rgb), border: '1px solid #000' }, onclick: () => onpick(rgb) }); }));

    this.saveBtn = el('button', { class: 'primary', disabled: !this.dirty, onclick: () => this.save() }, 'Save character');
    P.append(el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, this.saveBtn,
      el('button', { onclick: async () => { const keep = { id: p.id, first: p.first, last: p.last, modelId: p.modelId, enabled: p.enabled }; this.cur = { ...randomPremade([M || this.models[0]]), ...keep }; this.markDirty(); await this.rebuild(); this.renderPanel(); } }, 'Randomize look'),
      !this.isNew ? el('button', { class: 'danger', onclick: () => this.remove() }, 'Delete') : null));

    P.append(el('h3', {}, 'Identity'));
    P.append(field('Appears in games', el('label', {}, el('input', { type: 'checkbox', checked: p.enabled !== false, onchange: (e) => { p.enabled = e.target.checked; this.markDirty(); } }), ' enabled')));
    P.append(field('First name', el('input', { value: p.first, maxlength: 20, oninput: (e) => { p.first = e.target.value.trim() || 'Unknown'; this.markDirty(); } })));
    P.append(field('Last name', el('input', { value: p.last, maxlength: 24, oninput: (e) => { p.last = e.target.value.trim() || 'Unknown'; this.markDirty(); } })));
    // how their name should sound (read by the voice instead of the spelling)
    p.say = p.say || { first: '', last: '' };
    P.append(field('Say first name as', el('input', { value: p.say.first, placeholder: 'e.g. TESS-ah', oninput: (e) => { p.say.first = e.target.value; this.markDirty(); } })));
    P.append(field('Say last name as', el('input', { value: p.say.last, placeholder: 'e.g. kwill', oninput: (e) => { p.say.last = e.target.value; this.markDirty(); } })));
    P.append(field('Model', sel(this.models.map((m) => [m.entry.id, `${m.cfg.name || m.entry.name} (${m.cfg.sex}, ${m.cfg.age})`]), p.modelId, async (v) => {
      const old = this.modelOf(p.modelId), nm = this.modelOf(v);
      p.modelId = v; p.hidden = [];
      if (old && nm) p.heightCm = Math.round(nm.height * 100 * (p.heightCm / (old.height * 100)));
      this.markDirty(); await this.rebuild(); this.renderPanel();
    })));
    if (M) {
      const base = M.height * 100;
      P.append(field('Height', slider(Math.round(base * 0.88), Math.round(base * 1.12), 1, p.heightCm, (v) => `${v} cm`, (v) => { p.heightCm = v; this.markDirty(); clearTimeout(this._ht); this._ht = setTimeout(() => this.rebuild(), 250); })));
    }
    P.append(field('Personality', sel(Object.entries(PERSONALITIES).map(([k, v]) => [k, v.label]), p.personality, async (v) => { p.personality = v; this.markDirty(); const P2 = PERSONALITIES[v]; this.ch?.animator.setPersonality(new RNG(99), P2.nervous); if (this.ch) this.ch.animator.armStyle = P2.styles[0]; })));

    P.append(el('h3', {}, 'Colours'));
    const L = p.look;
    const setC = (k, rgb) => { L[k] = rgb; this.markDirty(); this.applyLook(); this.renderPanel(); };
    P.append(field('Skin', el('div', {}, color(L.skin, (rgb) => { L.skin = rgb; this.markDirty(); this.applyLook(); }), presets(SKIN_TONES, (rgb) => setC('skin', rgb)))));
    P.append(field('Hair', el('div', {}, color(L.hair, (rgb) => { L.hair = rgb; this.markDirty(); this.applyLook(); }), presets([...HAIR_NATURAL, ...HAIR_OLD, ...HAIR_DYED], (rgb) => setC('hair', rgb)))));
    P.append(field('Eyes', el('div', {}, color(L.eye, (rgb) => { L.eye = rgb; this.markDirty(); this.applyLook(); }), presets(EYE_COLORS, (rgb) => setC('eye', rgb)), el('div', { class: 'muted', style: { fontSize: '11px' } }, `ID card will say: ${eyeNameFor(L.eye)}`))));
    const slotNames = { A: 'Clothing A', B: 'Clothing B', C: 'Clothing C', D: 'Clothing D', dark: 'Dark trims', light: 'Light trims' };
    for (const [k, label] of Object.entries(slotNames)) P.append(field(label, color(L.slots[k] || [0.5, 0.5, 0.5], (rgb) => { L.slots[k] = rgb; this.markDirty(); this.applyLook(); })));

    P.append(el('h3', {}, 'Voice'));
    const V = p.voice;
    const female = M?.cfg.sex !== 'male';
    P.append(field('Pitch', slider(female ? 150 : 70, female ? 330 : 190, 1, V.pitch, (v) => `${v} Hz`, (v) => { V.pitch = v; this.markDirty(); })));
    P.append(field('Voice depth', slider(0.85, 1.3, 0.01, V.formant, (v) => (v < 1 ? 'deep ' : 'light ') + v.toFixed(2), (v) => { V.formant = v; this.markDirty(); })));
    P.append(field('Speed', slider(0.7, 1.4, 0.01, V.rate, (v) => v.toFixed(2) + '×', (v) => { V.rate = v; this.markDirty(); })));
    P.append(field('Breathiness', slider(0, 0.4, 0.01, V.breath, (v) => v.toFixed(2), (v) => { V.breath = v; this.markDirty(); })));
    P.append(field('Raspiness', slider(0, 0.6, 0.01, V.rasp, (v) => v.toFixed(2), (v) => { V.rasp = v; this.markDirty(); })));
    P.append(field('Shrillness', slider(0, 1, 0.01, V.shrill ?? 0, (v) => (v < 0.05 ? 'none' : v.toFixed(2)), (v) => { V.shrill = v; this.markDirty(); })));
    P.append(el('button', { onclick: () => this.previewVoice() }, 'Hear voice'));

    P.append(el('h3', {}, 'Clothing'));
    P.append(el('p', { class: 'muted', style: { fontSize: '12px' } }, 'Untick items this character arrives without.'));
    const items = M ? Object.entries(M.cfg.items).filter(([, it]) => it.category !== 'underwear') : [];
    for (const [id, it] of items) {
      P.append(el('label', { class: 'ws-row', style: { gridTemplateColumns: '22px 1fr auto' } },
        el('input', { type: 'checkbox', checked: !p.hidden.includes(id), onchange: (e) => { p.hidden = p.hidden.filter((x) => x !== id); if (!e.target.checked) p.hidden.push(id); this.markDirty(); this.applyHidden(); } }),
        el('span', { class: 'name' }, it.name || id), el('small', { class: 'muted' }, it.category)));
    }
    P.scrollTop = scroll;
  }

  async save() {
    const p = this.cur;
    p.look.eyeName = eyeNameFor(p.look.eye);
    p.look.hairName = hairNameFor(p.look.hair);
    const i = this.premades.findIndex((x) => x.id === p.id);
    const copy = JSON.parse(JSON.stringify(p));
    if (i >= 0) this.premades[i] = copy; else this.premades.push(copy);
    await storeSet('premades', this.premades);
    this.app.premades = this.premades;
    this.isNew = false;
    this.dirty = false;
    this.saveBtn.disabled = true;
    this.renderList();
    this.renderPanel();
    this.ui.toast(`${p.first} ${p.last} saved.`, 'good');
  }

  async remove() {
    const p = this.cur;
    if (!(await this.ui.confirm('Delete character', `Delete ${p.first} ${p.last}?`, 'Delete'))) return;
    this.premades = this.premades.filter((x) => x.id !== p.id);
    await storeSet('premades', this.premades);
    this.app.premades = this.premades;
    this.cur = null; this.dirty = false;
    this.ch?.dispose(); this.ch = null;
    this.panel.innerHTML = '';
    this.renderList();
    if (this.premades.length) this.select(this.premades[0].id);
  }
}
