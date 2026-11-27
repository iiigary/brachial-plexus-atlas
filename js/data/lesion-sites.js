// 损伤部位在 3D 走行上的位置：LESION_SITES[预设][部位] = { node, y }。
// node 是该部位切断的结构（必须在部位的 sites 里），y 是 assets/plexus/plexus3d.json 的高度坐标（cm）：
// 腋窝约 25、肱骨中段约 12、肘约 0、腕约 −20。3D 视图取 node 走行上高度最接近 y 的点作为损伤点，
// 损伤点以近照常显示，以远画成受累；细枝按它从走行上发出的位置归入近端或远端。
// 没有条目的部位（臂丛的根/干、腋神经、胸长神经）标记放在切断结构的中点，整条结构画成受累。
// 位置要与模型的 plane 一致：同一结构上 plane 越大（越远端），y 越小。tests/check-plexus3d.mjs 会校验。
export const LESION_SITES = {
  radial: {
    axilla: { node: 'radial', y: 22 }, // 腋部，肱三头肌支发出之前
    groove: { node: 'radial', y: 11 }, // 肱骨中段桡神经沟，肱三头肌支大多已发出
    pin: { node: 'pin', y: -4 }, // Frohse 弓 / 旋后肌管
    srn: { node: 'srn', y: -13 }, // 前臂远段，桡浅支在肱桡肌腱下穿出处
  },
  median: {
    high: { node: 'median', y: 6 }, // 肘上（髁上）
    ain: { node: 'ain', y: -3 },
    forearm: { node: 'median', y: -10 }, // 前臂屈肌支以远、掌皮支以近
    carpal: { node: 'median', y: -21.5 },
  },
  ulnar: {
    elbow: { node: 'ulnar', y: 1.5 }, // 肱骨内上髁后方
    forearm: { node: 'ulnar', y: -11 }, // 尺侧腕屈肌/指深屈肌支以远、手背支与掌皮支以近
    wrist: { node: 'ulnar', y: -19.5 }, // Guyon 管
  },
  musculocutaneous: {
    proximal: { node: 'musculocutaneous', y: 20.5 },
    arm: { node: 'musculocutaneous', y: 13 },
    elbow: { node: 'musculocutaneous', y: 0 }, // 肱二头肌腱外侧，前臂外侧皮神经穿出深筋膜处
  },
};
