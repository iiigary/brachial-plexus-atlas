#!/usr/bin/env node
// 生成「3D 解剖」视图的真实走行数据：把 Z-Anatomy 的臂丛 / 上肢神经与动脉中心线、椎骨等网格，
// 配准到右上肢 BodyParts3D 网格（assets/limb）的坐标里，再按本页的节点与连线拆分。
//
// 输入（先运行 tools/zanatomy/curves.py 和 align.mjs，见 tools/zanatomy/README.md）：
//   raw/z-anatomy/curves.json  神经、动脉的 Bezier 中心线
//   raw/z-anatomy/bones.json   椎骨、胸骨柄、背阔肌、斜角肌网格
//   raw/z-anatomy/align.json   Z-Anatomy → 应用坐标的相似变换
// 输出：
//   assets/plexus/plexus3d.json      节点锚点、自身走行、细枝、连线路径、动脉、预设视角、结构标签
//   assets/plexus/meshes.{json,bin}  上述网格，格式同 assets/limb
// 用法：node tools/zanatomy/build-plexus3d.mjs
//
// 数据：Z-Anatomy（CC BY-SA 4.0），派生自 BodyParts3D（© DBCLS，CC BY 4.0）。输出同样按 CC BY-SA 4.0 发布。
import fs from 'node:fs';
import path from 'node:path';
import { PlexusModel } from '../../js/model.js';

const RAW = 'raw/z-anatomy', OUT = 'assets/plexus';
const ZA = JSON.parse(fs.readFileSync(`${RAW}/curves.json`, 'utf8')).curves;
const ZB = JSON.parse(fs.readFileSync(`${RAW}/bones.json`, 'utf8'));
const AL = JSON.parse(fs.readFileSync(`${RAW}/align.json`, 'utf8'));

// ---------- 向量 ----------
const add = (a, b) => a.map((v, k) => v + b[k]);
const sub = (a, b) => a.map((v, k) => v - b[k]);
const mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(a[0], a[1], a[2]);
const unit = a => mul(a, 1 / (norm(a) || 1));
const dist = (a, b) => norm(sub(a, b));
const lerp = (a, b, t) => add(a, mul(sub(b, a), t));
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// ---------- 坐标 ----------
// Z-Anatomy（three 坐标，cm）→ 网格坐标（assets/limb：右臂在 −X）→ 数据坐标（右臂外侧为 +X，与 anatomy3d.js 相同；
// view3d 渲染时再把 x 取反，网格则直接放进场景）
const toMesh = p => [0, 1, 2].map(k => AL.s * (AL.R[k][0] * p[0] + AL.R[k][1] * p[1] + AL.R[k][2] * p[2]) + AL.t[k]);
const toData = p => { const m = toMesh(p); return [-m[0], m[1], m[2]]; };

// ---------- 折线 ----------
function bezier(a, h1, h2, b, t) {
  const u = 1 - t;
  return [0, 1, 2].map(k => u * u * u * a[k] + 3 * u * u * t * h1[k] + 3 * u * t * t * h2[k] + t * t * t * b[k]);
}
// Bezier 样条 → 数据坐标折线，点距不超过约 0.4 cm
function sampleSpline(s) {
  const P = s.pts.map(toData), H = s.handles ? s.handles.map(([l, r]) => [toData(l), toData(r)]) : null;
  const out = [P[0]];
  for (let i = 0; i + 1 < P.length; i++) {
    if (!H) { out.push(P[i + 1]); continue; }
    const a = P[i], h1 = H[i][1], h2 = H[i + 1][0], b = P[i + 1];
    const n = Math.max(2, Math.ceil((dist(a, h1) + dist(h1, h2) + dist(h2, b)) / 0.4));
    for (let j = 1; j <= n; j++) out.push(bezier(a, h1, h2, b, j / n));
  }
  return out;
}
function splines(name) {
  if (!ZA[name]) throw new Error(`curves.json 里没有：${name}`);
  return ZA[name].splines.filter(s => s.pts.length > 1).map(sampleSpline).filter(p => len(p) > 0.3);
}
const main = name => splines(name).reduce((a, b) => (len(b) > len(a) ? b : a));
const rest = name => { const m = main(name); return splines(name).filter(p => p !== m && len(p) !== len(m)); };

