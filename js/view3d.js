// 3D 解剖视图：three.js 渲染骨骼、动脉、臂丛与上肢神经走行、肌肉。
// 与 2D 图共用同一份 state 和高亮上下文（context.getHighlightContext），只是另一种画法。
// 第一次切到 3D 时才创建 WebGL；没有 WebGL 或数据加载失败时显示提示，不影响其余功能。
//
// 几何：神经与动脉走行来自 assets/plexus/plexus3d.json（Z-Anatomy 中心线，配准到 BodyParts3D 骨骼；
// 由 tools/zanatomy/build-plexus3d.mjs 生成），骨骼与肌肉用 assets/limb 和 assets/plexus 的网格。
// 走行数据的坐标为右臂外侧 +X，渲染时取反（见 V）；网格坐标即渲染坐标。
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { PlexusModel } from './model.js';
import { NODES, EDGES } from './data/nodes.js';
import { loadMeshPack, fetchJson } from './meshpack.js';
import { state, labelsHidden } from './state.js';
import { getHighlightContext } from './context.js';

const viewport = document.getElementById('viewport3d');
const canvas = document.getElementById('scene');
const labelBox = document.getElementById('labels3d');
const focusBtn = document.getElementById('btnFocus3d');
// 标签被挤开时，用引线连回它所指的结构
const leaderSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
leaderSvg.setAttribute('class', 'leaders3d');
labelBox.appendChild(leaderSvg);
const leaderPool = [];
const fallback = document.getElementById('hud3dFallback');
const captionEl = document.getElementById('hud3dCaption');
const defaultCaption = captionEl.textContent;

// 数据按右上肢书写（外侧为正）；把外侧取反，右臂就出现在画面左侧，如同面对患者
const V = p => new THREE.Vector3(-p[0], p[1], p[2]);

// 两套配色：浅色舞台用更深、更饱和的颜色，深色舞台用亮色。跟随页面主题切换。
const PALETTES = {
  light: {
    C: {
      root: '#2563eb', trunk: '#0891b2', ant: '#059669', post: '#d97706', collateral: '#64748b',
      lesion: '#dc2626', partial: '#ea580c', accent: '#0284c7', muscle: '#c9ad8f', bone: '#a8a29e', artery: '#f87171',
      arteryEmissive: '#000000', pulse: '#0ea5e9', boneOpacity: 0.38, arteryOpacity: 0.6, glow: 0.12,
    },
    NODE: {
      lat_cord: '#059669', post_cord: '#d97706', med_cord: '#047857', musculocutaneous: '#2563eb', axillary: '#b45309',
      radial: '#d97706', median: '#059669', ulnar: '#047857', pin: '#c2410c', srn: '#ca8a04', ain: '#10b981',
    },
  },
  dark: {
    C: {
      root: '#38bdf8', trunk: '#06b6d4', ant: '#34d399', post: '#fbbf24', collateral: '#94a3b8',
      lesion: '#f43f5e', partial: '#fb923c', accent: '#7dd3fc', muscle: '#bfa58a', bone: '#e7e2d8', artery: '#dc2626',
      arteryEmissive: '#450a0a', pulse: '#ffffff', boneOpacity: 0.3, arteryOpacity: 0.8, glow: 0.22,
    },
    NODE: {
      lat_cord: '#34d399', post_cord: '#fbbf24', med_cord: '#10b981', musculocutaneous: '#60a5fa', axillary: '#f59e0b',
      radial: '#fbbf24', median: '#34d399', ulnar: '#10b981', pin: '#fbbf24', srn: '#fde68a', ain: '#6ee7b7',
    },
  },
};
let C = PALETTES.light.C, NODE_COLOR = PALETTES.light.NODE;
const NODE_R = { root: 0.42, trunk: 0.5, division: 0.3, cord: 0.55, branch: 0.48, collateral: 0.28, subbranch: 0.32 };
// 结构自身走行的管径
const TUBE_R = { root: 0.3, trunk: 0.32, cord: 0.3, branch: 0.3, collateral: 0.17, subbranch: 0.2 };
const TWIG_R = { collateral: 0.07 }; // 细枝（肌支、指神经等），其余 0.1
const EDGE_R = { main: 0.32, ant: 0.27, post: 0.27, collateral: 0.15 };
const edgeColor = type => ({ main: C.root, ant: C.ant, post: C.post, collateral: C.collateral })[type];

