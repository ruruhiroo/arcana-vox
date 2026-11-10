# 魔物モデルを Blender で組み立てる共通部品
# 骨格(関節の位置と太さ)からスキンモディファイアで肉付けし、骨入り(スキン)メッシュとして glTF に書き出す。
# 向き: Blender の +Y が魔物の正面(three.js では -Z)。単位はメートル。
import bpy, bmesh, math
from mathutils import Vector, Matrix, Quaternion, noise


def srgb(c):
    """16進の sRGB 色 → 線形 RGB"""
    if isinstance(c, int):
        c = ((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255
    return tuple(pow(max(0.0, min(1.0, x)), 2.2) for x in c)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def seg_dist(p, a, b):
    ab = b - a
    L = ab.length_squared
    t = 0.0 if L < 1e-9 else max(0.0, min(1.0, (p - a).dot(ab) / L))
    return (p - (a + ab * t)).length


class Rig:
    def __init__(self, name):
        self.name = name
        self.joints = {}
        self.order = []
        self.mats = []          # [(name, color, rough, metal, emit)]
        self.parts = []         # 追加の固い部品 (関数, 骨, 材質, 色)
        self.anims = {}         # 名前 -> (フレーム数, ループするか, 関数(frame)->{bone: quat}, 根の移動)
        self.color_fn = None    # (位置, 最寄りの骨) -> 色
        self.bump = 0.012       # 肉付けの凹凸
        self.bump_freq = 9.0
        self.subdiv = 2
        self.smooth = True
        self.membranes = []     # [(点の列, 材質, 骨の候補)]
        self.ao = 0.22          # 陰影を調べる距離 (0 で無し)
        self.ao_strength = 1.1

    # 関節: name は「親からこの関節までの骨」の名前になる
    def j(self, name, pos, r, parent=None, skin=True, bone=True):
        self.joints[name] = dict(pos=Vector(pos), r=r, parent=parent, skin=skin, bone=bone, skin_parent=None)
        self.order.append(name)
        return name

    def mid(self, bone, t, r):
        """骨の途中に肉の膨らみ(筋肉)を足す。骨は増やさない"""
        jj = self.joints[bone]
        sp = jj['skin_parent'] or jj['parent']
        a = self.joints[jj['parent']]['pos']
        name = bone + '_m%d' % len([n for n in self.joints if n.startswith(bone + '_m')])
        self.joints[name] = dict(pos=a.lerp(jj['pos'], t), r=r, parent=jj['parent'], skin=True, bone=False, skin_parent=sp)
        self.order.insert(self.order.index(bone), name)
        jj['skin_parent'] = name

    def tip(self, name, pos, r, parent):
        """骨を持たない肉の枝(指・角など)"""
        self.joints[name] = dict(pos=Vector(pos), r=r, parent=parent, skin=True, bone=False, skin_parent=parent)
        self.order.append(name)

    def sym(self, name, pos, r, parent=None, skin=True):
        """左右対称の関節 (_L は -X 側, _R は +X 側)"""
        x, y, z = pos
        pl = parent + '_L' if parent and parent + '_L' in self.joints else parent
        pr = parent + '_R' if parent and parent + '_R' in self.joints else parent
        self.j(name + '_L', (-abs(x), y, z), r, pl, skin)
        self.j(name + '_R', (abs(x), y, z), r, pr, skin)

    def mat(self, name, color=0xffffff, rough=0.8, metal=0.0, emit=0.0):
        self.mats.append((name, color, rough, metal, emit))
        return len(self.mats) - 1

    def part(self, fn, bone, mat=0, color=0xffffff, smooth=True):
        self.parts.append((fn, bone, mat, color, smooth))

    def bones(self):
        return [n for n in self.order if self.joints[n]['parent'] and self.joints[n]['bone']]

    def root_name(self):
        return next(n for n in self.order if not self.joints[n]['parent'])

    def bone_seg(self, b):
        jj = self.joints[b]
        return self.joints[jj['parent']]['pos'], jj['pos']


# ---------- 部品の形 (bmesh) ----------
def sphere(r, at, scale=(1, 1, 1), seg=14, rings=10):
    def f(bm):
        m = Matrix.Translation(Vector(at)) @ Matrix.Diagonal((*scale, 1))
        return bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r, matrix=m)['verts']
    return f


def box(size, at, rot=(0, 0, 0)):
    def f(bm):
        m = Matrix.Translation(Vector(at)) @ Euler_m(rot) @ Matrix.Diagonal((*size, 1))
        return bmesh.ops.create_cube(bm, size=1.0, matrix=m)['verts']
    return f


def cone(r1, r2, depth, at, rot=(0, 0, 0), seg=10, caps=True):
    def f(bm):
        m = Matrix.Translation(Vector(at)) @ Euler_m(rot)
        return bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=depth, matrix=m)['verts']
    return f


