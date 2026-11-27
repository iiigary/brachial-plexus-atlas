// 右侧上肢窗格：图（SVG 示意图，「肌肉」页有网格时换成 limb3d.js 的 3D 模型）+ 标题 + 下方摘要。
// 每次刷新先用 limbView() 算出「每个分区什么状态、标题和摘要写什么」，再分别画到 SVG、3D 模型和摘要上，
// 三处用同一份结果，说法不会不一致。
// SVG：前面观画一遍，后面观是它的水平镜像；分区被轮廓裁剪。
import { PlexusModel } from './model.js';
import { LIMB_W, LIMB_ARM, LIMB_TORSO, LIMB_TORSO_EDGE, LIMB_MARKS, LIMB_ZONES } from './data/limb.js';
import { nodeMap } from './data/nodes.js';
import { state, zonePicking } from './state.js';
import { createSvgEl } from './plexus2d.js';
import { lesionDigest } from './inspector.js';
import * as limb3d from './limb3d.js';

const limbSvg = document.getElementById('limbSvg');
const summary = document.getElementById('limbSummary');
const caption = document.getElementById('limbCaption');
const l3Box = document.getElementById('limb3d');
const l3Extra = document.getElementById('limb3dExtra');

const zoneName = id => PlexusModel.zone(id).name;
const NERVE = id => nodeMap[id].label;
const SEG = roots => roots.map(r => r.toUpperCase()).join('、');
const fiberText = f => `${NERVE(f.nerve)} ${SEG(f.roots)}${f.part ? `（${f.part}）` : ''}`;
const KIND_WORD = { motor: '肌肉', cutaneous: '皮区', dermatome: '皮节' };

// 分区状态（即 SVG 分区上的类名，样式见 css/style.css）→ 分区标签上的附加类（标签另加 'on'）
const STATUS_LABEL = {
  'active-motor': '', 'active-sensory': '', 'active-part': '',
  'active-lesion': 'lesion', 'active-lesion-partial': 'lesion', 'quiz-missed': 'lesion',
  spared: 'keep', 'quiz-ok': '', 'quiz-extra': '',
};
const STATUS_CLASSES = Object.keys(STATUS_LABEL);

// 「肌肉」页优先用真实网格。网格异步加载；加载完成前和失败时都显示 SVG 示意图。
let l3State = 'loading', lastCtx = null, l3Hover = null;
const use3d = () => state.limbMode === 'motor' && l3State === 'ok';

// 用户操作交给 app.js：{ onZoneClick, onChipClick }
let on = {};
export function initLimb(handlers) {
  on = handlers;
  limb3d.init(l3Box, {
    onZoneClick: id => on.onZoneClick(id),
    onHover: id => {
      if (l3Hover) linkChip(l3Hover, false);
      l3Hover = id;
      if (id) linkChip(id, true);
    },
  }).then(ok => {
    l3State = ok ? 'ok' : 'off';
    renderLimbSVG();
    applyLimbHighlights(lastCtx);
  });
}

// ==================== 算：每个分区的状态、标题、摘要 ====================
// 返回 { status: Map(分区 id → 状态), focus: 是否让无关标注退后, caption, rows }
// rows 每项：{ key 小标题, cls, text } 或 { key, cls, chips: [{ id, text, cls, locate, title }], more }
let partialSig = '', partialOpen = false;

function limbView(ctx) {
  if (zonePicking()) return pickingView();
  if (state.quizMode && state.quizResult) return quizResultView(state.quizResult);
  if (!ctx) return { status: new Map(), focus: false, caption: state.cutMode || state.quizMode ? '' : '点击肌肉或皮区，反向溯源', rows: [] };
  return ctx.isLesion ? lesionView(ctx) : browseView(ctx);
}

const chips = (ids, cls, opts = {}) => ids.map(id => ({ id, text: zoneName(id), cls, ...opts }));

// 反向题作答中：只列已选的
function pickingView() {
  const picks = [...state.quizPicks];
  return {
    status: new Map(), focus: false,
    caption: `点选${KIND_WORD[state.limbMode]}，再按「提交」 · 已选 ${picks.length} 个`,
    rows: picks.length ? [{ key: '已选', chips: chips(picks, 'pick', { locate: true }) }] : [],
  };
}

