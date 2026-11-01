import { defaultFabric } from './materials.js';
// Per-model configuration: which materials are which, how clothing pieces are
// grouped into removable items, item categories and colour slots. Defaults are
// guessed from names + geometry; the Model Workshop lets players fix them.

export const CATEGORIES = [
  { id: 'top', label: 'Top / Shirt', pockets: true },
  { id: 'outer', label: 'Jacket / Coat', pockets: true },
  { id: 'bottom', label: 'Pants / Skirt', pockets: true },
  { id: 'onepiece', label: 'Dress / Jumpsuit', pockets: true },
  { id: 'socks', label: 'Socks / Legwear', pockets: false },
  { id: 'shoes', label: 'Shoes / Boots', pockets: true },
  { id: 'gloves', label: 'Gloves / Arm wear', pockets: false },
  { id: 'hat', label: 'Hat / Headwear', pockets: false },
  { id: 'accessory', label: 'Accessory', pockets: false },
  { id: 'underwear', label: 'Built-in underwear mesh (always hidden)', pockets: false },
  { id: 'fixed', label: 'Not removable (part of body)', pockets: false },
];
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
const DEFAULT_NAMES = { top: 'Top', outer: 'Jacket', bottom: 'Bottoms', onepiece: 'Dress', socks: 'Socks', shoes: 'Shoes', gloves: 'Arm Wear', hat: 'Hat', accessory: 'Accessory', underwear: 'Underwear Mesh', fixed: 'Body Part' };

export const MATERIAL_ROLES = [
  ['bodySkin', 'Body skin'], ['faceSkin', 'Face skin'], ['hair', 'Hair'], ['eyeIris', 'Eye iris'], ['eyeWhite', 'Eye white (sclera)'],
  ['eyeHighlight', 'Eye highlight'], ['faceDetail', 'Face detail (brows/lines/mouth)'], ['cloth', 'Clothing'], ['other', 'Other (static)'],
];
export const COLOR_SLOTS = [
  ['A', 'Cloth colour A'], ['B', 'Cloth colour B'], ['C', 'Cloth colour C'], ['D', 'Cloth colour D'],
  ['skin', 'Skin tone'], ['hair', 'Hair colour'], ['eye', 'Eye colour'], ['dark', 'Random dark'], ['light', 'Random light'], ['fixed', 'Keep texture colour'],
];

export function guessSex(name) {
  const n = name.toLowerCase();
  if (/female|girl|woman|lady|fem\b/.test(n)) return 'female';
  if (/male|boy|\bman\b|guy/.test(n)) return 'male';
  return 'female';
}
export function guessAge(name) {
  const n = name.toLowerCase();
  if (/old|elder|senior|grand/.test(n)) return 'old';
  if (/young|teen|youth/.test(n)) return 'young';
  return 'adult';
}

function guessCategory(matName, box, H, pieces = []) {
  const n = matName.toLowerCase();
  if (pieces.length && pieces.every((p) => Math.abs((p.box.min.x + p.box.max.x) / 2) > 0.15 * H && p.box.max.x - p.box.min.x < 0.2 * H && p.box.min.y > 0.5 * H)) return 'gloves';
  const cx = (box.min.x + box.max.x) / 2;
  const w = box.max.x - box.min.x;
  if (box.max.y < 0.11 * H && box.min.y < 0.03 * H) return 'shoes';
  if (/shoe|boot/.test(n)) return 'shoes';
  if (/sock|legwear|stocking|tights/.test(n)) return 'socks';
  if (box.min.y < 0.06 * H && box.max.y < 0.62 * H && !/bottom/.test(n)) return 'socks';
  if (/hat|cap|helmet|head/.test(n) && box.min.y > 0.8 * H) return 'hat';
  if (box.min.y > 0.82 * H) return 'hat';
  if (/glove/.test(n) || (Math.abs(cx) > 0.18 * H && w < 0.2 * H)) return 'gloves';
  if (/onepiece/.test(n)) return box.min.y < 0.45 * H ? 'onepiece' : 'outer';
  if (/top/.test(n)) return 'top';
  if (/bottom/.test(n)) return 'bottom';
  if (/accessory|tie|acc/.test(n)) return 'accessory';
  if (box.min.y > 0.5 * H) return 'top';
  return 'bottom';
}

