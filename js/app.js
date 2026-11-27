// 交互核心：状态操作、高亮上下文、检查器、自测、网址状态、快捷键。
// 2D 图（plexus2d.js）、上肢图（limb.js）、3D（view3d.js）都从这里取同一份高亮上下文。
import { PlexusModel } from './model.js';
import { nodeMap, SPATIAL, STAGE_NAMES } from './data/nodes.js';
import { LIMB_ZONES } from './data/limb.js';
import { LESIONS } from './data/lesions.js';
import { QUIZ_BANK, CASES } from './data/quiz.js';
import { CLINICAL } from './data/clinical.js';
import { generateMCQ, MCQ_TYPES } from './quizgen.js';
import { state, DEFAULT_3D } from './state.js';
import { store } from './store.js';
import { renderPlexusSVG, applyPlexusHighlights, introPlexus } from './plexus2d.js';
import { riseIn } from './motion.js';
import { renderLimbSVG, applyLimbHighlights } from './limb.js';
import * as limb3d from './limb3d.js';
import * as view3d from './view3d.js';
import { initSearch } from './search.js';

const $ = id => document.getElementById(id);
const svgWrap = $('svgWrap');
const LESION_KEYS = [...document.querySelectorAll('.pill[data-lesion]')].map(b => b.dataset.lesion);
const label = id => nodeMap[id].label;
const tname = id => PlexusModel.target(id).name;

// ==================== 高亮上下文 ====================
// 全部来自 PlexusModel（纤维路由），不按图的连通性推断。
let ctxCache = { key: null, value: null };
export function getActiveNodeContext() {
  const key = [state.lesionKey, state.lesionLevel, [...state.cuts].join(','), state.hoverId, state.selectedId, state.selectedZoneId].join('|');
  if (key !== ctxCache.key) ctxCache = { key, value: buildNodeContext() };
  return ctxCache.value;
}

// sites = 要打上「选中/损伤点」标记的节点（根性撕脱、多处切断时不止一个）
function buildNodeContext() {
  if (state.lesionKey) return { ...PlexusModel.lesion(state.lesionKey, state.lesionLevel), isLesion: true };
  if (state.cuts.size) {
    const cuts = [...state.cuts];
    return { ...PlexusModel.lesionAt(cuts), levelName: cuts.map(label).join(' + '), isLesion: true, isCut: true };
  }
  const one = id => ({ ...PlexusModel.trace(id), activeId: id, sites: new Set([id]), isLesion: false });
  if (state.hoverId) return one(state.hoverId);
  if (!state.selectedId) return null;
  if (state.selectedZoneId) {
    const t = PlexusModel.target(state.selectedZoneId);
    return {
      ...PlexusModel.traceTarget(state.selectedZoneId),
      activeId: state.selectedId, sites: new Set(t.fibers.map(f => f.nerve)), zoneId: state.selectedZoneId, isLesion: false,
    };
  }
  return one(state.selectedId);
}

export function applyAllHighlights() {
  const ctx = getActiveNodeContext();
  applyPlexusHighlights(ctx);
  applyLimbHighlights(ctx);
  view3d.update(ctx);
}

// ==================== 状态操作（按钮、键盘、网址、搜索都走这里） ====================
function clearFocus() {
  state.selectedId = null;
  state.hoverId = null;
  state.lesionKey = null;
  state.lesionLevel = null;
  state.selectedZoneId = null;
  state.cuts = new Set();
}

// 离开自测去做别的事（选损伤、搜索、切断）：不恢复进入前的上下文，因为用户已经选了新的去处
function exitQuiz() {
  if (!state.quizMode) return;
  state.quizMode = false;
  state.quizPicks = new Set();
  state.quizResult = null;
  quizReturn = null;
  renderPlexusSVG();
}

function ensureCollateralsFor(ids) {
  if (state.showCollaterals || !ids.some(id => nodeMap[id].stage === 'collateral')) return;
  state.showCollaterals = true;
  renderPlexusSVG();
}

function setLesion(key, level) {
  exitQuiz();
  clearFocus();
  state.cutMode = false;
  state.lesionKey = key || null;
  state.lesionLevel = key ? (level || null) : null;
  if (key === 'long_thoracic') ensureCollateralsFor(['long_thoracic']);
  updateUI();
}

function currentLevel() {
  if (!state.lesionKey) return null;
  return state.lesionLevel || PlexusModel.LESION_SITES[state.lesionKey].def;
}

function stepLevel(delta) {
  if (!state.lesionKey) return;
  const levels = PlexusModel.LESION_SITES[state.lesionKey].levels;
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
  renderLimbSVG();
  updateUI();
}

function selectNode(id) {
  clearFocus();
  state.selectedId = id;
  ensureCollateralsFor([id]);
  updateUI();
}

