// 读取量化网格包（assets/*/meshes.{json,bin}，由 tools/ 下的脚本生成）。
// 同一个包只下载、解码一次：右上肢视图和 3D 视图共用同一份几何。
import * as THREE from 'three';

const cache = new Map();

async function fetchOk(url, as) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r[as]();
}

export function loadMeshPack(base) {
  if (!cache.has(base)) {
    const p = Promise.all([fetchOk(`${base}.json`, 'json'), fetchOk(`${base}.bin`, 'arrayBuffer')]).then(([meta, buf]) => {
      const { qMin, qRange } = meta;
      return meta.parts.map(p => {
        const q = new Uint16Array(buf, p.posOffset, p.vCount * 3);
        const pos = new Float32Array(q.length);
        for (let i = 0; i < q.length; i++) pos[i] = q[i] / 65535 * qRange[i % 3] + qMin[i % 3];
        const idx = p.wide ? new Uint32Array(buf, p.idxOffset, p.iCount) : new Uint16Array(buf, p.idxOffset, p.iCount);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setIndex(new THREE.BufferAttribute(idx, 1));
        g.computeVertexNormals();
        g.computeBoundingSphere();
        return { ...p, geometry: g };
      });
    });
    p.catch(() => cache.delete(base)); // 失败了下次再试
    cache.set(base, p);
  }
  return cache.get(base);
}

export function fetchJson(url) {
  return fetchOk(url, 'json');
}
