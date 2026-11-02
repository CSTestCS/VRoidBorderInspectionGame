// Procedural humanoid animation and facial expressions for VRM characters.
// Rotations are in VRM normalized bone space (T-pose = identity, model faces +Z).
import * as THREE from 'three';
import { damp } from '../util.js';

const FINGERS = ['Index', 'Middle', 'Ring', 'Little'];
const JOINTS = ['Proximal', 'Intermediate', 'Distal'];

function relaxedHands(curl = 0.28) {
  const p = {};
  for (const f of FINGERS) JOINTS.forEach((j, i) => {
    const c = curl * (1 + i * 0.25) + (f === 'Little' ? 0.08 : 0);
    p[`left${f}${j}`] = [0, 0, -c];
    p[`right${f}${j}`] = [0, 0, c];
  });
  p.leftThumbProximal = [0, -0.25, 0.1];
  p.rightThumbProximal = [0, 0.25, -0.1];
  return p;
}

export const POSES = {
  tpose: {},
  idle: {
    ...relaxedHands(),
    leftShoulder: [0, 0, -0.04], rightShoulder: [0, 0, 0.04],
    leftUpperArm: [0.05, 0, -1.2], rightUpperArm: [0.05, 0, 1.2],
    leftLowerArm: [0, -0.18, 0], rightLowerArm: [0, 0.18, 0],
    leftHand: [0, 0, -0.08], rightHand: [0, 0, 0.08],
    leftUpperLeg: [0, 0, 0.03], rightUpperLeg: [0, 0, -0.03],
  },
  shy: {
    ...relaxedHands(0.35),
    leftUpperArm: [0.25, -0.35, -1.15], rightUpperArm: [0.25, 0.35, 1.15],
    leftLowerArm: [0, -0.9, 0], rightLowerArm: [0, 0.9, 0],
    leftHand: [0.2, 0, -0.1], rightHand: [0.2, 0, 0.1],
    spine: [0.04, 0, 0], neck: [0.1, 0, 0], head: [0.1, 0, 0],
    leftUpperLeg: [0, 0, 0.0], rightUpperLeg: [0, 0, 0.0],
  },
  armsUp: {
    ...relaxedHands(0.12),
    leftShoulder: [0, 0, 0.02], rightShoulder: [0, 0, -0.02],
    leftUpperArm: [0, 0, -0.04], rightUpperArm: [0, 0, 0.04],
    leftLowerArm: [0, -0.04, 0], rightLowerArm: [0, 0.04, 0],
    leftHand: [0, 0, -0.04], rightHand: [0, 0, 0.04],
    leftUpperLeg: [0, 0, 0.1], rightUpperLeg: [0, 0, -0.1],
  },
  armsOut: {
    ...relaxedHands(0.15),
    leftUpperArm: [0, 0, -0.15], rightUpperArm: [0, 0, 0.15],
    leftUpperLeg: [0, 0, 0.1], rightUpperLeg: [0, 0, -0.1],
  },
  handOver: {
    ...relaxedHands(),
    leftUpperArm: [0.05, 0, -1.2], rightUpperArm: [0, 0.95, 0.75],
    leftLowerArm: [0, -0.18, 0], rightLowerArm: [0, 0.35, 0],
    rightHand: [0, 0, 0.1], spine: [0.06, 0, 0],
  },
  sit: {
    ...relaxedHands(0.35),
    leftUpperArm: [0.1, -0.55, -1.1], rightUpperArm: [0.1, 0.55, 1.1],
    leftLowerArm: [0, -0.9, 0], rightLowerArm: [0, 0.9, 0],
    leftUpperLeg: [-1.5, 0, 0.06], rightUpperLeg: [-1.5, 0, -0.06],
    leftLowerLeg: [1.45, 0, 0], rightLowerLeg: [1.45, 0, 0],
    spine: [0.05, 0, 0], head: [0.08, 0, 0],
  },
  float: {
    ...relaxedHands(0.2),
    leftUpperArm: [0.1, 0.1, -0.75], rightUpperArm: [0.1, -0.1, 0.75],
    leftLowerArm: [0, -0.35, 0], rightLowerArm: [0, 0.35, 0],
    leftUpperLeg: [-0.12, 0, 0.12], rightUpperLeg: [-0.05, 0, -0.1],
    leftLowerLeg: [0.35, 0, 0], rightLowerLeg: [0.2, 0, 0],
    leftFoot: [0.4, 0, 0], rightFoot: [0.4, 0, 0],
    neck: [0.12, 0, 0], head: [0.15, 0, 0],
  },
  turnAway: {},
};

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const env = (t, dur, inT = 0.35, outT = 0.45) => THREE.MathUtils.smoothstep(t, 0, inT) * (1 - THREE.MathUtils.smoothstep(t, dur - outT, dur));
const rnd = Math.random;

