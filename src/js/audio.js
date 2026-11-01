import { speak, makeVoiceProfile } from './voice.js';
// Procedural sound effects via WebAudio.
export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.levels = { sfx: 1, voice: 1, water: 0.7, ambience: 0.8 };
    this.loops = {};
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.out = this.ctx.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(this.ctx.destination);
    // separate channels, each with its own volume
    this.bus = {};
    for (const k of ['sfx', 'voice', 'water', 'ambience']) {
      const g = this.ctx.createGain();
      g.gain.value = this.levels[k];
      g.connect(this.out);
      this.bus[k] = g;
    }
    this.master = this.bus.sfx;
    this.voiceIn = this.ctx.createDynamicsCompressor();
    this.voiceIn.threshold.value = -18; this.voiceIn.ratio.value = 3; this.voiceIn.attack.value = 0.005; this.voiceIn.release.value = 0.15;
    const vTrim = this.ctx.createGain(); vTrim.gain.value = 0.16;
    this.voiceIn.connect(vTrim).connect(this.bus.voice);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
    return this.ctx;
  }
  setVolume(v) { this.volume = v; if (this.out) this.out.gain.value = v; }
  setLevels(levels) {
    Object.assign(this.levels, levels);
    if (this.bus) for (const [k, g] of Object.entries(this.bus)) g.gain.value = this.levels[k];
  }

  noiseSrc(loop = true) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = loop; return s; }

  startAmbience() {
    const c = this.ctx;
    const hum = c.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 50;
    const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 140;
    const hg = c.createGain(); hg.gain.value = 0.018;
    hum.connect(hf).connect(hg).connect(this.bus.ambience); hum.start();
    const air = this.noiseSrc(); const af = c.createBiquadFilter(); af.type = 'lowpass'; af.frequency.value = 400;
    const ag = c.createGain(); ag.gain.value = 0.025;
    air.connect(af).connect(ag).connect(this.bus.ambience); air.start();
  }

  loop(name, on, { freq = 1200, q = 0.7, gain = 0.25, type = 'bandpass', bus = 'sfx' } = {}) {
    if (!this.ensure()) return;
    let l = this.loops[name];
    if (on && !l) {
      const s = this.noiseSrc(); const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = this.ctx.createGain(); g.gain.value = 0;
      // a gentle low-pass after the band keeps loops from sounding harsh
      const soft = this.ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = Math.max(800, freq * 1.6);
      s.connect(f).connect(soft).connect(g).connect(this.bus[bus] || this.master); s.start();
      l = this.loops[name] = { s, f, g };
    }
    if (l) {
      l.g.gain.setTargetAtTime(on ? gain : 0, this.ctx.currentTime, 0.06);
      if (on) l.f.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
    }
  }

  burst({ dur = 0.2, freq = 800, type = 'bandpass', q = 1, gain = 0.4, attack = 0.005, sweepTo = null } = {}) {
    if (!this.ensure()) return;
    const c = this.ctx, t = c.currentTime;
    const s = this.noiseSrc(false); const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t); s.stop(t + dur + 0.05);
  }
  tone({ freq = 440, dur = 0.15, type = 'sine', gain = 0.2, to = null } = {}) {
    if (!this.ensure()) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  click() { this.tone({ freq: 1800, dur: 0.03, type: 'square', gain: 0.05 }); }
  geigerTick() { this.burst({ dur: 0.012, freq: 3500, type: 'highpass', gain: 0.35, attack: 0.001 }); }
  stamp() { this.burst({ dur: 0.12, freq: 180, type: 'lowpass', gain: 0.9 }); this.tone({ freq: 90, dur: 0.12, gain: 0.3 }); }
  button() { this.tone({ freq: 660, dur: 0.06, type: 'square', gain: 0.06 }); this.tone({ freq: 990, dur: 0.08, type: 'sine', gain: 0.05 }); }
  door() { this.burst({ dur: 0.9, freq: 300, type: 'lowpass', gain: 0.25, attack: 0.1, sweepTo: 120 }); }
  bigDoor() { this.burst({ dur: 2.2, freq: 200, type: 'lowpass', gain: 0.45, attack: 0.3, sweepTo: 60 }); this.tone({ freq: 55, dur: 2, type: 'sawtooth', gain: 0.05 }); }
  burn() { this.burst({ dur: 1.6, freq: 500, type: 'lowpass', gain: 0.6, attack: 0.05, sweepTo: 2500 }); this.burst({ dur: 2.5, freq: 150, type: 'lowpass', gain: 0.4, attack: 0.3 }); }
  washer() { this.burst({ dur: 0.5, freq: 250, type: 'lowpass', gain: 0.3 }); this.tone({ freq: 70, dur: 3, type: 'triangle', gain: 0.08 }); }
  drop() { this.burst({ dur: 0.1, freq: 600, type: 'bandpass', gain: 0.3 }); }
  metalDrop() { this.tone({ freq: 1400, dur: 0.25, type: 'triangle', gain: 0.08 }); this.burst({ dur: 0.08, freq: 2000, gain: 0.2 }); }
  step() { this.burst({ dur: 0.07, freq: 220 + Math.random() * 60, type: 'lowpass', gain: 0.12 }); }
  error() { this.tone({ freq: 200, dur: 0.2, type: 'square', gain: 0.06 }); }
  good() { this.tone({ freq: 520, dur: 0.1, gain: 0.08 }); setTimeout(() => this.tone({ freq: 780, dur: 0.14, gain: 0.08 }), 90); }
  bubble() { this.tone({ freq: 300 + Math.random() * 300, dur: 0.08, gain: 0.03, to: 900 }); }

  // gibberish speech (see voice.js). Returns { duration, syllables } for lip-sync.
  voice(text, female = true, opts = {}) {
    if (!this.ensure()) return { duration: 0, syllables: [] };
    const profile = opts.profile || makeVoiceProfile(female ? 7 : 3, female ? 'female' : 'male');
    return speak(this.ctx, this.voiceIn || this.bus.voice, this.noise, text, { ...opts, profile });
  }
}
export const audio = new Audio();
