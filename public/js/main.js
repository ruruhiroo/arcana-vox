// 詠唱迷宮 ARCANA VOX — 本体
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { G, rand, clamp, seeded } from './state.js';
import { WORDS, WORD_BY_ID, CAT, compile, formula, tokenize, canonicalize, expandChant, chantGaps, eloquence } from './lexicon.js';
// 声の聞き取り結果を言霊の正式表記に寄せる(似た音は言霊とみなす)。何も拾えなければ原文のまま
const heard = t => canonicalize(t).text || t;
import { generate, buildMeshes, moveWithCollision, raycastGrid, lineOfSight, W, H, CELL } from './dungeon.js';
import { Mage, Enemy, updateFlows } from './entities.js';
import { initFX, LightPool, clearLumens } from './spells.js';
import { BotBrain } from './ai.js';
import { UI, BOOK, loadBook, saveBook, openBook, closeBook, bookOpen, currentBook } from './ui.js';
import { initAudio, sfx, setListener, getAudioCtx, cycleAmbience, setAmbience, setMasterVolume } from './audio.js';
import { initVoice, voiceSupported, startListening, stopListening, setContinuous, isContinuous, setTTS, ttsOn } from './voice.js';
import { Net } from './net.js';
import { P2PNet, makeRoomCode } from './p2p.js';
import { buildViewModel } from './viewmodel.js';
import { startTutorial } from './tutorial.js';
import { ENEMY_TYPES } from './entities.js';
import { SLOTS, RARITY, rollItem, statLines, totals } from './equipment.js';
import { ACTIONS, binds, opts, actionOf, rebind, resetControls, saveControls, keyName, keyOf } from './controls.js';
import { glowSprite, runeCircleTex } from './textures.js';

const $ = id => document.getElementById(id);
G.ui = UI; window.G = G; // デバッグ用
const _hurt = UI.hurt.bind(UI); UI.hurt = a => { _hurt(a); sfx.hurt(); };

// ---------- 描画基盤 ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030202);
scene.fog = new THREE.FogExp2(0x060403, 0.042);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 120);
camera.rotation.order = 'YXZ';
scene.add(camera);
scene.add(new THREE.HemisphereLight(0x3a3550, 0x120c08, 0.6));
Object.assign(G, { scene, camera, renderer });

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.85, 0.55, 0.78);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  if (G.particles) G.particles.points.material.uniforms.scale.value = innerHeight / 2;
});

initFX();
const lightPool = new LightPool(10);

// 手元の書物(一人称視点): viewmodel.js — 両手で魔導書を抱え、開いた頁の詠唱文を読み上げる
const VM = buildViewModel(camera);
function renderBookPages() {
  const s = BOOK.spells[G.page];
  const sp = s ? compile(s.text, G.known) : null;
  const el = s ? eloquence(s.text, G.known) : null;
  VM.renderPages(s, G.page, BOOK.spells.length, { formula: sp ? formula(sp) : '', cost: sp?.cost ?? 0, tier: el?.tier });
}
document.fonts?.ready.then(() => { if (G.player) renderBookPages(); });
G.held = 'grimoire';
function setHeld(which) {
  const changed = G.held !== which; G.held = which;
  VM.setHeld(which);
  if (changed) VM.swap();
  if (G.player) UI.renderHotbar();
  // 持ち替えたら詠唱は途切れる
  if (G.player && which !== 'grimoire' && (G.player.chanting || typed)) { typed = null; clearChant(); }
}
setHeld('grimoire');
let castWarnT = -9;
function canCast() {
  return true; // 書物は魔導書ひとつ
  if (G.held === 'grimoire') return true;
  if (G.time - castWarnT > 2) { castWarnT = G.time; UI.log('魔導書を手にしていない — Q で持ち替えると詠唱できる', '#ffcf8a'); }
  return false;
}
const staffLight = new THREE.PointLight(0xffc48a, 5, 11, 1.6);
staffLight.position.set(0.15, 0.3, 0.5);
staffLight.castShadow = true; staffLight.shadow.mapSize.set(512, 512); staffLight.shadow.bias = -0.004; staffLight.shadow.camera.near = 0.1;
camera.add(staffLight);

// ---------- ロビー ----------
let chosenMode = 'coop';
document.querySelectorAll('.mode').forEach(el => el.onclick = () => {
  document.querySelectorAll('.mode').forEach(o => o.classList.remove('sel')); el.classList.add('sel'); chosenMode = el.dataset.mode;
});
const canOnline = location.protocol.startsWith('http');
// Web 公開版(サーバー無し)では LAN 直接接続は使えないので選択肢から外す
// アプリの中ではダウンロードの案内は要らない
if (window.desktop) document.getElementById('dlApp')?.remove();
if (!window.desktop && !/^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname)) document.querySelector('#netSel option[value="lan"]')?.remove();
// 仲間に伝える自分の部屋のアドレス(デスクトップ版はLANのIPを表示)
let hostHint = '';
window.desktop?.hostInfo().then(i => { if (i.lan.length) hostHint = `\nあなたの部屋のアドレス: ${i.lan.map(a => a + ':' + i.port).join(' / ')}`; });
const NET_NOTES = {
  host: '部屋コードを仲間に伝えよう。ネット越しにアプリ同士が直接つながる(ポート開放もサーバーも不要)。あなたが部屋の主となり、探索形式を決める。',
  join: '仲間から聞いた部屋コードを入れて「迷宮へ」。部屋の主が見つかるまで最大30秒ほど待つ。',
  lan: '同じネットワーク内で直接つなぐ。同じ合言葉で入る。接続先が空欄なら自分のPCが部屋になり、仲間はあなたのアドレスを入れる。',
};
let hostCode = makeRoomCode();
$('netSel').onchange = () => {
  const v = $('netSel').value;
  $('roomIn').classList.toggle('hidden', v === 'solo');
  $('hostIn').classList.toggle('hidden', v !== 'lan');
  $('copyCode').classList.toggle('hidden', v !== 'host');
  $('roomIn').readOnly = v === 'host';
  if (v === 'host') $('roomIn').value = hostCode;
  else if ($('roomIn').value === hostCode) $('roomIn').value = '';
  $('roomIn').placeholder = v === 'lan' ? '部屋の合言葉' : '部屋コード';
  $('netNote').textContent = v === 'solo' ? '' : !canOnline ? 'オンラインにはアプリ版か node server.js での起動が必要です。' : NET_NOTES[v] + (v === 'lan' ? hostHint : '');
};
$('copyCode').onclick = () => { navigator.clipboard?.writeText(hostCode).then(() => { $('copyCode').textContent = 'コピーした'; setTimeout(() => $('copyCode').textContent = 'コピー', 1500); }).catch(() => {}); };
$('voiceNote').textContent = voiceSupported
  ? (window.desktop ? '🎙 オフライン音声認識で詠唱できます(ネット接続不要)。' : '🎙 音声認識に対応しています。初回はマイクの使用許可を求められます。')
  : '⚠ このブラウザは音声認識に未対応です(Chrome / Edge 推奨)。Enter キーで文字詠唱できます。';
try { $('nameIn').value = localStorage.getItem('arcana_name') || ''; } catch {}
$('startBtn').onclick = () => startGame();
$('tutBtn').onclick = () => startGame({ tutorial: true });

// ---------- ゲーム状態 ----------
G.inv = {};
G.bots = [];
let dungeonGroup = null, portal = null;
let lootCounter = 0;
const keys = {};

