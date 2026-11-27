// 校验纤维路由模型，以及页面数据（节点、上肢图、损伤文字、题库）与模型是否对应。3D 数据见 check-plexus3d.mjs。
// 用法：node tests/check-model.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { PlexusModel } from '../js/model.js';
import { NODES, EDGES, SPATIAL, nodeMap } from '../js/data/nodes.js';
import { LIMB_ZONES } from '../js/data/limb.js';
import { LESIONS } from '../js/data/lesions.js';
import { QUIZ_BANK, CASES } from '../js/data/quiz.js';
import { CLINICAL, SEARCH_ALIASES } from '../js/data/clinical.js';
import { generateMCQ, makeRng, MCQ_TYPES } from '../js/quizgen.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const set = s => [...s].sort().join(',');
let n = 0;
const check = (name, fn) => {
  try { fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; }
};
const sev = (key, level, id) => PlexusModel.lesion(key, level).severity.get(id) || 'none';
const expectSev = (key, level, want, ids) => ids.forEach(id => assert.strictEqual(sev(key, level, id), want, `${key}/${level} ${id}`));
const ALL_NODES = new Set(PlexusModel.LINKS.flat());

check('每条根到每条神经的路径唯一', () => {
  const out = {};
  PlexusModel.LINKS.forEach(([a, b]) => (out[a] = out[a] || []).push(b));
  const count = (a, b) => a === b ? 1 : (out[a] || []).reduce((s, x) => s + count(x, b), 0);
  for (const [nerve, roots] of Object.entries(PlexusModel.COMPOSITION))
    for (const r of roots) assert.strictEqual(count(r, nerve), 1, `${r} → ${nerve}`);
});

check('分支的节段是母神经节段的子集', () => {
  for (const [nerve, roots] of Object.entries(PlexusModel.COMPOSITION))
    for (const p of PlexusModel.parentsOf(nerve)) {
      if (!(p in PlexusModel.COMPOSITION)) continue;
      for (const r of roots) assert(PlexusModel.COMPOSITION[p].includes(r), `${nerve} 的 ${r} 不在母神经 ${p} 里`);
    }
});

check('靶区引用的神经与节段都能走通', () => {
  for (const t of PlexusModel.ZONES) for (const f of t.fibers) for (const r of f.roots) {
    assert(PlexusModel.pathOf(r, f.nerve), `${t.id}: ${r} 到不了 ${f.nerve}`);
    assert(PlexusModel.rootsOf(f.nerve).includes(r), `${t.id}: ${f.nerve} 不含 ${r}`);
  }
});

check('页面节点、连线、损伤按钮都与模型对应', () => {
  assert.strictEqual(set(NODES.map(x => x.id)), set(ALL_NODES), '节点与模型拓扑不一致');
  assert.strictEqual(set(EDGES.map(e => e.from + '>' + e.to)), set(PlexusModel.LINKS.map(([a, b]) => a + '>' + b)));
  assert.strictEqual(set(Object.keys(SPATIAL)), set(ALL_NODES), '有节点缺少空间位置说明');
  const lesions = [...html.matchAll(/data-lesion="(\w+)"/g)].map(m => m[1]);
  assert.strictEqual(set(lesions), set(Object.keys(PlexusModel.LESION_PRESETS)), '损伤按钮与模型不一致');
  for (const id of Object.keys(CLINICAL)) assert(ALL_NODES.has(id), `临床卡片 ${id} 没有对应节点`);
});

check('每个损伤部位都有说明文字，默认部位存在', () => {
  for (const [key, preset] of Object.entries(PlexusModel.LESION_PRESETS)) {
    assert(LESIONS[key], `损伤 ${key} 缺少说明`);
    assert(preset.levels.some(l => l.key === preset.defaultLevel), `${key} 的默认部位不存在`);
    assert.strictEqual(set(Object.keys(LESIONS[key].levels)), set(preset.levels.map(l => l.key)), `${key} 的部位与说明不对应`);
    for (const T of Object.values(LESIONS[key].levels))
      for (const f of ['segments', 'motor', 'sensory', 'clinical']) assert(T[f], `${key} 缺少 ${f}`);
  }
});

