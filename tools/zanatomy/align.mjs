#!/usr/bin/env node
// 把 Z-Anatomy 骨骼配准到 assets/limb/meshes.bin（BodyParts3D）里的同名骨骼，并报告逐骨残差。
// 尺度由表面积比确定，旋转平移用锁骨、肩胛骨、肱骨、第 1 肋做双向最近点 ICP；桡尺骨不参与，用来检验姿势是否一致。
// 输入：curves.py 写出的 bones.json（three 坐标：Y 上、Z 前，单位 cm）。
// 输出：相似变换（s, R, t）把 Z-Anatomy → 应用网格坐标。
// 用法：node tools/zanatomy/align.mjs raw/z-anatomy/bones.json raw/z-anatomy/align.json
import fs from 'node:fs';

const [zaFile = 'raw/z-anatomy/bones.json', outFile = 'raw/z-anatomy/align.json'] = process.argv.slice(2);
const PAIRS = { // BodyParts3D 名 → Z-Anatomy 名（.r）
  'right clavicle': 'Clavicle.r', 'right scapula': 'Scapula.r', 'right humerus': 'Humerus.r',
  'right radius': 'Radius.r', 'right ulna': 'Ulna.r', 'right first rib': 'First rib.r',
};

// ---- 读应用里的骨骼 ----
const meta = JSON.parse(fs.readFileSync('assets/limb/meshes.json', 'utf8'));
const bin = fs.readFileSync('assets/limb/meshes.bin');
const buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
function appMesh(key) {
  const p = meta.parts.find(q => q.key === key);
  if (!p) return null;
  const q = new Uint16Array(buf, p.posOffset, p.vCount * 3), pos = new Float64Array(q.length);
  for (let i = 0; i < q.length; i++) pos[i] = q[i] / 65535 * meta.qRange[i % 3] + meta.qMin[i % 3];
  const idx = p.wide ? new Uint32Array(buf, p.idxOffset, p.iCount) : new Uint16Array(buf, p.idxOffset, p.iCount);
  return { pos, idx };
}
const za = JSON.parse(fs.readFileSync(zaFile, 'utf8'));

// 面积加权质心与表面采样（与网格细分程度无关）
function areaStats({ pos, idx }) {
  let A = 0; const c = [0, 0, 0], tri = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, d = idx[i + 2] * 3;
    const u = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
    const v = [pos[d] - pos[a], pos[d + 1] - pos[a + 1], pos[d + 2] - pos[a + 2]];
    const ar = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
    A += ar; tri.push([a, b, d, ar]);
    for (let k = 0; k < 3; k++) c[k] += ar * (pos[a + k] + pos[b + k] + pos[d + k]) / 3;
  }
  return { area: A, c: c.map(x => x / A), tri };
}
function sample(m, st, n, seed = 1) {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cdf = []; let acc = 0; st.tri.forEach(t => { acc += t[3]; cdf.push(acc); });
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = rnd() * acc; let lo = 0, hi = cdf.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < r) lo = mid + 1; else hi = mid; }
    const [a, b, d] = st.tri[lo]; let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
    out.push([0, 1, 2].map(k => m.pos[a + k] + u * (m.pos[b + k] - m.pos[a + k]) + v * (m.pos[d + k] - m.pos[a + k])));
  }
  return out;
}

// ---- Umeyama 相似变换（3×3 SVD 用 Jacobi 对称特征分解实现）----
const mul = (A, B) => A.map((r, i) => B[0].map((_, j) => r.reduce((s, _, k) => s + A[i][k] * B[k][j], 0)));
const T = A => A[0].map((_, j) => A.map(r => r[j]));
function jacobi(S) {
  const a = S.map(r => r.slice()), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 60; it++) for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
    if (Math.abs(a[p][q]) < 1e-15) continue;
    const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
    const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
    for (let k = 0; k < 3; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
    for (let k = 0; k < 3; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
    for (let k = 0; k < 3; k++) { const x = V[k][p], y = V[k][q]; V[k][p] = c * x - s * y; V[k][q] = s * x + c * y; }
  }
  return { w: [a[0][0], a[1][1], a[2][2]], V };
}
function svd3(M) { // M = U Σ Vᵀ
  const { w, V } = jacobi(mul(T(M), M));
  const ord = [0, 1, 2].sort((i, j) => w[j] - w[i]);
  const Vs = V.map(r => ord.map(i => r[i])), sig = ord.map(i => Math.sqrt(Math.max(w[i], 0)));
  const MV = mul(M, Vs), U = MV.map(r => r.map((x, j) => x / (sig[j] || 1)));
  // 第三列用叉积保证正交
  const u0 = U.map(r => r[0]), u1 = U.map(r => r[1]);
  const u2 = [u0[1] * u1[2] - u0[2] * u1[1], u0[2] * u1[0] - u0[0] * u1[2], u0[0] * u1[1] - u0[1] * u1[0]];
  U.forEach((r, i) => { r[2] = u2[i]; });
  return { U, S: sig, V: Vs };
}
const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
function umeyama(src, dst, w = src.map(() => 1), fixedS = null) {
  const W = w.reduce((a, b) => a + b, 0);
  const ms = [0, 1, 2].map(k => src.reduce((s, p, i) => s + w[i] * p[k], 0) / W);
  const md = [0, 1, 2].map(k => dst.reduce((s, p, i) => s + w[i] * p[k], 0) / W);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; let vs = 0;
  src.forEach((p, i) => {
    const a = p.map((x, k) => x - ms[k]), b = dst[i].map((x, k) => x - md[k]);
    vs += w[i] * a.reduce((s, x) => s + x * x, 0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r][c] += w[i] * b[r] * a[c];
  });
  const { U, S, V } = svd3(C);
  const D = [1, 1, det(mul(U, T(V))) < 0 ? -1 : 1];
  const R = mul(mul(U, D.map((d, i) => [0, 1, 2].map(j => (i === j ? d : 0)))), T(V));
  const s = fixedS ?? S.reduce((a, x, i) => a + x * D[i], 0) / vs;
  const t = md.map((x, k) => x - s * R[k].reduce((a, r, j) => a + r * ms[j], 0));
  return { s, R, t };
}
const apply = ({ s, R, t }, p) => [0, 1, 2].map(k => s * (R[k][0] * p[0] + R[k][1] * p[1] + R[k][2] * p[2]) + t[k]);

