// 临床卡片：查体试验 / 典型体征 / 口诀 / 常见病因。按节点 id 对应，检查器里显示。
// 内容按常用教材（Moore《临床解剖学》、《系统解剖学》、神经内科查体教材）的通行说法撰写，仅供学习。
export const CLINICAL = {
  c5: {
    tests: ['肩外展（三角肌、冈上肌）', '屈肘（肱二头肌）', '肱二头肌反射（C5–C6）'],
    signs: ['肩外侧、臂外侧感觉减退', '菱形肌无力提示损伤在根部'],
    causes: ['C4–C5 椎间盘突出 / 椎间孔狭窄', '上臂丛牵拉伤'],
  },
  c6: {
    tests: ['屈肘（肱二头肌、肱桡肌）', '伸腕（桡侧腕伸肌）', '肱桡肌反射（C5–C6）'],
    signs: ['前臂外侧、拇指与示指感觉减退'],
    causes: ['C5–C6 椎间盘突出（颈椎病最常见节段之一）'],
  },
  c7: {
    tests: ['伸肘（肱三头肌）', '屈腕、伸指', '肱三头肌反射（C7）'],
    signs: ['中指感觉减退'],
    causes: ['C6–C7 椎间盘突出（颈神经根病最常见节段）'],
  },
  c8: {
    tests: ['屈指（指深屈肌）', '握力', '手内在肌'],
    signs: ['小指、环指尺侧及前臂内侧远端感觉减退'],
    causes: ['C7–T1 椎间盘突出', '颈肋、肺尖肿瘤'],
  },
  t1: {
    tests: ['手指外展（骨间背侧肌）', '拇短展肌', '观察眼裂与瞳孔'],
    signs: ['臂内侧感觉减退', '根性撕脱时同侧 Horner 综合征'],
    causes: ['肺上沟瘤（Pancoast 瘤，常同时侵犯交感干）', '下臂丛撕脱伤'],
  },
  upper_trunk: {
    tests: ['肩外展、外旋', '屈肘与前臂旋后', '对比菱形肌、前锯肌（鉴别根性撕脱）'],
    signs: ['“侍者小费手”：上臂内收内旋、肘伸直、前臂旋前', '无 Horner 征'],
    mnemonic: 'Erb 点 = 上干，C5 + C6 汇合处',
    causes: ['难产（肩难产）牵拉', '摔伤致头肩分离', '背包带压迫'],
  },
  middle_trunk: {
    tests: ['伸肘、伸腕、伸指'],
    signs: ['中指感觉减退'],
    causes: ['单独损伤少见，多随上、下干一同受累'],
  },
  lower_trunk: {
    tests: ['手指外展与内收', '屈指、握力', 'Adson 试验（特异性低，阳性不能确诊胸廓出口综合征）'],
    signs: ['爪形手', '前臂内侧、尺侧 1.5 指感觉减退', '无 Horner 征（若有，考虑 T1 根性撕脱或肿瘤侵犯交感干）'],
    causes: ['颈肋 / 胸廓出口综合征', '抓物坠落致上肢过度上举（Klumpke）', '肺尖肿瘤（多同时侵犯交感干而伴 Horner 征）'],
  },
  lat_cord: {
    tests: ['屈肘（肌皮神经）', '前臂旋前（正中神经外侧根）'],
    signs: ['前臂外侧感觉减退（非皮节分布）'],
    mnemonic: 'LLM：Lateral pectoral、Lateral root of median、Musculocutaneous',
    causes: ['锁骨下 / 腋窝穿通伤', '肩关节脱位'],
  },
  post_cord: {
    tests: ['肩外展（腋神经）', '伸肘、伸腕、伸指（桡神经）', '背阔肌（咳嗽时触摸腋后襞）'],
    signs: ['垂腕合并肩外展无力', '屈肘保留（肌皮神经来自外侧束）'],
    mnemonic: 'ULTRA：Upper subscapular、Lower subscapular、Thoracodorsal、Radial、Axillary',
    causes: ['腋杖压迫', '肩关节脱位', '肱骨近端骨折'],
  },
  med_cord: {
    tests: ['手指外展（尺神经）', '拇对掌（正中神经内侧根）', '伸腕伸指正常（与下干损伤鉴别）'],
    signs: ['手内在肌全部无力', '臂内侧、前臂内侧及尺侧 1.5 指感觉减退'],
    mnemonic: 'M4U：Medial pectoral、Medial cutaneous of arm / forearm、Median（内侧根）、Ulnar',
    causes: ['腋窝穿通伤', '锁骨下动脉瘤压迫'],
  },
  musculocutaneous: {
    tests: ['屈肘（旋后位）', '前臂旋后', '肱二头肌反射'],
    signs: ['前臂外侧感觉减退'],
    causes: ['腋窝前壁穿通伤', '剧烈举重致喙肱肌卡压', '肩关节手术'],
  },
  axillary: {
    tests: ['三角肌伸展滞后征（把上肢被动后伸到接近最大位，松手后能否保持）', '肩外展抗阻力量（与健侧比，不只看能否抬起）', '“徽章区”针刺觉（正常也不能排除）'],
    signs: ['方肩畸形（三角肌萎缩）', '肩袖完好时外展范围可接近正常，但无力、易疲劳', '肩外侧徽章区感觉减退（常不明显）'],
    mnemonic: '方肩 + 徽章区 = 腋神经',
    causes: ['肩关节前脱位', '肱骨外科颈骨折', '四边孔综合征'],
  },
  radial: {
    tests: ['伸腕、伸掌指关节', '伸肘（判断平面高低）', '虎口区感觉'],
    signs: ['垂腕（Wrist drop）', '虎口区感觉减退'],
    mnemonic: '桡神经 = 后面的伸肌全包：伸肘、伸腕、伸指、旋后',
    causes: ['肱骨中段骨折（桡神经沟）', '“星期六夜麻痹”（上臂搭在椅背上熟睡）', '腋杖压迫（高位）'],
  },
  median: {
    tests: ['Phalen 试验（屈腕 60 秒）', 'Tinel 征（叩击腕管）', '拇对掌、拇短展肌', '握拳看示、中指能否屈曲（高位损伤）'],
    signs: ['猿手（大鱼际萎缩）', '祝福手（高位损伤握拳时）', '桡侧 3.5 指麻木，夜间明显'],
    mnemonic: 'LOAF：Lumbricals 1–2、Opponens pollicis、Abductor pollicis brevis、Flexor pollicis brevis',
    causes: ['腕管综合征（最常见的卡压性神经病）', '肱骨髁上骨折', '旋前圆肌综合征（前臂近端痛、手掌桡侧也麻，肌力多正常，旋前圆肌常保留）'],
  },
  ulnar: {
    tests: ['Froment 征（拇、示指夹纸，拇指指间关节屈曲代偿拇收肌）', '手指外展、内收（骨间肌）', '肘管 Tinel 征', '小指感觉'],
    signs: ['爪形手（环、小指）', '小鱼际与第一骨间背侧肌萎缩', 'Wartenberg 征（小指外展不能内收）'],
    mnemonic: '尺神经悖论：损伤越高，爪形越轻',
    causes: ['肘管综合征', '肱骨内上髁骨折', 'Guyon 管卡压（骑自行车、腱鞘囊肿）'],
  },
  dorsal_scapular: {
    tests: ['肩胛骨内收、上提（菱形肌、肩胛提肌）'],
    signs: ['肩胛骨内侧缘外移'],
    causes: ['中斜角肌卡压', 'C5 根性撕脱（重要的定位线索）'],
  },
  long_thoracic: {
    tests: ['双手推墙看肩胛骨内侧缘', '上肢前屈超过 90°'],
    signs: ['翼状肩胛', '上肢上举困难'],
    causes: ['乳腺癌腋窝清扫、胸壁手术', '肩扛重物 / 背包压迫', '特发性臂丛神经炎'],
  },
  suprascapular: {
    tests: ['肩外展抗阻（冈上肌，空罐试验）', '肩外旋抗阻（冈下肌）'],
    signs: ['冈上窝、冈下窝凹陷', '只有冈下窝凹陷：病变在冈盂切迹'],
    causes: ['肩胛切迹卡压', '排球、投掷运动员（多在冈盂切迹，只累及冈下肌）', '盂唇旁囊肿', '肩胛骨骨折'],
  },
  thoracodorsal: {
    tests: ['肩内收、后伸（背阔肌）', '咳嗽时触摸腋后襞'],
    signs: ['引体向上、爬绳无力'],
    causes: ['腋窝淋巴结清扫', '背阔肌皮瓣手术'],
  },
  pin: {
    tests: ['伸掌指关节（垂指）', '伸腕时观察是否偏向桡侧'],
    signs: ['垂指不垂腕', '无皮肤感觉障碍'],
    causes: ['Frohse 弓卡压（旋后肌综合征）', '桡骨头脱位 / 骨折', '肘部腱鞘囊肿'],
  },
  srn: {
    tests: ['虎口区针刺觉', '前臂远端桡侧 Tinel 征'],
    signs: ['手背桡侧麻木、刺痛，肌力正常'],
    causes: ['表带、手铐过紧（Wartenberg 综合征）', '桡骨远端手术'],
  },
  ain: {
    tests: ['OK 征（拇、示指捏成“O”形）', '屈拇指指间关节、示指远侧指间关节'],
    signs: ['捏成“泪滴”形而不是“O”形', '无皮肤感觉障碍'],
    causes: ['儿童伸直型肱骨髁上骨折', '前臂骨折', '神经痛性肌萎缩（Parsonage–Turner）：自发起病者多属此类，病变常在肘上正中神经干内'],
  },
};