function selectZone(zoneId) {
  const t = PlexusModel.target(zoneId);
  clearFocus();
  state.selectedId = t.fibers[0].nerve;
  state.selectedZoneId = zoneId;
  ensureCollateralsFor(t.fibers.map(f => f.nerve));
  updateUI();
}

function setCutMode(on) {
  exitQuiz();
  state.cutMode = on;
  state.lesionKey = null;
  state.lesionLevel = null;
  state.selectedId = null;
  state.selectedZoneId = null;
  state.hoverId = null;
  if (!on) state.cuts = new Set();
  updateUI();
}

function toggleCut(id) {
  state.lesionKey = null;
  state.lesionLevel = null;
  state.selectedId = null;
  state.selectedZoneId = null;
  const cuts = new Set(state.cuts);
  if (cuts.has(id)) cuts.delete(id); else cuts.add(id);
  state.cuts = cuts;
  updateUI();
}

// ==================== 来自各视图的事件 ====================
export function onNodeHover(id) {
  if (state.quizMode || id === state.hoverId) return;
  state.hoverId = id;
  applyAllHighlights();
}

export function onNodeClick(id) {
  if (state.quizMode) { handleQuizAnswer(id); return; }
  if (state.cutMode) { toggleCut(id); return; }
  if (state.selectedId === id && !state.selectedZoneId) { clearFocus(); updateUI(); return; }
  selectNode(id);
}

export function onBackgroundClick() {
  if (state.quizMode || state.cutMode) return;
  clearFocus();
  updateUI();
}

export function onZoneClick(zoneId) {
  if (state.quizMode) { toggleQuizPick(zoneId); return; }
  if (state.limbMode !== PlexusModel.target(zoneId).kind) {
    state.limbMode = PlexusModel.target(zoneId).kind;
    renderLimbSVG();
  }
  selectZone(zoneId);
}

export function onChipClick(zoneId) {
  if (!state.quizMode) selectZone(zoneId);
}

export function applySearchAction(a) {
  exitQuiz();
  state.cutMode = false;
  if (a.lesion) { setLesion(a.lesion, a.level); return; }
  if (a.node) { selectNode(a.node); return; }
  const t = PlexusModel.target(a.zone);
  if (t.kind !== state.limbMode) { state.limbMode = t.kind; renderLimbSVG(); }
  selectZone(a.zone);
}

// ==================== 检查器 ====================
const names = ids => ids.map(tname).join('、');
function lesionSummary(ctx) {
  const by = (kind, sev) => [...ctx.severity].filter(([id, s]) => PlexusModel.target(id).kind === kind && s === sev).map(([id]) => id);
  const part = (full, partial) => [full.length ? `完全：${names(full)}` : '', partial.length ? `部分：${names(partial)}` : ''].filter(Boolean).join('；') || '无';
  const sensory = part(by('cutaneous', 'full'), by('cutaneous', 'partial'));
  const derm = by('dermatome', 'full');
  return {
    motor: part(by('motor', 'full'), by('motor', 'partial')),
    sensory: sensory + (derm.length ? `。皮节：${names(derm)}` : ''),
    spared: ctx.spared.length ? names(ctx.spared) : '',
  };
}

// 同一损伤类别内切换部位时，记住上一个部位的受累范围，用来说明「变了什么」
let lesionCur = null, lesionPrev = null;
function trackLesion(ctx) {
  if (!state.lesionKey || !ctx || state.quizMode) { lesionCur = lesionPrev = null; return; }
  if (lesionCur && lesionCur.key === ctx.key && lesionCur.level === ctx.level) return;
  lesionPrev = lesionCur && lesionCur.key === ctx.key ? lesionCur : null;
  lesionCur = { key: ctx.key, level: ctx.level, levelName: ctx.levelName, severity: ctx.severity };
}