async function startGame({ tutorial = false } = {}) {
  G.stats = { moved: 0, looked: 0, read: 0, flips: 0, kills: 0, chests: 0, eloquent: 0 };
  initAudio(); applySettings();
  loadBook();
  const name = $('nameIn').value.trim() || '漆黒の詠唱者';
  try { localStorage.setItem('arcana_name', name); } catch {}
  G.mode = chosenMode;
  if (tutorial) chosenMode = 'coop';
  const netMode = canOnline && !tutorial ? $('netSel').value : 'solo';
  let seed = (Math.random() * 1e9) | 0, floor = 1;
  if (netMode !== 'solo') {
    const handlers = {
      message: onNet,
      close: () => UI.log('接続が切れた', '#ff8080'),
      roomState: () => ({ seed: G.dungeon?.seed, floor: G.floor }),
    };
    const p2p = netMode !== 'lan';
    const net = p2p ? new P2PNet(handlers) : new Net(handlers);
    const code = p2p ? (netMode === 'host' ? hostCode : $('roomIn').value.trim().toUpperCase()) : ($('roomIn').value.trim() || 'ARCANA');
    if (netMode === 'join' && !code) { $('netNote').textContent = '部屋コードを入れてください。'; return; }
    $('startBtn').disabled = true;
    if (netMode === 'join') $('netNote').textContent = `部屋「${code}」を探しています…`;
    try {
      const w = p2p ? await net.connect(code, name, chosenMode, netMode === 'host') : await net.connect(code, name, chosenMode, $('hostIn').value.trim());
      G.net = net; G.netId = w.id; G.hostId = w.hostId; G.isHost = w.id === w.hostId; G.mode = w.mode || chosenMode;
      G.roomCode = p2p ? code : '';
      seed = w.seed; floor = w.floor || 1;
      net.enableVoice(w.players, getAudioCtx()).then(ok => UI.log(ok ? 'VC接続: 近くの魔導師の声が聞こえる' : 'VCは利用できない(マイク未許可)', '#b0d0ff'));
    } catch (e) {
      $('startBtn').disabled = false;
      $('netNote').textContent = netMode === 'join' ? `部屋「${code}」が見つからなかった。コードと、部屋の主がプレイ中かを確認してください。` : 'サーバーに接続できなかった。接続先のアドレスを確認してください。';
      return;
    }
  }
  $('lobby').classList.add('hidden'); $('hud').classList.remove('hidden');
  const team = G.mode === 'coop' ? 'hero' : 'T' + (G.netId || 'you');
  G.player = new Mage({ id: G.net ? 'p' + G.netId : 'you', name, kind: 'player', team, color: 0xffb060, pos: new THREE.Vector3() });
  G.mages = [G.player];
  if (!G.net && !tutorial) {
    const defs = G.mode === 'coop'
      ? [{ id: 'b1', name: 'リリス', color: 0x5a2a6a }, { id: 'b2', name: 'カイン', color: 0x2a4a3a }]
      : [{ id: 'b1', name: 'ヴァルグ', color: 0x6a1a1a }, { id: 'b2', name: 'セレネ', color: 0x1a3a6a }];
    for (const d of defs) {
      const m = new Mage({ ...d, kind: 'bot', team: G.mode === 'coop' ? 'hero' : 'T' + d.id, pos: new THREE.Vector3() });
      G.mages.push(m); G.bots.push({ mage: m, brain: new BotBrain(m, G.mode === 'coop' ? 'ally' : 'rival') });
    }
  }
  setupVoice();
  setupFloor(seed, floor, true);
  UI.renderHotbar(); setHeld("grimoire"); renderBookPages(); BOOK.equip ||= {}; BOOK.bag ||= []; applyEquip();
  if (tutorial) {
    // 手ほどき: 魔物も仲間もいない静かな層から始める
    for (const e of G.enemies) e.dispose(); G.enemies = [];
    const ahead = d => {
      const p = G.player, fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      const hit = raycastGrid(new THREE.Vector3(p.pos.x, 1, p.pos.z), fwd, d + 2);
      const dist = Math.max(1.5, Math.min(d, hit.distanceTo(new THREE.Vector3(p.pos.x, 1, p.pos.z)) - 1.2));
      return p.pos.clone().addScaledVector(fwd, dist).setY(0);
    };
    startTutorial({
      voiceOK: voiceSupported,
      openPageOf: name => { const i = BOOK.spells.findIndex(s => s.name.includes(name) || s.text.includes(name)); if (i >= 0) { G.page = i; setHeld('grimoire'); renderBookPages(); } },
      spawnFoe: () => { const e = new Enemy('tut_foe', 'skeleton', ahead(9), 1); G.enemies.push(e); },
      spawnChest: () => addPickup('tut_chest', 'chest', ahead(3)),
      equipped: () => Object.keys(BOOK.equip || {}).length > 0,
    });
  }
  if (G.roomCode) UI.log(`部屋コード: ${G.roomCode} — 仲間に伝えればネット越しに参加できる`, '#ffe08a');
  UI.banner(`第${floor}層`, G.mode === 'coop' ? '仲間と共に最奥の転移陣を目指せ' : '魔導師たちの詠唱に耳を澄ませ — 狩るか、狩られるか', 4);
  setTimeout(() => UI.log('V を押しながら「紅蓮の業火よ、燃え盛れ 一条の穿槍となりて貫け 今こそ解き放て」と唱え切れ。手元の魔導書の頁に詠唱文が書いてある(右クリックで掲げて読む・ホイールで頁をめくる)', '#ffe08a'), 1500);
  setTimeout(() => UI.log('Tab で魔導書を開く(呪文の書き記し・言霊辞典・心得)。古文書(金色の光)から新しい言霊を得る', '#ffe08a'), 4500);
  last = performance.now(); requestAnimationFrame(loop);
}

// ---------- 階層 ----------
function clearFloor() {
  if (dungeonGroup) scene.remove(dungeonGroup);
  for (const e of G.enemies) e.dispose();
  for (const k of G.pickups) if (k.mesh) scene.remove(k.mesh);
  for (const arr of [G.projectiles, G.effects, G.obstacles, G.runes]) { for (const o of arr) if (o.mesh) scene.remove(o.mesh); arr.length = 0; }
  clearLumens();
  if (portal) scene.remove(portal);
  G.enemies = []; G.pickups = [];
}

function setupFloor(seed, floor, reset = false) {
  clearFloor();
  G.floor = floor;
  const d = G.dungeon = generate(seed, floor);
  dungeonGroup = buildMeshes(d); scene.add(dungeonGroup);
  G.explored = new Uint8Array(W * H);
  G.enemies = d.spawns.map((s, i) => new Enemy(`e${floor}_${i}`, s.type, s.pos, floor, s.boss));
  let kid = 0;
  for (const p of d.scrolls) addPickup(`k${kid++}`, 'scroll', p);
  for (const p of d.herbs) addPickup(`k${kid++}`, 'herb', p);
  for (const c of d.crystals) addPickup(`k${kid++}`, 'crystal', c.pos, { dir: c.dir });
  for (const p of d.chests) addPickup(`k${kid++}`, 'chest', p);
  makePortal(d.portal);
  // 配置
  const roomPos = (rm, k = 0) => new THREE.Vector3((rm.cx + 0.5) * CELL + (k % 2) * 1.6 - 0.8, 0, (rm.cy + 0.5) * CELL + Math.floor(k / 2) * 1.6 - 0.8);
  const p = G.player;
  let spawnRoom = d.start;
  if (G.mode === 'pvp' && G.net) spawnRoom = d.rooms[(G.netId * 3) % d.rooms.length];
  G.spawnPoint = roomPos(spawnRoom, G.net ? G.netId % 4 : 0);
  p.pos.copy(G.spawnPoint);
  G.bots.forEach((b, i) => {
    const rm = G.mode === 'coop' ? d.start : d.rooms[(d.rooms.length - 2 - i * 2 + d.rooms.length) % d.rooms.length];
    b.mage.pos.copy(roomPos(rm, i + 1)); b.mage.spawn = b.mage.pos.clone();
  });
  for (const m of G.mages) {
    if (m.kind === 'remote') continue;
    if (reset) { m.hp = m.maxHp; m.mp = m.maxMp; }
    else { m.hp = Math.min(m.maxHp, Math.max(m.hp, 0) + 30); m.mp = m.maxMp; }
    if (m.downed || !m.alive) { m.downed = false; m.alive = true; m.hp = Math.max(m.hp, 50); }
    m.status = {}; m.shield = 0; m.setChant('');
  }
  if (reset) G.inv = { herb: 1, crystal: 1, bone: 0, iron: 0, potion: 1, ether: 1, amulet: 0, flash: 0, lantern: 0 };
  G.gameOverT = null;
  p.yaw = 0; p.pitch = 0;
  // 最初に開けた方向を向く
  for (const [yaw, dx, dz] of [[0, 0, -1], [Math.PI / 2, -1, 0], [Math.PI, 0, 1], [-Math.PI / 2, 1, 0]]) {
    if (!isWall(p.pos.x + dx * 6, p.pos.z + dz * 6)) { p.yaw = yaw; break; }
  }
  UI.renderHotbar();
}
const isWall = (x, z) => { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); return cx < 0 || cz < 0 || cx >= W || cz >= H || !G.dungeon.grid[cz * W + cx]; };

