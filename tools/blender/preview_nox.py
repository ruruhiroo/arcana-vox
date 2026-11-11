"""Pose the editable Nox source and render a neutral material / silhouette review."""
import bpy, math, os, sys
from mathutils import Vector,Quaternion
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
args=sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'art/guardians/nox.blend'))
def c(p):return Vector((p[0],-p[2],p[1]))
def quat(o,q):o.rotation_mode='QUATERNION';o.rotation_quaternion=q
w=bpy.data.objects['scythe'];w.location=c((.73,1.98,-.58));q=Quaternion(c((1,0,0)),.06)@Quaternion(c((0,0,1)),.51);quat(w,q)
down=c((0,-1,0))
for label,side,offset in [('L',-1,.9),('R',1,0)]:
    a=bpy.data.objects['arm_'+label];f=bpy.data.objects['forearm_'+label];h=bpy.data.objects['hand_'+label]
    target=w.location+q@c((0,offset,0));delta=target-a.location;d=delta.length;direction=delta.normalized();pole=c((side,.08,.48));pole=(pole-direction*pole.dot(direction)).normalized()
    along=(.78**2-.75**2+d*d)/(2*d);height=math.sqrt(max(0,.78**2-along**2));elbow=a.location+direction*along+pole*height
    upper=down.rotation_difference((elbow-a.location).normalized());lower=down.rotation_difference((target-elbow).normalized())
    quat(a,upper);quat(f,upper.inverted()@lower);quat(h,lower.inverted()@q)
quat(bpy.data.objects['neck'],Quaternion(c((1,0,0)),.12))
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.world.color=(.11,.11,.11)
for name,pos,power,color,size in [('key',(3,5,7),850,(1,.84,.66),5),('rim',(-3,-3,5),1100,(.6,.7,1),4),('fill',(-4,4,3),500,(.8,.87,1),4)]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;aim(o,(0,0,2.4))
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.name='Preview floor';floor.location.z=-.03
mat=bpy.data.materials.new('Preview neutral');mat.diffuse_color=(.065,.07,.08,1);floor.data.materials.append(mat)
bpy.ops.object.camera_add(location=(5,10,5.2));camera=bpy.context.object;aim(camera,(0,0,2.3));camera.data.type='ORTHO';camera.data.ortho_scale=5.8;scene.camera=camera
scene.render.resolution_x=1000;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.abspath(args[0])
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'art/guardians/nox.blend'))
bpy.ops.render.render(write_still=True)
