"""Nox: authored garment surfaces, an anatomical CC0 skull, and articulated arms.
Blender 4.3 --background --factory-startup --python tools/blender/build_nox.py -- SOURCE_DIR
SOURCE_DIR contains CDmir's skull-Low4K.obj and Skull-Low*.png (see art/guardians/README.md).
Coordinates below use the game's Y-up / -Z-forward convention; glTF preserves it.
"""
import bpy, math, sys, os, json, random
import numpy as np
from mathutils import Vector
from math import sin, cos, pi

ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
SOURCE=os.path.abspath(sys.argv[sys.argv.index('--')+1])
ART=os.path.join(ROOT,'art/guardians'); OUT=os.path.join(ROOT,'public/models')
os.makedirs(ART,exist_ok=True);os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
random.seed(821)
def coord(p):return Vector((p[0],-p[2],p[1]))
def empty(name,pos=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent;o.location=coord(pos);return o
root=empty('nox');spine=empty('spine',(0,2.3,0),root)
neck=empty('neck',(0,3.5,-.13),root);head=empty('head',(0,.34,-.12),neck)
jaw=empty('jaw',(0,-.25,-.1),head)
arms=[];forearms=[];hands=[]
for side,label in [(-1,'L'),(1,'R')]:
    a=empty('arm_'+label,(side*.66,3.2,-.04),root)
    f=empty('forearm_'+label,(0,-.78,0),a);h=empty('hand_'+label,(0,-.75,0),f)
    arms.append(a);forearms.append(f);hands.append(h)
weapon=empty('scythe',(0,0,0),root)

def image(name,array,color=True):
    h,w=array.shape[:2];im=bpy.data.images.new(name,width=w,height=h,alpha=True)
    im.colorspace_settings.name='sRGB' if color else 'Non-Color'
    im.pixels.foreach_set(np.ascontiguousarray(array,dtype=np.float32).ravel());im.pack();return im
size=1024;y,x=np.mgrid[0:size,0:size].astype(float);u=x/size;v=y/size
rng=np.random.default_rng(821);grain=rng.random((size,size))
large=(np.sin(u*19+np.sin(v*8)*2)+np.sin(v*29-u*7)+np.cos(u*43+v*31))/3
def clouds(n):
    src=rng.random((n,n));grid=np.linspace(0,n-1,size)
    horizontal=np.array([np.interp(grid,np.arange(n),row) for row in src])
    return np.array([np.interp(grid,np.arange(n),horizontal[:,i]) for i in range(size)]).T
large=(clouds(8)*.5+clouds(23)*.3+clouds(71)*.2)*2-1
weave=np.sin(x*pi*.5)*np.sin(y*pi*.5)
stains=np.clip((clouds(12)-.49)*4,0,1)*clouds(37)
cloth_rgb=np.ones((size,size,4));cloth_rgb[:,:,:3]=np.array([.32,.31,.285])[None,None,:]*(.76+.4*large+.08*grain+.05*weave-.27*stains)[:,:,None]
clothtex=image('Nox woven charcoal',cloth_rgb)
rough=np.ones((size,size,4));rough[:,:,:3]=np.clip(.88+.08*grain-.12*stains,0,1)[:,:,None];clothrough=image('Nox cloth roughness',rough,False)
normal=np.ones((size,size,4));normal[:,:,0]=.5+.09*np.cos(x*pi*.5)*np.sin(y*pi*.5);normal[:,:,1]=.5+.09*np.sin(x*pi*.5)*np.cos(y*pi*.5);normal[:,:,2]=.99
clothnormal=image('Nox cloth weave normal',normal,False)
metal_rgb=np.ones((size,size,4));metal_rgb[:,:,:3]=np.array([.27,.285,.28])[None,None,:]*(.75+.35*large+.17*grain)[:,:,None]
scratches=(np.sin(u*441+np.sin(v*3))>.996)&(grain>.6);metal_rgb[scratches,:3]*=1.65
rust=np.clip((clouds(24)-.58)*7,0,.8)*(.3+.7*np.abs(np.sin(v*pi*3)))
metal_rgb[:,:,:3]=metal_rgb[:,:,:3]*(1-rust[:,:,None])+np.array([.26,.12,.045])[None,None,:]*rust[:,:,None]
metaltex=image('Nox weathered iron',metal_rgb)

def mat(name,color,roughness=1,metal=0,texture=None,normal=None,rough=None):
    m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;b=n.get('Principled BSDF')
    b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=roughness;b.inputs['Metallic'].default_value=metal
    if texture:
        t=n.new('ShaderNodeTexImage');t.image=texture;l.new(t.outputs['Color'],b.inputs['Base Color'])
    if normal:
        t=n.new('ShaderNodeTexImage');t.image=normal;nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.55;l.new(t.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],b.inputs['Normal'])
    if rough:
        t=n.new('ShaderNodeTexImage');t.image=rough;l.new(t.outputs['Color'],b.inputs['Roughness'])
    m.diffuse_color=(*color,1);return m
