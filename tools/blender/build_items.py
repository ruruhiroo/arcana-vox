# 道具と装備の模型を作って public/models/items.glb に書き出す(所持品の絵・道具欄・手に持つ瓶に使う)
#   "C:/Program Files/Blender Foundation/Blender 4.3/blender.exe" -b --factory-startup -P tools/blender/build_items.py -- public/models/items.glb
# 一つの GLB の中に item_<鍵> という名前の空(Empty)を並べ、その子に部品を入れる。
# 色を属性ごとに塗り替える部品は、素材の名前を gem / cover / cloth / ribbon にしておく(ゲーム側で塗り替える)。
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'public/models/items.glb'
TAU = math.pi * 2
random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
MATS = {}


def hexc(c):
    return (((c >> 16) & 255) / 255) ** 2.2, (((c >> 8) & 255) / 255) ** 2.2, ((c & 255) / 255) ** 2.2


def mat(name, col, rough=0.6, metal=0.0, emit=None, emit_str=0.0, trans=0.0, alpha=1.0, ior=1.45):
    key = name
    if key in MATS:
        return MATS[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*hexc(col), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit is not None:
        b.inputs['Emission Color'].default_value = (*hexc(emit), 1)
        b.inputs['Emission Strength'].default_value = emit_str
    if trans:
        b.inputs['Transmission Weight'].default_value = trans
        b.inputs['IOR'].default_value = ior
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND'
    MATS[key] = m
    return m


def new_obj(name, bm, material, parent, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    me.materials.append(material)
    ob.parent = parent
    return ob


def lathe(name, prof, material, parent, segs=32, cap_top=False, cap_bot=False, smooth=True):
    """prof: [(半径, 高さ), ...] を Z 軸まわりに回した器"""
    bm = bmesh.new()
    rings = []
    for r, z in prof:
        ring = [bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for a in (i / segs * TAU for i in range(segs))]
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap_bot:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj(name, bm, material, parent, smooth)


def prim(kind, name, material, parent, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), smooth=True, **kw):
    fn = {'cube': bpy.ops.mesh.primitive_cube_add, 'uv': bpy.ops.mesh.primitive_uv_sphere_add, 'ico': bpy.ops.mesh.primitive_ico_sphere_add,
          'cyl': bpy.ops.mesh.primitive_cylinder_add, 'cone': bpy.ops.mesh.primitive_cone_add, 'torus': bpy.ops.mesh.primitive_torus_add}[kind]
    fn(location=loc, rotation=rot, **kw)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = scale
    ob.data.materials.append(material)
    if smooth:
        for p in ob.data.polygons:
            p.use_smooth = True
    ob.parent = parent
    return ob


def bevel(ob, w=0.02, seg=2):
    m = ob.modifiers.new('bevel', 'BEVEL')
    m.width = w
    m.segments = seg
    m.limit_method = 'ANGLE'
    return ob


def subsurf(ob, lv=1):
    m = ob.modifiers.new('sub', 'SUBSURF')
    m.levels = lv
    m.render_levels = lv
    return ob


def jitter(ob, amt):
    for v in ob.data.vertices:
        v.co += Vector((random.uniform(-amt, amt), random.uniform(-amt, amt), random.uniform(-amt, amt)))


def root(key):
    e = bpy.data.objects.new('item_' + key, None)
    scene.collection.objects.link(e)
    return e


# ---------------- 素材 ----------------
GLASS = lambda: mat('glass', 0xc8d8e8, rough=0.04, trans=1.0, alpha=0.35)
GOLD = lambda: mat('gold', 0xc89a48, rough=0.3, metal=1.0)
BRASS = lambda: mat('brass', 0x9a7a3a, rough=0.42, metal=1.0)
IRON = lambda: mat('iron', 0x8a8a92, rough=0.45, metal=0.7)
RUST = lambda: mat('rust', 0x6a2e14, rough=0.95, metal=0.2)
WOOD = lambda: mat('wood', 0x5a3a1e, rough=0.75)
CORK = lambda: mat('cork', 0x8a6440, rough=0.95)
WAX = lambda: mat('wax', 0x8a1410, rough=0.35)
PAPER = lambda: mat('paper', 0xd8c49a, rough=0.95)
TWINE = lambda: mat('twine', 0x8a6a40, rough=1.0)
BONE = lambda: mat('bone', 0xd6c8a4, rough=0.8)
LEATHER = lambda: mat('cover', 0x5a2c1a, rough=0.7)
PAGES = lambda: mat('pages', 0xe0d0a8, rough=0.95)
GEM = lambda: mat('gem', 0x4a7ab0, rough=0.05, emit=0x4a7ab0, emit_str=0.6)
INK = lambda: mat('ink', 0x9a1a10, rough=0.6)


# ---------------- 道具 ----------------
def ether():
    r = root('ether')
    lathe('glass', [(0.0, 0.0), (0.3, 0.005), (0.38, 0.06), (0.42, 0.2), (0.41, 0.36), (0.3, 0.54), (0.15, 0.66), (0.115, 0.72), (0.115, 0.86), (0.15, 0.9), (0.14, 0.93), (0.1, 0.93)], GLASS(), r, cap_bot=True)
    lathe('liquid', [(0.0, 0.03), (0.32, 0.04), (0.39, 0.12), (0.395, 0.26), (0.36, 0.38), (0.0, 0.38)], mat('liquid', 0x2448c0, rough=0.15, emit=0x2a50e0, emit_str=1.4), r, cap_bot=True, cap_top=False)
    lathe('cork', [(0.0, 0.84), (0.1, 0.84), (0.11, 0.95), (0.12, 1.04), (0.0, 1.06)], CORK(), r, segs=16, cap_bot=True)
    lathe('seal', [(0.0, 0.99), (0.135, 0.99), (0.15, 1.02), (0.13, 1.09), (0.0, 1.11)], WAX(), r, segs=20, cap_bot=True)
    t = prim('torus', 'string', TWINE(), r, loc=(0, 0, 0.76), major_radius=0.125, minor_radius=0.014, major_segments=24, minor_segments=6)
    # 首から下がる札
    tag = prim('cube', 'tag', PAPER(), r, loc=(0.18, -0.13, 0.55), rot=(0.1, 0.25, -0.6), scale=(0.07, 0.006, 0.1), smooth=False)
    bevel(tag, 0.01)
    return r


def herb():
    r = root('herb')
    leaf_m = mat('leaf', 0x3a7a2a, rough=0.6)
    leaf_m2 = mat('leaf2', 0x5a9a3a, rough=0.55)
    stem_m = mat('stem', 0x4a6a2a, rough=0.7)
    for i in range(7):
        a = i / 7 * TAU + random.uniform(-0.2, 0.2)
        tilt = random.uniform(0.12, 0.35)
        h = random.uniform(0.75, 1.0)
        s = prim('cyl', 'stem%d' % i, stem_m, r, loc=(math.cos(a) * 0.04, math.sin(a) * 0.04, h / 2), rot=(math.sin(a) * tilt, -math.cos(a) * tilt, 0), scale=(0.018, 0.018, h / 2), vertices=6)
        for j in range(3):
            z = h * (0.45 + j * 0.22)
            la = a + j * 1.7
            bm = bmesh.new()
            # 葉: 先の尖った楕円を中央で少し折る
            pts = []
            for k in range(13):
                t = k / 12
                w = math.sin(t * math.pi) * 0.09 * (1 - t * 0.3)
                pts.append((t * 0.34, w, abs(w) * 0.6))
            for k in range(12, -1, -1):
                t = k / 12
                w = math.sin(t * math.pi) * 0.09 * (1 - t * 0.3)
                pts.append((t * 0.34, -w, abs(w) * 0.6))
            vs = [bm.verts.new(p) for p in pts[:-1]]
            bm.faces.new(vs)
            ob = new_obj('leaf%d_%d' % (i, j), bm, leaf_m if (i + j) % 2 else leaf_m2, r)
            sx = math.sin(a) * tilt
            ob.location = (math.cos(a) * (0.04 + z * tilt), math.sin(a) * (0.04 + z * tilt), z)
            ob.rotation_euler = (0, -0.5 - j * 0.15, la)
            sol = ob.modifiers.new('sol', 'SOLIDIFY')
            sol.thickness = 0.008
    for z in (0.18, 0.24):
        prim('torus', 'tie', TWINE(), r, loc=(0, 0, z), major_radius=0.07, minor_radius=0.014, major_segments=20, minor_segments=6)
    return r


def crystal():
    r = root('crystal')
    rock = prim('ico', 'rock', mat('rock', 0x3a3632, rough=0.95), r, loc=(0, 0, 0.08), scale=(0.5, 0.42, 0.2), subdivisions=2, smooth=False)
    jitter(rock, 0.05)
    cm = mat('crystal', 0x5a9ad8, rough=0.08, emit=0x3a7ad0, emit_str=1.1, trans=0.4, alpha=0.88)
    shards = [(0, 0, 0.95, 0, 0.13), (0.17, 0.06, 0.62, 0.42, 0.09), (-0.16, 0.08, 0.7, -0.38, 0.1), (0.05, -0.17, 0.5, 0.3, 0.08), (-0.08, -0.12, 0.42, -0.5, 0.07), (0.26, -0.08, 0.36, 0.7, 0.06)]
    for i, (x, y, h, lean, rad) in enumerate(shards):
        bm = bmesh.new()
        bot = [bm.verts.new((rad * math.cos(a), rad * math.sin(a), 0)) for a in (k / 6 * TAU for k in range(6))]
        top = [bm.verts.new((rad * 0.92 * math.cos(a), rad * 0.92 * math.sin(a), h * 0.78)) for a in (k / 6 * TAU for k in range(6))]
        tip = bm.verts.new((0, 0, h))
        for k in range(6):
            j = (k + 1) % 6
            bm.faces.new((bot[k], bot[j], top[j], top[k]))
            bm.faces.new((top[k], top[j], tip))
        bm.faces.new(list(reversed(bot)))
        ob = new_obj('shard%d' % i, bm, cm, r, smooth=False)
        ob.location = (x, y, 0.1)
        ob.rotation_euler = (math.sin(lean * 3) * abs(lean), lean, random.uniform(0, 1))
    return r


def bone():
    r = root('bone')
    # 大腿骨: 軸を少し反らせ、両端に二つずつの瘤
    bm = bmesh.new()
    segs, rings = 12, 14
    prev = None
    for k in range(rings + 1):
        t = k / rings
        z = (t - 0.5) * 1.1
        rad = 0.075 + 0.03 * (abs(t - 0.5) * 2) ** 3
        off = math.sin(t * math.pi) * 0.04
        ring = [bm.verts.new((off + rad * math.cos(a), rad * math.sin(a), z)) for a in (i / segs * TAU for i in range(segs))]
        if prev:
            for i in range(segs):
                j = (i + 1) % segs
                bm.faces.new((prev[i], prev[j], ring[j], ring[i]))
        prev = ring
    new_obj('shaft', bm, BONE(), r)
    for z, s in ((0.56, 1), (-0.56, -1)):
        for dx in (-0.075, 0.075):
            k = prim('uv', 'knob', BONE(), r, loc=(dx, 0, z), scale=(0.11, 0.1, 0.12), segments=16, ring_count=10)
        prim('uv', 'cap', BONE(), r, loc=(0, 0, z - s * 0.06), scale=(0.12, 0.09, 0.08), segments=16, ring_count=10)
    r.rotation_euler = (0, 1.0, 0.3)
    return r


def iron():
    """鉄屑: 錆びた鉄の延べ棒を二本交差させ、歯車と曲がった釘を添える"""
    r = root('iron')
    ingot = mat('ingot', 0x7a7470, rough=0.45, metal=0.75)
    rust = mat('rust2', 0x9a4a1e, rough=0.95, metal=0.1)
    for i, (z, rz) in enumerate(((0.0, 0.25), (0.13, -0.55))):
        bm = bmesh.new()
        L, W1, W2, T = 0.42, 0.13, 0.09, 0.11   # 下が広く上が狭い延べ棒
        pts = [(-L, -W1, 0), (L, -W1, 0), (L, W1, 0), (-L, W1, 0), (-L * 0.9, -W2, T), (L * 0.9, -W2, T), (L * 0.9, W2, T), (-L * 0.9, W2, T)]
        v = [bm.verts.new(p) for p in pts]
        for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            bm.faces.new([v[k] for k in f])
        ob = new_obj('ingot%d' % i, bm, ingot, r, smooth=False)
        ob.location = (0, 0, z); ob.rotation_euler = (0, 0, rz)
        bevel(ob, 0.015, 2)
        for k in range(3):
            rp = prim('ico', 'rust', rust, r, loc=(math.cos(rz) * (-0.25 + k * 0.22), math.sin(rz) * (-0.25 + k * 0.22), z + 0.1), scale=(0.07, 0.06, 0.015), subdivisions=1, smooth=False)
            jitter(rp, 0.01)
    # 歯車
    cog = prim('cyl', 'cog', IRON(), r, loc=(0.3, -0.28, 0.06), scale=(0.11, 0.11, 0.03), vertices=20)
    for k in range(10):
        a = k / 10 * TAU
        prim('cube', 'tooth', IRON(), r, loc=(0.3 + 0.13 * math.cos(a), -0.28 + 0.13 * math.sin(a), 0.06), rot=(0, 0, a), scale=(0.025, 0.02, 0.03), smooth=False)
    prim('cyl', 'hub', rust, r, loc=(0.3, -0.28, 0.095), scale=(0.035, 0.035, 0.01), vertices=12)
    # 曲がった釘
    for k in range(2):
        nl = prim('cyl', 'nail', IRON(), r, loc=(-0.32 + k * 0.1, 0.3, 0.03), rot=(0, math.pi / 2, 0.4 + k * 0.5), scale=(0.012, 0.012, 0.14), vertices=6)
        sd = nl.modifiers.new('bend', 'SIMPLE_DEFORM'); sd.deform_method = 'BEND'; sd.angle = 1.0; sd.deform_axis = 'X'
    r.rotation_euler = (-0.75, 0, 0.3)  # 上から見下ろして形を見せる
    return r


def scroll():
    r = root('scroll')
    # 巻いた紙: 渦巻きの断面を押し出す
    bm = bmesh.new()
    turns, n = 3.2, 64
    prof = [((0.05 + 0.17 * k / n) * math.cos(k / n * turns * TAU), (0.05 + 0.17 * k / n) * math.sin(k / n * turns * TAU)) for k in range(n + 1)]
    bot = [bm.verts.new((x, y, -0.5)) for x, y in prof]
    top = [bm.verts.new((x, y, 0.5)) for x, y in prof]
    for k in range(n):
        bm.faces.new((bot[k], bot[k + 1], top[k + 1], top[k]))
    ob = new_obj('sheet', bm, PAPER(), r)
    ob.modifiers.new('sol', 'SOLIDIFY').thickness = 0.012
    for z in (-0.56, 0.56):
        prim('cyl', 'rod', WOOD(), r, loc=(0, 0, z), scale=(0.06, 0.06, 0.07), vertices=12)
        prim('uv', 'knob', WOOD(), r, loc=(0, 0, z * 1.14), scale=(0.075, 0.075, 0.05), segments=12, ring_count=8)
    prim('torus', 'ribbon', mat('ribbon', 0x6a1a14, rough=0.6), r, loc=(0, 0, 0.05), major_radius=0.235, minor_radius=0.018, major_segments=32, minor_segments=6)
    prim('cyl', 'wax', WAX(), r, loc=(0.25, 0, 0.05), rot=(0, math.pi / 2, 0), scale=(0.08, 0.08, 0.025), vertices=16)
    r.rotation_euler = (0.25, 1.15, 0.2)
    return r


def frag():
    r = root('frag')
    bm = bmesh.new()
    pts = [(-0.4, -0.5), (-0.1, -0.46), (0.05, -0.52), (0.3, -0.47), (0.42, -0.22), (0.35, 0.02), (0.46, 0.28), (0.3, 0.52), (0.05, 0.47), (-0.38, 0.5), (-0.3, 0.22), (-0.45, -0.08)]
    vs = [bm.verts.new((x, y, 0)) for x, y in pts]
    f = bm.faces.new(vs)
    bmesh.ops.triangulate(bm, faces=[f])
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=3, use_grid_fill=True)
    ob = new_obj('paper', bm, PAPER(), r)
    for v in ob.data.vertices:
        v.co.z = 0.12 * (v.co.x ** 2) + 0.05 * math.sin(v.co.y * 5)
    ob.modifiers.new('sol', 'SOLIDIFY').thickness = 0.01
    # 書かれた文字の名残
    for i in range(4):
        prim('cube', 'line', mat('inkd', 0x3a2410, rough=0.9), r, loc=(-0.05, 0.3 - i * 0.18, 0.03 + 0.12 * 0.0025), scale=(0.25 - i * 0.03, 0.012, 0.002), smooth=False)
    r.rotation_euler = (-0.9, 0.2, 0.3)
    return r