function baseColor(n) {
  if (NODE_COLOR[n.id]) return NODE_COLOR[n.id];
  if (n.stage === 'root') return C.root;
  if (n.stage === 'trunk') return C.trunk;
  if (n.stage === 'division') return n.divisionType === 'post' ? C.post : C.ant;
  return C.collateral;
}

const short = n => n.stage === 'root' ? n.label.replace(' 神经根', '') : n.label;

// 标签放在走行的哪个位置（0 = 起点，1 = 终点）：终末支在腋窝挤在一起，往远端挪到已经分开的地方
const LABEL_ALONG = { branch: 0.22, collateral: 0.45, subbranch: 0.35 };
// 标签优先级：互相遮挡时先放高的，被挡住的暂时隐藏，放大视图后会自动出现
const LABEL_PRI = { root: 30, trunk: 28, cord: 26, branch: 24, subbranch: 16, division: 12, collateral: 10 };

let ready = false, failed = false, running = false, building = false;
let renderer, scene, camera, controls;
// 走行数据（plexus3d.json）：anchors 锚点、courses 自身走行、extras 细枝、edges 连线路径、
// arteries 动脉、cameraViews 预设视角、ctxLabels 骨骼/动脉标签、drawn/adjusted 补画或调整过的结构
let D = null, drawnNodes = new Set(), adjusted = new Set();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const nodeObjs = {}; // id → { group, mat, base, halo, label, r }
const edgeObjs = []; // { key, collateral, mesh, mat, base, curve, pulse, pulseOn }
const muscleObjs = {}; // 靶区 id → { mat, meshes }
const ctxLabels = []; // 骨骼、动脉的固定标签 { el, pos }
const groups = {};
const mats = {}; // 需要随主题换色的共享材质
let pickables = [];
let camTween = null;
let activePreset = 'front';
let lastCtx = null;

// 走行数据 + 骨骼/肌肉网格，缺一不可
async function loadData() {
  const [data, limb, extra] = await Promise.all([
    fetchJson('assets/plexus/plexus3d.json'), loadMeshPack('assets/limb/meshes'), loadMeshPack('assets/plexus/meshes'),
  ]);
  return { data, parts: [...limb, ...extra] };
}

// ---------- 几何 ----------
function curveOf(points) {
  const pts = points.map(V);
  return pts.length === 2 ? new THREE.LineCurve3(pts[0], pts[1]) : new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}

function tubeMesh(points, r, mat) {
  const curve = curveOf(points);
  const geo = new THREE.TubeGeometry(curve, Math.max(16, Math.ceil(curve.getLength() * 3)), r, 10, false);
  return { mesh: new THREE.Mesh(geo, mat), curve };
}

function makeLabel(text, cls) {
  const el = document.createElement('div');
  el.className = 'label3d' + (cls ? ' ' + cls : '');
  el.textContent = text;
  labelBox.appendChild(el);
  return el;
}

// 网格坐标即渲染坐标，直接放进场景
function buildBones(parts) {
  const g = groups.bones = new THREE.Group();
  const mat = mats.bone = new THREE.MeshStandardMaterial({ color: C.bone, roughness: 0.85, transparent: true, opacity: C.boneOpacity, depthWrite: false });
  parts.filter(p => p.kind === 'bone' || p.kind === 'rib').forEach(p => g.add(new THREE.Mesh(p.geometry, mat)));
  scene.add(g);
}

function buildArteries() {
  const g = groups.artery = new THREE.Group();
  const mat = mats.artery = new THREE.MeshStandardMaterial({ color: C.artery, emissive: C.arteryEmissive, roughness: 0.5, transparent: true, opacity: C.arteryOpacity });
  D.arteries.forEach(a => g.add(tubeMesh(a.path, a.r, mat).mesh));
  scene.add(g);
}

