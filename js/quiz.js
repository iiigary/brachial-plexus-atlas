// 自测：组卷、出题、判分、错题本，以及进入/退出自测时保存和恢复浏览状态。
// 题型（item.type）：locate 定位题 · reverse 反向题 · case 病例题（见 js/data/quiz.js）· mcq 选择题（见 quizgen.js）。
// 这里的函数只改 state 和自测条里的文字；画面由调用方随后的 app.updateUI() 刷新。
import { PlexusModel } from './model.js';
import { nodeMap } from './data/nodes.js';
import { LESIONS } from './data/lesions.js';
import { QUIZ_BANK, CASES } from './data/quiz.js';
import { generateMCQ, MCQ_TYPES } from './quizgen.js';
import { state, clearSelection, clearQuizAnswer, currentQuiz, zonePicking, showCollateralsFor } from './state.js';
import { store } from './store.js';
import { riseIn } from './motion.js';
import { lesionSummary } from './inspector.js';

const $ = id => document.getElementById(id);
const label = id => nodeMap[id].label;
const names = ids => ids.map(id => PlexusModel.zone(id).name).join('、');

// ==================== 题目 ====================
const hashStr = s => { let h = 5381; for (const c of s) h = ((h << 5) + h + c.codePointAt(0)) | 0; return (h >>> 0).toString(36); };
// key 前缀（z: 反向题、t: 定位题、c: 病例题、g: 选择题）是错题本的存储键，改了会丢掉用户已有的记录
const BANK_ITEMS = QUIZ_BANK.map(q => ({ ...q, type: q.lesion ? 'reverse' : 'locate', key: (q.lesion ? 'z:' : 't:') + hashStr(q.q) }));
const CASE_ITEMS = CASES.map(q => ({ ...q, type: 'case', key: 'c:' + hashStr(q.q) }));
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
      const [g, mcqType, subject] = k.split(':');
      return g === 'g' && MCQ_TYPES.includes(mcqType) ? generateMCQ(mcqType, subject) : null;
    }).filter(Boolean));
  }
  return shuffle([...BANK_ITEMS, ...CASE_ITEMS, ...mcqs(10)]);
}

// ==================== 自测条里的文字 ====================
export function showQuizScore() {
  $('quizScore').textContent = `${state.quizRight} / ${state.quizTotal}`;
  const s = store.stats();
  $('quizStats').textContent = s.total ? `累计 ${Math.round(s.right / s.total * 100)}% · 错题 ${s.wrongNow}` : '';
}

function setFeedback(text, cls) {
  const fb = $('quizFeedback');
  fb.textContent = text;
  fb.className = 'quiz-feedback' + (cls ? ' ' + cls : '');
}

