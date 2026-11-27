# 清点 Z-Anatomy Startup.blend 里与臂丛、上肢神经和相关骨骼有关的对象。
# 用法：blender -b --disable-autoexec raw/z-anatomy/src/Z-Anatomy/Startup.blend --python tools/zanatomy/inspect.py -- out.json
import bpy, json, re, sys

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'inspect.json'

NERVE = re.compile(r'(brachial plexus|cord|trunk of|division of|musculocutaneous|axillary nerve|radial nerve|'
                   r'median nerve|ulnar nerve|interosseous nerve|thoracic nerve|scapular nerve|suprascapular|'
                   r'subscapular|thoracodorsal|pectoral nerve|subclavian nerve|cutaneous nerve|intercostobrachial|'
                   r'digital nerve|spinal nerve|ramus|rami|branch of (radial|median|ulnar|axillary))', re.I)
BONE = re.compile(r'(vertebra|atlas|axis|clavicle|scapula|rib\b|first rib|humerus|radius|ulna|sternum|manubrium)', re.I)

def info(o):
    d = {'name': o.name, 'type': o.type, 'parent': o.parent.name if o.parent else None,
         'collections': [c.name for c in o.users_collection]}
    if o.type == 'MESH':
        me = o.data
        d['tris'] = sum(len(p.vertices) - 2 for p in me.polygons)
        d['verts'] = len(me.vertices)
        mw = o.matrix_world
        ws = [mw @ v.co for v in me.vertices]
        if ws:
            d['bbox'] = [[round(min(w[i] for w in ws), 4) for i in range(3)],
                         [round(max(w[i] for w in ws), 4) for i in range(3)]]
    return d

rows = {'nerves': [], 'bones': []}
for o in bpy.data.objects:
    n = o.name
    if NERVE.search(n):
        rows['nerves'].append(info(o))
    elif BONE.search(n):
        rows['bones'].append(info(o))
rows['nerves'].sort(key=lambda d: d['name'])
rows['bones'].sort(key=lambda d: d['name'])
rows['unit_scale'] = bpy.context.scene.unit_settings.scale_length
rows['n_objects'] = len(bpy.data.objects)
with open(out, 'w') as f:
    json.dump(rows, f, ensure_ascii=False, indent=1)
print('WROTE', out, len(rows['nerves']), 'nerve-ish', len(rows['bones']), 'bone-ish')
