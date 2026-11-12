# 迷宮の壁・床・天井の質感を作る(高さの地図から、色・法線・粗さを起こす)。
#   blender -b --factory-startup -P tools/blender/build_surfaces.py -- public/textures
# 壁は「沈んだ声の学院」の壁: 腰石、切石積み、言霊を刻んだ帯(金箔の名残)、軒の繰形。
# 一枚が壁の一区画(幅4m × 高さ6.4m)に当たる。左右は継ぎ目なくつながる。
import bpy, sys, os, math
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else 'public/textures')
os.makedirs(OUT, exist_ok=True)


def fbm(h, w, seed, beta=2.2, wm=4.0, hm=4.0):
    """周期的な雑音(0〜1)。beta が大きいほど、なだらか"""
    rng = np.random.default_rng(seed)
    ky = np.fft.fftfreq(h)[:, None] * h / hm
    kx = np.fft.fftfreq(w)[None, :] * w / wm
    k = np.sqrt(kx * kx + ky * ky)
    k[0, 0] = 1
    spec = (rng.normal(size=(h, w)) + 1j * rng.normal(size=(h, w))) / k ** (beta / 2)
    spec[0, 0] = 0
    n = np.fft.ifft2(spec).real
    return np.clip(0.5 + (n - n.mean()) / n.std() / 5.0, 0, 1)      # ばらつきを揃える(標準偏差 0.2)


def blur(a, sx, sy=None):
    sy = sx if sy is None else sy
    h, w = a.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * math.pi ** 2 * (sx * sx * fx * fx + sy * sy * fy * fy))
    return np.fft.ifft2(np.fft.fft2(a) * g).real


