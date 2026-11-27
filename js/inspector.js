// 底部详情栏（检查器）：当前结构或损伤的文字说明、查体卡片，以及上肢图下方用的一句话损伤摘要。
// 文字全部取自模型和 js/data/ 里的现有内容，不另写一份事实。
import { PlexusModel } from './model.js';
import { nodeMap, SPATIAL, STAGE_NAMES } from './data/nodes.js';
import { LESIONS } from './data/lesions.js';
import { CLINICAL } from './data/clinical.js';
import { state } from './state.js';
import { store } from './store.js';
import { riseIn } from './motion.js';

const $ = id => document.getElementById(id);
const label = id => nodeMap[id].label;
const names = ids => ids.map(id => PlexusModel.zone(id).name).join('、');

// 损伤受累范围的文字：运动 / 感觉（含皮节）/ 保留
export function lesionSummary(ctx) {
  const by = (kind, sev) => [...ctx.severity].filter(([id, s]) => PlexusModel.zone(id).kind === kind && s === sev).map(([id]) => id);
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

// 当前损伤的一句话摘要，供上肢图下方显示：部位、体征、原因、与上一个部位相比的变化
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
  const marked = [...ctx.marked];
  if (ctx.involvesSubbranch) {
    const parents = [...new Set(marked.filter(id => id in PlexusModel.SUBBRANCH_PLANE).map(id => label(PlexusModel.parentsOf(id)[0])))];
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

function renderLesion(ctx) {
  const tags = $('dTags');
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
    const cuts = [...ctx.marked];
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
  renderClinicalCard([...ctx.marked][0]);
}

function renderOverview() {
  $('dTags').innerHTML = '';
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
}

function renderNode(id) {
  const n = nodeMap[id];
  $('dTags').innerHTML = `<span class="tag">${STAGE_NAMES[n.stage]}</span><span class="tag">${PlexusModel.segLabel(n.id)}</span>`;
  const minor = PlexusModel.minorLabel(n.id);
  setText({
    dTitle: n.label, dSub: n.en,
    dSegments: minor ? `${minor} 为部分/变异参与，通路图中以虚线表示。` : '',
    dMotor: n.motor, dSensory: n.sensory, dClinical: n.clinical, dSpatial: SPATIAL[n.id],
  });
  renderClinicalCard(n.id);
}

export function renderInspector(ctx) {
  trackLesion(ctx);
  $('detailContent').classList.toggle('is-lesion', !!(ctx && ctx.isLesion));
  if (ctx && ctx.isLesion) renderLesion(ctx);
  else if (state.selectedId) renderNode(state.selectedId);
  else renderOverview();
  syncDock();
  animateIfChanged();
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

export function toggleDock() {
  if (state.quizMode) state.quizDock = !state.quizDock;
  else { state.dock = !state.dock; store.setPref('dock', state.dock); }
  syncDock();
  window.dispatchEvent(new Event('resize'));
}

// 详情换了对象（而不是同一对象的重绘）时，各列错峰淡入
let shownSig = null;
function animateIfChanged() {
  const sig = ['dTitle', 'dSub', 'dSegments', 'dMotor'].map(id => $(id).textContent).join('|');
  if (shownSig !== null && sig !== shownSig) riseIn(document.querySelectorAll('#detailContent > .info-block:not(.is-hidden)'));
  shownSig = sig;
}