function nextFloor(reset = false) {
  const seed = (Math.random() * 1e9) | 0;
  const floor = reset ? 1 : G.floor + 1;
  if (G.net) G.net.send({ t: 'floor', seed, floor, reset });
  sfx.portal();
  setupFloor(seed, floor, reset);
  UI.banner(reset ? '迷宮は再び形を変えた' : `第${floor}層`, reset ? '全滅 — 第1層からやり直し' : (floor % 3 === 0 ? '強大な気配がする…この層には主がいる' : '迷宮は形を変えた'), 4);
}

function makePortal(pos) {
  const g = new THREE.Group();
  const ringM = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.09, 12, 48), new THREE.MeshStandardMaterial({ color: 0x8a6bff, emissive: 0x6a40ff, emissiveIntensity: 3 }));
  ringM.position.y = 1.6;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.25, 48), new THREE.MeshBasicMaterial({ map: runeCircleTex(), color: 0xa080ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  disc.position.y = 1.6;
  const floorRune = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: runeCircleTex(), color: 0x7050ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  floorRune.rotation.x = -Math.PI / 2; floorRune.position.y = 0.03;
  g.add(ringM, disc, floorRune); g.position.copy(pos);
  g.userData = { disc, floorRune };
  scene.add(g); portal = g; G.portalObj = g;
}

// ---------- 拾える物 ----------
const MAT_COLORS = { herb: 0x6aff7a, crystal: 0x6ab0ff, bone: 0xe8dcc0, iron: 0xa0a0b0, scroll: 0xffe08a, potion: 0xff6a6a };
function addPickup(id, kind, pos, data = {}) {
  const g = new THREE.Group();
  if (kind === 'scroll') {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x5a5248, roughness: 0.9 }));
    ped.position.y = 0.45; ped.castShadow = true;
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0xe8d6a8, roughness: 0.8, emissive: 0x3a2a10 }));
    roll.rotation.z = Math.PI / 2; roll.position.y = 1.2;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0xffd070, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7 }));
    glow.position.y = 1.2; glow.scale.setScalar(1.4);
    g.add(ped, roll, glow); g.userData.spin = roll; g.userData.glow = glow;
  } else if (kind === 'herb') {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a6a2a, emissive: 0x1a6a2a, emissiveIntensity: 0.6, roughness: 0.6, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5, 4), mat); l.position.y = 0.22; l.rotation.set(rand(-0.6, 0.6), 0, rand(-0.6, 0.6)); g.add(l); }
    const bud = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xaaffaa })); bud.position.y = 0.5; g.add(bud);
  } else if (kind === 'crystal') {
    const mat = new THREE.MeshStandardMaterial({ color: 0x6ab0ff, emissive: 0x2a70ff, emissiveIntensity: 1.6, roughness: 0.05, metalness: 0.1 });
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(rand(0.1, 0.2), 0), mat); c.scale.y = 2.2; c.position.set(rand(-0.15, 0.15), rand(-0.1, 0.2), rand(-0.15, 0.15)); c.rotation.set(rand(-0.5, 0.5), rand(0, 3), rand(-0.5, 0.5)); g.add(c); }
  } else if (kind === 'chest') {
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a2c14, roughness: 0.8 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x8a7040, metalness: 0.9, roughness: 0.35 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 0.55, 0.65), wood); box.position.y = 0.28; box.castShadow = true;
    const lid = new THREE.Group(); const lm = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 1, 12, 1, false, 0, Math.PI), wood); lm.rotation.z = Math.PI / 2; lm.rotation.y = Math.PI / 2;
    lm.position.z = 0.0; lid.add(lm); lid.position.set(0, 0.55, 0);
    for (const x of [-0.35, 0.35]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.58, 0.67), metal); b.position.set(x, 0.28, 0); g.add(b); }
    // 錠前と、隙間から漏れる光 (開けるまで光る)
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.04), metal); lock.position.set(0, 0.5, 0.34);
    const seep = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0xffc860, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
    seep.position.set(0, 0.62, 0); seep.scale.set(1.3, 0.5, 1);
    g.add(box, lid, lock, seep); g.userData.lid = lid; g.userData.seep = seep; g.rotation.y = rand(0, Math.PI * 2);
  } else { // 戦利品
    const c = MAT_COLORS[data.mat] || 0xffffff;
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6 }));
    orb.position.y = 0.5;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: c, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35 })); glow.position.y = 0.5; glow.scale.setScalar(0.6);
    g.add(orb, glow); g.userData.spin = orb;
  }
  g.position.copy(pos);
  if (kind === 'crystal' && data.dir) g.position.add(new THREE.Vector3(-data.dir[0] * 0.25, 0, -data.dir[1] * 0.25));
  scene.add(g);
  G.pickups.push({ id, kind, pos: g.position, mesh: g, data });
}

function pickUp(k, fromNet = false) {
  const i = G.pickups.indexOf(k); if (i < 0) return;
  if (k.kind === 'chest') {
    if (k.opened) return;
    k.opened = true; k.mesh.userData.lid.rotation.x = -1.6; // 開いた箱は残す
    if (k.mesh.userData.seep) k.mesh.userData.seep.visible = false;
    G.pickups.splice(i, 1);
  } else { scene.remove(k.mesh); G.pickups.splice(i, 1); }
  if (fromNet) return;
  if (k.kind !== 'scroll') G.net?.send({ t: 'pick', id: k.id });
  sfx.pickup();
  const add = (m, n) => { G.inv[m] = (G.inv[m] || 0) + n; UI.log(`${({ herb: '霊草', crystal: '魔晶', bone: '骨片', iron: '鉄屑', potion: '回復薬', ether: '魔力薬' })[m]} ×${n}`, '#cfe8ff'); };
  if (k.kind === 'scroll') learnRandomWord();
  else if (k.kind === 'herb') add('herb', 1 + (Math.random() < 0.4));
  else if (k.kind === 'crystal') add('crystal', 1 + (Math.random() < 0.4));
  else if (k.kind === 'chest') {
    G.stats.chests++;
    if (Math.random() < 0.75 || G.tutorial) {
      const it = rollItem(G.floor);
      BOOK.bag.push(it); saveBook();
      const rr = RARITY[it.rarity];
      UI.banner(`宝箱 — ${it.name}`, `〔${rr.name}〕${SLOTS.find(s => s.id === it.slot).name} ・ ${statLines(it).join(' / ')}  (I で装備)`, 5);
      UI.log(`装備を得た: ${it.name}〔${rr.name}〕`, rr.color);
      G.fx.burst(k.pos.clone().setY(1), parseInt(rr.color.slice(1), 16), 40 + it.rarity * 30, { speed: 4, up: 2 });
      if (it.rarity >= 2) sfx.learn();
    }
    const mats = ['herb', 'crystal', 'bone', 'iron'];
    for (let j = 0; j < 3; j++) add(mats[Math.floor(Math.random() * 4)], 1);
    if (Math.random() < 0.35) add('potion', 1);
    if (Math.random() < 0.25) learnRandomWord();
  } else if (k.kind === 'loot') { if (k.data.mat === 'scroll') learnRandomWord(); else add(k.data.mat, 1); }
  UI.renderHotbar();
}

function learnRandomWord() {
  const unknown = WORDS.filter(w => !G.known.has(w.id));
  if (!unknown.length) { G.inv.crystal = (G.inv.crystal || 0) + 2; UI.log('古文書は既知の言霊ばかりだった(魔晶×2を得た)', '#ffe08a'); return; }
  // 属性と形を優先して見つけやすくする
  const weight = w => ({ element: 3, form: 3, effect: 2, mod: 1.5, target: 1, trigger: 1 })[w.cat];
  let r = Math.random() * unknown.reduce((s, w) => s + weight(w), 0), pick = unknown[0];
  for (const w of unknown) { r -= weight(w); if (r <= 0) { pick = w; break; } }
  G.known.add(pick.id); saveBook();
  sfx.learn();
  UI.banner(`新たな言霊『${pick.core}』`, `「${pick.text}」 ${pick.ruby} ・ ${CAT[pick.cat]} — ${pick.hint}`, 6);
  UI.log(`言霊『${pick.text}』を魔導書に記した。真意は唱えて確かめよ (Tab)`, '#ffe08a');
  UI.renderHotbar();
}