check('上肢图分区与模型靶区一一对应', () => {
  const all = Object.entries(LIMB_ZONES).flatMap(([kind, zs]) => zs.map(z => ({ ...z, kind })));
  assert.strictEqual(set(new Set(all.map(z => z.id))), set(PlexusModel.ZONES.map(t => t.id)), '分区与靶区不一致');
  for (const z of all) {
    assert.strictEqual(PlexusModel.zone(z.id).kind, z.kind, `${z.id} 放错了图层`);
    assert(['a', 'p'].includes(z.v) && z.d && z.t && z.lab.length === 3, `${z.id} 的分区数据不完整`);
  }
});

check('题库引用的节点、损伤部位都存在，反向题有确定答案', () => {
  for (const q of QUIZ_BANK) {
    if (q.answerNode) { assert(ALL_NODES.has(q.answerNode), `自测题目标 ${q.answerNode} 不存在`); continue; }
    const { key: lesion, level, mode } = q.lesion;
    assert(PlexusModel.LESION_PRESETS[lesion].levels.some(l => l.key === level), `反向题 ${lesion}/${level} 不存在`);
    assert(LIMB_ZONES[mode], `反向题图层 ${mode} 不存在`);
  }
  const qs = [...QUIZ_BANK, ...CASES].map(q => q.q);
  assert.strictEqual(new Set(qs).size, qs.length, '有重复题干');
});

check('病例题的描述与模型推出的损伤一致', () => {
  for (const c of CASES) {
    assert(ALL_NODES.has(c.answerNode), `病例答案 ${c.answerNode} 不存在`);
    const L = PlexusModel.lesionAt([c.answerNode]);
    const got = id => L.severity.get(id) || 'none';
    for (const want of ['full', 'partial', 'none'])
      for (const id of c.expect[want] || []) {
        assert(PlexusModel.zone(id), `病例 ${c.answerNode} 引用了不存在的靶区 ${id}`);
        assert.strictEqual(got(id), want, `病例 ${c.answerNode}：${id} 应为 ${want}`);
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
      const route = PlexusModel.traceZone(q.subject).nodes;
      assert.strictEqual(ids.filter(id => route.has(id)).length, 1, `${q.key} 有不止一个选项在支配通路上`);
    } else {
      const L = PlexusModel.lesionAt([q.subject]);
      assert.strictEqual(ids.filter(id => L.severity.has(id)).length, 1, `${q.key} 有不止一个选项受累`);
    }
  }
});

check('搜索别名指向存在的结构或损伤', () => {
  for (const a of SEARCH_ALIASES) {
    const x = a.action;
    if (x.lesion) assert(PlexusModel.LESION_PRESETS[x.lesion] && (!x.level || PlexusModel.LESION_PRESETS[x.lesion].levels.some(l => l.key === x.level)), a.label);
    else if (x.node) assert(ALL_NODES.has(x.node), a.label);
    else assert(PlexusModel.zone(x.zone), a.label);
  }
});

