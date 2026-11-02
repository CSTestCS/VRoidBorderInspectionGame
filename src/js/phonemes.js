// Rough English text -> phoneme conversion (ARPAbet-like) for the formant voice synth.
// A small dictionary covers common irregular words; letter rules handle the rest.

const DICT = {
  a: 'AX', an: 'AE N', and: 'AE N D', the: 'DH AX', i: 'AY', you: 'Y UW', your: 'Y AO R', "you're": 'Y AO R', yours: 'Y AO R Z',
  to: 'T UW', too: 'T UW', two: 'T UW', do: 'D UW', does: 'D AH Z', done: 'D AH N', one: 'W AH N', of: 'AH V', off: 'AO F',
  is: 'IH Z', was: 'W AH Z', are: 'AA R', were: 'W ER', have: 'HH AE V', has: 'HH AE Z', had: 'HH AE D', what: 'W AH T',
  who: 'HH UW', whom: 'HH UW M', whose: 'HH UW Z', where: 'W EH R', there: 'DH EH R', their: 'DH EH R', "they're": 'DH EH R',
  they: 'DH EY', them: 'DH EH M', then: 'DH EH N', than: 'DH AE N', this: 'DH IH S', that: 'DH AE T', these: 'DH IY Z',
  those: 'DH OW Z', with: 'W IH DH', without: 'W IH DH AW T', other: 'AH DH ER', another: 'AX N AH DH ER', mother: 'M AH DH ER',
  father: 'F AA DH ER', brother: 'B R AH DH ER', weather: 'W EH DH ER', here: 'HH IY R', hear: 'HH IY R', please: 'P L IY Z',
  my: 'M AY', me: 'M IY', we: 'W IY', he: 'HH IY', she: 'SH IY', be: 'B IY', been: 'B IH N', said: 'S EH D', says: 'S EH Z',
  come: 'K AH M', some: 'S AH M', love: 'L AH V', give: 'G IH V', live: 'L IH V', any: 'EH N IY', many: 'M EH N IY',
  only: 'OW N L IY', once: 'W AH N S', would: 'W UH D', could: 'K UH D', should: 'SH UH D', put: 'P UH T', want: 'W AA N T',
  water: 'W AO T ER', eye: 'AY', eyes: 'AY Z', people: 'P IY P AX L', officer: 'AO F IH S ER', "don't": 'D OW N T',
  "can't": 'K AE N T', "won't": 'W OW N T', "i'm": 'AY M', "it's": 'IH T S', "i've": 'AY V', "i'll": 'AY L', "i'd": 'AY D',
  "that's": 'DH AE T S', "what's": 'W AH T S', "there's": 'DH EH R Z', "didn't": 'D IH D AX N T', "isn't": 'IH Z AX N T',
  "wasn't": 'W AH Z AX N T', "doesn't": 'D AH Z AX N T', "haven't": 'HH AE V AX N T', "we're": 'W IY R', "let's": 'L EH T S',
  okay: 'OW K EY', ok: 'OW K EY', haven: 'HH EY V AX N', through: 'TH R UW', though: 'DH OW', thought: 'TH AO T',
  enough: 'IH N AH F', rough: 'R AH F', tough: 'T AH F', cold: 'K OW L D', old: 'OW L D', mind: 'M AY N D', kind: 'K AY N D',
  find: 'F AY N D', both: 'B OW TH', most: 'M OW S T', door: 'D AO R', floor: 'F L AO R', sure: 'SH UH R', again: 'AX G EH N',
  busy: 'B IH Z IY', get: 'G EH T', give: 'G IH V', girl: 'G ER L', gift: 'G IH F T', begin: 'B IH G IH N', of: 'AH V',
  very: 'V EH R IY', every: 'EH V R IY', everything: 'EH V R IY TH IH NG', everyone: 'EH V R IY W AH N', nothing: 'N AH TH IH NG',
  something: 'S AH M TH IH NG', anything: 'EH N IY TH IH NG', all: 'AO L', call: 'K AO L', small: 'S M AO L', talk: 'T AO K',
  walk: 'W AO K', know: 'N OW', knew: 'N UW', now: 'N AW', how: 'HH AW', show: 'SH OW', low: 'L OW', own: 'OW N', down: 'D AW N',
  town: 'T AW N', just: 'JH AH S T', from: 'F R AH M', for: 'F AO R', or: 'AO R', not: 'N AA T', no: 'N OW', so: 'S OW', go: 'G OW',
  going: 'G OW IH NG', yes: 'Y EH S', yeah: 'Y EH', hello: 'HH AX L OW', hi: 'HH AY', sorry: 'S AA R IY', thanks: 'TH AE NG K S',
  thank: 'TH AE NG K', name: 'N EY M', day: 'D EY', way: 'W EY', away: 'AX W EY', today: 'T AX D EY', work: 'W ER K', word: 'W ER D',
  world: 'W ER L D', worse: 'W ER S', worth: 'W ER TH', clothes: 'K L OW DH Z', shoes: 'SH UW Z', whole: 'HH OW L', two: 'T UW',
  four: 'F AO R', eight: 'EY T', nine: 'N AY N', ten: 'T EH N', twelve: 'T W EH L V', twenty: 'T W EH N T IY', thirty: 'TH ER T IY',
  hundred: 'HH AH N D R AX D', thousand: 'TH AW Z AX N D', because: 'B IH K AH Z', before: 'B IH F AO R', after: 'AE F T ER',
  over: 'OW V ER', under: 'AH N D ER', into: 'IH N T UW', about: 'AX B AW T', around: 'AX R AW N D', can: 'K AE N', will: 'W IH L',
  sick: 'S IH K', fine: 'F AY N', alright: 'AO L R AY T', really: 'R IY L IY', little: 'L IH T AX L', family: 'F AE M AX L IY',
  wasteland: 'W EY S T L AE N D', please: 'P L IY Z', minute: 'M IH N IH T', search: 'S ER CH', touch: 'T AH CH', young: 'Y AH NG',
  heart: 'HH AA R T', friend: 'F R EH N D', friends: 'F R EH N D Z', head: 'HH EH D', dead: 'D EH D', bread: 'B R EH D', ready: 'R EH D IY',
  great: 'G R EY T', break: 'B R EY K', move: 'M UW V', lose: 'L UW Z', whose: 'HH UW Z', idea: 'AY D IY AX', area: 'EH R IY AX',
};
const FUNCTION = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'is', 'are', 'was', 'were', 'be', 'it', 'its', 'as', 'by', 'but', 'from', 'with', 'my', 'your', 'his', 'her', 'their', 'our', 'that', 'than', 'then', 'so', 'if', 'do', 'just', 'can', 'will', 'have', 'has', 'had', 'me', 'we', 'he', 'she', 'they', 'them', 'you']);

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function num(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + num(n % 100) : '');
  if (n >= 1100 && n < 10000 && n % 100) return num(Math.floor(n / 100)) + ' ' + (n % 100 < 10 ? 'oh ' + ONES[n % 100] : num(n % 100)); // years
  if (n < 1e6) return num(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + num(n % 1000) : '');
  return String(n).split('').map((d) => ONES[+d]).join(' ');
}

