// ID card rendering: front, back and the UV security layer.
import * as THREE from 'three';
import { RNG } from './util.js';

export const CARD_W = 1024, CARD_H = 640;

function cnv(w = CARD_W, h = CARD_H) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function fmtDate(s) {
  const [y, m, d] = s.split('-');
  const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][Number(m) - 1];
  return `${d} ${mon} ${y}`;
}
export { fmtDate };

export function drawCardFront(spec, portrait, stamp = null) {
  const c = cnv(); const g = c.getContext('2d');
  const card = spec.card;
  const rng = new RNG((spec.seed ^ 0xca2d) >>> 0);
  rr(g, 0, 0, CARD_W, CARD_H, 36); g.clip();
  const grad = g.createLinearGradient(0, 0, CARD_W, CARD_H);
  grad.addColorStop(0, '#dfe9e4'); grad.addColorStop(1, '#c9d8dd');
  g.fillStyle = grad; g.fillRect(0, 0, CARD_W, CARD_H);
  // guilloche
  g.strokeStyle = 'rgba(40,90,110,0.13)'; g.lineWidth = 1.2;
  for (let k = 0; k < 26; k++) { g.beginPath(); for (let x = 0; x <= CARD_W; x += 8) { const y = 120 + k * 20 + Math.sin(x * 0.02 + k * 0.6) * 14 + Math.sin(x * 0.007 + k) * 10; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  g.strokeStyle = 'rgba(120,60,90,0.08)';
  for (let k = 0; k < 12; k++) { g.beginPath(); g.arc(820, 420, 40 + k * 14, 0, Math.PI * 2); g.stroke(); }
  // header
  g.fillStyle = '#1d3b52'; g.fillRect(0, 0, CARD_W, 100);
  g.fillStyle = '#e8d9a0'; g.font = 'bold 40px "Segoe UI", Arial'; g.textAlign = 'left';
  g.fillText('FEDERATED CIVIC REGISTRY', 40, 52);
  g.font = '24px "Segoe UI", Arial'; g.fillStyle = '#c7d6e0';
  g.fillText('CITIZEN IDENTITY CARD  ·  CARTE D\'IDENTITÉ  ·  AUSWEIS', 40, 84);
  // emblem
  g.save(); g.translate(960, 50); g.strokeStyle = '#e8d9a0'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 32, 0, Math.PI * 2); g.stroke();
  star(g, 0, 0, 20, 9, 7); g.fillStyle = '#e8d9a0'; g.fill(); g.restore();
  // portrait
  g.fillStyle = '#8796a0'; g.fillRect(36, 124, 292, 370);
  if (portrait) {
    g.save(); g.filter = 'saturate(0.85) contrast(1.05)';
    g.drawImage(portrait, 40, 128, 284, 362);
    g.restore();
  }
  g.strokeStyle = '#2a3c48'; g.lineWidth = 3; g.strokeRect(40, 128, 284, 362);
  // fields
  const fields = [
    ['SURNAME / NOM', card.last.toUpperCase()],
    ['GIVEN NAMES / PRÉNOMS', card.first.toUpperCase()],
    ['SEX', card.sex === 'male' ? 'M' : 'F'], ['DATE OF BIRTH', fmtDate(card.dob)],
    ['HEIGHT', `${card.heightCm} cm`], ['EYES', card.eyeName.toUpperCase()],
    ['RESIDENCE', card.origin.toUpperCase()],
    ['CARD NO.', card.idNo], ['ISSUED', fmtDate(card.issued)],
  ];
  const pos = [[360, 140], [360, 210], [360, 280], [520, 280], [360, 350], [600, 350], [360, 420], [360, 490], [700, 490]];
  fields.forEach(([l, v], i) => {
    const [x, y] = pos[i];
    g.fillStyle = '#4b6070'; g.font = 'bold 17px "Segoe UI", Arial'; g.fillText(l, x, y);
    g.fillStyle = '#101820'; g.font = (i < 2 ? 'bold 38px' : 'bold 30px') + ' "Consolas", "Courier New", monospace';
    g.fillText(v, x, y + (i < 2 ? 40 : 34));
  });
  // signature
  g.strokeStyle = '#1d2a6a'; g.lineWidth = 2.5; g.beginPath();
  let sx = 380, sy = 590;
  g.moveTo(sx, sy);
  for (let k = 0; k < 14; k++) { sx += rng.float(12, 26); sy = 590 + rng.float(-18, 14); g.quadraticCurveTo(sx - 8, sy + rng.float(-20, 20), sx, sy); }
  g.stroke();
  g.fillStyle = '#4b6070'; g.font = '15px Arial'; g.fillText('HOLDER SIGNATURE', 380, 620);
  // machine readable strip
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(36, 520, 292, 96);
  g.fillStyle = '#26323a'; g.font = '19px "Consolas", monospace';
  const mrz = `ID<${card.idNo.replace(/-/g, '<')}<<<`;
  g.fillText(mrz.slice(0, 22), 46, 552); g.fillText(`${card.last.toUpperCase()}<<${card.first.toUpperCase()}<<<<<<`.slice(0, 22), 46, 580); g.fillText(card.dob.replace(/-/g, '') + (card.sex === 'male' ? 'M' : 'F') + '<<<<<<<<', 46, 606);
  // wear (post-apocalyptic)
  for (let k = 0; k < 22; k++) { g.fillStyle = `rgba(${rng.int(60, 90)},${rng.int(50, 70)},${rng.int(30, 50)},${rng.float(0.04, 0.15)})`; g.beginPath(); g.arc(rng.float(0, CARD_W), rng.float(0, CARD_H), rng.float(4, 40), 0, 6.3); g.fill(); }
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
  for (let k = 0; k < 30; k++) { g.beginPath(); const x = rng.float(0, CARD_W), y = rng.float(0, CARD_H); g.moveTo(x, y); g.lineTo(x + rng.float(-60, 60), y + rng.float(-20, 20)); g.stroke(); }
  const crease = rng.float(300, 700);
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 3; g.beginPath(); g.moveTo(crease, 0); g.lineTo(crease + rng.float(-40, 40), CARD_H); g.stroke();
  if (stamp) drawStamp(g, stamp);
  return c;
}

function drawStamp(g, stamp) {
  g.save();
  g.translate(760, 220); g.rotate(-0.22);
  const col = stamp === 'APPROVED' ? 'rgba(20,120,50,0.82)' : 'rgba(170,20,20,0.85)';
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 8;
  rr(g, -170, -55, 340, 110, 14); g.stroke();
  g.font = 'bold 64px "Arial Black", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(stamp, 0, 4);
  g.restore();
}

export function drawCardBack(spec) {
  const c = cnv(); const g = c.getContext('2d');
  const rng = new RNG((spec.seed ^ 0xbac4) >>> 0);
  rr(g, 0, 0, CARD_W, CARD_H, 36); g.clip();
  g.fillStyle = '#d4dfdc'; g.fillRect(0, 0, CARD_W, CARD_H);
  g.fillStyle = '#111'; g.fillRect(0, 60, CARD_W, 110);
  g.fillStyle = '#2a3a44'; g.font = '20px Arial';
  const text = ['This card is the property of the Federated Civic Registry.', 'If found, return to any Registry office.', 'Tampering with or altering this card is a criminal offence.', 'Security features are visible under ultraviolet light.'];
  text.forEach((t, i) => g.fillText(t, 50, 240 + i * 34));
  for (let x = 50; x < 560; x += rng.int(3, 8)) { g.fillRect(x, 420, rng.int(1, 4), 120); }
  g.font = '22px Consolas, monospace'; g.fillText(spec.card.idNo, 50, 580);
  for (let k = 0; k < 18; k++) { g.fillStyle = `rgba(80,60,40,${rng.float(0.04, 0.14)})`; g.beginPath(); g.arc(rng.float(0, CARD_W), rng.float(0, CARD_H), rng.float(5, 40), 0, 6.3); g.fill(); }
  return c;
}

function star(g, x, y, R, r, n) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const rad = i % 2 ? r : R;
    i ? g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad) : g.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  g.closePath();
}

