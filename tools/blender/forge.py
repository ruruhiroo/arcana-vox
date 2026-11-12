# 造形の炉: 骨格の定義(rig.Rig)から、彫り込んだ高密度の形を作り、その凹凸・色・質感を
# 少ない面数のゲーム用メッシュへ焼き込んで(法線・色・粗さ/金属)、骨入りの glTF として書き出す。
#   粘土(骨に沿った球と円錐をボクセルで一体化) → 高密度(細分+表面ごとの彫り) → 低密度(間引き+UV) → 焼き込み
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix, Quaternion, noise, kdtree
from rig import srgb, seg_dist, clear_scene

# 材質の名前 → 表面の彫り方
SURFACE_OF = {
    'bone': 'bone', 'skin': 'skin', 'body': 'skin', 'rust': 'metal', 'steel': 'metal', 'mail': 'mail', 'gold': 'metal',
    'cloth': 'cloth', 'robe': 'cloth', 'wood': 'wood', 'claw': 'horn', 'horn': 'horn', 'fang': 'horn', 'stone': 'stone',
    'chitin': 'chitin', 'fur': 'fur', 'slime': 'slime', 'membrane': 'membrane', 'core': 'slime', 'scales': 'scales',
    'ice': 'ice', 'feather': 'feather', 'marble': 'marble', 'hide': 'hide', 'leather': 'leather',
}
# 表面ごとの彫り: (模様, 大きさ[m], 深さ[m], 追加の設定)。S(体格)を掛けて使う
PRESETS = {
    'skin':    [('CLOUDS', 0.2, 0.006, {}), ('STUCCI', 0.04, 0.0035, {}), ('STUCCI', 0.011, 0.0016, {}), ('VORONOI', 0.0035, -0.0005, {}), ('CLOUDS', 0.0025, 0.0005, {})],
    'hide':    [('CLOUDS', 0.2, 0.02, {}), ('VORONOI', 0.03, -0.006, {}), ('STUCCI', 0.02, 0.004, {}), ('CLOUDS', 0.005, 0.0012, {})],
    'scales':  [('CLOUDS', 0.3, 0.02, {}), ('VORONOI', 0.05, -0.016, {}), ('VORONOI', 0.013, -0.003, {}), ('CLOUDS', 0.004, 0.0008, {})],
    'bone':    [('CLOUDS', 0.05, 0.003, {}), ('CRACK', 0.06, 0.0012, {}), ('STUCCI', 0.01, 0.0008, {}), ('VORONOI', 0.003, -0.0005, {})],
    'horn':    [('STUCCI', 0.02, 0.002, {}), ('CLOUDS', 0.03, 0.002, {})],
    'stone':   [('CLOUDS', 0.22, 0.03, {}), ('CRACK', 0.16, 0.014, {}), ('CLOUDS', 0.03, 0.006, {}), ('VORONOI', 0.007, -0.0015, {})],
    'marble':  [('CLOUDS', 0.3, 0.006, {}), ('CRACK', 0.12, 0.0016, {}), ('CLOUDS', 0.02, 0.0012, {}), ('CLOUDS', 0.006, 0.0006, {})],
    'ice':     [('CLOUDS', 0.25, 0.03, {}), ('CRACK', 0.2, 0.012, {}), ('VORONOI', 0.06, 0.012, {}), ('CLOUDS', 0.01, 0.0015, {})],
    'metal':   [('CLOUDS', 0.12, 0.003, {}), ('CLOUDS', 0.014, 0.0009, {}), ('CLOUDS', 0.003, 0.0004, {})],
    'mail':    [('CLOUDS', 0.15, 0.005, {}), ('VORONOI', 0.012, -0.003, {})],
    'wood':    [('CLOUDS', 0.09, 0.004, {}), ('STUCCI', 0.022, 0.0025, {}), ('CLOUDS', 0.004, 0.0008, {})],
    'cloth':   [('CLOUDS', 0.16, 0.018, {}), ('STUCCI', 0.05, 0.006, {}), ('CLOUDS', 0.0025, 0.0007, {})],
    'leather': [('CLOUDS', 0.12, 0.006, {}), ('VORONOI', 0.012, -0.0016, {}), ('CLOUDS', 0.003, 0.0005, {})],
    'chitin':  [('CLOUDS', 0.1, 0.008, {}), ('VORONOI', 0.018, -0.003, {}), ('CLOUDS', 0.004, 0.0006, {})],
    'fur':     [('CLOUDS', 0.1, 0.012, {}), ('STUCCI', 0.012, 0.007, {}), ('CLOUDS', 0.003, 0.002, {})],
    'feather': [('CLOUDS', 0.2, 0.01, {}), ('STUCCI', 0.012, 0.003, {})],
    'slime':   [('CLOUDS', 0.2, 0.02, {})],
    'membrane': [('STUCCI', 0.05, 0.004, {}), ('CLOUDS', 0.01, 0.001, {})],
}
SPECIAL = ('membrane', 'slime', 'tint')   # 焼き込むが、材質の名前は残す(ゲーム側が名前で扱いを変える)