const V = 'aeiouy';
const isV = (c) => !!c && V.includes(c);
const isC = (c) => !!c && /[a-z]/.test(c) && !isV(c);
const LONG = { a: 'EY', e: 'IY', i: 'AY', o: 'OW', u: 'UW', y: 'AY' };
const SHORT = { a: 'AE', e: 'EH', i: 'IH', o: 'AA', u: 'AH', y: 'IH' };
const DH_WORDS = /^(th(is|at|em|en|an|ese|ose|ey|ere|eir|us|ough))$/;

function rules(w) {
  const out = [];
  const n = w.length;
  let i = 0, skipE = -1;
  const at = (k) => w[i + k] || '';
  const rest = () => w.slice(i);
  const push = (...p) => out.push(...p);
  while (i < n) {
    const c = w[i], r = rest();
    if (i === skipE) { i++; continue; } // silent e of a magic-e syllable ("zones", "saved")
    // ---- endings
    if (r === 'tion' || r === 'tions') { push('SH', 'AX', 'N'); if (r.endsWith('s')) push('Z'); break; }
    if (r === 'sion' || r === 'sions') { push(isV(w[i - 1]) ? 'ZH' : 'SH', 'AX', 'N'); if (r.endsWith('s')) push('Z'); break; }
    if (r === 'ture' || r === 'tures') { push('CH', 'ER'); if (r.endsWith('s')) push('Z'); break; }
    if (r === 'ous') { push('AX', 'S'); break; }
    if ((r === 'le' || r === 'les') && i > 0 && isC(w[i - 1])) { push('AX', 'L'); if (r === 'les') push('Z'); break; }
    if (r === 'ed' && i > 1) { const p = w[i - 1]; if (p === 't' || p === 'd') push('IH', 'D'); else if ('pkfsxc'.includes(p) || w.slice(i - 2, i) === 'sh' || w.slice(i - 2, i) === 'ch') push('T'); else push('D'); break; }
    if (r === 'es' && i > 1 && /(s|z|x|sh|ch|ss|ge|ce)$/.test(w.slice(0, i))) { push('IH', 'Z'); break; }
    if (r === 's' && i > 0) { push(/[ptkfs]/.test(w[i - 1]) ? 'S' : 'Z'); break; }
    if ((r === 'or' || r === 'ar') && out.some((p) => VOWEL_PH.has(p)) && n > 4) { push('ER'); break; }
    if (r === 'ing' || r === 'ings') { push('IH', 'NG'); if (r.endsWith('s')) push('Z'); break; }
    if (r === 'y' && i > 0) { push(n <= 3 ? 'AY' : 'IY'); break; }
    if (r === 'ey' && i > 0) { push(n <= 4 ? 'EY' : 'IY'); break; }
    if (r === 'e' && i > 0) break; // silent final e
    // ---- consonant clusters
    if (r.startsWith('tch')) { push('CH'); i += 3; continue; }
    if (r.startsWith('sch')) { push('S', 'K'); i += 3; continue; }
    if (r.startsWith('igh')) { push('AY'); i += 3; continue; }
    if (r.startsWith('eigh')) { push('EY'); i += 4; continue; }
    if (r.startsWith('augh') || r.startsWith('ough')) { push('AO'); i += 4; continue; }
    if (r.startsWith('ch')) { push('CH'); i += 2; continue; }
    if (r.startsWith('sh')) { push('SH'); i += 2; continue; }
    if (r.startsWith('th')) { push(i === 0 && DH_WORDS.test(w) ? 'DH' : 'TH'); i += 2; continue; }
    if (r.startsWith('ph')) { push('F'); i += 2; continue; }
    if (r.startsWith('wh')) { push('W'); i += 2; continue; }
    if (r.startsWith('ck')) { push('K'); i += 2; continue; }
    if (r.startsWith('ng')) { push('NG'); i += 2; continue; }
    if (r.startsWith('nk')) { push('NG', 'K'); i += 2; continue; }
    if (r.startsWith('qu')) { push('K', 'W'); i += 2; continue; }
    if (r.startsWith('gh')) { if (i === 0) push('G'); i += 2; continue; }
    if (i === 0 && (r.startsWith('kn') || r.startsWith('gn'))) { push('N'); i += 2; continue; }
    if (i === 0 && r.startsWith('wr')) { push('R'); i += 2; continue; }
    if (r === 'mb') { push('M'); break; }
    // ---- r-controlled and vowel teams
    if (r.startsWith('ear')) { if (isC(at(3)) && at(3) !== 's') push('ER'); else push('IH', 'R'); i += 3; continue; }
    if (/^(arr|err|irr|orr|urr)/.test(r)) { push({ a: 'AE', e: 'EH', i: 'IH', o: 'AO', u: 'ER' }[c]); if (c !== 'u') push('R'); i += 3; continue; }
    if (i === 0 && r.startsWith('al') && isC(at(2)) && at(2) !== 'l' && at(2) !== 'b') { push('AO', 'L'); i += 2; continue; }
    if (i === 0 && c === 'a' && isC(at(1)) && isV(at(2)) && at(1) !== 'r' && n > 3) { push('AX'); i++; continue; }
    if (r.startsWith('air')) { push('EH', 'R'); i += 3; continue; }
    if (r.startsWith('our')) { push('AW', 'ER'); i += 3; continue; }
    if (r.startsWith('ar') && !isV(at(2)) || r === 'ar') { push('AA', 'R'); i += 2; continue; }
    if (r.startsWith('or') && !isV(at(2)) || r === 'or') { push('AO', 'R'); i += 2; continue; }
    if (/^(er|ir|ur)/.test(r) && (!isV(at(2)) || r.length === 2)) { push('ER'); i += 2; if (w[i] === 'r') i++; continue; }
    if (r.startsWith('ee')) { push('IY'); i += 2; continue; }
    if (r.startsWith('ea')) { push('IY'); i += 2; continue; }
    if (r.startsWith('oo')) { push(at(2) === 'k' || at(2) === 'd' ? 'UH' : 'UW'); i += 2; continue; }
    if (r.startsWith('ou')) { push('AW'); i += 2; continue; }
    if (r.startsWith('ow')) { push(i + 2 >= n && /[lnr]$|sh$/.test(w.slice(0, i)) ? 'OW' : 'AW'); i += 2; continue; }
    if (r.startsWith('ai') || r.startsWith('ay')) { push('EY'); i += 2; continue; }
    if (r.startsWith('oa')) { push('OW'); i += 2; continue; }
    if (r.startsWith('oi') || r.startsWith('oy')) { push('OY'); i += 2; continue; }
    if (r.startsWith('au') || r.startsWith('aw')) { push('AO'); i += 2; continue; }
    if (r.startsWith('ie')) { push(i + 2 >= n ? 'AY' : 'IY'); i += 2; continue; }
    if (r.startsWith('ei')) { push('EY'); i += 2; continue; }
    if (r.startsWith('ue') || r.startsWith('ew') || r.startsWith('ui')) { push('UW'); i += 2; continue; }
    if (r.startsWith('all')) { push('AO', 'L'); i += 3; continue; }
    if (r.startsWith('alk')) { push('AO', 'K'); i += 3; continue; }
    if (i > 0 && out[out.length - 1] === 'W' && c === 'a' && !/^a(ck|ng|x|y)/.test(r)) { push('AA'); i++; continue; }
    // ---- single vowels
    if (isV(c)) {
      if (c === 'y' && i === 0) { push('Y'); i++; continue; }
      // magic e: vowel + one consonant + e (+ s/d) at the end
      const tail = w.slice(i + 1);
      if (/^[bcdfgklmnprstvz]e[sd]?$/.test(tail) && c !== 'y') { push(LONG[c]); skipE = i + 2; i++; continue; }
      // open syllable at the start of a longer word: "paper", "music", "open"
      if (i === 0 && isC(at(1)) && isV(at(2)) && n > 4 && 'aiou'.includes(c) && !/^(an|en|in|on|un|ab|ob|ev)/.test(w)) { push(LONG[c]); i++; continue; }
      if (c === 'o' && at(1) === 'l' && at(2) === 'd') { push('OW'); i++; continue; }
      // reduce unstressed vowels late in long words
      if (out.some((p) => VOWEL_PH.has(p)) && i >= n - 3 && n > 4 && 'aeo'.includes(c)) { push('AX'); i++; continue; }
      push(SHORT[c]); i++; continue;
    }
    // ---- single consonants
    if (c === w[i + 1] && c !== 'c') { i++; continue; } // doubled
    if (c === 'c') {
      if (at(1) === 'c') { push('K'); if (/[eiy]/.test(at(2))) push('S'); i += 2; continue; }
      push(/[eiy]/.test(at(1)) ? 'S' : 'K'); i++; continue;
    }
    if (c === 'g') { push(/[eiy]/.test(at(1)) && i > 0 && w[i - 1] !== 'g' ? 'JH' : 'G'); i++; continue; }
    if (c === 'x') { push(...(i === 0 ? ['Z'] : ['K', 'S'])); i++; continue; }
    if (c === 's') { push(isV(w[i - 1]) && isV(at(1)) && i > 0 ? 'Z' : 'S'); i++; continue; }
    if (c === 'j') { push('JH'); i++; continue; }
    if (c === 'y') { push('Y'); i++; continue; }
    if (c === 'h') { if (i === 0 || isV(at(1))) push('HH'); i++; continue; }
    const map = { b: 'B', d: 'D', f: 'F', k: 'K', l: 'L', m: 'M', n: 'N', p: 'P', r: 'R', t: 'T', v: 'V', w: 'W', z: 'Z', q: 'K' };
    if (map[c]) push(map[c]);
    i++;
  }
  if (!out.some((p) => VOWEL_PH.has(p))) out.push('AX');
  return out;
}