// ---- two-bone IK (world space, on VRM normalized bones) ---------------------
function wpos(o, v = new THREE.Vector3()) { return v.setFromMatrixPosition(o.matrixWorld); }
function rotateWorld(bone, from, to) {
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  _qa.setFromUnitVectors(from.normalize(), to.normalize());
  bone.getWorldQuaternion(_qb);
  bone.parent.getWorldQuaternion(_qc);
  _qa.multiply(_qb);
  bone.quaternion.copy(_qc.invert().multiply(_qa));
  bone.updateMatrixWorld(true);
}
function twoBoneIK(A, B, C, target, pole, weight) {
  if (weight <= 0.001) return;
  const qA0 = A.quaternion.clone(), qB0 = B.quaternion.clone();
  const a = wpos(A), b = wpos(B), c = wpos(C);
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
  const toT = target.clone().sub(a);
  const d = THREE.MathUtils.clamp(toT.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const dir = toT.normalize();
  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (perp.lengthSq() < 1e-8) perp.set(0, 0, 1);
  perp.normalize();
  const bWant = a.clone().addScaledVector(dir, l1 * cosA).addScaledVector(perp, l1 * sinA);
  rotateWorld(A, b.clone().sub(a), bWant.clone().sub(a));
  const b2 = wpos(B), c2 = wpos(C);
  const end = a.clone().addScaledVector(dir, d);
  rotateWorld(B, c2.clone().sub(b2), end.sub(b2));
  if (weight < 0.999) {
    const qA = A.quaternion.clone(), qB = B.quaternion.clone();
    A.quaternion.copy(qA0).slerp(qA, weight);
    B.quaternion.copy(qB0).slerp(qB, weight);
    A.updateMatrixWorld(true);
  }
}

// Orient a hand so its fingers point along `fingerDir` and its palm faces
// `palmDir` (world space). VRM normalized hands: fingers along +X (left) /
// -X (right), palm facing -Y in the T-pose.
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
function orientHand(hand, sgn, fingerDir, palmDir, weight) {
  if (weight <= 0.001) return;
  const F = fingerDir.clone().normalize();
  const P = palmDir.clone().addScaledVector(F, -palmDir.dot(F)).normalize();
  const fl = new THREE.Vector3(sgn, 0, 0), pl = new THREE.Vector3(0, -1, 0);
  _m1.makeBasis(fl, pl, fl.clone().cross(pl));
  _m2.makeBasis(F, P, F.clone().cross(P));
  const qWorld = new THREE.Quaternion().setFromRotationMatrix(_m2.multiply(_m1.transpose()));
  hand.parent.getWorldQuaternion(_qc);
  const qLocal = _qc.invert().multiply(qWorld);
  hand.quaternion.slerp(qLocal, weight);
  hand.updateMatrixWorld(true);
}

// ---- gestures: additive FK + optional IK hand targets over time --------------
// fk(t, s) returns { bone: [x,y,z] } offsets; ik(t, s) returns { left|right: { bone, off:[x,y,z] } }
// where off is in the character's local space relative to that bone; s = side (+1/-1).
const GESTURES = {
  glance: { dur: 2.8, fk: (t, s, d) => { const k = env(t, d); return { neck: [0, 0.22 * s * k, 0], head: [0.04 * k, 0.32 * s * k, 0.05 * s * k] }; } },
  lookDown: { dur: 2.4, fk: (t, s, d) => { const k = env(t, d); return { neck: [0.15 * k, 0, 0], head: [0.25 * k, 0, 0] }; } },
  lookAround: { dur: 4.0, fk: (t, s, d) => { const k = env(t, d, 0.5, 0.6); const y = Math.sin(t * 1.6) * 0.45 * s; return { neck: [0, y * 0.4 * k, 0], head: [-0.05 * k, y * 0.6 * k, 0] }; } },
  nod: { dur: 1.1, fk: (t, s, d) => { const k = env(t, d, 0.1, 0.2); return { head: [Math.sin(t * 11) * 0.12 * k, 0, 0], neck: [Math.sin(t * 11) * 0.04 * k, 0, 0] }; } },
  shake: { dur: 1.3, fk: (t, s, d) => { const k = env(t, d, 0.1, 0.25); return { head: [0, Math.sin(t * 12) * 0.2 * k, 0], neck: [0, Math.sin(t * 12) * 0.06 * k, 0] }; } },
  shrug: { dur: 1.6, fk: (t, s, d) => { const k = env(t, d, 0.25, 0.5); return { leftShoulder: [0, 0, 0.22 * k], rightShoulder: [0, 0, -0.22 * k], leftLowerArm: [0, -0.7 * k, 0], rightLowerArm: [0, 0.7 * k, 0], head: [0, 0, 0.08 * k] }; } },
  explain: { dur: 2.2, fk: (t, s, d) => { const k = env(t, d, 0.3, 0.5); const w = Math.sin(t * 5) * 0.12; return { rightUpperArm: [-0.15 * k, 0.45 * k, -0.25 * k], rightLowerArm: [0, (1.1 + w) * k, 0], rightHand: [0, 0, -0.4 * k], spine: [0, -0.05 * k, 0] }; } },
  explainL: { dur: 2.2, fk: (t, s, d) => { const k = env(t, d, 0.3, 0.5); const w = Math.sin(t * 5) * 0.12; return { leftUpperArm: [-0.15 * k, -0.45 * k, 0.25 * k], leftLowerArm: [0, -(1.1 + w) * k, 0], leftHand: [0, 0, 0.4 * k], spine: [0, 0.05 * k, 0] }; } },
  scratchHead: { dur: 2.8, ik: (t, s, d) => ({ [s > 0 ? 'right' : 'left']: { bone: 'head', off: [-0.07 * s, 0.13 + Math.sin(t * 14) * 0.012, 0.0], w: env(t, d, 0.5, 0.6), pole: [0.9, 0.3, -0.2], curl: 0.6 } }), fk: (t, s, d) => ({ head: [0.08 * env(t, d), 0, 0.12 * s * env(t, d)] }) },
  rubNeck: { dur: 2.6, ik: (t, s, d) => ({ [s > 0 ? 'right' : 'left']: { bone: 'neck', off: [0.03 * s + Math.sin(t * 9) * 0.015, 0.02, -0.06], w: env(t, d, 0.5, 0.6), pole: [0.8, 0.2, 0.2], curl: 0.3 } }), fk: (t, s, d) => ({ head: [-0.12 * env(t, d), 0, -0.08 * s * env(t, d)] }) },
  rubArm: { dur: 3.4, ik: (t, s, d) => ({ [s > 0 ? 'right' : 'left']: { bone: s > 0 ? 'leftUpperArm' : 'rightUpperArm', off: [-0.02 * s, -0.08 + Math.sin(t * 7) * 0.05, 0.07], w: env(t, d, 0.5, 0.6), pole: [0.35, -0.9, 0.3], curl: 0.2 } }) },
  adjust: { dur: 1.8, ik: (t, s, d) => { const w = env(t, d, 0.4, 0.5); const y = Math.sin(t * 6) * 0.015; return { left: { bone: 'hips', off: [0.15, 0.05 + y, 0.05], w }, right: { bone: 'hips', off: [-0.15, 0.05 + y, 0.05], w } }; }, fk: (t, s, d) => ({ spine: [0.1 * env(t, d), 0, 0], head: [0.2 * env(t, d), 0, 0] }) },
  touchFace: { dur: 2.0, ik: (t, s, d) => ({ [s > 0 ? 'right' : 'left']: { bone: 'head', off: [0.03 * s, 0.0, 0.1], w: env(t, d, 0.35, 0.5), pole: [0.5, -0.8, 0.2], curl: 0.4 } }) },
  // reactions
  recoil: { dur: 1.4, fk: (t, s, d) => { const k = env(t, d, 0.08, 0.7); return { spine: [-0.12 * k, 0, 0], chest: [-0.1 * k, 0, 0], head: [-0.15 * k, 0.1 * s * k, 0], leftShoulder: [0, 0, 0.18 * k], rightShoulder: [0, 0, -0.18 * k] }; },
    ik: (t, s, d) => { const w = env(t, d, 0.08, 0.7); return { left: { bone: 'head', off: [0.1, -0.05, 0.18], w }, right: { bone: 'head', off: [-0.1, -0.05, 0.18], w } }; } },
  coverFace: { dur: 1.2, ik: (t, s, d) => { const w = env(t, d, 0.1, 0.5); return { left: { bone: 'head', off: [0.05, 0.02, 0.12], w }, right: { bone: 'head', off: [-0.05, 0.02, 0.12], w } }; }, fk: (t, s, d) => ({ head: [0.15 * env(t, d, 0.1, 0.5), 0.25 * s * env(t, d, 0.1, 0.5), 0] }) },
  flinch: { dur: 1.3, ik: (t, s, d) => ({ [s > 0 ? 'right' : 'left']: { bone: 'head', off: [-0.02 * s, 0.06, 0.16], w: env(t, d, 0.1, 0.6) } }), fk: (t, s, d) => { const k = env(t, d, 0.1, 0.6); return { head: [-0.08 * k, -0.35 * s * k, 0], neck: [0, -0.15 * s * k, 0] }; } },
  flinchHead: { dur: 1.2, fk: (t, s, d) => { const k = env(t, d, 0.1, 0.6); return { head: [-0.1 * k, -0.4 * s * k, 0.05 * s * k], neck: [0, -0.18 * s * k, 0], spine: [-0.03 * k, -0.05 * s * k, 0] }; } },
  reachOut: { dur: 1.6, fk: (t, s, d) => { const k = env(t, d, 0.2, 0.5); return { rightUpperArm: [0, 0.8 * k, -0.6 * k], rightLowerArm: [0, 0.2 * k, 0], spine: [0.08 * k, 0, 0] }; } },
  stretch: { dur: 3.2, fk: (t, s, d) => { const k = env(t, d, 0.8, 0.9); return { spine: [-0.12 * k, 0, 0], chest: [-0.08 * k, 0, 0], head: [-0.2 * k, 0, 0], leftShoulder: [0, 0, 0.15 * k], rightShoulder: [0, 0, -0.15 * k] }; } },
  footTap: { dur: 2.6, foot: (t, s, d) => ({ side: s, lift: Math.max(0, Math.sin(t * 9)) * 0.035 * env(t, d, 0.2, 0.3) }) },
};

// arm "holding styles" while standing idle, as IK targets relative to bones
const ARM_STYLES = {
  relaxed: null,
  clasped: { pole: [0.6, -0.8, -0.1], curl: 0.5, left: { bone: 'hips', off: [0.02, -0.06, 0.17] }, right: { bone: 'hips', off: [-0.02, -0.06, 0.17] } },
  behind: { pole: [0.6, -0.6, -0.5], curl: 0.5, left: { bone: 'hips', off: [0.05, -0.02, -0.15] }, right: { bone: 'hips', off: [-0.05, -0.02, -0.15] } },
  crossed: { curl: 0.85, front: true,
    // forearms stacked just below the chest, elbows forward at the sides, each hand over the other elbow
    left: { bone: 'chest', off: [-0.055, -0.02, 0.15], elbow: [0.15, -0.02, 0.07], finger: [-0.75, 0.2, -0.6], palm: [0.15, -0.25, -1] },
    right: { bone: 'chest', off: [0.06, 0.005, 0.19], elbow: [-0.15, 0.0, 0.09], finger: [0.75, 0.2, -0.6], palm: [-0.15, -0.25, -1] } },
  hug: { curl: 0.9, front: true,
    left: { bone: 'chest', off: [-0.07, 0.06, 0.14], elbow: [0.14, -0.02, 0.08], finger: [-0.65, 0.5, -0.55], palm: [0.2, -0.1, -1] },
    right: { bone: 'chest', off: [0.075, 0.085, 0.17], elbow: [-0.14, 0.0, 0.1], finger: [0.65, 0.5, -0.55], palm: [-0.2, -0.1, -1] } },
  hipHand: { pole: [0.9, -0.2, -0.45], curl: 0.3, right: { bone: 'hips', off: [-0.17, 0.07, 0.02] } },
  modest: { pole: [0.55, -0.8, -0.05], curl: 0.4, left: { bone: 'hips', off: [0.04, -0.12, 0.15] }, right: { bone: 'hips', off: [-0.04, -0.1, 0.16] } },
};

// ---- motion-capture walk clips (converted from Mixamo, see tools/convert-mixamo.mjs) ----
const CLIPS = {};
export async function loadWalkClips(base = '../assets/anim/') {
  for (const k of ['female', 'male']) {
    try {
      const c = await (await fetch(`${base}walk_${k}.json`)).json();
      c.q = {};
      for (const [b, arr] of Object.entries(c.bones)) c.q[b] = Float32Array.from(arr);
      CLIPS[k] = c;
    } catch (e) { console.warn('walk clip', k, e); }
  }
}
const _qc = new THREE.Quaternion(), _qd = new THREE.Quaternion();
function sampleClip(c, bone, u, out) {
  const a = c.q[bone];
  if (!a) return null;
  const f = u * c.frames, i0 = Math.floor(f) % c.frames, i1 = (i0 + 1) % c.frames, t = f - Math.floor(f);
  out.fromArray(a, i0 * 4);
  _qd.fromArray(a, i1 * 4);
  return out.slerp(_qd, t);
}

export class Animator {
  constructor(vrm) {
    this.vrm = vrm;
    this.h = vrm.humanoid;
    this.bones = {};
    this.fk = {};
    this.pose = 'idle';
    this.blendRate = 5;
    this.time = Math.random() * 10;
    this.walking = false;
    this.walkPhase = 0;
    this.walkSpeed = 0;
    this.walkW = 0; this.walkU = 0; this.clipName = 'female'; this.onStep = null;
    this.lookTarget = null;
    this.lookWeight = 0.6;
    this.floatMode = false;
    this.shiver = 0;
    this.talking = false;
    this.mood = 'waiting'; // waiting | cold | wet | calm
    this.hipsOffset = new THREE.Vector3();
    this.extra = {};
    this.reach = null; // { left|right: Vector3 world }
    this.handTargets = null; // persistent world targets (e.g. hands on table)
    this.gestures = [];
    this.nextIdle = 2 + rnd() * 3;
    this.weightSide = 0; this.weightCur = 0;
    this.armStyle = 'relaxed'; this.armStyleW = { left: 0, right: 0 }; this.styleTargets = { left: null, right: null };
    this.ikW = { left: 0, right: 0 };
    this.curl = { left: 0, right: 0 };
    this.frontOffset = 0; // extra forward clearance for arms held in front (big chest / bulky top)
    this.footAnchors = null; this.anchorTimer = 0.6; this.legIK = 0;
    this.personality = { sway: 1, swaySpeed: 1, slouch: 0.03, headTilt: 0, fidget: 0.12, stance: 0.04, breath: 1.7, gesture: 0.5, styles: ['relaxed', 'clasped'], walk: 1 };
    const hips = this.h.getNormalizedBoneNode('hips');
    this.hipsRest = hips ? hips.position.clone() : new THREE.Vector3();
    const names = new Set(['leftThumbMetacarpal', 'leftThumbDistal', 'rightThumbMetacarpal', 'rightThumbDistal', 'hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot', 'leftToes', 'rightToes']);
    for (const p of Object.values(POSES)) for (const k of Object.keys(p)) names.add(k);
    for (const n of names) {
      const node = this.h.getNormalizedBoneNode(n);
      if (node) { this.bones[n] = node; this.fk[n] = node.quaternion.clone(); }
    }
    this.setPose('idle', true);
  }

  // per-visitor variation
  setPersonality(rng, nervous = 0) {
    this.personality = {
      sway: rng.float(0.6, 1.5), swaySpeed: rng.float(0.75, 1.3), slouch: rng.float(-0.02, 0.1), headTilt: rng.float(-0.07, 0.07),
      fidget: rng.float(0.06, 0.16) + nervous * 0.15, stance: rng.float(0.02, 0.08), breath: rng.float(1.4, 2.0) + nervous * 0.4,
      gesture: rng.float(0.25, 0.8), walk: rng.float(0.88, 1.12),
      styles: rng.shuffle(['relaxed', 'relaxed', 'clasped', 'behind', 'crossed', 'hipHand', 'modest']).slice(0, 3),
    };
    this.armStyle = this.personality.styles[0];
  }

  play(name, side = rnd() < 0.5 ? 1 : -1) {
    const g = GESTURES[name];
    if (!g) return;
    this.gestures = this.gestures.filter((x) => x.name !== name);
    this.gestures.push({ name, g, t: 0, side, dur: g.dur * (0.85 + rnd() * 0.3) });
  }

  setPose(name, instant = false) {
    if (name !== this.pose) { this.anchorTimer = 0.9; this.footAnchors = null; }
    this.pose = name;
    if (instant) {
      const target = this._target(0);
      for (const [n, node] of Object.entries(this.bones)) {
        const e = target[n] || [0, 0, 0];
        node.quaternion.setFromEuler(_e.set(e[0], e[1], e[2]));
        this.fk[n].copy(node.quaternion);
      }
    }
  }

  get standing() { return ['idle', 'shy', 'armsUp', 'armsOut', 'handOver'].includes(this.pose) && !this.floatMode; }

  _idleScheduler(dt) {
    if (!this.standing && this.pose !== 'sit') return;
    if (this.walking || this.gestures.some((g) => GESTURES[g.name].ik)) return;
    this.nextIdle -= dt * (1 + this.personality.fidget * 4);
    if (this.nextIdle > 0) return;
    this.nextIdle = 3 + rnd() * 5;
    const sit = this.pose === 'sit';
    let pool;
    if (sit) pool = [['lookDown', 3], ['glance', 3], ['footTap', 2], ['rubNeck', 1], ['touchFace', 1]];
    else if (this.pose === 'armsUp') pool = [['glance', 2], ['lookDown', 1]];
    else if (this.mood === 'cold' || this.mood === 'wet') pool = [['rubArm', 4], ['glance', 2], ['lookDown', 3], ['shift', 3], ['touchFace', 1]];
    else pool = [['glance', 3], ['lookAround', 2], ['lookDown', 2], ['shift', 4], ['scratchHead', 1], ['rubNeck', 1], ['adjust', 1], ['footTap', 1], ['stretch', 0.5], ['style', 2]];
    let tot = pool.reduce((a, p) => a + p[1], 0), r = rnd() * tot, pick = pool[0][0];
    for (const [n, w] of pool) if ((r -= w) <= 0) { pick = n; break; }
    if (pick === 'shift') this.weightSide = [-1, 0, 1][Math.floor(rnd() * 3)];
    else if (pick === 'style') this.armStyle = this.personality.styles[Math.floor(rnd() * this.personality.styles.length)];
    else this.play(pick);
  }

  _target(dt) {
    const base = POSES[this.pose] || POSES.idle;
    const P = this.personality;
    const t = {};
    for (const [k, v] of Object.entries(base)) t[k] = v.slice();
    const add = (k, x, y, z) => { const a = t[k] || (t[k] = [0, 0, 0]); a[0] += x; a[1] += y; a[2] += z; };
    const time = this.time;
    // breathing (faster when cold / nervous)
    const br = Math.sin(time * P.breath * (this.mood === 'cold' || this.mood === 'wet' ? 1.3 : 1));
    add('chest', br * 0.02, 0, 0); add('upperChest', br * 0.012, 0, 0); add('spine', br * 0.006, 0, 0);
    add('leftShoulder', 0, 0, br * 0.012); add('rightShoulder', 0, 0, -br * 0.012);
    if (this.standing) {
      // posture + stance
      add('spine', P.slouch, 0, 0); add('chest', P.slouch * 0.6, 0, 0); add('neck', -P.slouch * 0.8, 0, 0); add('head', -P.slouch * 0.4, 0, P.headTilt);
      add('leftUpperLeg', 0, 0, P.stance); add('rightUpperLeg', 0, 0, -P.stance);
      // weight shift: pelvis tilts toward the standing leg, torso counter-balances
      const w = this.weightCur;
      add('hips', 0, -0.05 * w, -0.06 * w); add('spine', 0, 0.02 * w, 0.05 * w); add('chest', 0, 0, 0.02 * w); add('head', 0, 0, -0.03 * w);
      // slow organic sway
      const sw = P.sway, sp = P.swaySpeed;
      add('hips', 0, Math.sin(time * 0.37 * sp) * 0.02 * sw, Math.sin(time * 0.53 * sp) * 0.01 * sw);
      add('spine', Math.sin(time * 0.29 * sp) * 0.01 * sw, -Math.sin(time * 0.37 * sp) * 0.015 * sw, 0);
      add('head', Math.sin(time * 0.41 * sp + 1) * 0.02 * sw, Math.sin(time * 0.23 * sp) * 0.04 * sw, 0);
      // fingers curl while holding / gripping (from arm IK), fidget a little
      for (const f2 of FINGERS) for (let j = 0; j < 3; j++) {
        add('left' + f2 + JOINTS[j], 0, 0, -this.curl.left * (0.5 + j * 0.25));
        add('right' + f2 + JOINTS[j], 0, 0, this.curl.right * (0.5 + j * 0.25));
      }
      // thumbs fold in against the palm while gripping
      for (const [j, k] of [['ThumbMetacarpal', 0.35], ['ThumbProximal', 0.5], ['ThumbDistal', 0.6]]) {
        add('left' + j, 0, -this.curl.left * k * 0.6, -this.curl.left * k);
        add('right' + j, 0, this.curl.right * k * 0.6, this.curl.right * k);
      }
      const f = Math.sin(time * 0.9 + 2) * 0.06;
      add('leftIndexProximal', 0, 0, -f); add('rightIndexProximal', 0, 0, f);
    }
    if (this.pose === 'sit') {
      add('spine', P.slouch + 0.04, 0, 0); add('head', Math.sin(time * 0.3) * 0.03, Math.sin(time * 0.21) * 0.05, P.headTilt);
    }
    if (this.talking && !this.walking) {
      add('head', Math.sin(time * 6.5) * 0.025, Math.sin(time * 2.3) * 0.03, 0);
      add('neck', Math.sin(time * 6.5 + 0.5) * 0.01, 0, 0);
    }
    if (this.walking && !CLIPS[this.clipName]) {
      const ph = this.walkPhase, s = Math.sin(ph), c = Math.cos(ph);
      const st = 0.42 * P.walk;
      add('leftUpperLeg', -st * s - 0.05, 0, 0); add('rightUpperLeg', st * s - 0.05, 0, 0);
      add('leftLowerLeg', 0.75 * Math.max(0, -c) + 0.1, 0, 0); add('rightLowerLeg', 0.75 * Math.max(0, c) + 0.1, 0, 0);
      // heel-toe roll
      add('leftFoot', 0.25 * s - 0.15 * Math.max(0, -c), 0, 0); add('rightFoot', -0.25 * s - 0.15 * Math.max(0, c), 0, 0);
      add('leftToes', -0.3 * Math.max(0, s), 0, 0); add('rightToes', -0.3 * Math.max(0, -s), 0, 0);
      // arms swing opposite to the legs: left foot forward (s > 0) -> right arm forward, left arm back
      const sw = 0.42 * P.walk;
      add('leftUpperArm', sw * s, 0, 0.06); add('rightUpperArm', -sw * s, 0, -0.06);
      // elbows bend more on the forward swing
      add('leftLowerArm', 0, -0.2 - 0.35 * Math.max(0, -s), 0); add('rightLowerArm', 0, 0.2 + 0.35 * Math.max(0, s), 0);
      add('leftHand', 0.1 * s, 0, 0); add('rightHand', -0.1 * s, 0, 0);
      // pelvis rotation, torso counter-rotation, head stabilised
      add('hips', 0, 0.09 * s, 0.03 * c); add('spine', 0.04, -0.1 * s, -0.02 * c); add('chest', 0, -0.05 * s, 0); add('head', -0.02, 0.07 * s, 0.02 * c);
    }
    if (this.floatMode) {
      add('leftUpperArm', 0, Math.sin(time * 0.6) * 0.12, Math.sin(time * 0.45) * 0.1);
      add('rightUpperArm', 0, Math.sin(time * 0.55 + 1) * 0.12, -Math.sin(time * 0.5 + 2) * 0.1);
      add('leftLowerArm', 0, -Math.sin(time * 0.4) * 0.15, 0); add('rightLowerArm', 0, Math.sin(time * 0.37 + 1) * 0.15, 0);
      add('leftUpperLeg', Math.sin(time * 0.4) * 0.08, 0, Math.sin(time * 0.31) * 0.05);
      add('rightUpperLeg', Math.sin(time * 0.43 + 1.4) * 0.08, 0, -Math.sin(time * 0.33) * 0.05);
      add('leftLowerLeg', 0.1 + Math.sin(time * 0.5) * 0.1, 0, 0); add('rightLowerLeg', 0.1 + Math.sin(time * 0.47 + 2) * 0.1, 0, 0);
      add('head', Math.sin(time * 0.3) * 0.05, Math.sin(time * 0.2) * 0.08, 0);
      add('spine', Math.sin(time * 0.25) * 0.04, 0, Math.sin(time * 0.18) * 0.03);
    }
    if (this.shiver > 0) {
      const j = this.shiver * 0.022;
      add('chest', Math.sin(time * 41) * j, 0, Math.sin(time * 37) * j);
      add('leftUpperArm', 0, 0, Math.sin(time * 43) * j); add('rightUpperArm', 0, 0, Math.sin(time * 39) * j);
      add('head', Math.sin(time * 47) * j * 0.6, 0, 0);
      add('leftShoulder', 0, 0, 0.08 * this.shiver); add('rightShoulder', 0, 0, -0.08 * this.shiver);
    }
    for (const gs of this.gestures) if (gs.g.fk) for (const [k, v] of Object.entries(gs.g.fk(gs.t, gs.side, gs.dur))) add(k, v[0], v[1], v[2]);
    for (const [k, v] of Object.entries(this.extra)) add(k, v[0], v[1], v[2]);
    // head looks toward target
    if (this.lookTarget && this.bones.head && this.bones.chest && !this.floatMode) {
      const chest = this.bones.chest;
      chest.updateWorldMatrix(true, false);
      this.lookTarget.getWorldPosition(_v);
      chest.getWorldPosition(_v2);
      _v.sub(_v2);
      const inv = _q.copy(this.vrm.scene.getWorldQuaternion(new THREE.Quaternion())).invert();
      _v.applyQuaternion(inv);
      let yaw = Math.atan2(_v.x, _v.z);
      let pitch = -Math.atan2(_v.y - 0.25, Math.hypot(_v.x, _v.z));
      if (Math.abs(yaw) > 1.6) { yaw = 0; pitch = 0; }
      const busy = this.gestures.some((g) => ['glance', 'lookAround', 'lookDown', 'flinch', 'coverFace'].includes(g.name)) ? 0.3 : 1;
      yaw = THREE.MathUtils.clamp(yaw, -0.9, 0.9) * this.lookWeight * busy;
      pitch = THREE.MathUtils.clamp(pitch, -0.5, 0.6) * this.lookWeight * busy;
      add('neck', pitch * 0.4, yaw * 0.4, 0);
      add('head', pitch * 0.6, yaw * 0.6, 0);
    }
    return t;
  }

  _applyClip(clip) {
    const w = this.walkW;
    for (const [n, node] of Object.entries(this.bones)) {
      if (!sampleClip(clip, n, this.walkU, _qc)) continue;
      // head and neck keep most of their look-at / idle motion
      const k = n === 'head' || n === 'neck' ? w * 0.35 : w;
      node.quaternion.slerp(_qc, k);
    }
    // models without an upper chest bone get its motion folded into the chest
    if (!this.bones.upperChest && this.bones.chest && sampleClip(clip, 'upperChest', this.walkU, _qc)) this.bones.chest.quaternion.multiply(_qd.identity().slerp(_qc, w));
  }

  _localToWorldFrom(boneName, off, out) {
    const root = this.vrm.scene;
    const b = this.bones[boneName];
    if (!b) return null;
    wpos(b, _v);
    root.worldToLocal(_v);
    _v.x += off[0]; _v.y += off[1]; _v.z += off[2];
    return out.copy(root.localToWorld(_v));
  }

  _armIK(dt) {
    const root = this.vrm.scene;
    const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
    const want = { left: null, right: null }, wantW = { left: 0, right: 0 };
    const poleOf = { left: null, right: null }, curlOf = { left: 0, right: 0 }, bendOf = { left: 0.15, right: 0.15 };
    const elbowOf = { left: null, right: null }, handOf = { left: null, right: null };
    // idle holding style
    const style = this.standing && !this.walking && this.pose !== 'armsUp' && this.pose !== 'armsOut' && this.pose !== 'handOver' ? ARM_STYLES[this.mood === 'cold' || this.mood === 'wet' ? (this.armStyle === 'relaxed' ? 'hug' : this.armStyle === 'hipHand' ? 'hug' : this.armStyle) : this.armStyle] : null;
    for (const side of ['left', 'right']) {
      const st = style?.[side];
      this.armStyleW[side] = damp(this.armStyleW[side], st ? 1 : 0, 3, dt);
      if (st) this.styleTargets[side] = { ...st, pole: style.pole, curl: style.curl, bend: style.bend, front: style.front };
      const s = this.styleTargets[side];
      if (s && this.armStyleW[side] > 0.01) {
        // styles held in front of the body move forward for deeper chests / bulky clothes
        const fz = s.front ? this.frontOffset : 0;
        want[side] = this._localToWorldFrom(s.bone, [s.off[0], s.off[1], s.off[2] + fz], new THREE.Vector3());
        wantW[side] = this.armStyleW[side]; poleOf[side] = s.pole; curlOf[side] = s.curl || 0; bendOf[side] = s.bend || 0.15;
        if (s.elbow) elbowOf[side] = this._localToWorldFrom(s.bone, [s.elbow[0], s.elbow[1], s.elbow[2] + fz * 0.8], new THREE.Vector3());
        if (s.finger) handOf[side] = { finger: V(...s.finger).applyQuaternion(rootQ), palm: V(...s.palm).applyQuaternion(rootQ) };
      }
    }
    // gestures override
    for (const gs of this.gestures) {
      if (!gs.g.ik) continue;
      for (const [side, tg] of Object.entries(gs.g.ik(gs.t, gs.side, gs.dur))) {
        const p = this._localToWorldFrom(tg.bone, tg.off, new THREE.Vector3());
        if (!p) continue;
        const w = tg.w ?? 1;
        if (want[side] && wantW[side] > 0) want[side].lerp(p, w / Math.max(1e-3, Math.max(w, wantW[side]))); else want[side] = p;
        if (w > 0.3) { poleOf[side] = tg.pole || null; curlOf[side] = tg.curl ?? 0.3; bendOf[side] = tg.bend ?? 0.15; elbowOf[side] = null; handOf[side] = null; }
        wantW[side] = Math.max(wantW[side], w);
      }
    }
    for (const src of [this.handTargets, this.reach]) if (src) for (const side of ['left', 'right']) if (src[side]) { want[side] = src[side].clone(); wantW[side] = 1; elbowOf[side] = null; handOf[side] = null; }
    for (const side of ['left', 'right']) {
      this.ikW[side] = damp(this.ikW[side], wantW[side], 8, dt);
      if (!want[side] || this.ikW[side] < 0.01) continue;
      const pre = side === 'left' ? 'left' : 'right';
      const A = this.bones[pre + 'UpperArm'], B = this.bones[pre + 'LowerArm'], C = this.bones[pre + 'Hand'];
      if (!A || !B || !C) continue;
      const sgn = side === 'left' ? 1 : -1;
      const pp = poleOf[side] || [0.7, -0.6, -0.5];
      // elbow target -> pole points from the shoulder toward where the elbow should be
      const pole = elbowOf[side] ? elbowOf[side].clone().sub(wpos(A)) : V(pp[0] * sgn, pp[1], pp[2]).applyQuaternion(rootQ);
      twoBoneIK(A, B, C, want[side], pole, this.ikW[side]);
      if (handOf[side]) orientHand(C, sgn, handOf[side].finger, handOf[side].palm, this.ikW[side]);
      else {
        // hand continues the forearm instead of keeping its dangling idle angle
        _qb.setFromEuler(_e.set(0, -0.2 * bendOf[side] * sgn, -bendOf[side] * sgn));
        C.quaternion.slerp(_qb, this.ikW[side] * 0.85);
      }
      this.curl[side] = damp(this.curl[side], curlOf[side] * this.ikW[side], 6, dt);
    }
  }

  _legIK(dt) {
    const root = this.vrm.scene;
    const ok = (this.standing || this.pose === 'sit') && !this.walking;
    this.legIK = damp(this.legIK, ok && this.footAnchors ? 1 : 0, 4, dt);
    if (ok && !this.footAnchors) {
      this.anchorTimer -= dt;
      if (this.anchorTimer <= 0) {
        const L = this.bones.leftFoot, R = this.bones.rightFoot;
        if (L && R) this.footAnchors = { left: root.worldToLocal(wpos(L)), right: root.worldToLocal(wpos(R)) };
      }
    }
    if (!ok) { this.footAnchors = null; this.anchorTimer = 0.6; }
    if (!this.footAnchors || this.legIK < 0.01) return;
    const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
    const tap = this.gestures.find((g) => g.g.foot);
    for (const side of ['left', 'right']) {
      const A = this.bones[side + 'UpperLeg'], B = this.bones[side + 'LowerLeg'], C = this.bones[side + 'Foot'];
      if (!A || !B || !C) continue;
      const tgt = this.footAnchors[side].clone();
      if (tap) { const f = tap.g.foot(tap.t, tap.side, tap.dur); if ((f.side > 0) === (side === 'right')) tgt.y += f.lift; }
      const pole = V(side === 'left' ? 0.15 : -0.15, 0, 1).applyQuaternion(rootQ);
      twoBoneIK(A, B, C, root.localToWorld(tgt), pole, this.legIK);
    }
  }

  update(dt) {
    this.time += dt;
    if (this.walking) this.walkPhase += dt * (5.2 * Math.max(0.6, this.walkSpeed)) / this.personality.walk;
    const clip = CLIPS[this.clipName];
    this.walkW = damp(this.walkW, this.walking && clip ? 1 : 0, 7, dt);
    if (clip && this.walkW > 0.001) {
      // play the clip so a planted foot moves at the same speed the character travels
      const hipsH = Math.max(0.4, this.hipsRest.y);
      const groundSpeed = clip.speed * hipsH; // m/s at rate 1
      const rate = this.walking ? THREE.MathUtils.clamp(Math.max(0.5, this.walkSpeed) / groundSpeed, 0.6, 1.6) : 1;
      const prev = this.walkU;
      this.walkU = (this.walkU + dt * rate / clip.duration) % 1;
      // footfalls roughly at the start and middle of the cycle
      if (this.walking && this.onStep && ((prev < 0.02 && this.walkU >= 0.02) || (prev < 0.52 && this.walkU >= 0.52) || (this.walkU < prev && this.walkU >= 0.02))) this.onStep();
    }
    for (const g of this.gestures) g.t += dt;
    this.gestures = this.gestures.filter((g) => g.t < g.dur);
    this._idleScheduler(dt);
    this.weightCur = damp(this.weightCur, this.standing && !this.walking ? this.weightSide : 0, 1.5, dt);
    const target = this._target(dt);
    const k = 1 - Math.exp(-this.blendRate * dt);
    for (const [n, node] of Object.entries(this.bones)) {
      const e = target[n] || [0, 0, 0];
      _q.setFromEuler(_e.set(e[0], e[1], e[2]));
      this.fk[n].slerp(_q, k);
      node.quaternion.copy(this.fk[n]);
    }
    if (clip && this.walkW > 0.001) this._applyClip(clip);
    const hips = this.bones.hips;
    if (hips) {
      let y = 0, x = 0;
      if (this.pose === 'sit') y = -0.42 * (this.vrmScaleHint || 1);
      if (this.walking) y += Math.abs(Math.cos(this.walkPhase)) * 0.03 - 0.025;
      if (this.floatMode) y += Math.sin(this.time * 0.7) * 0.04;
      if (this.standing && !this.walking) { x = this.weightCur * 0.035; y -= Math.abs(this.weightCur) * 0.012 + (this.mood === 'cold' ? 0.01 : 0); }
      this.hipsOffset.y = damp(this.hipsOffset.y, y, 6, dt);
      this.hipsOffset.x = damp(this.hipsOffset.x, x, 3, dt);
      hips.position.copy(this.hipsRest).add(this.hipsOffset);
      if (clip && this.walkW > 0.001) {
        const f = this.walkU * clip.frames, i = Math.floor(f) % clip.frames, j = (i + 1) % clip.frames, t = f - Math.floor(f), H = clip.hips, sc = this.hipsRest.y;
        const cy = (H[i * 3 + 1] * (1 - t) + H[j * 3 + 1] * t) * sc, cx = (H[i * 3] * (1 - t) + H[j * 3] * t) * sc;
        hips.position.y += (cy - this.hipsRest.y) * this.walkW;
        hips.position.x += cx * this.walkW;
      }
    }
    // IK on top of FK
    this.vrm.scene.updateWorldMatrix(true, true);
    this._legIK(dt);
    this._armIK(dt);
  }
}

// ---- facial expressions -------------------------------------------------------
const EMOTIONS = ['happy', 'angry', 'sad', 'relaxed', 'surprised'];
const VISEMES = ['aa', 'ih', 'ou', 'ee', 'oh'];

export class Face {
  constructor(vrm) {
    this.vrm = vrm;
    this.em = vrm.expressionManager;
    this.weights = {};
    this.target = {};
    this.base = { neutral: 0 };
    this.timed = []; // {name, w, until}
    this.blinkT = 2 + Math.random() * 3;
    this.blinkV = 0;
    this.eyesClosed = 0;
    this.squint = 0;
    this.talkUntil = 0;
    this.time = 0;
    this.viseme = 'aa';
    this.visemeT = 0;
    this.visemeW = 0;
  }
  has(name) { return !!this.em?.getExpression(name); }
  setBase(emotions) { this.base = { ...emotions }; }
  flash(name, w = 1, seconds = 1.5) { this.timed.push({ name, w, until: this.time + seconds }); }
  // seconds: how long; syllables: [{t, d, v, w}] from the voice synth (lip-sync)
  talk(seconds, syllables = null) {
    this.talkUntil = Math.max(this.talkUntil, this.time + seconds);
    this.speech = syllables && syllables.length ? { start: this.time + 0.03, syl: syllables } : null;
  }
  stopTalking() { this.talkUntil = 0; this.speech = null; }

  update(dt) {
    if (!this.em) return;
    this.time += dt;
    if (this.preview) {
      for (const e of this.em.expressions) this.em.setValue(e.expressionName, e.expressionName === this.preview ? 1 : 0);
      return;
    }
    const tgt = {};
    for (const e of EMOTIONS) tgt[e] = this.base[e] || 0;
    // standing attitude toward the officer colours the resting face
    // (-1 frustrated .. +1 admiring): it filters the situational mood and adds its own
    const att = THREE.MathUtils.clamp(this.attitude || 0, -1, 1), pos = Math.max(0, att), neg = Math.max(0, -att);
    tgt.happy *= 1 - neg * 0.85; tgt.relaxed *= 1 - neg * 0.6;
    tgt.angry *= 1 - pos * 0.8; tgt.sad *= 1 - pos * 0.5;
    tgt.happy += Math.max(0, pos - 0.08) * 0.42; tgt.relaxed += pos * 0.15;
    tgt.angry += Math.max(0, neg - 0.12) * 0.5; tgt.sad += Math.min(neg, 0.35) * 0.3;
    this.timed = this.timed.filter((t) => t.until > this.time);
    for (const t of this.timed) {
      // a frustrated visitor's smiles are thin, a fond visitor's anger is mild
      const w = t.w * (t.name === 'happy' ? 1 - neg * 0.7 : t.name === 'angry' ? 1 - pos * 0.6 : 1);
      for (const e of EMOTIONS) if (e !== t.name) tgt[e] *= 0.3;
      tgt[t.name] = Math.max(tgt[t.name] || 0, w);
    }
    // blinking
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkV = 1; this.blinkT = 2 + Math.random() * 4; }
    this.blinkV = Math.max(0, this.blinkV - dt * 7);
    const blinkCurve = this.blinkV > 0 ? Math.sin(this.blinkV * Math.PI) : 0;
    let blink = Math.max(blinkCurve, this.eyesClosed, this.squint * 0.55);
    // talking mouth
    let mouth = 0;
    if (this.speech && this.time < this.talkUntil) {
      // follow the synthesized syllables: open on vowels, closed on consonants/pauses
      const tt = this.time - this.speech.start;
      const cur = this.speech.syl.find((x) => tt >= x.t && tt < x.t + x.d);
      if (cur) { this.viseme = cur.v; mouth = cur.w * Math.sin(Math.PI * Math.min(1, (tt - cur.t) / cur.d)) ** 0.6; }
    } else if (this.time < this.talkUntil) {
      this.visemeT -= dt;
      if (this.visemeT <= 0) { this.viseme = VISEMES[Math.floor(Math.random() * VISEMES.length)]; this.visemeT = 0.07 + Math.random() * 0.12; this.visemeW = 0.25 + Math.random() * 0.6; if (Math.random() < 0.15) this.visemeW = 0; }
      mouth = this.visemeW;
    }
    for (const v of VISEMES) tgt[v] = v === this.viseme ? mouth : 0;
    for (const [k, v] of Object.entries(tgt)) {
      this.weights[k] = damp(this.weights[k] || 0, v, VISEMES.includes(k) ? 22 : 6, dt);
      this.em.setValue(k, this.weights[k]);
    }
    this.em.setValue('blink', Math.min(1, blink));
  }
}
