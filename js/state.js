// 页面的全部交互状态。2D 图、上肢图、3D 视图、检查器都只读这一份。
export const DEFAULT_3D = { artery: true, bones: true, muscles: false, labels: true, auto: false };

export const state = {
  selectedId: null,
  hoverId: null,
  lesionKey: null,
  lesionLevel: null, // 损伤部位；null = 该预设的默认部位
  cutMode: false, // 自由切断：点通路图上的结构即切断
  cuts: new Set(), // 自由切断的结构（也用于病例题、选择题答后的演示）
  limbMode: 'motor', // 'motor' | 'cutaneous' | 'dermatome'
  selectedZoneId: null,
  showCollaterals: true,
  pulse: true,
  quizMode: false,
  quizDeck: 'all', // 'all' | 'locate' | 'case' | 'mcq' | 'wrong'
  quizIdx: 0,
  quizRight: 0,
  quizTotal: 0,
  quizAnswered: false,
  quizPicks: new Set(), // 反向题里点选的上肢图区域
  quizResult: null, // 反向题提交后：{ picks, answer }，在原图上对照显示
  dock: true, // 底部详情是否展开（浏览时）
  quizDock: false, // 底部详情是否展开（自测时，默认收起）
  present: false,
  dark: false,
  view: '2d', // '2d' | '3d'
  show3d: { ...DEFAULT_3D },
};