export const VOWEL_PH = new Set(['AA', 'AE', 'AH', 'AO', 'EH', 'ER', 'IH', 'IY', 'UH', 'UW', 'AX', 'EY', 'AY', 'OW', 'AW', 'OY']);

const cache = new Map();
export function wordPhonemes(word) {
  const w = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!w) return [];
  if (cache.has(w)) return cache.get(w);
  let ph = DICT[w] ? DICT[w].split(' ') : null;
  if (!ph && w.endsWith("'s") && DICT[w.slice(0, -2)]) ph = [...DICT[w.slice(0, -2)].split(' '), 'Z'];
  if (!ph) {
    // compounds of two known words: "somewhere", "nowhere", "everybody"
    for (let k = 2; k <= w.length - 2 && !ph; k++) { const a = DICT[w.slice(0, k)], b = DICT[w.slice(k)]; if (a && b && k >= 2 && w.length - k >= 3) ph = [...a.split(' '), ...b.split(' ')]; }
  }
  if (!ph) ph = rules(w.replace(/'/g, ''));
  cache.set(w, ph);
  return ph;
}

// -> [{ word, ph: [...], stress: index of the stressed vowel (or -1) } | { pause: '.' }]
export function textToPhonemes(text) {
  const out = [];
  const norm = text.replace(/(\d+)\s*cm\b/gi, '$1 centimetres').replace(/\d+/g, (d) => ' ' + num(+d) + ' ').replace(/[—–-]/g, ' , ').replace(/&/g, ' and ');
  const tokens = norm.match(/[A-Za-z']+|[.,!?;:…]+/g) || [];
  for (const tk of tokens) {
    if (/^[.,!?;:…]+$/.test(tk)) { out.push({ pause: tk }); continue; }
    // spell out short all-caps abbreviations (ID, UV)
    if (/^[A-Z]{2,3}$/.test(tk)) {
      const LET = { I: 'AY', D: 'D IY', U: 'Y UW', V: 'V IY', O: 'OW', K: 'K EY', A: 'EY', C: 'S IY', M: 'EH M', N: 'EH N', S: 'EH S', T: 'T IY', X: 'EH K S', R: 'AA R', P: 'P IY', B: 'B IY', E: 'IY', F: 'EH F', G: 'JH IY', H: 'EY CH', L: 'EH L', W: 'D AH B AX L Y UW', Y: 'W AY', Z: 'Z IY', J: 'JH EY', Q: 'K Y UW' };
      const ph = tk.split('').flatMap((ch) => (LET[ch] || 'AX').split(' '));
      out.push({ word: tk, ph, stress: ph.reduce((a, p, k) => (VOWEL_PH.has(p) ? k : a), -1) });
      continue;
    }
    const ph = wordPhonemes(tk);
    const lw = tk.toLowerCase();
    const first = ph.findIndex((p) => VOWEL_PH.has(p) && p !== 'AX');
    out.push({ word: tk, ph, stress: FUNCTION.has(lw) ? -1 : first });
  }
  return out;
}