// 反向题提交后：在作答的同一张图上区分选对、漏选、多选
function quizResultView({ picks, answer, optional, reveal }) {
  const ok = [...answer].filter(id => picks.has(id)), missed = [...answer].filter(id => !picks.has(id));
  const extra = [...picks].filter(id => !answer.has(id) && !optional.has(id));
  const status = new Map();
  ok.forEach(id => status.set(id, 'quiz-ok'));
  missed.forEach(id => status.set(id, reveal ? 'active-lesion' : 'quiz-missed'));
  optional.forEach(id => status.set(id, 'active-lesion-partial'));
  extra.forEach(id => status.set(id, 'quiz-extra'));
  const rows = [['✓ 选对', ok, 'ok'], [reveal ? '答案' : '○ 漏选', missed, reveal ? 'lesion' : 'missed'],
    ['部分受累 · 不计分', [...optional], 'lesion partial'], ['✕ 多选', extra, 'extra']]
    .filter(([, ids]) => ids.length)
    .map(([key, ids, cls]) => ({ key, cls: cls.split(' ').pop(), chips: chips(ids, cls, { locate: true }) }));
  return {
    status, focus: true, rows,
    caption: !answer.size ? `答案：没有完全受累的区域${extra.length ? ` · 多选 ${extra.length}` : ''}`
      : reveal ? `答案共 ${answer.size} 个`
      : `答案共 ${answer.size} 个 · 选对 ${ok.length} · 漏选 ${missed.length} · 多选 ${extra.length}`,
  };
}

// 损伤：受累 / 部分 / 保留 / 体征 / 原因 / 变化
function lesionView(ctx) {
  const inMode = id => PlexusModel.zone(id).kind === state.limbMode;
  const full = [], partial = [];
  ctx.severity.forEach((sev, id) => { if (inMode(id)) (sev === 'full' ? full : partial).push(id); });
  const spared = ctx.spared.filter(inMode);
  const status = new Map();
  full.forEach(id => status.set(id, 'active-lesion'));
  partial.forEach(id => status.set(id, 'active-lesion-partial'));
  spared.forEach(id => status.set(id, 'spared'));

  const dg = lesionDigest(ctx);
  const rows = [];
  if (state.limbMode === 'dermatome' && !ctx.dermatomal) {
    rows.push({ key: '提示', text: '束及周围神经损伤不按皮节分布，请切到「皮区」。' });
  } else {
    const word = state.limbMode === 'motor' ? '瘫痪' : '感觉缺失';
    if (full.length) rows.push({ key: word, cls: 'full', chips: chips(full, 'lesion', { locate: true }) });
    if (partial.length) rows.push(partialRow(ctx, partial));
    if (!full.length && !partial.length) rows.push({ key: word, text: `图中${KIND_WORD[state.limbMode]}都不受累。` });
    if (spared.length) rows.push({ key: '保留', cls: 'keep', chips: chips(spared, 'keep', { locate: true }) });
  }
  if (dg.sign) rows.push({ key: '体征', text: dg.sign });
  if (dg.why) rows.push({ key: '原因', text: dg.why });
  if (dg.diff) rows.push({ key: '变化', cls: 'diff', text: dg.diff });
  return { status, focus: status.size > 0, caption: dg.site, rows };
}

// 部分受累：标签上只写「还剩什么」（同一条神经只写节段，换了神经才写神经名），完整的断/留放在悬停提示里。
// 很多时（如上干损伤）先列前 3 块，其余点「另 N 块」再看，免得把图挤小
function partialRow(ctx, partial) {
  const sig = [...ctx.marked].join() + '|' + ctx.level + '|' + state.limbMode;
  if (sig !== partialSig) { partialSig = sig; partialOpen = false; }
  const list = partial.length > 4 && !partialOpen ? partial.slice(0, 3) : partial;
  const row = {
    key: '部分', cls: 'partial',
    chips: list.map(id => {
      const d = ctx.detail.get(id);
      const cutNerves = new Set(d.hit.map(f => f.nerve));
      const left = d.kept.map(f => (cutNerves.has(f.nerve) ? '' : NERVE(f.nerve) + ' ') + SEG(f.roots) + (f.part ? `·${f.part}` : '')).join('、');
      return {
        id, text: `${zoneName(id)}（仍有 ${left}）`, cls: 'lesion partial', locate: true,
        title: `断：${d.hit.map(fiberText).join('、')}\n留：${d.kept.map(fiberText).join('、')}\n点击在图上定位`,
      };
    }),
  };
  if (list.length < partial.length) row.more = { count: partial.length - list.length, title: partial.slice(3).map(zoneName).join('、') };
  return row;
}

