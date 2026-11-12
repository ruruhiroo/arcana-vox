# 守護者(各層の主)を作る。姿の理由は design/bestiary.md。
#   blender -b --factory-startup -P tools/blender/guardians.py -- <出力先> [種類...]   (環境変数 PREVIEW=絵の出力先)
# 骨はすべて同じ向き(真上)で書き出すので、ゲーム側は骨をそのまま回して動かす(動きはゲーム側で付ける)。
# 実寸(メートル)で作る。+Y が正面。
import sys, os, math, importlib, random
sys.path.insert(0, os.path.dirname(__file__))
import rig as R, forge, anatomy, build_models as B
for m in (R, forge, anatomy):
    importlib.reload(m)
from rig import Rig, sphere, box, cone, ring
from anatomy import ell, cap, chain, clay, dent, flesh, head, P
from build_models import humanoid, mix, hexc, J
from mathutils import Vector as V, Matrix, Euler
import bmesh

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'public/models'
ONLY = set(argv[1:])
TAU = math.pi * 2
CORE = 'guardian-coreMat'      # ゲーム側が属性の色に光らせる材質の名前


def sm(x, a, b):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def region(r, surface, fn, color, rough=0.9, metal=0.0):
    if not hasattr(r, 'regions'):
        r.regions = []
    r.regions.append((surface, fn, color, rough, metal))


def blobs(items):
    """[(中心, 半径)] の近くにいるほど 1 に近い重みを返す関数(近い物だけを素早く調べる)"""
    from mathutils import kdtree
    kd = kdtree.KDTree(len(items))
    for i, (c, rad) in enumerate(items):
        kd.insert(c, i)
    kd.balance()
    rmax = max(rad for c, rad in items)
    def w(p, nb=None):
        best = 0.0
        for co, i, d in kd.find_range(p, rmax):
            best = max(best, sm(1.0 - d / items[i][1], 0.0, 0.35))
        return best
    return w


def aim(d):
    """部品(円錐など)の軸(+Z)を d の向きに合わせる回転"""
    return tuple(V((0, 0, 1)).rotation_difference(V(d).normalized()).to_euler())


def spike(r, bone, mi, base, d, length, rad, color, seg=6):
    d = V(d).normalized()
    r.part(cone(rad, 0.0, length, tuple(V(base) + d * length * 0.5), rot=aim(d), seg=seg), bone, mi, color)


def boss(r):
    r.identity_bones = True
    r.extras = {'kind': r.name}
    r.hit_min = 0.0
    r.ao_strength = 1.0


