// Visitor generation (pure data, seeded) and 3D instantiation/painting.
import * as THREE from 'three';
import { RNG, clamp } from './util.js';
import { SKIN_TONES, HAIR_NATURAL, HAIR_OLD, HAIR_DYED, EYE_COLORS, SCLERA, DISCOLOR_COLORS, clothColor } from './palettes.js';
import { FIRST_F, FIRST_M, LAST, ORIGINS, OCCUPATIONS, PURPOSES, MOTIVES_HARMLESS, MOTIVES_DANGEROUS } from './data.js';
import { WEAPONS, SUBSTANCES, BENIGN, OBJECTS } from './objects.js';
import { chooseUnderwear, composeUnderwear } from './vrm/underwear.js';
import { Character } from './vrm/character.js';
import { removableItems } from './vrm/modelConfig.js';
import * as FX from './vrm/fx.js';

export const CURRENT_YEAR = 2058;

// Cooperative time slicing so heavy CPU work never blocks a frame for long.
export function slicer(budgetMs = 6) {
  let t0 = performance.now();
  return async () => {
    if (performance.now() - t0 < budgetMs) return;
    await new Promise((r) => setTimeout(r, 0));
    t0 = performance.now();
  };
}
export const PROBLEMS = ['invalidPortrait', 'invalidName', 'invalidDetails', 'forgedSeal', 'weapon', 'substance', 'contaminatedClothing', 'discoloredSclera', 'discoloredSkin', 'biteMarks', 'radiation'];
export const PROBLEM_LABEL = {
  invalidPortrait: 'Portrait does not match', invalidName: 'Name does not match', invalidDetails: 'Card details do not match', forgedSeal: 'Forged card (UV seal)',
  weapon: 'Carrying a weapon', substance: 'Carrying an unknown substance', contaminatedClothing: 'Contaminated clothing',
  discoloredSclera: 'Discoloured eyes', discoloredSkin: 'Discoloured skin', biteMarks: 'Bite marks', radiation: 'Irradiated',
};
export const ID_PROBLEMS = ['invalidPortrait', 'invalidName', 'invalidDetails', 'forgedSeal'];
export const INFECTION_PROBLEMS = ['discoloredSclera', 'discoloredSkin', 'biteMarks', 'radiation'];

// 50% clean, 0.1% everything, otherwise a decaying number of problems.
export function rollProblems(rng) {
  const r = rng.next();
  if (r < 0.5) return [];
  if (r < 0.501) return PROBLEMS.slice();
  const ks = [];
  for (let k = 1; k < PROBLEMS.length; k++) ks.push([k, Math.pow(0.48, k - 1)]);
  const k = rng.weighted(ks);
  // weighted draw without replacement: contaminated clothing is the most common issue
  const pool = PROBLEMS.map((p) => [p, p === 'contaminatedClothing' ? 2.6 : 1]);
  const out = [];
  while (out.length < k && pool.length) {
    const pick = rng.weighted(pool);
    out.push(pick);
    pool.splice(pool.findIndex(([p]) => p === pick), 1);
  }
  return out;
}

