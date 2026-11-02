// Pronunciation & emphasis editor: every spoken word with a "say it like" box, and every
// spoken line where the player picks the emphasised word.
import { el } from './util.js';
import { pron, savePron, speechCatalog, templateTokens, autoEmphasis } from './pron.js';
import { audio } from './audio.js';
import { makeVoiceProfile } from './voice.js';

const SAMPLE = { first: 'Marcus', last: 'Holloway', hesitate: 'Uh... ', date: '7 March 2031', origin: 'Copperline' };
const fill = (t) => t.replace(/\{(\w+)\}/g, (_, k) => SAMPLE[k] ?? k);
let previewVoice = 0;
function hear(text, opts = {}) {
  const female = previewVoice % 2 === 0;
  audio.voice(text, female, { profile: makeVoiceProfile(female ? 7 : 3, female ? 'female' : 'male'), ...opts });
}

export function openPronunciation(ui) {
  const cat = speechCatalog();
  let tab = 'words', query = '', page = 0, saveT = 0;
  const PER = 120;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => savePron(), 400); };
  const body = el('div', { class: 'pron-body' });
  const search = el('input', { placeholder: 'Search…', oninput: (e) => { query = e.target.value.trim().toLowerCase(); page = 0; render(); } });
  const tabBtn = (id, label) => el('button', { class: 'pron-tab', onclick: () => { tab = id; page = 0; render(); } }, label);
  const tabs = el('div', { class: 'row', style: { marginTop: 0 } }, tabBtn('words', 'Words'), tabBtn('sentences', 'Sentences'),
    el('span', { style: { flex: 1 } }),
    el('button', { title: 'Switch the preview between a female and a male voice', onclick: (e) => { previewVoice++; e.target.textContent = previewVoice % 2 ? 'Preview voice: male' : 'Preview voice: female'; } }, 'Preview voice: female'));
  const help = el('p', { class: 'muted' });
  const pager = el('div', { class: 'row' });

  function render() {
    for (const b of tabs.querySelectorAll('.pron-tab')) b.classList.toggle('primary', b.textContent.toLowerCase() === tab);
    body.innerHTML = '';
    pager.innerHTML = '';
    let items;
    if (tab === 'words') {
      help.innerHTML = 'Type how a word should <b>sound</b>; the voice reads your spelling instead of the real one (e.g. <i>Holloway</i> → <i>holl-oh-way</i>). Use CAPITALS for the stressed part (<i>mar-KUSS</i>). Leave empty for the default.';
      items = cat.words.filter((w) => !query || w.includes(query) || (pron.words[w] || '').toLowerCase().includes(query));
      const changedFirst = items.filter((w) => pron.words[w]).concat(items.filter((w) => !pron.words[w]));
      for (const w of changedFirst.slice(page * PER, (page + 1) * PER)) {
        const inp = el('input', { value: pron.words[w] || '', placeholder: w, oninput: (e) => { const v = e.target.value; if (v.trim()) pron.words[w] = v; else delete pron.words[w]; save(); } });
        body.append(el('div', { class: 'pron-row' }, el('span', { class: 'pron-word' }, w), inp,
          el('button', { title: 'Hear it', onclick: () => hear(w.charAt(0).toUpperCase() + w.slice(1) + '.', { emphasis: -1 }) }, '▶')));
      }
    } else {
      help.innerHTML = 'Click the word that should carry the <b>emphasis</b>. Outlined = picked automatically (the sentence\'s subject); filled = your choice. Click your choice again to go back to automatic. Words in {braces} stand for names, dates and places.';
      items = cat.lines.filter((t) => !query || t.toLowerCase().includes(query));
      for (const t of items.slice(page * PER, (page + 1) * PER)) {
        const toks = templateTokens(t);
        const chosen = pron.emphasis[t];
        // automatic choice, mapped from the filled-in sample back to template tokens
        const autoW = autoEmphasis(fill(t));
        let autoTok = -1, w = 0;
        toks.forEach((tk, k) => { const n = /^\{/.test(tk) ? (fill(tk).match(/[A-Za-z0-9']+/g) || []).length : 1; if (autoTok < 0 && autoW >= w && autoW < w + n) autoTok = k; w += n; });
        const line = el('div', { class: 'pron-line' });
        // rebuild the sentence with clickable word chips, keeping punctuation in place
        let rest = t, k = 0;
        while (rest.length) {
          const m = rest.match(/\{\w+\}|[A-Za-z0-9']+/);
          if (!m) { line.append(rest); break; }
          if (m.index) line.append(rest.slice(0, m.index));
          const idx = k++;
          const cls = 'pron-chip' + (chosen === idx ? ' chosen' : chosen == null && autoTok === idx ? ' auto' : '');
          line.append(el('span', { class: cls, onclick: () => { if (pron.emphasis[t] === idx) delete pron.emphasis[t]; else pron.emphasis[t] = idx; save(); render(); } }, m[0]));
          rest = rest.slice(m.index + m[0].length);
        }
        body.append(el('div', { class: 'pron-row sentence' }, line, el('button', { title: 'Hear it', onclick: () => hear(fill(t), { template: t }) }, '▶')));
      }
    }
    const pages = Math.ceil(items.length / PER);
    if (pages > 1) {
      pager.append(el('button', { disabled: page === 0, onclick: () => { page--; render(); body.scrollTop = 0; } }, '‹ Prev'),
        el('span', { class: 'muted', style: { alignSelf: 'center' } }, `Page ${page + 1} / ${pages} · ${items.length} ${tab}`),
        el('button', { disabled: page >= pages - 1, onclick: () => { page++; render(); body.scrollTop = 0; } }, 'Next ›'));
    } else pager.append(el('span', { class: 'muted' }, `${items.length} ${tab}`));
  }
  render();
  const m = ui.modal(el('div', { class: 'pron-editor' }, tabs, search, help, body, pager,
    el('div', { class: 'row' }, el('button', { class: 'primary', onclick: () => { savePron(); m.close(); } }, 'Done'))),
  { title: 'Pronunciation & Emphasis', cls: 'wide', onClose: () => savePron() });
  return m;
}
