// 高亮上下文：把 state（选了什么、切了什么）翻译成「哪些节点、连线、靶区要怎么显示」。
// 2D 通路图、上肢图、3D 视图、检查器都只读这一份。全部来自 PlexusModel 的纤维路由，不按图的连通性推断。
import { PlexusModel } from './model.js';
import { nodeMap } from './data/nodes.js';
import { state } from './state.js';

/**
 * @typedef {Object} HighlightContext
 * 所有情形都有：
 * @property {boolean} isLesion     损伤（预设或手动切断）为 true，浏览为 false
 * @property {Set<string>} marked   图上要打标记的节点：损伤 = 切断点；浏览 = 选中/悬停的节点，或选中靶区的支配神经
 * @property {Set<string>} nodes    相关节点（损伤时 = 切断点上下游；浏览时 = 溯源通路）
 * @property {Set<string>} edges    相关连线，键为 'from>to'
 * @property {Set<string>} upNodes / upEdges / downNodes / downEdges  近端（来自哪些根）/ 远端（去往哪里）；
 *                                  损伤时远端即受累的部分
 * 浏览（isLesion = false）：
 * @property {string} activeId      当前看的节点
 * @property {string} [zoneId]      选中的靶区（从上肢图反向溯源时）
 * @property {Set<string>} [minorNodes] / minorEdges  次要/变异参与的通路（如正中神经的 C5），画成虚线
 * 损伤（isLesion = true），见 PlexusModel.lesionAt：
 * @property {Map<string,'full'|'partial'>} severity  靶区 id → 受累程度
 * @property {string[]} spared      同一神经上、从损伤点近端或另一分支走的靶区（不受累）
 * @property {Map} detail           部分受累的靶区断了哪些纤维、留了哪些
 * @property {boolean} isNerve / dermatomal / involvesSubbranch / preganglionic / horner
 * @property {string|null} key / level  预设损伤的预设与部位；手动切断时为 null
 * @property {string} levelName     部位名称；手动切断时是切断点名称
 * @property {boolean} [isCut]      手动切断（含病例题、选择题答后的演示）
 */

let cache = { key: null, value: null };

/** @returns {HighlightContext|null} 没有选中任何东西时为 null */
export function getHighlightContext() {
  const key = [state.lesionKey, state.lesionLevel, [...state.cuts].join(','), state.hoverId, state.selectedId, state.selectedZoneId].join('|');
  if (key !== cache.key) cache = { key, value: build() };
  return cache.value;
}

// 优先级：预设损伤 > 手动切断 > 悬停 > 选中靶区 > 选中节点
function build() {
  if (state.lesionKey) return { ...PlexusModel.lesion(state.lesionKey, state.lesionLevel), isLesion: true };
  if (state.cuts.size) {
    const cuts = [...state.cuts];
    return { ...PlexusModel.lesionAt(cuts), levelName: cuts.map(id => nodeMap[id].label).join(' + '), isLesion: true, isCut: true };
  }
  const one = id => ({ ...PlexusModel.trace(id), activeId: id, marked: new Set([id]), isLesion: false });
  if (state.hoverId) return one(state.hoverId);
  if (!state.selectedId) return null;
  if (state.selectedZoneId) {
    const z = PlexusModel.zone(state.selectedZoneId);
    return {
      ...PlexusModel.traceZone(state.selectedZoneId),
      activeId: state.selectedId, marked: new Set(z.fibers.map(f => f.nerve)), zoneId: state.selectedZoneId, isLesion: false,
    };
  }
  return one(state.selectedId);
}