const pickW = (rng, list) => rng.weighted(list);
function lookFor(rng, sex, age) {
  const hairE = age === 'old' && rng.chance(0.75) ? pickW(rng, HAIR_OLD) : rng.chance(0.07) ? pickW(rng, HAIR_DYED) : pickW(rng, HAIR_NATURAL);
  const eyeE = pickW(rng, EYE_COLORS);
  const skinIdx = rng.weighted(SKIN_TONES.map((s, i) => [i, s[1]]));
  const j = (c, a) => c.map((v) => clamp(v + rng.float(-a, a)));
  return {
    skinIdx,
    skin: j(SKIN_TONES[skinIdx][0], 0.02),
    hair: j(hairE.rgb, 0.03), hairName: hairE.name,
    eye: j(eyeE.rgb, 0.03), eyeName: eyeE.name,
    sclera: SCLERA.normal,
  };
}
function clothSlots(rng, cfg) {
  const slots = {};
  const catOfSlot = {};
  for (const it of Object.values(cfg.items)) if (it.slot && !catOfSlot[it.slot]) catOfSlot[it.slot] = it.category;
  for (const s of ['A', 'B', 'C', 'D']) slots[s] = clothColor(rng, catOfSlot[s] || 'top');
  slots.dark = clothColor(rng, 'shoes').map((v) => v * 0.6);
  slots.light = [rng.float(0.75, 0.95), rng.float(0.75, 0.95), rng.float(0.72, 0.92)];
  return slots;
}
function dateStr(y, m, d) { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function ageRange(age) { return age === 'old' ? [58, 79] : age === 'adult' ? [30, 52] : [18, 32]; }

// models: [{ entry, cfg, height }]
export function generateVisitor(seed, models, opts = {}) {
  const rng = new RNG(seed);
  const enabled = models.filter((m) => m.cfg.enabled !== false);
  const M = opts.modelId ? enabled.find((m) => m.entry.id === opts.modelId) || enabled[0] : rng.pick(enabled);
  const cfg = M.cfg;
  const sex = cfg.sex;
  const problems = new Set(opts.problems || rollProblems(rng));
  const scale = rng.float(0.95, 1.05);
  const heightCm = Math.round(M.height * scale * 100);
  const look = { ...lookFor(rng, sex, cfg.age), slots: clothSlots(rng, cfg), scale };
  const underwear = chooseUnderwear(rng, sex);
  const first = rng.pick(sex === 'male' ? FIRST_M : FIRST_F);
  const last = rng.pick(LAST);
  const [a0, a1] = ageRange(cfg.age);
  const age = rng.int(a0, a1);
  const dob = dateStr(CURRENT_YEAR - age - (rng.chance(0.5) ? 1 : 0), rng.int(1, 12), rng.int(1, 28));
  const origin = rng.pick(ORIGINS);
  const idNo = `FCR-${rng.int(10, 99)}${String.fromCharCode(65 + rng.int(0, 25))}-${rng.int(1000, 9999)}-${rng.int(100, 999)}`;
  const issued = dateStr(rng.int(2036, 2044), rng.int(1, 12), rng.int(1, 28));
  const identity = { first, last, dob, age, origin, occupation: rng.pick(OCCUPATIONS), sex };
  const card = {
    first, last, dob, sex, heightCm: heightCm + rng.int(-2, 2), eyeName: look.eyeName, origin, idNo, issued,
    seal: 'valid', portrait: { modelId: M.entry.id, look: { ...look, sclera: SCLERA.normal } },
  };
  const answers = { name: `${first} ${last}`, dob, origin, purpose: rng.pick(PURPOSES) };
  const details = {};

  if (problems.has('invalidPortrait')) {
    const sameSex = enabled.filter((m) => m.cfg.sex === sex && m.entry.id !== M.entry.id);
    const variant = sameSex.length && rng.chance(0.6) ? 'model' : 'look';
    const fakeLook = { ...lookFor(rng, sex, cfg.age), slots: clothSlots(rng, cfg) };
    // make sure the fake look is visibly different
    if (variant === 'look') {
      let idx = (look.skinIdx + (rng.chance(0.5) ? 3 : -3) + SKIN_TONES.length) % SKIN_TONES.length;
      fakeLook.skin = SKIN_TONES[idx][0];
      let tries = 0;
      while (Math.abs(fakeLook.hair[0] - look.hair[0]) + Math.abs(fakeLook.hair[1] - look.hair[1]) < 0.25 && tries++ < 20) {
        const h = pickW(rng, HAIR_NATURAL.concat(HAIR_DYED));
        fakeLook.hair = h.rgb; fakeLook.hairName = h.name;
      }
    }
    card.portrait = { modelId: variant === 'model' ? rng.pick(sameSex).entry.id : M.entry.id, look: { ...fakeLook, sclera: SCLERA.normal } };
    details.portrait = variant;
  }
  if (problems.has('invalidName')) {
    if (rng.chance(0.5)) answers.name = `${rng.pick(sex === 'male' ? FIRST_M : FIRST_F)} ${last}`;
    else answers.name = `${first} ${rng.pick(LAST)}`;
    if (answers.name === `${first} ${last}`) answers.name = `${first} ${last === 'Voss' ? 'Vance' : 'Voss'}`;
    details.name = answers.name;
  }
  if (problems.has('invalidDetails')) {
    const v = rng.pick(['height', 'eyes', 'dob', 'sex']);
    details.details = v;
    if (v === 'height') card.heightCm = heightCm + (rng.chance(0.5) ? 1 : -1) * rng.int(14, 26);
    if (v === 'eyes') { let e; do { e = pickW(rng, EYE_COLORS); } while (e.name === look.eyeName || (look.eyeName.includes('Brown') && e.name.includes('Brown'))); card.eyeName = e.name; }
    if (v === 'dob') { const y = Number(dob.slice(0, 4)) + (rng.chance(0.5) ? 1 : -1) * rng.int(3, 9); answers.dob = dateStr(y, rng.int(1, 12), rng.int(1, 28)); }
    if (v === 'sex') card.sex = sex === 'male' ? 'female' : 'male';
  }
  if (problems.has('forgedSeal')) { card.seal = rng.pick(['missing', 'star5', 'misspelled', 'idmismatch']); details.seal = card.seal; }

  // pockets
  const items = removableItems(cfg);
  const pocketItems = items.filter((i) => i.pockets);
  const anyItems = pocketItems.length ? pocketItems : items;
  const pockets = {};
  const put = (type) => { if (!anyItems.length) return; const it = rng.pick(anyItems); (pockets[it.id] = pockets[it.id] || []).push({ type, bad: OBJECTS[type].bad }); };
  if (problems.has('weapon')) put(rng.pick(WEAPONS));
  if (problems.has('substance')) put(rng.pick(SUBSTANCES));
  for (const it of pocketItems) if (rng.chance(0.3)) (pockets[it.id] = pockets[it.id] || []).push({ type: rng.pick(BENIGN), bad: false });

  // clothing
  const clothing = {};
  for (const it of items) clothing[it.id] = it.category === 'shoes' ? (rng.chance(0.6) ? 'mud' : 'none') : rng.chance(0.28) ? 'mud' : 'none';
  if (problems.has('contaminatedClothing') && items.length) {
    const n = Math.min(items.length, rng.weighted([[1, 6], [2, 3], [3, 1]]));
    for (const it of rng.shuffle(items).slice(0, n)) clothing[it.id] = rng.weighted([['bio', 3], ['bioUV', 2], ['rad', 2], ['chem', 1.5], ['lice', 1.5]]);
  }

  // body
  const allProblems = problems.size === PROBLEMS.length;
  const body = {
    dirt: rng.float(0.45, 1), blood: rng.chance(0.25), grime: rng.float(0.3, 0.8),
    discolor: [], makeup: false, sclera: 'normal', bites: [], burns: [], rad: 0, decoys: [],
    discolorColor: rng.pick(DISCOLOR_COLORS),
  };
  const REG_SKIN = ['forearm', 'upperArm', 'neck', 'thigh', 'calf', 'back', 'abdomen', 'shoulder'];
  if (problems.has('discoloredSkin')) {
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) body.discolor.push(rng.pick(REG_SKIN));
    body.makeup = allProblems || rng.chance(0.4);
  }
  if (problems.has('discoloredSclera')) body.sclera = rng.pick(['yellow', 'red', 'grey', 'black']);
  if (problems.has('biteMarks')) { const n = rng.chance(0.3) ? 2 : 1; for (let i = 0; i < n; i++) body.bites.push(rng.pick(['forearm', 'hand', 'shoulder', 'calf', 'neck', 'upperArm', 'thigh'])); }
  if (problems.has('radiation')) {
    body.rad = rng.float(1.5, 4.5);
    if (rng.chance(0.55)) { const n = rng.int(1, 2); for (let i = 0; i < n; i++) body.burns.push(rng.pick(['forearm', 'upperArm', 'back', 'thigh', 'calf', 'abdomen', 'hand'])); }
  }
  const infected = INFECTION_PROBLEMS.some((p) => problems.has(p));
  if (rng.chance(infected ? 0.25 : 0.5)) {
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) body.decoys.push({ type: rng.weighted([['cut', 3], ['bruise', 3], ['tattoo', 1]]), region: rng.pick(['forearm', 'upperArm', 'thigh', 'calf', 'shoulder', 'back']) });
  }

  // interrogation outcome
  const idLie = ID_PROBLEMS.filter((p) => problems.has(p));
  let dangerous = false, motive = null;
  if (idLie.length) {
    let p = 0.35 + (problems.has('forgedSeal') ? 0.2 : 0) + (problems.has('invalidPortrait') ? 0.15 : 0) + (problems.has('weapon') ? 0.25 : 0);
    dangerous = rng.chance(clamp(p, 0, 0.9));
    const lieKey = { invalidName: 'name', invalidDetails: 'details', invalidPortrait: 'portrait', forgedSeal: 'seal' }[idLie[0]];
    motive = dangerous ? rng.pick(MOTIVES_DANGEROUS).text : rng.pick(MOTIVES_HARMLESS.filter((m) => m.lie === 'any' || m.lie === lieKey)).text;
  }
  const severity = (problems.has('discoloredSkin') ? 1 : 0) + (problems.has('discoloredSclera') ? 1 : 0) + body.bites.length + (body.rad > 3 ? 1 : 0);
  const cureDays = infected ? clamp(1 + Math.ceil(severity * 0.8) + rng.int(0, 1), 2, 5) : 0;

  return {
    id: 'v' + seed.toString(36), seed, modelId: M.entry.id, sex, age: cfg.age, scale, heightCm, look, underwear,
    identity, card, answers, details, problems: [...problems], pockets, clothing, body,
    interrogation: idLie.length ? { dangerous, motive } : null,
    cureDays, nervous: idLie.length || problems.has('weapon') || problems.has('substance') || (infected && rng.chance(0.6)) ? rng.float(0.3, 0.9) : rng.float(0, 0.2),
  };
}

