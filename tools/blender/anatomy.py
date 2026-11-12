# 解剖の部品集: 骨格(rig.Rig の関節)の上に、筋肉・骨の出っ張り・顔・手足の形を「粘土」として盛る。
# 盛った形は forge がボクセルで一体化し、くぼみ(眼窩・口・肋の溝)を彫ってから細部を焼き込む。
# 向き: +Y が正面、+Z が上、_R は +X 側。
import bmesh, math
from mathutils import Vector, Matrix


def _rot_to(d):
    return Vector((0, 0, 1)).rotation_difference(Vector(d).normalized()).to_matrix().to_4x4()


def ell(c, r, along=None, seg=24):
    """楕円体。along を与えると、楕円体の z 軸をその向きに合わせる"""
    c = Vector(c)
    r = (r, r, r) if not isinstance(r, (tuple, list, Vector)) else tuple(r)
    def f(bm):
        m = Matrix.Translation(c) @ (_rot_to(along) if along is not None else Matrix.Identity(4)) @ Matrix.Diagonal((*r, 1))
        return bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=1.0, matrix=m)['verts']
    return f


def cap(a, b, r1, r2=None, seg=16):
    """両端が丸い棒(先細りにできる)"""
    a, b = Vector(a), Vector(b)
    r2 = r1 if r2 is None else r2
    def f(bm):
        vs = []
        d = b - a
        vs += bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r1, matrix=Matrix.Translation(a))['verts']
        if r2 > 1e-5:
            vs += bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r2, matrix=Matrix.Translation(b))['verts']
        if d.length > 1e-5:
            m = Matrix.Translation((a + b) * 0.5) @ _rot_to(d)
            vs += bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=max(r2, 1e-4), depth=d.length, matrix=m)['verts']
        return vs
    return f


def chain(pts, radii, seg=14):
    """点の列をつないだ、太さの変わる管(尾・角・触手)"""
    fs = [cap(pts[i], pts[i + 1], radii[i], radii[i + 1], seg) for i in range(len(pts) - 1)]
    def f(bm):
        vs = []
        for g in fs:
            vs += g(bm)
        return vs
    return f


def clay(r, fn):
    if not hasattr(r, 'clay'):
        r.clay = []
    r.clay.append(fn)


def dent(r, c, radii, depth):
    """c を中心とする楕円体の範囲を、深さ depth だけ内側へ押す(負なら盛り上げる)"""
    if not hasattr(r, 'dents'):
        r.dents = []
    radii = (radii, radii, radii) if not isinstance(radii, (tuple, list, Vector)) else tuple(radii)
    r.dents.append((Vector(c), Vector(radii), depth))


def P(r, n):
    return r.joints[n]['pos']


