// 校验 brachial_plexus.html 内嵌的纤维路由模型，以及页面数据与模型是否对应。
// 用法：node tests/check-model.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PAGE = 'brachial_plexus.html';
const BLOCK_RE = /\/\/ ===== PLEXUS-MODEL:BEGIN =====[\s\S]*?\/\/ ===== PLEXUS-MODEL:END =====\n/;
const page = fs.readFileSync(path.join(__dirname, '..', PAGE), 'utf8');
assert(BLOCK_RE.test(page), `${PAGE} 中找不到模型区块`);
const source = page.match(BLOCK_RE)[0];
const body = page.replace(BLOCK_RE, '');

const M = new Function(source + '; return PlexusModel;')();
// 页面里的纯数据（上肢图分区、损伤文字、题库）
const dataSrc = body.match(/\/\/ =+ 右侧上肢图 =+[\s\S]*?(?=const nodeMap = )/);
assert(dataSrc, '找不到上肢图 / 损伤文字 / 题库数据区');
const D = new Function(dataSrc[0] + '; return { LIMB_ZONES, LESIONS, QUIZ_BANK };')();

const set = s => [...s].sort().join(',');
let n = 0;
const check = (name, fn) => { fn(); n++; };
const sev = (key, level, id) => M.lesion(key, level).severity.get(id) || 'none';
const expectSev = (key, level, want, ids) => ids.forEach(id => assert.strictEqual(sev(key, level, id), want, `${key}/${level} ${id}`));

check('每条根到每条神经的路径唯一', () => {
  const out = {};
  M.LINKS.forEach(([a, b]) => (out[a] = out[a] || []).push(b));
  const count = (a, b) => a === b ? 1 : (out[a] || []).reduce((s, x) => s + count(x, b), 0);
  for (const [nerve, roots] of Object.entries(M.COMPOSITION))
    for (const r of roots) assert.strictEqual(count(r, nerve), 1, `${r} → ${nerve}`);
});

check('靶区引用的神经与节段都能走通', () => {
  for (const t of M.TARGETS) for (const f of t.fibers) for (const r of f.roots) {
    assert(M.pathOf(r, f.nerve), `${t.id}: ${r} 到不了 ${f.nerve}`);
    assert(M.rootsOf(f.nerve).includes(r), `${t.id}: ${f.nerve} 不含 ${r}`);
  }
});