function cumul(p) { const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + dist(p[i], p[i - 1])); return c; }
const len = p => cumul(p).at(-1);
function at(p, s) {
  const c = cumul(p);
  s = Math.min(c.at(-1), Math.max(0, s));
  let i = 1;
  while (i < c.length - 1 && c[i] < s) i++;
  return lerp(p[i - 1], p[i], (s - c[i - 1]) / ((c[i] - c[i - 1]) || 1));
}
function slice(p, s0, s1) {
  const c = cumul(p), out = [at(p, s0)];
  for (let i = 0; i < p.length; i++) if (c[i] > s0 + 1e-4 && c[i] < s1 - 1e-4) out.push(p[i]);
  out.push(at(p, s1));
  return out;
}
const tangent = (p, s) => unit(sub(at(p, s + 0.25), at(p, s - 0.25)));
const rev = p => [...p].reverse();
function cat(...ps) {
  const out = [];
  for (const p of ps) for (const q of p) if (!out.length || dist(out.at(-1), q) > 1e-4) out.push(q);
  return out;
}
// 折线上离 p 最近的点：{ s 弧长, d 距离, q 点 }
function nearestOn(p, x) {
  const c = cumul(p);
  let best = { d: Infinity };
  for (let i = 0; i + 1 < p.length; i++) {
    const ab = sub(p[i + 1], p[i]), l2 = dot(ab, ab) || 1;
    const t = Math.min(1, Math.max(0, dot(sub(x, p[i]), ab) / l2));
    const q = add(p[i], mul(ab, t)), d = dist(x, q);
    if (d < best.d) best = { d, q, s: c[i] + t * Math.sqrt(l2), i, t };
  }
  return best;
}
// 过若干控制点的平滑曲线（三次 Hermite），端点切线可指定，用于补画的连接段
function route(pts, d0, d1) {
  const out = [pts[0]];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], l = dist(a, b);
    const ta = i === 0 ? (d0 || unit(sub(b, a))) : unit(sub(pts[i + 1], pts[i - 1]));
    const tb = i === pts.length - 2 ? (d1 || unit(sub(b, a))) : unit(sub(pts[i + 2], pts[i]));
    const m0 = mul(ta, l), m1 = mul(tb, l), n = Math.max(3, Math.ceil(l / 0.35));
    for (let j = 1; j <= n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map(k => (2 * t3 - 3 * t2 + 1) * a[k] + (t3 - 2 * t2 + t) * m0[k] + (-2 * t3 + 3 * t2) * b[k] + (t3 - t2) * m1[k]));
    }
  }
  return out;
}
// Ramer–Douglas–Peucker：保留端点，删掉几乎共线的中间点
function simplify(p, eps = 0.015) {
  if (p.length < 3) return p;
  const a = p[0], b = p.at(-1), ab = sub(b, a), l = norm(ab) || 1;
  let worst = 0, wi = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const d = norm(cross(sub(p[i], a), ab)) / l;
    if (d > worst) { worst = d; wi = i; }
  }
  if (worst < eps) return [a, b];
  return [...simplify(p.slice(0, wi + 1), eps).slice(0, -1), ...simplify(p.slice(wi), eps)];
}

// ---------- 腋动脉 → 肱动脉：用来描述「束」与动脉的关系 ----------
const ART = cat(main('Axillary artery'), main('Brachial artery'));
// 动脉局部坐标：s = 沿动脉的弧长（从腋动脉起点算），lat = 向外侧，ant = 向前
function artLocal(x) {
  const n = nearestOn(ART, x);
  const T = tangent(ART, n.s);
  const A = unit(sub([0, 0, 1], mul(T, T[2])));
  let L = unit(cross(A, T));
  if (L[0] < 0) L = mul(L, -1);
  const o = sub(x, n.q);
  return { s: n.s, lat: dot(o, L), ant: dot(o, A), L, A, c: n.q };
}
function artAt(s, lat, ant) {
  const c = at(ART, s), T = tangent(ART, s);
  const A = unit(sub([0, 0, 1], mul(T, T[2])));
  let L = unit(cross(A, T));
  if (L[0] < 0) L = mul(L, -1);
  return add(c, add(mul(L, lat), mul(A, ant)));
}
// 折线上第一个「沿动脉弧长 ≥ s」的位置（返回折线自身的弧长）
function arcAtArtS(p, s) {
  const c = cumul(p);
  for (let i = 0; i < p.length; i++) if (artLocal(p[i]).s >= s) return c[i];
  throw new Error(`折线没有到达动脉 s=${s}`);
}
// Z-Anatomy 把尺神经、臂内侧皮神经、前臂内侧皮神经在上臂近段放到了肱动脉外侧（教材：均在内侧）。
// 在 s0–s3 段把它们平滑地推到动脉内侧 lat ≤ target。
function medialize(p, target, s0 = 5, s1 = 8, s2 = 19, s3 = 25) {
  return p.map(x => {
    const l = artLocal(x), w = smooth(s0, s1, l.s) * (1 - smooth(s2, s3, l.s));
    return l.lat > target && w > 0 ? add(x, mul(l.L, (target - l.lat) * w)) : x;
  });
}