def flesh(r, s=1.0, w=1.0, m=1.0, gaunt=0.0, fat=0.0, hands=True, feet=True, legs=True, arms=True, torso=True, claws=0.0, toes=3):
    """人型の肉付け。m=筋肉の量、gaunt=痩せこけ具合、fat=腹の出方"""
    V = Vector
    hips, chest, neck = P(r, 'hips'), P(r, 'chest'), P(r, 'neck')
    k = 1 - 0.18 * gaunt
    if torso:
        clay(r, ell(chest + V((0, -0.012, -0.075)) * s, V((0.168 * w * k, 0.112 * k, 0.2)) * s))
        clay(r, ell(hips.lerp(chest, 0.42) + V((0, 0.018 + 0.05 * fat, 0)) * s, V((0.138 * w * k * (1 + 0.5 * fat), (0.095 + 0.1 * fat) * k, 0.15)) * s))
        clay(r, ell(hips + V((0, -0.005, -0.03)) * s, V((0.165 * w, 0.105, 0.115)) * s))
        clay(r, cap(neck + V((0, -0.01, 0.0)) * s, neck + V((0, 0.012, 0.085)) * s, 0.056 * s * (1 + 0.15 * m), 0.05 * s))
    for S, sx in (('_L', -1), ('_R', 1)):
        X = V((sx, 0, 0))
        sh, el, wr, hd = P(r, 'clav' + S), P(r, 'uarm' + S), P(r, 'farm' + S), P(r, 'hand' + S)
        hj, kn, an, toe = P(r, 'pelvis' + S), P(r, 'thigh' + S), P(r, 'shin' + S), P(r, 'foot' + S)
        if torso:
            mm = 0.55 + 0.5 * m
            clay(r, ell(chest + V((sx * 0.08 * w, 0.072, -0.02)) * s, V((0.09, 0.05 * mm, 0.068)) * s * k))          # 胸
            clay(r, ell(neck.lerp(sh, 0.45) + V((0, -0.02, -0.012)) * s, V((0.07, 0.045, 0.034 * mm)) * s))          # 僧帽筋
            clay(r, ell(chest + V((sx * 0.105 * w, -0.065, -0.07)) * s, V((0.065, 0.05, 0.14)) * s * mm * k))       # 背
            clay(r, ell(hj + V((0, -0.06, -0.02)) * s, V((0.092, 0.085, 0.1)) * s))                                 # 尻
            clay(r, cap(V((sx * 0.02 * s, chest.y + 0.075 * s, chest.z + 0.075 * s)), sh + V((0, 0.02, 0.02)) * s, 0.013 * s, 0.015 * s))  # 鎖骨
            # 肋の溝と肩甲骨(痩せているほど浮き出る)
            if gaunt > 0:
                for i in range(5):
                    dent(r, chest + V((sx * 0.105 * w, 0.03, -0.045 - 0.036 * i)) * s, V((0.075, 0.1, 0.0095)) * s, 0.011 * s * gaunt)
                dent(r, hips.lerp(chest, 0.42) + V((0, 0.09, 0)) * s, V((0.1, 0.05, 0.1)) * s, 0.03 * s * gaunt)
            dent(r, chest.lerp(hips, 0.5) + V((0, -0.1, 0.05)) * s, V((0.016, 0.05, 0.3)) * s, 0.012 * s)           # 背骨の溝
        if arms:
            d = el - sh
            clay(r, ell(sh + V((sx * 0.025, 0, -0.03)) * s, V((0.066, 0.068, 0.088)) * s * (0.8 + 0.3 * m)))        # 三角筋
            clay(r, ell(sh.lerp(el, 0.5) + V((0, 0.022, 0)) * s, V((0.04, 0.044, 0)) * s * (0.75 + 0.4 * m) + V((0, 0, d.length * 0.34)), along=d))   # 二頭
            clay(r, ell(sh.lerp(el, 0.45) + V((0, -0.022, 0)) * s, V((0.038, 0.04, 0)) * s * (0.75 + 0.4 * m) + V((0, 0, d.length * 0.36)), along=d))  # 三頭
            clay(r, ell(el + V((0, -0.018, 0)) * s, 0.03 * s))                                                       # 肘
            d2 = wr - el
            clay(r, ell(el.lerp(wr, 0.3) + V((sx * 0.006, 0.006, 0)) * s, V((0.04, 0.044, 0)) * s * (0.8 + 0.3 * m) + V((0, 0, d2.length * 0.32)), along=d2))
            clay(r, ell(wr, V((0.027, 0.02, 0.024)) * s))
        if hands and arms:
            d3 = (hd - wr)
            L = max(1e-4, d3.length)
            u = d3 / L                                   # 手の伸びる向き
            side = X                                      # 掌の幅の向き
            front = u.cross(side).normalized()
            if front.y < 0: front = -front
            palm = wr + u * L * 0.55
            clay(r, ell(palm, (0.042 * s, 0.017 * s, L * 0.62), along=u))
            # 指: 人差し指〜小指 と 親指
            for i in range(4):
                off = (i - 1.5) * 0.02 * s
                base = wr + u * L * 1.02 + side * off * sx * -1 + front * 0.004 * s
                fl = (0.075, 0.085, 0.078, 0.06)[i] * s * (1 + claws * 0.4)
                mid = base + (u * 0.55 + front * 0.12).normalized() * fl * 0.55
                tip = mid + (u * 0.4 + front * 0.6).normalized() * fl * 0.5
                clay(r, chain([base, mid, tip], [0.0115 * s, 0.0098 * s, 0.0075 * s * (1 - 0.6 * claws)], 10))
            tb = wr + u * L * 0.35 + side * 0.035 * s * sx * -1 + front * 0.012 * s
            tm = tb + (u * 0.6 - side * sx * 0.5 + front * 0.5).normalized() * 0.045 * s
            tt = tm + (u * 0.8 + front * 0.5).normalized() * 0.035 * s
            clay(r, chain([tb, tm, tt], [0.014 * s, 0.0115 * s, 0.0085 * s], 10))
        if legs:
            d = kn - hj
            clay(r, ell(hj.lerp(kn, 0.4) + V((0, 0.028, 0)) * s, V((0.072, 0.078, 0)) * s * (0.8 + 0.3 * m) * k + V((0, 0, d.length * 0.36)), along=d))   # 大腿前
            clay(r, ell(hj.lerp(kn, 0.5) + V((0, -0.032, 0)) * s, V((0.062, 0.06, 0)) * s * (0.8 + 0.3 * m) * k + V((0, 0, d.length * 0.34)), along=d))  # 大腿後
            clay(r, ell(kn + V((0, 0.03, 0.0)) * s, V((0.04, 0.03, 0.046)) * s))                                       # 膝
            d2 = an - kn
            clay(r, ell(kn.lerp(an, 0.3) + V((0, -0.03, 0)) * s, V((0.05, 0.056, 0)) * s * (0.8 + 0.35 * m) * k + V((0, 0, d2.length * 0.3)), along=d2))  # ふくらはぎ
            clay(r, cap(kn + V((0, 0.012, -0.03)) * s, an + V((0, 0.01, 0.02)) * s, 0.03 * s, 0.024 * s))             # すね
            clay(r, ell(an + V((sx * 0.022, 0, 0)) * s, 0.02 * s))
            clay(r, ell(an + V((sx * -0.02, 0, 0.008)) * s, 0.018 * s))
        if feet and legs:
            clay(r, ell(an + V((0, -0.035, -0.045)) * s, V((0.036, 0.048, 0.038)) * s))                               # かかと
            ball = V((toe.x, toe.y - 0.01 * s, max(0.022 * s, toe.z - 0.012 * s)))
            clay(r, ell(an.lerp(ball, 0.55) + V((0, 0, -0.012)) * s, V((0.043 * s, (ball - an).length * 0.55, 0.033 * s))))
            clay(r, ell(ball, V((0.05, 0.035, 0.022)) * s))
            for i in range(toes):
                tx = ((i - (toes - 1) / 2) * (0.085 / max(1, toes))) * s
                b0 = ball + V((tx, 0.028 * s, -0.004 * s))
                b1 = b0 + V((tx * 0.3, 0.04 * s * (1 + claws), -0.008 * s))
                clay(r, cap(b0, b1, 0.0125 * s, 0.009 * s * (1 - 0.7 * claws), 10))