check('页面里的连线、节点、3D 坐标、损伤按钮都与模型对应', () => {
  const ids = re => [...body.matchAll(re)].map(m => m[1]);
  const edges = [...body.matchAll(/\{ from: '(\w+)', to: '(\w+)'/g)].map(m => m[1] + '>' + m[2]);
  assert.strictEqual(set(edges), set(M.LINKS.map(([a, b]) => a + '>' + b)), '页面连线与模型拓扑不一致');
  const nodes = ids(/\{ id: '(\w+)', stage:/g);
  assert.strictEqual(set(nodes), set(new Set(M.LINKS.flat())), '页面节点与模型拓扑不一致');
  assert.strictEqual(set(ids(/^  (\w+): \{ x: /gm)), set(nodes), '有节点缺少 3D 坐标');
  const lesions = ids(/data-lesion="(\w+)"/g);
  assert.strictEqual(set(lesions), set(Object.keys(M.LESION_SITES)), '损伤按钮与模型不一致');
  assert(!/getAncestors|getDescendants/.test(body), '仍在用旧的连通性遍历');
});

check('每个损伤部位都有说明文字，默认部位存在', () => {
  for (const [key, def] of Object.entries(M.LESION_SITES)) {
    assert(D.LESIONS[key], `损伤 ${key} 缺少说明`);
    assert(def.levels.some(l => l.key === def.def), `${key} 的默认部位不存在`);
    assert.strictEqual(set(Object.keys(D.LESIONS[key].levels)), set(def.levels.map(l => l.key)), `${key} 的部位与说明不对应`);
    for (const T of Object.values(D.LESIONS[key].levels))
      for (const f of ['segments', 'motor', 'sensory', 'clinical']) assert(T[f], `${key} 缺少 ${f}`);
  }
});

check('上肢图分区与模型靶区一一对应', () => {
  const all = Object.entries(D.LIMB_ZONES).flatMap(([kind, zs]) => zs.map(z => ({ ...z, kind })));
  assert.strictEqual(set(new Set(all.map(z => z.id))), set(M.TARGETS.map(t => t.id)), '分区与靶区不一致');
  for (const z of all) {
    assert.strictEqual(M.target(z.id).kind, z.kind, `${z.id} 放错了图层`);
    assert(['a', 'p'].includes(z.v) && z.d && z.t && z.lab.length === 3, `${z.id} 的分区数据不完整`);
  }
});

check('题库引用的节点、损伤部位都存在，反向题有确定答案', () => {
  const nodes = new Set(M.LINKS.flat());
  for (const q of D.QUIZ_BANK) {
    if (q.target) { assert(nodes.has(q.target), `自测题目标 ${q.target} 不存在`); continue; }
    const { lesion, level, mode } = q.zones;
    assert(M.LESION_SITES[lesion].levels.some(l => l.key === level), `反向题 ${lesion}/${level} 不存在`);
    assert(D.LIMB_ZONES[mode], `反向题图层 ${mode} 不存在`);
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
  assert(!M.trace('axillary').upNodes.has('low_post'));
  assert(M.trace('median').upEdges.has('up_ant>lat_cord') && !M.trace('median').upEdges.has('c5>upper_trunk'));
  assert(!M.trace('c7').downNodes.has('axillary') && !M.trace('c7').downNodes.has('ulnar'));
  assert.strictEqual(set(M.traceTarget('m_thenar').nodes), set(['c8', 't1', 'lower_trunk', 'low_ant', 'med_cord', 'median']));
});

check('节段标签由模型推导', () => {
  assert.strictEqual(M.segLabel('axillary'), 'C5–C6');
  assert.strictEqual(M.segLabel('post_cord'), 'C5–T1');
  assert.strictEqual(M.segLabel('middle_trunk'), 'C7');
  assert.strictEqual(M.segLabel('med_cord'), 'C8–T1');
  assert.strictEqual(M.segLabel('long_thoracic'), 'C5–C7');
});

check('口诀 ULTRA / M4U：后束、内侧束的分支齐全', () => {
  const out = id => set(M.LINKS.filter(([a]) => a === id).map(([, b]) => b));
  assert.strictEqual(out('post_cord'), set(['upper_subscapular', 'lower_subscapular', 'thoracodorsal', 'radial', 'axillary']));
  assert.strictEqual(out('med_cord'), set(['med_pectoral', 'med_cut_arm', 'med_cut_forearm', 'median', 'ulnar']));
  assert.strictEqual(out('upper_trunk'), set(['up_ant', 'up_post', 'suprascapular', 'subclavius_n']));
});

check('Erb（上干）：肩外展/屈肘全瘫，菱形肌、前锯肌、肱三头肌与手不受累，无 Horner', () => {
  expectSev('erb', 'trunk', 'full', ['m_deltoid', 'm_rotator', 'm_biceps', 'm_brachiorad', 's_axil', 's_lat_forearm', 'd_c5', 'd_c6']);
  expectSev('erb', 'trunk', 'none', ['m_triceps', 'm_thenar', 'm_hypothenar', 'm_flexor_uln', 'm_serratus', 'm_rhomboid', 'm_ext_digits', 's_med_arm', 'd_c8']);
  const L = M.lesion('erb');
  assert.strictEqual(L.level, 'trunk');
  assert(!L.horner && !L.preganglionic);
});

check('C5–C6 根性撕脱：比上干损伤多出菱形肌、前锯肌；仍无 Horner', () => {
  expectSev('erb', 'root', 'full', ['m_deltoid', 'm_biceps', 'm_rhomboid', 'd_c5', 'd_c6']);
  expectSev('erb', 'root', 'partial', ['m_serratus']);
  const L = M.lesion('erb', 'root');
  assert(L.preganglionic && !L.horner);
  assert.strictEqual(set(L.sites), 'c5,c6');
});

check('Klumpke：下干损伤无 Horner，C8–T1 根性撕脱才有', () => {
  for (const level of ['trunk', 'root']) {
    expectSev('klumpke', level, 'full', ['m_thenar', 'm_hypothenar', 'm_interossei', 'm_flexor_uln', 's_med_arm', 's_med_forearm', 's_fingers_uln', 'd_c8', 'd_t1']);
    expectSev('klumpke', level, 'none', ['m_deltoid', 'm_biceps', 'm_rotator', 's_axil', 'd_c5']);
  }
  assert(!M.lesion('klumpke', 'trunk').horner && !M.lesion('klumpke', 'trunk').preganglionic);
  assert(M.lesion('klumpke', 'root').horner && M.lesion('klumpke', 'root').preganglionic);
});

check('桡神经：腋部累及肱三头肌；桡神经沟垂腕；骨间后神经只垂指、无感觉障碍', () => {
  expectSev('radial', 'axilla', 'full', ['m_triceps', 'm_brachiorad', 'm_ext_digits', 's_rad_arm', 's_rad_hand']);
  expectSev('radial', 'groove', 'full', ['m_brachiorad', 'm_ext_digits', 's_rad_hand']);
  expectSev('radial', 'groove', 'none', ['m_triceps', 's_rad_arm']);
  assert(M.lesion('radial', 'groove').spared.includes('m_triceps'));
  assert.strictEqual(set(M.lesion('radial', 'pin').severity.keys()), 'm_ext_digits');
  assert(M.lesion('radial', 'pin').spared.includes('m_brachiorad') && M.lesion('radial', 'pin').spared.includes('s_rad_hand'));
  assert.strictEqual(M.lesion('radial').level, 'groove');
});

check('正中神经：腕管保留手掌感觉与前臂屈肌；骨间前神经只累及深屈肌；高位全部受累', () => {
  assert.strictEqual(set(M.lesion('median', 'carpal').severity.keys()), set(['m_thenar', 'm_lumb_lat', 's_fingers_med', 's_med_tips']));
  assert(M.lesion('median', 'carpal').spared.includes('s_palm_cut'));
  assert(M.lesion('median', 'carpal').spared.includes('m_flexor_med'));
  assert.strictEqual(set(M.lesion('median', 'ain').severity.keys()), 'm_ain');
  expectSev('median', 'high', 'full', ['m_pronator', 'm_flexor_med', 'm_ain', 'm_thenar', 'm_lumb_lat', 's_palm_cut', 's_fingers_med']);
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
  assert.strictEqual(set(M.lesion('axillary').severity.keys()), set(['m_deltoid', 's_axil']));
  assert.strictEqual(set(M.lesion('long_thoracic').severity.keys()), 'm_serratus');
});

check('周围神经损伤不按皮节高亮', () => {
  for (const [key, def] of Object.entries(M.LESION_SITES)) for (const l of def.levels) {
    const L = M.lesion(key, l.key);
    if (L.isNerve) assert(![...L.severity.keys()].some(id => id.startsWith('d_')), `${key}/${l.key}`);
  }
});

console.log(`通过 ${n} 组校验`);
