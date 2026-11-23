// 本机保存：做题记录与界面偏好。localStorage 不可用（隐私模式、预览环境）时静默退化为只在内存里。
const KEY = 'bp-atlas:v1';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : {};
    return { results: data.results || {}, prefs: data.prefs || {} };
  } catch (err) {
    return { results: {}, prefs: {} };
  }
}

const data = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (err) { /* 存不了就算了 */ }
}

export const store = {
  // 记录一道题的作答结果；key 由题目决定，同一题多次作答累加
  record(key, ok) {
    const r = data.results[key] || { right: 0, wrong: 0, last: null };
    if (ok) r.right++; else r.wrong++;
    r.last = ok;
    data.results[key] = r;
    save();
  },
  // 最近一次答错的题
  wrongKeys() {
    return Object.entries(data.results).filter(([, r]) => r.last === false).map(([k]) => k);
  },
  stats() {
    let right = 0, wrong = 0;
    Object.values(data.results).forEach(r => { right += r.right; wrong += r.wrong; });
    return { right, wrong, total: right + wrong, wrongNow: this.wrongKeys().length };
  },
  clearResults() {
    data.results = {};
    save();
  },
  pref(name, fallback) {
    return name in data.prefs ? data.prefs[name] : fallback;
  },
  setPref(name, value) {
    if (data.prefs[name] === value) return;
    data.prefs[name] = value;
    save();
  },
};
