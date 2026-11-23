// 右上肢「肌肉」页的真实网格视图（BodyParts3D 4.0，CC BY 4.0）。
// 网格由 tools/build-limb-meshes.mjs 生成到 assets/limb/。
// 状态沿用 SVG 分区的同一套类名（active-motor、active-lesion…），由 limb.js 每次高亮时传进来，
// 所以图上的说法和下方摘要始终一致。按需渲染：只有拖动、补间、状态变化时才画。
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { PlexusModel } from './model.js';

const ASSET = 'assets/limb/meshes';
const FOV = 30;

let root, canvas, labelBox, renderer, scene, camera, controls;
let ready = false, visible = false, raf = 0, tween = null;
let onClick = () => {}, onHover = () => {};
const zones = new Map();   // id → { mat, meshes[], c: Vector3, label, status, linked, flashUntil }
const pickables = [];      // 肌肉 + 骨骼（骨骼只用来挡住后面的点击）
const bgMats = { muscle: null, bone: null, rib: null };
let hoverId = null, fitDist = 150;
const center = new THREE.Vector3();
let C = {};

// ---------- 颜色：直接读页面的主题变量，跟随明暗主题 ----------
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = n => new THREE.Color(cs.getPropertyValue(n).trim() || '#888');
  const mix = (a, b, t) => a.clone().lerp(b, t);
  const base = v('--muscle-base'), stroke = v('--skin-stroke'), surface = v('--surface');
  const dark = document.documentElement.dataset.theme === 'dark';
  C = {
    dark,
    rest: mix(base, stroke, dark ? 0.45 : 0.6),
    bgMuscle: mix(base, stroke, dark ? 0.2 : 0.35),
    bone: mix(surface, stroke, dark ? 0.6 : 0.18),
    active: v('--muscle-active'),
    lesion: v('--lesion-color'),
    keep: v('--keep-color'),
    muted: v('--muted'),
    accent: v('--accent'),
    base,
  };
}

// 类名 → 外观。顺序即优先级：同一块肌肉有多个类时取靠前的
const LOOKS = [
  ['quiz-ok', () => ({ color: C.keep, opacity: 1 })],
  ['quiz-missed', () => ({ color: C.lesion, opacity: 0.55 })],
  ['quiz-extra', () => ({ color: C.muted, opacity: 1 })],
  ['picked', () => ({ color: C.accent, opacity: 1 })],
  ['active-lesion', () => ({ color: C.lesion, opacity: 1 })],
  ['active-lesion-partial', () => ({ color: C.rest.clone().lerp(C.lesion, 0.55), opacity: 1 })],
  ['spared', () => ({ color: C.rest.clone().lerp(C.keep, 0.6), opacity: 0.6 })],
  ['active-motor', () => ({ color: C.active, opacity: 1 })],
  ['active-part', () => ({ color: C.rest.clone().lerp(C.active, 0.5), opacity: 0.9 })],
];
const STATUS_CLASS = new Set(LOOKS.map(([k]) => k));

// ---------- 加载 ----------
async function loadMeshes() {
  const [meta, buf] = await Promise.all([
    fetch(`${ASSET}.json`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch(`${ASSET}.bin`).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }),
  ]);
  const { qMin, qRange } = meta;
  return meta.parts.map(p => {
    const q = new Uint16Array(buf, p.posOffset, p.vCount * 3);
    const pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) pos[i] = q[i] / 65535 * qRange[i % 3] + qMin[i % 3];
    const idx = p.wide ? new Uint32Array(buf, p.idxOffset, p.iCount) : new Uint16Array(buf, p.idxOffset, p.iCount);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return { ...p, geometry: g };
  });
}

function buildScene(parts) {
  const mk = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, ...extra });
  bgMats.bone = mk(C.bone, { roughness: 0.8 });
  bgMats.rib = mk(C.bone, { roughness: 0.8, transparent: true, opacity: 0.45, depthWrite: false });
  bgMats.muscle = mk(C.bgMuscle, { transparent: true });

  const box = new THREE.Box3();
  for (const p of parts) {
    let mat;
    if (p.zone) {
      if (!zones.has(p.zone)) {
        zones.set(p.zone, { id: p.zone, mat: mk(C.rest, { transparent: true }), meshes: [], c: new THREE.Vector3(), w: 0, status: null, linked: false, flashUntil: 0 });
      }
      mat = zones.get(p.zone).mat;
    } else mat = bgMats[p.kind === 'bg' ? 'muscle' : p.kind];
    const mesh = new THREE.Mesh(p.geometry, mat);
    mesh.userData = { zoneId: p.zone, kind: p.kind };
    scene.add(mesh);
    if (p.kind !== 'rib') pickables.push(mesh);
    if (p.zone) {
      const z = zones.get(p.zone);
      z.meshes.push(mesh);
      // 标签放在各部件质心的加权平均处
      z.c.multiplyScalar(z.w).add(new THREE.Vector3(...p.c).multiplyScalar(p.vCount)).divideScalar(z.w + p.vCount);
      z.w += p.vCount;
    }
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox);
  }
  box.getCenter(center);
  const size = box.getSize(new THREE.Vector3());
  fitDist = (size.y / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * 1.14 + size.z / 2;

  zones.forEach(z => {
    const el = document.createElement('span');
    el.className = 'l3-label';
    el.textContent = PlexusModel.target(z.id).name;
    labelBox.appendChild(el);
    z.label = el;
  });
}