// 当前损伤的一句话摘要，供上肢图下方显示。全部取自模型和 LESIONS 的现有文字，不另写一份事实。
export function lesionDigest(ctx) {
  const out = { site: '', sign: '', why: '', diff: '' };
  if (state.lesionKey) {
    const L = LESIONS[state.lesionKey];
    out.site = `${L.title} · ${ctx.levelName}`;
    // 体征是这个部位的结果，取临床说明的第一句
    out.sign = L.levels[ctx.level].clinical.split('。')[0] + '。';
  } else {
    out.site = `切断：${ctx.levelName}`;
  }
  const sites = [...ctx.sites];
  if (ctx.branch) {
    const parents = [...new Set(sites.filter(id => id in PlexusModel.BRANCH_LV).map(id => label(PlexusModel.parentsOf(id)[0])))];
    out.why = `只伤到分支，${parents.join('、')}主干和它的其余分支照常工作。`;
  } else if (ctx.spared.length) {
    out.why = '「保留」的分支在损伤平面的近端已经从主干分出，所以不受影响。';
  } else if (ctx.preganglionic) {
    out.why = '根部（节前）损伤：直接从神经根发出的旁支也一并受累。';
  } else if ([...ctx.severity.values()].includes('partial')) {
    out.why = '「部分」= 这块肌肉或皮区还有别的节段或神经供应，只断了其中一部分。';
  }
  if (state.lesionKey && lesionPrev && lesionCur && lesionCur.level === ctx.level) {
    const a = lesionPrev.severity, b = ctx.severity;
    const gone = [...a.keys()].filter(id => !b.has(id) && !id.startsWith('d_'));
    const added = [...b.keys()].filter(id => !a.has(id) && !id.startsWith('d_'));
    const changed = [...b.keys()].filter(id => a.has(id) && a.get(id) !== b.get(id));
    const parts = [
      gone.length ? `不再受累 ${names(gone)}` : '',
      added.length ? `新增受累 ${names(added)}` : '',
      changed.length ? `程度改变 ${names(changed)}` : '',
    ].filter(Boolean);
    out.diff = `较「${lesionPrev.levelName}」：${parts.length ? parts.join('；') : '肌肉与皮区的受累范围相同'}。`;
  }
  return out;
}

function renderClinicalCard(id) {
  const card = CLINICAL[id];
  $('dCard').classList.toggle('is-hidden', !card);
  if (!card) return;
  const rows = [['试验', card.tests], ['体征', card.signs], ['口诀', card.mnemonic && [card.mnemonic]], ['病因', card.causes]];
  $('dCardBody').innerHTML = rows.filter(([, v]) => v && v.length)
    .map(([k, v]) => `<dt>${k}</dt><dd>${v.map(x => `<span>${x}</span>`).join('')}</dd>`).join('');
}

function setText(f) {
  for (const [id, text] of Object.entries(f)) $(id).textContent = text;
}

function updateInspector(ctx) {
  const tags = $('dTags');
  $('detailContent').classList.toggle('is-lesion', !!(ctx && ctx.isLesion));
  if (ctx && ctx.isLesion) {
    const plexusTags = !ctx.isNerve
      ? `<span class="tag">${ctx.preganglionic ? '节前（根性）损伤' : '节后损伤'}</span><span class="tag">Horner 征：${ctx.horner ? '有' : '无'}</span>`
      : '';
    if (state.lesionKey) {
      const L = LESIONS[state.lesionKey];
      const T = L.levels[ctx.level];
      // 部位已在部位条和节段说明里，这里只留节前/节后与 Horner
      tags.innerHTML = plexusTags;
      // 标题同时写出类别和部位，如「桡神经损伤 · 骨间后神经」
      setText({ dTitle: `${L.title} · ${ctx.levelName}`, dSub: L.sub, dSegments: T.segments, dMotor: T.motor, dSensory: T.sensory, dClinical: T.clinical, dSpatial: L.spatial });
    } else {
      const cuts = [...ctx.sites];
      const s = lesionSummary(ctx);
      const notes = [];
      if (ctx.horner) notes.push('T1 根在发出白交通支之前受损，伴同侧 Horner 综合征。');
      if (ctx.preganglionic) notes.push('全部切断点都在根部，按根性撕脱（节前）演示：麻木区的感觉神经动作电位保留，不能自行恢复。根部附近的节后断裂也会有同样的瘫痪范围，要靠肌电图和影像区分。');
      if (ctx.spared.length) notes.push(`同一神经上未受累的分支：${s.spared}。`);
      if (!notes.length) notes.push('切断点都在节后（干、股、束或周围神经）。');
      // 切断点已在标题和节段里列出，标签只留判断性信息
      tags.innerHTML = (ctx.isCut && state.quizMode ? '<span class="tag lesion">答案演示</span>' : '') + plexusTags;
      setText({
        dTitle: `切断：${ctx.levelName}`,
        dSub: cuts.map(id => nodeMap[id].en).join(' + '),
        dSegments: cuts.map(id => `${label(id)}（${PlexusModel.segLabel(id)}）`).join('；'),
        dMotor: s.motor, dSensory: s.sensory, dClinical: notes.join(''),
        dSpatial: SPATIAL[cuts[cuts.length - 1]],
      });
    }
    renderClinicalCard([...ctx.sites][0]);
    return;
  }

  if (!state.selectedId) {
    tags.innerHTML = '';
    setText({
      dTitle: '臂丛神经',
      dSub: 'Brachial Plexus',
      dSegments: '由 C5–C8 及 T1 脊神经前支组成，经前、中斜角肌间隙穿出，跨越第 1 肋进入腋窝。',
      dMotor: '前股系统（外侧束、内侧束）主要支配屈肌群；后股系统全部汇合为后束，支配伸肌群。',
      dSensory: '皮节：C5 肩及臂外侧，C6 前臂外侧与拇指，C7 中指，C8 小指与前臂内侧远端，T1 臂内侧。',
      dClinical: '上臂丛损伤（Erb）累及肩外展与屈肘；下臂丛损伤（Klumpke）累及手内在肌。',
      dSpatial: '三干的后股向深面汇合于腋动脉后方形成后束；前股居于动脉前方形成外侧束与内侧束，并在动脉前方合成“M”形正中神经。',
    });
    $('dCard').classList.add('is-hidden');
    return;
  }

  const n = nodeMap[state.selectedId];
  tags.innerHTML = `<span class="tag">${STAGE_NAMES[n.stage]}</span><span class="tag">${PlexusModel.segLabel(n.id)}</span>`;
  const minor = PlexusModel.minorLabel(n.id);
  setText({
    dTitle: n.label, dSub: n.en,
    dSegments: minor ? `${minor} 为部分/变异参与，通路图中以虚线表示。` : '',
    dMotor: n.motor, dSensory: n.sensory, dClinical: n.clinical, dSpatial: SPATIAL[n.id],
  });
  renderClinicalCard(n.id);
}

