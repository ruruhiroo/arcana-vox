// インターネット越しの P2P (アプリ同士で直接 WebRTC 接続)
// 待ち合わせ(シグナリング)だけ公開の Nostr リレーを使い、ゲームのデータと声は相手と直接やりとりする。
// 自前サーバー不要。Net (WebSocket版) と同じインターフェースを持つので、ゲーム側は差し替えるだけでよい。
import { joinRoom, selfId } from '@trystero-p2p/nostr';

const APP_ID = 'arcana-vox-p2p-v1';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 読み間違えやすい O/0/I/1 を除外

export function makeRoomCode() {
  let s = '';
  const r = crypto.getRandomValues(new Uint8Array(6));
  for (const b of r) s += CODE_CHARS[b % CODE_CHARS.length];
  return s;
}

// 文字列の peerId からゲーム内で使う小さな整数 ID を作る (色・出現位置・チーム名に使う)
function numId(peerId) {
  let h = 2166136261;
  for (let i = 0; i < peerId.length; i++) { h ^= peerId.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 899999) + 100000;
}

export class P2PNet {
  constructor(handlers) {
    this.h = handlers; this.room = null;
    this.id = numId(selfId); this.hostId = null;
    this.players = new Map();   // numId -> { id, name, peerId, since }
    this.byPeer = new Map();    // peerId -> numId
    this.voice = new Map();     // numId -> { panner, el }
    this.pendingStreams = new Map();
    this.stream = null; this.audioCtx = null;
    this.since = Date.now();
  }
  get isHost() { return this.id === this.hostId; }

  // asHost=true: 部屋を作る / false: 既存の部屋に入る (部屋の主が見つかるまで待つ)
  connect(code, name, mode, asHost, { timeout = 30000 } = {}) {
    this.code = code.toUpperCase(); this.name = name; this.mode = mode;
    if (asHost) this.hostId = this.id;
    this.players.set(this.id, { id: this.id, name, peerId: selfId, since: this.since });
    const room = this.room = joinRoom({ appId: APP_ID, password: 'av:' + this.code }, this.code);
    const [sendHello, getHello] = this.mk('hello');
    const [sendMsg, getMsg] = this.mk('m');
    this.sendHello = sendHello; this.sendMsg = sendMsg;

    room.onPeerJoin = peerId => {
      sendHello(this.helloPayload(), peerId);
      if (this.stream) room.addStream(this.stream, { target: peerId });
    };
    room.onPeerLeave = peerId => this.onLeave(peerId);
    room.onPeerStream = (stream, peerId) => this.onStream(stream, peerId);
    getMsg((m, peerId) => {
      const from = this.byPeer.get(peerId);
      if (from == null) return; // 自己紹介前のメッセージは無視
      m.from = from;
      this.h.message(m);
    });

    return new Promise((resolve, reject) => {
      const welcome = extra => ({ id: this.id, hostId: this.hostId, mode: this.mode, seed: extra.seed, floor: extra.floor || 1, players: [...this.players.values()].map(p => ({ id: p.id, name: p.name })) });
      if (asHost) {
        this.seed = (Math.random() * 1e9) | 0; this.floor = 1;
        resolve(welcome({ seed: this.seed, floor: 1 }));
      }
      const timer = asHost ? null : setTimeout(() => { this.leave(); reject(new Error('部屋が見つからない')); }, timeout);
      let welcomed = asHost;
      getHello((hi, peerId) => {
        const known = this.byPeer.has(peerId);
        const p = { id: hi.id, name: String(hi.name || '魔導師').slice(0, 16), peerId, since: hi.since };
        this.players.set(p.id, p); this.byPeer.set(peerId, p.id);
        if (hi.isHost) this.hostId = hi.id;
        if (!welcomed) {
          if (!hi.isHost) return; // 部屋の主からの挨拶を待つ
          welcomed = true; clearTimeout(timer);
          this.mode = hi.mode || this.mode;
          resolve(welcome({ seed: hi.seed, floor: hi.floor }));
          return;
        }
        if (!known) this.h.message({ t: 'roster', players: this.roster(), hostId: this.hostId, joined: p.id });
        const pend = this.pendingStreams.get(peerId);
        if (pend) { this.pendingStreams.delete(peerId); this.onStream(pend, peerId); }
      });
    });
  }

  // trystero の action を (送信, 受信登録) の組に変換 (新旧 API 両対応)
  mk(name) {
    const a = this.room.makeAction(name);
    if (Array.isArray(a)) return [(d, target) => a[0](d, target), fn => a[1](fn)];
    return [(d, target) => a.send(d, target ? { target } : undefined), fn => { a.onMessage = (d, ctx) => fn(d, ctx?.peerId ?? ctx); }];
  }

  helloPayload() {
    const st = this.h.roomState?.() || {};
    return { id: this.id, name: this.name, since: this.since, isHost: this.isHost, mode: this.mode, seed: st.seed ?? this.seed, floor: st.floor ?? this.floor };
  }
  roster() { return [...this.players.values()].map(p => ({ id: p.id, name: p.name })); }

  onLeave(peerId) {
    const id = this.byPeer.get(peerId);
    this.byPeer.delete(peerId); this.pendingStreams.delete(peerId);
    if (id == null) return;
    this.players.delete(id);
    const v = this.voice.get(id); if (v) { v.el?.remove?.(); this.voice.delete(id); }
    // 部屋の主が抜けたら、残った中で一番古くからいる人(同時なら ID の小さい人)が引き継ぐ
    if (id === this.hostId) {
      const next = [...this.players.values()].sort((a, b) => a.since - b.since || a.id - b.id)[0];
      this.hostId = next?.id ?? this.id;
    }
    this.h.message({ t: 'roster', players: this.roster(), hostId: this.hostId, left: id });
  }

  send(obj) {
    if (!this.room) return;
    if (obj.to != null) {
      const p = this.players.get(obj.to);
      if (p && p.peerId !== selfId) this.sendMsg(obj, p.peerId);
    } else this.sendMsg(obj);
  }

  leave() { try { this.room?.leave(); } catch {} this.room = null; this.h.close?.(); }

  // ---- 近接ボイスチャット ----
  async enableVoice(_players, audioCtx) {
    this.audioCtx = audioCtx;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) { console.warn('VC unavailable', e); return false; }
    this.room?.addStream(this.stream);
    return true;
  }
  onStream(stream, peerId) {
    const id = this.byPeer.get(peerId);
    if (id == null) { this.pendingStreams.set(peerId, stream); return; }
    // Chrome は MediaStream を要素に繋がないと音が流れないため、無音の audio 要素にも割り当てる
    const el = new Audio(); el.srcObject = stream; el.muted = true; el.play().catch(() => {});
    const v = { el, panner: null };
    if (this.audioCtx) {
      const src = this.audioCtx.createMediaStreamSource(stream);
      const pan = this.audioCtx.createPanner();
      pan.panningModel = 'HRTF'; pan.distanceModel = 'linear'; pan.refDistance = 2; pan.maxDistance = 40; pan.rolloffFactor = 1;
      const g = this.audioCtx.createGain(); g.gain.value = 1.6;
      src.connect(g); g.connect(pan); pan.connect(this.audioCtx.destination);
      v.panner = pan;
    }
    this.voice.set(id, v);
  }
  positionVoice(id, x, z) {
    const p = this.voice.get(id)?.panner;
    if (p?.positionX) { p.positionX.value = x; p.positionY.value = 1.6; p.positionZ.value = z; }
  }
  dropPeer() {}
}
