#!/usr/bin/env node
// 从 BodyParts3D 4.0 原始 OBJ 抽出右上肢肌肉与骨骼，打包成 assets/limb/meshes.{json,bin}。
// 零依赖。用法：
//   node tools/build-limb-meshes.mjs --source raw/isa_BP3D_4.0_obj_99 --parts raw/isa_element_parts.txt
// 数据：BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]]);
  return acc;
}, []));
const SRC = args.source || 'raw/isa_BP3D_4.0_obj_99';
const PARTS = args.parts || 'raw/isa_element_parts.txt';
const OUT = args.out || 'assets/limb';

// 靶区 id → BodyParts3D 英文名（与 isa_element_parts.txt 第 2 列一致）
const TARGET_PARTS = {
  m_deltoid: ['clavicular part of right deltoid', 'acromial part of right deltoid', 'spinal part of right deltoid'],
  m_teres_minor: ['right teres minor'],
  m_subclavius: ['right subclavius'],
  m_pec: ['clavicular part of right pectoralis major', 'sternocostal part of right pectoralis major',
    'abdominal part of right pectoralis major', 'right pectoralis minor'],
  m_serratus: ['right serratus anterior'],
  m_coraco: ['right coracobrachialis'],
  m_biceps: ['long head of right biceps brachii', 'short head of right biceps brachii'],
  m_brachialis: ['right brachialis'],
  m_pronator: ['humeral head of right pronator teres', 'ulnar head of right pronator teres'],
  m_flexor_med: ['right flexor carpi radialis', 'right flexor digitorum superficialis'],
  m_palmaris: ['right palmaris longus'],
  m_ain: ['right flexor pollicis longus'],
  m_pq: ['right pronator quadratus'],
  m_flexor_uln: ['humeral head of right flexor carpi ulnaris', 'ulnar head of right flexor carpi ulnaris'],
  m_thenar: ['right abductor pollicis brevis', 'right opponens pollicis', 'superficial head of right flexor pollicis brevis'],
  m_adductor: ['oblique head of right adductor pollicis', 'transverse head of right adductor pollicis'],
  m_hypothenar: ['abductor digiti minimi of right hand', 'flexor digiti minimi brevis of right hand', 'opponens digiti minimi of right hand'],
  m_interossei: ['set of dorsal interossei of right hand', 'set of palmar interossei of right hand'],
  m_rotator: ['right supraspinatus', 'right infraspinatus muscle'],
  m_rhomboid: ['right rhomboid major', 'right rhomboid minor'],
  m_teres_major: ['right teres major', 'right subscapularis'],
  m_triceps: ['long head of right triceps brachii', 'lateral head of right triceps brachii', 'medial head of right triceps brachii'],
  m_anconeus: ['right anconeus'],
  m_brachiorad: ['right brachioradialis', 'right extensor carpi radialis longus'],
  m_supinator: ['right supinator'],
  m_ext_digits: ['right extensor digitorum', 'right extensor indicis', 'right extensor digiti minimi',
    'right extensor carpi ulnaris', 'right extensor pollicis longus', 'right extensor pollicis brevis',
    'right abductor pollicis longus'],
  // m_latissimus：BodyParts3D 4.0 没有背阔肌，界面上用文字按钮代替
};
// 蚓状肌是一个合并文件：按连通块拆成 4 条，从桡侧到尺侧分给两个靶区
const LUMBRICALS = { name: 'set of lumbricals of right hand', split: ['m_lumb_lat', 'm_lumb_lat', 'm_lumb_med', 'm_lumb_med'] };
// 指深屈肌：示指部分属 m_ain，环小指部分属 m_flexor_uln。原始网格是一整块，作为灰色背景肌
const BG_MUSCLES = ['right flexor digitorum profundus', 'right extensor carpi radialis brevis'];
const BONES = [
  'right clavicle', 'right scapula', 'right humerus', 'right radius', 'right ulna',
  'right scaphoid', 'right lunate', 'right triquetral', 'right pisiform',
  'right trapezium', 'right trapezoid', 'right capitate', 'right hamate',
  'right first metacarpal bone', 'right second metacarpal bone', 'right third metacarpal bone',
  'right fourth metacarpal bone', 'right fifth metacarpal bone',
  'proximal phalanx of right thumb', 'distal phalanx of right thumb',
  ...['index', 'middle', 'ring', 'little'].flatMap(f => ['proximal', 'middle', 'distal'].map(p => `${p} phalanx of right ${f} finger`)),
];
const RIBS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'].map(n => `right ${n} rib`);

