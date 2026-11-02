// Rebindable controls.
export const ACTIONS = [
  ['forward', 'Move forward', 'KeyW'], ['back', 'Move back', 'KeyS'], ['left', 'Move left', 'KeyA'], ['right', 'Move right', 'KeyD'],
  ['run', 'Run (hold)', 'ShiftLeft'], ['crouch', 'Crouch (toggle)', 'ControlLeft'], ['zoom', 'Zoom (toggle; right mouse also works)', 'KeyZ'], ['interact', 'Interact', 'KeyE'],
  ['arms', 'Visitor: raise / lower arms', 'KeyF'], ['turn', 'Visitor: turn around', 'KeyR'],
  ['idcard', 'View ID card', 'KeyI'], ['manual', 'Procedures manual', 'Tab'],
  ['tool1', 'Hands', 'Digit1'], ['tool2', 'Flashlight', 'Digit2'], ['tool3', 'UV lamp', 'Digit3'], ['tool4', 'Geiger counter / scanner', 'Digit4'], ['tool5', 'Hose', 'Digit5'], ['tool6', 'Metal detector / X-ray', 'Digit6'],
];
export const DEFAULT_KEYS = Object.fromEntries(ACTIONS.map(([id, , k]) => [id, k]));
export const keys = { ...DEFAULT_KEYS };
export function setKeys(map) { Object.assign(keys, DEFAULT_KEYS, map || {}); }
export function is(action, code) { return keys[action] === code; }
export function keyName(code) {
  if (!code) return '?';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return { ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', Space: 'Space', Tab: 'Tab', Enter: 'Enter', Backquote: '`', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code] || code;
}
export const K = (action) => `<kbd>${keyName(keys[action])}</kbd>`;
