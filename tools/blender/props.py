# 調度品(障害物)を作る: 沈んだ「声の学院」に残された家具と石造り。
#   blender -b --factory-startup -P tools/blender/props.py -- <出力先> [種類...]   (環境変数 PREVIEW=絵の出力先)
# ゲーム内の寸法・向きは public/js/decor.js の手続き版に合わせる。
# 座標は T(x, y, z) で three.js の向き(y が上、+z が手前)から Blender の向きへ直して書く。
import sys, os, math, importlib, random
sys.path.insert(0, os.path.dirname(__file__))
import rig as R, forge, anatomy
for m in (R, forge, anatomy):
    importlib.reload(m)
from rig import Rig, sphere, box, cone, ring
from anatomy import ell, cap, chain, clay, dent
from mathutils import Vector as V, Matrix, Euler
import bmesh

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'public/models'
ONLY = set(argv[1:])
TAU = math.pi * 2


def T(x, y, z):
    return V((x, -z, y))


def hexc(c):
    return ((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def sm(x, a, b):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def bx(w, h, d, x, y, z, ry=0.0):
    """three.js の box(幅, 高さ, 奥行, 位置x, y, z, y回り)を粘土の塊として返す"""
    def f(bm):
        m = Matrix.Translation(T(x, y, z)) @ Euler((0, 0, ry), 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((w, d, h, 1))
        return bmesh.ops.create_cube(bm, size=1.0, matrix=m)['verts']
    return f


def cy(r1, r2, h, x, y, z, seg=20):
    """縦の円柱(下の半径 r2、上の半径 r1)"""
    def f(bm):
        return bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r2, radius2=r1, depth=h, matrix=Matrix.Translation(T(x, y, z)))['verts']
    return f


def pbox(w, h, d, x, y, z, ry=0.0, rx=0.0):
    """部品としての箱(rig.box 形式)"""
    return box((w, d, h), tuple(T(x, y, z)), rot=(rx, 0, ry))


def prop(name, first_mat, rough=0.85, metal=0.0, voxel=0.014, tex=512, tris=3500, smooth=3, scale=1.0, surface=None):
    r = Rig('decor-' + name)
    r.j('base', (0, 0, 0), 0.01, skin=False)
    r.identity_bones = True
    r.clay_smooth = smooth
    r.bump = 0.0
    r.voxel = voxel
    r.tex = tex
    r.tris = tris
    r.scale = scale
    r.ao_strength = 1.0
    r.mat(first_mat, rough=rough, metal=metal)
    if surface:
        r.surface = surface
    r.weight_fn = lambda p: None
    r.view = [(-0.9, -1.5, 0.6), (1.2, -1.2, 0.35)]
    return r


def lid(r, pivot):
    """蓋の骨: pivot(Blender 座標)を軸にゲーム側が動かす。蓋そのものは 'lid' に付けた部品で作る"""
    r.j('lidp', tuple(pivot), 0.01, 'base', skin=False)
    r.j('lid', tuple(V(pivot) + V((0, 0, 0.1))), 0.01, 'lidp', skin=False)


WOOD, DARK = 0x5c4028, 0x35241a


def wood_col(base=WOOD, plank=0.16, axis=0, dark=(0.1, 0.07, 0.05)):
    """板ごとに色の違う木。axis の向きに板が並ぶ"""
    rnd = random.Random(11)
    tone = [rnd.uniform(0.78, 1.15) for _ in range(64)]
    def f(p, near, n):
        k = tone[int(math.floor(p[axis] / plank + 100)) % 64]
        c = tuple(x * k for x in hexc(base))
        c = mix(c, dark, max(0, -n) * 1.3)
        return mix(c, (0.5, 0.4, 0.28), max(0, n - 0.25) * 0.7)
    return f


def books_row(r, x0, x1, y, z, depth, hmax, rnd, books):
    """本の列を粘土で並べる(高さ・厚み・傾きが一冊ずつ違う)。色は後で x の位置から決める"""
    x = x0
    while x < x1 - 0.03:
        if rnd.random() < 0.07:           # 抜けた所
            x += rnd.uniform(0.06, 0.2)
            continue
        w = rnd.uniform(0.035, 0.08)
        h = hmax * rnd.uniform(0.68, 0.97)
        lean = rnd.uniform(-0.12, 0.12) if rnd.random() < 0.15 else 0
        def f(bm, x=x, w=w, h=h, lean=lean):
            m = Matrix.Translation(T(x + w / 2, y + h / 2, z)) @ Euler((0, lean, 0), 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((w * 0.94, depth * rnd.uniform(0.82, 1.0), h, 1))
            return bmesh.ops.create_cube(bm, size=1.0, matrix=m)['verts']
        clay(r, f)
        books.append((x, x + w, y, y + hmax, rnd.choice((0x5a1a1a, 0x1e3a2a, 0x2a2a4a, 0x4a3a1a, 0x3a1a3a, 0x6a5a3a, 0x202020, 0x503018)), rnd.random() < 0.3))
        x += w


def book_region(r, books, zfront):
    def w(p, nb):
        if -p.y < zfront - 0.5:
            return 0.0
        for x0, x1, y0, y1, c, gilt in books:
            if x0 <= p.x < x1 and y0 - 0.01 <= p.z <= y1 + 0.02:
                return 1.0
        return 0.0
    def c(p, n):
        for x0, x1, y0, y1, col, gilt in books:
            if x0 <= p.x < x1 and y0 - 0.01 <= p.z <= y1 + 0.02:
                base = tuple(v * (0.8 + 0.4 * n) for v in hexc(col))
                t = (p.z - y0) / (y1 - y0)
                if gilt and (abs(t - 0.2) < 0.025 or abs(t - 0.62) < 0.02):
                    return (0.55, 0.42, 0.16)                     # 背の金の帯
                return base
        return (0.2, 0.15, 0.1)
    if not hasattr(r, 'regions'):
        r.regions = []
    r.regions.append(('leather', w, c, 0.7, 0.0))


# ---- 壁一面の書架(声の学院の蔵書) ----
def wallshelf():
    r = prop('wallshelf', 'wood', voxel=0.02, tex=1024, tris=9000)
    W, H, D, rows = 3.96, 4.6, 0.62, 7
    clay(r, bx(W, H, 0.06, 0, H / 2, -D / 2 + 0.03))
    for x in (-(W / 2 - 0.06), 0, W / 2 - 0.06):
        clay(r, bx(0.12, H, D, x, H / 2, 0))
    clay(r, bx(W + 0.1, 0.18, D + 0.12, 0, H + 0.09, 0.03))
    clay(r, bx(W + 0.06, 0.1, D + 0.06, 0, 0.05, 0.02))
    rnd = random.Random(3)
    books = []
    for i in range(rows + 1):
        y = 0.05 + i * (H - 0.2) / rows
        clay(r, bx(W, 0.06, D, 0, y, 0))
        if i < rows:
            for x0, x1 in ((-W / 2 + 0.14, -0.08), (0.08, W / 2 - 0.14)):
                books_row(r, x0, x1, y + 0.03, 0.02, D * 0.72, (H - 0.2) / rows - 0.1, rnd, books)
    r.color_fn = wood_col(WOOD, 0.3, 2)
    book_region(r, books, 0.0)
    return r


# ---- 独立した本棚 ----
def shelf():
    r = prop('shelf', 'wood', voxel=0.015, tex=512, tris=4500)
    clay(r, bx(1.7, 2.6, 0.05, 0, 1.3, -0.225))
    for x in (-0.82, 0.82):
        clay(r, bx(0.07, 2.6, 0.5, x, 1.3, 0))
    clay(r, bx(1.78, 0.1, 0.56, 0, 2.6, 0))
    rnd = random.Random(5)
    books = []
    for i in range(5):
        y = 0.06 + i * 0.6 if i < 4 else 2.5
        clay(r, bx(1.6, 0.05, 0.46, 0, y, 0.01))
        if i < 4:
            books_row(r, -0.76, 0.76, y + 0.025, 0.03, 0.34, 0.48, rnd, books)
    r.color_fn = wood_col(WOOD, 0.25, 2)
    book_region(r, books, 0.0)
    return r


def table_like(name, L, Wd, top_y, legs, bench=None, extras=None, tris=3500):
    r = prop(name, 'wood', voxel=0.012, tex=512, tris=tris)
    clay(r, bx(L, 0.08, Wd, 0, top_y, 0))
    for k in range(int(L / 0.9)):          # 天板の裏の桟
        clay(r, bx(0.08, 0.06, Wd - 0.2, -L / 2 + 0.3 + k * 0.9, top_y - 0.07, 0))
    for x, z in legs:
        clay(r, bx(0.09, top_y, 0.09, x, top_y / 2, z))
        clay(r, bx(0.13, 0.06, 0.13, x, 0.03, z))
    if bench:
        for sz in (-1, 1):
            clay(r, bx(bench[0], 0.06, 0.32, 0, 0.46, sz * bench[1]))
            for x in (-bench[0] / 2 + 0.15, bench[0] / 2 - 0.15):
                clay(r, bx(0.07, 0.44, 0.26, x, 0.22, sz * bench[1]))
    r.color_fn = wood_col(WOOD, 0.22, 1)
    if extras:
        extras(r)
    return r


def open_book(r, x, y, z, ry, paper, leather):
    for sx in (-1, 1):
        r.part(box((0.21, 0.3, 0.022), tuple(T(x + sx * 0.108 * math.cos(ry), y + 0.012, z - sx * 0.108 * math.sin(ry))), rot=(0, sx * 0.09, ry)), 'base', paper, 0xd2c6a2, smooth=False)
    r.part(box((0.46, 0.32, 0.012), tuple(T(x, y, z)), rot=(0, 0, ry)), 'base', leather, 0x4a2014, smooth=False)


def candle(r, x, y, z, wax):
    r.part(cone(0.04, 0.035, 0.18, tuple(T(x, y, z)), seg=10), 'base', wax, 0xd8ccae)
    r.part(cone(0.07, 0.05, 0.02, tuple(T(x, y - 0.09, z)), seg=10), 'base', wax, 0x6a5a40)


def readtable():
    def ex(r):
        paper = r.mat('cloth', rough=0.9)
        leather = r.mat('leather', rough=0.7)
        open_book(r, -0.6, 0.875, 0.05, 0.2, paper, leather)
        open_book(r, 0.7, 0.875, -0.1, -0.3, paper, leather)
        for k, (c, h) in enumerate(((0x3a1c14, 0.06), (0x1e3a2a, 0.05), (0x4a3a1a, 0.045))):
            r.part(box((0.34 - k * 0.03, 0.25 - k * 0.02, h), tuple(T(0.2, 0.89 + k * 0.055, 0.2)), rot=(0, 0, 0.5 - k * 0.25)), 'base', leather, c, smooth=False)
        for x in (-0.15, 1.05):
            candle(r, x, 0.95, -0.3, paper)
    return table_like('readtable', 2.6, 1.0, 0.82, [(-1.15, -0.4), (1.15, -0.4), (-1.15, 0.4), (1.15, 0.4)], bench=(2.4, 0.82), extras=ex, tris=4500)


def longtable():
    def ex(r):
        pewter = r.mat('steel', rough=0.5, metal=0.6)
        wax = r.mat('cloth', rough=0.9)
        L = 3.4
        for k in range(5):
            for sz in (-1, 1):
                r.part(cone(0.14, 0.11, 0.025, tuple(T(-L / 2 + 0.45 + k * (L - 0.9) / 4, 0.875, sz * 0.3)), seg=14), 'base', pewter, 0x8a8674)
        for k in range(3):
            r.part(cone(0.03, 0.045, 0.16, tuple(T(-1 + k, 0.95, 0)), seg=10), 'base', pewter, 0x8a8674)
        candle(r, 0, 1.0, 0.05, wax)
    return table_like('longtable', 3.4, 1.1, 0.82, [(-1.55, -0.4), (1.55, -0.4), (-1.55, 0.4), (1.55, 0.4)], bench=(3.2, 0.85), extras=ex, tris=4500)


def desk():
    def ex(r):
        paper = r.mat('cloth', rough=0.9)
        leather = r.mat('leather', rough=0.7)
        open_book(r, -0.15, 0.905, 0, 0.2, paper, leather)
        candle(r, 0.45, 0.98, -0.2, paper)
        r.part(cone(0.035, 0.03, 0.07, tuple(T(0.3, 0.925, 0.2)), seg=10), 'base', leather, 0x101014)       # インク壺
        r.part(cone(0.004, 0.001, 0.26, tuple(T(0.32, 1.04, 0.2)), rot=(0.3, 0.2, 0), seg=5), 'base', paper, 0xe0d8c8)   # 羽根ペン
    r = table_like('desk', 1.4, 0.8, 0.85, [(-0.6, -0.33), (0.6, -0.33), (-0.6, 0.33), (0.6, 0.33)], extras=ex)
    clay(r, bx(1.25, 0.3, 0.04, 0, 0.62, -0.36))          # 幕板
    clay(r, bx(0.5, 0.16, 0.6, 0.4, 0.73, 0.02))          # 引き出し
    return r


def lectern():
    r = prop('lectern', 'wood', voxel=0.01, tris=2500)
    clay(r, bx(0.5, 0.08, 0.5, 0, 0.04, 0))
    clay(r, bx(0.36, 0.06, 0.36, 0, 0.11, 0))
    clay(r, cy(0.06, 0.085, 1.0, 0, 0.62, 0, 8))
    clay(r, cy(0.1, 0.1, 0.06, 0, 0.5, 0, 8))
    clay(r, bx(0.3, 0.12, 0.2, 0, 1.1, 0))
    r.clay.append(lambda bm: bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(T(0, 1.18, 0)) @ Euler((0.35, 0, 0), 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((0.62, 0.46, 0.05, 1)))['verts'])
    r.clay.append(lambda bm: bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(T(0, 1.13, 0.22)) @ Euler((0.35, 0, 0), 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((0.62, 0.04, 0.06, 1)))['verts'])
    r.color_fn = wood_col(DARK, 0.2, 0)
    paper = r.mat('cloth', rough=0.9)
    leather = r.mat('leather', rough=0.7)
    for sx in (-1, 1):
        r.part(box((0.24, 0.34, 0.03), tuple(T(sx * 0.122, 1.235, 0.0)), rot=(0.35, sx * 0.08, 0)), 'base', paper, 0xd8ccac, smooth=False)
    r.part(box((0.52, 0.37, 0.014), tuple(T(0, 1.212, 0.0)), rot=(0.35, 0, 0)), 'base', leather, 0x4a1418, smooth=False)
    return r


def pew():
    r = prop('pew', 'wood', voxel=0.012, tris=3000)
    clay(r, bx(2.6, 0.08, 0.5, 0, 0.48, 0))
    clay(r, bx(2.6, 0.6, 0.06, 0, 0.8, -0.24))
    clay(r, bx(2.6, 0.07, 0.1, 0, 1.12, -0.24))
    for x in (-1.2, 0, 1.2):
        clay(r, bx(0.08, 1.0 if x else 0.48, 0.55, x, 0.5 if x else 0.24, 0))
    for x in (-1.2, 1.2):
        clay(r, cy(0.07, 0.07, 0.08, x, 1.04, -0.2, 10))
    r.color_fn = wood_col(DARK, 0.3, 0)
    return r


def barrel():
    r = prop('barrel', 'wood', voxel=0.009, tris=2600, smooth=3)
    prof = lambda t: 0.3 + 0.045 * math.sin(t * math.pi)
    N = 12
    for i in range(N):                     # 胴: ふくらみのある輪郭を重ねる
        t0, t1 = i / N, (i + 1) / N
        clay(r, cy(prof(t1), prof(t0), 0.96 / N + 0.004, 0, 0.96 * (t0 + t1) / 2, 0, 28))
    dent(r, T(0, 0.99, 0), (0.275, 0.275, 0.06), 0.045)       # 上は縁が立ち、蓋が一段落ちている
    n = 14
    for k in range(n):                     # 樽板の継ぎ目
        a = (k + 0.5) / n * TAU
        dent(r, T(math.cos(a) * 0.335, 0.48, math.sin(a) * 0.335), (0.011, 0.011, 0.6), 0.016)
    lid(r, T(0, 0.93, 0))
    rnd = random.Random(2)
    tone = [rnd.uniform(0.75, 1.15) for _ in range(n)]
    def col(p, near, nn):
        k = int(math.floor((math.atan2(-p.y, p.x) / TAU + 1.0) * n)) % n
        c = tuple(x * tone[k] for x in hexc(0x5c4028))
        c = mix(c, (0.1, 0.07, 0.05), max(0, -nn) * 1.3)
        if p.z < 0.2:
            c = mix(c, (0.12, 0.1, 0.08), 0.5 * (1 - p.z / 0.2))          # 床の湿りを吸った裾
        return c
    r.color_fn = col
    iron = r.mat('rust', rough=0.6, metal=0.6)
    for y in (0.13, 0.36, 0.6, 0.83):
        r.part(ring(prof(y / 0.96) + 0.006, 0.024, tuple(T(0, y, 0)), seg=28), 'base', iron, 0x3a3430)
    r.part(cone(0.272, 0.272, 0.03, tuple(T(0, 0.925, 0)), seg=24), 'lid', 0, 0x4a3422)
    r.part(box((0.5, 0.04, 0.012), tuple(T(0, 0.945, 0))), 'lid', 0, 0x3a2818, smooth=False)
    return r


def crate_shape(r, s, x, y, z, ry=0.0, bone='base'):
    """板を打ち付けた木箱"""
    def f(bm):
        vs = []
        rot = Euler((0, 0, ry), 'XYZ').to_matrix().to_4x4()
        base = Matrix.Translation(T(x, y, z)) @ rot
        vs += bmesh.ops.create_cube(bm, size=1.0, matrix=base @ Matrix.Diagonal((s * 0.94, s * 0.94, s * 0.94, 1)))['verts']
        n = 4
        for face in range(4):
            fr = Euler((0, 0, face * math.pi / 2), 'XYZ').to_matrix().to_4x4()
            for k in range(n):
                vs += bmesh.ops.create_cube(bm, size=1.0, matrix=base @ fr @ Matrix.Translation((0, -s / 2 + 0.012, (k - (n - 1) / 2) * s / n)) @ Matrix.Diagonal((s, 0.03, s / n * 0.93, 1)))['verts']
            for sx in (-1, 1):
                vs += bmesh.ops.create_cube(bm, size=1.0, matrix=base @ fr @ Matrix.Translation((sx * (s / 2 - 0.045), -s / 2 - 0.004, 0)) @ Matrix.Diagonal((0.09, 0.03, s * 1.02, 1)))['verts']
            vs += bmesh.ops.create_cube(bm, size=1.0, matrix=base @ fr @ Matrix.Translation((0, -s / 2 - 0.006, 0)) @ Euler((0, math.pi / 4, 0), 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((0.08, 0.025, s * 1.25, 1)))['verts']
        return vs
    clay(r, f)


def crate():
    r = prop('crate', 'wood', voxel=0.011, tris=2600, smooth=2)
    s = 0.8
    crate_shape(r, s, 0, s / 2 - 0.02, 0)
    lid(r, T(0, s - 0.02, 0))
    for k in range(4):
        r.part(pbox(s * 1.02, 0.05, s / 4 * 0.95, 0, s - 0.02, (k - 1.5) * s / 4), 'lid', 0, (0x5a4026, 0x6a4c2e, 0x52391f, 0x64472a)[k], smooth=False)
    for sx in (-1, 1):
        r.part(pbox(0.08, 0.03, s * 1.0, sx * s * 0.36, s + 0.018, 0), 'lid', 0, 0x4a3420, smooth=False)
    r.color_fn = wood_col(0x6a4c2e, 0.2, 2)
    return r


def cratestack():
    r = prop('cratestack', 'wood', voxel=0.014, tris=5000, smooth=2)
    crate_shape(r, 0.9, -0.5, 0.45, 0.05, 0.1)
    crate_shape(r, 0.82, 0.5, 0.41, -0.08, -0.2)
    crate_shape(r, 0.7, -0.15, 1.2, 0.0, 0.35)
    for k in range(2):                     # 麻袋
        c = T(1.2 + k * 0.1, 0.34, 0.4 - k * 0.6)
        clay(r, ell(c, (0.32, 0.26, 0.36)))
        clay(r, ell(c + V((0, 0, 0.36)), (0.1, 0.08, 0.07)))
    sacks = [T(1.2 + k * 0.1, 0.34, 0.4 - k * 0.6) for k in range(2)]
    r.color_fn = wood_col(0x6a4c2e, 0.2, 2)
    r.regions = [('cloth', lambda p, nb: max(sm(0.5 - (p - c).length, 0.0, 0.1) for c in sacks), 0x80694a, 0.95, 0.0)]
    return r


def stone_col(base=0x6e6a62, moss=0.4):
    def f(p, near, n):
        c = mix(hexc(base), (0.16, 0.15, 0.13), max(0, -n) * 1.6)
        c = mix(c, (0.62, 0.6, 0.54), max(0, n - 0.3) * 1.0)
        if p.z < 0.5:
            c = mix(c, (0.16, 0.22, 0.12), moss * (1 - p.z / 0.5) * (0.4 + 0.6 * max(0, n + 0.3)))
        return c
    return f


def coffin():
    r = prop('coffin', 'stone', rough=0.95, voxel=0.016, tris=3000, smooth=3, scale=1.2)
    clay(r, bx(0.9, 0.6, 2.0, 0, 0.3, 0))
    clay(r, bx(0.98, 0.1, 2.08, 0, 0.05, 0))
    dent(r, T(0, 0.62, 0), (0.36, 0.9, 0.2), 0.12)                    # 中は空
    lid(r, T(0.12, 0.66, 0.15))
    # 蓋(少しずれている)と、浮き彫り: 口を閉ざす印(沈黙の夜に葬られた者)
    r.part(pbox(0.95, 0.12, 2.05, 0.12, 0.66, 0.15, 0.12), 'lid', 0, 0x6e6a62, smooth=False)
    r.part(pbox(0.8, 0.05, 1.9, 0.12, 0.74, 0.15, 0.12), 'lid', 0, 0x77736a, smooth=False)
    r.part(pbox(0.1, 0.035, 1.2, 0.12, 0.78, 0.15, 0.12), 'lid', 0, 0x5c5850, smooth=False)
    r.part(pbox(0.5, 0.035, 0.1, 0.09, 0.78, -0.1, 0.12), 'lid', 0, 0x5c5850, smooth=False)
    r.color_fn = stone_col()
    return r


def sarcophagus():
    r = prop('sarcophagus', 'stone', rough=0.95, voxel=0.02, tex=1024, tris=5000, smooth=4, scale=1.5)
    clay(r, bx(1.3, 0.25, 2.6, 0, 0.125, 0))
    clay(r, bx(1.1, 0.8, 2.3, 0, 0.65, 0))
    clay(r, bx(1.25, 0.16, 2.45, 0, 1.13, 0))
    for sx in (-1, 1):                     # 側面の柱形
        for k in range(4):
            clay(r, bx(0.06, 0.7, 0.14, sx * 0.56, 0.65, -0.9 + k * 0.6))
    # 蓋に眠る者の像: 手を口に当てている(声を封じて葬られた)
    clay(r, ell(T(0, 1.33, 0.15), (0.26, 0.62, 0.15)))
    clay(r, ell(T(0, 1.36, -0.82), (0.17, 0.2, 0.16)))
    clay(r, ell(T(0, 1.3, -0.6), (0.2, 0.14, 0.1)))
    for sx in (-1, 1):
        clay(r, cap(T(sx * 0.27, 1.3, -0.3), T(sx * 0.1, 1.4, -0.68), 0.07, 0.06))
        clay(r, cap(T(sx * 0.12, 1.3, 0.5), T(sx * 0.12, 1.28, 1.05), 0.1, 0.08))
    clay(r, ell(T(0, 1.42, -0.7), (0.12, 0.09, 0.06)))
    r.color_fn = stone_col(0x77736a)
    wax = r.mat('cloth', rough=0.9)
    for sx in (-1, 1):
        for sz in (-1, 1):
            r.part(cone(0.03, 0.04, 0.3, tuple(T(sx * 0.75, 0.15, sz * 1.4)), seg=10), 'base', wax, 0xd8ccae)
    return r


def pillar():
    r = prop('pillar', 'stone', rough=0.95, voxel=0.035, tex=1024, tris=4000, smooth=3, scale=2.5)
    clay(r, bx(1.2, 0.3, 1.2, 0, 0.15, 0))
    clay(r, bx(1.0, 0.16, 1.0, 0, 0.38, 0))
    clay(r, bx(1.2, 0.3, 1.2, 0, 6.25, 0))
    clay(r, bx(1.0, 0.16, 1.0, 0, 6.02, 0))
    for k in range(16):                    # 縦溝のある柱身(溝は外周に並べた細い柱で表す)
        a = k / 16 * TAU
        clay(r, cy(0.085, 0.095, 5.5, math.cos(a) * 0.4, 3.2, math.sin(a) * 0.4, 10))
    clay(r, cy(0.4, 0.44, 5.5, 0, 3.2, 0, 24))
    clay(r, cy(0.56, 0.56, 0.14, 0, 0.52, 0, 24))
    clay(r, cy(0.56, 0.56, 0.14, 0, 5.9, 0, 24))
    # 言霊の帯(目の高さ)
    clay(r, cy(0.5, 0.5, 0.5, 0, 2.2, 0, 24))
    rnd = random.Random(9)
    for k in range(10):
        a = k / 10 * TAU
        for j in range(rnd.randint(2, 4)):
            yy = 2.02 + j * 0.11 + rnd.uniform(0, 0.03)
            dent(r, T(math.cos(a) * 0.5, yy, math.sin(a) * 0.5), (0.06, 0.06, 0.016), 0.03)
        dent(r, T(math.cos(a) * 0.5, 2.2, math.sin(a) * 0.5), (0.016, 0.016, 0.18), 0.03)
    base = stone_col(0x7a756a, 0.5)
    r.color_fn = lambda p, near, n: mix(base(p, near, n), (0.5, 0.38, 0.15), 0.5 if (1.95 < p.z < 2.45 and math.hypot(p.x, p.y) < 0.485) else 0)
    return r


def statue():
    r = prop('statue', 'stone', rough=0.9, voxel=0.014, tris=5000, smooth=6, scale=1.4, surface='marble')
    clay(r, bx(0.9, 0.5, 0.9, 0, 0.25, 0))
    clay(r, bx(0.76, 0.08, 0.76, 0, 0.54, 0))
    # 学院の導師の像: 指を唇に当て、沈黙を促す
    for i in range(10):
        t = i / 9
        clay(r, cy(0.19 + 0.2 * (1 - t) ** 1.4, 0.19 + 0.2 * (1 - min(1, t + 0.11)) ** 1.4 + 0.02, 0.19, 0, 0.6 + t * 1.55, 0, 20))
    clay(r, ell(T(0, 2.0, 0), (0.3, 0.17, 0.2)))
    clay(r, ell(T(0, 2.32, 0), (0.15, 0.17, 0.18)))
    clay(r, ell(T(0, 2.36, -0.04), (0.2, 0.2, 0.21)))                 # 頭巾
    clay(r, ell(T(0, 2.3, 0.14), (0.02, 0.03, 0.03)))                 # 鼻
    clay(r, cap(T(0.26, 2.0, 0.02), T(0.2, 1.75, 0.2), 0.075, 0.065))
    clay(r, cap(T(0.2, 1.75, 0.2), T(0.03, 2.2, 0.17), 0.06, 0.035))  # 唇へ上げた手
    clay(r, cap(T(-0.27, 2.0, 0.02), T(-0.24, 1.6, 0.14), 0.075, 0.065))
    clay(r, bx(0.24, 0.32, 0.06, -0.22, 1.45, 0.2))                    # 抱えた書
    for i in range(12):
        a = i / 12 * TAU
        dent(r, T(math.cos(a) * 0.33, 1.1, math.sin(a) * 0.33), (0.03, 0.03, 0.45), 0.03)
    for sx in (-1, 1):
        dent(r, T(sx * 0.055, 2.33, 0.15), (0.025, 0.03, 0.015), 0.02)
    r.color_fn = stone_col(0x8a867a, 0.3)
    return r


def bookpile():
    r = prop('bookpile', 'leather', rough=0.75, voxel=0.008, tris=2500, smooth=1)
    rnd = random.Random(8)
    books = []
    for s in range(3):
        x = (s - 1) * 0.4
        y = 0.0
        for i in range(rnd.randint(4, 9)):
            h = rnd.uniform(0.05, 0.1)
            ry = rnd.uniform(-0.5, 0.5)
            w, d = rnd.uniform(0.28, 0.36), rnd.uniform(0.22, 0.28)
            ox, oz = rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0.03)
            clay(r, bx(w, h * 0.96, d, x + ox, y + h / 2, oz, ry))
            books.append((x, y, y + h, rnd.choice((0x5a1a1a, 0x1e3a2a, 0x2a2a4a, 0x4a3a1a, 0x3a1a3a, 0x6a5a3a, 0x202020))))
            y += h

    def col(p, near, n):
        s = min(range(3), key=lambda k: abs(p.x - (k - 1) * 0.4))
        for x, y0, y1, c in books:
            if abs(x - (s - 1) * 0.4) < 1e-6 and y0 <= p.z <= y1:
                t = (p.z - y0) / (y1 - y0)
                if 0.18 < t < 0.82 and n > -0.15:
                    return (0.74, 0.68, 0.54)                           # 小口(紙の束)
                return tuple(v * (0.8 + 0.4 * n) for v in hexc(c))
        return (0.3, 0.2, 0.12)
    r.color_fn = col
    return r


def throne():
    r = prop('throne', 'stone', rough=0.9, voxel=0.022, tex=1024, tris=6000, smooth=3, scale=1.8)
    clay(r, bx(3.0, 0.3, 2.4, 0, 0.15, 0))
    clay(r, bx(2.2, 0.3, 1.8, 0, 0.45, -0.1))
    clay(r, bx(1.2, 0.45, 1.0, 0, 0.82, -0.3))
    clay(r, bx(1.1, 2.4, 0.22, 0, 2.0, -0.75))
    clay(r, bx(1.3, 0.2, 0.3, 0, 3.25, -0.75))
    for x in (-0.55, 0.55):
        clay(r, bx(0.16, 0.5, 0.9, x, 1.2, -0.3))
        clay(r, ell(T(x, 1.47, 0.12), (0.1, 0.12, 0.1)))
        clay(r, cap(T(x, 3.3, -0.75), T(x, 3.75, -0.75), 0.09, 0.02))
    clay(r, cap(T(0, 3.35, -0.75), T(0, 4.0, -0.75), 0.11, 0.02))
    clay(r, bx(1.0, 0.14, 0.86, 0, 1.08, -0.3))                        # 座面の敷物
    clay(r, bx(0.86, 1.9, 0.06, 0, 1.95, -0.62))                       # 背の張り布
    velvet = lambda p, nb: 1.0 if ((1.02 < p.z < 1.2 and abs(p.x) < 0.49 and -p.y > -0.72) or (1.0 < p.z < 2.9 and abs(p.x) < 0.43 and -0.66 < -p.y < -0.57)) else 0.0
    gold = lambda p, nb: (1.0 if (p.z > 0.62 and velvet(p, nb) == 0 and (abs(p.x) > 0.45 or -p.y < -0.6 or p.z > 2.9)) else 0.0)
    r.regions = [('cloth', velvet, 0x5a1014, 0.9, 0.0), ('metal', gold, 0x9a7a38, 0.4, 0.85)]
    r.color_fn = stone_col(0x6a665e, 0.2)
    return r


def anvil():
    r = prop('anvil', 'steel', rough=0.5, metal=0.7, voxel=0.01, tris=2500, smooth=3, surface='metal')
    clay(r, bx(0.7, 0.25, 0.3, 0, 0.75, 0))
    clay(r, bx(0.3, 0.35, 0.22, 0, 0.45, 0))
    clay(r, bx(0.5, 0.1, 0.3, 0, 0.33, 0))
    clay(r, cap(T(0.3, 0.76, 0), T(0.68, 0.8, 0), 0.11, 0.02))
    clay(r, bx(0.6, 0.3, 0.6, 0, 0.15, 0))
    r.color_fn = lambda p, near, n: mix((0.16, 0.16, 0.18), (0.05, 0.05, 0.06), max(0, -n) * 1.5) if p.z > 0.3 else wood_col(0x4a3420, 0.2, 0)(p, near, n)
    r.regions = [('wood', lambda p, nb: 1.0 if p.z < 0.3 else 0.0, lambda p, n: wood_col(0x4a3420, 0.2, 0)(p, None, n), 0.85, 0.0)]
    wood = r.mat('wood', rough=0.8)
    r.part(box((0.2, 0.08, 0.08), tuple(T(0.1, 0.92, 0.1))), 'base', 0, 0x2a2a2e, smooth=False)
    r.part(cone(0.02, 0.02, 0.4, tuple(T(0.1, 0.92, 0.3)), rot=(math.pi / 2, 0, 0), seg=8), 'base', wood, 0x4a3420)
    return r


def obelisk():
    r = prop('obelisk', 'stone', rough=0.35, metal=0.15, voxel=0.016, tris=2500, smooth=2, scale=1.6, surface='marble')
    def f(bm):
        return bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=0.45, radius2=0.2, depth=3.4, matrix=Matrix.Translation(T(0, 1.7, 0)) @ Euler((0, 0, math.pi / 4), 'XYZ').to_matrix().to_4x4())['verts']
    clay(r, f)
    clay(r, lambda bm: bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=0.2, radius2=0.0, depth=0.4, matrix=Matrix.Translation(T(0, 3.6, 0)) @ Euler((0, 0, math.pi / 4), 'XYZ').to_matrix().to_4x4())['verts'])
    clay(r, bx(0.9, 0.2, 0.9, 0, 0.1, 0))
    r.color_fn = lambda p, near, n: mix((0.035, 0.03, 0.045), (0.12, 0.1, 0.16), max(0, n) * 0.8)
    glow = r.mat('guardian-coreMat', 0xc060ff, emit=3.0)
    rnd = random.Random(4)
    for face in range(4):                  # 四面に刻まれた言霊(光る)
        a = face * math.pi / 2
        for k in range(7):
            y = 0.7 + k * 0.36
            half = 0.3 - (y / 3.4) * 0.17
            w = half * rnd.uniform(0.7, 1.3)
            d = (0.318 - (y / 3.4) * 0.177) + 0.004
            r.part(box((w, 0.01, 0.035), (math.sin(a) * d, -math.cos(a) * d, y), rot=(0.07 if face % 2 == 0 else 0, 0, a)), 'base', glow, 0xc060ff, smooth=False)
            if k % 2:
                r.part(box((0.03, 0.01, 0.2), (math.sin(a) * d + math.cos(a) * w * 0.3, -math.cos(a) * d + math.sin(a) * w * 0.3, y - 0.12), rot=(0, 0, a)), 'base', glow, 0xc060ff, smooth=False)
    return r


BUILDERS = {'wallshelf': wallshelf, 'shelf': shelf, 'readtable': readtable, 'longtable': longtable, 'desk': desk, 'lectern': lectern, 'pew': pew,
            'barrel': barrel, 'crate': crate, 'cratestack': cratestack, 'coffin': coffin, 'sarcophagus': sarcophagus, 'pillar': pillar, 'statue': statue,
            'bookpile': bookpile, 'throne': throne, 'anvil': anvil, 'obelisk': obelisk}

if __name__ == '__main__':
    pv = os.environ.get('PREVIEW')
    for name, fn in BUILDERS.items():
        if ONLY and name not in ONLY:
            continue
        try:
            forge.build(fn(), os.path.abspath(os.path.join(OUT, 'decor-' + name + '.glb')), preview=os.path.join(pv, 'decor-' + name + '.png') if pv else None)
        except Exception as e:
            import traceback
            traceback.print_exc()
            print('FAILED', name, e)
