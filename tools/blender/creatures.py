# 魔物を作り直す(解剖の部品集 + 造形の炉)。姿の理由は design/bestiary.md に書いてある。
#   blender -b --factory-startup -P tools/blender/creatures.py -- <出力先> [種類...]   (環境変数 PREVIEW=絵の出力先)
import sys, os, math, importlib
sys.path.insert(0, os.path.dirname(__file__))
import rig as R, forge, anatomy, build_models as B
for m in (R, forge, anatomy):
    importlib.reload(m)
from rig import Rig, sphere, box, cone, ring, qx, qy, qz, qa, keys
from anatomy import ell, cap, chain, clay, dent, flesh, head, P
from build_models import humanoid, humanoid_anims, death_anim, float_anims, mix, hexc, J
from mathutils import Vector as V

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'public/models'
ONLY = set(argv[1:])
TAU = math.pi * 2


def eyeballs(r, pts, rad, mi, color, bone='head'):
    for p in pts:
        r.part(sphere(rad, tuple(p), seg=12, rings=8), bone, mi, color)


def blade(r, bone, mi, base, length, width=0.055, thick=0.012, color=0x8a8e96, guard=0.22, gcol=0x4a3a2a, grip=0.2):
    """剣: 刃は +Y 向き(手に握って前へ向く)。base は柄の握りの位置"""
    b = V(base)
    r.part(box((width, length, thick), tuple(b + V((0, grip * 0.5 + length * 0.5, 0)))), bone, mi, color, smooth=False)
    r.part(cone(width * 0.5, 0.0, width * 1.6, tuple(b + V((0, grip * 0.5 + length + width * 0.75, 0))), rot=(-math.pi / 2, 0, 0), seg=4), bone, mi, color, smooth=False)
    r.part(box((guard, 0.03, 0.035), tuple(b + V((0, grip * 0.5, 0)))), bone, mi, gcol, smooth=False)
    r.part(cone(0.016, 0.016, grip, tuple(b), rot=(-math.pi / 2, 0, 0), seg=8), bone, mi, 0x2a1c12)
    r.part(sphere(0.028, tuple(b + V((0, -grip * 0.55, 0))), seg=10, rings=8), bone, mi, gcol)


def region(r, surface, fn, color, rough=0.9, metal=0.0):
    if not hasattr(r, 'regions'):
        r.regions = []
    r.regions.append((surface, fn, color, rough, metal))


def sm(x, a, b):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# ---------------- 骸骨兵: 轡をはめられた門衛 ----------------
def skeleton():
    r = Rig('skeleton')
    humanoid(r, H=1.78, rad=0.5, w=0.92, muscle=0)
    for n, rad in (('hips', 0.045), ('spine', 0.026), ('chest', 0.034), ('neck', 0.02), ('head', 0.03)):
        r.joints[n]['r'] = rad
    for S in ('_L', '_R'):
        for n, rad in (('clav', 0.02), ('uarm', 0.021), ('farm', 0.016), ('hand', 0.016), ('pelvis', 0.03), ('thigh', 0.027), ('shin', 0.02), ('foot', 0.017)):
            r.joints[n + S]['r'] = rad
    r.bump = 0.003
    r.surface = 'bone'
    BONE, RUST = 0xcfc2a2, 0x6a4630
    r.mat('bone', rough=0.78)
    eye = r.mat('eye', 0xff3010, emit=6)
    metal = r.mat('rust', rough=0.6, metal=0.65)
    cloth = r.mat('cloth', rough=0.95)
    hc, eyes = head(r, hs=1.0, jaw=1.1, brow=1.15, nose=0, gaunt=1.0, ears=0)
    for sx in (-1, 1):   # 眼窩をさらに深く、頬の下を抉る
        dent(r, hc + V((sx * 0.031, 0.085, 0.0)), (0.019, 0.03, 0.016), 0.022)
        dent(r, hc + V((sx * 0.05, 0.04, -0.06)), (0.02, 0.035, 0.025), 0.02)
    # 関節のこぶ
    for S in ('_L', '_R'):
        for n, rad in (('clav', 0.034), ('uarm', 0.027), ('farm', 0.022), ('pelvis', 0.04), ('thigh', 0.036), ('shin', 0.027)):
            clay(r, ell(J(r, n + S), rad))
        an, toe = J(r, 'shin' + S), J(r, 'foot' + S)
        clay(r, ell(an + V((0, -0.03, -0.03)), (0.022, 0.035, 0.024)))
        for i in range(3):
            clay(r, cap(an.lerp(toe, 0.5) + V(((i - 1) * 0.02, 0, -0.02)), toe + V(((i - 1) * 0.028, 0.03, -0.015)), 0.011, 0.008, 8))
    r.color_fn = lambda p, near, n: mix(mix(hexc(BONE), (0.36, 0.29, 0.2), max(0, -n) * 1.5), (0.2, 0.16, 0.1), 0.35 if p.z < 0.25 else 0)
    cz = J(r, 'chest').z
    hp0 = J(r, 'hips')
    for i in range(6):       # 肋: 左胸の二本は折れている(最期の傷)
        broken = i in (2, 3)
        r.part(ring(0.142 - i * 0.008, 0.011, (0, 0.02, cz - 0.02 - i * 0.052), arc=0.5 if broken else 0.84, scale=(1, 0.8, 1), rot=(0.12, 0, -0.75 if broken else 0)), 'chest', 0, BONE)
    r.part(cone(0.016, 0.022, 0.2, (0, 0.118, cz - 0.1), seg=6), 'chest', 0, BONE)         # 胸骨
    for i in range(9):       # 背骨
        z = hp0.z + (cz + 0.06 - hp0.z) * i / 8
        r.part(sphere(0.026, (0, -0.035, z), seg=10, rings=6, scale=(1.25, 1.25, 0.62)), 'spine' if i < 5 else 'chest', 0, BONE)
        r.part(cone(0.008, 0.003, 0.05, (0, -0.075, z), rot=(math.pi / 2 + 0.3, 0, 0), seg=5), 'spine' if i < 5 else 'chest', 0, BONE)
    r.part(ring(0.125, 0.034, (0, 0, hp0.z - 0.02), scale=(1, 0.72, 1), arc=0.9), 'hips', 0, BONE)   # 骨盤
    eyeballs(r, eyes, 0.0075, eye, 0xff3010)
    # 轡: 顎を締める鉄の帯と、口をふさぐ横棒、垂れた鎖
    r.part(ring(0.068, 0.009, tuple(hc + V((0, 0.012, -0.066))), scale=(1, 1.25, 1), seg=20), 'head', metal, RUST)
    r.part(ring(0.094, 0.008, tuple(hc + V((0, 0.0, 0.01))), rot=(0, math.pi / 2, 0), scale=(1.12, 1, 1), seg=20, arc=0.62), 'head', metal, RUST)
    r.part(box((0.085, 0.014, 0.016), tuple(hc + V((0, 0.1, -0.066)))), 'head', metal, 0x3a2a20, smooth=False)
    for k in range(5):
        r.part(sphere(0.0085, tuple(hc + V((0.058, 0.07 - k * 0.004, -0.085 - k * 0.017))), seg=6, rings=5, scale=(0.7, 1, 1.5)), 'head', metal, RUST)
    # 学院の紋が入った朽ちた肩当て(左)と腰布
    cl = J(r, 'clav_L')
    r.part(sphere(0.075, (cl.x - 0.02, cl.y, cl.z + 0.02), scale=(1.2, 1.15, 0.5), seg=16), 'clav_L', metal, 0x4a4038)
    r.part(ring(0.088, 0.008, (cl.x - 0.02, cl.y, cl.z + 0.005), scale=(1.2, 1.15, 1), seg=18), 'clav_L', metal, RUST)
    r.part(sphere(0.06, (cl.x - 0.065, cl.y, cl.z - 0.03), scale=(1.1, 1.15, 0.45), seg=14), 'clav_L', metal, 0x54402e)
    r.part(box((0.012, 0.012, 0.05), (cl.x - 0.02, cl.y + 0.06, cl.z + 0.045), rot=(0.9, 0, 0)), 'clav_L', metal, 0x7a6a4a, smooth=False)
    for i in range(7):
        a = i / 7 * TAU
        L = 0.24 + 0.14 * ((i * 5) % 3)
        r.part(cone(0.055, 0.0, L, (math.cos(a) * 0.105, math.sin(a) * 0.075, hp0.z - 0.02 - L / 2), rot=(math.pi, 0, 0), seg=4), 'hips', cloth, 0x3a2222)
    h = J(r, 'hand_R')
    blade(r, 'hand_R', metal, (h.x, h.y + 0.02, h.z - 0.04), 0.78, color=0x6e6258, gcol=0x3a2a1a)
    humanoid_anims(r, stride=0.55, armswing=0.45)
    r.tris = 9000
    return r


