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
import { LESION_SITES } from './data/lesion-sites.js';
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
// id → { group, mat, cutMat, base, halo, label, r, sphere, anchorK,
//        course: { mesh, curve, segs, samples, total } | null, twigs: [{ mesh, start, samples, k }],
//        pts 自身走行与细枝的采样点（取景用）, pickPts 再加上归它的连线（点选容差用） }
const nodeObjs = {};
const edgeObjs = []; // { key, to, collateral, mesh, mat, base, curve, pulse, pulseOn }
const siteSets = {}; // 损伤预设 → 走行上的部位标记 { group, items: [{ level, mesh, ring, label, pos, node, k }] }
let lastIsoKey = null; // 上一次自动取景对应的对象，换了对象才转镜头
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

const RADIAL = 10; // 管的径向段数；按损伤点切分材质时用来换算索引
function tubeMesh(points, r, mat) {
  const curve = curveOf(points);
  const segs = Math.max(16, Math.ceil(curve.getLength() * 3));
  const geo = new THREE.TubeGeometry(curve, segs, r, RADIAL, false);
  return { mesh: new THREE.Mesh(geo, mat), curve, segs };
}

// 沿曲线约每 0.5 cm 一个点，用于点选容差和取景
const sampleCurve = curve => curve.getSpacedPoints(Math.max(2, Math.ceil(curve.getLength() * 2)));

function nearestIdx(points, p) {
  let k = 0, best = Infinity;
  points.forEach((q, i) => { const d = q.distanceToSquared(p); if (d < best) { best = d; k = i; } });
  return k;
}

// 每根细枝从走行上的哪一段发出（接在别的细枝上的，继承那根细枝的位置）。
// 损伤点在第 k 段时，k 以远发出的细枝画成受累。
function attachTwigs(o) {
  if (!o.course) { o.twigs.forEach(t => { t.k = 0; }); return; }
  const S = o.course.samples;
  const ref = o.twigs.map((t, i) => {
    const k = nearestIdx(S, t.start);
    if (S[k].distanceTo(t.start) < 0.3) return { k };
    let best = Infinity, twig = null;
    o.twigs.forEach((u, j) => { if (j !== i) u.samples.forEach(q => { const d = q.distanceTo(t.start); if (d < best) { best = d; twig = j; } }); });
    return { k, twig };
  });
  const resolve = (i, depth) => ref[i].twig == null || depth > 8 ? ref[i].k : resolve(ref[i].twig, depth + 1);
  o.twigs.forEach((t, i) => { t.k = resolve(i, 0); });
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
    // 损伤点以远的部分用这份材质
    const cutMat = new THREE.MeshStandardMaterial({ color: C.lesion, emissive: C.lesion, emissiveIntensity: 0.6, roughness: 0.45, transparent: true });
    const ng = new THREE.Group();
    const r = NODE_R[n.stage];
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat);
    sphere.position.copy(V(D.anchors[n.id]));
    sphere.userData.nodeId = n.id;
    ng.add(sphere);
    pickables.push(sphere);
    let labelPos = sphere.position;
    let course = null;
    const pts = [sphere.position.clone()];
    if (D.courses[n.id]) {
      // 主走行用两组材质：[原色, 受累色]，按损伤点切分（见 update）
      const { mesh: t, curve, segs } = tubeMesh(D.courses[n.id], TUBE_R[n.stage] || 0.25, [mat, cutMat]);
      const total = t.geometry.index.count;
      t.geometry.clearGroups();
      t.geometry.addGroup(0, total, 0);
      t.userData.nodeId = n.id;
      ng.add(t);
      pickables.push(t);
      course = { mesh: t, curve, segs, samples: curve.getSpacedPoints(segs), total };
      pts.push(...sampleCurve(curve));
      if (LABEL_ALONG[n.stage]) labelPos = curve.getPointAt(LABEL_ALONG[n.stage]);
    }
    const twigs = (D.extras[n.id] || []).map(p => {
      const { mesh: t, curve } = tubeMesh(p, TWIG_R[n.stage] || 0.1, mat);
      t.userData.nodeId = n.id;
      ng.add(t);
      pickables.push(t);
      const samples = sampleCurve(curve);
      pts.push(...samples);
      return { mesh: t, start: V(p[0]), samples, k: 0 };
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: C.accent, transparent: true, opacity: 0.25, depthWrite: false }));
    halo.position.copy(sphere.position);
    halo.visible = false;
    ng.add(halo);
    g.add(ng);
    const label = makeLabel(short(n));
    label.dataset.node = n.id;
    const o = nodeObjs[n.id] = {
      group: ng, mat, cutMat, base, halo, r, label, pos: labelPos, node: n, pri: 0,
      sphere, course, twigs, pts, pickPts: [...pts], anchorK: course ? nearestIdx(course.samples, sphere.position) : 0,
    };
    attachTwigs(o);
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
    // 连线点中时算作它颜色所属的结构：根→干的连线画成根的颜色，归根；其余归下游结构
    const owner = toNode.stage === 'trunk' ? e.from : e.to;
    mesh.userData.nodeId = owner;
    pickables.push(mesh);
    nodeObjs[owner].pickPts.push(...sampleCurve(curve));
    edgeObjs.push({ key, to: e.to, collateral: e.type === 'collateral', mesh, mat, base, baseOf, curve, pulse, pulseOn: true });
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
  return aimAt(pts);
}