def _tex(kind, size):
    name = '%s_%g' % (kind, size)
    t = bpy.data.textures.get(name)
    if t:
        return t
    if kind == 'CRACK':
        t = bpy.data.textures.new(name, 'VORONOI')
        t.noise_scale = size
        t.weight_1, t.weight_2 = -1.0, 1.0
        t.noise_intensity = 2.2
        t.use_color_ramp = True
        cr = t.color_ramp
        cr.elements[0].position = 0.0; cr.elements[0].color = (0, 0, 0, 1)
        cr.elements[1].position = 0.12; cr.elements[1].color = (1, 1, 1, 1)
    elif kind == 'VORONOI':
        t = bpy.data.textures.new(name, 'VORONOI')
        t.noise_scale = size
        t.noise_intensity = 1.4
    elif kind == 'WOOD':
        t = bpy.data.textures.new(name, 'WOOD')
        t.noise_scale = size * 6
        t.wood_type = 'BANDNOISE'
        t.turbulence = 6
        t.noise_basis_2 = 'SAW'
    elif kind == 'STUCCI':
        t = bpy.data.textures.new(name, 'STUCCI')
        t.noise_scale = size
        t.turbulence = 8
    else:
        t = bpy.data.textures.new(name, 'CLOUDS')
        t.noise_scale = size
        t.noise_depth = 3
    return t


def _obj(name, mesh):
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _only(ob):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def _apply_mods(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)
    return me


def _rot_to(d):
    return Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()


def _rad(r):
    return r if not isinstance(r, (tuple, list)) else (r[0] + r[1]) * 0.5