// ---------- 组装节点与连线 ----------
// 节点：anchor 标记球位置；course 自身走行（干、束是一整段，终末支从锚点往远端）；extras 细枝（肌支、指神经等）；
// full 用来给侧支找起点的整条母神经。连线：parent>child 的路径，起点落在母神经上，终点是子节点锚点或走行起点。
const N = {}, E = {}, drawnNodes = new Set(), drawnEdges = new Set(), adjusted = new Set();
const node = (id, o) => { N[id] = { extras: [], ...o }; N[id].full = o.full || o.course || [o.anchor]; };
const startOf = id => (N[id].course ? N[id].course[0] : N[id].anchor);
const endOf = id => (N[id].course ? N[id].course.at(-1) : N[id].anchor);
const endDir = id => tangent(N[id].course, len(N[id].course));

// 根：前根（脊髓 → 椎间孔）+ 前支；锚点在前支 55% 处，余下一段连到干
const rootSpl = ZA['Roots of brachial plexus'].splines.slice(0, 5).map(sampleSpline);
const antRoots = ZA['Anterior root of spinal nerve'].splines.filter(s => s.pts.length > 1).map(sampleSpline);
const TRUNK_OF = { c5: 'upper_trunk', c6: 'upper_trunk', c7: 'middle_trunk', c8: 'lower_trunk', t1: 'lower_trunk' };
PlexusModel.ROOTS.forEach((id, i) => {
  const r = rootSpl[i];
  const ar = antRoots.find(a => dist(a.at(-1), r[0]) < 0.4) || [];
  const sA = len(r) * 0.55;
  node(id, { anchor: at(r, sA), course: cat(ar, slice(r, 0, sA)), full: cat(ar, r) });
  E[`${id}>${TRUNK_OF[id]}`] = slice(r, sA, len(r));
});

// 干：整段是走行，锚点在中点
for (const [id, name] of [['upper_trunk', 'Superior'], ['middle_trunk', 'Middle'], ['lower_trunk', 'Inferior']]) {
  const t = main(`${name} trunk of brachial plexus`);
  const roots = Object.keys(TRUNK_OF).filter(r => TRUNK_OF[r] === id);
  t[0] = E[`${roots[0]}>${id}`].at(-1);
  roots.forEach(r => { E[`${r}>${id}`][E[`${r}>${id}`].length - 1] = t[0]; });
  node(id, { anchor: at(t, len(t) / 2), course: t });
}

// 后束：Z-Anatomy 的后束只有约 3 cm，桡神经从它末端出发；把桡神经开头 1.3 cm 并入后束，
// 让束伸到腋动脉第 2 段后方（胸背神经、肩胛下神经的起点因此都落在后束上）
const pcZA = main('Posterior cord of brachial plexus'), radZA = main('Radial nerve');
const S_PC = 1.3;
const postCord = cat(pcZA, slice(radZA, 0, S_PC));
node('post_cord', { anchor: at(postCord, len(postCord) / 2), course: postCord });
const P_POST = postCord[0], PE = postCord.at(-1);

// 股：从干的末端出发，锚点在中点；前半段属于「干 > 股」，后半段属于「股 > 束」
const DIVS = {
  up_ant: ['Anterior division of superior trunk of brachial plexus', 'upper_trunk', 'lat_cord'],
  up_post: ['Posterior division of superior trunk of brachial plexus', 'upper_trunk', 'post_cord'],
  mid_ant: ['Anterior division of middle trunk of brachial plexus', 'middle_trunk', 'lat_cord'],
  mid_post: ['Posterior division of middle trunk of brachial plexus', 'middle_trunk', 'post_cord'],
  low_ant: ['Anterior division of inferior trunk of brachial plexus', 'lower_trunk', 'med_cord'],
  low_post: ['Posterior division of inferior trunk of brachial plexus', 'lower_trunk', 'post_cord'],
};
const divPoly = {};
for (const [id, [name, trunk]] of Object.entries(DIVS)) {
  let p = main(name);
  if (dist(p.at(-1), endOf(trunk)) < dist(p[0], endOf(trunk))) p = rev(p);
  p[0] = endOf(trunk);
  divPoly[id] = p;
}
// Z-Anatomy 把下干后股接到了前股的汇合点上：改为接到后束起点
divPoly.low_post = route([endOf('lower_trunk'), P_POST], endDir('lower_trunk'), tangent(postCord, 0));
drawnNodes.add('low_post');
divPoly.up_post[divPoly.up_post.length - 1] = P_POST;
divPoly.mid_post[divPoly.mid_post.length - 1] = P_POST;

