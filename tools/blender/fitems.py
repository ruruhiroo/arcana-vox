# 手に持つ道具・素材を彫る(魔力薬・古文書・魔晶・骨片・鉄屑・閃光玉・導灯・言霊の欠片)。
#   blender -b --factory-startup -P tools/blender/fitems.py -- <出力先> [種類...]   (環境変数 PREVIEW=絵の出力先)
# 向き(Blender): +Z が上、-Y が手前(持った時に見える側)。大きさは実寸(ゲーム側が持つ時・絵にする時に揃える)。
# 材質の名前でゲーム側の扱いが変わる: glass = 透ける硝子 / liquid = 光る薬液(骨 liquid で水位が下がる) / crystal・glow = 光る
import sys, os, math, importlib, random
sys.path.insert(0, os.path.dirname(__file__))
import rig as R, forge, anatomy
for m in (R, forge, anatomy):
    importlib.reload(m)
from rig import Rig, sphere, box, cone
from anatomy import ell, cap, chain, clay, dent
from mathutils import Vector as V, Matrix
import bmesh

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'public/models'
ONLY = set(argv[1:])
TAU = math.tau

forge.PRESETS['paper'] = [('CLOUDS', 0.05, 0.0012, {}), ('STUCCI', 0.012, 0.0006, {}), ('CLOUDS', 0.004, 0.0004, {})]
forge.SURFACE_OF.update({'paper': 'paper', 'cork': 'wood', 'iron': 'metal', 'brass': 'metal'})


def hexc(c):
    return ((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def item(name, first, rough=0.85, metal=0.0, voxel=0.0013, tex=512, tris=2600, smooth=3, scale=0.35):
    r = Rig('item-' + name)
    r.j('base', (0, 0, 0), 0.001, skin=False)
    r.identity_bones = True
    r.clay_smooth = smooth
    r.bump = 0.0
    r.voxel = voxel
    r.tex = tex
    r.tris = tris
    r.scale = scale
    r.cage = 0.004
    r.ray = 0.012
    r.mat(first, rough=rough, metal=metal)
    r.weight_fn = lambda p: None
    r.regions = []
    r.view = [(0.5, -1.6, 0.5), (-1.2, -1.0, 0.3)]
    return r


def region(r, surface, test, color, rough, metal=0.0):
    c = color if callable(color) else (lambda p, n, k=hexc(color): tuple(v * (0.85 + 0.3 * n) for v in k))
    r.regions.append((surface, lambda p, nb: 1.0 if test(p) else 0.0, c, rough, metal))


def cyl(r1, r2, h, c, seg=24, axis=None):
    """円柱(下 r1・上 r2)。axis を与えるとその向きに寝かせる"""
    def f(bm):
        m = Matrix.Translation(V(c))
        if axis is not None:
            m = m @ V((0, 0, 1)).rotation_difference(V(axis).normalized()).to_matrix().to_4x4()
        return bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=max(r2, 1e-5), depth=h, matrix=m)['verts']
    return f


def cbox(size, c, rot=(0, 0, 0)):
    from mathutils import Euler
    def f(bm):
        m = Matrix.Translation(V(c)) @ Euler(rot, 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1))
        return bmesh.ops.create_cube(bm, size=1.0, matrix=m)['verts']
    return f


def torus(R_, r_, c, seg=28, sub=10):
    def f(bm):
        rows = []
        for i in range(seg):
            a = i / seg * TAU
            rows.append([bm.verts.new((c[0] + (R_ + r_ * math.cos(b / sub * TAU)) * math.cos(a), c[1] + (R_ + r_ * math.cos(b / sub * TAU)) * math.sin(a), c[2] + r_ * math.sin(b / sub * TAU))) for b in range(sub)])
        fs = []
        for i in range(seg):
            for b in range(sub):
                fs.append(bm.faces.new((rows[i][b], rows[(i + 1) % seg][b], rows[(i + 1) % seg][(b + 1) % sub], rows[i][(b + 1) % sub])))
        bmesh.ops.recalc_face_normals(bm, faces=fs)
        return [v for row in rows for v in row]
    return f


