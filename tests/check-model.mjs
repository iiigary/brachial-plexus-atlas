// 校验纤维路由模型，以及页面数据（节点、上肢图、损伤文字、题库、3D 坐标）与模型是否对应。
// 用法：node tests/check-model.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { PlexusModel as M } from '../js/model.js';
import { NODES, EDGES, SPATIAL, nodeMap } from '../js/data/nodes.js';
import { LIMB_ZONES } from '../js/data/limb.js';
import { LESIONS } from '../js/data/lesions.js';
import { QUIZ_BANK, CASES } from '../js/data/quiz.js';
import { CLINICAL, SEARCH_ALIASES } from '../js/data/clinical.js';
import { generateMCQ, makeRng, MCQ_TYPES } from '../js/quizgen.js';
import { ANCHORS, COURSES, EDGE_VIA, EDGE_START, MUSCLE_FIBERS } from '../js/data/anatomy3d.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const set = s => [...s].sort().join(',');
let n = 0;
const check = (name, fn) => {
  try { fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; }
};
const sev = (key, level, id) => M.lesion(key, level).severity.get(id) || 'none';
const expectSev = (key, level, want, ids) => ids.forEach(id => assert.strictEqual(sev(key, level, id), want, `${key}/${level} ${id}`));
const ALL_NODES = new Set(M.LINKS.flat());

check('每条根到每条神经的路径唯一', () => {
  const out = {};
  M.LINKS.forEach(([a, b]) => (out[a] = out[a] || []).push(b));
  const count = (a, b) => a === b ? 1 : (out[a] || []).reduce((s, x) => s + count(x, b), 0);
  for (const [nerve, roots] of Object.entries(M.COMPOSITION))
    for (const r of roots) assert.strictEqual(count(r, nerve), 1, `${r} → ${nerve}`);
});

check('分支的节段是母神经节段的子集', () => {
  for (const [nerve, roots] of Object.entries(M.COMPOSITION))
    for (const p of M.parentsOf(nerve)) {
      if (!(p in M.COMPOSITION)) continue;
      for (const r of roots) assert(M.COMPOSITION[p].includes(r), `${nerve} 的 ${r} 不在母神经 ${p} 里`);
    }
});

check('靶区引用的神经与节段都能走通', () => {
  for (const t of M.TARGETS) for (const f of t.fibers) for (const r of f.roots) {
    assert(M.pathOf(r, f.nerve), `${t.id}: ${r} 到不了 ${f.nerve}`);
    assert(M.rootsOf(f.nerve).includes(r), `${t.id}: ${f.nerve} 不含 ${r}`);
  }
});

check('页面节点、连线、损伤按钮都与模型对应', () => {
  assert.strictEqual(set(NODES.map(x => x.id)), set(ALL_NODES), '节点与模型拓扑不一致');
  assert.strictEqual(set(EDGES.map(e => e.from + '>' + e.to)), set(M.LINKS.map(([a, b]) => a + '>' + b)));
  assert.strictEqual(set(Object.keys(SPATIAL)), set(ALL_NODES), '有节点缺少空间位置说明');
  const lesions = [...html.matchAll(/data-lesion="(\w+)"/g)].map(m => m[1]);
  assert.strictEqual(set(lesions), set(Object.keys(M.LESION_SITES)), '损伤按钮与模型不一致');
  for (const id of Object.keys(CLINICAL)) assert(ALL_NODES.has(id), `临床卡片 ${id} 没有对应节点`);
});

check('每个节点都有 3D 位置，肌肉 3D 形状对应靶区', () => {
  for (const id of ALL_NODES) assert(Array.isArray(ANCHORS[id]) && ANCHORS[id].length === 3, `${id} 缺少 3D 锚点`);
  for (const id of Object.keys(COURSES)) assert(ALL_NODES.has(id), `走行 ${id} 不是节点`);
  for (const k of [...Object.keys(EDGE_VIA), ...Object.keys(EDGE_START)]) assert(M.LINKS.some(([a, b]) => a + '>' + b === k), `连线 ${k} 不存在`);
  for (const id of Object.keys(MUSCLE_FIBERS)) assert.strictEqual(M.target(id)?.kind, 'motor', `肌肉 ${id} 不是运动靶区`);
});

check('每个损伤部位都有说明文字，默认部位存在', () => {
  for (const [key, def] of Object.entries(M.LESION_SITES)) {
    assert(LESIONS[key], `损伤 ${key} 缺少说明`);
    assert(def.levels.some(l => l.key === def.def), `${key} 的默认部位不存在`);
    assert.strictEqual(set(Object.keys(LESIONS[key].levels)), set(def.levels.map(l => l.key)), `${key} 的部位与说明不对应`);
    for (const T of Object.values(LESIONS[key].levels))
      for (const f of ['segments', 'motor', 'sensory', 'clinical']) assert(T[f], `${key} 缺少 ${f}`);
  }
});

