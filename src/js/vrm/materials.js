// Semi-realistic replacement materials for VRoid characters plus the custom
// shader layers used by the game (skin fx, underwear, conditions, contamination,
// UV-light fluorescence).
import * as THREE from 'three';
import { scaledFabricTextures } from './fabricTextures.js';

// Uniforms shared by every patched material (UV flashlight state etc).
export const GLOBAL_UNIFORMS = {
  hvUvOn: { value: 0 },
  hvUvPos: { value: new THREE.Vector3() },
  hvUvDir: { value: new THREE.Vector3(0, 0, -1) },
  hvUvCos: { value: Math.cos(0.32) },
  hvTime: { value: 0 },
};

const blankTex = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  t.needsUpdate = true;
  return t;
})();
export const BLANK_TEXTURE = blankTex;

const NOISE_GLSL = /* glsl */ `
float hvHash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float hvNoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hvHash(i),hvHash(i+vec2(1,0)),f.x), mix(hvHash(i+vec2(0,1)),hvHash(i+vec2(1,1)),f.x), f.y); }
`;

function addGlowUniforms(u) {
  Object.assign(u, GLOBAL_UNIFORMS);
  u.hvGlowColor = u.hvGlowColor || { value: new THREE.Color(0.35, 1.0, 0.45) };
}

