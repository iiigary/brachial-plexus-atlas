# 导出右侧臂丛/上肢神经与动脉曲线的中心线（世界坐标），以及配准用的骨骼和椎骨、背阔肌、斜角肌网格。
# 神经与动脉在 Z-Anatomy 里是带倒角的曲线：直接取 Bezier 控制点和手柄。
# 用法：blender -b --disable-autoexec <Startup.blend> --python tools/zanatomy/curves.py -- <outdir>
# 输出 <outdir>/curves.json、<outdir>/bones.json（three 坐标：cm，Y 上，Z 前；Blender 为 m，Z 上，−Y 前）
import bpy, json, sys, os

outdir = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '.'
os.makedirs(outdir, exist_ok=True)

def T(v):  # Blender 世界 (x, y, z) m → three (x, z, −y) cm
    return [round(v[0] * 100, 3), round(v[2] * 100, 3), round(-v[1] * 100, 3)]

def plexus_root(o):
    p = o
    while p:
        if p.name in ('Brachial plexus.g',):
            return True
        p = p.parent
    return False

NERVE_NAMES = [
    'Roots of brachial plexus', 'Superior trunk of brachial plexus', 'Middle trunk of brachial plexus',
    'Inferior trunk of brachial plexus',
    *[f'{d} division of {t} trunk of brachial plexus' for t in ('superior', 'middle', 'inferior') for d in ('Anterior', 'Posterior')],
    'Posterior cord of brachial plexus',
    'Musculocutaneous nerve', 'Lateral antebrachial cutaneous nerve', 'Axillary nerve', 'Muscular branches of axillary nerve',
    'Superior lateral brachial cutaneous nerve', 'Radial nerve', 'Deep branch of radial nerve',
    'Posterior interosseous nerve of forearm', 'Superficial branch of radial nerve', 'Dorsal digital branches of radial nerve',
    'Muscular branches of radial nerve', 'Inferior lateral brachial cutaneous nerve', 'Posterior antebrachial cutaneous nerve',
    'Median nerve', 'Anterior interosseous nerve of forearm', 'Palmar branch of median nerve', 'Muscular branches of median nerve',
    'Common palmar digital branches of median nerve', 'Proper palmar digital branches of median nerve',
    '(Communicating branch of median nerve with ulnar nerve)',
    'Ulnar nerve', 'Deep branch of ulnar nerve', 'Superficial branch of ulnar nerve', 'Dorsal branch of ulnar nerve',
    'Palmar branch of ulnar nerve', 'Muscular branches of ulnar nerve', 'Common palmar digital branches of ulnar nerve',
    'Proper palmar digital branches of ulnar nerve', 'Dorsal digital branches of ulnar nerve',
    'Dorsal scapular nerve', 'Long thoracic nerve', 'Suprascapular nerve', 'Subclavian nerve',
    'Lateral pectoral nerve', 'Medial pectoral nerve', 'Superior subscapular nerve', 'Inferior subscapular nerve',
    'Thoracodorsal nerve', 'Medial brachial cutaneous nerve', 'Medial antebrachial cutaneous nerve',
    'Anterior branch of medial antebrachial cutaneous nerve', 'Posterior branch of medial antebrachial cutaneous nerve',
    # 相邻结构（参考用）
    'Anterior root of spinal nerve', 'Posterior root of spinal nerve',
    'Axillary artery', 'Brachial artery', 'Deep brachial artery', 'Radial artery', 'Ulnar artery',
    'Posterior circumflex humeral artery', 'Superficial palmar arch', 'Vertebral artery',
]
# 名称不带 .r 的对象
PLAIN_NAMES = ['Right subclavian artery']
BONE_NAMES = ['Clavicle.r', 'Scapula.r', 'Humerus.r', 'Radius.r', 'Ulna.r', 'First rib.r', 'Second rib.r',
              'Vertebra C3', 'Vertebra C4', 'Vertebra C5', 'Vertebra C6', 'Vertebra C7', 'Vertebra T1', 'Vertebra T2',
              'Manubrium of sternum']
MUSCLE_NAMES = ['Latissimus dorsi muscle.r', 'Scalenus anterior muscle.r', 'Scalenus medius muscle.r']

dg = bpy.context.evaluated_depsgraph_get()
curves, missing = {}, []
for base in NERVE_NAMES + PLAIN_NAMES:
    o = bpy.data.objects.get(base if base in PLAIN_NAMES else base + '.r')
    if not o:
        missing.append(base); continue
    cu = o.data
    mw = o.matrix_world
    splines = []
    for s in cu.splines:
        if s.type == 'BEZIER':
            pts = [(mw @ p.co, p.radius) for p in s.bezier_points]
            # 同时给出手柄，便于精确重建
            hs = [[T(mw @ p.handle_left), T(mw @ p.handle_right)] for p in s.bezier_points]
        else:
            pts = [(mw @ p.co.to_3d(), p.radius) for p in s.points]
            hs = None
        splines.append({'type': s.type, 'pts': [T(c) for c, _ in pts], 'r': [round(r, 3) for _, r in pts],
                        'handles': hs, 'cyclic': s.use_cyclic_u})
    # 求值后的网格（倒角管）三角形数和整体包围盒
    ev = o.evaluated_get(dg)
    try:
        me = ev.to_mesh(); tris = sum(len(p.vertices) - 2 for p in me.polygons); ev.to_mesh_clear()
    except Exception:
        tris = None
    sc = mw.to_scale()
    curves[base] = {'parent': o.parent.name if o.parent else None, 'bevel_depth_cm': round(cu.bevel_depth * 100 * sc[0], 3),
                    'bevel_object': cu.bevel_object.name if cu.bevel_object else None, 'extrude': cu.extrude,
                    'resolution': cu.resolution_u, 'tris': tris, 'splines': splines}

def mesh_dump(name):
    o = bpy.data.objects.get(name)
    if not o or o.type != 'MESH':
        return None
    ev = o.evaluated_get(dg); me = ev.to_mesh(); mw = o.matrix_world
    me.calc_loop_triangles()
    pos = [c for v in me.vertices for c in T(mw @ v.co)]
    idx = [i for t in me.loop_triangles for i in t.vertices]
    ev.to_mesh_clear()
    return {'pos': pos, 'idx': idx}

bones = {}
for n in BONE_NAMES + MUSCLE_NAMES:
    m = mesh_dump(n)
    if m: bones[n] = m
    else: missing.append(n)

json.dump({'curves': curves, 'missing': missing}, open(os.path.join(outdir, 'curves.json'), 'w'), ensure_ascii=False)
json.dump(bones, open(os.path.join(outdir, 'bones.json'), 'w'))
print('CURVES', len(curves), 'BONES', len(bones), 'MISSING', missing)