// ---------- 名称 → 文件号 ----------
const nameToFiles = new Map();
for (const line of fs.readFileSync(PARTS, 'utf8').split('\n').slice(1)) {
  const [, name, fj] = line.trim().split('\t');
  if (!name || !fj) continue;
  const k = name.toLowerCase();
  if (!nameToFiles.has(k)) nameToFiles.set(k, new Set());
  nameToFiles.get(k).add(fj);
}
function filesFor(name) {
  const s = nameToFiles.get(name.toLowerCase());
  if (!s) throw new Error(`部件表里找不到：${name}`);
  // 同名的镜像件（FJxxxxM）只在没有原件时才用
  const plain = [...s].filter(f => !f.endsWith('M'));
  return plain.length ? plain : [...s];
}

// ---------- OBJ ----------
// BodyParts3D：mm，X 向患者左侧，Y 向后，Z 向上。
// three：cm，X 同向（右臂在 −X，前面观时位于画面左侧），Y 向上，Z 向前。
// (x, y, z) → (x, z, −y) 是纯旋转，三角形绕序不变。
function readObj(fj) {
  const file = path.join(SRC, `${fj}.obj`);
  const txt = fs.readFileSync(file, 'utf8');
  const pos = [], idx = [];
  for (const line of txt.split('\n')) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.trim().split(/\s+/).map(Number);
      pos.push(x / 10, z / 10, -y / 10);
    } else if (line.startsWith('f ')) {
      const vs = line.trim().split(/\s+/).slice(1).map(t => parseInt(t, 10) - 1);
      for (let i = 1; i + 1 < vs.length; i++) idx.push(vs[0], vs[i], vs[i + 1]);
    }
  }
  return weld({ pos, idx });
}

// 原始 OBJ 在法线接缝处重复了顶点：按位置（0.001 cm）焊接，连通块才拆得对，体积也更小
function weld({ pos, idx }) {
  const map = new Map(), remap = new Int32Array(pos.length / 3), p = [];
  for (let v = 0; v < remap.length; v++) {
    const k = `${Math.round(pos[3 * v] * 1000)},${Math.round(pos[3 * v + 1] * 1000)},${Math.round(pos[3 * v + 2] * 1000)}`;
    if (!map.has(k)) { map.set(k, p.length / 3); p.push(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]); }
    remap[v] = map.get(k);
  }
  const t = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = remap[idx[i]], b = remap[idx[i + 1]], c = remap[idx[i + 2]];
    if (a !== b && b !== c && a !== c) t.push(a, b, c);
  }
  return { pos: p, idx: t };
}

function components({ pos, idx }) {
  const n = pos.length / 3, parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = a => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  for (let i = 0; i < idx.length; i += 3) {
    const a = find(idx[i]), b = find(idx[i + 1]), c = find(idx[i + 2]);
    parent[b] = a; parent[find(c)] = a;
  }
  const groups = new Map();
  for (let i = 0; i < idx.length; i += 3) {
    const r = find(idx[i]);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(idx[i], idx[i + 1], idx[i + 2]);
  }
  return [...groups.values()].map(tri => compact(pos, tri));
}

// 只保留被三角形引用的顶点，并重新编号
function compact(pos, tri) {
  const map = new Map(), p = [], t = [];
  for (const v of tri) {
    if (!map.has(v)) { map.set(v, p.length / 3); p.push(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]); }
    t.push(map.get(v));
  }
  return { pos: p, idx: t };
}

function merge(meshes) {
  const pos = [], idx = [];
  for (const m of meshes) {
    const base = pos.length / 3;
    pos.push(...m.pos);
    for (const i of m.idx) idx.push(i + base);
  }
  return { pos, idx };
}

const centroid = ({ pos }) => {
  const c = [0, 0, 0], n = pos.length / 3;
  for (let i = 0; i < pos.length; i++) c[i % 3] += pos[i];
  return c.map(v => v / n);
};

// ---------- 收集 ----------
const parts = []; // { key, zone|null, kind: 'muscle'|'bone'|'rib'|'bg', names[], files[], mesh }
const add = (key, zone, kind, names, mesh, files) => parts.push({ key, zone, kind, names, files, mesh });