check('上肢图分区与模型靶区一一对应', () => {
  const all = Object.entries(LIMB_ZONES).flatMap(([kind, zs]) => zs.map(z => ({ ...z, kind })));
  assert.strictEqual(set(new Set(all.map(z => z.id))), set(M.TARGETS.map(t => t.id)), '分区与靶区不一致');
  for (const z of all) {
    assert.strictEqual(M.target(z.id).kind, z.kind, `${z.id} 放错了图层`);
    assert(['a', 'p'].includes(z.v) && z.d && z.t && z.lab.length === 3, `${z.id} 的分区数据不完整`);
  }
});

check('题库引用的节点、损伤部位都存在，反向题有确定答案', () => {
  for (const q of QUIZ_BANK) {
    if (q.target) { assert(ALL_NODES.has(q.target), `自测题目标 ${q.target} 不存在`); continue; }
    const { lesion, level, mode } = q.zones;
    assert(M.LESION_SITES[lesion].levels.some(l => l.key === level), `反向题 ${lesion}/${level} 不存在`);
    assert(LIMB_ZONES[mode], `反向题图层 ${mode} 不存在`);
  }
  const qs = [...QUIZ_BANK, ...CASES].map(q => q.q);
  assert.strictEqual(new Set(qs).size, qs.length, '有重复题干');
});

check('病例题的描述与模型推出的损伤一致', () => {
  for (const c of CASES) {
    assert(ALL_NODES.has(c.target), `病例答案 ${c.target} 不存在`);
    const L = M.lesionAt([c.target]);
    const got = id => L.severity.get(id) || 'none';
    for (const want of ['full', 'partial', 'none'])
      for (const id of c.expect[want] || []) {
        assert(M.target(id), `病例 ${c.target} 引用了不存在的靶区 ${id}`);
        assert.strictEqual(got(id), want, `病例 ${c.target}：${id} 应为 ${want}`);
      }
  }
});

check('选择题：每题 4 个不同选项，正确答案唯一', () => {
  const rng = makeRng(42);
  for (let i = 0; i < 200; i++) {
    const type = MCQ_TYPES[i % MCQ_TYPES.length];
    const q = generateMCQ(type, null, rng);
    const ids = q.options.map(o => o.id);
    assert.strictEqual(new Set(ids).size, 4, `${q.key} 选项重复`);
    assert(ids.includes(q.answer), `${q.key} 选项里没有答案`);
    if (type === 'supply') {
      const route = M.routeOf(q.subject);
      assert.strictEqual(ids.filter(id => route.has(id)).length, 1, `${q.key} 有不止一个选项在支配通路上`);
    } else {
      const L = M.lesionAt([q.subject]);
      assert.strictEqual(ids.filter(id => L.severity.has(id)).length, 1, `${q.key} 有不止一个选项受累`);
    }
  }
});

check('搜索别名指向存在的结构或损伤', () => {
  for (const a of SEARCH_ALIASES) {
    const x = a.action;
    if (x.lesion) assert(M.LESION_SITES[x.lesion] && (!x.level || M.LESION_SITES[x.lesion].levels.some(l => l.key === x.level)), a.label);
    else if (x.node) assert(ALL_NODES.has(x.node), a.label);
    else assert(M.target(x.zone), a.label);
  }
});

check('溯源只走真实纤维路径', () => {
  const roots = id => M.ROOTS.filter(r => M.trace(id).upNodes.has(r)).join(',');
  assert.strictEqual(roots('axillary'), 'c5,c6');
  assert.strictEqual(roots('thoracodorsal'), 'c6,c7,c8');
  assert.strictEqual(roots('median'), 'c6,c7,c8,t1');
  assert.strictEqual(roots('ulnar'), 'c8,t1');
  assert.strictEqual(roots('radial'), 'c5,c6,c7,c8,t1');
  assert.strictEqual(roots('lower_subscapular'), 'c5,c6');
  assert.strictEqual(roots('med_cut_forearm'), 'c8,t1');
  assert.strictEqual(roots('pin'), 'c6,c7,c8');
  assert.strictEqual(roots('ain'), 'c8,t1');
  assert(!M.trace('axillary').upNodes.has('low_post'));
  assert(M.trace('median').upEdges.has('up_ant>lat_cord') && !M.trace('median').upEdges.has('c5>upper_trunk'));
  assert(!M.trace('c7').downNodes.has('axillary') && !M.trace('c7').downNodes.has('ulnar'));
  assert(M.trace('ain').upEdges.has('med_cord>median') && !M.trace('ain').upEdges.has('lat_cord>median'));
  assert.strictEqual(set(M.traceTarget('m_thenar').nodes), set(['c8', 't1', 'lower_trunk', 'low_ant', 'med_cord', 'median']));
});