// 外侧束、内侧束：Z-Anatomy 没有这两段（股直接接到终末支）。按「以腋动脉第 2 段命名」补画：
// 从股的汇合点沿动脉外侧 / 内侧走到 s≈7 cm（与后束末端齐平），终末支从这里发出
const A_LAT = lerp(divPoly.up_ant.at(-1), divPoly.mid_ant.at(-1), 0.5);
divPoly.up_ant[divPoly.up_ant.length - 1] = A_LAT;
divPoly.mid_ant[divPoly.mid_ant.length - 1] = A_LAT;
const M_MED = divPoly.low_ant.at(-1);
const S_END = artLocal(PE).s;
const artDir = s => tangent(ART, s);
const latCord = route([A_LAT, artAt(4.6, 0.8, 0.1), artAt(5.9, 0.85, 0.2), artAt(S_END, 0.85, 0.3)],
  tangent(divPoly.up_ant, len(divPoly.up_ant)), artDir(S_END));
const medCord = route([M_MED, artAt(3.8, -0.8, -0.5), artAt(5.4, -0.85, -0.4), artAt(S_END, -0.85, -0.2)],
  tangent(divPoly.low_ant, len(divPoly.low_ant)), artDir(S_END));
node('lat_cord', { anchor: at(latCord, len(latCord) / 2), course: latCord });
node('med_cord', { anchor: at(medCord, len(medCord) / 2), course: medCord });
drawnNodes.add('lat_cord').add('med_cord');

for (const [id, [, trunk, cord]] of Object.entries(DIVS)) {
  const p = divPoly[id], h = len(p) / 2;
  node(id, { anchor: at(p, h), full: p });
  E[`${trunk}>${id}`] = slice(p, 0, h);
  E[`${id}>${cord}`] = slice(p, h, len(p));
  if (id === 'low_post') drawnEdges.add(`${trunk}>${id}`).add(`${id}>${cord}`);
}

// 终末支 ----------
const LE = endOf('lat_cord'), ME = endOf('med_cord');
const tLE = endDir('lat_cord'), tME = endDir('med_cord'), tPE = endDir('post_cord');
// 多个对象的全部样条，去掉首尾重合的重复段（Z-Anatomy 里有几条指神经重复了一遍）
function all(...names) {
  const out = [];
  for (const p of names.flatMap(n => splines(n))) {
    if (!out.some(q => dist(q[0], p[0]) < 0.05 && dist(q.at(-1), p.at(-1)) < 0.05)) out.push(p);
  }
  return out;
}

// 肌皮神经：Z-Anatomy 的肌皮神经从喙肱肌处才开始，起点补画；向远端接前臂外侧皮神经
const mcn = cat(main('Musculocutaneous nerve'), main('Lateral antebrachial cutaneous nerve'));
node('musculocutaneous', { anchor: mcn[0], course: mcn });
E['lat_cord>musculocutaneous'] = route([LE, mcn[0]], tLE, tangent(mcn, 0));
drawnEdges.add('lat_cord>musculocutaneous');

// 正中神经：Z-Anatomy 从后束发出（不对）。在动脉外前方 s≈9.5 处截取，外侧根、内侧根补画，
// 内侧根从动脉前方跨过（「M」形）
const medianZA = main('Median nerve');
const sMJ = arcAtArtS(medianZA, 9.5), MJ = at(medianZA, sMJ), tMJ = tangent(medianZA, sMJ);
node('median', {
  anchor: MJ, course: slice(medianZA, sMJ, len(medianZA)),
  extras: all('Palmar branch of median nerve', 'Muscular branches of median nerve', 'Common palmar digital branches of median nerve',
    'Proper palmar digital branches of median nerve', '(Communicating branch of median nerve with ulnar nerve)'),
});
E['lat_cord>median'] = route([LE, MJ], tLE, tMJ);
E['med_cord>median'] = route([ME, artAt(S_END + 1.4, 0, 0.95), MJ], tME, tMJ);
drawnEdges.add('lat_cord>median').add('med_cord>median');

// 尺神经：上臂近段推到动脉内侧；起点补画
const ulnarZA = medialize(main('Ulnar nerve'), -1.0);
adjusted.add('ulnar');
const sUJ = arcAtArtS(ulnarZA, S_END + 2), UJ = at(ulnarZA, sUJ);
node('ulnar', {
  anchor: UJ, course: slice(ulnarZA, sUJ, len(ulnarZA)),
  extras: all('Deep branch of ulnar nerve', 'Superficial branch of ulnar nerve', 'Dorsal branch of ulnar nerve', 'Palmar branch of ulnar nerve',
    'Muscular branches of ulnar nerve', 'Common palmar digital branches of ulnar nerve', 'Proper palmar digital branches of ulnar nerve',
    'Dorsal digital branches of ulnar nerve'),
});
E['med_cord>ulnar'] = route([ME, UJ], tME, tangent(ulnarZA, sUJ));
drawnEdges.add('med_cord>ulnar');