def clay_from_rig(rig, voxel):
    """骨に沿って球と円錐を並べ、ボクセルで一つの肉体にまとめる"""
    bm = bmesh.new()
    J = rig.joints
    for n in rig.order:
        jj = J[n]
        if not jj['skin']:
            continue
        r = _rad(jj['r'])
        bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=r, matrix=Matrix.Translation(jj['pos']))
        p = jj['skin_parent'] or jj['parent']
        if p and J[p]['skin']:
            a, b = J[p]['pos'], jj['pos']
            d = b - a
            if d.length > 1e-5:
                m = Matrix.Translation((a + b) * 0.5) @ _rot_to(d)
                bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=_rad(J[p]['r']), radius2=r, depth=d.length, matrix=m)
    for fn in getattr(rig, 'clay', []):   # 肉体に溶け込ませる追加の形(角・背びれ・瘤など)
        fn(bm)
    me = bpy.data.meshes.new(rig.name + '_clay')
    bm.to_mesh(me)
    bm.free()
    ob = _obj(rig.name + '_clay', me)
    _only(ob)
    me.remesh_voxel_size = voxel
    me.remesh_voxel_adaptivity = 0
    bpy.ops.object.voxel_remesh()
    sm = ob.modifiers.new('sm', 'SMOOTH')
    sm.factor = 0.5
    sm.iterations = getattr(rig, 'clay_smooth', 26)
    if getattr(rig, 'dents', None):
        _apply_mods(ob)
        import anatomy
        anatomy.apply_dents(ob, rig.dents)
        s2 = ob.modifiers.new('sm2', 'SMOOTH')
        s2.factor = 0.5
        s2.iterations = 2
    if rig.bump:
        dp = ob.modifiers.new('lump', 'DISPLACE')
        dp.texture = _tex('CLOUDS', 1.0 / max(1e-3, rig.bump_freq) * 1.6)
        dp.texture_coords = 'LOCAL'
        dp.strength = rig.bump * 2.5
        dp.mid_level = 0.5
    _apply_mods(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def build(rig, out_path, preview=None):
    clear_scene()
    scene = bpy.context.scene
    scene.render.fps = 24
    S = getattr(rig, 'scale', 1.0)
    TEX = getattr(rig, 'tex', 1024)
    TRIS = getattr(rig, 'tris', 9000)
    J = rig.joints
    voxel = getattr(rig, 'voxel', None) or 0.0055 * S
    surf_body = getattr(rig, 'surface', None) or SURFACE_OF.get(rig.mats[0][0], 'skin')

    bones = rig.bones()
    segs = {b: rig.bone_seg(b) for b in bones}
    rootp0 = J[rig.root_name()]['pos']
    segs['root'] = (rootp0, rootp0 + Vector((0, 0, 0.15)))
    groups = ['root'] + bones
    bidx = {b: i for i, b in enumerate(groups)}
    ali = lambda b: 'root' if b == rig.root_name() else b
    # いちばん近い骨を素早く引く(骨の上に点を撒いておく)
    pts = []
    for b in bones:
        a, c = segs[b]
        for k in range(9):
            pts.append((a.lerp(c, k / 8), b))
    if pts:
        kd = kdtree.KDTree(len(pts))
        for i, (p, b) in enumerate(pts):
            kd.insert(p, i)
        kd.balance()
        near_bone = lambda p: pts[kd.find(p)[1]][1]
    else:
        near_bone = lambda p: None
    weight_fn = getattr(rig, 'weight_fn', None)     # 置物: 肉体の頂点をどの骨に付けるかを直に決める(None は根)

    def weights_for(p, cands=None):
        if weight_fn:
            wr = weight_fn(p)
            if isinstance(wr, (list, tuple)):      # [(重み, 骨)] をそのまま使う(指のように、骨の境目を自分で決めたい時)
                return [(w, ali(b)) for w, b in wr]
            return [(1.0, ali(wr or rig.root_name()))]
        if not bones:
            return [(1.0, 'root')]
        ds = []
        for b in ([ali(x) for x in cands] if cands else bones):
            a, c = segs[b]
            ds.append((seg_dist(p, a, c), b))
        ds.sort()
        top = ds[:3]
        ws = [(1.0 / (d + 0.015 * S) ** 4, b) for d, b in top]
        s = sum(w for w, _ in ws)
        return [(w / s, b) for w, b in ws if w / s > 0.02]

    # 材質の振り分け: 光る目などはそのまま、膜・粘体は名前を残して焼く、ほかは一枚の「body」に焼く
    slot_names = ['body']
    slot_of = {}
    for i, (mname, mcol, rough, metal, emit) in enumerate(rig.mats):
        if emit > 0 or mname in SPECIAL:
            slot_of[i] = len(slot_names)
            slot_names.append(mname)
        else:
            slot_of[i] = 0
    mat_rm = lambda mi: (rig.mats[mi][2], rig.mats[mi][3])
    mat_surf = lambda mi: SURFACE_OF.get(rig.mats[mi][0], 'skin')

    # ---- 粘土 ----
    clay = clay_from_rig(rig, voxel)
    ntri = sum(len(p.vertices) - 2 for p in clay.data.polygons)

    # ---- 高密度の肉体: 色を塗ってから細分する ----
    hi = _obj(rig.name + '_hi', clay.data.copy())
    hm = hi.data
    # 領域: 肉体の一部を別の素材(布・鎧・石など)として塗り、彫り分ける  [(表面, 重み(p,骨)->0..1, 色, 粗さ, 金属)]
    regions = getattr(rig, 'regions', [])
    r0, m0 = mat_rm(0)
    cols, rms, wts = [], [], {}
    for v in hm.vertices:
        p = v.co.copy()
        n = noise.fractal(p * rig.bump_freq, 0.6, 2.0, 3)
        nb = near_bone(p)
        c = rig.color_fn(p, nb, n) if rig.color_fn else (0.8, 0.8, 0.8)
        rr_, mm_ = r0, m0
        base_w = 1.0
        for sname, wf, rc, rro, rme in regions:
            w = wf(p, nb)
            if w <= 0:
                continue
            w = min(1.0, w)
            cc = rc(p, n) if callable(rc) else tuple(x * (0.88 + 0.24 * n) for x in ((rc >> 16 & 255) / 255, (rc >> 8 & 255) / 255, (rc & 255) / 255))
            c = tuple(a + (b - a) * w for a, b in zip(c, cc))
            rr_ += (rro - rr_) * w; mm_ += (rme - mm_) * w
            wts.setdefault(sname, {})[v.index] = w
            base_w *= (1 - w)
        if base_w > 0.01:
            d = wts.setdefault(surf_body, {})
            d[v.index] = min(1.0, d.get(v.index, 0) + base_w)
        cols.append((*srgb(tuple(max(0.0, min(1.0, x)) for x in c)), 1.0))
        rms.append((0.0, rr_, mm_, 1.0))
    vgs = set()
    def vg_of(sname):      # 名前で引き直す(群を足すと、前に取った参照は無効になる)
        vgs.add(sname)
        return hi.vertex_groups.get('surf_' + sname) or hi.vertex_groups.new(name='surf_' + sname)
    for sname, d in wts.items():
        g = vg_of(sname)
        byw = {}
        for i, w in d.items():
            byw.setdefault(round(w, 2), []).append(i)
        for w, idxs in byw.items():
            if w > 0:
                g.add(idxs, w, 'REPLACE')
    col = hm.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    rm = hm.color_attributes.new('RM', 'FLOAT_COLOR', 'POINT')
    col = hm.color_attributes['Col']
    col.data.foreach_set('color', [x for c in cols for x in c])
    rm.data.foreach_set('color', [x for c in rms for x in c])
    lvl = min(getattr(rig, 'hi_levels', 2), 2 if ntri <= 110000 else 1 if ntri <= 450000 else 0)   # 高密度は 200万面ほどまで(メモリを食い潰さない)
    print('[%s] clay tris=%d hi_levels=%d' % (rig.name, ntri, lvl))
    sub = hi.modifiers.new('sub', 'SUBSURF')
    sub.levels = lvl
    _apply_mods(hi)
    surf_ranges = []

    # ---- 低密度の肉体 ----
    _only(clay)
    dec = clay.modifiers.new('dec', 'DECIMATE')
    body_tris = max(1500, TRIS)
    dec.ratio = min(1.0, body_tris / max(1, ntri))
    _apply_mods(clay)

    bm = bmesh.new()
    bm.from_mesh(clay.data)
    dfl = bm.verts.layers.deform.verify()
    for v in bm.verts:
        for w, b in weights_for(v.co):
            v[dfl][bidx[b]] = w
    slot_fn = getattr(rig, 'slot_fn', None)      # 肉体の面を、名前の付いた別の材質へ振り分ける(色を後から変える衣など)
    name_slot = {n: i for i, n in enumerate(slot_names)}
    for f in bm.faces:
        f.smooth = True
        f.material_index = slot_of[0]
        if slot_fn:
            c = f.calc_center_median()
            sn = slot_fn(c, near_bone(c))
            if sn in name_slot:
                f.material_index = name_slot[sn]

    hbm = bmesh.new()
    hbm.from_mesh(hi.data)
    hcol = hbm.verts.layers.float_color['Col']
    hrm = hbm.verts.layers.float_color['RM']

    def color_at(c, co, amp=0.2, freq=14):
        nn = noise.fractal(co * freq, 0.6, 2.0, 2)
        if callable(c):
            return c(co, nn)
        return tuple(max(0, min(1, x * (1 - amp / 2 + amp * nn))) for x in ((c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255))

    # 膜(翼など)
    for pts_m, mi, cands, c in rig.membranes:
        for target, layer in ((bm, None), (hbm, hcol)):
            vs = [target.verts.new(Vector(p)) for p in pts_m]
            for k in range(1, len(vs) - 1):
                try:
                    f = target.faces.new((vs[0], vs[k], vs[k + 1]))
                    f.material_index = slot_of[mi] if target is bm else 0
                    f.smooth = True
                except ValueError:
                    pass
            for v in vs:
                if target is bm:
                    for w, b in weights_for(v.co, cands):
                        v[dfl][bidx[b]] = w
                else:
                    v[hcol] = (*srgb(color_at(c, v.co)), 1.0)
                    v[hrm] = (0, mat_rm(mi)[0], mat_rm(mi)[1], 1.0)

    # 固い部品: 低密度はそのまま、高密度は細分してから彫る
    for fn, bone, mi, c, smooth in rig.parts:
        before = set(bm.faces)
        vs = fn(bm)
        for v in vs:
            v[dfl][bidx[ali(bone)]] = 1.0
        newf = set(bm.faces) - before
        bmesh.ops.recalc_face_normals(bm, faces=list(newf))     # 面の向きを外向きに揃える(裏返っていると焼き込みが外れる)
        for f in newf:
            f.material_index = slot_of[mi]
            f.smooth = smooth
        if rig.mats[mi][4] > 0:
            continue   # 光る部品は焼かない
        tb = bmesh.new()
        fn(tb)
        bmesh.ops.recalc_face_normals(tb, faces=tb.faces[:])
        tme = bpy.data.meshes.new('part')
        tb.to_mesh(tme)
        dims = [max(v.co[k] for v in tb.verts) - min(v.co[k] for v in tb.verts) for k in range(3)]
        size = max(dims)
        thin = min(dims) < 0.045 * S or min(dims) < size * 0.2     # 細い・薄い部品は丸めると痩せるので、形を保って細分する
        nv = len(tb.verts)
        tb.free()
        tob = _obj('part', tme)
        for p in tme.polygons:
            p.use_smooth = True
        if not smooth:
            bv = tob.modifiers.new('bv', 'BEVEL')
            bv.width = min(0.006 * S, size * 0.03)
            bv.segments = 2
            bv.limit_method = 'ANGLE'
        want = max(1, min(4, int(math.log2(max(1.0, size / (voxel * 0.7) / max(2.0, math.sqrt(nv)))) + 1.5)))
        sb = tob.modifiers.new('sub', 'SUBSURF')
        sb.subdivision_type = 'CATMULL_CLARK' if (smooth and not thin) else 'SIMPLE'
        sb.levels = want
        _apply_mods(tob)
        start = len(hbm.verts)
        hbm.from_mesh(tob.data)
        hbm.verts.ensure_lookup_table()
        rr, mm = mat_rm(mi)
        for i in range(start, len(hbm.verts)):
            v = hbm.verts[i]
            v[hcol] = (*srgb(color_at(c, v.co)), 1.0)
            v[hrm] = (0, rr, mm, 1.0)
        surf_ranges.append((mat_surf(mi), start, len(hbm.verts)))
        tdata = tob.data
        bpy.data.objects.remove(tob)
        bpy.data.meshes.remove(tdata)

    low_me = bpy.data.meshes.new(rig.name)
    bm.to_mesh(low_me)
    bm.free()
    bpy.data.objects.remove(clay)
    low = _obj(rig.name, low_me)

    hi_me = bpy.data.meshes.new(rig.name + '_hi2')
    for f in hbm.faces:
        f.smooth = True
    hbm.to_mesh(hi_me)
    hbm.free()
    old = hi.data
    hi.data = hi_me
    bpy.data.meshes.remove(old)

    # ---- 彫り: 表面の種類ごとに、重ねた模様で押し出す ----
    by_surf = {}
    for sname, a, b in surf_ranges:
        by_surf.setdefault(sname, []).extend(range(a, b))
    for sname, idxs in by_surf.items():
        vg_of(sname).add(idxs, 1.0, 'REPLACE')
    for sname in sorted(vgs):
        vg_name = 'surf_' + sname
        for kind, size, depth, _ in PRESETS.get(sname, PRESETS['skin']):
            dp = hi.modifiers.new(kind, 'DISPLACE')
            dp.texture = _tex(kind, size * S)
            dp.texture_coords = 'LOCAL'
            dp.strength = depth * S * getattr(rig, 'detail', 1.0)
            dp.mid_level = 0.5
            dp.vertex_group = vg_name
    _apply_mods(hi)
    for p in hi.data.polygons:
        p.use_smooth = True

    # ---- UV ----
    _only(low)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    bpy.ops.object.mode_set(mode='OBJECT')

    # ---- 焼き込み ----
    img_c = bpy.data.images.new(rig.name + '_color', TEX, TEX, alpha=False)
    img_n = bpy.data.images.new(rig.name + '_normal', TEX, TEX, alpha=False)
    img_n.colorspace_settings.name = 'Non-Color'
    img_r = bpy.data.images.new(rig.name + '_orm', TEX, TEX, alpha=False)
    img_r.colorspace_settings.name = 'Non-Color'
    img_a = bpy.data.images.new(rig.name + '_ao', TEX, TEX, alpha=False)
    img_a.colorspace_settings.name = 'Non-Color'

    mats = []
    for sname in slot_names:
        m = bpy.data.materials.new(sname)
        m.use_nodes = True
        nt = m.node_tree
        bsdf = nt.nodes['Principled BSDF']
        src = next((x for x in rig.mats if x[0] == sname), None)
        if src and src[4] > 0:
            bsdf.inputs['Base Color'].default_value = (*srgb(src[1]), 1)
            bsdf.inputs['Emission Color'].default_value = (*srgb(src[1]), 1)
            bsdf.inputs['Emission Strength'].default_value = src[4]
        else:
            tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = img_c
            nt.links.new(tc.outputs['Color'], bsdf.inputs['Base Color'])
            tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img_n
            nm = nt.nodes.new('ShaderNodeNormalMap')
            nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
            nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
            tr = nt.nodes.new('ShaderNodeTexImage'); tr.image = img_r
            sp = nt.nodes.new('ShaderNodeSeparateColor')
            nt.links.new(tr.outputs['Color'], sp.inputs['Color'])
            nt.links.new(sp.outputs['Green'], bsdf.inputs['Roughness'])
            nt.links.new(sp.outputs['Blue'], bsdf.inputs['Metallic'])
        bk = nt.nodes.new('ShaderNodeTexImage')
        bk.name = 'BAKE'
        nt.nodes.active = bk
        low_me.materials.append(m)
        mats.append(m)

    # 高密度の側: 色と粗さを「発光」として出し、それを焼く(光の当たり方に左右されない)
    hmat = bpy.data.materials.new('hi')
    hmat.use_nodes = True
    nt = hmat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    a_col = nt.nodes.new('ShaderNodeAttribute'); a_col.attribute_name = 'Col'
    a_rm = nt.nodes.new('ShaderNodeAttribute'); a_rm.attribute_name = 'RM'
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    ramp = nt.nodes.new('ShaderNodeValToRGB')     # くぼみは暗く、出っ張りは少し明るく
    ramp.color_ramp.elements[0].position = 0.42; ramp.color_ramp.elements[0].color = (*getattr(rig, 'crease', (0.32, 0.3, 0.28)), 1)
    ramp.color_ramp.elements[1].position = 0.56; ramp.color_ramp.elements[1].color = (1.12, 1.12, 1.12, 1)
    nt.links.new(geo.outputs['Pointiness'], ramp.inputs['Fac'])
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 9.0 / S; nz.inputs['Detail'].default_value = 6
    nr = nt.nodes.new('ShaderNodeMapRange')
    nr.inputs['To Min'].default_value, nr.inputs['To Max'].default_value = getattr(rig, 'mottle', (0.78, 1.18))
    nt.links.new(nz.outputs['Fac'], nr.inputs['Value'])
    mul1 = nt.nodes.new('ShaderNodeMixRGB'); mul1.blend_type = 'MULTIPLY'; mul1.inputs['Fac'].default_value = 1
    nt.links.new(a_col.outputs['Color'], mul1.inputs['Color1'])
    nt.links.new(ramp.outputs['Color'], mul1.inputs['Color2'])
    mul2 = nt.nodes.new('ShaderNodeMixRGB'); mul2.blend_type = 'MULTIPLY'; mul2.inputs['Fac'].default_value = 1
    nt.links.new(mul1.outputs['Color'], mul2.inputs['Color1'])
    nt.links.new(nr.outputs['Result'], mul2.inputs['Color2'])
    # 粗さ: くぼみほどざらつく
    rr = nt.nodes.new('ShaderNodeValToRGB')
    rr.color_ramp.elements[0].position = 0.4; rr.color_ramp.elements[0].color = (1, 1.25, 1, 1)
    rr.color_ramp.elements[1].position = 0.6; rr.color_ramp.elements[1].color = (1, 0.8, 1, 1)
    nt.links.new(geo.outputs['Pointiness'], rr.inputs['Fac'])
    mul3 = nt.nodes.new('ShaderNodeMixRGB'); mul3.blend_type = 'MULTIPLY'; mul3.inputs['Fac'].default_value = 1
    nt.links.new(a_rm.outputs['Color'], mul3.inputs['Color1'])
    nt.links.new(rr.outputs['Color'], mul3.inputs['Color2'])
    hi.data.materials.clear()
    hi.data.materials.append(hmat)

    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 1
    bk = scene.render.bake
    bk.use_selected_to_active = True
    bk.cage_extrusion = getattr(rig, 'cage', 0.03 * S)
    bk.max_ray_distance = getattr(rig, 'ray', 0.07 * S)
    bk.margin = 6
    bk.use_clear = True
    for o in scene.objects:
        o.select_set(False)
    hi.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low

    def bake(img, kind, samples=1):
        for m in mats:
            m.node_tree.nodes['BAKE'].image = img
            m.node_tree.nodes.active = m.node_tree.nodes['BAKE']
        scene.cycles.samples = samples
        bpy.ops.object.bake(type=kind)

    nt.links.new(mul2.outputs['Color'], em.inputs['Color'])
    bake(img_c, 'EMIT')
    nt.links.new(mul3.outputs['Color'], em.inputs['Color'])
    bake(img_r, 'EMIT')
    bake(img_n, 'NORMAL')
    bake(img_a, 'AO', 24)

    # 陰影を色に重ねる
    try:
        import numpy as np
        n = TEX * TEX * 4
        c = np.empty(n, dtype=np.float32); a = np.empty(n, dtype=np.float32)
        img_c.pixels.foreach_get(c); img_a.pixels.foreach_get(a)
        k = 1 - (1 - a.reshape(-1, 4)[:, :1]) * getattr(rig, 'ao_strength', 1.1) * 0.75
        c = c.reshape(-1, 4); c[:, :3] *= np.clip(k, 0.12, 1)
        img_c.pixels.foreach_set(c.reshape(-1)); img_c.update()
    except Exception as e:
        print('ao merge failed', e)
    bpy.data.images.remove(img_a)
    for m in mats:
        m.node_tree.nodes.remove(m.node_tree.nodes['BAKE'])
    for im in (img_c, img_n, img_r):
        im.pack()
    bpy.data.objects.remove(hi)

    # ---- 骨組み ----
    ident = getattr(rig, 'identity_bones', False)
    arm_d = bpy.data.armatures.new(rig.name + '_arm')
    arm = bpy.data.objects.new(rig.name + '_rig', arm_d)
    scene.collection.objects.link(arm)
    _only(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    rb = arm_d.edit_bones.new('root')
    rb.head = rootp0
    rb.tail = rootp0 + Vector((0, 0, 0.15))
    for b in bones:
        a, c = segs[b]
        eb = arm_d.edit_bones.new(b)
        eb.head = a
        if ident:   # どの骨も同じ向き(真上)にしておくと、ゲーム側は骨をそのまま回せる
            eb.tail = a + Vector((0, 0, 0.1 * S))
        else:
            eb.tail = c if (c - a).length > 1e-4 else a + Vector((0, 0, 0.02))
        eb.roll = 0
    for b in bones:
        par = J[b]['parent']
        arm_d.edit_bones[b].parent = arm_d.edit_bones[par] if par in arm_d.edit_bones else rb
    bpy.ops.object.mode_set(mode='OBJECT')
    low.parent = arm
    # ゲーム側へ渡す覚え書き(当たり判定の楕円体・口の位置など)。座標は three.js の向き(x, 上, -前)に直す
    if getattr(rig, 'extras', None) is not None:
        import json
        t3 = lambda p: [round(p[0], 4), round(p[2], 4), round(-p[1], 4)]
        hits = []
        for b in bones:
            if not J[b]['skin'] and not getattr(rig, 'hit_all', False):
                continue
            a, c = segs[b]
            rr = max(_rad(J[b]['r']), _rad(J[J[b]['parent']]['r'])) * getattr(rig, 'hit_pad', 1.0)
            d = c - a
            if rr < getattr(rig, 'hit_min', 0.0):
                continue
            hits.append({'bone': b, 'pos': t3(d * 0.5), 'scale': [round(abs(d.x) / 2 + rr, 4), round(abs(d.z) / 2 + rr, 4), round(abs(d.y) / 2 + rr, 4)]})
        ex = dict(rig.extras)
        ex['hits'] = hits
        ex['bones'] = {b: t3(segs[b][0]) for b in bones}
        arm['forge'] = json.dumps(ex)
    for b in groups:
        low.vertex_groups.new(name=b)
    am = low.modifiers.new('arm', 'ARMATURE')
    am.object = arm

    rest = {b.name: b.matrix_local.to_quaternion() for b in arm_d.bones}
    arm.animation_data_create()
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    for aname, (frames, loop, fn) in rig.anims.items():
        act = bpy.data.actions.new(aname)
        act.use_fake_user = True
        arm.animation_data.action = act
        for f in range(frames + 1):
            pose = fn(f / frames if frames else 0)
            for pb in arm.pose.bones:
                q = pose.get(pb.name)
                if pb.name == 'root':
                    loc = pose.get('_loc', Vector((0, 0, 0)))
                    pb.location = rest['root'].inverted() @ Vector(loc)
                    pb.keyframe_insert('location', frame=f)
                    sc = pose.get('_scl')
                    if sc is not None:
                        pb.scale = Vector((sc[0], sc[2], sc[1]))
                        pb.keyframe_insert('scale', frame=f)
                    q = pose.get('_rot', q)
                rq = rest[pb.name]
                pb.rotation_quaternion = rq.inverted() @ (q or Quaternion()) @ rq
                pb.keyframe_insert('rotation_quaternion', frame=f)
        tr = arm.animation_data.nla_tracks.new()
        tr.name = aname
        tr.strips.new(aname, 0, act)
        arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
        pb.scale = Vector((1, 1, 1))

    for o in scene.objects:
        o.select_set(True)
    kw = dict(filepath=out_path, export_format='GLB', use_selection=False, export_animations=True,
              export_skins=True, export_yup=True, export_apply=False, export_morph=False,
              export_texcoords=True, export_normals=True, export_cameras=False, export_lights=False, export_extras=True)
    for extra in ({'export_animation_mode': 'NLA_TRACKS', 'export_vertex_color': 'NONE', 'export_image_format': 'JPEG', 'export_jpeg_quality': 88},
                  {'export_animation_mode': 'NLA_TRACKS', 'export_image_format': 'JPEG'}, {'export_animation_mode': 'NLA_TRACKS'}, {}):
        try:
            bpy.ops.export_scene.gltf(**kw, **extra)
            break
        except TypeError as e:
            print('retry export', e)
    tri = sum(len(p.vertices) - 2 for p in low_me.polygons)
    print(f'[{rig.name}] tris={tri} bones={len(bones)} tex={TEX} voxel={voxel:.4f} -> {out_path} ({os.path.getsize(out_path) // 1024} KB)')
    if preview:
        render_preview(low, preview, getattr(rig, 'view', None))
    return low, arm


def render_preview(ob, path, view=None, res=900):
    """仕上がりを確かめる絵を描く(斜め前と横の二枚を横に並べる)"""
    scene = bpy.context.scene
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            pass
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    lo = Vector((min(p.x for p in bb), min(p.y for p in bb), min(p.z for p in bb)))
    hi = Vector((max(p.x for p in bb), max(p.y for p in bb), max(p.z for p in bb)))
    ctr = (lo + hi) * 0.5
    size = max(hi - lo)
    world = bpy.data.worlds.new('w'); scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.02, 0.022, 0.028, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    def light(name, pos, energy, color, sz):
        d = bpy.data.lights.new(name, 'AREA'); d.energy = energy; d.color = color; d.size = sz
        o = bpy.data.objects.new(name, d); scene.collection.objects.link(o)
        o.location = ctr + Vector(pos) * size
        o.rotation_euler = (ctr - o.location).to_track_quat('-Z', 'Y').to_euler()
    light('key', (-0.9, 1.4, 0.9), 110 * size * size, (1, 0.9, 0.78), size)
    light('rim', (1.2, -1.0, 0.7), 150 * size * size, (0.55, 0.7, 1), size)
    light('fill', (0.3, 1.2, -0.2), 18 * size * size, (0.8, 0.8, 0.9), size * 2)
    cam_d = bpy.data.cameras.new('cam'); cam_d.lens = 60
    cam = bpy.data.objects.new('cam', cam_d); scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x = res; scene.render.resolution_y = res
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    views = view or [(-0.75, 1.6, 0.35), (-0.5, 1.6, 0.15, 0.8, 0.8), (1.0, -1.4, 0.3)]
    outs = []
    for i, v in enumerate(views):
        dist = v[3] if len(v) > 3 else 2.25
        tgt = Vector((ctr.x, ctr.y, lo.z + (hi.z - lo.z) * v[4])) if len(v) > 4 else ctr
        cam.location = tgt + Vector(v[:3]).normalized() * size * dist
        cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
        p = path.replace('.png', '_%d.png' % i)
        scene.render.filepath = p
        bpy.ops.render.render(write_still=True)
        outs.append(p)
    print('preview', outs)
