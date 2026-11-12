# 一人称の手(骨入り): 指の一本ずつに骨を入れ、ゲーム側が持つ物の太さに合わせて指を曲げる。
#   blender -b --factory-startup -P tools/blender/fphand.py -- <出力先>   (環境変数 PREVIEW=絵の出力先)
# 向き(Blender): 指は +Z、掌は -Y 側、親指は +X 側(右手)。原点は手首。左手はゲーム側で左右反転する。
# 骨はどれも同じ向き(identity)なので、ゲーム側は骨をそのまま回せる。
#   arm = 前腕と袖(手首で回る) / i1..i3, m1..3, r1..3, p1..3 = 指の付け根・第二・第一関節 / t1..t3 = 親指
import sys, os, math, importlib
sys.path.insert(0, os.path.dirname(__file__))
import rig as R, forge, anatomy
for m in (R, forge, anatomy):
    importlib.reload(m)
from rig import Rig, sphere
from anatomy import ell, cap, chain, clay, dent
from mathutils import Vector as V, Matrix
import bmesh

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'public/models'


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def sm(x, a, b):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# 指: 付け根の位置, 開き(rad), 三つの節の長さ, 太さ
FING = {
    'i': (V((0.027, 0.004, 0.092)), 0.13, (0.039, 0.023, 0.021), 0.0093),
    'm': (V((0.006, 0.005, 0.097)), 0.04, (0.043, 0.027, 0.022), 0.0097),
    'r': (V((-0.0145, 0.004, 0.092)), -0.08, (0.039, 0.025, 0.021), 0.0091),
    'p': (V((-0.0335, 0.002, 0.082)), -0.2, (0.031, 0.019, 0.019), 0.0081),
}
CMC = V((0.02, -0.004, 0.02))
TDIR = V((0.6, -0.1, 0.8)).normalized()
TLEN = (0.046, 0.032, 0.027)
TRAD = (0.0118, 0.0108, 0.0098)


def chain_pts(name):
    if name == 't':
        pts = [CMC.copy()]
        for L in TLEN:
            pts.append(pts[-1] + TDIR * L)
        return pts
    k, a, lens, rad = FING[name]
    d = V((math.sin(a), 0, math.cos(a)))
    pts = [k.copy()]
    for L in lens:
        pts.append(pts[-1] + d * L)
    return pts


CH = {n: chain_pts(n) for n in ('i', 'm', 'r', 'p', 't')}


def chain_param(p, pts):
    """点の列に沿った位置 s(付け根より手前は負)と、列までの距離"""
    best = None
    cum = 0.0
    for j in range(len(pts) - 1):
        a, b = pts[j], pts[j + 1]
        ab = b - a
        L = ab.length
        t = (p - a).dot(ab) / (L * L)
        tc = max(0.0 if j else -0.9, min(1.0, t))
        d = (p - (a + ab * tc)).length
        if best is None or d < best[0]:
            best = (d, cum + tc * L)
        cum += L
    return best[1], best[0]


def chain_w(s, lens, names, h0=0.009, h=0.0065, back=None):
    """s の位置での、列の骨ごとの重み。back は付け根より手前の骨"""
    g0 = sm(s, -h0, h0 * 0.6)
    g1 = sm(s, lens[0] - h, lens[0] + h)
    g2 = sm(s, lens[0] + lens[1] - h, lens[0] + lens[1] + h)
    return [(1 - g0, back), (g0 * (1 - g1), names[0]), (g0 * g1 * (1 - g2), names[1]), (g0 * g1 * g2, names[2])]


def weights(p):
    out = {}
    def add(w, b):
        if w > 1e-4:
            out[b] = out.get(b, 0.0) + w
    # 親指: 付け根の丘(母指球)は、親指の骨に半分ほど付いて動く
    st, dt = chain_param(p, CH['t'])
    w_th = 1 - sm(dt, 0.0135, 0.026)
    if st > TLEN[0] * 0.8:
        w_th = max(w_th, 1 - sm(dt, 0.016, 0.022))
    # 四本の指: いちばん近い指の列で決める
    best = None
    for n in ('i', 'm', 'r', 'p'):
        s, d = chain_param(p, CH[n])
        if best is None or d < best[1]:
            best = (s, d, n)
    s, d, n = best
    for w, b in chain_w(s, FING[n][2], [n + '1', n + '2', n + '3'], back='base'):
        add(w * (1 - w_th), b)
    for w, b in chain_w(st, TLEN, ['t1', 't2', 't3'], h0=0.012, h=0.008, back='base'):
        add(w * w_th, b)
    # 前腕と袖
    w_arm = sm(-p.z, -0.006, 0.022)
    if w_arm > 0:
        for b in list(out):
            out[b] *= (1 - w_arm)
        add(w_arm, 'arm')
    top = sorted(((w, b) for b, w in out.items()), reverse=True)[:4]
    tot = sum(w for w, _ in top)
    return [(w / tot, b) for w, b in top]