check('溯源只走真实纤维路径', () => {
  const roots = id => PlexusModel.ROOTS.filter(r => PlexusModel.trace(id).upNodes.has(r)).join(',');
  assert.strictEqual(roots('axillary'), 'c5,c6');
  assert.strictEqual(roots('thoracodorsal'), 'c6,c7,c8');
  assert.strictEqual(roots('median'), 'c6,c7,c8,t1');
  assert.strictEqual(roots('ulnar'), 'c8,t1');
  assert.strictEqual(roots('radial'), 'c5,c6,c7,c8,t1');
  assert.strictEqual(roots('lower_subscapular'), 'c5,c6');
  assert.strictEqual(roots('med_cut_forearm'), 'c8,t1');
  assert.strictEqual(roots('pin'), 'c6,c7,c8');
  assert.strictEqual(roots('ain'), 'c8,t1');
  assert(!PlexusModel.trace('axillary').upNodes.has('low_post'));
  assert(PlexusModel.trace('median').upEdges.has('up_ant>lat_cord') && !PlexusModel.trace('median').upEdges.has('c5>upper_trunk'));
  assert(!PlexusModel.trace('c7').downNodes.has('axillary') && !PlexusModel.trace('c7').downNodes.has('ulnar'));
  assert(PlexusModel.trace('ain').upEdges.has('med_cord>median') && !PlexusModel.trace('ain').upEdges.has('lat_cord>median'));
  assert.strictEqual(set(PlexusModel.traceZone('m_thenar').nodes), set(['c8', 't1', 'lower_trunk', 'low_ant', 'med_cord', 'median']));
});

check('节段标签由模型推导', () => {
  assert.strictEqual(PlexusModel.segLabel('axillary'), 'C5–C6');
  assert.strictEqual(PlexusModel.segLabel('post_cord'), 'C5–T1');
  assert.strictEqual(PlexusModel.segLabel('middle_trunk'), 'C7');
  assert.strictEqual(PlexusModel.segLabel('med_cord'), 'C8–T1');
  assert.strictEqual(PlexusModel.segLabel('long_thoracic'), 'C5–C7');
});

check('次要节段（正中神经的 C5）：单独标成「部分」，不进主通路和损伤推导', () => {
  assert.strictEqual(PlexusModel.segLabel('median'), '(C5) C6–T1');
  const t = PlexusModel.trace('median');
  assert.strictEqual(set(t.minorNodes), set(['c5']));
  assert.strictEqual(set(t.minorEdges), set(['c5>upper_trunk']));
  assert(!t.nodes.has('c5'));
  const c5 = PlexusModel.trace('c5');
  assert(c5.minorNodes.has('median') && c5.minorEdges.has('lat_cord>median') && !c5.nodes.has('median'));
  assert.strictEqual(PlexusModel.trace('radial').minorNodes.size, 0);
  assert(!PlexusModel.lesionAt(['c5']).severity.has('m_pronator'));
});

check('口诀 ULTRA / M4U：后束、内侧束的分支齐全', () => {
  const out = id => set(PlexusModel.childrenOf(id));
  assert.strictEqual(out('post_cord'), set(['upper_subscapular', 'lower_subscapular', 'thoracodorsal', 'radial', 'axillary']));
  assert.strictEqual(out('med_cord'), set(['med_pectoral', 'med_cut_arm', 'med_cut_forearm', 'median', 'ulnar']));
  assert.strictEqual(out('upper_trunk'), set(['up_ant', 'up_post', 'suprascapular', 'subclavius_n']));
});

check('Erb（上干）：肩外展全瘫、屈肘部分保留 C7，菱形肌、前锯肌与手不受累，无 Horner', () => {
  expectSev('erb', 'trunk', 'full', ['m_deltoid', 'm_teres_minor', 'm_rotator', 'm_biceps', 's_axil', 's_lat_forearm', 'd_c5', 'd_c6']);
  expectSev('erb', 'trunk', 'partial', ['m_brachialis', 'm_brachiorad', 'm_triceps', 'm_flexor_med']);
  expectSev('erb', 'trunk', 'none', ['m_thenar', 'm_hypothenar', 'm_flexor_uln', 'm_serratus', 'm_rhomboid', 'm_ext_digits', 's_med_arm', 'd_c8']);
  const L = PlexusModel.lesion('erb');
  assert.strictEqual(L.level, 'trunk');
  assert(!L.horner && !L.preganglionic);
});

