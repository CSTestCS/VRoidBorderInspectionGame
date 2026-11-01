// DOM user interface helpers: HUD, prompts, subtitles, toasts and modals.
import { el, $ } from './util.js';
import { TOOLS } from './player.js';

export class UI {
  constructor() {
    this.hud = $('#hud');
    this.promptEl = $('#prompt');
    this.cross = $('#crosshair');
    this.objectiveEl = $('#objective');
    this.dayEl = $('#dayinfo');
    this.toolbarEl = $('#toolbar');
    this.subEl = $('#subtitle');
    this.toastEl = $('#toasts');
    this.tutEl = $('#tutorial');
    this.modalRoot = $('#modal-root');
    this.screenRoot = $('#screen-root');
    this.modals = [];
    this.subTimer = null;
  }
  showHUD(v) { this.hud.classList.toggle('hidden', !v); }
  prompt(text, docked = false) {
    this.promptEl.classList.toggle('docked', !!docked);
    if (this._lastPrompt === text) return;
    this._lastPrompt = text;
    this.promptEl.innerHTML = text || '';
    this.cross.classList.toggle('active', !!text);
  }
  objective(html) { this.objectiveEl.innerHTML = html || ''; }
  dayInfo(html) { this.dayEl.innerHTML = html || ''; }
  reticle(mode) { this.cross.classList.toggle('hose', mode === 'hose'); }
  toolbar(player) {
    const key = TOOLS.map((t) => `${t.id}:${player.tool === t.id}:${t.id === 'hose' ? player.hasHose : 1}:${player.carrying?.name || ""}`).join('|');
    if (key === this._tbKey) return;
    this._tbKey = key;
    this.toolbarEl.innerHTML = '';
    for (const t of TOOLS) {
      const disabled = (t.id === 'hose' && !player.hasHose) || (player.carrying && t.id !== 'hand');
      this.toolbarEl.append(el('div', { class: 'tool' + (player.tool === t.id && !player.carrying ? ' active' : '') + (disabled ? ' disabled' : '') }, el('b', {}, t.key), t.label));
    }
    if (player.carrying) this.toolbarEl.append(el('div', { class: 'tool active' }, el('b', {}, '✋'), 'Carrying: ' + player.carrying.name));
  }
  subtitle(who, text, seconds = 3.5) {
    clearTimeout(this.subTimer);
    this.subEl.innerHTML = '';
    if (!text) return;
    if (who) this.subEl.append(el('span', { class: 'who' }, who + ':'));
    this.subEl.append(text);
    this.subTimer = setTimeout(() => (this.subEl.innerHTML = ''), seconds * 1000);
  }
  toast(text, kind = '', seconds = 4) {
    const t = el('div', { class: 'toast ' + kind }, text);
    this.toastEl.append(t);
    setTimeout(() => t.remove(), seconds * 1000);
  }
  tutorial(title, html, buttons = []) {
    if (!title) { this.tutEl.classList.add('hidden'); this.tutorialKeys = {}; return; }
    this.tutEl.classList.remove('hidden');
    this.tutEl.innerHTML = '';
    this.tutEl.append(el('h3', {}, title));
    const body = el('div'); body.innerHTML = html; this.tutEl.append(body);
    // the mouse is usually captured while playing, so every tutorial button has a key
    this.tutorialKeys = {};
    const keyFor = (b, i) => b.key || (b.primary ? 'Enter' : i === 1 ? 'Backspace' : null);
    if (buttons.length) {
      this.tutEl.append(el('div', { class: 'tbtns' }, buttons.map((b, i) => {
        const k = keyFor(b, i);
        if (k) this.tutorialKeys[k] = b.onClick;
        return el('button', { class: b.primary ? 'primary' : '', onclick: b.onClick }, b.label, k ? el('kbd', { style: { marginLeft: '8px' } }, k === 'Backspace' ? '⌫' : k) : null);
      })));
    }
  }

  get modalOpen() { return this.modals.length > 0; }
  // content: Node; opts: { side, onClose, closable }
  modal(content, opts = {}) {
    const back = el('div', { class: 'modal-back' + (opts.side ? ' side' : '') });
    const box = el('div', { class: 'modal ' + (opts.cls || '') });
    if (opts.title) box.append(el('h2', {}, opts.title));
    box.append(content);
    back.append(box);
    if (opts.closable !== false && !opts.side) back.addEventListener('mousedown', (e) => { if (e.target === back) handle.close(); });
    this.modalRoot.append(back);
    const handle = {
      el: back, box,
      close: () => {
        if (!back.isConnected) return;
        back.remove();
        this.modals = this.modals.filter((m) => m !== handle);
        opts.onClose?.();
        this.onModalChange?.();
      },
    };
    handle.closable = opts.closable !== false;
    this.modals.push(handle);
    this.onModalChange?.();
    return handle;
  }
  closeTop() { const m = this.modals[this.modals.length - 1]; if (m && m.closable) { m.close(); return true; } return false; }
  closeAll() { for (const m of [...this.modals]) m.close(); }

  confirm(title, text, yes = 'OK', no = 'Cancel') {
    return new Promise((res) => {
      let done = false;
      const m = this.modal(el('div', {}, el('p', {}, text), el('div', { class: 'row' },
        el('button', { class: 'primary', onclick: () => { done = true; m.close(); res(true); } }, yes),
        no ? el('button', { onclick: () => { done = true; m.close(); res(false); } }, no) : null)), { title, onClose: () => { if (!done) res(false); } });
    });
  }

  screen(content) {
    this.screenRoot.innerHTML = '';
    if (content) this.screenRoot.append(content);
  }
}
