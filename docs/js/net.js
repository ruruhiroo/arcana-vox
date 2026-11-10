import { makeVoiceFx } from './voicefx.js';
// オンライン: WebSocket リレー + WebRTC 近接ボイスチャット(VC)
// 他プレイヤーの詠唱は「声」としても届き、距離と方向で聞こえ方が変わる。
export class Net {
  constructor(handlers) {
    this.h = handlers; this.ws = null; this.id = null; this.hostId = null; this.peers = new Map(); this.stream = null;
    this.audioCtx = null;
  }
  connect(room, name, mode, host) {
    return new Promise((resolve, reject) => {
      const h = (host || location.host).replace(/^\w+:\/\//, '').replace(/\/.*$/, '');
      const url = (location.protocol === 'https:' && !host ? 'wss://' : 'ws://') + (h.includes(':') ? h : h + ':8080');
      let ws;
      try { ws = new WebSocket(url); } catch (e) { return reject(e); }
      this.ws = ws;
      const to = setTimeout(() => reject(new Error('timeout')), 4000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'join', room, name, mode }));
      ws.onerror = () => { clearTimeout(to); reject(new Error('ws error')); };
      ws.onclose = () => this.h.close?.();
      ws.onmessage = ev => {
        const m = JSON.parse(ev.data);
        if (m.t === 'welcome') { clearTimeout(to); this.id = m.id; this.hostId = m.hostId; resolve(m); }
        if (m.t === 'roster') this.hostId = m.hostId;
        if (m.t === 'rtc') return this.onRtc(m);
        if (m.t === 'roster' && m.joined && this.stream) this.call(m.joined);
        if (m.t === 'roster' && m.left) this.dropPeer(m.left);
        this.h.message(m);
      };
    });
  }
  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  get isHost() { return this.id === this.hostId; }

  // ---- VC ----
  async enableVoice(players, audioCtx, masterOut) {
    this.audioCtx = audioCtx; this.masterOut = masterOut;
    try {
      this.stream = window.G?.micStream || await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) { console.warn('VC unavailable', e); return false; }
    for (const p of players) if (p.id !== this.id) this.call(p.id);
    return true;
  }
  peer(id) {
    let p = this.peers.get(id);
    if (p) return p;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    p = { pc, panner: null, gain: null };
    this.peers.set(id, p);
    if (this.stream) for (const t of this.stream.getTracks()) pc.addTrack(t, this.stream);
    pc.onicecandidate = e => { if (e.candidate) this.send({ t: 'rtc', to: id, cand: e.candidate }); };
    pc.ontrack = e => {
      // Chrome は MediaStream を要素に繋がないと音が流れないため、無音の audio 要素にも割り当てる
      const el = new Audio(); el.srcObject = e.streams[0]; el.muted = true; el.play().catch(() => {});
      if (!this.audioCtx) return;
      const src = this.audioCtx.createMediaStreamSource(e.streams[0]);
      const pan = this.audioCtx.createPanner();
      pan.panningModel = 'HRTF'; pan.distanceModel = 'linear'; pan.refDistance = 2; pan.maxDistance = 40; pan.rolloffFactor = 1;
      const g = this.audioCtx.createGain(); g.gain.value = 1.6;
      const fx = makeVoiceFx(this.audioCtx); // 茸や罠で変わった声
      src.connect(fx.input); fx.output.connect(g); g.connect(pan); pan.connect(this.audioCtx.destination);
      p.panner = pan; p.el = el; p.fx = fx; if (p.fxMode) fx.set(p.fxMode);
    };
    return p;
  }
  async call(id) {
    if (this.id > id) return; // 片側だけが offer を出す
    const p = this.peer(id);
    const offer = await p.pc.createOffer(); await p.pc.setLocalDescription(offer);
    this.send({ t: 'rtc', to: id, sdp: p.pc.localDescription });
  }
  async onRtc(m) {
    const p = this.peer(m.from);
    if (m.sdp) {
      await p.pc.setRemoteDescription(m.sdp);
      if (m.sdp.type === 'offer') {
        const ans = await p.pc.createAnswer(); await p.pc.setLocalDescription(ans);
        this.send({ t: 'rtc', to: m.from, sdp: p.pc.localDescription });
      }
    } else if (m.cand) { try { await p.pc.addIceCandidate(m.cand); } catch {} }
  }
  dropPeer(id) { const p = this.peers.get(id); if (p) { p.pc.close(); this.peers.delete(id); } }
  setVoiceFx(id, mode) { const p = this.peer ? this.peers.get(id) : null; if (!p) return; p.fxMode = mode; p.fx?.set(mode); }
  positionVoice(id, x, z) {
    const p = this.peers.get(id);
    if (p?.panner?.positionX) { p.panner.positionX.value = x; p.panner.positionY.value = 1.6; p.panner.positionZ.value = z; }
  }
}
