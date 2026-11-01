// Gibberish speech synthesis: a glottal source through a formant filter bank,
// noise consonants, syllable timing and intonation. Sounds like talking in an
// unknown language rather than robot beeps. Returns a syllable timeline so the
// face can lip-sync the actual vowels.
import { RNG } from './util.js';

// formant targets (adult male, Hz): F1, F2, F3
const VOWELS = {
  a: [730, 1090, 2440], e: [530, 1840, 2480], i: [290, 2250, 3010],
  o: [570, 840, 2410], u: [320, 870, 2240], '@': [500, 1500, 2500], y: [300, 1700, 2300], ae: [660, 1720, 2410],
};
const VOWEL_W = [['a', 5], ['e', 4], ['i', 3], ['o', 3], ['u', 2], ['@', 4], ['ae', 1.5], ['y', 0.6]];
const VISEME = { a: 'aa', ae: 'aa', e: 'ee', i: 'ih', y: 'ih', o: 'oh', u: 'ou', '@': 'aa' };
// consonant classes: type, noise centre freq, voiced?
const CONS = [
  [{ t: 'plosive', f: 1500, v: false }, 3], // p
  [{ t: 'plosive', f: 3200, v: false }, 4], // t
  [{ t: 'plosive', f: 2200, v: false }, 3], // k
  [{ t: 'plosive', f: 1200, v: true }, 2], // b/d/g
  [{ t: 'fric', f: 5800, v: false }, 4], // s
  [{ t: 'fric', f: 3000, v: false }, 1.5], // sh
  [{ t: 'fric', f: 7000, v: false }, 1], // f
  [{ t: 'fric', f: 4500, v: true }, 1], // z/v
  [{ t: 'h', f: 0, v: false }, 1.5], // h
  [{ t: 'nasal', f: 0, v: true }, 4], // m/n
  [{ t: 'liquid', f: 0, v: true }, 4], // l/r/w/y
];

export function makeVoiceProfile(seed, sex = 'female', age = 'adult') {
  const rng = new RNG((seed ^ 0x701ce) >>> 0);
  const female = sex !== 'male';
  let pitch = female ? rng.float(175, 245) : rng.float(92, 140);
  if (age === 'old') pitch *= female ? 0.88 : 0.95;
  if (age === 'young') pitch *= 1.05;
  return {
    pitch,
    formant: (female ? 1.16 : 1.0) * rng.float(0.94, 1.06) * (age === 'old' ? 0.97 : 1),
    rate: rng.float(0.85, 1.18),
    breath: rng.float(0.04, 0.16) + (female ? 0.04 : 0) + (age === 'old' ? 0.04 : 0),
    rasp: rng.float(0.0, 0.25) + (age === 'old' ? 0.25 : 0),
    range: rng.float(0.08, 0.2) * (female ? 1.2 : 1),
    seed,
  };
}

let glottalWave = null;
function getGlottal(ctx) {
  if (glottalWave) return glottalWave;
  // harmonics falling ~ -12 dB/octave, like a real glottal pulse
  const N = 48, re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) { im[n] = Math.pow(n, -1.45) * (n % 2 ? 1 : 0.85); }
  glottalWave = ctx.createPeriodicWave(re, im, { disableNormalization: false });
  return glottalWave;
}