for (const [zone, names] of Object.entries(TARGET_PARTS)) {
  for (const name of names) {
    const files = filesFor(name);
    add(name, zone, 'muscle', [name], merge(files.map(readObj)), files);
  }
}
{
  const files = filesFor(LUMBRICALS.name);
  // 4 个最大的连通块是 4 条蚓状肌；其余碎片（接缝处的零散三角形）并到质心最近的那条
  const all = components(merge(files.map(readObj))).sort((a, b) => b.idx.length - a.idx.length);
  const n = LUMBRICALS.split.length;
  if (all.length < n || all[n - 1].idx.length < 300) throw new Error(`蚓状肌只拆出 ${all.length} 块，预期至少 ${n} 条`);
  const groups = all.slice(0, n).map(c => [c]);
  const seeds = groups.map(g => centroid(g[0]));
  for (const c of all.slice(n)) {
    const cc = centroid(c);
    const d = seeds.map(s => Math.hypot(s[0] - cc[0], s[1] - cc[1], s[2] - cc[2]));
    groups[d.indexOf(Math.min(...d))].push(c);
  }
  groups.map(merge)
    .sort((a, b) => centroid(a)[0] - centroid(b)[0]) // −X 在外侧：第 1 蚓状肌（示指）最靠外
    .forEach((c, i) => add(`lumbrical ${i + 1} of right hand`, LUMBRICALS.split[i], 'muscle', [LUMBRICALS.name], c, files));
}
for (const name of BG_MUSCLES) { const f = filesFor(name); add(name, null, 'bg', [name], merge(f.map(readObj)), f); }
for (const name of BONES) { const f = filesFor(name); add(name, null, 'bone', [name], merge(f.map(readObj)), f); }
for (const name of RIBS) { const f = filesFor(name); add(name, null, 'rib', [name], merge(f.map(readObj)), f); }

// ---------- 量化并写出 ----------
// 原点放在靶区肌肉的包围盒中心；全部件共用一个量化盒（Uint16，精度约 0.01 mm）
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
const box = (ps, l, h) => { for (let i = 0; i < ps.length; i++) { l[i % 3] = Math.min(l[i % 3], ps[i]); h[i % 3] = Math.max(h[i % 3], ps[i]); } };
parts.filter(p => p.zone).forEach(p => box(p.mesh.pos, lo, hi));
const center = lo.map((v, i) => (v + hi[i]) / 2);
for (const p of parts) for (let i = 0; i < p.mesh.pos.length; i++) p.mesh.pos[i] -= center[i % 3];
const qlo = [Infinity, Infinity, Infinity], qhi = [-Infinity, -Infinity, -Infinity];
parts.forEach(p => box(p.mesh.pos, qlo, qhi));
const range = qhi.map((v, i) => v - qlo[i]);

const chunks = []; let offset = 0;
const push = buf => { chunks.push(buf); const o = offset; offset += buf.byteLength; return o; };
const pad4 = () => { if (offset % 4) push(Buffer.alloc(4 - (offset % 4))); };

const meta = [];
for (const p of parts) {
  const { pos, idx } = p.mesh;
  const vCount = pos.length / 3;
  const q = new Uint16Array(pos.length);
  for (let i = 0; i < pos.length; i++) q[i] = Math.round((pos[i] - qlo[i % 3]) / range[i % 3] * 65535);
  pad4();
  const posOffset = push(Buffer.from(q.buffer));
  pad4();
  const wide = vCount > 65535;
  const ib = wide ? new Uint32Array(idx) : new Uint16Array(idx);
  const idxOffset = push(Buffer.from(ib.buffer));
  meta.push({
    key: p.key, zone: p.zone, kind: p.kind, files: p.files,
    posOffset, vCount, idxOffset, iCount: idx.length, wide,
    c: centroid(p.mesh).map(v => +v.toFixed(2)),
  });
}

fs.mkdirSync(OUT, { recursive: true });
const bin = Buffer.concat(chunks);
fs.writeFileSync(path.join(OUT, 'meshes.bin'), bin);
fs.writeFileSync(path.join(OUT, 'meshes.json'), JSON.stringify({
  source: 'BodyParts3D 4.0 (isa_BP3D_4.0_obj_99), © The Database Center for Life Science, CC BY 4.0',
  units: 'cm', axes: 'x: 患者左侧, y: 上, z: 前；原点为靶区肌肉包围盒中心',
  qMin: qlo.map(v => +v.toFixed(4)), qRange: range.map(v => +v.toFixed(4)),
  parts: meta,
}, null, 1));

// ---------- 报告 ----------
const byZone = {};
meta.forEach(m => { const k = m.zone || `(${m.kind})`; byZone[k] = byZone[k] || { n: 0, v: 0, t: 0 }; byZone[k].n++; byZone[k].v += m.vCount; byZone[k].t += m.iCount / 3; });
console.table(byZone);
console.log(`部件 ${meta.length} 个，meshes.bin ${(bin.byteLength / 1048576).toFixed(2)} MB`);
console.log('范围 (cm):', range.map(v => v.toFixed(1)).join(' × '));
