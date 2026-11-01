// Core game controller: days, visitors, stations, decisions and scoring.
import * as THREE from 'three';
import { World, SPOTS, TANK_POS } from './world.js';
import { Player } from './player.js';
import { audio } from './audio.js';
import { RNG, el, clamp, damp, sleep } from './util.js';
import { generateVisitor, buildVisitorCharacter, correctOutcome, measureDirt, paintClothing, PROBLEM_LABEL, CURRENT_YEAR } from './visitor.js';
import { renderPortrait } from './portrait.js';
import { drawCardFront, drawCardBack, drawCardUV, makeCardMesh, fmtDate } from './idcard.js';
import { patchMaterial } from './vrm/materials.js';
import { OBJECTS } from './objects.js';
import { ObjectViewer } from './objectViewer.js';
import { openRulebook } from './rulebook.js';
import { REACT, GREETINGS, HANDOVER, NAME_HESITATE, NO_CONTRABAND, NO_CONTRABAND_LIE, NO_BITE, NO_BITE_LIE, INTERRO_Q } from './data.js';
import { storeSet } from './platform.js';
import { CATEGORY_LABEL } from './vrm/modelConfig.js';
import { Proxies } from './proxies.js';

const CONTAMINATED = ['bio', 'bioUV', 'rad', 'chem', 'lice'];

export class Game {
  constructor(app) {
    this.app = app;
    this.engine = app.engine;
    this.ui = app.ui;
    this.models = app.models;
    this.modelsById = Object.fromEntries(app.models.map((m) => [m.entry.id, m]));
    this.listeners = new Map();
    this.day = 1;
    this.credits = 0;
    this.queue = [];
    this.run = null;
    this.interro = null;
    this.tanks = [null, null, null, null];
    this.dayLog = [];
    this.tutorial = null;
    this.paused = false;
    this.busy = false;
    this.objectViewer = null;
  }

  on(evt, fn) { if (!this.listeners.has(evt)) this.listeners.set(evt, new Set()); this.listeners.get(evt).add(fn); return () => this.listeners.get(evt).delete(fn); }
  emit(evt, data) { for (const fn of this.listeners.get(evt) || []) fn(data); }