// ---- 最近点（体素网格加速）----
function grid(pts, h = 1) {
  const g = new Map();
  pts.forEach((p, i) => { const k = p.map(x => Math.floor(x / h)).join(); (g.get(k) || g.set(k, []).get(k)).push(i); });
  return { nearest(q) {
    const c = q.map(x => Math.floor(x / h)); let best = Infinity, bi = -1;
    for (let r = 0; r < 6 && (bi < 0 || r <= 1 + Math.ceil(Math.sqrt(best) / h)); r++)
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
        for (const i of g.get([c[0] + dx, c[1] + dy, c[2] + dz].join()) || []) {
          const d = (pts[i][0] - q[0]) ** 2 + (pts[i][1] - q[1]) ** 2 + (pts[i][2] - q[2]) ** 2;
          if (d < best) { best = d; bi = i; }
        }
      }
    return { i: bi, d: Math.sqrt(best) };
  } };
}

// ---- 1) 质心初配 ----
const bones = [];
for (const [bk, zk] of Object.entries(PAIRS)) {
  const am = appMesh(bk), zm = za[zk];
  if (!am || !zm) { console.warn('缺少', bk, zk, !!am, !!zm); continue; }
  const zmesh = { pos: zm.pos, idx: zm.idx };
  const as = areaStats(am), zs = areaStats(zmesh);
  bones.push({ bk, zk, am, zm: zmesh, as, zs, aS: sample(am, as, 1500, 7), zS: sample(zmesh, zs, 1500, 11) });
}
// 尺度由表面积比确定（ICP 单向最近点会把尺度压小）；配准只用肩带骨，前臂另行报告
const FIT = new Set(['right clavicle', 'right scapula', 'right humerus', 'right first rib']);
const fit = bones.filter(b => FIT.has(b.bk));
const S0 = Math.sqrt(fit.reduce((a, b) => a + b.as.area, 0) / fit.reduce((a, b) => a + b.zs.area, 0));
let X = umeyama(fit.map(b => b.zs.c), fit.map(b => b.as.c), fit.map(b => Math.sqrt(b.as.area)), S0);

// ICP 精配（双向最近点，同名骨骼内部）
const grids = bones.map(b => grid(b.aS, 1));
const inv = ({ s, R, t }) => { const Rt = T(R); const ti = Rt.map(r => -(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]) / s); return { s: 1 / s, R: Rt, t: ti }; };
for (let it = 0; it < 40; it++) {
  const src = [], dst = [];
  const Xi = inv(X);
  bones.forEach((b, bi) => {
    if (!FIT.has(b.bk)) return;
    const zt = b.zS.map(p => apply(X, p)), zg = grid(zt, 1);
    b.zS.forEach((p, k) => { const n = grids[bi].nearest(zt[k]); if (n.i >= 0) { src.push(p); dst.push(b.aS[n.i]); } });
    b.aS.forEach(q => { const n = zg.nearest(q); if (n.i >= 0) { src.push(b.zS[n.i]); dst.push(q); } });
  });
  X = umeyama(src, dst, undefined, S0);
}
const report = bones.map((b, bi) => {
  const zt = b.zS.map(p => apply(X, p)), zg = grid(zt, 1);
  const ds = [...zt.map(q => grids[bi].nearest(q).d), ...b.aS.map(q => zg.nearest(q).d)].sort((a, c) => a - c);
  const ca = apply(X, b.zs.c), cb = b.as.c;
  return { bone: b.bk, used: FIT.has(b.bk), meanSurf_cm: +(ds.reduce((a, c) => a + c, 0) / ds.length).toFixed(2),
    p90Surf_cm: +ds[Math.floor(ds.length * 0.9)].toFixed(2), centroidGap_cm: +Math.hypot(...ca.map((x, k) => x - cb[k])).toFixed(2),
    areaRatio: +(b.zs.area * X.s * X.s / b.as.area).toFixed(3) };
});
console.table(report);
console.log('scale', X.s.toFixed(4), 'translate', X.t.map(v => v.toFixed(2)).join(', '));
fs.writeFileSync(outFile, JSON.stringify({ s: X.s, R: X.R, t: X.t, report }, null, 1));
console.log('WROTE', outFile);
