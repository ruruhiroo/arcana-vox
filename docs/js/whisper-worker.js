// AI 音声認識 (Whisper) をゲームとは別のスレッドで動かす
// GPU (WebGPU) が使えれば高精度の small、使えなければ軽い base を CPU で使う。
// モデルは初回だけダウンロードされ、以後はキャッシュから読み込まれる。
// 置き場所(サイトの下の階層で公開されていても動くように、この worker からの相対で)
const LIB = new URL('../vendor/nm/@huggingface/transformers/dist/', self.location.href).href;
let asr = null;
let queue = Promise.resolve(); // 認識は1つずつ順番に

async function load() {
  const { pipeline, env } = await import(LIB + 'transformers.min.js');
  env.allowLocalModels = false;
  env.backends.onnx.wasm.wasmPaths = LIB;
  let device = 'wasm', model = 'onnx-community/whisper-base', dtype = 'q8';
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (adapter) {
      device = 'webgpu'; model = 'onnx-community/whisper-small';
      dtype = { encoder_model: adapter.features.has('shader-f16') ? 'fp16' : 'fp32', decoder_model_merged: 'q4' };
    }
  } catch {}
  // ダウンロードの進み具合(全ファイル合計)
  const files = new Map();
  const progress_callback = p => {
    if (p.status === 'progress' && p.total) {
      files.set(p.file, [p.loaded, p.total]);
      let a = 0, b = 0; for (const [l, t] of files.values()) { a += l; b += t; }
      postMessage({ type: 'progress', p: Math.round(a / b * 100), mb: Math.round(b / 1e6) });
    }
  };
  try {
    asr = await pipeline('automatic-speech-recognition', model, { device, dtype, progress_callback });
  } catch (e) {
    if (device !== 'webgpu') throw e;
    // GPU で失敗したら CPU の軽いモデルで
    device = 'wasm'; model = 'onnx-community/whisper-base';
    asr = await pipeline('automatic-speech-recognition', model, { device, dtype: 'q8', progress_callback });
  }
  // 最初の1回は準備(シェーダーの作成など)に時間がかかるので、無音で慣らしておく
  await asr(new Float32Array(16000), { language: 'japanese', task: 'transcribe' });
  postMessage({ type: 'ready', device, model });
}

onmessage = async ({ data }) => {
  if (data.type === 'load') {
    try { await load(); } catch (e) { postMessage({ type: 'error', msg: String(e?.message || e) }); }
  } else if (data.type === 'run') queue = queue.then(() => run(data));
};
async function run(data) {
  {
    let text = '';
    try {
      const out = await asr(data.audio, { language: 'japanese', task: 'transcribe', max_new_tokens: 80 });
      text = (out?.text || '').trim();
    } catch (e) { console.warn('whisper', e); }
    postMessage({ type: 'result', id: data.id, kind: data.kind, text });
  }
}
