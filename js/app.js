// 交互入口：用户操作 → 改 state → updateUI() 刷新所有画面。
//
// 数据流（单向）：
//   state.js（选了什么）→ context.js（经 model.js 推导出该高亮什么）→ 各视图与检查器
//   视图：plexus2d.js 通路图 · limb.js 上肢图（「肌肉」页用 limb3d.js 的网格）· view3d.js 3D 解剖
//   检查器：inspector.js 底部详情 · 自测：quiz.js · 网址：urlstate.js
// 规则只有一条：改完 state 调 updateUI()。视图需要整体重建时由 updateUI 自己判断，调用方不用管。
import { PlexusModel } from './model.js';
import { nodeMap } from './data/nodes.js';
import { state, DEFAULT_3D, clearSelection, currentLevel, currentQuiz, zonePicking, labelsHidden, showCollateralsFor } from './state.js';
import { store } from './store.js';
import { getHighlightContext } from './context.js';
import { renderInspector, toggleDock } from './inspector.js';
import * as quiz from './quiz.js';
import { writeHash, readHash } from './urlstate.js';
import { initPlexus, renderPlexusSVG, applyPlexusHighlights, introPlexus } from './plexus2d.js';
import { initLimb, renderLimbSVG, applyLimbHighlights } from './limb.js';
import * as limb3d from './limb3d.js';
import * as view3d from './view3d.js';
import { initSearch } from './search.js';
import { riseIn } from './motion.js';

const $ = id => document.getElementById(id);
const LESION_KEYS = [...document.querySelectorAll('.pill[data-lesion]')].map(b => b.dataset.lesion);
const label = id => nodeMap[id].label;

// ==================== 刷新 ====================
// 只有这些状态变了才需要重建 SVG；其余变化只切换 class
let plexusKey = null, limbKey = null;
function renderIfNeeded() {
  const pk = `${state.showCollaterals}|${labelsHidden()}`;
  if (pk !== plexusKey) { plexusKey = pk; renderPlexusSVG(); }
  if (state.limbMode !== limbKey) { limbKey = state.limbMode; renderLimbSVG(); }
}

function applyAllHighlights() {
  const ctx = getHighlightContext();
  applyPlexusHighlights(ctx);
  applyLimbHighlights(ctx);
  view3d.update(ctx);
}