# ---------------- 屍食鬼: 声を食う者 ----------------
def ghoul():
    r = Rig('ghoul')
    humanoid(r, H=1.7, rad=0.62, w=0.9, hunch=0.8, arm=1.3, leg=0.95, muscle=0.2, fingers=False)
    r.bump = 0.004
    r.surface = 'skin'
    SKIN = 0x6e7a62
    r.mat('skin', rough=0.62)
    eye = r.mat('eye', 0xffe040, emit=6)
    claw = r.mat('claw', rough=0.35)
    s = 1.7 / 1.8
    flesh(r, s=s, w=0.86, m=0.25, gaunt=1.0, claws=1.0)
    hc, eyes = head(r, s=s, hs=1.05, jaw=1.25, brow=1.3, nose=0, gaunt=1.0, ears=2.2, snout=0.25)
    hp, ch, nk = J(r, 'hips'), J(r, 'chest'), J(r, 'neck')
    for i in range(9):       # 浮き出た背骨
        p = hp.lerp(ch, i / 8) + V((0, -0.105 - 0.02 * math.sin(i / 8 * math.pi), 0.02)) * s
        clay(r, ell(p, V((0.012, 0.018, 0.016)) * s))
    for k in (-1, 0, 1):     # 自分で掻きむしった喉の傷
        dent(r, nk + V((k * 0.014, 0.05, 0.03)) * s, V((0.0045, 0.02, 0.05)) * s, 0.006 * s)
    throat = nk + V((0, 0.05, 0.03)) * s
    mouth = hc + V((0, 0.1, -0.07)) * s

    FUR, FUR_D, PAW = (0.95, 0.9, 0.8), (0.55, 0.47, 0.38), (0.5, 0.34, 0.24)

    def col(p, near, n):
        shade = max(0, -n) * 0.9
        if p.z < 0.168:
            return mix(PAW, (0.16, 0.1, 0.07), shade)                                     # 足
        if hand_d(p) <= 0.072:
            return mix(PAW, (0.2, 0.13, 0.09), shade)                                     # 前足
        if (p - V((0, -0.275, 0.3))).length < 0.09:
            return mix(FUR, FUR_D, shade)                                                 # 尾
        d = p - hc
        if p.z < nk.z + 0.06 and d.z < -0.12 and abs(p.x) < 0.2:
            return mix((0.94, 0.9, 0.8), (0.55, 0.5, 0.42), shade)                        # 襟巻き
        c = mix(FUR, FUR_D, shade * 0.8)
        if abs(d.x) > 0.2 and d.z < -0.03:
            c = mix(c, PAW, sm(-d.z, 0.1, 0.24))                                          # 耳の先は焦げ茶
        for sx in (-1, 1):
            k = 1 - min(1, ((d.x - sx * 0.125) / 0.042) ** 2 + ((d.z + 0.075) / 0.028) ** 2)
            if k > 0 and d.y > 0.05:
                c = mix(c, (0.98, 0.58, 0.55), 0.5 * k)                                   # 頬の赤み
        return c
    r.color_fn = col
    eyeballs(r, eyes, 0.0085 * s, eye, 0xffe040)
    for S, sx in (('_L', -1), ('_R', 1)):
        wr, hd = J(r, 'farm' + S), J(r, 'hand' + S)
        u = (hd - wr).normalized()
        for k in range(4):
            b = hd + u * 0.07 * s + V((sx * (k - 1.5) * -0.02, 0.035, 0)) * s
            r.part(cone(0.008 * s, 0.0, 0.085 * s, tuple(b + V((0, 0.02, -0.03)) * s), rot=(math.pi + 0.5, 0, 0), seg=6), 'hand' + S, claw, 0x1c1612)
    for k in range(6):
        x = (k - 2.5) * 0.011 * s
        r.part(cone(0.0045 * s, 0.0, 0.02 * s, (x, hc.y + (0.118 - abs(x) * 0.5) * s, hc.z - 0.062 * s), rot=(math.pi, 0, 0), seg=5), 'head', claw, 0xd8d0b0)
        r.part(cone(0.004 * s, 0.0, 0.016 * s, (x + 0.005 * s, hc.y + (0.114 - abs(x) * 0.5) * s, hc.z - 0.079 * s), rot=(0, 0, 0), seg=5), 'head', claw, 0xc8c0a0)
    humanoid_anims(r, stride=0.6, armswing=0.25, attack='claw', hunch=0.8)
    r.tris = 11000
    return r


# ---------------- 岩喰い鬼: 石板を食う者 ----------------
def ogre():
    r = Rig('ogre')
    humanoid(r, H=2.6, rad=1.2, w=1.3, belly=1.6, hunch=0.35, head=0.8, neck=0.6, arm=1.15, muscle=1.0, fingers=False)
    r.bump = 0.012
    r.bump_freq = 5
    r.surface = 'hide'
    r.scale = 1.4
    SKIN = 0x7c6248
    r.mat('skin', rough=0.78)
    eye = r.mat('eye', 0xff8020, emit=5)
    tusk = r.mat('horn', rough=0.45)
    stone = r.mat('stone', rough=0.95)
    cloth = r.mat('cloth', rough=0.95)
    s = 2.6 / 1.8
    flesh(r, s=s, w=1.3, m=1.25, fat=1.0, toes=4)
    hc, eyes = head(r, s=s, hs=0.86, jaw=1.7, brow=1.6, nose=1.5, ears=1.4, snout=0.12, eye_dx=0.036)
    ch, hp = J(r, 'chest'), J(r, 'hips')
    # 食べた石が、肩と背に瘤になって浮き出ている
    lumps = []
    import random
    rnd = random.Random(7)
    for i in range(16):
        a = rnd.uniform(-1.3, 1.3)
        p = ch + V((math.sin(a) * 0.3 * s, -0.11 * s - rnd.uniform(0, 0.05) * s, rnd.uniform(-0.2, 0.17) * s))
        if i < 6:
            sx = -1 if i % 2 else 1
            p = J(r, 'clav_L' if sx < 0 else 'clav_R') + V((sx * rnd.uniform(0, 0.07), rnd.uniform(-0.05, 0.03), rnd.uniform(0.04, 0.09))) * s
        rad = rnd.uniform(0.035, 0.075) * s
        lumps.append((p, rad))
        clay(r, ell(p, (rad, rad * rnd.uniform(0.7, 1.1), rad * rnd.uniform(0.6, 1.0))))
    region(r, 'stone', lambda p, nb: max([sm(1.08 - (p - c).length / rad, 0.0, 0.25) for c, rad in lumps] + [0]), 0x77736a, 0.95)
    belly = hp.lerp(ch, 0.42) + V((0, 0.16, 0)) * s

    def col(p, near, n):
        c = mix(hexc(SKIN), (0.22, 0.16, 0.11), max(0, -n) * 1.3)
        c = mix(c, (0.56, 0.44, 0.33), max(0, n) * 0.6)
        db = (p - belly).length / (0.3 * s)
        if db < 1:
            c = mix(c, (0.62, 0.52, 0.44), 0.4 * (1 - db))                # 石で張りつめた腹
        dm = (p - (hc + V((0, 0.1, -0.07)) * s)).length / (0.07 * s)
        if dm < 1:
            c = mix(c, (0.5, 0.48, 0.44), 0.5 * (1 - dm))                 # 口のまわりの石粉
        return c
    r.color_fn = col
    eyeballs(r, eyes, 0.009 * s, eye, 0xff8020)
    # 臼のように磨り減った歯と、下から突き出た牙
    for k in range(7):
        x = (k - 3) * 0.014 * s
        r.part(box((0.012 * s, 0.01 * s, 0.014 * s), (x, hc.y + (0.105 - abs(x) * 0.35) * s, hc.z - 0.064 * s)), 'head', tusk, 0xb8ae94)
    for sx in (-1, 1):
        r.part(cone(0.017 * s, 0.004 * s, 0.075 * s, (sx * 0.04 * s, hc.y + 0.1 * s, hc.z - 0.05 * s), rot=(-0.25, sx * 0.3, 0), seg=7), 'head', tusk, 0xd8ccac)
    # 折れた石柱の棍棒
    h = J(r, 'hand_R')
    r.part(cone(0.07, 0.17, 1.25, (h.x, h.y + 0.55, h.z - 0.04), rot=(-math.pi / 2, 0, 0), seg=10), 'hand_R', stone, 0x6e6a62, smooth=False)
    for k in range(3):
        r.part(ring(0.15 - k * 0.03, 0.022, (h.x, h.y + 0.95 - k * 0.3, h.z - 0.04), rot=(math.pi / 2, 0, 0), seg=12), 'hand_R', stone, 0x58544c)
    # 腰布
    for i in range(10):
        a = i / 10 * TAU
        L = (0.36 + 0.14 * ((i * 3) % 3))
        r.part(cone(0.13, 0.03, L, (math.cos(a) * 0.3, math.sin(a) * 0.23 + 0.02, hp.z - 0.05 - L / 2), rot=(math.pi, 0, 0), seg=5), 'hips', cloth, 0x40301e)
    r.part(ring(0.34, 0.03, (0, 0.02, hp.z - 0.0), scale=(1, 0.8, 1), seg=20), 'hips', cloth, 0x2a1e12)
    humanoid_anims(r, stride=0.4, armswing=0.3, attack='slam', heavy=True, speed_bob=0.05)
    r.tris = 13000
    r.voxel = 0.011
    return r