G.onEnemyKilled = e => {
  if (G.stats) G.stats.kills++;
  const drops = e.T.drops;
  const items = [];
  const n = 1 + (Math.random() < 0.5) + (e.boss ? 3 : 0);
  for (let i = 0; i < n; i++) items.push(drops[Math.floor(Math.random() * drops.length)]);
  if (Math.random() < (e.boss ? 1 : 0.08)) items.push('scroll');
  const list = items.map(mat => ({ id: `L${G.netId || 0}_${lootCounter++}`, mat, x: e.pos.x + rand(-0.8, 0.8), z: e.pos.z + rand(-0.8, 0.8) }));
  for (const l of list) addPickup(l.id, 'loot', new THREE.Vector3(l.x, 0, l.z), { mat: l.mat });
  G.net?.send({ t: 'loot', items: list });
};

// ---------- 詠唱 ----------
let typed = null;          // 文字詠唱/スロット詠唱の進行
let voiceText = '';        // 音声詠唱の途中経過
let voiceDeadline = 0;
let netChantT = 0;

function setupVoice() {
  if (!voiceSupported) { UI.micState('🎙 音声認識非対応 — Enter で文字詠唱'); return; }
  initVoice({
    interim: text => { if (!G.player.alive || G.player.downed) return; beginOrUpdateChant(text); },
    final: raw => {
      const alts = raw.map(heard);
      // 言霊を最も多く含む候補を採用
      let bi = 0, bc = -1;
      alts.forEach((a, i) => { const c = tokenize(a, G.known).filter(t => t.known).length * 10 - chantGaps(raw[i], tokenize(a).map(t => t.id)).length; if (c > bc) { bc = c; bi = i; } });
      if (bc <= 0) { if (isContinuous()) { clearChant(); return; } }
      voiceText = raw[bi];
      finishChant(alts[bi], raw[bi]);
    },
    state: s => {
      if (s === 'listening') UI.micState(isContinuous() ? '🔴 常時詠唱中 (C で解除)' : '🔴 聴取中… 唱えよ');
      else if (s === 'loading') UI.micState('🎙 音声認識を準備中…')
      else if (s.startsWith('error')) UI.micState('🎙 マイクエラー: ' + s.slice(6) + ' — Enter で文字詠唱');
      else UI.micState('🎙 V 長押しで詠唱 / C で常時詠唱');
    },
  });
  UI.micState('🎙 V 長押しで詠唱 / C で常時詠唱');
}

function beginOrUpdateChant(text) {
  if (!canCast()) return;
  const p = G.player;
  if (!p.chanting) { p.chantInterrupted = false; sfx.chantStart(); }
  const n = tokenize(heard(text), G.known).filter(t => t.known).length;
  p.setChant(text, Math.max(1, n));
  UI.setChantDisplay(text);
  G.hearChant(p, heard(text));
  if (G.net && G.time - netChantT > 0.15) { netChantT = G.time; G.net.send({ t: 'chant', id: p.id, text, n }); }
}

function clearChant() {
  G.player.setChant(''); UI.setChantDisplay('');
  G.net?.send({ t: 'chant', id: G.player.id, text: '', n: 0 });
}

function fizzle(msg) {
  sfx.fizzle(G.player.pos);
  UI.floatText(G.player.pos.clone().add(new THREE.Vector3(-Math.sin(G.player.yaw) * 2, -0.5, -Math.cos(G.player.yaw) * 2)), msg, '#ff9a8a');
  UI.log('✖ ' + msg, '#ff9a8a');
}

function finishChant(text, raw = text) {
  if (!canCast()) { clearChant(); return; }
  const p = G.player;
  const spell = compile(text, G.known);
  const interrupted = p.chantInterrupted;
  p.chantInterrupted = false;
  UI.setChantDisplay(text);
  setTimeout(() => { if (!p.chanting) UI.setChantDisplay(''); }, 1600);
  clearChantSoft();
  if (!p.alive || p.downed) return;
  if (interrupted) { p.mp = Math.max(0, p.mp - spell.cost * 0.3); fizzle('詠唱が乱され、術が霧散した'); return; }
  if (!spell.valid) { fizzle(spell.error || '術にならなかった'); return; }
  equipSpell(spell);
  // 名詠: 文章として成立していれば威力が上がる
  const el = eloquence(raw, G.known);
  if (el.bonus) {
    spell.power *= 1 + el.bonus;
    UI.floatText(p.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), `${el.tier}! 威力+${Math.round(el.bonus * 100)}%`, el.tier === '名詠' ? '#ffd76a' : '#cfe0ff');
    UI.log(`${el.tier} — ${el.marks.join('・')} が揃った(威力+${Math.round(el.bonus * 100)}%)`, el.tier === '名詠' ? '#ffd76a' : '#cfe0ff');
    G.stats.eloquent = (G.stats.eloquent || 0) + (el.tier === '名詠' ? 1 : 0);
  }
  // 核の語だけでは発動しない。詠唱文を唱え切ること
  const gaps = chantGaps(raw, spell.words, G.eqT?.grace || 0);
  if (gaps.length) { p.mp = Math.max(0, p.mp - spell.cost * 0.2); fizzle(`詠唱が足りない —「${WORD_BY_ID[gaps[0]].text}」と唱え切れ`); return; }
  if (p.mp < spell.cost) { fizzle(`魔力が足りない (必要${spell.cost})`); return; }
  castSpell(p, spell, playerAim(spell));
}
function clearChantSoft() { G.player.setChant(''); G.net?.send({ t: 'chant', id: G.player.id, text: '', n: 0 }); }

function playerAim(spell) {
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  const origin = camera.position.clone().add(fwd.clone().multiplyScalar(0.6)).add(new THREE.Vector3(0, -0.15, 0));
  const point = raycastGrid(camera.position.clone(), fwd, 32);
  const targetId = spell.form ? null : G.fx.pickDirectTarget(G.player, spell, fwd);
  return { origin: origin.toArray(), dir: fwd.toArray(), point: point.toArray(), targetId };
}

G.castSpell = function castSpell(m, spell, aim) {
  if (m.mp < spell.cost) return false;
  m.mp -= spell.cost;
  G.fx.cast(m, spell, aim);
  G.net?.send({ t: 'cast', id: m.id, words: spell.words, aim });
  if (m === G.player) {
    VM.kick();
    for (const id of spell.words) if (!BOOK.understood.includes(id)) {
      BOOK.understood.push(id); const w = WORD_BY_ID[id];
      UI.log(`言霊『${w.text}』の真意を悟った — ${w.meaning}`, '#b8f0c0');
    }
    saveBook();
  }
  return true;
};
const castSpell = G.castSpell;

G.hearChant = (speaker, text) => { for (const b of G.bots) b.brain.onHear(speaker, text); };

function startTypedChant(text) {
  if (!canCast()) return;
  const toks = tokenize(text, G.known);
  if (!toks.length) { fizzle('言霊が一つも含まれていない'); return; }
  const words = toks.map(t => WORD_BY_ID[t.id].text);
  typed = { text, words, t: 0, dur: 0.4 + words.length * 0.6 };
  G.player.chantInterrupted = false;
  sfx.chantStart();
}

// ---------- 手元の魔導書: 頁をめくり、掲げて読む ----------
G.page = 0; G.reading = false;
function flipPage(d) {
  const n = BOOK.spells.length;
  if (!n) return;
  if (G.held !== 'grimoire') { setHeld('grimoire'); }
  G.page = (G.page + d + n) % n;
  G.stats.flips++;
  VM.flip(d);
  sfx.page?.();
  renderBookPages();
}
G.onPageChange = () => { G.page = clamp(G.page, 0, Math.max(0, BOOK.spells.length - 1)); renderBookPages(); };

// ---------- 道具 ----------
const ITEM_KEYS = ['potion', 'ether', 'amulet', 'flash', 'lantern'];
function useItem(k) {
  const p = G.player;
  if (!G.inv[k] || !p.alive || p.downed) return;
  G.inv[k]--;
  if (k === 'potion') G.fx.heal(p, 45, p);
  if (k === 'ether') { p.mp = Math.min(p.maxMp, p.mp + 50); UI.floatText(p.pos, '+50 魔力', '#8ab0ff'); }
  if (k === 'amulet') { G.fx.shield(p, 50, 15, null); sfx.ward(p.pos); }
  if (k === 'flash') {
    G.fx.flash(p.pos.clone().setY(1.5), 0xffffff, 80, 0.5, 25); G.fx.burst(p.pos.clone().setY(1.5), 0xffffff, 80, { speed: 10 });
    if (G.isHost) for (const e of G.enemies) { if (e.alive && e.pos.distanceTo(p.pos) < 10) { e.stun = 2.5; UI.floatText(e.pos, '怯み', '#ffffaa'); } }
    else G.net?.send({ t: 'flash', to: G.hostId, x: p.pos.x, z: p.pos.z });
  }
  if (k === 'lantern') { G.explored.fill(1); UI.log('導灯がこの層の全貌を照らし出した', '#ffe08a'); }
  UI.renderHotbar();
}

