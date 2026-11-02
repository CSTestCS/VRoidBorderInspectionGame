// Formant speech synthesis: a glottal source through a formant filter bank,
// noise consonants, syllable timing and intonation. In word mode the text is
// converted to phonemes and the voice tries to pronounce it; otherwise it
// babbles in an unknown language. Returns a syllable timeline for lip-sync.
import { RNG } from './util.js';
import { textToPhonemes, VOWEL_PH } from './phonemes.js';

// ---- phoneme table for word mode (adult male formants, Hz) ----
const PV = {
  AA: [730, 1090, 2440], AE: [660, 1720, 2410], AH: [640, 1190, 2390], AO: [570, 840, 2410], EH: [530, 1840, 2480],
  ER: [490, 1350, 1690], IH: [390, 1990, 2550], IY: [270, 2290, 3010], UH: [440, 1020, 2240], UW: [300, 870, 2240], AX: [500, 1500, 2500],
};
const DIPH = { EY: [[480, 1900, 2500], [300, 2250, 2900]], AY: [[720, 1150, 2440], [320, 2150, 2800]], OW: [[520, 900, 2400], [340, 780, 2300]], AW: [[720, 1150, 2440], [400, 950, 2300]], OY: [[560, 860, 2400], [330, 2100, 2700]] };
const PVIS = { AA: 'aa', AE: 'aa', AH: 'aa', AY: 'aa', AW: 'aa', AX: 'aa', EH: 'ee', EY: 'ee', ER: 'ee', IH: 'ih', IY: 'ih', AO: 'oh', OW: 'oh', OY: 'oh', UH: 'ou', UW: 'ou' };
const LONG_V = new Set(['IY', 'UW', 'AA', 'AO', 'ER', 'EY', 'AY', 'OW', 'AW', 'OY']);
const PC = {
  P: { t: 'plosive', f: 900, v: false, loc: [300, 900, 2300] }, B: { t: 'plosive', f: 800, v: true, loc: [300, 900, 2300] },
  T: { t: 'plosive', f: 3800, v: false, loc: [300, 1700, 2600] }, D: { t: 'plosive', f: 3200, v: true, loc: [300, 1700, 2600] },
  K: { t: 'plosive', f: 2200, v: false, loc: [300, 2000, 2500] }, G: { t: 'plosive', f: 2000, v: true, loc: [300, 2000, 2500] },
  CH: { t: 'affric', f: 3000, v: false, loc: [300, 1900, 2600] }, JH: { t: 'affric', f: 2800, v: true, loc: [300, 1900, 2600] },
  F: { t: 'fric', f: 7500, v: false, g: 0.07, q: 0.8, loc: [300, 1000, 2300] }, V: { t: 'fric', f: 6500, v: true, g: 0.04, q: 0.8, loc: [300, 1000, 2300] },
  TH: { t: 'fric', f: 6500, v: false, g: 0.05, q: 0.7, loc: [300, 1500, 2600] }, DH: { t: 'fric', f: 5000, v: true, g: 0.03, q: 0.7, loc: [300, 1500, 2600], d: 0.04 },
  S: { t: 'fric', f: 6200, v: false, g: 0.2, q: 3, loc: [300, 1700, 2600] }, Z: { t: 'fric', f: 6000, v: true, g: 0.11, q: 3, loc: [300, 1700, 2600] },
  SH: { t: 'fric', f: 2900, v: false, g: 0.2, q: 2, loc: [300, 1900, 2500] }, ZH: { t: 'fric', f: 2800, v: true, g: 0.1, q: 2, loc: [300, 1900, 2500] },
  HH: { t: 'h' },
  M: { t: 'nasal', F: [280, 950, 2200] }, N: { t: 'nasal', F: [280, 1700, 2600] }, NG: { t: 'nasal', F: [280, 2100, 2700] },
  L: { t: 'liquid', F: [360, 1000, 2400] }, R: { t: 'liquid', F: [420, 1250, 1550] }, W: { t: 'liquid', F: [300, 620, 2200] }, Y: { t: 'liquid', F: [280, 2250, 2900] },
};
const PDUR = { plosive: 0.07, affric: 0.1, fric: 0.09, h: 0.05, nasal: 0.065, liquid: 0.055 };

