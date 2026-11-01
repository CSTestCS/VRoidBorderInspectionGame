// Read and override which blend shapes each VRM expression drives.
import { VRMExpressionMorphTargetBind } from 'three-vrm';

export function faceMorphMeshes(vrm) {
  const meshes = [];
  vrm.scene.traverse((o) => { if (o.isMesh && o.morphTargetDictionary && Object.keys(o.morphTargetDictionary).length) meshes.push(o); });
  return meshes;
}

export function morphNames(vrm) {
  const names = new Set();
  for (const m of faceMorphMeshes(vrm)) for (const n of Object.keys(m.morphTargetDictionary)) names.add(n);
  return [...names];
}

export function expressionNames(vrm) {
  return (vrm.expressionManager?.expressions || []).map((e) => e.expressionName);
}

// { morphName: weight } currently bound to an expression
export function readBinds(vrm, exprName) {
  const e = vrm.expressionManager?.getExpression(exprName);
  const out = {};
  if (!e) return out;
  for (const b of e.binds) {
    if (!(b instanceof VRMExpressionMorphTargetBind) || !b.primitives?.length) continue;
    const dict = b.primitives[0].morphTargetDictionary || {};
    const name = Object.keys(dict).find((k) => dict[k] === b.index);
    if (name) out[name] = Math.max(out[name] || 0, b.weight);
  }
  return out;
}

export function writeBinds(vrm, exprName, weights) {
  const e = vrm.expressionManager?.getExpression(exprName);
  if (!e) return;
  for (const b of [...e.binds]) {
    if (!(b instanceof VRMExpressionMorphTargetBind)) continue;
    b.clearAppliedWeight();
    e.deleteBind(b);
  }
  const meshes = faceMorphMeshes(vrm);
  for (const [name, w] of Object.entries(weights)) {
    if (!(w > 0)) continue;
    const byIndex = new Map();
    for (const m of meshes) {
      const i = m.morphTargetDictionary[name];
      if (i === undefined) continue;
      if (!byIndex.has(i)) byIndex.set(i, []);
      byIndex.get(i).push(m);
    }
    for (const [index, primitives] of byIndex) e.addBind(new VRMExpressionMorphTargetBind({ primitives, index, weight: w }));
  }
}

export function applyExpressionConfig(vrm, exprCfg) {
  if (!exprCfg) return;
  for (const [name, weights] of Object.entries(exprCfg)) writeBinds(vrm, name, weights);
}