// 浏览：主要支配与「部分参与」分开
function browseView(ctx) {
  const isMotor = state.limbMode === 'motor';
  const activeCls = isMotor ? 'active-motor' : 'active-sensory';
  const inMode = id => PlexusModel.zone(id).kind === state.limbMode;
  const status = new Map();

  // 从上肢图选中了一个肌肉/皮区
  if (ctx.zoneId) {
    const z = PlexusModel.zone(ctx.zoneId);
    if (inMode(ctx.zoneId)) status.set(ctx.zoneId, activeCls);
    const segs = PlexusModel.ROOTS.filter(r => z.fibers.some(f => f.roots.includes(r))).map(r => r.toUpperCase()).join('、');
    const rows = [];
    if (z.kind !== 'dermatome') {
      const mainF = z.fibers.filter(f => !f.part), partF = z.fibers.filter(f => f.part);
      rows.push({ key: partF.length ? '主要支配' : '支配', text: mainF.map(fiberText).join(' + ') });
      if (partF.length) rows.push({ key: '部分参与', cls: 'partial', text: partF.map(fiberText).join(' + ') });
    }
    return {
      status, focus: status.size > 0, rows,
      caption: z.kind === 'dermatome' ? `${z.name} → ${NERVE(ctx.activeId)}` : `${z.name} · ${segs}`,
    };
  }

  // 选中（或悬停）了一个结构
  const main = [], part = [];
  PlexusModel.zonesFor(ctx.activeId).forEach(id => {
    if (inMode(id)) (PlexusModel.relation(id, ctx.activeId) === 'part' ? part : main).push(id);
  });
  main.forEach(id => status.set(id, activeCls));
  part.forEach(id => status.set(id, 'active-part'));
  if (!status.size) {
    return { status, focus: false, rows: [], caption: isMotor ? '纯感觉神经，或其肌肉未画出' : '纯运动神经，无独立皮区' };
  }
  const rows = [];
  if (main.length) rows.push({ key: isMotor ? '支配' : '分布', chips: chips(main, '') });
  if (part.length) {
    rows.push({
      key: '部分参与', cls: 'partial',
      chips: part.map(id => {
        const z = PlexusModel.zone(id);
        const via = z.fibers.filter(f => f.part);
        const others = [...new Set(z.fibers.filter(f => !f.part).map(f => NERVE(f.nerve)))];
        return { id, text: `${z.name}（仅${via.map(f => f.part).join('、')}；主要由${others.join('、')}支配）`, cls: 'partial' };
      }),
    });
  }
  return { status, focus: true, rows, caption: `${NERVE(ctx.activeId)}：${isMotor ? '有纤维到达的肌肉' : '分布的' + KIND_WORD[state.limbMode]}` };
}

// ==================== 画 ====================
// 换模式时整体重建 SVG（由 app.updateUI 判断，随后它会调 applyLimbHighlights 上色）
export function renderLimbSVG() {
  renderSvg();
  renderExtras();
}

// ctx 来自 context.getHighlightContext()
export function applyLimbHighlights(ctx) {
  lastCtx = ctx;
  const view = limbView(ctx);
  paintSvg(view);
  caption.textContent = view.caption;
  renderSummary(view.rows);
  paint3d(view.status);
}

function paintSvg({ status, focus }) {
  limbSvg.querySelectorAll('.zone-shape').forEach(el => {
    const id = el.getAttribute('data-zone');
    el.classList.remove(...STATUS_CLASSES, 'linked');
    if (status.has(id)) el.classList.add(status.get(id));
    el.classList.toggle('picked', state.quizMode && !state.quizResult && state.quizPicks.has(id));
  });
  limbSvg.querySelectorAll('.zone-label, .zone-leader, .zone-leader-dot').forEach(el => {
    const s = status.get(el.getAttribute('data-zone'));
    el.classList.remove('on', 'lesion', 'linked', 'keep');
    if (s) el.classList.add('on', ...(STATUS_LABEL[s] ? [STATUS_LABEL[s]] : []));
  });
  limbSvg.classList.toggle('has-focus', focus);
}