# ---------------- 炎鱗竜ヴォルグ: 沈黙の一片を呑み、喉の奥で燃やし続ける竜 ----------------
def dragon():
    r = Rig('guardian-dragon')
    boss(r)
    r.scale = 5.0
    r.voxel = 0.055
    r.tex = 2048
    r.tris = 30000
    r.bump = 0.05
    r.bump_freq = 0.9
    r.surface = 'scales'
    r.clay_smooth = 14
    r.hi_levels = int(os.environ.get('HI', '2'))
    SC, DARK, BELLY, HORN = 0x4a1c22, 0x120d14, 0x8a5a3a, 0xcdb27a
    r.mat('scales', rough=0.62, metal=0.12)
    core = r.mat(CORE, 0xff5a18, emit=3.0)
    horn = r.mat('horn', rough=0.42)
    memb = r.mat('membrane', rough=0.85)
    j = r.j
    # 胴・首・頭
    j('hips', (0, -2.6, 3.3), 1.25)
    j('spine', (0, -0.9, 3.55), 1.5, 'hips')
    j('chest', (0, 0.9, 3.8), 1.42, 'spine')
    j('neck1', (0, 2.2, 4.9), 0.98, 'chest')
    j('neck2', (0, 3.0, 6.1), 0.76, 'neck1')
    j('neck3', (0, 3.95, 7.05), 0.64, 'neck2')
    j('head', (0, 6.15, 6.75), 0.3, 'neck3')
    j('jawroot', (0, 4.35, 6.7), 0.2, 'head', skin=False)
    j('jaw', (0, 6.0, 6.35), 0.2, 'jawroot')
    # 尾
    prev = 'hips'
    for i, (y, z, rad) in enumerate(((-4.4, 2.9, 0.98), (-6.2, 2.35, 0.72), (-8.0, 1.95, 0.52), (-9.8, 1.8, 0.34), (-11.6, 2.0, 0.17))):
        j('tail%d' % (i + 1), (0, y, z), rad, prev)
        prev = 'tail%d' % (i + 1)
    for S, sx in (('_L', -1), ('_R', 1)):
        j('scapF' + S, (sx * 1.25, 0.8, 3.45), 0.66, 'chest')
        j('thighF' + S, (sx * 1.65, 0.3, 1.95), 0.5, 'scapF' + S)
        j('shinF' + S, (sx * 1.6, 1.0, 0.55), 0.33, 'thighF' + S)
        j('footF' + S, (sx * 1.65, 1.85, 0.2), 0.3, 'shinF' + S)
        j('hipB' + S, (sx * 1.2, -2.7, 3.0), 0.8, 'hips')
        j('thighB' + S, (sx * 1.75, -1.9, 1.75), 0.56, 'hipB' + S)
        j('shinB' + S, (sx * 1.65, -3.1, 0.95), 0.34, 'thighB' + S)
        j('footB' + S, (sx * 1.7, -2.2, 0.2), 0.32, 'shinB' + S)
        j('wingroot' + S, (sx * 0.95, 0.2, 4.95), 0.42, 'chest')
        j('wingA' + S, (sx * 3.3, -0.6, 7.2), 0.3, 'wingroot' + S)
        j('wingB' + S, (sx * 7.0, 0.6, 6.6), 0.2, 'wingA' + S)
        j('wf1' + S, (sx * 10.3, -0.3, 5.6), 0.1, 'wingB' + S)
        j('wf2' + S, (sx * 8.8, -2.6, 5.2), 0.1, 'wingB' + S)
        j('wf3' + S, (sx * 6.6, -4.2, 5.0), 0.1, 'wingB' + S)
    P_ = lambda n: r.joints[n]['pos']
    # 肉付け: 胸の竜骨、肩と腿の筋肉、喉の袋
    clay(r, ell((0, 1.3, 2.9), (0.95, 1.1, 0.9)))
    clay(r, ell((0, -0.8, 2.55), (1.25, 1.9, 0.75)))
    for S, sx in (('_L', -1), ('_R', 1)):
        clay(r, ell(P_('scapF' + S) + V((sx * 0.1, -0.1, 0.35)), (0.6, 0.85, 0.95)))
        clay(r, ell(P_('scapF' + S).lerp(P_('thighF' + S), 0.45) + V((sx * 0.12, -0.1, 0)), (0.5, 0.62, 0.85)))
        clay(r, ell(P_('hipB' + S) + V((sx * 0.15, 0.2, 0.1)), (0.75, 1.15, 1.1)))
        clay(r, ell(P_('hipB' + S).lerp(P_('thighB' + S), 0.5) + V((sx * 0.1, 0.25, 0)), (0.55, 0.8, 0.85)))
        clay(r, ell(P_('thighB' + S).lerp(P_('shinB' + S), 0.4) + V((0, -0.15, 0.05)), (0.3, 0.42, 0.5)))
        clay(r, ell(P_('thighF' + S).lerp(P_('shinF' + S), 0.35) + V((0, -0.1, 0)), (0.3, 0.36, 0.5)))
        for n in ('footF', 'footB'):      # 足: 掌と四本の指
            f = P_(n + S)
            clay(r, ell(f + V((0, -0.25, 0.05)), (0.42, 0.55, 0.26)))
            for k in range(4):
                a = (k - 1.5) * 0.36
                b0 = f + V((math.sin(a) * 0.3, math.cos(a) * 0.15, 0))
                b1 = f + V((math.sin(a) * 0.62, 0.35 + math.cos(a) * 0.5, -0.06))
                clay(r, cap(b0, b1, 0.15, 0.11, 10))
                spike(r, n + S, horn, b1 + V((0, 0.02, 0.02)), (math.sin(a) * 0.5, 1, -0.35), 0.5, 0.1, HORN)
        clay(r, ell(P_('wingroot' + S) + V((sx * 0.2, -0.1, 0.1)), (0.55, 0.6, 0.6)))
        clay(r, ell(P_('wingA' + S), 0.36))
        clay(r, ell(P_('wingB' + S), 0.28))
        spike(r, 'wingB' + S, horn, P_('wingB' + S), (sx * 0.2, 0.6, 0.8), 0.9, 0.13, HORN)       # 翼の爪
    clay(r, ell((0, 2.75, 5.2), (0.6, 0.6, 0.95)))                  # 喉の袋(一片が燃えている所)
    clay(r, ell((0, 3.6, 6.25), (0.5, 0.5, 0.7)))
    # 頭: 頭蓋・吻・眉の隆起・頬の棘・下顎
    hd = V((0, 4.5, 7.05))
    clay(r, ell(hd + V((0, -0.1, 0.1)), (0.62, 0.8, 0.55)))
    clay(r, ell(hd + V((0, 0.9, -0.15)), (0.42, 0.95, 0.36)))
    clay(r, ell(hd + V((0, 1.55, -0.28)), (0.34, 0.42, 0.26)))
    clay(r, cap((0, 4.4, 6.55), (0, 5.95, 6.36), 0.3, 0.19))        # 下顎
    for sx in (-1, 1):
        clay(r, ell(hd + V((sx * 0.36, 0.42, 0.22)), (0.2, 0.42, 0.16)))             # 眉の隆起
        clay(r, ell(hd + V((sx * 0.5, -0.05, -0.18)), (0.2, 0.36, 0.26)))            # 顎の付け根
        clay(r, ell(hd + V((sx * 0.14, 1.78, -0.16)), (0.09, 0.12, 0.08)))           # 鼻孔の盛り上がり
        dent(r, hd + V((sx * 0.14, 1.86, -0.14)), (0.06, 0.1, 0.05), 0.07)
        dent(r, hd + V((sx * 0.43, 0.5, 0.06)), (0.12, 0.2, 0.1), 0.1)               # 眼窩
        # 二対の角: 後ろへ反る大角と、頬の棘
        b = hd + V((sx * 0.36, -0.45, 0.42))
        clay(r, chain([b, b + V((sx * 0.3, -0.75, 0.5)), b + V((sx * 0.5, -1.65, 0.75)), b + V((sx * 0.45, -2.5, 1.25))], [0.26, 0.21, 0.14, 0.03], 12))
        b2 = hd + V((sx * 0.55, -0.2, -0.05))
        clay(r, chain([b2, b2 + V((sx * 0.35, -0.5, 0.0)), b2 + V((sx * 0.55, -1.1, 0.15))], [0.17, 0.12, 0.02], 10))
        for k in range(3):
            b3 = hd + V((sx * (0.48 - k * 0.04), 0.3 + k * 0.42, -0.3))
            clay(r, cap(b3, b3 + V((sx * 0.22, -0.12, -0.2)), 0.08, 0.015, 8))
    # 背びれ: 首から尾の先まで
    spine_pts = [P_(n) for n in ('neck3', 'neck2', 'neck1', 'chest', 'spine', 'hips', 'tail1', 'tail2', 'tail3', 'tail4')]
    spine_r = [r.joints[n]['r'] for n in ('neck3', 'neck2', 'neck1', 'chest', 'spine', 'hips', 'tail1', 'tail2', 'tail3', 'tail4')]
    fins = []
    for i in range(len(spine_pts) - 1):
        n = 3 if i >= 3 and i <= 5 else 2
        for k in range(n):
            t = (k + 0.5) / n
            p = spine_pts[i].lerp(spine_pts[i + 1], t)
            rad = spine_r[i] + (spine_r[i + 1] - spine_r[i]) * t
            h = (0.75 if 2 <= i <= 5 else 0.5) * (0.75 + 0.5 * ((i * 3 + k) % 3) / 2)
            base = p + V((0, 0, rad * 0.86))
            clay(r, chain([base + V((0, 0.18, -0.2)), base + V((0, -0.1, h * 0.5)), base + V((0, -0.42, h))], [0.2, 0.13, 0.02], 8))
            fins.append((base, h))
    tail_tip = P_('tail5')
    clay(r, chain([tail_tip + V((0, 0.5, 0)), tail_tip + V((0, -0.3, 0.35)), tail_tip + V((0, -1.1, 0.2))], [0.2, 0.3, 0.03], 10))   # 尾の先の刃
    for sx in (-1, 1):
        clay(r, chain([tail_tip + V((0, 0.2, 0)), tail_tip + V((sx * 0.5, -0.3, 0.1)), tail_tip + V((sx * 0.75, -0.9, 0.0))], [0.16, 0.14, 0.02], 8))

    throat = [V((0, 1.5, 3.0)), V((0, 2.5, 4.3)), V((0, 3.1, 5.4)), V((0, 3.8, 6.2))]

    def glow(p):
        # 喉から胸にかけて、内側の火が透ける(喉の下側ほど強い)
        best = 0.0
        for i in range(len(throat) - 1):
            a, b = throat[i], throat[i + 1]
            ab = b - a
            t = max(0, min(1, (p - a).dot(ab) / ab.length_squared))
            q = a + ab * t
            if p.y - q.y > -0.25 or p.z < q.z + 0.1:
                d = (p - q).length
                best = max(best, sm(1.15 - d, 0.0, 0.8) * (1.0 if p.z < q.z + 0.25 else 0.35))
        return best

    def col(p, near, n):
        c = mix(hexc(SC), hexc(DARK), max(0, -n) * 1.5 + 0.15)
        c = mix(c, (0.5, 0.2, 0.14), max(0, n) * 0.55)
        # 腹側は淡い板状の鱗
        under = 0.0
        if near in ('spine', 'chest', 'hips') and abs(p.x) < 1.0 and p.z < 2.75:
            under = sm(2.75 - p.z, 0.0, 0.5) * sm(1.0 - abs(p.x), 0.0, 0.4)
        if near and near.startswith('tail') and abs(p.x) < 0.5:
            under = max(under, 0.0)
        if under > 0:
            band = 0.75 + 0.25 * math.sin(p.y * 7.5)
            c = mix(c, tuple(x * band for x in hexc(BELLY)), under * 0.85)
        g = glow(p)
        if g > 0:
            c = mix(c, (1.0, 0.36, 0.08), min(1, g * (0.55 + 0.6 * max(0, n + 0.2))))
        # 角・背びれ・爪は骨の色へ
        if p.z > 7.45 and p.y < 4.6:
            c = mix(c, hexc(HORN), sm(p.z - 7.45, 0, 0.5) * 0.85)
        for base, h in fins:
            if abs(p.x) < 0.3 and (p - base).length < h + 0.3 and p.z > base.z + 0.12:
                c = mix(c, hexc(HORN), sm(p.z - base.z, 0.1, h) * 0.8)
                break
        if near and near.startswith('wf'):
            c = mix(c, (0.1, 0.05, 0.06), 0.5)
        return c
    r.color_fn = col
    # 目(属性の色に光る)と、喉の割れ目から漏れる火
    for sx in (-1, 1):
        r.part(sphere(0.085, tuple(hd + V((sx * 0.4, 0.52, 0.08))), seg=12, rings=8, scale=(0.6, 1.3, 0.8)), 'head', core, 0xff5a18)
    for k in range(7):
        t = k / 6
        i = min(2, int(t * 3))
        a, b = throat[i], throat[i + 1]
        q = a.lerp(b, t * 3 - i)
        for sx in (-1, 1):
            r.part(sphere(0.2, (sx * (0.16 + 0.12 * math.sin(k * 1.7)), q.y + 0.4 - 0.3 * t, q.z - 0.45 + 0.3 * t), seg=8, rings=6, scale=(0.12, 1.0, 0.3)), 'neck1' if k < 3 else ('neck2' if k < 5 else 'neck3'), core, 0xff5a18)
    # 牙
    for k in range(8):
        y = 4.75 + k * 0.165
        w = 0.36 - k * 0.022
        for sx in (-1, 1):
            spike(r, 'head', horn, (sx * w, y, 6.72 - k * 0.012), (sx * 0.1, 0.1, -1), 0.26 if k % 3 else 0.42, 0.055, 0xe6dcc0, seg=5)
            if k < 7:
                spike(r, 'jaw', horn, (sx * (w - 0.05), y + 0.08, 6.5 - k * 0.012), (sx * 0.1, 0.05, 1), 0.2 if k % 2 else 0.32, 0.045, 0xddd2b4, seg=5)
    # 翼膜(傷と裂け目のある古い膜)
    for S, sx in (('_L', -1), ('_R', 1)):
        pts = [tuple(P_('wingroot' + S)), tuple(P_('wingA' + S)), tuple(P_('wingB' + S)), tuple(P_('wf1' + S)), tuple(P_('wf2' + S)), tuple(P_('wf3' + S)), (sx * 1.0, -2.7, 3.9)]
        r.membranes.append((pts, memb, ['wingroot' + S, 'wingA' + S, 'wingB' + S, 'wf1' + S, 'wf2' + S, 'wf3' + S, 'hips', 'chest'], 0x5a1c22))
    r.extras.update({'mouth': [0, -0.35, -1.95], 'species': 'dragon', 'torso': [0, 3.5, 0.8, 1.5], 'core': {'bone': 'neck1', 'pos': [0, 0.5, -1.6]},
                     'legs': ['thighF_L', 'thighF_R', 'thighB_L', 'thighB_R'], 'wings': ['wingA_L', 'wingA_R']})
    r.view = [(-1.0, 1.6, 0.35), (-0.6, 1.5, 0.2, 0.75, 0.8), (1.6, -0.2, 0.25), (0.0, 1.0, 0.1, 0.5, 0.86)]
    return r


