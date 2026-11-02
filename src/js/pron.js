// Pronunciation overrides ("say it like") and sentence emphasis.
// Words: { word -> respelling the voice reads instead }. Emphasis: { line template -> word index }.
// Lines that contain variable parts use {placeholders} (e.g. "{first} {last}.").
import { storeGet, storeSet } from './platform.js';
import * as D from './data.js';
import { OBJECTS } from './objects.js';

export const pron = { words: {}, emphasis: {} };

export async function loadPron() {
  try { const s = await storeGet('pronunciation'); if (s) { pron.words = s.words || {}; pron.emphasis = s.emphasis || {}; } } catch {}
}
export async function savePron() { await storeSet('pronunciation', { words: pron.words, emphasis: pron.emphasis }); }

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// spoken form of an ISO date ("2031-03-07" -> "7 March 2031")
export function spokenDate(iso) { const [y, m, d] = iso.split('-'); return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`; }

// ---- catalogue of everything the game says --------------------------------------
const NAME_LISTS = ['FIRST_F', 'FIRST_M', 'LAST', 'ORIGINS'];
const NOT_SPOKEN = new Set(['OCCUPATIONS', 'MOTIVES_HARMLESS', 'MOTIVES_DANGEROUS', 'NAME_HESITATE', ...NAME_LISTS]);
let catalog = null;
export function speechCatalog() {
  if (catalog) return catalog;
  const lines = new Set();
  const walk = (v) => { if (typeof v === 'string') lines.add(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  for (const [k, v] of Object.entries(D)) if (!NOT_SPOKEN.has(k) && typeof v !== 'function') walk(v);
  for (const o of Object.values(OBJECTS)) walk(o.claim || []);
  // answers built from the visitor's details
  for (const t of ['{first} {last}.', '{hesitate}{first} {last}.', '{date}.', '{origin}.']) lines.add(t);
  for (const l of [...lines]) if (!/[A-Za-z]/.test(l)) lines.delete(l);
  const words = new Set();
  const addWords = (s) => { for (const w of s.replace(/\{\w+\}/g, ' ').match(/[A-Za-z']+/g) || []) words.add(w.replace(/^'+|'+$/g, '').toLowerCase()); };
  lines.forEach(addWords);
  for (const k of [...NAME_LISTS, 'NAME_HESITATE']) D[k].forEach(addWords);
  MONTHS.forEach(addWords);
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand oh centimetres'.split(' ').forEach((w) => words.add(w));
  words.delete('');
  catalog = { lines: [...lines].sort((a, b) => a.localeCompare(b)), words: [...words].sort() };
  return catalog;
}

// ---- matching a spoken line to its template ------------------------------------------
const TOKEN_RE = /\{\w+\}|[A-Za-z0-9']+/g;
export const templateTokens = (t) => t.match(TOKEN_RE) || [];
let compiled = null;
function compiledTemplates() {
  if (compiled) return compiled;
  compiled = speechCatalog().lines.filter((t) => t.includes('{')).map((t) => {
    const esc = t.split(/(\{\w+\})/).map((p) => (/^\{\w+\}$/.test(p) ? (p === '{hesitate}' ? '(.*?)' : '(.+?)') : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('');
    return { t, re: new RegExp('^' + esc + '$') };
  });
  return compiled;
}
// word index (in the spoken text's own words) chosen by the player for this line, or -1
function chosenEmphasis(text, template) {
  const exact = pron.emphasis[text];
  if (exact != null) return exact;
  if (!template) return -1;
  for (const { t, re } of compiledTemplates()) {
    if (t !== template) continue;
    const idx = pron.emphasis[t];
    if (idx == null) continue;
    const m = text.match(re);
    if (!m) continue;
    // translate the template token index into the text's word index
    let g = 1, w = 0;
    const toks = templateTokens(t);
    for (let k = 0; k < toks.length; k++) {
      const isPh = /^\{\w+\}$/.test(toks[k]);
      const n = isPh ? (m[g++].match(/[A-Za-z0-9']+/g) || []).length : 1;
      if (k === idx) return n ? w : -1;
      w += n;
    }
  }
  return -1;
}

// ---- automatic emphasis: the subject of the (first) sentence ---------------------------
const INTERJ = new Set(['oh', 'uh', 'um', 'ah', 'okay', 'ok', 'well', 'hey', 'yes', 'yeah', 'no', 'please', 'so', 'wait', 'sorry', 'fine', 'alright', 'look', 'listen', 'right', 'hm', 'mm', 'huh', 'eek', 'ack', 'gah', 'whoa', 'ow', 'ugh', 'brr', 'phew', 'oh', 'officer', 'sir', 'hello', 'hi', 'thanks', 'thank', 'and', 'but', 'then', 'really', 'seriously', 'finally']);
const DET = new Set(['the', 'a', 'an', 'my', 'your', 'our', 'their', 'his', 'her', 'its', 'some', 'every', 'all', 'no', 'any']);
const AUX = new Set(['is', 'are', 'am', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'must', 'may', 'might', 'shall']);
const VERBS = new Set([...AUX, 'need', 'needs', 'want', 'wants', 'go', 'goes', 'going', 'went', 'come', 'comes', 'came', 'get', 'got', 'know', 'knew', 'think', 'thought', 'feel', 'felt', 'see', 'saw', 'take', 'took', 'make', 'made', 'say', 'said', 'says', 'let', 'live', 'lived', 'lost', 'left', 'trust', 'swear', 'hope', 'carry', 'stay', 'stayed', 'keep', 'kept', 'give', 'gave', 'tell', 'told', 'bring', 'brought', 'find', 'found', 'hide', 'grow', 'walk', 'run', 'ran', 'burn', 'burned', 'went', 'mean', 'means', 'like', 'love', 'hate', 'look', 'looks', 'sound', 'sounds', 'seem', 'seems', 'work', 'works', 'try', 'tried', 'wait', 'waited', 'understand', 'believe', 'remember', 'forgot', 'heard', 'hear', 'help', 'sleep', 'die', 'died', 'killed', 'bit', 'bitten', 'saved', 'escaped', 'traded', 'stole']);
const PREP = new Set(['at', 'of', 'in', 'on', 'from', 'with', 'for', 'to', 'by', 'near', 'under', 'over', 'about', 'like', 'without', 'inside', 'outside']);
const WH = new Set(['where', 'what', 'who', 'why', 'how', 'when', 'which']);
const CONTRACTED = /^(i'm|i've|i'll|i'd|it's|that's|what's|there's|he's|she's|we're|we've|we'll|they're|you're|you've|you'll|let's)$/;
function isVerb(w) { return VERBS.has(w) || /n't$/.test(w) || (w.length > 4 && /ed$/.test(w)); }

export function autoEmphasis(text) {
  const words = text.match(/[A-Za-z0-9']+/g) || [];
  const lw = words.map((w) => w.toLowerCase());
  if (!lw.length) return -1;
  // first clause that has real words in it
  const firstClauseEnd = (() => { let n = 0; for (const piece of text.split(/[.!?…]+/)) { const c = (piece.match(/[A-Za-z0-9']+/g) || []).length; if (c && piece.match(/[A-Za-z0-9']+/g).some((w) => !INTERJ.has(w.toLowerCase()))) return n + c; n += c; } return lw.length; })();
  let start = 0;
  while (start < firstClauseEnd - 1 && INTERJ.has(lw[start])) start++;
  const end = firstClauseEnd;
  for (let i = start; i < end; i++) if (CONTRACTED.test(lw[i])) return i;
  let v = -1;
  for (let i = start; i < end; i++) if (isVerb(lw[i])) { v = i; break; }
  const content = (from, to, step) => { for (let i = from; step > 0 ? i < to : i >= to; i += step) if (!DET.has(lw[i]) && !INTERJ.has(lw[i]) && !AUX.has(lw[i])) return i; return -1; };
  if (v > start) {
    // wh-questions ("Where do I go?"): the subject comes after the auxiliary
    if (WH.has(lw[start]) && AUX.has(lw[v])) { const s = content(v + 1, end, 1); if (s >= 0) return s; }
    // the head of the first phrase: stop at a preposition ("The water at our camp went bad" -> water)
    let s = -1;
    for (let i = start; i < v; i++) { if (PREP.has(lw[i])) break; if (!DET.has(lw[i]) && !INTERJ.has(lw[i])) s = i; }
    if (s >= 0) return s;
    s = content(v - 1, start, -1); if (s >= 0) return s;
  }
  if (v === start) {
    // question ("Is this...") -> the thing asked about; command ("Take my jacket") -> its object
    const s = content(v + 1, end, 1);
    if (s >= 0) return s;
  }
  // no verb: the last meaningful word ("Finally... safe.")
  for (let i = end - 1; i >= start; i--) if (!DET.has(lw[i]) && !INTERJ.has(lw[i])) return i;
  return start;
}

// emphasis for a line: the player's choice if any, otherwise the detected subject
export function emphasisFor(text, template = null) {
  const c = chosenEmphasis(text, template);
  return c >= 0 ? c : autoEmphasis(text);
}