def amulet():
    r = root('amulet')
    p = prim('cube', 'paper', PAPER(), r, loc=(0, 0, 0), scale=(0.2, 0.008, 0.5), smooth=False)
    bevel(p, 0.004)
    # 朱の印: 円と縦線と横線を浮き彫りに
    prim('torus', 'circle', INK(), r, loc=(0, -0.012, 0.28), rot=(math.pi / 2, 0, 0), major_radius=0.08, minor_radius=0.012, major_segments=28, minor_segments=4)
    prim('cube', 'v', INK(), r, loc=(0, -0.012, -0.08), scale=(0.012, 0.004, 0.3), smooth=False)
    for z, w in ((0.02, 0.13), (-0.16, 0.11), (-0.3, 0.08)):
        prim('cube', 'h', INK(), r, loc=(0, -0.012, z), scale=(w, 0.004, 0.012), smooth=False)
    prim('cyl', 'cord', TWINE(), r, loc=(0, 0, 0.66), scale=(0.008, 0.008, 0.16), vertices=6)
    prim('torus', 'loop', TWINE(), r, loc=(0, 0, 0.82), rot=(math.pi / 2, 0, 0), major_radius=0.05, minor_radius=0.008, major_segments=16, minor_segments=4)
    r.rotation_euler = (0, 0, 0.12)
    return r


def flash():
    r = root('flash')
    prim('uv', 'orb', GLASS(), r, loc=(0, 0, 0.4), scale=(0.4, 0.4, 0.4), segments=32, ring_count=20)
    prim('uv', 'core', mat('flashcore', 0xfff2c0, rough=0.3, emit=0xfff0b0, emit_str=6), r, loc=(0, 0, 0.4), scale=(0.18, 0.18, 0.18), segments=16, ring_count=10)
    # 金具: 帯と蓋と輪
    lathe('cap', [(0.0, 0.84), (0.16, 0.76), (0.19, 0.78), (0.17, 0.86), (0.08, 0.9), (0.0, 0.9)], BRASS(), r, segs=24)
    for a in range(4):
        b = prim('cube', 'band', BRASS(), r, loc=(0, 0, 0.4), rot=(0, 0, a * math.pi / 4), scale=(0.41, 0.012, 0.41), smooth=False)
        b.modifiers.new('cast', 'CAST').factor = 1.0
        b.scale = (0.408, 0.012, 0.408)
    prim('torus', 'ring', BRASS(), r, loc=(0, 0, 0.98), rot=(math.pi / 2, 0, 0), major_radius=0.07, minor_radius=0.018, major_segments=16, minor_segments=6)
    return r


def lantern():
    r = root('lantern')
    # 六角の鉄枠に硝子、中に蝋燭の火
    lathe('base', [(0.0, 0.0), (0.34, 0.0), (0.36, 0.05), (0.3, 0.1), (0.0, 0.1)], IRON(), r, segs=6, smooth=False)
    lathe('roof', [(0.0, 0.86), (0.36, 0.78), (0.34, 0.74), (0.3, 0.76), (0.12, 0.98), (0.07, 1.06), (0.0, 1.06)], IRON(), r, segs=6, smooth=False)
    for k in range(6):
        a = k / 6 * TAU
        prim('cube', 'post', IRON(), r, loc=(0.3 * math.cos(a), 0.3 * math.sin(a), 0.43), rot=(0, 0, a), scale=(0.022, 0.022, 0.34), smooth=False)
    lathe('pane', [(0.29, 0.1), (0.29, 0.77)], mat('lantglass', 0xd8b878, rough=0.15, emit=0xff9a30, emit_str=0.5, alpha=0.35), r, segs=6, smooth=False)
    prim('cyl', 'candle', mat('candle', 0xe8dcc0, rough=0.6), r, loc=(0, 0, 0.22), scale=(0.07, 0.07, 0.12), vertices=12)
    prim('uv', 'flame', mat('flame', 0xffc060, rough=0.5, emit=0xffa030, emit_str=8), r, loc=(0, 0, 0.42), scale=(0.04, 0.04, 0.09), segments=10, ring_count=8)
    prim('torus', 'handle', IRON(), r, loc=(0, 0, 1.16), rot=(math.pi / 2, 0, 0), major_radius=0.13, minor_radius=0.02, major_segments=20, minor_segments=6)
    return r


# ---------------- 本・装備(build_items.py に差し込む部分) ----------------
# 本は表紙を -Y(=ゲームの手前)に向けて作る。2D の形は (x, z) で書いて -Y 方向へ押し出す
EL_HEX = {'fire': 0xe0602a, 'ice': 0x8ad0f0, 'thunder': 0xb8a0ff, 'wind': 0x7ad8a0, 'holy': 0xf0d890, 'void': 0x9a5ae0}
EL_DARK = {'fire': 0x4a1a10, 'ice': 0x1a3248, 'thunder': 0x2a2048, 'wind': 0x173a2a, 'holy': 0x5a4a2a, 'void': 0x22122e}


def elmetal(el):
    return mat('em_' + el, EL_HEX[el], rough=0.3, metal=0.6, emit=EL_HEX[el], emit_str=1.6)


