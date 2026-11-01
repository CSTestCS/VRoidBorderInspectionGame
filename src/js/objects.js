// Pocket objects: weapons, unknown substances and harmless belongings, with
// procedural 3D models shown during pocket searches.
import * as THREE from 'three';

export const OBJECTS = {
  // undesirable - must be confiscated
  knife: { label: 'Knife', bad: true, kind: 'weapon', claim: ["It's for cutting rope. Honest.", "Everyone carries one out there.", 'For protection.'] },
  pistol: { label: 'Pistol', bad: true, kind: 'weapon', claim: ["It's not even loaded!", 'I need it out there.', 'Raiders. You understand.'] },
  knuckles: { label: 'Knuckle duster', bad: true, kind: 'weapon', claim: ["It's just... a trinket.", 'For self defence.'] },
  shiv: { label: 'Improvised blade', bad: true, kind: 'weapon', claim: ['That? Just scrap metal.', "Found it. Didn't think about it."] },
  vial: { label: 'Unlabelled vial (glowing)', bad: true, kind: 'substance', claim: ["It's medicine.", 'Just... water.', "A trader gave it to me. I don't know."] },
  powder: { label: 'Bag of unknown powder', bad: true, kind: 'substance', claim: ['Spices.', "It's salt. Just salt.", "Er... it's for headaches."] },
  pills: { label: 'Unmarked pills', bad: true, kind: 'substance', claim: ['For my nerves.', "Vitamins, that's all.", "I don't remember."] },
  syringe: { label: 'Filled syringe', bad: true, kind: 'substance', claim: ["It's insulin. Probably.", 'Medicine.', "Please, I need that."] },
  // harmless - return to visitor
  keys: { label: 'Ring of keys', bad: false, kind: 'benign', claim: ["Keys to a house that isn't there anymore.", 'Just my keys.'] },
  photo: { label: 'Old photograph', bad: false, kind: 'benign', claim: ['My family. Please be careful with it.', "That's my daughter."] },
  ration: { label: 'Ration bar', bad: false, kind: 'benign', claim: ['My last meal.', "It's just food."] },
  can: { label: 'Canned beans', bad: false, kind: 'benign', claim: ['Dinner.', 'I was saving that.'] },
  coins: { label: 'Coin pouch', bad: false, kind: 'benign', claim: ['All my savings.', 'Barter money.'] },
  compass: { label: 'Compass', bad: false, kind: 'benign', claim: ['Got me here.', 'My father\'s compass.'] },
  tablets: { label: 'Water purification tablets (labelled)', bad: false, kind: 'benign', claim: ['For water. Read the label.', 'Purification tablets.'] },
  bandage: { label: 'Bandage roll', bad: false, kind: 'benign', claim: ['First aid.', 'Just bandages.'] },
  toy: { label: 'Small toy', bad: false, kind: 'benign', claim: ["It was my son's.", 'A good luck charm.'] },
  letter: { label: 'Folded letter', bad: false, kind: 'benign', claim: ['A letter from my sister. She lives inside.', 'Private. Please.'] },
};
export const WEAPONS = ['knife', 'pistol', 'knuckles', 'shiv'];
export const SUBSTANCES = ['vial', 'powder', 'pills', 'syringe'];
export const BENIGN = ['keys', 'photo', 'ration', 'can', 'coins', 'compass', 'tablets', 'bandage', 'toy', 'letter'];

function labelTex(lines, bg = '#e8e0c8', fg = '#222', w = 256, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = 'bold 26px Arial'; g.textAlign = 'center';
  lines.forEach((l, i) => g.fillText(l, w / 2, 40 + i * 32));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const metal = () => new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.95, roughness: 0.28 });
const dark = (c = 0x1b1b1d) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.4, roughness: 0.55 });
const mat = (c, r = 0.6, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });

