// 右侧上肢图：前面观画一遍，后面观是它的水平镜像；分区被轮廓裁剪。
import { PlexusModel } from './model.js';
import { LIMB_W, LIMB_ARM, LIMB_TORSO, LIMB_TORSO_EDGE, LIMB_MARKS, LIMB_ZONES } from './data/limb.js';
import { nodeMap } from './data/nodes.js';
import { state } from './state.js';
import { createSvgEl } from './plexus2d.js';
import { onZoneClick, onChipClick, zonePicking } from './app.js';

const limbSvg = document.getElementById('limbSvg');
const activeChips = document.getElementById('activeChips');
const caption = document.getElementById('limbCaption');

export function renderLimbSVG() {
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

// ctx 来自 app.getActiveNodeContext()；返回值 = 本次高亮的靶区 id → 'full' | 'partial' | 'on'
export function applyLimbHighlights(ctx) {
  const zoneEls = limbSvg.querySelectorAll('.zone-shape');
  const labelEls = limbSvg.querySelectorAll('.zone-label, .zone-leader, .zone-leader-dot');
  activeChips.innerHTML = '';
  zoneEls.forEach(el => {
    el.classList.remove('active-motor', 'active-sensory', 'active-lesion', 'active-lesion-partial');
    el.classList.toggle('picked', state.quizMode && state.quizPicks.has(el.getAttribute('data-zone')));
  });
  labelEls.forEach(el => el.classList.remove('on', 'lesion'));

  if (zonePicking()) {
    caption.textContent = `已选 ${state.quizPicks.size} 个`;
    return;
  }
  if (!ctx) {
    caption.textContent = state.cutMode ? '' : '点击肌肉或皮区，反向溯源';
    return;
  }

  const isMotor = state.limbMode === 'motor';
  const zoneTarget = ctx.zoneId ? PlexusModel.target(ctx.zoneId) : null;
  const siteName = ctx.isLesion ? ctx.levelName : nodeMap[ctx.activeId].label;

  const hits = new Map();
  if (ctx.isLesion) {
    ctx.severity.forEach((sev, id) => hits.set(id, sev === 'full' ? 'active-lesion' : 'active-lesion-partial'));
  } else {
    const ids = zoneTarget ? [ctx.zoneId] : PlexusModel.targetsFor(ctx.activeId);
    ids.forEach(id => hits.set(id, isMotor ? 'active-motor' : 'active-sensory'));
  }

  const matched = new Map();
  zoneEls.forEach(el => {
    const id = el.getAttribute('data-zone');
    if (!hits.has(id)) return;
    el.classList.add(hits.get(id));
    matched.set(id, hits.get(id) === 'active-lesion-partial');
  });
  labelEls.forEach(el => {
    if (!hits.has(el.getAttribute('data-zone'))) return;
    el.classList.add('on');
    if (ctx.isLesion) el.classList.add('lesion');
  });

  // 同一神经上没被这次损伤波及的分支
  const spared = ctx.isLesion
    ? ctx.spared.map(id => PlexusModel.target(id)).filter(t => t.kind === state.limbMode).map(t => t.name)
    : [];
  const sparedNote = !spared.length ? ''
    : ctx.branch ? ` · 保留：${spared.join('、')}`
    : ` · 近端已分出，保留：${spared.join('、')}`;

  if (ctx.isLesion && state.limbMode === 'dermatome' && !ctx.dermatomal) {
    caption.textContent = '束及周围神经损伤不按皮节分布，请看「皮区」';
  } else if (matched.size === 0) {
    caption.textContent = ctx.isLesion
      ? `不累及图中${isMotor ? '肌肉' : '皮区'}${sparedNote}`
      : (isMotor ? '纯感觉神经，或其肌肉未画出' : '纯运动神经，无独立皮区');
  } else if (ctx.isLesion) {
    caption.textContent = (isMotor ? '受累肌肉' : '感觉减退') + sparedNote;
  } else if (zoneTarget) {
    const segs = PlexusModel.ROOTS.filter(r => zoneTarget.fibers.some(f => f.roots.includes(r))).map(r => r.toUpperCase()).join('、');
    const nerves = [...new Set(zoneTarget.fibers.map(f => nodeMap[f.nerve].label))].join(' + ');
    caption.textContent = zoneTarget.kind === 'dermatome'
      ? `${zoneTarget.name} → ${siteName}`
      : `${zoneTarget.name} → ${nerves} · ${segs}`;
  } else {
    caption.textContent = '';
  }

  matched.forEach((partial, id) => {
    const chip = document.createElement('span');
    chip.className = `mini-chip ${ctx.isLesion ? 'lesion' : ''}`;
    const name = PlexusModel.target(id).name;
    chip.textContent = partial ? `${name}（部分）` : name;
    chip.addEventListener('click', () => onChipClick(id));
    activeChips.appendChild(chip);
  });
}