cloth=mat('nox_worn_wool',(.075,.08,.07),texture=clothtex,normal=clothnormal,rough=clothrough)
lining=mat('nox_dark_linen',(.025,.03,.029),.99,texture=clothtex,normal=clothnormal,rough=clothrough)
seam=mat('nox_frayed_seams',(.17,.15,.11),.96)
bone=mat('nox_old_bone',(.37,.31,.22),.84)
iron=mat('nox_pitted_iron',(.18,.19,.18),.68,.7,texture=metaltex)
edge=mat('nox_cutting_edge',(.29,.31,.32),.46,.75)
leather=mat('nox_leather_binding',(.065,.046,.029),.88)
wood=mat('nox_ash_staff',(.09,.065,.042),.88)
bronze=mat('nox_aged_bronze',(.14,.105,.05),.72,.55)

def mesh(name,verts,faces,material,parent=root,uv=None,solid=0,sub=0):
    me=bpy.data.meshes.new(name);me.from_pydata([coord(p) for p in verts],[],faces);me.update()
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.parent=parent;me.materials.append(material)
    for p in me.polygons:p.use_smooth=True
    layer=me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        for i in p.loop_indices:
            idx=me.loops[i].vertex_index;layer.data[i].uv=uv[idx] if uv else (verts[idx][0]*.6,verts[idx][1]*.6)
    if material in [cloth,lining]:
        colors=me.color_attributes.new(name='Wear',type='FLOAT_COLOR',domain='POINT')
        for i,(xx,yy,zz) in enumerate(verts):
            hem=max(0,1-yy/.9) if parent==root else (max(0,-yy/.7) if 'sleeve' in name else 0)
            dirt=hem*(.32+.18*sin(xx*21+zz*17))
            abrasion=.1*max(0,sin(xx*35+yy*7+zz*19))**8
            colors.data[i].color=(.78-dirt+abrasion,.8-dirt*1.22+abrasion,.77-dirt*1.5+abrasion,1)
    if sub:
        mod=o.modifiers.new('Tailored smooth cloth','SUBSURF');mod.levels=sub;mod.render_levels=sub
    if solid:
        mod=o.modifiers.new('Fabric edge thickness','SOLIDIFY');mod.thickness=solid;mod.offset=0
    return o

def tube(name,pts,radii,material,parent=root,sides=10):
    # Dense interpolated centerlines with a transported circular frame.
    points=[Vector(p) for p in pts];verts=[];uv=[];faces=[]
    for i,p in enumerate(points):
        tangent=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
        n=tangent.cross(Vector((0,0,1)))
        if n.length<.01:n=tangent.cross(Vector((1,0,0)))
        n.normalize();b=tangent.cross(n).normalized()
        for j in range(sides+1):
            a=j/sides*2*pi;q=p+radii[i]*(n*cos(a)+b*sin(a));verts.append(tuple(q));uv.append((j/sides,i/(len(points)-1)))
            if i and j:
                k=i*(sides+1)+j;faces.append((k-sides-2,k-sides-1,k,k-1))
    return mesh(name,verts,faces,material,parent,uv)
def curve(name,pts,radius,material,parent=root):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=4;cu.bevel_resolution=1;cu.bevel_depth=radius
    sp=cu.splines.new('BEZIER');sp.bezier_points.add(len(pts)-1)
    for b,p in zip(sp.bezier_points,pts):b.co=coord(p);b.handle_left_type='AUTO';b.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);o.parent=parent;cu.materials.append(material);return o

def profile(y):
    heights=[.08,.65,1.4,2.15,2.65,3.15,3.43]
    return [np.interp(y,heights,arr) for arr in [[.88,.76,.6,.39,.47,.67,.31],[.58,.55,.43,.25,.29,.34,.25],[.23,.2,.12,.0,-.06,-.11,-.12]]]