check('C5–C6 根性撕脱：比上干损伤多出菱形肌、前锯肌；仍无 Horner', () => {
  expectSev('erb', 'root', 'full', ['m_deltoid', 'm_rhomboid', 'd_c5', 'd_c6']);
  expectSev('erb', 'root', 'partial', ['m_serratus', 'm_brachialis']);
  const L = PlexusModel.lesion('erb', 'root');
  assert(L.preganglionic && !L.horner);
  assert.strictEqual(set(L.marked), 'c5,c6');
});

check('Klumpke：下干损伤无 Horner，C8–T1 根性撕脱才有', () => {
  for (const level of ['trunk', 'root']) {
    expectSev('klumpke', level, 'full', ['m_thenar', 'm_hypothenar', 'm_interossei', 'm_flexor_uln', 'm_pq', 's_med_arm', 's_med_forearm', 's_fingers_uln', 'd_c8', 'd_t1']);
    expectSev('klumpke', level, 'none', ['m_deltoid', 'm_biceps', 'm_rotator', 's_axil', 'd_c5']);
  }
  assert(!PlexusModel.lesion('klumpke', 'trunk').horner && !PlexusModel.lesion('klumpke', 'trunk').preganglionic);
  assert(PlexusModel.lesion('klumpke', 'root').horner && PlexusModel.lesion('klumpke', 'root').preganglionic);
});

check('桡神经：腋部累及肱三头肌；桡神经沟垂腕；骨间后神经只垂指、无感觉障碍', () => {
  expectSev('radial', 'axilla', 'full', ['m_triceps', 'm_anconeus', 'm_brachiorad', 'm_supinator', 'm_ext_digits', 's_rad_arm', 's_rad_hand']);
  expectSev('radial', 'groove', 'full', ['m_brachiorad', 'm_supinator', 'm_ext_digits', 's_rad_hand']);
  expectSev('radial', 'groove', 'none', ['m_triceps', 'm_anconeus', 's_rad_arm']);
  expectSev('radial', 'groove', 'partial', ['m_brachialis']);
  expectSev('radial', 'groove', 'none', ['m_biceps']);
  assert(PlexusModel.lesion('radial', 'groove').spared.includes('m_triceps'));
  assert.strictEqual(set(PlexusModel.lesion('radial', 'pin').severity.keys()), 'm_ext_digits');
  const pin = PlexusModel.lesion('radial', 'pin');
  assert(pin.involvesSubbranch && pin.spared.includes('m_brachiorad') && pin.spared.includes('s_rad_hand') && pin.spared.includes('m_supinator'));
  assert.strictEqual(PlexusModel.lesion('radial').level, 'groove');
});

check('肱二头肌与肱肌分开：桡神经只与肱肌下外侧小部分有关，且标为「部分参与」', () => {
  assert(!PlexusModel.zonesFor('radial').has('m_biceps'), '桡神经不应关联肱二头肌');
  assert(PlexusModel.zonesFor('radial').has('m_brachialis'));
  assert.strictEqual(PlexusModel.relation('m_brachialis', 'radial'), 'part');
  assert.strictEqual(PlexusModel.relation('m_brachialis', 'c7'), 'part');
  assert.strictEqual(PlexusModel.relation('m_brachialis', 'musculocutaneous'), 'main');
  assert.strictEqual(PlexusModel.relation('m_biceps', 'musculocutaneous'), 'main');
  assert.strictEqual(PlexusModel.relation('m_biceps', 'radial'), null);
  assert.strictEqual(PlexusModel.relation('m_triceps', 'radial'), 'main');
  // 「部分受累」能说清断了哪条、留了哪条
  const d = PlexusModel.lesion('radial', 'groove').detail.get('m_brachialis');
  assert.deepStrictEqual(d.hit.map(f => f.nerve), ['radial']);
  assert.deepStrictEqual(d.kept.map(f => f.nerve), ['musculocutaneous']);
  assert(d.hit[0].part, '桡神经到肱肌的纤维应带「部分」说明');
  // 骨间后神经平面：肱肌的桡神经分支在近端已分出
  assert(PlexusModel.lesion('radial', 'pin').spared.includes('m_brachialis'));
  for (const L of [PlexusModel.lesion('erb'), PlexusModel.lesion('radial', 'axilla'), PlexusModel.lesionAt(['c7'])])
    for (const [id, s] of L.severity) if (s === 'partial') assert(L.detail.get(id).kept.length, `${id} 部分受累却没有保留的纤维`);
});

