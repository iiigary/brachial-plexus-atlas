// 右侧上肢图：前面观画一遍，后面观是它的水平镜像；分区被轮廓裁剪。
import { PlexusModel } from './model.js';
import { LIMB_W, LIMB_ARM, LIMB_TORSO, LIMB_TORSO_EDGE, LIMB_MARKS, LIMB_ZONES } from './data/limb.js';
import { nodeMap } from './data/nodes.js';
import { state } from './state.js';
import { createSvgEl } from './plexus2d.js';
import { onZoneClick, onChipClick, zonePicking, lesionDigest } from './app.js';
import * as limb3d from './limb3d.js';

const limbSvg = document.getElementById('limbSvg');
const summary = document.getElementById('limbSummary');
const caption = document.getElementById('limbCaption');
const l3Box = document.getElementById('limb3d');
const l3Extra = document.getElementById('limb3dExtra');

// 「肌肉」页优先用真实网格。网格异步加载；加载完成前和失败时都显示 SVG 示意图。
// SVG 在肌肉页照常生成（只是隐藏），它的分区类名就是 3D 的状态来源。
let l3State = 'loading', lastCtx = null, l3Hover = null;
const use3d = () => state.limbMode === 'motor' && l3State === 'ok';
limb3d.init(l3Box, {
  onZoneClick: id => onZoneClick(id),
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

// 没有网格的肌肉（现在只在补充网格包加载失败时出现，即背阔肌）：在 3D 图下方放文字按钮，状态类与 SVG 分区相同
function renderExtras() {
  l3Extra.innerHTML = '';
  if (!use3d()) return;
  LIMB_ZONES.motor.filter(z => !limb3d.has(z.id) && z.v === 'p').forEach(z => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mini-chip';
    b.dataset.zone = z.id;
    b.textContent = PlexusModel.target(z.id).name;
    b.title = '这块肌肉没有三维模型 · 点击溯源';
    b.addEventListener('click', () => onZoneClick(z.id));
    b.addEventListener('mouseenter', () => linkChip(z.id, true));
    b.addEventListener('mouseleave', () => linkChip(z.id, false));
    l3Extra.appendChild(b);
  });
}

function sync3d() {
  const on = use3d();
  limbSvg.classList.toggle('is-hidden', on);
  l3Extra.classList.toggle('is-hidden', on ? !l3Extra.childElementCount : true);
  limb3d.setVisible(on);
  if (!on) return;
  const classes = new Map();
  limbSvg.querySelectorAll('.zone-shape[data-zone]').forEach(el => {
    const id = el.getAttribute('data-zone');
    classes.set(id, [...(classes.get(id) || []), ...el.classList]);
  });
  limb3d.setZoneStates(classes);
  l3Extra.querySelectorAll('[data-zone]').forEach(b => {
    b.className = 'mini-chip ' + (classes.get(b.dataset.zone) || []).filter(c => c !== 'zone-shape').join(' ');
  });
}

export function renderLimbSVG() {
  renderSvg();
  renderExtras();
  sync3d();
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
      const t = PlexusModel.target(z.id);
      const p = createSvgEl('path', { d: z.d, class: 'zone-shape', 'data-zone': z.id });
      p.addEventListener('click', () => onZoneClick(z.id));
      // 图 → 摘要：悬停分区时，下方摘要里对应的名称也亮起
      p.addEventListener('mouseenter', () => linkChip(z.id, true));
      p.addEventListener('mouseleave', () => linkChip(z.id, false));
      const titleEl = createSvgEl('title');
      titleEl.textContent = t.name;
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

const NERVE = id => nodeMap[id].label;
const SEG = roots => roots.map(r => r.toUpperCase()).join('、');
const fiberText = f => `${NERVE(f.nerve)} ${SEG(f.roots)}${f.part ? `（${f.part}）` : ''}`;
const linkZone = (id, on) => {
  limbSvg.querySelectorAll(`[data-zone="${id}"]`).forEach(el => el.classList.toggle('linked', on));
  l3Extra.querySelectorAll(`[data-zone="${id}"]`).forEach(el => el.classList.toggle('linked', on));
  if (use3d()) limb3d.link(id, on);
};
const linkChip = (id, on) => summary.querySelectorAll(`[data-zone="${id}"]`).forEach(el => el.classList.toggle('linked', on));

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

// 摘要里的一行：左侧小标题（文字 + 图例色块），右侧是名称标签或一句话
function row(key, cls) {
  const r = document.createElement('div');
  r.className = 'sum-row' + (cls ? ' ' + cls : '');
  const k = document.createElement('span');
  k.className = 'sum-key';
  k.textContent = key;
  const v = document.createElement('div');
  v.className = 'sum-val';
  r.append(k, v);
  summary.appendChild(r);
  return v;
}

// locate = true：点击只在图上定位（损伤、自测结果下不离开当前状态）；否则点击溯源
function chip(box, id, text, cls, { locate = false, title = '' } = {}) {
  const c = document.createElement('button');
  c.type = 'button';
  c.className = 'mini-chip' + (cls ? ' ' + cls : '');
  c.dataset.zone = id;
  c.textContent = text;
  c.title = title || (locate ? '点击在图上定位' : `点击溯源：${PlexusModel.target(id).name}`);
  c.addEventListener('click', () => (locate ? flashZone(id) : onChipClick(id)));
  ['mouseenter', 'focus'].forEach(ev => c.addEventListener(ev, () => linkZone(id, true)));
  ['mouseleave', 'blur'].forEach(ev => c.addEventListener(ev, () => linkZone(id, false)));
  box.appendChild(c);
}

let partialSig = '', partialOpen = false;
const ZONE_CLASSES = ['active-motor', 'active-sensory', 'active-part', 'active-lesion', 'active-lesion-partial', 'spared',
  'quiz-ok', 'quiz-missed', 'quiz-extra', 'linked'];
const KIND_WORD = { motor: '肌肉', cutaneous: '皮区', dermatome: '皮节' };

// ctx 来自 app.getActiveNodeContext()。图上的状态和下方摘要用同一份数据生成，避免两处说法不一致。
export function applyLimbHighlights(ctx) {
  lastCtx = ctx;
  highlight(ctx);
  sync3d();
}

function highlight(ctx) {
  const zoneEls = limbSvg.querySelectorAll('.zone-shape');
  const labelEls = limbSvg.querySelectorAll('.zone-label, .zone-leader, .zone-leader-dot');
  const inMode = id => PlexusModel.target(id).kind === state.limbMode;
  summary.innerHTML = '';
  zoneEls.forEach(el => {
    el.classList.remove(...ZONE_CLASSES);
    el.classList.toggle('picked', state.quizMode && !state.quizResult && state.quizPicks.has(el.getAttribute('data-zone')));
  });
  labelEls.forEach(el => el.classList.remove('on', 'lesion', 'linked', 'keep'));
  limbSvg.classList.remove('has-focus');
  const mark = (id, cls, labelCls) => {
    zoneEls.forEach(el => { if (el.getAttribute('data-zone') === id) el.classList.add(cls); });
    labelEls.forEach(el => { if (el.getAttribute('data-zone') === id) el.classList.add('on', ...(labelCls ? [labelCls] : [])); });
  };

  if (zonePicking()) {
    caption.textContent = `点选${KIND_WORD[state.limbMode]}，再按「提交」 · 已选 ${state.quizPicks.size} 个`;
    const v = state.quizPicks.size ? row('已选') : null;
    state.quizPicks.forEach(id => chip(v, id, PlexusModel.target(id).name, 'pick', { locate: true }));
    return;
  }

  // 反向题提交后：在作答的同一张图上区分选对、漏选、多选
  if (state.quizMode && state.quizResult) {
    const { picks, answer, optional, reveal } = state.quizResult;
    const ok = [...answer].filter(id => picks.has(id)), missed = [...answer].filter(id => !picks.has(id));
    const extra = [...picks].filter(id => !answer.has(id) && !optional.has(id));
    ok.forEach(id => mark(id, 'quiz-ok'));
    missed.forEach(id => mark(id, reveal ? 'active-lesion' : 'quiz-missed', 'lesion'));
    optional.forEach(id => mark(id, 'active-lesion-partial', 'lesion'));
    extra.forEach(id => mark(id, 'quiz-extra'));
    limbSvg.classList.add('has-focus');
    caption.textContent = !answer.size ? `答案：没有完全受累的区域${extra.length ? ` · 多选 ${extra.length}` : ''}`
      : reveal ? `答案共 ${answer.size} 个`
      : `答案共 ${answer.size} 个 · 选对 ${ok.length} · 漏选 ${missed.length} · 多选 ${extra.length}`;
    [['✓ 选对', ok, 'ok'], [reveal ? '答案' : '○ 漏选', missed, reveal ? 'lesion' : 'missed'],
      ['部分受累 · 不计分', [...optional], 'lesion partial'], ['✕ 多选', extra, 'extra']].forEach(([key, ids, cls]) => {
      if (!ids.length) return;
      const v = row(key, cls.split(' ').pop());
      ids.forEach(id => chip(v, id, PlexusModel.target(id).name, cls, { locate: true }));
    });
    return;
  }

  if (!ctx) {
    caption.textContent = state.cutMode || state.quizMode ? '' : '点击肌肉或皮区，反向溯源';
    return;
  }

  const isMotor = state.limbMode === 'motor';

  // ---------- 损伤：受累 / 部分 / 保留 / 原因 ----------
  if (ctx.isLesion) {
    const full = [], partial = [];
    ctx.severity.forEach((sev, id) => { if (inMode(id)) (sev === 'full' ? full : partial).push(id); });
    const spared = ctx.spared.filter(inMode);
    full.forEach(id => mark(id, 'active-lesion', 'lesion'));
    partial.forEach(id => mark(id, 'active-lesion-partial', 'lesion'));
    spared.forEach(id => mark(id, 'spared', 'keep'));
    limbSvg.classList.toggle('has-focus', full.length + partial.length + spared.length > 0);

    const dg = lesionDigest(ctx);
    const nonDerm = state.limbMode === 'dermatome' && !ctx.dermatomal;
    caption.textContent = dg.site;
    if (nonDerm) row('提示').textContent = '束及周围神经损伤不按皮节分布，请切到「皮区」。';
    else {
      const word = isMotor ? '瘫痪' : '感觉缺失';
      if (full.length) { const v = row(word, 'full'); full.forEach(id => chip(v, id, PlexusModel.target(id).name, 'lesion', { locate: true })); }
      if (partial.length) {
        const v = row('部分', 'partial');
        // 部分受累的很多时（如上干损伤）先列前 3 块，其余点开再看，免得把图挤小
        const sig = [...ctx.sites].join() + '|' + ctx.level + '|' + state.limbMode;
        if (sig !== partialSig) { partialSig = sig; partialOpen = false; }
        const list = partial.length > 4 && !partialOpen ? partial.slice(0, 3) : partial;
        list.forEach(id => {
          const d = ctx.detail.get(id);
          // 标签上只写「还剩什么」：同一条神经只写节段，换了神经才写神经名；完整的断/留放在悬停提示里
          const cutNerves = new Set(d.hit.map(f => f.nerve));
          const left = d.kept.map(f => (cutNerves.has(f.nerve) ? '' : NERVE(f.nerve) + ' ') + SEG(f.roots) + (f.part ? `·${f.part}` : '')).join('、');
          chip(v, id, `${PlexusModel.target(id).name}（仍有 ${left}）`, 'lesion partial', {
            locate: true, title: `断：${d.hit.map(fiberText).join('、')}\n留：${d.kept.map(fiberText).join('、')}\n点击在图上定位`,
          });
        });
        if (list.length < partial.length) {
          const more = document.createElement('button');
          more.type = 'button';
          more.className = 'mini-chip more';
          more.textContent = `另 ${partial.length - list.length} 块 ▸`;
          more.title = partial.slice(3).map(id => PlexusModel.target(id).name).join('、');
          more.addEventListener('click', () => { partialOpen = true; applyLimbHighlights(ctx); });
          v.appendChild(more);
        }
      }
      if (!full.length && !partial.length) row(word).textContent = `图中${KIND_WORD[state.limbMode]}都不受累。`;
      if (spared.length) { const v = row('保留', 'keep'); spared.forEach(id => chip(v, id, PlexusModel.target(id).name, 'keep', { locate: true })); }
    }
    if (dg.sign) row('体征').textContent = dg.sign;
    if (dg.why) row('原因').textContent = dg.why;
    if (dg.diff) row('变化', 'diff').textContent = dg.diff;
    return;
  }

  // ---------- 浏览：主要支配与「部分参与」分开 ----------
  const zoneTarget = ctx.zoneId ? PlexusModel.target(ctx.zoneId) : null;
  const main = [], part = [];
  if (zoneTarget) main.push(ctx.zoneId);
  else PlexusModel.targetsFor(ctx.activeId).forEach(id => {
    if (inMode(id)) (PlexusModel.relation(id, ctx.activeId) === 'part' ? part : main).push(id);
  });
  main.filter(inMode).forEach(id => mark(id, isMotor ? 'active-motor' : 'active-sensory'));
  part.forEach(id => mark(id, 'active-part'));
  const shown = main.filter(inMode).length + part.length;
  limbSvg.classList.toggle('has-focus', shown > 0);

  if (zoneTarget) {
    const segs = PlexusModel.ROOTS.filter(r => zoneTarget.fibers.some(f => f.roots.includes(r))).map(r => r.toUpperCase()).join('、');
    caption.textContent = zoneTarget.kind === 'dermatome'
      ? `${zoneTarget.name} → ${NERVE(ctx.activeId)}`
      : `${zoneTarget.name} · ${segs}`;
    if (zoneTarget.kind !== 'dermatome') {
      const mainF = zoneTarget.fibers.filter(f => !f.part), partF = zoneTarget.fibers.filter(f => f.part);
      row(partF.length ? '主要支配' : '支配').textContent = mainF.map(fiberText).join(' + ');
      if (partF.length) row('部分参与', 'partial').textContent = partF.map(fiberText).join(' + ');
    }
    return;
  }
  if (!shown) {
    caption.textContent = isMotor ? '纯感觉神经，或其肌肉未画出' : '纯运动神经，无独立皮区';
    return;
  }
  caption.textContent = `${NERVE(ctx.activeId)}：${isMotor ? '有纤维到达的肌肉' : '分布的' + KIND_WORD[state.limbMode]}`;
  if (main.length) { const v = row(isMotor ? '支配' : '分布'); main.forEach(id => chip(v, id, PlexusModel.target(id).name)); }
  if (part.length) {
    const v = row('部分参与', 'partial');
    part.forEach(id => {
      const t = PlexusModel.target(id);
      const via = t.fibers.filter(f => f.part && PlexusModel.relation(id, ctx.activeId) === 'part');
      const others = t.fibers.filter(f => !f.part).map(f => NERVE(f.nerve));
      chip(v, id, `${t.name}（仅${via.map(f => f.part).join('、')}；主要由${[...new Set(others)].join('、')}支配）`, 'partial');
    });
  }
}