// ---------- 镜头 ----------
// 前面观：镜头在前方（+Z），右臂在画面左侧；后面观转到背后
function viewGoal(name) {
  const az = name === 'back' ? Math.PI : 0;
  const d = fitDist / Math.max(0.6, Math.min(1, camera.aspect / 0.62));
  return { az, d, target: center.clone() };
}

export function setView(name) {
  if (!ready) return;
  const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  const goal = viewGoal(name);
  // 走较近的一侧转过去
  let dAz = goal.az - from.theta;
  dAz = Math.atan2(Math.sin(dAz), Math.cos(dAz));
  tween = { t0: performance.now(), from, target0: controls.target.clone(), goal, dAz };
  root.querySelectorAll('.l3-view').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  invalidate();
}

function stepTween(now) {
  if (!tween) return false;
  const t = Math.min(1, (now - tween.t0) / 650);
  const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  const { from, goal, dAz } = tween;
  const s = new THREE.Spherical(
    from.radius + (goal.d - from.radius) * e,
    from.phi + (Math.PI / 2 - from.phi) * e,
    from.theta + dAz * e,
  );
  controls.target.lerpVectors(tween.target0, goal.target, e);
  camera.position.setFromSpherical(s).add(controls.target);
  camera.lookAt(controls.target);
  if (t >= 1) tween = null;
  return true;
}

// ---------- 拾取 ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
function pick(ev) {
  const r = canvas.getBoundingClientRect();
  pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  let faded = null;
  for (const h of raycaster.intersectObjects(pickables, false)) {
    const { zoneId } = h.object.userData;
    const solid = h.object.material.opacity > 0.5;
    if (zoneId && solid) return zoneId;          // 实心肌肉：直接命中
    if (zoneId) { faded = faded || zoneId; continue; } // 变淡的浅层肌：先记下，继续往里找高亮的深层肌
    if (solid) break;                            // 骨骼或灰色背景肌挡住了
  }
  return faded;
}

function bindPointer() {
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; tween = null; });
  canvas.addEventListener('pointermove', e => {
    if (e.buttons) return;
    setHover(pick(e));
  });
  canvas.addEventListener('pointerleave', () => setHover(null));
  canvas.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
    down = null;
    const id = pick(e);
    if (id) onClick(id);
  });
}

function setHover(id) {
  if (id === hoverId) return;
  hoverId = id;
  canvas.style.cursor = id ? 'pointer' : '';
  onHover(id);
  restyle();
}

// ---------- 样式 ----------
function restyle() {
  if (!ready) return;
  const anyStatus = [...zones.values()].some(z => z.status);
  const now = performance.now();
  zones.forEach(z => {
    const look = z.status ? LOOKS.find(([k]) => k === z.status)[1]() : null;
    const hot = z.id === hoverId || z.linked || z.flashUntil > now;
    const color = look ? look.color : C.rest;
    const opacity = look ? look.opacity : anyStatus ? 0.13 : 1;
    z.mat.color.copy(color);
    z.mat.opacity = hot && !look ? Math.max(opacity, 0.85) : opacity;
    z.mat.depthWrite = z.mat.opacity > 0.5;
    z.mat.emissive.copy(hot ? (look ? color : C.accent) : new THREE.Color(0));
    z.mat.emissiveIntensity = hot ? (z.flashUntil > now ? 0.6 : 0.35) : 0;
    z.label.className = 'l3-label' + (z.status ? ' ' + z.status : '') + (hot ? ' hot' : '');
  });
  // 有状态时灰色背景肌也变淡，免得挡住深层的高亮肌
  bgMats.muscle.opacity = anyStatus ? 0.12 : 1;
  bgMats.muscle.depthWrite = !anyStatus;
  invalidate();
}

// classes：Map(zoneId → 该分区当前的类名数组)，即 SVG 上同一分区会带的类
export function setZoneStates(classes) {
  zones.forEach((z, id) => {
    const list = classes.get(id) || [];
    z.status = LOOKS.map(([k]) => k).find(k => list.includes(k)) || null;
  });
  restyle();
}

export function link(id, on) {
  const z = zones.get(id);
  if (!z) return;
  z.linked = on;
  restyle();
}

export function flash(id) {
  const z = zones.get(id);
  if (!z) return;
  z.flashUntil = performance.now() + 1300;
  restyle();
  setTimeout(restyle, 1350);
}

export function has(id) { return zones.has(id); }

