export const STAGES = [
  { key: 'root', x: 70, title: '根 Roots', sub: '脊神经前支' },
  { key: 'trunk', x: 255, title: '干 Trunks', sub: '颈后三角' },
  { key: 'division', x: 450, title: '股 Divisions', sub: '锁骨后方' },
  { key: 'cord', x: 655, title: '束 Cords', sub: '腋动脉周围' },
  { key: 'branch', x: 885, title: '终末支 Branches', sub: '上肢主干' },
];

export const NODES = [
  // Roots
  { id: 'c5', stage: 'root', x: 70, y: 120, w: 96, h: 44, label: 'C5 神经根', sub: '第5颈神经前支', en: 'C5 Anterior Ramus',
    motor: '参与支配三角肌、冈上/下肌、菱形肌、肱二头肌、肱桡肌、前锯肌上部',
    sensory: '肩外侧及上臂外侧上部（C5 皮节）',
    clinical: '参与构成上干、肩胛背神经与胸长神经；损伤常见于上臂丛牵拉伤（Erb 麻痹）。' },
  { id: 'c6', stage: 'root', x: 70, y: 210, w: 96, h: 44, label: 'C6 神经根', sub: '第6颈神经前支', en: 'C6 Anterior Ramus',
    motor: '参与支配肱二头肌、肱桡肌、旋前圆肌、桡侧腕伸肌、胸大肌、背阔肌',
    sensory: '前臂外侧、拇指及示指（C6 皮节）',
    clinical: '与 C5 共同汇成上干；肱二头肌反射与肱桡肌反射中枢在 C5–C6。' },
  { id: 'c7', stage: 'root', x: 70, y: 310, w: 96, h: 44, label: 'C7 神经根', sub: '第7颈神经前支', en: 'C7 Anterior Ramus',
    motor: '参与支配肱三头肌、腕伸肌、指伸肌、胸大肌、背阔肌、前锯肌',
    sensory: '中指及手掌/手背中央区（C7 皮节）',
    clinical: '独自延续为中干；肱三头肌反射主要反映 C7 节段功能。' },
  { id: 'c8', stage: 'root', x: 70, y: 410, w: 96, h: 44, label: 'C8 神经根', sub: '第8颈神经前支', en: 'C8 Anterior Ramus',
    motor: '参与支配指屈肌、手内在肌（大小鱼际、骨间肌、蚓状肌）、部分伸指肌',
    sensory: '前臂内侧远端、环指尺侧及小指（C8 皮节）',
    clinical: '与 T1 汇成下干；损伤可致手内在肌无力与爪形手表现。' },
  { id: 't1', stage: 'root', x: 70, y: 500, w: 96, h: 44, label: 'T1 神经根', sub: '第1胸神经前支', en: 'T1 Anterior Ramus',
    motor: '主要支配手部精细内在肌（骨间肌、蚓状肌、鱼际肌）',
    sensory: '上臂及前臂内侧近端（T1 皮节）',
    clinical: '眼部交感节前纤维主要经 T1（C8–T2）前根和白交通支进入交感干，不进入下干。所以 T1 根性撕脱伴同侧 Horner 综合征，而单纯下干损伤没有。' },

  // Trunks
  { id: 'upper_trunk', stage: 'trunk', x: 255, y: 165, w: 108, h: 48, label: '上干', sub: 'Upper Trunk', en: 'Superior / Upper Trunk',
    motor: '肩外展与外旋肌群（三角肌、冈上/下肌）、肘屈肌群（肱二头肌、肱肌、肱桡肌）',
    sensory: '肩外侧、前臂外侧、拇指与示指区域（C5–C6 皮节）',
    clinical: '在 Erb 点汇聚，并发出肩胛上神经与锁骨下肌神经（干部仅有的两条分支）；分娩牵拉或摔伤致头肩分离可引起 Erb-Duchenne 麻痹（“侍者小费手”）。' },
  { id: 'middle_trunk', stage: 'trunk', x: 255, y: 310, w: 108, h: 48, label: '中干', sub: 'Middle Trunk', en: 'Middle Trunk',
    motor: '肱三头肌、前臂伸肌与部分屈肌',
    sensory: '中指为主的 C7 皮节',
    clinical: '完全由 C7 神经根延续而成，前股汇入外侧束，后股汇入后束。' },
  { id: 'lower_trunk', stage: 'trunk', x: 255, y: 455, w: 108, h: 48, label: '下干', sub: 'Lower Trunk', en: 'Inferior / Lower Trunk',
    motor: '全部手内在肌及尺侧屈腕/屈指肌',
    sensory: '上臂/前臂内侧、尺侧 1.5 指（C8–T1 皮节）',
    clinical: '跨越第 1 肋，易受颈肋或肺尖肿瘤压迫；过度上牵上肢可致 Klumpke 麻痹。单纯下干损伤不出现 Horner 征；肺尖（Pancoast）瘤常伴 Horner 征，是因为肿瘤同时侵犯了交感干和星状神经节，并非根性撕脱。' },

  // Divisions
  { id: 'up_ant', stage: 'division', x: 450, y: 130, w: 106, h: 40, label: '上干前股', sub: 'Anterior', en: 'Anterior Division (Upper)', divisionType: 'ant',
    motor: '汇入外侧束，参与支配上肢前群屈肌（肱二头肌、肱肌、旋前圆肌等）',
    sensory: '前臂外侧及桡侧手掌',
    clinical: '在锁骨后方由上干发出，与中干前股合成外侧束。' },
  { id: 'up_post', stage: 'division', x: 450, y: 205, w: 106, h: 40, label: '上干后股', sub: 'Posterior', en: 'Posterior Division (Upper)', divisionType: 'post',
    motor: '汇入后束，支配三角肌、小圆肌、肩胛下肌及部分伸肌',
    sensory: '肩外侧及上臂/前臂后侧',
    clinical: '三干后股全部汇合为后束，供应整个上肢后侧伸肌隔室。' },
  { id: 'mid_ant', stage: 'division', x: 450, y: 280, w: 106, h: 40, label: '中干前股', sub: 'Anterior', en: 'Anterior Division (Middle)', divisionType: 'ant',
    motor: '汇入外侧束，参与肌皮神经、正中神经外侧根与胸外侧神经',
    sensory: '手掌桡侧及中指',
    clinical: '与上干前股共同组成外侧束。' },
  { id: 'mid_post', stage: 'division', x: 450, y: 350, w: 106, h: 40, label: '中干后股', sub: 'Posterior', en: 'Posterior Division (Middle)', divisionType: 'post',
    motor: '汇入后束，重点参与桡神经（肱三头肌、伸腕伸指肌）及胸背神经',
    sensory: '前臂后侧及手背',
    clinical: '是桡神经 C7 纤维的核心通道。' },
  { id: 'low_post', stage: 'division', x: 450, y: 425, w: 106, h: 40, label: '下干后股', sub: 'Posterior', en: 'Posterior Division (Lower)', divisionType: 'post',
    motor: '汇入后束，主要经桡神经支配前臂远端伸肌（伸指/伸拇肌）',
    sensory: '前臂后侧远端',
    clinical: '与上、中干后股汇合为后束。' },
  { id: 'low_ant', stage: 'division', x: 450, y: 495, w: 106, h: 40, label: '下干前股', sub: 'Anterior', en: 'Anterior Division (Lower)', divisionType: 'ant',
    motor: '直接延续为内侧束，支配尺神经及正中神经内侧根所控屈肌与手内在肌',
    sensory: '臂内侧、前臂内侧及尺侧 1.5 指',
    clinical: '独自构成内侧束，是手部精细运动的核心通路。' },

  // Cords
  { id: 'lat_cord', stage: 'cord', x: 655, y: 165, w: 112, h: 52, label: '外侧束', sub: 'Lateral Cord', en: 'Lateral Cord (腋动脉外侧)',
    motor: '肱二头肌、喙肱肌、肱肌、胸大肌锁骨部及正中神经上段屈肌',
    sensory: '前臂外侧及桡侧手掌',
    clinical: '位于腋动脉第 2 段外侧；发出胸外侧神经，终分为肌皮神经与正中神经外侧根。分支口诀 LLM：Lateral pectoral、Lateral root of median、Musculocutaneous。' },
  { id: 'post_cord', stage: 'cord', x: 655, y: 325, w: 112, h: 52, label: '后束', sub: 'Posterior Cord', en: 'Posterior Cord (腋动脉后方)',
    motor: '三角肌、小圆肌、背阔肌、肩胛下肌、大圆肌、肱三头肌及前臂全部伸肌',
    sensory: '肩外侧、臂后、前臂后、手背桡侧 2.5 指',
    clinical: '由全部三个后股汇合而成；腋杖压迫腋窝可同时累及后束引发垂腕与肩外展无力。分支口诀 ULTRA：Upper subscapular、Lower subscapular、Thoracodorsal、Radial、Axillary。' },
  { id: 'med_cord', stage: 'cord', x: 655, y: 485, w: 112, h: 52, label: '内侧束', sub: 'Medial Cord', en: 'Medial Cord (腋动脉内侧)',
    motor: '手部全部内在肌、尺侧腕屈肌、指深屈肌尺侧半、胸小肌及胸大肌胸肋部',
    sensory: '臂内侧、前臂内侧及尺侧 1.5 指',
    clinical: '发出胸内侧神经、臂及前臂内侧皮神经，终分为尺神经与正中神经内侧根。分支口诀 M4U：Medial pectoral、Medial cutaneous of arm、Medial cutaneous of forearm、Median（内侧根）、Ulnar。' },

  // Terminal Branches
  { id: 'musculocutaneous', stage: 'branch', x: 885, y: 110, w: 144, h: 48, label: '肌皮神经', sub: 'Musculocutaneous', en: 'Musculocutaneous Nerve (C5–C7)',
    motor: '喙肱肌、肱二头肌、肱肌（穿喙肱肌下行）',
    sensory: '终支为前臂外侧皮神经，支配前臂外侧皮肤',
    clinical: '损伤表现为肘关节屈曲与前臂旋后力量减弱，伴前臂外侧感觉减退。' },
  { id: 'axillary', stage: 'branch', x: 885, y: 210, w: 144, h: 48, label: '腋神经', sub: 'Axillary Nerve', en: 'Axillary Nerve (C5–C6)',
    motor: '三角肌、小圆肌',
    sensory: '肩外侧三角肌表面皮肤（“徽章区”）',
    clinical: '绕肱骨外科颈经四边孔穿行；肩关节前脱位或肱骨外科颈骨折易损伤，致“方肩”畸形及肩外展障碍。' },
  { id: 'radial', stage: 'branch', x: 885, y: 310, w: 144, h: 48, label: '桡神经', sub: 'Radial Nerve', en: 'Radial Nerve (C5–T1)',
    motor: '肱三头肌、肘肌、肱桡肌、旋后肌及前臂全部伸腕/伸指肌；另有分支进入肱肌下外侧小部分（肱肌主要由肌皮神经支配）',
    sensory: '臂后、前臂后及手背桡侧 2.5 指（虎口区最恒定）',
    clinical: '紧贴肱骨干桡神经沟走行；肱骨中段骨折或“星期六夜麻痹”（Saturday night palsy）压迫可致典型“垂腕”畸形。' },
  { id: 'median', stage: 'branch', x: 885, y: 410, w: 144, h: 48, label: '正中神经', sub: 'Median Nerve', en: 'Median Nerve · (C5) C6–T1',
    motor: '前臂大部分屈肌与旋前肌、大鱼际肌（拇短展肌、拇对掌肌、拇短屈肌浅头；拇收肌和拇短屈肌深头属尺神经）、第 1–2 蚓状肌',
    sensory: '手掌桡侧（掌皮支）、桡侧 3.5 指掌面及其中远节指背',
    clinical: '由外侧束外侧根与内侧束内侧根汇合呈“M”形；腕管综合征可致桡侧 3.5 指夜间麻痛及大鱼际萎缩（猿手）；掌皮支不经腕管，手掌感觉保留。' },
  { id: 'ulnar', stage: 'branch', x: 885, y: 510, w: 144, h: 48, label: '尺神经', sub: 'Ulnar Nerve', en: 'Ulnar Nerve (C8–T1)',
    motor: '尺侧腕屈肌、指深屈肌尺侧半、小鱼际肌、骨间肌、第 3–4 蚓状肌、拇收肌',
    sensory: '手掌尺侧及尺侧 1.5 指掌面（小指及环指尺侧半）、手背尺侧 2.5 指',
    clinical: '内侧束的延续，常另有 C7 纤维经外侧束的交通支加入。经肱骨内上髁后方尺神经沟。腕部（Guyon 管）损伤呈典型“爪形手”；肘部损伤因环、小指指深屈肌同时瘫痪，爪形反而较轻（尺神经悖论）。Froment 征（拇、示指夹纸时拇指指间关节屈曲）阳性。' },

  // Collaterals（第二行文字是节段，由模型推导，不在这里写）
  { id: 'dorsal_scapular', stage: 'collateral', x: 160, y: 66, w: 84, h: 34, label: '肩胛背神经', en: 'Dorsal Scapular Nerve',
    motor: '大、小菱形肌，肩胛提肌', sensory: '纯运动神经', clinical: '直接发自 C5 前支（紧邻椎间孔），穿中斜角肌下行。菱形肌受累说明损伤在上干近端、紧贴椎间孔，高度提示 C5 根性撕脱，是鉴别根性撕脱与上干损伤的线索之一；但它发自后根神经节远端，确认节前损伤还要看感觉神经动作电位、颈椎旁肌肌电图和 MRI/CT 脊髓造影。' },
  { id: 'long_thoracic', stage: 'collateral', dock: 'gap', x: 160, y: 260, w: 72, h: 38, label: '胸长神经', en: 'Long Thoracic Nerve',
    motor: '前锯肌', sensory: '纯运动神经', clinical: '由 C5–C7 根直接发出，沿胸侧壁下行，乳腺/腋窝清扫或重物压肩易损伤，致典型“翼状肩胛”。' },
  { id: 'suprascapular', stage: 'collateral', x: 345, y: 66, w: 84, h: 34, label: '肩胛上神经', en: 'Suprascapular Nerve',
    motor: '冈上肌（与三角肌一起完成肩外展，并稳定肱骨头）、冈下肌（肩外旋）', sensory: '盂肱关节、肩锁关节的感觉（一般没有皮支）', clinical: '经肩胛上横韧带下方的肩胛切迹进入冈上窝，再绕冈盂切迹至冈下窝。上干损伤（Erb 麻痹）时常受累；在冈盂切迹处受压（排球运动员、盂唇旁囊肿）只累及冈下肌。“冈上肌启动外展 0–15°”是旧说法，肌电研究显示它与三角肌几乎同时激活。' },
  { id: 'subclavius_n', stage: 'collateral', x: 348, y: 248, w: 92, h: 34, label: '锁骨下肌神经', en: 'Nerve to Subclavius',
    motor: '锁骨下肌', sensory: '纯运动神经', clinical: '发自上干前面，在锁骨后方下行；可发出副膈神经。' },
  { id: 'lat_pectoral', stage: 'collateral', x: 762, y: 66, w: 88, h: 34, label: '胸外侧神经', en: 'Lateral Pectoral Nerve',
    motor: '胸大肌（主要为锁骨部）', sensory: '无皮肤感觉', clinical: '发自外侧束，穿锁胸筋膜进入胸大肌深面。' },
  { id: 'upper_subscapular', stage: 'collateral', x: 762, y: 232, w: 88, h: 34, label: '上肩胛下神经', en: 'Upper Subscapular Nerve',
    motor: '肩胛下肌上部', sensory: '纯运动神经', clinical: '发自后束，是后束口诀 ULTRA 里的 U。' },
  { id: 'thoracodorsal', stage: 'collateral', x: 762, y: 272, w: 88, h: 34, label: '胸背神经', en: 'Thoracodorsal Nerve',
    motor: '背阔肌', sensory: '纯运动神经', clinical: '发自后束，位于上、下肩胛下神经之间；腋窝手术中需注意保护。' },
  { id: 'lower_subscapular', stage: 'collateral', x: 762, y: 380, w: 88, h: 34, label: '下肩胛下神经', en: 'Lower Subscapular Nerve',
    motor: '肩胛下肌下部、大圆肌', sensory: '纯运动神经', clinical: '发自后束，是后束口诀 ULTRA 里的 L。' },
  { id: 'med_cut_arm', stage: 'collateral', x: 762, y: 420, w: 88, h: 34, label: '臂内侧皮神经', en: 'Medial Cutaneous Nerve of Arm',
    motor: '纯感觉神经', sensory: '臂内侧下部皮肤', clinical: '发自内侧束，常与肋间臂神经（T2）交通。' },
  { id: 'med_cut_forearm', stage: 'collateral', x: 762, y: 548, w: 88, h: 34, label: '前臂内侧皮神经', en: 'Medial Cutaneous Nerve of Forearm',
    motor: '纯感觉神经', sensory: '前臂内侧皮肤', clinical: '发自内侧束，伴贵要静脉下行。' },
  { id: 'med_pectoral', stage: 'collateral', x: 762, y: 586, w: 88, h: 34, label: '胸内侧神经', en: 'Medial Pectoral Nerve',
    motor: '胸小肌、胸大肌胸肋部', sensory: '无皮肤感觉', clinical: '发自内侧束，穿过胸小肌后进入胸大肌。' },

  // 前臂具名分支（第二行文字是节段，由模型推导）
  { id: 'pin', stage: 'subbranch', x: 1010, y: 290, w: 84, h: 34, label: '骨间后神经', en: 'Posterior Interosseous Nerve (桡神经深支)',
    motor: '旋后肌、桡侧腕短伸肌、指伸肌、小指伸肌、尺侧腕伸肌、拇长展肌、拇长/短伸肌、示指伸肌', sensory: '纯运动支（仅腕关节本体感觉）',
    clinical: '在肘部由桡神经分出，穿旋后肌；Frohse 弓卡压时只垂指、不垂腕，伸腕偏向桡侧，无皮肤感觉障碍。' },
  { id: 'srn', stage: 'subbranch', x: 1010, y: 332, w: 84, h: 34, label: '桡神经浅支', en: 'Superficial Branch of Radial Nerve',
    motor: '纯感觉支', sensory: '手背桡侧 2.5 指近节及虎口区', clinical: '行于肱桡肌深面，在前臂远端穿出深筋膜；表带过紧或手铐压迫可致虎口麻木而肌力正常（Wartenberg 综合征）。' },
  { id: 'ain', stage: 'subbranch', x: 1010, y: 410, w: 84, h: 34, label: '骨间前神经', en: 'Anterior Interosseous Nerve',
    motor: '拇长屈肌、示（中）指指深屈肌、旋前方肌', sensory: '纯运动支（仅腕关节本体感觉）',
    clinical: '在旋前圆肌两头之间由正中神经分出，沿骨间膜前面下行；损伤后拇指、示指末节不能屈，捏不成“O”形（OK 征异常）。' },
];