def garment(name,cape=False):
    verts=[];faces=[];uv=[];rows=48;cols=80
    for i in range(rows+1):
        t=i/rows;yy=3.43-t*3.32
        for j in range(cols+1):
            a=(-2.4+j/cols*4.8) if cape else j/cols*2*pi
            rx,rz,cz=profile(yy)
            if cape:rx+=.1+.13*t;rz+=.09+.22*t;cz+=.05
            # Unequal folds gather at the waist and fan out toward the hem.
            phase=a*11+sin(a*3)*.7+t*.7
            fold=sum(amp*math.exp(-(math.atan2(sin(a-angle-.12*t),cos(a-angle-.12*t))/(.12+.07*t))**2) for angle,amp in [(-2.2,.065),(-1.34,-.04),(-.55,.07),(.3,-.055),(1.2,.08),(2.14,-.05),(2.8,.045)])*(.45+.7*t)
            compression=math.exp(-((yy-2.17)/.22)**2)*sin(a*5+yy*22)*.025
            radius=fold+compression
            tears=sum(depth*max(0,1-abs(math.atan2(sin(a-center),cos(a-center)))/width)**.65 for center,width,depth in [(-2.0,.13,.41),(-.75,.09,.29),(.55,.17,.48),(1.87,.11,.34),(2.7,.15,.23)])
            hem=max(0,(t-.72)/.28)**2*(tears+.055*sin(a*17)+.035*sin(a*37))
            vx=sin(a)*(rx+radius)+.035*sin(t*5);vz=cos(a)*(rz+radius)+cz
            if cape:vz+=max(0,cos(a))*t*t*.45
            verts.append((vx,yy+hem,vz));uv.append((j/cols*3,t*2))
            if i and j:
                k=i*(cols+1)+j
                torn=((t-.8)/.025)**2+((a-.8)/.07)**2<1 or ((t-.91)/.035)**2+((a-1.5)/.055)**2<1
                if not torn:faces.append((k-cols-2,k-cols-1,k,k-1))
    o=mesh(name,verts,faces,cloth if cape else lining,root,uv,.012,0)
    # Actual ragged edge contours, with subdued sewing along the cape opening.
    if cape:
        for j in [0,cols]:curve('Cape bound edge',[verts[i*(cols+1)+j] for i in range(0,rows+1,3)],.006,seam)
    for j in range(1,cols,2):
        if random.random()>.65:continue
        p=Vector(verts[rows*(cols+1)+j]);q=p+Vector((random.uniform(-.025,.025),-random.uniform(.025,.11),random.uniform(-.02,.02)))
        curve('Loose hem yarn',[p,(p+q)*.5+Vector((.008,0,.009)),q],.0017,seam)
    return o
garment('robe');garment('cape',True)

# A short asymmetric shoulder mantle breaks the long skirt's vertical rhythm.
verts=[];faces=[];uv=[];rows=28;cols=88
for i in range(rows+1):
    t=i/rows
    for j in range(cols+1):
        a=j/cols*2*pi;r=.27+.57*sin(t*pi/2)
        hem=2.66+.21*sin(a)+.07*cos(a*3)
        yy=3.51*(1-t)+hem*t
        fold=.027*sin(a*6+t*2)*sin(pi*t)+.012*sin(a*11-t*3)
        verts.append((sin(a)*(r+fold),yy+.018*sin(a*13)*t**4,cos(a)*(r*.56+fold)-.12))
        uv.append((j/cols*2,t))
        if i and j:
            k=i*(cols+1)+j;faces.append((k-cols-2,k-cols-1,k,k-1))
mesh('shoulder_mantle',verts,faces,cloth,root,uv,.016,0)

# Separate front stole, draped over the chest with an asymmetrical, split hem.
for side in [-1,1]:
    verts=[];uv=[];faces=[];rows=48;cols=14
    for i in range(rows+1):
        t=i/rows;y=2.67-2.37*t;rx,rz,cz=profile(y)
        for j in range(cols+1):
            u=j/cols;xx=side*(.025+u*(.25+.1*t))+.025*sin(t*6)
            z=cz-rz-.04-.012*sin(u*pi*2+t*3)-.012*sin(t*11)*(1-t)
            verts.append((xx,y+max(0,t-.8)*.6*sin(u*9+side),z));uv.append((u,t*2))
            if i and j:
                k=i*(cols+1)+j;faces.append((k-cols-2,k-cols-1,k,k-1))
    mesh('Front stole '+str(side),verts,faces,cloth,root,uv,.01,1)