// ---------- 入力 ----------
// ポインタロックが使えない環境(アプリ内ブラウザ等)では「フリールック」:
// ボタンを押さずにマウスを動かすだけで視点が回る
let freeLook = false, mouseX = 0.5, mouseIn = false, dragging = false;
function enableFreeLook() {
  // デスクトップ版はポインタロックが必ず使える。失敗は「ジェスチャー無しの再ロック」等の一時的なものなので、
  // フリールック(画面端で回転が止まる)には切り替えず、クリックで再ロックしてもらう
  if (window.desktop) { if (G.player && !G.uiOpen) { $('clickToPlay').textContent = 'クリックで操作開始'; $('clickToPlay').classList.remove('hidden'); } return; }
  if (freeLook) return;
  freeLook = true; canvas.style.cursor = 'none';
  $('clickToPlay').textContent = 'マウスで視点操作中(カーソルを固定できない環境です。デスクトップ版推奨)';
  setTimeout(() => $('clickToPlay').classList.add('hidden'), 2500);
}
function requestLock() {
  if (G.uiOpen || !G.player || freeLook) return;
  try {
    const r = canvas.requestPointerLock();
    if (r?.catch) r.catch(enableFreeLook);
  } catch { enableFreeLook(); }
  // ロックが黙って失敗する環境もあるので少し待って確認
  setTimeout(() => { if (document.pointerLockElement !== canvas) enableFreeLook(); }, 400);
}
canvas.addEventListener('click', requestLock);
document.addEventListener('pointerlockerror', enableFreeLook);
document.addEventListener('pointerlockchange', () => { if (!freeLook) $('clickToPlay').classList.toggle('hidden', document.pointerLockElement === canvas); });
canvas.addEventListener('mousedown', () => { dragging = true; });
addEventListener('mouseup', () => { dragging = false; });
canvas.addEventListener('mouseenter', () => { mouseIn = true; });
canvas.addEventListener('mouseleave', () => { mouseIn = false; });
document.addEventListener('mousemove', e => {
  mouseX = e.clientX / innerWidth;
  if (!G.player || G.uiOpen || G.typing) return;
  if (document.pointerLockElement !== canvas && !freeLook && !dragging) return;
  const s = 0.0022 * (opts.sens || 1);
  if (G.stats) G.stats.looked += Math.abs(e.movementX * s) + Math.abs(e.movementY * s);
  G.player.yaw -= e.movementX * s;
  G.player.pitch = clamp(G.player.pitch - e.movementY * s * (opts.invertY ? -1 : 1), -1.45, 1.45);
});

const typeBox = $('typeBox'), typeIn = $('typeIn');
function openTypeBox() {
  if (!canCast()) return; releaseKeys(); G.typing = true; typeBox.classList.remove('hidden'); typeIn.value = ''; typeIn.focus(); document.exitPointerLock?.(); }
function closeTypeBox() { typeBox.classList.add('hidden'); typeIn.blur(); G.typing = false; if (!freeLook) requestLock(); }
typeIn.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') { const t = typeIn.value; closeTypeBox(); if (t.trim()) startTypedChant(t); }
  if (e.key === 'Escape') closeTypeBox();
});
typeIn.addEventListener('input', () => UI.setChantDisplay(typeIn.value));

// ---- 入力 (キー割り当ては操作設定で変更できる: controls.js) ----
const isDown = id => !!keys[binds[id]];
function pressAction(act, e) {
  switch (act) {
    case 'grimoire': e?.preventDefault(); openBook('grimoire'); return;
    case 'textbook': e?.preventDefault(); openBook('words'); return; // 教本の章(言霊辞典・心得・調合書)を開く
    case 'inventory': e?.preventDefault(); openInventory(); return;
    case 'voice': if (voiceSupported && !isContinuous()) { if (!canCast()) return; startListening(); voiceDeadline = 0; } return;
    case 'continuous': if (voiceSupported) { setContinuous(!isContinuous()); UI.log(isContinuous() ? '常時詠唱: ON — 言霊を含む発話を詠唱とみなす' : '常時詠唱: OFF'); } return;
    case 'typed':
      if (voiceSupported && !opts.typedChant) { UI.log(`声に出して唱えよ — ${keyOf('voice')} を押しながら頁の文を読み上げる`); return; }
      e?.preventDefault(); openTypeBox(); return;
    case 'read': G.reading = true; if (G.held !== 'grimoire') setHeld('grimoire'); return;
    case 'pageNext': flipPage(1); return;
    case 'pagePrev': flipPage(-1); return;
    case 'interact': interact(); return;
    case 'ambience': settings.ambience = cycleAmbience(); saveSettings(); UI.log('環境音: ' + ['OFF', '小', '中'][settings.ambience]); return;
    case 'tts': settings.npcVoice = !ttsOn(); setTTS(settings.npcVoice); saveSettings(); UI.log('NPC詠唱の読み上げ: ' + (ttsOn() ? 'ON' : 'OFF')); return;
  }
  if (act?.startsWith('item')) useItem(ITEM_KEYS[+act.slice(4) - 1]);
}
function releaseAction(act) {
  if (act === 'voice' && voiceSupported && !isContinuous()) { stopListening(); voiceDeadline = G.time + 2.5; }
  if (act === 'read') G.reading = false;
}
addEventListener('keydown', e => {
  if (!G.player || capturing) return;
  if (menuOpen()) {
    if (e.code === 'Escape') { e.preventDefault(); if (!$('keysPanel').classList.contains('hidden')) showKeysPanel(false); else closeMenu(); }
    return;
  }
  if (invOpen()) {
    if (e.code === 'Escape' || e.code === binds.inventory) { e.preventDefault(); closeInventory(); }
    else if (e.code === binds.grimoire) { e.preventDefault(); closeInventory(false); openBook('grimoire'); }
    return;
  }
  if (bookOpen()) {
    // 開いている書物のキーで閉じる。もう一方のキーなら持ち替える
    if (e.code === 'Escape' || e.code === binds.grimoire || e.code === binds.textbook) { e.preventDefault(); closeBook(); resumeLock(); }
    return;
  }
  if (G.typing) return;
  if (e.code === 'Escape') { e.preventDefault(); openMenu(); return; }
  if (e.code === 'Tab') e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  pressAction(actionOf(e.code), e);
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  releaseAction(actionOf(e.code));
});
// マウスボタンも割り当てられる (右クリック=掲げて読む など)
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (!G.player || G.uiOpen || G.typing || capturing) return;
  if (document.pointerLockElement !== canvas && !freeLook) return;
  const code = 'Mouse' + e.button; keys[code] = true; pressAction(actionOf(code), e);
});
addEventListener('mouseup', e => { const code = 'Mouse' + e.button; if (keys[code]) { keys[code] = false; releaseAction(actionOf(code)); } });
addEventListener('wheel', e => {
  if (!G.player || G.uiOpen || G.typing || !opts.wheelPages) return;
  if (document.pointerLockElement !== canvas && !freeLook) return;
  flipPage(e.deltaY > 0 ? 1 : -1);
}, { passive: true });
function releaseKeys() { for (const k in keys) keys[k] = false; G.reading = false; }
addEventListener('blur', releaseKeys);
document.addEventListener('visibilitychange', releaseKeys);
G.onUiOpen = releaseKeys;

// ---------- 照準した敵の情報 ----------
const ELEM_WORD = Object.fromEntries(WORDS.filter(w => w.cat === 'element').map(w => [w.val, w.core]));
let targetShown = null;
function updateTargetInfo() {
  const el = $('target'); if (!el) return;
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  let best = null, bs = 0;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const to = e.pos.clone().setY(1.2).sub(camera.position); const d = to.length();
    if (d > 26) continue;
    const dot = to.normalize().dot(fwd), need = 1 - Math.min(0.05, 0.6 / (d * d + 1)) - 0.012;
    if (dot > need && dot > bs && lineOfSight(G.player.pos, e.pos)) { bs = dot; best = e; }
  }
  if (!best) { if (targetShown) { el.classList.add('hidden'); targetShown = null; } return; }
  const T = ENEMY_TYPES[best.type], pct = Math.max(0, best.hp / best.maxHp * 100);
  const key = best.id + '|' + Math.round(pct);
  if (targetShown === key) return;
  targetShown = key;
  const weak = (T.weak || []).map(x => ELEM_WORD[x]).join('・'), res = (T.resist || []).map(x => ELEM_WORD[x]).join('・');
  el.innerHTML = `<b class="${best.boss ? 'boss' : ''}">${best.name}</b><div class="hp"><i style="width:${pct}%"></i></div><div class="wk">${weak ? '弱点 <em>' + weak + '</em>' : ''}${res ? '　耐性 <s>' + res + '</s>' : ''}</div>`;
  el.style.setProperty('--rim', '#' + (({ skeleton: 0xff5a3a, slime: 0x7dff4a, wraith: 0xb565ff, golem: 0xff9a2a })[best.type]).toString(16).padStart(6, '0'));
  el.classList.remove('hidden');
}