# ---------------- 亡霊騎士: 誓約の鎧 ----------------
def knight():
    r = Rig('knight')
    humanoid(r, H=1.95, rad=1.0, w=1.12, muscle=0.6, fingers=False)
    r.bump = 0.002
    r.surface = 'mail'
    MAIL, STEEL, CLOTH = 0x30323a, 0x7c828e, 0x4a1418
    r.mat('mail', rough=0.6, metal=0.45)
    steel = r.mat('steel', rough=0.38, metal=0.85)
    eye = r.mat('eye', 0x60c8ff, emit=8)
    cloth = r.mat('cloth', rough=0.95)
    gold = r.mat('gold', rough=0.45, metal=0.8)
    s = 1.95 / 1.8
    flesh(r, s=s, w=1.1, m=0.8, feet=False, hands=False)
    ch, hp, nk, hd = J(r, 'chest'), J(r, 'hips'), J(r, 'neck'), J(r, 'head')
    hc = nk + V((0, 0.016, 0.1)) * s
    r.color_fn = lambda p, near, n: mix(hexc(MAIL), (0.04, 0.04, 0.05), max(0, -n) * 1.2)
    # 兜: 中は空で、青い火が一つ
    r.part(sphere(0.125 * s, tuple(hc + V((0, 0, 0.02)) * 1), scale=(0.92, 1.05, 1.12), seg=20, rings=14), 'head', steel, STEEL)
    r.part(cone(0.118 * s, 0.1 * s, 0.11 * s, tuple(hc + V((0, 0.012, -0.07)) * 1), seg=18), 'head', steel, 0x666c78)       # 頬当て
    r.part(box((0.19 * s, 0.03, 0.022 * s), tuple(hc + V((0, 0.115 * s, 0.018)))), 'head', 0, 0x020203, smooth=False)   # 覗き穴
    r.part(box((0.012, 0.13 * s, 0.2 * s), tuple(hc + V((0, 0.05 * s, 0.07)))), 'head', steel, 0x565c68, smooth=False)   # 鼻筋の稜
    r.part(sphere(0.011 * s, tuple(hc + V((0, 0.105 * s, 0.018))), seg=10, rings=8), 'head', eye, 0x60c8ff)
    for k in range(5):       # 兜の房飾り(朽ちた赤)
        r.part(cone(0.022, 0.0, 0.16 + 0.03 * k, tuple(hc + V((0, -0.05 - 0.03 * k, 0.17 - 0.01 * k * k))), rot=(-0.5 - 0.25 * k, 0, 0), seg=5), 'head', cloth, CLOTH)
    r.part(ring(0.085 * s, 0.03, tuple(nk + V((0, 0.0, 0.02))), seg=18), 'neck', steel, 0x5c626e)      # 喉当て
    # 胸甲: 学院の紋と、縁に刻まれた誓文(青く光る)
    r.part(sphere(0.2 * s, (0, ch.y + 0.035, ch.z - 0.06), scale=(1.12, 0.84, 1.12), seg=22, rings=14), 'chest', steel, STEEL)
    r.part(sphere(0.165 * s, (0, ch.y + 0.03, ch.z - 0.25 * s), scale=(1.05, 0.8, 0.7), seg=18, rings=10), 'spine', steel, 0x666c78)
    r.part(ring(0.05 * s, 0.008, (0, ch.y + 0.2 * s, ch.z - 0.04), rot=(math.pi / 2, 0, 0), seg=16), 'chest', gold, 0x9a7a38)
    r.part(cone(0.012, 0.0, 0.07, (0, ch.y + 0.205 * s, ch.z - 0.04), rot=(-math.pi / 2, 0, 0), seg=4), 'chest', gold, 0x9a7a38)
    for i in range(9):
        a = -0.9 + i * 0.225
        r.part(box((0.022, 0.008, 0.006), (math.sin(a) * 0.2 * s, ch.y + 0.035 + math.cos(a) * 0.165 * s, ch.z - 0.215 * s)), 'chest', eye, 0x60c8ff, smooth=False)
    for S, sx in (('_L', -1), ('_R', 1)):
        cl, el, wr = J(r, 'clav' + S), J(r, 'uarm' + S), J(r, 'farm' + S)
        for k in range(3):   # 重ねた肩当て
            r.part(sphere((0.115 - k * 0.012) * s, (cl.x + sx * (0.03 + k * 0.035), cl.y, cl.z + 0.035 - k * 0.04), scale=(1.15, 1.15, 0.62), seg=16), 'clav' + S, steel, STEEL if k != 1 else 0x666c78)
        r.part(cone(0.052 * s, 0.062 * s, (wr - el).length * 0.82, tuple((el + wr) / 2), seg=12), 'farm' + S, steel, STEEL)
        r.part(sphere(0.055 * s, tuple(el + V((0, -0.015, 0))), scale=(1, 1.1, 1.15), seg=12), 'farm' + S, steel, 0x666c78)
        r.part(sphere(0.052 * s, tuple(J(r, 'hand' + S) + V((0, 0, 0.03))), scale=(1, 0.8, 1.25), seg=12), 'hand' + S, steel, 0x666c78)
        hj, kn, an = J(r, 'pelvis' + S), J(r, 'thigh' + S), J(r, 'shin' + S)
        r.part(cone(0.085 * s, 0.07 * s, (kn - hj).length * 0.7, tuple(hj.lerp(kn, 0.55) + V((0, 0.02, 0))), seg=12), 'thigh' + S, steel, 0x666c78)
        r.part(sphere(0.065 * s, tuple(kn + V((0, 0.025, 0))), scale=(1, 0.9, 1.15), seg=12), 'shin' + S, steel, STEEL)
        r.part(cone(0.056 * s, 0.066 * s, (an - kn).length * 0.82, tuple((kn + an) / 2), seg=12), 'shin' + S, steel, STEEL)
        r.part(sphere(0.06 * s, tuple(J(r, 'foot' + S) + V((0, -0.05, 0.02))), scale=(0.9, 1.9, 0.75), seg=12), 'foot' + S, steel, 0x666c78)
        for k in range(3):   # 草摺
            a = sx * (0.5 + k * 0.55)
            r.part(box((0.13 * s, 0.018, 0.24 * s), (math.sin(a) * 0.19 * s, math.cos(a) * 0.14 * s, hp.z - 0.13 * s), rot=(0.12 * math.cos(a), 0, -a)), 'pelvis' + S, steel, 0x5c626e, smooth=False)
    # 破れたマント
    for i in range(9):
        x = (i - 4) * 0.055 * s
        L = (0.75 + 0.2 * ((i * 7) % 4) / 3) * s
        r.part(box((0.06 * s, 0.012, L), (x, ch.y - 0.15 * s - abs(x) * 0.15, ch.z + 0.08 * s - L / 2), rot=(0.1, 0, 0)), 'chest', cloth, CLOTH, smooth=False)
    # 盾: 主を庇った時の大きな裂け目
    hl = J(r, 'farm_L')
    r.part(sphere(0.33 * s, (hl.x - 0.09, hl.y + 0.08, hl.z + 0.02), scale=(0.16, 0.78, 1.12), seg=18, rings=12), 'farm_L', steel, 0x3c4048)
    r.part(sphere(0.07 * s, (hl.x - 0.14, hl.y + 0.08, hl.z + 0.05), scale=(0.6, 1, 1), seg=12), 'farm_L', gold, 0x9a7a38)
    r.part(box((0.03, 0.035, 0.42 * s), (hl.x - 0.13, hl.y + 0.2 * s, hl.z + 0.12 * s), rot=(0.5, 0, 0)), 'farm_L', 0, 0x050506, smooth=False)
    h = J(r, 'hand_R')
    blade(r, 'hand_R', steel, (h.x, h.y + 0.02, h.z - 0.04), 1.0, width=0.062, color=0xa8b0bc, guard=0.26, gcol=0x8a6a30)
    humanoid_anims(r, stride=0.45, armswing=0.2, attack='thrust', heavy=True)
    r.tris = 9000
    r.tex = 1024
    return r