def sstep(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def blocks(U, V, y0, y1, courses, per_row, seed, wm):
    """切石積み: 各画素の (縁までの距離[m], 石の番号)"""
    rng = np.random.default_rng(seed)
    ch = (y1 - y0) / courses
    row = np.clip(np.floor((V - y0) / ch), 0, courses - 1).astype(int)
    edge = np.full(U.shape, 9.0)
    bid = np.zeros(U.shape, dtype=int)
    for r in range(courses):
        m = row == r
        n = per_row[r % len(per_row)]
        cuts = np.sort((np.arange(n) + rng.uniform(-0.18, 0.18, n) + (0.5 if r % 2 else 0)) / n * wm) % wm
        cuts = np.sort(cuts)
        u = U[m]
        d = np.full(u.shape, 9.0)
        idx = np.zeros(u.shape, dtype=int)
        for i, c in enumerate(cuts):
            dd = np.abs((u - c + wm / 2) % wm - wm / 2)
            d = np.minimum(d, dd)
        idx = np.searchsorted(cuts, u) % n
        v = V[m] - (y0 + r * ch)
        edge[m] = np.minimum(d, np.minimum(v, ch - v))
        bid[m] = r * 17 + idx
    return edge, bid


def glyphs(U, V, y0, y1, cells, wm, seed):
    """言霊の刻み: 一区画ごとに、横・縦・斜めの画を組んだ文字のような形。溝の深さ(0〜1)を返す"""
    rng = np.random.default_rng(seed)
    g = np.zeros(U.shape)
    cw = wm / cells
    gh = (y1 - y0)
    for c in range(cells):
        cx = (c + 0.5) * cw
        cy = (y0 + y1) / 2
        size = min(cw, gh) * 0.36
        strokes = []
        for k in range(rng.integers(5, 9)):
            kind = rng.integers(0, 4)
            a = (rng.uniform(-1, 1), rng.uniform(-1, 1))
            L = rng.uniform(0.5, 1.6)
            if kind == 0: b = (a[0] + L, a[1])
            elif kind == 1: b = (a[0], a[1] - L)
            elif kind == 2: b = (a[0] + L * 0.6, a[1] - L * 0.6)
            else: b = (a[0] - L * 0.5, a[1] - L * 0.7)
            strokes.append((a, (max(-1, min(1, b[0])), max(-1, min(1, b[1])))))
        strokes.append(((-1, 1), (1, 1)))          # 冠(上の横画)で文字らしくまとめる
        x = (U - cx) / size
        y = (V - cy) / size
        m = (np.abs(x) < 1.4) & (np.abs(y) < 1.4)
        xs, ys = x[m], y[m]
        d = np.full(xs.shape, 9.0)
        for (ax, ay), (bx, by) in strokes:
            abx, aby = bx - ax, by - ay
            L2 = max(1e-6, abx * abx + aby * aby)
            t = np.clip(((xs - ax) * abx + (ys - ay) * aby) / L2, 0, 1)
            d = np.minimum(d, np.hypot(xs - (ax + abx * t), ys - (ay + aby * t)))
        g[m] = np.maximum(g[m], 1 - sstep(d * size, 0.012, 0.03))
    return g


def finish(name, H, col, rough, wm, hm, strength=1.0):
    """高さ(m)から法線と陰影を起こし、色・法線・粗さを書き出す"""
    h, w = H.shape
    px = wm / w
    py = hm / h
    dx = (np.roll(H, -1, 1) - np.roll(H, 1, 1)) / (2 * px) * strength
    dy = (np.roll(H, -1, 0) - np.roll(H, 1, 0)) / (2 * py) * strength
    if hm != wm:     # 上下はつながらないので、端の差分を作り直す
        dy[0, :] = (H[1, :] - H[0, :]) / py * strength
        dy[-1, :] = (H[-1, :] - H[-2, :]) / py * strength
    nz = 1 / np.sqrt(dx * dx + dy * dy + 1)
    N = np.stack([-dx * nz * 0.5 + 0.5, -dy * nz * 0.5 + 0.5, nz * 0.5 + 0.5], -1)
    # 陰影: まわりより低い所ほど暗い(細かい溝と、大きなくぼみの二段)
    ao = 1 - np.clip((blur(H, 0.012 / px) - H) * 22, 0, 0.6) - np.clip((blur(H, 0.06 / px) - H) * 7, 0, 0.3)
    # 上からの淡い光を焼いて、凹凸を見えやすくする
    lit = np.clip(1 + (-dy * nz) * 0.35, 0.7, 1.25)
    C = np.clip(col * (ao * lit)[..., None], 0, 1)

    def save(arr, suffix, srgb):
        a = np.ones((h, w, 4), dtype=np.float32)
        a[..., :3] = arr if arr.ndim == 3 else arr[..., None]
        img = bpy.data.images.new(name + suffix, w, h, alpha=False)
        if not srgb:
            img.colorspace_settings.name = 'Non-Color'
        img.pixels.foreach_set(a.reshape(-1))
        img.filepath_raw = os.path.join(OUT, name + suffix + '.jpg')
        img.file_format = 'JPEG'
        img.save()
        print('saved', img.filepath_raw, os.path.getsize(img.filepath_raw) // 1024, 'KB')
    save(C ** (1 / 2.2), '_color', True)
    save(N, '_normal', False)
    save(np.clip(rough, 0.05, 1), '_rough', False)


def wall():
    WM, HM = 4.0, 6.4
    w, h = 1024, 1638
    U, V = np.meshgrid((np.arange(w) + 0.5) / w * WM, (np.arange(h) + 0.5) / h * HM)
    n1 = fbm(h, w, 1, 2.6, WM, HM)        # 大きなうねり
    n2 = fbm(h, w, 2, 1.6, WM, HM)        # 石肌
    n3 = fbm(h, w, 3, 1.0, WM, HM)        # 細かな粒
    n4 = fbm(h, w, 4, 2.2, WM, HM)        # 染み
    H = np.zeros((h, w))
    PL, F0, F1, CO = 0.36, 3.42, 4.22, 6.02     # 腰石の上端 / 刻みの帯 / 軒
    # 切石積み(下段と上段)
    e1, b1 = blocks(U, V, PL, F0, 5, [3, 4], 11, WM)
    e2, b2 = blocks(U, V, F1, CO, 2, [3, 2], 12, WM)
    lower = (V >= PL) & (V < F0)
    upper = (V >= F1) & (V < CO)
    edge = np.where(lower, e1, np.where(upper, e2, 9.0))
    bid = np.where(lower, b1, np.where(upper, b2 + 500, 0))
    rnd = np.random.default_rng(5).uniform(-1, 1, 2000)
    lift = rnd[bid % 2000] * 0.012
    stone = lower | upper
    # 目地: 角の欠けを足してから、丸みのある縁で落とす
    chip = np.clip((n2 - 0.62) * 3, 0, 1) * 0.035
    groove = sstep(edge - chip, 0.004, 0.045)
    H += np.where(stone, groove * (0.035 + lift) + (n1 - 0.5) * 0.02, 0)
    # 腰石: 一段出ていて、上の角を面取りしてある
    pl = V < PL
    H += np.where(pl, 0.06 * sstep(PL - V, 0.0, 0.07) + 0.02, 0)
    pe = np.abs((U + 1.0) % 2.0 - 1.0)             # 腰石の継ぎ目(2mごと)
    H -= np.where(pl, (1 - sstep(1.0 - pe, 0.0, 0.02)) * 0.03, 0)
    # 言霊を刻んだ帯: 上下を繰形で縁取り、少し引っ込める
    fr = (V >= F0) & (V < F1)
    mould = np.maximum(1 - sstep(np.abs(V - (F0 + 0.06)), 0.02, 0.06), 1 - sstep(np.abs(V - (F1 - 0.06)), 0.02, 0.06))
    g = glyphs(U, V, F0 + 0.14, F1 - 0.14, 5, WM, 21)
    worn = sstep(n4, 0.25, 0.6)                      # 所々すり減って読めない
    H += np.where(fr, 0.012 + mould * 0.035 - g * 0.03 * worn, 0)
    # 軒の繰形: 段になって迫り出す
    co = V >= CO
    t = (V - CO) / (HM - CO)
    H += np.where(co, 0.03 + 0.05 * sstep(t, 0.1, 0.3) + 0.04 * sstep(t, 0.55, 0.7) - 0.02 * (1 - sstep(np.abs(t - 0.45), 0.03, 0.08)), 0)
    # ひび: 数本、斜めに走る
    crack = np.zeros((h, w))
    rng = np.random.default_rng(31)
    for k in range(3):
        x0, y0, a = rng.uniform(0, WM), rng.uniform(0.6, 5.6), rng.uniform(1.0, 2.2)
        L = rng.uniform(0.7, 1.8)
        tt = np.clip(((U - x0) * math.cos(a) + (V - y0) * math.sin(a)) / L, 0, 1)
        wob = (n1 - 0.5) * 0.5 + (n2 - 0.5) * 0.05
        d = np.abs(-(U - x0) * math.sin(a) + (V - y0) * math.cos(a) + wob)
        inside = (((U - x0) * math.cos(a) + (V - y0) * math.sin(a)) > 0) & (((U - x0) * math.cos(a) + (V - y0) * math.sin(a)) < L)
        crack = np.maximum(crack, np.where(inside, (1 - sstep(d, 0.0015, 0.006)) * np.sin(tt * math.pi) ** 0.5, 0))
    H -= crack * 0.02
    H += (n2 - 0.5) * 0.012 + (n3 - 0.5) * 0.004          # 石肌と粒

    # ---- 色 ----
    tint = rnd[(bid * 7 + 3) % 2000]
    base = np.stack([0.2 + tint * 0.05, 0.183 + tint * 0.044, 0.16 + tint * 0.036], -1)
    base = base * (0.5 + 1.0 * n2[..., None]) * (0.7 + 0.6 * n1[..., None])
    base = base * (0.72 + 0.28 * sstep(edge, 0.0, 0.14))[..., None]              # 目地のそばに溜まった汚れ
    base = base * (1 - 0.4 * sstep(n4, 0.55, 0.8))[..., None]                    # 大きな染み
    mortar = np.array([0.1, 0.09, 0.08])
    col = np.where((stone & (groove < 0.35))[..., None], mortar, base)
    col = np.where(pl[..., None], base * 0.82, col)
    col = np.where(fr[..., None], base * 0.92, col)
    gold = np.array([0.52, 0.4, 0.16])                   # 刻みに残る金箔
    gm = (g * worn * sstep(n3, 0.35, 0.6))[..., None] * fr[..., None]
    col = col * (1 - 0.75 * (g * worn)[..., None] * fr[..., None]) + gold * gm * 0.75
    col = np.where(co[..., None], base * 0.74, col)
    col = col * (1 - 0.8 * crack[..., None])
    damp = (1 - sstep(V, 0.0, 1.5)) * (0.55 + 0.45 * n4)   # 床に近い所の湿りと苔
    col = col * (1 - 0.42 * damp[..., None]) + np.array([0.035, 0.06, 0.03]) * (damp * sstep(n4, 0.45, 0.75))[..., None]
    streak = blur(sstep(fbm(h, w, 9, 1.2, WM, HM), 0.62, 0.8), 1.5, 40) * sstep(V, 2.6, 6.2)   # 軒から垂れた煤と水の筋
    col = col * (1 - 0.5 * np.clip(streak * 2.2, 0, 1)[..., None])
    rough = 0.9 - 0.3 * damp - 0.3 * gm[..., 0] + (n3 - 0.5) * 0.1
    finish('wall', H, col, rough, WM, HM, 1.0)


def floor():
    M = 4.0
    w = h = 1024
    U, V = np.meshgrid((np.arange(w) + 0.5) / w * M, (np.arange(h) + 0.5) / h * M)
    n1, n2, n3, n4 = fbm(h, w, 41, 2.6), fbm(h, w, 42, 1.6), fbm(h, w, 43, 1.0), fbm(h, w, 44, 2.4)
    # 敷石: 幅の違う列(列ごとに石の長さもずれる)
    edge, bid = blocks(V, U, 0.0, M, 5, [3, 4, 3, 5, 4], 51, M)
    rnd = np.random.default_rng(6).uniform(-1, 1, 2000)
    chip = np.clip((n2 - 0.6) * 3, 0, 1) * 0.03
    groove = sstep(edge - chip, 0.003, 0.03)
    tilt = rnd[bid % 2000] * 0.006
    wear = blur(sstep(n4, 0.4, 0.7), 20)                 # 人が歩いてすり減った筋
    H = groove * (0.022 + tilt) * (1 - 0.35 * wear) + (n1 - 0.5) * 0.012 + (n2 - 0.5) * 0.008 * (1 - 0.6 * wear) + (n3 - 0.5) * 0.003
    crack = (1 - sstep(np.abs(fbm(h, w, 47, 2.0) - 0.5), 0.004, 0.012)) * sstep(n1, 0.5, 0.7)
    H -= crack * 0.012
    tint = rnd[(bid * 5 + 1) % 2000]
    base = np.stack([0.15 + tint * 0.04, 0.14 + tint * 0.036, 0.125 + tint * 0.03], -1) * (0.5 + 1.0 * n2[..., None]) * (0.72 + 0.28 * sstep(edge, 0.0, 0.1))[..., None]
    col = np.where((groove < 0.3)[..., None], np.array([0.07, 0.062, 0.055]), base)
    col = col * (1 + 0.12 * wear[..., None]) * (1 - 0.7 * crack[..., None])
    wet = sstep(n4, 0.62, 0.8) * (1 - groove * 0.0)        # 湿った所は暗く、艶がある
    col = col * (1 - 0.35 * wet[..., None])
    rough = 0.88 - 0.25 * wear - 0.5 * wet + (n3 - 0.5) * 0.1
    finish('floor', H, col, rough, M, M, 1.0)


def ceil():
    M = 4.0
    w = h = 512
    U, V = np.meshgrid((np.arange(w) + 0.5) / w * M, (np.arange(h) + 0.5) / h * M)
    n1, n2, n3 = fbm(h, w, 61, 2.8), fbm(h, w, 62, 1.8), fbm(h, w, 63, 1.0)
    edge, bid = blocks(U, V, 0.0, M, 2, [2, 2], 71, M)       # 大きな天井石
    groove = sstep(edge, 0.006, 0.06)
    H = groove * 0.04 + (n1 - 0.5) * 0.06 + (n2 - 0.5) * 0.02 + (n3 - 0.5) * 0.004
    base = np.array([0.075, 0.07, 0.064]) * (0.5 + 1.0 * n2[..., None])
    col = np.where((groove < 0.3)[..., None], np.array([0.03, 0.028, 0.026]), base)
    soot = sstep(n1, 0.45, 0.75)
    col = col * (1 - 0.6 * soot[..., None])
    finish('ceil', H, col, 0.95 + (n3 - 0.5) * 0.06, M, M, 1.0)


for fn in (wall, floor, ceil):
    try:
        fn()
    except Exception as e:
        import traceback
        traceback.print_exc()
        print('FAILED', fn.__name__, e)
