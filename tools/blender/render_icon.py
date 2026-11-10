# アプリのアイコン(と Steam の素材の元絵)を Blender で描く
#   "C:/Program Files/Blender Foundation/Blender 4.3/blender.exe" -b --factory-startup -P tools/blender/render_icon.py -- public/models/items.glb build/icon.png 512
# 闇紋の秘伝書を、金の魔法陣の前に浮かべる
import bpy, math, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
GLB = argv[0] if argv else 'public/models/items.glb'
OUT = argv[1] if len(argv) > 1 else 'build/icon.png'
SIZE = int(argv[2]) if len(argv) > 2 else 512

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=GLB)
keep = 'item_tome_void'
root = bpy.data.objects.get(keep)
for o in list(scene.objects):
    p, ok = o, False
    while p:
        if p.name == keep:
            ok = True
            break
        p = p.parent
    if not ok:
        bpy.data.objects.remove(o, do_unlink=True)
root.location = (0, 0, 0)
root.rotation_mode = 'XYZ'
root.rotation_euler = (0.12, 0, 0.42)  # 表紙(-Y)を手前に、少し斜めに
bpy.context.view_layer.update()
# 大きさを揃えて中央へ
pts = []
for o in scene.objects:
    if o.type == 'MESH':
        pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
c, s = (mn + mx) / 2, max(mx - mn)
root.location = -c
root.scale = (1.85 / s,) * 3
root.location = -c * (1.85 / s) + Vector((0, -0.6, 0))

def emit_mat(name, col, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Emission Color'].default_value = (*col, 1); b.inputs['Emission Strength'].default_value = strength
    return m

# 背景: 暗い円盤と金の魔法陣
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.32, depth=0.02, location=(0, 0.5, 0), rotation=(math.pi / 2, 0, 0))
disc = bpy.context.active_object
dm = bpy.data.materials.new('disc'); dm.use_nodes = True
dm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.004, 0.003, 0.006, 1)
dm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.8
disc.data.materials.append(dm)
gold = emit_mat('ring', (0.85, 0.62, 0.28), 2.2)
for r, w in ((1.25, 0.022), (1.12, 0.008), (0.98, 0.012)):
    bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=w, major_segments=128, minor_segments=8, location=(0, 0.45, 0), rotation=(math.pi / 2, 0, 0))
    bpy.context.active_object.data.materials.append(gold)
for k in range(24):
    a = k / 24 * math.tau
    bpy.ops.mesh.primitive_cube_add(size=1, location=(1.185 * math.cos(a), 0.45, 1.185 * math.sin(a)), rotation=(0, -a, 0))
    t = bpy.context.active_object; t.scale = (0.05 if k % 2 else 0.025, 0.005, 0.006); t.data.materials.append(gold)
for k in range(6):  # 六芒の線
    a = k / 6 * math.tau
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.98 * math.cos(a) * 0.5 + 0.98 * math.cos(a + math.tau / 3) * 0.5, 0.46, 0.98 * math.sin(a) * 0.5 + 0.98 * math.sin(a + math.tau / 3) * 0.5),
                                    rotation=(0, -(a + math.tau / 6 + math.pi / 2), 0))
    t = bpy.context.active_object; t.scale = (0.98 * math.sqrt(3), 0.004, 0.006); t.data.materials.append(gold)

# 光
def light(kind, loc, energy, col, size=1.0):
    d = bpy.data.lights.new(kind + str(len(bpy.data.lights)), kind); d.energy = energy; d.color = col
    if kind == 'AREA': d.size = size
    o = bpy.data.objects.new(d.name, d); scene.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
light('AREA', (-2.2, -3.0, 2.6), 900, (1.0, 0.86, 0.68), 2.5)
light('AREA', (2.6, 1.0, 1.8), 600, (0.85, 0.7, 0.45), 1.5)
light('AREA', (1.5, -2.5, -1.5), 120, (0.5, 0.55, 0.8), 2.0)
w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.01, 0.008, 0.012, 1)

cam_d = bpy.data.cameras.new('cam'); cam_d.lens = 70
cam = bpy.data.objects.new('cam', cam_d); scene.collection.objects.link(cam)
cam.location = (0, -7.2, 0.25)
cam.rotation_euler = (math.radians(88), 0, 0)
scene.camera = cam
cam_d.type = 'ORTHO'; cam_d.ortho_scale = 2.75

scene.render.engine = 'CYCLES'
scene.cycles.samples = 96
scene.cycles.device = 'CPU'
scene.render.resolution_x = scene.render.resolution_y = SIZE
scene.render.film_transparent = True
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Punchy'
os.makedirs(os.path.dirname(OUT) or '.', exist_ok=True)
scene.render.filepath = os.path.abspath(OUT)
bpy.ops.render.render(write_still=True)
print('ICON ->', OUT)