// 搜索别名：体征、试验、俗称 → 要跳转的结构或损伤
// action: { lesion, level? } 套用损伤预设；{ node } 选中节点；{ zone } 选中上肢图分区
export const SEARCH_ALIASES = [
  { terms: ['垂腕', 'wrist drop', '星期六夜麻痹', '周末夜麻痹', 'saturday night', '桡神经沟', '肱骨中段骨折'], label: '桡神经损伤 · 桡神经沟（垂腕）', action: { lesion: 'radial', level: 'groove' } },
  { terms: ['腋杖', 'crutch'], label: '桡神经损伤 · 腋部（腋杖麻痹）', action: { lesion: 'radial', level: 'axilla' } },
  { terms: ['垂指', '旋后肌综合征', 'frohse', 'pin', '骨间后'], label: '桡神经损伤 · 骨间后神经（只垂指、不垂腕）', action: { lesion: 'radial', level: 'pin' } },
  { terms: ['猿手', 'ape hand', '腕管', 'carpal tunnel', 'phalen', 'tinel', '夜间麻木'], label: '正中神经损伤 · 腕管（猿手）', action: { lesion: 'median', level: 'carpal' } },
  { terms: ['祝福手', 'benediction', '髁上骨折'], label: '正中神经损伤 · 肘部以上（祝福手）', action: { lesion: 'median', level: 'high' } },
  { terms: ['旋前圆肌综合征', 'pronator syndrome'], label: '正中神经 · 旋前圆肌综合征（以感觉症状为主，通常没有祝福手）', action: { node: 'median' } },
  { terms: ['ok征', 'ok 征', 'kiloh', 'nevin', 'ain', '骨间前'], label: '正中神经损伤 · 骨间前神经（OK 征异常）', action: { lesion: 'median', level: 'ain' } },
  { terms: ['爪形手', 'claw', 'froment', '夹纸', 'guyon', 'wartenberg 征'], label: '尺神经损伤 · 腕部 Guyon 管（爪形手）', action: { lesion: 'ulnar', level: 'wrist' } },
  { terms: ['肘管', 'cubital', '尺神经悖论', '内上髁'], label: '尺神经损伤 · 肘管', action: { lesion: 'ulnar', level: 'elbow' } },
  { terms: ['方肩', '徽章区', '肩关节脱位', '外科颈', '四边孔'], label: '腋神经损伤 · 四边孔（方肩）', action: { lesion: 'axillary' } },
  { terms: ['翼状肩', 'winged scapula', '推墙', '腋窝清扫'], label: '胸长神经损伤 · 胸侧壁（翼状肩胛）', action: { lesion: 'long_thoracic' } },
  { terms: ['侍者小费手', "waiter's tip", 'waiter', 'erb', '难产', '肩难产'], label: '上臂丛损伤 · 上干（Erb 麻痹）', action: { lesion: 'erb', level: 'trunk' } },
  { terms: ['klumpke', '颈肋', '胸廓出口', 'adson'], label: '下臂丛损伤 · 下干（Klumpke 麻痹）', action: { lesion: 'klumpke', level: 'trunk' } },
  { terms: ['horner', '霍纳', '上睑下垂', '瞳孔缩小'], label: '下臂丛损伤 · C8–T1 根性撕脱（伴 Horner 征）', action: { lesion: 'klumpke', level: 'root' } },
  { terms: ['pancoast', '肺上沟瘤', '肺尖肿瘤'], label: '下臂丛损伤 · 下干（Pancoast 瘤的 Horner 征来自交感干受侵）', action: { lesion: 'klumpke', level: 'trunk' } },
  { terms: ['根性撕脱', '节前损伤'], label: '上臂丛损伤 · C5–C6 根性撕脱', action: { lesion: 'erb', level: 'root' } },
  { terms: ['wartenberg 综合征', '手铐', '表带', '虎口麻木', '桡浅'], label: '桡神经浅支', action: { node: 'srn' } },
  { terms: ['肱二头肌反射', '屈肘'], label: 'C5–C6：肱二头肌反射', action: { node: 'c5' } },
  { terms: ['肱桡肌反射'], label: 'C6：肱桡肌反射', action: { node: 'c6' } },
  { terms: ['肱三头肌反射', '中指麻木'], label: 'C7：肱三头肌反射', action: { node: 'c7' } },
  { terms: ['ultra'], label: '后束（口诀 ULTRA）', action: { node: 'post_cord' } },
  { terms: ['m4u'], label: '内侧束（口诀 M4U）', action: { node: 'med_cord' } },
  { terms: ['llm'], label: '外侧束（口诀 LLM）', action: { node: 'lat_cord' } },
  { terms: ['loaf'], label: '大鱼际肌（口诀 LOAF）', action: { zone: 'm_thenar' } },
  { terms: ['erb 点', '颈后三角'], label: '上干（Erb 点）', action: { node: 'upper_trunk' } },
];