def frust(a, b, r1, r2, seg=20):
    a, b = V(a), V(b)
    def f(bm):
        d = b - a
        m = Matrix.Translation((a + b) * 0.5) @ V((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        return bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=d.length, matrix=m)['verts']
    return f


def boxc(c, size, rot=(0, 0, 0)):
    def f(bm):
        m = Matrix.Translation(V(c)) @ Euler(rot, 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1))
        return bmesh.ops.create_cube(bm, size=1.0, matrix=m)['verts']
    return f


def biped(r, H, **kw):
    """二足の守護者の骨組み。顎の骨を足す。s(体格)と頭の中心を返す"""
    humanoid(r, H=H, fingers=False, **kw)
    s = H / 1.8
    nk = J(r, 'neck')
    hc = nk + V((0, 0.016, 0.1)) * s
    r.j('jawroot', tuple(hc + V((0, 0.01, -0.045)) * s), 0.02 * s, 'head', skin=False)
    r.j('jaw', tuple(hc + V((0, 0.085, -0.1)) * s), 0.02 * s, 'jawroot')
    r.extras.update({'legs': ['thigh_L', 'thigh_R'], 'arms': ['uarm_L', 'uarm_R'], 'torso': [0, round(J(r, 'chest').z - 0.1 * s, 3), 0, round(0.2 * s, 3)],
                     'mouth': [0, round(0.03 * s, 3), round(-0.13 * s, 3)]})
    return s, hc