# ---------------- 炎小鬼: 言い損ないの火 ----------------
def imp():
    r = Rig('imp')
    humanoid(r, H=1.05, rad=0.95, w=0.9, head=1.35, arm=1.1, muscle=0.8, fingers=False)
    r.bump = 0.004
    r.surface = 'stone'       # ひび割れた燃えさしの肌
    r.detail = 0.45
    r.scale = 0.62
    r.mat('skin', rough=0.7)
    eye = r.mat('eye', 0xffd040, emit=8)
    horn = r.mat('horn', rough=0.5)
    memb = r.mat('membrane', rough=0.8)
    ember = r.mat('core', 0xff5a14, emit=4)
    s = 1.05 / 1.8
    flesh(r, s=s, w=0.9, m=0.9, claws=0.8)
    hc, eyes = head(r, s=s, hs=1.45, jaw=1.2, brow=1.4, nose=0.6, ears=2.6, snout=0.1, eye_dx=0.034)
    q = s * 1.45
    dent(r, hc + V((0, 0.09, -0.066)) * 1 + V((0, 0, 0)), V((0.062, 0.03, 0.012)) * q, 0.016 * q)     # 耳まで裂けた口
    hips = J(r, 'hips')
    r.j('tail1', (0, -0.15, hips.z - 0.02), 0.03, 'hips')
    r.j('tail2', (0, -0.32, hips.z - 0.12), 0.022, 'tail1')
    r.j('tail3', (0, -0.48, hips.z - 0.05), 0.015, 'tail2')
    r.j('tail4', (0, -0.58, hips.z + 0.08), 0.01, 'tail3')
    for sx in (-1, 1):       # 炭の角
        b = hc + V((sx * 0.05, -0.01, 0.07)) * q
        clay(r, chain([b, b + V((sx * 0.035, -0.03, 0.06)) * q, b + V((sx * 0.03, -0.01, 0.12)) * q], [0.02 * q, 0.014 * q, 0.003 * q], 10))

    def col(p, near, n):
        base = mix((0.2, 0.05, 0.035), (0.07, 0.03, 0.025), max(0, -n) * 1.6)     # 炭の黒赤
        hot = max(0.0, n - 0.12) * 2.6                                              # 割れ目の奥の火色
        c = mix(base, (1.0, 0.36, 0.08), min(1, hot))
        if p.z > hc.z + 0.07 * q:
            c = mix(c, (0.03, 0.025, 0.025), 0.85)                                  # 角は炭
        if p.y > 0.03 and 0.36 < p.z < 0.6:
            c = mix(c, (0.9, 0.42, 0.12), 0.3)                                      # 腹の内側が透ける
        return c
    r.color_fn = col
    eyeballs(r, eyes, 0.009 * q, eye, 0xffd040)
    for k in range(9):       # 笑った口の歯
        x = (k - 4) * 0.012 * q
        r.part(cone(0.004 * q, 0.0, 0.016 * q, (x, hc.y + (0.112 - abs(x) * 0.6) * q, hc.z - 0.06 * q), rot=(math.pi, 0, 0), seg=4), 'head', horn, 0xe8dcc0)
    t4 = J(r, 'tail4')
    r.part(sphere(0.03, (t4.x, t4.y - 0.01, t4.z + 0.02), seg=10, rings=8, scale=(0.8, 0.8, 1.3)), 'tail4', ember, 0xff5a14)   # 尾の種火
    c = J(r, 'chest')
    for S, sx in (('_L', -1), ('_R', 1)):
        pts = [(sx * 0.05, c.y - 0.06, c.z), (sx * 0.2, c.y - 0.12, c.z + 0.25), (sx * 0.42, c.y - 0.2, c.z + 0.2),
               (sx * 0.45, c.y - 0.18, c.z - 0.05), (sx * 0.33, c.y - 0.12, c.z - 0.15), (sx * 0.08, c.y - 0.06, c.z - 0.15)]
        r.membranes.append((pts, memb, ['chest'], 0x24100c))
        for tip in pts[2:5]:   # 翼の骨
            r.part(cone(0.008, 0.002, (V(tip) - V(pts[1])).length, tuple((V(tip) + V(pts[1])) / 2), rot=tuple(V((0, 0, 1)).rotation_difference((V(tip) - V(pts[1])).normalized()).to_euler()), seg=5), 'chest', horn, 0x140c0a)
        r.part(cone(0.014, 0.008, (V(pts[1]) - V(pts[0])).length, tuple((V(pts[0]) + V(pts[1])) / 2), rot=tuple(V((0, 0, 1)).rotation_difference((V(pts[1]) - V(pts[0])).normalized()).to_euler()), seg=6), 'chest', horn, 0x140c0a)
    humanoid_anims(r, stride=0.6, armswing=0.5, attack='cast')
    w = r.anims['walk'][2]
    r.anims['walk'] = (24, True, lambda t: {**w(t), 'tail1': qz(0.3 * math.sin(t * TAU)), 'tail2': qz(0.4 * math.sin(t * TAU - 1)), 'tail3': qz(0.5 * math.sin(t * TAU - 2))})
    r.tris = 8000
    r.voxel = 0.004
    return r


import bmesh
from mathutils import Matrix, Euler


def frust(a, b, r1, r2, seg=20):
    """両端が平らな円錐台(衣の裾など)"""
    a, b = V(a), V(b)
    def f(bm):
        d = b - a
        m = Matrix.Translation((a + b) * 0.5) @ V((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        return bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=d.length, matrix=m)['verts']
    return f


def boxc(c, size, rot=(0, 0, 0)):
    """粘土に溶かし込む角ばった塊"""
    def f(bm):
        m = Matrix.Translation(V(c)) @ Euler(rot, 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1))
        return bmesh.ops.create_cube(bm, size=1.0, matrix=m)['verts']
    return f


