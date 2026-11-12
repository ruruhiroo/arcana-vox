# 魔物のモデルを作って public/models/*.glb に書き出す
#   "C:/Program Files/Blender Foundation/Blender 4.3/blender.exe" -b --factory-startup -P tools/blender/build_models.py -- public/models [種類...]
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
import importlib, rig as R
importlib.reload(R)
from rig import Rig, sphere, box, cone, ring, build, qx, qy, qz, qa, keys
from mathutils import Vector, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'public/models'
ONLY = set(argv[1:])
os.makedirs(OUT, exist_ok=True)
TAU = math.pi * 2


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def hexc(c):
    return ((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255


def J(r, n):
    return r.joints[n]['pos']


# ---------------- 人型の骨格 ----------------
def humanoid(r, H=1.8, w=1.0, hunch=0.0, arm=1.0, leg=1.0, rad=1.0, belly=1.0, head=1.0, neck=1.0, muscle=1.0, fingers=True):
    s = H / 1.8
    k = rad * s
    hip_z = 0.95 * s * leg
    r.j('hips', (0, 0, hip_z), 0.12 * k * w * belly)
    r.j('spine', (0, -0.03 * s - hunch * 0.12 * s, hip_z + 0.22 * s), 0.13 * k * w * belly, 'hips')
    cz = hip_z + 0.43 * s - hunch * 0.08 * s
    cy = 0.02 * s + hunch * 0.18 * s
    r.j('chest', (0, cy, cz), 0.16 * k * w, 'spine')
    nz = cz + 0.16 * s * neck - hunch * 0.04 * s
    ny = cy + 0.03 * s + hunch * 0.12 * s
    r.j('neck', (0, ny, nz), 0.055 * k * neck, 'chest')
    r.j('head', (0, ny + 0.02 * s + hunch * 0.06 * s, nz + 0.17 * s * head), 0.075 * k * head, 'neck')
    sw = 0.2 * s * w
    al = 0.29 * s * arm
    r.sym('clav', (sw, cy, cz - 0.02 * s), 0.06 * k, 'chest')
    r.sym('uarm', (sw + 0.05 * s, cy + 0.01 * s, cz - 0.02 * s - al), 0.048 * k, 'clav')
    r.sym('farm', (sw + 0.07 * s, cy + 0.05 * s, cz - 0.02 * s - al * 1.95), 0.036 * k, 'uarm')
    r.sym('hand', (sw + 0.075 * s, cy + 0.07 * s, cz - 0.02 * s - al * 1.95 - 0.09 * s * arm), 0.032 * k, 'farm')
    hw = 0.1 * s * w
    r.sym('pelvis', (hw, 0, hip_z - 0.04 * s), 0.085 * k * w, 'hips')
    r.sym('thigh', (hw + 0.01 * s, 0.03 * s, hip_z * 0.53), 0.065 * k, 'pelvis')
    r.sym('shin', (hw + 0.01 * s, -0.02 * s, 0.08 * s), 0.045 * k, 'thigh')
    r.sym('foot', (hw + 0.01 * s, 0.15 * s, 0.03 * s), 0.035 * k, 'shin')
    if muscle > 0:
        m = muscle
        r.mid('spine', 0.5, 0.14 * k * w * belly * (1 + 0.15 * m))
        for S in ('_L', '_R'):
            r.mid('thigh' + S, 0.3, 0.065 * k * (1 + 0.35 * m))
            r.mid('shin' + S, 0.28, 0.045 * k * (1 + 0.35 * m))
            r.mid('uarm' + S, 0.4, 0.048 * k * (1 + 0.28 * m))
            r.mid('farm' + S, 0.25, 0.036 * k * (1 + 0.3 * m))
    if fingers:
        for S, sx in (('_L', -1), ('_R', 1)):
            hp = J(r, 'hand' + S)
            for i in range(4):
                r.tip('fing%d%s' % (i, S), (hp.x + sx * (0.005 + 0.012 * i * s) - sx * 0.02 * s, hp.y + 0.02 * s, hp.z - 0.07 * s * arm), 0.012 * k, 'hand' + S)
            r.tip('thumb' + S, (hp.x - sx * 0.035 * s, hp.y + 0.05 * s, hp.z - 0.03 * s), 0.013 * k, 'hand' + S)


def humanoid_anims(r, stride=0.5, armswing=0.4, attack='overhead', speed_bob=0.03, hunch=0.0, heavy=False):
    def walk(t):
        p = t * TAU
        sL, sR = math.sin(p), math.sin(p + math.pi)
        d = {}
        d['thigh_L'] = qx(stride * sL)
        d['thigh_R'] = qx(stride * sR)
        d['shin_L'] = qx(-0.8 * max(0, math.sin(p + 1.2)))
        d['shin_R'] = qx(-0.8 * max(0, math.sin(p + 1.2 + math.pi)))
        d['foot_L'] = qx(0.2 * math.sin(p - 0.6))
        d['foot_R'] = qx(0.2 * math.sin(p - 0.6 + math.pi))
        d['uarm_L'] = qx(-armswing * sL) @ qy(-0.12)
        d['uarm_R'] = qx(-armswing * sR) @ qy(0.12)
        d['farm_L'] = qx(0.35 + 0.2 * max(0, -sL))
        d['farm_R'] = qx(0.35 + 0.2 * max(0, -sR))
        d['spine'] = qz(0.08 * sL) @ qx(-0.05 - hunch * 0.2)
        d['chest'] = qz(-0.12 * sL)
        d['head'] = qz(0.06 * sL)
        d['_loc'] = Vector((0.03 * sL if heavy else 0, 0, -speed_bob * abs(math.cos(p))))
        return d

    def idle(t):
        p = t * TAU
        return {'chest': qx(0.03 * math.sin(p)), 'head': qz(0.25 * math.sin(p)) @ qx(0.05 * math.sin(p * 2)),
                'uarm_L': qy(-0.1) @ qx(0.05 * math.sin(p)), 'uarm_R': qy(0.1) @ qx(0.05 * math.sin(p + 1)),
                'farm_L': qx(0.3), 'farm_R': qx(0.3), 'spine': qx(-hunch * 0.2),
                '_loc': Vector((0, 0, -0.01 * (1 + math.sin(p * 2))))}

    def atk(t):
        d = {}
        if attack == 'overhead':
            d['uarm_R'] = qx(keys(t, [(0, 0), (0.4, 2.7), (0.58, 0.5), (1, 0)])) @ qy(0.1)
            d['farm_R'] = qx(keys(t, [(0, 0.3), (0.4, 0.9), (0.58, 0.1), (1, 0.3)]))
            d['spine'] = qx(keys(t, [(0, 0), (0.4, 0.2), (0.6, -0.4), (1, 0)]))
            d['chest'] = qz(keys(t, [(0, 0), (0.4, -0.2), (0.6, 0.15), (1, 0)]))
        elif attack == 'claw':
            d['uarm_R'] = qx(keys(t, [(0, 0), (0.35, 2.0), (0.55, 0.2), (1, 0)])) @ qy(0.4)
            d['uarm_L'] = qx(keys(t, [(0, 0), (0.45, 2.0), (0.7, 0.2), (1, 0)])) @ qy(-0.4)
            d['spine'] = qx(keys(t, [(0, -0.1), (0.4, 0.15), (0.6, -0.5), (1, -0.1)]))
        elif attack == 'cast':
            a = keys(t, [(0, 0), (0.45, 1.4), (0.65, 1.6), (1, 0)])
            d['uarm_R'] = qx(a)
            d['uarm_L'] = qx(a)
            d['farm_R'] = qx(keys(t, [(0, 0.3), (0.45, 0.9), (0.65, 0.0), (1, 0.3)]))
            d['farm_L'] = d['farm_R']
            d['head'] = qx(keys(t, [(0, 0), (0.5, 0.25), (1, 0)]))
        elif attack == 'slam':
            a = keys(t, [(0, 0), (0.45, 2.9), (0.62, 0.6), (1, 0)])
            d['uarm_R'] = qx(a)
            d['uarm_L'] = qx(a)
            d['spine'] = qx(keys(t, [(0, 0), (0.45, 0.25), (0.62, -0.55), (1, 0)]))
            d['_loc'] = Vector((0, 0, keys(t, [(0, 0), (0.62, -0.12), (1, 0)])))
        elif attack == 'thrust':  # 盾を構え、剣で突く
            d['uarm_R'] = qx(keys(t, [(0, 0.2), (0.35, 0.6), (0.55, 1.5), (1, 0.2)]))
            d['farm_R'] = qx(keys(t, [(0, 0.5), (0.35, 1.6), (0.55, 0.0), (1, 0.5)]))
            d['uarm_L'] = qx(0.9) @ qy(-0.5)
            d['farm_L'] = qx(1.2)
            d['spine'] = qz(keys(t, [(0, 0), (0.35, 0.3), (0.55, -0.25), (1, 0)]))
        return d

    r.anims['walk'] = (24, True, walk)
    r.anims['idle'] = (48, True, idle)
    r.anims['attack'] = (18, False, atk)
    death_anim(r)


def death_anim(r):
    def die(t):
        k = keys(t, [(0, 0), (1, 1)])
        return {'_rot': qx(-1.45 * k), '_loc': Vector((0, 0, -0.4 * k)), 'spine': qx(0.4 * k), 'head': qx(0.6 * k)}
    r.anims['die'] = (20, False, die)


def float_anims(r, attack='cast'):
    """浮いて漂う者(屍術師など): 脚は動かさず、衣が揺れる"""
    humanoid_anims(r, stride=0.12, armswing=0.15, attack=attack, speed_bob=0.0)
    w = r.anims['walk'][2]

    def walk(t):
        d = w(t)
        d['spine'] = qx(-0.15) @ qz(0.05 * math.sin(t * TAU))
        d['_loc'] = Vector((0, 0, 0.04 * math.sin(t * TAU)))
        return d
    r.anims['walk'] = (24, True, walk)


def eyes(r, bone, z, y, dx, rad, mi, color=0xff3010):
    for sx in (-1, 1):
        r.part(sphere(rad, (sx * dx, y, z), seg=8, rings=6), bone, mi, color)


# ---------------- 骸骨兵 ----------------
def skeleton():
    r = Rig('skeleton')
    humanoid(r, H=1.78, rad=0.5, w=0.92, muscle=0)
    r.bump = 0.004
    BONE, DARK, RUST = 0xd8cdb0, 0x1a1410, 0x6a4a30
    r.mat('bone', rough=0.75)
    eye = r.mat('eye', 0xff3010, emit=6)
    metal = r.mat('rust', rough=0.55, metal=0.7)
    r.color_fn = lambda p, near, n: mix(hexc(BONE), (0.42, 0.35, 0.25), max(0, -n) * 1.6)
    cz = J(r, 'chest').z
    for i in range(5):
        r.part(ring(0.14 - i * 0.008, 0.012, (0, 0.02, cz - 0.04 - i * 0.06), arc=0.82, scale=(1, 0.8, 1)), 'chest', 0, BONE)
    sp = J(r, 'spine'); hp0 = J(r, 'hips')
    for i in range(7):
        z = hp0.z + (cz - hp0.z) * i / 7
        r.part(sphere(0.028, (0, -0.03, z), seg=8, rings=6, scale=(1.2, 1, 0.7)), 'spine' if i < 4 else 'chest', 0, BONE)
    r.part(ring(0.12, 0.03, (0, 0, hp0.z - 0.02), scale=(1, 0.7, 1)), 'hips', 0, BONE)
    hp = J(r, 'head')
    r.part(sphere(0.115, (0, hp.y + 0.01, hp.z - 0.02), scale=(0.92, 1.1, 1.0)), 'head', 0, BONE)
    r.part(box((0.11, 0.09, 0.035), (0, hp.y + 0.06, hp.z - 0.12)), 'head', 0, BONE)
    for sx in (-1, 1):
        r.part(sphere(0.03, (sx * 0.042, hp.y + 0.1, hp.z), seg=8, rings=6), 'head', 0, DARK)
    eyes(r, 'head', hp.z, hp.y + 0.118, 0.042, 0.014, eye)
    h = J(r, 'hand_R')
    r.part(box((0.05, 0.012, 0.8), (h.x, h.y + 0.38, h.z - 0.04), rot=(math.pi / 2, 0, 0)), 'hand_R', metal, RUST, smooth=False)
    r.part(box((0.18, 0.03, 0.03), (h.x, h.y - 0.0, h.z - 0.04)), 'hand_R', metal, 0x3a2a1a, smooth=False)
    humanoid_anims(r, stride=0.55, armswing=0.45)
    return r


# ---------------- 屍食鬼 ----------------
def ghoul():
    r = Rig('ghoul')
    humanoid(r, H=1.7, rad=0.8, w=0.85, hunch=0.8, arm=1.3, neck=0.8, muscle=0.7)
    r.bump = 0.012
    SKIN = 0x7c8a6a
    r.mat('skin', rough=0.6)
    eye = r.mat('eye', 0xffe040, emit=6)
    claw = r.mat('claw', rough=0.4)

    def col(p, near, n):
        c = mix(hexc(SKIN), (0.22, 0.2, 0.16), max(0, -n) * 1.4)
        if near and (near.startswith('hand') or near.startswith('foot')):
            c = mix(c, (0.2, 0.15, 0.12), 0.5)
        return c
    r.color_fn = col
    hp = J(r, 'head')
    r.part(sphere(0.1, (0, hp.y + 0.03, hp.z - 0.02), scale=(0.85, 1.15, 0.95)), 'head', 0, SKIN)
    eyes(r, 'head', hp.z, hp.y + 0.12, 0.04, 0.016, eye, 0xffe040)
    for S, sx in (('_L', -1), ('_R', 1)):
        h = J(r, 'hand' + S)
        for k in range(3):
            r.part(cone(0.012, 0.0, 0.11, (h.x + (k - 1) * 0.022, h.y + 0.03, h.z - 0.1), rot=(math.pi + 0.3, 0, 0), seg=5), 'hand' + S, claw, 0x2a2018)
    for k in range(4):
        r.part(cone(0.008, 0.0, 0.035, ((k - 1.5) * 0.018, hp.y + 0.12, hp.z - 0.07), rot=(math.pi, 0, 0), seg=4), 'head', claw, 0xd8d0b0)
    humanoid_anims(r, stride=0.6, armswing=0.25, attack='claw', hunch=0.8)
    return r


# ---------------- 亡霊騎士 ----------------
def knight():
    r = Rig('knight')
    humanoid(r, H=1.95, rad=1.0, w=1.12, muscle=0.6)
    r.bump = 0.006
    MAIL, STEEL, CLOTH = 0x3a3a42, 0x8a909c, 0x5a1a1e
    r.mat('mail', rough=0.6, metal=0.3)
    steel = r.mat('steel', rough=0.35, metal=0.45)
    eye = r.mat('eye', 0x60c8ff, emit=8)
    cloth = r.mat('cloth', rough=0.9)
    r.color_fn = lambda p, near, n: mix(hexc(MAIL), (0.05, 0.05, 0.06), max(0, -n) * 1.2)
    hp = J(r, 'head'); c = J(r, 'chest'); s = J(r, 'spine'); hips = J(r, 'hips')
    r.part(sphere(0.135, (0, hp.y, hp.z - 0.02), scale=(0.95, 1.05, 1.15), seg=16), 'head', steel, STEEL)
    r.part(box((0.2, 0.05, 0.03), (0, hp.y + 0.13, hp.z - 0.0)), 'head', 0, 0x050505)
    eyes(r, 'head', hp.z, hp.y + 0.15, 0.04, 0.012, eye, 0x60c8ff)
    r.part(cone(0.02, 0.0, 0.25, (0, hp.y - 0.02, hp.z + 0.2), seg=6), 'head', cloth, CLOTH)  # 兜の飾り
    r.part(sphere(0.2, (0, c.y + 0.04, c.z - 0.05), scale=(1.15, 0.85, 1.1), seg=16), 'chest', steel, STEEL)
    r.part(cone(0.24, 0.3, 0.45, (0, 0.0, hips.z - 0.2), seg=14, caps=False), 'hips', cloth, CLOTH)  # 腰布
    for S, sx in (('_L', -1), ('_R', 1)):
        cl = J(r, 'clav' + S)
        r.part(sphere(0.11, (cl.x + sx * 0.03, cl.y, cl.z + 0.02), scale=(1.2, 1.1, 0.75)), 'clav' + S, steel, STEEL)
        f0, f1 = J(r, 'uarm' + S), J(r, 'farm' + S)
        m = (f0 + f1) / 2
        r.part(cone(0.05, 0.06, (f1 - f0).length * 0.8, tuple(m), seg=10), 'farm' + S, steel, STEEL)
        k0, k1 = J(r, 'thigh' + S), J(r, 'shin' + S)
        r.part(cone(0.055, 0.065, (k1 - k0).length * 0.85, tuple((k0 + k1) / 2), seg=10), 'shin' + S, steel, STEEL)
        r.part(sphere(0.06, tuple(k0), seg=10, rings=8), 'shin' + S, steel, STEEL)
    hl = J(r, 'farm_L')
    r.part(box((0.06, 0.5, 0.65), (hl.x - 0.08, hl.y + 0.08, hl.z + 0.05)), 'farm_L', steel, 0x3a3e48, smooth=False)  # 盾
    r.part(sphere(0.06, (hl.x - 0.12, hl.y + 0.08, hl.z + 0.05), scale=(0.6, 1, 1)), 'farm_L', steel, 0xa08040)
    h = J(r, 'hand_R')
    r.part(box((0.06, 0.015, 1.0), (h.x, h.y + 0.5, h.z - 0.04), rot=(math.pi / 2, 0, 0)), 'hand_R', steel, 0xb0b8c4, smooth=False)
    r.part(box((0.24, 0.035, 0.035), (h.x, h.y, h.z - 0.04)), 'hand_R', steel, 0x806030, smooth=False)
    humanoid_anims(r, stride=0.45, armswing=0.2, attack='thrust', heavy=True)
    return r


# ---------------- 岩喰い鬼 ----------------
def ogre():
    r = Rig('ogre')
    humanoid(r, H=2.6, rad=1.2, w=1.3, belly=1.6, hunch=0.35, head=0.8, neck=0.6, arm=1.15, muscle=1.0)
    r.bump = 0.022
    r.bump_freq = 6
    SKIN = 0x8a6e52
    r.mat('skin', rough=0.75)
    eye = r.mat('eye', 0xff8020, emit=5)
    wood = r.mat('wood', rough=0.9)

    def col(p, near, n):
        c = mix(hexc(SKIN), (0.25, 0.18, 0.12), max(0, -n) * 1.3)
        return mix(c, (0.55, 0.42, 0.3), max(0, n) * 0.6)
    r.color_fn = col
    hp = J(r, 'head')
    r.part(sphere(0.17, (0, hp.y + 0.04, hp.z - 0.05), scale=(1.1, 1.0, 0.85)), 'head', 0, SKIN)
    eyes(r, 'head', hp.z - 0.02, hp.y + 0.2, 0.06, 0.02, eye, 0xff8020)
    for sx in (-1, 1):
        r.part(cone(0.025, 0.0, 0.12, (sx * 0.07, hp.y + 0.2, hp.z - 0.13), rot=(-0.3, 0, 0), seg=6), 'head', wood, 0xe0d4b0)
    h = J(r, 'hand_R')
    r.part(cone(0.05, 0.13, 1.1, (h.x, h.y + 0.5, h.z - 0.04), rot=(-math.pi / 2, 0, 0), seg=10), 'hand_R', wood, 0x4a3420)
    r.part(cone(0.2, 0.26, 0.35, (0, 0, J(r, 'hips').z - 0.15), seg=12, caps=False), 'hips', wood, 0x5a4026)
    humanoid_anims(r, stride=0.4, armswing=0.3, attack='slam', heavy=True, speed_bob=0.05)
    return r


# ---------------- 炎小鬼 ----------------
def imp():
    r = Rig('imp')
    humanoid(r, H=1.05, rad=0.95, w=0.9, head=1.35, arm=1.1, muscle=0.8)
    r.bump = 0.006
    SKIN = 0xa3301c
    r.mat('skin', rough=0.55)
    eye = r.mat('eye', 0xffd040, emit=8)
    horn = r.mat('horn', rough=0.4)
    memb = r.mat('membrane', rough=0.7)
    r.color_fn = lambda p, near, n: mix(mix(hexc(SKIN), (0.25, 0.05, 0.03), max(0, -n) * 1.4), (0.9, 0.5, 0.2), 0.25 if p.y > 0.05 and p.z < 0.75 and p.z > 0.4 else 0)
    hips = J(r, 'hips')
    r.j('tail1', (0, -0.15, hips.z - 0.02), 0.03, 'hips')
    r.j('tail2', (0, -0.32, hips.z - 0.12), 0.022, 'tail1')
    r.j('tail3', (0, -0.48, hips.z - 0.05), 0.015, 'tail2')
    r.j('tail4', (0, -0.58, hips.z + 0.08), 0.008, 'tail3')
    hp = J(r, 'head')
    r.part(sphere(0.085, (0, hp.y + 0.02, hp.z - 0.02), scale=(1, 1.05, 1)), 'head', 0, SKIN)
    eyes(r, 'head', hp.z, hp.y + 0.09, 0.03, 0.013, eye, 0xffd040)
    for sx in (-1, 1):
        r.part(cone(0.022, 0.0, 0.14, (sx * 0.05, hp.y - 0.01, hp.z + 0.09), rot=(-0.5, sx * 0.4, 0), seg=6), 'head', horn, 0x2a1810)
    t4 = J(r, 'tail4')
    r.part(cone(0.03, 0.0, 0.06, (t4.x, t4.y, t4.z + 0.02), seg=4), 'tail4', horn, 0x2a1810)
    c = J(r, 'chest')
    for S, sx in (('_L', -1), ('_R', 1)):
        r.membranes.append(([(sx * 0.05, c.y - 0.06, c.z), (sx * 0.2, c.y - 0.12, c.z + 0.25), (sx * 0.42, c.y - 0.2, c.z + 0.2),
                             (sx * 0.45, c.y - 0.18, c.z - 0.05), (sx * 0.33, c.y - 0.12, c.z - 0.15), (sx * 0.08, c.y - 0.06, c.z - 0.15)], memb, ['chest'], 0x5a1810))
    humanoid_anims(r, stride=0.6, armswing=0.5, attack='cast')
    w = r.anims['walk'][2]
    r.anims['walk'] = (24, True, lambda t: {**w(t), 'tail1': qz(0.3 * math.sin(t * TAU)), 'tail2': qz(0.4 * math.sin(t * TAU - 1)), 'tail3': qz(0.5 * math.sin(t * TAU - 2))})
    return r


# ---------------- 堕ちた写本師 / 屍術師 (衣をまとう者) ----------------
def robed(name, H, ROBE, TRIM, eyec, skeletal=False, staff=False, crown=False, book=True, tatters=False, attack='cast'):
    r = Rig(name)
    humanoid(r, H=H, rad=0.55 if skeletal else 0.8, w=0.95, hunch=0.25, muscle=0 if skeletal else 0.4)
    r.bump = 0.006
    r.mat('body', rough=0.7)
    eye = r.mat('eye', eyec, emit=7)
    robe = r.mat('robe', rough=0.95)
    gold = r.mat('gold', rough=0.4, metal=0.45)
    SK = 0xd0c6a8 if skeletal else 0x9a8a7a
    r.color_fn = lambda p, near, n: mix(hexc(SK), (0.2, 0.17, 0.14), max(0, -n) * 1.5)
    hips = J(r, 'hips'); c = J(r, 'chest'); hp = J(r, 'head')

    def robe_col(p, n):
        return mix(hexc(ROBE), (0.02, 0.02, 0.02), max(0, -n) * 1.2)
    r.part(cone(0.5 * H / 1.8, 0.2 * H / 1.8, hips.z + 0.08, (0, -0.02, (hips.z + 0.08) / 2 - 0.02), seg=20, caps=False), 'hips', robe, robe_col)
    r.part(ring(0.5 * H / 1.8, 0.025, (0, -0.02, 0.05), seg=24, scale=(1, 1, 1)), 'hips', gold, TRIM)  # 裾の縁取り
    r.part(cone(0.24 * H / 1.8, 0.17 * H / 1.8, c.z - hips.z + 0.15, (0, c.y * 0.5, (c.z + hips.z) / 2 + 0.02), seg=18), 'chest', robe, robe_col)
    for S, sx in (('_L', -1), ('_R', 1)):
        a, b = J(r, 'uarm' + S), J(r, 'farm' + S)
        r.part(cone(0.1, 0.055, (b - a).length * 0.95, tuple((a + b) / 2 + Vector((0, 0, -0.02))), seg=12, caps=False), 'farm' + S, robe, robe_col)
        a0 = J(r, 'clav' + S)
        r.part(cone(0.065, 0.07, (a - a0).length * 0.9 + 0.1, tuple((a0 + a) / 2), seg=12), 'uarm' + S, robe, robe_col)
    # 頭巾と、闇に光る目
    r.part(sphere(0.15 * H / 1.8, (0, hp.y - 0.02, hp.z - 0.0), scale=(0.95, 1.05, 1.15), seg=16), 'head', robe, robe_col)
    r.part(sphere(0.1 * H / 1.8, (0, hp.y + 0.06, hp.z - 0.03), scale=(0.9, 0.7, 1.0)), 'head', 0, 0x050404)
    eyes(r, 'head', hp.z - 0.02, hp.y + 0.135 * H / 1.8, 0.035, 0.016, eye, eyec)
    if crown:
        for i in range(7):
            a = i / 7 * TAU
            r.part(cone(0.018, 0.0, 0.11, (math.cos(a) * 0.11, hp.y + math.sin(a) * 0.11, hp.z + 0.14), seg=5), 'head', gold, 0x8a7030)
    h = J(r, 'hand_R')
    if staff:
        r.part(cone(0.018, 0.022, 1.8, (h.x, h.y, h.z + 0.35), seg=8), 'hand_R', robe, 0x2a2018)
        r.part(sphere(0.07, (h.x, h.y, h.z + 1.3), seg=12, rings=10), 'hand_R', eye, eyec)
    hl = J(r, 'hand_L')
    if book:
        r.part(box((0.22, 0.04, 0.28), (hl.x, hl.y + 0.12, hl.z + 0.02), rot=(0.4, 0, 0)), 'hand_L', robe, 0x5a2a18, smooth=False)  # 本
    if tatters:  # ぼろぼろの裾: 垂れ下がる布の切れ端
        R0 = 0.5 * H / 1.8
        for i in range(14):
            a = i / 14 * TAU
            r.part(cone(0.07, 0.0, 0.35 + 0.15 * ((i * 7) % 3), (math.cos(a) * R0 * 0.92, math.sin(a) * R0 * 0.92 - 0.02, -0.12), rot=(math.pi, 0, 0), seg=4), 'hips', robe, robe_col)
    float_anims(r, attack=attack)
    return r


def scribe():
    return robed('scribe', 1.75, 0x2e2240, 0x9a7a40, 0xff4a8a)


def lich():
    return robed('lich', 2.05, 0x16221c, 0x6a8a50, 0x60ff9a, skeletal=True, staff=True, crown=True)


# ---------------- 石像兵 ----------------
def wraith():
    return robed('wraith', 2.0, 0x1c1226, 0x3a2050, 0xb565ff, skeletal=True, book=False, tatters=True, attack='claw')


# ---------------- 粘獣 ----------------
def slime():
    r = Rig('slime')
    r.bump = 0.02
    r.bump_freq = 4
    r.ao = 0.15
    r.mat('slime', 0x58c040, rough=0.15)
    eye = r.mat('eye', 0xe8ff60, emit=5)
    core = r.mat('core', 0x2a6a10, rough=0.3)
    r.j('base', (0, 0, 0.12), 0.5)
    r.j('mid', (0, 0, 0.42), 0.55, 'base')
    r.j('top', (0, 0.03, 0.72), 0.3, 'mid')
    r.j('lobe_L', (-0.42, 0.05, 0.22), 0.25, 'base')
    r.j('lobe_R', (0.42, -0.05, 0.2), 0.22, 'base')
    r.j('lobe_B', (0.05, -0.42, 0.18), 0.22, 'base')
    r.color_fn = lambda p, near, n: mix((0.3, 0.75, 0.22), (0.08, 0.3, 0.06), max(0, -n) * 1.2 + max(0, 0.15 - p.z) * 2)
    r.part(sphere(0.18, (0, 0, 0.4), seg=12, rings=8), 'mid', core, 0x1a4a08)
    for sx in (-1, 1):
        r.part(sphere(0.05, (sx * 0.13, 0.42, 0.55), seg=10, rings=8), 'top', eye, 0xe8ff60)

    def walk(t):
        p = t * TAU
        sq = math.sin(p)
        return {'_loc': Vector((0, 0, 0.12 * max(0, sq))), '_scl': (1 - 0.12 * sq, 1 - 0.12 * sq, 1 + 0.2 * sq),
                'top': qx(0.25 * math.sin(p - 0.8)), 'mid': qx(0.12 * math.sin(p - 0.4)),
                'lobe_L': qy(0.2 * math.sin(p)), 'lobe_R': qy(-0.2 * math.sin(p + 1)), 'lobe_B': qx(-0.2 * math.sin(p + 2))}

    def idle(t):
        p = t * TAU
        return {'_scl': (1 + 0.04 * math.sin(p), 1 + 0.04 * math.sin(p), 1 - 0.05 * math.sin(p)), 'top': qz(0.15 * math.sin(p))}

    def atk(t):
        k = keys(t, [(0, 0), (0.35, -1), (0.55, 1), (1, 0)])
        return {'_scl': (1 + 0.2 * -k, 1 + 0.2 * -k, 1 + 0.35 * k), '_loc': Vector((0, 0.25 * max(0, k), 0.2 * max(0, k))), 'top': qx(0.5 * max(0, k))}

    def die(t):
        k = keys(t, [(0, 0), (1, 1)])
        return {'_scl': (1 + 0.6 * k, 1 + 0.6 * k, max(0.05, 1 - 0.95 * k))}
    r.anims['walk'] = (20, True, walk)
    r.anims['idle'] = (36, True, idle)
    r.anims['attack'] = (16, False, atk)
    r.anims['die'] = (18, False, die)
    return r


def golem():
    r = Rig('golem')
    humanoid(r, H=2.5, rad=1.6, w=1.45, belly=1.1, arm=1.2, head=0.7, neck=0.5, muscle=0.6, fingers=False)
    r.bump = 0.06
    r.bump_freq = 3.2
    r.subdiv = 1
    r.smooth = False
    STONE = 0x7a756c
    r.mat('stone', rough=0.95)
    eye = r.mat('eye', 0xff9a2a, emit=7)
    r.color_fn = lambda p, near, n: mix(mix(hexc(STONE), (0.2, 0.19, 0.17), max(0, -n) * 1.6), (0.35, 0.42, 0.3), max(0, n - 0.25) * 2)
    hp = J(r, 'head'); c = J(r, 'chest')
    r.part(box((0.3, 0.28, 0.26), (0, hp.y + 0.03, hp.z - 0.05), rot=(0.1, 0.05, 0)), 'head', 0, STONE, smooth=False)
    eyes(r, 'head', hp.z - 0.02, hp.y + 0.18, 0.07, 0.025, eye, 0xff9a2a)
    r.part(box((0.06, 0.02, 0.18), (0, c.y + 0.26, c.z - 0.05)), 'chest', eye, 0xff9a2a, smooth=False)  # 胸の刻印
    for S, sx in (('_L', -1), ('_R', 1)):
        cl = J(r, 'clav' + S)
        r.part(box((0.32, 0.3, 0.26), (cl.x + sx * 0.06, cl.y, cl.z + 0.08), rot=(0.2, sx * 0.3, 0.1)), 'clav' + S, 0, STONE, smooth=False)
        h = J(r, 'hand' + S)
        r.part(box((0.22, 0.22, 0.24), (h.x, h.y, h.z - 0.04), rot=(0.3, 0.2, 0.1)), 'hand' + S, 0, STONE, smooth=False)
    humanoid_anims(r, stride=0.32, armswing=0.25, attack='slam', heavy=True, speed_bob=0.05)
    return r


# ---------------- 洞窟大蜘蛛 ----------------
def spider():
    r = Rig('spider')
    r.bump = 0.008
    r.bump_freq = 22
    BODY = 0x2e2420
    r.mat('chitin', rough=0.45)
    eye = r.mat('eye', 0xff2020, emit=6)
    fang = r.mat('fang', rough=0.3)
    z0 = 0.5
    r.j('thorax', (0, 0, z0), 0.2)
    r.j('abdomen', (0, -0.55, z0 + 0.12), 0.36, 'thorax')
    r.j('headj', (0, 0.28, z0 - 0.02), 0.15, 'thorax')
    r.mid('abdomen', 0.55, 0.42)
    legs = []
    for i, ang in enumerate((55, 22, -12, -45)):
        for S, sx in (('_L', -1), ('_R', 1)):
            a = math.radians(ang)
            d = Vector((sx * math.cos(a), math.sin(a), 0))
            base = Vector((0, 0.02, z0)) + d * 0.16
            r.j('coxa%d%s' % (i, S), tuple(base), 0.06, 'thorax')
            r.j('femur%d%s' % (i, S), tuple(base + d * 0.55 + Vector((0, 0, 0.42))), 0.048, 'coxa%d%s' % (i, S))
            r.j('tibia%d%s' % (i, S), tuple(base + d * 1.15 + Vector((0, 0, -z0 + 0.02))), 0.026, 'femur%d%s' % (i, S))
            legs.append((i, S, d))

    def col(p, near, n):
        c = mix(hexc(BODY), (0.05, 0.04, 0.03), max(0, -n) * 1.2)
        c = mix(c, (0.45, 0.3, 0.2), max(0, n) * 0.5)
        if near == 'abdomen' and p.z > z0 + 0.35 and abs(p.x) < 0.07:
            c = (0.6, 0.08, 0.05)  # 背の赤い紋
        return c
    r.color_fn = col
    h = J(r, 'headj')
    for k in range(8):
        r.part(sphere(0.022 if k < 2 else 0.014, ((k % 4 - 1.5) * 0.04, h.y + 0.12 - (k // 4) * 0.02, h.z + 0.07 + (k // 4) * 0.035), seg=8, rings=6), 'headj', eye, 0xff2020)
    for sx in (-1, 1):
        r.part(cone(0.03, 0.0, 0.16, (sx * 0.05, h.y + 0.14, h.z - 0.1), rot=(math.pi - 0.4, 0, 0), seg=6), 'headj', fang, 0x1a1410)

    # 脚の上げ方: 腿の骨を、脚の向きと直交する水平軸まわりに回す(足先が上がる向きを数値で選ぶ)
    lift_axis = {}
    for i, S, d in legs:
        ax = Vector((-d.y, d.x, 0))
        a0, a1 = J(r, 'coxa%d%s' % (i, S)), J(r, 'tibia%d%s' % (i, S))
        tipv = a1 - a0
        lift_axis[(i, S)] = ax if (Quaternion(ax, 0.3) @ tipv).z > tipv.z else -ax

    def gait(t, amp=1.0):
        d = {}
        for i, S, dd in legs:
            grp = (i + (0 if S == '_L' else 1)) % 2
            p = t * TAU + grp * math.pi
            d['coxa%d%s' % (i, S)] = qz(0.32 * amp * math.sin(p))
            d['femur%d%s' % (i, S)] = Quaternion(lift_axis[(i, S)], 0.35 * amp * max(0, math.cos(p)))
        d['abdomen'] = qx(0.05 * math.sin(t * TAU * 2))
        d['_loc'] = Vector((0, 0, 0.02 * abs(math.sin(t * TAU * 2)) * amp))
        return d

    def idle(t):
        d = gait(t, 0.08)
        d['abdomen'] = qx(0.06 * math.sin(t * TAU))
        return d

    def atk(t):
        d = gait(0, 0)
        up = keys(t, [(0, 0), (0.4, 1), (0.6, 0.2), (1, 0)])
        for i, S, dd in legs:
            if i < 2:
                d['femur%d%s' % (i, S)] = Quaternion(lift_axis[(i, S)], 1.1 * up)
        d['_rot'] = qx(-0.45 * up)
        d['headj'] = qx(keys(t, [(0, 0), (0.45, -0.3), (0.6, 0.5), (1, 0)]))
        d['_loc'] = Vector((0, 0, 0.15 * up))
        return d

    def die(t):
        k = keys(t, [(0, 0), (1, 1)])
        d = {}
        for i, S, dd in legs:
            d['femur%d%s' % (i, S)] = Quaternion(lift_axis[(i, S)], 1.2 * k)
        d['_loc'] = Vector((0, 0, -0.3 * k))
        return d
    r.anims['walk'] = (16, True, gait)
    r.anims['idle'] = (48, True, idle)
    r.anims['attack'] = (16, False, atk)
    r.anims['die'] = (20, False, die)
    return r


# ---------------- 吸血大蝙蝠 ----------------
def bat():
    r = Rig('bat')
    r.bump = 0.004
    FUR, MEM = 0x3a2a26, 0x4e302c
    r.mat('fur', rough=0.9)
    eye = r.mat('eye', 0xff3030, emit=7)
    memb = r.mat('membrane', rough=0.75)
    r.j('body', (0, 0, 0), 0.09)
    r.j('chestb', (0, 0.1, 0.02), 0.1, 'body')
    r.j('headb', (0, 0.22, 0.05), 0.075, 'chestb')
    r.j('tailb', (0, -0.18, -0.03), 0.04, 'body')
    for S, sx in (('_L', -1), ('_R', 1)):
        r.j('uarm' + S, (sx * 0.24, 0.12, 0.05), 0.03, 'chestb')
        r.j('farm' + S, (sx * 0.5, 0.06, 0.04), 0.022, 'uarm' + S)
        r.j('f1' + S, (sx * 0.85, 0.1, 0.02), 0.01, 'farm' + S)
        r.j('f2' + S, (sx * 0.78, -0.18, -0.01), 0.01, 'farm' + S)
        r.j('f3' + S, (sx * 0.55, -0.3, -0.02), 0.01, 'farm' + S)
        r.j('leg' + S, (sx * 0.06, -0.2, -0.1), 0.018, 'body')
        r.tip('ear' + S, (sx * 0.05, 0.2, 0.17), 0.02, 'headb')
        pts = [(sx * 0.04, 0.02, 0.0), (sx * 0.24, 0.12, 0.05), (sx * 0.5, 0.06, 0.04), (sx * 0.85, 0.1, 0.02), (sx * 0.78, -0.18, -0.01), (sx * 0.55, -0.3, -0.02), (sx * 0.06, -0.2, -0.05)]
        r.membranes.append((pts, memb, ['uarm' + S, 'farm' + S, 'f1' + S, 'f2' + S, 'f3' + S, 'leg' + S, 'body'], MEM))
    r.color_fn = lambda p, near, n: mix(hexc(FUR), (0.08, 0.05, 0.04), max(0, -n) * 1.3)
    h = J(r, 'headb')
    eyes(r, 'headb', h.z + 0.02, h.y + 0.06, 0.03, 0.012, eye, 0xff3030)
    r.part(cone(0.006, 0.0, 0.03, (0.012, h.y + 0.07, h.z - 0.04), rot=(math.pi, 0, 0), seg=4), 'headb', 0, 0xe0e0d0)
    r.part(cone(0.006, 0.0, 0.03, (-0.012, h.y + 0.07, h.z - 0.04), rot=(math.pi, 0, 0), seg=4), 'headb', 0, 0xe0e0d0)

    def flap(t, amp=1.0, speed=1):
        p = t * TAU * speed
        d = {}
        for S, sx in (('_L', -1), ('_R', 1)):
            d['uarm' + S] = qy(-sx * 0.9 * amp * math.sin(p))
            d['farm' + S] = qy(-sx * 0.45 * amp * math.sin(p - 0.6))
            d['f1' + S] = qy(-sx * 0.2 * amp * math.sin(p - 1.0))
        d['_loc'] = Vector((0, 0, -0.06 * math.sin(p) * amp))
        return d

    def atk(t):
        d = flap(t, 1.2, 2)
        d['_rot'] = qx(keys(t, [(0, 0), (0.4, 0.6), (0.7, -0.3), (1, 0)]))
        d['headb'] = qx(keys(t, [(0, 0), (0.5, 0.4), (1, 0)]))
        return d

    def die(t):
        k = keys(t, [(0, 0), (1, 1)])
        d = flap(0, 0)
        for S, sx in (('_L', -1), ('_R', 1)):
            d['uarm' + S] = qy(sx * 1.2 * k)
        d['_rot'] = qy(2.5 * k)
        return d
    r.anims['walk'] = (12, True, lambda t: flap(t, 1.0))
    r.anims['idle'] = (16, True, lambda t: flap(t, 0.7))
    r.anims['attack'] = (14, False, atk)
    r.anims['die'] = (16, False, die)
    return r


BUILDERS = {'skeleton': skeleton, 'ghoul': ghoul, 'knight': knight, 'ogre': ogre, 'imp': imp, 'scribe': scribe,
            'lich': lich, 'golem': golem, 'spider': spider, 'bat': bat, 'wraith': wraith, 'slime': slime}

if __name__ == '__main__':
    for name, fn in BUILDERS.items():
        if ONLY and name not in ONLY:
            continue
        try:
            rig = fn()
            if os.environ.get('FORGE'):
                import forge
                importlib.reload(forge)
                pv = os.environ.get('PREVIEW')
                forge.build(rig, os.path.abspath(os.path.join(OUT, name + '.glb')), preview=os.path.join(pv, name + '.png') if pv else None)
            else:
                build(rig, os.path.abspath(os.path.join(OUT, name + '.glb')))
        except Exception as e:
            import traceback
            traceback.print_exc()
            print('FAILED', name, e)