// kind: 'skin' | 'hair' | 'cloth' | 'card' | 'plain'
export function patchMaterial(material, kind, uniforms) {
  const u = uniforms;
  addGlowUniforms(u);
  material.userData.hv = u;
  material.userData.hvKind = kind;
  material.customProgramCacheKey = () => 'hv-' + kind + (u.hvUw ? '-uw' : '');
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHvWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvHvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');

    let decl = `
varying vec3 vHvWorld;
uniform float hvUvOn; uniform vec3 hvUvPos; uniform vec3 hvUvDir; uniform float hvUvCos; uniform float hvTime;
uniform vec3 hvGlowColor;
${NOISE_GLSL}
float hvUvSpot(){
  vec3 d = vHvWorld - hvUvPos; float dist = length(d);
  float c = dot(d / max(dist, 1e-4), hvUvDir);
  return hvUvOn * smoothstep(hvUvCos, hvUvCos + 0.06, c) / (1.0 + dist * dist * 0.25);
}
`;
    let colorCode = '';
    let roughCode = '';
    let emissiveCode = '';
    let lightCode = '';

    if (kind === 'skin') {
      decl += `
uniform sampler2D hvFx; uniform sampler2D hvCond; uniform sampler2D hvGlow;
uniform float hvFxOn; uniform float hvCondOn; uniform vec3 hvMakeup; uniform float hvWetAll;
${u.hvUw ? 'uniform sampler2D hvUw; uniform float hvUwOn;' : ''}
`;
      colorCode = `
  vec2 hvUv = vMapUv;
  float hvTexL = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  vec4 hvC = texture2D(hvCond, hvUv) * hvCondOn;
  diffuseColor.rgb = mix(diffuseColor.rgb, hvC.rgb * mix(1.0, hvTexL, 0.5), hvC.a);
  vec4 hvF = texture2D(hvFx, hvUv);
  hvF.rgb *= hvFxOn;
  float hvWet = max(hvF.a, hvWetAll);
  diffuseColor.rgb = mix(diffuseColor.rgb, hvMakeup * mix(1.0, hvTexL, 0.7), clamp(hvF.b * 1.15, 0.0, 1.0));
  float hvUwMask = 0.0;
  ${u.hvUw ? `
  vec4 hvU = texture2D(hvUw, hvUv) * hvUwOn;
  float hvUL = dot(hvU.rgb, vec3(0.299, 0.587, 0.114));
  float hvSheer = smoothstep(0.38, 0.82, hvUL);
  float hvUA = hvU.a * (1.0 - hvWet * hvSheer * 0.78);
  vec3 hvUC = hvU.rgb * (1.0 - hvWet * (1.0 - hvSheer) * 0.42) * mix(1.0, hvTexL, 0.55);
  diffuseColor.rgb = mix(diffuseColor.rgb, hvUC, hvUA);
  hvUwMask = hvU.a;` : ''}
  float hvN = hvNoise(hvUv * 420.0) * 0.6 + hvNoise(hvUv * 90.0) * 0.4;
  vec3 hvDirtC = mix(vec3(0.26, 0.2, 0.14), vec3(0.11, 0.09, 0.07), hvN);
  diffuseColor.rgb = mix(diffuseColor.rgb, hvDirtC, clamp(hvF.r * (0.7 + 0.6 * hvN), 0.0, 1.0));
  vec3 hvBloodC = mix(vec3(0.36, 0.025, 0.02), vec3(0.16, 0.01, 0.01), hvN);
  diffuseColor.rgb = mix(diffuseColor.rgb, hvBloodC, clamp(hvF.g * 1.1, 0.0, 1.0));
  diffuseColor.rgb *= 1.0 - hvWet * 0.1;
`;
      roughCode = `
  roughnessFactor = mix(roughnessFactor, 0.28, hvWet);
  roughnessFactor = mix(roughnessFactor, 0.85, clamp(hvF.r, 0.0, 1.0) * (1.0 - hvWet));
`;
      emissiveCode = `
  totalEmissiveRadiance += hvGlowColor * texture2D(hvGlow, vMapUv).r * hvUvSpot() * 3.0;
`;
      lightCode = `
  #ifdef USE_CLEARCOAT
  material.clearcoat = hvWet * 0.6;
  material.clearcoatRoughness = 0.12;
  #endif
`;
    } else if (kind === 'hair') {
      decl += 'uniform float hvHairWet;';
      colorCode = 'diffuseColor.rgb *= 1.0 - hvHairWet * 0.38;';
      roughCode = 'roughnessFactor = mix(roughnessFactor, 0.22, hvHairWet);';
    } else if (kind === 'cloth') {
      decl += 'uniform sampler2D hvOverlay; uniform sampler2D hvGlow; uniform float hvOverlayOn; uniform float hvHighlight;';
      colorCode = `
  #ifdef USE_NORMALMAP
  diffuseColor.rgb *= 0.86 + 0.28 * texture2D(normalMap, vNormalMapUv).a;
  #endif
  vec4 hvO = texture2D(hvOverlay, vMapUv) * hvOverlayOn;
  diffuseColor.rgb = mix(diffuseColor.rgb, hvO.rgb, hvO.a);
`;
      roughCode = 'roughnessFactor = mix(roughnessFactor, 0.35, step(0.5, hvO.a) * hvO.a * 0.6);';
      emissiveCode = `
  totalEmissiveRadiance += hvGlowColor * texture2D(hvGlow, vMapUv).r * hvUvSpot() * 3.0 * hvOverlayOn;
  totalEmissiveRadiance += vec3(0.25, 0.55, 0.9) * hvHighlight * (0.55 + 0.45 * sin(hvTime * 6.0));
`;
    } else if (kind === 'iris') {
      decl += 'uniform vec2 hvEyeC0; uniform vec2 hvEyeC1; uniform vec2 hvEyeR0; uniform vec2 hvEyeR1; uniform float hvPupil;';
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
  #ifdef USE_MAP
  vec2 hvUvI = vMapUv;
  vec2 hvD0 = (hvUvI - hvEyeC0) / hvEyeR0; vec2 hvD1 = (hvUvI - hvEyeC1) / hvEyeR1;
  vec2 hvC = hvEyeC0; vec2 hvR = hvEyeR0; vec2 hvD = hvD0;
  if (dot(hvD1, hvD1) < dot(hvD0, hvD0)) { hvC = hvEyeC1; hvR = hvEyeR1; hvD = hvD1; }
  float hvRr = length(hvD);
  // pupil size: exponent < 1 pulls iris texture inward (constricted pupil)
  if (hvRr < 1.0 && hvRr > 1e-4) hvUvI = hvC + hvD / hvRr * pow(hvRr, hvPupil) * hvR;
  vec4 sampledDiffuseColor = texture2D(map, hvUvI);
  diffuseColor *= sampledDiffuseColor;
  #endif
`);
    } else if (kind === 'card') {
      decl += 'uniform sampler2D hvGlow;';
      emissiveCode = 'totalEmissiveRadiance += hvGlowColor * texture2D(hvGlow, vMapUv).r * hvUvSpot() * 2.5;';
    }

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + decl)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + colorCode)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + roughCode)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + emissiveCode)
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + lightCode);
  };
  material.needsUpdate = true;
  return material;
}

function readMToon(src) {
  const g = (k) => (src[k] !== undefined ? src[k] : src.uniforms?.[k]?.value);
  return {
    map: g('map') || null,
    normalMap: g('normalMap') || null,
    color: (g('color') || new THREE.Color(1, 1, 1)).clone?.() || new THREE.Color(1, 1, 1),
    transparent: !!src.transparent,
    alphaTest: src.alphaTest || 0,
    side: src.side ?? THREE.FrontSide,
    depthWrite: src.depthWrite !== false,
    name: (src.name || '').replace(/\s*\(Instance\)\s*/g, '').trim(),
  };
}

export function roleFromName(name) {
  if (/EyeHighlight/i.test(name)) return 'eyeHighlight';
  if (/EyeWhite/i.test(name)) return 'eyeWhite';
  if (/EyeIris/i.test(name)) return 'eyeIris';
  if (/EyeExtra/i.test(name)) return 'eyeHighlight';
  if (/_SKIN/i.test(name) && /Face/i.test(name)) return 'faceSkin';
  if (/_SKIN/i.test(name)) return 'bodySkin';
  if (/_FACE/i.test(name) || /Face(Mouth|Brow|Eyeline|Eyelash)/i.test(name)) return 'faceDetail';
  if (/_HAIR/i.test(name) || /Hair/i.test(name)) return 'hair';
  if (/_CLOTH/i.test(name) || /(Tops|Bottoms|Shoes|Onepiece|Accessory|Socks)/i.test(name)) return 'cloth';
  return 'other';
}

// Build a fresh physically based material for the given role.
export function convertMaterial(src, role) {
  const p = readMToon(src);
  const base = {
    name: p.name,
    map: p.map,
    color: new THREE.Color(1, 1, 1),
    transparent: p.transparent,
    alphaTest: p.alphaTest,
    side: p.side,
    depthWrite: p.depthWrite,
  };
  let m;
  switch (role) {
    case 'bodySkin':
    case 'faceSkin':
      m = new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.58, metalness: 0, sheen: 0.2, sheenRoughness: 0.6, sheenColor: new THREE.Color(0.9, 0.45, 0.4), clearcoat: 0.01, clearcoatRoughness: 0.2 });
      m.side = THREE.FrontSide;
      break;
    case 'hair':
      m = new THREE.MeshPhysicalMaterial({ ...base, normalMap: p.normalMap, roughness: 0.58, metalness: 0, sheen: 0.12, sheenRoughness: 0.5, sheenColor: new THREE.Color(1, 1, 1), specularIntensity: 0.6 });
      m.side = THREE.DoubleSide;
      break;
    case 'eyeIris':
      m = new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03 });
      break;
    case 'eyeWhite':
      m = new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.05 });
      break;
    case 'eyeHighlight':
      m = new THREE.MeshBasicMaterial({ ...base, color: new THREE.Color(0.85, 0.85, 0.85), transparent: true, depthWrite: false });
      break;
    case 'faceDetail':
      m = new THREE.MeshStandardMaterial({ ...base, roughness: 0.6, metalness: 0 });
      break;
    case 'cloth':
      m = new THREE.MeshPhysicalMaterial({ ...base, normalMap: p.normalMap, roughness: 0.88, metalness: 0, sheen: 0.6, sheenRoughness: 0.8, sheenColor: new THREE.Color(1, 1, 1) });
      m.side = THREE.DoubleSide;
      break;
    default:
      m = new THREE.MeshStandardMaterial({ ...base, roughness: 0.7, metalness: 0 });
  }
  // double-sided surfaces self-shadow badly (striped "acne"); cast from back faces
  if (m.side === THREE.DoubleSide) m.shadowSide = THREE.BackSide;
  m.userData.role = role;
  m.userData.baseColor = p.color;
  return m;
}

// ---- clothing fabric presets -------------------------------------------------
export const FABRICS = [
  ['cotton', 'Soft cloth (cotton)'], ['knit', 'Knit / wool'], ['denim', 'Denim / canvas'], ['silk', 'Silk / satin'],
  ['sheer', 'Sheer cloth (see-through)'], ['leather', 'Leather'], ['latex', 'Latex / vinyl'], ['rubber', 'Rubber'],
  ['plastic', 'Plastic'], ['metal', 'Metal'], ['glass', 'Glass / clear lens'],
];
const P = {
  cotton: { roughness: 0.9, metalness: 0, sheen: 0.25, sheenRoughness: 0.75, clearcoat: 0, normal: 0.35, anisotropy: 0 },
  knit: { roughness: 0.95, metalness: 0, sheen: 0.35, sheenRoughness: 0.7, clearcoat: 0, normal: 1.0, anisotropy: 0 },
  denim: { roughness: 0.88, metalness: 0, sheen: 0.2, sheenRoughness: 0.7, clearcoat: 0, normal: 0.6, anisotropy: 0 },
  silk: { roughness: 0.32, metalness: 0, sheen: 0.6, sheenRoughness: 0.3, clearcoat: 0, normal: 0.25, anisotropy: 0.6 },
  sheer: { roughness: 0.6, metalness: 0, sheen: 0.35, sheenRoughness: 0.5, clearcoat: 0, normal: 0.2, anisotropy: 0, opacity: 0.42 },
  leather: { roughness: 0.48, metalness: 0, sheen: 0, sheenRoughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.45, normal: 0.5, anisotropy: 0 },
  latex: { roughness: 0.14, metalness: 0, sheen: 0, sheenRoughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05, normal: 0.15, anisotropy: 0 },
  rubber: { roughness: 0.7, metalness: 0, sheen: 0, sheenRoughness: 0.5, clearcoat: 0.1, clearcoatRoughness: 0.6, normal: 0.4, anisotropy: 0 },
  plastic: { roughness: 0.35, metalness: 0, sheen: 0, sheenRoughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.2, normal: 0.3, anisotropy: 0 },
  glass: { roughness: 0.04, metalness: 0, sheen: 0, sheenRoughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.02, normal: 0, anisotropy: 0, opacity: 0.16 },
  metal: { roughness: 0.3, metalness: 0.9, sheen: 0, sheenRoughness: 0.5, clearcoat: 0, normal: 0.4, anisotropy: 0.2 },
};
export function defaultFabric(category) {
  return { shoes: 'leather', socks: 'cotton', gloves: 'cotton', hat: 'cotton', outer: 'denim', bottom: 'cotton', top: 'cotton', onepiece: 'cotton', accessory: 'cotton' }[category] || 'cotton';
}
export function applyFabric(m, fabric) {
  const p = P[fabric] || P.cotton;
  m.roughness = p.roughness;
  m.metalness = p.metalness;
  m.sheen = p.sheen;
  m.sheenRoughness = p.sheenRoughness;
  m.clearcoat = p.clearcoat;
  m.clearcoatRoughness = p.clearcoatRoughness ?? 0.2;
  m.anisotropy = p.anisotropy;
  const ft = scaledFabricTextures(fabric, m.userData.uvDensity);
  m.normalMap = ft.flat ? null : ft.normal;
  m.roughnessMap = ft.flat ? null : ft.rough;
  if (m.normalScale) m.normalScale.setScalar(ft.flat ? 1 : 0.9);
  const sheer = p.opacity != null;
  if (m.userData.baseAlphaTest === undefined) m.userData.baseAlphaTest = m.alphaTest;
  m.transparent = sheer;
  m.opacity = sheer ? p.opacity : 1;
  m.depthWrite = !sheer;
  m.alphaTest = sheer ? 0.02 : m.userData.baseAlphaTest;
  m.userData.fabric = fabric;
  m.needsUpdate = true;
}