def lathe(profile, seg=32):
    """(半径, z) の列を回した面(開いていてもよい)"""
    def f(bm):
        rings = []
        for rr, z in profile:
            rings.append([bm.verts.new((math.cos(k / seg * TAU) * rr, math.sin(k / seg * TAU) * rr, z)) for k in range(seg)] if rr > 1e-6 else [bm.verts.new((0, 0, z))])
        fs = []
        for a, b in zip(rings, rings[1:]):
            for k in range(seg):
                k2 = (k + 1) % seg
                if len(a) == 1 and len(b) > 1:
                    fs.append(bm.faces.new((a[0], b[k], b[k2])))
                elif len(b) == 1 and len(a) > 1:
                    fs.append(bm.faces.new((a[k], b[0], a[k2])))
                elif len(a) > 1:
                    fs.append(bm.faces.new((a[k], b[k], b[k2], a[k2])))
        bmesh.ops.recalc_face_normals(bm, faces=fs)
        return [v for row in rings for v in row]
    return f


def prism(base, d, length, rad, seg=6, tip=0.3):
    """六角柱の結晶(先が尖る)"""
    base, d = V(base), V(d).normalized()
    q = V((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()
    def f(bm):
        vs = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=rad, radius2=rad * 0.86, depth=length, matrix=Matrix.Translation(base + d * length / 2) @ q)['verts']
        vs += bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=rad * 0.86, radius2=1e-5, depth=length * tip, matrix=Matrix.Translation(base + d * length * (1 + tip / 2)) @ q)['verts']
        return vs
    return f


# ---- 魔力薬: 丸底の硝子瓶。蝋で封じた栓、首に巻いた麻紐と荷札 ----
def ether():
    r = item('ether', 'cork', rough=0.9)
    r.j('liquid', (0, 0, 0.05), 0.001, 'base', skin=False)
    glass = r.mat('glass', 0xbfd4e6, rough=0.05, emit=0.01)
    liquid = r.mat('liquid', 0x3458d8, rough=0.2, emit=1.2)
    r.part(lathe([(0, 0.002), (0.028, 0.004), (0.043, 0.022), (0.047, 0.045), (0.041, 0.068), (0.024, 0.088), (0.0135, 0.099), (0.0135, 0.112), (0.0165, 0.116), (0.0165, 0.119)]), 'base', glass, 0xbfd4e6)
    r.part(lathe([(0, 0.006), (0.027, 0.008), (0.041, 0.024), (0.044, 0.045), (0.041, 0.058), (0, 0.059)]), 'liquid', liquid, 0x3458d8)
    clay(r, cyl(0.0115, 0.0135, 0.03, (0, 0, 0.118)))                          # 栓
    clay(r, ell((0, 0, 0.134), (0.0165, 0.0165, 0.008)))                      # 封蝋のかさ
    rnd = random.Random(3)
    for k in range(6):                                                        # 蝋の垂れ
        a = k / 6 * TAU + rnd.uniform(-0.3, 0.3)
        L = rnd.uniform(0.008, 0.022)
        clay(r, cap(V((math.cos(a) * 0.0155, math.sin(a) * 0.0155, 0.131)), V((math.cos(a) * 0.0165, math.sin(a) * 0.0165, 0.131 - L)), 0.0035, 0.0028, 8))
    for z in (0.101, 0.1045, 0.108):                                          # 麻紐
        clay(r, torus(0.0145, 0.0021, (0, 0, z)))
    clay(r, cap(V((0.0, -0.016, 0.104)), V((0.012, -0.03, 0.082)), 0.0014, 0.0014, 6))
    clay(r, cbox((0.024, 0.0022, 0.034), (0.016, -0.034, 0.064), rot=(0.25, 0.3, 0.2)))   # 荷札
    region(r, 'cloth', lambda p: p.z > 0.1262, lambda p, n: mix((0.5, 0.05, 0.04), (0.3, 0.02, 0.02), 0.5 - n), 0.35)
    region(r, 'cloth', lambda p: 0.098 < p.z < 0.111 and math.hypot(p.x, p.y) > 0.0128 or (p.z < 0.105 and p.z > 0.084 and p.y < -0.014 and math.hypot(p.x - 0.006, p.y + 0.023) < 0.012 and abs(p.z - (0.104 - (math.hypot(p.x, p.y + 0.016)) * 1.2)) < 0.004), 0x8a6a40, 1.0)
    region(r, 'paper', lambda p: p.z < 0.084 and p.y < -0.02, lambda p, n: mix((0.78, 0.68, 0.48), (0.5, 0.38, 0.22), max(0, -n) * 1.4), 0.95)
    r.color_fn = lambda p, near, n: mix((0.5, 0.36, 0.22), (0.3, 0.2, 0.12), max(0, -n) * 1.5)
    return r