function updateLevelBar() {
  const bar = $('levelBar');
  const def = state.lesionKey ? PlexusModel.LESION_SITES[state.lesionKey] : null;
  const show = !!def && def.levels.length > 1;
  bar.classList.toggle('is-hidden', !show);
  if (!show) { bar.innerHTML = ''; return; }
  const cur = currentLevel();
  bar.innerHTML = '<span class="lesion-label">部位</span><div class="seg-group">'
    + def.levels.map(l => `<button class="seg-btn${l.key === cur ? ' active' : ''}" data-level="${l.key}">${l.name}</button>`).join('')
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

export function updateUI() {
  document.querySelectorAll('.pill[data-lesion]').forEach(p => p.classList.toggle('active', p.dataset.lesion === state.lesionKey));
  document.querySelectorAll('#limbModeTabs .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === state.limbMode));
  document.querySelectorAll('#quizDeckTabs .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.deck === state.quizDeck));
  document.body.classList.toggle('has-lesion', !!state.lesionKey || state.cuts.size > 0);
  svgWrap.classList.toggle('pulse-on', state.pulse);
  $('btnPulse').classList.toggle('active', state.pulse);
  $('btnCollaterals').classList.toggle('active', state.showCollaterals);
  $('btnCut').classList.toggle('active', state.cutMode);
  $('btnQuiz').classList.toggle('active', state.quizMode);
  $('btnPresent').classList.toggle('active', state.present);
  $('btnPresent').setAttribute('aria-checked', state.present);
  $('quizBox').classList.toggle('show', state.quizMode);
  $('btnSubmitQuiz').classList.toggle('is-hidden', !zonePicking());
  // 自测时由题型决定主要作答区：反向题放大上肢图，其余题型突出通路图
  const item = state.quizMode ? currentQuiz() : null;
  document.body.classList.toggle('quiz', state.quizMode);
  document.body.classList.toggle('quiz-zones', !!item && item.kind === 'zones');
  $('quizWhere').textContent = !item ? ''
    : item.kind === 'zones' ? '在上肢图（前面观 / 后面观）上点选'
    : item.kind === 'mcq' ? '在下面四个选项里选一个'
    : state.view === '3d' ? '在下方 3D 图上点击结构 ↓' : '在下方通路图上点击结构 ↓';
  $('quizWhere').classList.toggle('is-hidden', !item || state.quizAnswered);
  updateLevelBar();
  updateCutBar();
  trackLesion(getActiveNodeContext());
  applyAllHighlights();
  updateInspector(getActiveNodeContext());
  syncDock();
  animateDockIfChanged();
  syncViewUI();
  writeHash();
}

// 底部详情可收起：平时默认展开，自测时默认收起（题目无关的说明不占地方），两种场合各记各的
function syncDock() {
  const open = state.quizMode ? state.quizDock : state.dock;
  $('dock').classList.toggle('collapsed', !open);
  $('btnDock').textContent = open ? '收起详情 ▾' : '展开详情 ▴';
  $('btnDock').setAttribute('aria-expanded', open);
  $('dockStripTitle').textContent = $('dTitle').textContent;
  $('dockStripSub').textContent = $('dSub').textContent;
}

function toggleDock() {
  if (state.quizMode) state.quizDock = !state.quizDock;
  else { state.dock = !state.dock; store.setPref('dock', state.dock); }
  syncDock();
  window.dispatchEvent(new Event('resize'));
}

// 详情换了对象（而不是同一对象的重绘）时，各列错峰淡入
let dockSig = null;
function animateDockIfChanged() {
  const sig = ['dTitle', 'dSub', 'dSegments', 'dMotor'].map(id => $(id).textContent).join('|');
  if (dockSig !== null && sig !== dockSig) riseIn(document.querySelectorAll('#detailContent > .info-block:not(.is-hidden)'));
  dockSig = sig;
}

// ==================== 自测 ====================
const hashStr = s => { let h = 5381; for (const c of s) h = ((h << 5) + h + c.codePointAt(0)) | 0; return (h >>> 0).toString(36); };
const BANK_ITEMS = QUIZ_BANK.map(q => ({ ...q, kind: q.zones ? 'zones' : 'target', key: (q.zones ? 'z:' : 't:') + hashStr(q.q) }));
const CASE_ITEMS = CASES.map(q => ({ ...q, kind: 'case', key: 'c:' + hashStr(q.q) }));
const ITEM_BY_KEY = Object.fromEntries([...BANK_ITEMS, ...CASE_ITEMS].map(i => [i.key, i]));

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function buildDeck(deck) {
  const mcqs = n => Array.from({ length: n }, (_, i) => generateMCQ(MCQ_TYPES[i % MCQ_TYPES.length]));
  if (deck === 'locate') return shuffle(BANK_ITEMS);
  if (deck === 'case') return shuffle(CASE_ITEMS);
  if (deck === 'mcq') return mcqs(12);
  if (deck === 'wrong') {
    return shuffle(store.wrongKeys().map(k => {
      if (ITEM_BY_KEY[k]) return ITEM_BY_KEY[k];
      const [g, type, subject] = k.split(':');
      return g === 'g' && MCQ_TYPES.includes(type) ? generateMCQ(type, subject) : null;
    }).filter(Boolean));
  }
  return shuffle([...BANK_ITEMS, ...CASE_ITEMS, ...mcqs(10)]);
}

let deck = [];
function currentQuiz() {
  return deck[state.quizIdx] || null;
}

// 自测时是否把节点名字换成「？」（反向题、选择题不考通路图，不用藏名字）
export function labelsHidden() {
  const item = state.quizMode && !state.quizAnswered && currentQuiz();
  return !!item && (item.kind === 'target' || item.kind === 'case');
}

// 正在做反向题：上肢图点击 = 点选
export function zonePicking() {
  const item = state.quizMode && !state.quizAnswered && currentQuiz();
  return !!item && item.kind === 'zones';
}

function showQuizScore() {
  $('quizScore').textContent = `${state.quizRight} / ${state.quizTotal}`;
  const s = store.stats();
  $('quizStats').textContent = s.total ? `累计 ${Math.round(s.right / s.total * 100)}% · 错题 ${s.wrongNow}` : '';
}

function setQuizFeedback(text, cls) {
  const fb = $('quizFeedback');
  fb.textContent = text;
  fb.className = 'quiz-feedback' + (cls ? ' ' + cls : '');
}

function renderQuizOptions(item) {
  const box = $('quizOptions');
  box.innerHTML = '';
  if (!item || item.kind !== 'mcq') return;
  item.options.forEach(o => {
    const b = document.createElement('button');
    b.className = 'btn quiz-option';
    b.dataset.option = o.id;
    b.textContent = o.label;
    box.appendChild(b);
  });
}

function markOptions(item, picked) {
  $('quizOptions').querySelectorAll('.quiz-option').forEach(b => {
    b.disabled = true;
    b.classList.toggle('correct', b.dataset.option === item.answer);
    b.classList.toggle('wrong', b.dataset.option === picked && picked !== item.answer);
  });
}

function loadQuizQuestion() {
  if (!deck.length || state.quizIdx >= deck.length) {
    deck = buildDeck(state.quizDeck);
    state.quizIdx = 0;
  }
  const item = currentQuiz();
  state.quizAnswered = false;
  state.quizPicks = new Set();
  state.quizResult = null;
  clearFocus();
  if (item && item.kind === 'zones') state.limbMode = item.zones.mode;
  if (item && item.kind === 'mcq') state.limbMode = 'motor';
  $('quizQuestion').textContent = !item
    ? (state.quizDeck === 'wrong' ? '错题本是空的 🎉' : '没有题目。')
    : item.kind === 'zones' ? item.q + '（没有受累的也可以不选，直接提交）' : item.q;
  renderQuizOptions(item);
  setQuizFeedback('');
  showQuizScore();
  riseIn([$('quizQuestion'), $('quizOptions')]);
  renderPlexusSVG();
  renderLimbSVG();
  updateUI();
}

function finishAnswer(item, ok, scored = true) {
  state.quizAnswered = true;
  if (scored) {
    state.quizTotal++;
    if (ok) state.quizRight++;
  }
  store.record(item.key, ok);
  showQuizScore();
}

function caseExplain(target) {
  const s = lesionSummary(PlexusModel.lesionAt([target]));
  return `模型演示：瘫痪/无力 ${s.motor}；感觉 ${s.sensory}。`;
}

function handleQuizAnswer(clickedId) {
  const item = currentQuiz();
  if (!item || state.quizAnswered || (item.kind !== 'target' && item.kind !== 'case')) return;
  const ok = clickedId === item.target;
  finishAnswer(item, ok);
  const head = ok ? `✅ 正确：${label(item.target)}。` : `❌ 应为「${label(item.target)}」，不是「${label(clickedId)}」。`;
  if (item.kind === 'case') {
    state.cuts = new Set([item.target]);
    setQuizFeedback(head + caseExplain(item.target), ok ? 'ok' : 'err');
  } else {
    state.selectedId = item.target;
    setQuizFeedback(head, ok ? 'ok' : 'err');
  }
  renderPlexusSVG();
  updateUI();
}

function showMcqAnswer(item) {
  if (item.show.zone) {
    state.selectedZoneId = item.show.zone;
    state.selectedId = PlexusModel.target(item.show.zone).fibers[0].nerve;
  } else {
    state.cuts = new Set([item.show.cut]);
  }
  ensureCollateralsFor([...state.cuts, state.selectedId].filter(Boolean));
}

function handleOption(id) {
  const item = currentQuiz();
  if (!item || state.quizAnswered || item.kind !== 'mcq') return;
  const ok = id === item.answer;
  finishAnswer(item, ok);
  markOptions(item, id);
  setQuizFeedback((ok ? '✅ ' : '❌ ') + item.explain + '。', ok ? 'ok' : 'err');
  showMcqAnswer(item);
  updateUI();
}

function toggleQuizPick(zoneId) {
  if (!zonePicking()) return;
  if (state.quizPicks.has(zoneId)) state.quizPicks.delete(zoneId);
  else state.quizPicks.add(zoneId);
  applyAllHighlights();
}

// 反向题：把点选的区域和模型算出的受累区域比对。reveal = 直接看答案，不计分（但记入错题本）
function submitZoneQuiz(reveal) {
  const item = currentQuiz();
  if (!zonePicking()) return;
  const L = PlexusModel.lesion(item.zones.lesion, item.zones.level);
  // 标准答案 = 完全受累的区域；只是「部分受累」的（如桡神经损伤时的肱肌）选不选都算对
  const inMode = id => PlexusModel.target(id).kind === item.zones.mode;
  const answer = [...L.severity].filter(([id, sev]) => inMode(id) && sev === 'full').map(([id]) => id);
  const optional = [...L.severity].filter(([id, sev]) => inMode(id) && sev === 'partial').map(([id]) => id);
  const answerText = (answer.length ? names(answer) : '没有（这个部位的损伤不影响这一类区域）')
    + (optional.length ? `；另有部分受累：${names(optional)}（选不选都算对）` : '');
  // 判断依据：直接用该损伤部位已有的说明文字
  const T = LESIONS[item.zones.lesion].levels[L.level];
  const basis = ' 依据：' + (item.zones.mode === 'motor' ? T.motor : T.sensory);
  if (reveal) {
    finishAnswer(item, false, false);
    setQuizFeedback(`💡 答案：${answerText}。` + basis);
  } else {
    const missed = answer.filter(id => !state.quizPicks.has(id));
    const extra = [...state.quizPicks].filter(id => !answer.includes(id) && !optional.includes(id));
    const ok = !missed.length && !extra.length;
    finishAnswer(item, ok);
    if (ok) setQuizFeedback(`✅ 正确：${answerText}。` + basis, 'ok');
    else setQuizFeedback('❌ ' + [missed.length ? `漏选 ${missed.length} 个` : '', extra.length ? `多选 ${extra.length} 个` : '']
      .filter(Boolean).join('，') + '，图上已标出。' + basis, 'err');
  }
  // 作答保留在原图上，与答案对照（选对 / 漏选 / 多选），见 limb.js
  state.quizResult = { picks: new Set(reveal ? [] : state.quizPicks), answer: new Set(answer), optional: new Set(optional), reveal };
  state.quizPicks = new Set();
  state.lesionKey = item.zones.lesion;
  state.lesionLevel = item.zones.level;
  renderPlexusSVG();
  updateUI();
}

// 进入自测前的浏览上下文；用「退出」或 Q / Esc 离开自测时原样恢复
let quizReturn = null;
const RETURN_KEYS = ['selectedId', 'selectedZoneId', 'lesionKey', 'lesionLevel', 'cutMode', 'limbMode', 'showCollaterals'];

function toggleQuiz() {
  const on = !state.quizMode;
  const back = quizReturn;
  if (on) {
    quizReturn = { cuts: new Set(state.cuts) };
    RETURN_KEYS.forEach(k => { quizReturn[k] = state[k]; });
  }
  clearFocus();
  state.cutMode = false;
  state.quizPicks = new Set();
  state.quizResult = null;
  state.quizMode = on;
  if (on) { state.quizDock = false; state.showCollaterals = true; loadQuizQuestion(); return; }
  if (back) {
    RETURN_KEYS.forEach(k => { state[k] = back[k]; });
    state.cuts = back.cuts;
  }
  quizReturn = null;
  renderPlexusSVG();
  renderLimbSVG();
  updateUI();
}

function setQuizDeck(d) {
  state.quizDeck = d;
  deck = [];
  loadQuizQuestion();
}

function nextQuiz() {
  if (!state.quizMode) return;
  state.quizIdx++;
  loadQuizQuestion();
}

function revealQuiz() {
  const item = currentQuiz();
  if (!state.quizMode || state.quizAnswered || !item) return;
  if (item.kind === 'zones') { submitZoneQuiz(true); return; }
  finishAnswer(item, false, false);
  if (item.kind === 'mcq') {
    markOptions(item, null);
    setQuizFeedback(`💡 ${item.explain}。`);
    showMcqAnswer(item);
  } else if (item.kind === 'case') {
    state.cuts = new Set([item.target]);
    setQuizFeedback(`💡 答案是「${label(item.target)}」。${caseExplain(item.target)}`);
  } else {
    state.selectedId = item.target;
    setQuizFeedback(`💡 答案是「${label(item.target)}」。`);
  }
  renderPlexusSVG();
  updateUI();
}

function clearProgress() {
  if (!confirm('清除本机保存的全部做题记录（含错题本）？')) return;
  store.clearResults();
  if (state.quizDeck === 'wrong') { deck = []; loadQuizQuestion(); }
  showQuizScore();
}

// ==================== 视图、主题、投影、重置 ====================
function setView(view) {
  state.view = view;
  state.hoverId = null;
  store.setPref('view', view);
  updateUI();
  if (view === '3d') view3d.show(); else view3d.hide();
}

function syncViewUI() {
  svgWrap.classList.toggle('is-hidden', state.view !== '2d');
  $('viewport3d').classList.toggle('is-hidden', state.view !== '3d');
  document.querySelectorAll('#viewTabs .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
  document.querySelectorAll('#sceneToggles .hud-pill').forEach(b => b.classList.toggle('active', !!state.show3d[b.dataset.toggle]));
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
function toggleCollaterals() { state.showCollaterals = !state.showCollaterals; renderPlexusSVG(); updateUI(); }

function resetAll() {
  clearFocus();
  state.quizMode = false;
  state.cutMode = false;
  state.quizPicks = new Set();
  state.quizResult = null;
  quizReturn = null;
  state.dock = true;
  store.setPref('dock', true);
  setLimbWidth(null);
  state.show3d = { ...DEFAULT_3D };
  view3d.setCamPreset('front');
  renderPlexusSVG();
  updateUI();
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

// ==================== 用网址记住状态 ====================
// 例：index.html#lesion=erb&level=root　或　#node=radial&view=3d　或　#cut=lat_cord,med_cord
function writeHash() {
  if (state.quizMode) return;
  const p = new URLSearchParams();
  if (state.lesionKey) {
    p.set('lesion', state.lesionKey);
    if (currentLevel() !== PlexusModel.LESION_SITES[state.lesionKey].def) p.set('level', currentLevel());
  } else if (state.cuts.size) p.set('cut', [...state.cuts].join(','));
  else if (state.selectedZoneId) p.set('zone', state.selectedZoneId);
  else if (state.selectedId) p.set('node', state.selectedId);
  if (state.limbMode !== 'motor' && !state.selectedZoneId) p.set('limb', state.limbMode);
  if (state.view === '3d') p.set('view', '3d');
  if (state.present) p.set('present', '1');
  const h = p.toString();
  if ((location.hash || '#') === '#' + h) return;
  try {
    history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
  } catch (err) {
    // 某些预览环境不允许改地址，忽略即可
  }
}

function applyHash(first) {
  const p = new URLSearchParams(location.hash.slice(1));
  const own = (o, key) => key != null && Object.prototype.hasOwnProperty.call(o, key);
  state.quizMode = false;
  state.quizPicks = new Set();
  state.quizResult = null;
  quizReturn = null;
  clearFocus();
  state.cutMode = false;

  const limb = p.get('limb');
  if (own(LIMB_ZONES, limb)) state.limbMode = limb;

  const lesion = p.get('lesion'), zone = p.get('zone'), node = p.get('node');
  const cuts = (p.get('cut') || '').split(',').filter(id => own(nodeMap, id));
  if (own(PlexusModel.LESION_SITES, lesion)) {
    state.lesionKey = lesion;
    const level = p.get('level');
    state.lesionLevel = PlexusModel.LESION_SITES[lesion].levels.some(l => l.key === level) ? level : null;
  } else if (cuts.length) {
    state.cutMode = true;
    state.cuts = new Set(cuts);
  } else if (zone && PlexusModel.target(zone)) {
    const t = PlexusModel.target(zone);
    state.selectedZoneId = zone;
    state.selectedId = t.fibers[0].nerve;
    state.limbMode = t.kind;
  } else if (own(nodeMap, node)) {
    state.selectedId = node;
  }
  const shown = [state.selectedId, ...state.cuts, state.lesionKey === 'long_thoracic' ? 'long_thoracic' : null].filter(Boolean);
  if (shown.some(id => nodeMap[id].stage === 'collateral')) state.showCollaterals = true;

  const theme = p.get('theme') || (first ? store.pref('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : null);
  if (theme) setTheme(theme === 'dark');
  setPresent(p.get('present') === '1');
  renderPlexusSVG();
  renderLimbSVG();
  const view = p.get('view') || (first ? store.pref('view', '2d') : '2d');
  setView(view === '3d' ? '3d' : '2d');
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
    if (b) handleOption(b.dataset.option);
  });
  document.querySelectorAll('#viewTabs .seg-btn').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('#camPresets .hud-pill').forEach(b => b.addEventListener('click', () => view3d.setCamPreset(b.dataset.cam)));
  document.querySelectorAll('#sceneToggles .hud-pill').forEach(b => b.addEventListener('click', () => {
    state.show3d[b.dataset.toggle] = !state.show3d[b.dataset.toggle];
    syncViewUI();
    view3d.update(getActiveNodeContext());
  }));

  $('btnPulse').addEventListener('click', togglePulse);
  $('btnCollaterals').addEventListener('click', toggleCollaterals);
  $('btnCut').addEventListener('click', () => setCutMode(!state.cutMode));
  $('btnQuiz').addEventListener('click', toggleQuiz);
  $('btnNextQuiz').addEventListener('click', nextQuiz);
  $('btnRevealQuiz').addEventListener('click', revealQuiz);
  $('btnSubmitQuiz').addEventListener('click', () => submitZoneQuiz(false));
  $('btnClearProgress').addEventListener('click', clearProgress);
  $('btnExitQuiz').addEventListener('click', () => { if (state.quizMode) toggleQuiz(); });
  $('btnDock').addEventListener('click', toggleDock);
  $('btnFocus3d').addEventListener('click', () => view3d.focusCurrent());
  $('btnReset').addEventListener('click', resetAll);
  $('btnTheme').addEventListener('click', () => { setTheme(!state.dark); updateUI(); });
  $('btnPresent').addEventListener('click', () => { setPresent(!state.present); updateUI(); });
  $('btnPrint').addEventListener('click', () => window.print());
  // 工具菜单：点菜单项后收起；点别处或按 Esc 也收起
  $('btnTools').addEventListener('click', e => { e.stopPropagation(); setMenu($('toolList').classList.contains('is-hidden')); });
  $('toolList').addEventListener('click', () => setMenu(false));
  document.addEventListener('click', () => setMenu(false));
  bindSplitter();

  // 数字键 = 损伤预设，←/→ = 损伤部位，空格 = 冲动动画，X = 自由切断，/ = 搜索，F = 3D 聚焦当前结构；
  // 投影模式下 ↑/↓ 与翻页键（翻页笔）逐个切换预设
  document.addEventListener('keydown', e => {
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
    else if (lower === 'f' && state.view === '3d') view3d.focusCurrent();
    else if (state.quizMode) {
      const item = currentQuiz();
      if (k === 'Escape') toggleQuiz();
      else if (lower === 'n' || k === 'ArrowRight' || k === 'PageDown') nextQuiz();
      else if (k === 'Enter' && zonePicking()) submitZoneQuiz(false);
      else if (item && item.kind === 'mcq' && k >= '1' && k <= '4' && item.options[+k - 1]) handleOption(item.options[+k - 1].id);
      else handled = false;
    }
    else if (lower === 'x') setCutMode(!state.cutMode);
    else if (k >= '1' && k <= '9' && LESION_KEYS[+k - 1]) setLesion(state.lesionKey === LESION_KEYS[+k - 1] ? null : LESION_KEYS[+k - 1]);
    else if (k === '0' || k === 'Escape') { if (state.cutMode) setCutMode(false); else { clearFocus(); updateUI(); } }
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
  });

  window.addEventListener('hashchange', () => applyHash(false));
}

export function init() {
  view3d.init();
  initSearch($('searchInput'), $('searchResults'), applySearchAction);
  bindEvents();
  showQuizScore();
  state.dock = store.pref('dock', true) !== false;
  const limbW = store.pref('limbW', null);
  if (typeof limbW === 'number') setLimbWidth(limbW);
  applyHash(true);
  introPlexus();
  riseIn([document.querySelector('.limb-pane'), ...document.querySelectorAll('#detailContent > .info-block:not(.is-hidden)')], { delay: 260, gap: 60 });
}
