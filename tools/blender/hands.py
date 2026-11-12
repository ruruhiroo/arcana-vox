# 一人称の手(4つの形)と、聖域の焚き火を彫る。
#   blender -b --factory-startup -P tools/blender/hands.py -- <出力先> [種類...]   (環境変数 PREVIEW=絵の出力先)
# 手の向きと原点は tools/blender/build_items.py の手(hand_grip など)と同じ: 指は +Z、掌は -Y 側、親指は +X 側(右手)。
import sys, os, math, importlib, random
sys.path.insert(0, os.path.dirname(__file__))
import rig as R, forge, anatomy
for m in (R, forge, anatomy):
    importlib.reload(m)
from rig import Rig, sphere, box, cone, ring
from anatomy import ell, cap, chain, clay, dent
from mathutils import Vector as V, Matrix
import bmesh

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'public/models'
ONLY = set(argv[1:])
TAU = math.pi * 2


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def base(name, first, rough, voxel, tex, tris, scale):
    r = Rig(name)
    r.j('base', (0, 0, 0), 0.001, skin=False)
    r.identity_bones = True
    r.bump = 0.0
    r.voxel = voxel
    r.tex = tex
    r.tris = tris
    r.scale = scale
    r.mat(first, rough=rough)
    r.weight_fn = lambda p: None
    return r


def hand(key, curls, thumb, off):
    r = base('fp-' + key, 'skin', 0.55, 0.0016, 1024, 5000, 0.5)
    r.clay_smooth = 16
    r.surface = 'skin'
    r.detail = 1.3
    O = -V(off)
    cloth = r.mat('cloth', rough=0.92)
    gold = r.mat('gold', rough=0.4, metal=0.85)
    # 掌: 親指の付け根と小指側の丘、手の甲の腱
    clay(r, ell(O + V((0, 0, 0)), (0.043, 0.0165, 0.05)))
    clay(r, ell(O + V((0.026, -0.008, -0.02)), (0.02, 0.014, 0.028)))        # 母指球
    clay(r, ell(O + V((-0.028, -0.006, -0.016)), (0.014, 0.011, 0.03)))      # 小指球
    lens = (0.07, 0.08, 0.076, 0.062)
    rads = (0.0108, 0.0112, 0.011, 0.0096)
    xs = (-0.03, -0.01, 0.01, 0.03)
    for k, x in enumerate(xs):
        clay(r, ell(O + V((x, 0.007, 0.047)), (0.0115, 0.0105, 0.0095)))     # 指の付け根の節
        clay(r, cap(O + V((x * 0.75, 0.012, -0.02)), O + V((x, 0.011, 0.045)), 0.0032, 0.0045, 8))   # 甲の腱
        cu = curls[k] if isinstance(curls[0], (list, tuple)) else curls
        p = O + V((x, 0, 0.05))
        a = 0.0
        sp = (k - 1.5) * 0.08
        pts, rr = [p.copy()], [rads[k] * 1.08]
        for j, (seg, bend) in enumerate(zip((0.45, 0.3, 0.25), cu)):
            a += bend
            d = V((sp, -math.sin(a), math.cos(a))).normalized()
            p = p + d * lens[k] * seg
            pts.append(p.copy())
            rr.append(rads[k] * (1.0 - 0.09 * (j + 1)))
            if j < 2:
                clay(r, ell(p, rads[k] * (1.0 - 0.1 * (j + 1)) * 1.04))      # 関節のふくらみ(ごくわずか)
        clay(r, chain(pts, rr, 12))
        # 爪
        tip, prev = pts[-1], pts[-2]
        dn = (tip - prev).normalized()
        back = V((0, 1, 0)) - dn * dn.y
        back.normalize()
        r.part(sphere(rads[k] * 0.78, tuple(tip - dn * rads[k] * 0.7 + back * rads[k] * 0.62), seg=10, rings=6, scale=(1, 0.35, 1.25)), 'base', 0, 0xc9a898)
    # 親指
    tb = O + V((0.04, -0.008, -0.022))
    a0, a1 = thumb
    d0 = V((0.55, -math.sin(a0), 0.8)).normalized()
    p1 = tb + d0 * 0.04
    d1 = V((0.25, -math.sin(a0 + a1), 0.9)).normalized()
    tip = p1 + d1 * 0.032
    clay(r, ell(tb, (0.017, 0.015, 0.019)))
    clay(r, chain([tb, p1, tip], [0.0135, 0.012, 0.0102], 12))
    r.part(sphere(0.0085, tuple(tip - d1 * 0.008 + V((0.006, 0.002, 0)) ), seg=10, rings=6, scale=(0.5, 1.0, 1.2)), 'base', 0, 0xc9a898)
    # 手首(尺骨の出っ張り)・前腕・袖
    clay(r, ell(O + V((0, 0.002, -0.062)), (0.027, 0.02, 0.022)))
    clay(r, ell(O + V((-0.022, 0.01, -0.066)), 0.009))
    clay(r, cap(O + V((0, 0.003, -0.07)), O + V((0, 0.004, -0.26)), 0.027, 0.033, 16))
    def sleeve(bm):
        vs = []
        for (r0, z0), (r1, z1) in (((0.041, -0.168), (0.052, -0.26)), ((0.052, -0.26), (0.064, -0.42))):
            m = Matrix.Translation(O + V((0, 0, (z0 + z1) / 2))) @ Matrix.Diagonal((1, 0.86, 1, 1))
            vs += bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=r1, radius2=r0, depth=abs(z1 - z0), matrix=m)['verts']
        return vs
    clay(r, sleeve)
    for k in range(7):          # 袖のしわ
        a = k / 7 * TAU
        dent(r, O + V((math.cos(a) * 0.052, math.sin(a) * 0.045, -0.3)), (0.012, 0.012, 0.09), 0.006)
    zc = O.z - 0.165
    r.regions = [('cloth', lambda p, nb: 1.0 if p.z < zc else 0.0, lambda p, n: (0.075 + 0.05 * n, 0.07 + 0.045 * n, 0.105 + 0.06 * n), 0.92, 0.0)]

    def col(p, near, n):
        c = mix((0.78, 0.6, 0.5), (0.5, 0.33, 0.27), max(0, -n) * 1.2)
        if (p - O).y < -0.004 and p.z > O.z - 0.05:
            c = mix(c, (0.84, 0.62, 0.55), 0.5)                               # 掌は血色がある
        if p.z > O.z + 0.045:
            c = mix(c, (0.72, 0.5, 0.44), 0.25)
        return c
    r.color_fn = col
    r.part(ring(0.043, 0.0065, tuple(O + V((0, 0, -0.172))), seg=28, scale=(1, 0.86, 1)), 'base', gold, 0xb08a3c)
    r.view = [(0.4, -1.6, 0.5), (-1.2, 1.2, 0.4)]
    return r