def shape_prism(name, pts, depth, material, parent, y0=0.0, bev=0.0, loc=(0, 0, 0), rot=(0, 0, 0)):
    bm = bmesh.new()
    vs = [bm.verts.new((x, y0, z)) for x, z in pts]
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    nv = [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=nv, vec=(0, -depth, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_obj(name, bm, material, parent, smooth=False)
    ob.location = loc
    ob.rotation_euler = rot
    if bev:
        bevel(ob, bev, 2)
    return ob


def rect_pts(cx, cz, w, h, a=0.0):
    ca, sa = math.cos(a), math.sin(a)
    out = []
    for x, z in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
        out.append((cx + x * ca - z * sa, cz + x * sa + z * ca))
    return out


def arc_pts(cx, cz, r, a0, a1, w, n=14):
    outer = [(cx + (r + w / 2) * math.cos(a0 + (a1 - a0) * k / n), cz + (r + w / 2) * math.sin(a0 + (a1 - a0) * k / n)) for k in range(n + 1)]
    inner = [(cx + (r - w / 2) * math.cos(a0 + (a1 - a0) * k / n), cz + (r - w / 2) * math.sin(a0 + (a1 - a0) * k / n)) for k in range(n, -1, -1)]
    return outer + inner


def star_pts(n, r1, r2, a0=math.pi / 2):
    return [((r1 if k % 2 == 0 else r2) * math.cos(a0 + k * math.pi / n), (r1 if k % 2 == 0 else r2) * math.sin(a0 + k * math.pi / n)) for k in range(n * 2)]


def emblem(el, parent, y0, s=1.0, cx=0.0, cz=0.0, depth=0.03, m=None):
    """属性の紋を浮き彫りで置く"""
    m = m or elmetal(el)
    P = lambda pts: [(cx + x * s, cz + z * s) for x, z in pts]
    if el == 'fire':
        shape_prism('em_fire', P([(0, 0.32), (0.1, 0.16), (0.17, 0.02), (0.16, -0.13), (0.08, -0.23), (0, -0.26), (-0.09, -0.23), (-0.16, -0.12), (-0.17, 0.02), (-0.11, 0.1), (-0.07, -0.01), (-0.04, 0.14)]), depth, m, parent, y0, 0.006)
        shape_prism('em_fire2', P([(0.0, 0.08), (0.06, -0.04), (0.05, -0.14), (0, -0.18), (-0.05, -0.14), (-0.06, -0.06), (-0.02, 0.0)]), depth * 1.6, mat('fire_core', 0xffd070, rough=0.3, emit=0xffc040, emit_str=3), parent, y0, 0.004)
    elif el == 'thunder':
        shape_prism('em_bolt', P([(0.07, 0.33), (-0.15, 0.0), (-0.02, 0.0), (-0.09, -0.33), (0.16, 0.05), (0.03, 0.05), (0.13, 0.33)]), depth, m, parent, y0, 0.006)
    elif el == 'ice':
        for k in range(3):
            a = k * math.pi / 3
            shape_prism('em_bar', P(rect_pts(0, 0, 0.05, 0.6, a)), depth, m, parent, y0, 0.004)
            for sgn in (1, -1):
                for d in (0.18, -0.18):
                    bx, bz = -math.sin(a) * d, math.cos(a) * d
                    shape_prism('em_br', P(rect_pts(bx + -math.sin(a + sgn * 0.7) * 0.05, bz + math.cos(a + sgn * 0.7) * 0.05, 0.035, 0.12, a + sgn * 0.7)), depth, m, parent, y0)
    elif el == 'wind':
        for i, (r, a0, a1, z) in enumerate(((0.15, -0.3, 3.4, 0.1), (0.1, 3.0, 6.0, -0.12), (0.06, -0.5, 2.6, 0.0))):
            shape_prism('em_arc%d' % i, P(arc_pts(0.05 - i * 0.05, z, r, a0, a1, 0.05)), depth, m, parent, y0, 0.004)
    elif el == 'holy':
        shape_prism('em_cross', P([(-0.04, 0.32), (0.04, 0.32), (0.04, 0.12), (0.18, 0.12), (0.18, 0.04), (0.04, 0.04), (0.04, -0.32), (-0.04, -0.32), (-0.04, 0.04), (-0.18, 0.04), (-0.18, 0.12), (-0.04, 0.12)]), depth, m, parent, y0, 0.005)
        t = prim('torus', 'em_halo', m, parent, loc=(cx, y0 - depth / 2, cz + 0.08 * s), rot=(math.pi / 2, 0, 0), major_radius=0.17 * s, minor_radius=0.014 * s, major_segments=32, minor_segments=6)
    elif el == 'void':
        R1, R2, d = 0.26, 0.21, 0.1
        outer = [(R1 * math.cos(a), R1 * math.sin(a)) for a in (math.radians(50 + 260 * k / 20) for k in range(21))]
        inner = [(d + R2 * math.cos(a), R2 * math.sin(a)) for a in (math.radians(-71 - 218 * k / 20) for k in range(21))]
        shape_prism('em_moon', P(outer + inner), depth, m, parent, y0, 0.004)
        prim('ico', 'em_star', m, parent, loc=(cx + 0.14 * s, y0 - depth, cz + 0.02 * s), scale=(0.04 * s, 0.02, 0.04 * s), subdivisions=1, smooth=False)


def make_book(key, W=0.8, H=1.1, T=0.3, board=None, spine=None, corner_mat=None, corner='plate', pages=None, strap=None, rot=(0.22, 0, 0.62)):  # 背と厚みが見える斜めの向き
    r = root(key)
    board = board or LEATHER()
    spine = spine or board
    pages = pages or PAGES()
    bt, ov = 0.045, 0.035
    for sgn in (-1, 1):
        c = prim('cube', 'board', board, r, loc=(ov / 2, sgn * (T / 2 - bt / 2), 0), scale=((W + ov) / 2, bt / 2, H / 2 + ov), smooth=False)
        bevel(c, 0.016, 3)
    pg = prim('cube', 'pages', pages, r, loc=(0.0, 0, 0), scale=(W / 2 - 0.01, T / 2 - bt + 0.004, H / 2), smooth=False)
    bevel(pg, 0.008)
    # 背: 丸みのある背と、盛り上がった綴じ目
    sp = prim('cyl', 'spine', spine, r, loc=(-W / 2, 0, 0), scale=(0.07, T / 2, H / 2 + ov), vertices=24)
    for z in (-0.33, -0.11, 0.11, 0.33):
        bd = prim('cyl', 'hub', spine, r, loc=(-W / 2 - 0.004, 0, z * H), scale=(0.082, T / 2 + 0.006, 0.022), vertices=24)
    yF = -T / 2  # 表紙の面
    if corner_mat:
        for sz in (1, -1):
            cx, cz = W / 2 + ov, sz * (H / 2 + ov)
            if corner == 'plate':
                shape_prism('corner', [(cx, cz), (cx - 0.2, cz), (cx - 0.13, cz - sz * 0.05), (cx - 0.05, cz - sz * 0.05), (cx - 0.05, cz - sz * 0.13), (cx, cz - sz * 0.2)] if sz > 0 else
                            [(cx, cz), (cx, cz - sz * 0.2), (cx - 0.05, cz - sz * 0.13), (cx - 0.05, cz - sz * 0.05), (cx - 0.13, cz - sz * 0.05), (cx - 0.2, cz)], 0.02, corner_mat, r, yF + 0.004, 0.005)
                prim('uv', 'stud', corner_mat, r, loc=(cx - 0.05, yF - 0.022, cz - sz * 0.05), scale=(0.022, 0.012, 0.022), segments=10, ring_count=6)
                # 背側の角も
                shape_prism('corner_b', [(cx, cz), (cx - 0.12, cz), (cx, cz - sz * 0.12)] if sz > 0 else [(cx, cz), (cx, cz - sz * 0.12), (cx - 0.12, cz)], T + 0.01, corner_mat, r, T / 2 + 0.005)
            elif corner == 'claw':
                for k in range(3):
                    cl = prim('cone', 'claw', corner_mat, r, loc=(cx - 0.02 - k * 0.05, yF - 0.01, cz - sz * (0.02 + k * 0.02)), rot=(0, sz * (2.4 - k * 0.25), 0), scale=(0.022, 0.012, 0.09 - k * 0.015), vertices=8)
    if strap:
        sm, bm_ = strap
        prim('cube', 'strap', sm, r, loc=(W / 2 - 0.02, 0, 0), scale=(0.07, T / 2 + 0.012, 0.06), smooth=False)
        prim('cube', 'strapf', sm, r, loc=(W / 2 - 0.16, yF - 0.008, 0), scale=(0.14, 0.006, 0.055), smooth=False)
        bk = prim('torus', 'buckle', bm_, r, loc=(W / 2 - 0.26, yF - 0.014, 0), rot=(math.pi / 2, 0, 0), major_radius=0.05, minor_radius=0.011, major_segments=4, minor_segments=4, smooth=False)
        bk.rotation_euler = (math.pi / 2, math.pi / 4, 0)
    r.rotation_euler = rot
    return r, yF


def tome(el):
    """秘伝書: 分厚い古書。天金の小口、属性の色の栞紐、錠つきの留め具"""
    old = mat('tome_leather_' + el, {'fire': 0x5a2a18, 'ice': 0x2a3a4a, 'thunder': 0x3a2e4a, 'wind': 0x2e3a26, 'holy': 0x6a5a3a, 'void': 0x2a1a32}[el], rough=0.75)
    r, yF = make_book('tome_' + el, W=0.78, H=1.06, T=0.42, board=old, corner_mat=BRASS(), pages=mat('gilt', 0xc8a050, rough=0.35, metal=0.8))
    # 中央の円盤と紋
    prim('cyl', 'medal', BRASS(), r, loc=(0.02, yF - 0.01, 0.04), rot=(math.pi / 2, 0, 0), scale=(0.27, 0.27, 0.012), vertices=32)
    prim('cyl', 'medal_in', mat('medal_in_' + el, EL_DARK[el], rough=0.6), r, loc=(0.02, yF - 0.022, 0.04), rot=(math.pi / 2, 0, 0), scale=(0.235, 0.235, 0.004), vertices=32)
    emblem(el, r, yF - 0.024, 0.7, 0.02, 0.04, 0.025)
    for i, dx in enumerate((-0.12, -0.04)):
        rb = prim('cube', 'mark', mat('mark_' + el, EL_HEX[el], rough=0.5), r, loc=(dx, -0.05 + i * 0.06, -0.62 - i * 0.05), rot=(0, 0.1 - i * 0.2, 0), scale=(0.02, 0.004, 0.12 + i * 0.04), smooth=False)
    # 錠
    prim('cube', 'lockstrap', mat('tome_strap', 0x3a2414, rough=0.8), r, loc=(0.38, 0, 0.0), scale=(0.05, 0.225, 0.07), smooth=False)
    lk = prim('cube', 'lock', BRASS(), r, loc=(0.33, yF - 0.03, 0.0), scale=(0.06, 0.02, 0.075), smooth=False)
    bevel(lk, 0.012)
    prim('cyl', 'keyhole', mat('hole', 0x080604, rough=1), r, loc=(0.33, yF - 0.05, 0.01), rot=(math.pi / 2, 0, 0), scale=(0.012, 0.012, 0.005), vertices=8)
    return r


def cover(bid):
    """装丁(装備)。素材と飾りがそれぞれ違う"""
    if bid == 'tanned':
        r, yF = make_book('gear_tanned', board=mat('tanned', 0x8a5630, rough=0.7), corner_mat=BRASS(), strap=(mat('strap', 0x4a2a14, rough=0.8), BRASS()))
        st = mat('stitch', 0xd8c8a0, rough=0.9)
        for x, z, w, h in ((0.02, 0.5, 0.66, 0.012), (0.02, -0.5, 0.66, 0.012), (-0.31, 0, 0.012, 1.0), (0.35, 0, 0.012, 1.0)):
            for k in range(int(max(w, h) / 0.05)):
                t = k / max(1, int(max(w, h) / 0.05) - 1) - 0.5
                prim('cube', 'st', st, r, loc=(x + (w * t if w > h else 0), yF - 0.004, z + (h * t if h > w else 0)), scale=((0.014 if w > h else 0.004), 0.003, (0.014 if h > w else 0.004)), smooth=False)
        return r
    if bid == 'ebony':
        wood = mat('ebony', 0x1c1612, rough=0.32)
        r, yF = make_book('gear_ebony', board=wood, corner_mat=mat('silver', 0xc8ccd4, rough=0.25, metal=1.0))
        p = prim('cube', 'panel', mat('ebony2', 0x2e241c, rough=0.4), r, loc=(0.03, yF - 0.012, 0), scale=(0.27, 0.012, 0.4), smooth=False)
        bevel(p, 0.012, 3)
        prim('torus', 'rosette', MATS['silver'], r, loc=(0.03, yF - 0.03, 0), rot=(math.pi / 2, 0, 0), major_radius=0.11, minor_radius=0.016, major_segments=28, minor_segments=6)
        for k in range(8):
            a = k / 8 * TAU
            prim('uv', 'petal', MATS['silver'], r, loc=(0.03 + 0.07 * math.cos(a), yF - 0.03, 0.07 * math.sin(a)), scale=(0.03, 0.01, 0.03), segments=8, ring_count=6)
        prim('ico', 'gem', mat('ebgem', 0xe0e8f0, rough=0.05, emit=0xc0d0ff, emit_str=0.5), r, loc=(0.03, yF - 0.04, 0), scale=(0.04, 0.025, 0.04), subdivisions=1, smooth=False)
        return r
    if bid == 'dragon':
        r, yF = make_book('gear_dragon', board=mat('dscale_base', 0x2a1a14, rough=0.6), corner_mat=BONE(), corner='claw')
        sc = mat('dscale', 0x6a1e18, rough=0.35, metal=0.3)
        sc2 = mat('dscale2', 0x8a3018, rough=0.35, metal=0.3)
        for row in range(9):
            for col in range(6):
                x = -0.3 + col * 0.12 + (0.06 if row % 2 else 0)
                z = 0.46 - row * 0.11
                if x > 0.38:
                    continue
                prim('uv', 'scale', sc if (row + col) % 3 else sc2, r, loc=(x, yF - 0.008, z), rot=(0.5, 0, 0), scale=(0.07, 0.02, 0.07), segments=10, ring_count=6)
        prim('uv', 'eye', mat('deye', 0xffb020, rough=0.1, emit=0xff9010, emit_str=2), r, loc=(0.03, yF - 0.05, 0.02), scale=(0.11, 0.04, 0.08), segments=20, ring_count=12)
        prim('cube', 'pupil', mat('hole', 0x080604, rough=1), r, loc=(0.03, yF - 0.09, 0.02), scale=(0.012, 0.004, 0.065), smooth=False)
        return r
    if bid == 'starsilver':
        sil = mat('starsilver', 0xb0bac8, rough=0.28, metal=1.0)
        r, yF = make_book('gear_starsilver', board=sil, spine=mat('starspine', 0x2a3048, rough=0.5), corner_mat=GOLD())
        shape_prism('star', [(0.03 + x, z) for x, z in star_pts(8, 0.24, 0.1)], 0.02, GOLD(), r, yF, 0.006)
        prim('ico', 'gem', mat('stargem', 0x9ac8ff, rough=0.05, emit=0x7ab0ff, emit_str=2.2), r, loc=(0.03, yF - 0.04, 0), scale=(0.07, 0.04, 0.07), subdivisions=1, smooth=False)
        for rr in (0.32, 0.36):
            prim('torus', 'engr', mat('engr', 0x6a7484, rough=0.4, metal=1.0), r, loc=(0.03, yF - 0.003, 0), rot=(math.pi / 2, 0, 0), major_radius=rr, minor_radius=0.006, major_segments=48, minor_segments=4)
        return r
    el = bid[3:]
    r, yF = make_book('gear_' + bid, board=mat('cv_' + el, EL_DARK[el], rough=0.65), corner_mat=GOLD())
    # 縁取りの細い金線と、浮き彫りの紋、上下に属性の石
    for z in (0.5, -0.5):
        prim('cube', 'rule', GOLD(), r, loc=(0.03, yF - 0.004, z), scale=(0.3, 0.004, 0.008), smooth=False)
    emblem(el, r, yF - 0.002, 1.0, 0.03, 0.0, 0.035)
    for z in (0.42, -0.42):
        prim('ico', 'gem', mat('cvgem_' + el, EL_HEX[el], rough=0.05, emit=EL_HEX[el], emit_str=1.2), r, loc=(0.03, yF - 0.02, z), scale=(0.035, 0.02, 0.035), subdivisions=1, smooth=False)
    return r


# ---------- 栞 ----------
def ribbon_mesh(name, material, parent, w=0.26, top=0.55, bot=-0.25, wave=0.7, fork=True):
    bm = bmesh.new()
    n = 18
    L, Rr = [], []
    for k in range(n + 1):
        t = k / n
        z = top + (bot - top) * t
        x = math.sin(t * 2.4) * 0.06 * wave
        y = math.sin(t * 3.1) * 0.06 * wave
        L.append(bm.verts.new((x - w / 2, y, z)))
        Rr.append(bm.verts.new((x + w / 2, y, z)))
    for k in range(n):
        bm.faces.new((L[k], Rr[k], Rr[k + 1], L[k + 1]))
    if fork:  # 先を燕尾に切る
        x = math.sin(2.4) * 0.06 * wave
        y = math.sin(3.1) * 0.06 * wave
        notch = bm.verts.new((x, y, bot + 0.1))
        lt = bm.verts.new((x - w / 2, y, bot - 0.06))
        rt = bm.verts.new((x + w / 2, y, bot - 0.06))
        bm.faces.new((L[n], notch, lt))
        bm.faces.new((notch, Rr[n], rt))
    ob = new_obj(name, bm, material, parent)
    ob.modifiers.new('sol', 'SOLIDIFY').thickness = 0.012
    return ob


def tassel(parent, z, m):
    for i in range(9):
        prim('cyl', 'tassel', m, parent, loc=(-0.05 + i * 0.0125, 0, z), rot=(0, (i - 4) * 0.05, 0), scale=(0.005, 0.005, 0.11), vertices=5)
    prim('uv', 'knot', m, parent, loc=(0, 0, z + 0.11), scale=(0.035, 0.035, 0.04), segments=10, ring_count=6)
    prim('torus', 'loopt', m, parent, loc=(0, 0, z + 0.17), rot=(math.pi / 2, 0, 0), major_radius=0.03, minor_radius=0.007, major_segments=12, minor_segments=4)


def charm_hook(parent, z, m):
    prim('torus', 'hook', m, parent, loc=(0, 0, z), rot=(math.pi / 2, 0, 0), major_radius=0.035, minor_radius=0.009, major_segments=14, minor_segments=5)


def feather(key, length, vane_col, shaft_col, rough=0.8, sheen=None):
    r = root(key)
    vm = mat('vane_' + key, vane_col, rough=rough, metal=0.15 if sheen else 0.0, emit=sheen, emit_str=0.25 if sheen else 0)
    sm = mat('shaft_' + key, shaft_col, rough=0.5)
    prim('cyl', 'shaft', sm, r, loc=(0, 0, 0), scale=(0.012, 0.012, length / 2), vertices=8)
    prim('cone', 'quill', sm, r, loc=(0, 0, -length / 2 - 0.08), rot=(math.pi, 0, 0), scale=(0.014, 0.014, 0.1), vertices=8)
    for side in (1, -1):
        bm = bmesh.new()
        n = 20
        inner, outer = [], []
        for k in range(n + 1):
            t = k / n
            z = -length / 2 + 0.12 + t * (length - 0.12)
            wdt = (0.16 + 0.04 * side) * math.sin(min(1, t * 1.15) * math.pi * 0.92) ** 0.7
            split = 0.025 if k in (6, 7, 13) else 0.0
            inner.append(bm.verts.new((side * 0.01, 0, z)))
            outer.append(bm.verts.new((side * (0.01 + wdt - split), 0.02 * math.sin(t * 3), z - wdt * 0.35)))
        for k in range(n):
            bm.faces.new((inner[k], outer[k], outer[k + 1], inner[k + 1]))
        ob = new_obj('vane', bm, vm, r)
        ob.modifiers.new('sol', 'SOLIDIFY').thickness = 0.006
    sd = None
    r.rotation_euler = (0.1, 0.55, 0.1)
    return r


def bookmark(bid):
    if bid in ('windfeather', 'angelfeather', 'raven'):
        r = {'windfeather': lambda: feather('gear_windfeather', 1.15, 0x5aa080, 0xd8e8d0, 0.7, 0x2a6a4a),
             'angelfeather': lambda: feather('gear_angelfeather', 1.2, 0xf4f0e6, 0xe0c890, 0.85, 0x6a6050),
             'raven': lambda: feather('gear_raven', 1.1, 0x16161c, 0x2a2a30, 0.3, 0x2a1a4a)}[bid]()
        if bid == 'angelfeather':
            prim('cyl', 'cap', GOLD(), r, loc=(0, 0, -0.6), scale=(0.022, 0.022, 0.05), vertices=10)
        return r
    r = root('gear_' + bid)
    if bid == 'silk':
        ribbon_mesh('ribbon', mat('silk', 0xd8a0ac, rough=0.3, metal=0.15), r)
        tassel(r, 0.6, GOLD())
    elif bid == 'silver':
        sv = mat('silver', 0xc8ccd4, rough=0.25, metal=1.0)
        shape_prism('plate', [(-0.12, 0.5), (0.12, 0.5), (0.12, -0.5), (0, -0.66), (-0.12, -0.5)], 0.015, sv, r, 0.0075, 0.006)
        for k, z in enumerate((0.3, 0.05, -0.2, -0.42)):
            prim('torus', 'filig', sv, r, loc=(0, -0.012, z), rot=(math.pi / 2, 0, 0), major_radius=0.06 if k % 2 == 0 else 0.04, minor_radius=0.009, major_segments=20, minor_segments=4)
            prim('cyl', 'hole', mat('hole', 0x080604, rough=1), r, loc=(0, -0.006, z), rot=(math.pi / 2, 0, 0), scale=(0.035 if k % 2 == 0 else 0.02, 0.035 if k % 2 == 0 else 0.02, 0.012), vertices=12)
        charm_hook(r, 0.56, sv)
        tassel(r, 0.6, mat('bluet', 0x3a5a9a, rough=0.6))
    elif bid == 'moon':
        ribbon_mesh('ribbon', mat('moonrib', 0x9ab0d8, rough=0.35, metal=0.1), r)
        sv = mat('silver', 0xc8ccd4, rough=0.25, metal=1.0)
        charm_hook(r, 0.6, sv)
        R1, R2, d = 0.16, 0.13, 0.065
        outer = [(R1 * math.cos(a), 0.78 + R1 * math.sin(a)) for a in (math.radians(50 + 260 * k / 20) for k in range(21))]
        inner = [(d + R2 * math.cos(a), 0.78 + R2 * math.sin(a)) for a in (math.radians(-71 - 218 * k / 20) for k in range(21))]
        shape_prism('crescent', outer + inner, 0.03, sv, r, 0.015, 0.006)
        prim('uv', 'pearl', mat('pearl', 0xf0ecf4, rough=0.2, emit=0xc0d0ff, emit_str=0.4), r, loc=(0.06, 0, 0.78), scale=(0.045, 0.045, 0.045), segments=14, ring_count=10)
    elif bid == 'memory':
        ribbon_mesh('ribbon', mat('memleather', 0x6a4426, rough=0.8), r, w=0.2, wave=0.4, fork=False)
        prim('torus', 'knot', mat('memleather', 0x6a4426), r, loc=(0, 0, 0.55), rot=(0, math.pi / 2, 0), major_radius=0.06, minor_radius=0.03, major_segments=14, minor_segments=8)
        # 真鍮の鍵
        prim('torus', 'bow', BRASS(), r, loc=(0, -0.03, 0.73), rot=(math.pi / 2, 0, 0), major_radius=0.07, minor_radius=0.018, major_segments=18, minor_segments=6)
        prim('cyl', 'stem', BRASS(), r, loc=(0.0, -0.03, 0.9), scale=(0.018, 0.018, 0.12), vertices=8)
        for k in range(2):
            prim('cube', 'bit', BRASS(), r, loc=(0.035, -0.03, 0.96 + k * 0.05), scale=(0.035, 0.012, 0.014), smooth=False)
    elif bid == 'salamander':
        ribbon_mesh('ribbon', mat('salrib', 0x9a2418, rough=0.4, metal=0.1), r)
        charm_hook(r, 0.6, GOLD())
        g = GOLD()
        for k, (z, s) in enumerate(((0.7, 0.05), (0.78, 0.06), (0.86, 0.055), (0.93, 0.045), (0.99, 0.035), (1.04, 0.025), (1.08, 0.016))):
            prim('uv', 'body', g, r, loc=(0.04 * math.sin(k * 0.9), -0.01, z), scale=(s, s * 0.7, s * 1.2), segments=12, ring_count=8)
        prim('uv', 'head', g, r, loc=(0, -0.01, 0.65), scale=(0.05, 0.035, 0.06), segments=12, ring_count=8)
        for sx in (1, -1):
            for z in (0.74, 0.88):
                prim('cyl', 'leg', g, r, loc=(sx * 0.07, -0.01, z), rot=(0, sx * 1.1, 0), scale=(0.01, 0.01, 0.04), vertices=6)
            prim('uv', 'eyeg', mat('rubyeye', 0xff2010, rough=0.1, emit=0xff2010, emit_str=1.5), r, loc=(sx * 0.025, -0.04, 0.63), scale=(0.012, 0.01, 0.012), segments=8, ring_count=6)
    elif bid == 'iceflower':
        ribbon_mesh('ribbon', mat('icerib', 0xa8d4e8, rough=0.3, metal=0.1), r)
        charm_hook(r, 0.6, mat('silver', 0xc8ccd4, rough=0.25, metal=1.0))
        pm = mat('icepetal', 0xc8ecff, rough=0.05, emit=0x8ad0ff, emit_str=1.0, alpha=0.85)
        for k in range(6):
            a = k / 6 * TAU
            prim('ico', 'petal', pm, r, loc=(0.09 * math.cos(a), -0.01, 0.78 + 0.09 * math.sin(a)), rot=(0, -a + math.pi / 2, 0), scale=(0.03, 0.015, 0.08), subdivisions=1, smooth=False)
        prim('ico', 'core', mat('icecore', 0xffffff, rough=0.05, emit=0xd0f0ff, emit_str=2), r, loc=(0, -0.02, 0.78), scale=(0.035, 0.03, 0.035), subdivisions=1, smooth=False)
    elif bid == 'thunderbird':
        ribbon_mesh('ribbon', mat('thrib', 0x5a3a9a, rough=0.35, metal=0.1), r)
        charm_hook(r, 0.6, GOLD())
        g = mat('thgold', 0xe0c050, rough=0.25, metal=1.0, emit=0xb090ff, emit_str=0.3)
        prim('uv', 'bbody', g, r, loc=(0, -0.01, 0.76), scale=(0.04, 0.03, 0.07), segments=12, ring_count=8)
        prim('uv', 'bhead', g, r, loc=(0, -0.01, 0.85), scale=(0.03, 0.025, 0.03), segments=10, ring_count=8)
        for sx in (1, -1):
            shape_prism('wing', [(sx * 0.03, 0.8), (sx * 0.2, 0.92), (sx * 0.16, 0.86), (sx * 0.22, 0.84), (sx * 0.15, 0.79), (sx * 0.19, 0.75), (sx * 0.03, 0.74)], 0.015, g, r, -0.002, 0.003)
        shape_prism('tail', [(0, 0.71), (0.05, 0.62), (0.0, 0.65), (-0.05, 0.62)], 0.015, g, r, -0.002)
    r.rotation_euler = (0.1, 0.55, 0.12)
    return r


# ---------- 指輪 ----------
def ring_band(r, m, major=0.34, minor=0.06, segs=48):
    prim('torus', 'band', m, r, loc=(0, 0, 0), rot=(math.pi / 2, 0, 0), major_radius=major, minor_radius=minor, major_segments=segs, minor_segments=12)


def prongs(r, m, z, rad, n=4, h=0.07):
    for k in range(n):
        a = k / n * TAU + math.pi / 4
        prim('cone', 'prong', m, r, loc=(rad * math.cos(a), rad * math.sin(a), z), rot=(math.sin(a) * -0.35, math.cos(a) * 0.35, 0), scale=(0.018, 0.018, h), vertices=6)


def ring(bid):
    r = root('gear_' + bid)
    if bid == 'ruby':
        ring_band(r, GOLD())
        lathe('bezel', [(0.0, 0.36), (0.12, 0.36), (0.14, 0.44), (0.125, 0.47), (0.0, 0.47)], GOLD(), r, segs=24)
        prim('uv', 'gem', mat('ruby', 0xc01020, rough=0.08, emit=0xa00818, emit_str=0.8), r, loc=(0, 0, 0.47), scale=(0.11, 0.11, 0.08), segments=24, ring_count=12)
    elif bid == 'sapphire':
        sv = mat('silver', 0xc8ccd4, rough=0.25, metal=1.0)
        ring_band(r, sv, minor=0.05)
        lathe('basket', [(0.0, 0.34), (0.08, 0.36), (0.11, 0.42), (0.0, 0.42)], sv, r, segs=12)
        prongs(r, sv, 0.48, 0.1)
        prim('ico', 'gem', mat('sapphire', 0x1a40c0, rough=0.04, emit=0x2050e0, emit_str=0.9), r, loc=(0, 0, 0.5), scale=(0.1, 0.13, 0.09), subdivisions=1, smooth=False)
    elif bid == 'thunderstone':
        dk = mat('darkiron', 0x3a3640, rough=0.45, metal=0.9)
        ring_band(r, dk, minor=0.08, segs=12)
        cm = mat('thstone', 0xe0d060, rough=0.1, emit=0xb090ff, emit_str=1.6)
        for k, (x, h, a) in enumerate(((0, 0.24, 0), (0.07, 0.17, 0.5), (-0.07, 0.15, -0.55))):
            c = prim('cone', 'shard', cm, r, loc=(x, 0, 0.42 + h / 2), rot=(0, a, 0), scale=(0.05, 0.05, h / 2), vertices=5, smooth=False)
    elif bid == 'platinum':
        pt = mat('platinum', 0xe0e4ea, rough=0.18, metal=1.0)
        ring_band(r, pt, minor=0.045)
        dia = mat('diamond', 0xffffff, rough=0.02, emit=0xd0e8ff, emit_str=0.6)
        lathe('diamond', [(0.0, 0.4), (0.11, 0.5), (0.12, 0.52), (0.07, 0.58), (0.0, 0.58)], dia, r, segs=8, smooth=False)
        for k in range(10):
            a = k / 10 * TAU
            prim('ico', 'halo', dia, r, loc=(0.16 * math.cos(a), 0.16 * math.sin(a), 0.47), scale=(0.025, 0.025, 0.025), subdivisions=1, smooth=False)
        prongs(r, pt, 0.53, 0.1, 6, 0.05)
    elif bid == 'obsidian':
        bk = mat('blackmetal', 0x1a181e, rough=0.3, metal=0.9)
        ring_band(r, bk, minor=0.065)
        for k in range(6):
            a = k / 6 * TAU + 0.5
            prim('cone', 'spike', bk, r, loc=(0.4 * math.cos(a), 0, 0.4 * math.sin(a)), rot=(0, math.pi / 2 - a, 0), scale=(0.025, 0.025, 0.06), vertices=6)
        prim('cone', 'gem', mat('obsidian', 0x120a1a, rough=0.05, metal=0.2, emit=0x6a2ab0, emit_str=0.8), r, loc=(0, 0, 0.56), scale=(0.09, 0.09, 0.2), vertices=6, smooth=False)
    elif bid == 'emerald':
        g = GOLD()
        for off in (0.03, -0.03):
            prim('torus', 'vine', g, r, loc=(0, off, 0), rot=(math.pi / 2, 0, 0), major_radius=0.34, minor_radius=0.03, major_segments=48, minor_segments=8)
        lf = mat('goldleaf', 0xb8a040, rough=0.35, metal=0.9)
        for k in range(8):
            a = k / 8 * TAU
            if abs(a - math.pi / 2) < 0.6:
                continue
            prim('uv', 'leaf', lf, r, loc=(0.36 * math.cos(a), -0.04, 0.36 * math.sin(a)), rot=(0, -a, 0), scale=(0.05, 0.012, 0.025), segments=8, ring_count=6)
        e = prim('cube', 'gem', mat('emerald', 0x109050, rough=0.05, emit=0x10a050, emit_str=0.8), r, loc=(0, 0, 0.48), scale=(0.1, 0.075, 0.08), smooth=False)
        bevel(e, 0.025, 1)
        prongs(r, g, 0.48, 0.12)
    elif bid == 'healer':
        sv = mat('silver', 0xc8ccd4, rough=0.25, metal=1.0)
        ring_band(r, sv, minor=0.05)
        lathe('bezel', [(0.0, 0.34), (0.1, 0.34), (0.12, 0.41), (0.1, 0.44), (0.0, 0.44)], sv, r, segs=24)
        prim('uv', 'gem', mat('healgem', 0xb8f0c8, rough=0.1, emit=0x80e0a0, emit_str=1.0), r, loc=(0, 0, 0.44), scale=(0.09, 0.09, 0.065), segments=20, ring_count=10)
        lf = mat('silverleaf', 0x9ac8a0, rough=0.35, metal=0.8)
        for sx in (1, -1):
            prim('uv', 'leaf', lf, r, loc=(sx * 0.15, -0.01, 0.37), rot=(0, sx * 0.9, 0), scale=(0.08, 0.014, 0.035), segments=10, ring_count=6)
    elif bid == 'warden':
        g = GOLD()
        ring_band(r, mat('darkiron', 0x3a3640, rough=0.45, metal=0.9), minor=0.075, segs=16)
        shape_prism('shield', [(-0.13, 0.56), (0.13, 0.56), (0.13, 0.44), (0, 0.33), (-0.13, 0.44)], 0.05, g, r, 0.025, 0.008)
        shape_prism('shieldgem', [(-0.08, 0.52), (0.08, 0.52), (0.08, 0.45), (0, 0.38), (-0.08, 0.45)], 0.02, mat('wardgem', 0x2a5ab0, rough=0.08, emit=0x3a6ad0, emit_str=0.9), r, -0.024, 0.004)
    else:  # temperance
        sv = mat('silver', 0xc8ccd4, rough=0.25, metal=1.0)
        wd = lathe('wide', [(0.36, -0.1), (0.4, -0.1), (0.42, -0.06), (0.42, 0.06), (0.4, 0.1), (0.36, 0.1)], sv, r, segs=48)
        wd.rotation_euler = (math.pi / 2, 0, 0)
        for y in (-0.05, 0.05):
            prim('torus', 'groove', mat('engr', 0x6a7484, rough=0.4, metal=1.0), r, loc=(0, y, 0), rot=(math.pi / 2, 0, 0), major_radius=0.421, minor_radius=0.006, major_segments=48, minor_segments=4)
        for k, a in enumerate((math.pi / 2 - 0.35, math.pi / 2, math.pi / 2 + 0.35)):
            prim('uv', 'inset', mat('tempstone', 0x4a8ad8, rough=0.05, emit=0x3a7ad0, emit_str=0.8), r, loc=(0.425 * math.cos(a), 0, 0.425 * math.sin(a)), scale=(0.03, 0.03, 0.03), segments=10, ring_count=6)
    r.rotation_euler = (0.55, 0, 0.35)
    return r


# ---------- 外套 ----------
def cloak(bid):
    r = root('gear_' + bid)
    col, trim = {'traveler': (0x5e4630, None), 'cleric': (0xdcd6c8, GOLD()), 'shadow': (0x241c30, mat('shadowtrim', 0x6a3ab0, rough=0.5, emit=0x6a3ab0, emit_str=0.8)),
                 'hunter': (0x3e4a2a, None), 'drake': (0x5a1e14, BRASS()), 'stargazer': (0x1a2448, GOLD())}[bid]
    cm = mat('cloth_' + bid, col, rough=0.95)
    bm = bmesh.new()
    segs, rows = 44, 16
    rings = []
    span = TAU * 0.86
    random.seed(hash(bid) % 1000)
    jag = [random.uniform(0, 0.14) for _ in range(segs + 1)]
    for k in range(rows + 1):
        t = k / rows
        z = 0.55 - t * 1.15
        rad = 0.13 + t * 0.42
        ring = []
        for i in range(segs + 1):
            a = -span / 2 + i / segs * span + math.pi
            fold = 1 + 0.08 * t * math.sin(i * 1.3) + 0.045 * t * math.sin(i * 3.1)
            zz = z - 0.04 * t * math.sin(i * 0.9)
            if bid == 'shadow' and k == rows:
                zz -= jag[i] * (1 if i % 2 else 0.4)
            ring.append(bm.verts.new((rad * fold * math.sin(a), rad * fold * math.cos(a), zz)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    ob = new_obj('body', bm, cm, r)
    ob.modifiers.new('sol', 'SOLIDIFY').thickness = 0.02
    if bid == 'shadow':
        hood = prim('cone', 'hood', cm, r, loc=(0, 0.05, 0.72), rot=(-0.35, 0, 0), scale=(0.2, 0.2, 0.26), vertices=24)
        prim('uv', 'void', mat('hoodvoid', 0x050308, rough=1), r, loc=(0, -0.06, 0.66), scale=(0.12, 0.08, 0.12), segments=14, ring_count=10)
        for sx in (1, -1):
            prim('uv', 'eye', MATS['shadowtrim'], r, loc=(sx * 0.04, -0.13, 0.67), scale=(0.015, 0.01, 0.01), segments=8, ring_count=6)
    else:
        hood = prim('uv', 'hood', cm, r, loc=(0, 0.04, 0.66), scale=(0.21, 0.22, 0.21), segments=24, ring_count=12)
        bm2 = bmesh.new(); bm2.from_mesh(hood.data)
        bmesh.ops.delete(bm2, geom=[v for v in bm2.verts if v.co.y < -0.25 and v.co.z < 0.6], context='VERTS')
        bm2.to_mesh(hood.data); bm2.free()
        hood.modifiers.new('sol', 'SOLIDIFY').thickness = 0.03
    if trim:  # 裾と襟の縁取り
        hem = lathe('hem', [(0.555, -0.6), (0.56, -0.66)], trim, r, segs=44)
        hem.scale = (1.0, 1.0, 1.0)
        prim('torus', 'collar', trim, r, loc=(0, 0, 0.5), major_radius=0.15, minor_radius=0.02, major_segments=24, minor_segments=6)
    if bid == 'traveler':
        prim('cube', 'strap', mat('strap', 0x4a2a14, rough=0.8), r, loc=(0.0, -0.3, 0.1), rot=(0.25, 0.6, 0), scale=(0.03, 0.01, 0.4), smooth=False)
        bk = prim('cube', 'buckle', BRASS(), r, loc=(0, -0.17, 0.47), scale=(0.05, 0.02, 0.04), smooth=False)
        bevel(bk, 0.01)
        prim('cube', 'patch', mat('patch', 0x7a6040, rough=1), r, loc=(-0.2, -0.36, -0.25), rot=(0.25, 0, 0.5), scale=(0.07, 0.01, 0.06), smooth=False)
    elif bid == 'cleric':
        shape_prism('cross', [(-0.012, 0.52), (0.012, 0.52), (0.012, 0.47), (0.035, 0.47), (0.035, 0.45), (0.012, 0.45), (0.012, 0.39), (-0.012, 0.39), (-0.012, 0.45), (-0.035, 0.45), (-0.035, 0.47), (-0.012, 0.47)], 0.02, GOLD(), r, -0.16)
    elif bid == 'shadow':
        prim('ico', 'brooch', MATS['shadowtrim'], r, loc=(0, -0.17, 0.47), scale=(0.03, 0.02, 0.04), subdivisions=1, smooth=False)
    elif bid == 'hunter':
        # 毛皮の襟と、肩に掛けた矢筒の革帯
        fur = mat('fur', 0x6a5a44, rough=1.0)
        for k in range(14):
            a = k / 14 * TAU
            prim('uv', 'fur', fur, r, loc=(0.17 * math.sin(a), 0.17 * math.cos(a), 0.47 + 0.02 * math.sin(k * 2.3)), scale=(0.06, 0.06, 0.045), segments=8, ring_count=6)
        prim('cube', 'strap', mat('strap', 0x4a2a14, rough=0.8), r, loc=(0.05, -0.3, 0.05), rot=(0.25, -0.65, 0), scale=(0.03, 0.01, 0.45), smooth=False)
        prim('torus', 'buckle', BRASS(), r, loc=(0.1, -0.33, 0.12), rot=(math.pi / 2, 0, 0), major_radius=0.035, minor_radius=0.008, major_segments=4, minor_segments=4, smooth=False)
    elif bid == 'drake':
        # 肩を覆う鱗と、棘の立つ襟
        sc = mat('dscale', 0x6a1e18, rough=0.35, metal=0.3)
        for row in range(3):
            for k in range(12):
                a = k / 12 * TAU + row * 0.25
                rad = 0.2 + row * 0.07
                prim('uv', 'scale', sc, r, loc=(rad * math.sin(a), rad * math.cos(a), 0.42 - row * 0.09), rot=(0.6, 0, -a), scale=(0.055, 0.02, 0.05), segments=8, ring_count=6)
        for k in range(7):
            a = math.pi + (k - 3) * 0.32
            prim('cone', 'spike', BONE(), r, loc=(0.18 * math.sin(a), 0.18 * math.cos(a), 0.56), rot=(math.cos(a) * -0.5, math.sin(a) * 0.5, 0), scale=(0.02, 0.02, 0.07), vertices=6)
    elif bid == 'stargazer':
        # 星座を散らした深い藍
        st = mat('starfleck', 0xe8d080, rough=0.3, metal=0.8, emit=0xe0c060, emit_str=0.8)
        random.seed(11)
        for k in range(22):
            t = random.uniform(0.15, 0.95)
            a = math.pi + random.uniform(-1.2, 1.2)
            rad = (0.13 + t * 0.42) * 1.03
            z = 0.55 - t * 1.15
            prim('ico', 'star', st, r, loc=(rad * math.sin(a), rad * math.cos(a), z), scale=(0.016, 0.016, 0.016), subdivisions=1, smooth=False)
        shape_prism('starb', [(x, 0.46 + z) for x, z in star_pts(4, 0.05, 0.018)], 0.02, GOLD(), r, -0.16)
    r.rotation_euler = (0, 0, 0.45)
    return r


# ---------- 首飾り ----------
def chain(r, m, kind='chain', w=0.22, top=0.36, bottom=0.0, n=20):
    pts = []
    for k in range(n + 1):
        u = -math.pi / 2 + k / n * math.pi
        pts.append((w * math.sin(u), top - (top - bottom) * math.cos(u)))
    if kind == 'chain':
        for k, (x, z) in enumerate(pts):
            prim('torus', 'link', m, r, loc=(x, 0, z), rot=(math.pi / 2 if k % 2 else 0, 0, math.atan2(1, 0)), major_radius=0.022, minor_radius=0.006, major_segments=10, minor_segments=4)
    else:  # 紐
        for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
            L = math.hypot(x1 - x0, z1 - z0)
            prim('cyl', 'cord', m, r, loc=((x0 + x1) / 2, 0, (z0 + z1) / 2), rot=(0, math.atan2(x1 - x0, z1 - z0), 0), scale=(0.01, 0.01, L / 2 + 0.003), vertices=6)


def necklace(bid):
    r = root('gear_' + bid)
    sv = mat('silver', 0xc8ccd4, rough=0.25, metal=1.0)
    if bid == 'bonecharm':
        chain(r, mat('cordd', 0x3a2a1a, rough=1), 'cord')
        for k, (x, a) in enumerate(((-0.09, 0.35), (0, 0), (0.09, -0.35))):
            L = 0.16 if k == 1 else 0.12
            prim('cyl', 'b', BONE(), r, loc=(x, 0, -0.02 - L / 2), rot=(0, a, 0), scale=(0.018, 0.018, L / 2), vertices=8)
            for e in (1, -1):
                prim('uv', 'bk', BONE(), r, loc=(x - math.sin(a) * e * L / 2, 0, -0.02 - L / 2 + math.cos(a) * e * L / 2), scale=(0.028, 0.024, 0.024), segments=10, ring_count=6)
        prim('uv', 'skull', BONE(), r, loc=(0, -0.01, -0.3), scale=(0.07, 0.06, 0.075), segments=14, ring_count=10)
        for sx in (1, -1):
            prim('uv', 'socket', mat('hole', 0x080604, rough=1), r, loc=(sx * 0.025, -0.06, -0.29), scale=(0.018, 0.01, 0.02), segments=8, ring_count=6)
    elif bid == 'silvercross':
        chain(r, sv)
        shape_prism('cross', [(-0.025, 0.0), (0.025, 0.0), (0.025, -0.08), (0.09, -0.08), (0.09, -0.13), (0.025, -0.13), (0.025, -0.32), (-0.025, -0.32), (-0.025, -0.13), (-0.09, -0.13), (-0.09, -0.08), (-0.025, -0.08)], 0.03, sv, r, 0.015, 0.006)
        prim('ico', 'gem', mat('crossgem', 0xf0e8c0, rough=0.05, emit=0xf0d890, emit_str=1.0), r, loc=(0, -0.025, -0.105), scale=(0.025, 0.015, 0.025), subdivisions=1, smooth=False)
    elif bid == 'amber':
        chain(r, GOLD())
        prim('torus', 'cap', GOLD(), r, loc=(0, 0, -0.03), rot=(math.pi / 2, 0, 0), major_radius=0.03, minor_radius=0.01, major_segments=12, minor_segments=4)
        a = prim('uv', 'amber', mat('amberm', 0xd07a18, rough=0.15, emit=0xb05a10, emit_str=0.8, alpha=0.9), r, loc=(0, 0, -0.16), scale=(0.085, 0.06, 0.12), segments=20, ring_count=14)
        prim('uv', 'insect', mat('insect', 0x2a1408, rough=0.8), r, loc=(0.01, -0.01, -0.17), scale=(0.02, 0.012, 0.035), segments=8, ring_count=6)
    elif bid == 'moonstone':
        chain(r, sv)
        bz = lathe('bezel', [(0.0, 0.0), (0.1, 0.0), (0.11, 0.025), (0.0, 0.025)], sv, r, segs=28)
        bz.rotation_euler = (math.pi / 2, 0, 0)
        bz.location = (0, 0.01, -0.13)
        prim('uv', 'stone', mat('moonst', 0xdce8f4, rough=0.15, emit=0x9ac0f0, emit_str=0.9), r, loc=(0, -0.02, -0.13), scale=(0.085, 0.04, 0.1), segments=20, ring_count=12)
        for k in range(3):
            prim('uv', 'drop', sv, r, loc=(-0.06 + k * 0.06, 0, -0.26 - (0.02 if k == 1 else 0)), scale=(0.018, 0.018, 0.024), segments=8, ring_count=6)
    elif bid == 'fang':
        chain(r, mat('cordd', 0x3a2a1a, rough=1), 'cord')
        fg = prim('cone', 'fang', mat('fangm', 0xe8dcc0, rough=0.5), r, loc=(0, 0, -0.16), rot=(math.pi, 0, 0), scale=(0.04, 0.035, 0.15), vertices=12)
        sd = fg.modifiers.new('bend', 'SIMPLE_DEFORM'); sd.deform_method = 'BEND'; sd.angle = 0.7; sd.deform_axis = 'Y'
        prim('torus', 'wrap', mat('cordd', 0x3a2a1a), r, loc=(0, 0, -0.03), major_radius=0.035, minor_radius=0.01, major_segments=12, minor_segments=4)
        for sx in (1, -1):
            prim('uv', 'bead', mat('beadr', 0x8a2a18, rough=0.4), r, loc=(sx * 0.07, 0, 0.0), scale=(0.025, 0.025, 0.025), segments=10, ring_count=6)
    elif bid == 'locket':
        chain(r, GOLD())
        lk = prim('cyl', 'locket', GOLD(), r, loc=(0, 0, -0.14), rot=(math.pi / 2, 0, 0), scale=(0.11, 0.11, 0.03), vertices=32)
        bevel(lk, 0.015, 3)
        shape_prism('star', [(x, -0.14 + z) for x, z in star_pts(5, 0.07, 0.03)], 0.012, mat('starfleck', 0xe8d080, rough=0.3, metal=0.8, emit=0xe0c060, emit_str=0.8), r, -0.03)
        prim('cyl', 'hinge', GOLD(), r, loc=(0, 0, -0.02), rot=(0, math.pi / 2, 0), scale=(0.015, 0.015, 0.03), vertices=10)
        prim('ico', 'gem', mat('stargem', 0x9ac8ff, rough=0.05, emit=0x7ab0ff, emit_str=2.2), r, loc=(0, -0.05, -0.14), scale=(0.022, 0.012, 0.022), subdivisions=1, smooth=False)
    r.rotation_euler = (0.15, 0, 0.25)
    return r


# ---------- 手袋 ----------
def glove(bid):
    r = root('gear_' + bid)
    leather = {'leathergl': mat('glvleather', 0x6a4426, rough=0.75), 'silkgl': mat('glvsilk', 0xe0d8c8, rough=0.45, metal=0.1),
               'gauntlet': mat('glvunder', 0x2a2420, rough=0.9), 'stormgl': mat('glvdark', 0x2a2430, rough=0.6), 'shadowgl': mat('glvshadow', 0x14101c, rough=0.5)}[bid]
    plate = mat('iron', 0x8a8a92)
    # 手の甲を手前に、指を上に
    palm = prim('cube', 'palm', leather, r, loc=(0, 0, 0), scale=(0.2, 0.07, 0.22), smooth=True)
    bevel(palm, 0.05, 3)
    fingers = [(-0.135, 0.27, 0.05), (-0.045, 0.31, 0.0), (0.045, 0.29, -0.02), (0.135, 0.23, -0.06)]
    for k, (x, L, a) in enumerate(fingers):
        prim('cyl', 'finger', leather, r, loc=(x + math.sin(a) * L / 2, 0, 0.2 + L / 2), rot=(0, a, 0), scale=(0.042, 0.04, L / 2), vertices=12)
        tip = (x + math.sin(a) * L, 0, 0.2 + L * math.cos(a))
        if bid == 'shadowgl':
            prim('cone', 'claw', mat('claw', 0x0a080e, rough=0.3, metal=0.6), r, loc=tip, rot=(0, a, 0), scale=(0.035, 0.03, 0.08), vertices=8)
        else:
            prim('uv', 'tip', leather, r, loc=tip, scale=(0.042, 0.04, 0.045), segments=12, ring_count=8)
        if bid == 'gauntlet':
            for j in range(3):
                pl = prim('cube', 'fplate', plate, r, loc=(x + math.sin(a) * L * (0.2 + j * 0.3), -0.04, 0.2 + L * (0.2 + j * 0.3)), rot=(0, a, 0), scale=(0.046, 0.015, L * 0.13), smooth=False)
                bevel(pl, 0.008)
    prim('cyl', 'thumb', leather, r, loc=(0.25, 0, 0.0), rot=(0, -0.9, 0), scale=(0.045, 0.042, 0.11), vertices=12)
    prim('uv', 'thumbtip', leather, r, loc=(0.33, 0, 0.07), scale=(0.045, 0.042, 0.05), segments=12, ring_count=8)
    # 袖口
    cuffm = {'leathergl': leather, 'silkgl': GOLD(), 'gauntlet': plate, 'stormgl': mat('darkiron', 0x3a3640, rough=0.45, metal=0.9), 'shadowgl': leather}[bid]
    cf = lathe('cuff', [(0.2, -0.2), (0.24, -0.34), (0.29, -0.48), (0.28, -0.5)], cuffm, r, segs=28)
    cf.scale = (1, 0.42, 1)
    if bid == 'leathergl':
        for k in range(9):
            prim('cube', 'st', mat('stitch', 0xd8c8a0, rough=0.9), r, loc=(-0.17 + k * 0.042, -0.072, -0.17), scale=(0.012, 0.003, 0.004), smooth=False)
        prim('cube', 'strap', mat('strap', 0x4a2a14, rough=0.8), r, loc=(0, -0.08, -0.12), scale=(0.21, 0.01, 0.025), smooth=False)
        prim('cube', 'buckle', BRASS(), r, loc=(0.12, -0.092, -0.12), scale=(0.025, 0.006, 0.03), smooth=False)
    elif bid == 'silkgl':
        prim('torus', 'rune', GOLD(), r, loc=(0, -0.075, 0.03), rot=(math.pi / 2, 0, 0), major_radius=0.1, minor_radius=0.008, major_segments=32, minor_segments=4)
        shape_prism('runestar', [(x, 0.03 + z) for x, z in star_pts(6, 0.07, 0.03)], 0.006, GOLD(), r, -0.072)
        prim('torus', 'band', GOLD(), r, loc=(0, 0, -0.22), major_radius=0.205, minor_radius=0.012, major_segments=28, minor_segments=4).scale = (1, 0.42, 1)
    elif bid == 'gauntlet':
        bp = prim('cube', 'backplate', plate, r, loc=(0, -0.075, 0.02), scale=(0.19, 0.02, 0.17), smooth=False)
        bevel(bp, 0.02, 2)
        kn = prim('cube', 'knuckle', plate, r, loc=(0, -0.08, 0.2), scale=(0.2, 0.025, 0.04), smooth=False)
        bevel(kn, 0.015, 2)
        for x in (-0.14, -0.05, 0.05, 0.14):
            prim('cyl', 'rivet', BRASS(), r, loc=(x, -0.1, 0.2), rot=(math.pi / 2, 0, 0), scale=(0.015, 0.015, 0.01), vertices=8)
    elif bid == 'stormgl':
        for x in (-0.135, -0.045, 0.045, 0.135):
            prim('cube', 'kn', mat('darkiron', 0x3a3640), r, loc=(x, -0.075, 0.2), scale=(0.04, 0.02, 0.03), smooth=False)
        emblem('thunder', r, -0.07, 0.42, 0.0, 0.02, 0.02)
    elif bid == 'shadowgl':
        emblem('void', r, -0.07, 0.38, 0.0, 0.02, 0.015, MATS.get('shadowtrim') or mat('shadowtrim', 0x6a3ab0, rough=0.5, emit=0x6a3ab0, emit_str=0.8))
    r.rotation_euler = (0.1, 0.35, 0.2)
    return r


roots = [ether(), herb(), crystal(), bone(), iron(), scroll(), frag(), amulet(), flash(), lantern()]
roots += [tome(e) for e in ('fire', 'ice', 'thunder', 'wind', 'holy', 'void')]
roots += [cover(b) for b in ('tanned', 'ebony', 'dragon', 'starsilver', 'cv_fire', 'cv_ice', 'cv_thunder', 'cv_wind', 'cv_holy', 'cv_void')]
roots += [bookmark(b) for b in ('silk', 'silver', 'moon', 'memory', 'salamander', 'iceflower', 'thunderbird', 'windfeather', 'angelfeather', 'raven')]
roots += [ring(b) for b in ('ruby', 'sapphire', 'thunderstone', 'platinum', 'obsidian', 'emerald', 'temperance', 'healer', 'warden')]
roots += [cloak(b) for b in ('traveler', 'cleric', 'shadow', 'hunter', 'drake', 'stargazer')]
roots += [necklace(b) for b in ('bonecharm', 'silvercross', 'amber', 'moonstone', 'fang', 'locket')]
roots += [glove(b) for b in ('leathergl', 'silkgl', 'gauntlet', 'stormgl', 'shadowgl')]


# ---------------- 宝箱(世界に置く物) ----------------
# 向き: 前 = -Y(ゲームの +Z)。蓋は 'lid' という空の子にまとめ、空の原点を後ろの蝶番に置く(開く時はこれを回す)
# 中身は 'treasure' という空の子(開くまで隠す)
def empty(name, parent, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    scene.collection.objects.link(e)
    e.parent = parent
    e.location = loc
    return e


def chest(rich=False):
    key = 'chest_rich' if rich else 'chest'
    r = root(key)
    W, D, H = 1.0, 0.62, 0.5
    if rich:
        woodA, woodB = mat('lacq1', 0x3a1612, rough=0.35), mat('lacq2', 0x2e100c, rough=0.4)
        band, rivet = GOLD(), GOLD()
    else:
        woodA, woodB = mat('plank1', 0x7a5232, rough=0.85), mat('plank2', 0x6a4428, rough=0.9)
        band, rivet = mat('chestiron', 0x4a4a50, rough=0.5, metal=0.8), BRASS()
    z0 = 0.07  # 脚の高さ
    # 胴: 前後は横板3枚、左右は縦の板、底板
    rows = 3
    ph = (H - 0.01 * (rows - 1)) / rows
    for side in (-1, 1):
        for k in range(rows):
            pl = prim('cube', 'plank', woodA if (k + (side > 0)) % 2 else woodB, r, loc=(0, side * (D / 2 - 0.02), z0 + ph / 2 + k * (ph + 0.01)), scale=(W / 2 - 0.01, 0.02, ph / 2), smooth=False)
            bevel(pl, 0.006, 1)
    for side in (-1, 1):
        for k in range(rows):
            pl = prim('cube', 'plank', woodB if k % 2 else woodA, r, loc=(side * (W / 2 - 0.02), 0, z0 + ph / 2 + k * (ph + 0.01)), scale=(0.02, D / 2 - 0.035, ph / 2), smooth=False)
            bevel(pl, 0.006, 1)
    prim('cube', 'bottom', woodB, r, loc=(0, 0, z0 + 0.01), scale=(W / 2 - 0.01, D / 2 - 0.01, 0.012), smooth=False)
    # 鉄の帯(胴を巻く)と鋲
    for x in (-0.32, 0.32):
        for side in (-1, 1):
            b = prim('cube', 'band', band, r, loc=(x, side * (D / 2 + 0.002), z0 + H / 2), scale=(0.035, 0.008, H / 2 + 0.005), smooth=False)
            bevel(b, 0.004, 1)
            for z in (z0 + 0.1, z0 + H - 0.1):
                prim('uv', 'rivet', rivet, r, loc=(x, side * (D / 2 + 0.012), z), scale=(0.012, 0.008, 0.012), segments=8, ring_count=6)
    # 角金具(L字)
    for sx in (-1, 1):
        for sy in (-1, 1):
            for zz in (z0 + 0.06, z0 + H - 0.06):
                prim('cube', 'corner', band, r, loc=(sx * (W / 2 - 0.035), sy * (D / 2 + 0.006), zz), scale=(0.05, 0.006, 0.055), smooth=False)
                prim('cube', 'corner', band, r, loc=(sx * (W / 2 + 0.006), sy * (D / 2 - 0.035), zz), scale=(0.006, 0.05, 0.055), smooth=False)
    # 縁(胴の上端)
    rim = prim('cube', 'rim', band, r, loc=(0, 0, z0 + H + 0.008), scale=(W / 2 + 0.008, D / 2 + 0.008, 0.012), smooth=False)
    bevel(rim, 0.004, 1)
    # 脚
    for sx in (-1, 1):
        for sy in (-1, 1):
            f = prim('cube', 'foot', band, r, loc=(sx * (W / 2 - 0.05), sy * (D / 2 - 0.05), z0 / 2), scale=(0.05, 0.05, z0 / 2), smooth=False)
            bevel(f, 0.01, 1)
    # 横の取っ手
    for sx in (-1, 1):
        prim('torus', 'handle', band, r, loc=(sx * (W / 2 + 0.03), 0, z0 + H * 0.62), rot=(0, math.pi / 2, 0), major_radius=0.06, minor_radius=0.01, major_segments=16, minor_segments=6)
        prim('cube', 'hplate', band, r, loc=(sx * (W / 2 + 0.006), 0, z0 + H * 0.72), scale=(0.006, 0.08, 0.03), smooth=False)
    # 錠前
    lp = prim('cube', 'lockplate', GOLD() if rich else BRASS(), r, loc=(0, -(D / 2 + 0.014), z0 + H - 0.08), scale=(0.075, 0.012, 0.09), smooth=False)
    bevel(lp, 0.01, 2)
    prim('cyl', 'keyhole', mat('hole', 0x080604, rough=1), r, loc=(0, -(D / 2 + 0.027), z0 + H - 0.07), rot=(math.pi / 2, 0, 0), scale=(0.013, 0.013, 0.004), vertices=10)
    prim('cube', 'keyslot', mat('hole', 0x080604, rough=1), r, loc=(0, -(D / 2 + 0.027), z0 + H - 0.1), scale=(0.005, 0.004, 0.02), smooth=False)
    if rich:
        prim('ico', 'lockgem', mat('richgem', 0xc01828, rough=0.05, emit=0xa01020, emit_str=1.0), r, loc=(0, -(D / 2 + 0.03), z0 + H - 0.03), scale=(0.022, 0.012, 0.022), subdivisions=1, smooth=False)
        for side in (-1, 1):  # 金の唐草の線
            for k in range(5):
                prim('torus', 'filig', GOLD(), r, loc=(-0.18 + k * 0.09, side * (D / 2 + 0.004), z0 + H * 0.5), rot=(math.pi / 2, 0, 0), major_radius=0.03, minor_radius=0.004, major_segments=14, minor_segments=4)
    # 蓋: 蝶番を原点にした空
    hingeZ = z0 + H + 0.02
    lid = empty('lid', r, (0, D / 2, hingeZ))
    n = 7
    R = D / 2
    for k in range(n):
        a0 = k / n * math.pi
        am = (k + 0.5) / n * math.pi
        cy, cz = -R + R * math.cos(am) * -1, R * math.sin(am)   # 弧の上の位置(蝶番からの相対)
        pl = prim('cube', 'lidplank', woodA if k % 2 else woodB, lid, loc=(0, -R - R * math.cos(am), R * math.sin(am)), rot=(-am + math.pi / 2, 0, 0), scale=(W / 2 - 0.01, R * math.sin(math.pi / n / 2) + 0.004, 0.018), smooth=False)
        bevel(pl, 0.005, 1)
    for sx in (-1, 1):  # 側面の半円
        bm = bmesh.new()
        pts = [bm.verts.new((sx * (W / 2 - 0.015), -R - R * math.cos(t / 16 * math.pi), R * math.sin(t / 16 * math.pi))) for t in range(17)]
        bm.faces.new(pts if sx > 0 else list(reversed(pts)))
        ob = new_obj('lidside', bm, woodB, lid, smooth=False)
        ob.modifiers.new('sol', 'SOLIDIFY').thickness = 0.03
    for x in (-0.32, 0.32):  # 蓋の帯
        bm = bmesh.new()
        segs = 18
        rr = R + 0.012
        outer = [bm.verts.new((x - 0.035, -R - rr * math.cos(t / segs * math.pi), rr * math.sin(t / segs * math.pi))) for t in range(segs + 1)]
        outer2 = [bm.verts.new((x + 0.035, -R - rr * math.cos(t / segs * math.pi), rr * math.sin(t / segs * math.pi))) for t in range(segs + 1)]
        for t in range(segs):
            bm.faces.new((outer[t], outer[t + 1], outer2[t + 1], outer2[t]))
        ob = new_obj('lidband', bm, band, lid, smooth=True)
        ob.modifiers.new('sol', 'SOLIDIFY').thickness = 0.01
        for t in (3, 9, 15):
            a = t / segs * math.pi
            prim('uv', 'rivet', rivet, lid, loc=(x, -R - (rr + 0.01) * math.cos(a), (rr + 0.01) * math.sin(a)), scale=(0.011, 0.011, 0.011), segments=8, ring_count=6)
    # 錠の掛け金(蓋の前から垂れる)
    hasp = prim('cube', 'hasp', GOLD() if rich else BRASS(), lid, loc=(0, -2 * R - 0.016, 0.02), scale=(0.03, 0.006, 0.07), smooth=False)
    bevel(hasp, 0.006, 1)
    # 中身
    tr = empty('treasure', r, (0, 0, 0))
    gold = mat('coingold', 0xe0b040, rough=0.3, metal=0.9, emit=0x5a3a00, emit_str=0.4)
    pile = prim('uv', 'pile', gold, tr, loc=(0, 0, z0 + H - 0.05), scale=(0.42, 0.24, 0.13), segments=24, ring_count=12)
    random.seed(5 if rich else 3)
    for i in range(40 if rich else 26):
        a, d = random.uniform(0, TAU), math.sqrt(random.random())
        x, y = math.cos(a) * d * 0.4, math.sin(a) * d * 0.22
        top = 0.13 * max(0.0, 1 - (x * x) / 0.18 - (y * y) / 0.055)
        prim('cyl', 'coin', gold, tr, loc=(x, y, z0 + H - 0.04 + math.sqrt(max(0.0, top)) * 0.32), rot=(random.uniform(-0.6, 0.6), random.uniform(-0.6, 0.6), random.uniform(0, 3)), scale=(0.035, 0.035, 0.004), vertices=12)
    for i, col in enumerate((0xff3050, 0x40a0ff, 0x40e080, 0xc060ff) + ((0xffd040, 0xff7020) if rich else ())):
        prim('ico', 'gem', mat('tgem%d' % i, col, rough=0.05, emit=col, emit_str=0.8), tr, loc=(random.uniform(-0.3, 0.3), random.uniform(-0.12, 0.12), z0 + H + 0.06 + random.uniform(0, 0.04)), scale=(0.04, 0.04, 0.055), subdivisions=1, smooth=False)
    cup = lathe('goblet', [(0.0, 0.0), (0.05, 0.0), (0.05, 0.012), (0.012, 0.02), (0.012, 0.09), (0.03, 0.1), (0.065, 0.16), (0.07, 0.19), (0.064, 0.19), (0.058, 0.165)], gold, tr, segs=20)
    cup.location = (0.3, 0.06, z0 + H - 0.02)
    cup.rotation_euler = (0.2, -0.35, 0)
    return r


# ---------------- 手(一人称で見える右手) ----------------
# 手の向き: 掌は -Y、指は +Z、親指は +X。指の曲げは X 軸まわり(+で掌側へ)
# 原点 = 物を握る・乗せる位置。腕と袖も付ける
SKIN = lambda: mat('skin', 0xd9a383, rough=0.55)
SLEEVE = lambda: mat('sleeve', 0x1c1226, rough=0.9)


def finger(parent, base, length, rad, curls, spread=0.0, nail=True):
    """3つの節。曲げを順に足していく"""
    seg = (0.45, 0.31, 0.24)
    pos = Vector(base)
    ang = 0.0
    sk = SKIN()
    for k in range(3):
        ang += curls[k]
        d = Vector((math.sin(spread) * 0.3, -math.sin(ang), math.cos(ang)))
        d.normalize()
        L = length * seg[k]
        rr = rad * (1 - 0.1 * k)
        mid = pos + d * (L / 2)
        c = prim('cyl', 'phal', sk, parent, loc=tuple(mid), scale=(rr, rr * 0.92, L / 2), vertices=10)
        c.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        prim('uv', 'joint', sk, parent, loc=tuple(pos), scale=(rr * 1.06, rr, rr * 1.04), segments=10, ring_count=8)
        pos = pos + d * L
    prim('uv', 'tip', sk, parent, loc=tuple(pos), scale=(rad * 0.82, rad * 0.78, rad * 0.86), segments=10, ring_count=8)
    if nail:
        back = Vector((0, math.cos(ang), math.sin(ang))) * (rad * 0.62)
        n = prim('cube', 'nail', mat('nail', 0xe8b8a0, rough=0.3), parent, loc=tuple(pos - d * (rad * 0.5) + back), scale=(rad * 0.6, rad * 0.12, rad * 0.75), smooth=False)
        n.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()


def hand(key, curls, thumb, origin_off):
    r = root(key)
    g = empty('hand', r, tuple(-Vector(origin_off)))  # 中身をずらして、原点を握る位置に合わせる
    sk = SKIN()
    palm = prim('cube', 'palm', sk, g, loc=(0, 0, 0), scale=(0.043, 0.016, 0.048), smooth=True)
    bevel(palm, 0.012, 3)
    subsurf(palm, 1)
    # 指の付け根の膨らみ
    for k, x in enumerate((-0.03, -0.01, 0.01, 0.03)):
        prim('uv', 'knuckle', sk, g, loc=(x, 0.006, 0.046), scale=(0.011, 0.01, 0.009), segments=10, ring_count=8)
    lens = (0.07, 0.08, 0.076, 0.062)
    rads = (0.0088, 0.0092, 0.009, 0.0078)
    for k, x in enumerate((-0.03, -0.01, 0.01, 0.03)):
        cu = curls[k] if isinstance(curls[0], (list, tuple)) else curls
        finger(g, (x, 0, 0.05), lens[k], rads[k], cu, spread=(k - 1.5) * 0.08)
    # 親指: 掌の +X 側の下から斜めに
    tb = Vector((0.04, -0.008, -0.022))
    a0, a1 = thumb
    d0 = Vector((0.55, -math.sin(a0), 0.8)).normalized()
    L0 = 0.04
    c = prim('cyl', 'thumb0', sk, g, loc=tuple(tb + d0 * L0 / 2), scale=(0.012, 0.011, L0 / 2), vertices=10)
    c.rotation_euler = d0.to_track_quat('Z', 'Y').to_euler()
    prim('uv', 'tbase', sk, g, loc=tuple(tb), scale=(0.016, 0.014, 0.018), segments=10, ring_count=8)
    p1 = tb + d0 * L0
    d1 = Vector((0.25, -math.sin(a0 + a1), 0.9)).normalized()
    L1 = 0.032
    c = prim('cyl', 'thumb1', sk, g, loc=tuple(p1 + d1 * L1 / 2), scale=(0.0105, 0.0098, L1 / 2), vertices=10)
    c.rotation_euler = d1.to_track_quat('Z', 'Y').to_euler()
    prim('uv', 'tjoint', sk, g, loc=tuple(p1), scale=(0.011, 0.0105, 0.011), segments=10, ring_count=8)
    tip = p1 + d1 * L1
    prim('uv', 'ttip', sk, g, loc=tuple(tip), scale=(0.0095, 0.009, 0.01), segments=10, ring_count=8)
    # 手首・前腕・袖・金の袖口
    prim('cyl', 'wrist', sk, g, loc=(0, 0.002, -0.06), scale=(0.026, 0.019, 0.02), vertices=14)
    prim('cyl', 'forearm', sk, g, loc=(0, 0.004, -0.17), scale=(0.03, 0.025, 0.1), vertices=14)
    sl = lathe('sleeve', [(0.04, -0.17), (0.05, -0.26), (0.062, -0.42)], SLEEVE(), g, segs=20)
    sl.scale = (1, 0.85, 1)
    prim('torus', 'cuff', GOLD(), g, loc=(0, 0, -0.172), major_radius=0.041, minor_radius=0.006, major_segments=24, minor_segments=6).scale = (1, 0.85, 1)
    return r


roots += [chest(False), chest(True)]
roots += [
    hand('hand_grip', ((0.95, 1.05, 0.8),) * 4, (0.9, 0.5), (0, -0.046, 0.075)),        # 太い物(瓶)を握る
    hand('hand_fist', ((1.35, 1.45, 1.1),) * 4, (1.1, 0.7), (0, -0.026, 0.06)),          # 細い物(小槌の柄)を握る
    hand('hand_palm', ((0.12, 0.18, 0.12),) * 4, (0.25, 0.1), (0, -0.03, 0.01)),         # 掌に物を乗せる
    hand('hand_reach', ((0.35, 0.45, 0.3),) * 4, (0.5, 0.2), (0, -0.01, 0.03)),          # 蓋に手を掛ける
]

# 並べて置く(書き出しには影響しないが、Blender で開いた時に見やすいように)
for i, r in enumerate(roots):
    r.location.x += (i % 8) * 1.6
    r.location.z += (i // 8) * 1.8

# ---------------- 古び(汚れ・擦れ)を頂点色に焼き込む ----------------
# 窪みには煤が溜まり、角は擦れて明るく、面にはまだらの汚れ。素材の色に掛け合わせる灰色として持たせる
from mathutils import noise as mnoise
GLOW = {'skin', 'nail', 'liquid', 'flashcore', 'flame', 'fire_core', 'deye', 'stargem', 'icecore', 'pearl', 'lantglass', 'glass', 'crystal', 'icepetal'}


def weather(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    if ob.modifiers:
        bpy.ops.object.convert(target='MESH')
    me = ob.data
    mname = me.materials[0].name if me.materials else ''
    bm = bmesh.new()
    bm.from_mesh(me)
    # 粗い形は細かく割って、汚れが乗るだけの頂点を作る
    if len(bm.verts) < 40 and mname not in GLOW:
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)
    bm.verts.ensure_lookup_table()
    bm.normal_update()
    vals = []
    wmat = ob.matrix_world
    for v in bm.verts:
        conc, n = 0.0, 0
        for e in v.link_edges:
            o = e.other_vert(v)
            d = o.co - v.co
            if d.length > 1e-6:
                conc += v.normal.dot(d.normalized())
                n += 1
        conc = conc / n if n else 0.0  # +: 窪み / -: 尖った角
        p = wmat @ v.co
        mott = mnoise.noise(p * 7.0) * 0.5 + mnoise.noise(p * 23.0) * 0.25
        c = 1.0 - max(0.0, conc) * 1.6 + max(0.0, -conc) * 0.5 + mott * 0.28
        vals.append(max(0.35, min(1.12, c)))
    if mname in GLOW:
        vals = [1.0] * len(vals)
    bm.to_mesh(me)
    bm.free()
    attr = me.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
    for i, c in enumerate(vals):
        attr.data[i].color = (min(1, c), min(1, c * 0.98), min(1, c * 0.93), 1.0)
    me.color_attributes.active_color = attr


for ob in [o for o in scene.objects if o.type == 'MESH']:
    weather(ob)

os.makedirs(os.path.dirname(OUT) or '.', exist_ok=True)
for o in scene.objects:
    o.select_set(True)
kw = dict(filepath=OUT, export_format='GLB', use_selection=False, export_apply=True, export_yup=True,
          export_animations=False, export_cameras=False, export_lights=False, export_texcoords=False)
for extra in ({'export_vertex_color': 'ACTIVE'}, {'export_colors': True}, {}):
    try:
        bpy.ops.export_scene.gltf(**kw, **extra)
        print('export opts', extra)
        break
    except TypeError as e:
        print('retry export', e)
blend = os.path.splitext(OUT)[0] + '.blend'
print('ITEMS ->', OUT, len(roots))
