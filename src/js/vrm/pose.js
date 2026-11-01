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
    ...relaxedHands(0.15),
    leftShoulder: [0, 0, 0.15], rightShoulder: [0, 0, -0.15],
    leftUpperArm: [0, 0, 0.75], rightUpperArm: [0, 0, -0.75],
    leftLowerArm: [0, 0, 0.35], rightLowerArm: [0, 0, -0.35],
    leftUpperLeg: [0, 0, 0.12], rightUpperLeg: [0, 0, -0.12],
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

export class Animator {
  constructor(vrm) {
    this.vrm = vrm;
    this.h = vrm.humanoid;
    this.bones = {};
    this.pose = 'idle';
    this.blendRate = 5;
    this.time = Math.random() * 10;
    this.walking = false;
    this.walkPhase = 0;
    this.walkSpeed = 0;
    this.lookTarget = null;
    this.lookWeight = 0.6;
    this.floatMode = false;
    this.shiver = 0;
    this.hipsOffset = new THREE.Vector3();
    this.extra = {}; // per-bone additive euler overrides
    const hips = this.h.getNormalizedBoneNode('hips');
    this.hipsRest = hips ? hips.position.clone() : new THREE.Vector3();
    const names = new Set();
    for (const p of Object.values(POSES)) for (const k of Object.keys(p)) names.add(k);
    for (const k of ['spine', 'chest', 'upperChest', 'neck', 'head', 'hips', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot']) names.add(k);
    for (const n of names) {
      const node = this.h.getNormalizedBoneNode(n);
      if (node) this.bones[n] = node;
    }
    this.setPose('idle', true);
  }

  setPose(name, instant = false) {
    this.pose = name;
    if (instant) {
      const target = this._target(0);
      for (const [n, node] of Object.entries(this.bones)) {
        const e = target[n] || [0, 0, 0];
        node.quaternion.setFromEuler(_e.set(e[0], e[1], e[2]));
      }
    }
  }

  _target(dt) {
    const base = POSES[this.pose] || POSES.idle;
    const t = {};
    for (const [k, v] of Object.entries(base)) t[k] = v.slice();
    const add = (k, x, y, z) => { const a = t[k] || (t[k] = [0, 0, 0]); a[0] += x; a[1] += y; a[2] += z; };
    const time = this.time;
    // breathing
    const br = Math.sin(time * 1.7);
    add('chest', br * 0.018, 0, 0);
    add('spine', br * 0.008, 0, 0);
    if (this.pose === 'idle' || this.pose === 'shy') {
      add('hips', 0, Math.sin(time * 0.37) * 0.025, Math.sin(time * 0.53) * 0.012);
      add('spine', 0, -Math.sin(time * 0.37) * 0.02, -Math.sin(time * 0.53) * 0.01);
    }
    if (this.walking) {
      const s = Math.sin(this.walkPhase), c = Math.cos(this.walkPhase);
      add('leftUpperLeg', -0.42 * s, 0, 0); add('rightUpperLeg', 0.42 * s, 0, 0);
      add('leftLowerLeg', 0.55 * Math.max(0, -c) + 0.08, 0, 0); add('rightLowerLeg', 0.55 * Math.max(0, c) + 0.08, 0, 0);
      add('leftFoot', 0.15 * s, 0, 0); add('rightFoot', -0.15 * s, 0, 0);
      add('leftUpperArm', 0, -0.32 * s, 0); add('rightUpperArm', 0, -0.32 * s, 0);
      add('hips', 0, 0.05 * s, 0); add('spine', 0, -0.07 * s, 0);
    }
    if (this.floatMode) {
      add('leftUpperArm', 0, Math.sin(time * 0.6) * 0.12, Math.sin(time * 0.45) * 0.1);
      add('rightUpperArm', 0, Math.sin(time * 0.55 + 1) * 0.12, -Math.sin(time * 0.5 + 2) * 0.1);
      add('leftUpperLeg', Math.sin(time * 0.4) * 0.08, 0, 0);
      add('rightUpperLeg', Math.sin(time * 0.43 + 1.4) * 0.08, 0, 0);
      add('head', Math.sin(time * 0.3) * 0.05, Math.sin(time * 0.2) * 0.08, 0);
    }
    if (this.shiver > 0) {
      const j = this.shiver * 0.02;
      add('chest', Math.sin(time * 41) * j, 0, Math.sin(time * 37) * j);
      add('leftUpperArm', 0, 0, Math.sin(time * 43) * j);
      add('rightUpperArm', 0, 0, Math.sin(time * 39) * j);
    }
    for (const [k, v] of Object.entries(this.extra)) add(k, v[0], v[1], v[2]);
    // head looks toward target
    if (this.lookTarget && this.bones.head && this.bones.chest && !this.floatMode) {
      const chest = this.bones.chest;
      chest.updateWorldMatrix(true, false);
      this.lookTarget.getWorldPosition(_v);
      chest.getWorldPosition(_v2);
      _v.sub(_v2);
      // into the character root space
      const root = this.vrm.scene;
      const inv = _q.copy(root.getWorldQuaternion(new THREE.Quaternion())).invert();
      _v.applyQuaternion(inv);
      let yaw = Math.atan2(_v.x, _v.z);
      let pitch = -Math.atan2(_v.y - 0.25, Math.hypot(_v.x, _v.z));
      if (Math.abs(yaw) > 1.6) { yaw = 0; pitch = 0; }
      yaw = THREE.MathUtils.clamp(yaw, -0.9, 0.9) * this.lookWeight;
      pitch = THREE.MathUtils.clamp(pitch, -0.5, 0.6) * this.lookWeight;
      add('neck', pitch * 0.4, yaw * 0.4, 0);
      add('head', pitch * 0.6, yaw * 0.6, 0);
    }
    return t;
  }

  update(dt) {
    this.time += dt;
    if (this.walking) this.walkPhase += dt * (5.2 * Math.max(0.6, this.walkSpeed));
    const target = this._target(dt);
    const k = 1 - Math.exp(-this.blendRate * dt);
    for (const [n, node] of Object.entries(this.bones)) {
      const e = target[n] || [0, 0, 0];
      _q.setFromEuler(_e.set(e[0], e[1], e[2]));
      node.quaternion.slerp(_q, k);
    }
    const hips = this.bones.hips;
    if (hips) {
      let y = 0;
      if (this.pose === 'sit') y = -0.42 * (this.vrmScaleHint || 1);
      if (this.walking) y += Math.abs(Math.cos(this.walkPhase)) * 0.025 - 0.02;
      if (this.floatMode) y += Math.sin(this.time * 0.7) * 0.04;
      this.hipsOffset.y = damp(this.hipsOffset.y, y, 6, dt);
      hips.position.copy(this.hipsRest).add(this.hipsOffset);
    }
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
  talk(seconds) { this.talkUntil = Math.max(this.talkUntil, this.time + seconds); }
  stopTalking() { this.talkUntil = 0; }

  update(dt) {
    if (!this.em) return;
    this.time += dt;
    const tgt = {};
    for (const e of EMOTIONS) tgt[e] = this.base[e] || 0;
    this.timed = this.timed.filter((t) => t.until > this.time);
    for (const t of this.timed) {
      for (const e of EMOTIONS) if (e !== t.name) tgt[e] *= 0.3;
      tgt[t.name] = Math.max(tgt[t.name] || 0, t.w);
    }
    // blinking
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkV = 1; this.blinkT = 2 + Math.random() * 4; }
    this.blinkV = Math.max(0, this.blinkV - dt * 7);
    const blinkCurve = this.blinkV > 0 ? Math.sin(this.blinkV * Math.PI) : 0;
    let blink = Math.max(blinkCurve, this.eyesClosed, this.squint * 0.55);
    // talking mouth
    let mouth = 0;
    if (this.time < this.talkUntil) {
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
