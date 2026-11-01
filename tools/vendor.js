// Copies the browser ES-module builds of the runtime libraries into src/vendor
// so the game runs straight from the source tree (no bundler needed).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const nm = path.join(root, 'node_modules');
const out = path.join(root, 'src', 'vendor');

function copy(src, dst) {
  const s = path.join(nm, src);
  const d = path.join(out, dst);
  fs.mkdirSync(path.dirname(d), { recursive: true });
  if (fs.statSync(s).isDirectory()) {
    for (const f of fs.readdirSync(s)) copy(path.join(src, f), path.join(dst, f));
  } else fs.copyFileSync(s, d);
}

fs.rmSync(out, { recursive: true, force: true });
copy('three/build/three.module.js', 'three/three.module.js');
copy('three/build/three.core.js', 'three/three.core.js');
copy('three/LICENSE', 'three/LICENSE');
for (const dir of ['postprocessing', 'shaders', 'utils', 'environments', 'lights']) {
  copy(`three/examples/jsm/${dir}`, `three/addons/${dir}`);
}
copy('three/examples/jsm/loaders/GLTFLoader.js', 'three/addons/loaders/GLTFLoader.js');
copy('three/examples/jsm/controls/OrbitControls.js', 'three/addons/controls/OrbitControls.js');
copy('three/examples/jsm/geometries/RoundedBoxGeometry.js', 'three/addons/geometries/RoundedBoxGeometry.js');
copy('@pixiv/three-vrm/lib/three-vrm.module.js', 'three-vrm/three-vrm.module.js');
copy('@pixiv/three-vrm/LICENSE', 'three-vrm/LICENSE');
copy('three-mesh-bvh/build/index.module.js', 'three-mesh-bvh/index.module.js');
copy('three-mesh-bvh/LICENSE', 'three-mesh-bvh/LICENSE');
console.log('vendored into', out);
