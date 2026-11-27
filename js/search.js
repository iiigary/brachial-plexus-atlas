// 顶部搜索：结构名、肌肉/皮区名、损伤名、体征与试验别名。子串匹配，名字命中排在前面。
import { PlexusModel } from './model.js';
import { NODES, STAGE_NAMES } from './data/nodes.js';
import { LESIONS } from './data/lesions.js';
import { SEARCH_ALIASES } from './data/clinical.js';

const KIND_NAMES = { motor: '肌肉', cutaneous: '皮区', dermatome: '皮节' };
const norm = s => (s || '').toLowerCase().replace(/[\s·・（）()]/g, '');

function buildIndex() {
  const out = [];
  NODES.forEach(n => out.push({
    label: n.label, tag: STAGE_NAMES[n.stage], sub: `${n.en} · ${PlexusModel.segLabel(n.id)}`,
    names: [n.label, n.en, n.sub, n.id], text: [n.motor, n.sensory].join(' '), action: { node: n.id },
  }));
  PlexusModel.ZONES.forEach(t => out.push({
    label: t.name, tag: KIND_NAMES[t.kind], sub: '在上肢图上反向溯源',
    names: [t.name, ...t.name.split(/[/（）()·]/)], text: '', action: { zone: t.id },
  }));
  Object.entries(PlexusModel.LESION_PRESETS).forEach(([key, preset]) => preset.levels.forEach(l => out.push({
    label: `${LESIONS[key].title} · ${l.name}`, tag: '损伤', sub: LESIONS[key].sub,
    names: [LESIONS[key].title, LESIONS[key].sub, l.name], text: LESIONS[key].levels[l.key].clinical, action: { lesion: key, level: l.key },
  })));
  SEARCH_ALIASES.forEach(a => out.push({
    label: a.label, tag: '体征', sub: a.terms.slice(0, 4).join(' / '), names: a.terms, text: '', action: a.action,
  }));
  return out.map(e => ({ ...e, keys: e.names.filter(Boolean).map(norm), body: norm(e.text) }));
}

function score(e, q) {
  let best = 0;
  for (const k of e.keys) {
    if (k === q) best = Math.max(best, 100);
    else if (k.startsWith(q)) best = Math.max(best, 70);
    else if (k.includes(q)) best = Math.max(best, 50);
  }
  if (!best && e.body.includes(q)) best = 20;
  return best;
}

export function initSearch(input, list, onPick) {
  const index = buildIndex();
  let results = [], active = 0;

  const close = () => { list.classList.add('is-hidden'); list.innerHTML = ''; results = []; };
  const pick = i => {
    const r = results[i];
    if (!r) return;
    close();
    input.value = '';
    input.blur();
    onPick(r.action);
  };
  const render = () => {
    list.innerHTML = results.map((r, i) =>
      `<div class="search-item${i === active ? ' active' : ''}" role="option" data-i="${i}">`
      + `<span class="search-tag">${r.tag}</span><span class="search-label">${r.label}</span>`
      + `<span class="search-sub">${r.sub}</span></div>`).join('')
      || '<div class="search-empty">没有找到，试试「垂腕」「C7」「三角肌」</div>';
    list.classList.remove('is-hidden');
  };

  input.addEventListener('input', () => {
    const q = norm(input.value);
    if (!q) { close(); return; }
    results = index.map(e => ({ e, s: score(e, q) })).filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || a.e.label.length - b.e.label.length).slice(0, 9).map(x => x.e);
    active = 0;
    render();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results.length) return;
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape') {
      close();
      input.value = '';
      input.blur();
    }
  });
  list.addEventListener('mousedown', e => {
    const item = e.target.closest('[data-i]');
    if (item) { e.preventDefault(); pick(+item.dataset.i); }
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
}