// 桡神经：接在后束末端
const S_RA = S_PC + 1.0;
node('radial', {
  anchor: at(radZA, S_RA), course: slice(radZA, S_RA, len(radZA)),
  extras: all('Muscular branches of radial nerve', 'Inferior lateral brachial cutaneous nerve', 'Posterior antebrachial cutaneous nerve'),
});
E['post_cord>radial'] = slice(radZA, S_PC, S_RA);

// 腋神经：Z-Anatomy 从前股汇合点发出（不对）。在它转向四边孔之前截取，起点改接后束末端
const axZA = main('Axillary nerve');
const sAJ = arcAtArtS(axZA, S_END + 0.6), AJ = at(axZA, sAJ);
node('axillary', {
  anchor: AJ, course: slice(axZA, sAJ, len(axZA)),
  extras: all('Muscular branches of axillary nerve', 'Superior lateral brachial cutaneous nerve'),
});
E['post_cord>axillary'] = route([PE, AJ], tPE, tangent(axZA, sAJ));
drawnEdges.add('post_cord>axillary');

// 前臂分支：骨间后神经用桡神经深支（Z-Anatomy 另有一条几乎重合的「骨间后神经」，不用）
function subbranch(id, parent, p, extras = []) {
  const near = nearestOn(N[parent].course, p[0]);
  p = near.d > 0.05 ? cat([near.q], p) : [near.q, ...p.slice(1)];
  const s = Math.min(1.2, len(p) / 3);
  node(id, { anchor: at(p, s), course: slice(p, s, len(p)), extras, full: p });
  E[`${parent}>${id}`] = slice(p, 0, s);
}
subbranch('pin', 'radial', main('Deep branch of radial nerve'));
subbranch('srn', 'radial', main('Superficial branch of radial nerve'),
  [...rest('Superficial branch of radial nerve'), ...all('Dorsal digital branches of radial nerve')]);
subbranch('ain', 'median', main('Anterior interosseous nerve of forearm'));

// 侧支 ----------
// 起点在母神经上的：直接用 Z-Anatomy 的走行，起点吸附到母神经
function collateral(id, parent, name, { extras = [] } = {}) {
  let p = main(name);
  const near = nearestOn(N[parent].full, p[0]);
  p = near.d > 0.05 ? cat([near.q], p) : [near.q, ...p.slice(1)];
  const s = Math.min(1.2, len(p) / 3);
  node(id, { anchor: at(p, s), course: slice(p, s, len(p)), extras, full: p });
  E[`${parent}>${id}`] = slice(p, 0, s);
}
collateral('dorsal_scapular', 'c5', 'Dorsal scapular nerve');
collateral('suprascapular', 'upper_trunk', 'Suprascapular nerve', { extras: rest('Suprascapular nerve') });
collateral('subclavius_n', 'upper_trunk', 'Subclavian nerve');
collateral('lat_pectoral', 'lat_cord', 'Lateral pectoral nerve', { extras: rest('Lateral pectoral nerve') });
collateral('upper_subscapular', 'post_cord', 'Superior subscapular nerve');
collateral('thoracodorsal', 'post_cord', 'Thoracodorsal nerve', { extras: rest('Thoracodorsal nerve') });
collateral('lower_subscapular', 'post_cord', 'Inferior subscapular nerve', { extras: rest('Inferior subscapular nerve') });

// 起点不对或悬空的：截取 Z-Anatomy 走行的远段，起点从束上补画
function graft(id, parent, from, p, sJoin, extras = []) {
  const J = at(p, sJoin);
  node(id, { anchor: J, course: slice(p, sJoin, len(p)), extras });
  E[`${parent}>${id}`] = route([from, J], tangent(N[parent].course, nearestOn(N[parent].course, from).s), tangent(p, sJoin));
  drawnEdges.add(`${parent}>${id}`);
}
// 胸内侧神经：Z-Anatomy 从下干发出；保留它在动脉前方分叉之后的部分，起点改接内侧束
{
  const [m0, m1] = [main('Medial pectoral nerve'), rest('Medial pectoral nerve')[0]];
  graft('med_pectoral', 'med_cord', at(medCord, len(medCord) * 0.15), m0, nearestOn(m0, m1[0]).s, [m1]);
}
const mbcn = medialize(main('Medial brachial cutaneous nerve'), -1.6);
graft('med_cut_arm', 'med_cord', at(medCord, len(medCord) * 0.6), mbcn, arcAtArtS(mbcn, S_END));
const macn = medialize(cat(main('Medial antebrachial cutaneous nerve'), main('Anterior branch of medial antebrachial cutaneous nerve')), -0.8);
graft('med_cut_forearm', 'med_cord', ME, macn, arcAtArtS(macn, S_END + 1.2), [main('Posterior branch of medial antebrachial cutaneous nerve')]);
adjusted.add('med_cut_arm').add('med_cut_forearm');

