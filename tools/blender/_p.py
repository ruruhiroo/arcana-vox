f='tools/blender/rig.py'; s=open(f,encoding='utf8').read()
def rep(a,b):
    global s
    assert a in s, a[:70]
    s=s.replace(a,b,1)
rep("""                    pb.keyframe_insert('location', frame=f)
                    q = pose.get('_rot', q)""","""                    pb.keyframe_insert('location', frame=f)
                    sc = pose.get('_scl')
                    if sc is not None:
                        # 根の伸び縮み(骨の軸: Y=上下)
                        pb.scale = Vector((sc[0], sc[2], sc[1]))
                        pb.keyframe_insert('scale', frame=f)
                    q = pose.get('_rot', q)""")
rep("""        pb.location = Vector()""","""        pb.location = Vector()
        pb.scale = Vector((1, 1, 1))""")
open(f,'w',encoding='utf8').write(s)
f='tools/blender/build_models.py'; s=open(f,encoding='utf8').read()
rep("""def robed(name, H, ROBE, TRIM, eyec, skeletal=False, staff=False, crown=False):""","""def robed(name, H, ROBE, TRIM, eyec, skeletal=False, staff=False, crown=False, book=True, tatters=False, attack='cast'):""")
rep("""    hl = J(r, 'hand_L')
    r.part(box((0.22, 0.04, 0.28), (hl.x, hl.y + 0.12, hl.z + 0.02), rot=(0.4, 0, 0)), 'hand_L', robe, 0x5a2a18, smooth=False)  # 本
    float_anims(r, attack='cast')""","""    hl = J(r, 'hand_L')
    if book:
        r.part(box((0.22, 0.04, 0.28), (hl.x, hl.y + 0.12, hl.z + 0.02), rot=(0.4, 0, 0)), 'hand_L', robe, 0x5a2a18, smooth=False)  # 本
    if tatters:  # ぼろぼろの裾: 垂れ下がる布の切れ端
        R0 = 0.5 * H / 1.8
        for i in range(14):
            a = i / 14 * TAU
            r.part(cone(0.07, 0.0, 0.35 + 0.15 * ((i * 7) % 3), (math.cos(a) * R0 * 0.92, math.sin(a) * R0 * 0.92 - 0.02, -0.12), rot=(math.pi, 0, 0), seg=4), 'hips', robe, robe_col)
    float_anims(r, attack=attack)""")
rep("""def golem():""","""def wraith():
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


def golem():""")
rep("""            'lich': lich, 'golem': golem, 'spider': spider, 'bat': bat}""","""            'lich': lich, 'golem': golem, 'spider': spider, 'bat': bat, 'wraith': wraith, 'slime': slime}""")
open(f,'w',encoding='utf8').write(s); print('ok')