def head(r, s=1.0, hs=1.0, jaw=1.0, brow=1.0, nose=1.0, gaunt=0.0, ears=1.0, snout=0.0, fangs=False, eye_dx=0.031, bone='head'):
    """頭と顔。hs=頭の大きさ、snout=口吻の突き出し。眼窩の中心(左右)を返す"""
    V = Vector
    neck = P(r, 'neck')
    hc = neck + V((0, 0.016, 0.1)) * s * hs
    q = s * hs
    clay(r, ell(hc + V((0, -0.012, 0.022)) * q, V((0.076, 0.094, 0.088)) * q))                     # 頭蓋
    clay(r, ell(hc + V((0, 0.045, -0.03)) * q, V((0.057, 0.052, 0.07)) * q))                       # 顔
    clay(r, ell(hc + V((0, 0.04 + 0.05 * snout, -0.078)) * q, V((0.05 * jaw, 0.052 + 0.045 * snout, 0.034 * jaw)) * q))   # 顎
    clay(r, ell(hc + V((0, 0.078 + 0.09 * snout, -0.098)) * q, V((0.024, 0.02, 0.02)) * q * jaw))  # おとがい
    clay(r, ell(hc + V((0, 0.081, 0.022)) * q, V((0.062, 0.02, 0.017 * brow)) * q))                # 眉の隆起
    for sx in (-1, 1):
        clay(r, ell(hc + V((sx * 0.046, 0.062, -0.02)) * q, V((0.023, 0.022, 0.02)) * q))          # 頬骨
        clay(r, ell(hc + V((sx * 0.046, 0.02, -0.07)) * q, V((0.018, 0.04, 0.024)) * q * jaw))     # 顎の角
        if ears > 0:
            clay(r, ell(hc + V((sx * 0.079, -0.008, -0.008)) * q, V((0.008, 0.02, 0.03 * ears)) * q))
            if ears > 1.2:   # とがった耳
                clay(r, cap(hc + V((sx * 0.08, -0.01, 0.0)) * q, hc + V((sx * (0.09 + 0.03 * ears), -0.03, 0.03 * ears)) * q, 0.012 * q, 0.003 * q))
        dent(r, hc + V((sx * eye_dx, 0.088, 0.0)) * q, V((0.02, 0.026, 0.0135)) * q, 0.02 * q)   # 眼窩
        dent(r, hc + V((sx * 0.062, 0.03, 0.035)) * q, V((0.02, 0.04, 0.03)) * q, 0.006 * q)       # こめかみ
        dent(r, hc + V((sx * 0.047, 0.055, -0.055)) * q, V((0.022, 0.03, 0.028)) * q, (0.004 + 0.016 * gaunt) * q)   # こけた頬
    if nose > 0:
        clay(r, cap(hc + V((0, 0.088, 0.006)) * q, hc + V((0, 0.098 + 0.016 * nose, -0.03)) * q, 0.0105 * q, 0.014 * q * nose))
        for sx in (-1, 1):
            clay(r, ell(hc + V((sx * 0.012, 0.098 + 0.006 * nose, -0.036)) * q, 0.0095 * q * nose))
    else:            # 鼻の無い顔(髑髏・屍): 鼻の穴だけ
        dent(r, hc + V((0, 0.1, -0.03)) * q, V((0.012, 0.02, 0.018)) * q, 0.012 * q)
    my = 0.094 + 0.085 * snout
    dent(r, hc + V((0, my, -0.066)) * q, V((0.034 * jaw, 0.022, 0.0055)) * q, 0.007 * q)            # 口の線
    dent(r, hc + V((0, 0.085, -0.048)) * q, V((0.006, 0.02, 0.01)) * q, 0.003 * q)                  # 人中
    return hc, [hc + V((sx * eye_dx, 0.07, 0.0)) * q for sx in (-1, 1)]


def apply_dents(ob, dents):
    """粘土の表面を、楕円体の範囲ごとに押し込む"""
    if not dents:
        return
    me = ob.data
    me.update()
    ns = [v.normal.copy() for v in me.vertices]
    for c, rad, depth in dents:
        lo, hi = c - rad, c + rad
        for v in me.vertices:
            p = v.co
            if p.x < lo.x or p.x > hi.x or p.y < lo.y or p.y > hi.y or p.z < lo.z or p.z > hi.z:
                continue
            q = ((p.x - c.x) / rad.x) ** 2 + ((p.y - c.y) / rad.y) ** 2 + ((p.z - c.z) / rad.z) ** 2
            if q < 1:
                v.co = p - ns[v.index] * depth * (1 - q) ** 2
    me.update()
