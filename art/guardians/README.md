# ノクスの制作データ

`nox.blend` は編集用、`public/models/guardian-reaper.glb` はゲーム用。制作スクリプトは `tools/blender/build_nox.py`。Blender 4.3で生成した。

## 頭蓋骨の出典

- Human Skull — **CDmir**
- https://opengameart.org/content/human-skull-0
- **CC0**: https://creativecommons.org/publicdomain/zero/1.0/
- 元データ `skull-obj.zip`。頭蓋骨のメッシュとAOを使用し、縮尺・向き・材質を調整した。

衣服、鎌、骨の手、リグ、布のテクスチャ、ゲームの動作制御はこのリポジトリで制作。外部のゲームモデル・アニメーションは流用していない。

## 再生成

元のzipを展開し、`skull-obj` フォルダを引数に渡す。リポジトリのルートから実行:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.3\blender.exe' --background --factory-startup --python tools/blender/build_nox.py -- '<展開先>/skull-obj'
```

`nox-build.json` にメッシュ数等を出力する。現在の136,648三角形・102メッシュはボス専用モデル。全ボス同時表示を想定していない。LOD・モバイル性能検証は未対応。

両手の位置は鎌の二つの握り位置から毎フレーム逆算する。布の裾・袖口の汚れ、粗さ、織り目、破れは色だけでなく頂点色・法線・形状へ分けて入れている。`preview_nox.py` はスタジオ確認用で、ゲーム内の照明とは異なる。

参考: [Marmosetのキャラクター制作解説](https://marmoset.co/posts/real-time-character-design-creation-and-presentation-breakdown/)の大きな形からシルエットを整える工程、[衣服・鎧の材質解説](https://marmoset.co/posts/rendering-realistic-clothing-and-armor-materials-in-toolbag/)の凹部の汚れ・縁の摩耗・粗さの差を制作に取り入れた。
