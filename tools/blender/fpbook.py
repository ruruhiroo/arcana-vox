# 一人称で手に持つ魔導書(開いた形)を彫る。頁の面(呪文を書く所)・栞紐・宝玉はゲーム側が重ねる。
#   blender -b --factory-startup -P tools/blender/fpbook.py -- <出力先>   (環境変数 PREVIEW=絵の出力先)
# 寸法と向きは public/js/viewmodel.js の makeGrimoire に合わせる(片頁 0.15 × 0.21、左右の頁は綴じ目から 0.2rad 起きる)。
# 革は 'tint' という名の材質で書き出す(ゲーム側が、誓った属性の色に染める)。
import sys, os, math, importlib
sys.path.insert(0, os.path.dirname(__file__))
import rig as R, forge, anatomy
for m in (R, forge, anatomy):
    importlib.reload(m)
from rig import Rig, sphere, box
from anatomy import clay, dent
from mathutils import Vector as V, Matrix
import bmesh

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'public/models'
W, H, TH = 0.15, 0.21, 0.2

forge.PRESETS['paper'] = [('CLOUDS', 0.05, 0.0012, {}), ('CLOUDS', 0.004, 0.0004, {})]
forge.SURFACE_OF['paper'] = 'paper'


def T(x, y, z):
    return V((x, -z, y))


def rz(side):
    return Matrix.Rotation(side * -TH, 4, 'Z')


def local(p):
    """Blender の点 → (どちらの頁か, その頁の中での three.js 座標 x, y, z)"""
    side = 1 if p.x >= 0 else -1
    q = rz(side).inverted() @ p
    return side, q.x, q.z, -q.y


def hbox(side, w, h, d, x, y, z):
    """片頁の中に置いた箱(幅, 高さ, 厚み, 中心 x, y, z は three.js の向き)"""
    def f(bm):
        m = rz(side) @ Matrix.Translation(T(x, y, z)) @ Matrix.Diagonal((w, d, h, 1))
        return bmesh.ops.create_cube(bm, size=1.0, matrix=m)['verts']
    return f


def book():
    r = Rig('fp-grimoire')
    r.j('base', (0, 0, 0), 0.001, skin=False)
    r.identity_bones = True
    r.bump = 0.0
    r.voxel = 0.0014
    r.clay_smooth = 3
    r.tex = 1024
    r.tris = 6000
    r.scale = 0.4
    r.cage = 0.004
    r.ray = 0.012
    r.surface = 'paper'
    r.mat('paper', rough=0.92)
    r.mat('tint', rough=0.62)
    brass = r.mat('gold', rough=0.42, metal=0.9)
    r.weight_fn = lambda p: None
    for side in (-1, 1):
        clay(r, hbox(side, W + 0.014, H + 0.016, 0.008, side * (W / 2 + 0.006), 0, -0.016))       # 表紙の板
        clay(r, hbox(side, W - 0.002, H - 0.002, 0.012, side * W / 2, 0, -0.0075))                  # 頁の束(下の段)
        clay(r, hbox(side, W - 0.006, H - 0.005, 0.008, side * (W / 2 - 0.002), 0, 0.0005))         # 頁の束(めくった側は少し引っ込む)
        for sy in (-1, 1):                                                                           # 角の金具
            cx, cy = side * (W + 0.013 - 0.0105), sy * (H / 2 + 0.008 - 0.0105)
            m = rz(side)
            r.part(box((0.025, 0.0115, 0.025), tuple(m @ T(cx, cy, -0.016)), rot=(0, 0, side * -TH)), 'base', brass, 0x9a7a3a, smooth=False)
            r.part(sphere(0.0042, tuple(m @ T(cx - side * 0.004, cy - sy * 0.004, -0.0225)), seg=10, rings=6, scale=(1, 0.6, 1)), 'base', brass, 0xb8944a)
    # 背(丸背)と、綴じ紐の盛り上がり
    def spine(bm):
        vs = bmesh.ops.create_cone(bm, cap_ends=True, segments=28, radius1=0.0125, radius2=0.0125, depth=H + 0.016, matrix=Matrix.Translation(T(0, 0, -0.02)))['verts']
        for y in (-0.078, -0.03, 0.03, 0.078):
            vs += bmesh.ops.create_cone(bm, cap_ends=True, segments=28, radius1=0.0146, radius2=0.0146, depth=0.007, matrix=Matrix.Translation(T(0, y, -0.02)))['verts']
        return vs
    clay(r, spine)
    # 表紙の裏の型押し(枠)
    for side in (-1, 1):
        for k in range(24):
            t = k / 23
            for sy in (-1, 1):
                dent(r, rz(side) @ T(side * (0.02 + t * (W - 0.03)), sy * (H / 2 - 0.012), -0.0205), (0.006, 0.0025, 0.0022), 0.0009)
            dent(r, rz(side) @ T(side * (W - 0.01), -H / 2 + 0.012 + t * (H - 0.024), -0.0205), (0.0022, 0.0025, 0.006), 0.0009)

    def is_leather(p):
        side, x, y, z = local(p)
        return z < -0.0118 or (abs(p.x) < 0.0165 and -p.y < -0.009)
    r.regions = [('leather', lambda p, nb: 1.0 if is_leather(p) else 0.0, lambda p, n: tuple(0.62 + 0.2 * n for _ in range(3)), 0.62, 0.0)]
    r.slot_fn = lambda c, nb: 'tint' if is_leather(c) else None

    def col(p, near, n):
        side, x, y, z = local(p)
        k = 0.8 + 0.2 * math.sin(z * math.tau / 0.0013 + n * 1.5)             # 小口: 紙の一枚一枚の筋
        c = (0.8 * k, 0.72 * k, 0.55 * k)
        edge = max(abs(y) / (H / 2), abs(x) / W)
        if edge > 0.93:
            c = tuple(v * 0.86 for v in c)                                    # 縁は手擦れで焼けている
        return c
    r.color_fn = col
    r.view = [(0.3, -1.5, 0.9, 1.6, 0.5), (0.9, 1.2, -0.6, 1.7, 0.5)]
    return r


if __name__ == '__main__':
    pv = os.environ.get('PREVIEW')
    try:
        forge.build(book(), os.path.abspath(os.path.join(OUT, 'fp-grimoire.glb')), preview=os.path.join(pv, 'fp-grimoire.png') if pv else None)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print('FAILED fp-grimoire', e)