export function correctOutcome(spec) {
  const p = new Set(spec.problems);
  return {
    tank: INFECTION_PROBLEMS.some((x) => p.has(x)),
    interrogate: ID_PROBLEMS.some((x) => p.has(x)),
    dangerous: !!spec.interrogation?.dangerous,
  };
}

// ---- 3D instantiation ---------------------------------------------------------
const REGIONS = {
  forearm: { bones: ['leftLowerArm', 'rightLowerArm'] },
  upperArm: { bones: ['leftUpperArm', 'rightUpperArm'] },
  hand: { bones: ['leftHand', 'rightHand'] },
  neck: { bones: ['neck'] },
  shoulder: { bones: ['leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm'], filter: (p, n) => n.y > 0.3 },
  chest: { bones: ['chest', 'upperChest'], filter: (p, n) => n.z > 0.3 },
  abdomen: { bones: ['spine', 'hips'], filter: (p, n) => n.z > 0.4 },
  back: { bones: ['chest', 'upperChest', 'spine'], filter: (p, n) => n.z < -0.4 },
  thigh: { bones: ['leftUpperLeg', 'rightUpperLeg'] },
  calf: { bones: ['leftLowerLeg', 'rightLowerLeg'] },
  foot: { bones: ['leftFoot', 'rightFoot', 'leftToes', 'rightToes'] },
};

