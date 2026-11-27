// 校验 3D 视图的真实走行数据（assets/plexus/）：节点、连线齐全，连线首尾接在母神经和子节点上，
// 每个运动靶区都有肌肉网格。用法：node tests/check-plexus3d.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { PlexusModel } from '../js/model.js';
import { LESION_SITES } from '../js/data/lesion-sites.js';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url));
const D = JSON.parse(read('assets/plexus/plexus3d.json'));
const limb = JSON.parse(read('assets/limb/meshes.json'));
const extra = JSON.parse(read('assets/plexus/meshes.json'));
let n = 0;
const check = (name, fn) => {
  try { fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; }
};

const isPt = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const isPoly = p => Array.isArray(p) && p.length >= 2 && p.every(isPt);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function distToPoly(x, poly) {
  let best = Infinity;
  for (let i = 0; i + 1 < poly.length; i++) {
    const a = poly[i], b = poly[i + 1], ab = [0, 1, 2].map(k => b[k] - a[k]);
    const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((x[0] - a[0]) * ab[0] + (x[1] - a[1]) * ab[1] + (x[2] - a[2]) * ab[2]) / l2));
    best = Math.min(best, dist(x, [0, 1, 2].map(k => a[k] + ab[k] * t)));
  }
  return best;
}
// 节点的几何：有走行用走行，没有就是锚点；根还包括它通往干的那一段（侧支可以从那里发出）
const geom = id => {
  const g = [D.courses[id] || [D.anchors[id], D.anchors[id]]];
  if (PlexusModel.ROOTS.includes(id)) g.push(...Object.entries(D.edges).filter(([k]) => k.startsWith(id + '>') && PlexusModel.TRUNKS.includes(k.split('>')[1])).map(([, p]) => p));
  return g;
};
const near = (x, id) => Math.min(...geom(id).map(p => distToPoly(x, p)));

check('每个节点都有锚点', () => {
  for (const id of PlexusModel.NODE_IDS) assert.ok(isPt(D.anchors[id]), `${id} 缺少锚点`);
  for (const id of Object.keys(D.anchors)) assert.ok(PlexusModel.NODE_IDS.includes(id), `锚点 ${id} 不是节点`);
});

check('走行、细枝都是合法折线，且属于已有节点', () => {
  for (const [id, p] of Object.entries(D.courses)) { assert.ok(PlexusModel.NODE_IDS.includes(id), id); assert.ok(isPoly(p), `${id} 走行`); }
  for (const [id, ps] of Object.entries(D.extras)) { assert.ok(PlexusModel.NODE_IDS.includes(id), id); ps.forEach((p, i) => assert.ok(isPoly(p), `${id} 细枝 ${i}`)); }
});

check('锚点落在自身走行上', () => {
  for (const [id, p] of Object.entries(D.courses)) assert.ok(distToPoly(D.anchors[id], p) < 0.1, `${id} 锚点离走行 ${distToPoly(D.anchors[id], p).toFixed(2)} cm`);
});

check('每条连线都有路径，且只有模型里的连线', () => {
  for (const [a, b] of PlexusModel.LINKS) assert.ok(isPoly(D.edges[`${a}>${b}`]), `缺少连线 ${a}>${b}`);
  for (const k of Object.keys(D.edges)) assert.ok(PlexusModel.LINKS.some(([a, b]) => `${a}>${b}` === k), `连线 ${k} 不在模型里`);
});

check('连线起点在母神经上，终点在子节点上', () => {
  for (const [a, b] of PlexusModel.LINKS) {
    const p = D.edges[`${a}>${b}`];
    assert.ok(near(p[0], a) < 0.2, `${a}>${b} 起点离 ${a} ${near(p[0], a).toFixed(2)} cm`);
    assert.ok(near(p.at(-1), b) < 0.2, `${a}>${b} 终点离 ${b} ${near(p.at(-1), b).toFixed(2)} cm`);
  }
});

check('细枝从本神经的走行或其他细枝上发出', () => {
  for (const [id, ps] of Object.entries(D.extras)) {
    const all = [D.courses[id], ...ps].filter(Boolean);
    ps.forEach((p, i) => {
      const d = Math.min(...all.filter(q => q !== p).map(q => distToPoly(p[0], q)));
      assert.ok(d < 0.2, `${id} 细枝 ${i} 起点悬空 ${d.toFixed(2)} cm`);
    });
  }
});

