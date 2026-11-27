// 损伤部位在 3D 走行上的位置：LESION_SITES[预设][部位] = { node, y }。
// node 是该部位切断的结构（必须在部位的 sites 里），y 是 assets/plexus/plexus3d.json 的高度坐标（cm）。
// 骨性标志的高度（取自 BodyParts3D 骨骼网格）：喙突尖 29.5，肱骨 0.1–30.8（中段约 15.5），
// 外上髁 2.6、内上髁 2.0，桡骨茎突 −22.2、尺骨茎突 −22.3，豌豆骨 −22.7 至 −23.8；腕远侧横纹约 −22.5。
// 3D 视图取 node 走行上高度最接近 y 的点作为损伤点，损伤点以近照常显示，以远画成受累；
// 细枝按它从走行上发出的位置归入近端或远端。
// 没有条目的部位（臂丛的根/干、腋神经、胸长神经）标记放在切断结构的中点，整条结构画成受累。
// 位置要与模型的 plane 一致：同一结构上 plane 越大（越远端），y 越小。tests/check-plexus3d.mjs 会校验。
// 分支起点的距离见各条注释（尸体解剖研究的均值，个体差异大）。
export const LESION_SITES = {
  radial: {
    axilla: { node: 'radial', y: 22 }, // 腋部，肱三头肌支发出之前
    groove: { node: 'radial', y: 11 }, // 桡神经沟远段，肱三头肌支大多已发出
    pin: { node: 'pin', y: -4 }, // Frohse 弓 / 旋后肌管
    srn: { node: 'srn', y: -14 }, // 从肱桡肌腱深面穿出处，桡骨茎突近侧约 8 cm（Ali 2014；Leroux 1998）
  },
  median: {
    high: { node: 'median', y: 6 }, // 肘上（髁上）
    ain: { node: 'ain', y: -3 },
    // 前臂屈肌支以远、掌皮支以近；掌皮支起于腕横纹近侧约 5 cm（Xu 2013：4.95 ± 0.88 cm）
    forearm: { node: 'median', y: -10 },
    carpal: { node: 'median', y: -23.5 }, // 腕管：从腕横纹向远侧延伸约 3–4 cm
  },
  ulnar: {
    elbow: { node: 'ulnar', y: 1.5 }, // 肱骨内上髁后方
    // 尺侧腕屈肌/指深屈肌支以远、手背支以近。手背支起于尺骨茎突近侧约 5–9 cm（Uerpairojkit 2019：6.8 cm），
    // 掌皮支多起于腕横纹近侧约 10 cm（Xu 2013：10.1 ± 1.5 cm），这里在它稍近端
    forearm: { node: 'ulnar', y: -11 },
    // Guyon 管在豌豆骨水平（约 −23），但 Z-Anatomy 的尺神经主干在 −19.8 就分支了，只能放在走行末端
    wrist: { node: 'ulnar', y: -19.7 },
  },
  musculocutaneous: {
    // 主干穿喙肱肌处在喙突下约 5.6 cm（Flatow 1989），即约 24；走行数据从 21.3 才开始，只能放在起点
    proximal: { node: 'musculocutaneous', y: 21.3 },
    // 穿喙肱肌后、肱二头肌支以近：肱二头肌支起于喙突下约 12 cm（Yang 1995：119 mm），
    // 或喙突—外上髁连线的 37%（Cambon-Binder 2015），即约 17.6–19.5
    arm: { node: 'musculocutaneous', y: 20 },
    elbow: { node: 'musculocutaneous', y: 2 }, // 外上髁水平，前臂外侧皮神经在肱二头肌腱外侧穿出深筋膜
  },
};