// Pieces of the same item (e.g. left + right shoe) get the same color slot.
export function defaultConfig(modelEntry, analysis) {
  const H = analysis.height || 1.6;
  const cfg = {
    version: 1,
    name: modelEntry.name,
    sex: guessSex(modelEntry.name + ' ' + modelEntry.id),
    age: guessAge(modelEntry.name + ' ' + modelEntry.id),
    enabled: true,
    uwThreshold: 60,
    materials: {},
    pieces: {},
    items: {},
  };
  const slotSeq = ['A', 'B', 'C', 'D'];
  let slotI = 0;
  const baseToItem = {};
  for (const m of analysis.materials) {
    cfg.materials[m.key] = { role: m.role, visible: true, colorSlot: m.role === 'bodySkin' || m.role === 'faceSkin' ? 'skin' : m.role === 'hair' ? 'hair' : m.role === 'eyeIris' ? 'eye' : 'fixed' };
    if (m.role !== 'cloth' && m.role !== 'other') continue;
    const myPieces = analysis.pieces.filter((p) => p.matKey === m.key);
    if (!myPieces.length) continue;
    // materials named X_01 / X_02 belong to the same garment
    const isGlasses = /glass|megane|eyewear|spectacle|goggle/i.test(m.name);
    // frame + lens (or _01/_02 parts) of one garment share an item
    const base = isGlasses ? '__glasses' : m.name.replace(/(_\d{2})$/, '').replace(/\s*#\d+$/, '');
    const cat = m.role === 'other' ? 'fixed' : isGlasses ? 'accessory' : guessCategory(m.name, m.box, H, myPieces);
    let itemId = baseToItem[base];
    if (!itemId) {
      itemId = 'item' + (Object.keys(cfg.items).length + 1);
      baseToItem[base] = itemId;
      const def = { top: true, outer: true, bottom: true, onepiece: true, shoes: true };
      const nm = isGlasses ? 'Glasses' : cat === 'socks' && m.box.max.y > 0.3 * H ? 'Stockings' : DEFAULT_NAMES[cat] || 'Item';
      cfg.items[itemId] = { name: nm, category: cat, fabric: defaultFabric(cat), pockets: !!def[cat], slot: cat === 'fixed' ? 'fixed' : cat === 'shoes' ? 'D' : slotSeq[slotI++ % 3] };
    }
    const lens = isGlasses && /lens/i.test(m.name);
    if (isGlasses) cfg.items[itemId].fabric = 'plastic';
    for (const p of myPieces) cfg.pieces[p.id] = { item: itemId, colorSlot: lens ? 'fixed' : 'item', visible: true, ...(lens ? { fabric: 'glass' } : {}) };
  }
  mergeBootShafts(cfg, analysis, H);
  return cfg;
}

// Leg pieces that sit on top of the shoes (thigh-high boot shafts stored in another
// material) become part of the shoes item; other per-leg pieces become legwear.
function mergeBootShafts(cfg, analysis, H) {
  const piecesOf = (itemId) => analysis.pieces.filter((p) => cfg.pieces[p.id]?.item === itemId);
  const shoesId = Object.keys(cfg.items).find((id) => cfg.items[id].category === 'shoes');
  const shoesTop = shoesId ? Math.max(...piecesOf(shoesId).map((p) => p.box.max.y)) : -1;
  for (const [id, it] of Object.entries(cfg.items)) {
    if (!['onepiece', 'bottom', 'outer'].includes(it.category)) continue;
    const ps = piecesOf(id);
    const perLeg = ps.length >= 2 && ps.every((p) => {
      const cx = (p.box.min.x + p.box.max.x) / 2;
      return Math.abs(cx) > 0.02 * H && p.box.max.x - p.box.min.x < 0.2 * H && p.box.max.y < 0.6 * H;
    });
    if (!perLeg) continue;
    const minY = Math.min(...ps.map((p) => p.box.min.y));
    const maxY = Math.max(...ps.map((p) => p.box.max.y));
    if (shoesId && minY < shoesTop + 0.05 * H && minY > 0.02 * H) {
      for (const p of ps) cfg.pieces[p.id].item = shoesId;
      cfg.items[shoesId].name = maxY > 0.35 * H ? 'Thigh-high Boots' : maxY > 0.2 * H ? 'Tall Boots' : 'Boots';
      delete cfg.items[id];
    } else if (minY < 0.06 * H) {
      it.category = 'socks';
      it.name = maxY > 0.3 * H ? 'Stockings' : 'Socks';
      it.pockets = false;
      it.fabric = 'cotton';
    }
  }
}

// Merge a saved config over the defaults (keeps new pieces/materials working).
export function resolveConfig(modelEntry, analysis, saved) {
  const def = defaultConfig(modelEntry, analysis);
  if (!saved) return def;
  const cfg = { ...def, ...saved, materials: { ...def.materials }, pieces: { ...def.pieces }, items: { ...def.items, ...(saved.items || {}) } };
  for (const [k, v] of Object.entries(saved.materials || {})) if (cfg.materials[k]) cfg.materials[k] = { ...cfg.materials[k], ...v };
  for (const [k, v] of Object.entries(saved.pieces || {})) if (cfg.pieces[k]) cfg.pieces[k] = { ...cfg.pieces[k], ...v };
  // drop items no piece refers to
  const used = new Set(Object.values(cfg.pieces).map((p) => p.item));
  for (const id of Object.keys(cfg.items)) if (!used.has(id)) delete cfg.items[id];
  return cfg;
}

export function removableItems(cfg) {
  return Object.entries(cfg.items).filter(([, it]) => !['underwear', 'fixed'].includes(it.category)).map(([id, it]) => ({ id, ...it }));
}