export function updateUI() {
  renderIfNeeded();
  document.querySelectorAll('.pill[data-lesion]').forEach(p => p.classList.toggle('active', p.dataset.lesion === state.lesionKey));
  document.querySelectorAll('#limbModeTabs .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === state.limbMode));
  document.querySelectorAll('#quizDeckTabs .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.deck === state.quizDeck));
  document.body.classList.toggle('has-lesion', !!state.lesionKey || state.cuts.size > 0);
  $('svgWrap').classList.toggle('pulse-on', state.pulse);
  $('btnPulse').classList.toggle('active', state.pulse);
  $('btnCollaterals').classList.toggle('active', state.showCollaterals);
  $('btnCut').classList.toggle('active', state.cutMode);
  $('btnQuiz').classList.toggle('active', state.quizMode);
  $('btnPresent').classList.toggle('active', state.present);
  $('btnPresent').setAttribute('aria-checked', state.present);
  $('quizBox').classList.toggle('show', state.quizMode);
  $('btnSubmitQuiz').classList.toggle('is-hidden', !zonePicking());
  // 自测时由题型决定主要作答区：反向题放大上肢图，其余题型突出通路图
  const item = currentQuiz();
  document.body.classList.toggle('quiz', state.quizMode);
  document.body.classList.toggle('quiz-reverse', !!item && item.type === 'reverse');
  $('quizWhere').textContent = !item ? ''
    : item.type === 'reverse' ? '在上肢图（前面观 / 后面观）上点选'
    : item.type === 'mcq' ? '在下面四个选项里选一个'
    : state.view === '3d' ? '在下方 3D 图上点击结构 ↓' : '在下方通路图上点击结构 ↓';
  $('quizWhere').classList.toggle('is-hidden', !item || state.quizAnswered);
  updateLevelBar();
  updateCutBar();
  // 检查器要先于上肢图：上肢图下方的损伤摘要用到检查器记下的「上一个部位」
  renderInspector(getHighlightContext());
  applyAllHighlights();
  syncViewUI();
  writeHash();
}

function updateLevelBar() {
  const bar = $('levelBar');
  const preset = state.lesionKey ? PlexusModel.LESION_PRESETS[state.lesionKey] : null;
  const show = !!preset && preset.levels.length > 1;
  bar.classList.toggle('is-hidden', !show);
  if (!show) { bar.innerHTML = ''; return; }
  const cur = currentLevel();
  bar.innerHTML = '<span class="lesion-label">部位</span><div class="seg-group">'
    + preset.levels.map(l => `<button class="seg-btn${l.key === cur ? ' active' : ''}" data-level="${l.key}">${l.name}</button>`).join('')
    + '</div>';
}

function updateCutBar() {
  const bar = $('cutBar');
  const show = state.cutMode && !state.quizMode;
  bar.classList.toggle('is-hidden', !show);
  if (!show) { bar.innerHTML = ''; return; }
  const cuts = [...state.cuts];
  bar.innerHTML = '<span class="lesion-label">已切断</span>'
    + (cuts.length
      ? cuts.map(id => `<button class="pill active" data-uncut="${id}" title="恢复">${label(id)} ✕</button>`).join('')
        + '<button class="btn btn-quiet" data-uncut="*">全部恢复</button>'
      : '<span class="cut-hint">点击任意结构切断，可切多处</span>');
}

function syncViewUI() {
  $('svgWrap').classList.toggle('is-hidden', state.view !== '2d');
  $('viewport3d').classList.toggle('is-hidden', state.view !== '3d');
  document.querySelectorAll('#viewTabs .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
  document.querySelectorAll('#sceneToggles .hud-pill').forEach(b => b.classList.toggle('active', !!state.show3d[b.dataset.toggle]));
}

// ==================== 浏览操作（按钮、键盘、网址、搜索都走这里） ====================
function setLesion(key, level) {
  quiz.leaveQuiz();
  clearSelection();
  state.cutMode = false;
  state.lesionKey = key || null;
  state.lesionLevel = key ? (level || null) : null;
  if (key === 'long_thoracic') showCollateralsFor(['long_thoracic']);
  updateUI();
}

function stepLevel(delta) {
  if (!state.lesionKey) return;
  const levels = PlexusModel.LESION_PRESETS[state.lesionKey].levels;
  const i = levels.findIndex(l => l.key === currentLevel());
  const j = Math.max(0, Math.min(levels.length - 1, i + delta));
  if (j !== i) setLesion(state.lesionKey, levels[j].key);
}

function stepLesion(delta) {
  const seq = [null, ...LESION_KEYS];
  const i = seq.indexOf(state.lesionKey);
  setLesion(seq[(i + delta + seq.length) % seq.length]);
}

function setLimbMode(mode) {
  state.limbMode = mode;
  state.selectedZoneId = null;
  updateUI();
}

function selectNode(id) {
  clearSelection();
  state.selectedId = id;
  showCollateralsFor([id]);
  updateUI();
}

// 选中一个肌肉/皮区，并把上肢图切到它所在的模式
function selectZone(zoneId) {
  const z = PlexusModel.zone(zoneId);
  clearSelection();
  state.limbMode = z.kind;
  state.selectedId = z.fibers[0].nerve;
  state.selectedZoneId = zoneId;
  showCollateralsFor(z.fibers.map(f => f.nerve));
  updateUI();
}

function setCutMode(on) {
  quiz.leaveQuiz();
  state.cutMode = on;
  clearSelection({ keepCuts: on });
  updateUI();
}

function toggleCut(id) {
  const cuts = new Set(state.cuts);
  if (cuts.has(id)) cuts.delete(id); else cuts.add(id);
  clearSelection({ keepHover: true });
  state.cuts = cuts;
  updateUI();
}

function clearAll() {
  if (state.cutMode) { setCutMode(false); return; }
  clearSelection();
  updateUI();
}

// ==================== 来自各视图的事件 ====================
const viewHandlers = {
  onNodeHover(id) {
    if (state.quizMode || id === state.hoverId) return;
    state.hoverId = id;
    applyAllHighlights();
  },
  onNodeClick(id) {
    if (state.quizMode) { quiz.answerWithNode(id); updateUI(); return; }
    if (state.cutMode) { toggleCut(id); return; }
    if (state.selectedId === id && !state.selectedZoneId) { clearSelection(); updateUI(); return; }
    selectNode(id);
  },
  onBackgroundClick() {
    if (state.quizMode || state.cutMode) return;
    clearSelection();
    updateUI();
  },
  onZoneClick(zoneId) {
    if (state.quizMode) { quiz.togglePick(zoneId); applyAllHighlights(); return; }
    selectZone(zoneId);
  },
  // 3D 走行上的损伤部位标记
  onLevelClick(key, level) {
    if (!state.quizMode) setLesion(key, level);
  },
  // 上肢图下方摘要里的名称
  onChipClick(zoneId) {
    if (!state.quizMode) selectZone(zoneId);
  },
};

function applySearchAction(a) {
  quiz.leaveQuiz();
  state.cutMode = false;
  if (a.lesion) setLesion(a.lesion, a.level);
  else if (a.node) selectNode(a.node);
  else selectZone(a.zone);
}

// ==================== 自测 ====================
function quizAction(fn) {
  return (...args) => { fn(...args); updateUI(); };
}
const toggleQuiz = quizAction(quiz.toggleQuiz);
const nextQuiz = quizAction(quiz.next);
const revealQuiz = quizAction(quiz.reveal);
const submitReverse = quizAction(() => quiz.submitReverse(false));
const answerWithOption = quizAction(quiz.answerWithOption);
const setQuizDeck = quizAction(quiz.setDeck);
const clearProgress = quizAction(quiz.clearProgress);

// ==================== 视图、主题、投影、重置 ====================
function setView(view) {
  state.view = view;
  state.hoverId = null;
  store.setPref('view', view);
  updateUI();
  if (view === '3d') view3d.show(); else view3d.hide();
}

function setTheme(dark) {
  state.dark = dark;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  $('themeLabel').textContent = dark ? '浅色主题' : '深色主题';
  view3d.setTheme(dark);
  limb3d.setTheme();
  store.setPref('theme', dark ? 'dark' : 'light');
}

// 投影模式：放大字号，图撑满窗口高度
function setPresent(on) {
  state.present = on;
  document.body.classList.toggle('present', on);
}

function togglePulse() { state.pulse = !state.pulse; updateUI(); }
function toggleCollaterals() { state.showCollaterals = !state.showCollaterals; updateUI(); }

function setCamPreset(name) {
  state.show3d.auto = false;
  view3d.setCamPreset(name);
  syncViewUI();
}

function resetAll() {
  quiz.leaveQuiz();
  clearSelection();
  state.cutMode = false;
  state.dock = true;
  store.setPref('dock', true);
  setLimbWidth(null);
  state.show3d = { ...DEFAULT_3D };
  view3d.setCamPreset('front');
  updateUI();
}

// 打开页面、或网址被手动改了：按网址重建状态
function loadFromHash(first) {
  quiz.leaveQuiz();
  clearSelection();
  state.cutMode = false;
  const { theme, present, view } = readHash(first);
  if (theme) setTheme(theme === 'dark');
  setPresent(present);
  setView(view);
}

// ==================== 工具菜单、面板宽度 ====================
function setMenu(open) {
  $('toolList').classList.toggle('is-hidden', !open);
  $('btnTools').setAttribute('aria-expanded', open);
}

// 上肢图窗格宽度：拖动分隔条调整，双击或「重置」恢复默认。px = null 表示用样式表里的默认值
function setLimbWidth(px) {
  const wb = $('workbench');
  if (px == null) wb.style.removeProperty('--limb-user');
  else {
    const max = wb.getBoundingClientRect().width * 0.7;
    px = Math.round(Math.max(300, Math.min(max, px)));
    wb.style.setProperty('--limb-user', px + 'px');
  }
  $('splitter').classList.toggle('custom', px != null);
  store.setPref('limbW', px);
}

function bindSplitter() {
  const sp = $('splitter'), pane = document.querySelector('.limb-pane');
  let drag = null;
  sp.addEventListener('pointerdown', e => {
    drag = { x: e.clientX, w: pane.getBoundingClientRect().width };
    sp.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    e.preventDefault();
  });
  sp.addEventListener('pointermove', e => { if (drag) setLimbWidth(drag.w + (drag.x - e.clientX)); });
  const end = () => { drag = null; document.body.classList.remove('resizing'); };
  sp.addEventListener('pointerup', end);
  sp.addEventListener('pointercancel', end);
  sp.addEventListener('dblclick', () => setLimbWidth(null));
  sp.addEventListener('keydown', e => {
    const w = pane.getBoundingClientRect().width;
    if (e.key === 'ArrowLeft') setLimbWidth(w + 32);
    else if (e.key === 'ArrowRight') setLimbWidth(w - 32);
    else if (e.key === 'Home' || e.key === 'Enter') setLimbWidth(null);
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
}

// ==================== 事件绑定与快捷键 ====================
function bindEvents() {
  document.querySelectorAll('.pill[data-lesion]').forEach(btn => {
    btn.addEventListener('click', () => setLesion(state.lesionKey === btn.dataset.lesion ? null : btn.dataset.lesion));
  });
  $('levelBar').addEventListener('click', e => {
    const b = e.target.closest('[data-level]');
    if (b) setLesion(state.lesionKey, b.dataset.level);
  });
  $('cutBar').addEventListener('click', e => {
    const b = e.target.closest('[data-uncut]');
    if (!b) return;
    if (b.dataset.uncut === '*') { state.cuts = new Set(); updateUI(); } else toggleCut(b.dataset.uncut);
  });
  document.querySelectorAll('#limbModeTabs .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => { if (!zonePicking()) setLimbMode(btn.dataset.mode); });
  });
  document.querySelectorAll('#quizDeckTabs .seg-btn').forEach(btn => btn.addEventListener('click', () => setQuizDeck(btn.dataset.deck)));
  $('quizOptions').addEventListener('click', e => {
    const b = e.target.closest('[data-option]');
    if (b) answerWithOption(b.dataset.option);
  });
  document.querySelectorAll('#viewTabs .seg-btn').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('#camPresets .hud-pill').forEach(b => b.addEventListener('click', () => setCamPreset(b.dataset.cam)));
  document.querySelectorAll('#sceneToggles .hud-pill').forEach(b => b.addEventListener('click', () => {
    state.show3d[b.dataset.toggle] = !state.show3d[b.dataset.toggle];
    syncViewUI();
    view3d.update(getHighlightContext());
  }));

  $('btnPulse').addEventListener('click', togglePulse);
  $('btnCollaterals').addEventListener('click', toggleCollaterals);
  $('btnCut').addEventListener('click', () => setCutMode(!state.cutMode));
  $('btnQuiz').addEventListener('click', toggleQuiz);
  $('btnNextQuiz').addEventListener('click', nextQuiz);
  $('btnRevealQuiz').addEventListener('click', revealQuiz);
  $('btnSubmitQuiz').addEventListener('click', submitReverse);
  $('btnClearProgress').addEventListener('click', clearProgress);
  $('btnExitQuiz').addEventListener('click', () => { if (state.quizMode) toggleQuiz(); });
  $('btnDock').addEventListener('click', toggleDock);
  $('btnFocus3d').addEventListener('click', focus3d);
  $('btnReset').addEventListener('click', resetAll);
  $('btnTheme').addEventListener('click', () => { setTheme(!state.dark); updateUI(); });
  $('btnPresent').addEventListener('click', () => { setPresent(!state.present); updateUI(); });
  $('btnPrint').addEventListener('click', () => window.print());
  // 工具菜单：点菜单项后收起；点别处或按 Esc 也收起
  $('btnTools').addEventListener('click', e => { e.stopPropagation(); setMenu($('toolList').classList.contains('is-hidden')); });
  $('toolList').addEventListener('click', () => setMenu(false));
  document.addEventListener('click', () => setMenu(false));
  bindSplitter();
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', () => loadFromHash(false));
}

function focus3d() {
  if (view3d.focusCurrent()) { state.show3d.auto = false; syncViewUI(); }
}

// 数字键 = 损伤预设，←/→ = 损伤部位，空格 = 冲动动画，X = 自由切断，/ = 搜索，F = 3D 聚焦当前结构；
// 投影模式下 ↑/↓ 与翻页键（翻页笔）逐个切换预设
function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  const k = e.key, lower = k.toLowerCase();
  const pager = state.present && !state.quizMode;
  let handled = true;
  if (k === 'Escape' && !$('toolList').classList.contains('is-hidden')) { setMenu(false); e.preventDefault(); return; }

  if (k === '/') $('searchInput').focus();
  else if (k === ' ') togglePulse();
  else if (lower === 'p') { setPresent(!state.present); updateUI(); }
  else if (lower === 'q') toggleQuiz();
  else if (lower === 'v') setView(state.view === '2d' ? '3d' : '2d');
  else if (lower === 'f' && state.view === '3d') focus3d();
  else if (state.quizMode) {
    const item = currentQuiz();
    if (k === 'Escape') toggleQuiz();
    else if (lower === 'n' || k === 'ArrowRight' || k === 'PageDown') nextQuiz();
    else if (k === 'Enter' && zonePicking()) submitReverse();
    else if (item && item.type === 'mcq' && k >= '1' && k <= '4' && item.options[+k - 1]) answerWithOption(item.options[+k - 1].id);
    else handled = false;
  }
  else if (lower === 'x') setCutMode(!state.cutMode);
  else if (k >= '1' && k <= '9' && LESION_KEYS[+k - 1]) setLesion(state.lesionKey === LESION_KEYS[+k - 1] ? null : LESION_KEYS[+k - 1]);
  else if (k === '0' || k === 'Escape') clearAll();
  else if ((k === 'ArrowRight' || k === 'ArrowLeft') && state.lesionKey) stepLevel(k === 'ArrowRight' ? 1 : -1);
  else if (pager && (k === 'ArrowDown' || k === 'PageDown')) stepLesion(1);
  else if (pager && (k === 'ArrowUp' || k === 'PageUp')) stepLesion(-1);
  else if (lower === 'm') { const modes = ['motor', 'cutaneous', 'dermatome']; setLimbMode(modes[(modes.indexOf(state.limbMode) + 1) % 3]); }
  else if (lower === 'c') toggleCollaterals();
  else handled = false;

  if (handled) {
    e.preventDefault();
    // 空格/回车会再次触发刚点过的按钮，先让它失焦
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
  }
}

export function init() {
  initPlexus(viewHandlers);
  initLimb(viewHandlers);
  view3d.init(viewHandlers);
  initSearch($('searchInput'), $('searchResults'), applySearchAction);
  bindEvents();
  quiz.showQuizScore();
  state.dock = store.pref('dock', true) !== false;
  const limbW = store.pref('limbW', null);
  if (typeof limbW === 'number') setLimbWidth(limbW);
  loadFromHash(true);
  introPlexus();
  riseIn([document.querySelector('.limb-pane'), ...document.querySelectorAll('#detailContent > .info-block:not(.is-hidden)')], { delay: 260, gap: 60 });
}