# ---------------- 氷冠巨人ニヴァリス: 自分ごと鐘楼を凍らせた鐘つき ----------------
def giant():
    r = Rig('guardian-giant')
    boss(r)
    H = 8.4
    s, hc = biped(r, H, rad=1.0, w=1.28, belly=1.0, hunch=0.22, head=0.92, neck=0.95, arm=1.22, muscle=1.0)
    r.scale = 2.6
    r.voxel = 0.03
    r.tex = 2048
    r.tris = 28000
    r.bump = 0.012
    r.bump_freq = 1.3
    r.surface = 'skin'
    r.clay_smooth = 20
    r.hi_levels = int(os.environ.get('HI', '2'))
    SKIN = 0x46586a
    r.mat('skin', rough=0.7)
    core = r.mat(CORE, 0x6bcfff, emit=3.0)
    bronze = r.mat('gold', rough=0.5, metal=0.75)
    rope = r.mat('cloth', rough=0.95)
    ice_m = r.mat('ice', rough=0.2)
    flesh(r, s=s, w=1.25, m=1.35, fat=0.12, toes=4)
    q = s * 0.95
    head(r, s=s, hs=0.95, jaw=1.5, brow=1.6, nose=1.2, ears=0.8, eye_dx=0.034, gaunt=0.6)
    ch, hp, nk = J(r, 'chest'), J(r, 'hips'), J(r, 'neck')
    rnd = random.Random(3)
    ices = []

    def crystals(c, n, size, up=(0, 0, 1), spread=0.8):
        """氷の結晶の束: 根元の塊から、尖った柱が何本も伸びる"""
        c = V(c)
        clay(r, ell(c, (size * 0.5, size * 0.45, size * 0.4)))
        ices.append((c, size * 0.62))
        for k in range(n):
            d = (V(up) + V((rnd.uniform(-spread, spread), rnd.uniform(-spread, spread), rnd.uniform(-0.2, 0.4)))).normalized()
            L = size * rnd.uniform(0.9, 2.1)
            w = size * rnd.uniform(0.14, 0.24)
            def f(bm, c=c, d=d, L=L, w=w):
                m = Matrix.Translation(c + d * (L * 0.5)) @ V((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()
                return bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=w, radius2=w * 0.12, depth=L, matrix=m)['verts']
            clay(r, f)
            for t in (0.35, 0.7, 1.0):
                ices.append((c + d * L * t, w * 1.5))
    for S, sx in (('_L', -1), ('_R', 1)):
        sh, el, wr = J(r, 'clav' + S), J(r, 'uarm' + S), J(r, 'farm' + S)
        crystals(sh + V((sx * 0.1, -0.03, 0.09)) * s, 6, 0.2 * s, (sx * 0.5, -0.2, 1))
        kn, an = J(r, 'thigh' + S), J(r, 'shin' + S)
        crystals(kn + V((sx * 0.02, 0.05, 0.02)) * s, 3, 0.09 * s, (sx * 0.5, 0.8, 0.4))
        for k in range(5):      # 腕から垂れるつらら
            b = sh.lerp(el, 0.2 + k * 0.18) + V((0, -0.02, -0.05)) * s
            L = rnd.uniform(0.1, 0.26) * s
            clay(r, cap(b, b + V((0, 0, -L)), 0.022 * s, 0.002 * s, 8))
            ices.append((b + V((0, 0, -L * 0.5)), L * 0.6))
    # 左の前腕は、氷の塊に呑まれている(鐘楼を凍らせた時の手)
    el, wr, hd = J(r, 'uarm_L'), J(r, 'farm_L'), J(r, 'hand_L')
    crystals(el.lerp(wr, 0.55), 5, 0.17 * s, (-0.7, 0.2, -0.3), 0.7)
    crystals(hd, 4, 0.14 * s, (-0.3, 0.4, -0.8), 0.6)
    for k in range(6):          # 背から突き出た氷
        crystals(ch + V(((k % 3 - 1) * 0.13, -0.13, 0.1 - (k // 3) * 0.2)) * s, 2, 0.12 * s, (0, -0.9, 0.7), 0.5)
    for k in range(9):          # 凍った髭
        x = (k - 4) * 0.013
        b = hc + V((x, 0.07 - abs(x) * 0.9, -0.085)) * q
        L = (0.11 + 0.07 * ((k * 5) % 3)) * q
        clay(r, cap(b, b + V((x * 0.6, 0.02 * q, -L)), 0.016 * q, 0.002 * q, 8))
        ices.append((b + V((0, 0, -L * 0.5)), L * 0.62))
    region(r, 'ice', blobs(ices), lambda p, n: (0.55 + 0.3 * n, 0.8 + 0.18 * n, 0.98), 0.18)
    # 胸の氷に閉じ込めた一片(胸がくぼみ、奥で光る)
    cc = V((0, ch.y + 0.115 * s, ch.z - 0.07 * s))
    dent(r, cc, V((0.07, 0.06, 0.1)) * s, 0.05 * s)

    def col(p, near, n):
        c = mix(hexc(SKIN), (0.08, 0.1, 0.14), max(0, -n) * 1.5)
        c = mix(c, (0.62, 0.7, 0.78), max(0, n - 0.2) * 0.7)                   # 霜
        if near and near[:4] in ('hand', 'foot'):
            c = mix(c, (0.05, 0.05, 0.09), 0.6)                                # 凍傷で黒ずんだ手足
        d = (p - cc).length / (0.16 * s)
        if d < 1:
            c = mix(c, (0.5, 0.85, 1.0), 0.8 * (1 - d))                        # 胸の奥から漏れる光
        return c
    r.color_fn = col
    r.part(sphere(0.05 * s, tuple(cc + V((0, -0.035 * s, 0))), seg=14, rings=10, scale=(0.9, 0.5, 1.4)), 'chest', core, 0x6bcfff)
    for sx in (-1, 1):
        r.part(sphere(0.0105 * q, tuple(hc + V((sx * 0.034, 0.074, 0.0)) * q), seg=10, rings=8), 'head', core, 0x6bcfff)
    # 氷冠: 頭に斜めに被さったまま凍りついた、割れた鐘
    bz = hc.z + 0.065 * q
    by = hc.y - 0.02 * q
    tilt = (0.22, 0.12, 0)
    r.part(cone(0.15 * q, 0.095 * q, 0.16 * q, (0, by, bz + 0.08 * q), rot=tilt, seg=24, caps=False), 'head', bronze, 0x5c4c2a)
    r.part(ring(0.152 * q, 0.016 * q, (0, by + 0.018 * q, bz), rot=tilt, seg=28), 'head', bronze, 0x6e5c30)
    r.part(sphere(0.098 * q, (0, by - 0.03 * q, bz + 0.15 * q), seg=18, rings=10, scale=(1, 1, 0.6)), 'head', bronze, 0x5c4c2a)
    r.part(ring(0.03 * q, 0.012 * q, (0, by - 0.04 * q, bz + 0.215 * q), rot=(math.pi / 2, 0, 0), seg=12), 'head', bronze, 0x4a3e24)
    r.part(box((0.025 * q, 0.06 * q, 0.15 * q), (0.085 * q, by + 0.11 * q, bz + 0.06 * q), rot=(0.25, 0.3, 0.45)), 'head', 0, 0x020304, smooth=False)   # 割れ目
    for k in range(11):
        a = k / 11 * TAU + 0.2
        spike(r, 'head', ice_m, (math.cos(a) * 0.11 * q, by + math.sin(a) * 0.11 * q - 0.02 * q, bz + 0.12 * q), (math.cos(a) * 0.4, math.sin(a) * 0.4 - 0.2, 1), (0.2 + 0.16 * (k % 3)) * q, 0.034 * q, 0xbfe6ff)
    # 胴に巻いた鐘の綱と、腰の毛皮
    for k in range(3):
        r.part(ring(0.245 * s - k * 0.012 * s, 0.022 * s, (0, 0.01 * s, hp.z + 0.12 * s + k * 0.11 * s), rot=(0.12 * (k - 1), 0.25, 0), seg=24, scale=(1, 0.78, 1)), 'spine', rope, 0x5a4630)
    for i in range(12):
        a = i / 12 * TAU
        L = (0.2 + 0.1 * ((i * 5) % 3)) * s
        r.part(cone(0.085 * s, 0.01 * s, L, (math.cos(a) * 0.22 * s, math.sin(a) * 0.17 * s + 0.01 * s, hp.z - 0.02 * s - L / 2), rot=(math.pi + 0.1 * math.sin(a), 0.1 * math.cos(a), 0), seg=5), 'hips', rope, 0x2c2622)
    r.part(ring(0.245 * s, 0.03 * s, (0, 0.01 * s, hp.z + 0.0 * s), seg=24, scale=(1, 0.78, 1)), 'hips', rope, 0x3c3028)
    # 鐘の舌(槌): 右手に握る
    h = J(r, 'hand_R')
    r.part(cone(0.022 * s, 0.03 * s, 0.7 * s, (h.x, h.y + 0.26 * s, h.z - 0.02 * s), rot=(-math.pi / 2, 0, 0), seg=10), 'hand_R', bronze, 0x3a2e1e)
    r.part(sphere(0.11 * s, (h.x, h.y + 0.66 * s, h.z - 0.02 * s), seg=18, rings=12, scale=(1, 1.25, 1)), 'hand_R', bronze, 0x6e5c34)
    r.part(ring(0.07 * s, 0.014 * s, (h.x, h.y + 0.52 * s, h.z - 0.02 * s), rot=(math.pi / 2, 0, 0), seg=16), 'hand_R', bronze, 0x4c4028)
    r.part(ring(0.035 * s, 0.009 * s, (h.x, h.y - 0.11 * s, h.z - 0.02 * s), rot=(0, math.pi / 2, 0), seg=12), 'hand_R', bronze, 0x4c4028)
    r.extras.update({'species': 'giant', 'core': {'bone': 'chest', 'pos': [0, round(0.36 * s, 3), round(-0.14 * s, 3)]}})
    return r


# ---------------- 聖堂騎像アウレリア: 祈りの言葉で動く礼拝堂の像 ----------------
def sentinel():
    r = Rig('guardian-sentinel')
    boss(r)
    H = 8.4
    s, hc = biped(r, H, rad=0.95, w=1.05, hunch=0.0, head=0.95, muscle=0.4)
    r.scale = 4.2
    r.voxel = 0.03
    r.tex = 2048
    r.tris = 26000
    r.bump = 0.004
    r.surface = 'marble'
    r.clay_smooth = 12
    r.hi_levels = int(os.environ.get('HI', '2'))
    MARBLE, GOLD = 0xcfc8b6, 0xa8823a
    r.mat('marble', rough=0.42)
    core = r.mat(CORE, 0xffcf65, emit=3.0)
    gold = r.mat('gold', rough=0.35, metal=0.9)
    flesh(r, s=s, w=1.0, m=0.5, feet=False)
    head(r, s=s, hs=1.0, jaw=0.9, brow=0.8, nose=1.0, ears=0, eye_dx=0.03)
    ch, hp, nk = J(r, 'chest'), J(r, 'hips'), J(r, 'neck')
    # 彫られた衣: 裾・胸当て・頭巾(ヴェール)
    clay(r, frust((0, -0.01 * s, 0.01 * s), (0, 0, hp.z + 0.02 * s), 0.34 * s, 0.17 * s, 32))
    clay(r, ell(ch + V((0, 0.02, -0.06)) * s, V((0.19, 0.135, 0.2)) * s))
    clay(r, ell(hc + V((0, -0.035, 0.02)) * s, V((0.1, 0.105, 0.115)) * s))
    clay(r, frust(hc + V((0, -0.06, 0.02)) * s, ch + V((0, -0.1, -0.05)) * s, 0.095 * s, 0.17 * s, 20))      # 背へ流れるヴェール
    for i in range(16):
        a = i / 16 * TAU
        for z, k in ((0.2, 0.92), (0.5, 0.75)):
            dent(r, (math.cos(a) * 0.34 * s * k, math.sin(a) * 0.34 * s * k, z * s), V((0.03, 0.03, 0.28)) * s, 0.02 * s)
    for S, sx in (('_L', -1), ('_R', 1)):
        sh, el, wr = J(r, 'clav' + S), J(r, 'uarm' + S), J(r, 'farm' + S)
        clay(r, ell(sh + V((sx * 0.04, 0, 0.02)) * s, V((0.105, 0.1, 0.075)) * s))        # 肩当て
        clay(r, ell(sh + V((sx * 0.07, 0, -0.03)) * s, V((0.09, 0.09, 0.06)) * s))
        clay(r, frust(el, el.lerp(wr, 0.9), 0.05 * s, 0.06 * s, 16))                       # 篭手
    # 背中は未完成: 石工の鑿跡と、切り出したままの石塊
    rnd = random.Random(5)
    for k in range(14):
        c = V((rnd.uniform(-0.2, 0.2), -0.15 - rnd.uniform(0, 0.05), rnd.uniform(hp.z / s - 0.25, ch.z / s + 0.12))) * s
        clay(r, boxc(c, (rnd.uniform(0.1, 0.2) * s, 0.12 * s, rnd.uniform(0.1, 0.22) * s), (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.2, 0.2), rnd.uniform(-0.4, 0.4))))
    for k in range(40):
        c = V((rnd.uniform(-0.24, 0.24), -0.2, rnd.uniform(0.1, ch.z / s + 0.15))) * s
        dent(r, c + V((0, 0.03, 0)) * s, V((0.012, 0.08, 0.06)) * s, 0.012 * s)
    back = lambda p, nb: sm(-0.085 * s - p.y, 0.0, 0.05 * s) * (1.0 if 0.1 * s < p.z < ch.z + 0.2 * s else 0.0)
    region(r, 'stone', back, lambda p, n: (0.5 + 0.2 * n, 0.48 + 0.19 * n, 0.44 + 0.18 * n), 0.95)

    def col(p, near, n):
        c = mix(hexc(MARBLE), (0.5, 0.47, 0.42), max(0, -n) * 1.1)
        vein = abs(math.sin(p.x * 2.1 + p.z * 1.3 + math.sin(p.y * 1.7 + p.z * 0.9) * 2.2))
        if vein < 0.035:
            c = mix(c, (0.42, 0.4, 0.4), 0.55)                                  # 大理石の筋
        if p.z < 0.25 * s:
            c = mix(c, (0.3, 0.33, 0.24), sm(0.25 * s - p.z, 0, 0.25 * s) * 0.5)   # 裾の苔と汚れ
        # 金の象嵌: 裾の帯・胸の紋・肩当ての縁
        if abs(p.z - 0.12 * s) < 0.012 * s or abs(p.z - (hp.z + 0.0 * s)) < 0.012 * s:
            c = hexc(GOLD)
        return c
    r.color_fn = col
    region(r, 'metal', lambda p, nb: 1.0 if (abs(p.z - 0.12 * s) < 0.012 * s or abs(p.z - hp.z) < 0.012 * s) and p.y > -0.08 * s else 0.0, GOLD, 0.35, 0.9)
    # 目(閉じた瞼の隙間から漏れる光)と、胸の祈りの紋
    for sx in (-1, 1):
        r.part(box((0.022 * s, 0.006 * s, 0.004 * s), tuple(hc + V((sx * 0.03, 0.082, 0.0)) * s)), 'head', core, 0xffcf65, smooth=False)
    cy, cz = ch.y + 0.16 * s, ch.z - 0.05 * s
    r.part(ring(0.05 * s, 0.006 * s, (0, cy, cz), rot=(math.pi / 2, 0, 0), seg=20), 'chest', core, 0xffcf65)
    r.part(box((0.008 * s, 0.01 * s, 0.14 * s), (0, cy, cz)), 'chest', core, 0xffcf65, smooth=False)
    r.part(box((0.09 * s, 0.01 * s, 0.008 * s), (0, cy, cz + 0.02 * s)), 'chest', core, 0xffcf65, smooth=False)
    # 光輪
    r.part(ring(0.16 * s, 0.008 * s, tuple(hc + V((0, -0.07, 0.03)) * s), rot=(math.pi / 2, 0, 0), seg=40), 'head', gold, GOLD)
    for k in range(12):
        a = k / 12 * TAU
        spike(r, 'head', gold, tuple(hc + V((math.cos(a) * 0.165, -0.07, 0.03 + math.sin(a) * 0.165)) * s), (math.cos(a), 0, math.sin(a)), (0.07 if k % 2 else 0.12) * s, 0.012 * s, GOLD, seg=4)
    # 聖剣(右手、刃は前へ)と、祈りの文が刻まれた盾(左腕)
    h = J(r, 'hand_R')
    b = V((h.x, h.y + 0.02 * s, h.z - 0.02 * s))
    r.part(box((0.05 * s, 0.75 * s, 0.012 * s), tuple(b + V((0, 0.47, 0)) * s)), 'hand_R', 0, 0xd6d0c0, smooth=False)
    r.part(cone(0.025 * s, 0.0, 0.08 * s, tuple(b + V((0, 0.885, 0)) * s), rot=(-math.pi / 2, 0, 0), seg=4), 'hand_R', 0, 0xd6d0c0, smooth=False)
    r.part(box((0.008 * s, 0.7 * s, 0.014 * s), tuple(b + V((0, 0.46, 0)) * s)), 'hand_R', core, 0xffcf65, smooth=False)
    r.part(box((0.2 * s, 0.03 * s, 0.03 * s), tuple(b + V((0, 0.09, 0)) * s)), 'hand_R', gold, GOLD, smooth=False)
    r.part(cone(0.014 * s, 0.014 * s, 0.16 * s, tuple(b), rot=(-math.pi / 2, 0, 0), seg=8), 'hand_R', gold, 0x6a5020)
    r.part(sphere(0.025 * s, tuple(b + V((0, -0.1, 0)) * s), seg=10, rings=8), 'hand_R', gold, GOLD)
    hl = J(r, 'farm_L')
    sc = V((hl.x - 0.06 * s, hl.y + 0.1 * s, hl.z + 0.02 * s))
    r.part(box((0.03 * s, 0.34 * s, 0.56 * s), tuple(sc), rot=(0, 0, 0.5)), 'farm_L', 0, 0xc8c0ae, smooth=False)
    r.part(box((0.034 * s, 0.36 * s, 0.03 * s), tuple(sc + V((0, 0, 0.27)) * s), rot=(0, 0, 0.5)), 'farm_L', gold, GOLD, smooth=False)
    r.part(box((0.034 * s, 0.36 * s, 0.03 * s), tuple(sc + V((0, 0, -0.27)) * s), rot=(0, 0, 0.5)), 'farm_L', gold, GOLD, smooth=False)
    for k in range(6):      # 盾に刻まれた祈りの文(光る)
        r.part(box((0.008 * s, (0.22 - 0.03 * (k % 2)) * s, 0.012 * s), tuple(sc + V((-0.012 - 0.006, 0.01, 0.18 - k * 0.07)) * s), rot=(0, 0, 0.5)), 'farm_L', core, 0xffcf65, smooth=False)
    r.extras.update({'species': 'sentinel', 'core': {'bone': 'chest', 'pos': [0, round(0.38 * s, 3), round(-0.16 * s, 3)]}})
    return r


def quad(r, L=1.0, tail=5, wings=False):
    """四つ足の守護者の骨組み(獣・グリフォン)。体長はおよそ 9m × L"""
    j = r.j
    j('hips', (0, -2.2 * L, 3.3 * L), 1.05 * L)
    j('spine', (0, -0.6 * L, 3.5 * L), 1.2 * L, 'hips')
    j('chest', (0, 1.0 * L, 3.75 * L), 1.35 * L, 'spine')
    j('neck1', (0, 2.0 * L, 4.6 * L), 0.85 * L, 'chest')
    j('neck2', (0, 2.7 * L, 5.3 * L), 0.7 * L, 'neck1')
    j('head', (0, 4.3 * L, 5.2 * L), 0.3 * L, 'neck2')
    j('jawroot', (0, 3.0 * L, 5.05 * L), 0.15 * L, 'head', skin=False)
    j('jaw', (0, 4.1 * L, 4.8 * L), 0.16 * L, 'jawroot')
    prev = 'hips'
    for i in range(tail):
        t = (i + 1) / tail
        j('tail%d' % (i + 1), (0, (-2.2 - 4.6 * t) * L, (3.2 - 1.3 * math.sin(t * 2.2) + 0.9 * t * t) * L), (0.42 * (1 - t) + 0.1) * L, prev)
        prev = 'tail%d' % (i + 1)
    for S, sx in (('_L', -1), ('_R', 1)):
        j('scapF' + S, (sx * 1.1 * L, 1.0 * L, 3.5 * L), 0.62 * L, 'chest')
        j('thighF' + S, (sx * 1.35 * L, 0.6 * L, 1.95 * L), 0.45 * L, 'scapF' + S)
        j('shinF' + S, (sx * 1.3 * L, 1.05 * L, 0.55 * L), 0.3 * L, 'thighF' + S)
        j('footF' + S, (sx * 1.35 * L, 1.7 * L, 0.2 * L), 0.28 * L, 'shinF' + S)
        j('hipB' + S, (sx * 0.95 * L, -2.2 * L, 3.0 * L), 0.7 * L, 'hips')
        j('thighB' + S, (sx * 1.3 * L, -1.5 * L, 1.75 * L), 0.5 * L, 'hipB' + S)
        j('shinB' + S, (sx * 1.25 * L, -2.6 * L, 0.95 * L), 0.3 * L, 'thighB' + S)
        j('footB' + S, (sx * 1.3 * L, -1.85 * L, 0.2 * L), 0.28 * L, 'shinB' + S)
        if wings:
            j('wingroot' + S, (sx * 0.85 * L, 0.6 * L, 4.75 * L), 0.4 * L, 'chest')
            j('wingA' + S, (sx * 2.9 * L, 0.0 * L, 6.4 * L), 0.3 * L, 'wingroot' + S)
            j('wingB' + S, (sx * 5.9 * L, 0.7 * L, 6.0 * L), 0.22 * L, 'wingA' + S)
            j('wf1' + S, (sx * 8.6 * L, 0.2 * L, 5.4 * L), 0.14 * L, 'wingB' + S)
    r.extras.update({'legs': ['thighF_L', 'thighF_R', 'thighB_L', 'thighB_R'], 'wings': ['wingA_L', 'wingA_R'] if wings else [],
                     'torso': [0, 3.5 * L, 0.5 * L, 1.35 * L], 'mouth': [0, round(-0.35 * L, 3), round(-1.5 * L, 3)]})
    P_ = lambda n: r.joints[n]['pos']
    for S, sx in (('_L', -1), ('_R', 1)):
        clay(r, ell(P_('scapF' + S) + V((sx * 0.1, -0.1, 0.35)) * L, V((0.55, 0.8, 0.95)) * L))
        clay(r, ell(P_('scapF' + S).lerp(P_('thighF' + S), 0.45) + V((sx * 0.1, -0.1, 0)) * L, V((0.45, 0.58, 0.8)) * L))
        clay(r, ell(P_('hipB' + S) + V((sx * 0.12, 0.2, 0.05)) * L, V((0.66, 1.0, 1.0)) * L))
        clay(r, ell(P_('hipB' + S).lerp(P_('thighB' + S), 0.5) + V((sx * 0.1, 0.2, 0)) * L, V((0.5, 0.72, 0.8)) * L))
    return P_


# ---------------- 雷角獣ヴァジュラ: 避雷塔に落ちた雷が、獣の骨に宿ったもの ----------------
def beast():
    from mathutils import noise as mnoise
    r = Rig('guardian-beast')
    boss(r)
    P_ = quad(r, 1.0, tail=6)
    J_ = r.joints
    # 痩せた胴、深い胸、低く前へ突き出した長い頭
    J_['hips']['r'] = 0.8; J_['spine']['r'] = 0.82; J_['spine']['pos'] = V((0, -0.6, 3.75)); J_['chest']['r'] = 1.25
    J_['neck1']['pos'] = V((0, 2.25, 4.35)); J_['neck1']['r'] = 0.78
    J_['neck2']['pos'] = V((0, 3.15, 4.55)); J_['neck2']['r'] = 0.56
    J_['head']['pos'] = V((0, 5.25, 3.95)); J_['head']['r'] = 0.2
    J_['jawroot']['pos'] = V((0, 3.5, 4.2)); J_['jaw']['pos'] = V((0, 5.0, 3.62)); J_['jaw']['r'] = 0.13
    r.scale = 2.6
    r.voxel = 0.04
    r.tex = 2048
    r.tris = 30000
    r.bump = 0.01
    r.bump_freq = 1.2
    r.surface = 'fur'
    r.clay_smooth = 12
    r.hi_levels = int(os.environ.get('HI', '2'))
    r.mat('fur', rough=0.92)
    core = r.mat(CORE, 0xb693ff, emit=3.0)
    iron = r.mat('steel', rough=0.5, metal=0.8)
    bone = r.mat('bone', rough=0.7)
    # 頭骨: 肉の落ちた獣の頭(狼の吻と、雄牛の額)
    hd = V((0, 3.55, 4.55))
    clay(r, ell(hd + V((0, -0.1, 0.1)), (0.5, 0.62, 0.46)))
    clay(r, chain([hd + V((0, 0.3, -0.02)), hd + V((0, 1.0, -0.3)), hd + V((0, 1.7, -0.55))], [0.4, 0.27, 0.17], 14))
    clay(r, chain([V((0, 3.5, 4.15)), V((0, 4.3, 3.85)), V((0, 5.0, 3.64))], [0.24, 0.17, 0.11], 12))
    for sx in (-1, 1):
        clay(r, ell(hd + V((sx * 0.3, 0.32, 0.16)), (0.16, 0.34, 0.12)))                 # 眉の隆起
        clay(r, ell(hd + V((sx * 0.4, 0.2, -0.22)), (0.13, 0.4, 0.1)))                   # 頬骨の弓
        dent(r, hd + V((sx * 0.34, 0.45, 0.0)), (0.13, 0.2, 0.12), 0.16)                 # 眼窩
        dent(r, hd + V((sx * 0.09, 1.72, -0.48)), (0.045, 0.11, 0.05), 0.07)             # 鼻孔
        dent(r, hd + V((sx * 0.3, 0.95, -0.36)), (0.07, 0.42, 0.1), 0.06)                # 吻の脇のくぼみ
    skull = lambda p, nb: 1.0 if (p.y > 3.02 and p.z > 3.3 - (p.y - 3.0) * 0.1 and nb in ('head', 'jaw', 'jawroot', 'neck2')) and p.y > 3.2 else 0.0
    region(r, 'bone', skull, lambda p, n: (0.72 + 0.14 * n, 0.68 + 0.13 * n, 0.56 + 0.11 * n), 0.65)
    # 胸郭: 肉が落ち、肋のあいだから雷が漏れる
    for sx in (-1, 1):
        dent(r, (sx * 1.2, 0.75, 3.55), (0.5, 1.35, 1.0), 0.3)

    def vein(p):
        a = abs(mnoise.noise(p * 0.55 + V((3.1, 7.7, 1.3))))
        b = abs(mnoise.noise(p * 1.3 + V((9.2, 2.4, 5.5))))
        return max(sm(0.035 - a, 0.0, 0.03), sm(0.022 - b, 0.0, 0.02) * 0.7)

    def col(p, near, n):
        c = mix((0.085, 0.075, 0.1), (0.02, 0.018, 0.028), max(0, -n) * 1.6)        # 焦げたような黒い毛
        c = mix(c, (0.3, 0.27, 0.38), max(0, n - 0.2) * 0.7)
        if abs(abs(p.x) - 1.0) < 0.5 and -0.6 < p.y < 2.1 and 2.6 < p.z < 4.5:
            c = mix(c, (0.26, 0.14, 0.45), 0.6)                                       # 胸郭の内側は雷の色に染まる
        v = vein(p)
        if v > 0:
            c = mix(c, (0.72, 0.55, 1.0), v)                                          # 体を走る雷の痕
        return c
    r.color_fn = col
    for k in range(6):           # 肋骨と、そのあいだの雷光
        y = 1.85 - k * 0.44
        rr = 1.2 - abs(k - 2) * 0.04
        r.part(ring(rr, 0.065, (0, y, 3.5), rot=(math.pi / 2, 0, 0), seg=22, arc=0.68, scale=(1, 1.0, 1)), 'chest' if k < 3 else 'spine', bone, 0xcfc4a4)
        if k < 5:
            for sx in (-1, 1):
                r.part(sphere(0.25, (sx * 0.98, y - 0.22, 3.45), seg=8, rings=6, scale=(0.25, 0.42, 2.6)), 'chest' if k < 3 else 'spine', core, 0xb693ff)
    for sx in (-1, 1):
        r.part(sphere(0.09, tuple(hd + V((sx * 0.31, 0.45, 0.0))), seg=12, rings=8), 'head', core, 0xb693ff)
    # 角: 避雷針の残骸。鉄の幹から枝が伸び、銅線が巻きついている
    for sx in (-1, 1):
        b = hd + V((sx * 0.36, -0.3, 0.36))
        pts = [b, b + V((sx * 0.75, -0.5, 0.8)), b + V((sx * 1.35, -0.2, 1.75)), b + V((sx * 1.45, 0.75, 2.7)), b + V((sx * 1.1, 1.7, 3.3))]
        for i in range(4):
            d = pts[i + 1] - pts[i]
            r.part(cone(0.17 - i * 0.035, 0.135 - i * 0.03, d.length * 1.04, tuple((pts[i] + pts[i + 1]) / 2), rot=aim(d), seg=8), 'head', iron, 0x2e3038, smooth=False)
            for t in (0.3, 0.7):
                r.part(ring(0.2 - i * 0.035, 0.028, tuple(pts[i].lerp(pts[i + 1], t)), rot=aim(d), seg=10), 'head', iron, 0x8a5a30)
        spike(r, 'head', iron, pts[4], pts[4] - pts[3], 1.0, 0.07, 0x3a3c44)
        for i, dd, L in ((1, (sx * 1, -0.5, 0.2), 0.95), (2, (sx * 0.9, -0.3, 0.5), 1.1), (2, (sx * 0.3, 0.9, 0.2), 0.9), (3, (sx * 0.9, 0.2, 0.6), 0.8), (3, (sx * -0.2, 0.9, 0.5), 0.7)):
            spike(r, 'head', iron, pts[i], dd, L, 0.075, 0x34363e)
    # 背の鉄杭(雷を呼ぶ)
    for k in range(11):
        y = 2.0 - k * 0.5
        z = 4.95 - abs(k - 2) * 0.1 - (0.35 if k > 6 else 0)
        spike(r, 'chest' if k < 4 else ('spine' if k < 8 else 'hips'), iron, (0, y, z - 0.25), (0, -0.3, 1), 1.05 - abs(k - 3) * 0.07, 0.09, 0x2c2e36)
    # 牙
    for k in range(7):
        y = 3.95 + k * 0.17
        w = 0.25 - k * 0.018
        z = 4.33 - (y - 3.95) * 0.36
        for sx in (-1, 1):
            spike(r, 'head', bone, (sx * w, y, z), (sx * 0.1, 0.1, -1), 0.2 if k != 5 else 0.45, 0.045, 0xe0d8c0, seg=5)
            if k < 6:
                spike(r, 'jaw', bone, (sx * (w - 0.04), y + 0.06, z - 0.36), (sx * 0.1, 0.05, 1), 0.16 if k != 4 else 0.32, 0.04, 0xd8cfb4, seg=5)
    for S in ('_L', '_R'):
        for n in ('footF', 'footB'):
            f = P_(n + S)
            clay(r, ell(f + V((0, -0.2, 0.05)), (0.36, 0.48, 0.24)))
            for k in range(3):
                a = (k - 1) * 0.42
                spike(r, n + S, bone, f + V((math.sin(a) * 0.3, 0.3 + math.cos(a) * 0.1, 0)), (math.sin(a) * 0.5, 1, -0.3), 0.55, 0.1, 0x1c1a20)
    tp = P_('tail6')
    r.part(sphere(0.18, tuple(tp), seg=10, rings=8), 'tail6', core, 0xb693ff)       # 尾の先の放電
    for k in range(3):
        spike(r, 'tail6', iron, tp, (math.cos(k * 2.1), -0.6, math.sin(k * 2.1)), 0.5, 0.05, 0x34363e)
    r.extras.update({'species': 'beast', 'core': {'bone': 'chest', 'pos': [0, -0.2, -0.6]}, 'mouth': [0, -0.6, -1.9]})
    return r


# ---------------- 嵐翼グリフォン: 届けられなかった最後の手紙を運ぶ伝令獣 ----------------
def griffin():
    r = Rig('guardian-griffin')
    boss(r)
    P_ = quad(r, 0.95, tail=5, wings=True)
    L = 0.95
    r.scale = 4.5
    r.voxel = 0.045
    r.tex = 2048
    r.tris = 26000
    r.bump = 0.03
    r.bump_freq = 1.2
    r.surface = 'fur'
    r.clay_smooth = 12
    r.hi_levels = int(os.environ.get('HI', '2'))
    r.mat('fur', rough=0.9)
    core = r.mat(CORE, 0x64edbd, emit=3.0)
    horn = r.mat('horn', rough=0.4)
    feather = r.mat('feather', rough=0.8)
    paper = r.mat('cloth', rough=0.9)
    hd = V((0, 3.15, 5.05)) * L
    # 鷲の頭: 丸い頭蓋、鉤になった嘴、眉の庇、後ろへ流れる冠羽
    clay(r, ell(hd + V((0, 0.0, 0.15)) * L, V((0.62, 0.7, 0.6)) * L))
    for k in range(14):          # 首まわりの襟羽
        a = k / 14 * TAU
        b = V((math.cos(a) * 0.75, 2.1, 4.7 + math.sin(a) * 0.75)) * L
        clay(r, cap(b, b + V((math.cos(a) * 0.25, -0.7, math.sin(a) * 0.25)) * L, 0.2 * L, 0.03 * L, 8))
    clay(r, chain([hd + V((0, 0.45, 0.05)) * L, hd + V((0, 0.95, -0.02)) * L, hd + V((0, 1.25, -0.3)) * L], [0.3 * L, 0.2 * L, 0.03 * L], 12))
    clay(r, cap(V((0, 3.0, 4.95)) * L, V((0, 3.95, 4.7)) * L, 0.2 * L, 0.06 * L))
    for sx in (-1, 1):
        clay(r, ell(hd + V((sx * 0.34, 0.25, 0.26)) * L, V((0.16, 0.32, 0.1)) * L))
        dent(r, hd + V((sx * 0.4, 0.3, 0.13)) * L, V((0.1, 0.16, 0.09)) * L, 0.07 * L)
        for k in range(4):
            b = hd + V((sx * (0.1 + k * 0.1), -0.35, 0.4 - k * 0.06)) * L
            clay(r, cap(b, b + V((sx * 0.1, -0.7 - 0.1 * k, 0.3 - 0.1 * k)) * L, 0.1 * L, 0.01 * L, 8))
    front = lambda p, nb: sm(p.y, -0.3 * L, 0.7 * L)          # 前半身は羽毛、後半身は獅子の毛
    def feather_col(p, n):
        if p.y > hd.y + 0.42 * L and p.z > hd.z - 0.5 * L and abs(p.x) < 0.4 * L:
            return (0.5 + 0.1 * n, 0.38 + 0.08 * n, 0.14)                              # 嘴
        if p.y > hd.y - 0.75 * L and p.z > hd.z - 0.75 * L:
            return (0.62 + 0.14 * n, 0.66 + 0.14 * n, 0.66 + 0.12 * n)                 # 灰白の頭
        return (0.13 + 0.1 * n, 0.2 + 0.12 * n, 0.21 + 0.12 * n)                      # 嵐雲の色の羽
    region(r, 'feather', lambda p, nb: front(p, nb) * (0.0 if (nb and nb[:5] in ('shinF', 'footF')) else 1.0), feather_col, 0.8)

    def col(p, near, n):
        c = mix((0.2, 0.19, 0.17), (0.05, 0.05, 0.05), max(0, -n) * 1.5)       # 煤けた獅子の毛
        if near and near[:5] in ('shinF', 'footF', 'jaw', 'head') and (near[:4] != 'head' or p.y > (hd.y + 0.5 * L)):
            c = mix((0.42, 0.33, 0.14), (0.14, 0.1, 0.05), max(0, -n) * 1.4)     # 嘴と鳥の脚は鈍い黄土
        if near == 'head' and p.y <= hd.y + 0.5 * L:
            c = mix((0.82, 0.8, 0.74), (0.5, 0.46, 0.4), max(0, -n) * 1.4)     # 頭は白い羽
        return c
    r.color_fn = col
    for sx in (-1, 1):
        r.part(sphere(0.1 * L, tuple(hd + V((sx * 0.44, 0.32, 0.14)) * L), seg=12, rings=8), 'head', core, 0x64edbd)
    # 翼: 腕の骨に沿って、雨覆いと風切り羽を並べる
    for S, sx in (('_L', -1), ('_R', 1)):
        a0, a1, a2, a3 = P_('wingroot' + S), P_('wingA' + S), P_('wingB' + S), P_('wf1' + S)
        clay(r, ell(a0 + V((sx * 0.2, -0.1, 0.1)) * L, V((0.5, 0.55, 0.55)) * L))
        clay(r, ell(a1, 0.34 * L))
        clay(r, ell(a2, 0.26 * L))
        segs = (('wingA' + S, a0, a1, 7, 2.6), ('wingB' + S, a1, a2, 9, 3.3), ('wf1' + S, a2, a3, 9, 3.6))
        n = 0
        for bone, p0, p1, cnt, flen in segs:
            for k in range(cnt):
                t = (k + 0.5) / cnt
                base = p0.lerp(p1, t)
                n += 1
                spread = n / 25
                d = V((sx * (0.15 + 0.75 * spread * spread), -1.0 + 0.5 * spread * spread, -0.42 + 0.1 * spread)).normalized()
                for row, (ln, wd, zo, colr) in enumerate(((flen * (0.8 + 0.5 * spread), 0.52, -0.05, 0x161c20), (flen * 0.45, 0.5, 0.07, 0x2c3a3e), (flen * 0.22, 0.46, 0.15, 0x6a7c7e))):
                    c = base + d * ln * L * 0.5 + V((0, 0, zo)) * L
                    r.part(box((wd * L * (1.0 if row else 0.85), ln * L, 0.035 * L), tuple(c), rot=tuple((V((0, 1, 0)).rotation_difference(d)).to_euler())), bone, feather, colr, smooth=False)
    # 足: 前は猛禽の鉤爪、後ろは獅子の足
    for S in ('_L', '_R'):
        f = P_('footF' + S)
        clay(r, ell(f + V((0, -0.15, 0.08)) * L, V((0.3, 0.38, 0.24)) * L))
        for k in range(3):
            a = (k - 1) * 0.5
            b1 = f + V((math.sin(a) * 0.55, 0.35 + math.cos(a) * 0.35, -0.02)) * L
            clay(r, cap(f + V((math.sin(a) * 0.2, 0.1, 0.02)) * L, b1, 0.12 * L, 0.09 * L, 8))
            spike(r, 'footF' + S, horn, b1, (math.sin(a) * 0.4, 0.8, -0.6), 0.55 * L, 0.09 * L, 0x1a1612)
        g = P_('footB' + S)
        clay(r, ell(g + V((0, -0.1, 0.05)) * L, V((0.38, 0.5, 0.26)) * L))
        for k in range(4):
            a = (k - 1.5) * 0.3
            spike(r, 'footB' + S, horn, g + V((math.sin(a) * 0.3, 0.42, 0)) * L, (math.sin(a) * 0.3, 1, -0.3), 0.3 * L, 0.07 * L, 0x1a1612)
    # 尾の房
    tp = P_('tail5')
    clay(r, ell(tp + V((0, -0.2, 0.05)) * L, V((0.3, 0.55, 0.3)) * L))
    # 届けられなかった手紙: 右の前脚に結んだ巻紙と、封蝋、ほどけかけた紐
    f = P_('thighF_R').lerp(P_('shinF_R'), 0.6)
    r.part(cone(0.16 * L, 0.16 * L, 0.6 * L, tuple(f + V((0.34, 0.05, 0)) * L), rot=(0.25, 0, 0), seg=14), 'shinF_R', paper, 0xd8cca4)
    r.part(ring(0.33 * L, 0.035 * L, tuple(f), rot=(0.25, 0, 0), seg=16), 'shinF_R', paper, 0x6a1c1c)
    r.part(sphere(0.07 * L, tuple(f + V((0.5, 0.05, 0.0)) * L), seg=10, rings=8, scale=(0.5, 1, 1)), 'shinF_R', core, 0x64edbd)
    r.part(cone(0.02 * L, 0.01 * L, 0.7 * L, tuple(f + V((0.3, -0.1, -0.4)) * L), rot=(0.3, 0.2, 0), seg=5), 'shinF_R', paper, 0x6a1c1c)
    r.extras.update({'species': 'griffin', 'core': {'bone': 'chest', 'pos': [0, 0.2, -0.9]}})
    return r


BUILDERS = {'guardian-dragon': dragon, 'guardian-giant': giant, 'guardian-sentinel': sentinel, 'guardian-beast': beast, 'guardian-griffin': griffin}


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