function sampleRegion(surf, rng, region) {
  const r = REGIONS[region] || REGIONS.forearm;
  return surf.sampleVertex(rng, r.bones, r.filter) || surf.sampleVertex(rng);
}

export async function paintBody(ch, spec) {
  const tick = slicer();
  const B = ch.surfBody, F = ch.surfFace;
  if (!B) return;
  const rng = new RNG((spec.seed ^ 0x5eed) >>> 0);
  const b = spec.body;
  // conditions first (cond layer)
  for (const reg of b.discolor) { const v = sampleRegion(B, rng, reg); if (v) { { FX.paintDiscolor(B, v.p, v.n, rng.float(0.07, 0.12), b.discolorColor, rng.int(1, 999)); await tick(); } if (b.makeup) { FX.paintMakeup(B, v.p, v.n, 0.15); await tick(); } } }
  if (b.discolor.length && F && rng.chance(0.5)) {
    let top = -1e9; for (let i = 1; i < F.bindPos.length; i += 3) if (F.bindPos[i] > top) top = F.bindPos[i];
    const v = F.sampleVertex(rng, null, (p, n) => n.z > 0.2 && p.y < top - 0.12);
    if (v) { { FX.paintDiscolor(F, v.p, v.n, 0.035, b.discolorColor, rng.int(1, 999)); await tick(); } if (b.makeup) { FX.paintMakeup(F, v.p, v.n, 0.05); await tick(); } }
  }
  for (const reg of b.bites) { const v = sampleRegion(B, rng, reg); if (v) { FX.paintBite(B, v.p, v.n, rng.float(0.9, 1.25), rng, true); await tick(); } }
  for (const reg of b.burns) { const v = sampleRegion(B, rng, reg); if (v) { FX.paintBurn(B, v.p, v.n, rng.float(0.04, 0.08), rng.int(1, 999)); await tick(); } }
  for (const d of b.decoys) {
    const v = sampleRegion(B, rng, d.region);
    if (!v) continue;
    if (d.type === 'cut') { FX.paintCut(B, v.p, v.n, rng.float(0.03, 0.06), rng); await tick(); }
    else if (d.type === 'bruise') { FX.paintBruise(B, v.p, v.n, rng.float(0.03, 0.06), rng.int(1, 99)); await tick(); }
    else { FX.paintTattoo(B, v.p, v.n, rng.float(0.03, 0.05), rng.int(1, 99)); await tick(); }
  }
  // washable dirt
  const dirt = b.dirt;
  for (let i = 0; i < 7; i++) { const v = sampleRegion(B, rng, rng.pick(['foot', 'calf', 'calf', 'foot'])); if (v) { FX.paintDirt(B, v.p, v.n, rng.float(0.08, 0.16), dirt * rng.float(0.6, 1), rng.int(1, 999)); await tick(); } }
  for (let i = 0; i < 4; i++) { const v = sampleRegion(B, rng, rng.pick(['hand', 'forearm'])); if (v) { FX.paintDirt(B, v.p, v.n, rng.float(0.06, 0.12), dirt * rng.float(0.5, 0.9), rng.int(1, 999)); await tick(); } }
  for (let i = 0; i < 6; i++) { const v = B.sampleVertex(rng); if (v) { FX.paintDirt(B, v.p, v.n, rng.float(0.05, 0.12), dirt * rng.float(0.25, 0.7), rng.int(1, 999)); await tick(); } }
  for (let i = 0; i < 4; i++) { const v = B.sampleVertex(rng); if (v) { FX.paintGrime(B, v.p, v.n, rng.float(0.15, 0.28), b.grime * 0.6, rng.int(1, 999)); await tick(); } }
  if (F) for (let i = 0; i < 3; i++) { const v = F.sampleVertex(rng, null, (p, n) => n.z > 0.4); if (v) { FX.paintDirt(F, v.p, v.n, rng.float(0.02, 0.04), dirt * 0.7, rng.int(1, 999)); await tick(); } }
  if (b.blood) {
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) { const v = sampleRegion(B, rng, rng.pick(['forearm', 'hand', 'chest', 'thigh', 'abdomen'])); if (v) { FX.paintBlood(B, v.p, v.n, rng.float(0.025, 0.05), 1, rng.int(1, 999), rng); await tick(); } }
    if (F && rng.chance(0.4)) { const v = F.sampleVertex(rng, null, (p, n) => n.z > 0.4); if (v) { FX.paintBlood(F, v.p, v.n, 0.015, 1, rng.int(1, 99), rng); await tick(); } }
  }
  ch.applyColors({ ...ch.look, sclera: SCLERA[b.sclera] || SCLERA.normal });
  ch.surfBody.flush(); ch.surfFace?.flush();
  ch.initialDirt = measureDirt(ch);
}