# ---- 古文書: 巻いた羊皮紙。木の軸、色あせた帯、封蝋 ----
def scroll():
    r = item('scroll', 'paper', rough=0.95, tris=3000)
    clay(r, cyl(0.021, 0.021, 0.13, (0, 0, 0.08)))
    clay(r, cbox((0.004, 0.03, 0.128), (0.019, -0.012, 0.08), rot=(0, 0, 0.5)))  # 巻き終わりの端
    for z, s in ((0.012, -1), (0.148, 1)):
        clay(r, cyl(0.0065, 0.0065, 0.03, (0, 0, z)))                         # 軸
        clay(r, ell((0, 0, z + s * 0.015), (0.0105, 0.0105, 0.007)))           # 軸の頭
        for k in range(1, 4):                                                 # 巻きの段(小口)
            dent(r, V((0, 0, 0.08 + s * 0.0655)), (0.006 + k * 0.004, 0.006 + k * 0.004, 0.0025), 0.0007)
    clay(r, cyl(0.0225, 0.0225, 0.018, (0, 0, 0.08)))                         # 帯
    clay(r, ell((0, -0.0225, 0.08), (0.013, 0.0045, 0.013)))                  # 封蝋
    dent(r, V((0, -0.027, 0.08)), (0.0075, 0.003, 0.0075), 0.0012)
    for k in range(5):
        a = k / 5 * TAU
        dent(r, V((math.cos(a) * 0.004, -0.0275, 0.08 + math.sin(a) * 0.004)), (0.0016, 0.002, 0.0016), 0.0008)
    for k in range(7):                                                        # 紙の傷み(縁の欠け)
        a = k * 2.4
        dent(r, V((math.cos(a) * 0.021, math.sin(a) * 0.021, 0.143 if k % 2 else 0.017)), (0.006, 0.006, 0.005), 0.003)
    region(r, 'wood', lambda p: math.hypot(p.x, p.y) < 0.012 and (p.z < 0.0148 or p.z > 0.1452), 0x4a2e18, 0.7)
    region(r, 'cloth', lambda p: 0.0712 < p.z < 0.0888 and math.hypot(p.x, p.y) > 0.0214 and not (p.y < -0.02 and math.hypot(p.x, p.z - 0.08) < 0.0135), lambda p, n: mix((0.36, 0.07, 0.07), (0.2, 0.04, 0.05), 0.5 - n), 0.8)
    region(r, 'cloth', lambda p: p.y < -0.0205 and math.hypot(p.x, p.z - 0.08) < 0.0135, lambda p, n: mix((0.55, 0.06, 0.05), (0.33, 0.03, 0.03), 0.5 - n), 0.3)

    def col(p, near, n):
        c = mix((0.8, 0.7, 0.5), (0.52, 0.4, 0.24), max(0, -n) * 1.5)
        e = min(abs(p.z - 0.015), abs(p.z - 0.145))
        return mix(c, (0.42, 0.3, 0.17), max(0, 1 - e / 0.012) * 0.6)         # 縁は焼けている
    r.color_fn = col
    return r