// 胸长神经：C5 支是主干，C6 支在 Z-Anatomy 里单独一小段，C7 支没有（主干在 C7 前支旁经过，补画一小段）
{
  const ltn = main('Long thoracic nerve'), twig = rest('Long thoracic nerve')[0];
  const n5 = nearestOn(N.c5.full, ltn[0]);
  const lt = n5.d > 0.05 ? cat([n5.q], ltn) : [n5.q, ...ltn.slice(1)];
  const sC6 = nearestOn(lt, twig.at(-1)).s;
  const anchor = at(lt, sC6);
  let best = { d: Infinity };
  for (const q of N.c7.full) { const n = nearestOn(lt, q); if (n.s > sC6 + 0.3 && n.d < best.d) best = { ...n, root: q }; }
  const sC7 = best.s + 1.0;
  node('long_thoracic', { anchor, course: slice(lt, sC6, len(lt)) });
  E['c5>long_thoracic'] = slice(lt, 0, sC6);
  const n6 = nearestOn(N.c6.full, twig[0]);
  E['c6>long_thoracic'] = cat([n6.q], twig.slice(1, -1), [anchor]);
  E['c7>long_thoracic'] = route([best.root, at(lt, sC7)], undefined, tangent(lt, sC7));
  drawnEdges.add('c7>long_thoracic');
}

// ---------- 动脉 ----------
const yTopC3 = Math.max(...meshPoints('Vertebra C3').map(p => p[1]));
function meshPoints(name) { const m = ZB[name]; const o = []; for (let i = 0; i < m.pos.length; i += 3) o.push(toData([m.pos[i], m.pos[i + 1], m.pos[i + 2]])); return o; }
const ARTERIES = [
  ['a_subclavian', '锁骨下动脉', 'Right subclavian artery', 0.45], ['a_vertebral', '椎动脉', 'Vertebral artery', 0.18],
  ['a_axillary', '腋动脉', 'Axillary artery', 0.4], ['a_brachial', '肱动脉', 'Brachial artery', 0.32],
  ['a_deep_brachial', '肱深动脉', 'Deep brachial artery', 0.16], ['a_post_circ_humeral', '旋肱后动脉', 'Posterior circumflex humeral artery', 0.15],
  ['a_radial', '桡动脉', 'Radial artery', 0.22], ['a_ulnar', '尺动脉', 'Ulnar artery', 0.22],
  ['a_superficial_palmar_arch', '掌浅弓', 'Superficial palmar arch', 0.13],
].map(([id, name, za, r]) => {
  let p = main(za);
  if (id === 'a_vertebral') { const k = p.findIndex(q => q[1] > yTopC3); if (k > 0) p = p.slice(0, k); }
  return { id, name, path: p, r };
});

// 神经与动脉中心线的最小间距（动脉半径 + 神经半径 + 一点空隙）：Z-Anatomy 里有几处神经贴着甚至穿进动脉
const KEEP = { a_subclavian: 0.8, a_axillary: 0.75, a_brachial: 0.65, a_radial: 0.45, a_ulnar: 0.45 };
const keepOut = ARTERIES.filter(a => KEEP[a.id]);
function push(x) {
  for (const a of keepOut) {
    const n = nearestOn(a.path, x), rmin = KEEP[a.id];
    const atEnd = (n.i === 0 && n.t === 0) || (n.i === a.path.length - 2 && n.t === 1);
    if (n.d < rmin && n.d > 1e-6 && !atEnd) x = add(n.q, mul(unit(sub(x, n.q)), rmin));
  }
  return x;
}

// ---------- 输出 ----------
const r2 = p => p.map(v => Math.round(v * 100) / 100);
const out = poly => simplify(poly.map(push)).map(r2);
const NODE_IDS = PlexusModel.NODE_IDS;
for (const id of NODE_IDS) if (!N[id]) throw new Error(`没有生成节点 ${id}`);
for (const [a, b] of PlexusModel.LINKS) if (!E[`${a}>${b}`]) throw new Error(`没有生成连线 ${a}>${b}`);

