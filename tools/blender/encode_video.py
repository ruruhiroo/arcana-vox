# 連番の画像を動画(mp4)にまとめる。 blender -b --factory-startup -P tools/blender/encode_video.py -- <コマのフォルダ> <出力.mp4> [fps] [音楽.wav]
import bpy, sys, os, glob
argv = sys.argv[sys.argv.index('--') + 1:]
src, out, fps = os.path.abspath(argv[0]), os.path.abspath(argv[1]), int(argv[2]) if len(argv) > 2 else 30
frames = sorted(glob.glob(os.path.join(src, 'f*.jpg')))
sc = bpy.context.scene
sc.render.fps = fps
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1280, 720, int(os.environ.get('ENC_SCALE', '100'))   # ENC_SCALE=75 で小さく書き出す(送る用)
sc.view_settings.view_transform = 'Standard'
sc.sequence_editor_create()
st = sc.sequence_editor.sequences.new_image('trailer', frames[0], 1, 1)
for f in frames[1:]:
    st.elements.append(os.path.basename(f))
sc.frame_start, sc.frame_end = 1, len(frames)
audio = os.path.abspath(argv[3]) if len(argv) > 3 else os.path.join(src, 'bgm.wav')
if os.path.exists(audio):
    sc.sequence_editor.sequences.new_sound('bgm', audio, 2, 1)
    sc.render.ffmpeg.audio_codec = 'AAC'
    sc.render.ffmpeg.audio_bitrate = 192
    print('AUDIO', audio)
sc.render.image_settings.file_format = 'FFMPEG'
sc.render.ffmpeg.format = 'MPEG4'
sc.render.ffmpeg.codec = 'H264'
sc.render.ffmpeg.constant_rate_factor = os.environ.get('ENC_QUALITY', 'HIGH')   # ENC_QUALITY=MEDIUM で軽くする
sc.render.ffmpeg.gopsize = 15
sc.render.filepath = out
bpy.ops.render.render(animation=True)
print('ENCODED', len(frames), 'frames ->', out)