// 把镜头平移、拉近到恰好框住这些点，保持当前观察方向
function aimAt(pts) {
  if (!pts.length) return false;
  const box = new THREE.Box3().setFromPoints(pts);
  const center = box.getCenter(new THREE.Vector3());
  let radius = 0;
  pts.forEach(p => { radius = Math.max(radius, p.distanceTo(center)); });
  radius = Math.max(5, radius) + 2;
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

// 隔离时的取景：选中结构（或损伤预设所有部位涉及的结构）的整条走行和细枝，加上部位标记
function isolationPoints(c) {
  const ids = new Set(c.marked);
  if (c.key) PlexusModel.LESION_PRESETS[c.key].levels.forEach(l => l.sites.forEach(id => ids.add(id)));
  const pts = [];
  ids.forEach(id => { const o = nodeObjs[id]; if (o && o.group.visible) pts.push(...o.pts); });
  if (c.key && siteSets[c.key]) siteSets[c.key].items.forEach(it => pts.push(it.pos));
  return pts;
}

// 换了隔离对象（另一条神经或另一个损伤预设）时自动取景；同一预设里换部位不动镜头。
// 只在 3D 可见时触发，否则留到下次 show()。键取自上下文本身，不读 state（主题切换时会用旧的上下文重画）
function isolationKey(c) {
  if (c.isLesion) return c.key ? 'L:' + c.key : 'C:' + [...c.marked].join(',');
  return 'S:' + c.activeId + '|' + (c.zoneId || '');
}

// ---------- 损伤部位标记 ----------
// 部位在走行上的位置：有 LESION_SITES 条目的取该结构走行上高度最接近的采样点；
// 否则放在切断结构的中点（多个切断点取平均）
function siteGeom(key, level) {
  const e = LESION_SITES[key] && LESION_SITES[key][level.key];
  const c = e && nodeObjs[e.node] && nodeObjs[e.node].course;
  if (c) {
    const S = c.samples;
    let k = 0;
    S.forEach((p, i) => { if (Math.abs(p.y - e.y) < Math.abs(S[k].y - e.y)) k = i; });
    const tangent = S[Math.min(S.length - 1, k + 1)].clone().sub(S[Math.max(0, k - 1)]).normalize();
    return { pos: S[k].clone(), node: e.node, k, tangent };
  }
  const ps = level.sites.map(id => { const o = nodeObjs[id]; return o.course ? o.course.curve.getPointAt(0.5) : o.sphere.position.clone(); });
  const pos = ps.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / ps.length);
  return { pos, node: null, k: -1, tangent: null };
}

// 第一次用到某个损伤预设时才建它的标记：每个部位一个可点的小球和名称，当前部位再加一圈「切面」
function siteSet(key) {
  if (siteSets[key]) return siteSets[key];
  const group = new THREE.Group();
  const overlay = m => { m.renderOrder = 10; return m; }; // 不被骨骼、肌肉遮住
  const items = PlexusModel.LESION_PRESETS[key].levels.map(level => {
    const g = siteGeom(key, level);
    const mesh = overlay(new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12),
      new THREE.MeshBasicMaterial({ color: C.accent, transparent: true, depthTest: false, depthWrite: false })));
    mesh.position.copy(g.pos);
    mesh.userData.site = { key, level: level.key, name: level.name };
    group.add(mesh);
    pickables.push(mesh);
    let ring = null;
    if (g.tangent) {
      ring = overlay(new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.13, 8, 32),
        new THREE.MeshBasicMaterial({ color: C.lesion, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false })));
      ring.position.copy(g.pos);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), g.tangent);
      group.add(ring);
    }
    const label = makeLabel(level.name, 'site');
    label.dataset.key = key;
    label.dataset.level = level.key;
    return { ...g, level, mesh, ring, label };
  });
  scene.add(group);
  return (siteSets[key] = { group, items });
}