def ring(r, width, at, rot=(0, 0, 0), seg=18, scale=(1, 1, 1), arc=1.0):
    """肋骨のような輪 (arc<1 で開いた輪)"""
    def f(bm):
        m = Matrix.Translation(Vector(at)) @ Euler_m(rot) @ Matrix.Diagonal((*scale, 1))
        vs = []
        n = seg
        pts = []
        for i in range(n + 1):
            a = (i / n) * math.pi * 2 * arc - math.pi * arc + math.pi / 2
            pts.append((math.cos(a) * r, math.sin(a) * r))
        rows = []
        for (x, y) in pts:
            row = []
            for dz, dr in ((-width, 0), (0, width * 0.6), (width, 0), (0, -width * 0.6)):
                k = (r + dr) / r
                row.append(bm.verts.new(m @ Vector((x * k, y * k, dz))))
            rows.append(row)
        for i in range(len(rows) - 1):
            for k in range(4):
                a, b = rows[i][k], rows[i][(k + 1) % 4]
                c, d = rows[i + 1][(k + 1) % 4], rows[i + 1][k]
                bm.faces.new((a, b, c, d))
        for row in rows:
            vs.extend(row)
        return vs
    return f


def Euler_m(rot):
    from mathutils import Euler
    return Euler(rot, 'XYZ').to_matrix().to_4x4()