// 骨骼、动脉、肌肉的固定标签，跟随各自图层显示
function buildCtxLabels() {
  D.ctxLabels.forEach(l => ctxLabels.push({ el: makeLabel(l.text, 'ctx' + (l.cls ? ' ' + l.cls : '')), pos: V(l.pos), layer: l.layer }));
}

function buildNerves() {
  const g = groups.nerves = new THREE.Group();
  NODES.forEach(n => {
    const base = baseColor(n);
    const mat = new THREE.MeshStandardMaterial({ color: base, emissive: base, emissiveIntensity: 0.22, roughness: 0.45, transparent: true });
    const ng = new THREE.Group();
    const r = NODE_R[n.stage];
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat);
    sphere.position.copy(V(D.anchors[n.id]));
    sphere.userData.nodeId = n.id;
    ng.add(sphere);
    pickables.push(sphere);
    let labelPos = sphere.position;
    if (D.courses[n.id]) {
      const { mesh: t, curve } = tubeMesh(D.courses[n.id], TUBE_R[n.stage] || 0.25, mat);
      t.userData.nodeId = n.id;
      ng.add(t);
      pickables.push(t);
      if (LABEL_ALONG[n.stage]) labelPos = curve.getPointAt(LABEL_ALONG[n.stage]);
    }
    (D.extras[n.id] || []).forEach(p => {
      const { mesh: t } = tubeMesh(p, TWIG_R[n.stage] || 0.1, mat);
      t.userData.nodeId = n.id;
      ng.add(t);
      pickables.push(t);
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: C.accent, transparent: true, opacity: 0.25, depthWrite: false }));
    halo.position.copy(sphere.position);
    halo.visible = false;
    ng.add(halo);
    g.add(ng);
    nodeObjs[n.id] = { group: ng, mat, base, halo, r, label: makeLabel(short(n)), pos: labelPos, node: n, pri: 0 };
  });

  const pulseMat = mats.pulse = new THREE.MeshBasicMaterial({ color: C.pulse, transparent: true, opacity: 0.95, depthWrite: false });
  EDGES.forEach(e => {
    const key = e.from + '>' + e.to;
    const pts = D.edges[key];
    const toNode = NODES.find(x => x.id === e.to);
    const baseOf = () => ['cord', 'branch', 'subbranch'].includes(toNode.stage) ? baseColor(toNode) : edgeColor(e.type);
    const base = baseOf();
    const mat = new THREE.MeshStandardMaterial({ color: base, emissive: base, emissiveIntensity: 0.2, roughness: 0.5, transparent: true });
    const { mesh, curve } = tubeMesh(pts, EDGE_R[e.type], mat);
    const pulse = new THREE.Mesh(new THREE.SphereGeometry(EDGE_R[e.type] * 1.25, 10, 8), pulseMat);
    pulse.visible = false;
    g.add(mesh, pulse);
    edgeObjs.push({ key, collateral: e.type === 'collateral', mesh, mat, base, baseOf, curve, pulse, pulseOn: true });
  });
  scene.add(g);
}

// 按运动靶区（part.zone）归并；无靶区的背景肌（斜角肌等）不参与点选
function buildMuscles(parts) {
  const g = groups.muscles = new THREE.Group();
  const zone = id => muscleObjs[id] || (muscleObjs[id] = {
    mat: new THREE.MeshStandardMaterial({ color: C.muscle, roughness: 0.7, transparent: true, opacity: 0.3, depthWrite: false }), meshes: [],
  });
  mats.bgMuscle = new THREE.MeshStandardMaterial({ color: C.muscle, roughness: 0.75, transparent: true, opacity: 0.18, depthWrite: false });
  parts.forEach(p => {
    if (p.kind === 'muscle' && p.zone) {
      const m = new THREE.Mesh(p.geometry, zone(p.zone).mat);
      m.userData.zoneId = p.zone;
      zone(p.zone).meshes.push(m);
      g.add(m);
      pickables.push(m);
    } else if (p.kind === 'bg') g.add(new THREE.Mesh(p.geometry, mats.bgMuscle));
  });
  scene.add(g);
}

