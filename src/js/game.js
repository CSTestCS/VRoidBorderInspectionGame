// Core game controller: days, visitors, stations, decisions and scoring.
import * as THREE from 'three';
import { World, SPOTS, TANK_POS, PATHS, tankApproach } from './world.js';
import { Player } from './player.js';
import { audio } from './audio.js';
import { makeVoiceProfile } from './voice.js';
import { keys as KB, K, keyName } from './keys.js';
import { RNG, el, clamp, damp, sleep } from './util.js';
import { generateVisitor, buildVisitorCharacter, correctOutcome, measureDirt, paintClothing, PROBLEM_LABEL, CURRENT_YEAR } from './visitor.js';
import { renderPortrait, renderPortraitFrom, compileGradually } from './portrait.js';
import { drawCardFront, drawCardBack, drawCardUV, makeCardMesh, fmtDate } from './idcard.js';
import { patchMaterial } from './vrm/materials.js';
import { OBJECTS } from './objects.js';
import { ObjectViewer } from './objectViewer.js';
import { openRulebook } from './rulebook.js';
import { REACT, GREETINGS, HANDOVER, NAME_HESITATE, NO_CONTRABAND, NO_CONTRABAND_LIE, NO_BITE, NO_BITE_LIE, INTERRO_Q } from './data.js';
import { drawCardFront as drawFront, drawCardUV as drawUV } from './idcard.js';
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
    this.walkers = new Set(); // characters walking somewhere on their own
    this.idCompare = {};
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
    this.player.aimDistanceFn = (origin, dir) => {
      const hit = this.run?.proxies?.raycast(origin, dir, 6, ['skin', 'hair', 'item']);
      if (hit) return hit.distance;
      this.raycaster.set(origin, dir); this.raycaster.far = 6;
      const w = this.raycaster.intersectObject(this.world.group, true).find((h) => h.object.visible && h.object.material?.visible !== false);
      return w ? w.distance : 3;
    };
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
    this.precompileWorld();
  }

  // Compile the facility, held tools and the ID card at the loading screen so
  // nothing in the environment compiles mid-game.
  precompileWorld() {
    const r = this.engine.renderer;
    const blank = document.createElement('canvas'); blank.width = blank.height = 4;
    const card = makeCardMesh(blank, blank, blank, patchMaterial);
    this.scene.add(card);
    const tools = Object.values(this.player.T);
    const vis = tools.map((t) => t.visible);
    tools.forEach((t) => (t.visible = true));
    const prev = r.getRenderTarget();
    try {
      r.setRenderTarget(this.engine.composer.renderTarget1);
      r.compile(this.scene, this.engine.camera);
    } catch (e) { console.warn(e); }
    r.setRenderTarget(prev);
    tools.forEach((t, i) => (t.visible = vis[i]));
    this.scene.remove(card);
    card.userData.textures.forEach((t) => t.dispose());
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
    this.prepared?.done?.then((j) => j?.ch?.dispose()).catch(() => {});
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
    this.rainy = !preset && dayNumber >= 2 && rng.chance(0.3);
    this.world.setRain(this.rainy);
    this.idCompare = {};
    this.prepared?.done?.then((j) => j?.ch && j.ch !== this.run?.ch && j.ch.dispose());
    this.prepared = null;
    this.prepareNext();
    for (const t of this.tanks) if (t) t.checkedToday = false;
    await this.loadTankCharacters();
    this.player.teleport(SPOTS.playerStart, 0, -0.05);
    this.updateHUD();
    this.setObjective('Press the green <b>NEXT</b> button on your desk to call the first visitor.');
    this.ui.toast(`Day ${dayNumber} — ${this.dayTotal} visitors expected.`, 'warn', 5);
    if (this.rainy) this.ui.toast('Heavy rain outside today. Visitors will arrive soaked.', '', 6);
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
    ch.lookAt(null);
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
    if (ch && !ch.voice && ch.spec) ch.voice = makeVoiceProfile(ch.spec.seed, ch.spec.sex, ch.spec.age);
    // voices behind glass come through the intercom; in-room voices are panned
    const behindGlass = ch && (this.run?.ch === ch && ['arriving', 'booth'].includes(this.run.phase) || this.interro?.run.ch === ch);
    let pan = 0;
    if (ch) {
      const cam = this.engine.camera;
      const p = ch.root.position.clone().add(new THREE.Vector3(0, 1.5, 0)).applyMatrix4(cam.matrixWorldInverse);
      pan = Math.max(-0.8, Math.min(0.8, p.x / Math.max(0.5, Math.hypot(p.x, p.z))));
    }
    const emotion = ch?.face?.timed?.[ch.face.timed.length - 1]?.name || (ch?.face?.base?.sad > 0.3 ? 'sad' : ch?.face?.base?.happy > 0.3 ? 'happy' : 'neutral');
    const v = ch
      ? audio.voice(text, female, { profile: ch.voice, radio: behindGlass, pan: behindGlass ? 0 : pan, emotion })
      : audio.voice(text, false, { profile: this.interrogatorVoice || (this.interrogatorVoice = makeVoiceProfile(4242, 'male', 'adult')), radio: true });
    const dur = v.duration || text.length * 0.05;
    ch?.face?.talk(dur + 0.5, v.syllables);
    if (v.utterance && ch) {
      // re-sync the lips when the system voice actually starts / stops
      v.utterance.onstart = () => ch.face?.talk(dur, v.syllables);
      v.utterance.onend = () => ch.face?.stopTalking();
    }
    const an = ch?.animator;
    if (an && text.length > 28 && !an.walking && an.pose !== 'armsUp' && Math.random() < an.personality.gesture) an.play(Math.random() < 0.6 ? 'explain' : 'explainL');
    this.ui.subtitle(who || (ch?.spec ? this.speakerName(ch) : ''), text, Math.max(2.5, dur + 1.2));
    return dur;
  }
  react(kind, emotion = null, w = 0.8, run = this.run) {
    const r = run;
    if (!r?.ch) return;
    const line = this.pickLine(REACT[kind], r);
    if (line) this.say(r.ch, line);
    if (emotion) r.ch.face.flash(emotion, w, 2.2);
  }

  // After the booth the officer knows the name on the card.
  speakerName(ch) { return ch?.knownName || 'Visitor'; }

  // pools are arrays, or { neutral, friendly, hostile } chosen by the visitor's favor
  pickLine(pool, run) {
    if (!pool) return null;
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    if (Array.isArray(pool)) return pick(pool);
    const f = run?.favor ?? 0;
    return pick(f > 35 && pool.friendly ? pool.friendly : f < -35 && pool.hostile ? pool.hostile : pool.neutral);
  }

  // Favor: how the visitor feels about the officer (-100..100).
  favor(run, delta) {
    if (!run) return;
    run.favor = clamp((run.favor ?? 0) + delta, -100, 100);
    if (run.ch) run.ch.face.attitude = run.favor / 100;
  }
  attitudeLabel(f, admire = false) {
    if (admire || f >= 70) return 'Admires you';
    if (f >= 35) return 'Friendly';
    if (f >= 10) return 'Cooperative';
    if (f > -10) return 'Neutral';
    if (f > -35) return 'Annoyed';
    if (f > -70) return 'Frustrated';
    return 'Furious';
  }
  noteAttitude(run) {
    const e = this.dayLog.find((x) => x.spec.id === run.spec.id);
    if (e) { e.favor = run.favor ?? 0; e.admire = !!run.admire; }
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
      favor: Math.round(new RNG((spec.seed ^ 0xfa) >>> 0).float(-12, 15)), questions: 0,
    };
    try {
      const ready = await this.takePrepared(spec);
      const ch = ready.ch;
      run.ch = ch;
      run.portrait = ready.portrait;
      ch.face.attitude = run.favor / 100;
      ch.root.position.copy(SPOTS.visitorSpawn);
      ch.root.rotation.y = 0;
      ch.animator.lookTarget = this.engine.camera;
      ch.animator.lookWeight = 0.15;
      ch.lookAt(this.engine.camera);
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
      ch.animator.reach = { right: new THREE.Vector3(0.04, 1.06, -0.18) };
      await sleep(900);
      this.say(ch, HANDOVER[Math.floor(Math.random() * HANDOVER.length)]);
      this.placeCard(run);
      await sleep(600);
      ch.animator.setPose('idle');
      ch.animator.reach = null;
      ch.animator.mood = 'waiting';
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

  // ---------------------------------------------------------- preparation
  // Visitors are built ahead of time, a little at a time, so calling one is instant.
  prepare(spec) {
    if (!spec) return null;
    if (this.prepared?.spec === spec) return this.prepared;
    const job = { spec, ch: null, portrait: null };
    job.done = (async () => {
      const ch = await buildVisitorCharacter(spec, this.modelsById);
      job.ch = ch;
      if (this.rainy) { ch.setWetAll(0.9); ch.setHairWet(0.85); ch.setClothWet(1); }
      // the portrait normally shows the same model; only a false identity needs another one
      job.portrait = spec.card.portrait.modelId === spec.modelId
        ? await renderPortraitFrom(this.engine, ch, spec.card.portrait.look)
        : await renderPortrait(this.engine, this.modelsById, spec.card.portrait);
      await this.warm(ch);
      return job;
    })();
    job.done.catch((e) => console.error('prepare failed', e));
    this.prepared = job;
    return job;
  }

  async takePrepared(spec) {
    const job = this.prepared?.spec === spec ? this.prepared : this.prepare(spec);
    this.prepared = null;
    await job.done;
    return job;
  }

  prepareNext() {
    if (!this.prepared && this.queue.length) this.prepare(this.queue[0]);
  }

  // Compile every shader variant (skinned + static carried-item twins) without
  // blocking, then upload textures one per frame.
  async warm(ch) {
    const r = this.engine.renderer;
    const twins = new THREE.Group();
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    tg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
    tg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2));
    for (const it of ch.items.values()) for (const m of it.meshes) { const tw = new THREE.Mesh(tg, m.material); tw.frustumCulled = false; twins.add(tw); }
    ch.root.add(twins);
    const prevVis = ch.root.visible;
    await compileGradually(r, ch.root, this.engine.camera, this.scene, this.engine.composer.renderTarget1);
    // one tiny off-screen draw finishes linking every program and uploads buffers
    const rt = this.warmTarget || (this.warmTarget = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType }));
    const hidden = [];
    this.scene.traverse((o) => { if (o !== this.scene && o.parent === this.scene && o.visible && o !== this.engine.camera && !o.isLight) { hidden.push(o); o.visible = false; } });
    const oldParent = ch.root.parent;
    this.scene.add(ch.root);
    const prev = r.getRenderTarget();
    r.setRenderTarget(rt);
    r.render(this.scene, this.engine.camera);
    r.setRenderTarget(prev);
    if (oldParent && oldParent !== this.scene) oldParent.add(ch.root); else if (!oldParent) this.scene.remove(ch.root);
    for (const o of hidden) o.visible = true;
    ch.root.remove(twins);
    tg.dispose();
    ch.root.visible = prevVis;
    const texs = new Set();
    ch.root.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      for (const k of ['map', 'normalMap', 'roughnessMap']) if (m[k]) texs.add(m[k]);
      for (const u of Object.values(m.userData.hv || {})) if (u?.value?.isTexture) texs.add(u.value);
    });
    for (const t of texs) { r.initTexture(t); await new Promise((res) => requestAnimationFrame(() => res())); }
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

  async walkPath(ch, points, speed = 1.15) {
    this.walkers.add(ch);
    for (const p of points) await this.walkTo(ch, p, speed);
    this.walkers.delete(ch);
  }
  // smooth non-walking move (climbing into / out of a tank)
  moveSmooth(ch, to, ry, seconds) {
    const from = ch.root.position.clone(), r0 = ch.root.rotation.y;
    let t = 0;
    return new Promise((res) => {
      ch.glide = (dt) => {
        t = Math.min(1, t + dt / seconds);
        const k = t * t * (3 - 2 * t);
        ch.root.position.lerpVectors(from, to, k);
        ch.root.rotation.y = r0 + (ry - r0) * k;
        if (t >= 1) { ch.glide = null; res(); }
      };
    });
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
        el('button', { onclick: () => m.close() }, `Close (${keyName(KB.idcard)} / Esc)`)),
      el('p', { class: 'muted' }, 'Compare the portrait, name and details with the visitor. Use the height chart behind them and look at their eyes (hold right mouse to zoom).'));
    const m = this.ui.modal(content, { side: true, title: 'Identity Card' });
    m.keys = (e) => { if (e.code === 'KeyF') flip(); if (e.code === 'KeyU') toggleUV(); if (e.code === KB.idcard) m.close(); };
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
          run.questions++;
          if (run.questions > 5) this.favor(run, -2);
          this.emit('asked', id);
          await sleep(900);
          const ans = a();
          if (id === 'contraband' && liarWeapon) nervousTell();
          if (id === 'bitten' && infected) nervousTell();
          if (id === 'name' && s.problems.includes('invalidName')) nervousTell();
          add('Visitor', ans);
          this.say(run.ch, ans);
          if (id === 'contraband' || id === 'bitten') run.ch.animator.play('shake');
          else if (id === 'purpose') run.ch.animator.play(Math.random() < 0.5 ? 'shrug' : 'explain');
          else if (Math.random() < 0.5) run.ch.animator.play('nod');
        },
      }, q));
    }
    const m = this.ui.modal(el('div', {}, el('p', { class: 'muted' }, 'Ask the visitor questions. Watch how they answer.'), list, log,
      el('div', { class: 'row' }, el('button', { class: 'primary', onclick: () => m.close() }, 'Hang up (Esc)'))), { side: true, title: 'Intercom' });
    m.keys = (e) => { if (e.code === 'KeyE' || e.code === 'KeyQ') m.close(); };
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
    if (kind === 'FLAGGED') { run.ch.face.flash('surprised', 0.6, 1.5); this.favor(run, -10); } else this.favor(run, 4);
  }

  async sendToDecon() {
    const run = this.run;
    if (!run || run.phase !== 'booth') return;
    if (!run.idStamp) { this.ui.toast('Stamp the ID card first (APPROVED or FLAG).', 'warn'); audio.error(); return; }
    audio.button();
    this.say(run.ch, 'Okay. Where do I go?');
    run.cardMesh.removeFromParent();
    run.phase = 'toDecon';
    run.ch.knownName = `${run.spec.card.first} ${run.spec.card.last}`;
    run.proxies = null;
    this.world.puddle.material.opacity = 0;
    this.prepareNext();
    this.emit('sentToDecon');
    this.setObjective(`Go to <b>Decontamination</b>. ${run.ch.knownName} is walking there through the visitor corridor. Inspect each clothing item where it is worn, search it, remove it, and sort it into the <b>washer</b> or the <b>incinerator</b>. Press ${K('idcard')} to view the ID card.`);
    await sleep(700);
    await this.walkPath(run.ch, PATHS.windowToDecon, 1.25);
    if (this.run !== run) return;
    run.ch.turnTarget = Math.PI;
    run.proxies = new Proxies(run.ch);
    await run.proxies.bakeAsync();
    run.phase = 'decon';
    this.emit('arrivedDecon');
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
    run.rebakeTimer = setTimeout(() => { if (run.proxies) run.proxies.bakeAsync(); }, delay);
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
        if (choice === 'confiscate') { audio.metalDrop(); this.react('confiscate', 'angry', 0.5); run.ch.animator.play('reachOut'); this.favor(run, o.bad ? -4 : -15); this.ui.toast('Item placed in the contraband bin.'); }
        else { this.react('returnItem', 'happy', 0.4); this.favor(run, 6); this.ui.toast('Item kept with the visitor\'s belongings.'); }
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
    const slot = it.meshes[0]?.userData.slot;
    const color = run.ch.slotColor(slot, it.meshes[0]?.material);
    // shoes, socks, gloves, hats and accessories keep their real shape in your hands
    const real = ['shoes', 'socks', 'gloves', 'hat', 'accessory'].includes(it.category);
    run.ch.setItemVisible(itemId, true);
    const model = real ? run.ch.snapshotItem(itemId) : null;
    run.ch.setItemVisible(itemId, false);
    this.player.carry({ itemId, name: it.name, color, model });
    audio.burst({ dur: 0.5, freq: 700, gain: 0.2, attack: 0.05 });
    this.removalReaction(run, it);
    this.emit('itemRemoved', itemId);
    const left = this.removableItems().filter((o) => !o.removed);
    if (!left.length) {
      if (run.armsUp) this.lowerArms(run);
      run.ch.animator.setPose('shy');
      run.ch.animator.mood = 'cold';
      run.ch.face.setBase({ sad: 0.25 });
      this.setObjective(`All clothing removed. Finish sorting, then take the <b>hose</b> from the wall reel and wash the visitor thoroughly. ${K('arms')} raise arms, ${K('turn')} turn around.`);
    }
  }

  // How the visitor reacts depends on what came off (and on who they are).
  removalReaction(run, it) {
    const ch = run.ch, an = ch.animator;
    const female = run.spec.sex !== 'male';
    const cat = it.category;
    let key = cat;
    if (cat === 'accessory' && /glass|spectacle|megane/i.test(it.name)) key = 'glasses';
    if (['top', 'bottom', 'onepiece'].includes(cat)) key = cat + (female ? '_f' : '_m');
    const embarrassing = (cat === 'top' && female) || cat === 'bottom' || cat === 'onepiece';
    const allOff = this.removableItems().every((o) => o.removed);
    const pool = allOff && embarrassing ? REACT.remove.last : REACT.remove[key] || REACT.remove.accessory;
    // don't talk over every single sock; plain items only sometimes get a comment
    if (embarrassing || Math.random() < 0.6) this.say(ch, pool[Math.floor(Math.random() * pool.length)]);
    if (embarrassing) {
      ch.face.flash(female ? 'sad' : 'surprised', female ? 0.8 : 0.5, 3);
      ch.face.flash('sad', 0.5, 4);
      an.play('lookDown');
      // cover up for a while and avoid eye contact
      if (!run.armsUp) { an.armStyle = cat === 'top' && female ? 'hug' : 'modest'; }
      an.lookWeight = 0.15;
      clearTimeout(run.shyTimer);
      run.shyTimer = setTimeout(() => { if (run.ch) { an.lookWeight = 0.7; if (!run.armsUp) an.armStyle = an.personality.styles[0]; } }, 6000);
      this.favor(run, female ? -7 : -4);
    } else {
      ch.face.flash('relaxed', 0.3, 1.2);
      this.favor(run, -1);
    }
  }

  lowerArms(run) {
    if (!run?.armsUp) return;
    run.armsUp = false;
    run.ch.animator.setPose(this.removableItems().every((o) => o.removed) ? 'shy' : 'idle');
    this.react('armsDown', null, 0, run);
    this.rebake(1500);
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
      run.ch.animator.play('shake');
      this.favor(run, CONTAMINATED.includes(run.spec.clothing[c.itemId]) ? -3 : -15);
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
    run.proxies.includeHair = true;
    run.proxies.bakeAsync();
    this.emit('hoseTaken');
    this.setObjective(`Hold <b>left mouse</b> to spray. Wash off all dirt, blood and anything covering the skin. ${K('arms')} raise arms, ${K('turn')} turn around. Put the hose back on the reel when done.`);
  }

  onSpray(origin, dir, dt) {
    const run = this.run;
    if (!run?.ch || run.phase !== 'hose' || !run.proxies) return;
    const res = run.proxies.spray(origin, dir, dt);
    if (res.hitSkin || res.hitHair) {
      run.hoseTime += dt;
      this.world.puddle.material.opacity = Math.min(0.75, this.world.puddle.material.opacity + dt * 0.03);
      if (!run.hosed) { run.hosed = true; this.react('hoseStart', 'surprised', 1); run.ch.animator.shiver = 1; run.ch.animator.mood = 'wet'; if (!run.armsUp) run.ch.animator.play('recoil'); this.favor(run, -2); }
      if (run.hoseTime > 45 && !run.overHosed) { run.overHosed = true; this.favor(run, -6); this.say(run.ch, 'Are you done yet?! I am freezing!'); }
    }
    if (res.hitFace) {
      run.faceHits += dt;
      run.ch.face.eyesClosed = 1;
      if (!run.lastCover || performance.now() - run.lastCover > 2600) { run.lastCover = performance.now(); if (!run.armsUp) run.ch.animator.play('coverFace'); this.favor(run, -4); }
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
      if (run.armsUp) this.react('armsUp'); else this.react('armsDown');
      this.ui.subtitle('You', run.armsUp ? 'Raise your arms.' : 'Lower your arms.', 1.5);
    } else if (cmd === 'turn') {
      if (run.armsUp) this.lowerArms(run);
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
    run.ch.setClothWet(0); // out of the washer and dryer
    this.favor(run, 6);
    run.ch.animator.setPose('idle');
    run.ch.animator.mood = run.ch.hairWet > 0.3 ? 'wet' : 'calm';
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
    if (run?.phase === 'released') return this.openReleaseTerminal();
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

  // Talk to the visitor directly: commands, clothes and the disposition choices.
  visitorMenu() {
    const run = this.run;
    if (!run?.ch) return;
    const ready = run.phase === 'inspect' || run.phase === 'released';
    const name = this.speakerName(run.ch);
    const content = el('div', {},
      el('p', {}, el('b', {}, name), el('span', { class: 'muted' }, ` · ${this.attitudeLabel(run.favor ?? 0, run.admire)}`)),
      el('div', { class: 'col' },
        run.phase !== 'released' ? el('button', { onclick: () => { m.close(); this.visitorCommand('arms'); } }, (run.armsUp ? 'Lower your arms' : 'Raise your arms') + ` (${keyName(KB.arms)})`) : null,
        run.phase !== 'released' ? el('button', { onclick: () => { m.close(); this.visitorCommand('turn'); } }, `Turn around (${keyName(KB.turn)})`) : null,
        run.phase === 'inspect' && !run.clothesReturned ? el('button', { onclick: () => { m.close(); this.returnClothes(); } }, 'Give back washed clothes') : null,
        ready ? el('button', { class: 'primary', onclick: () => { m.close(); this.openTerminal(); } }, 'Decide where they go…') : el('p', { class: 'muted' }, 'Finish decontamination (clothes sorted, hosed, hose put back) before deciding.'),
        el('button', { onclick: () => m.close() }, 'Back')));
    const m = this.ui.modal(content, { title: name });
  }

  async dispose(choice) {
    const run = this.run;
    if (run.released) return this.disposeReleased(choice);
    run.dispo = choice;
    this.captureIdCompare(run);
    run.dirtLeft = measureDirt(run.ch);
    this.player.hasHose = false;
    if (this.player.tool === 'hose') this.player.setTool('hand');
    this.emit('disposed', choice);
    audio.button();
    if (choice !== 'tank' && !run.clothesReturned) { run.phase = 'inspect'; this.returnClothes(); }
    const ch = run.ch;
    ch.turnTarget = null;
    if (choice === 'admit' || choice === 'deny') {
      this.favor(run, choice === 'admit' ? 25 : -50);
      this.react(choice, choice === 'admit' ? 'happy' : 'sad', 1);
      ch.animator.play(choice === 'admit' ? 'nod' : 'shake');
      ch.face.setBase(choice === 'admit' ? { happy: 0.5 } : { sad: 0.6, angry: 0.2 });
      run.phase = 'leaving';
      const door = choice === 'admit' ? this.world.doors.haven : this.world.doors.waste;
      const dpos = choice === 'admit' ? SPOTS.havenDoor : SPOTS.wasteDoor;
      ch.animator.setPose('idle');
      await sleep(1200);
      door.set(1); audio.bigDoor();
      await this.walkPath(ch, [new THREE.Vector3(dpos.x, 0, dpos.z - 0.9), new THREE.Vector3(dpos.x, 0, dpos.z + 1.2)], 1.1);
      door.set(0);
      this.finishRun(run, choice);
    } else if (choice === 'tank') {
      this.favor(run, -8);
      this.react('tank', 'sad', 0.8);
      await sleep(1500);
      const i = this.tanks.findIndex((t) => !t);
      const patient = { spec: run.spec, ch: null, level: run.spec.cureDays ? 100 : 0, daysIn: 0, checkedToday: true, idStamp: run.idStamp, run, arriving: true };
      this.tanks[i] = patient;
      this.finishRun(run, 'tank', true);
      this.ui.toast(`${this.speakerName(ch)} is heading to Tank ${i + 1}. Check the tank console in the Medical Lab every day.`, 'warn', 6);
      run.phase = 'toTank';
      await this.walkPath(ch, [...PATHS.deconToLab, ...tankApproach(i)], 1.1);
      this.walkers.add(ch);
      await this.moveSmooth(ch, TANK_POS[i].clone().add(new THREE.Vector3(0, 0.45, 0)), -Math.PI / 2, 1.6);
      this.walkers.delete(ch);
      patient.ch = ch; patient.arriving = false;
      this.placeInTank(patient, i);
      audio.bubble();
      this.updateHUD();
    } else if (choice === 'interro') {
      this.favor(run, -20);
      this.react('interro', 'angry', 0.7);
      run.proxies?.dispose();
      this.recordResults(run.spec, this.evaluate(run, 'interro'));
      this.noteAttitude(run);
      await this.sendToInterrogation(run);
    }
  }

  // Walk a visitor to the interrogation cell and sit them at the table.
  async sendToInterrogation(run) {
    const ch = run.ch;
    this.interro = { run, stage: 'arriving' };
    if (this.run === run) this.run = null;
    run.phase = 'interrogation';
    this.updateHUD();
    this.ui.toast(`${this.speakerName(ch)} is being taken to the Interrogation room. Use the console there to review the questioning.`, 'warn', 6);
    this.setObjective('Go to the <b>Interrogation</b> room and use the console to review the questioning.');
    await sleep(1000);
    const start = run.released ? [new THREE.Vector3(0, 0, 16.6)] : [];
    await this.walkPath(ch, [...start, ...PATHS.deconToInterro], 1.1);
    ch.turnTarget = Math.PI / 2;
    await sleep(500);
    ch.animator.setPose('sit');
    ch.animator.lookTarget = null;
    ch.lookAt(null);
    ch.animator.handTargets = this.tableHands();
    ch.face.setBase({ sad: 0.4 });
    if (this.interro?.run === run) this.interro.stage = 'waiting';
  }

  // Exit on foot to the Haven or the wasteland, then remove the character.
  async walkOut(run, admit) {
    const ch = run.ch;
    const door = admit ? this.world.doors.haven : this.world.doors.waste;
    const dpos = admit ? SPOTS.havenDoor : SPOTS.wasteDoor;
    await this.walkPath(ch, [new THREE.Vector3(dpos.x, 0, dpos.z - 0.9)], 1.1);
    door.set(1); audio.bigDoor();
    await this.walkPath(ch, [new THREE.Vector3(dpos.x, 0, dpos.z + 1.2)], 1.1);
    door.set(0);
    ch.dispose();
  }

  // Before a visitor leaves, remember what their card should have looked like
  // if the officer approved a false identity (shown in the end-of-day report).
  async captureIdCompare(run) {
    const s = run.spec;
    if (run.idStamp !== 'APPROVED' || !correctOutcome(s).interrogate || !run.ch) return;
    const real = JSON.parse(JSON.stringify(s));
    const notes = [];
    const c = s.card;
    if (s.problems.includes('invalidName')) {
      const [first, ...rest] = s.answers.name.split(' ');
      real.card.first = first; real.card.last = rest.join(' ') || c.last;
      notes.push(`Name on the card: ${c.first} ${c.last} — the visitor said: ${s.answers.name}.`);
    }
    if (s.problems.includes('invalidDetails')) {
      const v = s.details.details;
      if (v === 'height') { real.card.heightCm = s.heightCm; notes.push(`Card height ${c.heightCm} cm — actual height about ${s.heightCm} cm (height chart).`); }
      if (v === 'eyes') { real.card.eyeName = s.look.eyeName; notes.push(`Card eyes ${c.eyeName.toUpperCase()} — the visitor's eyes are ${s.look.eyeName.toUpperCase()}.`); }
      if (v === 'dob') { real.card.dob = s.answers.dob; notes.push(`Card date of birth ${fmtDate(c.dob)} — the visitor said ${fmtDate(s.answers.dob)}.`); }
      if (v === 'sex') { real.card.sex = s.sex; notes.push(`Card sex ${c.sex === 'male' ? 'M' : 'F'} — the visitor is ${s.sex === 'male' ? 'M' : 'F'}.`); }
    }
    if (s.problems.includes('forgedSeal')) {
      real.card.seal = 'valid';
      notes.push({ missing: 'UV seal: missing entirely.', star5: 'UV seal: five-pointed star instead of seven.', misspelled: 'UV seal: ring text misspelled ("REGISTFY", "GENIUNE").', idmismatch: 'UV seal: microtext number does not match the card number.' }[c.seal] || 'UV seal is not genuine.');
    }
    let realPortrait = run.portrait;
    if (s.problems.includes('invalidPortrait')) {
      notes.push('Portrait shows a different person.');
      try { realPortrait = await renderPortraitFrom(this.engine, run.ch, s.look); } catch { realPortrait = run.portrait; }
    }
    this.idCompare[s.id] = {
      approved: drawFront(s, run.portrait, 'APPROVED'), approvedUV: drawUV(s),
      real: drawFront(real, realPortrait, null), realUV: drawUV(real, 'valid'), notes,
    };
  }

  finishRun(run, outcome, keepModel = false) {
    const results = this.evaluate(run, outcome);
    this.recordResults(run.spec, results);
    this.noteAttitude(run);
    if (!keepModel) run.ch?.dispose();
    run.proxies?.dispose();
    run.cardMesh?.userData.textures?.forEach((t) => t.dispose());
    if (this.run === run) this.run = null;
    this.prepareNext();
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
    const content = el('div', {}, el('p', { class: 'muted' }, `Subject: ${s.card.first} ${s.card.last} (ID stamp: ${run.idStamp})`), log, verdict,
      el('div', { class: 'row' }, el('button', { onclick: () => m.close() }, 'Close (Esc) — decide later')));
    const m = this.ui.modal(content, { title: 'Interrogation Record', side: true });
    const add = (who, text, cls) => { log.append(el('div', { class: cls }, el('b', {}, who + ': '), text)); log.scrollTop = 1e6; };
    if (I.stage === 'arriving') { add('Record', 'The subject is still being escorted to the cell.'); return; }
    if (I.stage === 'waiting') {
      I.stage = 'questioning';
      const qs = INTERRO_Q.slice(0, 3);
      const answersHarmless = ['I... I can explain.', 'Please, just listen.', 'I had no choice.'];
      const answersDanger = ["I don't have to tell you anything.", 'You have no idea who you are dealing with.', '...'];
      for (let k = 0; k < qs.length; k++) {
        if (!m.el.isConnected) break;
        add('Interrogator', qs[k], 'you');
        const qd = this.say(null, qs[k], 'Interrogator');
        await sleep(Math.max(1700, qd * 1000 + 400));
        const a = (s.interrogation?.dangerous ? answersDanger : answersHarmless)[k];
        ch.face.flash(s.interrogation?.dangerous ? 'angry' : 'sad', 0.7, 2.5);
        ch.animator.play(s.interrogation?.dangerous ? (k === 2 ? 'lookDown' : 'shake') : (k === 0 ? 'shrug' : 'lookDown'));
        add('Subject', a);
        const ad = this.say(ch, a, 'Subject');
        await sleep(Math.max(2000, ad * 1000 + 500));
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
    const results = this.evaluate(run, 'interro-' + choice);
    this.recordResults(run.spec, results);
    this.favor(run, choice === 'admit' ? 12 : -45);
    this.noteAttitude(run);
    this.ui.toast(choice === 'admit' ? 'Visitor admitted after questioning.' : 'Visitor escorted back to the wasteland.', choice === 'admit' ? 'good' : 'warn');
    this.emit('interroResolved', choice);
    this.setObjective(this.queue.length ? 'Return to the booth and call the next visitor.' : 'All visitors processed. Press <b>NEXT</b> in the booth to end your shift.');
    const ch = run.ch;
    ch.animator.handTargets = null;
    ch.animator.setPose('idle');
    ch.animator.lookTarget = this.engine.camera;
    ch.lookAt(this.engine.camera);
    ch.face.setBase(choice === 'admit' ? { happy: 0.3 } : { sad: 0.5, angry: 0.3 });
    this.react(choice === 'admit' ? 'admit' : 'deny', choice === 'admit' ? 'happy' : 'angry', 0.8, run);
    await sleep(1200);
    await this.walkPath(ch, PATHS.interroToDecon, 1.1);
    await this.walkOut(run, choice === 'admit');
  }

  tableHands() {
    const p = SPOTS.interroSeat;
    return { left: new THREE.Vector3(p.x + 0.62, 0.81, p.z - 0.14), right: new THREE.Vector3(p.x + 0.6, 0.81, p.z + 0.16) };
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
    if (!t || !t.ch) return;
    if (this.run) { this.ui.toast('Finish with the current visitor first: released patients walk to the decontamination room for your decision.', 'warn', 6); return; }
    const early = t.level > 0;
    const go = async () => {
      m.close();
      const run = t.run || { spec: t.spec, found: [], fate: {}, idStamp: t.idStamp, washer: [] };
      run.releaseResults = [early ? { sev: 'major', text: 'Released a patient before the cure was complete.' } : { sev: 'ok', text: 'Patient fully cured before release.' }];
      run.released = true; run.early = early; run.phase = 'releasing'; run.clothesReturned = true;
      run.favor = (run.favor ?? 0) + (early ? 5 : 30);
      const ch = t.ch;
      run.ch = ch;
      ch.knownName = `${t.spec.card.first} ${t.spec.card.last}`;
      this.tanks[i] = null;
      this.run = run;
      this.updateHUD();
      ch.setFloating(false); ch.face.eyesClosed = 0; ch.face.setBase({ relaxed: 0.3 });
      ch.setLayers({ fx: 1 });
      for (const id of run.washer || []) ch.setItemVisible(id, true);
      ch.setClothWet(0.6);
      ch.animator.setPose('idle');
      ch.animator.lookTarget = this.engine.camera; ch.lookAt(this.engine.camera);
      audio.bubble();
      this.walkers.add(ch);
      await this.moveSmooth(ch, tankApproach(i)[1], Math.PI / 2, 1.6);
      this.react('release', 'relaxed', 0.6, run);
      await this.walkPath(ch, [tankApproach(i)[0], ...PATHS.labToDecon], 1.1);
      ch.turnTarget = Math.PI;
      run.proxies = new Proxies(ch);
      await run.proxies.bakeAsync();
      run.phase = 'released';
      this.setObjective(`${ch.knownName} is waiting in Decontamination. Talk to them (${K('interact')}) or use the disposition terminal to decide where they go.`);
    };
    const content = el('div', {},
      el('p', {}, early ? el('span', { class: 'warn' }, 'Warning: readings are not at 0%. Releasing now is against procedure.') : 'Patient is cured.'),
      el('p', { class: 'muted' }, 'The patient will get dressed and walk to the decontamination room, where you decide where they go next.'),
      el('div', { class: 'row' }, el('button', { class: 'primary', onclick: go }, 'Release'), el('button', { onclick: () => m.close() }, 'Cancel')));
    const m = this.ui.modal(content, { title: 'Release Patient' });
  }

  openReleaseTerminal() {
    const run = this.run;
    const s = run.spec;
    const choose = (d) => { m.close(); this.disposeReleased(d); };
    const content = el('div', {},
      el('p', {}, el('b', {}, `${s.card.first} ${s.card.last}`), el('span', { class: 'muted' }, ` · released from the cure tanks · ID stamp: ${run.idStamp}`)),
      el('p', { class: 'muted' }, 'Cured patients are admitted, unless their identity was flagged — those are held for interrogation.'),
      el('div', { class: 'col' },
        el('button', { class: 'good', onclick: () => choose('admit') }, 'Admit into the Haven'),
        el('button', { onclick: () => choose('interro'), disabled: !!this.interro }, 'Hold for interrogation' + (this.interro ? ' (room busy)' : '')),
        el('button', { class: 'danger', onclick: () => choose('deny') }, 'Deny entry'),
        el('button', { onclick: () => m.close() }, 'Cancel')));
    const m = this.ui.modal(content, { title: 'Disposition Terminal' });
  }

  async disposeReleased(choice) {
    const run = this.run;
    const ch = run.ch;
    const sub = this.evaluate({ ...run, ch: null }, 'tankRelease-' + choice).filter((r) => !/cure tanks/.test(r.text));
    this.recordResults(run.spec, [...run.releaseResults, ...sub]);
    run.proxies?.dispose();
    this.emit('disposed', choice);
    // a severe case that was cured and simply let in remembers this officer
    const s = run.spec;
    const severe = s.cureDays >= 3 || ['discoloredSclera', 'discoloredSkin', 'biteMarks', 'radiation'].filter((p) => s.problems.includes(p)).length >= 2;
    if (choice === 'admit' && severe && !run.early) { run.admire = true; this.favor(run, 100); this.react('admire', 'happy', 1, run); }
    else if (choice === 'admit') { this.favor(run, 20); this.react('admit', 'happy', 0.9, run); }
    else if (choice === 'deny') { this.favor(run, -60); this.react('deny', 'sad', 1, run); }
    this.noteAttitude(run);
    if (choice === 'interro') { this.favor(run, -25); this.noteAttitude(run); this.react('interro', 'angry', 0.7, run); await this.sendToInterrogation(run); return; }
    this.run = null;
    this.updateHUD();
    this.prepareNext();
    this.setObjective(this.queue.length ? 'Return to the booth and call the next visitor (<b>NEXT</b> button).' : 'All visitors processed. Press <b>NEXT</b> in the booth to end your shift.');
    await sleep(1500);
    await this.walkOut(run, choice === 'admit');
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
      el('td', {}, el('b', {}, e.name),
        e.favor != null ? el('div', { class: e.admire || e.favor >= 35 ? 'ok' : e.favor <= -35 ? 'bad' : 'muted' }, this.attitudeLabel(e.favor, e.admire)) : null,
        this.idCompare[e.spec.id] ? el('button', { style: { marginTop: '6px', fontSize: '12px', padding: '4px 8px' }, onclick: () => this.showIdCompare(e) }, 'Compare ID') : null),
      el('td', {}, e.results.length ? e.results.map((r) => el('div', { class: r.sev === 'ok' ? 'ok' : r.sev === 'minor' ? 'warn' : r.sev === 'major' ? 'bad' : 'muted' }, (r.sev === 'ok' ? '✔ ' : r.sev === 'info' ? '• ' : '✖ ') + r.text)) : el('span', { class: 'muted' }, '—')),
      el('td', { class: e.delta >= 0 ? 'ok' : 'bad' }, (e.delta >= 0 ? '+' : '') + e.delta)));
    const dayDelta = this.dayLog.reduce((a, e) => a + e.delta, 0);
    const majors = this.dayLog.reduce((a, e) => a + e.results.filter((r) => r.sev === 'major').length, 0);
    const content = el('div', { class: 'report' },
      el('p', {}, `Shift complete. Net credits today: `, el('b', { class: dayDelta >= 0 ? 'ok' : 'bad' }, String(dayDelta)), ` · Total: ${this.credits}`),
      majors ? el('p', { class: 'bad' }, `${majors} serious violation(s) recorded by Haven Security.`) : el('p', { class: 'ok' }, 'No serious violations. Good work, officer.'),
      el('table', {}, el('tr', {}, el('th', {}, 'Visitor / attitude'), el('th', {}, 'Findings'), el('th', {}, 'Credits')), rows),
      el('div', { class: 'row' }, el('button', { class: 'primary', onclick: () => { m.close(); this.nextDay(); } }, 'Begin next day'), el('button', { onclick: () => { m.close(); this.app.toMenu(); } }, 'Save & quit to menu')));
    const m = this.ui.modal(content, { title: `End of Day ${this.day}`, closable: false });
    this.advanceTanks();
    await this.save(this.day + 1);
    this.emit('dayEnded');
  }

  showIdCompare(entry) {
    const c = this.idCompare[entry.spec.id];
    if (!c) return;
    let uv = false;
    const mk = () => el('canvas', { width: 1024, height: 640, style: { width: '400px', borderRadius: '10px', boxShadow: '0 4px 14px #000' } });
    const left = mk(), right = mk();
    const paint = (cv, front, mask) => {
      const g = cv.getContext('2d');
      g.clearRect(0, 0, 1024, 640);
      if (!uv) { g.drawImage(front, 0, 0); return; }
      g.fillStyle = '#05010c'; g.fillRect(0, 0, 1024, 640);
      g.globalAlpha = 0.28; g.drawImage(front, 0, 0); g.globalAlpha = 1;
      const t = document.createElement('canvas'); t.width = 1024; t.height = 640;
      const tg = t.getContext('2d'); tg.drawImage(mask, 0, 0); tg.globalCompositeOperation = 'multiply'; tg.fillStyle = '#7dffb0'; tg.fillRect(0, 0, 1024, 640);
      g.globalCompositeOperation = 'lighter'; g.drawImage(t, 0, 0); g.globalCompositeOperation = 'source-over';
    };
    const draw = () => { paint(left, c.approved, c.approvedUV); paint(right, c.real, c.realUV); };
    draw();
    this.ui.modal(el('div', {},
      el('div', { style: { display: 'flex', gap: '18px' } },
        el('div', {}, el('h3', { class: 'bad' }, 'The card you approved'), left),
        el('div', {}, el('h3', { class: 'ok' }, 'What a genuine card would show'), right)),
      el('ul', {}, c.notes.map((n) => el('li', {}, n))),
      el('div', { class: 'row' }, el('button', { onclick: () => { uv = !uv; draw(); } }, 'Toggle UV view'))), { title: `ID review — ${entry.name}` });
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
    reg('terminal', () => (this.run && ['decon', 'hose', 'inspect', 'released'].includes(this.run.phase) ? 'Disposition terminal' : null), () => this.openTerminal());
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
    if (run?.ch && ['decon', 'hose', 'inspect', 'released'].includes(run.phase) && this.player.pos.z > 9) {
      const px = this.ensureProxies();
      const hit = px?.raycast(origin, dir, 2.6);
      if (hit && (!best || hit.distance < best.distance)) {
        if (hit.data.kind === 'item' && run.phase === 'decon') {
          const it = run.ch.items.get(hit.data.itemId);
          best = { distance: hit.distance, label: `${it.name} — inspect / search / remove`, action: () => this.itemMenu(it.id), id: 'item:' + it.id, itemId: it.id };
        } else best = { distance: hit.distance, label: `${this.speakerName(run.ch)} <span class="muted">(${this.attitudeLabel(run.favor ?? 0, run.admire)})</span> — options · ${K('arms')} arms · ${K('turn')} turn`, action: () => this.visitorMenu(), id: 'visitor' };
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
    const tk = this.ui.tutorialKeys?.[e.code === 'NumpadEnter' ? 'Enter' : e.code];
    if (tk) { e.preventDefault(); tk(); return; }
    const c = e.code;
    if (c === KB.interact) this.interact();
    else if (c === KB.manual) { e.preventDefault(); this.openRulebook(); }
    else if (c === KB.idcard && this.run?.cardFront && this.run.phase !== 'booth') this.openCard();
    else if (c === KB.turn) this.visitorCommand('turn');
    else if (c === KB.arms) this.visitorCommand('arms');
    else if ([KB.tool1, KB.tool2, KB.tool3, KB.tool4, KB.tool5].includes(c)) {
      const id = ['hand', 'flashlight', 'uv', 'geiger', 'hose'][[KB.tool1, KB.tool2, KB.tool3, KB.tool4, KB.tool5].indexOf(c)];
      if (!this.player.setTool(id)) { if (id === 'hose') this.ui.toast('Take the hose from the reel in the washroom.'); }
      else this.emit('tool', id);
    }
  }

  onModalChange() {
    const open = this.ui.modalOpen;
    this.player.enabled = !open && !this.paused;
    clearTimeout(this._relock);
    if (open) { this.player.unlock(); return; }
    // closing one panel often opens another (e.g. Search -> found item): wait a moment
    this._relock = setTimeout(() => { if (!this.ui.modalOpen && !this.paused && this.active) this.player.lock(); }, 120);
  }

  onPointerLockChange() {
    if (!this.active) return;
    if (!this.player.locked && !this.ui.modalOpen && !this.paused) this.app.pause();
    if (this.player.locked && (this.ui.modalOpen || this.paused)) { this.player.unlock(); return; }
    if (this.player.locked) this.player.enabled = true;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    if (!this.active) return;
    this.player.update(dt);
    // characters (deduplicated: someone can be both walking and the current visitor)
    const set = new Set();
    if (this.run?.ch) set.add(this.run.ch);
    if (this.interro?.run.ch) set.add(this.interro.run.ch);
    for (const t of this.tanks) if (t?.ch) set.add(t.ch);
    for (const w of this.walkers) set.add(w);
    const chars = [...set];
    this.world.update(dt, this.player.pos, chars.filter((c) => c.walk || c.glide || c === this.run?.ch).map((c) => c.root.position));
    for (const ch of chars) {
      if (ch.glide) ch.glide(dt);
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
      // flashlight in the eyes: pupils constrict quickly, re-dilate slowly
      let lit = 0;
      if (this.player.tool === 'flashlight' && !ch.face.eyesClosed) {
        const cam = this.engine.camera.getWorldPosition(new THREE.Vector3());
        const head = ch.boneWorld('head').add(new THREE.Vector3(0, 0.06 * (ch.look.scale || 1), 0));
        const to = head.sub(cam);
        const dist = to.length();
        const ang = to.normalize().angleTo(this.player.forward());
        // the light only reaches the eyes if it comes from in front of the face
        const faceDir = new THREE.Vector3(0, 0, 1).applyQuaternion(ch.bone('head').getWorldQuaternion(new THREE.Quaternion()));
        const frontal = THREE.MathUtils.clamp((faceDir.dot(to.clone().negate()) - 0.25) / 0.4, 0, 1);
        if (dist < 4.5) lit = THREE.MathUtils.clamp(1 - (ang - 0.06) / 0.22, 0, 1) * THREE.MathUtils.clamp(1.6 - dist / 3, 0.3, 1) * frontal;
      }
      ch._pupil = damp(ch._pupil ?? 1, 1 - 0.5 * lit, lit > (1 - (ch._pupil ?? 1)) * 2 ? 9 : 1.2, dt);
      ch.setPupil(ch._pupil);
      if (lit > 0.3) { ch.face.squint = Math.max(ch.face.squint, 0.35 + lit * 0.4); if (!run._flinched) { run._flinched = true; ch.face.flash('angry', 0.35, 1.2); ch.animator.play(Math.random() < 0.3 ? 'flinch' : 'flinchHead'); this.favor(run, -3); if (Math.random() < 0.4) this.react('flashlight', null, 0, run); } }
      else if (lit === 0) run._flinched = false;
    }
    // hover + prompt
    this._hoverAcc = (this._hoverAcc || 0) + dt;
    if (this._hoverAcc > 0.08) {
      this._hoverAcc = 0;
      const prev = this.hover;
      this.hover = this.findHover();

      const docked = !!this.hover && (this.hover.id === 'visitor' || String(this.hover.id).startsWith('item:'));
      if (prev?.id !== this.hover?.id || prev?.label !== this.hover?.label) this.ui.prompt(this.hover ? (this.hover.action ? `<kbd>E</kbd> ${this.hover.label}` : this.hover.label) : '', docked);
    }
    if (this.player.mouse.left && this.player.tool === 'hand' && this.player.enabled && !this._clickLatch) { this._clickLatch = true; this.interact(); }
    if (!this.player.mouse.left) this._clickLatch = false;
    this.ui.toolbar(this.player);
    if (this.world.raining || this._rainOn) { this._rainOn = this.world.raining; audio.loop('rain', this.world.raining, { freq: 1600, q: 0.3, gain: 0.015 + this.world.doors.outer.open * 0.05, bus: 'ambience', type: 'lowpass' }); }
    this.ui.reticle(this.player.tool === 'hose' && !this.player.carrying ? 'hose' : null);
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
