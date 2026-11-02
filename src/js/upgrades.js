// Equipment progression: credits buy upgrades along several tracks. Level 0 is the
// starting kit of a new save; each purchase raises a track by one level.
export const TRACKS = {
  light: {
    name: 'Flashlight & UV',
    levels: [
      { name: 'Pen light', desc: 'A dim, narrow pen light. You must get very close to see pupils react.' },
      { name: 'Flashlight', price: 120, desc: 'A proper flashlight: bright, wide and long-reaching.' },
      { name: 'UV pen light', price: 180, desc: 'A weak ultraviolet pen. Short range, small spot — but residue, make-up and old bites glow.' },
      { name: 'UV lamp', price: 320, desc: 'A strong UV lamp with a wide beam and good reach.' },
      { name: 'UV light switch', price: 650, overnight: true, desc: 'A wall switch in Decontamination that turns off the room lights and floods it with UV: everything that fluoresces glows at once.' },
    ],
  },
  geiger: {
    name: 'Radiation detection',
    levels: [
      { name: 'None', desc: 'No radiation detector.' },
      { name: 'Basic Geiger counter', price: 150, desc: 'Only registers radiation when held right against the source.' },
      { name: 'Sensitive Geiger counter', price: 300, desc: 'Picks up radiation from a distance.' },
      { name: 'Radiation scanner', price: 550, desc: 'Sweeps a cone: anything irradiated glows a sickly yellow-green.' },
    ],
  },
  id: {
    name: 'ID verification',
    levels: [
      { name: 'Questions only', desc: 'You can only check an ID against the person and their answers.' },
      { name: 'UV seal checker', price: 150, desc: 'Shows the hidden UV security seal on ID cards.' },
      { name: 'ID scanner', price: 420, desc: 'Instantly tells whether a card is genuine or counterfeit — though not whether it belongs to the person holding it.' },
    ],
  },
  wash: {
    name: 'Washing',
    levels: [
      { name: 'Bathtub', desc: 'The visitor lies in a tub that slowly fills, washing away the dirt.' },
      { name: 'Hose', price: 200, desc: 'A hose reel: wash the visitor yourself, where it is needed.' },
      { name: 'Overhead shower', price: 450, overnight: true, desc: 'A shower head over the drain washes a visitor head to toe in ten seconds.' },
    ],
  },
  search: {
    name: 'Searching',
    levels: [
      { name: 'Bare hands', desc: 'Searching a garment takes a few seconds, and hidden things can be missed.' },
      { name: 'TSA handbook', price: 120, desc: 'Proper technique: searches are instant and never miss anything.' },
      { name: 'Metal detector', price: 260, desc: 'A wand that beeps near metal — keys, cans, knives, guns — still on the visitor.' },
      { name: 'X-ray gun', price: 560, desc: 'A narrow beam that sees through clothes and hair, revealing anything concealed.' },
    ],
  },
  cure: {
    name: 'Medical ward',
    levels: (() => {
      const l = [{ name: '20 cots', desc: 'Patients lie on cots and get a cure serum. Slow: it takes several days.' }];
      for (let k = 1; k <= 10; k++) l.push({ name: `Cure tank ${k}/10`, price: 140 + (k - 1) * 60, overnight: true, desc: `Installs a cure tank in place of two cots. Tanks cure faster than cots. (${k} tank${k > 1 ? 's' : ''}, ${20 - 2 * k} cots)` });
      l.push({ name: 'Tank accelerators', price: 900, overnight: true, desc: 'Upgrades every cure tank to full speed.' });
      return l;
    })(),
  },
  room: {
    name: 'Decontamination room',
    levels: [
      { name: 'Cold and dim', desc: 'Poor lighting and no heating. Stripped visitors are cold and miserable.' },
      { name: 'Better lighting', price: 150, overnight: true, desc: 'Bright, even lighting for inspections.' },
      { name: 'Heaters', price: 300, overnight: true, desc: 'Wall heaters keep stripped visitors warm and calmer.' },
    ],
  },
};

export const START_LEVELS = { light: 0, geiger: 0, id: 0, wash: 0, search: 0, cure: 0, room: 0 };
// saves from before upgrades existed had this kit
export const LEGACY_LEVELS = { light: 3, geiger: 2, id: 1, wash: 1, search: 1, cure: 4, room: 1 };
// everything (tutorial)
export const MAX_LEVELS = Object.fromEntries(Object.entries(TRACKS).map(([k, t]) => [k, t.levels.length - 1]));

// ward layout helpers
export const wardTanks = (lv) => Math.min(10, lv.cure);
export const wardFast = (lv) => lv.cure >= 11;