# Hood is a deep, folded shell around an opening, not a sphere with a face stuck on it.
verts=[];faces=[];uv=[];rows=32;cols=80
for i in range(rows+1):
    t=i/rows
    for j in range(cols+1):
        a=j/cols*2*pi;envelope=sin(pi*(.2+.8*t))**.7
        width=(.35+.16*sin(pi*t))*(1-t**4)
        height=(.48+.12*sin(pi*t))*(1-t**4)
        f=(sin(a*7+t*4)*.015+sin(a*13-t*9)*.009)*sin(pi*t)
        xx=sin(a)*(width+f);yy=cos(a)*(height+f)+.06+.09*max(0,cos(a))**8
        zz=-.47+t*.92+.035*sin(a*3+t*5)
        verts.append((xx,yy,zz));uv.append((j/cols,t))
        if i and j:
            k=i*(cols+1)+j;faces.append((k-cols-2,k-cols-1,k,k-1))
mesh('hood',verts,faces,cloth,head,uv,.018,0)
curve('Hood folded lip',[verts[j] for j in range(0,cols+1,2)],.014,cloth,head)
curve('Hood worn stitching',[(p[0]*1.012,p[1],p[2]-.008) for p in verts[:cols+1:2]],.0035,seam,head)

# Low-poly anatomical skull by CDmir, original UVs and baked texture detail preserved.
positions=[];texcoords=[];faces=[];faceuv=[]
with open(os.path.join(SOURCE,'skull-Low4K.obj')) as file:
    for line in file:
        bits=line.split()
        if not bits:continue
        if bits[0]=='v':positions.append(tuple(map(float,bits[1:4])))
        elif bits[0]=='vt':texcoords.append(tuple(map(float,bits[1:3])))
        elif bits[0]=='f':
            ids=[b.split('/') for b in bits[1:]];faces.append(tuple(int(b[0])-1 for b in ids));faceuv.append([texcoords[int(b[1])-1] for b in ids])
arr=np.array(positions);center=(arr.min(axis=0)+arr.max(axis=0))/2;scale=.73/(arr[:,1].max()-arr[:,1].min())
positions=[tuple((p-center)*np.array([-1,1,-1])*scale+np.array([0,-.025,-.11])) for p in arr]
skull=mesh('anatomical_skull',positions,faces,bone,head)
for poly,tex in zip(skull.data.polygons,faceuv):
    for idx,uv in zip(poly.loop_indices,tex):skull.data.uv_layers.active.data[idx].uv=uv
def loadmap(filename,linear=False):
    im=bpy.data.images.load(os.path.join(SOURCE,filename));im.scale(1024,1024)
    if linear:im.colorspace_settings.name='Non-Color'
    im.pack();return im
skullmat=mat('nox_skull_CDmir_CC0',(.45,.38,.25),.9,texture=loadmap('Skull-Low.png'),normal=loadmap('Skull-Low-normal.png',True))
# Use the author's cavity map in glTF's dedicated occlusion channel.
from io_scene_gltf2.blender.com.material_helpers import create_settings_group
group=create_settings_group('glTF Material Output');node=skullmat.node_tree.nodes.new('ShaderNodeGroup');node.node_tree=group
ao=skullmat.node_tree.nodes.new('ShaderNodeTexImage');ao.image=loadmap('Skull-AO.png',True);skullmat.node_tree.links.new(ao.outputs['Color'],node.inputs['Occlusion'])
skull.data.materials.clear();skull.data.materials.append(skullmat)

# Jointed sleeves, with compression folds at the elbow and a generous, irregular cuff.
def sleeve(parent,name,length,upper):
    verts=[];faces=[];uv=[];rows=20;cols=32
    for i in range(rows+1):
        t=i/rows
        for j in range(cols+1):
            a=j/cols*2*pi
            r=(.22-.055*t if upper else .16+.055*t**3)
            r+=sin(a*4+t*2)*.008+sin(t*23+a*2)*.016*math.exp(-((t-.85)/.3)**2)
            verts.append((cos(a)*r,-t*length+(.03*sin(a*5) if not upper and i==rows else 0),sin(a)*r))
            uv.append((j/cols,t))
            if i and j:
                k=i*(cols+1)+j;faces.append((k-cols-2,k-cols-1,k,k-1))
    return mesh(name,verts,faces,cloth,parent,uv,.012,0)
for i,side in enumerate([-1,1]):
    sleeve(arms[i],'Upper sleeve '+str(side),.84,True);sleeve(forearms[i],'Forearm sleeve '+str(side),.67,False)
    # Narrow palm, metacarpals, three phalanges, knuckles and an opposing thumb.
    for finger in range(4):
        yy=.15-finger*.095;z=.018
        pts=[(side*.21,yy-.035,z+.035),(side*.12,yy,.02),(side*.04,yy,-.083),(-side*.055,yy-.005,-.079),(-side*.089,yy-.025,-.005),(-side*.025,yy-.035,.06)]
        tube('Finger '+str(side)+' '+str(finger),pts,[.024,.03,.025,.022,.019,.013],bone,hands[i],10)
        tube('Metacarpal '+str(side)+' '+str(finger),[(side*.14,yy,.04),(side*.2,yy-.12,.07),(side*.18,-.22,.09)],[.024,.022,.03],bone,hands[i])
    tube('Opposing thumb '+str(side),[(side*.2,-.14,.1),(side*.24,.005,.01),(side*.14,.15,-.04),(side*.035,.16,-.04)],[.038,.034,.028,.018],bone,hands[i])

