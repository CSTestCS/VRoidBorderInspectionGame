// Colour palettes for skin, hair, eyes and clothing.
import { hsl } from './util.js';

export const SKIN_TONES = [
  [[1.0, 0.88, 0.8], 2], [[0.98, 0.82, 0.71], 3], [[0.93, 0.75, 0.62], 3], [[0.86, 0.66, 0.52], 3],
  [[0.76, 0.56, 0.42], 2.5], [[0.64, 0.45, 0.33], 2], [[0.5, 0.34, 0.25], 1.5], [[0.38, 0.25, 0.18], 1.2], [[0.28, 0.19, 0.14], 0.8],
];
export const HAIR_NATURAL = [
  [{ name: 'black', rgb: [0.06, 0.05, 0.05] }, 4], [{ name: 'dark brown', rgb: [0.17, 0.11, 0.07] }, 4], [{ name: 'brown', rgb: [0.32, 0.21, 0.12] }, 3],
  [{ name: 'light brown', rgb: [0.5, 0.36, 0.22] }, 2], [{ name: 'dark blonde', rgb: [0.62, 0.5, 0.32] }, 1.5], [{ name: 'blonde', rgb: [0.86, 0.74, 0.5] }, 1.5],
  [{ name: 'auburn', rgb: [0.45, 0.17, 0.08] }, 1], [{ name: 'ginger', rgb: [0.72, 0.33, 0.12] }, 0.8],
];
export const HAIR_OLD = [
  [{ name: 'grey', rgb: [0.62, 0.62, 0.62] }, 4], [{ name: 'white', rgb: [0.9, 0.9, 0.88] }, 2], [{ name: 'salt and pepper', rgb: [0.4, 0.39, 0.38] }, 3],
];
export const HAIR_DYED = [
  [{ name: 'dyed blue', rgb: [0.15, 0.3, 0.75] }, 1], [{ name: 'dyed pink', rgb: [0.92, 0.45, 0.65] }, 1], [{ name: 'dyed green', rgb: [0.2, 0.6, 0.35] }, 0.6],
  [{ name: 'dyed purple', rgb: [0.45, 0.25, 0.7] }, 0.8], [{ name: 'dyed red', rgb: [0.75, 0.08, 0.1] }, 0.8], [{ name: 'platinum', rgb: [0.95, 0.94, 0.9] }, 0.8],
];
export const EYE_COLORS = [
  [{ name: 'Brown', rgb: [0.35, 0.2, 0.1] }, 5], [{ name: 'Dark Brown', rgb: [0.2, 0.12, 0.07] }, 3], [{ name: 'Hazel', rgb: [0.5, 0.42, 0.2] }, 2],
  [{ name: 'Green', rgb: [0.3, 0.55, 0.3] }, 1.5], [{ name: 'Blue', rgb: [0.3, 0.5, 0.85] }, 2.5], [{ name: 'Grey', rgb: [0.55, 0.6, 0.65] }, 1.2], [{ name: 'Amber', rgb: [0.75, 0.5, 0.15] }, 0.6],
];
export const SCLERA = {
  normal: [1.0, 0.97, 0.95],
  yellow: [1.0, 0.82, 0.25],
  red: [1.0, 0.42, 0.38],
  grey: [0.62, 0.68, 0.55],
  black: [0.25, 0.22, 0.22],
};
export const DISCOLOR_COLORS = [
  [0.48, 0.55, 0.42], // grey-green
  [0.5, 0.44, 0.55], // bruised purple-grey
  [0.62, 0.6, 0.38], // sickly yellow
  [0.42, 0.47, 0.52], // ashen blue
];

// Clothing colours: post-apocalyptic, mostly muted, occasional bright.
export const CLOTH_MUTED = [
  [0.2, 0.22, 0.18], [0.32, 0.3, 0.22], [0.42, 0.36, 0.26], [0.26, 0.2, 0.15], [0.15, 0.17, 0.2], [0.22, 0.27, 0.35],
  [0.5, 0.48, 0.42], [0.62, 0.58, 0.5], [0.12, 0.12, 0.13], [0.38, 0.2, 0.15], [0.3, 0.33, 0.25], [0.18, 0.24, 0.3],
  [0.55, 0.42, 0.28], [0.45, 0.45, 0.45], [0.7, 0.68, 0.62], [0.28, 0.12, 0.12],
];
export function clothColor(rng, category) {
  if (category === 'shoes') return rng.pick([[0.1, 0.08, 0.07], [0.25, 0.16, 0.1], [0.35, 0.25, 0.16], [0.15, 0.15, 0.16], [0.5, 0.45, 0.38], [0.85, 0.83, 0.8]]);
  if (category === 'socks') return rng.pick([[0.9, 0.9, 0.88], [0.1, 0.1, 0.11], [0.4, 0.4, 0.42], [0.25, 0.22, 0.2], [0.6, 0.55, 0.48]]);
  if (category === 'bottom' && rng.chance(0.35)) return rng.pick([[0.16, 0.22, 0.36], [0.22, 0.3, 0.45], [0.12, 0.15, 0.25]]); // denim
  if (rng.chance(0.15)) return hsl(rng.next(), rng.float(0.35, 0.65), rng.float(0.3, 0.55));
  const c = rng.pick(CLOTH_MUTED);
  return c.map((v) => Math.min(1, Math.max(0, v + rng.float(-0.04, 0.04))));
}