# ---- 魔晶: 岩に生えた結晶の群れ ----
def crystal():
    r = item('crystal', 'stone', rough=0.95, voxel=0.002, smooth=2, scale=0.5)
    cr = r.mat('crystal', 0x6ab8ff, rough=0.08, emit=0.7)
    rnd = random.Random(8)
    for k in range(7):
        a = k / 7 * TAU
        clay(r, ell((math.cos(a) * 0.035 * rnd.uniform(0.5, 1), math.sin(a) * 0.03 * rnd.uniform(0.5, 1), 0.012), (rnd.uniform(0.02, 0.032), rnd.uniform(0.018, 0.03), rnd.uniform(0.012, 0.02))))
    for bx, by, dx, dy, L, rad in ((0, 0, 0.05, 0.0, 0.1, 0.017), (-0.022, 0.008, -0.45, 0.15, 0.065, 0.012), (0.024, -0.006, 0.5, -0.2, 0.055, 0.011),
                                   (0.004, -0.024, 0.1, -0.6, 0.045, 0.0095), (-0.008, 0.026, -0.15, 0.6, 0.05, 0.01), (0.03, 0.02, 0.7, 0.5, 0.032, 0.008), (-0.034, -0.014, -0.8, -0.4, 0.03, 0.0075)):
        r.part(prism((bx, by, 0.012), (dx, dy, 1), L, rad), 'base', cr, 0x6ab8ff, smooth=False)
    r.color_fn = lambda p, near, n: mix((0.2, 0.19, 0.2), (0.07, 0.07, 0.08), max(0, -n) * 1.6)
    return r


# ---- 骨片: 折れた大腿骨 ----
def bone():
    r = item('bone', 'bone', rough=0.8, smooth=6, tris=2200)
    a, b = V((0, 0, 0.02)), V((0.006, 0, 0.14))
    clay(r, chain([a, a.lerp(b, 0.5) + V((0.003, 0, 0)), b], [0.0115, 0.0088, 0.0105], 14))
    clay(r, ell((-0.011, 0, 0.012), (0.0135, 0.0125, 0.013)))                  # 膝側の二つの顆
    clay(r, ell((0.012, 0, 0.011), (0.0125, 0.012, 0.012)))
    clay(r, ell((0.012, 0.0, 0.151), (0.0125, 0.0115, 0.012)))                # 骨頭
    clay(r, ell((-0.006, 0, 0.147), (0.009, 0.009, 0.011)))                   # 大転子
    dent(r, V((0, -0.011, 0.006)), (0.005, 0.008, 0.012), 0.004)
    for k in range(5):                                                        # 噛み跡・欠け
        dent(r, V((0.004 + 0.008 * math.cos(k * 2.1), 0.008 * math.sin(k * 2.1), 0.05 + k * 0.016)), (0.004, 0.004, 0.0025), 0.0016)
    r.color_fn = lambda p, near, n: mix(mix((0.82, 0.76, 0.6), (0.5, 0.42, 0.28), max(0, -n) * 1.6), (0.56, 0.47, 0.32), max(0, 1 - min(p.z - 0.0, 0.16 - p.z) / 0.03) * 0.45)
    return r


# ---- 鉄屑: 歪んだ鉄板・歯車・曲がった釘 ----
def iron():
    r = item('iron', 'iron', rough=0.55, metal=0.85, voxel=0.0014, smooth=2, tris=3200)
    clay(r, cbox((0.11, 0.07, 0.006), (0, 0, 0.006), rot=(0.06, -0.05, 0.2)))
    clay(r, cbox((0.07, 0.045, 0.005), (0.018, 0.012, 0.014), rot=(-0.12, 0.2, -0.5)))
    clay(r, cyl(0.026, 0.026, 0.007, (-0.03, -0.012, 0.018), axis=(0.15, -0.1, 1)))          # 歯車
    for k in range(10):
        a = k / 10 * TAU
        clay(r, cbox((0.009, 0.007, 0.007), (-0.03 + math.cos(a) * 0.028, -0.012 + math.sin(a) * 0.028, 0.018 + math.cos(a) * -0.004), rot=(0, 0, a)))
    dent(r, V((-0.03, -0.012, 0.022)), (0.008, 0.008, 0.01), 0.01)
    clay(r, chain([V((0.05, -0.03, 0.01)), V((0.02, -0.035, 0.016)), V((-0.005, -0.03, 0.03))], [0.003, 0.003, 0.0012], 8))   # 釘
    clay(r, ell((0.052, -0.03, 0.01), (0.002, 0.0065, 0.0065)))
    for k in range(6):
        dent(r, V((math.cos(k * 1.7) * 0.04, math.sin(k * 1.7) * 0.025, 0.01)), (0.01, 0.01, 0.004), 0.002)

    def col(p, near, n):
        c = mix((0.36, 0.36, 0.39), (0.16, 0.16, 0.18), max(0, -n) * 1.2)
        return mix(c, (0.42, 0.2, 0.09), max(0, n * 2.4 - 0.15))              # 錆
    r.color_fn = col
    return r