// ---------- 装備 ----------
function applyEquip() {
  const t = G.eqT = totals(BOOK.equip);
  const p = G.player; if (!p) return;
  p.maxMp = 100 + t.maxMp; p.maxHp = 100 + t.maxHp;
  p.mp = Math.min(p.mp, p.maxMp); p.hp = Math.min(p.hp, p.maxHp);
  p.regenMul = 1 + t.regen;
}
// 自分の術に装備の効果を乗せる
function equipSpell(spell) {
  const t = G.eqT; if (!t) return spell;
  spell.cost = Math.max(1, Math.round(spell.cost * (1 + t.costMul)));
  let pw = 1 + t.power;
  if (spell.elements.length) pw += spell.elements.reduce((s, e) => s + (t.elem[e] || 0), 0) / spell.elements.length;
  if (spell.effects.includes('ward')) pw += t.ward;
  spell.power *= pw;
  return spell;
}
function equipItem(uid) {
  const i = BOOK.bag.findIndex(x => x.uid === uid); if (i < 0) return;
  const it = BOOK.bag.splice(i, 1)[0];
  if (BOOK.equip[it.slot]) BOOK.bag.push(BOOK.equip[it.slot]);
  BOOK.equip[it.slot] = it; saveBook(); applyEquip(); sfx.pickup();
}
function unequip(slot) { const it = BOOK.equip[slot]; if (!it) return; BOOK.bag.push(it); delete BOOK.equip[slot]; saveBook(); applyEquip(); }
function discard(uid) { const i = BOOK.bag.findIndex(x => x.uid === uid); if (i >= 0) { BOOK.bag.splice(i, 1); saveBook(); } }
const itemCard = (it, btns) => `<div class="eitem r${it.rarity}"><b style="color:${RARITY[it.rarity].color}">${it.name}</b><span class="rar">〔${RARITY[it.rarity].name}〕${SLOTS.find(s => s.id === it.slot).name}</span><small>${statLines(it).join('<br>')}</small><span class="ebtns">${btns}</span></div>`;

// ---------- 所持品 ----------
const invEl = $('inv');
const invOpen = () => !invEl.classList.contains('hidden');
const ITEM_INFO = {
  potion: ['回復薬', '生命を45回復'], ether: ['魔力薬', '魔力を50回復'], amulet: ['護符', '守護50を15秒'],
  flash: ['閃光玉', '周囲の魔物を怯ませる'], lantern: ['導灯', 'この層の地図を照らす'],
};
const MAT_INFO = { herb: ['霊草', '回復薬・導灯の素材'], crystal: ['魔晶', '魔力薬・護符・閃光玉の素材'], bone: ['骨片', '護符の素材'], iron: ['鉄屑', '閃光玉・導灯の素材'] };
function renderInventory() {
  BOOK.equip ||= {}; BOOK.bag ||= [];
  $('invEquip').innerHTML = SLOTS.map(s => {
    const it = BOOK.equip[s.id];
    return `<div class="eslot"><span class="sl"><ruby>${s.name}<rt>${s.ruby}</rt></ruby></span>${it ? itemCard(it, `<button data-unequip="${s.id}">外す</button>`) : `<div class="eitem empty"><small>${s.desc}</small></div>`}</div>`;
  }).join('');
  const bag = [...BOOK.bag].sort((a, b) => b.rarity - a.rarity);
  $('invBag').innerHTML = bag.length ? bag.map(it => {
    const cur = BOOK.equip[it.slot];
    return itemCard(it, `<button data-equip="${it.uid}">装備${cur ? '(入れ替え)' : ''}</button><button data-discard="${it.uid}">捨てる</button>`);
  }).join('') : '<p class="muted">宝箱を開けると装備が手に入る。</p>';
  invEl.querySelectorAll('[data-equip]').forEach(b => b.onclick = () => { equipItem(b.dataset.equip); renderInventory(); });
  invEl.querySelectorAll('[data-unequip]').forEach(b => b.onclick = () => { unequip(b.dataset.unequip); renderInventory(); });
  invEl.querySelectorAll('[data-discard]').forEach(b => b.onclick = () => { discard(b.dataset.discard); renderInventory(); });
  const t = G.eqT || totals(BOOK.equip);
  $('invTotals').textContent = [`生命 ${100 + t.maxHp}`, `魔力 ${100 + t.maxMp}`, t.power ? `威力 +${Math.round(t.power * 100)}%` : '', t.costMul ? `消費 ${Math.round(t.costMul * 100)}%` : '', t.regen ? `回復 +${Math.round(t.regen * 100)}%` : '', t.grace ? `詠唱補助 +${Math.round(t.grace * 100)}%` : ''].filter(Boolean).join(' ・ ');
  invEl.querySelectorAll('.bookitem').forEach(el => {
    const which = el.dataset.book;
    el.classList.toggle('held', G.held === which);
    const hb = el.querySelector('.hold'); if (hb) { hb.textContent = G.held === which ? '手に持っている' : '手に持つ'; hb.disabled = G.held === which; }
  });
}
function renderHeldHud() {
  const el = $('heldInd'); if (!el) return;
  el.className = G.held;
  el.innerHTML = G.held === 'grimoire' ? '<b>魔導書</b> 詠唱可' : '<b>教本</b> 詠唱不可';
}
function openInventory() {
  if (!G.player) return;
  releaseKeys(); invEl.classList.remove('hidden'); G.uiOpen = true;
  document.exitPointerLock?.();
  renderInventory();
}
function closeInventory(resume = true) { invEl.classList.add('hidden'); G.uiOpen = false; if (resume) resumeLock(); }
invEl.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { closeInventory(false); openBook(b.dataset.open); });

invEl.addEventListener('click', e => { if (e.target === invEl) closeInventory(); });

// ---------- Esc メニューと設定 ----------
const SETTINGS_KEY = 'arcana_vox_settings_v1';
const settings = { volume: 0.8, ambience: 1, npcVoice: true, sens: 1 };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch {}
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} }
function applySettings() {
  setMasterVolume(settings.volume);
  setAmbience(settings.ambience);
  setTTS(settings.npcVoice);
  applyControls();
}
// 旧設定のマウス感度を引き継ぐ
if (settings.sens && settings.sens !== 1 && opts.sens === 1) { opts.sens = settings.sens; saveControls(); }
function applyControls() {
  camera.fov = opts.fov; camera.updateProjectionMatrix();
}
applyControls();

const menu = $('menu');
const menuOpen = () => !menu.classList.contains('hidden');
function openMenu() {
  if (!G.player || menuOpen()) return;
  releaseKeys();
  menu.classList.remove('hidden'); G.uiOpen = true;
  document.exitPointerLock?.();
  $('mVol').value = settings.volume * 100; $('mAmb').value = settings.ambience; $('mNpc').checked = settings.npcVoice; $('mSens').value = opts.sens * 100; showKeysPanel(false);
  $('mQuit').classList.toggle('hidden', !window.desktop);
  $('mRoom').classList.toggle('hidden', !G.roomCode);
  if (G.roomCode) $('mRoom').innerHTML = `部屋コード <b>${G.roomCode}</b> ・ ${G.net.players?.size || 1}人`;
  $('mFull').classList.toggle('hidden', !window.desktop);
}
function closeMenu() { menu.classList.add('hidden'); G.uiOpen = false; resumeLock(); }
function resumeLock() { if (!freeLook) requestLock(); }
$('mResume').onclick = closeMenu;
$('mGrimoire').onclick = () => { menu.classList.add('hidden'); openBook('grimoire'); };
$('mInv').onclick = () => { menu.classList.add('hidden'); openInventory(); };
$('mVol').oninput = e => { settings.volume = e.target.value / 100; applySettings(); saveSettings(); };
$('mAmb').onchange = e => { settings.ambience = +e.target.value; applySettings(); saveSettings(); };
$('mNpc').onchange = e => { settings.npcVoice = e.target.checked; applySettings(); saveSettings(); };
$('mSens').oninput = e => { opts.sens = e.target.value / 100; saveControls(); };