// 空间位置关系（检查器「空间位置关系」一栏）
export const SPATIAL = {
  pin: '桡神经在肱骨外上髁前方分出深支，穿旋后肌两层之间绕桡骨颈转到前臂背侧，延续为骨间后神经。',
  srn: '桡神经在肘部分出的浅支，沿肱桡肌深面、桡动脉外侧下行，在腕上约 7 cm 处转到手背。',
  ain: '在肘下方、旋前圆肌两头之间自正中神经后面发出，伴骨间前动脉沿骨间膜前面下行至旋前方肌。',
  c5: '自 C4–C5 椎间孔穿出，位于前、中斜角肌间隙最上方。',
  c6: '自 C5–C6 椎间孔穿出，斜向外下方与 C5 汇合为上干。',
  c7: '居臂丛中轴位置，独自水平向外延续为中干。',
  c8: '自 C7–T1 椎间孔穿出，与 T1 汇合为下干。',
  t1: '紧贴第 1 肋颈与胸膜顶，邻近交感干星状神经节。',
  upper_trunk: '位于颈后三角斜角肌间隙外侧，体表投影对应 Erb 点，位置表浅。',
  middle_trunk: '由 C7 神经根直接延续，位于上干与下干之间，向锁骨后方下行。',
  lower_trunk: '跨越第 1 肋上面、位于锁骨下动脉后下方，易受颈肋或胸廓出口卡压。',
  up_ant: '在锁骨后方自上干分出并向前外侧走行（+Z），与中干前股汇成外侧束；股部不发出任何分支。',
  up_post: '在锁骨后方明显向背侧深面（-Z）折转，绕至腋动脉后方汇入后束；股部无分支。',
  mid_ant: '在锁骨后方向前外上方斜行（+Z），与上干前股共同合成外侧束；股部无分支。',
  mid_post: '向深面（-Z）走行至腋动脉正后方，构成后束中轴；股部无分支。',
  low_post: '自下干向背侧深面（-Z）斜上汇入后束，在腋动脉后方与上、中后股会师；股部无分支。',
  low_ant: '在锁骨后方偏向前内侧（+Z），独自延续为内侧束；股部无分支。',
  lat_cord: '位于腋动脉第 2 段的前外上方（+Z, -Y），发出肌皮神经与正中神经外侧根。',
  post_cord: '深藏于腋动脉正后方（-Z），由全部三条后股汇合而成！切换「俯视」最直观。',
  med_cord: '位于腋动脉第 2 段的前内下方（+Z, +Y），发出尺神经与正中神经内侧根。',
  musculocutaneous: '自外侧束发出，向前外侧斜穿喙肱肌，行于肱二头肌与肱肌之间。',
  axillary: '自后束发出后急剧向后外侧（-Z）穿四边孔，紧贴肱骨外科颈后方绕行至三角肌深面。',
  radial: '后束的直接粗大延续，居于深面后方（-Z），经大圆肌下缘、肱三头肌长头与肱骨之间的三角间隙，伴肱深动脉进入肱骨肌管，沿桡神经沟绕肱骨干后面下行。',
  median: '由外侧束外侧根与内侧束内侧根在腋动脉正前方（+Z）锐角汇合而成，构成经典“M”形。',
  ulnar: '内侧束的直接延续，沿腋动脉及肱动脉内侧下行，经肱骨内上髁后方尺神经沟。',
  suprascapular: '自上干发出，向后外上方（-Z, -Y）经肩胛切迹至冈上窝与冈下窝。',
  long_thoracic: '由 C5–C7 前支在根部发出：C5、C6 支多穿过中斜角肌，C7 支走在中斜角肌前方；三支汇合后经臂丛和腋动脉后方，沿胸侧壁垂直下行至前锯肌。',
  thoracodorsal: '发自腋动脉后方的后束，沿肩胛下肌前面向后下方（-Z）至背阔肌。',
  dorsal_scapular: '自 C5 神经根发出，穿中斜角肌向后下方（-Z）行至肩胛骨内侧缘深面。',
  lat_pectoral: '发自外侧束，向前（+Z）穿锁胸筋膜进入胸大肌深面。',
  med_pectoral: '发自内侧束，向前（+Z）穿胸小肌后进入胸大肌。',
  subclavius_n: '自上干前面发出，向前下方（+Z）在锁骨后方至锁骨下肌。',
  upper_subscapular: '发自后束后面，向后（-Z）进入肩胛下肌上部。',
  lower_subscapular: '发自后束后面，在胸背神经外侧向后下方（-Z）至肩胛下肌下部与大圆肌。',
  med_cut_arm: '发自内侧束，沿腋静脉内侧下行，分布于臂内侧皮肤。',
  med_cut_forearm: '发自内侧束，行于腋动、静脉之间，伴贵要静脉至前臂内侧。',
};

import { PlexusModel } from '../model.js';

export const nodeMap = Object.fromEntries(NODES.map(n => [n.id, n]));

// 连线类型由拓扑和节点所在层推出：旁支 / 根→干 / 前股系统 / 后股系统
const POSTERIOR = new Set(['post_cord', 'radial']);
function edgeType(from, to) {
  const a = nodeMap[from], b = nodeMap[to];
  if (b.stage === 'collateral') return 'collateral';
  if (a.stage === 'root') return 'main';
  if (b.divisionType) return b.divisionType;
  if (a.divisionType) return a.divisionType;
  return POSTERIOR.has(from) ? 'post' : 'ant';
}
export const EDGES = PlexusModel.LINKS.map(([from, to]) => ({ from, to, type: edgeType(from, to) }));

export const STAGE_NAMES = { root: '神经根', trunk: '神经干', division: '神经股', cord: '神经束', branch: '终末支', collateral: '重要旁支', subbranch: '前臂分支' };