// ---------- 相机 ----------
function presetGoal(name) {
  const v = D.cameraViews[name];
  const target = V(v.target);
  const dir = V(v.dir).normalize();
  return { target, pos: target.clone().add(dir.multiplyScalar(v.dist)) };
}

function markPreset(name) {
  activePreset = name;
  focusBtn.classList.remove('active');
  document.querySelectorAll('#camPresets .hud-pill').forEach(b => b.classList.toggle('active', b.dataset.cam === name));
}

export function setCamPreset(name) {
  markPreset(name);
  if (!ready || !name) return;
  const goal = presetGoal(name);
  camTween = { t0: performance.now(), from: { pos: camera.position.clone(), target: controls.target.clone() }, to: goal };
}

// 把镜头对准当前选中 / 受损的结构及其直接相连的结构。只在用户点「聚焦当前」或按 F 时触发，
// 平时切换选择不会自己转镜头（避免打断手动观察和课堂演示）。保持当前观察方向，只平移和拉近。
// 返回是否真的转了镜头。
export function focusCurrent() {
  if (!ready || !lastCtx) return false;
  const ids = new Set();
  lastCtx.marked.forEach(id => {
    ids.add(id);
    PlexusModel.parentsOf(id).forEach(x => ids.add(x));
    PlexusModel.childrenOf(id).forEach(x => ids.add(x));
  });
  const pts = [];
  ids.forEach(id => {
    if (!nodeObjs[id] || !nodeObjs[id].group.visible) return;
    pts.push(V(D.anchors[id]));
    // 只有焦点结构自身的走行算进取景范围；邻居只取锚点，免得把整条手臂都框进来
    if (lastCtx.marked.has(id) && D.courses[id]) D.courses[id].forEach(p => pts.push(V(p)));
  });
  if (!pts.length) return false;
  const box = new THREE.Box3().setFromPoints(pts);
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(5, ...pts.map(p => p.distanceTo(center))) + 2;
  const vfov = THREE.MathUtils.degToRad(camera.fov) / 2;
  const hfov = Math.atan(Math.tan(vfov) * camera.aspect);
  // 留出约两成边距，给上方的工具条和标签让位
  const dist = Math.min(controls.maxDistance, radius * 1.2 / Math.sin(Math.min(vfov, hfov)));
  const dir = camera.position.clone().sub(controls.target).normalize();
  camTween = { t0: performance.now(), from: { pos: camera.position.clone(), target: controls.target.clone() },
    to: { target: center, pos: center.clone().add(dir.multiplyScalar(dist)) } };
  markPreset(null);
  focusBtn.classList.add('active');
  return true;
}

// ---------- 拾取 ----------
function shown(obj) {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}

function pick(ev) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickables.filter(shown), false);
  // 神经优先于包在外面的半透明肌肉
  const nerve = hits.find(h => h.object.userData.nodeId && h.object.material.opacity > 0.5);
  return nerve || hits.find(h => h.object.userData.nodeId) || hits[0] || null;
}

function bindPointer() {
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointermove', e => {
    if (e.buttons) return;
    const hit = pick(e);
    const id = hit && hit.object.userData.nodeId;
    const zone = hit && !id && hit.object.userData.zoneId;
    viewport.style.cursor = hit ? 'pointer' : '';
    // 补画或调整过位置的结构，悬停时说明一句
    const note = id && drawnNodes.has(id) ? '：这一段在 Z-Anatomy 里缺失或接错，按解剖关系补画'
      : id && adjusted.has(id) ? '：上臂近段按教材移到肱动脉内侧' : '';
    captionEl.textContent = zone ? `${PlexusModel.zone(zone).name} · 点击溯源` : note ? nodeObjs[id].node.label + note : defaultCaption;
    on.onNodeHover(id || null);
  });
  canvas.addEventListener('pointerleave', () => { on.onNodeHover(null); captionEl.textContent = defaultCaption; });
  canvas.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
    down = null;
    const hit = pick(e);
    if (!hit) on.onBackgroundClick();
    else if (hit.object.userData.nodeId) on.onNodeClick(hit.object.userData.nodeId);
    else on.onZoneClick(hit.object.userData.zoneId);
  });
}