check('损伤名称：父级按解剖类别命名，不用单一体征概括全部部位', () => {
  for (const [key, L] of Object.entries(LESIONS)) {
    assert(/损伤$/.test(L.title), `${key} 的标题应是解剖类别：${L.title}`);
    for (const sign of ['垂腕', '猿手', '爪形手', '方肩', '翼状肩胛']) assert(!L.title.includes(sign), `${key} 标题含体征 ${sign}`);
  }
  const pills = [...html.matchAll(/data-lesion="(\w+)"[^>]*>([^<]+)</g)];
  for (const [, key, text] of pills) assert(LESIONS[key].title.startsWith(text), `按钮「${text}」与标题「${LESIONS[key].title}」不一致`);
});

check('正中神经：腕管保留手掌感觉与前臂屈肌；骨间前神经只累及深屈肌与旋前方肌；高位全部受累', () => {
  assert.strictEqual(set(PlexusModel.lesion('median', 'carpal').severity.keys()), set(['m_thenar', 'm_lumb_lat', 's_fingers_med', 's_med_tips']));
  const carpal = PlexusModel.lesion('median', 'carpal');
  for (const id of ['s_palm_cut', 'm_flexor_med', 'm_palmaris', 'm_ain', 'm_pq']) assert(carpal.spared.includes(id), id);
  assert.strictEqual(set(PlexusModel.lesion('median', 'ain').severity.keys()), set(['m_ain', 'm_pq']));
  assert(PlexusModel.lesion('median', 'ain').spared.includes('m_thenar'));
  expectSev('median', 'high', 'full', ['m_pronator', 'm_flexor_med', 'm_palmaris', 'm_ain', 'm_pq', 'm_thenar', 'm_lumb_lat', 's_palm_cut', 's_fingers_med']);
  assert.strictEqual(PlexusModel.lesion('median').level, 'carpal');
});

check('尺神经：肘部累及指深屈肌与手背/手掌感觉；腕部（默认）只累及手内在肌与 1.5 指掌面', () => {
  expectSev('ulnar', 'elbow', 'full', ['m_flexor_uln', 'm_hypothenar', 'm_interossei', 'm_adductor', 'm_lumb_med', 's_hypo_palm', 's_fingers_uln', 's_uln_back']);
  assert.strictEqual(set(PlexusModel.lesion('ulnar', 'wrist').severity.keys()),
    set(['m_hypothenar', 'm_interossei', 'm_adductor', 'm_lumb_med', 's_fingers_uln']));
  assert.strictEqual(set(PlexusModel.lesion('ulnar', 'wrist').spared), set(['m_flexor_uln', 's_hypo_palm', 's_uln_back']));
  assert.strictEqual(PlexusModel.lesion('ulnar').level, 'wrist');
});