function wordSegs(text, P, rate, emoPitch, rng) {
  const words = textToPhonemes(text);
  const question = /\?\s*$/.test(text), exclaim = /!\s*$/.test(text);
  const segs = [];
  let t = 0.03;
  const totalV = words.reduce((a, w) => a + (w.ph ? w.ph.filter((p) => VOWEL_PH.has(p)).length : 0), 0) || 1;
  let vi = 0;
  words.forEach((w, wi) => {
    if (w.pause) {
      const d = /[.!?…]/.test(w.pause) ? 0.3 : 0.16;
      segs.push({ t, d: d / rate, kind: 'pause' }); t += d / rate;
      return;
    }
    const lastWord = !words.slice(wi + 1).some((x) => x.ph);
    w.ph.forEach((ph, k) => {
      if (VOWEL_PH.has(ph)) {
        const stress = k === w.stress ? 1 : 0;
        const prog = vi / Math.max(1, totalV - 1);
        const last = lastWord && !w.ph.slice(k + 1).some((p) => VOWEL_PH.has(p));
        let d = (ph === 'AX' ? 0.05 : LONG_V.has(ph) ? 0.115 : 0.078) * (stress ? 1.3 : 0.92) * rng.float(0.92, 1.08) / rate;
        if (last) d *= 1.5;
        let f = P.pitch * emoPitch * (1 - 0.15 * prog) * (1 + P.range * (stress ? 1 : 0) * rng.float(0.7, 1.15)) * rng.float(0.98, 1.02);
        if (exclaim && stress) f *= 1.1;
        if (question && last) f *= 1.3;
        if (!question && last) f *= 0.88;
        const di = DIPH[ph];
        segs.push({ t, d, kind: 'vowel', F: di ? di[0] : PV[ph], F2: di ? di[1] : null, vis: PVIS[ph] || 'aa', stress: ph === 'AX' ? 0 : stress, f0: f, last, reduced: ph === 'AX' });
        t += d; vi++;
      } else {
        const c = PC[ph];
        if (!c) return;
        const d = (c.d || PDUR[c.t]) * rng.float(0.9, 1.1) / rate;
        segs.push({ t, d, kind: 'cons', cons: c });
        t += d;
      }
    });
    t += 0.012 / rate;
  });
  return { segs, T: t + 0.1, question, exclaim };
}

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
  let pitch = female ? rng.float(200, 270) : rng.float(92, 140);
  if (age === 'old') pitch *= female ? 0.88 : 0.95;
  if (age === 'young') pitch *= 1.05;
  return {
    pitch,
    formant: (female ? 1.08 : 0.98) * rng.float(0.96, 1.04) * (age === 'old' ? 0.97 : 1),
    rate: rng.float(0.85, 1.18),
    breath: rng.float(0.04, 0.16) + (female ? 0.04 : 0) + (age === 'old' ? 0.04 : 0),
    rasp: rng.float(0.0, 0.25) + (age === 'old' ? 0.25 : 0),
    range: rng.float(0.08, 0.2) * (female ? 1.4 : 1),
    female, age,
    seed,
  };
}

let glottalWave = null;
function getGlottal(ctx) {
  if (glottalWave) return glottalWave;
  // harmonics falling ~ -12 dB/octave, like a real glottal pulse
  const N = 48, re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) { im[n] = Math.pow(n, -1.75) * (n % 2 ? 1 : 0.9); }
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

function babbleSegs(text, P, rate, emoPitch, rng) {
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
      segs.push({ t, d: vd, kind: 'vowel', F: VOWELS[vowel], vis: VISEME[vowel], stress, f0: f, last });
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
  return { segs, T: t + 0.08, question, exclaim };
}