# ---- 閃光玉: 光を封じた硝子玉。真鍮の口金と吊り輪 ----
def flash():
    r = item('flash', 'brass', rough=0.42, metal=0.9, tris=2200)
    glass = r.mat('glass', 0xe8e2c4, rough=0.05, emit=0.01)
    glow = r.mat('glow', 0xfff2c0, rough=0.3, emit=3.0)
    r.part(sphere(0.042, (0, 0, 0.045), seg=28, rings=18), 'base', glass, 0xe8e2c4)
    r.part(sphere(0.019, (0, 0, 0.045), seg=14, rings=10), 'base', glow, 0xfff2c0)
    clay(r, cyl(0.02, 0.014, 0.016, (0, 0, 0.091)))
    clay(r, cyl(0.0225, 0.0225, 0.004, (0, 0, 0.084)))
    clay(r, torus(0.008, 0.0024, (0, 0, 0.106)))
    r.clay[-1] = (lambda g: (lambda bm: [setattr(v, 'co', V((v.co.x, (v.co.z - 0.106), 0.106 + v.co.y))) or v for v in g(bm)]))(r.clay[-1])   # 輪を立てる
    for k in range(4):                                                        # 玉を抱える四本の爪
        a = k / 4 * TAU + 0.4
        clay(r, chain([V((math.cos(a) * 0.02, math.sin(a) * 0.02, 0.084)), V((math.cos(a) * 0.036, math.sin(a) * 0.036, 0.07)), V((math.cos(a) * 0.043, math.sin(a) * 0.043, 0.05))], [0.003, 0.0026, 0.0016], 8))
    r.color_fn = lambda p, near, n: mix((0.62, 0.48, 0.2), (0.25, 0.18, 0.07), max(0, -n) * 1.5)
    return r


# ---- 導灯: 鉄枠の手提げ灯 ----
def lantern():
    r = item('lantern', 'iron', rough=0.6, metal=0.8, voxel=0.0015, smooth=2, tris=3600, scale=0.4)
    glass = r.mat('glass', 0xd8b070, rough=0.08, emit=0.01)
    glow = r.mat('glow', 0xffc060, rough=0.3, emit=3.0)
    clay(r, cyl(0.04, 0.036, 0.012, (0, 0, 0.006), seg=6))                    # 台
    clay(r, cyl(0.03, 0.034, 0.006, (0, 0, 0.015), seg=6))
    clay(r, cyl(0.04, 0.012, 0.03, (0, 0, 0.123), seg=6))                     # 屋根
    clay(r, cyl(0.036, 0.036, 0.005, (0, 0, 0.107), seg=6))
    clay(r, cyl(0.008, 0.006, 0.012, (0, 0, 0.143)))
    for k in range(6):                                                        # 柱
        a = k / 6 * TAU
        clay(r, cyl(0.0032, 0.0032, 0.092, (math.cos(a) * 0.033, math.sin(a) * 0.033, 0.062), seg=8))
    clay(r, torus(0.0335, 0.0022, (0, 0, 0.062), seg=6, sub=8))               # 胴の帯
    ring = torus(0.022, 0.0024, (0, 0, 0.0))                                  # 提げ輪(立てる)
    clay(r, lambda bm: [setattr(v, 'co', V((v.co.x, v.co.z, 0.163 + v.co.y))) or v for v in ring(bm)])
    r.part(cone(0.031, 0.031, 0.088, (0, 0, 0.062), seg=6, caps=False), 'base', glass, 0xd8b070, smooth=False)
    r.part(sphere(0.01, (0, 0, 0.045), seg=10, rings=8, scale=(1, 1, 1.9)), 'base', glow, 0xffc060)
    clay(r, cyl(0.009, 0.007, 0.02, (0, 0, 0.028)))                           # 蝋燭の受け

    def col(p, near, n):
        c = mix((0.2, 0.2, 0.22), (0.08, 0.08, 0.09), max(0, -n) * 1.3)
        return mix(c, (0.35, 0.17, 0.08), max(0, n * 2.2 - 0.3))
    r.color_fn = col
    return r