check('节段标签由模型推导', () => {
  assert.strictEqual(M.segLabel('axillary'), 'C5–C6');
  assert.strictEqual(M.segLabel('post_cord'), 'C5–T1');
  assert.strictEqual(M.segLabel('middle_trunk'), 'C7');
  assert.strictEqual(M.segLabel('med_cord'), 'C8–T1');
  assert.strictEqual(M.segLabel('long_thoracic'), 'C5–C7');
});

check('次要节段（正中神经的 C5）：单独标成「部分」，不进主通路和损伤推导', () => {
  assert.strictEqual(M.segLabel('median'), '(C5) C6–T1');
  const t = M.trace('median');
  assert.strictEqual(set(t.minorNodes), set(['c5']));
  assert.strictEqual(set(t.minorEdges), set(['c5>upper_trunk']));
  assert(!t.nodes.has('c5'));
  const c5 = M.trace('c5');
  assert(c5.minorNodes.has('median') && c5.minorEdges.has('lat_cord>median') && !c5.nodes.has('median'));
  assert.strictEqual(M.trace('radial').minorNodes.size, 0);
  assert(!M.lesionAt(['c5']).severity.has('m_pronator'));
});

check('口诀 ULTRA / M4U：后束、内侧束的分支齐全', () => {
  const out = id => set(M.childrenOf(id));
  assert.strictEqual(out('post_cord'), set(['upper_subscapular', 'lower_subscapular', 'thoracodorsal', 'radial', 'axillary']));
  assert.strictEqual(out('med_cord'), set(['med_pectoral', 'med_cut_arm', 'med_cut_forearm', 'median', 'ulnar']));
  assert.strictEqual(out('upper_trunk'), set(['up_ant', 'up_post', 'suprascapular', 'subclavius_n']));
});

check('Erb（上干）：肩外展全瘫、屈肘部分保留 C7，菱形肌、前锯肌与手不受累，无 Horner', () => {
  expectSev('erb', 'trunk', 'full', ['m_deltoid', 'm_teres_minor', 'm_rotator', 's_axil', 's_lat_forearm', 'd_c5', 'd_c6']);
  expectSev('erb', 'trunk', 'partial', ['m_biceps', 'm_brachiorad', 'm_triceps', 'm_flexor_med']);
  expectSev('erb', 'trunk', 'none', ['m_thenar', 'm_hypothenar', 'm_flexor_uln', 'm_serratus', 'm_rhomboid', 'm_ext_digits', 's_med_arm', 'd_c8']);
  const L = M.lesion('erb');
  assert.strictEqual(L.level, 'trunk');
  assert(!L.horner && !L.preganglionic);
});

check('C5–C6 根性撕脱：比上干损伤多出菱形肌、前锯肌；仍无 Horner', () => {
  expectSev('erb', 'root', 'full', ['m_deltoid', 'm_rhomboid', 'd_c5', 'd_c6']);
  expectSev('erb', 'root', 'partial', ['m_serratus', 'm_biceps']);
  const L = M.lesion('erb', 'root');
  assert(L.preganglionic && !L.horner);
  assert.strictEqual(set(L.sites), 'c5,c6');
});

check('Klumpke：下干损伤无 Horner，C8–T1 根性撕脱才有', () => {
  for (const level of ['trunk', 'root']) {
    expectSev('klumpke', level, 'full', ['m_thenar', 'm_hypothenar', 'm_interossei', 'm_flexor_uln', 'm_pq', 's_med_arm', 's_med_forearm', 's_fingers_uln', 'd_c8', 'd_t1']);
    expectSev('klumpke', level, 'none', ['m_deltoid', 'm_biceps', 'm_rotator', 's_axil', 'd_c5']);
  }
  assert(!M.lesion('klumpke', 'trunk').horner && !M.lesion('klumpke', 'trunk').preganglionic);
  assert(M.lesion('klumpke', 'root').horner && M.lesion('klumpke', 'root').preganglionic);
});