function resize() {
  if (!ready) return;
  const r = viewport.getBoundingClientRect();
  if (!r.width || !r.height) return;
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
}

function fail(message) {
  failed = true;
  building = false;
  running = false;
  fallback.textContent = message;
  fallback.classList.remove('is-hidden');
  captionEl.classList.add('is-hidden');
}

async function build() {
  building = true;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) {
    fail('此浏览器无法创建 WebGL，3D 视图不可用。');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.5, 1000);
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 6;
  controls.maxDistance = 200;
  controls.addEventListener('start', () => { camTween = null; markPreset(null); });

  scene.add(new THREE.HemisphereLight('#dbeafe', '#1e293b', 1.2));
  const key = new THREE.DirectionalLight('#ffffff', 1.5);
  key.position.set(-20, 30, 40);
  const rim = new THREE.DirectionalLight('#93c5fd', 0.6);
  rim.position.set(30, -10, -40);
  scene.add(key, rim);

  captionEl.textContent = '正在加载 3D 网格…';
  let loaded;
  try {
    loaded = await loadData();
  } catch (err) {
    console.warn('3D 数据加载失败', err);
    renderer.dispose();
    fail('3D 数据加载失败（assets/ 下的文件缺失或损坏），3D 视图不可用。其余功能不受影响。');
    return;
  }
  D = loaded.data;
  drawnNodes = new Set(D.drawn.nodes);
  adjusted = new Set(D.adjusted);
  captionEl.textContent = defaultCaption;

  buildBones(loaded.parts);
  buildArteries();
  buildNerves();
  buildMuscles(loaded.parts);
  buildCtxLabels();
  bindPointer();
  new ResizeObserver(resize).observe(viewport);

  ready = true;
  building = false;
  resize();
  const goal = presetGoal(activePreset || 'front');
  camera.position.copy(goal.pos);
  controls.target.copy(goal.target);
  controls.update();
  update(getHighlightContext());
}