// 细枝的起点吸附到本神经已有的走行或细枝上（Z-Anatomy 里个别细枝起点离母支有几毫米到 1 cm）。
// 细枝之间有先后（指神经从指总神经发出），所以一轮轮地放，直到放完
for (const id of NODE_IDS) {
  const placed = [N[id].course || N[id].full], todo = [...N[id].extras], done = [];
  while (todo.length) {
    let pick = null;
    todo.forEach((p, k) => {
      for (const q of placed) { const n = nearestOn(q, p[0]); if (!pick || n.d < pick.n.d) pick = { k, n }; }
    });
    if (pick.n.d > 2.5) throw new Error(`${id} 的细枝离母支 ${pick.n.d.toFixed(1)} cm：起点 ${todo[pick.k][0].map(v => v.toFixed(1))}，沿动脉 s=${artLocal(todo[pick.k][0]).s.toFixed(1)}`);
    const p = todo.splice(pick.k, 1)[0], e = pick.n.d > 0.05 ? cat([pick.n.q], p) : p;
    placed.push(e);
    done.push(e);
  }
  N[id].extras = done;
}

const anchors = {}, courses = {}, extras = {}, edges = {};
for (const id of NODE_IDS) {
  anchors[id] = r2(push(N[id].anchor));
  if (N[id].course) courses[id] = out(N[id].course);
  if (N[id].extras.length) extras[id] = N[id].extras.map(out);
}
for (const [a, b] of PlexusModel.LINKS) edges[`${a}>${b}`] = out(E[`${a}>${b}`]);

// 预设视角（方向沿用示意模型；注视点、距离按真实走行重算）
const pts = id => [N[id].anchor, ...(N[id].course || [])];
const box = ps => [0, 1, 2].map(k => [Math.min(...ps.map(p => p[k])), Math.max(...ps.map(p => p[k]))]);
const center = b => b.map(([lo, hi]) => +((lo + hi) / 2).toFixed(2));
const PLEXUS = [...PlexusModel.ROOTS, 'upper_trunk', 'middle_trunk', 'lower_trunk', ...Object.keys(DIVS), 'lat_cord', 'post_cord', 'med_cord']
  .flatMap(pts).concat(['musculocutaneous', 'axillary', 'radial', 'median', 'ulnar'].map(id => N[id].anchor));
const pb = box(PLEXUS), span = Math.max(pb[0][1] - pb[0][0], pb[1][1] - pb[1][0]);
const ab = box(NODE_IDS.flatMap(id => [...pts(id), ...N[id].extras.flat()])), armLen = ab[1][1] - ab[1][0];
const pc = center(pb), ac = center(ab);
const cameraViews = {
  front: { target: pc, dir: [0.18, 0.12, 1], dist: +(span * 2.8).toFixed(1) },
  top: { target: pc, dir: [0, 1, 0.08], dist: +(span * 2.7).toFixed(1) },
  lateral: { target: pc, dir: [1, 0.15, 0.55], dist: +(span * 2.7).toFixed(1) },
  back: { target: pc, dir: [0.15, 0.1, -1], dist: +(span * 2.8).toFixed(1) },
  arm: { target: ac, dir: [0.1, 0.05, 1], dist: +(armLen * 1.7).toFixed(1) },
};

// 结构标签：用网格质心（应用网格的 c 是网格坐标，x 取反成数据坐标）
const limb = JSON.parse(fs.readFileSync('assets/limb/meshes.json', 'utf8'));
const cOf = key => { const c = limb.parts.find(p => p.key === key).c; return [-c[0], c[1], c[2]]; };
const meshC = name => { const ps = meshPoints(name); return r2([0, 1, 2].map(k => ps.reduce((s, p) => s + p[k], 0) / ps.length)); };
const ctxLabels = [
  { text: '锁骨', pos: r2(add(cOf('right clavicle'), [0, 1.4, 0.6])), layer: 'bones' },
  { text: '肱骨', pos: r2(add(cOf('right humerus'), [1.6, 0, 0])), layer: 'bones' },
  { text: '第 1 肋', pos: r2(add(cOf('right first rib'), [0, -0.8, 1.5])), layer: 'bones' },
  { text: '肩胛骨', pos: r2(add(cOf('right scapula'), [0, 0, -1.5])), layer: 'bones' },
  { text: '颈椎', pos: r2(add(meshC('Vertebra C5'), [-1, 0, 0])), layer: 'bones' },
  { text: '腋动脉', pos: r2(add(at(ARTERIES[2].path, len(ARTERIES[2].path) * 0.55), [0, -0.9, 0.6])), layer: 'artery', cls: 'artery' },
  { text: '前斜角肌', pos: r2(add(meshC('Scalenus anterior muscle.r'), [0, 0, 0.8])), layer: 'muscles' },
  { text: '中斜角肌', pos: r2(add(meshC('Scalenus medius muscle.r'), [0, 0, -0.8])), layer: 'muscles' },
];