// Schedules an utterance. opts: { profile, emotion, radio, pan, bus }
export function speak(ctx, destination, noiseBuffer, text, opts = {}) {
  const P = opts.profile || makeVoiceProfile(1);
  const rng = new RNG(((Math.random() * 1e9) | 0) ^ P.seed);
  const emo = opts.emotion || 'neutral';
  const emoPitch = { happy: 1.1, angry: 1.05, sad: 0.9, surprised: 1.18, scared: 1.15, neutral: 1 }[emo] || 1;
  const emoRate = { happy: 1.05, angry: 1.08, sad: 0.85, surprised: 1.1, scared: 1.15, neutral: 1 }[emo] || 1;
  const rate = P.rate * emoRate;
  const built = opts.words ? wordSegs(text, P, rate, emoPitch, rng) : babbleSegs(text, P, rate, emoPitch, rng);
  const { segs, T, question, exclaim } = built;
  const t0 = ctx.currentTime + 0.03;

  // ---- audio graph ----
  const out = ctx.createGain(); out.gain.value = 0.9;
  // tame the upper mids (where a formant synth turns nasal / heady) and the hiss above
  const warm = ctx.createBiquadFilter(); warm.type = 'peaking'; warm.frequency.value = 2600; warm.Q.value = 0.9; warm.gain.value = -5;
  const air = ctx.createBiquadFilter(); air.type = 'lowpass'; air.frequency.value = 6500; air.Q.value = 0.5;
  const chest = ctx.createBiquadFilter(); chest.type = 'lowshelf'; chest.frequency.value = 300; chest.gain.value = 3;
  out.connect(warm).connect(air).connect(chest);
  let tail = chest;
  if (opts.radio) {
    // intercom: band-limited and slightly crunchy
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    const sh = ctx.createWaveShaper(); const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
    sh.curve = curve;
    chest.connect(hp).connect(lp).connect(sh); tail = sh;
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
    const g = ctx.createGain(); g.gain.value = [1.0, 0.42, 0.15][k];
    voiced.connect(bp); asp.connect(bp); bp.connect(g).connect(out);
    return bp;
  });
  // a little low-passed direct sound for body/warmth
  const body = ctx.createBiquadFilter(); body.type = 'lowpass'; body.frequency.value = 750 * fs;
  const bodyG = ctx.createGain(); bodyG.gain.value = 0.16;
  voiced.connect(body).connect(bodyG).connect(out);

  const setF = (vals, at, glide) => {
    vals.forEach((hz, k) => {
      const f = hz * fs;
      F[k].frequency.linearRampToValueAtTime(f, at + glide);
      F[k].Q.setValueAtTime(f / [115, 150, 210][k], at);
    });
  };
  // initial state
  const v0 = (segs.find((s) => s.kind === 'vowel') || { F: VOWELS['@'] }).F;
  v0.forEach((hz, k) => { F[k].frequency.setValueAtTime(hz * fs, t0); F[k].Q.setValueAtTime(hz * fs / [115, 150, 210][k], t0); });
  src.frequency.setValueAtTime(P.pitch * emoPitch, t0);
  fricF.frequency.setValueAtTime(4000, t0);
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
      const lvl = (s.reduced ? 0.45 : 0.55 + 0.45 * s.stress) * amp;
      voiced.gain.linearRampToValueAtTime(lvl, a + 0.018);
      voiced.gain.linearRampToValueAtTime(lvl * (s.last ? 0.25 : 0.85), e);
      asp.gain.linearRampToValueAtTime(breath * lvl * 0.22, a + 0.02);
      if (s.F2) { setF(s.F, a, Math.min(0.035, s.d * 0.3)); setF(s.F2, e - s.d * 0.15, s.d * 0.0); }
      else setF(s.F, a, Math.min(0.045, s.d * 0.45));
      src.frequency.linearRampToValueAtTime(s.f0, a + s.d * 0.5);
      syllables.push({ t: s.t, d: s.d, v: s.vis, w: s.reduced ? 0.3 : 0.35 + 0.55 * (s.stress ? 1 : 0.7) });
      continue;
    }
    const c = s.cons;
    if (c.loc) setF(c.loc, a, s.d * 0.5); // formant transition toward the consonant
    if (c.t === 'plosive' || c.t === 'affric') {
      // closure (near silence, a voice bar for voiced stops), then a burst / frication
      const rel = c.t === 'affric' ? a + s.d * 0.45 : e - 0.018;
      voiced.gain.linearRampToValueAtTime(c.v ? 0.12 : 0, a + 0.012);
      asp.gain.linearRampToValueAtTime(0, a + 0.012);
      fricF.frequency.setValueAtTime(c.f, rel - 0.002);
      fricF.Q.setValueAtTime(c.t === 'affric' ? 2 : 1.6, rel - 0.002);
      fric.gain.setValueAtTime(0, rel - 0.002);
      if (c.t === 'affric') { fric.gain.linearRampToValueAtTime(0.2 * amp, rel + 0.012); fric.gain.linearRampToValueAtTime(0, e); }
      else {
        fric.gain.linearRampToValueAtTime((c.v ? 0.2 : 0.32) * amp, rel + 0.006);
        fric.gain.linearRampToValueAtTime(0, e + 0.008);
        // voiceless stops are aspirated going into the vowel
        if (!c.v) { asp.gain.setValueAtTime(0, e); asp.gain.linearRampToValueAtTime(0.14 * amp, e + 0.006); }
      }
    } else if (c.t === 'fric') {
      voiced.gain.linearRampToValueAtTime(c.v ? 0.22 : 0, a + 0.02);
      asp.gain.linearRampToValueAtTime(0, a + 0.02);
      fricF.frequency.setValueAtTime(c.f, a);
      fricF.Q.setValueAtTime(c.q ?? 2.2, a);
      fric.gain.linearRampToValueAtTime((c.g ?? 0.16) * amp, a + 0.02);
      fric.gain.linearRampToValueAtTime(0, e);
    } else if (c.t === 'h') {
      voiced.gain.linearRampToValueAtTime(0, a + 0.015);
      asp.gain.linearRampToValueAtTime(0.22 * amp, a + 0.02);
      asp.gain.linearRampToValueAtTime(breath * 0.1, e);
    } else if (c.t === 'nasal') {
      voiced.gain.linearRampToValueAtTime(0.32 * amp, a + 0.015);
      setF(c.F || [280, 1300, 2500], a, 0.02);
    } else { // liquid / glide
      voiced.gain.linearRampToValueAtTime(0.5 * amp, a + 0.015);
      setF(c.F || [380, rng.pick([1000, 1250, 2100]), 2400], a, s.d * 0.6);
    }
  }
  const end = t0 + T;
  voiced.gain.linearRampToValueAtTime(0, end);
  asp.gain.linearRampToValueAtTime(0, end);
  for (const n of [src, vib, jit, nz]) { n.start(t0); n.stop(end + 0.1); }
  let stopped = false;
  src.onended = () => { try { out.disconnect(); chest.disconnect(); } catch {} };
  const stop = () => {
    if (stopped) return; stopped = true;
    const now = ctx.currentTime;
    try { out.gain.cancelScheduledValues(now); out.gain.setValueAtTime(out.gain.value, now); out.gain.linearRampToValueAtTime(0, now + 0.06); for (const n of [src, vib, jit, nz]) n.stop(now + 0.08); } catch {}
  };
  return { duration: T, syllables, stop };
}