// ---- 操作設定 ----
let capturing = null; // 割り当て待ちの操作 id
function showKeysPanel(on) {
  $('keysPanel').classList.toggle('hidden', !on);
  $('menuMain').classList.toggle('hidden', on);
  if (on) renderKeysPanel();
}
function renderKeysPanel() {
  const groups = {};
  for (const a of ACTIONS) (groups[a.group] ||= []).push(a);
  const opt = (id, label, html) => `<label class="mset"><span>${label}</span>${html}</label>`;
  $('keysBody').innerHTML = `${opt('kSens', '感度', `<input type="range" id="kSens" min="30" max="300" value="${opts.sens * 100}">`)}
    ${Object.entries(groups).map(([g, list]) => `<h3>${g}</h3>` + list.map(a => `<div class="krow"><span>${a.label}</span><button class="kbtn ${capturing === a.id ? 'wait' : ''}" data-act="${a.id}">${capturing === a.id ? 'キーを押す…' : keyName(binds[a.id])}</button></div>`).join('')).join('')}`;
  $('kSens').oninput = e => { opts.sens = e.target.value / 100; saveControls(); };
  $('keysBody').querySelectorAll('.kbtn').forEach(b => b.onclick = ev => { ev.stopPropagation(); capturing = b.dataset.act; renderKeysPanel(); });
}
// 割り当て待ちの間は、次に押したキー/マウスボタンをその操作に割り当てる
function finishCapture(code) {
  if (!capturing) return;
  if (code !== 'Escape') { rebind(capturing, code); UI.renderHotbar(); }
  capturing = null; renderKeysPanel();
}
addEventListener('keydown', e => { if (!capturing) return; e.preventDefault(); e.stopImmediatePropagation(); finishCapture(e.code); }, true);
addEventListener('mousedown', e => { if (!capturing || e.target.closest?.('.kbtn')) return; e.preventDefault(); e.stopImmediatePropagation(); finishCapture('Mouse' + e.button); }, true);
$('keysPanel').addEventListener('contextmenu', e => e.preventDefault());
$('mKeys').onclick = () => showKeysPanel(true);
$('kBack').onclick = () => { capturing = null; showKeysPanel(false); };
$('kReset').onclick = () => { resetControls(); applyControls(); UI.renderHotbar(); renderKeysPanel(); };
$('mFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); };
$('mTitle').onclick = () => location.reload();
$('mQuit').onclick = () => window.desktop?.quit();
// ロック中に Esc を押すとブラウザがロックを解除するだけなので、それを検知してメニューを開く
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && G.player && !G.uiOpen && !G.typing && !freeLook) openMenu();
});

function interact() {
  const p = G.player;
  if (!p.alive || p.downed) return;
  if (portal && p.pos.distanceTo(portal.position) < 2.4) {
    if (G.isHost) nextFloor(); else { G.net.send({ t: 'portalReq', to: G.hostId }); UI.log('部屋の主に転移を要請した'); }
    return;
  }
  let best = null, bd = 2.6;
  for (const k of G.pickups) { const d = k.pos.distanceTo(p.pos); if (d < bd && !k.opened) { bd = d; best = k; } }
  if (best) pickUp(best);
}

// ---------- ネットワーク ----------
const findMage = id => G.mages.find(m => m.id === id);
const findAny = id => findMage(id) || G.enemies.find(e => e.id === id);
const REMOTE_COLORS = [0x6a2a2a, 0x2a4a6a, 0x4a6a2a, 0x6a4a2a, 0x5a2a6a, 0x2a6a5a];
function onNet(m) {
  switch (m.t) {
    case 'roster': {
      G.hostId = m.hostId; const wasHost = G.isHost; G.isHost = G.net.isHost;
      if (!wasHost && G.isHost) UI.log('あなたが部屋の主になった', '#ffe08a');
      if (m.left) { const r = findMage('p' + m.left); if (r) { r.dispose(); G.mages.splice(G.mages.indexOf(r), 1); UI.log(`${r.name}が去った`); } }
      if (m.joined) { const pl = m.players.find(x => x.id === m.joined); UI.log(`${pl?.name || '魔導師'}が迷宮に現れた`, '#cfe8ff'); if (G.isHost) G.net.send({ t: 'floor', seed: G.dungeon.seed, floor: G.floor, to: m.joined, sync: true }); }
      break;
    }
    case 'st': {
      let r = findMage(m.id);
      if (!r) {
        r = new Mage({ id: m.id, name: m.name, kind: 'remote', team: G.mode === 'coop' ? 'hero' : 'T' + m.from, color: REMOTE_COLORS[m.from % REMOTE_COLORS.length], pos: new THREE.Vector3(m.x, 0, m.z) });
        r.netId = m.from; r.netPos = new THREE.Vector3(m.x, 0, m.z); G.mages.push(r);
      }
      r.netPos.set(m.x, 0, m.z); r.yaw = m.yaw; r.hp = m.hp; r.shield = m.sh; r.downed = m.downed; r.alive = m.alive; r.kills = m.kills;
      if (m.chant !== r.chantText) r.setChant(m.chant, m.n);
      break;
    }
    case 'chant': { const r = findMage(m.id); if (r) { r.setChant(m.text, m.n); if (m.text) G.hearChant(r, m.text); } break; }
    case 'cast': { const r = findMage(m.id); if (r) G.fx.cast(r, G.fx.spellFromIds(m.words), m.aim); break; }
    case 'dmg': G.fx.damage(G.player, m.amount, m.elements, findAny(m.src), { melee: m.opts?.melee, dir: m.opts?.dir }); break;
    case 'heal': G.fx.heal(G.player, m.amount, findAny(m.src)); break;
    case 'shield': G.fx.shield(G.player, m.amount, m.dur, m.thorns); break;
    case 'edmg': { const e = G.enemies.find(x => x.id === m.eid); if (e && G.isHost) G.fx.damage(e, m.amount, m.elements, findAny(m.src), { dir: m.dir, power: m.power }); break; }
    case 'es': {
      if (G.isHost) break;
      for (const [id, x, z, yaw, hp] of m.e) {
        const e = G.enemies.find(o => o.id === id); if (!e || !e.alive) continue;
        e.netTarget.set(x, 0, z); e.yaw = yaw; if (e.hp !== hp) { e.hp = hp; e.updateHpBar(); }
      }
      break;
    }
    case 'ekill': { const e = G.enemies.find(o => o.id === m.id); if (e && e.alive) { e.hp = 0; G.fx.kill(e, null); } break; }
    case 'loot': for (const l of m.items) addPickup(l.id, 'loot', new THREE.Vector3(l.x, 0, l.z), { mat: l.mat }); break;
    case 'pick': { const k = G.pickups.find(o => o.id === m.id); if (k) pickUp(k, true); break; }
    case 'floor': if (m.sync && m.floor === G.floor && m.seed === G.dungeon.seed) break; setupFloor(m.seed, m.floor, !!m.reset); sfx.portal(); UI.banner(`第${m.floor}層`, '迷宮は形を変えた', 3); break;
    case 'portalReq': if (G.isHost) nextFloor(); break;
    case 'flash': if (G.isHost) for (const e of G.enemies) if (e.alive && Math.hypot(e.pos.x - m.x, e.pos.z - m.z) < 10) e.stun = 2.5; break;
    case 'down': { const r = findMage('p' + m.from); if (r) UI.log(`${r.name}が${m.pvp ? '討たれた' : '倒れた'}`, '#ff9a8a'); if (m.pvp && m.by === G.player.id) G.player.kills++; break; }
  }
}

let netT = 0, esT = 0;
function netTick(dt) {
  if (!G.net) return;
  netT -= dt; esT -= dt;
  const p = G.player;
  if (netT <= 0) {
    netT = 1 / 12;
    G.net.send({ t: 'st', id: p.id, name: p.name, x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(3), hp: Math.round(p.hp), sh: Math.round(p.shield), chant: p.chantText, n: p.chantWords || 0, downed: p.downed, alive: p.alive, kills: p.kills });
  }
  if (G.isHost && esT <= 0) {
    esT = 0.1;
    G.net.send({ t: 'es', e: G.enemies.filter(e => e.alive).map(e => [e.id, +e.pos.x.toFixed(2), +e.pos.z.toFixed(2), +e.yaw.toFixed(2), Math.round(e.hp)]) });
  }
  for (const m of G.mages) if (m.kind === 'remote') G.net.positionVoice(m.netId, m.pos.x, m.pos.z);
}