// 3D 模型与它下方的「无网格肌肉」按钮：状态与 SVG 分区相同，另加反向题作答中的「已选」
function paint3d(status) {
  const show = use3d();
  limbSvg.classList.toggle('is-hidden', show);
  l3Extra.classList.toggle('is-hidden', !show || !l3Extra.childElementCount);
  limb3d.setVisible(show);
  if (!show) return;
  const look = new Map(status);
  if (state.quizMode && !state.quizResult) state.quizPicks.forEach(id => { if (!look.has(id)) look.set(id, 'picked'); });
  limb3d.setZoneStates(look);
  l3Extra.querySelectorAll('[data-zone]').forEach(b => {
    b.className = 'mini-chip' + (look.has(b.dataset.zone) ? ' ' + look.get(b.dataset.zone) : '');
  });
}

function renderSvg() {
  limbSvg.innerHTML = '';

  const defs = createSvgEl('defs');
  const clip = createSvgEl('clipPath', { id: 'limbClip' });
  clip.appendChild(createSvgEl('path', { d: LIMB_TORSO }));
  clip.appendChild(createSvgEl('path', { d: LIMB_ARM }));
  defs.appendChild(clip);
  limbSvg.appendChild(defs);

  [['前面观', 110], ['后面观', LIMB_W - 110]].forEach(([txt, x]) => {
    const t = createSvgEl('text', { x, y: 15, 'text-anchor': 'middle', class: 'limb-view-title' });
    t.textContent = txt;
    limbSvg.appendChild(t);
  });

  const labelLayer = createSvgEl('g');
  const big = state.limbMode === 'dermatome';

  ['a', 'p'].forEach(v => {
    const flip = v === 'p';
    const fx = x => flip ? LIMB_W - x : x;
    const g = createSvgEl('g', flip ? { transform: `translate(${LIMB_W},0) scale(-1,1)` } : {});
    g.appendChild(createSvgEl('path', { d: LIMB_TORSO, class: 'limb-fill' }));
    g.appendChild(createSvgEl('path', { d: LIMB_ARM, class: 'limb-fill' }));

    const zoneLayer = createSvgEl('g', { 'clip-path': 'url(#limbClip)' });
    LIMB_ZONES[state.limbMode].filter(z => z.v === v).forEach(z => {
      const p = createSvgEl('path', { d: z.d, class: 'zone-shape', 'data-zone': z.id });
      p.addEventListener('click', () => on.onZoneClick(z.id));
      // 图 → 摘要：悬停分区时，下方摘要里对应的名称也亮起
      p.addEventListener('mouseenter', () => linkChip(z.id, true));
      p.addEventListener('mouseleave', () => linkChip(z.id, false));
      const titleEl = createSvgEl('title');
      titleEl.textContent = zoneName(z.id);
      p.appendChild(titleEl);
      zoneLayer.appendChild(p);

      const [lx0, ly, a0] = z.lab;
      const lx = fx(lx0);
      const anchor = !flip || a0 === 'middle' ? a0 : (a0 === 'end' ? 'start' : 'end');
      if (z.pt) {
        const ex = lx + (anchor === 'end' ? 2.5 : -2.5);
        labelLayer.appendChild(createSvgEl('line', {
          x1: ex, y1: ly - 3.5, x2: fx(z.pt[0]), y2: z.pt[1], class: 'zone-leader', 'data-zone': z.id,
        }));
        labelLayer.appendChild(createSvgEl('circle', { cx: fx(z.pt[0]), cy: z.pt[1], r: 1.5, class: 'zone-leader-dot', 'data-zone': z.id }));
      }
      const attrs = { x: lx, y: ly, 'text-anchor': anchor, class: 'zone-label' + (big ? ' big' : ''), 'data-zone': z.id };
      if (z.rot) attrs.transform = `rotate(${flip ? -z.rot : z.rot} ${lx} ${ly - 3})`;
      const lbl = createSvgEl('text', attrs);
      lbl.textContent = z.t;
      labelLayer.appendChild(lbl);
    });
    g.appendChild(zoneLayer);

    g.appendChild(createSvgEl('path', { d: LIMB_ARM + ' ' + LIMB_TORSO_EDGE, class: 'limb-contour' }));
    if (state.limbMode === 'motor') g.appendChild(createSvgEl('path', { d: LIMB_MARKS[v], class: 'limb-mark' }));
    limbSvg.appendChild(g);
  });

  limbSvg.appendChild(labelLayer);
}

