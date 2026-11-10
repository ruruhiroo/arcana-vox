// 声の高さを変える (2本の遅延線を交互に読む、軽い音程変換)
class PitchShift extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'ratio', defaultValue: 1, minValue: 0.4, maxValue: 2.5 }]; }
  constructor() { super(); this.size = 8192; this.buf = new Float32Array(this.size); this.w = 0; this.phase = 0; }
  read(pos) {
    pos = ((pos % this.size) + this.size) % this.size;
    const i = Math.floor(pos), f = pos - i;
    return this.buf[i] * (1 - f) + this.buf[(i + 1) % this.size] * f;
  }
  process(inputs, outputs, params) {
    const inp = inputs[0] && inputs[0][0], out = outputs[0];
    if (!out || !out[0]) return true;
    const ratio = params.ratio[0], win = 1200;
    for (let i = 0; i < out[0].length; i++) {
      this.buf[this.w] = inp ? inp[i] : 0;
      this.phase += (1 - ratio) / win;
      if (this.phase >= 1) this.phase -= 1; else if (this.phase < 0) this.phase += 1;
      const p2 = (this.phase + 0.5) % 1;
      const s = this.read(this.w - this.phase * win) * Math.sin(Math.PI * this.phase) + this.read(this.w - p2 * win) * Math.sin(Math.PI * p2);
      for (const ch of out) ch[i] = s;
      this.w = (this.w + 1) % this.size;
    }
    return true;
  }
}
registerProcessor('pitch-shift', PitchShift);
