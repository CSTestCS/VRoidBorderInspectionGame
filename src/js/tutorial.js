// Guided tutorial shift. Steps advance on game events or polled conditions.
import { generateVisitor } from './visitor.js';
import { removableItems } from './vrm/modelConfig.js';
import { fmtDate } from './idcard.js';
import { K } from './keys.js';

export function makeTutorialVisitor(models) {
  const pref = models.find((m) => m.entry.id === 'YoungFemaleCitizen') || models[0];
  const spec = generateVisitor(424242, models, { modelId: pref.entry.id, problems: ['invalidName', 'weapon', 'contaminatedClothing', 'discoloredSkin', 'biteMarks'] });
  const items = removableItems(pref.cfg);
  const top = items.find((i) => i.category === 'top' || i.category === 'outer' || i.category === 'onepiece') || items[0];
  const bottom = items.find((i) => i.category === 'bottom' && i !== top) || items.find((i) => i !== top);
  spec.clothing = {};
  for (const it of items) spec.clothing[it.id] = it.category === 'shoes' ? 'mud' : 'none';
  if (top) spec.clothing[top.id] = 'bio';
  spec.pockets = {};
  if (top) spec.pockets[top.id] = [{ type: 'knife', bad: true }];
  if (bottom) spec.pockets[bottom.id] = [{ type: 'photo', bad: false }];
  spec.body.makeup = true;
  spec.body.discolor = ['forearm'];
  spec.body.bites = ['upperArm'];
  spec.body.decoys = [{ type: 'bruise', region: 'thigh' }];
  spec.body.blood = true;
  spec.body.sclera = 'normal';
  spec.answers.name = `${spec.card.first} ${spec.card.last === 'Marsh' ? 'Pike' : 'Marsh'}`;
  spec.tutorialTop = top?.name;
  return spec;
}

export class Tutorial {
  constructor(game, onFinish) {
    this.game = game;
    this.onFinish = onFinish;
    this.i = -1;
    this.flags = new Set();
    this.offs = [];
    const ev = ['moved', 'rulebookOpened', 'cardOnDesk', 'cardViewed', 'cardUV', 'asked', 'stamped', 'sentToDecon', 'enteredWashroom', 'tool', 'searched', 'objectDecided', 'allClothesRemoved', 'hoseTaken', 'hoseReturned', 'command', 'clothesReturned', 'disposed', 'enteredLab', 'tankOpened', 'tankChecked'];
    for (const e of ev) this.offs.push(game.on(e, (d) => this.onEvent(e, d)));
    this.timer = setInterval(() => this.poll(), 300);
    this.steps = this.buildSteps();
    this.next();
  }
  destroy() { for (const o of this.offs) o(); clearInterval(this.timer); this.game.ui.tutorial(null); }