export function buildObject(type) {
  const g = new THREE.Group();
  const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  switch (type) {
    case 'knife': {
      const blade = new THREE.Shape(); blade.moveTo(0, 0); blade.lineTo(0.12, 0.005); blade.lineTo(0.14, 0.018); blade.lineTo(0, 0.025); blade.lineTo(0, 0);
      add(new THREE.ExtrudeGeometry(blade, { depth: 0.003, bevelEnabled: false }), metal(), 0, -0.012, -0.0015);
      add(new THREE.BoxGeometry(0.1, 0.022, 0.016), mat(0x3b2416, 0.7), -0.05, 0.0, 0);
      break;
    }
    case 'pistol':
      add(new THREE.BoxGeometry(0.16, 0.035, 0.028), dark(), 0.02, 0.03, 0);
      add(new THREE.BoxGeometry(0.035, 0.09, 0.026), dark(0x262626), -0.035, -0.02, 0, 0, 0, -0.2);
      add(new THREE.CylinderGeometry(0.007, 0.007, 0.03), dark(), 0.1, 0.03, 0, 0, 0, Math.PI / 2);
      add(new THREE.TorusGeometry(0.014, 0.003, 6, 12, Math.PI), dark(), 0.0, 0.002, 0, 0, 0, Math.PI);
      break;
    case 'knuckles':
      for (let i = 0; i < 4; i++) add(new THREE.TorusGeometry(0.012, 0.004, 8, 16), metal(), -0.036 + i * 0.024, 0.01, 0);
      add(new THREE.BoxGeometry(0.1, 0.018, 0.012), metal(), 0, -0.012, 0);
      break;
    case 'shiv':
      add(new THREE.ConeGeometry(0.008, 0.12, 4), mat(0x8a8f95, 0.4, 0.8), 0.06, 0, 0, 0, 0, -Math.PI / 2);
      add(new THREE.CylinderGeometry(0.01, 0.01, 0.07, 8), mat(0x5c4a3a, 0.9), -0.03, 0, 0, 0, 0, Math.PI / 2);
      break;
    case 'vial':
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 16), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.9, roughness: 0.05, transparent: true, opacity: 0.4 }));
      add(new THREE.CylinderGeometry(0.0105, 0.0105, 0.045, 16), new THREE.MeshStandardMaterial({ color: 0x6aff4a, emissive: 0x3aff2a, emissiveIntensity: 1.6 }), 0, -0.01, 0);
      add(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 16), mat(0x222222), 0, 0.04, 0);
      break;
    case 'powder':
      add(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshPhysicalMaterial({ color: 0xf2efe6, roughness: 0.8, transmission: 0.2, transparent: true, opacity: 0.9 }), 0, 0, 0).scale.set(1.3, 0.7, 1);
      add(new THREE.CylinderGeometry(0.004, 0.006, 0.02), mat(0x222222), 0, 0.03, 0);
      break;
    case 'pills':
      add(new THREE.CylinderGeometry(0.018, 0.018, 0.055, 20), new THREE.MeshPhysicalMaterial({ color: 0xc87a2a, transmission: 0.4, roughness: 0.2, transparent: true, opacity: 0.85 }));
      add(new THREE.CylinderGeometry(0.019, 0.019, 0.014, 20), mat(0xeeeeee, 0.5), 0, 0.034, 0);
      break;
    case 'syringe':
      add(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 12), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.8, transparent: true, opacity: 0.5, roughness: 0.1 }), 0, 0, 0, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.0052, 0.0052, 0.05, 12), new THREE.MeshStandardMaterial({ color: 0x8a2be2, emissive: 0x4a0a8a, emissiveIntensity: 0.6 }), 0.01, 0, 0, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.0006, 0.0006, 0.03), metal(), 0.055, 0, 0, 0, 0, Math.PI / 2);
      break;
    case 'keys':
      add(new THREE.TorusGeometry(0.018, 0.0018, 8, 24), metal());
      for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.045, 0.01, 0.002), mat(i ? 0xb08d57 : 0xa0a4a8, 0.35, 0.9), 0.03 + i * 0.002, -0.012 - i * 0.008, 0, 0, 0, -0.5 - i * 0.4);
      break;
    case 'photo': {
      const c = document.createElement('canvas'); c.width = 256; c.height = 180;
      const x = c.getContext('2d'); x.fillStyle = '#e9e1cc'; x.fillRect(0, 0, 256, 180); x.fillStyle = '#7d6f5a'; x.fillRect(14, 14, 228, 152);
      x.fillStyle = '#3d342a'; [[70, 80], [128, 70], [186, 86]].forEach(([px, py]) => { x.beginPath(); x.arc(px, py, 16, 0, 6.3); x.fill(); x.fillRect(px - 20, py + 18, 40, 60); });
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      add(new THREE.BoxGeometry(0.1, 0.07, 0.001), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
      break;
    }
    case 'ration':
      add(new THREE.BoxGeometry(0.1, 0.035, 0.018), new THREE.MeshStandardMaterial({ map: labelTex(['RATION', 'EMERGENCY'], '#6b6e3a', '#e8e2b0'), roughness: 0.6 }));
      break;
    case 'can':
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 24), new THREE.MeshStandardMaterial({ map: labelTex(['BEANS', '400g'], '#a13d24', '#f3e7c4'), metalness: 0.3, roughness: 0.5 }));
      break;
    case 'coins':
      add(new THREE.SphereGeometry(0.035, 16, 12), mat(0x6b4a2b, 0.9), 0, 0, 0).scale.set(1, 0.8, 0.9);
      for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.01, 0.01, 0.002, 16), mat(0xc9a64b, 0.3, 1), 0.04 + i * 0.012, -0.02, 0.01 * i, 0.3, 0, 0);
      break;
    case 'compass':
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.01, 32), mat(0xb08d57, 0.3, 0.9), 0, 0, 0, Math.PI / 2, 0, 0);
      add(new THREE.CircleGeometry(0.021, 32), mat(0xf0ead8, 0.5), 0, 0, 0.0055);
      add(new THREE.BoxGeometry(0.003, 0.03, 0.001), mat(0xcc2222, 0.4), 0, 0, 0.0065, 0, 0, 0.6);
      break;
    case 'tablets':
      add(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 20), new THREE.MeshStandardMaterial({ map: labelTex(['WATER', 'PURIFICATION', 'TABLETS'], '#f4f4f4', '#1a4fa0'), roughness: 0.5 }));
      break;
    case 'bandage':
      add(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 24), mat(0xf0ece2, 0.95), 0, 0, 0, Math.PI / 2, 0, 0);
      break;
    case 'toy':
      add(new THREE.SphereGeometry(0.025, 16, 12), mat(0x8a5a32, 0.95), 0, 0, 0);
      add(new THREE.SphereGeometry(0.018, 16, 12), mat(0x8a5a32, 0.95), 0, 0.035, 0);
      add(new THREE.SphereGeometry(0.007, 8, 8), mat(0x8a5a32, 0.95), -0.012, 0.05, 0);
      add(new THREE.SphereGeometry(0.007, 8, 8), mat(0x8a5a32, 0.95), 0.012, 0.05, 0);
      break;
    case 'letter':
      add(new THREE.BoxGeometry(0.09, 0.06, 0.003), new THREE.MeshStandardMaterial({ map: labelTex(['~~~~~~~~', '~~~~~~', '~~~~~~~~'], '#efe6cf', '#3a3a5a'), roughness: 0.8 }));
      break;
    default:
      add(new THREE.BoxGeometry(0.05, 0.05, 0.05), mat(0x888888));
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