# ---------------- 衣をまとう者: 写本師・屍術師・怨霊 ----------------
def robed(name, H, ROBE, TRIM, eyec, skeletal=False, attack='cast'):
    r = Rig(name)
    humanoid(r, H=H, rad=0.55 if skeletal else 0.8, w=0.95, hunch=0.25, muscle=0 if skeletal else 0.4, fingers=False)
    r.bump = 0.004
    r.surface = 'bone' if skeletal else 'skin'
    r.mat('body', rough=0.7)
    eye = r.mat('eye', eyec, emit=7)
    r.mat('robe', rough=0.95)
    gold = r.mat('gold', rough=0.42, metal=0.8)
    s = H / 1.8
    flesh(r, s=s, w=0.9, m=0.3, gaunt=1.0 if skeletal else 0.4, claws=0.5 if skeletal else 0.0, legs=False)
    hc, eyes = head(r, s=s, hs=1.0, jaw=1.05, brow=1.2, nose=0 if skeletal else 1.0, gaunt=1.0 if skeletal else 0.5, ears=0)
    hips, ch = J(r, 'hips'), J(r, 'chest')
    R0 = 0.46 * s
    # 衣: 裾・胴・肩掛け・袖・頭巾を粘土で一体に作る
    clay(r, frust((0, -0.02, 0.02), (0, -0.01, hips.z + 0.06), R0, 0.2 * s, 28))
    clay(r, frust((0, hips.y, hips.z), (0, ch.y, ch.z + 0.05 * s), 0.215 * s, 0.2 * s, 24))
    clay(r, ell(ch + V((0, -0.01, 0.045)) * s, V((0.27, 0.15, 0.085)) * s))
    for S, sx in (('_L', -1), ('_R', 1)):
        sh, el, wr = J(r, 'clav' + S), J(r, 'uarm' + S), J(r, 'farm' + S)
        clay(r, frust(sh, el, 0.075 * s, 0.07 * s, 16))
        clay(r, frust(el, el.lerp(wr, 0.92), 0.068 * s, 0.115 * s, 18))
        clay(r, ell(el, 0.072 * s))
    clay(r, ell(hc + V((0, -0.05, 0.022)) * s, V((0.102, 0.108, 0.124)) * s))
    clay(r, cap(hc + V((0, -0.1, 0.06)) * s, hc + V((0, -0.2, -0.06)) * s, 0.06 * s, 0.012 * s))        # 頭巾の垂れ
    for i in range(14):      # 裾の縦ひだ
        a = i / 14 * TAU + 0.2
        for z, k in ((0.25, 0.9), (0.55, 0.72)):
            dent(r, (math.cos(a) * R0 * k, math.sin(a) * R0 * k - 0.02, z * s), V((0.04, 0.04, 0.3)) * s, 0.022 * s)

    def is_robe(p, nb):
        if min(R.seg_dist(p, J(r, 'farm' + S), J(r, 'hand' + S) + (J(r, 'hand' + S) - J(r, 'farm' + S)) * 0.9) for S in ('_L', '_R')) < 0.05 * s and min((p - J(r, 'farm' + S)).length for S in ('_L', '_R')) > 0.03 * s:
            return 0.0                                                                       # 袖口から出た手
        if p.y > hc.y + 0.052 * s and abs(p.x) < 0.075 * s and hc.z - 0.125 * s < p.z < hc.z + 0.075 * s:
            return 0.0
        return 1.0
    r._hc, r._eyes, r._s, r._eye, r._gold, r._R0 = hc, eyes, s, eye, gold, R0
    r._is_robe = is_robe
    r._robe_base = lambda p, n: mix(mix(hexc(ROBE), (0.015, 0.015, 0.015), max(0, -n) * 1.3), hexc(TRIM), 0.85 if (p.z < 0.07 * s or (abs(p.x) < 0.022 * s and p.y > 0 and p.z < ch.z)) else 0)
    SK = 0xcabf9f if skeletal else 0x8f8272
    r.color_fn = lambda p, near, n: mix(hexc(SK), (0.2, 0.17, 0.14), max(0, -n) * 1.5)
    r.part(ring(R0 * 1.0, 0.016, (0, -0.02, 0.03), seg=28), 'hips', gold, TRIM)
    float_anims(r, attack=attack)
    r.tris = 10000
    r.voxel = 0.0075 * s
    return r


# 堕ちた写本師: 目をインクで塗り潰し、聞いた詠唱を書き写して唱え返す
def scribe():
    r = robed('scribe', 1.75, 0x2a2038, 0x8a6c3a, 0xff4a8a)
    hc, s = r._hc, r._s
    region(r, 'cloth', r._is_robe, lambda p, n: mix(r._robe_base(p, n), (0.02, 0.02, 0.03), 0.8 if (p.z < 0.42 * s and math.sin(p.z * 190) > 0.2 and math.sin((math.atan2(p.y, p.x)) * 46 + p.z * 31) > -0.15) else 0), 0.95)
    base = r.color_fn

    def col(p, near, n):
        c = base(p, near, n)
        for sx in (-1, 1):   # 目から流れたインクの跡
            if abs(p.x - sx * 0.031 * s) < 0.016 * s and hc.z - 0.1 * s < p.z < hc.z + 0.022 * s and p.y > hc.y + 0.05 * s:
                c = mix(c, (0.01, 0.01, 0.015), 0.92)
        if near and near.startswith('hand'):
            c = mix(c, (0.02, 0.02, 0.03), 0.8)                                  # ペン先のように黒い指
        return c
    r.color_fn = col
    eyeballs(r, r._eyes, 0.0055 * s, r._eye, 0xff4a8a)
    robe = 2
    ch, hips = J(r, 'chest'), J(r, 'hips')
    for k in range(3):       # 背の巻物の束
        r.part(cone(0.034, 0.034, 0.5, (0.02 * (k - 1), ch.y - 0.19 - 0.02 * (k % 2), ch.z - 0.02 - k * 0.07), rot=(0, math.pi / 2, 0.15 * (k - 1)), seg=12), 'chest', robe, 0xc8b88a)
        for sx in (-1, 1):
            r.part(cone(0.04, 0.04, 0.02, (0.02 * (k - 1) + sx * 0.25, ch.y - 0.19 - 0.02 * (k % 2) + sx * 0.035 * (k - 1), ch.z - 0.02 - k * 0.07), rot=(0, math.pi / 2, 0), seg=12), 'chest', r._gold, 0x6a4a2a)
    r.part(box((0.6, 0.02, 0.03), (0, ch.y - 0.15, ch.z + 0.04), rot=(0, 0, 0)), 'chest', robe, 0x2a1a10, smooth=False)   # 束ねる革帯
    # 鎖でつないだ写本と、手に持つ開いた本
    r.part(box((0.05, 0.2, 0.26), (-0.27 * s, 0.04, hips.z - 0.2), rot=(0, 0.15, 0)), 'hips', robe, 0x3a1c12, smooth=False)
    r.part(box((0.056, 0.17, 0.23), (-0.27 * s, 0.04, hips.z - 0.2), rot=(0, 0.15, 0)), 'hips', robe, 0xcabf9a, smooth=False)
    for k in range(6):
        r.part(sphere(0.011, (-0.24 * s + k * 0.004, 0.04, hips.z - 0.05 + k * 0.012 - 0.03), seg=6, rings=5, scale=(0.7, 1, 1.5)), 'hips', r._gold, 0x4a4038)
    hl = J(r, 'hand_L')
    for sx in (-1, 1):
        r.part(box((0.13, 0.014, 0.2), (hl.x + sx * 0.066, hl.y + 0.12, hl.z + 0.03), rot=(0.5, sx * -0.18, 0)), 'hand_L', robe, 0xcfc4a0, smooth=False)
    r.part(box((0.275, 0.012, 0.215), (hl.x, hl.y + 0.112, hl.z + 0.022), rot=(0.5, 0, 0)), 'hand_L', robe, 0x4a2014, smooth=False)
    return r


# 屍術師: 真の名を錠で封じて死を免れた高位魔導師
def lich():
    r = robed('lich', 2.05, 0x14201a, 0x8a7434, 0x60ff9a, skeletal=True)
    hc, s = r._hc, r._s
    region(r, 'cloth', r._is_robe, r._robe_base, 0.95)
    eyeballs(r, r._eyes, 0.008 * s, r._eye, 0x60ff9a)
    gold = r._gold
    ch = J(r, 'chest')
    r.part(ring(0.092 * s, 0.014, tuple(hc + V((0, -0.01, 0.075)) * 1), seg=20, scale=(1, 1.12, 1)), 'head', gold, 0x9a8238)     # 位階の冠
    for i in range(8):
        a = i / 8 * TAU
        r.part(cone(0.014 * s, 0.0, (0.1 if i % 2 == 0 else 0.06) * s, (math.cos(a) * 0.092 * s, hc.y - 0.01 + math.sin(a) * 0.103 * s, hc.z + 0.075 + (0.05 if i % 2 == 0 else 0.03) * s), seg=5), 'head', gold, 0x9a8238)
    # 顎から胸に下がる封印の錠と鎖
    for k in range(7):
        r.part(sphere(0.011 * s, (0, hc.y + 0.085 * s - k * 0.003, hc.z - 0.105 * s - k * 0.024 * s), seg=6, rings=5, scale=(1.3 if k % 2 else 0.7, 0.7 if k % 2 else 1.3, 1.5)), 'head' if k < 3 else 'chest', gold, 0x55504a)
    lz = hc.z - 0.105 * s - 7 * 0.024 * s - 0.035 * s
    r.part(box((0.085 * s, 0.035 * s, 0.075 * s), (0, hc.y + 0.065 * s, lz)), 'chest', gold, 0x6a6258, smooth=False)
    r.part(ring(0.026 * s, 0.008 * s, (0, hc.y + 0.065 * s, lz + 0.045 * s), rot=(math.pi / 2, 0, 0), seg=12, arc=0.55), 'chest', gold, 0x55504a)
    r.part(sphere(0.011 * s, (0, hc.y + 0.085 * s, lz), seg=8, rings=6), 'chest', r._eye, 0x60ff9a)      # 鍵穴に灯る名
    for S, sx in (('_L', -1), ('_R', 1)):     # 高い襟
        r.part(cone(0.07 * s, 0.01, 0.2 * s, (sx * 0.085 * s, ch.y - 0.045, ch.z + 0.2 * s), rot=(-0.25, sx * 0.3, 0), seg=6), 'chest', 2, 0x101a14)
    h = J(r, 'hand_R')
    r.part(cone(0.017, 0.024, 1.95, (h.x, h.y + 0.02, h.z + 0.35), seg=8), 'hand_R', 2, 0x241c14)
    for k in range(4):
        a = k / 4 * TAU
        r.part(cone(0.012, 0.002, 0.16, (h.x + math.cos(a) * 0.045, h.y + 0.02 + math.sin(a) * 0.045, h.z + 1.37), rot=(math.sin(a) * 0.5, -math.cos(a) * 0.5, 0), seg=5), 'hand_R', gold, 0x55504a)
    r.part(sphere(0.06, (h.x, h.y + 0.02, h.z + 1.42), seg=14, rings=10, scale=(0.8, 0.8, 1.25)), 'hand_R', r._eye, 0x60ff9a)
    return r