check('桡神经：腋部累及肱三头肌；桡神经沟垂腕；骨间后神经只垂指、无感觉障碍', () => {
  expectSev('radial', 'axilla', 'full', ['m_triceps', 'm_anconeus', 'm_brachiorad', 'm_supinator', 'm_ext_digits', 's_rad_arm', 's_rad_hand']);
  expectSev('radial', 'groove', 'full', ['m_brachiorad', 'm_supinator', 'm_ext_digits', 's_rad_hand']);
  expectSev('radial', 'groove', 'none', ['m_triceps', 'm_anconeus', 's_rad_arm']);
  expectSev('radial', 'groove', 'partial', ['m_biceps']);
  assert(M.lesion('radial', 'groove').spared.includes('m_triceps'));
  assert.strictEqual(set(M.lesion('radial', 'pin').severity.keys()), 'm_ext_digits');
  const pin = M.lesion('radial', 'pin');
  assert(pin.branch && pin.spared.includes('m_brachiorad') && pin.spared.includes('s_rad_hand') && pin.spared.includes('m_supinator'));
  assert.strictEqual(M.lesion('radial').level, 'groove');
});

check('正中神经：腕管保留手掌感觉与前臂屈肌；骨间前神经只累及深屈肌与旋前方肌；高位全部受累', () => {
  assert.strictEqual(set(M.lesion('median', 'carpal').severity.keys()), set(['m_thenar', 'm_lumb_lat', 's_fingers_med', 's_med_tips']));
  const carpal = M.lesion('median', 'carpal');
  for (const id of ['s_palm_cut', 'm_flexor_med', 'm_palmaris', 'm_ain', 'm_pq']) assert(carpal.spared.includes(id), id);
  assert.strictEqual(set(M.lesion('median', 'ain').severity.keys()), set(['m_ain', 'm_pq']));
  assert(M.lesion('median', 'ain').spared.includes('m_thenar'));
  expectSev('median', 'high', 'full', ['m_pronator', 'm_flexor_med', 'm_palmaris', 'm_ain', 'm_pq', 'm_thenar', 'm_lumb_lat', 's_palm_cut', 's_fingers_med']);
  assert.strictEqual(M.lesion('median').level, 'carpal');
});

check('尺神经：肘部累及指深屈肌与手背/手掌感觉；腕部（默认）只累及手内在肌与 1.5 指掌面', () => {
  expectSev('ulnar', 'elbow', 'full', ['m_flexor_uln', 'm_hypothenar', 'm_interossei', 'm_adductor', 'm_lumb_med', 's_hypo_palm', 's_fingers_uln', 's_uln_back']);
  assert.strictEqual(set(M.lesion('ulnar', 'wrist').severity.keys()),
    set(['m_hypothenar', 'm_interossei', 'm_adductor', 'm_lumb_med', 's_fingers_uln']));
  assert.strictEqual(set(M.lesion('ulnar', 'wrist').spared), set(['m_flexor_uln', 's_hypo_palm', 's_uln_back']));
  assert.strictEqual(M.lesion('ulnar').level, 'wrist');
});

check('腋神经、胸长神经', () => {
  assert.strictEqual(set(M.lesion('axillary').severity.keys()), set(['m_deltoid', 'm_teres_minor', 's_axil']));
  assert.strictEqual(set(M.lesion('long_thoracic').severity.keys()), 'm_serratus');
});

check('周围神经和束的损伤不按皮节高亮', () => {
  for (const [key, def] of Object.entries(M.LESION_SITES)) for (const l of def.levels) {
    const L = M.lesion(key, l.key);
    if (L.isNerve) assert(![...L.severity.keys()].some(id => id.startsWith('d_')), `${key}/${l.key}`);
  }
  for (const id of ['lat_cord', 'post_cord', 'med_cord', 'up_post'])
    assert(![...M.lesionAt([id]).severity.keys()].some(k => k.startsWith('d_')), id);
});

check('自由切断：lesionAt 与预设结果一致，可叠加多个切断点', () => {
  for (const [key, def] of Object.entries(M.LESION_SITES)) for (const l of def.levels) {
    const a = M.lesion(key, l.key), b = M.lesionAt(l.sites, { lv: l.lv });
    assert.strictEqual(JSON.stringify([...a.severity]), JSON.stringify([...b.severity]), `${key}/${l.key}`);
  }
  const both = M.lesionAt(['lat_cord', 'med_cord']);
  assert.strictEqual(both.severity.get('m_flexor_med'), 'full');
  assert.strictEqual(M.lesionAt(['lat_cord']).severity.get('m_flexor_med'), 'partial');
  assert.strictEqual(M.lesionAt([]).severity.size, 0);
});

console.log(`通过 ${n} 组校验`);
