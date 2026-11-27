// 纤维路由模型：节段、溯源高亮、损伤受累范围都由这里推导，页面其他地方不再手写这些关系。
// 这是唯一的数据源；修改后运行 `node tests/check-model.mjs` 校验。
// 纯逻辑，不碰 DOM，浏览器和 Node 都能直接 import。
export const PlexusModel = (() => {
  const ROOTS = ['c5', 'c6', 'c7', 'c8', 't1'];
  const TRUNKS = ['upper_trunk', 'middle_trunk', 'lower_trunk'];

  // 拓扑：谁发出谁。一条边存在，不代表每条根的纤维都走这条边。
  const LINKS = [
    ['c5', 'upper_trunk'], ['c6', 'upper_trunk'], ['c7', 'middle_trunk'], ['c8', 'lower_trunk'], ['t1', 'lower_trunk'],
    ['upper_trunk', 'up_ant'], ['upper_trunk', 'up_post'], ['middle_trunk', 'mid_ant'], ['middle_trunk', 'mid_post'],
    ['lower_trunk', 'low_post'], ['lower_trunk', 'low_ant'],
    ['up_ant', 'lat_cord'], ['mid_ant', 'lat_cord'], ['up_post', 'post_cord'], ['mid_post', 'post_cord'],
    ['low_post', 'post_cord'], ['low_ant', 'med_cord'],
    ['lat_cord', 'musculocutaneous'], ['lat_cord', 'median'], ['post_cord', 'axillary'], ['post_cord', 'radial'],
    ['med_cord', 'median'], ['med_cord', 'ulnar'],
    ['c5', 'dorsal_scapular'], ['c5', 'long_thoracic'], ['c6', 'long_thoracic'], ['c7', 'long_thoracic'],
    ['upper_trunk', 'suprascapular'], ['upper_trunk', 'subclavius_n'],
    ['lat_cord', 'lat_pectoral'],
    ['post_cord', 'upper_subscapular'], ['post_cord', 'thoracodorsal'], ['post_cord', 'lower_subscapular'],
    ['med_cord', 'med_pectoral'], ['med_cord', 'med_cut_arm'], ['med_cord', 'med_cut_forearm'],
    // 前臂的具名分支
    ['radial', 'pin'], ['radial', 'srn'], ['median', 'ain'],
  ];

  // 各神经实际含有的节段（纤维成分）。未列出的中间结构（干/股/束）= 所有能到达它的根。
  const COMPOSITION = {
    musculocutaneous: ['c5', 'c6', 'c7'],
    axillary: ['c5', 'c6'],
    radial: ['c5', 'c6', 'c7', 'c8', 't1'],
    median: ['c6', 'c7', 'c8', 't1'],
    ulnar: ['c8', 't1'],
    dorsal_scapular: ['c5'],
    long_thoracic: ['c5', 'c6', 'c7'],
    suprascapular: ['c5', 'c6'],
    subclavius_n: ['c5', 'c6'],
    lat_pectoral: ['c5', 'c6', 'c7'],
    upper_subscapular: ['c5', 'c6'],
    thoracodorsal: ['c6', 'c7', 'c8'],
    lower_subscapular: ['c5', 'c6'],
    med_pectoral: ['c8', 't1'],
    med_cut_arm: ['c8', 't1'],
    med_cut_forearm: ['c8', 't1'],
    pin: ['c6', 'c7', 'c8'],
    srn: ['c6', 'c7', 'c8'],
    ain: ['c8', 't1'],
  };

  // 次要/变异参与的节段：不计入主要成分（不参与损伤推导），通路图上画成「部分」（虚线），节段写成「(C5) C6–T1」
  const MINOR = { median: ['c5'] };

  // 具名分支从母神经上分出的平面（plane 的含义见下方 ZONES 注释）
  const SUBBRANCH_PLANE = { pin: 2, srn: 2, ain: 2 };

  // 支配靶区（id 与页面里的图形区域一一对应）。
  // F(神经, 主要节段, 分出平面 plane)
  // plane：0 腋窝/起始处 · 0.5 上臂近段（穿喙肱肌后）· 1 上臂 · 1.5 肘 · 2 肘/前臂近端 · 2.5 前臂近段（旋后肌以远）·
  //        2.6 前臂中段 · 2.8 前臂远端（腕的近侧）· 3 腕 · 4 手
  // 节段取常用教材值（Moore、Prometheus）；教材间常相差约一个节段。
  // part：这条纤维只支配该肌的一部分（如桡神经只管肱肌外侧小部分）。有 part 的纤维算「部分参与」，
  // 页面上与主要支配分开表达。
  const F = (nerve, roots, plane = 0, part = '') => ({ nerve, roots: roots.split(' '), plane, part });
  const ZONES = [
    { id: 'm_deltoid', kind: 'motor', name: '三角肌', fibers: [F('axillary', 'c5 c6')] },
    { id: 'm_teres_minor', kind: 'motor', name: '小圆肌', fibers: [F('axillary', 'c5 c6')] },
    { id: 'm_subclavius', kind: 'motor', name: '锁骨下肌', fibers: [F('subclavius_n', 'c5 c6')] },
    { id: 'm_pec', kind: 'motor', name: '胸大肌/胸小肌', fibers: [F('lat_pectoral', 'c5 c6 c7'), F('med_pectoral', 'c8 t1')] },
    { id: 'm_serratus', kind: 'motor', name: '前锯肌', fibers: [F('long_thoracic', 'c5 c6 c7')] },
    { id: 'm_coraco', kind: 'motor', name: '喙肱肌', fibers: [F('musculocutaneous', 'c6 c7')] },
    { id: 'm_biceps', kind: 'motor', name: '肱二头肌', fibers: [F('musculocutaneous', 'c5 c6', 1)] },
    // 肱肌主要由肌皮神经支配；下外侧一小部分有桡神经（C7）分支进入（Frazer 2007，个体间有差异）。
    // 与肱二头肌分开建模：桡神经与肱二头肌没有支配关系。
    { id: 'm_brachialis', kind: 'motor', name: '肱肌', fibers: [F('musculocutaneous', 'c5 c6', 1), F('radial', 'c7', 1, '下外侧小部分')] },
    { id: 'm_pronator', kind: 'motor', name: '旋前圆肌', fibers: [F('median', 'c6 c7', 2)] },
    { id: 'm_flexor_med', kind: 'motor', name: '桡侧腕屈肌/指浅屈肌', fibers: [F('median', 'c6 c7 c8 t1', 2)] },
    { id: 'm_palmaris', kind: 'motor', name: '掌长肌', fibers: [F('median', 'c7 c8', 2)] },
    { id: 'm_ain', kind: 'motor', name: '拇长屈肌/示指深屈肌', fibers: [F('ain', 'c8 t1', 2.5)] },
    { id: 'm_pq', kind: 'motor', name: '旋前方肌', fibers: [F('ain', 'c8 t1', 2.8)] },
    { id: 'm_flexor_uln', kind: 'motor', name: '尺侧腕屈肌/环小指深屈肌', fibers: [F('ulnar', 'c8 t1', 2)] },
    { id: 'm_thenar', kind: 'motor', name: '大鱼际肌', fibers: [F('median', 'c8 t1', 4)] },
    { id: 'm_lumb_lat', kind: 'motor', name: '第1–2蚓状肌', fibers: [F('median', 'c8 t1', 4)] },
    { id: 'm_adductor', kind: 'motor', name: '拇收肌', fibers: [F('ulnar', 'c8 t1', 4)] },
    { id: 'm_hypothenar', kind: 'motor', name: '小鱼际肌', fibers: [F('ulnar', 'c8 t1', 4)] },
    { id: 'm_lumb_med', kind: 'motor', name: '第3–4蚓状肌', fibers: [F('ulnar', 'c8 t1', 4)] },
    { id: 'm_interossei', kind: 'motor', name: '骨间肌', fibers: [F('ulnar', 'c8 t1', 4)] },
    { id: 'm_rotator', kind: 'motor', name: '冈上/冈下肌', fibers: [F('suprascapular', 'c5 c6')] },
    { id: 'm_rhomboid', kind: 'motor', name: '菱形肌', fibers: [F('dorsal_scapular', 'c5')] },
    { id: 'm_teres_major', kind: 'motor', name: '大圆肌/肩胛下肌', fibers: [F('lower_subscapular', 'c5 c6'), F('upper_subscapular', 'c5 c6')] },
    { id: 'm_latissimus', kind: 'motor', name: '背阔肌', fibers: [F('thoracodorsal', 'c6 c7 c8')] },
    { id: 'm_triceps', kind: 'motor', name: '肱三头肌', fibers: [F('radial', 'c6 c7 c8', 0)] },
    { id: 'm_anconeus', kind: 'motor', name: '肘肌', fibers: [F('radial', 'c7 c8', 0)] },
    { id: 'm_brachiorad', kind: 'motor', name: '肱桡肌/桡侧腕长伸肌', fibers: [F('radial', 'c5 c6 c7', 2)] },
    { id: 'm_supinator', kind: 'motor', name: '旋后肌', fibers: [F('pin', 'c6 c7', 2)] },
    { id: 'm_ext_digits', kind: 'motor', name: '指伸肌/拇伸肌/尺侧腕伸肌', fibers: [F('pin', 'c7 c8', 2.8)] },

    { id: 's_axil', kind: 'cutaneous', name: '肩外侧(腋神经)', fibers: [F('axillary', 'c5 c6')] },
    { id: 's_med_arm', kind: 'cutaneous', name: '臂内侧(臂内侧皮神经)', fibers: [F('med_cut_arm', 'c8 t1')] },
    { id: 's_med_forearm', kind: 'cutaneous', name: '前臂内侧(前臂内侧皮神经)', fibers: [F('med_cut_forearm', 'c8 t1')] },
    { id: 's_lat_forearm', kind: 'cutaneous', name: '前臂外侧(肌皮神经)', fibers: [F('musculocutaneous', 'c5 c6', 2)] },
    { id: 's_palm_cut', kind: 'cutaneous', name: '手掌桡侧(正中·掌皮支)', fibers: [F('median', 'c6 c7', 2.8)] },
    { id: 's_fingers_med', kind: 'cutaneous', name: '桡侧3.5指掌面(正中)', fibers: [F('median', 'c6 c7 c8', 4)] },
    { id: 's_med_tips', kind: 'cutaneous', name: '桡侧3.5指中远节指背(正中)', fibers: [F('median', 'c6 c7 c8', 4)] },
    { id: 's_hypo_palm', kind: 'cutaneous', name: '手掌尺侧(尺·掌皮支)', fibers: [F('ulnar', 'c8 t1', 2.8)] },
    { id: 's_fingers_uln', kind: 'cutaneous', name: '尺侧1.5指掌面(尺)', fibers: [F('ulnar', 'c8 t1', 4)] },
    { id: 's_uln_back', kind: 'cutaneous', name: '手背尺侧2.5指(尺·手背支)', fibers: [F('ulnar', 'c8 t1', 2.8)] },
    { id: 's_rad_arm', kind: 'cutaneous', name: '臂/前臂后侧(桡)', fibers: [F('radial', 'c5 c6 c7 c8', 0)] },
    { id: 's_rad_hand', kind: 'cutaneous', name: '手背桡侧2.5指/虎口(桡·浅支)', fibers: [F('srn', 'c6 c7', 2.8)] },

    { id: 'd_c5', kind: 'dermatome', name: 'C5（肩及臂外侧）', fibers: [F('c5', 'c5')] },
    { id: 'd_c6', kind: 'dermatome', name: 'C6（前臂外侧、拇指）', fibers: [F('c6', 'c6')] },
    { id: 'd_c7', kind: 'dermatome', name: 'C7（中指）', fibers: [F('c7', 'c7')] },
    { id: 'd_c8', kind: 'dermatome', name: 'C8（小指、前臂内侧远端）', fibers: [F('c8', 'c8')] },
    { id: 'd_t1', kind: 'dermatome', name: 'T1（臂内侧、前臂内侧近端）', fibers: [F('t1', 't1')] },
  ];

  // 损伤预设。每个预设有一个或多个可选「部位」：
  //   sites = 被切断的结构（可多个，如 C5+C6 根性撕脱）
  //   plane = 损伤平面：同一神经上在更近端（plane 更小）已分出的分支不受累
  const LESION_PRESETS = {
    erb: { defaultLevel: 'trunk', levels: [
      { key: 'trunk', name: '上干（节后）', sites: ['upper_trunk'] },
      { key: 'root', name: 'C5–C6 根性撕脱（节前）', sites: ['c5', 'c6'] }] },
    klumpke: { defaultLevel: 'trunk', levels: [
      { key: 'trunk', name: '下干（节后）', sites: ['lower_trunk'] },
      { key: 'root', name: 'C8–T1 根性撕脱（节前）', sites: ['c8', 't1'] }] },
    radial: { defaultLevel: 'groove', levels: [
      { key: 'axilla', name: '腋部', sites: ['radial'], plane: 0 },
      { key: 'groove', name: '桡神经沟', sites: ['radial'], plane: 1 },
      { key: 'pin', name: '骨间后神经', sites: ['pin'], plane: 2.5 },
      { key: 'srn', name: '桡浅支', sites: ['srn'] }] },
    median: { defaultLevel: 'carpal', levels: [
      { key: 'high', name: '肘部以上', sites: ['median'], plane: 1 },
      { key: 'ain', name: '骨间前神经', sites: ['ain'] },
      { key: 'forearm', name: '前臂中段', sites: ['median'], plane: 2.6 },
      { key: 'carpal', name: '腕管', sites: ['median'], plane: 3 }] },
    ulnar: { defaultLevel: 'wrist', levels: [
      { key: 'elbow', name: '肘管', sites: ['ulnar'], plane: 2 },
      { key: 'forearm', name: '前臂中段', sites: ['ulnar'], plane: 2.6 },
      { key: 'wrist', name: '腕部 Guyon 管', sites: ['ulnar'], plane: 3 }] },
    axillary: { defaultLevel: 'main', levels: [{ key: 'main', name: '四边孔', sites: ['axillary'] }] },
    long_thoracic: { defaultLevel: 'main', levels: [{ key: 'main', name: '胸侧壁', sites: ['long_thoracic'] }] },
    musculocutaneous: { defaultLevel: 'proximal', levels: [
      { key: 'proximal', name: '近端（穿喙肱肌前）', sites: ['musculocutaneous'], plane: 0 },
      { key: 'arm', name: '上臂（穿喙肱肌后）', sites: ['musculocutaneous'], plane: 0.5 },
      { key: 'elbow', name: '肘部（前臂外侧皮神经）', sites: ['musculocutaneous'], plane: 1.5 }] },
  };

  const outLinks = {}, inLinks = {};
  LINKS.forEach(([a, b]) => {
    (outLinks[a] = outLinks[a] || []).push(b);
    (inLinks[b] = inLinks[b] || []).push(a);
  });
  const zoneMap = Object.fromEntries(ZONES.map(t => [t.id, t]));
  const NODE_IDS = [...new Set(LINKS.flat())];

  function allPaths(from, to, acc = [from], out = []) {
    if (from === to) { out.push(acc); return out; }
    (outLinks[from] || []).forEach(n => allPaths(n, to, acc.concat(n), out));
    return out;
  }

  // 某条根到某结构的路径（臂丛拓扑下唯一），到不了则为 null
  const pathCache = {};
  function pathOf(root, id) {
    const k = root + '>' + id;
    if (!(k in pathCache)) pathCache[k] = allPaths(root, id)[0] || null;
    return pathCache[k];
  }

  function rootsOf(id) {
    return COMPOSITION[id] || ROOTS.filter(r => pathOf(r, id));
  }

  // 所有「根 → 神经」的纤维路径
  const NERVE_PATHS = [];
  Object.keys(COMPOSITION).forEach(n => COMPOSITION[n].forEach(r => NERVE_PATHS.push(pathOf(r, n))));
  const MINOR_PATHS = [];
  Object.keys(MINOR).forEach(n => MINOR[n].forEach(r => MINOR_PATHS.push(pathOf(r, n))));

  function addPath(p, fromIdx, nodes, edges) {
    for (let i = fromIdx; i < p.length; i++) {
      nodes.add(p[i]);
      if (i > fromIdx) edges.add(p[i - 1] + '>' + p[i]);
    }
  }

  // 双向溯源：up = 该结构的纤维从哪些根、沿哪条路来；down = 流经该结构的纤维去往哪里
  function trace(id) {
    const upNodes = new Set([id]), upEdges = new Set(), downNodes = new Set([id]), downEdges = new Set();
    rootsOf(id).forEach(r => addPath(pathOf(r, id), 0, upNodes, upEdges));
    NERVE_PATHS.forEach(p => { const i = p.indexOf(id); if (i >= 0) addPath(p, i, downNodes, downEdges); });
    const nodes = new Set([...upNodes, ...downNodes]), edges = new Set([...upEdges, ...downEdges]);
    // 次要节段的通路：只保留主通路之外的部分
    const mn = new Set(), me = new Set();
    (MINOR[id] || []).forEach(r => addPath(pathOf(r, id), 0, mn, me));
    MINOR_PATHS.forEach(p => { const i = p.indexOf(id); if (i >= 0) addPath(p, i, mn, me); });
    const minorNodes = new Set([...mn].filter(n => !nodes.has(n)));
    const minorEdges = new Set([...me].filter(e => !edges.has(e)));
    return { upNodes, upEdges, downNodes, downEdges, nodes, edges, minorNodes, minorEdges };
  }

  // 单个靶区自己的路由（例如大鱼际肌只走 C8/T1 → 内侧束 → 正中神经）
  function traceZone(zoneId) {
    const t = zoneMap[zoneId];
    if (t.kind === 'dermatome') { const tr = trace(t.fibers[0].nerve); return { nodes: tr.nodes, edges: tr.edges }; }
    const nodes = new Set(), edges = new Set();
    t.fibers.forEach(f => f.roots.forEach(r => addPath(pathOf(r, f.nerve), 0, nodes, edges)));
    return { nodes, edges };
  }

  // 一条 fiber 中有多少根的纤维流经 ids 中的任一结构
  function fiberHits(f, ids) {
    return f.roots.filter(r => { const p = pathOf(r, f.nerve); return p && ids.some(id => p.includes(id)); }).length;
  }

  // 有纤维流经 id 的全部靶区
  function zonesFor(id) {
    const rs = rootsOf(id), out = new Set();
    ZONES.forEach(t => {
      const hit = t.kind === 'dermatome' ? rs.includes(t.fibers[0].nerve) : t.fibers.some(f => fiberHits(f, [id]));
      if (hit) out.add(t.id);
    });
    return out;
  }

  // 结构 id 与靶区的关系：'main' 主要支配 | 'part' 只经「部分参与」的纤维相连 | null 无关
  function relation(zoneId, id) {
    const t = zoneMap[zoneId];
    if (t.kind === 'dermatome') return rootsOf(id).includes(t.fibers[0].nerve) ? 'main' : null;
    const through = t.fibers.filter(f => fiberHits(f, [id]));
    if (!through.length) return null;
    return through.every(f => f.part) ? 'part' : 'main';
  }

  // 纤维在 site 处离开 site 的平面：site 就是纤维的终点神经 → f.plane；
  // site 是母神经、纤维走它的具名分支 → 该分支的分出平面；其余（根/干/股/束）→ 0
  function exitPlane(f, path, site) {
    const i = path.indexOf(site);
    if (i === path.length - 1) return f.plane;
    return SUBBRANCH_PLANE[path[i + 1]] ?? 0;
  }

  // 任意一组切断点的受累范围。
  // severity = 靶区 id → 'full'（主要节段全断）| 'partial'（部分节段断）；
  // spared = 与损伤在同一神经上、但从损伤点近端或另一条分支走的靶区
  function lesionAt(siteList, opts = {}) {
    const sites = [...new Set(siteList)];
    const plane = opts.plane || 0;
    const isNerve = sites.length > 0 && sites.every(s => s in COMPOSITION);
    const dermatomal = sites.filter(s => ROOTS.includes(s) || TRUNKS.includes(s));
    const involvesSubbranch = sites.some(s => s in SUBBRANCH_PLANE);
    // detail：靶区 id → { hit, kept }，各为 [{ nerve, roots, part }]，说明「部分受累」具体断了哪些、留了哪些
    const severity = new Map(), spared = [], detail = new Map();
    ZONES.forEach(t => {
      if (t.kind === 'dermatome') {
        // 皮节只对根/干水平的损伤有意义；束和周围神经的损伤按周围皮区分布
        if (dermatomal.some(s => rootsOf(s).includes(t.fibers[0].nerve))) severity.set(t.id, 'full');
        return;
      }
      let total = 0, hit = 0, bypass = false;
      const d = { hit: [], kept: [] };
      t.fibers.forEach(f => {
        total += f.roots.length;
        const cut = f.roots.filter(r => {
          const p = pathOf(r, f.nerve);
          const on = p ? sites.filter(s => p.includes(s)) : [];
          if (!on.length) return false;
          if (on.some(s => exitPlane(f, p, s) >= plane)) return true;
          bypass = true;
          return false;
        });
        hit += cut.length;
        const rest = f.roots.filter(r => !cut.includes(r));
        if (cut.length) d.hit.push({ nerve: f.nerve, roots: cut, part: f.part });
        if (rest.length) d.kept.push({ nerve: f.nerve, roots: rest, part: f.part });
      });
      if (hit) { severity.set(t.id, hit === total ? 'full' : 'partial'); detail.set(t.id, d); }
      else if (bypass) spared.push(t.id);
    });
    // 只伤到具名分支（骨间前/后神经、桡浅支）：同一母神经的其余分支照常工作
    sites.filter(s => s in SUBBRANCH_PLANE).forEach(s => {
      const parent = inLinks[s][0];
      ZONES.forEach(t => {
        if (t.kind === 'dermatome' || severity.has(t.id) || spared.includes(t.id)) return;
        if (t.fibers.some(f => fiberHits(f, [parent]))) spared.push(t.id);
      });
    });
    const tr = { upNodes: new Set(), upEdges: new Set(), downNodes: new Set(), downEdges: new Set(), nodes: new Set(), edges: new Set() };
    sites.forEach(s => { const one = trace(s); Object.keys(tr).forEach(k => one[k].forEach(v => tr[k].add(v))); });
    return {
      key: opts.key || null, level: opts.level || null, levelName: opts.levelName || '',
      marked: new Set(sites), isNerve, dermatomal: dermatomal.length > 0, involvesSubbranch,
      // 节前 = 全部损伤点都在根；Horner 征 = T1 根在发出白交通支之前受损
      preganglionic: sites.length > 0 && sites.every(s => ROOTS.includes(s)), horner: sites.includes('t1'),
      severity, spared, detail, ...tr,
    };
  }

  // 预设损伤
  function lesion(key, levelKey) {
    const preset = LESION_PRESETS[key];
    const level = preset.levels.find(l => l.key === levelKey) || preset.levels.find(l => l.key === preset.defaultLevel);
    return lesionAt(level.sites, { plane: level.plane, key, level: level.key, levelName: level.name });
  }

  function segLabel(id) {
    const idx = rootsOf(id).map(r => ROOTS.indexOf(r));
    const names = idx.map(i => ROOTS[i].toUpperCase());
    const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
    const main = names.length > 1 && contiguous ? names[0] + '–' + names[names.length - 1] : names.join(', ');
    return MINOR[id] ? `(${minorLabel(id)}) ${main}` : main;
  }

  function minorLabel(id) {
    return (MINOR[id] || []).map(r => r.toUpperCase()).join(', ');
  }

  return {
    ROOTS, TRUNKS, LINKS, COMPOSITION, MINOR, ZONES, LESION_PRESETS, SUBBRANCH_PLANE, NODE_IDS,
    zone: id => zoneMap[id], parentsOf: id => inLinks[id] || [], childrenOf: id => outLinks[id] || [],
    pathOf, rootsOf, trace, traceZone, zonesFor, relation, lesion, lesionAt, segLabel, minorLabel,
  };
})();