// ---------- 样式（每次状态变化调用） ----------
export function update(ctx) {
  // 悬停只是临时高亮，不改变「聚焦当前」的对象
  if (!state.hoverId) {
    if (lastCtx && (!ctx || [...ctx.marked].join() !== [...lastCtx.marked].join())) focusBtn.classList.remove('active');
    lastCtx = ctx;
  }
  focusBtn.disabled = !lastCtx;
  if (!ready) return;
  const show = state.show3d;
  groups.bones.visible = show.bones;
  groups.artery.visible = show.artery;
  groups.muscles.visible = show.muscles;
  const hideNames = labelsHidden();
  const quiet = new Set(['division', 'collateral']);

  NODES.forEach(n => {
    const o = nodeObjs[n.id];
    const visible = n.stage !== 'collateral' || state.showCollaterals;
    const related = !ctx || ctx.nodes.has(n.id);
    const down = !!ctx && ctx.isLesion && ctx.downNodes.has(n.id);
    const focal = !!ctx && ctx.marked.has(n.id);
    o.group.visible = visible;
    const col = down ? C.lesion : o.base;
    o.mat.color.set(col);
    o.mat.emissive.set(col);
    o.mat.emissiveIntensity = focal ? 0.85 : (ctx && related ? 0.45 : C.glow);
    o.mat.opacity = related ? 1 : 0.13;
    o.mat.depthWrite = related;
    o.halo.visible = focal;
    o.halo.material.color.set(ctx && ctx.isLesion ? C.lesion : C.accent);
    o.focal = focal;
    o.showLabel = show.labels && visible && (ctx ? related : !quiet.has(n.stage));
    o.pri = (focal ? 100 : 0) + (ctx && related ? 40 : 0) + LABEL_PRI[n.stage];
    o.label.textContent = hideNames ? '？' : (state.cuts.has(n.id) ? '✂ ' : '') + short(n);
    o.label.classList.toggle('focal', focal);
    o.label.classList.toggle('lesion', down);
  });

  edgeObjs.forEach(e => {
    e.mesh.visible = !e.collateral || state.showCollaterals;
    let color = e.base, alpha = 0.9, glow = C.glow, pulseOn = true;
    if (ctx) {
      if (ctx.isLesion && ctx.downEdges.has(e.key)) { color = C.lesion; alpha = 1; glow = 0.6; pulseOn = false; }
      else if (ctx.isLesion && ctx.upEdges.has(e.key)) { alpha = 1; glow = 0.45; }
      else if (!ctx.isLesion && ctx.edges.has(e.key)) { alpha = 1; glow = 0.55; }
      else { alpha = 0.12; pulseOn = false; }
    }
    e.mat.color.set(color);
    e.mat.emissive.set(color);
    e.mat.emissiveIntensity = glow;
    e.mat.opacity = alpha;
    e.mat.depthWrite = alpha > 0.5;
    e.pulseOn = pulseOn;
  });

  // 肌肉：损伤 → 完全/部分受累；选中结构或分区 → 它支配的肌肉
  const hits = new Map();
  if (ctx && ctx.isLesion) ctx.severity.forEach((s, id) => hits.set(id, s));
  else if (ctx) (ctx.zoneId ? [ctx.zoneId] : PlexusModel.zonesFor(ctx.activeId)).forEach(id => hits.set(id, 'on'));
  Object.entries(muscleObjs).forEach(([id, m]) => {
    const h = state.quizMode && state.quizPicks.has(id) ? 'on' : hits.get(id);
    const color = h === 'full' ? C.lesion : h === 'partial' ? C.partial : h === 'on' ? C.accent : C.muscle;
    m.mat.color.set(color);
    m.mat.opacity = h ? 0.72 : (ctx ? 0.1 : 0.3);
  });
}

// ---------- 动画循环（只在 3D 可见时运行） ----------
const tmp = new THREE.Vector3();
// 标签相对锚点的候选位置（以标签宽高为单位的偏移）：先试正上方，被挡住再试更高、左右、下方。
// 只有当前相关的标签（选中 / 受累通路上的）会换位置并带引线；其余标签被挡住就先隐藏，放大后自然出现。
const SLOTS = [[0, -0.85], [0, -2.1], [0.75, -1.5], [-0.75, -1.5], [0.8, 0.1], [-0.8, 0.1], [0, 1.4], [0.9, -2.6], [-0.9, -2.6]];
function slotBox(it, k) {
  const [sx, sy] = SLOTS[k];
  const w = it.el._w, h = it.el._h;
  const cx = it.x + sx * (w + 22), cy = it.y + sy * h;
  return { cx, cy, x0: cx - w / 2 - 2, x1: cx + w / 2 + 2, y0: cy - h / 2 - 1, y1: cy + h / 2 + 1 };
}