fs.mkdirSync(OUT, { recursive: true });
const data = {
  source: 'Z-Anatomy – The libre 3D atlas of anatomy (https://github.com/Z-Anatomy/Models-of-human-anatomy, CC BY-SA 4.0), derived from BodyParts3D © The Database Center for Life Science (CC BY 4.0); 配准与拆分见 tools/zanatomy/',
  license: 'CC BY-SA 4.0',
  units: 'cm',
  axes: 'x: 右臂外侧为正，y: 上，z: 前（与 js/data/anatomy3d.js 相同；渲染时 x 取反）',
  anchors, courses, extras, edges,
  arteries: ARTERIES.map(a => ({ id: a.id, name: a.name, path: simplify(a.path, 0.02).map(r2), r: a.r })),
  cameraViews, ctxLabels,
  // 按解剖关系补画的段落（Z-Anatomy 缺失或接错）与做过位置调整的神经，界面和署名里都会注明
  drawn: { nodes: [...drawnNodes], edges: [...drawnEdges] },
  adjusted: [...adjusted],
};
fs.writeFileSync(path.join(OUT, 'plexus3d.json'), JSON.stringify(data));

// ---------- 网格：椎骨、胸骨柄、背阔肌、斜角肌（网格坐标，与 assets/limb 一致）----------
const MESHES = [
  ...['C3', 'C4', 'C5', 'C6', 'C7', 'T1', 'T2'].map(v => [`Vertebra ${v}`, `vertebra ${v}`, null, 'bone']),
  ['Manubrium of sternum', 'manubrium of sternum', null, 'bone'],
  ['Latissimus dorsi muscle.r', 'right latissimus dorsi', 'm_latissimus', 'muscle'],
  ['Scalenus anterior muscle.r', 'right scalenus anterior', null, 'bg'],
  ['Scalenus medius muscle.r', 'right scalenus medius', null, 'bg'],
];
const parts = MESHES.map(([za, key, zone, kind]) => {
  const m = ZB[za]; const pos = [];
  for (let i = 0; i < m.pos.length; i += 3) pos.push(...toMesh([m.pos[i], m.pos[i + 1], m.pos[i + 2]]));
  return { key, zone, kind, za, pos, idx: m.idx };
});
const qlo = [Infinity, Infinity, Infinity], qhi = [-Infinity, -Infinity, -Infinity];
parts.forEach(p => { for (let i = 0; i < p.pos.length; i++) { qlo[i % 3] = Math.min(qlo[i % 3], p.pos[i]); qhi[i % 3] = Math.max(qhi[i % 3], p.pos[i]); } });
const range = qhi.map((v, i) => v - qlo[i]);
const chunks = []; let offset = 0;
const put = buf => { chunks.push(buf); const o = offset; offset += buf.byteLength; return o; };
const pad4 = () => { if (offset % 4) put(Buffer.alloc(4 - (offset % 4))); };
const meta = parts.map(p => {
  const vCount = p.pos.length / 3, q = new Uint16Array(p.pos.length);
  for (let i = 0; i < p.pos.length; i++) q[i] = Math.round((p.pos[i] - qlo[i % 3]) / range[i % 3] * 65535);
  pad4(); const posOffset = put(Buffer.from(q.buffer));
  pad4(); const wide = vCount > 65535;
  const idxOffset = put(Buffer.from((wide ? new Uint32Array(p.idx) : new Uint16Array(p.idx)).buffer));
  const c = [0, 1, 2].map(k => { let s = 0; for (let i = k; i < p.pos.length; i += 3) s += p.pos[i]; return +(s / vCount).toFixed(2); });
  return { key: p.key, zone: p.zone, kind: p.kind, files: [p.za], posOffset, vCount, idxOffset, iCount: p.idx.length, wide, c };
});
const bin = Buffer.concat(chunks);
fs.writeFileSync(path.join(OUT, 'meshes.bin'), bin);
fs.writeFileSync(path.join(OUT, 'meshes.json'), JSON.stringify({
  source: 'Z-Anatomy – The libre 3D atlas of anatomy (CC BY-SA 4.0), derived from BodyParts3D © The Database Center for Life Science (CC BY 4.0)',
  units: 'cm', axes: '与 assets/limb/meshes.json 相同',
  qMin: qlo.map(v => +v.toFixed(4)), qRange: range.map(v => +v.toFixed(4)), parts: meta,
}, null, 1));

const kb = f => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + ' KB';
console.log(`节点 ${NODE_IDS.length}、连线 ${Object.keys(edges).length}、动脉 ${ARTERIES.length}；补画 ${drawnNodes.size} 个节点、${drawnEdges.size} 条连线，调整 ${adjusted.size} 条神经`);
console.log(`plexus3d.json ${kb('plexus3d.json')}，meshes.bin ${kb('meshes.bin')}（${meta.length} 个部件）`);