export function measureDirt(ch) {
  let dirt = 0, makeup = 0;
  for (const s of [ch.surfBody, ch.surfFace]) {
    if (!s) continue;
    const d = s.layers.fx.data;
    for (let i = 0; i < d.length; i += 4) { dirt += d[i] + d[i + 1]; makeup += d[i + 2]; }
  }
  return { dirt, makeup };
}

export async function paintClothing(ch, spec, { washed = false } = {}) {
  const tick = slicer();
  const rng = new RNG((spec.seed ^ 0xc10) >>> 0);
  for (const it of ch.items.values()) {
    const kind = spec.clothing[it.id] || 'none';
    for (const [matKey, tris] of it.tris) {
      const surf = ch.clothSurf.get(matKey);
      if (!surf || !tris.length) continue;
      if (!washed) for (let i = 0; i < 4; i++) { const v = surf.sampleFromTris(rng, tris); { FX.paintWear(surf, v.p, v.n, rng.float(0.12, 0.22), rng.int(1, 999), tris); await tick(); } }
      const stamps = async (n, fn, r0, r1) => { for (let i = 0; i < n; i++) { const v = surf.sampleFromTris(rng, tris); fn(surf, v.p, v.n, rng.float(r0, r1), rng.int(1, 999), tris); await tick(); } };
      if (kind === 'mud' && !washed) await stamps(rng.int(2, 5), FX.paintMud, 0.05, 0.12);
      if (kind === 'bio') await stamps(rng.int(3, 5), FX.paintSlime, 0.05, 0.11);
      if (kind === 'bioUV') await stamps(rng.int(3, 6), FX.paintUVStain, 0.05, 0.1);
      if (kind === 'chem') await stamps(rng.int(2, 4), FX.paintChem, 0.05, 0.1);
      if (kind === 'lice') await stamps(rng.int(3, 5), FX.paintLice, 0.12, 0.2);
    }
  }
  for (const s of ch.clothSurf.values()) s.flush();
}

export async function buildVisitorCharacter(spec, modelsById, { lowRes = false, fx = true } = {}) {
  const M = modelsById[spec.modelId];
  const uwCanvas = await composeUnderwear(spec.underwear, lowRes ? 1024 : 2048);
  const uwTex = new THREE.CanvasTexture(uwCanvas);
  uwTex.flipY = false; uwTex.colorSpace = THREE.SRGBColorSpace; uwTex.anisotropy = 8;
  const ch = await Character.create(M.entry, M.cfg, spec.look, { uwTexture: uwTex, lowRes, fx });
  await paintBody(ch, spec);
  await paintClothing(ch, spec);
  ch.spec = spec;
  ch.animator.setPersonality(new RNG((spec.seed ^ 0xa11) >>> 0), spec.nervous || 0);
  ch.animator.vrmScaleHint = spec.scale || 1;
  return ch;
}