check('补画与调整清单只引用已有的节点和连线', () => {
  D.drawn.nodes.forEach(id => assert.ok(PlexusModel.NODE_IDS.includes(id), id));
  D.drawn.edges.forEach(k => assert.ok(D.edges[k], k));
  D.adjusted.forEach(id => assert.ok(PlexusModel.NODE_IDS.includes(id), id));
});

check('动脉、预设视角、结构标签格式正确', () => {
  D.arteries.forEach(a => { assert.ok(a.id && a.name && a.r > 0, a.id); assert.ok(isPoly(a.path), a.id); });
  for (const v of ['front', 'top', 'lateral', 'back', 'arm']) {
    const c = D.cameraViews[v];
    assert.ok(c && isPt(c.target) && isPt(c.dir) && c.dist > 0, `视角 ${v}`);
  }
  D.ctxLabels.forEach(l => { assert.ok(l.text && isPt(l.pos), l.text); assert.ok(['bones', 'artery', 'muscles'].includes(l.layer), l.layer); });
});

check('每个运动靶区都有肌肉网格（含 Z-Anatomy 背阔肌）', () => {
  const zones = new Set([...limb.parts, ...extra.parts].map(p => p.zone).filter(Boolean));
  PlexusModel.ZONES.filter(t => t.kind === 'motor').forEach(t => assert.ok(zones.has(t.id), `${t.id} 没有网格`));
});

check('网格包的偏移与长度在 meshes.bin 范围内', () => {
  const size = read('assets/plexus/meshes.bin').byteLength;
  extra.parts.forEach(p => {
    assert.ok(p.posOffset + p.vCount * 6 <= size, `${p.key} 顶点越界`);
    assert.ok(p.idxOffset + p.iCount * (p.wide ? 4 : 2) <= size, `${p.key} 索引越界`);
    assert.ok(p.iCount % 3 === 0 && p.posOffset % 2 === 0 && p.idxOffset % 4 === 0, `${p.key} 对齐`);
  });
});

check('损伤部位落在走行上，与模型的平面一致', () => {
  const presets = PlexusModel.LESION_PRESETS;
  for (const [key, levels] of Object.entries(LESION_SITES)) {
    assert.ok(presets[key], `部位位置 ${key} 不是损伤预设`);
    for (const [lk, e] of Object.entries(levels)) {
      const level = presets[key].levels.find(l => l.key === lk);
      assert.ok(level, `${key}/${lk} 不是该预设的部位`);
      assert.ok(level.sites.includes(e.node), `${key}/${lk} 的位置不在切断结构 ${level.sites} 上`);
      const ys = (D.courses[e.node] || []).map(p => p[1]);
      assert.ok(ys.length && e.y <= Math.max(...ys) && e.y >= Math.min(...ys), `${key}/${lk} 的高度 ${e.y} 不在 ${e.node} 走行范围内`);
    }
  }
  // 母神经内的平面损伤必须有位置，否则 3D 里画不出近端保留、远端受累
  for (const [key, p] of Object.entries(presets)) for (const l of p.levels)
    if (l.plane > 0) assert.ok(LESION_SITES[key] && LESION_SITES[key][l.key], `${key}/${l.key} 有平面但没有 3D 位置`);
  // 同一结构上，平面越远端，位置越低
  for (const [key, levels] of Object.entries(LESION_SITES)) {
    const ls = presets[key].levels.filter(l => levels[l.key]).map(l => ({ ...levels[l.key], plane: l.plane || 0, key: l.key }));
    for (const a of ls) for (const b of ls)
      if (a.node === b.node && a.plane < b.plane) assert.ok(a.y > b.y, `${key}：${a.key} 应比 ${b.key} 高`);
  }
});

console.log(`✓ 3D 真实走行 ${n} 项检查通过（${PlexusModel.NODE_IDS.length} 个节点，${PlexusModel.LINKS.length} 条连线，补画 ${D.drawn.edges.length} 条）`);