  buildSteps() {
    const g = this.game;
    const run = () => g.run;
    return [
      { t: 'Welcome, Officer', h: 'You guard <b>Checkpoint 7</b>, the only way into the Haven. Every visitor must be identified, stripped, decontaminated and inspected before they may enter.<br><br>This tutorial walks you through one complete visitor. You can open the <b>Procedures Manual</b> any time with <kbd>Tab</kbd>.', next: true },
      { t: 'Moving around', h: 'Click the view to capture the mouse. Use <kbd>W A S D</kbd> to walk and the mouse to look. Hold <kbd>Shift</kbd> to run and <kbd>Right mouse</kbd> to zoom. <kbd>Esc</kbd> pauses.<br><br><i>Walk around the booth.</i>', on: 'moved' },
      { t: 'The manual', h: 'Press <kbd>Tab</kbd> to open the Procedures Manual. It lists every rule you will be judged on. Close it with <kbd>Esc</kbd> when you are done reading.', on: 'rulebookOpened' },
      { t: 'Call a visitor', h: 'Look at the button panel on the right of your desk and press <kbd>E</kbd> on the green <b>NEXT</b> button.', on: 'cardOnDesk' },
      { t: 'The ID card', h: 'The visitor pushed their ID card through the slot. Look at it on the tray and press <kbd>E</kbd> to examine it.', on: 'cardViewed' },
      { t: 'Checking the card', h: 'Compare the card with the person behind the glass:<ul><li><b>Portrait</b> — face, hair, skin and eye colour. (Portraits are pre-collapse: ignore dirt or sickness.)</li><li><b>Height</b> — read the height chart behind them.</li><li><b>Eyes / sex / date of birth</b>.</li></ul>Now press <b>UV lamp</b> (<kbd>U</kbd>) in the card view to check the hidden security seal. Compare it with the reference in the manual.', on: 'cardUV' },
      { t: 'Question the visitor', h: 'Close the card (<kbd>Esc</kbd>) and press <kbd>E</kbd> on the <b>intercom microphone</b> on the left of the desk. Ask them to <b>state their full name</b>. Feel free to ask the other questions too.', poll: () => run()?.asked.has('name') },
      { t: 'Did it match?', h: () => `The card says <b>${run()?.spec.card.first} ${run()?.spec.card.last}</b>, but listen to what they told you: <b>${run()?.spec.answers.name}</b>. The names do not match — this visitor is lying about who they are.<br><br>Press <kbd>E</kbd> on the red <b>FLAG</b> stamp to flag the card for interrogation.`, on: 'stamped' },
      { t: 'Send to decontamination', h: 'Everyone goes through decontamination, even flagged visitors. Press the blue <b>DECON</b> button.', on: 'sentToDecon' },
      { t: 'Decontamination', h: 'Walk through the door behind you, down the corridor to the <b>Decontamination</b> room. The visitor walks there through their own corridor and waits on the drain platform.', on: 'enteredWashroom' },
      { t: 'Inspect the clothing', h: () => `Before removing anything, inspect each garment <b>as it is worn</b>:<ul><li>Look closely for stains, slime, oil, lice (zoom with right mouse).</li><li>Press <kbd>3</kbd> for the <b>UV lamp</b>: biological residue glows green.</li><li>Press <kbd>4</kbd> for the <b>Geiger counter</b>: radioactive clothing looks normal but reads high.</li></ul>Try both tools on the visitor's clothes. Hint: take a good look at the <b>${run()?.spec.tutorialTop?.toLowerCase() || 'top'}</b>.`, poll: () => this.flags.has('tool:uv') && this.flags.has('tool:geiger') },
      { t: 'Search pockets', h: () => `Press <kbd>1</kbd> for your hands, look at the <b>${run()?.spec.tutorialTop?.toLowerCase() || 'top'}</b> and press <kbd>E</kbd>, then choose <b>Search</b>. Decide what to do with anything you find: weapons and unknown substances are <b>confiscated</b>; harmless belongings are <b>returned</b>.`, poll: () => (run()?.found.length || 0) >= 1 },
      { t: 'Remove and sort', h: 'Search the rest of the clothes too, then remove each item (<b>Remove and carry</b>) and take it to:<ul><li>the <b>incinerator</b> if it is contaminated (the slimy garment), or</li><li>the <b>washer</b> if it is just dirty or muddy.</li></ul>Shoes must come off before socks. Underwear stays on.', on: 'allClothesRemoved' },
      { t: 'The hose', h: 'Take the <b>hose</b> from the yellow reel on the right wall (<kbd>E</kbd>).', on: 'hoseTaken' },
      { t: 'Wash them down', h: () => `Hold <b>left mouse</b> to spray. Wash off all dirt and blood. Press ${K('arms')} to have them raise their arms and ${K('turn')} to turn around so you reach every side.<br><br><b>Watch the skin closely</b> — some visitors hide discoloured skin under make-up, which only comes off with plenty of water. When you are done, put the hose back on the reel (${K('interact')}).`, on: 'hoseReturned' },
      { t: 'Body inspection', h: () => `Now inspect the clean body. Use ${K('arms')} (arms) and ${K('turn')} (turn), zoom in with right mouse, and use the UV lamp and Geiger counter:<ul><li>Discoloured skin with dark veins (was that hidden before?)</li><li>Bite marks — infected bites glow under UV</li><li>Whites of the eyes (yellow / red / grey / dark)</li><li>Radiation burns, high Geiger readings</li></ul>Bruises, cuts and tattoos are harmless.`, next: true },
      { t: 'Return the clothes', h: 'Press <kbd>E</kbd> on the <b>washer</b> to give the visitor back their washed clothes. Burned items are gone for good.', on: 'clothesReturned' },
      { t: 'Disposition', h: 'Use the <b>Disposition Terminal</b> on the far wall. This visitor has infection signs <b>and</b> a false name. Infection always comes first: send them to the <b>cure tanks</b>. Once cured, they will still need interrogation.', on: 'disposed' },
      { t: 'The Medical Lab', h: () => (this.disposition === 'tank' ? 'Walk through the <b>MEDICAL LAB</b> door on the right side of the decontamination room and press <kbd>E</kbd> on the visitor\'s tank monitor.' : 'You did not send this visitor to the tanks — Haven Security would record that as a serious violation. Walk through the <b>MEDICAL LAB</b> door anyway and look at a tank monitor.'), on: 'tankOpened' },
      { t: 'Daily checks', h: 'Tank patients must be checked <b>every day</b>: open the monitor and administer a cure cycle. Release them only when both readings reach 0%. On release you decide again — this patient was flagged, so hold them for <b>interrogation</b>.<br><br>The interrogation console (Interrogation room, left of decontamination) shows the record; deny entry only to those found dangerous.', next: true },
      { t: 'Tutorial complete', h: 'You know the procedures. Most visitors are honest and healthy — but some will lie, smuggle, or hide sickness. Stay sharp.<br><br>Start your first real shift? The tutorial patient stays in the tank.', finish: true },
    ];
  }

  next() {
    this.i++;
    const s = this.steps[this.i];
    if (!s) return;
    const html = typeof s.h === 'function' ? s.h() : s.h;
    const buttons = [];
    if (s.next) buttons.push({ label: 'Continue', primary: true, onClick: () => this.next() });
    if (s.finish) {
      buttons.push({ label: 'Start Day 1', primary: true, onClick: () => { this.destroy(); this.onFinish('day1'); } });
      buttons.push({ label: 'Main menu', onClick: () => { this.destroy(); this.onFinish('menu'); } });
    }
    this.game.ui.tutorial(`Tutorial ${this.i + 1}/${this.steps.length} — ${s.t}`, html, buttons);
    if (s.poll && s.poll()) setTimeout(() => this.next(), 300);
  }

  onEvent(e, d) {
    if (e === 'tool') this.flags.add('tool:' + d);
    if (e === 'disposed') {
      this.disposition = d;
      if (d === 'tank') setTimeout(() => { const t = this.game.tanks.find(Boolean); if (t) t.checkedToday = false; }, 3000);
    }
    const s = this.steps[this.i];
    if (s && s.on === e) this.next();
  }
  poll() {
    const s = this.steps[this.i];
    if (s?.poll && s.poll()) this.next();
  }
}