# Funeral cord and small tarnished fixtures: a restrained material accent.
for n in [0,1]:
    curve('Waist cord '+str(n),[(.42*sin(a),2.14+n*.032+.025*sin(a*3),.28*cos(a)) for a in np.linspace(0,2*pi,90)],.012,seam)
curve('Hanging knot',[(.12,2.14,-.3),(.2,2.07,-.34),(.12,1.8,-.39),(.24,1.65,-.41)],.014,seam)
curve('Knot second tail',[(.15,2.14,-.3),(.08,1.95,-.36),(.06,1.58,-.42)],.011,seam)

# Bent ashwood shaft and forged blade, modeled as a wedge rather than a flat extruded icon.
staffpoints=[(.02*sin(t*pi),-1.05+3.7*t,.025*sin(t*pi*2)) for t in np.linspace(0,1,50)]
staff=tube('staff',staffpoints,[.044*(1-.2*i/49) for i in range(50)],wood,weapon,16)
for y0 in [0,.9]:
    curve('Leather grip '+str(y0),[(.047*cos(t*2*pi*9),y0-.21+t*.42,.047*sin(t*2*pi*9)) for t in np.linspace(0,1,140)],.009,leather,weapon)
verts=[];faces=[];uv=[];sections=72
for i in range(sections+1):
    t=i/sections
    xx=2.35*t;yy=2.61+.15*sin(pi*t)-.9*t*t
    width=.32*(sin(pi*(.18+.82*t))**.8)
    width-=sum(depth*max(0,1-abs(t-center)/span) for center,span,depth in [(.31,.018,.028),(.57,.012,.019),(.76,.02,.032)])
    for j in range(4):
        fy=[0,.32,1,.32][j];zz=[0,.042*(1-t),.001,-.042*(1-t)][j]
        verts.append((xx,yy-width*fy,zz));uv.append((t,j/3))
    if i:
        for j in range(4):faces.append(((i-1)*4+j,i*4+j,i*4+(j+1)%4,(i-1)*4+(j+1)%4))
blade=mesh('forged_scythe',verts,faces,iron,weapon,uv)
blade.data.materials.append(edge)
for p in blade.data.polygons:
    if p.index%4 in [1,2]:p.material_index=1
curve('Blade spine',[(2.35*t,2.61+.15*sin(pi*t)-.9*t*t,.0) for t in np.linspace(0,.95,50)],.021,iron,weapon)
for yy in [2.35,2.45,2.55]:
    curve('Iron ferrule',[(.065*cos(a),yy,.065*sin(a)) for a in np.linspace(0,2*pi,50)],.014,iron,weapon)

# Export neutral joint transforms. Pose is solved in-game so both hands stay on the staff.
for o in list(bpy.context.scene.objects):
    if o.type=='CURVE':
        bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
    if o.type=='MESH':
        bpy.context.view_layer.objects.active=o
        for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
        o.data.validate();o.data.update()
        # Recalculate normals after coordinate conversion / cloth surfaces.
        o.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
for material in [cloth,lining]:
    nodes=material.node_tree.nodes;links=material.node_tree.links;bsdf=nodes.get('Principled BSDF')
    previous=bsdf.inputs['Base Color'].links[0].from_socket
    vc=nodes.new('ShaderNodeVertexColor');vc.layer_name='Wear';mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
    links.new(previous,mix.inputs[1]);links.new(vc.outputs['Color'],mix.inputs[2]);links.new(mix.outputs['Color'],bsdf.inputs['Base Color'])
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ART,'nox.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'guardian-reaper.glb'),export_format='GLB',export_yup=True,export_animations=False,export_extras=True,export_vertex_color='ACTIVE')
stats={'vertices':sum(len(o.data.vertices) for o in bpy.context.scene.objects if o.type=='MESH'),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH'),'meshObjects':sum(o.type=='MESH' for o in bpy.context.scene.objects),'skullSource':'CDmir / Human Skull / CC0 / https://opengameart.org/content/human-skull-0'}
json.dump(stats,open(os.path.join(ART,'nox-build.json'),'w'),indent=2);print('NOX_BUILD',stats)