// ---------- 拾取 ----------
function shown(obj) {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}

const proj = new THREE.Vector3();
// 屏幕上离指针最近的神经（tol 像素以内）：strong = 当前相关、不透明的；weak = 变淡的
function nearestNode(px, py, rect, tol) {
  let best = tol * tol, bestWeak = best, strong = null, weak = null;
  Object.values(nodeObjs).forEach(o => {
    if (!shown(o.group)) return;
    const opaque = o.mat.opacity > 0.5;
    for (const p of o.pickPts) {
      proj.copy(p).project(camera);
      if (proj.z > 1 || proj.z < -1) continue;
      const dx = ((proj.x + 1) / 2) * rect.width - px, dy = ((1 - proj.y) / 2) * rect.height - py, d = dx * dx + dy * dy;
      if (opaque) { if (d < best) { best = d; strong = o.node.id; } } else if (d < bestWeak) { bestWeak = d; weak = o.node.id; }
    }
  });
  return { strong, weak };
}

// 返回 { site } 损伤部位标记 | { node } 神经 | { zone } 肌肉 | null。
// 神经管很细，射线没打中时按屏幕距离找最近的神经（鼠标 14 px、触屏 22 px 以内）。
// 顺序：部位标记 > 射线打中的相关神经 > 附近的相关神经 > 射线打中的变淡神经 > 肌肉 > 附近的变淡神经
function pick(ev) {
  const rect = canvas.getBoundingClientRect();
  const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
  pointer.set((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickables.filter(shown), false);
  const site = hits.find(h => h.object.userData.site);
  if (site) return { site: site.object.userData.site };
  const nerves = hits.filter(h => h.object.userData.nodeId);
  const opaque = h => (Array.isArray(h.object.material) ? h.object.material[0] : h.object.material).opacity > 0.5;
  const ray = nerves.find(opaque);
  if (ray) return { node: ray.object.userData.nodeId };
  const near = nearestNode(px, py, rect, ev.pointerType === 'touch' ? 22 : 14);
  if (near.strong) return { node: near.strong };
  if (nerves[0]) return { node: nerves[0].object.userData.nodeId };
  const zone = hits.find(h => h.object.userData.zoneId);
  if (zone) return { zone: zone.object.userData.zoneId };
  return near.weak ? { node: near.weak } : null;
}

function captionFor(hit) {
  if (hit.site) return `损伤部位：${hit.site.name} · 点击切换到这里`;
  if (hit.zone) return `${PlexusModel.zone(hit.zone).name} · 点击溯源`;
  if (labelsHidden()) return '点击选择这个结构';
  const id = hit.node;
  // 补画或调整过位置的结构，悬停时说明一句
  const note = drawnNodes.has(id) ? '：这一段在 Z-Anatomy 里缺失或接错，按解剖关系补画'
    : adjusted.has(id) ? '：上臂近段按教材移到肱动脉内侧' : ' · 点击选中';
  return nodeObjs[id].node.label + note;
}

function hoverHit(hit) {
  viewport.style.cursor = hit ? 'pointer' : '';
  captionEl.textContent = hit ? captionFor(hit) : defaultCaption;
  on.onNodeHover((hit && hit.node) || null);
}

function clickHit(hit) {
  // 看损伤时点空白不退出损伤（旋转、平移时容易误点）；退出用工具条按钮、Esc 或 0
  if (!hit) { if (!state.lesionKey) on.onBackgroundClick(); }
  else if (hit.site) on.onLevelClick(hit.site.key, hit.site.level);
  else if (hit.node) on.onNodeClick(hit.node);
  else on.onZoneClick(hit.zone);
}

function bindPointer() {
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointermove', e => { if (!e.buttons) hoverHit(pick(e)); });
  canvas.addEventListener('pointerleave', () => hoverHit(null));
  canvas.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
    down = null;
    clickHit(pick(e));
  });
  // 标签也能点：神经名 = 选中，部位名 = 切换部位。滚轮转给画布，标签上也能缩放
  const hitOf = el => el.dataset.level ? { site: { key: el.dataset.key, level: el.dataset.level, name: el.textContent } }
    : el.dataset.node ? { node: el.dataset.node } : null;
  labelBox.addEventListener('click', e => {
    const el = e.target.closest('.label3d');
    const hit = el && hitOf(el);
    if (hit) clickHit(hit);
  });
  labelBox.addEventListener('pointerover', e => {
    const el = e.target.closest('.label3d');
    if (el && hitOf(el)) hoverHit(hitOf(el));
  });
  labelBox.addEventListener('pointerout', e => { if (e.target.closest('.label3d')) hoverHit(null); });
  labelBox.addEventListener('wheel', e => { e.preventDefault(); canvas.dispatchEvent(new WheelEvent('wheel', e)); }, { passive: false });
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
  // 悬停只是临时高亮，不改变「聚焦当前」和隔离的对象
  if (!state.hoverId) {
    if (lastCtx && (!ctx || [...ctx.marked].join() !== [...lastCtx.marked].join())) focusBtn.classList.remove('active');
    lastCtx = ctx;
  }
  focusBtn.disabled = !lastCtx;
  if (!ready) return;
  const show = state.show3d;
  groups.bones.visible = show.bones;
  groups.artery.visible = show.artery;
  const hideNames = labelsHidden();
  const quiet = new Set(['division', 'collateral']);

  // 隔离：只留选中 / 损伤的通路。自测（会暴露答案）和手动切断（要能点别的结构）时不隔离
  const iso = show.isolate && lastCtx && !state.quizMode && !state.cutMode ? lastCtx : null;
  const isoEdges = iso && new Set([...iso.edges, ...(iso.upEdges || []), ...(iso.downEdges || [])]);

  // 损伤预设：部位标记，以及当前部位在走行上的切断点 cut = { node, k }
  const preset = ctx && ctx.isLesion && ctx.key ? ctx.key : null;
  const level = preset && PlexusModel.LESION_PRESETS[preset].levels.find(l => l.key === ctx.level);
  const plane = (level && level.plane) || 0;
  if (preset) siteSet(preset);
  let cut = null;
  Object.entries(siteSets).forEach(([key, set]) => {
    set.group.visible = key === preset;
    set.items.forEach(it => {
      const cur = key === preset && it.level.key === ctx.level;
      it.mesh.material.color.set(cur ? C.lesion : C.accent);
      it.mesh.scale.setScalar(cur ? 1.3 : 1);
      if (it.ring) { it.ring.visible = cur; it.ring.material.color.set(C.lesion); }
      it.label.classList.toggle('current', cur);
      if (cur && it.node && ctx.marked.has(it.node)) cut = { node: it.node, k: it.k };
    });
  });
  // 母神经在某平面受损时，在更近端已分出的具名分支（如腕管损伤时的骨间前神经）不受累
  const sparedSub = new Set();
  if (ctx && ctx.isLesion) ctx.downNodes.forEach(id => {
    const sp = PlexusModel.SUBBRANCH_PLANE[id];
    if (sp != null && sp < plane && PlexusModel.parentsOf(id).some(p => ctx.marked.has(p))) sparedSub.add(id);
  });

  NODES.forEach(n => {
    const o = nodeObjs[n.id];
    const visible = (n.stage !== 'collateral' || state.showCollaterals) && (!iso || iso.nodes.has(n.id));
    const related = !ctx || ctx.nodes.has(n.id);
    const down = !!ctx && ctx.isLesion && ctx.downNodes.has(n.id) && !sparedSub.has(n.id);
    const focal = !!ctx && ctx.marked.has(n.id);
    // split：损伤点落在这条结构的走行上，近端照常、远端受累
    const split = !!cut && cut.node === n.id;
    o.group.visible = visible;
    const col = down && !split ? C.lesion : o.base;
    o.mat.color.set(col);
    o.mat.emissive.set(col);
    o.mat.emissiveIntensity = focal && !split ? 0.85 : (ctx && related ? 0.45 : C.glow);
    o.mat.opacity = related ? 1 : 0.13;
    o.mat.depthWrite = related;
    o.cutMat.color.set(C.lesion);
    o.cutMat.emissive.set(C.lesion);
    o.cutMat.emissiveIntensity = 0.7;
    o.cutMat.opacity = o.mat.opacity;
    o.cutMat.depthWrite = o.mat.depthWrite;
    if (o.course) {
      const g = o.course.mesh.geometry, total = o.course.total;
      const at = split ? Math.min(total, cut.k * RADIAL * 6) : total;
      g.clearGroups();
      if (at > 0) g.addGroup(0, at, 0);
      if (at < total) g.addGroup(at, total - at, 1);
    }
    o.twigs.forEach(t => { t.mesh.material = split && t.k >= cut.k ? o.cutMat : o.mat; });
    o.sphere.material = split && o.anchorK >= cut.k ? o.cutMat : o.mat;
    o.halo.visible = focal && !split;
    o.halo.material.color.set(ctx && ctx.isLesion ? C.lesion : C.accent);
    o.focal = focal && !split;
    o.showLabel = show.labels && visible && (ctx ? related : !quiet.has(n.stage));
    o.pri = (focal ? 100 : 0) + (ctx && related ? 40 : 0) + LABEL_PRI[n.stage];
    o.label.textContent = hideNames ? '？' : (state.cuts.has(n.id) ? '✂ ' : '') + short(n);
    o.label.classList.toggle('focal', focal);
    o.label.classList.toggle('lesion', down);
  });

  edgeObjs.forEach(e => {
    e.mesh.visible = (!e.collateral || state.showCollaterals) && (!iso || isoEdges.has(e.key));
    let color = e.base, alpha = 0.9, glow = C.glow, pulseOn = true;
    if (ctx) {
      const spared = sparedSub.has(e.to);
      if (ctx.isLesion && ctx.downEdges.has(e.key) && !spared) { color = C.lesion; alpha = 1; glow = 0.6; pulseOn = false; }
      else if (ctx.isLesion && (ctx.upEdges.has(e.key) || spared)) { alpha = 1; glow = 0.45; }
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

  // 肌肉：损伤 → 完全/部分受累，保留的用本色；选中结构或分区 → 它支配的肌肉。
  // 隔离时即使没开「肌肉」图层，也显示这些相关的肌肉
  const hits = new Map();
  if (ctx && ctx.isLesion) ctx.severity.forEach((s, id) => hits.set(id, s));
  else if (ctx) (ctx.zoneId ? [ctx.zoneId] : PlexusModel.zonesFor(ctx.activeId)).forEach(id => hits.set(id, 'on'));
  const spared = new Set(ctx && ctx.isLesion ? ctx.spared : []);
  groups.muscles.visible = show.muscles || !!iso;
  Object.entries(muscleObjs).forEach(([id, m]) => {
    const h = state.quizMode && state.quizPicks.has(id) ? 'on' : hits.get(id) || (spared.has(id) ? 'spared' : null);
    const color = h === 'full' ? C.lesion : h === 'partial' ? C.partial : h === 'on' ? C.accent : C.muscle;
    m.mat.color.set(color);
    m.mat.opacity = h === 'spared' ? 0.5 : h ? 0.72 : (ctx ? 0.1 : 0.3);
    m.meshes.forEach(x => { x.visible = show.muscles || !iso || !!h; });
  });

  const isoKey = iso ? isolationKey(iso) : null;
  if (!isoKey) lastIsoKey = null;
  else if (isoKey !== lastIsoKey && running && aimAt(isolationPoints(iso))) lastIsoKey = isoKey;
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
  // 部位标记的名称优先放，当前部位最先
  Object.values(siteSets).forEach(set => set.items.forEach(it =>
    add(it.label, it.pos, set.group.visible, it.label.classList.contains('current') ? 140 : 120, true)));
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

// 用户操作交给 app.js：{ onNodeHover, onNodeClick, onBackgroundClick, onZoneClick, onLevelClick }。
// WebGL 推迟到第一次打开 3D 视图时（show）再创建
let on = {};
export function init(handlers) {
  on = handlers;
}

export function show() {
  if (!ready && !failed && !building) build();
  if (failed) return;
  if (!running) { running = true; requestAnimationFrame(frame); }
  resize();
  update(getHighlightContext());
}

export function hide() {
  running = false;
}
