// 左侧 2D 通路图：一次性画出节点和连线，之后只切换 class。
import { PlexusModel } from './model.js';
import { STAGES, NODES, EDGES, nodeMap } from './data/nodes.js';
import { state } from './state.js';
import { onNodeHover, onNodeClick, onBackgroundClick, labelsHidden } from './app.js';

const svg = document.getElementById('plexus');
const VIEW_W = 1060, VIEW_H = 620;

export function createSvgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const isSmall = n => n.stage === 'collateral' || n.stage === 'subbranch';

function nodeColor(n) {
  if (n.stage === 'root') return 'var(--root-color)';
  if (n.stage === 'trunk') return 'var(--trunk-color)';
  if (n.stage === 'division') return n.divisionType === 'post' ? 'var(--post-color)' : 'var(--ant-color)';
  if (n.stage === 'cord') return 'var(--cord-color)';
  if (n.stage === 'branch' || n.stage === 'subbranch') return 'var(--branch-color)';
  return 'var(--collateral-color)';
}

function edgeColor(e) {
  if (e.type === 'post') return 'var(--post-color)';
  if (e.type === 'ant') return 'var(--ant-color)';
  if (e.type === 'collateral') return 'var(--collateral-color)';
  return 'var(--trunk-color)';
}

function buildCurve(fromNode, toNode, isCollateral) {
  const x1 = fromNode.x + fromNode.w / 2;
  const y1 = fromNode.y;
  const x2 = toNode.x - toNode.w / 2;
  const y2 = toNode.y;
  if (isCollateral && toNode.dock === 'gap') {
    // 夹在「根」「干」两列之间的旁支（胸长神经）：从各条根的右缘出发，接到节点的上/下缘，
    // 这样连线不会穿过别的根。
    const down = toNode.y > fromNode.y;
    const sx = x1, sy = fromNode.y + (down ? 13 : -13);
    const far = Math.abs(toNode.y - fromNode.y) > 100;
    const tx = toNode.x + (down ? (far ? 8 : -14) : 0);
    const ty = toNode.y + (down ? -toNode.h / 2 : toNode.h / 2);
    return `M ${sx} ${sy} C ${tx} ${sy}, ${tx} ${sy}, ${tx} ${ty}`;
  }
  if (isCollateral) {
    const sx = fromNode.x;
    const sy = toNode.y < fromNode.y ? fromNode.y - fromNode.h / 2 : fromNode.y + fromNode.h / 2;
    const tx = toNode.x - toNode.w / 2;
    const ty = toNode.y;
    const mx = (sx + tx) / 2;
    return `M ${sx} ${sy} C ${sx} ${ty}, ${mx} ${ty}, ${tx} ${ty}`;
  }
  const dx = (x2 - x1) * 0.52;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export function renderPlexusSVG() {
  svg.innerHTML = '';
  const bgRect = createSvgEl('rect', { x: 0, y: 0, width: VIEW_W, height: VIEW_H, fill: 'transparent' });
  bgRect.addEventListener('click', onBackgroundClick);
  svg.appendChild(bgRect);

  STAGES.forEach((s, idx) => {
    const t1 = createSvgEl('text', { x: s.x, y: 24, 'text-anchor': 'middle', class: 'stage-header' });
    t1.textContent = s.title;
    svg.appendChild(t1);
    const t2 = createSvgEl('text', { x: s.x, y: 40, 'text-anchor': 'middle', class: 'stage-sub' });
    t2.textContent = s.sub;
    svg.appendChild(t2);
    if (idx < STAGES.length - 1) {
      const midX = (s.x + STAGES[idx + 1].x) / 2;
      svg.appendChild(createSvgEl('line', { x1: midX, y1: 48, x2: midX, y2: 610, class: 'stage-divider' }));
    }
  });

  const edgeLayer = createSvgEl('g');
  const pulseLayer = createSvgEl('g');
  EDGES.forEach(e => {
    if (e.type === 'collateral' && !state.showCollaterals) return;
    const d = buildCurve(nodeMap[e.from], nodeMap[e.to], e.type === 'collateral');
    edgeLayer.appendChild(createSvgEl('path', {
      d,
      class: `edge ${e.type === 'post' ? 'posterior' : ''} ${e.type === 'collateral' ? 'collateral-edge' : ''}`,
      stroke: edgeColor(e), 'data-from': e.from, 'data-to': e.to,
    }));
    pulseLayer.appendChild(createSvgEl('path', { d, class: 'pulse-edge', 'data-from': e.from, 'data-to': e.to }));
  });
  svg.appendChild(edgeLayer);
  svg.appendChild(pulseLayer);

  const hideLabel = labelsHidden();
  const nodeLayer = createSvgEl('g');
  NODES.forEach(n => {
    const small = isSmall(n);
    if (n.stage === 'collateral' && !state.showCollaterals) return;
    const g = createSvgEl('g', { class: 'node-group', 'data-id': n.id });
    g.appendChild(createSvgEl('rect', {
      x: n.x - n.w / 2, y: n.y - n.h / 2, width: n.w, height: n.h,
      class: small ? 'node-rect collateral-rect' : 'node-rect',
      stroke: nodeColor(n),
    }));

    // 旁支和前臂分支的第二行是节段，由模型推导
    const subText = small ? PlexusModel.segLabel(n.id) : n.sub;
    const label = createSvgEl('text', { x: n.x, y: n.y - (small ? 2 : 4), 'text-anchor': 'middle', class: small ? 'collateral-label' : 'node-label' });
    label.textContent = hideLabel ? '？' : n.label;
    g.appendChild(label);

    const sub = createSvgEl('text', { x: n.x, y: n.y + (small ? 11 : 13), 'text-anchor': 'middle', class: 'node-sub' });
    sub.textContent = hideLabel ? (small ? '分支' : n.stage.toUpperCase()) : subText;
    g.appendChild(sub);

    // 切断标记（自由切断模式）
    const cx = n.x + n.w / 2 - 2, cy = n.y - n.h / 2 + 2;
    const cut = createSvgEl('g', { class: 'cut-mark', transform: `translate(${cx} ${cy})` });
    cut.appendChild(createSvgEl('circle', { r: 7.5 }));
    const ct = createSvgEl('text', { 'text-anchor': 'middle', y: 3.6 });
    ct.textContent = '✂';
    cut.appendChild(ct);
    g.appendChild(cut);

    g.addEventListener('mouseenter', () => onNodeHover(n.id));
    g.addEventListener('mouseleave', () => onNodeHover(null));
    g.addEventListener('click', ev => { ev.stopPropagation(); onNodeClick(n.id); });
    nodeLayer.appendChild(g);
  });
  svg.appendChild(nodeLayer);
  svg.classList.toggle('cut-mode', state.cutMode);
}

export function applyPlexusHighlights(ctx) {
  const nodeEls = svg.querySelectorAll('.node-group');
  const edgeEls = svg.querySelectorAll('.edge');
  const pulseEls = svg.querySelectorAll('.pulse-edge');
  const keyOf = el => el.getAttribute('data-from') + '>' + el.getAttribute('data-to');
  svg.classList.toggle('cut-mode', state.cutMode);
  nodeEls.forEach(el => el.classList.toggle('is-cut', state.cuts.has(el.getAttribute('data-id'))));

  if (!ctx) {
    nodeEls.forEach(el => el.classList.remove('dim', 'selected', 'lesion-site'));
    edgeEls.forEach(el => el.classList.remove('dim', 'highlight', 'lesion-downstream'));
    pulseEls.forEach(el => el.classList.add('active-pulse'));
    return;
  }

  nodeEls.forEach(el => {
    const id = el.getAttribute('data-id');
    el.classList.toggle('dim', !ctx.nodes.has(id));
    el.classList.toggle('lesion-site', ctx.isLesion && ctx.sites.has(id));
    el.classList.toggle('selected', !ctx.isLesion && ctx.sites.has(id));
  });

  if (ctx.isLesion) {
    edgeEls.forEach(el => {
      const isDown = ctx.downEdges.has(keyOf(el));
      const isUp = ctx.upEdges.has(keyOf(el));
      el.classList.toggle('lesion-downstream', isDown);
      el.classList.toggle('highlight', isUp && !isDown);
      el.classList.toggle('dim', !isDown && !isUp);
    });
    pulseEls.forEach(el => el.classList.toggle('active-pulse', ctx.upEdges.has(keyOf(el)) && !ctx.downEdges.has(keyOf(el))));
  } else {
    edgeEls.forEach(el => {
      const onPath = ctx.edges.has(keyOf(el));
      el.classList.toggle('highlight', onPath);
      el.classList.toggle('dim', !onPath);
      el.classList.remove('lesion-downstream');
    });
    pulseEls.forEach(el => el.classList.toggle('active-pulse', ctx.edges.has(keyOf(el))));
  }
}