  async init() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020303);
    scene.fog = new THREE.Fog(0x050607, 18, 40);
    this.scene = scene;
    this.engine.setScene(scene);
    this.world = new World(scene, this.app.settings);
    this.player = new Player(this.engine, this.world);
    this.player.sensitivity = this.app.settings.sensitivity ?? 1;
    this.player.invertY = !!this.app.settings.invertY;
    this.player.radiationFn = (p) => this.radiationAt(p);
    this.player.extraColliders = () => (this.run?.ch && this.run.phase !== 'gone' ? [{ x: this.run.ch.root.position.x, z: this.run.ch.root.position.z, r: 0.25 }] : []);
    this.player.onSpray = (o, d, dt) => this.onSpray(o, d, dt);
    this.player.teleport(SPOTS.playerStart, 0, -0.05);
    this.raycaster = new THREE.Raycaster();
    this.setupHandlers();
    this.ui.onModalChange = () => this.onModalChange();
    this._keydown = (e) => this.onKey(e);
    window.addEventListener('keydown', this._keydown);
    this._canvasClick = () => { if (!this.ui.modalOpen && !this.paused && this.active) this.player.lock(); };
    this.engine.renderer.domElement.addEventListener('click', this._canvasClick);
    this._plc = () => this.onPointerLockChange();
    document.addEventListener('pointerlockchange', this._plc);
    this.unhook = this.engine.add((dt) => this.update(dt));
    this.active = true;
  }

  destroy() {
    this.active = false;
    this.unhook?.();
    window.removeEventListener('keydown', this._keydown);
    this.engine.renderer.domElement.removeEventListener('click', this._canvasClick);
    document.removeEventListener('pointerlockchange', this._plc);
    this.player.unlock();
    this.ui.closeAll();
    this.ui.tutorial(null);
    for (const t of this.tanks) t?.ch?.dispose();
    this.interro?.run.ch?.dispose();
    this.run?.ch?.dispose();
    this.objectViewer?.dispose();
    audio.loop('hose', false);
  }

  // ---------------------------------------------------------------- lifecycle
  async startDay(dayNumber, { count = null, preset = null } = {}) {
    this.day = dayNumber;
    this.dayLog = [];
    const rng = new RNG((Date.now() ^ (dayNumber * 7919)) >>> 0);
    const n = count ?? (dayNumber === 1 ? rng.int(3, 4) : rng.int(3, 7));
    this.queue = preset ? preset.slice() : Array.from({ length: n }, () => generateVisitor(rng.int(1, 2 ** 31 - 1), this.models));
    this.dayTotal = this.queue.length;
    for (const t of this.tanks) if (t) t.checkedToday = false;
    await this.loadTankCharacters();
    this.player.teleport(SPOTS.playerStart, 0, -0.05);
    this.updateHUD();
    this.setObjective('Press the green <b>NEXT</b> button on your desk to call the first visitor.');
    this.ui.toast(`Day ${dayNumber} — ${this.dayTotal} visitors expected.`, 'warn', 5);
  }

  async loadTankCharacters() {
    for (let i = 0; i < 4; i++) {
      const t = this.tanks[i];
      if (!t || t.ch) continue;
      t.ch = await buildVisitorCharacter(t.spec, this.modelsById, { lowRes: true });
      this.placeInTank(t, i);
    }
  }

  placeInTank(t, i) {
    const ch = t.ch;
    for (const it of ch.items.values()) if (!['underwear', 'fixed'].includes(it.category)) ch.setItemVisible(it.id, false);
    ch.root.position.copy(TANK_POS[i]).add(new THREE.Vector3(0, 0.45, 0));
    ch.root.rotation.y = -Math.PI / 2;
    ch.animator.setPose('float');
    ch.setFloating(true);
    ch.setWetAll(1);
    ch.setHairWet(1);
    ch.face.eyesClosed = 1;
    ch.face.setBase({ relaxed: 0.6 });
    ch.animator.lookTarget = null;
    ch.setLayers({ fx: 0.4 });
    this.scene.add(ch.root);
  }

  // --------------------------------------------------------------- HUD bits
  updateHUD() {
    const remaining = this.queue.length + (this.run ? 1 : 0);
    const occ = this.tanks.filter(Boolean).length;
    this.ui.dayInfo(`<b>DAY ${this.day}</b> · Year ${CURRENT_YEAR}<br>Visitors left: ${remaining}/${this.dayTotal}<br>Tanks occupied: ${occ}/4<br>Credits: <span class="${this.credits < 0 ? 'bad' : 'ok'}">${this.credits}</span>`);
  }
  setObjective(html) { this.objectiveHTML = html; this.ui.objective(html); }

  say(ch, text, who) {
    if (!text) return 0;
    const female = ch?.spec ? ch.spec.sex !== 'male' : true;
    const dur = audio.voice(text, female) || text.length * 0.05;
    ch?.face?.talk(dur);
    this.ui.subtitle(who || (ch?.spec ? 'Visitor' : ''), text, Math.max(2.5, dur + 1.2));
    return dur;
  }
  react(kind, emotion = null, w = 0.8) {
    const r = this.run;
    if (!r?.ch) return;
    const rng = Math.random;
    const lines = REACT[kind];
    if (lines) this.say(r.ch, lines[Math.floor(rng() * lines.length)], 'Visitor');
    if (emotion) r.ch.face.flash(emotion, w, 2.2);
  }

  // ------------------------------------------------------------ visitors flow
  async callNext() {
    if (this.run || this.busy) return;
    if (this.interro) { this.ui.toast('Resolve the pending interrogation first (Interrogation room console).', 'warn'); return; }
    if (!this.queue.length) { this.endDay(); return; }
    this.busy = true;
    audio.button();
    const spec = this.queue.shift();
    this.ui.toast('Calling next visitor…');
    const run = this.run = {
      spec, phase: 'arriving', idStamp: null, cardViewed: false, asked: new Set(), searched: new Set(), found: [],
      fate: {}, washer: [], clothesReturned: false, dispo: null, events: [], hosed: false, hoseTime: 0, faceHits: 0,
      armsUp: false, turned: false, uvUsedOnCard: false,
    };
    try {
      const [ch, portrait] = await Promise.all([
        buildVisitorCharacter(spec, this.modelsById),
        renderPortrait(this.modelsById, spec.card.portrait),
      ]);
      run.ch = ch;
      run.portrait = portrait;
      ch.root.position.copy(SPOTS.visitorSpawn);
      ch.root.rotation.y = 0;
      ch.animator.lookTarget = this.engine.camera;
      ch.animator.lookWeight = 0.15;
      this.scene.add(ch.root);
      this.updateHUD();
      this.world.doors.outer.set(1);
      audio.bigDoor();
      this.setObjective('A visitor is approaching the window.');
      await this.walkTo(ch, SPOTS.visitorWindow);
      this.world.doors.outer.set(0);
      ch.root.rotation.y = 0;
      ch.animator.lookWeight = 0.7;
      this.say(ch, GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
      await sleep(1400);
      ch.animator.setPose('handOver');
      await sleep(900);
      this.say(ch, HANDOVER[Math.floor(Math.random() * HANDOVER.length)]);
      this.placeCard(run);
      await sleep(600);
      ch.animator.setPose('idle');
      run.phase = 'booth';
      this.setObjective('Examine the <b>ID card</b> on the tray, question the visitor on the <b>intercom</b>, then <b>stamp</b> the card and press <b>DECON</b>.');
      this.emit('cardOnDesk');
    } catch (e) {
      console.error(e);
      this.ui.toast('Failed to load visitor: ' + e.message, 'bad', 8);
      run.ch?.dispose();
      this.run = null;
    }
    this.busy = false;
  }

  placeCard(run) {
    run.cardFront = drawCardFront(run.spec, run.portrait, run.idStamp);
    run.cardBack = drawCardBack(run.spec);
    run.cardUV = drawCardUV(run.spec);
    const mesh = makeCardMesh(run.cardFront, run.cardBack, run.cardUV, patchMaterial);
    mesh.position.set(0.0, 0.993, 0.3);
    mesh.rotation.y = 0;
    this.scene.add(mesh);
    run.cardMesh = mesh;
    audio.drop();
  }
  redrawCard(run) {
    run.cardFront = drawCardFront(run.spec, run.portrait, run.idStamp);
    if (run.cardMesh) { const t = run.cardMesh.userData.front; t.image = run.cardFront; t.needsUpdate = true; }
  }

  walkTo(ch, target, speed = 1.0) {
    return new Promise((resolve) => { ch.walk = { target: target.clone(), speed, resolve }; ch.animator.walking = true; ch.animator.walkSpeed = speed; });
  }
  updateWalk(ch, dt) {
    const w = ch.walk;
    if (!w) return;
    const p = ch.root.position;
    const dx = w.target.x - p.x, dz = w.target.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.04) { ch.walk = null; ch.animator.walking = false; w.resolve(); return; }
    const want = Math.atan2(dx, dz);
    let diff = want - ch.root.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ch.root.rotation.y += diff * Math.min(1, dt * 6);
    const step = Math.min(dist, w.speed * dt * (Math.abs(diff) > 1.2 ? 0.3 : 1));
    p.x += (dx / dist) * step; p.z += (dz / dist) * step;
    if (Math.random() < dt * 1.8) audio.step();
  }
  turnTo(ch, ry) { ch.turnTarget = ry; }

  async fade(fn) {
    this.busy = true;
    for (let t = 0; t <= 1; t += 0.08) { this.engine.fade = t; await sleep(16); }
    this.engine.fade = 1;
    try { await fn(); } catch (e) { console.error(e); }
    await sleep(150);
    for (let t = 1; t >= 0; t -= 0.06) { this.engine.fade = t; await sleep(16); }
    this.engine.fade = 0;
    this.busy = false;
  }

  // ----------------------------------------------------------------- booth
  openCard() {
    const run = this.run;
    if (!run?.cardFront) return;
    run.cardViewed = true;
    this.emit('cardViewed');
    let side = 'front', uv = false;
    const cv = el('canvas', { width: 1024, height: 640 });
    const g = cv.getContext('2d');
    const draw = () => {
      g.clearRect(0, 0, 1024, 640);
      const src = side === 'front' ? run.cardFront : run.cardBack;
      if (!uv) { g.drawImage(src, 0, 0); return; }
      g.fillStyle = '#05010c'; g.fillRect(0, 0, 1024, 640);
      g.globalAlpha = 0.28; g.drawImage(src, 0, 0); g.globalAlpha = 1;
      g.fillStyle = 'rgba(70,20,160,0.25)'; g.fillRect(0, 0, 1024, 640);
      if (side === 'front') {
        g.save(); g.globalCompositeOperation = 'lighter'; g.filter = 'drop-shadow(0 0 6px #6effa0)';
        const tint = document.createElement('canvas'); tint.width = 1024; tint.height = 640;
        const tg = tint.getContext('2d'); tg.drawImage(run.cardUV, 0, 0); tg.globalCompositeOperation = 'multiply'; tg.fillStyle = '#7dffb0'; tg.fillRect(0, 0, 1024, 640);
        g.drawImage(tint, 0, 0); g.restore();
      }
    };
    draw();
    const status = el('div', { class: 'muted' });
    const setStatus = () => { status.textContent = `Viewing ${side}${uv ? ' under UV light' : ''}. Stamp: ${run.idStamp || 'none'}`; };
    setStatus();
    const flip = () => { side = side === 'front' ? 'back' : 'front'; draw(); setStatus(); audio.click(); };
    const toggleUV = () => { uv = !uv; if (uv) { run.uvUsedOnCard = true; this.emit('cardUV'); } draw(); setStatus(); audio.click(); };
    const content = el('div', { class: 'card-view' }, cv, status,
      el('div', { class: 'row' },
        el('button', { onclick: flip }, 'Flip card (F)'),
        el('button', { onclick: toggleUV, style: { borderColor: '#9b6bff' } }, 'UV lamp (U)'),
        el('button', { onclick: () => m.close() }, 'Close (C / Esc)')),
      el('p', { class: 'muted' }, 'Compare the portrait, name and details with the visitor. Use the height chart behind them and look at their eyes (hold right mouse to zoom).'));
    const m = this.ui.modal(content, { side: true, title: 'Identity Card' });
    m.keys = (e) => { if (e.code === 'KeyF') flip(); if (e.code === 'KeyU') toggleUV(); if (e.code === 'KeyC') m.close(); };
  }

  openIntercom() {
    const run = this.run;
    if (!run || !['booth'].includes(run.phase)) { this.ui.toast('No one at the window.'); return; }
    const s = run.spec;
    const log = el('div', { class: 'dialog-log' });
    const add = (who, text, cls = '') => { log.append(el('div', { class: cls }, el('b', {}, who + ': '), text)); log.scrollTop = 1e6; };
    const liarWeapon = s.problems.includes('weapon') || s.problems.includes('substance');
    const infected = ['discoloredSclera', 'discoloredSkin', 'biteMarks', 'radiation'].some((p) => s.problems.includes(p));
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const nervousTell = () => {
      if (Math.random() < s.nervous) {
        run.ch.face.flash(Math.random() < 0.5 ? 'sad' : 'surprised', 0.35, 1.2);
        run.ch.animator.lookWeight = 0.05;
        setTimeout(() => { if (run.ch) run.ch.animator.lookWeight = 0.7; }, 1300);
      }
    };
    const Q = [
      ['name', 'State your full name.', () => (s.problems.includes('invalidName') ? pick(NAME_HESITATE) : '') + s.answers.name + '.'],
      ['dob', 'What is your date of birth?', () => fmtDate(s.answers.dob).replace(/^0/, '') + '.'],
      ['origin', 'Where are you travelling from?', () => `${s.answers.origin}.`],
      ['purpose', 'Why do you want to enter the Haven?', () => s.answers.purpose],
      ['contraband', 'Are you carrying any weapons or contraband?', () => (liarWeapon ? pick(NO_CONTRABAND_LIE) : pick(NO_CONTRABAND))],
      ['bitten', 'Have you been bitten, or exposed to radiation?', () => (infected && Math.random() < 0.7 ? pick(NO_BITE_LIE) : pick(NO_BITE))],
    ];
    const list = el('div', { class: 'col qlist' });
    for (const [id, q, a] of Q) {
      list.append(el('button', {
        onclick: async () => {
          audio.click();
          add('You', q, 'you');
          this.ui.subtitle('You', q, 2);
          run.asked.add(id);
          this.emit('asked', id);
          await sleep(900);
          const ans = a();
          if (id === 'contraband' && liarWeapon) nervousTell();
          if (id === 'bitten' && infected) nervousTell();
          if (id === 'name' && s.problems.includes('invalidName')) nervousTell();
          add(s.identity.first ? 'Visitor' : 'Visitor', ans);
          this.say(run.ch, ans);
        },
      }, q));
    }
    this.ui.modal(el('div', {}, el('p', { class: 'muted' }, 'Ask the visitor questions. Watch how they answer.'), list, log), { side: true, title: 'Intercom' });
  }

  stamp(kind) {
    const run = this.run;
    if (!run || run.phase !== 'booth') return;
    if (!run.cardViewed) { this.ui.toast('Look at the ID card first.', 'warn'); return; }
    if (run.idStamp) { this.ui.toast('The card is already stamped ' + run.idStamp + '.', 'warn'); return; }
    run.idStamp = kind;
    audio.stamp();
    this.redrawCard(run);
    this.ui.toast(kind === 'APPROVED' ? 'ID stamped APPROVED.' : 'ID stamped FLAGGED for questioning.', kind === 'APPROVED' ? 'good' : 'bad');
    this.emit('stamped', kind);
    if (kind === 'FLAGGED') run.ch.face.flash('surprised', 0.6, 1.5);
  }

  async sendToDecon() {
    const run = this.run;
    if (!run || run.phase !== 'booth') return;
    if (!run.idStamp) { this.ui.toast('Stamp the ID card first (APPROVED or FLAG).', 'warn'); audio.error(); return; }
    audio.button();
    this.say(run.ch, 'Okay. Where do I go?');
    await this.fade(async () => {
      run.ch.root.position.copy(SPOTS.platform);
      run.ch.root.rotation.y = Math.PI;
      run.ch.turnTarget = Math.PI;
      run.cardMesh.removeFromParent();
      run.phase = 'decon';
      run.proxies = null;
      this.world.puddle.material.opacity = 0;
    });
    this.emit('sentToDecon');
    this.setObjective('Go to <b>Decontamination</b>. Inspect each clothing item where it is worn, search it, remove it, and sort it into the <b>washer</b> or the <b>incinerator</b>. Press <kbd>C</kbd> to view the ID card.');
  }

  // ------------------------------------------------------------- washroom
  ensureProxies() {
    const run = this.run;
    if (!run?.ch) return null;
    if (!run.proxies) { run.proxies = new Proxies(run.ch); run.proxies.bake(); run.bakeAt = performance.now(); }
    return run.proxies;
  }
  rebake(delay = 1300) {
    const run = this.run;
    if (!run) return;
    clearTimeout(run.rebakeTimer);
    run.rebakeTimer = setTimeout(() => { if (run.proxies) run.proxies.bake(); }, delay);
  }

  removableItems() {
    const run = this.run;
    if (!run?.ch) return [];
    return [...run.ch.items.values()].filter((it) => !['underwear', 'fixed'].includes(it.category));
  }

  itemMenu(itemId) {
    const run = this.run;
    const it = run.ch.items.get(itemId);
    if (!it || it.removed) return;
    const searched = run.searched.has(itemId);
    const blockedBy = it.category === 'socks' ? this.removableItems().find((o) => o.category === 'shoes' && !o.removed) : null;
    const content = el('div', {},
      el('p', {}, el('b', {}, it.name), ' — ', CATEGORY_LABEL[it.category] || it.category),
      el('p', { class: 'muted' }, 'Inspect the item while it is worn: look for stains or residue, sweep it with the UV lamp (3) and the Geiger counter (4).'),
      el('div', { class: 'row' },
        el('button', { onclick: () => { m.close(); this.searchItem(itemId); } }, searched ? 'Search again' : 'Search pockets / inside'),
        el('button', { class: 'primary', disabled: !!blockedBy || !!this.player.carrying, onclick: () => { m.close(); this.removeItem(itemId); } }, 'Remove and carry'),
        el('button', { onclick: () => m.close() }, 'Back')),
      blockedBy ? el('p', { class: 'warn' }, `Remove the ${blockedBy.name.toLowerCase()} first.`) : null,
      this.player.carrying ? el('p', { class: 'warn' }, 'Your hands are full.') : null);
    const m = this.ui.modal(content, { title: 'Clothing' });
  }

  async searchItem(itemId) {
    const run = this.run;
    run.searched.add(itemId);
    this.emit('searched', itemId);
    const objs = (run.spec.pockets[itemId] || []).filter((o) => !o.handled);
    audio.burst({ dur: 0.4, freq: 900, gain: 0.15 });
    if (!objs.length) { this.ui.toast(`You search the ${run.ch.items.get(itemId).name.toLowerCase()}: nothing inside.`); return; }
    for (const o of objs) {
      await this.objectDecision(o, itemId);
    }
  }

  objectDecision(o, itemId) {
    const run = this.run;
    return new Promise((resolve) => {
      if (!this.objectViewer) this.objectViewer = new ObjectViewer();
      const def = OBJECTS[o.type];
      const view = this.objectViewer.show(o.type);
      let decided = false;
      const decide = (choice) => {
        decided = true;
        o.handled = true;
        o.decision = choice;
        run.found.push({ ...o, itemId });
        if (choice === 'confiscate') { audio.metalDrop(); this.react('confiscate', 'angry', 0.5); this.ui.toast('Item placed in the contraband bin.'); }
        else { this.react('returnItem', 'happy', 0.4); this.ui.toast('Item kept with the visitor\'s belongings.'); }
        this.emit('objectDecided', { type: o.type, choice });
        m.close();
      };
      const content = el('div', {},
        el('p', {}, 'You found something in the ', el('b', {}, run.ch.items.get(itemId).name.toLowerCase()), '.'),
        view,
        el('p', { class: 'muted' }, 'Drag to rotate. Decide whether it is allowed inside the Haven.'),
        el('div', { class: 'row' },
          el('button', { onclick: () => { const c = def.claim[Math.floor(Math.random() * def.claim.length)]; this.say(run.ch, c, 'Visitor'); } }, '"What is this?"'),
          el('button', { class: 'danger', onclick: () => decide('confiscate') }, 'Confiscate'),
          el('button', { class: 'good', onclick: () => decide('return') }, 'Allow / return to owner')));
      const m = this.ui.modal(content, { title: 'Pocket Search', closable: false, onClose: () => { this.objectViewer.hide(); resolve(); } });
    });
  }

  removeItem(itemId) {
    const run = this.run;
    const it = run.ch.items.get(itemId);
    if (!it || it.removed || this.player.carrying) return;
    const first = !this.removableItems().some((o) => o.removed);
    run.ch.setItemVisible(itemId, false);
    run.ch.setItemHighlight(null, false);
    const slot = it.meshes[0]?.userData.slot;
    const color = run.ch.slotColor(slot, it.meshes[0]?.material);
    this.player.carry({ itemId, name: it.name, color });
    audio.burst({ dur: 0.5, freq: 700, gain: 0.2, attack: 0.05 });
    if (first) this.react('stripStart', 'sad', 0.5);
    else run.ch.face.flash('sad', 0.3, 1.5);
    this.emit('itemRemoved', itemId);
    const left = this.removableItems().filter((o) => !o.removed);
    if (!left.length) {
      run.ch.animator.setPose('shy');
      run.ch.face.setBase({ sad: 0.25 });
      this.setObjective('All clothing removed. Finish sorting, then take the <b>hose</b> from the wall reel and wash the visitor thoroughly. <kbd>R</kbd> raise arms, <kbd>T</kbd> turn around.');
    }
  }

  depositCarried(dest) {
    const run = this.run;
    const c = this.player.carrying;
    if (!c || !run) return;
    run.fate[c.itemId] = dest;
    this.player.carry(null);
    if (dest === 'wash') {
      run.washer.push(c.itemId);
      audio.washer();
      this.world.washerLamp.material.emissiveIntensity = 2;
      this.ui.toast(`${c.name} loaded into the washer.`);
    } else {
      audio.burn();
      this.world.incGlow.material.emissiveIntensity = 4;
      this.world.incLight.intensity = 6;
      setTimeout(() => { this.world.incGlow.material.emissiveIntensity = 0.6; this.world.incLight.intensity = 0.6; }, 1600);
      this.react('burn', 'sad', 0.8);
      this.ui.toast(`${c.name} burned.`, 'warn');
    }
    this.emit('deposited', { itemId: c.itemId, dest });
    const allSorted = this.removableItems().every((o) => run.fate[o.id]);
    if (allSorted) this.emit('allClothesRemoved');
  }

  toggleHose() {
    const run = this.run;
    if (this.player.hasHose) {
      this.player.hasHose = false;
      this.player.setTool('hand');
      audio.click();
      if (run && run.phase === 'hose') {
        run.phase = 'inspect';
        run.ch.animator.shiver = 0;
        run.ch.face.setBase({ sad: 0.15 });
        this.setObjective('Inspect the visitor\'s body closely (eyes, skin, marks). Then <b>return their clothes</b> at the washer and make a decision at the <b>disposition terminal</b>.');
        this.emit('hoseReturned');
      }
      return;
    }
    if (!run || !['decon', 'hose', 'inspect'].includes(run.phase)) { this.ui.toast('There is no one to wash.'); return; }
    if (this.player.carrying) { this.ui.toast('Your hands are full.', 'warn'); return; }
    const left = this.removableItems().filter((o) => !run.fate[o.id]);
    if (left.length) { this.ui.toast('Remove and sort all clothing before hosing.', 'warn'); audio.error(); return; }
    this.player.hasHose = true;
    this.player.setTool('hose');
    run.phase = 'hose';
    this.ensureProxies();
    run.proxies.bake();
    this.emit('hoseTaken');
    this.setObjective('Hold <b>left mouse</b> to spray. Wash off all dirt, blood and anything covering the skin. <kbd>R</kbd> raise arms, <kbd>T</kbd> turn around. Put the hose back on the reel when done.');
  }

  onSpray(origin, dir, dt) {
    const run = this.run;
    if (!run?.ch || run.phase !== 'hose' || !run.proxies) return;
    const res = run.proxies.spray(origin, dir, dt);
    if (res.hitSkin || res.hitHair) {
      run.hoseTime += dt;
      this.world.puddle.material.opacity = Math.min(0.75, this.world.puddle.material.opacity + dt * 0.03);
      if (!run.hosed) { run.hosed = true; this.react('hoseStart', 'surprised', 1); run.ch.animator.shiver = 1; }
    }
    if (res.hitFace) {
      run.faceHits += dt;
      run.ch.face.eyesClosed = 1;
      run.lastFaceHit = performance.now();
      if (run.faceHits > 0.6 && !run.complainedFace) { run.complainedFace = true; this.react('hoseFace', 'angry', 0.6); }
    }
  }

  visitorCommand(cmd) {
    const run = this.run;
    if (!run?.ch || !['decon', 'hose', 'inspect'].includes(run.phase)) return;
    if (this.player.pos.z < 9) return; // must be in the washroom
    if (cmd === 'arms') {
      run.armsUp = !run.armsUp;
      run.ch.animator.setPose(run.armsUp ? 'armsUp' : (this.removableItems().every((o) => o.removed) ? 'shy' : 'idle'));
      if (run.armsUp) this.react('armsUp');
      this.ui.subtitle('You', run.armsUp ? 'Raise your arms.' : 'Lower your arms.', 1.5);
    } else if (cmd === 'turn') {
      run.turned = !run.turned;
      run.ch.turnTarget = run.turned ? 0 : Math.PI;
      this.react('turn');
      this.ui.subtitle('You', 'Turn around.', 1.5);
    }
    this.emit('command', cmd);
    this.rebake(1500);
  }

  returnClothes() {
    const run = this.run;
    if (!run || run.clothesReturned) return;
    if (!['inspect'].includes(run.phase)) { this.ui.toast('Finish washing the visitor first.', 'warn'); return; }
    run.clothesReturned = true;
    // washing removes dirt but not contamination
    for (const s of run.ch.clothSurf.values()) { s.layers.ov.data.fill(0); s.layers.glow.data.fill(0); s.layers.ov.dirty = s.layers.glow.dirty = true; }
    paintClothing(run.ch, run.spec, { washed: true });
    for (const id of run.washer) run.ch.setItemVisible(id, true);
    run.ch.animator.setPose('idle');
    run.armsUp = false;
    this.world.washerLamp.material.emissiveIntensity = 0;
    audio.washer();
    this.react('dressed', 'relaxed', 0.6);
    const burned = Object.entries(run.fate).filter(([, f]) => f === 'burn').length;
    this.ui.toast(burned ? `Clothes returned (${burned} item${burned > 1 ? 's' : ''} burned).` : 'Clothes returned.');
    this.rebake(300);
    this.emit('clothesReturned');
  }

  openTerminal() {
    const run = this.run;
    if (!run || !['inspect', 'hose', 'decon'].includes(run.phase)) { this.ui.toast('No visitor awaiting a decision.'); return; }
    if (run.phase !== 'inspect') { this.ui.toast('Decontamination is not finished (clothes sorted, hosed, hose returned).', 'warn'); audio.error(); return; }
    const s = run.spec;
    const tankFree = this.tanks.findIndex((t) => !t) >= 0;
    const choose = (d) => { m.close(); this.dispose(d); };
    const content = el('div', {},
      el('p', {}, el('b', {}, `${s.card.first} ${s.card.last}`), el('span', { class: 'muted' }, ` · ID stamp: ${run.idStamp}`)),
      el('p', { class: 'muted' }, 'Choose where this visitor goes. Infected or irradiated visitors must be cured before anything else. False identities must be questioned. Only those found dangerous are sent away.'),
      el('div', { class: 'col' },
        el('button', { class: 'good', onclick: () => choose('admit') }, 'Admit into the Haven'),
        el('button', { onclick: () => choose('tank'), disabled: !tankFree }, 'Send to the cure tanks (Medical Lab)' + (tankFree ? '' : ' — all tanks occupied')),
        el('button', { onclick: () => choose('interro') }, 'Hold for interrogation'),
        el('button', { class: 'danger', onclick: () => choose('deny') }, 'Deny entry — send back to the wasteland'),
        el('button', { onclick: () => m.close() }, 'Cancel')));
    const m = this.ui.modal(content, { title: 'Disposition Terminal' });
  }

  async dispose(choice) {
    const run = this.run;
    run.dispo = choice;
    run.dirtLeft = measureDirt(run.ch);
    this.player.hasHose = false;
    if (this.player.tool === 'hose') this.player.setTool('hand');
    this.emit('disposed', choice);
    audio.button();
    if (choice !== 'tank' && !run.clothesReturned) { run.phase = 'inspect'; this.returnClothes(); }
    const ch = run.ch;
    ch.turnTarget = null;
    if (choice === 'admit' || choice === 'deny') {
      this.react(choice, choice === 'admit' ? 'happy' : 'sad', 1);
      ch.face.setBase(choice === 'admit' ? { happy: 0.5 } : { sad: 0.6, angry: 0.2 });
      run.phase = 'leaving';
      const door = choice === 'admit' ? this.world.doors.haven : this.world.doors.waste;
      const dpos = choice === 'admit' ? SPOTS.havenDoor : SPOTS.wasteDoor;
      ch.animator.setPose('idle');
      await sleep(1200);
      door.set(1); audio.bigDoor();
      await this.walkTo(ch, new THREE.Vector3(dpos.x, 0, dpos.z - 0.9));
      await this.walkTo(ch, new THREE.Vector3(dpos.x, 0, dpos.z + 1.2));
      door.set(0);
      this.finishRun(run, choice);
    } else if (choice === 'tank') {
      this.react('tank', 'sad', 0.8);
      await sleep(1500);
      const i = this.tanks.findIndex((t) => !t);
      await this.fade(async () => {
        const patient = { spec: run.spec, ch, level: run.spec.cureDays ? 100 : 0, daysIn: 0, checkedToday: true, idStamp: run.idStamp, run };
        this.finishRun(run, 'tank', true);
        this.tanks[i] = patient;
        this.placeInTank(patient, i);
        audio.bubble();
        this.updateHUD();
      });
      this.ui.toast(`Visitor placed in Tank ${i + 1}. Check the tank console in the Medical Lab every day.`, 'warn', 6);
    } else if (choice === 'interro') {
      this.react('interro', 'angry', 0.7);
      await sleep(1400);
      await this.fade(async () => {
        ch.root.position.copy(SPOTS.interroSeat);
        ch.root.rotation.y = Math.PI / 2;
        ch.animator.setPose('sit');
        ch.animator.lookTarget = null;
        ch.face.setBase({ sad: 0.4 });
        run.proxies?.dispose();
        this.recordResults(run.spec, this.evaluate(run, 'interro'));
        this.interro = { run, stage: 'waiting' };
        this.run = null;
        run.phase = 'interrogation';
        this.updateHUD();
      });
      this.ui.toast('Visitor is waiting in the Interrogation room. Use the console there to review the questioning.', 'warn', 6);
      this.setObjective('Go to the <b>Interrogation</b> room and use the console to review the questioning.');
    }
  }

  finishRun(run, outcome, keepModel = false) {
    const results = this.evaluate(run, outcome);
    this.recordResults(run.spec, results);
    if (!keepModel) run.ch?.dispose();
    run.proxies?.dispose();
    run.cardMesh?.userData.textures?.forEach((t) => t.dispose());
    if (this.run === run) this.run = null;
    this.updateHUD();
    if (!this.interro) this.setObjective(this.queue.length ? 'Return to the booth and call the next visitor (<b>NEXT</b> button).' : 'All visitors processed. Check the tanks in the Medical Lab, then press <b>NEXT</b> in the booth to end your shift.');
  }

  recordResults(spec, results) {
    let delta = 0;
    for (const r of results) delta += r.sev === 'ok' ? 5 : r.sev === 'minor' ? -5 : r.sev === 'major' ? -20 : 0;
    this.credits += delta;
    const name = `${spec.card.first} ${spec.card.last}`;
    const existing = this.dayLog.find((e) => e.spec.id === spec.id);
    if (existing) { existing.results.push(...results); existing.delta += delta; }
    else this.dayLog.push({ spec, name, results, delta });
    const majors = results.filter((r) => r.sev === 'major').length;
    if (majors) audio.error();
    this.updateHUD();
  }

  // Compare what the player did with the correct procedure.
  evaluate(run, outcome) {
    const s = run.spec;
    const R = [];
    const add = (sev, text) => R.push({ sev, text });
    if (['admit', 'deny', 'tank', 'interro'].includes(outcome)) {
      // pockets
      for (const [itemId, objs] of Object.entries(s.pockets)) {
        for (const o of objs) {
          const def = OBJECTS[o.type];
          const found = run.found.find((f) => f.itemId === itemId && f.type === o.type);
          if (found) {
            if (def.bad && found.decision === 'confiscate') add('ok', `Confiscated ${def.label.toLowerCase()}.`);
            else if (def.bad) add('major', `Allowed contraband inside: ${def.label.toLowerCase()}.`);
            else if (found.decision === 'confiscate') add('minor', `Confiscated a harmless item (${def.label.toLowerCase()}).`);
          } else {
            const fate = run.fate[itemId];
            if (def.bad && fate === 'burn') add('info', `A ${def.label.toLowerCase()} was destroyed in the incinerator unnoticed.`);
            else if (def.bad && fate === 'wash') add('major', `Missed contraband hidden in clothing: ${def.label.toLowerCase()}.`);
            else if (!def.bad && fate === 'burn') add('minor', `Personal belongings burned with clothing (${def.label.toLowerCase()}).`);
          }
        }
      }
      // clothing
      const items = run.ch ? [...run.ch.items.values()] : run.itemsSnapshot || [];
      for (const it of items) {
        if (['underwear', 'fixed'].includes(it.category)) continue;
        const kind = s.clothing[it.id] || 'none';
        const fate = run.fate[it.id];
        const contaminated = CONTAMINATED.includes(kind);
        if (contaminated && fate === 'burn') add('ok', `Burned contaminated ${it.name.toLowerCase()}.`);
        else if (contaminated) add('major', `Contaminated ${it.name.toLowerCase()} was washed and returned.`);
        else if (fate === 'burn') add('minor', `Burned clean ${it.name.toLowerCase()}${kind === 'mud' ? ' (it was only muddy)' : ''}.`);
      }
      // thoroughness
      if (run.ch && run.ch.initialDirt && run.dirtLeft) {
        const fr = run.dirtLeft.dirt / Math.max(1, run.ch.initialDirt.dirt);
        if (fr > 0.3) add('minor', `Visitor was not washed thoroughly (${Math.round(fr * 100)}% of grime left).`);
        else add('ok', 'Visitor washed thoroughly.');
      }
    }
    const c = correctOutcome(s);
    const d = outcome;
    if (d === 'tank') { if (c.tank) add('ok', 'Infected/irradiated visitor sent to the cure tanks.'); else add('minor', 'Healthy visitor quarantined unnecessarily.'); }
    if (d === 'admit' || d === 'tankRelease-admit') {
      if (c.tank && d === 'admit') add('major', `Admitted a visitor showing signs of infection or radiation (${s.problems.filter((p) => ['discoloredSclera', 'discoloredSkin', 'biteMarks', 'radiation'].includes(p)).map((p) => PROBLEM_LABEL[p].toLowerCase()).join(', ')}).`);
      if (c.interrogate) add('major', `Admitted a visitor with a false identity without questioning (${s.problems.filter((p) => ['invalidPortrait', 'invalidName', 'invalidDetails', 'forgedSeal'].includes(p)).map((p) => PROBLEM_LABEL[p].toLowerCase()).join(', ')}).`);
      if (!(c.tank && d === 'admit') && !c.interrogate) add('ok', 'Correctly admitted.');
    }
    if (d === 'deny' || d === 'tankRelease-deny') {
      if (c.interrogate) add('minor', 'Denied entry without questioning. Procedure: false identities are held for interrogation.');
      else add('major', 'Wrongfully denied entry to a legitimate visitor.');
    }
    if (d === 'interro' || d === 'tankRelease-interro') {
      if (!c.interrogate) add('minor', 'Interrogated a visitor whose identity was genuine.');
      else add('ok', 'False identity held for questioning.');
      if (c.tank && d === 'interro') add('major', 'Infected visitor was not sent to the cure tanks.');
    }
    if (d === 'interro-admit') { if (c.dangerous) add('major', 'Admitted an individual the interrogation found DANGEROUS.'); else add('ok', 'Admitted after questioning — not a threat.'); }
    if (d === 'interro-deny') { if (c.interrogate && !c.dangerous) add('major', 'Denied a visitor the interrogation cleared as not a threat.'); else add('ok', 'Dangerous individual sent away.'); }
    return R;
  }

  // ----------------------------------------------------------- interrogation
  async openInterrogation() {
    const I = this.interro;
    if (!I) { this.ui.toast('No one is being questioned.'); return; }
    const run = I.run, s = run.spec, ch = run.ch;
    const log = el('div', { class: 'dialog-log', style: { maxHeight: '320px' } });
    const verdict = el('div');
    const content = el('div', {}, el('p', { class: 'muted' }, `Subject: ${s.card.first} ${s.card.last} (ID stamp: ${run.idStamp})`), log, verdict);
    const m = this.ui.modal(content, { title: 'Interrogation Record', side: true });
    const add = (who, text, cls) => { log.append(el('div', { class: cls }, el('b', {}, who + ': '), text)); log.scrollTop = 1e6; };
    if (I.stage === 'waiting') {
      I.stage = 'questioning';
      const qs = INTERRO_Q.slice(0, 3);
      const answersHarmless = ['I... I can explain.', 'Please, just listen.', 'I had no choice.'];
      const answersDanger = ["I don't have to tell you anything.", 'You have no idea who you are dealing with.', '...'];
      for (let k = 0; k < qs.length; k++) {
        if (!m.el.isConnected) break;
        add('Interrogator', qs[k], 'you');
        this.ui.subtitle('Interrogator', qs[k], 2.5);
        await sleep(1700);
        const a = (s.interrogation?.dangerous ? answersDanger : answersHarmless)[k];
        ch.face.flash(s.interrogation?.dangerous ? 'angry' : 'sad', 0.7, 2.5);
        add('Subject', a);
        this.say(ch, a, 'Subject');
        await sleep(2000);
      }
      I.stage = 'decide';
    } else {
      add('Record', 'Questioning complete.');
    }
    const dangerous = s.interrogation?.dangerous;
    const motive = s.interrogation?.motive || 'Subject\'s identity checks out. The card is genuine and the subject has no reason to lie.';
    verdict.append(
      el('h3', { class: dangerous ? 'bad' : 'ok' }, dangerous ? 'ASSESSMENT: DANGEROUS' : 'ASSESSMENT: NOT A THREAT'),
      el('p', {}, motive),
      el('div', { class: 'row' },
        el('button', { class: 'good', onclick: () => { m.close(); this.resolveInterrogation('admit'); } }, 'Admit into the Haven'),
        el('button', { class: 'danger', onclick: () => { m.close(); this.resolveInterrogation('deny'); } }, 'Deny entry')));
  }

  async resolveInterrogation(choice) {
    const I = this.interro;
    if (!I) return;
    const run = I.run;
    this.interro = null;
    await this.fade(async () => {
      const results = this.evaluate(run, 'interro-' + choice);
      this.recordResults(run.spec, results);
      run.ch.dispose();
    });
    this.ui.toast(choice === 'admit' ? 'Visitor admitted after questioning.' : 'Visitor escorted back to the wasteland.', choice === 'admit' ? 'good' : 'warn');
    this.emit('interroResolved', choice);
    this.setObjective(this.queue.length ? 'Return to the booth and call the next visitor.' : 'All visitors processed. Press <b>NEXT</b> in the booth to end your shift.');
  }

  // ---------------------------------------------------------------- tanks
  openTank(i) {
    const t = this.tanks[i];
    if (!t) { this.ui.modal(el('p', {}, `Tank ${i + 1} is empty.`), { title: `Tank ${i + 1}` }); return; }
    const s = t.spec;
    const infected = ['discoloredSclera', 'discoloredSkin', 'biteMarks'].some((p) => s.problems.includes(p));
    const rad = s.problems.includes('radiation');
    const pathogen = infected ? t.level : 0;
    const radLevel = rad ? t.level : 0;
    const bar = (v, color) => el('div', { style: { height: '14px', background: '#222', borderRadius: '3px', overflow: 'hidden', margin: '4px 0 10px' } }, el('div', { style: { width: v + '%', height: '100%', background: color } }));
    const status = el('p');
    const update = () => { status.innerHTML = t.checkedToday ? '<span class="ok">Cure cycle administered today.</span>' : '<span class="warn">Cure cycle NOT yet administered today.</span>'; };
    update();
    const content = el('div', {},
      el('p', {}, el('b', {}, `${s.card.first} ${s.card.last}`), el('span', { class: 'muted' }, ` · ${t.daysIn} day(s) in tank · ID stamp: ${t.idStamp}`)),
      el('div', {}, 'Pathogen load: ', el('b', {}, `${Math.round(pathogen)}%`)), bar(pathogen, '#8fd14f'),
      el('div', {}, 'Radiation contamination: ', el('b', {}, `${Math.round(radLevel)}%`)), bar(radLevel, '#ffb347'),
      status,
      el('div', { class: 'row' },
        el('button', { class: 'primary', disabled: t.checkedToday, onclick: (e) => { t.checkedToday = true; audio.bubble(); audio.good(); update(); e.target.disabled = true; this.emit('tankChecked', i); } }, 'Check vitals & administer cure cycle'),
        el('button', { onclick: () => { m.close(); this.releasePatient(i); } }, 'Release patient'),
        el('button', { onclick: () => m.close() }, 'Close')),
      el('p', { class: 'muted' }, 'Patients must be checked every day. Release them only when both readings are at 0%.'));
    const m = this.ui.modal(content, { title: `Tank ${i + 1} — Patient Monitor` });
    this.emit('tankOpened', i);
  }

  releasePatient(i) {
    const t = this.tanks[i];
    if (!t) return;
    const early = t.level > 0;
    const content = el('div', {},
      el('p', {}, early ? el('span', { class: 'warn' }, 'Warning: readings are not at 0%. Releasing now is against procedure.') : 'Patient is cured.'),
      el('p', { class: 'muted' }, `Booth stamp on their ID: ${t.idStamp}. Where should they go?`),
      el('div', { class: 'col' },
        el('button', { class: 'good', onclick: () => go('admit') }, 'Admit into the Haven'),
        el('button', { onclick: () => go('interro'), disabled: !!this.interro }, 'Hold for interrogation' + (this.interro ? ' (room busy)' : '')),
        el('button', { class: 'danger', onclick: () => go('deny') }, 'Deny entry'),
        el('button', { onclick: () => m.close() }, 'Cancel')));
    const m = this.ui.modal(content, { title: 'Release Patient' });
    const go = async (choice) => {
      m.close();
      const run = t.run || { spec: t.spec, found: [], fate: {}, idStamp: t.idStamp };
      const results = [];
      if (early) results.push({ sev: 'major', text: 'Released a patient before the cure was complete.' });
      else results.push({ sev: 'ok', text: 'Patient fully cured before release.' });
      this.tanks[i] = null;
      const ch = t.ch;
      await this.fade(async () => {
        if (choice === 'interro') {
          ch.setFloating(false); ch.face.eyesClosed = 0;
          for (const id of run.washer || []) ch.setItemVisible(id, true);
          ch.root.position.copy(SPOTS.interroSeat); ch.root.rotation.y = Math.PI / 2; ch.animator.setPose('sit'); ch.animator.lookTarget = null; ch.face.setBase({ sad: 0.4 });
          run.ch = ch;
          this.interro = { run, stage: 'waiting' };
        } else ch.dispose();
      });
      const sub = this.evaluate({ ...run, ch: null }, 'tankRelease-' + choice).filter((r) => !/cure tanks/.test(r.text));
      this.recordResults(t.spec, [...results, ...sub]);
      this.ui.toast(choice === 'admit' ? 'Patient released into the Haven.' : choice === 'deny' ? 'Patient sent away.' : 'Patient moved to interrogation.');
      this.updateHUD();
    };
  }

  // ------------------------------------------------------------- end of day
  async endDay() {
    if (this.run || this.interro) return;
    const neglect = [];
    this.tanks.forEach((t, i) => {
      if (!t) return;
      if (!t.checkedToday && t.level > 0) neglect.push({ spec: t.spec, results: [{ sev: 'minor', text: `Tank ${i + 1} patient was not checked today — no cure progress.` }] });
    });
    for (const n of neglect) this.recordResults(n.spec, n.results);
    // report
    const rows = this.dayLog.map((e) => el('tr', {},
      el('td', {}, el('b', {}, e.name)),
      el('td', {}, e.results.length ? e.results.map((r) => el('div', { class: r.sev === 'ok' ? 'ok' : r.sev === 'minor' ? 'warn' : r.sev === 'major' ? 'bad' : 'muted' }, (r.sev === 'ok' ? '✔ ' : r.sev === 'info' ? '• ' : '✖ ') + r.text)) : el('span', { class: 'muted' }, '—')),
      el('td', { class: e.delta >= 0 ? 'ok' : 'bad' }, (e.delta >= 0 ? '+' : '') + e.delta)));
    const dayDelta = this.dayLog.reduce((a, e) => a + e.delta, 0);
    const majors = this.dayLog.reduce((a, e) => a + e.results.filter((r) => r.sev === 'major').length, 0);
    const content = el('div', { class: 'report' },
      el('p', {}, `Shift complete. Net credits today: `, el('b', { class: dayDelta >= 0 ? 'ok' : 'bad' }, String(dayDelta)), ` · Total: ${this.credits}`),
      majors ? el('p', { class: 'bad' }, `${majors} serious violation(s) recorded by Haven Security.`) : el('p', { class: 'ok' }, 'No serious violations. Good work, officer.'),
      el('table', {}, el('tr', {}, el('th', {}, 'Visitor'), el('th', {}, 'Findings'), el('th', {}, 'Credits')), rows),
      el('div', { class: 'row' }, el('button', { class: 'primary', onclick: () => { m.close(); this.nextDay(); } }, 'Begin next day'), el('button', { onclick: () => { m.close(); this.app.toMenu(); } }, 'Save & quit to menu')));
    const m = this.ui.modal(content, { title: `End of Day ${this.day}`, closable: false });
    this.advanceTanks();
    await this.save(this.day + 1);
    this.emit('dayEnded');
  }

  advanceTanks() {
    this.tanks.forEach((t) => {
      if (!t) return;
      t.daysIn++;
      if (t.checkedToday && t.level > 0) {
        const per = 100 / Math.max(1, t.spec.cureDays);
        t.level = Math.max(0, t.level - per * (0.9 + Math.random() * 0.25));
        if (t.level < 6) t.level = 0;
      }
    });
  }

  async nextDay() { await this.startDay(this.day + 1); }

  async save(day = this.day) {
    const data = { version: 1, day, credits: this.credits, tanks: this.tanks.map((t) => (t ? { spec: t.spec, level: t.level, daysIn: t.daysIn, idStamp: t.idStamp, washer: t.run?.washer || [] } : null)) };
    await storeSet('save', data);
  }
  async load(data) {
    this.credits = data.credits || 0;
    this.tanks = (data.tanks || [null, null, null, null]).map((t) => (t ? { spec: t.spec, level: t.level, daysIn: t.daysIn, idStamp: t.idStamp, checkedToday: false, run: { spec: t.spec, washer: t.washer, found: [], fate: {}, idStamp: t.idStamp } } : null));
    while (this.tanks.length < 4) this.tanks.push(null);
    await this.startDay(data.day || 1);
  }

  // -------------------------------------------------------------- radiation
  radiationAt(p) {
    let r = 0;
    const add = (pos, strength) => { const d2 = p.distanceToSquared(pos); r += strength / (d2 * 6 + 0.15); };
    const run = this.run;
    const v = new THREE.Vector3();
    if (run?.ch) {
      for (const it of run.ch.items.values()) {
        if (run.spec.clothing[it.id] !== 'rad') continue;
        if (!it.removed) add(run.ch.boneWorld(it.anchor, v), 0.6);
        else if (this.player.carrying?.itemId === it.id) add(this.engine.camera.localToWorld(v.set(0, -0.3, -0.5)), 0.6);
        else if (run.fate[it.id] === 'wash') add(new THREE.Vector3(-5.5, 0.5, 12), 0.6);
      }
      if (run.spec.body.rad > 0) for (const b of ['chest', 'hips', 'head', 'leftLowerLeg', 'rightLowerArm']) add(run.ch.boneWorld(b, v), 0.07 * run.spec.body.rad);
    }
    this.tanks.forEach((t, i) => { if (t && t.spec.body.rad > 0 && t.level > 0) add(TANK_POS[i].clone().setY(1.2), 0.05 * t.spec.body.rad * t.level / 100); });
    return r;
  }

  // ------------------------------------------------------------ interaction
  setupHandlers() {
    const W = this.world.interact;
    const H = this.handlers = {};
    const reg = (id, label, action, range = 2.2) => { H[id] = { obj: W[id], label, action, range }; };
    reg('callNext', () => (this.run || this.busy ? null : this.interro ? 'Resolve the interrogation first' : this.queue.length ? 'Call next visitor' : 'End shift'), () => this.callNext());
    reg('sendDecon', () => (this.run?.phase === 'booth' ? 'Send visitor to decontamination' : null), () => this.sendToDecon());
    reg('stampApprove', () => (this.run?.phase === 'booth' && !this.run.idStamp ? 'Stamp ID: APPROVED' : null), () => this.stamp('APPROVED'));
    reg('stampFlag', () => (this.run?.phase === 'booth' && !this.run.idStamp ? 'Stamp ID: FLAG for questioning' : null), () => this.stamp('FLAGGED'));
    reg('intercom', () => (this.run?.phase === 'booth' ? 'Use intercom (question visitor)' : null), () => this.openIntercom());
    reg('rulebook', () => 'Read procedures', () => this.openRulebook());
    reg('washer', () => {
      if (this.player.carrying) return `Load ${this.player.carrying.name} into the washer`;
      if (this.run?.phase === 'inspect' && !this.run.clothesReturned) return 'Unload washer and return clothes';
      return null;
    }, () => (this.player.carrying ? this.depositCarried('wash') : this.returnClothes()));
    reg('incinerator', () => (this.player.carrying ? `Burn ${this.player.carrying.name}` : null), () => this.depositCarried('burn'));
    reg('hose', () => (this.player.hasHose ? 'Put the hose back' : this.run && ['decon', 'hose', 'inspect'].includes(this.run.phase) ? 'Take the hose' : null), () => this.toggleHose(), 2.4);
    reg('terminal', () => (this.run && ['decon', 'hose', 'inspect'].includes(this.run.phase) ? 'Disposition terminal' : null), () => this.openTerminal());
    reg('interroConsole', () => (this.interro ? 'Review interrogation' : null), () => this.openInterrogation());
    for (let i = 0; i < 4; i++) reg('tank' + i, () => (this.tanks[i] ? `Tank ${i + 1} monitor` : `Tank ${i + 1} (empty)`), () => this.openTank(i));
  }

  findHover() {
    if (!this.player.enabled) return null;
    const cam = this.engine.camera;
    const origin = cam.getWorldPosition(new THREE.Vector3());
    const dir = cam.getWorldDirection(new THREE.Vector3());
    this.raycaster.set(origin, dir);
    this.raycaster.far = 3;
    let best = null;
    const objs = [];
    for (const [id, h] of Object.entries(this.handlers)) if (h.obj) objs.push(h.obj);
    const hits = this.raycaster.intersectObjects(objs, false);
    for (const hit of hits) {
      const id = Object.keys(this.handlers).find((k) => this.handlers[k].obj === hit.object);
      const h = this.handlers[id];
      if (hit.distance > h.range) continue;
      const label = h.label();
      if (!label) continue;
      best = { distance: hit.distance, label, action: h.action, id };
      break;
    }
    // ID card on the desk
    const run = this.run;
    if (run?.cardMesh?.parent) {
      const hit = this.raycaster.intersectObject(run.cardMesh, false)[0];
      if (hit && hit.distance < 2.0 && (!best || hit.distance < best.distance + 0.3)) best = { distance: hit.distance, label: 'Examine ID card', action: () => this.openCard(), id: 'card' };
    }
    // visitor clothing / body
    if (run?.ch && ['decon', 'hose', 'inspect'].includes(run.phase) && this.player.pos.z > 9) {
      const px = this.ensureProxies();
      const hit = px?.raycast(origin, dir, 2.6);
      if (hit && (!best || hit.distance < best.distance)) {
        if (hit.data.kind === 'item' && run.phase === 'decon') {
          const it = run.ch.items.get(hit.data.itemId);
          best = { distance: hit.distance, label: `${it.name} — inspect / search / remove`, action: () => this.itemMenu(it.id), id: 'item:' + it.id, itemId: it.id };
        } else best = { distance: hit.distance, label: `Visitor — <kbd>R</kbd> arms up/down · <kbd>T</kbd> turn around`, action: null, id: 'visitor' };
      }
    }
    return best;
  }

  interact() {
    if (!this.hover?.action || this.busy) return;
    this.hover.action();
  }

  openRulebook() { this.emit('rulebookOpened'); openRulebook(this.ui); }

  onKey(e) {
    if (!this.active) return;
    const top = this.ui.modals[this.ui.modals.length - 1];
    if (top) {
      if (e.code === 'Escape') { e.preventDefault(); this.ui.closeTop(); }
      else top.keys?.(e);
      if (e.code === 'Tab') e.preventDefault();
      return;
    }
    if (this.paused) return;
    if (e.code === 'KeyE') this.interact();
    else if (e.code === 'Tab') { e.preventDefault(); this.openRulebook(); }
    else if (e.code === 'KeyC' && !e.ctrlKey && this.run?.cardFront && this.run.phase !== 'booth') this.openCard();
    else if (e.code === 'KeyR') this.visitorCommand('arms');
    else if (e.code === 'KeyT') this.visitorCommand('turn');
    else if (/^Digit[1-5]$/.test(e.code)) {
      const id = ['hand', 'flashlight', 'uv', 'geiger', 'hose'][Number(e.code.slice(5)) - 1];
      if (!this.player.setTool(id)) { if (id === 'hose') this.ui.toast('Take the hose from the reel in the washroom.'); }
      else this.emit('tool', id);
    }
  }

  onModalChange() {
    const open = this.ui.modalOpen;
    this.player.enabled = !open && !this.paused;
    if (open) this.player.unlock();
    else if (!this.paused && this.active) this.player.lock();
  }

  onPointerLockChange() {
    if (!this.active) return;
    if (!this.player.locked && !this.ui.modalOpen && !this.paused) this.app.pause();
    if (this.player.locked) this.player.enabled = !this.ui.modalOpen && !this.paused;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    if (!this.active) return;
    this.player.update(dt);
    const extra = [];
    if (this.run?.ch) extra.push(this.run.ch.root.position);
    this.world.update(dt, this.player.pos, extra);
    // characters
    const chars = [];
    if (this.run?.ch) chars.push(this.run.ch);
    if (this.interro?.run.ch) chars.push(this.interro.run.ch);
    for (const t of this.tanks) if (t?.ch) chars.push(t.ch);
    for (const ch of chars) {
      this.updateWalk(ch, dt);
      if (ch.turnTarget != null && !ch.walk) {
        let diff = ch.turnTarget - ch.root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ch.root.rotation.y += diff * Math.min(1, dt * 3);
      }
      // only animate distant tank patients at a low rate
      const far = this.player.pos.distanceTo(ch.root.position) > 12;
      ch._acc = (ch._acc || 0) + dt;
      if (!far || ch._acc > 0.2) { ch.update(ch._acc); ch._acc = 0; }
    }
    const run = this.run;
    if (run?.ch) {
      const ch = run.ch;
      if (run.lastFaceHit && performance.now() - run.lastFaceHit > 900) { ch.face.eyesClosed = 0; run.lastFaceHit = 0; }
      if (ch.animator.shiver > 0 && !this.player.spraying) ch.animator.shiver = Math.max(run.phase === 'hose' ? 0.3 : 0, ch.animator.shiver - dt * 0.2);
      ch.face.squint = this.player.spraying && run.phase === 'hose' ? 0.6 : 0;
      if (this.player.tool === 'flashlight' && this.player.pos.distanceTo(ch.root.position) < 2.2) ch.face.squint = Math.max(ch.face.squint, 0.4);
    }
    // hover + prompt
    this._hoverAcc = (this._hoverAcc || 0) + dt;
    if (this._hoverAcc > 0.08) {
      this._hoverAcc = 0;
      const prev = this.hover;
      this.hover = this.findHover();
      if (run?.ch) run.ch.setItemHighlight(this.hover?.itemId || null, !!this.hover?.itemId);
      if (prev?.id !== this.hover?.id || prev?.label !== this.hover?.label) this.ui.prompt(this.hover ? (this.hover.action ? `<kbd>E</kbd> ${this.hover.label}` : this.hover.label) : '');
    }
    if (this.player.mouse.left && this.player.tool === 'hand' && this.player.enabled && !this._clickLatch) { this._clickLatch = true; this.interact(); }
    if (!this.player.mouse.left) this._clickLatch = false;
    this.ui.toolbar(this.player);
    // tank screens pulse
    this.world.tanks.forEach((tk, i) => { tk.screen.material.emissiveIntensity = this.tanks[i] ? (this.tanks[i].checkedToday ? 0.6 : 0.3 + 0.3 * Math.sin(performance.now() * 0.006)) : 0.05; tk.light.intensity = this.tanks[i] ? 2.2 : 0.6; });
    // tutorial movement event
    if (!this._lastPos) this._lastPos = this.player.pos.clone();
    this._moved = (this._moved || 0) + this.player.pos.distanceTo(this._lastPos);
    this._lastPos.copy(this.player.pos);
    if (this._moved > 3 && !this._movedEmitted) { this._movedEmitted = true; this.emit('moved'); }
    if (this.player.pos.z > 10 && !this._inWash) { this._inWash = true; this.emit('enteredWashroom'); }
    if (this.player.pos.z < 9) this._inWash = false;
    if (this.player.pos.x > 7 && !this._inLab) { this._inLab = true; this.emit('enteredLab'); }
    if (this.player.pos.x < 6) this._inLab = false;
  }
}
