// 页面的交互状态，以及只读状态的几个判断。各模块改完 state 之后由 app.updateUI() 统一刷新画面。
// 不在这里的只有纯渲染缓存（上一次画了什么、动效播到哪），它们留在各自的视图模块里。
import { PlexusModel } from './model.js';
import { nodeMap } from './data/nodes.js';

export const DEFAULT_3D = { artery: true, bones: true, muscles: false, labels: true, auto: false };

export const state = {
  // ---- 浏览：当前看的是什么 ----
  selectedId: null, // 选中的节点
  selectedZoneId: null, // 选中的肌肉/皮区（此时 selectedId 是它的第一条支配神经）
  hoverId: null,
  lesionKey: null, // 损伤预设，见 PlexusModel.LESION_PRESETS
  lesionLevel: null, // 损伤部位；null = 该预设的默认部位
  cutMode: false, // 自由切断：点通路图上的结构即切断
  cuts: new Set(), // 自由切断的结构（也用于病例题、选择题答后的演示）

  // ---- 显示选项 ----
  limbMode: 'motor', // 'motor' | 'cutaneous' | 'dermatome'，即靶区的 kind
  showCollaterals: true,
  pulse: true,
  dock: true, // 底部详情是否展开（浏览时）
  quizDock: false, // 底部详情是否展开（自测时，默认收起）
  present: false,
  dark: false,
  view: '2d', // '2d' | '3d'
  show3d: { ...DEFAULT_3D },

  // ---- 自测，见 quiz.js ----
  quizMode: false,
  quizDeck: 'all', // 'all' | 'locate' | 'case' | 'mcq' | 'wrong'
  quizItems: [], // 当前这一轮的题目
  quizIdx: 0,
  quizRight: 0,
  quizTotal: 0,
  quizAnswered: false,
  quizPicks: new Set(), // 反向题里点选的上肢图区域
  quizResult: null, // 反向题提交后：{ picks, answer, optional, reveal }，在原图上对照显示
  quizReturn: null, // 进入自测前的浏览状态，退出时恢复
};

// 清空「当前看的是什么」。keepCuts / keepHover：切断模式里增减切断点时保留
export function clearSelection({ keepCuts = false, keepHover = false } = {}) {
  state.selectedId = null;
  state.selectedZoneId = null;
  state.lesionKey = null;
  state.lesionLevel = null;
  if (!keepHover) state.hoverId = null;
  if (!keepCuts) state.cuts = new Set();
}

export function clearQuizAnswer() {
  state.quizPicks = new Set();
  state.quizResult = null;
}

// 选中的结构里有旁支时，自动打开「旁支」显示，免得选中了却看不见
export function showCollateralsFor(ids) {
  if (ids.some(id => id && nodeMap[id].stage === 'collateral')) state.showCollaterals = true;
}

// 当前损伤部位（未指定时取预设的默认部位）
export function currentLevel() {
  if (!state.lesionKey) return null;
  return state.lesionLevel || PlexusModel.LESION_PRESETS[state.lesionKey].defaultLevel;
}

export function currentQuiz() {
  return (state.quizMode && state.quizItems[state.quizIdx]) || null;
}

// 自测时是否把节点名字换成「？」（反向题、选择题不考通路图，不用藏名字）
export function labelsHidden() {
  const item = !state.quizAnswered && currentQuiz();
  return !!item && (item.type === 'locate' || item.type === 'case');
}

// 正在做反向题：上肢图点击 = 点选
export function zonePicking() {
  const item = !state.quizAnswered && currentQuiz();
  return !!item && item.type === 'reverse';
}
