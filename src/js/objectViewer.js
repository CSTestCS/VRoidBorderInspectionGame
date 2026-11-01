// Small dedicated 3D viewer for objects found while searching clothing.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildObject } from './objects.js';

export class ObjectViewer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'object-view';
    this.canvas.width = 840; this.canvas.height = 600;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(840, 600, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(1, 2, 2); this.scene.add(key);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    this.camera = new THREE.PerspectiveCamera(30, 840 / 600, 0.01, 10);
    this.camera.position.set(0, 0.05, 0.38);
    this.camera.lookAt(0, 0, 0);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.rx = 0.3; this.ry = 0;
    let drag = null;
    this.canvas.addEventListener('mousedown', (e) => { drag = [e.clientX, e.clientY]; });
    window.addEventListener('mouseup', () => (drag = null));
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      this.ry += (e.clientX - drag[0]) * 0.01; this.rx += (e.clientY - drag[1]) * 0.01;
      drag = [e.clientX, e.clientY]; this.spin = false;
    });
  }
  show(type) {
    this.holder.clear();
    const o = buildObject(type);
    const box = new THREE.Box3().setFromObject(o);
    const size = box.getSize(new THREE.Vector3()).length();
    const c = box.getCenter(new THREE.Vector3());
    o.position.sub(c);
    this.holder.scale.setScalar(0.16 / Math.max(0.01, size));
    this.holder.add(o);
    this.spin = true;
    this.rx = 0.3; this.ry = 0;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      if (this.spin) this.ry += 0.01;
      this.holder.rotation.set(this.rx, this.ry, 0);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
    return this.canvas;
  }
  hide() { this.running = false; }
  dispose() { this.running = false; this.renderer.dispose(); }
}
