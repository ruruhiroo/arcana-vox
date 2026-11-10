const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
async function fixture({ web = false, delayedMic = false } = {}) {
  const timers = new Map(), processors = [], workers = [], recognizers = [], finals = [], states = [];
  let timerId = 0, micCalls = 0, resolveMic;
  const micPromise = delayedMic ? new Promise(r => { resolveMic = r; }) : Promise.resolve({});
  class AudioContext {
    sampleRate = 16000; destination = {};
    resume() { return Promise.resolve(); }
    createMediaStreamSource() { return { connect() {} }; }
    createScriptProcessor() { const n = { connect() {} }; processors.push(n); return n; }
  }
  class Recognizer {
    events = {}; accepted = 0; finalized = 0;
    constructor() { recognizers.push(this); }
    on(name, cb) { this.events[name] = cb; }
    acceptWaveform() { this.accepted++; }
    retrieveFinalResult() { this.finalized++; }
  }
  class Worker {
    sent = [];
    constructor() { workers.push(this); }
    postMessage(m) { this.sent.push(m); }
    reply(m, text = '紅蓮 穿槍') { this.onmessage({ data: { ...m, type: 'result', text } }); }
  }
  class SR { start() { this.onstart?.(); } stop() {} abort() {} constructor() { SR.instance = this; } }
  const window = { desktop: web ? undefined : { isApp: true }, Worker,
    Vosk: { createModel: async () => ({ KaldiRecognizer: Recognizer }) }, SpeechRecognition: web ? SR : undefined };
  const context = vm.createContext({ window, navigator: { mediaDevices: { getUserMedia() { micCalls++; return micPromise; } } },
    AudioContext, Worker, URL, console, Float32Array,
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } });
  const cache = new Map();
  async function load(file) {
    if (cache.has(file)) return cache.get(file);
    const mod = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file,
      initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    cache.set(file, mod); await mod.link(spec => load(path.resolve(path.dirname(file), spec))); return mod;
  }
  const mod = await load(path.resolve('public/js/voice.js')); await mod.evaluate();
  const voice = mod.namespace;
  voice.initVoice({ final: a => finals.push(Array.from(a)), state: s => states.push(s) }); await flush();
  const tick = async () => { const jobs = [...timers.values()]; timers.clear(); jobs.forEach(fn => fn()); await flush(); };
  const speak = (blocks = 4, silent = false) => {
    const data = Float32Array.from({ length: 4096 }, (_, i) => silent ? 0 : Math.sin(i * 2 * Math.PI * 160 / 16000) * 0.1);
    for (let i = 0; i < blocks; i++) processors.at(-1).onaudioprocess({ inputBuffer: { getChannelData: () => data } });
  };
  return { voice, workers, recognizers, finals, states, tick, speak, SR, micCalls: () => micCalls,
    ready() { workers[0].onmessage({ data: { type: 'ready', device: 'wasm' } }); },
    async grant() { resolveMic({}); await flush(); } };
}

test('Vosk: pressing V again cancels the previous delayed stop', async () => {
  const h = await fixture(); h.voice.startListening(); await flush(); h.speak();
  h.voice.stopListening(); h.voice.startListening(); await h.tick(); h.speak();
  assert.equal(h.recognizers[0].finalized, 0); assert.equal(h.recognizers[0].accepted, 8);
  h.voice.stopListening(); await h.tick(); assert.equal(h.recognizers[0].finalized, 1);
});
test('Whisper: releasing V during microphone permission does not start recording later', async () => {
  const h = await fixture({ delayedMic: true }); h.ready(); h.voice.startListening(); h.voice.stopListening(); await h.grant();
  h.speak(); assert.ok(!h.states.includes('listening')); assert.equal(h.workers[0].sent.filter(m => m.type === 'run').length, 0);
});
test('Whisper: repeated starts share microphone initialization', async () => {
  const h = await fixture({ delayedMic: true }); h.ready(); h.voice.startListening(); h.voice.startListening();
  assert.equal(h.micCalls(), 1); await h.grant(); assert.equal(h.states.filter(s => s === 'listening').length, 1);
});
test('Whisper: a previous delayed stop cannot end the next chant', async () => {
  const h = await fixture(); h.ready(); h.voice.startListening(); await flush(); h.speak();
  h.voice.stopListening(); h.voice.startListening(); await flush(); await h.tick(); h.speak();
  assert.equal(h.workers[0].sent.filter(m => m.kind === 'final').length, 0);
  h.voice.stopListening(); await h.tick(); assert.equal(h.workers[0].sent.filter(m => m.kind === 'final').length, 1);
});
test('Whisper: old session results and duplicate finals cannot enter a new chant', async () => {
  const h = await fixture(); h.ready(); h.voice.startListening(); await flush(); h.speak(); h.voice.stopListening(); await h.tick();
  const worker = h.workers[0], old = worker.sent.find(m => m.kind === 'final');
  h.voice.startListening(); await flush(); worker.reply(old); assert.deepEqual(h.finals, []);
  h.speak(); h.voice.stopListening(); await h.tick();
  const current = worker.sent.filter(m => m.kind === 'final').at(-1); worker.reply(current); worker.reply(current);
  assert.deepEqual(h.finals, [['紅蓮 穿槍']]);
});
test('Whisper: continuous listening retains successive phrase results', async () => {
  const h = await fixture(); h.ready(); h.voice.setContinuous(true); await flush();
  for (let i = 0; i < 2; i++) {
    h.speak(); h.speak(4, true);
    h.workers[0].reply(h.workers[0].sent.filter(m => m.kind === 'final').at(-1));
  }
  assert.equal(h.finals.length, 2);
});
test('Whisper: silence does not produce a recognition request', async () => {
  const h = await fixture(); h.ready(); h.voice.startListening(); await flush(); h.speak(16, true);
  h.voice.stopListening(); await h.tick(); assert.equal(h.workers[0].sent.filter(m => m.type === 'run').length, 0);
});
test('Whisper: interim completion cannot clear another pending request', async () => {
  const h = await fixture(); h.ready(); h.voice.startListening(); await flush(); h.speak(11);
  h.voice.stopListening(); await h.tick();
  const w = h.workers[0], oldInterim = w.sent.find(m => m.kind === 'interim'), oldFinal = w.sent.find(m => m.kind === 'final');
  h.voice.startListening(); await flush(); w.reply(oldInterim); h.speak(11);
  assert.equal(w.sent.filter(m => m.type === 'run').length, 2);
  w.reply(oldFinal); h.speak(1); assert.equal(w.sent.filter(m => m.type === 'run').length, 3);
});
test('Web Speech network failure keeps a held push-to-talk request', async () => {
  const h = await fixture({ web: true }); h.voice.startListening(); h.SR.instance.onerror({ error: 'network' }); await flush();
  assert.equal(h.voice.engine, 'vosk'); assert.equal(h.micCalls(), 1); h.speak(); assert.equal(h.recognizers[0].accepted, 4);
});
test('Whisper becoming ready does not steal Vosk microphone initialization', async () => {
  const h = await fixture({ delayedMic: true }); h.voice.startListening(); await flush(); h.ready();
  assert.equal(h.voice.engine, 'vosk'); h.voice.stopListening(); await h.grant();
  assert.ok(!h.states.includes('listening'));
});