// 没有网格的肌肉（现在只在补充网格包加载失败时出现，即背阔肌）：在 3D 图下方放文字按钮
function renderExtras() {
  l3Extra.innerHTML = '';
  if (!use3d()) return;
  LIMB_ZONES.motor.filter(z => !limb3d.has(z.id) && z.v === 'p').forEach(z => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mini-chip';
    b.dataset.zone = z.id;
    b.textContent = zoneName(z.id);
    b.title = '这块肌肉没有三维模型 · 点击溯源';
    b.addEventListener('click', () => on.onZoneClick(z.id));
    b.addEventListener('mouseenter', () => linkChip(z.id, true));
    b.addEventListener('mouseleave', () => linkChip(z.id, false));
    l3Extra.appendChild(b);
  });
}

// ---------- 摘要 ----------
// 每行 = 左侧小标题（文字 + 图例色块）+ 右侧名称标签或一句话
function renderSummary(rows) {
  summary.innerHTML = '';
  rows.forEach(r => {
    const row = document.createElement('div');
    row.className = 'sum-row' + (r.cls ? ' ' + r.cls : '');
    const k = document.createElement('span');
    k.className = 'sum-key';
    k.textContent = r.key;
    const v = document.createElement('div');
    v.className = 'sum-val';
    row.append(k, v);
    summary.appendChild(row);
    if (r.text) { v.textContent = r.text; return; }
    r.chips.forEach(c => v.appendChild(chip(c)));
    if (r.more) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'mini-chip more';
      more.textContent = `另 ${r.more.count} 块 ▸`;
      more.title = r.more.title;
      more.addEventListener('click', () => { partialOpen = true; applyLimbHighlights(lastCtx); });
      v.appendChild(more);
    }
  });
}

// locate = true：点击只在图上定位（损伤、自测结果下不离开当前状态）；否则点击溯源
function chip({ id, text, cls, locate = false, title = '' }) {
  const c = document.createElement('button');
  c.type = 'button';
  c.className = 'mini-chip' + (cls ? ' ' + cls : '');
  c.dataset.zone = id;
  c.textContent = text;
  c.title = title || (locate ? '点击在图上定位' : `点击溯源：${zoneName(id)}`);
  c.addEventListener('click', () => (locate ? flashZone(id) : on.onChipClick(id)));
  ['mouseenter', 'focus'].forEach(ev => c.addEventListener(ev, () => linkZone(id, true)));
  ['mouseleave', 'blur'].forEach(ev => c.addEventListener(ev, () => linkZone(id, false)));
  return c;
}

// ---------- 摘要 ↔ 图 的悬停联动 ----------
function linkZone(id, isOn) {
  limbSvg.querySelectorAll(`[data-zone="${id}"]`).forEach(el => el.classList.toggle('linked', isOn));
  l3Extra.querySelectorAll(`[data-zone="${id}"]`).forEach(el => el.classList.toggle('linked', isOn));
  if (use3d()) limb3d.link(id, isOn);
}

function linkChip(id, isOn) {
  summary.querySelectorAll(`[data-zone="${id}"]`).forEach(el => el.classList.toggle('linked', isOn));
}

// 在图上闪一下某个分区（摘要 → 图的定位，不改变当前状态）
function flashZone(id) {
  if (use3d()) limb3d.flash(id);
  limbSvg.querySelectorAll(`.zone-shape[data-zone="${id}"]`).forEach(el => {
    el.classList.remove('flash');
    void el.getBoundingClientRect();
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1300);
  });
}
