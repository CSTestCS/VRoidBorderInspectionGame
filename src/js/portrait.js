// ID-card portraits (head and shoulders, no conditions, no dirt).
// Rendered with the main renderer into a corner of the canvas and copied out in
// the same task, so no second WebGL context or extra model load is needed.
import * as THREE from 'three';
import { Character } from './vrm/character.js';
import { SCLERA } from './palettes.js';

const W = 300, H = 380;

// Compile shader variants one mesh at a time, yielding between them, so even
// GPUs/drivers without parallel shader compilation never stall a frame for long.
// `target`: the render target the real draws go to (e.g. the post-processing
// buffer), because tone mapping / colour space change the shader variant.
export async function compileGradually(renderer, root, camera, scene, target = null) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && o.visible !== false) meshes.push(o); });
  const seen = new Set();
  for (const m of meshes) {
    const key = m.material.uuid + (m.isSkinnedMesh ? 's' : 'n');
    if (seen.has(key)) continue;
    seen.add(key);
    const parent = m.parent;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    let p;
    try { p = renderer.compileAsync(m, camera, scene); } catch (e) { console.warn('compile', e); }
    renderer.setRenderTarget(prev);
    try { await p; } catch (e) { console.warn('compile', e); }
    if (parent && m.parent !== parent) parent.add(m);
    await new Promise((r) => setTimeout(r, 0));
  }
}
let studio = null;

function getStudio() {
  if (studio) return studio;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fb0bd);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(0.6, 1.8, 2); scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.8); fill.position.set(-1.5, 1.2, 1); scene.add(fill);
  const cam = new THREE.PerspectiveCamera(24, W / H, 0.05, 10);
  studio = { scene, cam };
  return studio;
}

function snap(engine, ch) {
  const { scene, cam } = getStudio();
  const r = engine.renderer;
  const parent = ch.root.parent;
  const pos = ch.root.position.clone(), rot = ch.root.rotation.y;
  scene.add(ch.root);
  ch.root.position.set(0, 0, 0); ch.root.rotation.y = 0;
  ch.root.updateMatrixWorld(true);
  const head = ch.boneWorld('head');
  cam.position.set(head.x, head.y, head.z + 0.95);
  cam.lookAt(head.x, head.y - 0.03, head.z);
  scene.environment = engine.envMap;
  const pr = r.getPixelRatio();
  const size = r.getSize(new THREE.Vector2());
  const prevTarget = r.getRenderTarget();
  r.setRenderTarget(null);
  r.setViewport(0, 0, W / pr, H / pr);
  r.setScissor(0, 0, W / pr, H / pr);
  r.setScissorTest(true);
  r.render(scene, cam);
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const c = r.domElement;
  out.getContext('2d').drawImage(c, 0, c.height - H, W, H, 0, 0, W, H);
  r.setScissorTest(false);
  r.setViewport(0, 0, size.x, size.y);
  r.setRenderTarget(prevTarget);
  // put the character back and redraw the normal frame before the browser presents
  scene.remove(ch.root);
  if (parent) parent.add(ch.root);
  ch.root.position.copy(pos); ch.root.rotation.y = rot;
  engine.composer.render(0);
  return out;
}

// Portrait from an already-built visitor (same model): temporarily show the
// pre-collapse look without conditions, dirt or wetness.
// The studio uses different lights than the facility, so its shader variants are
// compiled asynchronously before the (then cheap) render.
async function precompile(engine, ch) {
  const { scene, cam } = getStudio();
  scene.environment = engine.envMap;
  const parent = ch.root.parent;
  scene.add(ch.root);
  await compileGradually(engine.renderer, ch.root, cam, scene);
  scene.remove(ch.root);
  if (parent) parent.add(ch.root);
}

export async function renderPortraitFrom(engine, ch, portraitLook) {
  await precompile(engine, ch);
  const saved = { look: ch.look, pose: ch.animator.pose };
  ch.applyColors({ ...portraitLook, scale: ch.look.scale, sclera: SCLERA.normal });
  ch.setLayers({ cond: 0, fx: 0, overlay: 0 }); // pre-collapse photo: no dirt on skin or clothes
  const closed = ch.face.eyesClosed;
  ch.face.eyesClosed = 0;
  ch.animator.setPose('idle', true);
  ch.update(1 / 60);
  const img = snap(engine, ch);
  ch.applyColors(saved.look);
  ch.setLayers({ cond: 1, fx: 1, overlay: 1 });
  ch.face.eyesClosed = closed;
  ch.animator.setPose(saved.pose, true);
  return img;
}

// Portrait of a different model (false identity).
export async function renderPortrait(engine, modelsById, portraitSpec) {
  const M = modelsById[portraitSpec.modelId];
  const ch = await Character.create(M.entry, M.cfg, { ...portraitSpec.look, scale: 1 }, { fx: false, lowRes: true });
  ch.setLayers({ cond: 0, fx: 0 });
  for (let i = 0; i < 30; i++) ch.update(1 / 30);
  await precompile(engine, ch);
  const img = snap(engine, ch);
  ch.dispose();
  return img;
}