# 怨霊: 詠唱の途中で息絶えた者の、言い残した言葉
def wraith():
    r = robed('wraith', 2.0, 0x1a1024, 0x2c1840, 0xb565ff, skeletal=True, attack='claw')
    hc, s = r._hc, r._s
    dent(r, hc + V((0, 0.095, -0.085)) * s, V((0.024, 0.035, 0.055)) * s, 0.035 * s)          # 閉じられない口
    region(r, 'cloth', r._is_robe, lambda p, n: mix(r._robe_base(p, n), (0.32, 0.26, 0.42), sm(0.45 * s - p.z, 0.0, 0.45 * s) * 0.7), 0.95)
    base = r.color_fn
    r.color_fn = lambda p, near, n: mix(base(p, near, n), (0.0, 0.0, 0.0), 0.95 if (abs(p.x) < 0.024 * s and hc.z - 0.14 * s < p.z < hc.z - 0.045 * s and p.y > hc.y + 0.06 * s) else 0)
    eyeballs(r, r._eyes, 0.0075 * s, r._eye, 0xb565ff)
    R0 = r._R0
    for i in range(18):      # 裾は布から煙へほどける
        a = i / 18 * TAU
        L = 0.3 + 0.22 * ((i * 7) % 4) / 3
        r.part(cone(0.075, 0.0, L, (math.cos(a) * R0 * 0.9, math.sin(a) * R0 * 0.9 - 0.02, 0.02 - L / 2), rot=(math.pi + 0.12 * math.sin(a), 0.12 * math.cos(a), 0), seg=4), 'hips', 2, 0x3a3050)
    return r


# ---------------- 石像兵: 刻印の番人 ----------------
def golem():
    r = Rig('golem')
    humanoid(r, H=2.5, rad=1.5, w=1.45, belly=1.1, arm=1.2, head=0.7, neck=0.5, muscle=0.0, fingers=False)
    r.bump = 0.02
    r.bump_freq = 3.2
    r.surface = 'stone'
    r.scale = 1.5
    r.clay_smooth = 5
    STONE = 0x6f6a61
    r.mat('stone', rough=0.96)
    eye = r.mat('eye', 0xff9a2a, emit=7)
    marble = r.mat('marble', rough=0.8)
    s = 2.5 / 1.8
    ch, hp, nk = J(r, 'chest'), J(r, 'hips'), J(r, 'neck')
    clay(r, boxc(ch + V((0, 0, -0.08)) * s, (0.5 * s, 0.34 * s, 0.42 * s), (0.05, 0, 0.03)))
    clay(r, boxc(hp.lerp(ch, 0.38), (0.36 * s, 0.26 * s, 0.24 * s), (0, 0.04, -0.05)))
    clay(r, boxc(hp + V((0, 0, -0.03)) * s, (0.42 * s, 0.28 * s, 0.2 * s), (0, 0, 0.04)))
    hcz = nk + V((0, 0.03, 0.09)) * s
    clay(r, boxc(hcz, (0.2 * s, 0.2 * s, 0.19 * s), (0.1, 0.05, 0.02)))
    clay(r, boxc(hcz + V((0, 0.06, 0.035)) * s, (0.22 * s, 0.1 * s, 0.045 * s), (0.2, 0, 0)))      # 庇のような眉
    joints = []
    for S, sx in (('_L', -1), ('_R', 1)):
        big = 1.35 if sx > 0 else 1.0        # 右腕は瓦礫で継ぎ足した腕(大きい)
        sh, el, wr, hd = J(r, 'clav' + S), J(r, 'uarm' + S), J(r, 'farm' + S), J(r, 'hand' + S)
        clay(r, boxc(sh + V((sx * 0.05, 0, 0.04)) * s, (0.24 * s * big, 0.24 * s, 0.2 * s), (0.2, sx * 0.3, 0.1)))
        clay(r, boxc(sh.lerp(el, 0.55), (0.13 * s * big, 0.14 * s * big, (el - sh).length * 0.75), (0.05 * sx, 0.1, 0.2)))
        clay(r, boxc(el.lerp(wr, 0.5), (0.15 * s * big, 0.16 * s * big, (wr - el).length * 0.85), (0, 0.15 * sx, 0.3)))
        clay(r, boxc(hd + V((0, 0.01, -0.03)) * s, (0.17 * s * big, 0.17 * s * big, 0.17 * s * big), (0.3, 0.2, 0.1)))
        if sx > 0:
            for k in range(5):
                clay(r, boxc(el.lerp(wr, k / 5) + V((0.06 * math.sin(k * 2.1), 0.06 * math.cos(k * 2.6), 0)) * s, (0.1 * s, 0.09 * s, 0.11 * s), (k * 0.7, k * 1.3, k * 0.4)))
        hj, kn, an, toe = J(r, 'pelvis' + S), J(r, 'thigh' + S), J(r, 'shin' + S), J(r, 'foot' + S)
        clay(r, boxc(hj.lerp(kn, 0.5), (0.17 * s, 0.18 * s, (kn - hj).length * 0.8), (0, 0, 0.1 * sx)))
        clay(r, boxc(kn.lerp(an, 0.5), (0.19 * s, 0.2 * s, (an - kn).length * 0.85), (0, 0, -0.1 * sx)))
        clay(r, boxc(V((an.x, an.y + 0.07 * s, 0.06 * s)), (0.2 * s, 0.32 * s, 0.11 * s)))
        joints += [sh, el, kn, hj]
    joints += [nk, hp.lerp(ch, 0.6)]

    def col(p, near, n):
        c = mix(hexc(STONE), (0.17, 0.16, 0.14), max(0, -n) * 1.7)
        c = mix(c, (0.6, 0.57, 0.5), max(0, n - 0.3) * 1.2)
        moss = max(sm(0.2 * s - (p - j).length, 0.0, 0.14 * s) for j in joints)        # 継ぎ目の苔
        c = mix(c, (0.2, 0.3, 0.13), moss * (0.5 + 0.5 * max(0, n + 0.3)))
        if p.x > 0.33 * s and p.z < ch.z:
            c = mix(c, (0.36, 0.3, 0.25), 0.55)                                         # 継ぎ足した腕は色の違う瓦礫
        return c
    r.color_fn = col
    for sx in (-1, 1):
        r.part(box((0.045 * s, 0.02, 0.018 * s), tuple(hcz + V((sx * 0.05, 0.1, 0.0)) * s)), 'head', eye, 0xff9a2a, smooth=False)
    # 胸の刻印「護」: 光る溝
    cy = ch.y + 0.172 * s
    cz = ch.z - 0.07 * s
    strokes = [((0, 0.075), (0.15, 0.014)), ((0, 0.03), (0.11, 0.012)), ((0, -0.015), (0.13, 0.012)), ((0, -0.065), (0.15, 0.014)),
               ((-0.05, 0.005), (0.013, 0.13)), ((0.05, 0.005), (0.013, 0.13)), ((0, 0.01), (0.012, 0.16)), ((-0.03, -0.085), (0.012, 0.045)), ((0.03, -0.085), (0.012, 0.045))]
    for (x, z), (w, h) in strokes:
        r.part(box((w * s, 0.012, h * s), (x * s, cy, cz + z * s)), 'chest', eye, 0xff9a2a, smooth=False)
    # 左肩に残る、書庫の柱の飾り
    cl = J(r, 'clav_L')
    r.part(cone(0.1 * s, 0.13 * s, 0.09 * s, (cl.x - 0.05 * s, cl.y, cl.z + 0.2 * s), seg=14), 'clav_L', marble, 0xa8a294)
    r.part(box((0.3 * s, 0.3 * s, 0.045 * s), (cl.x - 0.05 * s, cl.y, cl.z + 0.265 * s), rot=(0, 0, 0.3)), 'clav_L', marble, 0xa8a294, smooth=False)
    for k in range(4):
        a = k / 4 * TAU + 0.3
        r.part(sphere(0.04 * s, (cl.x - 0.05 * s + math.cos(a) * 0.12 * s, cl.y + math.sin(a) * 0.12 * s, cl.z + 0.225 * s), seg=10, rings=8, scale=(1, 1, 0.8)), 'clav_L', marble, 0x9a9486)
    humanoid_anims(r, stride=0.32, armswing=0.25, attack='slam', heavy=True, speed_bob=0.05)
    r.tris = 11000
    r.voxel = 0.011
    return r