function renderOptions(item) {
  const box = $('quizOptions');
  box.innerHTML = '';
  if (!item || item.type !== 'mcq') return;
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

// ==================== 出题与作答 ====================
function loadQuestion() {
  if (!state.quizItems.length || state.quizIdx >= state.quizItems.length) {
    state.quizItems = buildDeck(state.quizDeck);
    state.quizIdx = 0;
  }
  const item = currentQuiz();
  state.quizAnswered = false;
  clearQuizAnswer();
  clearSelection();
  if (item && item.type === 'reverse') state.limbMode = item.lesion.mode;
  if (item && item.type === 'mcq') state.limbMode = 'motor';
  $('quizQuestion').textContent = !item
    ? (state.quizDeck === 'wrong' ? '错题本是空的 🎉' : '没有题目。')
    : item.type === 'reverse' ? item.q + '（没有受累的也可以不选，直接提交）' : item.q;
  renderOptions(item);
  setFeedback('');
  showQuizScore();
  riseIn([$('quizQuestion'), $('quizOptions')]);
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

function caseExplain(nodeId) {
  const s = lesionSummary(PlexusModel.lesionAt([nodeId]));
  return `模型演示：瘫痪/无力 ${s.motor}；感觉 ${s.sensory}。`;
}

// 定位题、病例题：在通路图（或 3D 图）上点了一个结构
export function answerWithNode(clickedId) {
  const item = currentQuiz();
  if (!item || state.quizAnswered || (item.type !== 'locate' && item.type !== 'case')) return;
  const ok = clickedId === item.answerNode;
  finishAnswer(item, ok);
  const head = ok ? `✅ 正确：${label(item.answerNode)}。` : `❌ 应为「${label(item.answerNode)}」，不是「${label(clickedId)}」。`;
  if (item.type === 'case') {
    state.cuts = new Set([item.answerNode]);
    setFeedback(head + caseExplain(item.answerNode), ok ? 'ok' : 'err');
  } else {
    state.selectedId = item.answerNode;
    setFeedback(head, ok ? 'ok' : 'err');
  }
}

function showMcqAnswer(item) {
  if (item.show.zone) {
    state.selectedZoneId = item.show.zone;
    state.selectedId = PlexusModel.zone(item.show.zone).fibers[0].nerve;
  } else {
    state.cuts = new Set([item.show.cut]);
  }
  showCollateralsFor([...state.cuts, state.selectedId]);
}

// 选择题：点了一个选项
export function answerWithOption(id) {
  const item = currentQuiz();
  if (!item || state.quizAnswered || item.type !== 'mcq') return;
  const ok = id === item.answer;
  finishAnswer(item, ok);
  markOptions(item, id);
  setFeedback((ok ? '✅ ' : '❌ ') + item.explain + '。', ok ? 'ok' : 'err');
  showMcqAnswer(item);
}

// 反向题：点选 / 取消一个上肢图区域
export function togglePick(zoneId) {
  if (!zonePicking()) return;
  if (state.quizPicks.has(zoneId)) state.quizPicks.delete(zoneId);
  else state.quizPicks.add(zoneId);
}

// 反向题：把点选的区域和模型算出的受累区域比对。reveal = 直接看答案，不计分（但记入错题本）
export function submitReverse(reveal) {
  const item = currentQuiz();
  if (!zonePicking()) return;
  const { key, level, mode } = item.lesion;
  const L = PlexusModel.lesion(key, level);
  // 标准答案 = 完全受累的区域；只是「部分受累」的（如桡神经损伤时的肱肌）选不选都算对
  const inMode = id => PlexusModel.zone(id).kind === mode;
  const answer = [...L.severity].filter(([id, sev]) => inMode(id) && sev === 'full').map(([id]) => id);
  const optional = [...L.severity].filter(([id, sev]) => inMode(id) && sev === 'partial').map(([id]) => id);
  const answerText = (answer.length ? names(answer) : '没有（这个部位的损伤不影响这一类区域）')
    + (optional.length ? `；另有部分受累：${names(optional)}（选不选都算对）` : '');
  // 判断依据：直接用该损伤部位已有的说明文字
  const T = LESIONS[key].levels[L.level];
  const basis = ' 依据：' + (mode === 'motor' ? T.motor : T.sensory);
  if (reveal) {
    finishAnswer(item, false, false);
    setFeedback(`💡 答案：${answerText}。` + basis);
  } else {
    const missed = answer.filter(id => !state.quizPicks.has(id));
    const extra = [...state.quizPicks].filter(id => !answer.includes(id) && !optional.includes(id));
    const ok = !missed.length && !extra.length;
    finishAnswer(item, ok);
    if (ok) setFeedback(`✅ 正确：${answerText}。` + basis, 'ok');
    else setFeedback('❌ ' + [missed.length ? `漏选 ${missed.length} 个` : '', extra.length ? `多选 ${extra.length} 个` : '']
      .filter(Boolean).join('，') + '，图上已标出。' + basis, 'err');
  }
  // 作答保留在原图上，与答案对照（选对 / 漏选 / 多选），见 limb.js
  state.quizResult = { picks: new Set(reveal ? [] : state.quizPicks), answer: new Set(answer), optional: new Set(optional), reveal };
  state.quizPicks = new Set();
  state.lesionKey = key;
  state.lesionLevel = level;
}

export function next() {
  if (!state.quizMode) return;
  state.quizIdx++;
  loadQuestion();
}

export function reveal() {
  const item = currentQuiz();
  if (!item || state.quizAnswered) return;
  if (item.type === 'reverse') { submitReverse(true); return; }
  finishAnswer(item, false, false);
  if (item.type === 'mcq') {
    markOptions(item, null);
    setFeedback(`💡 ${item.explain}。`);
    showMcqAnswer(item);
  } else if (item.type === 'case') {
    state.cuts = new Set([item.answerNode]);
    setFeedback(`💡 答案是「${label(item.answerNode)}」。${caseExplain(item.answerNode)}`);
  } else {
    state.selectedId = item.answerNode;
    setFeedback(`💡 答案是「${label(item.answerNode)}」。`);
  }
}

export function setDeck(deck) {
  state.quizDeck = deck;
  state.quizItems = [];
  loadQuestion();
}

export function clearProgress() {
  if (!confirm('清除本机保存的全部做题记录（含错题本）？')) return;
  store.clearResults();
  if (state.quizDeck === 'wrong') { state.quizItems = []; loadQuestion(); }
  showQuizScore();
}

// ==================== 进入 / 退出 ====================
// 进入自测前的浏览状态；用「退出」或 Q / Esc 离开自测时原样恢复
const RETURN_KEYS = ['selectedId', 'selectedZoneId', 'lesionKey', 'lesionLevel', 'cutMode', 'limbMode', 'showCollaterals'];

export function toggleQuiz() {
  if (!state.quizMode) {
    state.quizReturn = { cuts: new Set(state.cuts) };
    RETURN_KEYS.forEach(k => { state.quizReturn[k] = state[k]; });
    clearSelection();
    state.cutMode = false;
    clearQuizAnswer();
    state.quizMode = true;
    state.quizDock = false;
    state.showCollaterals = true;
    loadQuestion();
    return;
  }
  const back = state.quizReturn;
  leaveQuiz();
  clearSelection();
  state.cutMode = false;
  if (back) {
    RETURN_KEYS.forEach(k => { state[k] = back[k]; });
    state.cuts = back.cuts;
  }
}

// 离开自测去做别的事（选损伤、搜索、切断、重置）：不恢复进入前的状态，因为用户已经选了新的去处
export function leaveQuiz() {
  state.quizMode = false;
  clearQuizAnswer();
  state.quizReturn = null;
}