function wordsOf(text) {
  // split into words and pauses; estimate syllables from vowel groups
  const out = [];
  const tokens = text.match(/[A-Za-z0-9'\-]+|[.,!?;:…]+/g) || [];
  for (const tk of tokens) {
    if (/^[.,!?;:…]+$/.test(tk)) { out.push({ pause: tk }); continue; }
    const syl = Math.max(1, Math.min(5, (tk.toLowerCase().match(/[aeiouy]+/g) || []).length));
    out.push({ syl, len: tk.length });
  }
  return out;
}

// Schedules an utterance. opts: { profile, emotion, radio, pan, bus }
export function speak(ctx, destination, noiseBuffer, text, opts = {}) {
  const P = opts.profile || makeVoiceProfile(1);
  const rng = new RNG(((Math.random() * 1e9) | 0) ^ P.seed);
  const emo = opts.emotion || 'neutral';
  const emoPitch = { happy: 1.1, angry: 1.05, sad: 0.9, surprised: 1.18, scared: 1.15, neutral: 1 }[emo] || 1;
  const emoRate = { happy: 1.05, angry: 1.08, sad: 0.85, surprised: 1.1, scared: 1.15, neutral: 1 }[emo] || 1;
  const rate = P.rate * emoRate;
  const words = wordsOf(text);
  const question = /\?\s*$/.test(text), exclaim = /!\s*$/.test(text);

  // ---- build the segment timeline ----
  const segs = []; // {t, d, kind, vowel?, cons?, stress, f0}
  let t = 0.03;
  const totalSyl = words.reduce((a, w) => a + (w.syl || 0), 0) || 1;
  let sylIndex = 0;
  for (const w of words) {
    if (w.pause) {
      const d = /[.!?…]/.test(w.pause) ? 0.26 : 0.14;
      segs.push({ t, d: d / rate, kind: 'pause' });
      t += d / rate;
      continue;
    }
    const stressAt = w.syl > 1 ? (rng.chance(0.65) ? 0 : 1) : 0;
    for (let s = 0; s < w.syl; s++) {
      const stress = s === stressAt ? 1 : 0;
      const prog = sylIndex / Math.max(1, totalSyl - 1);
      if (rng.chance(0.82)) {
        const c = rng.weighted(CONS);
        const cd = (c.t === 'plosive' ? 0.045 : c.t === 'fric' ? 0.065 : c.t === 'h' ? 0.045 : 0.05) * rng.float(0.8, 1.2) / rate;
        segs.push({ t, d: cd, kind: 'cons', cons: c });
        t += cd;
      }
      const vowel = rng.weighted(VOWEL_W);
      let vd = rng.float(0.058, 0.1) * (stress ? 1.35 : 1) / rate;
      const last = sylIndex === totalSyl - 1;
      if (last) vd *= 1.6; // phrase-final lengthening
      // intonation: declination, stress bumps, small randomness, question rise
      let f = P.pitch * emoPitch * (1 - 0.14 * prog) * (1 + P.range * (stress ? 0.9 : 0) * rng.float(0.6, 1.2)) * rng.float(0.97, 1.03);
      if (exclaim) f *= 1.08;
      if (question && last) f *= 1.28;
      if (!question && last) f *= 0.9;
      segs.push({ t, d: vd, kind: 'vowel', vowel, stress, f0: f, last });
      t += vd;
      if (rng.chance(0.18)) { // closed syllable (CVC)
        const c = rng.weighted(CONS.filter(([x]) => x.t !== 'h'));
        const cd = 0.04 * rng.float(0.8, 1.2) / rate;
        segs.push({ t, d: cd, kind: 'cons', cons: c });
        t += cd;
      }
      sylIndex++;
    }
    t += rng.float(0.006, 0.03) / rate; // tiny inter-word gap
  }
  const T = t + 0.08;
  const t0 = ctx.currentTime + 0.03;

  // ---- audio graph ----
  const out = ctx.createGain(); out.gain.value = 0.9;
  let tail = out;
  if (opts.radio) {
    // intercom: band-limited and slightly crunchy
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    const sh = ctx.createWaveShaper(); const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
    sh.curve = curve;
    out.connect(hp).connect(lp).connect(sh); tail = sh;
  }
  if (ctx.createStereoPanner && opts.pan != null) {
    const pn = ctx.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, opts.pan));
    tail.connect(pn); tail = pn;
  }
  tail.connect(destination);

  const fs = P.formant;
  const src = ctx.createOscillator();
  src.setPeriodicWave(getGlottal(ctx));
  const voiced = ctx.createGain(); voiced.gain.value = 0;
  src.connect(voiced);
  // vibrato + jitter (rasp)
  const vib = ctx.createOscillator(); vib.frequency.value = 5.2 + rng.float(-0.6, 0.6);
  const vibG = ctx.createGain(); vibG.gain.value = P.pitch * 0.012;
  vib.connect(vibG).connect(src.frequency);
  const jit = ctx.createBufferSource(); jit.buffer = noiseBuffer; jit.loop = true; jit.playbackRate.value = 0.02;
  const jitG = ctx.createGain(); jitG.gain.value = P.pitch * (0.012 + P.rasp * 0.05);
  jit.connect(jitG).connect(src.frequency);
  // breath / aspiration noise into the formants
  const nz = ctx.createBufferSource(); nz.buffer = noiseBuffer; nz.loop = true;
  nz.loopStart = rng.float(0, 1); nz.playbackRate.value = 1;
  const asp = ctx.createGain(); asp.gain.value = 0;
  nz.connect(asp);
  // fricative / burst noise (bypasses the formants)
  const fricF = ctx.createBiquadFilter(); fricF.type = 'bandpass'; fricF.Q.value = 2.2;
  const fric = ctx.createGain(); fric.gain.value = 0;
  nz.connect(fricF).connect(fric).connect(out);
  // formant bank
  const F = [0, 1, 2].map((k) => {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    const g = ctx.createGain(); g.gain.value = [1.0, 0.55, 0.28][k];
    voiced.connect(bp); asp.connect(bp); bp.connect(g).connect(out);
    return bp;
  });
  // a little low-passed direct sound for body/warmth
  const body = ctx.createBiquadFilter(); body.type = 'lowpass'; body.frequency.value = 600 * fs;
  const bodyG = ctx.createGain(); bodyG.gain.value = 0.06;
  voiced.connect(body).connect(bodyG).connect(out);

  const setF = (vals, at, glide) => {
    vals.forEach((hz, k) => {
      const f = hz * fs;
      F[k].frequency.linearRampToValueAtTime(f, at + glide);
      F[k].Q.setValueAtTime(f / [90, 110, 160][k], at);
    });
  };
  // initial state
  const v0 = VOWELS[(segs.find((s) => s.kind === 'vowel') || { vowel: '@' }).vowel];
  v0.forEach((hz, k) => { F[k].frequency.setValueAtTime(hz * fs, t0); F[k].Q.setValueAtTime(hz * fs / [90, 110, 160][k], t0); });
  src.frequency.setValueAtTime(P.pitch * emoPitch, t0);
  const amp = (opts.emotion === 'angry' || exclaim) ? 1.15 : opts.emotion === 'sad' ? 0.8 : 1;
  const breath = P.breath;
  const syllables = [];

  for (const s of segs) {
    const a = t0 + s.t, e = a + s.d;
    if (s.kind === 'pause') {
      voiced.gain.linearRampToValueAtTime(0, a + 0.03);
      asp.gain.linearRampToValueAtTime(breath * 0.02, a + 0.05);
      asp.gain.linearRampToValueAtTime(0, e);
      continue;
    }
    if (s.kind === 'vowel') {
      const lvl = (0.55 + 0.45 * s.stress) * amp;
      voiced.gain.linearRampToValueAtTime(lvl, a + 0.018);
      voiced.gain.linearRampToValueAtTime(lvl * (s.last ? 0.25 : 0.85), e);
      asp.gain.linearRampToValueAtTime(breath * lvl * 0.22, a + 0.02);
      setF(VOWELS[s.vowel], a, Math.min(0.05, s.d * 0.5));
      src.frequency.linearRampToValueAtTime(s.f0, a + s.d * 0.5);
      syllables.push({ t: s.t, d: s.d, v: VISEME[s.vowel], w: 0.35 + 0.55 * (s.stress ? 1 : 0.7) });
      continue;
    }
    const c = s.cons;
    if (c.t === 'plosive') {
      // closure (silence), then a short burst
      voiced.gain.linearRampToValueAtTime(c.v ? 0.12 : 0, a + 0.012);
      asp.gain.linearRampToValueAtTime(0, a + 0.012);
      fricF.frequency.setValueAtTime(c.f, e - 0.018);
      fric.gain.setValueAtTime(0, e - 0.02);
      fric.gain.linearRampToValueAtTime(0.32 * amp, e - 0.012);
      fric.gain.linearRampToValueAtTime(0, e + 0.008);
    } else if (c.t === 'fric') {
      voiced.gain.linearRampToValueAtTime(c.v ? 0.25 : 0, a + 0.02);
      asp.gain.linearRampToValueAtTime(0, a + 0.02);
      fricF.frequency.setValueAtTime(c.f, a);
      fric.gain.linearRampToValueAtTime(0.16 * amp, a + 0.02);
      fric.gain.linearRampToValueAtTime(0, e);
    } else if (c.t === 'h') {
      voiced.gain.linearRampToValueAtTime(0, a + 0.015);
      asp.gain.linearRampToValueAtTime(0.22 * amp, a + 0.02);
      asp.gain.linearRampToValueAtTime(breath * 0.1, e);
    } else if (c.t === 'nasal') {
      voiced.gain.linearRampToValueAtTime(0.35 * amp, a + 0.015);
      setF([280, 1300, 2500], a, 0.02);
    } else { // liquid / glide
      voiced.gain.linearRampToValueAtTime(0.5 * amp, a + 0.015);
      setF([380, rng.pick([1000, 1250, 2100]), 2400], a, s.d * 0.6);
    }
  }
  const end = t0 + T;
  voiced.gain.linearRampToValueAtTime(0, end);
  asp.gain.linearRampToValueAtTime(0, end);
  for (const n of [src, vib, jit, nz]) { n.start(t0); n.stop(end + 0.1); }
  src.onended = () => { try { out.disconnect(); } catch {} };
  return { duration: T, syllables };
}
