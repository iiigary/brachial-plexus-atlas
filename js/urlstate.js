// 用网址记住当前看的内容，便于分享链接和刷新后恢复。
// 例：index.html#lesion=erb&level=root　或　#node=radial&view=3d　或　#cut=lat_cord,med_cord　或　#zone=m_thenar
import { PlexusModel } from './model.js';
import { nodeMap } from './data/nodes.js';
import { LIMB_ZONES } from './data/limb.js';
import { state, currentLevel, showCollateralsFor } from './state.js';
import { store } from './store.js';

export function writeHash() {
  if (state.quizMode) return;
  const p = new URLSearchParams();
  if (state.lesionKey) {
    p.set('lesion', state.lesionKey);
    if (currentLevel() !== PlexusModel.LESION_PRESETS[state.lesionKey].defaultLevel) p.set('level', currentLevel());
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

// 把网址里的选择写进 state（调用方先清空当前选择）。网址里不认识的值一律忽略。
// 主题、投影、视图要由调用方执行（涉及 DOM 与 3D），所以只返回：{ theme, present, view }。
// first = 页面首次打开：网址没写主题和视图时，用上次保存的偏好
export function readHash(first) {
  const p = new URLSearchParams(location.hash.slice(1));
  const own = (o, key) => key != null && Object.prototype.hasOwnProperty.call(o, key);

  const limb = p.get('limb');
  if (own(LIMB_ZONES, limb)) state.limbMode = limb;

  const lesion = p.get('lesion'), zone = p.get('zone'), node = p.get('node');
  const cuts = (p.get('cut') || '').split(',').filter(id => own(nodeMap, id));
  if (own(PlexusModel.LESION_PRESETS, lesion)) {
    state.lesionKey = lesion;
    const level = p.get('level');
    state.lesionLevel = PlexusModel.LESION_PRESETS[lesion].levels.some(l => l.key === level) ? level : null;
  } else if (cuts.length) {
    state.cutMode = true;
    state.cuts = new Set(cuts);
  } else if (zone && PlexusModel.zone(zone)) {
    const z = PlexusModel.zone(zone);
    state.selectedZoneId = zone;
    state.selectedId = z.fibers[0].nerve;
    state.limbMode = z.kind;
  } else if (own(nodeMap, node)) {
    state.selectedId = node;
  }
  showCollateralsFor([state.selectedId, ...state.cuts, state.lesionKey === 'long_thoracic' ? 'long_thoracic' : null]);

  const theme = p.get('theme') || (first ? store.pref('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : null);
  const view = p.get('view') || (first ? store.pref('view', '2d') : '2d');
  return { theme, present: p.get('present') === '1', view: view === '3d' ? '3d' : '2d' };
}
