// ボイスチャットの声を変える: 高い声(ヘリウム) / 低い声 / ロボット / こだま
// 受け取る側で、その仲間の声にだけ掛ける
const loaded = new WeakMap();
function loadWorklet(ctx) {
  if (!loaded.has(ctx)) loaded.set(ctx, ctx.audioWorklet?.addModule(new URL('./voicefx-worklet.js', import.meta.url).href).then(() => true).catch(() => false) ?? Promise.resolve(false));
  return loaded.get(ctx);
}

export const VOICE_NAMES = { high: '高い声', low: '低い声', robot: 'ロボ声', echo: 'こだま声' };

export function makeVoiceFx(ctx) {
  const input = ctx.createGain(), output = ctx.createGain();
  input.connect(output);
  let nodes = [], mode = null, pitch = null;
  loadWorklet(ctx).then(ok => { if (ok) try { pitch = new AudioWorkletNode(ctx, 'pitch-shift'); } catch {} if (mode) set(mode); });
  function clear() {
    try { input.disconnect(); } catch {}
    for (const n of nodes) { try { n.disconnect(); } catch {} try { n.stop?.(); } catch {} }
    nodes = [];
    if (pitch) try { pitch.disconnect(); } catch {}
  }
  function set(m) {
    mode = m || null;
    clear();
    if (!mode) { input.connect(output); return; }
    if ((mode === 'high' || mode === 'low') && pitch) {
      pitch.parameters.get('ratio').value = mode === 'high' ? 1.75 : 0.62;
      input.connect(pitch); pitch.connect(output);
    } else if (mode === 'high' || mode === 'low') {
      input.connect(output); // 音程変換が使えない環境ではそのまま
    } else if (mode === 'robot') {
      // 振幅を素早く揺らす(リング変調) + 少しのこもり
      const am = ctx.createGain(); am.gain.value = 0;
      const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = 55; osc.connect(am.gain); osc.start();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.8;
      const boost = ctx.createGain(); boost.gain.value = 2.2;
      input.connect(am); am.connect(bp); bp.connect(boost); boost.connect(output);
      nodes.push(am, osc, bp, boost);
    } else if (mode === 'echo') {
      const d = ctx.createDelay(1); d.delayTime.value = 0.28;
      const fb = ctx.createGain(); fb.gain.value = 0.5;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      input.connect(output); input.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(output);
      nodes.push(d, fb, lp);
    }
  }
  return { input, output, set, get mode() { return mode; } };
}
