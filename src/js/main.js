// Application entry: loading, menus, settings, and switching between modes.
import { Engine } from './engine.js';
import { UI } from './ui.js';
import { el, $, sleep } from './util.js';
import { listAllModels, storeGet, storeSet, quit, isNative, toggleFullscreen } from './platform.js';
import { initUnderwear } from './vrm/underwear.js';
import { loadVRM } from './vrm/loader.js';
import { resolveConfig } from './vrm/modelConfig.js';
import { Game } from './game.js';
import { Tutorial, makeTutorialVisitor } from './tutorial.js';
import { Workshop } from './workshop.js';
import { openRulebook } from './rulebook.js';
import { audio } from './audio.js';

class App {
  constructor() {
    this.ui = new UI();
    this.configs = {};
    this.models = [];
    this.game = null;
    this.tutorial = null;
    this.settings = { quality: 'high', sensitivity: 1, invertY: false, volume: 0.8 };
  }

  loading(text, frac) {
    $('#loading').classList.remove('hidden');
    $('#loading-text').textContent = text;
    if (frac != null) $('#loading-bar').style.width = Math.round(frac * 100) + '%';
  }
  doneLoading() { $('#loading').classList.add('hidden'); }

  async boot() {
    this.loading('Starting…', 0.02);
    this.settings = { ...this.settings, ...((await storeGet('settings')) || {}) };
    audio.setVolume(this.settings.volume);
    this.engine = new Engine($('#viewport'), { quality: this.settings.quality });
    this.loading('Loading underwear catalogue…', 0.05);
    await initUnderwear();
    try { this.builtinDefaults = await (await fetch('../assets/models/builtin-config.json')).json(); } catch { this.builtinDefaults = {}; }
    this.configs = (await storeGet('modelConfigs')) || {};
    await this.loadModels();
    this.doneLoading();
    window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && !this.game && this.ui.modalOpen) this.ui.closeTop(); });
    document.addEventListener('mousedown', () => audio.ensure(), { once: true });
    this.toMenu();
  }

  async loadModels() {
    const entries = await listAllModels();
    this.models = [];
    let i = 0;
    for (const entry of entries) {
      this.loading(`Analysing model: ${entry.name}`, 0.1 + 0.85 * (i++ / entries.length));
      try {
        const pre = await loadVRM(entry);
        pre.vrm.scene.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
        const saved = this.configs[entry.id] || (entry.builtin ? this.builtinDefaults[entry.id] : null);
        const cfg = resolveConfig(entry, pre.analysis, saved);
        this.models.push({ entry, cfg, height: pre.analysis.height });
      } catch (e) {
        console.error('Model failed', entry, e);
        this.ui.toast(`Could not load model ${entry.name}: ${e.message}`, 'bad', 8);
      }
    }
    this.modelsChanged = false;
  }

  activeModels() { return this.models.filter((m) => m.cfg.enabled !== false); }

  async toMenu() {
    this.stopGame();
    this.workshop = null;
    this.ui.showHUD(false);
    this.ui.closeAll();
    if (this.modelsChanged) { await this.loadModels(); this.doneLoading(); }
    const save = await storeGet('save');
    const btns = el('div', { class: 'menu' },
      save ? el('button', { class: 'primary', onclick: () => this.startGame({ save }) }, `Continue (Day ${save.day})`) : null,
      el('button', { class: save ? '' : 'primary', onclick: () => this.newGame(!!save) }, 'New Game'),
      el('button', { onclick: () => this.openWorkshop() }, 'Model Workshop (import .vrm)'),
      el('button', { onclick: () => openRulebook(this.ui) }, 'Procedures Manual'),
      el('button', { onclick: () => this.openSettings() }, 'Settings'),
      isNative ? el('button', { onclick: () => quit() }, 'Quit') : null);
    const screen = el('div', { class: 'screen' }, el('div', {},
      el('div', { class: 'logo' }, 'HAVEN', el('span', {}, 'CHECKPOINT')),
      el('div', { style: { display: 'flex', justifyContent: 'center' } }, btns),
      el('div', { class: 'menu-foot' }, `${this.activeModels().length} visitor model(s) active · Identify. Strip. Decontaminate. Inspect. Decide.`)));
    this.ui.screen(screen);
  }

  async newGame(hasSave) {
    if (!this.activeModels().length) { this.ui.toast('No visitor models are enabled. Open the Model Workshop.', 'bad'); return; }
    if (hasSave && !(await this.ui.confirm('New game', 'Start a new game? Your saved progress will be overwritten.', 'Start new game'))) return;
    const m = this.ui.modal(el('div', {},
      el('p', {}, 'The tutorial walks you through one complete visitor: ID check, clothing, contraband, washing, body inspection, tanks and interrogation. It takes about 10 minutes.'),
      el('div', { class: 'row' },
        el('button', { class: 'primary', onclick: () => { m.close(); this.startGame({ tutorial: true }); } }, 'Play tutorial'),
        el('button', { onclick: () => { m.close(); this.startGame({ tutorial: false }); } }, 'Skip tutorial'))), { title: 'Tutorial' });
  }

  async startGame({ tutorial = false, save = null } = {}) {
    this.ui.screen(null);
    this.loading('Preparing the checkpoint…', 0.3);
    await sleep(30);
    this.game = new Game(this);
    this.game.models = this.activeModels();
    this.game.modelsById = Object.fromEntries(this.models.map((m) => [m.entry.id, m]));
    await this.game.init();
    this.ui.showHUD(true);
    if (save) await this.game.load(save);
    else if (tutorial) {
      await storeSet('save', null);
      await this.game.startDay(1, { preset: [makeTutorialVisitor(this.activeModels())] });
      this.game.ui.dayInfo('<b>TRAINING SHIFT</b>');
      this.tutorial = new Tutorial(this.game, (choice) => {
        this.tutorial = null;
        if (choice === 'day1') this.game.startDay(1);
        else { this.game.save(1); this.toMenu(); }
      });
    } else {
      await storeSet('save', null);
      await this.game.startDay(1);
    }
    this.doneLoading();
    this.engine.start();
    this.ui.toast('Click to look around. Tab = procedures manual.', '', 6);
  }

  stopGame() {
    this.tutorial?.destroy();
    this.tutorial = null;
    if (this.game) { this.game.destroy(); this.game = null; }
    this.paused = false;
    this.engine?.stop();
    this.ui.screen(null);
  }

  pause() {
    if (!this.game || this.paused) return;
    this.paused = true;
    this.game.paused = true;
    this.game.player.enabled = false;
    const resume = () => { this.paused = false; this.game.paused = false; this.ui.screen(null); this.game.player.enabled = true; this.game.player.lock(); };
    const screen = el('div', { class: 'screen', style: { background: 'rgba(0,0,0,.6)' } }, el('div', {},
      el('div', { class: 'logo', style: { fontSize: '40px' } }, 'PAUSED'),
      el('div', { class: 'menu' },
        el('button', { class: 'primary', onclick: resume }, 'Resume'),
        el('button', { onclick: () => openRulebook(this.ui) }, 'Procedures Manual'),
        el('button', { onclick: () => this.openSettings() }, 'Settings'),
        el('button', { onclick: async () => { if (await this.ui.confirm('Quit to menu', 'Progress since the start of this day will be lost (the game saves at the end of each day).', 'Quit')) this.toMenu(); } }, 'Quit to main menu'))));
    screen.addEventListener('keydown', (e) => { if (e.code === 'Escape') resume(); });
    this.ui.screen(screen);
    this._pauseKey = (e) => { if (e.code === 'Escape' && this.paused && !this.ui.modalOpen) { resume(); window.removeEventListener('keydown', this._pauseKey); } };
    setTimeout(() => window.addEventListener('keydown', this._pauseKey), 200);
  }

  openSettings() {
    const s = this.settings;
    const save = async () => {
      await storeSet('settings', s);
      audio.setVolume(s.volume);
      if (this.game) { this.game.player.sensitivity = s.sensitivity; this.game.player.invertY = s.invertY; }
    };
    const row = (label, input) => el('div', { class: 'ws-field', style: { gridTemplateColumns: '170px 1fr' } }, el('label', {}, label), input);
    const m = this.ui.modal(el('div', { style: { width: '460px' } },
      row('Graphics quality', el('select', { onchange: (e) => { s.quality = e.target.value; this.engine.settings.quality = s.quality; this.engine.applyQuality(); save(); } },
        ['low', 'medium', 'high'].map((q) => el('option', { value: q, selected: s.quality === q }, q)))),
      row('Mouse sensitivity', el('input', { type: 'range', min: 0.2, max: 3, step: 0.05, value: s.sensitivity, oninput: (e) => { s.sensitivity = Number(e.target.value); save(); } })),
      row('Invert mouse Y', el('input', { type: 'checkbox', checked: s.invertY, onchange: (e) => { s.invertY = e.target.checked; save(); } })),
      row('Volume', el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.volume, oninput: (e) => { s.volume = Number(e.target.value); save(); } })),
      row('Fullscreen', el('button', { onclick: () => toggleFullscreen() }, 'Toggle (F11)')),
      el('div', { class: 'row' }, el('button', { onclick: () => m.close() }, 'Close'))), { title: 'Settings' });
  }

  async openWorkshop() {
    this.ui.screen(null);
    this.workshop = new Workshop(this);
    await this.workshop.open();
  }
}

const app = new App();
window.havenApp = app;
app.boot().catch((e) => {
  console.error(e);
  app.loading('Failed to start: ' + e.message);
});