// ---------- メインループ ----------
let last = 0, exploreT = 0, stepT = 0, bob = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!G.net && G.uiOpen) { composer.render(); return; } // ひとり探索中は魔導書を開くと時が止まる
  G.time += dt;
  const p = G.player;

  updatePlayer(dt);
  for (const m of G.mages) {
    if (m.kind === 'remote' && m.netPos) { const prev = m.pos.clone(); m.pos.lerp(m.netPos, Math.min(1, dt * 12)); m.vel.copy(m.pos).sub(prev).divideScalar(Math.max(dt, 1e-3)); }
    m.update(dt);
    if (m.isLocal()) lifeCycle(m, dt);
  }
  for (const b of G.bots) b.brain.update(dt);
  updateFlows(dt);
  for (const e of G.enemies) e.update(dt);
  G.enemies = G.enemies.filter(e => e.alive);
  G.fx.update(dt);

  // 拾い物・転移陣の演出
  for (const k of G.pickups) {
    if (k.mesh.userData.spin) { k.mesh.userData.spin.rotation.y += dt * 1.5; k.mesh.userData.spin.position.y = (k.kind === 'scroll' ? 1.2 : 0.5) + Math.sin(G.time * 2 + k.pos.x) * 0.08; }
    if (k.kind === 'loot' && p.alive && !p.downed && k.pos.distanceTo(p.pos) < 1.3) pickUp(k);
  }
  if (portal) {
    portal.userData.disc.rotation.z += dt * 1.2; portal.userData.floorRune.rotation.z -= dt * 0.4;
    if (Math.random() < dt * 30) G.particles.emit(portal.position.clone().add(new THREE.Vector3(rand(-1.2, 1.2), 0.1, rand(-1.2, 1.2))), new THREE.Vector3(0, rand(1, 2.5), 0), 0x8a6bff, 0.25, 1.5);
  }

  // 探索済みの記録
  exploreT -= dt;
  if (exploreT <= 0 && G.dungeon) {
    exploreT = 0.2;
    const cx = Math.floor(p.pos.x / CELL), cz = Math.floor(p.pos.z / CELL);
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const x = cx + dx, z = cz + dz; if (x < 0 || z < 0 || x >= W || z >= H) continue;
      if (G.explored[z * W + x]) continue;
      const c = new THREE.Vector3((x + 0.5) * CELL, 0, (z + 0.5) * CELL);
      if (!G.dungeon.grid[z * W + x] || lineOfSight(p.pos, c)) G.explored[z * W + x] = 1;
    }
  }

  // 操作ヒント
  let hint = '';
  if (portal && p.pos.distanceTo(portal.position) < 2.4) hint = 'E: 転移陣に触れて次の層へ';
  else for (const k of G.pickups) if (!k.opened && k.pos.distanceTo(p.pos) < 2.6) { hint = 'E: ' + ({ scroll: '古文書を読む', herb: '霊草を摘む', crystal: '魔晶を砕き取る', chest: '宝箱を開ける', loot: '拾う' })[k.kind]; break; }
  UI.prompt(hint);

  // 全滅判定(協力)
  if (G.mode === 'coop' && G.isHost) {
    const heroes = G.mages.filter(m => m.team === 'hero');
    if (heroes.every(m => m.downed || !m.alive)) {
      if (G.gameOverT == null) { G.gameOverT = 4; UI.banner('全滅', '迷宮が魔導師たちを呑み込んでいく…', 4); }
    }
    if (G.gameOverT != null) { G.gameOverT -= dt; if (G.gameOverT <= 0) { G.gameOverT = null; nextFloor(true); } }
  }

  netTick(dt);
  UI.updateHUD();
  UI.frame(dt);
  lightPool.update(camera.position, dt);
  setListener(p.pos.x, p.pos.z, p.yaw);
  composer.render();
}

function lifeCycle(m, dt) {
  if (m.downed) {
    m.downT -= dt;
    if (m.downT <= 0) { // 時間切れ: 入口へ戻される
      m.downed = false; m.hp = 30; m.pos.copy(m.spawn || G.spawnPoint);
      if (m === G.player) { for (const k of ['herb', 'crystal', 'bone', 'iron']) G.inv[k] = Math.floor((G.inv[k] || 0) / 2); UI.log('意識が戻ると入口にいた。素材を半分失った', '#ff9a8a'); UI.renderHotbar(); }
    }
  }
  if (!m.alive) {
    m.respawnT -= dt;
    if (m.respawnT <= 0) { m.alive = true; m.hp = m.maxHp; m.mp = m.maxMp; m.status = {}; m.pos.copy(m === G.player ? G.spawnPoint : (m.spawn || G.spawnPoint)); if (m === G.player) UI.log('再臨した', '#cfe8ff'); }
  }
}

function updatePlayer(dt) {
  const p = G.player;
  // 文字/スロット詠唱の進行
  if (typed) {
    typed.t += dt;
    const k = Math.min(typed.words.length, Math.floor(typed.t / typed.dur * typed.words.length) + 1);
    const partial = typed.words.slice(0, k).join(' ');
    if (partial !== p.chantText) beginOrUpdateChant(partial);
    if (!p.alive || p.downed) { typed = null; clearChant(); }
    else if (typed.t >= typed.dur) { const t = typed.text; typed = null; finishChant(t); }
  }
  if (voiceDeadline && G.time > voiceDeadline) { voiceDeadline = 0; if (p.chanting && !typed) clearChant(); }

  // 移動
  const canMove = p.alive && !p.downed && !G.uiOpen && !G.typing;
  if (canMove) { // 矢印キーでも視点操作
    if (keys.ArrowLeft) p.yaw += dt * 2.4; if (keys.ArrowRight) p.yaw -= dt * 2.4;
    if (keys.ArrowUp) p.pitch = clamp(p.pitch + dt * 1.6, -1.45, 1.45); if (keys.ArrowDown) p.pitch = clamp(p.pitch - dt * 1.6, -1.45, 1.45);
  }
  const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
  const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
  const move = new THREE.Vector3();
  if (canMove) {
    if (isDown('forward')) move.add(fwd); if (isDown('back')) move.sub(fwd);
    if (isDown('right')) move.add(right); if (isDown('left')) move.sub(right);
  }
  const sprint = isDown('sprint') && !p.chanting && !G.reading ? 1.55 : G.reading ? 0.6 : 1;
  if (move.lengthSq()) move.normalize().multiplyScalar(4.4 * sprint * p.speedMul * (1 + (G.eqT?.speed || 0)));
  if (p.pushV) { move.add(p.pushV); p.pushV.multiplyScalar(Math.max(0, 1 - dt * 5)); if (p.pushV.length() < 0.2) p.pushV = null; }
  p.vel.lerp(move, Math.min(1, dt * 28)); // 入力に素早く追従させ、滑る感じを無くす
  if (!move.lengthSq() && p.vel.lengthSq() < 0.05) p.vel.set(0, 0, 0);
  moveWithCollision(p.pos, p.vel.x * dt, p.vel.z * dt, p.radius, p.team);

  // カメラ
  const speed = p.vel.length();
  G.stats.moved += speed * dt;
  if (G.reading) G.stats.read += dt;
  G.tutorial?.update(dt);
  updateTargetInfo();
  bob += dt * speed * 2.2;
  stepT -= dt * speed; if (stepT <= 0 && speed > 1) { stepT = 2.2; sfx.step(null); }
  const eye = p.downed || !p.alive ? 0.4 : 1.62 + (opts.headBob ? Math.sin(bob) * 0.04 * Math.min(1, speed / 4) : 0);
  camera.position.set(p.pos.x, eye, p.pos.z);
  camera.rotation.set(p.pitch, p.yaw, p.downed ? 0.4 : 0);

  // 手元の書物
  VM.update(dt, { bob, chanting: p.chanting, chantWords: p.chantWords, reading: G.reading && G.held === 'grimoire', alive: p.alive && !p.downed, time: G.time });
  staffLight.intensity = ((G.held === 'grimoire' ? 5 : 3) + (p.chanting ? 3 : 0)) * (1 - VM.readAmount * 0.65);
}