# ---------------- 粘獣: 写本室の澱 ----------------
def slime():
    r = B.slime()
    r.surface = 'slime'
    r.bump = 0.012
    r.voxel = 0.012
    r.clay_smooth = 20
    bone = r.mat('bone', rough=0.7)
    paper = r.mat('cloth', rough=0.9)
    for k, (x, y, z) in enumerate(((0.35, 0.3, 0.05), (-0.3, 0.38, 0.04), (-0.48, -0.2, 0.04), (0.25, -0.45, 0.04), (0.55, 0.0, 0.03))):
        clay(r, ell((x, y, z), (0.14, 0.14, 0.05)))                                      # 床に広がる溜まり
    base = r.color_fn
    r.color_fn = lambda p, near, n: mix(base(p, near, n), (0.015, 0.02, 0.03), 0.85 if math.sin(p.x * 9 + math.sin(p.z * 7) * 2.2 + p.y * 3) > 0.86 else (0.3 if n < -0.25 else 0))   # 流れるインクの筋
    # 溶け残ったもの: 頭蓋骨・頁・羽根ペン
    r.part(sphere(0.085, (0.12, -0.05, 0.36), seg=14, rings=10, scale=(0.9, 1.1, 1.0)), 'mid', bone, 0xcabf9f)
    r.part(sphere(0.05, (0.12, 0.02, 0.3), seg=10, rings=8, scale=(0.9, 1.0, 0.7)), 'mid', bone, 0xbfb492)
    for sx in (-1, 1):
        r.part(sphere(0.022, (0.12 + sx * 0.032, 0.035, 0.37), seg=8, rings=6), 'mid', bone, 0x0a0a08)
    for k in range(5):
        r.part(box((0.16, 0.002, 0.22), (-0.18 + k * 0.03, 0.1 - k * 0.07, 0.3 + 0.07 * math.sin(k * 2.0)), rot=(0.6 + k * 0.5, k * 0.8, k * 0.4)), 'mid', paper, 0xcfc4a0, smooth=False)
    r.part(cone(0.006, 0.001, 0.3, (-0.05, 0.2, 0.5), rot=(0.9, 0.4, 0), seg=5), 'top', paper, 0xe8e0d0)
    r.part(box((0.05, 0.003, 0.16), (-0.02, 0.26, 0.57), rot=(0.9, 0.4, 0)), 'top', paper, 0xd8d0c0, smooth=False)
    r.tris = 5000
    return r


# ---------------- 洞窟大蜘蛛: 沈黙を紡ぐもの ----------------
def spider():
    r = B.spider()
    r.surface = 'chitin'
    r.voxel = 0.008
    r.scale = 1.2
    silk = r.mat('fur', rough=0.95)
    ab = J(r, 'abdomen')
    th = J(r, 'thorax')
    region(r, 'fur', lambda p, nb: sm((p - ab).length, 0.6, 0.2) * (1.0 if p.y < th.y - 0.12 else 0.0), lambda p, n: (0.13 + 0.07 * n, 0.1 + 0.05 * n, 0.09 + 0.04 * n), 0.95)
    base = r.color_fn

    def col(p, near, n):
        c = base(p, near, n)
        # 腹に浮かぶ、人の口に似た白い模様
        dx, dy = p.x / 0.2, (p.y - (ab.y - 0.1)) / 0.085
        d = dx * dx + dy * dy
        if p.z > ab.z + 0.12 and d < 1:
            c = mix(c, (0.82, 0.8, 0.74), 0.9 if d > 0.42 else 0.0)
            if d <= 0.42:
                c = (0.02, 0.01, 0.01)
        return c
    r.color_fn = col
    for i in range(4):       # 脚の関節に残る古い糸の束
        for S in ('_L', '_R'):
            p = J(r, 'femur%d%s' % (i, S))
            r.part(sphere(0.05, tuple(p), seg=8, rings=6, scale=(1, 1, 0.8)), 'femur%d%s' % (i, S), silk, 0xb8b4a8)
    # 口を塞がれた獲物の繭を引きずっている
    r.part(sphere(0.2, (0.1, ab.y - 0.62, 0.17), seg=14, rings=10, scale=(0.75, 1.5, 0.75)), 'abdomen', silk, 0xc4c0b4)
    r.part(sphere(0.085, (0.1, ab.y - 0.38, 0.2), seg=10, rings=8), 'abdomen', silk, 0xbcb8ac)
    r.part(cone(0.012, 0.03, 0.3, (0.07, ab.y - 0.25, 0.3), rot=(1.2, 0, 0.1), seg=5), 'abdomen', silk, 0xd0ccc0)
    r.tris = 9000
    return r


# ---------------- 吸血大蝙蝠: 声盗み ----------------
def bat():
    r = B.bat()
    r.surface = 'fur'
    r.scale = 0.5
    r.voxel = 0.0035
    r.clay_smooth = 14
    h = J(r, 'headb')
    for sx in (-1, 1):       # 顔の半分を占める耳
        b = h + V((sx * 0.04, -0.01, 0.04))
        clay(r, chain([b, b + V((sx * 0.05, -0.01, 0.1)), b + V((sx * 0.06, -0.02, 0.2))], [0.03, 0.036, 0.004], 10))
        dent(r, b + V((sx * 0.05, 0.03, 0.1)), (0.022, 0.03, 0.07), 0.02)
    clay(r, ell(h + V((0, 0.075, -0.005)), (0.03, 0.02, 0.034)))                 # 葉のように広がった鼻
    clay(r, ell(h + V((0, 0.085, 0.02)), (0.018, 0.008, 0.03)))
    clay(r, ell(h + V((0, 0.025, -0.065)), (0.05, 0.055, 0.045)))               # 盗んだ声を溜める喉袋
    base = r.color_fn

    def col(p, near, n):
        c = base(p, near, n)
        if p.z < -0.02 and p.y > -0.05 and abs(p.x) < 0.09:
            c = mix(c, (0.72, 0.68, 0.62), 0.75)                                   # 胸の白い毛
        if (p - (h + V((0, 0.025, -0.065)))).length < 0.058:
            c = mix(c, (0.5, 0.22, 0.24), 0.8)                                     # 喉袋は薄い皮
        if p.z > h.z + 0.07:
            c = mix(c, (0.34, 0.2, 0.2), 0.6)
        return c
    r.color_fn = col
    r.tris = 5000
    r.tex = 512
    return r


