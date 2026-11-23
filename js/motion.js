// 动效。取自 motionsites.ai 的三类做法，按教学场景收敛：
//   传导波 —— Heart Health Dashboard 的信号描线：高亮通路从近端到远端依次扫过；
//   分列入场 —— Kairo Studio 的 Reveal：首屏按「根→干→股→束→支」逐列出现；
//   内容换页 —— 仪表盘卡片刷新：详情各列错峰淡入。
// 系统开启「减少动态效果」时全部跳过。
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const EASE = 'cubic-bezier(.22, .8, .24, 1)';
const STEP = 90; // 相邻两列之间的延迟（毫秒）

const on = () => !reduce.matches;
const restart = el => el.getAnimations().forEach(a => a.cancel());

// items: [{ el, col, color }]，col 为起点所在列，用来排出先后
export function sweep(items) {
  if (!on() || !items.length) return;
  const first = Math.min(...items.map(i => i.col));
  items.forEach(({ el, col, color }) => {
    restart(el);
    el.style.color = color;
    el.animate([
      { strokeDashoffset: 1, opacity: 1 },
      { strokeDashoffset: 0, opacity: 1, offset: 0.62 },
      { strokeDashoffset: 0, opacity: 0 },
    ], { duration: 720, delay: (col - first) * STEP, easing: 'ease-out', fill: 'backwards' });
  });
}

// items: [{ el, col }]
export function columnsIn(items) {
  if (!on()) return;
  items.forEach(({ el, col }) => el.animate(
    [{ opacity: 0, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'none' }],
    { duration: 480, delay: 80 + col * STEP, easing: EASE, fill: 'backwards' },
  ));
}

export function riseIn(els, { delay = 0, gap = 45 } = {}) {
  if (!on()) return;
  [...els].forEach((el, i) => {
    restart(el);
    el.animate(
      [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
      { duration: 360, delay: delay + i * gap, easing: EASE, fill: 'backwards' },
    );
  });
}