check('新增部位：前臂中段、桡浅支、肌皮神经各平面', () => {
  // 正中神经前臂中段：比腕管多丢手掌桡侧感觉；前臂屈肌和骨间前神经保留
  assert.strictEqual(set(PlexusModel.lesion('median', 'forearm').severity.keys()), set(['m_thenar', 'm_lumb_lat', 's_fingers_med', 's_med_tips', 's_palm_cut']));
  for (const id of ['m_pronator', 'm_flexor_med', 'm_palmaris', 'm_ain', 'm_pq']) assert(PlexusModel.lesion('median', 'forearm').spared.includes(id), id);
  // 尺神经前臂中段：比腕部多丢手背尺侧和手掌尺侧感觉；尺侧腕屈肌/指深屈肌保留
  assert.strictEqual(set(PlexusModel.lesion('ulnar', 'forearm').severity.keys()),
    set(['m_hypothenar', 'm_interossei', 'm_adductor', 'm_lumb_med', 's_fingers_uln', 's_hypo_palm', 's_uln_back']));
  assert.deepStrictEqual(PlexusModel.lesion('ulnar', 'forearm').spared, ['m_flexor_uln']);
  // 桡浅支：只有感觉障碍
  assert.strictEqual(set(PlexusModel.lesion('radial', 'srn').severity.keys()), 's_rad_hand');
  assert(PlexusModel.lesion('radial', 'srn').spared.includes('m_ext_digits'));
  // 肌皮神经：近端全部受累 → 穿喙肱肌后保留喙肱肌 → 肘部只剩前臂外侧感觉
  expectSev('musculocutaneous', 'proximal', 'full', ['m_coraco', 'm_biceps', 's_lat_forearm']);
  expectSev('musculocutaneous', 'proximal', 'partial', ['m_brachialis']);
  expectSev('musculocutaneous', 'arm', 'none', ['m_coraco']);
  expectSev('musculocutaneous', 'arm', 'full', ['m_biceps', 's_lat_forearm']);
  assert.strictEqual(set(PlexusModel.lesion('musculocutaneous', 'elbow').severity.keys()), 's_lat_forearm');
});

check('同一神经上的部位按近端→远端排列，越远受累越少', () => {
  for (const [key, preset] of Object.entries(PlexusModel.LESION_PRESETS)) {
    const chain = preset.levels.filter(l => l.plane != null && l.sites.join() === preset.levels.find(x => x.plane != null)?.sites.join());
    for (let i = 1; i < chain.length; i++) {
      assert(chain[i].plane > chain[i - 1].plane, `${key}：${chain[i].key} 应在 ${chain[i - 1].key} 远端`);
      const a = PlexusModel.lesion(key, chain[i - 1].key).severity, b = PlexusModel.lesion(key, chain[i].key).severity;
      for (const id of b.keys()) assert(a.has(id), `${key}/${chain[i].key} 的 ${id} 在更近端的 ${chain[i - 1].key} 反而不受累`);
    }
  }
});

check('腋神经、胸长神经', () => {
  assert.strictEqual(set(PlexusModel.lesion('axillary').severity.keys()), set(['m_deltoid', 'm_teres_minor', 's_axil']));
  assert.strictEqual(set(PlexusModel.lesion('long_thoracic').severity.keys()), 'm_serratus');
});

check('周围神经和束的损伤不按皮节高亮', () => {
  for (const [key, preset] of Object.entries(PlexusModel.LESION_PRESETS)) for (const l of preset.levels) {
    const L = PlexusModel.lesion(key, l.key);
    if (L.isNerve) assert(![...L.severity.keys()].some(id => id.startsWith('d_')), `${key}/${l.key}`);
  }
  for (const id of ['lat_cord', 'post_cord', 'med_cord', 'up_post'])
    assert(![...PlexusModel.lesionAt([id]).severity.keys()].some(k => k.startsWith('d_')), id);
});

check('自由切断：lesionAt 与预设结果一致，可叠加多个切断点', () => {
  for (const [key, preset] of Object.entries(PlexusModel.LESION_PRESETS)) for (const l of preset.levels) {
    const a = PlexusModel.lesion(key, l.key), b = PlexusModel.lesionAt(l.sites, { plane: l.plane });
    assert.strictEqual(JSON.stringify([...a.severity]), JSON.stringify([...b.severity]), `${key}/${l.key}`);
  }
  const both = PlexusModel.lesionAt(['lat_cord', 'med_cord']);
  assert.strictEqual(both.severity.get('m_flexor_med'), 'full');
  assert.strictEqual(PlexusModel.lesionAt(['lat_cord']).severity.get('m_flexor_med'), 'partial');
  assert.strictEqual(PlexusModel.lesionAt([]).severity.size, 0);
});

console.log(`通过 ${n} 组校验`);