# ---- 言霊の欠片: 砕けた石板。刻まれた一語の線が、まだ光っている ----
def shard():
    r = item('shard', 'stone', rough=0.9, voxel=0.0014, smooth=1, tris=2400, scale=0.4)
    glow = r.mat('glow', 0xc890ff, rough=0.3, emit=2.6)
    def slab(bm):
        pts = [(-0.035, 0.0), (-0.02, 0.05), (0.004, 0.092), (0.03, 0.07), (0.04, 0.03), (0.022, 0.0), (0.0, -0.012)]
        lo = [bm.verts.new((x, 0.008, 0.02 + z)) for x, z in pts]
        hi = [bm.verts.new((x * 0.92, -0.008, 0.02 + z * 0.96)) for x, z in pts]
        fs = [bm.faces.new(lo), bm.faces.new(list(reversed(hi)))]
        n = len(pts)
        for i in range(n):
            fs.append(bm.faces.new((lo[i], hi[i], hi[(i + 1) % n], lo[(i + 1) % n])))
        bmesh.ops.recalc_face_normals(bm, faces=fs)
        return lo + hi
    clay(r, slab)
    for k in range(8):                                                        # 割れ口の荒れ
        dent(r, V((math.cos(k * 0.9) * 0.03, 0, 0.06 + math.sin(k * 0.9) * 0.04)), (0.008, 0.012, 0.008), 0.003)
    strokes = [((-0.014, 0.03), (-0.014, 0.085)), ((-0.014, 0.085), (0.01, 0.092)), ((-0.004, 0.05), (0.02, 0.058)), ((0.01, 0.092), (0.012, 0.035)), ((0.012, 0.035), (0.028, 0.04)), ((-0.022, 0.06), (-0.002, 0.066))]
    for (x0, z0), (x1, z1) in strokes:                                        # 刻まれた線(溝の底が光る)
        for k in range(7):
            t = k / 6
            dent(r, V((x0 + (x1 - x0) * t, -0.0085, z0 + (z1 - z0) * t)), (0.0034, 0.004, 0.0034), 0.0022)
        r.part(anatomy.cap(V((x0, -0.0068, z0)), V((x1, -0.0068, z1)), 0.0013, 0.0013, 6), 'base', glow, 0xc890ff)
    r.color_fn = lambda p, near, n: mix((0.33, 0.31, 0.36), (0.1, 0.09, 0.12), max(0, -n) * 1.5)
    return r


BUILDERS = {'ether': ether, 'scroll': scroll, 'crystal': crystal, 'bone': bone, 'iron': iron, 'flash': flash, 'lantern': lantern, 'shard': shard}

if __name__ == '__main__':
    pv = os.environ.get('PREVIEW')
    for name, fn in BUILDERS.items():
        if ONLY and name not in ONLY:
            continue
        try:
            forge.build(fn(), os.path.abspath(os.path.join(OUT, 'item-' + name + '.glb')), preview=os.path.join(pv, 'item-' + name + '.png') if pv else None)
        except Exception as e:
            import traceback
            traceback.print_exc()
            print('FAILED', name, e)
