// 选择题生成器：题目和答案都从模型推出，不手写。纯逻辑，Node 里也能跑（测试会批量生成校验）。
import { PlexusModel } from './model.js';
import { NODES, nodeMap } from './data/nodes.js';

// 可复现的伪随机数（测试用固定种子）
export function makeRng(seed = Date.now()) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
function sample(arr, n, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

const NERVE_POOL = NODES.filter(n => ['branch', 'collateral', 'subbranch'].includes(n.stage)).map(n => n.id);
const MOTOR = PlexusModel.ZONES.filter(t => t.kind === 'motor');

// 切断后至少有一块肌肉完全瘫痪、且至少有 3 块完全不受累的结构，才适合出「切断 X」题
const CUTTABLE = PlexusModel.NODE_IDS.filter(id => {
  const L = PlexusModel.lesionAt([id]);
  const full = MOTOR.filter(t => L.severity.get(t.id) === 'full');
  const free = MOTOR.filter(t => !L.severity.has(t.id));
  return full.length && free.length >= 3;
});

export const MCQ_TYPES = ['supply', 'lesion'];

function shuffleOptions(options, rng) { return sample(options, options.length, rng); }

// mcqType: 'supply'（某肌由哪条神经支配）| 'lesion'（切断某结构后哪块肌完全瘫痪）
// subject: 指定题目对象（错题重练时用），不指定则随机
export function generateMCQ(mcqType, subject, rng = Math.random) {
  if (mcqType === 'supply') {
    const t = (subject && PlexusModel.zone(subject)) || pick(MOTOR, rng);
    const answer = t.fibers[0].nerve;
    const route = PlexusModel.traceZone(t.id).nodes;
    const sameStage = NERVE_POOL.filter(id => !route.has(id) && nodeMap[id].stage === nodeMap[answer].stage);
    const others = NERVE_POOL.filter(id => !route.has(id) && !sameStage.includes(id));
    const distract = sample(sameStage, 2, rng);
    distract.push(...sample(others.concat(sameStage.filter(id => !distract.includes(id))), 3 - distract.length, rng));
    const many = t.fibers.length > 1 ? '（它有不止一条支配神经，选出其中一条）' : '';
    return {
      key: `g:supply:${t.id}`, type: 'mcq', mcqType, subject: t.id,
      q: `【选择题】「${t.name}」由哪条神经支配？${many}`,
      options: shuffleOptions([answer, ...distract].map(id => ({ id, label: nodeMap[id].label })), rng),
      answer,
      explain: `${t.name}：` + t.fibers.map(f => `${nodeMap[f.nerve].label}（${f.roots.map(r => r.toUpperCase()).join('、')}）`).join(' + '),
      show: { zone: t.id },
    };
  }
  const site = (subject && CUTTABLE.includes(subject) && subject) || pick(CUTTABLE, rng);
  const L = PlexusModel.lesionAt([site]);
  const full = MOTOR.filter(t => L.severity.get(t.id) === 'full');
  const free = MOTOR.filter(t => !L.severity.has(t.id));
  const ans = pick(full, rng);
  const distract = sample(free, 3, rng);
  return {
    key: `g:lesion:${site}`, type: 'mcq', mcqType, subject: site,
    q: `【选择题】切断「${nodeMap[site].label}」后，下列哪块肌肉会完全瘫痪？`,
    options: shuffleOptions([ans, ...distract].map(t => ({ id: t.id, label: t.name })), rng),
    answer: ans.id,
    explain: `切断${nodeMap[site].label}后完全瘫痪：${full.map(t => t.name).join('、')}`,
    show: { cut: site },
  };
}
