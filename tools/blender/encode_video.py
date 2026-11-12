# 連番の画像を動画(mp4)にまとめる。 blender -b --factory-startup -P tools/blender/encode_video.py -- <コマのフォルダ> <出力.mp4> [fps]
import bpy, sys, os, glob
argv = sys.argv[sys.argv.index('--') + 1:]
src, out, fps = os.path.abspath(argv[0]), os.path.abspath(argv[1]), int(argv[2]) if len(argv) > 2 else 30
frames = sorted(glob.glob(os.path.join(src, 'f*.jpg')))
sc = bpy.context.scene
sc.render.fps = fps
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1280, 720, 100
sc.view_settings.view_transform = 'Standard'
sc.sequence_editor_create()
st = sc.sequence_editor.sequences.new_image('trailer', frames[0], 1, 1)
for f in frames[1:]:
    st.elements.append(os.path.basename(f))
sc.frame_start, sc.frame_end = 1, len(frames)
sc.render.image_settings.file_format = 'FFMPEG'
sc.render.ffmpeg.format = 'MPEG4'
sc.render.ffmpeg.codec = 'H264'
sc.render.ffmpeg.constant_rate_factor = 'HIGH'
sc.render.ffmpeg.gopsize = 15
sc.render.filepath = out
bpy.ops.render.render(animation=True)
print('ENCODED', len(frames), 'frames ->', out)
