// Renders ID-card portraits (head and shoulders, no conditions, no dirt) with a
// small dedicated renderer so it never disturbs the main view.
import * as THREE from 'three';
import { Character } from './vrm/character.js';

let renderer = null;
const W = 300, H = 380;

function getRenderer() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.setSize(W, H, false);
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  return renderer;
}

export async function renderPortrait(modelsById, portraitSpec) {
  const M = modelsById[portraitSpec.modelId];
  const look = { ...portraitSpec.look, scale: 1 };
  const ch = await Character.create(M.entry, M.cfg, look, { fx: false, lowRes: true });
  ch.setLayers({ cond: 0, fx: 0 });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fb0bd);
  scene.add(ch.root);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(0.6, 1.8, 2); scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.8); fill.position.set(-1.5, 1.2, 1); scene.add(fill);
  for (let i = 0; i < 45; i++) ch.update(1 / 30);
  const head = ch.boneWorld('head');
  const cam = new THREE.PerspectiveCamera(24, W / H, 0.05, 10);
  cam.position.set(head.x, head.y + 0.0, head.z + 0.95);
  cam.lookAt(head.x, head.y - 0.03, head.z);
  const r = getRenderer();
  r.render(scene, cam);
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  out.getContext('2d').drawImage(r.domElement, 0, 0);
  ch.dispose();
  return out;
}