export function setTheme() {
  if (!ready) return;
  readColors();
  bgMats.bone.color.copy(C.bone);
  bgMats.rib.color.copy(C.bone);
  bgMats.muscle.color.copy(C.bgMuscle);
  restyle();
}

// ---------- 标签：悬停的、被摘要芯片指着的肌肉；高亮的肌肉不多时也标上 ----------
// 受累肌肉一多（如上干损伤），标签会盖住模型，名称改由下方摘要列出，悬停芯片时再在图上标出
const MAX_STATUS_LABELS = 3;
const tmp = new THREE.Vector3();
function updateLabels() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const items = [];
  const labelled = [...zones.values()].filter(z => z.status && z.status !== 'spared');
  const showStatus = labelled.length <= MAX_STATUS_LABELS;
  zones.forEach(z => {
    const hot = z.id === hoverId || z.linked || z.flashUntil > performance.now();
    const on = hot || (showStatus && z.status && z.status !== 'spared');
    if (!on) { z.label.style.visibility = 'hidden'; return; }
    tmp.copy(z.c).project(camera);
    const x = ((tmp.x + 1) / 2) * w, y = ((1 - tmp.y) / 2) * h;
    if (tmp.z > 1 || x < 0 || x > w || y < 0 || y > h) { z.label.style.visibility = 'hidden'; return; }
    items.push({ z, x, y, pri: hot ? 2 : 1 });
  });
  items.sort((a, b) => b.pri - a.pri);
  const placed = [];
  for (const it of items) {
    const el = it.z.label;
    const bw = el.offsetWidth || 60, bh = el.offsetHeight || 18;
    const r = { x0: it.x - bw / 2, x1: it.x + bw / 2, y0: it.y - bh / 2, y1: it.y + bh / 2 };
    const clash = placed.some(p => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0);
    if (clash && it.pri < 2) { el.style.visibility = 'hidden'; continue; }
    placed.push(r);
    el.style.transform = `translate(${it.x}px, ${it.y}px) translate(-50%, -50%)`;
    el.style.visibility = 'visible';
  }
}

// ---------- 渲染 ----------
function invalidate() {
  if (!ready || !visible || raf) return;
  raf = requestAnimationFrame(frame);
}

function frame(now) {
  raf = 0;
  const moving = stepTween(now);
  const damping = controls.update();
  renderer.render(scene, camera);
  updateLabels();
  const flashing = [...zones.values()].some(z => z.flashUntil > now);
  if (moving || damping || flashing) invalidate();
}

function resize() {
  if (!ready) return;
  const r = root.getBoundingClientRect();
  if (!r.width || !r.height) return;
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
  invalidate();
}

export function setVisible(on) {
  visible = on;
  if (root) root.classList.toggle('is-hidden', !on);
  if (on) { resize(); invalidate(); }
}

// 建好返回 true；WebGL 不可用或网格加载失败返回 false，调用方继续用 SVG 示意图
export async function init(container, handlers = {}) {
  root = container;
  onClick = handlers.onZoneClick || onClick;
  onHover = handlers.onHover || onHover;
  root.innerHTML = `
    <canvas class="l3-canvas" aria-label="右上肢肌肉三维模型：拖动旋转，滚轮缩放，点击肌肉溯源"></canvas>
    <div class="l3-labels" aria-hidden="true"></div>
    <div class="l3-tools" role="group" aria-label="视角">
      <button type="button" class="l3-view active" data-view="front">前</button>
      <button type="button" class="l3-view" data-view="back">后</button>
    </div>`;
  canvas = root.querySelector('canvas');
  labelBox = root.querySelector('.l3-labels');
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) {
    return false;
  }
  try {
    readColors();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(FOV, 1, 1, 2000);
    scene.add(new THREE.HemisphereLight('#ffffff', '#475569', 0.75));
    const key = new THREE.DirectionalLight('#ffffff', 1.9);
    key.position.set(-40, 60, 80);
    const fill = new THREE.DirectionalLight('#ffffff', 0.45);
    fill.position.set(50, 10, -70);
    camera.add(key, fill); // 灯跟着镜头转，前后面观的明暗一致
    scene.add(camera);
    buildScene(await loadMeshes());
  } catch (err) {
    console.warn('右上肢网格加载失败，改用示意图', err);
    renderer.dispose();
    return false;
  }
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.14;
  controls.minDistance = 15;
  controls.maxDistance = fitDist * 1.6;
  controls.addEventListener('change', invalidate);
  controls.addEventListener('start', () => {
    tween = null;
    root.querySelectorAll('.l3-view').forEach(b => b.classList.remove('active'));
  });
  root.querySelectorAll('.l3-view').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  bindPointer();
  new ResizeObserver(resize).observe(root);

  ready = true;
  resize();
  const g = viewGoal('front');
  controls.target.copy(g.target);
  camera.position.set(0, 0, g.d).add(g.target);
  controls.update();
  restyle();
  return true;
}
