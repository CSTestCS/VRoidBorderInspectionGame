// The in-game procedures manual (Tab).
import { el } from './util.js';
import { drawSeal } from './idcard.js';
import { keys as KB, keyName } from './keys.js';
const kk = (a) => el('kbd', {}, keyName(KB[a]));

function sealCanvas() {
  const c = document.createElement('canvas'); c.width = 520; c.height = 260;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0418'; g.fillRect(0, 0, 520, 260);
  g.save(); g.shadowColor = '#7dffb0'; g.shadowBlur = 10;
  const tmp = document.createElement('canvas'); tmp.width = 1024; tmp.height = 640;
  const tg = tmp.getContext('2d');
  drawSeal(tg, 250, 300, 160, 'valid', 'FCR-12A-3456-789');
  tg.globalCompositeOperation = 'source-in'; tg.fillStyle = '#7dffb0'; tg.fillRect(0, 0, 1024, 640);
  g.drawImage(tmp, 0, 0, 1024, 640, 0, -20, 520, 325);
  g.restore();
  c.style.width = '420px'; c.style.borderRadius = '6px';
  return c;
}

const PAGES = {
  'Overview': () => el('div', {},
    el('p', {}, 'You are a customs officer at Checkpoint 7, the last door between the wasteland and the Haven. Every visitor must pass all stations:'),
    el('ol', {},
      el('li', {}, el('b', {}, 'Booth: '), 'check the identity card against the person and their answers. Stamp it APPROVED or FLAG, then press DECON.'),
      el('li', {}, el('b', {}, 'Clothing: '), 'in Decontamination, inspect every garment as it is worn, search it, remove it and sort it: washer or incinerator. Underwear stays on.'),
      el('li', {}, el('b', {}, 'Hose: '), 'wash the visitor completely. Dirt, blood and make-up must all come off.'),
      el('li', {}, el('b', {}, 'Body: '), 'inspect the clean body for signs of infection or radiation.'),
      el('li', {}, el('b', {}, 'Return clothes '), 'from the washer, then decide at the Disposition Terminal.')),
    el('p', {}, 'Most visitors are honest and healthy — about half have nothing wrong at all. Do not punish the innocent. Haven Security reviews every decision at the end of your shift.')),
  'ID Check': () => el('div', {},
    el('h3', {}, 'Compare the card with the person'),
    el('ul', {},
      el('li', {}, el('b', {}, 'Portrait: '), 'face, hairstyle, hair colour, skin tone and eye colour must all match — a forger may get the colours right on the wrong face, or the right face with one colour off. Portraits predate the collapse: they never show dirt, infection or discolouration — ignore those differences.'),
      el('li', {}, el('b', {}, 'Name: '), 'ask "State your full name" on the intercom. It must match the card exactly.'),
      el('li', {}, el('b', {}, 'Date of birth: '), 'ask for it; it must match the card.'),
      el('li', {}, el('b', {}, 'Height: '), 'compare the visitor with the height chart beside them. A difference of more than ~10 cm is a mismatch.'),
      el('li', {}, el('b', {}, 'Eyes / Sex: '), 'must match the card.')),
    el('h3', {}, 'UV security seal'),
    el('p', {}, 'Genuine cards show this seal under UV light (UV lamp button in the card view, or your UV lamp on the card): a ', el('b', {}, 'seven-pointed star'), ' inside a double ring reading ', el('b', {}, 'FEDERATED CIVIC REGISTRY • GENUINE •'), ', with the ', el('b', {}, 'card number'), ' repeated in microtext beside it. A missing seal, wrong star, misspelling or a different number means the card is forged.'),
    sealCanvas(),
    el('h3', {}, 'Procedure'),
    el('p', {}, 'Any false or forged identity: stamp ', el('b', { class: 'bad' }, 'FLAG'), '. The visitor still goes through decontamination, then must be ', el('b', {}, 'held for interrogation'), '. Never turn them away without questioning.')),
  'Clothing & Belongings': () => el('div', {},
    el('h3', {}, 'Search everything'),
    el('p', {}, 'Search each garment before removing it. Anything left in a garment goes wherever the garment goes.'),
    el('ul', {},
      el('li', {}, el('b', { class: 'bad' }, 'Confiscate: '), 'weapons of any kind (knives, guns, blades, knuckle dusters) and unknown substances (unlabelled vials, powders, unmarked pills, filled syringes).'),
      el('li', {}, el('b', { class: 'ok' }, 'Return: '), 'harmless personal belongings — keys, photos, food, coins, labelled supplies, letters, keepsakes. Confiscating them is a violation.')),
    el('h3', {}, 'Contaminated clothing → INCINERATOR'),
    el('ul', {},
      el('li', {}, el('b', {}, 'Biological: '), 'green-yellow slime or black mould spots. Some biological residue is invisible and only ', el('b', {}, 'fluoresces under UV light'), '.'),
      el('li', {}, el('b', {}, 'Chemical: '), 'dark oily stains with a rainbow sheen.'),
      el('li', {}, el('b', {}, 'Radioactive: '), 'looks normal — only the ', el('b', {}, 'Geiger counter'), ' will tell. Sweep every garment; readings above ~1 µSv/h near a garment mean it is hot.'),
      el('li', {}, el('b', {}, 'Infested: '), 'clusters of tiny dark lice and pale eggs. Zoom in (right mouse).')),
    el('p', {}, 'Ordinary mud, dust and wear are ', el('b', {}, 'not'), ' contamination — wash those. Burning clean clothes is a violation. Visitors get dressed in whatever was not burned.'),
    el('p', { class: 'muted' }, 'Underwear is never removed. Shoes must come off before socks.')),
  'Body Inspection': () => el('div', {},
    el('p', {}, 'Wash first, inspect after. Use ', el('kbd', {}, 'T'), ' to have the visitor raise their arms and ', el('kbd', {}, 'R'), ' to turn them around. Check every side.'),
    el('h3', {}, 'Signs of infection'),
    el('ul', {},
      el('li', {}, el('b', {}, 'Discoloured sclera: '), 'the whites of the eyes are yellow, red, grey or dark. Zoom in on the eyes.'),
      el('li', {}, el('b', {}, 'Discoloured skin: '), 'grey-green, purple or ashen patches with dark veins. ', el('b', {}, 'Some visitors hide these with skin-coloured make-up'), ' — it washes off with the hose, so wash thoroughly.'),
      el('li', {}, el('b', {}, 'Concealing make-up: '), 'shows up as a pale blue-white glow under the ', el('b', {}, 'UV lamp'), ' — sweep the skin with it before washing to see what someone is hiding.'),
      el('li', {}, el('b', {}, 'Bite marks: '), 'an oval of tooth impressions with bruising. Infected bites glow under UV — ', el('b', {}, 'old, healed bites are faint pale scars that are easy to miss in normal light'), ', so check the body with the UV lamp too.'),
      el('li', {}, el('b', {}, 'Unresponsive pupils: '), 'early infection leaves no marks at all. Shine the ', el('b', {}, 'flashlight'), ' into their eyes from the front: healthy pupils shrink at once; infected pupils stay wide open.')),
    el('h3', {}, 'Signs of radiation'),
    el('ul', {},
      el('li', {}, 'Red, blistered burn patches — but most irradiated visitors show ', el('b', {}, 'no visible sign at all'), '.'),
      el('li', {}, 'High Geiger readings from the body ', el('b', {}, 'after washing'), ' (radiation does not wash off people).')),
    el('h3', {}, 'Not a cause for concern'),
    el('p', {}, 'Dirt, dried blood (washes off), ordinary cuts, bruises, scars and tattoos.')),
  'Dispositions & Tanks': () => el('div', {},
    el('ul', {},
      el('li', {}, el('b', {}, 'Admit: '), 'healthy visitors with a genuine identity.'),
      el('li', {}, el('b', {}, 'Cure tanks: '), 'anyone showing signs of infection or radiation. This takes priority over everything else.'),
      el('li', {}, el('b', {}, 'Interrogation: '), 'anyone whose identity is false or forged. Review the record on the console in the Interrogation room, then decide.'),
      el('li', {}, el('b', {}, 'Deny entry: '), 'only for visitors the interrogation found ', el('b', {}, 'dangerous'), '.')),
    el('h3', {}, 'Medical Ward'),
    el('p', {}, 'Patients are treated on cots (slow, several days) or in cure tanks (faster). ', el('b', {}, 'Visit every occupied bed each day'), ' and treat the patient from its monitor — an untreated patient makes no progress. Release patients only at 0%: they walk back to Decontamination, dress in their washed clothes, and you decide where they go from there.'),
  'Equipment': () => el('div', {},
    el('p', {}, 'The checkpoint starts with basic equipment. Credits you earn buy upgrades at the ', el('b', {}, 'Supply Terminal'), ' on the booth desk (or from the shift report). Room installations are fitted overnight.'),
    el('ul', {},
      el('li', {}, el('b', {}, 'Lights: '), 'pen light → flashlight → UV pen light → UV lamp → UV light switch (floods Decontamination with UV).'),
      el('li', {}, el('b', {}, 'Radiation: '), 'none → basic Geiger counter (touching distance) → sensitive counter → radiation scanner (irradiated things glow yellow-green in its beam).'),
      el('li', {}, el('b', {}, 'ID check: '), 'questions only → UV seal checker → ID scanner (tells genuine from counterfeit, not whose card it is).'),
      el('li', {}, el('b', {}, 'Washing: '), 'bathtub → hose → overhead shower.'),
      el('li', {}, el('b', {}, 'Searching: '), 'by hand (slow, can miss things — search again) → TSA handbook (instant, thorough) → metal detector → X-ray gun.'),
      el('li', {}, el('b', {}, 'Ward: '), '20 cots → up to 10 cure tanks (each replaces two cots) → tank accelerators.'),
      el('li', {}, el('b', {}, 'Room: '), 'cold and dim → better lighting → heaters (stripped visitors stay comfortable).'))),
  'Tools & Controls': () => el('div', {},
    el('ul', {},
      el('li', {}, el('kbd', {}, 'W A S D'), ' move · ', el('kbd', {}, 'Shift'), ' run · ', el('kbd', {}, 'Ctrl'), '/', el('kbd', {}, 'C'), ' crouch (toggle) · mouse look'),
      el('li', {}, el('kbd', {}, 'Right mouse'), ' / ', kk('zoom'), ' toggle zoom for close inspection'),
      el('li', {}, el('kbd', {}, 'E'), ' or left click (hands): interact'),
      el('li', {}, el('kbd', {}, '1'), ' hands · ', el('kbd', {}, '2'), ' flashlight · ', el('kbd', {}, '3'), ' UV lamp · ', el('kbd', {}, '4'), ' Geiger counter · ', el('kbd', {}, '5'), ' hose (after taking it from the reel)'),
      el('li', {}, el('kbd', {}, 'Left mouse'), ' (hold, hose equipped): spray water'),
      el('li', {}, kk('arms'), ' visitor raise/lower arms · ', kk('turn'), ' visitor turn around (rebind keys in Settings → Key bindings)'),
      el('li', {}, kk('idcard'), ' view the ID card (after the booth) · ', el('kbd', {}, 'Tab'), ' this manual · ', el('kbd', {}, 'Esc'), ' pause / close'),
      el('li', {}, el('kbd', {}, 'F11'), ' fullscreen'))),
};

export function openRulebook(ui, startTab = 'Overview') {
  const page = el('div', { class: 'page' });
  const tabs = el('div', { class: 'tabs' });
  const show = (name) => {
    page.innerHTML = '';
    page.append(PAGES[name]());
    for (const b of tabs.children) b.classList.toggle('active', b.textContent === name);
  };
  for (const name of Object.keys(PAGES)) tabs.append(el('button', { onclick: () => show(name) }, name));
  show(startTab);
  const m = ui.modal(el('div', { class: 'rulebook' }, tabs, page, el('div', { class: 'row' }, el('button', { onclick: () => m.close() }, 'Close (Esc)'))), { title: 'Haven Checkpoint — Procedures Manual' });
  return m;
}