def lathe(profile, seg=40, sy=1.0):
    """(半径, z) の列を z 軸まわりに回した閉じた形(両端は軸の上に置く)"""
    def f(bm):
        rings, vs = [], []
        for r, z in profile:
            if r < 1e-6:
                v = bm.verts.new((0, 0, z)); rings.append([v]); vs.append(v)
            else:
                row = [bm.verts.new((math.cos(k / seg * math.tau) * r, math.sin(k / seg * math.tau) * r * sy, z)) for k in range(seg)]
                rings.append(row); vs += row
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
        return vs
    return f


def hand():
    r = Rig('fp-hand')
    r.identity_bones = True
    r.bump = 0.0
    r.voxel = 0.0012
    r.clay_smooth = 6
    r.tex = 1024
    r.tris = 11000
    r.scale = 0.34
    r.detail = 0.06
    r.ao_strength = 0.45
    r.crease = (0.93, 0.85, 0.83)      # しわを暗くしすぎない(若い肌)
    r.mottle = (0.985, 1.015)
    r.cage = 0.0035
    r.ray = 0.012
    r.surface = 'skin'
    r.mat('skin', rough=0.46)
    cloth = r.mat('cloth', rough=0.93)
    r.j('base', (0, 0, 0), 0.01, skin=False)
    r.j('arm', (0, 0, -0.1), 0.01, 'base', skin=False)
    for n in ('i', 'm', 'r', 'p', 't'):
        pts = CH[n]
        r.j(n + '0', tuple(pts[0]), 0.005, 'base', skin=False)
        for k in (1, 2, 3):
            r.j('%s%d' % (n, k), tuple(pts[k]), 0.005, '%s%d' % (n, k - 1), skin=False)
    r.weight_fn = weights

    # ---- 掌と手の甲 ----
    clay(r, ell((-0.002, 0.0, 0.05), (0.042, 0.0135, 0.05)))
    clay(r, ell((-0.002, 0.002, 0.075), (0.04, 0.0125, 0.024)))               # 指の付け根の幅
    clay(r, ell(CMC + TDIR * 0.016 + V((-0.006, -0.002, 0)), (0.021, 0.0092, 0.034), along=TDIR))   # 母指球
    clay(r, ell((0.0, -0.003, 0.048), (0.034, 0.0105, 0.04)))              # 母指球と掌のあいだを埋める
    clay(r, ell((0.0, -0.001, 0.02), (0.035, 0.0155, 0.03)))                 # 掌の付け根
    clay(r, ell((-0.027, -0.0035, 0.034), (0.014, 0.0098, 0.034)))            # 小指球
    clay(r, ell((-0.002, -0.002, 0.078), (0.039, 0.0066, 0.022)))                # 指の付け根の肉(掌側)
    clay(r, ell((-0.002, 0.004, 0.055), (0.038, 0.0115, 0.042)))             # 手の甲(なだらかに盛る)
    # ---- 指 ----
    # 実物の指に寄せる: 断面は丸ではなく横長(幅 > 厚み)、関節でわずかに太り、先へ細くなる。指先の腹は掌側に丸く、
    # 甲側の先には爪(皮膚に半ば埋まった板。まわりに爪の溝)がある。爪は形を粘土で盛り、色と艶は領域で塗る
    NAILS = []          # (中心, 指の向き, 幅の向き, 甲の向き, 半幅, 半長)
    def flat(fn, cy, sy):
        def g(bm):
            vs = fn(bm)
            for v in vs:
                v.co.y = cy + (v.co.y - cy) * sy
            return vs
        return g
    for n, (k, a, lens, rad) in FING.items():
        pts = CH[n]
        d = (pts[1] - pts[0]).normalized()
        sd = V((d.z, 0, -d.x))                                               # 幅の向き
        rr = [rad * 1.04, rad * 0.97, rad * 0.92, rad * 0.8]
        body = [chain(pts, rr, 16), ell(pts[1], (rr[1] * 1.045, rr[1] * 1.0, rr[1] * 1.05)), ell(pts[2], (rr[2] * 1.04, rr[2] * 1.0, rr[2] * 1.0))]
        for fn in body:
            clay(r, flat(fn, pts[0].y, 0.86))                                # 厚みは幅の 86%
        th = rr[3] * 0.86
        clay(r, ell(pts[3] - d * 0.0075 + V((0, -th * 0.28, 0)), (rr[3] * 1.0, th * 0.95, 0.0105)))      # 指先の腹
        clay(r, ell(k + V((0, 0.0042, -0.004)), (rad * 0.95, 0.0058, rad * 1.05)))                         # 拳頭(なだらかな丘)
        for j in (1, 2):                                                      # 関節: 甲に浅い二本のしわ、掌に一本
            for o in (-0.0018, 0.0016):
                dent(r, pts[j] + d * o + V((0, rr[j] * 0.86, 0)), (rr[j] * 0.8, 0.0018, 0.0007), 0.00028)
            dent(r, pts[j] + V((0, -rr[j] * 0.86, 0)), (rr[j] * 0.95, 0.0026, 0.001), 0.0005)
        dent(r, pts[0] + V((0, -0.011, 0.012)), (rad * 1.1, 0.003, 0.0012), 0.0008)
        # 爪
        hw, hl = rr[3] * 0.74, 0.0064
        nc = pts[3] - d * 0.0072 + V((0, th * 0.97, 0))
        clay(r, (lambda bm, nc=nc, hw=hw, hl=hl, d=d, sd=sd: bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=10, radius=1.0, matrix=Matrix.Translation(nc - V((0, 0.0006, 0))) @ Matrix(((sd.x, 0, d.x, 0), (0, 1, 0, 0), (sd.z, 0, d.z, 0), (0, 0, 0, 1))) @ Matrix.Diagonal((hw, 0.0011, hl, 1)))['verts']))
        for sgn in (-1, 1):                                                   # 爪の両脇の溝
            dent(r, nc + sd * sgn * (hw + 0.0006), (0.0011, 0.0016, hl * 0.9), 0.00035)
        dent(r, nc - d * (hl + 0.0005), (hw * 0.9, 0.0016, 0.0011), 0.00035)  # 甘皮の溝
        NAILS.append((nc, d, sd, V((0, 1, 0)), hw, hl))
    # 拳頭のあいだのくぼみ
    ks = [FING[n][0] for n in ('i', 'm', 'r', 'p')]
    for a_, b_ in zip(ks, ks[1:]):
        dent(r, (a_ + b_) * 0.5 + V((0, 0.009, -0.004)), (0.004, 0.004, 0.009), 0.0009)
    # ---- 親指 ----
    tp = CH['t']
    side = V((0.74, 0.25, -0.62)).normalized()        # 親指の爪は、外側(掌の面の中で、指と直角)を向く
    tw = TDIR.cross(side).normalized()                # 親指の幅の向き
    clay(r, chain(tp, [0.0128, TRAD[0], TRAD[1] * 0.97, TRAD[2] * 0.84], 16))
    clay(r, ell(tp[1], (0.0118, 0.0113, 0.0118)))
    clay(r, ell(tp[2], (0.0109, 0.0104, 0.0109)))
    clay(r, ell(tp[3] - TDIR * 0.0085 - side * 0.002, (0.0102, 0.0094, 0.0125), along=TDIR))              # 親指の腹
    for o in (-0.0018, 0.0016):
        dent(r, tp[2] + TDIR * o + side * 0.0104, (0.0022, 0.0022, 0.0022), 0.0003)
    thw, thl = 0.0072, 0.0078
    tnc = tp[3] - TDIR * 0.0098 + side * 0.0079
    clay(r, lambda bm: bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=10, radius=1.0, matrix=Matrix.Translation(tnc - side * 0.0006) @ Matrix(((tw.x, side.x, TDIR.x, 0), (tw.y, side.y, TDIR.y, 0), (tw.z, side.z, TDIR.z, 0), (0, 0, 0, 1))) @ Matrix.Diagonal((thw, 0.0009, thl * 0.92, 1)))['verts'])
    NAILS.append((tnc, TDIR, tw, side, thw, thl))
    # 水かき(親指と人差し指のあいだ)
    clay(r, ell((0.03, -0.001, 0.064), (0.013, 0.006, 0.022), along=V((0.35, 0, 1))))
    # 掌の三本の線
    for a, b, w in (((0.03, 0.074), (-0.02, 0.066), 0.0012), ((0.034, 0.062), (-0.034, 0.05), 0.0012), ((0.02, 0.07), (0.004, 0.012), 0.0012)):
        for k in range(9):
            t = k / 8
            dent(r, V((a[0] + (b[0] - a[0]) * t, -0.0135, a[1] + (b[1] - a[1]) * t)), (0.0045, 0.004, 0.0028), w * 0.35)
    # ---- 手首・前腕 ----
    clay(r, ell((0, 0.001, -0.004), (0.0272, 0.0178, 0.032)))
    clay(r, ell((0, 0.002, -0.12), (0.033, 0.026, 0.14)))
    # ---- 袖: 口が開いた筒(中に腕が入っている) ----
    clay(r, lathe([(0, -0.34), (0.066, -0.34), (0.061, -0.26), (0.052, -0.13), (0.0475, -0.05), (0.0465, -0.044), (0.0415, -0.045), (0.0395, -0.06), (0.0385, -0.105), (0, -0.108)], sy=0.9))
    clay(r, lathe([(0, -0.062), (0.0505, -0.062), (0.0515, -0.056), (0.0505, -0.05), (0, -0.05)], sy=0.9))   # 袖口の折り返し
    for k in range(9):          # 袖のしわ
        a = k / 9 * math.tau + 0.3
        dent(r, V((math.cos(a) * 0.056, math.sin(a) * 0.05, -0.17 - 0.04 * (k % 3))), (0.012, 0.012, 0.07), 0.0055)

    def is_cloth(p):
        return p.z < -0.0425 and (math.hypot(p.x, p.y / 0.9) > 0.0368 or p.z < -0.1)
    def cloth_col(p, n):
        c = (0.07 + 0.05 * n, 0.085 + 0.05 * n, 0.15 + 0.07 * n)
        if -0.0635 < p.z < -0.049 and math.hypot(p.x, p.y / 0.9) > 0.046:    # 袖口の金糸の縁取り
            k = 0.8 + 0.4 * (math.sin(math.atan2(p.y, p.x) * 90) * 0.5 + 0.5)
            return (0.4 * k, 0.29 * k, 0.11 * k)
        return c
    def nail_at(p):
        for nc, d_, w_, up_, hw_, hl_ in NAILS:
            q = p - nc
            if abs(q.x) > 0.02 or abs(q.z) > 0.02 or abs(q.y) > 0.02:
                continue
            u, w, v = q.dot(d_), q.dot(w_), q.dot(up_)
            if v > -0.0011 and (u / hl_) ** 2 + (w / hw_) ** 2 < 1.0:
                return u / hl_
        return None
    def nail_col(p, n):
        u = nail_at(p) or 0
        return mix((0.95, 0.74, 0.7), (0.98, 0.93, 0.9), (u - 0.62) / 0.2)      # 爪の先は白い
    r.regions = [('cloth', lambda p, nb: 1.0 if is_cloth(p) else 0.0, cloth_col, 0.93, 0.0),
                 ('horn', lambda p, nb: 1.0 if nail_at(p) is not None else 0.0, nail_col, 0.2, 0.0)]

    def col(p, near, n):
        c = mix((0.91, 0.73, 0.63), (0.87, 0.67, 0.58), max(0, -n) * 0.4)
        if p.y < -0.004 and p.z > -0.03:
            c = mix(c, (0.95, 0.72, 0.66), 0.5)                               # 掌は血色がある
        for nm in ('i', 'm', 'r', 'p'):                                       # 関節と指先は赤みが差す
            for j, q in enumerate(CH[nm]):
                dd = (p - q).length
                if dd < 0.013 and (p.y > q.y or j == 3):
                    c = mix(c, (0.94, 0.66, 0.6), (1 - dd / 0.013) * (0.12 if j < 3 else 0.3))
        return c
    r.color_fn = col
    r.view = [(0.5, -1.6, 0.45, 1.25, 0.72), (-0.9, 1.4, 0.4, 1.25, 0.72), (0.2, -1.2, -0.9, 1.7, 0.6)]
    return r


if __name__ == '__main__':
    pv = os.environ.get('PREVIEW')
    try:
        forge.build(hand(), os.path.abspath(os.path.join(OUT, 'fp-hand.glb')), preview=os.path.join(pv, 'fp-hand.png') if pv else None)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print('FAILED fp-hand', e)
