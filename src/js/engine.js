// Renderer, post-processing and frame loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { GLOBAL_UNIFORMS } from './vrm/materials.js';

THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 0.35 }, fade: { value: 0 }, grain: { value: 0.035 }, time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float amount; uniform float fade; uniform float grain; uniform float time; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - amount * smoothstep(0.35, 0.85, d);
      c.rgb += (h(vUv * 913.0) - 0.5) * grain;
      c.rgb *= 1.0 - fade;
      gl_FragColor = c;
    }`,
};

export class Engine {
  constructor(container, settings = {}) {
    this.settings = { quality: 'high', ...settings };
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!settings.preserve });
    r.setPixelRatio(Math.min(window.devicePixelRatio, this.settings.quality === 'low' ? 1 : 1.5));
    r.setSize(container.clientWidth, container.clientHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);
    this.renderer = r;
    this.container = container;
    RectAreaLightUniformsLib.init();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050607);
    this.camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.03, 200);
    this.scene.add(this.camera);
    const pmrem = new THREE.PMREMGenerator(r);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.35;

    this.composer = new EffectComposer(r);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.35, 0.5, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.vignette = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignette);

    this.clock = new THREE.Clock();
    this.updaters = new Set();
    this.running = false;
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.applyQuality();
  }

  applyQuality() {
    const q = this.settings.quality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'low' ? 0.85 : q === 'medium' ? 1 : 1.5));
    this.bloom.enabled = q !== 'low';
    this.renderer.shadowMap.type = q === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.resize();
  }

  setScene(scene) {
    this.scene = scene;
    this.renderPass.scene = scene;
    if (!scene.environment) scene.environment = this.envMap;
    if (!this.camera.parent) scene.add(this.camera);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  add(fn) { this.updaters.add(fn); return () => this.updaters.delete(fn); }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }
  stop() { this.running = false; }

  frame(forceDt) {
    const dt = forceDt ?? Math.min(0.05, this.clock.getDelta());
    GLOBAL_UNIFORMS.hvTime.value += dt;
    this.vignette.uniforms.time.value += dt;
    for (const fn of [...this.updaters]) fn(dt);
    this.composer.render(dt);
  }

  set fade(v) { this.vignette.uniforms.fade.value = v; }
  get fade() { return this.vignette.uniforms.fade.value; }
}