// White-on-black mask of what fluoresces under UV light.
export function drawCardUV(spec, seal = spec.card.seal) {
  const c = cnv(); const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, CARD_W, CARD_H);
  const rng = new RNG((spec.seed ^ 0x0071) >>> 0);
  // random fluorescent lint/specks on every card
  g.fillStyle = 'rgba(255,255,255,0.25)';
  for (let k = 0; k < 25; k++) { g.beginPath(); g.arc(rng.float(0, CARD_W), rng.float(0, CARD_H), rng.float(1, 3), 0, 6.3); g.fill(); }
  if (seal === 'missing') return c;
  drawSeal(g, 250, 430, 105, seal, spec.card.idNo);
  return c;
}

export function drawSeal(g, x, y, R, seal = 'valid', idNo = 'FCR-00A-0000-000') {
  g.save();
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 4;
  g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(x, y, R * 0.72, 0, Math.PI * 2); g.stroke();
  star(g, x, y, R * 0.6, R * 0.26, seal === 'star5' ? 5 : 7); g.fill();
  const text = seal === 'misspelled' ? 'FEDERATED CIVIC REGISTFY • GENIUNE • ' : 'FEDERATED CIVIC REGISTRY • GENUINE • ';
  g.font = `bold ${Math.round(R * 0.15)}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = text.split('');
  chars.forEach((ch, i) => {
    const a = -Math.PI / 2 + (i / chars.length) * Math.PI * 2;
    g.save(); g.translate(x + Math.cos(a) * R * 0.86, y + Math.sin(a) * R * 0.86); g.rotate(a + Math.PI / 2); g.fillText(ch, 0, 0); g.restore();
  });
  // microtext band with the card number
  let num = idNo;
  if (seal === 'idmismatch') num = idNo.replace(/\d(?=\d{2}$)/, (d) => String((Number(d) + 3) % 10)).replace(/^FCR-\d/, (s) => 'FCR-' + ((Number(s.slice(-1)) + 4) % 10));
  g.font = 'bold 26px Consolas, monospace'; g.textAlign = 'left';
  g.fillText(`${num}  ${num}  ${num}`, x + R + 40, y + R * 0.95 + 70 > CARD_H - 20 ? CARD_H - 30 : y + R * 0.95 + 70);
  g.restore();
}

// Physical 3D card for the desk.
export function makeCardMesh(front, back, uvMask, patchMaterial) {
  const geo = new THREE.BoxGeometry(0.128, 0.0016, 0.08);
  const ft = new THREE.CanvasTexture(front); ft.colorSpace = THREE.SRGBColorSpace; ft.anisotropy = 8;
  const bt = new THREE.CanvasTexture(back); bt.colorSpace = THREE.SRGBColorSpace;
  const ut = new THREE.CanvasTexture(uvMask);
  const edge = new THREE.MeshStandardMaterial({ color: 0xcfd8d6, roughness: 0.5 });
  const fm = new THREE.MeshPhysicalMaterial({ map: ft, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  patchMaterial(fm, 'card', { hvGlow: { value: ut } });
  const bm = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.4 });
  // box faces: +x,-x,+y,-y,+z,-z
  const m = new THREE.Mesh(geo, [edge, edge, fm, bm, edge, edge]);
  m.castShadow = true;
  m.userData.textures = [ft, bt, ut];
  m.userData.front = ft;
  return m;
}