def campfire():
    """聖域の焚き火: 円く並べた石、組んだ薪、灰と燠火"""
    r = base('decor-campfire', 'stone', 0.95, 0.011, 1024, 5000, 1.0)
    r.clay_smooth = 3
    r.bump = 0.01
    r.bump_freq = 9
    rnd = random.Random(4)
    stones = []
    for i in range(9):
        a = i / 9 * TAU + rnd.uniform(-0.1, 0.1)
        c = V((math.cos(a) * 0.46, math.sin(a) * 0.46, 0.08))
        s = (rnd.uniform(0.11, 0.17), rnd.uniform(0.1, 0.15), rnd.uniform(0.08, 0.12))
        clay(r, ell(c, s))
        stones.append((c, max(s) * 1.25))
    clay(r, ell((0, 0, 0.0), (0.4, 0.4, 0.045)))                              # 灰の山
    wood = r.mat('wood', rough=0.9)
    ember = r.mat('guardian-coreMat', 0xff7a20, emit=3.5)
    for i in range(5):          # 薪を円錐に組む
        a = i / 5 * TAU + 0.3
        b = V((math.cos(a) * 0.3, math.sin(a) * 0.3, 0.06))
        t = V((-math.cos(a) * 0.04, -math.sin(a) * 0.04, 0.5))
        d = t - b
        r.part(cone(0.05, 0.04, d.length, tuple((b + t) / 2), rot=tuple(V((0, 0, 1)).rotation_difference(d.normalized()).to_euler()), seg=9), 'base', wood, (0x2a1a10, 0x1c120c, 0x3a2414)[i % 3])
    for i in range(3):
        a = i / 3 * TAU
        r.part(cone(0.045, 0.045, 0.5, (math.cos(a) * 0.1, math.sin(a) * 0.1, 0.07), rot=(math.pi / 2, 0, a + 0.6), seg=8), 'base', wood, 0x140c08)
    for i in range(10):         # 燠火
        a = rnd.uniform(0, TAU)
        d = rnd.uniform(0.02, 0.24)
        r.part(sphere(rnd.uniform(0.02, 0.04), (math.cos(a) * d, math.sin(a) * d, 0.055 + rnd.uniform(0, 0.04)), seg=6, rings=4, scale=(1.2, 1, 0.6)), 'base', ember, 0xff7a20)

    def col(p, near, n):
        d = math.hypot(p.x, p.y)
        if d < 0.38 and p.z < 0.07:
            return mix((0.16, 0.15, 0.14), (0.03, 0.03, 0.03), max(0, -n) * 1.6 + 0.2)     # 灰
        c = mix((0.33, 0.31, 0.28), (0.1, 0.09, 0.08), max(0, -n) * 1.6)
        inner = max(0.0, 1 - (d - 0.3) / 0.14)
        return mix(c, (0.035, 0.03, 0.028), min(1, inner) * 0.85)                            # 火の側は煤けている
    r.color_fn = col
    r.view = [(-0.9, -1.5, 0.9), (1.2, -1.2, 0.5)]
    return r


BUILDERS = {
    'fp-hand_grip': lambda: hand('hand_grip', ((0.95, 1.05, 0.8),) * 4, (0.9, 0.5), (0, -0.046, 0.075)),
    'fp-hand_fist': lambda: hand('hand_fist', ((1.35, 1.45, 1.1),) * 4, (1.1, 0.7), (0, -0.026, 0.06)),
    'fp-hand_palm': lambda: hand('hand_palm', ((0.12, 0.18, 0.12),) * 4, (0.25, 0.1), (0, -0.03, 0.01)),
    'fp-hand_reach': lambda: hand('hand_reach', ((0.35, 0.45, 0.3),) * 4, (0.5, 0.2), (0, -0.01, 0.03)),
    'decor-campfire': campfire,
}

if __name__ == '__main__':
    pv = os.environ.get('PREVIEW')
    for name, fn in BUILDERS.items():
        if ONLY and name not in ONLY:
            continue
        try:
            forge.build(fn(), os.path.abspath(os.path.join(OUT, name + '.glb')), preview=os.path.join(pv, name + '.png') if pv else None)
        except Exception as e:
            import traceback
            traceback.print_exc()
            print('FAILED', name, e)