# ---------- 組み立て ----------
def build(rig, out_path):
    clear_scene()
    scene = bpy.context.scene
    scene.render.fps = 24
    names = [n for n in rig.order if rig.joints[n]['skin']]
    idx = {n: i for i, n in enumerate(names)}
    verts = [rig.joints[n]['pos'] for n in names]
    sp = lambda n: rig.joints[n]['skin_parent'] or rig.joints[n]['parent']
    edges = [(idx[n], idx[sp(n)]) for n in names if sp(n) in idx]
    me = bpy.data.meshes.new(rig.name + '_skel')
    me.from_pydata(verts, edges, [])
    ob = bpy.data.objects.new(rig.name, me)
    scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.modifier_add(type='SKIN')
    sk = ob.modifiers[-1]
    sk.use_smooth_shade = rig.smooth
    sk.branch_smoothing = 0.3
    sv = me.skin_vertices[0].data
    for n, i in idx.items():
        r = rig.joints[n]['r']
        sv[i].radius = (r, r) if not isinstance(r, (tuple, list)) else tuple(r)
        sv[i].use_root = False
    sv[idx[rig.root_name()]].use_root = True
    if rig.subdiv:
        sub = ob.modifiers.new('sub', 'SUBSURF')
        sub.levels = rig.subdiv
        sub.render_levels = rig.subdiv
    dg = bpy.context.evaluated_depsgraph_get()
    body = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    ob.data = body
    bpy.data.meshes.remove(me)

    bones = rig.bones()
    bm = bmesh.new()
    bm.from_mesh(body)
    bm.verts.ensure_lookup_table()
    col = bm.verts.layers.float_color.new('Col')
    dfl = bm.verts.layers.deform.verify()
    segs = {b: rig.bone_seg(b) for b in bones}
    rootp0 = rig.joints[rig.root_name()]['pos']
    segs['root'] = (rootp0, rootp0 + Vector((0, 0, 0.15)))
    groups = ['root'] + bones
    bidx = {b: i for i, b in enumerate(groups)}
    ali = lambda b: 'root' if b == rig.root_name() else b

    def weights_for(p, cands=None):
        ds = []
        for b in ([ali(x) for x in cands] if cands else bones):
            a, c = segs[b]
            ds.append((seg_dist(p, a, c), b))
        ds.sort()
        top = ds[:3]
        ws = [(1.0 / (d + 0.015) ** 4, b) for d, b in top]
        s = sum(w for w, _ in ws)
        return [(w / s, b) for w, b in ws if w / s > 0.02], top[0][1]

    # 本体: 凹凸・色・重み
    bm.normal_update()
    for v in bm.verts:
        p = v.co.copy()
        n = noise.fractal(p * rig.bump_freq, 0.6, 2.0, 3)
        v.co = p + v.normal * n * rig.bump
        ws, near = weights_for(p)
        for w, b in ws:
            v[dfl][bidx[b]] = w
        c = rig.color_fn(p, near, n) if rig.color_fn else (0.8, 0.8, 0.8)
        v[col] = (*srgb(c), 1.0)
    for f in bm.faces:
        f.smooth = rig.smooth
        f.material_index = 0

    # 膜(翼など): 点の列を扇状に張る
    for pts, mi, cands, c in rig.membranes:
        vs = [bm.verts.new(Vector(p)) for p in pts]
        for k in range(1, len(vs) - 1):
            try:
                f = bm.faces.new((vs[0], vs[k], vs[k + 1]))
                f.material_index = mi
                f.smooth = True
            except ValueError:
                pass
        for v in vs:
            ws, _ = weights_for(v.co, cands)
            for w, b in ws:
                v[dfl][bidx[b]] = w
            v[col] = (*srgb(c), 1.0)

    # 固い部品: 一つの骨に固定
    for fn, bone, mi, c, smooth in rig.parts:
        before = set(bm.faces)
        vs = fn(bm)
        for v in vs:
            v[dfl][bidx[ali(bone)]] = 1.0
            nn = noise.fractal(v.co * 14, 0.6, 2.0, 2)
            cc = c(v.co, nn) if callable(c) else tuple(max(0, min(1, x * (0.9 + 0.2 * nn))) for x in ((c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255))
            v[col] = (*srgb(cc), 1.0)
        for f in set(bm.faces) - before:
            f.material_index = mi
            f.smooth = smooth
    # 陰影(環境光の遮蔽): 頂点から半球方向に光線を飛ばし、近くで遮られる割合だけ暗くする
    if rig.ao:
        from mathutils.bvhtree import BVHTree
        import random
        bm.normal_update()
        tree = BVHTree.FromBMesh(bm)
        rnd = random.Random(1)
        dirs = []
        while len(dirs) < 14:
            d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
            if 0.1 < d.length <= 1: dirs.append(d.normalized())
        for v in bm.verts:
            nrm = v.normal
            o = v.co + nrm * 0.004
            hit = 0; tot = 0
            for d in dirs:
                if d.dot(nrm) < 0: d = -d
                tot += 1
                loc, _, _, dist = tree.ray_cast(o, d, rig.ao)
                if loc is not None: hit += 1 - dist / rig.ao
            occ = hit / max(1, tot)
            k = 1 - occ * rig.ao_strength
            c = v[col]
            v[col] = (c[0] * k, c[1] * k, c[2] * k, 1.0)
    bm.to_mesh(body)
    bm.free()

    # 材質: 色は頂点色から
    for (mname, mcol, rough, metal, emit) in rig.mats:
        m = bpy.data.materials.new(mname)
        m.use_nodes = True
        nt = m.node_tree
        bsdf = nt.nodes['Principled BSDF']
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
        if emit > 0:
            bsdf.inputs['Base Color'].default_value = (*srgb(mcol), 1)
            bsdf.inputs['Emission Color'].default_value = (*srgb(mcol), 1)
            bsdf.inputs['Emission Strength'].default_value = emit
        else:
            ca = nt.nodes.new('ShaderNodeVertexColor')
            ca.layer_name = 'Col'
            nt.links.new(ca.outputs['Color'], bsdf.inputs['Base Color'])
        body.materials.append(m)

    # 骨組み
    arm_d = bpy.data.armatures.new(rig.name + '_arm')
    arm = bpy.data.objects.new(rig.name + '_rig', arm_d)
    scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    for o in scene.objects:
        o.select_set(False)
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    rootp = rig.joints[rig.root_name()]['pos']
    rb = arm_d.edit_bones.new('root')
    rb.head = rootp
    rb.tail = rootp + Vector((0, 0, 0.15))
    for b in bones:
        a, c = segs[b]
        eb = arm_d.edit_bones.new(b)
        eb.head = a
        eb.tail = c if (c - a).length > 1e-4 else a + Vector((0, 0, 0.02))
        eb.roll = 0
    for b in bones:
        par = rig.joints[b]['parent']
        arm_d.edit_bones[b].parent = arm_d.edit_bones[par] if par in arm_d.edit_bones else rb
    bpy.ops.object.mode_set(mode='OBJECT')

    ob.parent = arm
    for b in groups:
        ob.vertex_groups.new(name=b)
    am = ob.modifiers.new('arm', 'ARMATURE')
    am.object = arm

    # 動き: 各骨の回転は「静止姿勢のときの世界の軸」で指定し、骨の局所回転に直す
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
                        # 根の伸び縮み(骨の軸: Y=上下)
                        pb.scale = Vector((sc[0], sc[2], sc[1]))
                        pb.keyframe_insert('scale', frame=f)
                    q = pose.get('_rot', q)
                rq = rest[pb.name]
                lq = rq.inverted() @ (q or Quaternion()) @ rq
                pb.rotation_quaternion = lq
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
              export_texcoords=False, export_normals=True, export_cameras=False, export_lights=False)
    for extra in ({'export_animation_mode': 'NLA_TRACKS', 'export_vertex_color': 'ACTIVE'}, {'export_animation_mode': 'NLA_TRACKS'}, {}):
        try:
            bpy.ops.export_scene.gltf(**kw, **extra)
            break
        except TypeError as e:
            print('retry export', e)
    tri = sum(len(p.vertices) - 2 for p in body.polygons)
    print(f'[{rig.name}] tris={tri} bones={len(bones)} -> {out_path}')


# ---------- 動きの道具 ----------
def qa(axis, ang):
    return Quaternion(Vector(axis).normalized(), ang)


def qx(a): return qa((1, 0, 0), a)
def qy(a): return qa((0, 1, 0), a)
def qz(a): return qa((0, 0, 1), a)


def smooth01(t):
    return t * t * (3 - 2 * t)


def keys(t, pts):
    """t(0〜1) における折れ線補間 pts=[(t,値),...]"""
    for i in range(len(pts) - 1):
        (t0, v0), (t1, v1) = pts[i], pts[i + 1]
        if t0 <= t <= t1:
            k = smooth01((t - t0) / (t1 - t0 or 1))
            return v0 + (v1 - v0) * k
    return pts[-1][1]
