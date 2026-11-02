// Converts a Mixamo FBX clip into VRM normalized-bone tracks (JSON).
// usage: node tools/convert-mixamo.mjs in.fbx out.json
import fs from 'fs';
globalThis.self = globalThis; globalThis.window = globalThis;
const THREE = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');

const MAP = {
  Hips: 'hips', Spine: 'spine', Spine1: 'chest', Spine2: 'upperChest', Neck: 'neck', Head: 'head',
  LeftShoulder: 'leftShoulder', LeftArm: 'leftUpperArm', LeftForeArm: 'leftLowerArm', LeftHand: 'leftHand',
  RightShoulder: 'rightShoulder', RightArm: 'rightUpperArm', RightForeArm: 'rightLowerArm', RightHand: 'rightHand',
  LeftUpLeg: 'leftUpperLeg', LeftLeg: 'leftLowerLeg', LeftFoot: 'leftFoot', LeftToeBase: 'leftToes',
  RightUpLeg: 'rightUpperLeg', RightLeg: 'rightLowerLeg', RightFoot: 'rightFoot', RightToeBase: 'rightToes',
};
for (const s of ['Left', 'Right']) {
  const p = s.toLowerCase();
  Object.assign(MAP, { [s + 'HandThumb1']: p + 'ThumbMetacarpal', [s + 'HandThumb2']: p + 'ThumbProximal', [s + 'HandThumb3']: p + 'ThumbDistal' });
  for (const [m, v] of [['Index', 'Index'], ['Middle', 'Middle'], ['Ring', 'Ring'], ['Pinky', 'Little']])
    Object.assign(MAP, { [s + 'Hand' + m + '1']: p + v + 'Proximal', [s + 'Hand' + m + '2']: p + v + 'Intermediate', [s + 'Hand' + m + '3']: p + v + 'Distal' });
}

const buf = fs.readFileSync(process.argv[2]);
const asset = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
const clip = asset.animations[0];
asset.updateMatrixWorld(true);
const hipsNode = asset.getObjectByName('mixamorigHips');
const hipsH = hipsNode.getWorldPosition(new THREE.Vector3()).y;
const fps = 30, N = Math.round(clip.duration * fps);
const out = { duration: clip.duration, frames: N, bones: {}, hips: [] };

// sample the clip on the mixamo skeleton so we can read retargeted rotations + foot motion
const mixer = new THREE.AnimationMixer(asset);
const action = mixer.clipAction(clip); action.play();
const rest = {};
for (const [m, v] of Object.entries(MAP)) {
  const n = asset.getObjectByName('mixamorig' + m);
  if (!n) continue;
  rest[v] = { node: n, inv: n.getWorldQuaternion(new THREE.Quaternion()).invert(), parent: n.parent.getWorldQuaternion(new THREE.Quaternion()) };
  out.bones[v] = [];
}
const q = new THREE.Quaternion(), foot = { left: [], right: [] }, v3 = new THREE.Vector3();
for (let f = 0; f < N; f++) {
  mixer.setTime(f / fps);
  asset.updateMatrixWorld(true);
  for (const [v, r] of Object.entries(rest)) {
    q.copy(r.node.quaternion).premultiply(r.parent).multiply(r.inv);
    out.bones[v].push(...q.toArray().map((x) => +x.toFixed(4)));
  }
  const hp = hipsNode.position;
  out.hips.push(+(hp.x / hipsH).toFixed(4), +(hp.y / hipsH).toFixed(4), +(hp.z / hipsH).toFixed(4));
  for (const s of ['left', 'right']) { const n = asset.getObjectByName(`mixamorig${s === 'left' ? 'Left' : 'Right'}Foot`); n.getWorldPosition(v3); foot[s].push([v3.y, v3.z]); }
}
// ground speed: how fast a planted foot slides backward (in hip-heights per second)
let sum = 0, cnt = 0;
for (const s of ['left', 'right']) {
  const ys = foot[s].map((p) => p[0]), minY = Math.min(...ys);
  for (let f = 0; f < N; f++) {
    const a = foot[s][f], b = foot[s][(f + 1) % N];
    if (a[0] < minY + 2 && b[0] < minY + 2) { sum += (a[1] - b[1]) * fps; cnt++; }
  }
}
out.speed = +(sum / cnt / hipsH).toFixed(4);
fs.writeFileSync(process.argv[3], JSON.stringify(out));
console.log(process.argv[3], 'frames', N, 'bones', Object.keys(out.bones).length, 'speed(hip/s)', out.speed, 'hipsH', hipsH.toFixed(1));
