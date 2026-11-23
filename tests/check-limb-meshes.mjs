// 校验右上肢真实网格包（assets/limb/meshes.*）与纤维路由模型是否对应。
// 用法：node tests/check-limb-meshes.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { PlexusModel as M } from '../js/model.js';

const meta = JSON.parse(readFileSync(new URL('../assets/limb/meshes.json', import.meta.url), 'utf8'));
const bin = readFileSync(new URL('../assets/limb/meshes.bin', import.meta.url));
// BodyParts3D 4.0 没有背阔肌：界面上用图下方的文字按钮代替
const NO_MESH = new Set(['m_latissimus']);
let n = 0;
const check = (name, fn) => {
  try { fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; }
};

const motor = M.TARGETS.filter(t => t.kind === 'motor').map(t => t.id);
const zones = new Set(meta.parts.map(p => p.zone).filter(Boolean));

check('网格里的靶区都是运动靶区', () => {
  zones.forEach(id => assert.ok(motor.includes(id), `${id} 不是运动靶区`));
});

check('除无模型的靶区外，每个运动靶区都有网格', () => {
  motor.filter(id => !NO_MESH.has(id)).forEach(id => assert.ok(zones.has(id), `${id} 没有网格`));
  NO_MESH.forEach(id => assert.ok(!zones.has(id), `${id} 已有网格，应从 NO_MESH 里去掉`));
});

check('每个部件的顶点和索引都在 meshes.bin 范围内', () => {
  for (const p of meta.parts) {
    assert.strictEqual(p.posOffset % 4, 0, `${p.key} 顶点未对齐`);
    assert.strictEqual(p.idxOffset % 4, 0, `${p.key} 索引未对齐`);
    assert.ok(p.posOffset + p.vCount * 6 <= bin.byteLength, `${p.key} 顶点越界`);
    const isz = p.wide ? 4 : 2;
    assert.ok(p.idxOffset + p.iCount * isz <= bin.byteLength, `${p.key} 索引越界`);
    assert.strictEqual(p.iCount % 3, 0, `${p.key} 索引数不是 3 的倍数`);
    const ab = bin.buffer.slice(bin.byteOffset + p.idxOffset, bin.byteOffset + p.idxOffset + p.iCount * isz);
    const idx = p.wide ? new Uint32Array(ab) : new Uint16Array(ab);
    assert.ok(idx.every(i => i < p.vCount), `${p.key} 索引超出顶点数`);
  }
});

check('蚓状肌拆成 4 条，两个靶区各 2 条', () => {
  assert.strictEqual(meta.parts.filter(p => p.zone === 'm_lumb_lat').length, 2);
  assert.strictEqual(meta.parts.filter(p => p.zone === 'm_lumb_med').length, 2);
});

console.log(`✓ 右上肢网格 ${n} 项检查通过（${meta.parts.length} 个部件，${zones.size} 个靶区）`);