function updateLabels() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const items = [];
  const hide = el => { if (el._shown) { el.style.visibility = 'hidden'; el._shown = false; } };
  const add = (el, pos, on, pri, movable) => {
    if (!on) { hide(el); return; }
    tmp.copy(pos).project(camera);
    const x = ((tmp.x + 1) / 2) * w, y = ((1 - tmp.y) / 2) * h;
    if (tmp.z > 1 || tmp.z < -1 || x < -40 || x > w + 40 || y < -20 || y > h + 40) { hide(el); return; }
    if (el._text !== el.textContent) { el._text = el.textContent; el._w = el.offsetWidth; el._h = el.offsetHeight; }
    items.push({ el, x, y, movable, pri: pri + (el._shown ? 3 : 0) });
  };
  Object.values(nodeObjs).forEach(o => add(o.label, o.pos, o.showLabel, o.pri, o.pri >= 40));
  ctxLabels.forEach(l => add(l.el, l.pos, state.show3d.labels && state.show3d[l.layer], 5, false));

  items.sort((a, b) => b.pri - a.pri);
  const placed = [];
  let used = 0;
  const free = r => r.x0 > 0 && r.x1 < w && r.y0 > 0 && r.y1 < h
    && !placed.some(p => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0);
  for (const it of items) {
    const { el } = it;
    // 上一帧用过的位置优先，转动时标签不会来回跳
    const order = it.movable ? [el._slot || 0, ...SLOTS.keys()] : [0];
    let k = -1, r = null;
    for (const c of order) { const b = slotBox(it, c); if (free(b)) { k = c; r = b; break; } }
    if (k < 0) { hide(el); continue; }
    el._slot = k;
    placed.push(r);
    el.style.transform = `translate(${r.cx}px, ${r.cy}px) translate(-50%, -50%)`;
    if (!el._shown) { el.style.visibility = 'visible'; el._shown = true; }
    if (k === 0) continue;
    // 引线：从结构所在点连到标签框最近的边
    let line = leaderPool[used];
    if (!line) { line = document.createElementNS('http://www.w3.org/2000/svg', 'line'); leaderSvg.appendChild(line); leaderPool.push(line); }
    used++;
    line.setAttribute('x1', it.x); line.setAttribute('y1', it.y);
    line.setAttribute('x2', Math.max(r.x0, Math.min(r.x1, it.x))); line.setAttribute('y2', Math.max(r.y0, Math.min(r.y1, it.y)));
    line.style.display = '';
  }
  for (let i = used; i < leaderPool.length; i++) leaderPool[i].style.display = 'none';
}

function frame(ts) {
  if (!running) return;
  requestAnimationFrame(frame);
  if (!ready) return; // 网格还在加载
  const time = ts * 0.001;
  if (camTween) {
    const k = Math.min(1, (performance.now() - camTween.t0) / 650);
    const e = 1 - Math.pow(1 - k, 3);
    camera.position.lerpVectors(camTween.from.pos, camTween.to.pos, e);
    controls.target.lerpVectors(camTween.from.target, camTween.to.target, e);
    if (k >= 1) camTween = null;
  }
  controls.autoRotate = state.show3d.auto;
  controls.autoRotateSpeed = 1.4;
  controls.update();

  edgeObjs.forEach((e, i) => {
    const on = state.pulse && e.pulseOn && e.mesh.visible;
    e.pulse.visible = on;
    if (on) e.pulse.position.copy(e.curve.getPointAt((time * 0.45 + i * 0.173) % 1));
  });
  Object.values(nodeObjs).forEach(o => {
    if (o.focal) o.halo.scale.setScalar(o.r * (2.3 + Math.sin(time * 6) * 0.45));
  });
  renderer.render(scene, camera);
  updateLabels();
}

// 页面主题切换时调用：换配色并重新着色
export function setTheme(dark) {
  const pal = PALETTES[dark ? 'dark' : 'light'];
  C = pal.C;
  NODE_COLOR = pal.NODE;
  if (!ready) return;
  Object.values(nodeObjs).forEach(o => { o.base = baseColor(o.node); });
  edgeObjs.forEach(e => { e.base = e.baseOf(); });
  mats.bone.color.set(C.bone);
  mats.bone.opacity = C.boneOpacity;
  mats.artery.color.set(C.artery);
  mats.artery.emissive.set(C.arteryEmissive);
  mats.artery.opacity = C.arteryOpacity;
  mats.pulse.color.set(C.pulse);
  if (mats.bgMuscle) mats.bgMuscle.color.set(C.muscle);
  update(lastCtx);
}

// 用户操作交给 app.js：{ onNodeHover, onNodeClick, onBackgroundClick, onZoneClick }。
// WebGL 推迟到第一次打开 3D 视图时（show）再创建
let on = {};
export function init(handlers) {
  on = handlers;
}

export function show() {
  if (!ready && !failed && !building) build();
  if (failed) return;
  update(getHighlightContext());
  resize();
  if (!running) { running = true; requestAnimationFrame(frame); }
}

export function hide() {
  running = false;
}