# ---------------- 魔導師(仲間のプレイヤー): 声で術を編む、生きた人間 ----------------
# 迷宮で唯一「声を持つ」者。だから口元だけは頭巾から出ている(詠唱のため)。
# 左手に開いた魔導書、右手に結晶の杖。衣は持ち主の色に染まる(材質 tint)。
def mage():
    """灯し子: 歩く溶けかけの蝋燭。愛らしくはないが、どこか気になる何か。寸胴の蝋の体に、とぼけた丸い目が二つ。口は無い。
    頭から垂れる色蝋と、芯の先の火が持ち主の色。大きな魔導書を抱えている。他の者から見た魔導師の姿"""
    r = Rig('mage')
    H = 1.3
    humanoid(r, H=H, rad=1.2, w=1.05, leg=0.6, arm=0.62, neck=0.5, muscle=0, fingers=False)
    r.bump = 0.0012
    r.surface = 'skin'
    r.detail = 0.02
    r.mottle = (0.96, 1.04)
    r.mat('skin', rough=0.5)
    r.mat('tint', rough=0.45)
    crystal = r.mat('crystal', 0xffffff, emit=2.5)
    leather = r.mat('leather', rough=0.7)
    gold = r.mat('gold', rough=0.4, metal=0.8)
    paper = r.mat('cloth', rough=0.9)
    wick = r.mat('wick', 0x1a1410, rough=0.9)
    for S, sx in (('_L', -1), ('_R', 1)):                # 腕は体から離して下げる
        for nm, dx, dz in (('uarm', 0.15, 0.0), ('farm', 0.25, 0.04), ('hand', 0.29, 0.06)):
            pj = r.joints[nm + S]['pos']
            pj.x += sx * dx
            pj.z += dz
    hips, ch, nk = J(r, 'hips'), J(r, 'chest'), J(r, 'neck')
    Z0, Z1 = hips.z - 0.14, nk.z + 0.26                  # 蝋の胴の下端と上端
    RB, RT = 0.27, 0.245
    hc = V((0, 0, Z1 - 0.17))                             # 目のある高さ
    # --- 蝋の胴: 寸胴の柱。少し傾き、上の縁は溶けて盛り上がっている ---
    clay(r, frust((0, 0, Z0), (0.015, 0, Z1), RB, RT, 32))
    clay(r, ell((0.015, 0, Z1 - 0.01), V((RT + 0.012, RT + 0.012, 0.13))))                # 丸く溶けた頭
    clay(r, ell((0, 0, Z0 + 0.02), V((RB + 0.012, RB + 0.012, 0.04))))                    # 丸めた下の縁
    DRIPS = [(0.3, 0.2, 0.055), (2.84, 0.26, 0.06), (3.9, 0.16, 0.05), (5.0, 0.22, 0.055)]
    for a, ln, w in DRIPS:                               # 縁から垂れた蝋(角度, 長さ, 太さ)
        x, y = math.cos(a) * (RT + 0.012) + 0.015, math.sin(a) * (RT + 0.012)
        k = 1 + (RB - RT) / RT * ln / (Z1 - Z0)
        clay(r, cap((x, y, Z1 + 0.01), (x * k, y * k, Z1 - ln), w, w * 0.75))
        clay(r, ell((x * k, y * k, Z1 - ln - w * 0.3), w * 1.05))                           # 垂れた先の玉
    for S, sx in (('_L', -1), ('_R', 1)):
        sh, el, wr, hd = J(r, 'clav' + S), J(r, 'uarm' + S), J(r, 'farm' + S), J(r, 'hand' + S)
        clay(r, frust(sh, el, 0.04, 0.034, 14))                                          # 細い腕
        clay(r, frust(el, wr, 0.034, 0.03, 14))
        clay(r, ell(el, 0.036))
        clay(r, ell(hd + V((0, 0.01, -0.01)), V((0.05, 0.054, 0.054))))                  # 指の無い手
        th, shn = J(r, 'thigh' + S), J(r, 'shin' + S)
        clay(r, cap(J(r, 'pelvis' + S), th, 0.058, 0.05))
        clay(r, cap(th, shn, 0.05, 0.044))
        clay(r, ell(V((shn.x, 0.04, 0.05)), V((0.068, 0.11, 0.05))))                     # 平たい足
    # 目: 蝋に指で突いたような二つの穴。大きさも高さも揃っていない
    EYES = [(-0.078, 0.0, 0.026, (0, 0)), (0.078, 0.0, 0.026, (0, 0))]

    def drip_d(p):
        best = 9.0
        for a, ln, w in DRIPS:
            x, y = math.cos(a) * (RT + 0.012) + 0.015, math.sin(a) * (RT + 0.012)
            k = 1 + (RB - RT) / RT * ln / (Z1 - Z0)
            best = min(best, R.seg_dist(p, V((x, y, Z1 + 0.01)), V((x * k, y * k, Z1 - ln - w * 0.3))) - w * 1.05)
        return best

    def is_tint(p, nb=None):
        return 1.0 if (p.z > Z1 + 0.015 or (p.z > Z0 + 0.2 and drip_d(p) < 0.004)) else 0.0      # 頭に流した色蝋と、その垂れ
    region(r, 'cloth', is_tint, lambda p, n: tuple(0.78 + 0.14 * n for _ in range(3)), 0.45)
    r.slot_fn = lambda p, nb: 'tint' if is_tint(p) > 0.5 else None

    def col(p, near, n):
        c = mix((0.9, 0.86, 0.76), (0.62, 0.56, 0.47), max(0, -n) * 0.8)                  # 古びた蝋の色
        if p.z < Z0 + 0.12:
            c = mix(c, (0.3, 0.26, 0.22), sm(Z0 + 0.12 - p.z, 0, 0.12) * 0.7)             # 足元は煤けている
        if p.z < Z0 - 0.03 or (abs(p.x) > RB + 0.06 and p.z < Z1 - 0.1):
            c = mix((0.5, 0.46, 0.4), (0.2, 0.17, 0.14), max(0, -n))                      # 手足は少し暗い蝋
        return c
    r.color_fn = col
    eye = r.mat('eye', 0xffffff, rough=0.5, emit=0.3)
    pupil = r.mat('pupil', 0x0a0806, rough=0.3)
    for ex, ez, rad, look in EYES:
        ey = math.sqrt(max(0.0, (RT + 0.014) ** 2 - ex ** 2))
        r.part(sphere(rad, (ex, ey, hc.z + ez), seg=16, rings=10, scale=(1, 0.55, 1.12)), 'head', pupil, 0x0a0806)
        r.part(sphere(rad * 0.28, (ex - 0.008, ey + rad * 0.5, hc.z + ez + 0.01), seg=8, rings=6, scale=(1, 0.5, 1)), 'head', eye, 0xffffff)   # 小さな光
    # 芯と、その先の火(持ち主の色。詠唱すると強く光る)
    wz = Z1 + 0.06
    r.part(cone(0.012, 0.009, 0.12, (0.03, -0.01, wz + 0.05), rot=(0.12, 0.1, 0), seg=6), 'head', wick, 0x1a1410)
    r.part(sphere(0.05, (0.036, -0.016, wz + 0.17), seg=8, rings=6, scale=(0.75, 0.75, 1.5)), 'head', crystal, 0xffffff)
    # 大きな魔導書を、胸の前に開いて抱える(胸の骨に付け、両手を添える)
    TH = -1.0
    bc = V((0, RB + 0.12, ch.z - 0.06))
    off = lambda x, y: bc + V((x, y * math.cos(TH), y * math.sin(TH)))
    for sx in (-1, 1):
        r.part(box((0.2, 0.014, 0.27), tuple(off(sx * 0.102, -0.011)), rot=(TH, 0, 0)), 'chest', paper, 0xe8dcbc, smooth=False)
    r.part(box((0.43, 0.012, 0.29), tuple(bc), rot=(TH, 0, 0)), 'chest', leather, 0x5a1a20, smooth=False)
    r.part(box((0.03, 0.02, 0.29), tuple(off(0, 0.004)), rot=(TH, 0, 0)), 'chest', gold, 0xd0a850, smooth=False)
    humanoid_anims(r, stride=0.55, armswing=0.18, attack='cast', speed_bob=0.05)
    book = {'uarm_L': qx(0.5) @ qy(-0.1), 'farm_L': qx(1.05), 'uarm_R': qx(0.5) @ qy(0.1), 'farm_R': qx(1.05)}        # 本を胸の前に、両手で開いて持つ
    for nm in ('walk', 'idle'):
        frames, loop, fn = r.anims[nm]
        r.anims[nm] = (frames, loop, (lambda f: (lambda t: {**f(t), **book}))(fn))
    w0 = r.anims['idle'][2]
    r.anims['idle'] = (48, True, lambda t: {**w0(t), 'head': qz(0.1 * math.sin(t * TAU)), 'chest': qz(0.04 * math.sin(t * TAU + 0.6))})   # ゆっくり左右に傾く
    r.anims['chant'] = (36, True, lambda t: {**book, 'uarm_L': qx(0.75) @ qy(-0.1), 'farm_L': qx(1.2), 'uarm_R': qx(0.75) @ qy(0.1), 'farm_R': qx(1.2),
                                              'head': qx(-0.1 + 0.05 * math.sin(t * TAU * 2)), 'chest': qx(0.04 * math.sin(t * TAU)), '_loc': V((0, 0, 0.015 * math.sin(t * TAU)))})
    r.tris = 9000
    r.voxel = 0.006
    return r


BUILDERS = {'mage': mage, 'skeleton': skeleton, 'ghoul': ghoul, 'ogre': ogre, 'knight': knight, 'imp': imp, 'scribe': scribe,
            'lich': lich, 'wraith': wraith, 'golem': golem, 'slime': slime, 'spider': spider, 'bat': bat}


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
