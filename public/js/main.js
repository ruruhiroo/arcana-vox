import { captureCheckpoint, validCheckpoint } from './checkpoint.js';
import { roomProgress, restoreRoomProgress } from './roomevents.js';
import { coopProgress, restoreCoopProgress } from './coop.js';
import { equipmentModel } from './icons3d.js';
import { floatHeight, utilityError } from './utility-magic.js';
import { dragonElement, DRAGON_PROFILES } from './dragon-profiles.js';
import { dragonHp } from './dragon-rules.js';
import { updateArena, arenaDoorNear, openArenaDoor } from './arena-room.js';
import { findFreePosition } from './dungeon.js';
import { carryRoom, addCarry, carryOrder, migrateCarry, gearKey } from './carry.js';
// 詠唱迷宮 ARCANA VOX — 本体
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { G, rand, clamp, seeded } from './state.js';
import { initReading, toReading } from './reading.js';
import { WORDS, WORD_BY_ID, CAT, compile, formula, tokenize, canonicalize, expandChant, chantGaps, chantCoverage, eloquence, correctChant as fixChant, callTail, endsWithCall, applyCustomCalls, fixCallName, snapCallToBook, chantSim, WORD_PRIORITY, BIG_COST, callName, SWORN_ART } from './lexicon.js';
// 声の聞き取り結果を言霊の正式表記に寄せる(似た音は言霊とみなす)。何も拾えなければ原文のまま
// 聞き違いを直し、魔導書で自分が名付けた魔法の名(結句)を正式な名に読み替える
function correctChant(t) {
  const customs = BOOK.spells.filter(sp => sp.call).map(sp => ({ call: sp.call, std: callName(compile(sp.text, null)) }));
  const mine = BOOK.spells.map(sp => callName(compile(sp.text, null))).filter(Boolean);     // 魔導書にある呪文の名
  const r = fixCallName(snapCallToBook(applyCustomCalls(fixChant(t), customs), mine));
  return nameCast(r) || r;
}
// 熟練した属性の術は、魔法の名だけを唱えれば、魔導書に書いた詠唱を唱えたことになる
function nameCast(r) {
  const t = (r || '').replace(/[\s、。,.!！?？]/g, '');
  if (!t || t.length > 16 || !BOOK?.spells) return null;
  for (const sp of BOOK.spells) {
    const nm = callName(compile(sp.text, null)); if (!nm || t !== nm.replace(/\s/g, '')) continue;
    const sc = compile(sp.text, G.known);
    if (sc.valid && shortChantPenalty(sc) === 0) { G.nameCastHit = nm; return sp.text; }
  }
  return null;
}
const heard = t => { const c = canonicalize(t).text; return c ? c + ' ' + callTail(t) : t; };
// 聞き取った文を、原文と「漢字を読みに直した文」の二通りで照らし、言霊をより多く拾える方を使う
// (成功→せいこう→聖光 のように、字が違っても音で拾う。画面には言霊の正しい字で出る)
const chantScore = x => { const j = fixChant(joinChant(x)); return tokenize(heard(j), G.known).filter(t => t.known).length * 10 + chantCoverage(j, tokenize(heard(j)).map(t => t.id)); };
function withReading(t) {
  const r = toReading(t);
  if (!r || r === t) return t;
  return chantScore(r) > chantScore(t) ? r : t;
}
import { generate, buildMeshes, moveWithCollision, raycastGrid, lineOfSight, W, H, CELL } from './dungeon.js';
import { Mage, Enemy, updateFlows, spawnEnemy, clearDying } from './entities.js';
import { preloadModels, loadProgress } from './glbmodels.js';
import { showLoading, hideLoading } from './loading.js';
import { askElement as pickElement } from './elpick.js';
import { initUpdates } from './updates.js';
import { initLook, myLookStr, openLookEditor, grantRandomWear, clearWardrobe } from './lookedit.js';
import { initMp, openMp, closeMp, mpOpen, refreshMp, takeAuto, setNet, makeCode } from './mpanel.js';
import { initFX, LightPool, clearLumens } from './spells.js';
import { BotBrain } from './ai.js';
import { QUICK_DEFAULT, quickSlotsHtml, ensureUtilityBook } from './ui.js';
import { UI, BOOK, loadBook, saveBook, wipeBook, forgetBook, openBook, closeBook, bookOpen, currentBook, setGrimoireElement } from './ui.js';
import { gainProf, shortChantPenalty, profPower, profSummary, EL_JP as PROF_EL, profTitle, rankName } from './proficiency.js';
import { SLOTS as SAVE_SLOTS, currentSlot, useSlot, slotInfo, loadRun, saveRun, clearRun, deleteSlot } from './save.js';
import { initAudio, sfx, setListener, getAudioCtx, cycleAmbience, setAmbience, setMasterVolume, setSfxVolume, setAmbienceVolume } from './audio.js';
import { startMusic, setMusic, setMusicLevel, setMusicVolume, setMusicDuck } from './music.js';
import { startTitle } from './title.js';
import { initGimmicks, buildGimmicks, clearGimmicks, updateGimmicks, gimmickHint, gimmickInteract, gimmickNet, costMult } from './roomgimmick.js';
import { initVoice, voiceSupported, startListening, stopListening, setContinuous, isContinuous, setTTS, ttsOn, engine as voiceEngine } from './voice.js';
// オフライン認識では詠唱文の飾りの言葉を聞き取りにくいので、判定を緩める
const lenientChant = () => voiceEngine === 'vosk';
import { Net } from './net.js';
import { P2PNet, makeRoomCode } from './p2p.js';
import { buildViewModel } from './viewmodel.js';
import { startTutorial } from './tutorial.js';
import { makePickupMesh } from './props.js';
import { setupGoals, updateGoals, sealNeed } from './goals.js';
import { SPIRITS, BOND_NAMES, bondMul, bondLevel, gainBond, scold, forgive, spiritsOf } from './spirits.js';
import { offerQuest, questEvent } from './quests.js';
import { hazardImpact, trigger as triggerHazard, updateHazards } from './hazards.js';
import { onPlayerCast, updateBosses, clearBosses, BOSS_NAMES } from './bosses.js';
import { pickMutator, mutatePower } from './mutators.js';
import { rubbleBurst, clearVfx } from './vfx.js';
import { buildShrines, clearShrines, updateShrines, shrineNear, EL_INFO, EL_LORE } from './hub.js';
import { initMischief, buildTraps, clearTraps, updateMischief, eatOddShroom, mischiefNet, eyeScale, applyTo as applyMischief, EFFECTS as MISCHIEF, foeHit } from './mischief.js';
G.onEnemyHit = src => foeHit(src, G.player); // 魔物の技で声がおかしくなる(守護をまとっていれば防げる)
import { initRoomEvents, buildRoomEvents, clearRoomEvents, updateRoomEvents, roomImpact, roomCast, roomHint, roomInteract, roomNet } from './roomevents.js';
import { initCoop, buildCoop, clearCoop, updateCoop, coopImpact, coopCast, coopHint, coopInteract, coopNet, partySize } from './coop.js';
import { buildSecrets, clearSecrets, updateSecrets, crackedAt, sealFor, onDig as secretDig } from './secrets.js';
import { rebuildStructure, breakable, FINAL_FLOOR, heightAt, STEP } from './dungeon.js';
import { pickSanctuaryRoom, buildSanctuary, inSanctuary, updateSanctuary } from './sanctuary.js';
G.inSanctuary = inSanctuary;
import { ENEMY_TYPES, ENEMY_RIM } from './entities.js';
import { SLOTS, RARITY, rollItem, statLines, totals, tuneEquipment, rollUnique, uniquesOf } from './equipment.js';
import { itemIcon, gearIcon, slotGhost, STAT_ICON } from './icons.js';
import { warmIcons, preloadItems } from './icons3d.js';
import { ACTIONS, OPTION_DEFS, binds, opts, actionOf, rebind, resetControls, saveControls, keyName, keyOf } from './controls.js';
import { glowSprite, runeCircleTex } from './textures.js';

const $ = id => document.getElementById(id);
G.ui = UI; window.G = G; // デバッグ用
// Steam の実績(アプリ版で Steam から起動した時だけ届く)。手ほどき中は解除しない
G.achieve = id => { if (!G.noSave) window.desktop?.achieve?.(id); };
G.lenientChant = () => lenientChant();
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
G.camera = camera;
camera.rotation.order = 'YXZ';
scene.add(camera);
const hemi = new THREE.HemisphereLight(0x3a3550, 0x120c08, 0.8); scene.add(hemi); // 真っ暗にはしない(魔物の姿が分かる程度)
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
G.VM = VM; // 確かめる用
function renderBookPages() {
  VM.setElement?.(G.affinity);
  setGrimoireElement(G.affinity);
  const s = BOOK.spells[G.page];
  const sp = s ? compile(s.text, G.known) : null;
  const el = s ? eloquence(s.text, G.known) : null;
  VM.renderPages(s, G.page, BOOK.spells.length, { formula: sp ? formula(sp) + (spiritsOf(sp).length ? ' ・ ' + spiritsOf(sp).map(id => `${SPIRITS[id].name}:${BOND_NAMES[bondLevel((BOOK.bonds || {})[id] || 0)]}`).join(' ') : '') : '', cost: sp?.cost ?? 0, tier: el?.tier });
}
document.fonts?.ready.then(() => { if (G.player) renderBookPages(); });
G.held = 'grimoire';
function setHeld(which) {
  const key = which === 'item' ? G.quick?.[G.heldSlot] : null;
  const changed = G.held !== which || (which === 'item' && G.heldKey !== key); G.held = which; G.heldKey = key;
  VM.setHeld(which, key);
  if (changed) VM.swap();
  if (changed && which === 'item' && key && G.player) showHeldCard(key);
  else if (which !== 'item') hideHeldCard();
  if (G.player) UI.renderHotbar();
  // 持ち替えたら詠唱は途切れる
  if (G.player && which !== 'grimoire' && (G.player.chanting || typed)) { typed = null; clearChant(); }
}
setHeld('grimoire');
let castWarnT = -9;
function canCast() {
  return !!G.player&&G.player.alive&&!G.player.downed&&!G.typing&&!G.player.status.drinking;
}
const staffLight = new THREE.PointLight(0xffc48a, 5, 11, 1.6);
staffLight.position.set(0.15, 0.3, 0.5);
staffLight.castShadow = true; staffLight.shadow.mapSize.set(512, 512); staffLight.shadow.bias = -0.004; staffLight.shadow.camera.near = 0.1;
camera.add(staffLight);

// ---------- ロビー ----------
let chosenMode = 'coop';
// 得意属性
let chosenEl = 'fire';
try { chosenEl = localStorage.getItem('arcana_el') || 'fire'; } catch {}
const pickEl = v => { chosenEl = v; document.querySelectorAll('.el').forEach(o => o.classList.toggle('sel', o.dataset.el === v)); try { localStorage.setItem('arcana_el', v); } catch {} };
document.querySelectorAll('.el').forEach(el => el.onclick = () => pickEl(el.dataset.el));
pickEl(chosenEl);
// 旅の記録(3枠)。選んだ枠の魔導書と到達層で遊ぶ。✕を2回押すと枠を消す
const SLOT_EL = { fire: '炎', ice: '氷', thunder: '雷', wind: '風', holy: '聖', void: '闇' };
function renderSlots() {
  const box = $('slots'); if (!box) return;
  let html = '';
  for (let n = 1; n <= SAVE_SLOTS; n++) {
    const s = slotInfo(n), sel = n === currentSlot() ? ' sel' : '';
    if (!s) { html += `<div class="slot3 empty${sel}" data-slot="${n}"><div class="sn">記録 ${n}</div><div class="sf">新しい旅</div><div class="sd">白紙の魔導書から始める</div></div>`; continue; }
    const when = s.time ? new Date(s.time).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) + ' ' + new Date(s.time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';
    html += `<div class="slot3${sel}" data-slot="${n}"><button class="sdel" data-del="${n}" title="この記録を消す">消す</button><div class="sn">記録 ${n}${s.name ? ' ・ ' + esc(s.name) : ''}</div>
      <div class="sf">${s.floor ? `第${s.floor}層` : '迷宮の入口'}</div>
      <div class="sd">${s.affinity ? SLOT_EL[s.affinity] + 'の魔導師 ・ ' : ''}言霊 ${s.words} ・ 呪文 ${s.spells}${s.gear ? ' ・ 装備 ' + s.gear : ''}<br>${s.best > s.floor ? `最深 第${s.best}層 ・ ` : ''}${when}</div></div>`;
  }
  box.innerHTML = html;
  box.querySelectorAll('.slot3').forEach(el => el.onclick = e => {
    if (e.target.closest('.sdel')) return;
    useSlot(+el.dataset.slot);
    const s = slotInfo(+el.dataset.slot); if (s?.name) $('nameIn').value = s.name;
    renderSlots();
  });
  box.querySelectorAll('.sdel').forEach(b => b.onclick = () => {
    if (!b.classList.contains('arm')) { b.classList.add('arm'); b.textContent = 'もう一度で消去'; setTimeout(() => { b.classList.remove('arm'); b.textContent = '消す'; }, 2500); return; }
    deleteSlot(+b.dataset.del); renderSlots();
  });
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
renderSlots();
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
  ? (window.desktop ? 'オフライン音声認識で詠唱できます(ネット接続不要)。' : '音声認識に対応しています。初回はマイクの使用許可を求められます。')
  : 'このブラウザは音声認識に未対応です(Chrome / Edge 推奨)。アプリ版で音声入力を利用してください。';
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
  G.run = { keys: 0, done: false }; G.FINAL_FLOOR = FINAL_FLOOR;
  G.netReady = false; netWait.length = 0;
  G.stats = { moved: 0, looked: 0, read: 0, flips: 0, kills: 0, chests: 0, eloquent: 0 };
  initAudio(); startMusic(); applySettings();
  showLoading('迷宮へ降りている', () => loadProgress.total ? loadProgress.done / loadProgress.total : 0); // 模型の読み込みと迷宮づくりの間
  loadBook();
  G.noSave = tutorial;
  const run = tutorial ? null : loadRun(); // 記録の続きから
  const checkpoint=!tutorial&&validCheckpoint(run?.checkpoint)?run.checkpoint:null;
  if(checkpoint?.book){for(const k of Object.keys(BOOK))delete BOOK[k];Object.assign(BOOK,checkpoint.book);ensureUtilityBook();G.known=new Set(BOOK.known);}
  G.resumeFloor = run?.floor || 0;
  if (run?.affinity) chosenEl = run.affinity;
  if (run?.keys) G.run.keys = run.keys;
  if (run?.play) G.run.time = run.play;
  await Promise.all([preloadModels(), preloadItems()]).then(([, ok]) => { if (ok) VM.refreshItems(); }); // 手の模型は両方が届いてから付け直す // 魔物と道具のモデル(Blender 製)
  if (!window.desktop && navigator.mediaDevices?.getUserMedia && !G.micStream) {
    $('netNote').textContent = 'マイクの使用を許可してください(声の詠唱とボイスチャットに使います)';
    try { G.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); G.micOk = true; }
    catch (e) { G.micOk = false; G.micError = e?.name || 'error'; }
    $('netNote').textContent = '';
  }
  const name = $('nameIn').value.trim() || '漆黒の詠唱者';
  try { localStorage.setItem('arcana_name', name); } catch {}
  G.mode = chosenMode;
  if (tutorial) { chosenMode = 'coop'; G.known.add('lance'); }
  const netMode = canOnline && !tutorial ? $('netSel').value : 'solo';
  let seed = (Math.random() * 1e9) | 0, floor = 1;
  if (netMode !== 'solo') {
    const handlers = {
      message: onNet,
      close: () => UI.log('接続が切れた', '#ff8080'),
      roomState: () => (G.netReady && G.dungeon ? { seed: G.dungeon.seed, floor: G.floor } : {}),   // 迷宮を作り終えるまでは、部屋を開いた時の値を使わせる
    };
    const p2p = netMode !== 'lan';
    const net = p2p ? new P2PNet(handlers) : new Net(handlers);
    const code = p2p ? (netMode === 'host' ? hostCode : $('roomIn').value.trim().toUpperCase()) : ($('roomIn').value.trim() || 'ARCANA');
    if (netMode === 'join' && !code) { $('netNote').textContent = '部屋コードを入れてください。'; hideLoading(0); return; }
    $('startBtn').disabled = true;
    if (netMode === 'join') $('netNote').textContent = `部屋「${code}」を探しています…`;
    try {
      const w = p2p ? await net.connect(code, name, chosenMode, netMode === 'host') : await net.connect(code, name, chosenMode, $('hostIn').value.trim());
      G.net = net; G.netId = w.id; G.hostId = w.hostId; G.isHost = w.id === w.hostId; G.mode = w.mode || chosenMode;
      G.roomCode = p2p ? code : '';
      seed = w.seed; floor = w.floor ?? 0;
      G.resumeFloor = 0;                       // 仲間との旅は、ひとり旅の記録の続きからは始めない
      net.enableVoice(w.players, getAudioCtx()).then(ok => UI.log(ok ? 'VC接続: 近くの魔導師の声が聞こえる' : 'VCは利用できない(マイク未許可)', '#b0d0ff'));
    } catch (e) {
      hideLoading(0);
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
      ? [] // 協力探索をひとりで遊ぶときは仲間のNPCを付けない
      : [{ id: 'b1', name: 'ヴァルグ', color: 0x6a1a1a }, { id: 'b2', name: 'セレネ', color: 0x1a3a6a }];
    for (const d of defs) {
      const m = new Mage({ ...d, kind: 'bot', team: G.mode === 'coop' ? 'hero' : 'T' + d.id, pos: new THREE.Vector3() });
      G.mages.push(m); G.bots.push({ mage: m, brain: new BotBrain(m, G.mode === 'coop' ? 'ally' : 'rival') });
    }
  }
  setupVoice();
  // マルチプレイは迷宮の入口(祭壇で属性に誓う所)を通らず第1層から始まるので、ここで属性を選ばせる。
  // すでに誓いを立てている旅なら聞かない
  if (G.net && !tutorial && !BOOK.affinityChosen && floor > 0) { hideLoading(0); const el = await askElement(); showLoading('迷宮へ降りている'); BOOK.affinityChosen = el; chosenEl = el; try { localStorage.setItem('arcana_el', el); } catch {} saveBook(); }
  setupStarter(tutorial ? 'fire' : BOOK.affinityChosen || chosenEl);
  for(const it of [...Object.values(BOOK.equip||{}),...(BOOK.bag||[])])tuneEquipment(it);
  warmIcons([...Object.values(BOOK.equip || {}), ...(BOOK.bag || [])]);
  G.restoring=!!checkpoint&&!G.net;G.pendingCheckpoint=G.restoring?checkpoint:null;
  setupFloor(G.restoring?checkpoint.seed:seed,tutorial?floor:G.net?floor:G.restoring?checkpoint.floor:0,true);
  // 迷宮を作り終えた: 待たせていた仲間からの知らせを、届いた順に処理する
  G.netReady = true; for (const m of netWait.splice(0)) { try { onNet(m); } catch (e) { console.warn('net', m?.t, e); } }
  hideLoading(700);
  if(run&&!G.restoring&&!G.net)G.run.keys=run.keys||0;
  if (run?.inv) { G.inv = { ...run.inv }; delete G.inv.potion; }
  if (run?.quick) G.quick = run.quick.slice(0, 6).map(k => k === 'potion' ? null : k);
  const carried=migrateCarry(G.inv,G.quick,BOOK.bag||[]);G.inv=carried.inv;G.quick=carried.quick;BOOK.bag=carried.bag;
  BOOK.recovery ||= [];BOOK.recovery.push(...carried.overflow);
  if(carried.overflow.length){saveBook();saveRun({...run,inv:G.inv,quick:G.quick});UI.log('旧記録の6枠を超えた荷物は、入口の足元へ置いた。','#e4cba3');}
  UI.renderHotbar(); setHeld("grimoire"); renderBookPages(); BOOK.equip ||= {}; BOOK.bag ||= []; applyEquip();
  if(G.restoring){
    const saved=new Map(checkpoint.enemies.map(e=>[e.id,e]));
    G.enemies=G.enemies.filter(e=>{const data=saved.get(e.id);if(!data){e.dispose();return false;}e.hp=Math.min(e.maxHp,data.hp);const p=findFreePosition(new THREE.Vector3(...data.pos),e.radius,{maxDistance:12});if(p)e.pos.copy(p);e.root.position.copy(e.pos);return true;});
    for(const data of checkpoint.enemies)if(!G.enemies.some(e=>e.id===data.id)){const e=spawnEnemy(data.id,data.type,new THREE.Vector3(...data.pos),checkpoint.floor,data.summoner);if(e)e.hp=Math.min(e.maxHp,data.hp);}
    for(const k of G.pickups)scene.remove(k.mesh);G.pickups=[];
    for(const k of checkpoint.pickups)addPickup(k.id,k.kind,new THREE.Vector3(...k.pos),k.data);
    // Prefer the exact saved point, but validate it against the current colliders.
    const pos=findFreePosition(new THREE.Vector3(...checkpoint.position),G.player.radius,{room:G.dungeon.start});if(pos)G.player.pos.copy(pos);
    G.player.yaw=checkpoint.yaw||0;G.player.pitch=checkpoint.pitch||0;G.player.hp=clamp(checkpoint.hp,1,G.player.maxHp);G.player.mp=clamp(checkpoint.mp,0,G.player.maxMp);
    if(checkpoint.explored?.length===W*H)G.explored.set(checkpoint.explored);
    if(G.sanctuary)G.sanctuary.reserve=checkpoint.reserve??1;
    if(G.dungeon.arena)G.dungeon.arena.phase=checkpoint.arena==='cleared'?'cleared':'dormant';
    Object.assign(G.run,checkpoint.run);if(!(G.run.time<1e7))G.run.time=0;if(!(G.run.lapAt<=G.run.time))G.run.lapAt=G.run.time;Object.assign(G.floorStats||{},checkpoint.floorStats);
    if(G.goals){G.goals.rewarded=!!checkpoint.progress?.goals?.rewarded;for(const goal of G.goals.list)goal.done=!!checkpoint.progress?.goals?.done?.includes(goal.id);}
    restoreRoomProgress(checkpoint.progress?.room);restoreCoopProgress(checkpoint.progress?.coop);
    G.restoring=false;G.pendingCheckpoint=null;saveBook();UI.log('聖域の記録から再開した。','#d6e5bb');
  }
  for(const [i,item]of BOOK.recovery.entries()){
    const present=G.pickups.filter(k=>k.data.recovery===i).length;
    for(let n=present;n<item.count;n++){
      const wanted=G.player.pos.clone().add(new THREE.Vector3(1.8+(i%3)*.5,0,Math.floor(i/3)*.5));
      const pos=findFreePosition(wanted,.15,{maxDistance:8})||G.player.pos.clone();
      addPickup('recovery_'+i+'_'+n,'loot',pos,{mat:item.key,gear:item.gear,recovery:i,noPick:performance.now()+3000});
    }
  }
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
      spellCount: () => BOOK.spells.length,
      empowered: () => !!G.player?.status?.might,
    });
  }
  if (G.roomCode) UI.log(`部屋コード: ${G.roomCode} — 仲間に伝えればネット越しに参加できる`, '#ffe08a');
  if (G.floor === 0 && G.resumeFloor > 0 && (!G.net || G.isHost)) UI.banner('迷宮の入口', `記録 ${currentSlot()} の続き — 門の先は第${G.resumeFloor}層`, 5);
  else if (G.floor === 0) UI.banner('迷宮の入口', '祭壇で得意属性を選び、仲間がそろったら北の門へ', 5);
  else UI.banner(`第${floor}層`, G.mode === 'coop' ? '仲間と共に最奥の転移陣を目指せ' : '魔導師たちの詠唱に耳を澄ませ — 狩るか、狩られるか', 4);
  setTimeout(() => UI.log(`V を押しながら「${BOOK.spells.find(s => s.name === G.starterSpell)?.text || ''}」と唱え切れ。最後に魔法の名を呼ぶと術が完成する。手元の魔導書の頁に詠唱文が書いてある(右クリックで掲げて読む・ホイールで頁をめくる)`, '#ffe08a'), 1500);
  setTimeout(() => UI.log('Tab で魔導書を開く(呪文の書き記し・言霊辞典・心得)。古文書(金色の光)から新しい言霊を得る', '#ffe08a'), 4500);
  last = performance.now(); requestAnimationFrame(loop);
}

// ---------- 階層 ----------
function clearFloor() {
  if (dungeonGroup) {
    scene.remove(dungeonGroup);
    const geometry=new Set(),materials=new Set();
    dungeonGroup.traverse(o=>{if(o.geometry)geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)materials.add(m);});
    for(const g of geometry)g.dispose();for(const m of materials)m.dispose();
    dungeonGroup=null;renderer.renderLists.dispose();
  }
  for (const e of G.enemies) e.dispose();
  clearDying();
  for (const k of G.pickups) if (k.mesh) scene.remove(k.mesh);
  for (const m of G.openChests || []) scene.remove(m); G.openChests = [];
  clearSecrets(scene);
  clearRoomEvents(scene);
  clearCoop(scene);
  clearTraps(scene);
  clearShrines(scene);
  for (const arr of [G.projectiles, G.effects, G.obstacles, G.runes]) { for (const o of arr) if (o.mesh) scene.remove(o.mesh); arr.length = 0; }
  clearLumens();
  clearVfx();
  clearBosses();
  if (G.sanctuary) { scene.remove(G.sanctuary.grp); G.sanctuary = null; }
  if (portal) scene.remove(portal);
  G.enemies = []; G.pickups = [];
}

function setupFloor(seed, floor, reset = false) {
  clearFloor();
  G.floor = floor;
  const d = G.dungeon = generate(seed, floor);
  if(G.pendingCheckpoint?.seed===seed&&G.pendingCheckpoint.floor===floor)d.grid.set(G.pendingCheckpoint.grid);
  dungeonGroup = buildMeshes(d); scene.add(dungeonGroup);
  G.explored = new Uint8Array(W * H);
  G.enemies = d.spawns.map((s, i) => {
    const e = new Enemy(`e${floor}_${i}`, s.type, s.pos, floor, s.boss);
    if (s.bossKind) { e.bossKind = s.bossKind; e.name = BOSS_NAMES[s.bossKind]; e.maxHp = e.hp = Math.round(e.maxHp * (s.bossKind === 'mirror' ? 2.6 : 1.3)); }
    if (s.final) { e.final = true; e.name = '【終章の詠灰竜】'; e.maxHp = e.hp = Math.round(e.maxHp * 1.8); e.dmg *= 1.2; }
    return e;
  });
  if (reset) G.run = { keys: 0, done: false, time: G.run?.time || 0 }; // 旅の時計は、倒れても進み続ける
  if (G.mode === 'coop') {
    const people = G.net ? Math.max(1, G.net.players?.size || 1) : 1;
    // ひとりなら控えめに、人数が増えるほど手強く
    const hpMul = people > 1 ? 1.25 * (1 + 0.25 * (people - 1)) : 1.15, dmgMul = people > 1 ? 1.2 + 0.05 * (people - 1) : 1.15;
    // 仲間が多いほど群れも大きくなる(どの端末でも同じになるよう、層の種から決める)
    if (people > 1 && floor > 0) {
      const rnd = seeded(seed + 7177), base = G.enemies.filter(e => !e.boss);
      const extra = Math.round(base.length * 0.35 * (people - 1));
      for (let k = 0; k < extra && base.length; k++) {
        const src = base[Math.floor(rnd() * base.length)];
        const pos = src.pos.clone().add(new THREE.Vector3((rnd() - 0.5) * 2.4, 0, (rnd() - 0.5) * 2.4));
        G.enemies.push(new Enemy(`e${floor}_x${k}`, src.type, pos, floor));
      }
      // 精鋭も混じりやすくなる
      for (const e of G.enemies) if (!e.boss && !e.elite && rnd() < 0.06 * (people - 1)) { e.elite = true; e.maxHp = Math.round(e.maxHp * 1.6); e.dmg *= 1.2; e.name = '【精鋭】' + e.name; }
    }
    for (const e of G.enemies) { e.maxHp = e.hp = Math.round(e.maxHp * hpMul); e.dmg *= dmgMul; e.keen = true; }
    if (people > 1 && floor > 0) setTimeout(() => UI.log(`${people}人の気配に、迷宮が牙を研いでいる — 魔物が多く、手強い`, '#ff9a8a'), 2500);
  }
  // 聖域(休息所)。中に湧いた魔物は消す
  const sroom = pickSanctuaryRoom(d);
  G.sanctuary = sroom ? buildSanctuary(sroom) : null;
  if(G.sanctuary)for(const [pos,r]of [[G.sanctuary.center,.55],[G.sanctuary.lecternPos,.4]])d.solids.push({x:pos.x,z:pos.z,r});
  G.sanctuaryGreeted = floor === 0; // 入口では聖域の案内を出さない(入口・全滅の案内を消さないように)
  if (G.sanctuary) G.enemies = G.enemies.filter(e => { if (inSanctuary(e.pos, 2) && !e.boss) { e.dispose(); return false; } return true; });
  let kid = 0;
  for (const p of d.scrolls) addPickup(`k${kid++}`, 'scroll', p);
  for (const p of d.herbs) addPickup(`k${kid++}`, 'herb', p);
  for (const l of d.loots || []) addPickup(`kl${kid++}`, 'loot', l.pos, { mat: l.mat }); // 部屋の性格に合わせて転がっている素材(鍛冶場の鉄屑など)
  for (const c of d.crystals) addPickup(`k${kid++}`, 'crystal', c.pos, { dir: c.dir });
  for (const p of d.chests) addPickup(`k${kid++}`, 'chest', p);
  for (const p of d.mushrooms || []) addPickup(`k${kid++}`, 'mushroom', p);
  for (const p of d.richChests || []) addPickup(`k${kid++}`, 'chest', p, { rich: true });
  buildSecrets(d, scene);
  buildRoomEvents(d, scene);
  buildGimmicks(d, scene); // 部屋の種類ごとの仕掛け(泉・大釜・金床・天球儀・石棺)
  buildCoop(d, scene);
  buildTraps(d, scene);
  buildShrines(d, scene);
  for (const p of d.oddShrooms || []) addPickup(`k${kid++}`, 'oddshroom', p);
  makePortal(d.portal);
  placeGuardian(d, floor, seed);
  // 配置
  const occupied=[];
  const roomPos = (rm, k = 0) => {
    const wanted=new THREE.Vector3((rm.cx+.5)*CELL+(k%2?2.2:-2.2),0,(rm.cy+.5)*CELL+(Math.floor(k/2)%2?2.2:-2.2));
    const pos=findFreePosition(wanted,.4,{room:rm,occupied});
    if(!pos)throw new Error('No safe player spawn in room '+rm.id);
    occupied.push({pos,radius:.4});return pos;
  };
  const p = G.player;
  let spawnRoom = d.start;
  if (G.mode === 'pvp' && G.net) spawnRoom = d.rooms[(G.netId * 3) % d.rooms.length];
  G.spawnPoint = roomPos(spawnRoom, G.net ? G.netId % 4 : 0);
  p.pos.copy(G.spawnPoint);
  G.bots.forEach((b, i) => {
    const rm = G.mode === 'coop' ? d.start : d.rooms[(d.rooms.length - 2 - i * 2 + d.rooms.length) % d.rooms.length];
    b.mage.pos.copy(roomPos(rm, i + 1)); b.mage.spawn = b.mage.pos.clone();
  });
  G.enemies=G.enemies.filter(e=>{
    const room=d.rooms.find(r=>r.cells?.some(([x,z])=>Math.floor(e.pos.x/CELL)===x&&Math.floor(e.pos.z/CELL)===z));
    const pos=findFreePosition(e.pos,e.radius,{room,occupied,maxDistance:20});
    if(!pos){e.dispose();return false;}e.pos.copy(pos);e.root.position.copy(pos);occupied.push(e);return true;
  });
  for (const m of G.mages) {
    if (m.kind === 'remote') continue;
    if (reset) { m.hp = m.maxHp; m.mp = m.maxMp; }
    else { m.hp = Math.min(m.maxHp, Math.max(m.hp, 0) + 30); m.mp = m.maxMp; }
    if (m.downed || !m.alive) { m.downed = false; m.alive = true; m.hp = Math.max(m.hp, 50); }
    m.status = {}; m.shield = 0; m.setChant('');
  }
  if (reset) { G.inv = { herb: 1, crystal: 1, bone: 0, iron: 0, ether: 1, amulet: 0, flash: 0, lantern: 0 }; G.quick = [...QUICK_DEFAULT]; }
  // 層の変異
  G.mut = floor === 0 ? null : pickMutator(seed, floor);
  scene.fog.density = G.mut?.id === 'dark' ? 0.075 : 0.042; hemi.intensity = G.mut?.id === 'dark' ? 0.18 : 0.6;
  if (G.mut?.id === 'frenzy') for (const e of G.enemies) { e.dmg *= 1.2; e.T = { ...e.T, speed: e.T.speed * 1.25 }; }
  if (G.mut?.id === 'plenty') { const rooms = d.rooms.filter(r => r !== d.start && r !== d.sanctRoom); for (let i = 0; i < 3 && rooms.length; i++) { const rm = rooms[Math.floor(Math.random() * rooms.length)]; addPickup(`kx${i}`, 'chest', new THREE.Vector3((rm.cx + 0.5) * CELL + (Math.random() - 0.5) * 2, d.hgt?.[rm.cy * W + rm.cx] || 0, (rm.cy + 0.5) * CELL + (Math.random() - 0.5) * 2)); } }
  if (G.mut) setTimeout(() => UI.banner(`層の変異 — ${G.mut.name}`, G.mut.desc, 4), 4200);
  // この層の課題
  if (floor === 0) { G.goals = null; } else setupGoals(floor, {
    onGoal: g => { UI.log(`課題達成: ${g.text}`, '#b8f0c0'); sfx.pickup(); },
    onAllDone: () => {
      const it = rollItem(G.floor + 1); grantGear(it); saveBook();
      grantItem('ether',1); UI.renderHotbar();
      UI.banner('層の課題をすべて達成', `褒美: ${it.name}〔${RARITY[it.rarity].name}〕と魔力薬 — ${keyOf('inventory')} で確かめよ`, 5);
      sfx.learn();
    },
  });
  clearTimeout(G.questTimer); G.quest = null;
  G.questTimer = setTimeout(() => { if (!G.tutorial && G.floor > 0) offerQuest(QUEST_HOOKS); }, 12000);
  if ([3, 5, 8, 10, 15, 20].includes(floor) && !reset) setTimeout(() => UI.log(`第${floor}層に到達した — 目指す深さを越えた!`, '#ffe08a'), 4500);
  G.gameOverT = null;
  p.yaw = 0; p.pitch = 0;
  // 最初に開けた方向を向く
  for (const [yaw, dx, dz] of [[0, 0, -1], [Math.PI / 2, -1, 0], [Math.PI, 0, 1], [-Math.PI / 2, 1, 0]]) {
    if (!isWall(p.pos.x + dx * 6, p.pos.z + dz * 6)) { p.yaw = yaw; break; }
  }
  UI.renderHotbar();
  for (const n of [3, 6, 10]) if (floor >= n) G.achieve('FLOOR_' + n);
  // 層に着いたら自動で記録する
  if (floor > 0) { if (floor >= G.resumeFloor) G.resumeFloor = 0; saveSnapshot(); }
}
const isWall = (x, z) => { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); return cx < 0 || cz < 0 || cx >= W || cz >= H || !G.dungeon.grid[cz * W + cx]; };

const clock = t => { t = Math.round(t || 0); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
function nextFloor(reset = false) {
  if (G.changingFloor) return; // 層を移っている最中は、重ねて始めない
  if(!reset&&G.floor>0&&guardianAlive())return;
  if (!reset && G.floor > 0 && G.run) { // 踏破にかかった時間を告げる(調整の手がかり)
    const lap = (G.run.time || 0) - (G.run.lapAt || 0); G.run.lapAt = G.run.time || 0;
    UI.log(`第${G.floor}層 踏破 — ${clock(lap)}(通算 ${clock(G.run.time)})`, '#ffe08a');
  }
  const seed = (Math.random() * 1e9) | 0;
  // 全滅したら迷宮の入口へ戻る(手ほどきでは第1層から)。入口の門は記録した層へ続く
  const floor = reset ? (G.noSave ? 1 : 0) : G.floor === 0 && G.resumeFloor > 0 ? G.resumeFloor : G.floor + 1;
  if (G.net) G.net.send({ t: 'floor', seed, floor, reset });
  sfx.portal();
  G.changingFloor = true;
  showLoading(reset ? '迷宮の入口へ戻される' : floor === 0 ? '迷宮の入口へ' : `第${floor}層へ降りている`);
  setTimeout(() => { try { finishFloorChange(seed, floor, reset); } finally { G.changingFloor = false; hideLoading(600); } }, 60);
}
function finishFloorChange(seed, floor, reset) {
  if (reset) wipeProgress();
  setupFloor(seed, floor, reset);
  UI.banner(reset ? '全滅' : `第${floor}層`, reset ? (G.noSave ? '第1層からやり直し' : '魔導書は白紙に戻った — 覚えた言霊も、書いた呪文も、装備も、すべて失った') : (floor % 3 === 0 ? '強大な気配がする…この層には主がいる' : '迷宮は形を変えた'), 5);
}
// 全滅: この記録の旅をすべて失う(魔導書・装備・秘伝書・到達層)。手ほどき中は消さない
function wipeProgress() {
  if (G.noSave) return;
  G.achieve('WIPE');
  G.wiping = false; wipeBook(); clearRun(); clearWardrobe();
  G.resumeFloor = 0; G.run = { keys: 0, done: false };
  G.affinity = null; setupStarter(chosenEl);
  BOOK.equip ||= {}; BOOK.bag ||= []; applyEquip();
  G.page = 0; renderBookPages(); UI.renderHotbar();
}
// 層に着いた時と、入口・聖域でメニューから記録する時の中身
function saveSnapshot() {
  if (G.noSave || !G.player || G.restoring) return false;
  saveBook();
  saveRun({ floor: G.floor === 0 ? G.resumeFloor : G.floor, inv: { ...G.inv }, quick: G.quick, affinity: G.affinity, keys: G.run?.keys || 0, play: Math.round(G.run?.time || 0), name: G.player.name, checkpoint:captureCheckpoint(G,BOOK,{room:roomProgress(),coop:coopProgress(),goals:{rewarded:G.goals?.rewarded,done:G.goals?.list.filter(g=>g.done).map(g=>g.id)||[]}}) });
  return true;
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
const MAT_COLORS = { shard: 0xd8a0ff, herb: 0x6aff7a, crystal: 0x6ab0ff, bone: 0xe8dcc0, iron: 0xa0a0b0, scroll: 0xffe08a, potion: 0xff6a6a, ether: 0x6a8aff, amulet: 0x9fd8ff, flash: 0xffffff, lantern: 0xffd27a, frag: 0xe8d0a0, tome_fire: 0xff7a30, tome_ice: 0x8fd8ff, tome_thunder: 0xc8b8ff, tome_wind: 0x9effc8, tome_holy: 0xfff0b0, tome_void: 0xb070ff };
function addPickup(id, kind, pos, data = {}) {
  // 見た目は props.js (古文書・霊草・魔晶・宝箱・戦利品)
  const g = makePickupMesh(kind, data, MAT_COLORS);
  if (kind === 'chest' || kind === 'herb' || kind === 'crystal' || kind === 'mushroom' || kind === 'oddshroom') g.rotation.y = rand(0, Math.PI * 2);
  g.position.copy(pos);
  if (kind === 'crystal' && data.dir) { g.rotation.y = Math.atan2(-data.dir[0], -data.dir[1]); if (g.userData.lean) g.userData.lean.rotation.x = 0.38; } // 壁から斜めに生える
  scene.add(g);
  const k = { id, kind, pos: g.position, mesh: g, data };
  G.pickups.push(k);
  return k;
}

function pickUp(k, fromNet = false) {
  const i = G.pickups.indexOf(k); if (i < 0) return;
  if(!fromNet&&k.kind==='scroll'&&!k.data.word)k.data.word=pickUnknownWord();
  const key=k.kind==='loot'?k.data.mat:k.kind==='scroll'?(k.data.word?'scroll_'+k.data.word.id:'crystal'):['herb','crystal'].includes(k.kind)?k.kind:null;
  if(!fromNet&&key&&invFull(key)){UI.log('持ち物がいっぱい。6枠のどれかを使うか落として空けよう。','#d5bd95');return;}
  if (k.kind === 'chest') {
    if (k.opened) return;
    if (k.data?.frozen) { if (!fromNet) UI.log('宝箱は分厚い氷に閉ざされている — 紅蓮の術で溶かせ', '#bfe8ff'); return; }
    k.opened = true; k.mesh.userData.open?.(); // 蓋が開く。開いた箱は残す
    (G.openChests ||= []).push(k.mesh);
    G.pickups.splice(i, 1);
  } else { scene.remove(k.mesh); G.pickups.splice(i, 1); }
  if (fromNet) return;
  if (k.kind !== 'scroll' && k.kind !== 'chest') G.net?.send({ t: 'pick', id: k.id });
  sfx.pickup();
  const add = (m, n) => { const got = grantItem(m,n,k.pos); if (got) UI.log(`${itemName(m)} ×${got}`, m.startsWith('tome') ? '#ffd76a' : '#cfe8ff'); UI.renderHotbar(); };
  if (k.kind === 'scroll') {
    const held = Object.keys(G.inv).filter(x => x.startsWith('scroll_') && G.inv[x] > 0).map(x => x.slice(7));
    const w = k.data.word || pickUnknownWord(held);
    if (w) { invAdd('scroll_' + w.id, 1, true); UI.log(`古文書を拾った — 『${w.core}』(${CAT[w.cat]})の言霊が記されている。数字キーで持ち、左クリックで読むと覚える`, '#ffe08a'); }
    else { grantItem('crystal', 2); UI.log('古文書は既知の言霊ばかりだった(魔晶を得た)', '#ffe08a'); }
  }
  else if (k.kind === 'herb') add('herb', 1 + (Math.random() < 0.4));
  else if (k.kind === 'crystal') add('crystal', 1 + (Math.random() < 0.4));
  else if (k.kind === 'oddshroom') eatOddShroom(G.player);
  else if (k.kind === 'mushroom') { const p = G.player; p.mp = Math.min(p.maxMp, p.mp + 18); UI.log('灯り茸を摘んだ — 魔力が少し戻った', '#9fe4ff'); if (Math.random() < 0.15) add('ether', 1); }
  else if (k.kind === 'chest') {
    G.stats.chests++; if (G.floorStats) G.floorStats.chests++;
    if (!G.tutorial && Math.random() < (k.data?.rich ? 0.5 : 0.14)) findWear(3200);
    if (!G.tutorial && Math.random() < (k.data?.rich ? 0.12 : 0.02)) findUnique(k.pos.clone(), 5200);
    const curses = WORDS.filter(w => w.cursed && !G.known.has(w.id));
    if (curses.length && Math.random() < 0.15 && !G.tutorial) {
      const w = curses[Math.floor(Math.random() * curses.length)]; G.known.add(w.id); saveBook();
      setTimeout(() => UI.banner(`呪いの頁『${w.core}』`, `「${w.text}」 — ${w.meaning}`, 7), 1500);
    }
    if (Math.random() < 0.75 || G.tutorial || k.data?.rich) {
      let it = rollItem(G.floor + (k.data?.rich ? 5 : 0));
      // 得意属性の品が出やすい(属性違いの品なら、ときどき引き直す)
      for (let n = 0; n < 2 && G.affinity && it.stats.elem && it.stats.elem !== G.affinity && Math.random() < 0.6; n++) it = rollItem(G.floor + (k.data?.rich ? 5 : 0));
      grantGear(it); saveBook();
      const rr = RARITY[it.rarity];
      UI.banner(`宝箱 — ${it.name}`, `〔${rr.name}〕${SLOTS.find(s => s.id === it.slot).name} ・ ${statLines(it).join(' / ')}  (数字キーで持ち、左クリックで装備)`, 5);
      UI.log(`装備を得た: ${it.name}〔${rr.name}〕`, rr.color);
      G.fx.burst(k.pos.clone().setY(1), parseInt(rr.color.slice(1), 16), 40 + it.rarity * 30, { speed: 4, up: 2 });
      if (it.rarity >= 2) sfx.learn();
    }
    const mats = ['herb', 'crystal', 'bone', 'iron'];
    for (let j = 0; j < 3; j++) add(mats[Math.floor(Math.random() * 4)], 1);
    if (Math.random() < 0.35) add('ether', 1);
    if (Math.random() < (k.data?.rich ? 0.45 : 0.07)) { // 秘伝書: 半分は自分の得意属性
      const els = ['fire', 'ice', 'thunder', 'wind', 'holy', 'void'];
      const el = G.affinity && Math.random() < 0.5 ? G.affinity : els[Math.floor(Math.random() * els.length)];
      add('tome_' + el, 1);
      setTimeout(() => UI.banner(itemName('tome_' + el), `読むとその属性の術の威力が +15% (全三巻)。数字キーで持ち、左クリックで読む`, 5), 900);
    }
    if (Math.random() < 0.25) learnRandomWord();
   } else if (k.kind === 'loot') {
    if(k.data.gear)grantGear(k.data.gear,k.pos);else add(k.data.mat,1);
    if(k.data.mat==='frag'&&G.inv.frag>=3){G.inv.frag-=3;UI.log('古文書の断片が三枚そろった — 一つの頁になった','#ffe08a');learnRandomWord();}
    if(k.data.recovery!==undefined){const r=BOOK.recovery?.[k.data.recovery];if(r)r.count=Math.max(0,r.count-1);saveBook();}
  }
  UI.renderHotbar();
}

// 得意属性(+20%)と秘伝書(属性ごと 第一巻〜終巻、1巻 +15%)
// 第二の得手: 誓った属性と縁の深い効果の言霊は、属性を込めなくても威力 ×1.3
const AFFINITY_SECOND = { fire: ['light'], ice: ['water', 'freeze'], thunder: ['impact'], wind: ['haste'], holy: ['heal', 'ward', 'might'], void: ['might', 'impact'] };
const SECOND_TEXT = { fire: '灯火 — 灯す光が強く、長く燃える', ice: '清流・凍結 — 水で濡らし、凍てつかせる', thunder: '衝撃 — 打ち砕く力が増す', wind: '神速 — 速さが更に増す', holy: '癒息・守護・覇気 — 仲間を支える術が強まる', void: '覇気・衝撃 — 力を滾らせ、叩き潰す' };
const isSecond = spell => !!G.affinity && (AFFINITY_SECOND[G.affinity] || []).some(x => spell.effects?.includes(x));
G.isSecond = isSecond;
function elementBonus(spell) {
  let m = 1;
  if (isSecond(spell)) m *= 1.3;
  if (G.affinity && spell.elements.includes(G.affinity)) m *= 1.2;
  const lv = Math.max(0, ...spell.elements.map(e => (BOOK.mastery || {})[e] || 0));
  return m * (1 + 0.15 * lv);
}
// はじめの属性: その言霊を覚え、初級の攻撃呪文(対象+属性+魔法の名)を魔導書の先頭に書く
const EL_KIND = { fire: '炎', ice: '氷', thunder: '雷', wind: '風', holy: '聖', void: '闇' };
function chooseElement(el) {
  // 得意属性は一度選んだら、その旅の間は変えられない(全滅すると選び直せる)
  if (BOOK.affinityChosen && BOOK.affinityChosen !== el) {
    UI.log(`すでに${EL_INFO[BOOK.affinityChosen].name}に誓いを立てている — 他の属性は選べない`, '#ff9a8a'); sfx.fizzle?.(G.player.pos); return;
  }
  if (BOOK.affinityChosen === el) return;
  if (G.affinity === el) {
    BOOK.affinityChosen = el; saveBook();
    vowCeremony(el);
    return;
  }
  const prev = G.affinity;
  if (prev && BOOK.starterGrant === prev) { G.known.delete(prev); BOOK.known = [...G.known]; }
  if (prev) { const base = expandChant(`汝に ${WORD_BY_ID[prev].core}`), auto = base + ' ' + callName(compile(base, null)); BOOK.spells = BOOK.spells.filter(s => !(s.name === `初級${EL_KIND[prev]}魔術` && (s.auto || s.text === auto))); }
  BOOK.starterGrant = null;
  setupStarter(el);
  try { localStorage.setItem('arcana_el', el); } catch {}
  renderBookPages();
  BOOK.affinityChosen = el; saveBook();
  vowCeremony(el);
}
// 誓約の儀: 画面が属性の色に染まり、魔法陣が回り、誓いの言葉が浮かぶ
function vowCeremony(el) {
  const info = EL_INFO[el], lore = EL_LORE[el], col = '#' + new THREE.Color(info.color).getHexString();
  const fx = $('vowFx');
  fx.style.setProperty('--elc', col);
  fx.querySelector('.vline').textContent = `「${lore.vow}」`;
  fx.classList.add('hidden'); void fx.offsetWidth; fx.classList.remove('hidden');
  clearTimeout(vowCeremony.t); vowCeremony.t = setTimeout(() => fx.classList.add('hidden'), 3700);
  sfx.meiei?.(); G.shake = Math.max(G.shake || 0, 0.6); G.slowmo = 0.6;
  const at = G.player.pos.clone().setY(1.2);
  G.fx.burst(at, info.color, 160, { speed: 6, up: 3 });
  vowPillar(G.player.pos.clone(), info.color);
  setTimeout(() => G.fx.burst(at, 0xfff2c0, 80, { speed: 9, up: 1 }), 400);
  UI.log(`${info.name}(${info.sub})に誓いを立てた — ${info.sub}の術の威力 +20%、得手の術(${SECOND_TEXT[el].split(' — ')[0]})の威力 +30%。魔導書の最初の頁に初級の攻撃呪文が記された。この旅の間、誓いは解けない`, col);
  $('elCard').classList.add('sworn'); elCardKey = null;
}
// 誓いの光: 足元から属性の色の輪が次々に昇り、粒が渦を巻いて舞い上がる
function vowPillar(at, color) {
  let t = 0, next = 0;
  G.vfx.push({ obj: null, update: dt => {
    t += dt; next -= dt;
    if (next <= 0 && t < 1.6) {
      next = 0.16;
      const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 5, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.x = Math.PI / 2; m.position.set(at.x, at.y + 0.1, at.z); G.scene.add(m);
      let k = 0; G.vfx.push({ obj: m, update: d => { k += d; m.position.y += d * 2.6; m.scale.setScalar(1.5 - k * 0.5); m.material.opacity = 0.9 * (1 - k / 1.2); if (k >= 1.2) m.material.dispose(); return k < 1.2; } });
    }
    for (let i = 0; i < 4; i++) { const a = t * 7 + i * 1.57, r = 1.3 - Math.min(1, t / 2) * 0.6; G.particles.emit(new THREE.Vector3(at.x + Math.cos(a) * r, at.y + 0.1, at.z + Math.sin(a) * r), new THREE.Vector3(-Math.sin(a) * 1.5, 3.2, Math.cos(a) * 1.5), i % 2 ? color : 0xfff2c0, 0.22, 1.1); }
    return t < 2.2;
  } });
}
// 祭壇の前に立つと、その属性の札を出す
// 属性を選ぶ画面(マルチプレイの始まりに出す)。六つの理の説明を並べ、選んだ属性を返す
const askElement = () => pickElement({ info: EL_INFO, lore: EL_LORE, second: SECOND_TEXT });   // 画面は elpick.js
let elCardKey = null;
function showElCard(el) {
  const card = $('elCard');
  const key = el ? el + ':' + (BOOK.affinityChosen || '') : null;
  if (key === elCardKey) return;
  elCardKey = key;
  if (!el) { card.classList.add('hidden'); return; }
  const info = EL_INFO[el], lore = EL_LORE[el], sp = SPIRITS[lore.spirit];
  const weak = Object.values(ENEMY_TYPES).filter(t => t.weak?.includes(el)).map(t => t.name);
  const resist = Object.values(ENEMY_TYPES).filter(t => t.resist?.includes(el)).map(t => t.name);
  const sworn = BOOK.affinityChosen === el, other = BOOK.affinityChosen && !sworn;
  card.style.setProperty('--elc', '#' + new THREE.Color(info.color).getHexString());
  card.classList.toggle('sworn', sworn);
  card.innerHTML = `<div class="eln"><ruby>${info.name}<rt>${lore.ruby}</rt></ruby></div><div class="els">${info.sub} の 理</div>
    <div class="motto">「${lore.motto}」</div>
    <dl><dt>威力</dt><dd class="pw"><i style="width:${Math.round(lore.power * 1.4)}px"></i>${lore.power}</dd>
    <dt>撃てば</dt><dd>${lore.onHit}</dd>
    <dt>性質</dt><dd>${lore.trait}</dd>
    <dt>得手の術</dt><dd>${SECOND_TEXT[el]}(威力 +30%)</dd>
    <dt>弱き者</dt><dd>${weak.join('・') || '—'}</dd>
    <dt>効かぬ者</dt><dd>${resist.join('・') || '—'}</dd>
    <dt>宿る精霊</dt><dd>${sp ? `${sp.name} — ${sp.lore}` : '—'}</dd></dl>
    <div class="foot">${sworn ? '— 汝はこの理に誓いを立てた —' : other ? `すでに${EL_INFO[BOOK.affinityChosen].name}に誓いを立てている` : `${keyOf('interact')} で誓いを立てる(この旅の間、解けない)`}</div>`;
  card.classList.remove('hidden');
}
// 誓いの術: 属性ごとに一つ。言霊を授け、呪文を魔導書に書く。別の属性へ選び直した時は、前の術を返す
const ART_NAME = { flamejet: '火炎放射', frostwave: '凍波', sparkstep: '雷歩', gust: '突風', sanctum: '聖域', blink: '影渡り' };
function grantSwornArt(el) {
  const art = SWORN_ART[el]; if (!art) return;
  const prev = BOOK.artGrant;
  if (prev && prev !== art) {
    G.known.delete(prev); BOOK.understood = (BOOK.understood || []).filter(id => id !== prev);
    BOOK.spells = BOOK.spells.filter(s => !(s.art && compile(s.text, null).effects.includes(prev)));
  }
  if (!G.known.has(art)) { G.known.add(art); BOOK.artGrant = art; }
  else if (WORD_BY_ID[art].sworn) BOOK.artGrant = art;
  BOOK.known = [...G.known];
  BOOK.understood ||= []; if (!BOOK.understood.includes(art)) BOOK.understood.push(art);
  if (!BOOK.spells.some(s => compile(s.text, null).effects.includes(art))) {
    const base = expandChant('我に ' + WORD_BY_ID[art].core);
    BOOK.spells.splice(Math.min(1, BOOK.spells.length), 0, { name: ART_NAME[art], art: true, auto: true, text: base + ' ' + callName(compile(base, null)), memo: '誓いの術。' + WORD_BY_ID[art].meaning });
  }
}
function setupStarter(el) {
  G.affinity = el;
  if (!G.known.has(el)) { G.known.add(el); BOOK.known = [...G.known]; BOOK.starterGrant = el; } // 祭壇で授かった言霊(選び直すと返す)
  BOOK.understood ||= []; if (!BOOK.understood.includes(el)) BOOK.understood.push(el);
  grantSwornArt(el);
  const name = `初級${EL_KIND[el]}魔術`;
  G.starterSpell = name;
  if (!BOOK.spells.some(s => s.name === name)) {
    const base = expandChant(`汝に ${WORD_BY_ID[el].core}`);
    BOOK.spells.unshift({ name, auto: true, text: base + ' ' + callName(compile(base, null)), memo: '狙った敵を直接撃つ、最初の攻撃。出し方(穿槍など)を足すと中級になる。' });
  }
  saveBook();
}
// 持てる数: 道具・素材・古文書・秘伝書は、それぞれ5個まで
const INV_CAP = 5;
const invFull = k => carryRoom(G.inv,k)<=0;
// 道具を足す。持ちきれない分は足さずに、足せた数を返す
function invAdd(k, n = 1, quiet = false) {
  const got=addCarry(G.inv,k,n);
  if (got < n && !quiet) UI.log(`${itemName(k)}はもう持てない(6枠・1種類 ${INV_CAP}個まで)`, '#a8a090');
  return got;
}
function spillItem(k,pos=G.player.pos,gear=null){const id=`D${G.netId||0}_${lootCounter++}`,p=findFreePosition(pos,.15,{maxDistance:8})||pos.clone();addPickup(id,'loot',p,{mat:k,gear,noPick:performance.now()+2500});G.net?.send({t:'loot',items:[{id,mat:k,gear,x:p.x,y:p.y,z:p.z}]});}
function grantItem(k,n=1,pos=G.player.pos){const got=invAdd(k,n,true);for(let i=got;i<n;i++)spillItem(k,pos);return got;}
function grantGear(it,pos=G.player.pos){if(invAdd(gearKey(it),1,true)){BOOK.bag.push(it);UI.renderHotbar();return true;}spillItem(gearKey(it),pos,it);return false;}
G.invAdd = invAdd;
G.wordCore = id => WORD_BY_ID[id]?.core || '';
// まだ覚えていない言霊から一つ選ぶ(属性と形を出やすく)。古文書に記される言霊もここで決まる
const SHADOW_ARTS = ['blink', 'survey'];   // 影の術(転移・探知)
function pickUnknownWord(exclude = []) {
  const unknown = WORDS.filter(w => !G.known.has(w.id) && !w.cursed && !w.sworn && !exclude.includes(w.id));
  if (!unknown.length) return null;
  // 出やすさ = 覚えてほしい順(WORD_PRIORITY) × 得意属性との相性 × 仲間とかぶらない方が出やすい
  //   仲間の誰かが既に持っている言霊は出にくく、仲間の全員が持っている言霊は(他に候補があるかぎり)出さない
  const mates = G.mages.filter(m => m !== G.player && m.knownWords);
  const share = w => { if (!mates.length) return 1; const n = mates.filter(m => m.knownWords.has(w.id)).length; return n === mates.length ? 0 : n ? 0.4 : 1; };
  const weight = w => (WORD_PRIORITY[w.id] ?? 1) * (G.affinity && AFFINITY_SECOND[G.affinity]?.includes(w.id) ? 3 : 1) * (G.affinity === 'void' && SHADOW_ARTS.includes(w.id) ? 5 : 1) * share(w);
  if (!unknown.some(w => weight(w) > 0)) { const any = unknown[Math.floor(Math.random() * unknown.length)]; return any; }      // 仲間が全部持っている物しか残っていない時
  let r = Math.random() * unknown.reduce((s, w) => s + weight(w), 0), pick = unknown[0];
  for (const w of unknown) { r -= weight(w); if (r <= 0) { pick = w; break; } }
  return pick;
}
function learnRandomWord() {
  const pick = pickUnknownWord();
  if (!pick) { grantItem('crystal', 2); UI.log('古文書は既知の言霊ばかりだった(魔晶を得た)', '#ffe08a'); return; }
  learnWord(pick);
}
function learnWord(pick) {
  G.known.add(pick.id); BOOK.known = [...G.known];
  if (SHADOW_ARTS.includes(pick.id)) { ensureUtilityBook(); UI.log('影の術を覚えた — 呪文は魔導書に書き足された (Tab)', '#b89aff'); }
  saveBook();
  sfx.learn();
  if (SPIRITS[pick.id]) UI.banner(`精霊と出会った — ${SPIRITS[pick.id].name}`, `真名の言霊『${pick.core}』(${pick.ruby}) を得た。Tab で開く本の「精霊」の頁に、精霊と縁の説明がある`, 6);
  else UI.banner(`新たな言霊『${pick.core}』`, `「${pick.text}」 ${pick.ruby} ・ ${CAT[pick.cat]} — ${pick.hint}`, 6);
  UI.log(`言霊『${pick.text}』を魔導書に記した。真意は唱えて確かめよ (Tab)`, '#ffe08a');
  UI.renderHotbar();
}

// fromNet = 部屋の主から「倒れた」と知らされた時(客の側)。記録・討伐数・鍵頁・踏破は全員で数え、戦利品は部屋の主だけが落とす
// 着る物(精霊の子の衣)を一つ拾う。他の装備と同じく、その旅の間だけの持ち物(全滅すると失う)
function findWear(delay = 0) {
  const w = grantRandomWear(); if (!w) return;
  setTimeout(() => {
    sfx.learn?.();
    UI.banner(`衣を拾った — ${w.name}`, `${w.slot}に着けられる。Esc →「姿を変える」で身に着ける`, 5);
    UI.log(`精霊の子の衣『${w.name}』(${w.slot})を見つけた`, '#e8c8ff');
  }, delay);
}
G.onEnemyKilled = (e, fromNet = false) => {
  { // 魔物の記録: 初めて討った魔物の由来を魔導書に記す
    const key = e.type === 'dragon' ? 'g_' + (e.dragon?.element || 'fire') : e.type;
    BOOK.seen ||= {};
    if (!BOOK.seen[key] && !G.noSave) { BOOK.seen[key] = true; saveBook(); UI.log(`魔導書に『${(e.name || '').replace(/[【】]/g, '')}』の由来が記された (Tab → 魔物の記録)`, '#d8c48a'); }
  }
  if (G.stats) G.stats.kills++;
  if (G.floorStats) { G.floorStats.kills++; if (e.boss) G.floorStats.boss = true; }
  if (e.boss) G.achieve('BOSS');
  if (e.boss && !G.noSave) findWear(4200);
  if (e.boss && !G.noSave && Math.random() < 0.34) findUnique(e.pos.clone(), 6400);
  // ユニークな効果: 自分が倒した敵が爆発する / 倒すたびに生命が戻る
  if (e.lastSrc === G.player && !e.boss) {
    if (G.uq?.has('boom')) { G.fx.bigImpact(e.pos.clone().setY((e.pos.y || 0) + 1), 0xff6a20, 1.2, ['fire']); for (const o of G.enemies) if (o !== e && o.alive && o.pos.distanceTo(e.pos) < 4) G.fx.damage(o, 40, [], G.player, { echo: true }); }
    if (G.uq?.has('leech')) G.fx.heal(G.player, 10, G.player);
  }
  if (e.lastSrc === G.player && G.player.lastSpell) { questEvent('kill', { spell: G.player.lastSpell }); profUps(gainProf(G.player.lastSpell.elements, e.boss ? 20 : 5)); saveBook(); }
  // 大目標: 第3・6・9層の主は「封印の鍵頁」を落とし、第10層の番人を倒すと迷宮踏破
  if (e.boss && G.run && !G.run.done) {
    if (e.final) {
      if (G.run.keys >= 3) setTimeout(victory, 1200);
      else UI.banner('番人は倒れた — だが封印は解けない', `封印の鍵頁が足りない (${G.run.keys}/3)。転移陣の先で、主たちから集めよ`, 6);
    } else if (G.floor % 3 === 0 && G.run.keys < 3) {
      G.run.keys++; sfx.learn();
      UI.banner(`封印の鍵頁 (${G.run.keys}/3)`, G.run.keys >= 3 ? `すべて揃った。第${FINAL_FLOOR}層の書庫の番人のもとへ` : '主の亡骸から、封印を解く頁を得た', 6);
    }
  }
  if (fromNet) return;
  const drops = e.T.drops;
  const items = [];
  const n = 1 + (Math.random() < 0.5) + (e.boss ? 3 : 0);
  for (let i = 0; i < n; i++) items.push(drops[Math.floor(Math.random() * drops.length)]);
  if (Math.random() < (e.boss ? 1 : 0.08)) items.push('scroll');
  // 言霊の欠片: 守護者は三つ、精鋭は一つ、ほかはごく稀に落とす
  if (e.type === 'dragon') items.push('shard', 'shard', 'shard'); else if (e.elite || e.boss) items.push('shard'); else if (Math.random() < 0.03) items.push('shard');
  const list = items.map(mat => ({ id: `L${G.netId || 0}_${lootCounter++}`, mat, x: e.pos.x + rand(-0.8, 0.8), y:e.pos.y, z: e.pos.z + rand(-0.8, 0.8) }));
  if(e.boss||e.elite||G.floorStats?.kills===3||G.floorStats?.kills%6===0||Math.random()<.16){const gear=rollItem(G.floor);list.push({id:`L${G.netId||0}_${lootCounter++}`,mat:gearKey(gear),gear,x:e.pos.x,y:e.pos.y,z:e.pos.z});}
  for (const l of list) addPickup(l.id, 'loot', new THREE.Vector3(l.x, l.y??e.pos.y, l.z), { mat: l.mat,gear:l.gear });
  G.net?.send({ t: 'loot', items: list });
};

// ---------- 詠唱 ----------
let typed = null;          // 文字詠唱/スロット詠唱の進行
let voiceText = '';        // 音声詠唱の途中経過
let chantBuf = '';         // 間を挟んで唱えた分をつなげたもの
let pttHeld = false, commitAt = 0, lastSpeech = 0;
const joinChant = t => (chantBuf ? chantBuf + ' ' : '') + (t || '').trim();
// 魔法の名(ファイア・ヒーリング…)を唱えたら、それが詠唱の終わり: V を離すのを待たずにその場で判定して放つ
let consumed = false; // 途中経過で放った区切りの、後から届く確定結果を捨てる
function callFinished(full) {
  if (!endsWithCall(full)) return false;
  const sp = compile(heard(full), G.known);
  return sp.valid && sp.calledByName;
}
// ただの会話か、詠唱か: 覚えた言霊が「二種類以上」聞こえた / 長い一致(詠唱文の一節など)がある / 魔法の名で終わった
// のどれかで詠唱とみなす。「やり」「はき」のような短い語が一つ混じっただけでは足も遅くしない
function looksLikeChant(text) {
  const toks = tokenize(heard(text), G.known).filter(t => t.known);
  if (!toks.length) return false;
  if (new Set(toks.map(t => t.id)).size >= 2) return true;
  if (toks.some(t => t.len >= 4)) return true;
  return endsWithCall(text);
}
// つなげた詠唱を確定して術にする
let lastVoiceCast = 0;
function commitChant() {
  commitAt = 0;
  const raw = correctChant(chantBuf.trim()); chantBuf = '';
  if (!raw) return;
  if (performance.now() - lastVoiceCast < 1500) return; // 直前に放ったばかり(同じ声の確定が二度届いた)
  const a = heard(raw);
  if (!looksLikeChant(raw)) { if (isContinuous()) clearChant(); return; }
  voiceText = raw;
  lastVoiceCast = performance.now();
  finishChant(a, raw);
}
let voiceDeadline = 0;
let netChantT = 0;
let camY = null;
const JUMP_COST = 12; // 跳躍1回のスタミナ

function setupVoice() {
  initReading();
  if (!voiceSupported) { UI.micState('🎙 音声認識非対応 — アプリ版をご利用ください'); return; }
  initVoice({
    // 間を挟んでも詠唱は続く: 区切りごとの認識結果をつなげ、V を離すまで(常時詠唱は無音が続くまで)待つ
    interim: text => {
      if (!G.player.alive || G.player.downed || consumed) return;
      lastSpeech = performance.now();
      text = withReading(text);
      const full = correctChant(joinChant(text));
      if (!looksLikeChant(full)) return; // 覚えた言霊が聞こえるまでは詠唱を始めない(ただの会話は無視)
      if (callFinished(full)) { chantBuf = full; consumed = true; commitChant(); return; }
      beginOrUpdateChant(full);
    },
    final: raw => {
      if (consumed) { consumed = false; return; } // すでに途中経過で放った分
      raw = raw.flatMap(r => { const rd = toReading(r); return rd && rd !== r ? [r, rd] : [r]; }).map(correctChant); // 読みに直した候補も足す
      // 候補のうち、これまでの分とつなげて言霊を最も多く含むものを採用
      let bi = 0, bc = -1;
      raw.forEach((r, i) => { const j = joinChant(r), a = heard(j); const c = tokenize(a, G.known).filter(t => t.known).length * 10 - chantGaps(j, tokenize(a).map(t => t.id)).length; if (c > bc) { bc = c; bi = i; } });
      chantBuf = joinChant(raw[bi]); lastSpeech = performance.now();
      if (!looksLikeChant(chantBuf)) { chantBuf = ''; return; } // 会話だけなら詠唱にしない
      if ((pttHeld || isContinuous()) && !callFinished(chantBuf)) { if (G.player.alive && !G.player.downed) beginOrUpdateChant(chantBuf); return; }
      commitChant();
    },
    // AI 音声認識(アプリ版)の準備状況
    ai: s => {
      if (s.startsWith('loading:')) { const [, p, mb] = s.split(':'); if (!G.player?.chanting) UI.micState('🎙 V 長押しで詠唱 — AI音声認識をダウンロード中 ' + p + '% (約' + mb + 'MB・初回のみ)'); }
      else if (s.startsWith('ready')) { UI.log('AI音声認識の準備ができた — 詠唱文をそのまま読み上げれば聞き取れる', '#9fe4ff'); UI.micState('🎙 V 長押しで詠唱 / C で常時詠唱 (AI認識)'); }
      else if (s === 'failed') UI.log('AI音声認識を使えなかったので、標準の音声認識で続ける', '#a39a86');
      else if (s === 'timeout') UI.log('聞き取りに時間がかかりすぎたので打ち切った — もう一度唱えよ', '#ffb785');
      else if (s === 'retry-cpu') UI.log('AI音声認識が応答しないので、軽い方式で入れ直す(その間は標準の音声認識で聞き取る)', '#ffb785');
    },
    state: s => {
      if (s === 'listening') UI.micState(isContinuous() ? '🔴 常時詠唱中 (C で解除)' : '🔴 聴取中… 唱えよ');
      else if (s === 'loading') UI.micState('🎙 音声認識を準備中…')
      else if (s === 'thinking') UI.micState('🎙 聞き取り中…')
      else if (s === 'fallback') { UI.micState('🎙 このブラウザ用の音声認識に切り替えた — V 長押しで詠唱'); UI.log('このブラウザでは標準の音声認識が使えないため、端末の中で動く音声認識に切り替えた(初回は準備に少し時間がかかる)', '#9fe4ff'); }
      else if (s.startsWith('error')) {
        const code = s.slice(6);
        const MSG = {
          'not-allowed': 'マイクがブロックされています。アドレスバー左の🔒(サイト情報)→「マイク」を許可して、ページを再読み込みしてください',
          'service-not-allowed': 'マイクがブロックされています。アドレスバー左の🔒→「マイク」を許可して再読み込みしてください',
          'audio-capture': 'マイクが見つかりません。マイクの接続と、Windows の「マイクへのアクセス」設定を確認してください',
          'network': '音声認識サーバーにつながりません(Chrome の音声認識はネット接続が必要です)',
          'no-speech': '声が聞こえませんでした。もう一度 V を押しながら唱えてください',
        };
        UI.micState('🎙 ' + (MSG[code] || 'マイクエラー: ' + code));
      }
      else UI.micState('🎙 V 長押しで詠唱 / C で常時詠唱');
    },
  });
  UI.micState('🎙 V 長押しで詠唱 / C で常時詠唱');
  if (G.micOk === false) { UI.micState('🎙 マイクが使えません(' + G.micError + ')。アドレスバー左の🔒→「マイク」を許可して再読み込み — マイクの設定を確認してください');  }
}

function beginOrUpdateChant(text) {
  if (!canCast()) return;
  const p = G.player;
  if (!p.chanting) { p.chantInterrupted = false; sfx.chantStart(); if (G.held !== 'grimoire') setHeld('grimoire'); }
  const n = tokenize(heard(text), G.known).filter(t => t.known).length;
  p.chantKnown = n; // 覚えた言霊が聞き取れた数(0の間は足を遅くしない)
  // 唱え切った節の数 = 魔法陣の段。段が上がるたびに陣が広がり、和音が鳴る
  const ids = tokenize(heard(text), G.known).filter(t => t.known).map(t => t.id);
  { const s = sealFor(ids, p.pos); if (s) { applyDig([s.cell]); sfx.learn?.(); } } // 封印の扉に刻まれた言霊を唱えた
  // 和音は、その言霊の詠唱文を唱え切った時だけ鳴る(途中で間違えたのに鳴って分からなくなるのを防ぐ)
  const grace = G.eqT?.grace || 0;
  const stage = lenientChant() ? ids.length : new Set(ids).size === 0 ? 0 : [...new Set(ids)].filter(id => chantCoverage(text, [id], grace) >= 0.8).length;
  if (stage > (p.chantStage || 0)) {
    sfx.stage(stage); VM.kick();
    G.fx.burst(p.pos.clone().setY(0.2), 0xffd27a, 18 + stage * 10, { speed: 2 + stage, up: 0.5 });
  }
  p.chantStage = stage;
  p.chantTier = compile(heard(text), G.known).tier || 0;
  p.setChant(text, Math.max(1, stage + 1));
  UI.setChantDisplay(text);
  G.hearChant(p, heard(text));
  if (G.net && G.time - netChantT > 0.15) { netChantT = G.time; G.net.send({ t: 'chant', id: p.id, text, n }); }
}

function clearChant() {
  G.player.chantStage = 0; G.player.chantKnown = 0;
  G.player.setChant(''); UI.setChantDisplay('');
  G.net?.send({ t: 'chant', id: G.player.id, text: '', n: 0 });
}

function fizzle(msg) {
  sfx.fizzle(G.player.pos);
  UI.floatText(G.player.pos.clone().add(new THREE.Vector3(-Math.sin(G.player.yaw) * 2, -0.5, -Math.cos(G.player.yaw) * 2)), msg, '#ff9a8a');
  UI.log('✖ ' + msg, '#ff9a8a');
}

G.debugNextFloor = () => nextFloor(); // 確かめる用: 次の層へ
G.debugChant = t => finishChant(t, t); // 確かめる用: 文字で術を放つ
// 聞き違いの救い: 術にならなかった時、魔導書の呪文の中から、聞こえた言葉にいちばん近いものを探す。
//   言霊が半分以上合っているか、音が十分似ていて、他の呪文とはっきり差がある時だけ、その呪文として放つ(威力は1割減)
function rescueChant(raw, text) {
  const heard = new Set(tokenize(text || raw || '', G.known).filter(t => t.known).map(t => t.id));
  let best = null, second = 0;
  for (const sp of BOOK.spells || []) {
    const c = compile(sp.text, G.known); if (!c.valid || !c.words.length) continue;
    const need = [...new Set(c.words)], hit = need.filter(id => heard.has(id)).length;
    const score = Math.max(hit / need.length, chantSim(raw, sp.text) * 0.95, sp.call ? chantSim(raw, sp.call) * 0.9 : 0);
    if (!best || score > best.score) { second = best ? best.score : second; best = { score, text: sp.text, name: sp.name, hit }; } else second = Math.max(second, score);
  }
  if (!best || best.score < 0.5 || best.score - second < 0.08) return null;
  return best;
}
function finishChant(text, raw = text, rescued = null) {
  if (!canCast()) { clearChant(); return; }
  if (G.player.status.drinking) { clearChant(); fizzle('薬を飲んでいる最中だ'); return; }
  const p = G.player;
  const spell = compile(text, G.known);
  const interrupted = p.chantInterrupted;
  p.chantInterrupted = false;
  UI.setChantDisplay(raw);
  setTimeout(() => { if (!p.chanting) UI.setChantDisplay(''); }, 1600);
  clearChantSoft();
  if (!p.alive || p.downed) return;
  if (interrupted) { p.mp = Math.max(0, p.mp - spell.cost * 0.1); fizzle('詠唱が乱され、術が霧散した'); return; }
  if (!spell.valid) {
    const r = rescueChant(raw, text);
    if (r) return finishChant(r.text, r.text, r);
    fizzle((spell.error || '術にならなかった') + (raw && raw.trim() ? ` — 聞こえた言葉:「${raw.trim().slice(0, 24)}」` : ''));
    questEvent('miss'); return;                // 聞き違いで精霊が拗ねる(力が弱まる)罰は、やめた
  }
  if (rescued) { spell.power *= 0.9; UI.floatText(p.pos.clone().add(new THREE.Vector3(0, 0.45, 0)), `聞き取りが乱れた —『${rescued.name}』として放つ`, '#b8c4d8'); }
  if (spell.elements.length && inSanctuary(p.pos)) { fizzle('聖域の中では攻撃の術は放てない'); return; }
  equipSpell(spell);
  // 名詠: 文章として成立していれば威力が上がる
  const el = G.nameCastHit ? { bonus: 0 } : eloquence(raw, G.known, lenientChant()); // 名だけの詠唱は名詠にならない
  if (el.bonus) {
    spell.power *= 1 + el.bonus;
    UI.floatText(p.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), `${el.tier}! 威力+${Math.round(el.bonus * 100)}%`, el.tier === '名詠' ? '#ffd76a' : '#cfe0ff');
    UI.log(`${el.tier} — ${el.marks.join('・')} が揃った(威力+${Math.round(el.bonus * 100)}%)`, el.tier === '名詠' ? '#ffd76a' : '#cfe0ff');
    G.stats.eloquent = (G.stats.eloquent || 0) + (el.tier === '名詠' ? 1 : 0);
    if (el.tier === '名詠') { // 名詠が決まった瞬間: 一瞬時が緩み、画面が揺れ、金の閃光
      G.slowmo = 0.35; G.shake = 0.5; sfx.meiei();
      const fx = $('meieiFx'); fx.classList.remove('on'); void fx.offsetWidth; fx.classList.add('on');
      G.fx.burst(p.pos.clone().setY(1.2), 0xffd76a, 120, { speed: 7, up: 2 });
    }
  }
  // 短縮魔術: 詠唱文を省くほど威力が下がる(核の言葉だけでも発動はする)
  const cov = lenientChant() ? 1 : chantCoverage(raw, spell.words, G.eqT?.grace || 0);
  const pen = shortChantPenalty(spell);
  if (G.nameCastHit) { G.nameCastHit = null; G.achieve('NAME_CAST'); UI.floatText(p.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), '詠唱省略 — 熟練の業', '#9fe4ff'); }
  else if (cov < 0.97 && pen > 0) {
    const m = 1 - (1 - (0.5 + 0.5 * cov)) * pen; /* 省いても威力は半分までしか落ちない */
    spell.power *= m;
    UI.floatText(p.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), `短縮魔術 威力${Math.round(m * 100)}%`, '#b8c4d8');
  }
  if (p.maxMp < spell.cost) { fizzle(`魔力の器が足りない — この術には上限 ${spell.cost} が要る(今 ${Math.round(p.maxMp)}。装備で広げられる)`); return; }
  if (G.uq?.has('dice') && spell.elements.length) {
    const roll = [0.5, 0.5, 0.75, 1, 1, 1.5, 2, 3][Math.floor(Math.random() * 8)]; spell.power *= roll;
    UI.floatText(p.pos.clone().add(new THREE.Vector3(0, 0.75, 0)), roll >= 2 ? `大当たり ×${roll}!` : roll < 1 ? `はずれ ×${roll}` : `×${roll}`, roll >= 2 ? '#ffd76a' : roll < 1 ? '#a8a090' : '#e8dcc0');
    if (roll >= 3) { G.shake = Math.max(G.shake || 0, 0.5); sfx.meiei?.(); }
  }
  if (p.mp < spell.cost) { fizzle(`魔力が足りない (必要${spell.cost}。あと${Math.ceil((spell.cost - p.mp) / 3)}秒ほど)`); return; }
  if (spell.title) UI.floatText(p.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), spell.title + (p.status.might && spell.elements.length ? ' (覇気×1.3)' : ''), p.status.might && spell.elements.length ? '#ffc070' : '#ffe8b0');
  spell.breakPower = spell.power; // 壁を砕く力は弱められない
  BOOK.bonds ||= {};
  spell.power *= bondMul(spell, BOOK.bonds) * mutatePower(G.mut, spell) * (p.status.might ? 1.3 : 1); // 覇気: 威力アップ
  spell.power *= elementBonus(spell) * profPower(spell);
  // 逆境: 状態異常を背負っているほど強くなる
  if (spell.spite) {
    const bad = badStatusCount(p), m = bad >= 2 ? 1.9 : bad ? 1.6 : 0.8;
    spell.power *= m;
    UI.floatText(p.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), bad ? `逆境 — 威力×${m}` : '逆境 — 背負うものが無い(威力×0.8)', bad ? '#ff8a6a' : '#b8c4d8');
    if (bad >= 2) { G.shake = Math.max(G.shake || 0, 0.25); G.fx.burst(p.pos.clone().setY(1.1), 0xff5a3a, 50, { speed: 4, up: 2 }); }
  }
  const chorus = findChorus(p, spell);
  if (chorus) {
    spell.power *= 2.2; spell.breakPower = (spell.breakPower || spell.power) * 2;
    UI.banner('合唱詠唱', `${chorus.name}と声が重なった — 威力が跳ね上がる`, 3);
    G.slowmo = 0.3; G.shake = 0.6; sfx.meiei?.();
    const fx = $('meieiFx'); fx.classList.remove('on'); void fx.offsetWidth; fx.classList.add('on');
  }
  p.lastChorus = !!chorus;
  if (castSpell(p, spell, playerAim(spell))) {
    p.lastSpell = spell;
    if (G.uq?.has('echo') && Math.random() < 0.25) setTimeout(() => { if (!p.alive || p.downed) return; const mp = p.mp; if (castSpell(p, spell, playerAim(spell))) { p.mp = mp; UI.floatText(p.pos.clone().add(new THREE.Vector3(0, 0.75, 0)), '二度咲き!', '#ffb0e0'); } }, 420);
    if (spell.blood) { const cost = p.maxHp * 0.12; p.hp = Math.max(1, p.hp - cost); UI.floatText(p.pos, '-' + Math.round(cost) + ' 血誓', '#ff4040'); UI.hurt?.(cost); }
    questEvent('cast', { spell, tier: el.tier });
    onPlayerCast(spell);
    roomCast(spell, p.pos);
    forgive(spiritsOf(spell));
    for (const u of gainBond(spell, BOOK.bonds, el.tier, G.mut?.id === 'feast' ? 2 : 1)) {
      const sp = SPIRITS[u.id];
      UI.banner(`${sp.name}との縁が深まった`, `縁: ${BOND_NAMES[u.level]} — ${sp.name}の力を借りる術が強くなる`, 4);
      sfx.learn();
    }
    profUps(gainProf(spell.elements, [3, 6, 12][spell.tier || 0]));
    G.achieve('FIRST_SPELL'); if (el.tier === '名詠') G.achieve('EUPHONY'); if (chorus) G.achieve('CHORUS');
    saveBook();
  }
}
// 背負っている状態異常の数(逆境の言霊で使う)。瀕死も一つに数える
const BAD_STATUS = ['slow', 'poison', 'cursed', 'burn', 'bound', 'frozen', 'stun', 'high', 'low', 'robot', 'echo', 'tiny', 'giant', 'invert', 'drunk', 'orb'];
function badStatusCount(m) {
  let n = BAD_STATUS.filter(k => m.status?.[k]).length;
  if (m.hp < m.maxHp * 0.3) n++;
  return n;
}
// 熟練のレベルが上がった
function profUps(ups) {
  for (const u of ups) if (u.lv >= 5) G.achieve('MASTER');
  ups.forEach((u, i) => setTimeout(() => {
    UI.banner(u.title, u.text, 5); sfx.learn();
    G.fx.burst(G.player.pos.clone().setY(1.2), 0x9fe4ff, 60, { speed: 4, up: 2 });
    UI.log(`${u.title} — ${u.text}`, '#9fe4ff');
  }, 600 + i * 2500));
}
function clearChantSoft() { G.player.setChant(''); G.net?.send({ t: 'chant', id: G.player.id, text: '', n: 0 }); }

function playerAim(spell) {
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  const origin = camera.position.clone().add(fwd.clone().multiplyScalar(0.6)).add(new THREE.Vector3(0, -0.15, 0));
  const point = raycastGrid(camera.position.clone(), fwd, 32);
  const targetId = spell.form === 'enchant' ? (spell.target === 'enemy' ? G.fx.pickDirectTarget(G.player, spell, fwd) : spell.target === 'ally' ? G.fx.pickDirectTarget(G.player, { ...spell, elements: [] }, fwd) : G.player.id) : spell.form ? null : G.fx.pickDirectTarget(G.player, spell, fwd);
  return { origin: origin.toArray(), dir: fwd.toArray(), point: point.toArray(), targetId };
}

G.castSpell = function castSpell(m, spell, aim) {
  const error=utilityError(m,spell);if(error){if(m===G.player)UI.log(error,'#d3b5e3');return false;}
  if (m.mp < spell.cost) return false;
  m.mp -= spell.cost * costMult(m); // 書庫・写本室では、魔力の消費が減る
  G.fx.cast(m, spell, aim);
  noteCast(m.id, spell.words);
  G.net?.send({ t: 'cast', id: m.id, words: spell.words, aim, chorus: m === G.player && !!m.lastChorus });
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

// ---------- 手に持った物の名札 ----------
// 道具を手に持つと、画面の下に名前が出る。その種類を初めて持った時だけ、何ができるか・どう使うかも添える
const HELD_HOW = {
  ether: () => `${keyOf('use')} で飲む。数秒かけて魔力が戻る。詠唱の合間に`,
  amulet: () => `${keyOf('use')} で掲げる。身を守る障壁を張る。囲まれた時や、守護者の大技の前に`,
  flash: () => `${keyOf('use')} で投げる。周りの魔物が怯み、振りかぶりも止まる。逃げる時や詠唱の時間稼ぎに`,
  lantern: () => `${keyOf('use')} で灯す。この層の地図がすべて照らされる`,
  scroll: () => `${keyOf('use')} で読む。新しい言霊を一つ覚える(読んだ本人だけ)`,
  tome: () => `${keyOf('use')} で読む。その属性の術の威力が上がる(全三巻)`,
  gear: () => `${keyOf('use')} で身に着ける。効果は Tab の所持品で確かめられる`,
  mat: () => 'そのままでは使えない素材。Tab の所持品で、他の素材と調合する',
};
const heldKind = k => k.startsWith('gear_') ? 'gear' : k.startsWith('tome_') ? 'tome' : k === 'scroll' || k.startsWith('scroll_') ? 'scroll' : USABLE.includes(k) ? k : 'mat';
function heldDesc(k) { const kind = heldKind(k); return kind === 'gear' ? '装備品' : kind === 'tome' ? '秘伝書' : (ITEM_INFO[k] || ITEM_INFO[kind] || MAT_INFO[k] || [])[1] || ''; }
let heldSeen = null;
function showHeldCard(k) {
  let el = $('heldCard');
  if (!el) {
    el = document.createElement('div'); el.id = 'heldCard';
    el.innerHTML = '<style>#heldCard{position:absolute;left:50%;bottom:118px;transform:translateX(-50%);text-align:center;pointer-events:none;opacity:0;transition:opacity .35s;max-width:min(640px,80vw);z-index:6}#heldCard.on{opacity:1}#heldCard .hn{font-size:22px;letter-spacing:.22em;text-indent:.22em;color:#f0dca8;text-shadow:0 0 10px #000,0 0 18px rgba(0,0,0,.9)}#heldCard .hd{margin-top:8px;padding:10px 16px;font-size:14.5px;line-height:1.75;color:#e8dcc0;background:rgba(8,5,12,.78);border:1px solid rgba(216,180,106,.35);letter-spacing:.04em}#heldCard .hd b{color:#e0bd72;font-weight:normal}#heldCard .hd:empty{display:none}</style><div class="hn"></div><div class="hd"></div>';
    ($('hud') || document.body).appendChild(el);
  }
  if (!heldSeen) { try { heldSeen = JSON.parse(localStorage.getItem('arcana_heldSeen')) || {}; } catch { heldSeen = {}; } }
  const kind = heldKind(k), first = !heldSeen[kind === 'mat' ? k : kind];
  el.querySelector('.hn').textContent = itemName(k);
  el.querySelector('.hd').innerHTML = first ? `${heldDesc(k)}<br><b>${HELD_HOW[kind]()}</b>` : '';
  if (first) { heldSeen[kind === 'mat' ? k : kind] = 1; try { localStorage.setItem('arcana_heldSeen', JSON.stringify(heldSeen)); } catch {} }
  el.classList.add('on');
  clearTimeout(showHeldCard.t); showHeldCard.t = setTimeout(() => el.classList.remove('on'), first ? 8000 : 2400);
}
function hideHeldCard() { clearTimeout(showHeldCard.t); $('heldCard')?.classList.remove('on'); }

// ---------- 道具 ----------
// 道具枠の i 番を使う。中身が何でも「使う・読む」を試す(素材など使えない物はその旨を出す)
// 道具枠の i 番を手に持つ。同じ枠をもう一度押すと魔導書に持ち替える
function holdQuick(i) {
  const k = G.quick?.[i];
  if (!k || !(G.inv[k] > 0) || (G.held === 'item' && G.heldSlot === i)) { setHeld('grimoire'); return; }
  G.heldSlot = i; setHeld('item');
}
function useQuick(i) {
  const k = G.quick?.[i]; if (!k) return;
  if (!G.inv[k]) { UI.log(`${itemName(k)}を持っていない`, '#a8a090'); return; }
  if (activateItem(k) && G.held === 'item') VM.kick();
  UI.renderHotbar();
}
// 道具を使う窓口。新しい道具はここ(と ITEM_INFO)に足せば、所持品からも道具枠からも使える
function activateItem(k) {
  if(k.startsWith('gear_')){equipItem(k.slice(5));return true;}
  if (USABLE.includes(k)) { useItem(k); return true; }
  if (k === 'scroll' || k.startsWith('scroll_') || k.startsWith('tome_')) { readItem(k); return true; }
  UI.log(`${itemName(k)}はそのままでは使えない(調合の素材)`, '#a8a090'); return false;
}
// 道具枠に入れる(すでに別の枠にあればそちらは空ける)
function setQuick(i, k) {
  G.quick ||= [...QUICK_DEFAULT];
  const j = G.quick.indexOf(k); if(j<0)return; G.quick[j]=G.quick[i];
  G.quick[i] = k; UI.renderHotbar(); if (invOpen()) renderInventory();
}
// 新しく手に入れた「使える道具」は、空いている枠へ自動で入れる
G.autoQuick = () => {
  G.quick=carryOrder(G.inv,G.quick);
  // 持っていた物が尽きたら、魔導書に持ち替える
  if (G.held === 'item' && !G.quick[G.heldSlot]) setTimeout(() => setHeld('grimoire'), 0);
  else if(G.held==='item'&&G.heldKey!==G.quick[G.heldSlot])setTimeout(()=>{if(G.held==='item'&&G.heldKey!==G.quick[G.heldSlot])setHeld('item');},0);
};
function useItem(k) {
  const p = G.player;
  if (!G.inv[k] || !p.alive || p.downed) return;
  if (k === 'ether' && p.status.drinking) return;
  G.inv[k]--;
  if (k === 'ether') { p.status.drinking = { t: 1.2, d: 1.2 }; setTimeout(() => { if (!p.alive || p.downed) return; p.status.manaflow = { t: 4, rate: 55 / 4 }; sfx.heal?.(p.pos); UI.renderHotbar(); }, 700); if (p.chanting) clearChant(); }
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
// 視点はポインタロック(カーソルを画面に固定)で動かす。固定できていれば回転に限りはない。
// 固定が外れた/失敗したときは「クリックで操作開始」を出し、クリックで固定し直す。
// 何度クリックしても固定できない環境(一部の埋め込みブラウザ)だけ「フリールック」に切り替える。
let freeLook = false, mouseX = 0.5, mouseIn = false, dragging = false;
let lockFails = 0, lockPending = false;
function showClickToPlay() {
  if (!G.player || G.uiOpen || freeLook) return;
  $('clickToPlay').textContent = 'クリックで操作開始';
  $('clickToPlay').classList.remove('hidden');
}
function enableFreeLook() {
  if (window.desktop || freeLook) return; // アプリ版は必ず固定できるので切り替えない
  freeLook = true; canvas.style.cursor = 'none';
  $('clickToPlay').textContent = 'マウスで視点操作中(カーソルを固定できない環境です。アプリ版推奨)';
  $('clickToPlay').classList.remove('hidden');
  setTimeout(() => $('clickToPlay').classList.add('hidden'), 2500);
}
function requestLock(fromClick = false) {
  if (G.uiOpen || !G.player || G.typing || document.pointerLockElement === canvas || lockPending) return;
  lockPending = true;
  const failed = () => {
    if (!lockPending) return; lockPending = false;
    if (document.pointerLockElement === canvas) return;
    if (fromClick && ++lockFails >= 3) enableFreeLook(); else showClickToPlay();
  };
  try {
    const r = canvas.requestPointerLock();
    if (r?.then) r.then(() => { lockPending = false; }, failed);
  } catch { failed(); }
  // 結果を知らせない環境もあるので少し待って確認
  setTimeout(() => { if (document.pointerLockElement === canvas) lockPending = false; else failed(); }, 700);
}
canvas.addEventListener('click', () => requestLock(true));
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    lockFails = 0; lockPending = false;
    if (freeLook) { freeLook = false; canvas.style.cursor = ''; }
    $('clickToPlay').classList.add('hidden');
  } else if (!freeLook) showClickToPlay();
});
canvas.addEventListener('mousedown', () => { dragging = true; });
addEventListener('mouseup', () => { dragging = false; });
canvas.addEventListener('mouseenter', () => { mouseIn = true; });
canvas.addEventListener('mouseleave', () => { mouseIn = false; });
document.addEventListener('mousemove', e => {
  mouseX = e.clientX / innerWidth;
  if (!G.player || G.uiOpen || G.typing) return;
  if (document.pointerLockElement !== canvas && !freeLook) return;
  // ポインタロック中、ブラウザがまれに桁違いの移動量を送ってくる(視点が飛ぶ)ので捨てる
  if (Math.abs(e.movementX) > 280 || Math.abs(e.movementY) > 280) return;
  const s = 0.0022 * (opts.sens || 1);
  if (G.stats) G.stats.looked += Math.abs(e.movementX * s) + Math.abs(e.movementY * s);
  G.player.yaw -= e.movementX * s * (G.player.status.invert ? -1 : 1);
  G.player.pitch = clamp(G.player.pitch - e.movementY * s * (opts.invertY ? -1 : 1), -1.45, 1.45);
});

const typeBox = $('typeBox'), typeIn = $('typeIn');
function openTypeBox() {
  if (!G.player) return; releaseKeys(); clearChant(); G.typing = true; typeBox.classList.remove('hidden'); typeIn.value = ''; typeIn.focus(); document.exitPointerLock?.(); }
function closeTypeBox() { typeBox.classList.add('hidden'); typeIn.blur(); G.typing = false; requestLock(); }
typeIn.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') { const t = typeIn.value; closeTypeBox(); if (t.trim()) sendChat(t); }
  if (e.key === 'Escape') closeTypeBox();
});
function sendChat(raw){const text=String(raw).trim().slice(0,280);if(!text||performance.now()-(G.lastChatAt||0)<600)return;G.lastChatAt=performance.now();UI.log(G.player.name+'：'+text,'#cfdae5');G.net?.send({t:'chat',text});}

// ---- 入力 (キー割り当ては操作設定で変更できる: controls.js) ----
const isDown = id => !!keys[binds[id]];
function pressAction(act, e) {
  switch (act) {
    case 'grimoire': e?.preventDefault(); openBook('grimoire'); return;
    case 'textbook': e?.preventDefault(); openBook('words'); return; // 教本の章(言霊辞典・心得・調合書)を開く
    case 'inventory': e?.preventDefault(); openInventory(); return;
    case 'drop': if(G.held==='item'&&G.quick[G.heldSlot])dropItem(G.quick[G.heldSlot]);return;
    case 'voice': if (G.held !== 'grimoire') setHeld('grimoire'); if (voiceSupported && !isContinuous()) { if (!canCast()) return; chantBuf = ''; consumed = false; pttHeld = true; commitAt = 0; startListening(); voiceDeadline = 0; } return;
    case 'continuous': if (voiceSupported) { setContinuous(!isContinuous()); UI.log(isContinuous() ? '常時詠唱: ON — 言霊を含む発話を詠唱とみなす' : '常時詠唱: OFF'); } return;
    case 'typed':
      e?.preventDefault(); openTypeBox(); return;
    case 'read': G.reading = true; if (G.held !== 'grimoire') setHeld('grimoire'); return;
    case 'pageNext': flipPage(1); return;
    case 'pagePrev': flipPage(-1); return;
    case 'interact': interact(); return;
    case 'jump': { const p = G.player; if (p.onGround && p.alive && !p.downed && (p.stamina ?? 100) >= JUMP_COST) { p.stamina = (p.stamina ?? 100) - JUMP_COST; p.staminaWait = 0.8; p.vy = 7.4; p.onGround = false; sfx.step(null); } return; }
    case 'ambience': settings.ambVol = settings.ambVol >= 100 ? 0 : settings.ambVol >= 40 ? 100 : 40; applySettings(); saveSettings(); UI.log('環境音: ' + settings.ambVol + '%'); return;
    case 'tts': settings.npcVoice = !ttsOn(); setTTS(settings.npcVoice); saveSettings(); UI.log('NPC詠唱の読み上げ: ' + (ttsOn() ? 'ON' : 'OFF')); return;
  }
  if (act?.startsWith('item')) { holdQuick(+act.slice(4) - 1); return; }
  if (act === 'use') { if (G.held === 'item') useQuick(G.heldSlot); return; }
}
function releaseAction(act) {
  if (act === 'voice' && voiceSupported && !isContinuous()) { pttHeld = false; stopListening(); commitAt = performance.now() + 700; voiceDeadline = G.time + 3; } // 離した後の最後の区切りを少し待ってから確定
  if (act === 'read') G.reading = false;
}
addEventListener('keydown', e => {
  if (!G.player || capturing) return;
  if (menuOpen()) {
    if (e.code === 'Escape') { e.preventDefault(); if (!$('setPanel').classList.contains('hidden')) showSettings(false); else closeMenu(); }
    return;
  }
  if (invOpen()) {
    if (e.code === 'Escape' || e.code === binds.inventory) { e.preventDefault(); closeInventory(); }
    else if (invHover) { const n = [1, 2, 3, 4, 5, 6].findIndex(i => e.code === binds['item' + i]); if (n >= 0) { e.preventDefault(); setQuick(n, invHover); } }
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
// 離した瞬間を取りこぼしたキー・ボタンを直す(右クリックの「掲げる」や Shift が押しっぱなし扱いになり、走れなくなる不具合の対策)
const MOUSE_BIT = { Mouse0: 1, Mouse1: 4, Mouse2: 2 };
addEventListener('mousemove', e => { for (const c in MOUSE_BIT) if (keys[c] && !(e.buttons & MOUSE_BIT[c])) { keys[c] = false; releaseAction(actionOf(c)); } });
addEventListener('keydown', e => { if (!e.shiftKey && (keys.ShiftLeft || keys.ShiftRight) && !/^Shift/.test(e.code)) { keys.ShiftLeft = keys.ShiftRight = false; } }, true);
addEventListener('blur', () => releaseKeys());
addEventListener('wheel', e => {
  if (!G.player || G.uiOpen || G.typing || !opts.wheelPages) return;
  if (document.pointerLockElement !== canvas && !freeLook) return;
  flipPage(e.deltaY > 0 ? 1 : -1);
}, { passive: true });
function releaseKeys() { for (const k in keys) keys[k] = false; G.reading = false; }
addEventListener('blur', releaseKeys);
document.addEventListener('visibilitychange', releaseKeys);
G.onUiOpen = releaseKeys;

// ---------- 地形の仕掛け ----------
const hazardHooks = src => ({ src, dig: (pos, r, max) => applyDig(digCells(pos, r, max)), log: (t, c) => UI.log(t, c) });
initMischief({ ui: UI, sfx });
initCoop({
  ui: UI, sfx,
  addPickup: (id, kind, pos, data) => { if (!G.pickups.some(k => k.id === id) && !G.openChests?.some(m => m.userData?.pid === id)) addPickup(id, kind, pos, data); },
  damage: (m, n) => G.fx.damage(m, n, ['void'], null, {}),
});
initGimmicks({
  ui: UI, sfx, renderHotbar: () => UI.renderHotbar?.(),
  give: (m, n) => { grantItem(m, n); UI.renderHotbar?.(); },
  spill: (m, pos) => spillItem(m, pos),
  spawn: (id, type, pos) => { const e = spawnEnemy(id, type, pos, G.floor); if (e) { e.aggro = true; G.net?.send({ t: 'espawn', id, type, pos: pos.toArray(), floor: G.floor }); } return e; },
});
initRoomEvents({
  ui: UI, sfx,
  addPickup: (kind, pos, data) => addPickup('r' + Math.floor(Math.random() * 1e9), kind, pos, data),
  learnWord: () => learnRandomWord(),
  inv: (m, n) => { const got = grantItem(m, n); UI.renderHotbar?.(); if (got) UI.log(`${itemName(m)} ×${got}`, '#cfe8ff'); },
  spawn: (id, type, pos) => { const e = spawnEnemy(id, type, pos, G.floor); if (e) G.net?.send({ t: 'espawn', id, type, pos: pos.toArray(), floor: G.floor }); return e; },
});
G.onImpact = (pos, spell, local, caster) => {
  hazardImpact(pos, spell, local, hazardHooks(caster));
  roomImpact(pos, spell, local && caster === G.player);
  coopImpact(pos, spell, local && caster?.isMage);
  if (spell.ruin && local && caster === G.player && G.player.pos.distanceTo(pos) < 4) G.fx.damage(G.player, 14, [], null, { silent: false });
};
G.solidsRemove = h => { if (h.solid) G.dungeon.solids = G.dungeon.solids.filter(s => s !== h.solid); };

// ---------- 精霊の頼みごと ----------
const QUEST_HOOKS = {
  onOffer: (sp, line) => { UI.banner(`${sp.name}の頼み`, `「${line}」`, 5); sfx.learn(); },
  onDone: (sp, q) => {
    BOOK.bonds ||= {}; BOOK.bonds[q.sid] = (BOOK.bonds[q.sid] || 0) + 15; saveBook();
    UI.banner(`${sp.name}の頼みを果たした`, '縁が大きく深まった。精霊から言霊を授かる', 5);
    setTimeout(learnRandomWord, 1800);
    clearTimeout(G.questTimer); G.questTimer = setTimeout(() => offerQuest(QUEST_HOOKS), 60000);
  },
};

// ---------- 合唱詠唱 ----------
G.recentCasts = [];
function noteCast(id, words) {
  const key = [...words].sort().join(',');
  G.recentCasts.push({ id, key, t: G.time });
  coopCast(id);
  G.recentCasts = G.recentCasts.filter(c => G.time - c.t < 2);
}
function findChorus(p, spell) {
  if (!spell.elements.length && !spell.effects.length) return null;
  const key = [...spell.words].sort().join(',');
  const c = G.recentCasts.find(c => c.key === key && c.id !== p.id && G.time - c.t < 1.6);
  if (c) return findMage(c.id) || { name: '仲間' };
  // ひとりの時は、近くの仲間(NPC)がときどき声を合わせてくれる
  if (!G.net && G.mode === 'coop' && Math.random() < 0.3) {
    const bot = G.bots.map(b => b.mage).find(m => m.alive && !m.downed && !m.chanting && m.pos.distanceTo(p.pos) < 14 && m.mp >= spell.cost * 0.5);
    if (bot) {
      bot.mp -= spell.cost * 0.5; bot.setChant(spell.text?.slice(0, 40) || '', 2); setTimeout(() => bot.setChant(''), 900);
      G.fx.cast(bot, compile(spell.text, null), playerAim(spell));
      return bot;
    }
  }
  return null;
}

// ---------- 迷宮踏破 ----------
function victory() {
  G.achieve('CLEAR');
  G.run.done = true;
  let it = null; for (let i = 0; i < 60 && (!it || it.rarity < 3); i++) it = rollItem(FINAL_FLOOR + 5);
  grantGear(it); BOOK.cleared = (BOOK.cleared || 0) + 1; saveBook();
  G.slowmo = 0.6; G.shake = 0.6; sfx.meiei?.();
  const ov = $('victory');
  ov.querySelector('.vstats').innerHTML = `所要: ${clock(G.run?.time)} ・ 到達: 第${G.floor}層 ・ 討伐: ${G.stats?.kills || 0}体 ・ 名詠: ${G.stats?.eloquent || 0}回<br>褒美: <b style="color:${RARITY[it.rarity].color}">${it.name}</b>〔${RARITY[it.rarity].name}〕`;
  ov.classList.remove('hidden'); G.uiOpen = true; document.exitPointerLock?.();
}
$('vContinue').onclick = () => { $('victory').classList.add('hidden'); G.uiOpen = false; resumeLock(); UI.log('さらに深く — 迷宮はまだ続いている', '#ffe08a'); };
$('vTitle').onclick = () => location.reload();

// 言い損じが続いた精霊は、しばらくそっぽを向く(その精霊の術が弱まる)
function sulkCheck(spell) {
  questEvent('miss');
  for (const id of scold(spiritsOf(spell))) UI.log(`${SPIRITS[id].name}がそっぽを向いた — しばらく力が弱まる。正しく唱え切れば機嫌は直る`, '#ff9a8a');
}
// 魔法の成長: 第1層は本来の6割、層を進むごとに強まり第9層で本来の威力
const spellGrowth = () => Math.min(1, 0.6 + 0.05 * ((G.floor || 1) - 1));
G.spellGrowth = spellGrowth;

// ---------- 地形破壊 ----------
// 強い術(極大・名詠・属性の融合など)は壁を砕く。外周の壁は壊れない
function digCells(pos, radius, max) {
  const cells = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const cx = Math.floor(pos.x / CELL) + dx, cy = Math.floor(pos.z / CELL) + dy;
    if (!breakable(cx, cy) || G.dungeon.grid[cy * W + cx]) continue;
    const d = Math.hypot((cx + 0.5) * CELL - pos.x, (cy + 0.5) * CELL - pos.z);
    if (d <= radius + CELL * 0.55) cells.push([cx, cy, d]);
  }
  return cells.sort((a, b) => a[2] - b[2]).slice(0, max).map(([x, y]) => [x, y]);
}
function applyDig(cells, fromNet = false) {
  if (!cells.length) return;
  for (const [x, y] of cells) G.dungeon.grid[y * W + x] = 1;
  rebuildStructure(G.dungeon, dungeonGroup);
  for (const [x, y] of cells) rubbleBurst(new THREE.Vector3((x + 0.5) * CELL, 0, (y + 0.5) * CELL));
  sfx.crumble?.(new THREE.Vector3((cells[0][0] + 0.5) * CELL, 1, (cells[0][1] + 0.5) * CELL));
  for (const m of G.mages) m._fc = null; // 魔物の経路を引き直す
  secretDig(cells, scene, UI, G.fx);
  if (!fromNet) G.net?.send({ t: 'dig', cells });
}
const breakPower = spell => (G.mut?.id === 'brittle' ? 1.4 : 1) * (spell.breakPower ?? spell.power) * (spell.max ? 1.15 : 1) * (spell.dual ? 1.1 : 1) * (spell.ruin ? 2.2 : 1);
G.onWallHit = (pos, spell, local) => {
  if (!local) return;
  const sc = crackedAt(pos); // ひびの入った壁は、どんな攻撃の術でも砕ける
  if (sc) { applyDig([sc.cell]); return; }
  const p = breakPower(spell);
  if (p < 1.25) return; // 弱い術では崩れない(ひびの演出だけ)
  applyDig(digCells(pos, p >= 1.9 ? CELL * 0.9 : 0, p >= 1.9 ? 3 : 1));
};
G.onBlast = (pos, radius, spell, local) => {
  if (!local) return;
  const p = breakPower(spell);
  if (p < 1.5) return;
  applyDig(digCells(pos, radius * 0.6, p >= 2 ? 4 : 2));
};

// ---------- 照準した敵の情報 ----------
const ELEM_WORD = Object.fromEntries(WORDS.filter(w => w.cat === 'element').map(w => [w.val, w.core]));
let targetShown = null;
function updateTargetInfo() {
  const el = $('target'); if (!el) return;
  // 狙った魔物の情報(体力・弱点)の札は出さない。弱点は戦って、あるいは教本で知る
  el.classList.add('hidden'); return;
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
  el.innerHTML = `${best.boss ? '<b class="boss">主</b>' : ''}<div class="hp"><i style="width:${pct}%"></i></div><div class="wk">${weak ? '弱点 <em>' + weak + '</em>' : ''}${res ? '　耐性 <s>' + res + '</s>' : ''}</div>`;
  el.style.setProperty('--rim', '#' + (ENEMY_RIM[best.type] ?? 0xff5a3a).toString(16).padStart(6, '0'));
  el.classList.remove('hidden');
}

// ---------- 装備 ----------
function applyEquip() {
  const t = G.eqT = totals(BOOK.equip);
  G.uq = uniquesOf(BOOK.equip);                        // 身に着けているユニークな効果
  const p = G.player; if (!p) return;
  p.maxMp = Math.max(30, 100 + t.maxMp); p.maxHp = 100 + t.maxHp;
  p.mp = Math.min(p.mp, p.maxMp); p.hp = Math.min(p.hp, p.maxHp);
  p.regenMul = Math.max(0.25, 1 + t.regen);
}
// ユニークな品を一つ手に入れる
function findUnique(pos, delay = 0) {
  const have = [...Object.values(BOOK.equip || {}), ...(BOOK.bag || [])].filter(it => it?.uq).map(it => it.uq);
  const it = rollUnique(have);
  setTimeout(() => {
    grantGear(it, pos); saveBook(); sfx.learn?.(); G.shake = Math.max(G.shake || 0, 0.3);
    UI.banner(`ユニーク — ${it.name}`, `${statLines(it)[0]}  (数字キーで持ち、左クリックで装備)`, 7);
    UI.log(`ユニークな品を得た: ${it.name} — ${statLines(it)[0]}`, '#ff9a6a');
    if (pos) G.fx.burst(pos.clone().setY((pos.y || 0) + 1), 0xff7a4a, 140, { speed: 6, up: 3 });
  }, delay);
}
// ユニークな効果のうち、時間で起きるもの(雷雲の外套)
let stormT = 5;
function updateUniques(dt) {
  const p = G.player; if (!G.uq?.has('storm') || !p?.alive || p.downed) return;
  stormT -= dt; if (stormT > 0) return; stormT = 5;
  const e = G.enemies.filter(o => o.alive && o.pos.distanceTo(p.pos) < 12).sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos))[0];
  if (!e) { stormT = 1; return; }
  G.fx.bigImpact(e.pos.clone().setY((e.pos.y || 0) + 1), 0xb48cff, 0.9, ['thunder']); G.fx.damage(e, 35, [], p, { echo: true });
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
  const i=BOOK.bag.findIndex(x=>x.uid===uid);if(i<0)return;
  const it=BOOK.bag.splice(i,1)[0],k=gearKey(it),slot=G.quick.indexOf(k),old=BOOK.equip[it.slot];delete G.inv[k];
  BOOK.equip[it.slot]=it;
  if(old){BOOK.bag.push(old);G.inv[gearKey(old)]=1;if(slot>=0)G.quick[slot]=gearKey(old);}
  else if(slot>=0)G.quick[slot]=null;
  saveBook();applyEquip();sfx.pickup();UI.renderHotbar();UI.log(it.name+'を装備した。','#d8cfb6');
}
function unequip(slot){const it=BOOK.equip[slot];if(!it)return;if(!carryRoom(G.inv,gearKey(it))){UI.log('6枠がいっぱいで外せない');return;}delete BOOK.equip[slot];grantGear(it);saveBook();applyEquip();}
function discard(uid){dropItem('gear_'+uid);}
const itemCard = (it, btns) => `<div class="eitem r${it.rarity}"><b style="color:${RARITY[it.rarity].color}">${it.name}</b><span class="rar">〔${RARITY[it.rarity].name}〕${SLOTS.find(s => s.id === it.slot).name}</span><small>${statLines(it).join('<br>')}</small><span class="ebtns">${btns}</span></div>`;

// ---------- 所持品 ----------
const invEl = $('inv');
const invOpen = () => !invEl.classList.contains('hidden');
const MAT_INFO = { shard: ['言霊の欠片', '写本・秘伝書を綴る素材。守護者や精鋭を討つか、覚えている古文書を砕いて得る'], herb: ['霊草', '導灯の素材'], crystal: ['魔晶', '魔力薬・護符・閃光玉の素材'], bone: ['骨片', '護符の素材'], iron: ['鉄屑', '閃光玉・導灯の素材'] };
const EL_NAME = { fire: '紅蓮', ice: '氷獄', thunder: '雷霆', wind: '颶風', holy: '聖光', void: '深淵' };
const ITEM_INFO = {
  ether: ['魔力薬', '飲むと数秒かけて魔力が55戻る'], amulet: ['護符', '守護の障壁を張る'], flash: ['閃光玉', '周りの魔物を怯ませる'], lantern: ['導灯', 'この層の地図を照らす'],
  scroll: ['古文書', '読むと新しい言霊を一つ覚える(読んだ本人だけ)'], herb: ['霊草', '調合の素材'], crystal: ['魔晶', '調合の素材'], bone: ['骨片', '調合の素材'], iron: ['鉄屑', '調合の素材'], frag: ['古文書の断片', '三枚そろうと言霊が読める'],
};
function itemName(k) { if(k.startsWith('gear_'))return BOOK.bag.find(it=>gearKey(it)===k)?.name||'装備品'; if (k.startsWith('scroll_')) { const w = WORD_BY_ID[k.slice(7)]; return w ? `古文書『${w.core}』` : '古文書'; } if (k.startsWith('tome_')) { const lv = (BOOK.mastery || {})[k.slice(5)] || 0; return `${EL_NAME[k.slice(5)]}の秘伝書${lv < 3 ? ' ' + TOME_VOL[lv] : ''}`; } return ITEM_INFO[k]?.[0] || k; }
const TOME_VOL = ['第一巻', '第二巻', '終巻']; // 秘伝書は全三巻
const USABLE = ['ether', 'amulet', 'flash', 'lantern'];
G.itemName = k => itemName(k);
G.carriedModel=k=>equipmentModel(BOOK.bag.find(it=>gearKey(it)===k));
G.carriedIcon=k=>k.startsWith('gear_')?gearIcon(BOOK.bag.find(it=>gearKey(it)===k)):itemIcon(k);
function readItem(k) {
  if (!G.inv[k]) return;
  if (k === 'scroll') { G.inv.scroll--; learnRandomWord(); if (G.floorStats) G.floorStats.scrolls++; }
  else if (k.startsWith('scroll_')) {
    G.inv[k]--; const w = WORD_BY_ID[k.slice(7)];
    if (!w || G.known.has(w.id)) { invAdd('shard', 1, true); UI.log(`『${w?.core || '？'}』はもう覚えている — 古文書は砕け、言霊の欠片が残った(写本を綴る素材になる)`, '#d8b8ff'); }
    else learnWord(w);
    if (G.floorStats) G.floorStats.scrolls++;
  }
  else if (k.startsWith('tome_')) {
    const el = k.slice(5); BOOK.mastery ||= {};
    const lv = BOOK.mastery[el] || 0;
    if (lv >= 3) { UI.log(`${EL_NAME[el]}の秘伝はもう極めている`, '#a8a090'); return; }
    G.inv[k]--; BOOK.mastery[el] = lv + 1; saveBook();
    UI.banner(`${EL_NAME[el]}の秘伝 ${TOME_VOL[lv]}を修めた`, `${EL_NAME[el]}を込めた術の威力 +${15 * (lv + 1)}%${lv + 1 >= 3 ? ' ・ 秘伝を極めた' : ''}`, 4); sfx.learn?.();
  }
  UI.renderHotbar();
}
function dropItem(k) {
  const p = G.player; if (!G.inv[k] || !p) return;
  G.inv[k]--;
  const f = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
  const pos = p.pos.clone().addScaledVector(f, 1.6);
  const id = `D${G.netId || 0}_${lootCounter++}`;
  const gear=k.startsWith('gear_')?BOOK.bag.find(it=>gearKey(it)===k):null;
  if(gear){BOOK.bag=BOOK.bag.filter(it=>it!==gear);saveBook();}
  addPickup(id, 'loot', pos, { mat: k, gear, noPick: performance.now() + 3000 });
  G.net?.send({ t: 'loot', items: [{ id, mat: k, gear, x: pos.x, y:pos.y, z: pos.z }] });
  UI.log(`${itemName(k)}を落とした`, '#cfe8ff'); UI.renderHotbar();
}
// 所持品: 装備4枠 + 能力の印 + 道具と予備の装備の升目。名前や効果は札(マウスを乗せると出る)にだけ
let armDiscard = null, invHover = null;
function tipHtml(o) {
  if (o.k) {
    if (o.k.startsWith('scroll_')) {
      const w = WORD_BY_ID[o.k.slice(7)];
      return `<b style="color:#ffe08a">${itemName(o.k)}</b><div>${w ? `${CAT[w.cat]}の言霊「${w.text}」` : ''}</div><div class="muted">${w?.hint || ''}</div><div class="hint">左: 読んで覚える ・ 右: 落とす(仲間が拾える) ・ 1〜6: 道具枠へ</div>`;
    }
    const tome = o.k.startsWith('tome_');
    const desc = tome ? `読むと${EL_NAME[o.k.slice(5)]}の術の威力 +15%(${(BOOK.mastery || {})[o.k.slice(5)] ? TOME_VOL[(BOOK.mastery || {})[o.k.slice(5)] - 1] + 'まで修めた' : 'まだ一巻も修めていない'})` : ITEM_INFO[o.k]?.[1] || '';
    const act = USABLE.includes(o.k) ? '使う' : (tome || o.k === 'scroll') ? '読む' : '';
    return `<b style="color:${tome ? '#ffd76a' : '#fff'}">${itemName(o.k)}</b><div>${desc}</div><div class="hint">${act ? '左: ' + act + ' ・ ' : ''}右: 落とす(仲間が拾える) ・ 1〜6: 道具枠へ</div>`;
  }
  const it = o.it, r = RARITY[it.rarity];
  return `<b style="color:${r.color}">${it.name}</b><div class="sub">${r.name} ・ ${SLOTS.find(s => s.id === it.slot).name}</div>${statLines(it).map(l => `<div class="st">${l}</div>`).join('')}<div class="hint">${o.worn ? '左: 外す' : '左: 装備する' + (BOOK.equip[it.slot] ? '(入れ替え)' : '') + ' ・ 右を二度: 捨てる'}</div>`;
}
function renderInventory() {
  BOOK.equip ||= {}; BOOK.bag ||= [];
  const slots = [];
  // 装備
  $('invEquip').innerHTML = SLOTS.map(s => {
    const it = BOOK.equip[s.id];
    return it ? `<div class="islot worn r${it.rarity}" data-worn="${s.id}">${gearIcon(it)}</div>` : `<div class="islot empty" title="${s.name}">${slotGhost(s.id)}</div>`;
  }).join('');
  // 能力
  const t = G.eqT || totals(BOOK.equip);
  $('invTotals').innerHTML = [['hp', 100 + t.maxHp, '生命の上限'], ['mp', 100 + t.maxMp, '魔力の上限'], ['power', '+' + Math.round(t.power * 100) + '%', '術の威力'], ['regen', '+' + Math.round(t.regen * 100) + '%', '魔力の回復'], ['cost', Math.round(t.costMul * 100) + '%', '魔力の消費']]
    .map(([k, v, n]) => `<span title="${n}">${STAT_ICON[k]}${v}</span>`).join('')
    + (profSummary().length ? `<div class="profrow">${profSummary().map(s => `<span title="${rankName(s.lv)} ・ 熟練 ${s.xp}${s.next ? ' / 次の階梯まで ' + (s.next - s.xp) : ' (極めた)'}"><b>${profTitle(s.el, s.lv)}</b><i style="--p:${s.next ? Math.round((s.xp / s.next) * 100) : 100}%"></i></span>`).join('')}</div>` : '');
  // 操作
  const tip = $('invTip');
  const find = el => el.dataset.k ? { k: el.dataset.k } : el.dataset.uid ? { it: BOOK.bag.find(x => x.uid === el.dataset.uid) } : el.dataset.worn ? { it: BOOK.equip[el.dataset.worn], worn: true } : null;
  invEl.querySelectorAll('.islot:not(.empty)').forEach(el => {
    el.onmouseenter = () => { invHover = el.dataset.k || null; const o = find(el); if (!o || (!o.k && !o.it)) return; tip.innerHTML = tipHtml(o) + (armDiscard && armDiscard === el.dataset.uid ? '<div style="color:#ff8a8a">もう一度 右クリックで捨てる</div>' : ''); tip.classList.remove('hidden'); };
    el.onmousemove = e => { tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 16) + 'px'; tip.style.top = Math.min(innerHeight - tip.offsetHeight - 8, e.clientY + 12) + 'px'; };
    el.onmouseleave = () => { invHover = null; tip.classList.add('hidden'); };
    el.onclick = () => {
      const o = find(el); if (!o) return;
      if (o.k) { if (!activateItem(o.k)) return; }
      else if (o.worn) unequip(el.dataset.worn);
      else equipItem(o.it.uid);
      tip.classList.add('hidden'); renderInventory();
    };
    el.oncontextmenu = e => {
      e.preventDefault();
      const o = find(el); if (!o) return;
      if (o.k) dropItem(o.k);
      else if (!o.worn) { if (armDiscard === o.it.uid) { discard(o.it.uid); armDiscard = null; sfx.fizzle?.(G.player.pos); } else { armDiscard = o.it.uid; setTimeout(() => { if (armDiscard === o.it.uid) { armDiscard = null; if (invOpen()) renderInventory(); } }, 2500); } }
      tip.classList.add('hidden'); renderInventory();
    };
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
function closeInventory(resume = true) { $('invTip').classList.add('hidden'); invEl.classList.add('hidden'); G.uiOpen = false; if (resume) resumeLock(); }
invEl.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { closeInventory(false); openBook(b.dataset.open); });

invEl.addEventListener('click', e => { if (e.target === invEl) closeInventory(); });

// ---------- Esc メニューと設定 ----------
const SETTINGS_KEY = 'arcana_vox_settings_v1';
// 音量はどれも ％(0〜100)。musicVol = 音楽, sfxVol = 効果音, ambVol = 環境音, shake = 画面の揺れ
const SETTING_DEFS = { volume: 0.8, musicVol: 0, sfxVol: 100, ambVol: 40, shake: 100, npcVoice: true };
const settings = { ...SETTING_DEFS, ambience: 1, music: 1, sens: 1 };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch {}
// 前の版の「OFF・小・中」を ％へ引き継ぐ
{ let raw = null; try { raw = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch {}
  if (raw && raw.musicVol === undefined && raw.music !== undefined) settings.musicVol = [0, 45, 80][raw.music] ?? 45;
  if (raw && raw.ambVol === undefined && raw.ambience !== undefined) settings.ambVol = [0, 40, 100][raw.ambience] ?? 40;
  // 音楽は、いったん鳴らさない(設定の「音楽」を上げれば、また鳴る)。前の版で音量を決めていた人も、一度だけ 0 に戻す
  if (!settings.bgmOff1) { settings.musicVol = 0; settings.bgmOff1 = true; try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} } }
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} }
function applySettings() {
  setMasterVolume(settings.volume);
  setAmbienceVolume(settings.ambVol / 100); setMusicVolume(settings.musicVol / 100); setSfxVolume(settings.sfxVol / 100);
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
  showSettings(false);
  $('mQuit').classList.toggle('hidden', !window.desktop);
  $('mRoom').classList.add('hidden');
  $('mMulti').textContent = G.net ? `仲間と潜る${G.roomCode ? '(部屋 ' + G.roomCode + ' ・ ' + (G.net.players?.size || 1) + '人)' : '(接続中)'}` : '仲間と潜る(マルチプレイ)';
  $('mMulti').classList.toggle('hidden', !!G.noSave);   // 手ほどきの間は出さない
  updateSaveNote();
}
// 記録: 迷宮の入口と聖域の中でだけ手動で残せる(層に着いた時は自動)
const canSaveHere = () => !G.noSave && G.player && (G.floor === 0 || (G.sanctuary && inSanctuary(G.player.pos)));
function updateSaveNote(msg) {
  const r = loadRun(), last = r?.time ? new Date(r.time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';
  $('mSave').disabled = !canSaveHere();
  $('mSave').style.opacity = canSaveHere() ? '' : '.45';
  $('mSaveNote').textContent = msg || (G.noSave ? '手ほどきの間は記録されない' : `記録 ${currentSlot()}${r ? ` ・ 最後の記録 ${r.floor ? '第' + r.floor + '層' : '入口'} ${last}` : ''}${canSaveHere() ? '' : ' ・ 手動の記録は入口か聖域で(層に着くと自動で記録)'}`);
}
$('mSave').onclick = () => { if (!canSaveHere()) return; if (saveSnapshot()) { sfx.learn?.(); updateSaveNote(`記録 ${currentSlot()} に残した`); } };
function closeMenu() { menu.classList.add('hidden'); G.uiOpen = false; resumeLock(); }
function resumeLock() { requestLock(); }
$('mResume').onclick = closeMenu;
$('mGrimoire').onclick = () => { menu.classList.add('hidden'); openBook('grimoire'); };
$('mInv').onclick = () => { menu.classList.add('hidden'); openInventory(); };

// ---- 設定の画面 ----
// 分類ごとの項目。type: pct(％のつまみ) / num(数値のつまみ) / bool(入・切) / act(押して実行)。desc = 下に出す説明
const setS = k => ({ get: () => settings[k], set: v => { settings[k] = v; applySettings(); saveSettings(); }, def: SETTING_DEFS[k] });
const setO = k => ({ get: () => opts[k], set: v => { opts[k] = v; applyControls(); saveControls(); }, def: OPTION_DEFS[k] });
const SET_TABS = [['audio', '音'], ['controls', '操作'], ['keys', 'キー割り当て'], ['display', '画面']];
const SET_ROWS = {
  audio: [
    { label: '全体の音量', type: 'pct', get: () => Math.round(settings.volume * 100), set: v => { settings.volume = v / 100; applySettings(); saveSettings(); }, def: 80, desc: 'すべての音の大きさ。下の三つは、この音量に対する割合になる。' },
    { label: '音楽', type: 'pct', ...setS('musicVol'), desc: '探索・交戦・守護者戦・聖域で流れる音楽の大きさ。いまは最初から 0%(鳴らさない)にしてある。上げると鳴る。詠唱している間は、声の聞き取りを邪魔しないよう自動で小さくなる。' },
    { label: '効果音', type: 'pct', ...setS('sfxVol'), desc: '魔法・魔物・足音・宝箱などの音の大きさ。魔物の位置や守護者の構えは音でも分かるので、下げすぎに注意。' },
    { label: '環境音', type: 'pct', ...setS('ambVol'), desc: '迷宮の低いうなりや、遠くの水滴の音の大きさ。' },
    { label: '魔物の詠唱を読み上げる', type: 'bool', ...setS('npcVoice'), desc: '敵の術者が唱える言葉を、合成の声で聞かせる。何の術が来るかを耳で読める。' },
  ],
  controls: [
    { label: '視点の感度', type: 'pct', min: 30, max: 300, get: () => Math.round(opts.sens * 100), set: v => { opts.sens = v / 100; saveControls(); }, def: 100, desc: 'マウスを動かした時に、視点がどれだけ回るか。' },
    { label: '上下の視点を逆にする', type: 'bool', ...setO('invertY'), desc: 'マウスを手前に引くと上を向くようにする。' },
    { label: '視野の広さ', type: 'num', min: 60, max: 100, unit: '°', ...setO('fov'), desc: '一度に見える範囲。広いと周りを見渡しやすいが、遠くの物は小さくなる。酔いやすい時は広めに。' },
    { label: '歩く時に視点を揺らす', type: 'bool', ...setO('headBob'), desc: '歩みに合わせて視点が上下する。酔いやすい時は切る。' },
    { label: 'ホイールで頁をめくる', type: 'bool', ...setO('wheelPages'), desc: 'マウスのホイールで、魔導書の頁を前後にめくる。' },
  ],
  display: [
    { label: '画面の揺れ', type: 'pct', max: 150, ...setS('shake'), desc: '守護者の大技や落下の衝撃で、画面が揺れる強さ。0% で揺れなくなる。酔いやすい時は下げる。' },
    { label: '全画面の切り替え', type: 'act', text: '切り替える (F11)', run: () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }, desc: '全画面と窓の表示を切り替える。' },
  ],
};
let setTab = 'audio';
function showSettings(on) {
  capturing = null;
  $('setPanel').classList.toggle('hidden', !on);
  $('menuMain').classList.toggle('hidden', on);
  menu.querySelector('.mcard').classList.toggle('wide', on);
  if (on) renderSettings();
}
function renderSettings() {
  $('setTabs').innerHTML = SET_TABS.map(([id, name]) => `<button data-tab="${id}" class="${id === setTab ? 'sel' : ''}">${name}</button>`).join('');
  $('setTabs').querySelectorAll('button').forEach(b => b.onclick = () => { setTab = b.dataset.tab; capturing = null; renderSettings(); });
  const say = t => { $('setDesc').textContent = t || ''; };
  say(setTab === 'keys' ? '変えたい操作の右のボタンを押してから、割り当てたいキーかマウスのボタンを押す。Esc で取り消す。' : '項目にカーソルを合わせると、ここに説明が出る。');
  $('setReset').textContent = setTab === 'keys' ? 'キー割り当てを初期設定に戻す' : 'この頁を初期設定に戻す';
  if (setTab === 'keys') { renderKeysPanel(); return; }
  const rows = SET_ROWS[setTab];
  $('setBody').innerHTML = rows.map((r, i) => {
    if (r.type === 'bool') return `<div class="srow" data-i="${i}"><span>${r.label}</span><div class="tog"><button data-v="1" class="${r.get() ? 'on' : ''}">入</button><button data-v="0" class="${r.get() ? '' : 'on'}">切</button></div></div>`;
    if (r.type === 'act') return `<div class="srow" data-i="${i}"><span>${r.label}</span><button class="btn ghost small act">${r.text}</button></div>`;
    return `<div class="srow" data-i="${i}"><span>${r.label}</span><input type="range" min="${r.min ?? 0}" max="${r.max ?? 100}" step="${r.type === 'pct' ? 5 : 1}" value="${r.get()}"><span class="sval">${r.get()}${r.unit || '%'}</span></div>`;
  }).join('');
  $('setBody').querySelectorAll('.srow').forEach(el => {
    const r = rows[+el.dataset.i];
    el.onmouseenter = el.onfocusin = () => say(r.desc);
    const range = el.querySelector('input[type=range]');
    if (range) range.oninput = () => { r.set(+range.value); el.querySelector('.sval').textContent = range.value + (r.unit || '%'); if (r.label === '効果音') sfx.learn?.(); };
    el.querySelectorAll('.tog button').forEach(b => b.onclick = () => { r.set(b.dataset.v === '1'); renderSettings(); say(r.desc); });
    const act = el.querySelector('.act'); if (act) act.onclick = () => r.run();
  });
}
$('mSettings').onclick = () => showSettings(true);
$('mMulti').onclick = () => openMp();
$('mLook').onclick = () => openLookEditor();
$('setBack').onclick = () => showSettings(false);
$('setReset').onclick = () => {
  if (setTab === 'keys') { resetControls(); applyControls(); UI.renderHotbar(); }
  else for (const r of SET_ROWS[setTab]) if (r.def !== undefined) r.set(r.def);
  renderSettings();
};

// ---- 操作設定 ----
let capturing = null; // 割り当て待ちの操作 id
function renderKeysPanel() {
  const groups = {};
  for (const a of ACTIONS) (groups[a.group] ||= []).push(a);
  const opt = (id, label, html) => `<label class="mset"><span>${label}</span>${html}</label>`;
  $('setBody').innerHTML = `${Object.entries(groups).map(([g, list]) => `<h3>${g}</h3>` + list.map(a => `<div class="krow"><span>${a.label}</span><button class="kbtn ${capturing === a.id ? 'wait' : ''}" data-act="${a.id}">${capturing === a.id ? 'キーを押す…' : keyName(binds[a.id])}</button></div>`).join('')).join('')}`;
  $('setBody').querySelectorAll('.kbtn').forEach(b => b.onclick = ev => { ev.stopPropagation(); capturing = b.dataset.act; renderKeysPanel(); });
}
// 割り当て待ちの間は、次に押したキー/マウスボタンをその操作に割り当てる
function finishCapture(code) {
  if (!capturing) return;
  if (code !== 'Escape') { rebind(capturing, code); UI.renderHotbar(); }
  capturing = null; renderKeysPanel();
}
addEventListener('keydown', e => { if (!capturing) return; e.preventDefault(); e.stopImmediatePropagation(); finishCapture(e.code); }, true);
addEventListener('mousedown', e => { if (!capturing || e.target.closest?.('.kbtn')) return; e.preventDefault(); e.stopImmediatePropagation(); finishCapture('Mouse' + e.button); }, true);
$('setPanel').addEventListener('contextmenu', e => e.preventDefault());
$('mTitle').onclick = () => location.reload();
$('mQuit').onclick = () => window.desktop?.quit();
// ロック中に Esc を押すとブラウザがロックを解除するだけなので、それを検知してメニューを開く
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && G.player && !G.uiOpen && !G.typing && !freeLook) openMenu();
});

// そばに倒れている仲間
const fallenNear = p => G.mode === 'coop' ? G.mages.find(m => m !== p && m.alive && m.downed && m.team === p.team && m.pos.distanceTo(p.pos) < 2.8) : null;
// 仲間のそばへ跳ぶ(はぐれた時のため)。主との戦いの最中と、跳んだ直後は使えない
function warpToMate(netId) {
  const p = G.player, m = G.mages.find(x => x.netId === netId);
  if (!p || !m || !p.alive || p.downed) return '今は跳べない';
  if (!m.alive) return `${m.name}は倒れている`;
  if (G.dungeon?.arena?.phase === 'active') return '主との戦いの最中は跳べない';
  if ((G.warpUntil || 0) > G.time) return `まだ跳べない(あと${Math.ceil(G.warpUntil - G.time)}秒)`;
  const at = findFreePosition(m.pos.clone(), p.radius || 0.4, { maxDistance: 6, occupied: G.mages.filter(x => x !== p && x.alive) });
  if (!at) return 'そばに立てる場所が無い';
  G.fx.burst(p.pos.clone().setY(p.pos.y + 1), 0xb89aff, 40, { speed: 3 });
  p.pos.copy(at); p.vel?.set(0, 0, 0); p.vy = 0; G.warpUntil = G.time + 20;
  G.fx.burst(at.clone().setY(at.y + 1), 0xb89aff, 40, { speed: 3, up: 1 }); sfx.portal?.();
  UI.log(`${m.name}のそばへ跳んだ`, '#b89aff');
  return null;
}
// 待機所(迷宮の入口。仲間と潜る時): 部屋コードと、集まった仲間を画面に出す
let waitKey = '';
function updateWaitHall() {
  let el = $('waitHall');
  const on = !!G.net && G.floor === 0 && !!G.player;
  if (!on) { if (el) el.classList.add('hidden'); waitKey = ''; return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'waitHall';
    const st = document.createElement('style');
    st.textContent = '#waitHall{position:absolute;left:50%;top:14px;transform:translateX(-50%);min-width:340px;max-width:min(560px,70vw);padding:12px 20px 12px;text-align:center;pointer-events:none;background:linear-gradient(180deg,rgba(14,9,20,.86),rgba(8,5,12,.7));border:1px solid rgba(216,180,106,.4)}#waitHall.hidden{display:none}#waitHall .wt{font-size:13px;letter-spacing:.5em;text-indent:.5em;color:#a89a7a}#waitHall .wc{font-family:Cinzel,Consolas,monospace;font-size:34px;letter-spacing:.3em;text-indent:.3em;color:#fff2cc;text-shadow:0 0 18px rgba(216,180,106,.5);margin:2px 0 4px}#waitHall .wm{display:flex;flex-wrap:wrap;gap:6px 14px;justify-content:center;font-size:15px;margin:6px 0 6px}#waitHall .wm span{color:#8a7e66}#waitHall .wm span.ok{color:#bfe8b0}#waitHall .wn{font-size:13.5px;color:#cfc4a8;line-height:1.7}';
    document.head.appendChild(st); ($('hud') || document.body).appendChild(el);
  }
  el.classList.remove('hidden');
  const people = G.mages.filter(m => m.kind !== 'bot'), at = m => portal && m.pos.distanceTo(portal.position) < 7;
  const here = people.filter(at).length;
  const key = (G.roomCode || '') + '|' + people.map(m => m.name + (at(m) ? 1 : 0)).join(',');
  if (key === waitKey) return; waitKey = key;
  el.innerHTML = `<div class="wt">待 機 所</div>${G.roomCode ? `<div class="wc">${G.roomCode}</div>` : ''}
    <div class="wm">${people.map(m => `<span class="${at(m) ? 'ok' : ''}">${at(m) ? '◆' : '◇'} ${String(m.name).replace(/[<>&]/g, '')}</span>`).join('')}</div>
    <div class="wn">${G.roomCode ? '上の部屋コードを仲間に伝える(Esc →「仲間と潜る」でコピー)。' : ''}祭壇で属性に誓い、全員が北の門の前に集まったら、誰かが ${keyOf('interact')} で降りる。<br>門の前 ${here} / ${people.length} 人</div>`;
}
function interact() {
  const p = G.player;
  if (!p.alive || p.downed) return;
  if(arenaDoorNear(p.pos)){
    const left=sealNeed()-(G.floorStats?.kills||0);
    if(left>0){UI.log(`封印はまだ固い — 声を失ったものを、あと ${left} 体鎮めよ`,'#d8b8ff');return;}
    if(G.isHost)openArenaDoor();else G.net?.send({t:'arenaOpen',to:G.hostId});return;}
  // 聖域の書見台: 魔導書を広げて呪文を書き直せる
  if (G.sanctuary && p.pos.distanceTo(G.sanctuary.lecternPos) < 2.2) { if(saveSnapshot()){sfx.learn();UI.log('聖域に記録した。次回はここから再開する。','#d6e5bb');} return; }
  if (G.floor === 0) {
    const s = shrineNear(p.pos);
    if (s) { chooseElement(s.el); return; }
    if (portal && p.pos.distanceTo(portal.position) < 2.4) {
      const people = G.mages.filter(m => m.kind !== 'bot');
      const here = people.filter(m => m.pos.distanceTo(portal.position) < 7).length;
      if (here < people.length) { UI.log(`仲間を待っている — 門の前に ${here}/${people.length} 人。全員がそろうと降りられる`, '#ffe08a'); return; }
    }
  }
  { const dn = fallenNear(p);
    if (dn) {
      if (p.mp < BIG_COST) { UI.log(`${dn.name}を起こすには魔力が${BIG_COST}要る(今 ${Math.floor(p.mp)})`, '#ff9a8a'); sfx.fizzle?.(p.pos); return; }
      p.mp -= BIG_COST; G.fx.heal(dn, 30, p, false, true); sfx.heal?.(dn.pos); UI.log(`${dn.name}を起こした(魔力 −${BIG_COST})`, '#8dffb0'); return; } }
  if (coopInteract(p)) return;
  if (roomInteract(p)) return;
  if (gimmickInteract(p)) return;
  if (portal && p.pos.distanceTo(portal.position) < 2.4) {
    if (guardianAlive()) { UI.log('門番が転移陣を守っている — 倒さねば先へは進めない', '#ff9a8a'); sfx.fizzle?.(p.pos); return; }
    if (G.isHost) nextFloor(); else { G.net.send({ t: 'portalReq', to: G.hostId }); UI.log('部屋の主に転移を要請した'); }
    return;
  }
  let best = null, bd = 2.6;
  for (const k of G.pickups) { const d = k.pos.distanceTo(p.pos); if (d < bd && !k.opened) { bd = d; best = k; } }
  const fullOf = { herb: 'herb', crystal: 'crystal', loot: best?.data?.mat }[best?.kind];
  if (best && fullOf && invFull(fullOf)) { UI.log(`${itemName(fullOf)}はもう持てない(1種類 ${INV_CAP}個まで)`, '#a8a090'); return; }
  if (best) { if (best.kind === 'crystal' || (best.kind === 'chest' && !best.data?.frozen)) startWork(best); else pickUp(best); }
}

// ---------- 掘る・こじ開ける (調べるを押し続ける) ----------
// 魔晶は小槌で三度叩いて砕き取る。宝箱は蓋をこじ開ける。離す・離れると中断
function startWork(k) {
  if (G.work) return;
  const dur = k.kind === 'crystal' ? 1.5 : k.data?.rich ? 1.9 : 1.25, hits = k.kind === 'crystal' ? (k.mineHits || 0) : 0;
  // 魔晶は途中まで砕いた分を覚えていて、続きから叩ける
  G.work = { k, t: hits * dur / 3, dur, hits, rattle: 0 };
}
function endWork(done) {
  const w = G.work; if (!w) return;
  G.work = null; $('workRing').classList.add('hidden');
  if (!done) { if (w.k.kind === 'crystal') { w.k.mineHits = w.hits; w.k.mesh.rotation.z = 0; } else if (w.k.mesh.userData.lid && !w.k.opened) w.k.mesh.userData.lid.rotation.x = 0; }
}
function updateWork(dt) {
  const w = G.work; if (!w) return;
  const p = G.player, k = w.k;
  if (!isDown('interact') || !p.alive || p.downed || k.pos.distanceTo(p.pos) > 3.2 || !G.pickups.includes(k) || G.uiOpen) { endWork(false); return; }
  w.t += dt;
  const prog = Math.min(1, w.t / w.dur);
  const ring = $('workRing'); ring.classList.remove('hidden'); ring.style.setProperty('--p', (prog * 100).toFixed(1) + '%');
  ring.querySelector('span').textContent = k.kind === 'crystal' ? '砕き取る' : 'こじ開ける';
  if (k.kind === 'crystal') {
    const n = Math.min(3, Math.floor(prog * 3 + 1e-4));
    while (w.hits < n) {
      w.hits++;
      const at = k.pos.clone().setY(k.pos.y + 0.45);
      G.fx.burst(at, 0x7ab8ff, 26, { speed: 4, up: 1.6 });
      G.fx.burst(at, 0xffd090, 10, { speed: 7, up: 1 });
      sfx.hit(at); G.shake = Math.max(G.shake || 0, 0.12);
      chipCrystal(k, w.hits);
    }
    k.mesh.rotation.z = Math.sin(w.t * 60) * 0.02 * (1 - prog);
  } else {
    const lid = k.mesh.userData.lid;
    if (lid) lid.rotation.x = -0.22 * prog - Math.abs(Math.sin(w.t * 22)) * 0.04;
    if ((w.rattle -= dt) <= 0) { w.rattle = 0.32; sfx.step(k.pos); }
  }
  if (prog >= 1) { endWork(true); pickUp(k); if (k.kind === 'crystal') sfx.crumble?.(k.pos); }
}

// 魔晶の欠け: 叩くたびに柱が折れて飛ぶ。小さい柱から欠け、三度目で太い柱ごと砕け散る
const chips = [];
function chipCrystal(k, hit) {
  const lean = k.mesh.userData.lean; if (!lean) return;
  const shards = lean.children.filter(c => c.isGroup && c.parent === lean && !c.userData.gone);
  // 小さい柱(低い物)から先に
  shards.sort((a, b) => a.children[0].geometry.parameters.height - b.children[0].geometry.parameters.height);
  const n = hit >= 3 ? shards.length : Math.ceil(shards.length / (4 - hit));
  const c = k.pos.clone().setY(k.pos.y + 0.3);
  for (const sh of shards.slice(0, n)) {
    sh.userData.gone = true;
    scene.attach(sh); // 世界の位置のまま魔晶から外す
    const out = sh.getWorldPosition(new THREE.Vector3()).sub(c).setY(0);
    if (out.lengthSq() < 1e-4) out.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    out.normalize().multiplyScalar(1.5 + Math.random() * 2.5);
    chips.push({ o: sh, v: new THREE.Vector3(out.x, 2 + Math.random() * 2.5, out.z), spin: new THREE.Vector3(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5), floor: k.pos.y, life: 1.6 });
  }
  // 割れた瞬間に光る
  const glow = lean.children.find(o => o.isSprite); if (glow) glow.material.opacity = 0.5;
}
function updateChips(dt) {
  for (let i = chips.length - 1; i >= 0; i--) {
    const ch = chips[i];
    ch.life -= dt;
    ch.v.y -= 9.8 * dt;
    ch.o.position.addScaledVector(ch.v, dt);
    ch.o.rotation.x += ch.spin.x * dt; ch.o.rotation.y += ch.spin.y * dt; ch.o.rotation.z += ch.spin.z * dt;
    if (ch.o.position.y < ch.floor + 0.03) { ch.o.position.y = ch.floor + 0.03; ch.v.y *= -0.3; ch.v.x *= 0.6; ch.v.z *= 0.6; ch.spin.multiplyScalar(0.5); }
    if (ch.life < 0.4) ch.o.scale.setScalar(Math.max(0.01, ch.life / 0.4));
    if (ch.life <= 0) { scene.remove(ch.o); chips.splice(i, 1); }
  }
}

// ---------- 門番: 各層の転移陣の前に立つ強い魔物 ----------
// 詠灰竜: 大技の予兆を避け、逆鱗露出中に詠唱する。旧門番用の同期処理も下に残す。
const guardianAlive = () => G.enemies.some(e => e.guardian && e.alive);
G.guardianAlive = guardianAlive;
function placeGuardian(d, floor, seed) {
  if (floor <= 0 || G.noSave) return;
  const party = G.net ? Math.max(1, G.net.players?.size || 1) : 1;
  // 主のいる層は、主がそのまま門番を兼ねる
  const lord = G.enemies.find(e => e.boss);
  let g = lord;
  if (!g) {
    g = new Enemy(`g${floor}`, 'dragon', d.portal.clone(), floor, true);
    // ひとりでもかなり手強く(仲間がいれば人数で更に強くなる)
    g.dmg *= party > 1 ? 1.2 : 1.15; g.keen = true;
    G.enemies.push(g);
  }
  g.guardian = true;
  g.bossKind = 'dragon';
  g.dragonElement = dragonElement(floor, g.final);
  g.maxHp = g.hp = dragonHp(floor, party, g.final);
  g.meteorT = 6; g.elemT = 4; g.gElem = null;
  for (const m of meteors.splice(0)) for (const o of [m.ring, m.fill, m.rock]) scene.remove(o); // 前の層の隕石を片付ける
  g.name = `【${g.final ? '終章・' : ''}${DRAGON_PROFILES[g.dragonElement].name}】`;
  g.hpBar.position.y = 11;
  g.leash = d.portal.clone(); // 転移陣から離れすぎない
  const entrance=d.arena?.gates[0];
  if(entrance){g.pos.copy(d.portal).add(new THREE.Vector3(-entrance.dx*2.8,0,-entrance.dz*2.8));g.yaw=Math.atan2(-entrance.dx,-entrance.dz);g.root.position.copy(g.pos);}
  // 協力は既存の合唱ボーナスで報いる。人数必須の無敵結界は張らない。
  if (portal?.userData?.disc) { portal.userData.disc.material.color.setHex(0xff4040); }
}
// 結界の見た目と状態(部屋の主が決め、仲間へ知らせる)
function setBarrier(e, on, send = true) {
  e.barrier = on;
  if (on && !e.barrierMesh) {
    e.barrierMesh = new THREE.Mesh(new THREE.SphereGeometry(1.6 * (e.T?.radius || 0.5) + 0.9, 24, 16), new THREE.MeshBasicMaterial({ color: 0xc080ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    e.barrierMesh.position.y = 1.2; e.root.add(e.barrierMesh);
  }
  if (e.barrierMesh) e.barrierMesh.visible = on;
  if (!on) { e.barrierT = G.time + 14; G.fx.burst(e.pos.clone().setY(1.4), 0xc080ff, 80, { speed: 6, up: 2 }); sfx.crumble?.(e.pos); UI.log('門番の結界が砕けた — 今のうちに!', '#d0a0ff'); }
  else if (G.player && e.pos.distanceTo(G.player.pos) < 25) UI.log('門番が結界をまとった — 二人以上で、3秒のうちに術を当てて砕け', '#d0a0ff');
  if (send) G.net?.send({ t: 'gbar', id: e.id, on });
}
G.guardHit = (e, src) => {
  // 結界: 3秒のうちに違う魔導師の術が二つ当たると砕ける
  e.gHits = (e.gHits || []).filter(h => G.time - h.t < 3);
  if (src?.isMage) e.gHits.push({ id: src.id, t: G.time });
  if (new Set(e.gHits.map(h => h.id)).size >= 2) { e.gHits = []; setBarrier(e, false, true); return 1; }
  return 0.08; // 結界の上からはほとんど通らない
};
// 門番の属性: その属性は効きにくく、反対の属性が弱点になる。15秒ごとに移ろう
const OPP_EL = { fire: 'ice', ice: 'fire', thunder: 'wind', wind: 'thunder', holy: 'void', void: 'holy' };
function applyGuardElem(e, el, send = true) {
  e.gElem = el;
  e.T = { ...ENEMY_TYPES[e.type], weak: [OPP_EL[el]], resist: [el] };
  const col = EL_INFO[el].color;
  if (!e.gAura) {
    e.gAura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
    e.gAura.scale.set(4, 4, 1); e.gAura.position.y = 1.4; e.root.add(e.gAura);
  }
  e.gAura.material.color.setHex(col);
  if (e.rimU) e.rimU.color.value.setHex(col);
  G.fx.burst(e.pos.clone().setY(1.5), col, 60, { speed: 4, up: 2 });
  if (G.player && e.pos.distanceTo(G.player.pos) < 30) {
    UI.floatText(e.pos.clone().add(new THREE.Vector3(0, 2.6, 0)), `${EL_INFO[el].name}をまとった`, '#' + new THREE.Color(col).getHexString());
    UI.log(`門番が${EL_INFO[el].name}をまとった — ${EL_INFO[el].name}は効きにくく、弱点は${EL_INFO[OPP_EL[el]].name}`, '#' + new THREE.Color(col).getHexString());
  }
  if (send) G.net?.send({ t: 'gelem', id: e.id, el });
}
// 隕石: 狙った場所の床に赤い陣が満ちていき、満ちた瞬間に落ちる。陣の中にいると大きな傷
const meteors = [];
function castMeteor(e, x, z, el, send = true) {
  const y = (G.dungeon?.hgt && heightAtXZ(x, z)) || 0;
  const col = EL_INFO[el]?.color || 0xff5a20;
  const R = 2.6;
  const ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.12, R, 40), new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(R, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  for (const o of [ring, fill]) { o.rotation.x = -Math.PI / 2; o.position.set(x, y + 0.05, z); scene.add(o); }
  fill.scale.setScalar(0.01);
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), new THREE.MeshStandardMaterial({ color: 0x3a1a10, emissive: col, emissiveIntensity: 2.2, flatShading: true }));
  rock.position.set(x + 6, y + 18, z - 4); rock.visible = false; scene.add(rock);
  meteors.push({ e, x, y, z, el, R, ring, fill, rock, t: 0, warn: 2.0, fall: 0.55 });
  if (send) G.net?.send({ t: 'gmet', id: e.id, x, z, el });
  if (G.player && Math.hypot(G.player.pos.x - x, G.player.pos.z - z) < 12) sfx.growl?.(new THREE.Vector3(x, y, z));
}
function heightAtXZ(x, z) { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); return G.dungeon.hgt?.[cz * W + cx] || 0; }
function updateMeteors(dt) {
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i]; m.t += dt;
    const k = Math.min(1, m.t / m.warn);
    m.fill.scale.setScalar(Math.max(0.01, k));
    m.ring.material.opacity = 0.5 + 0.4 * Math.abs(Math.sin(m.t * (6 + k * 10)));
    if (m.t > m.warn - m.fall) {
      const f = Math.min(1, (m.t - (m.warn - m.fall)) / m.fall);
      m.rock.visible = true; m.rock.position.set(m.x + 6 * (1 - f), m.y + 0.5 + 18 * (1 - f), m.z - 4 * (1 - f)); m.rock.rotation.x += dt * 8;
      if (Math.random() < 0.8) G.particles?.emit(m.rock.position.clone(), new THREE.Vector3(0, 1, 0), EL_INFO[m.el]?.color || 0xff6a20, 0.6, 0.6);
    }
    if (m.t >= m.warn) {
      const at = new THREE.Vector3(m.x, m.y + 0.6, m.z), col = EL_INFO[m.el]?.color || 0xff6a20;
      G.fx.burst(at, col, 140, { speed: 9, up: 3 }); G.fx.flash?.(at, col, 50, 0.4, 16); sfx.crumble?.(at);
      const p = G.player;
      if (p && p.alive && !p.downed) {
        const d = Math.hypot(p.pos.x - m.x, p.pos.z - m.z);
        if (d < 14) G.shake = Math.max(G.shake || 0, 0.6 * (1 - d / 14));
        if (d < m.R) { G.fx.damage(p, 50, [m.el], m.e, {}); UI.floatText(p.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), '隕石の直撃!', '#ff6a40'); }
      }
      for (const o of [m.ring, m.fill, m.rock]) { scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
      meteors.splice(i, 1);
    }
  }
}
function updateGuardians(dt) {
  updateMeteors(dt);
  let alive = false;
  for (const e of G.enemies) {
    if (!e.guardian || !e.alive) continue;
    alive = true;
    if (e.type === 'dragon') continue; // 専用AIと重ねて隕石・属性変化を発動しない
    // 部屋の主の端末が、隕石と属性の移ろいを決めて仲間へ知らせる
    if (G.isHost !== false) {
      const heroes = G.mages.filter(m => m.team === 'hero' && m.alive && !m.downed && m.pos.distanceTo(e.pos) < 26);
      if (heroes.length) {
        e.meteorT -= dt;
        if (e.meteorT <= 0) {
          e.meteorT = Math.max(4.5, 7.5 - G.floor * 0.15) * (heroes.length > 1 ? 0.75 : 1);
          const tgt = heroes[Math.floor(Math.random() * heroes.length)];
          const lead = tgt.vel ? tgt.vel.clone().multiplyScalar(0.6) : new THREE.Vector3();
          castMeteor(e, tgt.pos.x + lead.x, tgt.pos.z + lead.z, e.gElem || 'fire', true);
        }
        e.elemT -= dt;
        if (e.elemT <= 0) {
          e.elemT = 15;
          const els = ['fire', 'ice', 'thunder', 'wind', 'holy', 'void'].filter(x => x !== e.gElem);
          applyGuardElem(e, els[Math.floor(Math.random() * els.length)], true);
        }
      }
    }
    if (e.gAura) e.gAura.material.opacity = 0.4 + Math.sin(G.time * 3) * 0.15;
    if (e.barrierMesh?.visible) { e.barrierMesh.rotation.y += dt * 0.6; e.barrierMesh.material.opacity = 0.14 + Math.sin(G.time * 4) * 0.05; }
    if (G.isHost !== false && G.net && (G.net.players?.size || 1) > 1 && !e.barrier && e.barrierT && G.time > e.barrierT) setBarrier(e, true, true);
    // 転移陣を守る: 離れすぎたら戻る
    if (e.leash && e.pos.distanceTo(e.leash) > 14 && e.home !== e.leash) e.home = e.leash;
  }
  // 倒したら転移陣が開く
  if (G.guardWasAlive && !alive && G.floor > 0) {
    UI.banner('門番を討った', '転移陣が開いた — 次の層へ進める', 4);
    if (portal?.userData?.disc) portal.userData.disc.material.color.setHex(0xa080ff);
    sfx.learn?.();
  }
  G.guardWasAlive = alive;
}

// ---------- 味方に当たった術 ----------
// 傷はほんの少し。その代わり属性ごとのいたずらな状態(声が変わる・縮む・あべこべ…)が掛かる
const FF_KIND = { fire: 'high', ice: 'low', thunder: 'robot', wind: 'drunk', holy: 'echo', void: 'invert' };
G.onFriendlyFire = (caster, t, spell, pl) => {
  if (!t || t._ffT > G.time) return;
  t._ffT = G.time + 2;
  const atk = pl.atk || [];
  const kind = atk.includes('freeze') ? 'tiny' : atk.includes('bind') ? 'invert' : atk.includes('poison') ? 'drunk' : atk.includes('impact') ? 'giant' : FF_KIND[spell.elements[0]] || 'giant';
  applyMischief(t, kind, true, 14);
  G.fx.damage(t, Math.min(6, (pl.dmg || 0) * 0.08), spell.elements, caster, {});
  UI.floatText(t.pos.clone().add(new THREE.Vector3(0, 1.0, 0)), '味方に命中! ' + MISCHIEF[kind].name, '#e0a0ff');
  if (caster === G.player) G.achieve('OOPS');
  if (caster === G.player) UI.log(`${t.name}に当ててしまった — ${MISCHIEF[kind].name}になった`, '#e0a0ff');
};

// ---------- ネットワーク ----------
const findMage = id => G.mages.find(m => m.id === id);
const findAny = id => findMage(id) || G.enemies.find(e => e.id === id);
const REMOTE_COLORS = [0x6a2a2a, 0x2a4a6a, 0x4a6a2a, 0x6a4a2a, 0x5a2a6a, 0x2a6a5a];
const netWait = [];
function onNet(m) {
  if (!G.netReady) { netWait.push(m); return; }
  switch (m.t) {
    case 'roster': { setTimeout(refreshMp, 0);
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
        r.netId = m.from; r.netPos = new THREE.Vector3(m.x, m.y || 0, m.z); G.mages.push(r);
      }
      if (m.lk) r.setLook(m.lk);
      r.netPos.set(m.x, m.y || 0, m.z); r.yaw = m.yaw; r.hp = m.hp; r.shield = m.sh; r.downed = m.downed; r.alive = m.alive; r.kills = m.kills;
      if (m.chant !== r.chantText) r.setChant(m.chant, m.n);
      break;
    }
    case 'chant': { const r = findMage(m.id); if (r) { r.setChant(m.text, m.n); if (m.text) G.hearChant(r, m.text); } break; }
    case 'cast': { const r = findMage(m.id); if (r) { G.fx.cast(r, G.fx.spellFromIds(m.words), m.aim); noteCast(r.id, m.words); if (m.chorus) UI.log(`${r.name}と合唱詠唱!`, '#ffd76a'); } break; }
    case 'dmg': G.fx.damage(G.player, m.amount, m.elements, findAny(m.src), { melee: m.opts?.melee, dir: m.opts?.dir, power: m.opts?.power, tier: m.opts?.tier, silent: m.opts?.silent });
      // 守護者の固有技の追加の効き目(鈍る・燃える)は、受けた本人の側で掛ける
      if (m.opts?.fx === 'slow') G.player.status.slow = { t: 3 }; else if (m.opts?.fx === 'burn') G.player.status.burn = { t: 3, dps: 4, src: findAny(m.src) };
      break;
    case 'heal': G.fx.heal(G.player, m.amount, findAny(m.src), false, !!m.revive); break;
    case 'shield': G.fx.shield(G.player, m.amount, m.dur, m.thorns); break;
    case 'edmg': { const e = G.enemies.find(x => x.id === m.eid); if (e && G.isHost) G.fx.damage(e, m.amount, m.elements, findAny(m.src), { dir: m.dir, power: m.power, tier: m.tier, atk: m.atk, hitPoint: m.hitPoint, echo: m.echo }); break; }
    case 'chat': { const who=findMage('p'+m.from);if(who&&typeof m.text==='string')UI.log(who.name+'：'+m.text.slice(0,280),'#cfdae5');break;}
    case 'kn': { const r = findMage('p' + m.from); if (r && Array.isArray(m.ids)) r.knownWords = new Set(m.ids); break; }
    case 'eatk': { if (G.isHost) break; const e = G.enemies.find(o => o.id === m.id); if (e && e.alive) { if (m.v) e.startSwing(m.v); else e.attackAnim = 1; } break; }
    case 'es': {
      if (G.isHost) break;
      if(G.dungeon?.arena&&['dormant','opening','open','active','cleared'].includes(m.arena)){if(m.arena==='opening'&&G.dungeon.arena.phase!=='opening')G.dungeon.arena.openAt=G.time;G.dungeon.arena.phase=m.arena;}
      for (const [id, x, z, yaw, hp, dragon] of m.e) {
        const e = G.enemies.find(o => o.id === id); if (!e || !e.alive) continue;
        e.netTarget.set(x, 0, z); e.yaw = yaw; if (e.hp !== hp) { e.hp = hp; e.updateHpBar(); }
        if (e.type === 'dragon' && dragon) { e.dragon = dragon; if (dragon.maxHp > 0) e.maxHp = dragon.maxHp; }
      }
      break;
    }
    case 'gmet': { const e = G.enemies.find(x => x.id === m.id); if (e) castMeteor(e, m.x, m.z, m.el, false); break; }
    case 'gelem': { const e = G.enemies.find(x => x.id === m.id); if (e) applyGuardElem(e, m.el, false); break; }
    case 'gbar': { const e = G.enemies.find(x => x.id === m.id); if (e) setBarrier(e, m.on, false); break; }
    case 'espawn': spawnEnemy(m.id, m.type, new THREE.Vector3().fromArray(m.pos), m.floor, m.summoner); break;
    case 'ekill': { const e = G.enemies.find(o => o.id === m.id); if (e && e.alive) { e.hp = 0; G.fx.kill(e, null); G.onEnemyKilled(e, true); } break; }
    case 'gim': case 'gimUsed': gimmickNet(m); break;
    case 'combo': { const e = G.enemies.find(o => o.id === m.eid); if (e) UI.floatText(e.pos.clone().add(new THREE.Vector3(0, 2.0, 0)), '連携!', '#ffe08a'); break; }
    case 'loot': for (const l of m.items) addPickup(l.id, 'loot', new THREE.Vector3(l.x, l.y||0, l.z), { mat: l.mat, gear:l.gear }); break;
    case 'pick': { const k = G.pickups.find(o => o.id === m.id); if (k) pickUp(k, true); break; }
    case 'dig': applyDig(m.cells, true); break;
    case 'rev': roomNet(m); break;
    case 'coop': coopNet(m); break;
    case 'msc': mischiefNet(m); break;
    case 'hz': triggerHazard(m.i, false, hazardHooks(null), {}, m.mode); break;
    case 'ecast': { const e = G.enemies.find(x => x.id === m.eid || x.id === m.id); if (e) G.fx.cast(e, G.fx.spellFromIds(m.words), m.aim); break; }
    case 'floor': if (m.sync && m.floor === G.floor && m.seed === G.dungeon.seed) break;
      showLoading(m.reset ? '迷宮の入口へ戻される' : m.floor === 0 ? '迷宮の入口へ' : `第${m.floor}層へ降りている`); setTimeout(() => hideLoading(600), 0);
      if (m.reset) wipeProgress(); setupFloor(m.seed, m.floor, !!m.reset); sfx.portal();
      if (m.reset && !G.noSave) UI.banner('全滅', '魔導書は白紙に戻った — 覚えた言霊も、書いた呪文も、装備も、すべて失った', 5); else if (m.floor > 0) UI.banner(`第${m.floor}層`, '迷宮は形を変えた', 3); break;
    case 'arenaOpen': {const who=findMage('p'+m.from);if(G.isHost&&who?.alive&&arenaDoorNear(who.pos)&&(G.floorStats?.kills||0)>=sealNeed())openArenaDoor();break;}
    case 'portalReq': if (G.isHost) nextFloor(); break;
    case 'flash': if (G.isHost) for (const e of G.enemies) if (e.alive && Math.hypot(e.pos.x - m.x, e.pos.z - m.z) < 10) e.stun = 2.5; break;
    case 'down': { const r = findMage('p' + m.from); if (r) UI.log(`${r.name}が${m.pvp ? '討たれた' : '倒れた'}`, '#ff9a8a'); if (m.pvp && m.by === G.player.id) G.player.kills++; break; }
  }
}

let netT = 0, esT = 0, knT = 0;
function netTick(dt) {
  if (!G.net) return;
  netT -= dt; esT -= dt; knT -= dt;
  if (knT <= 0) { knT = 5; G.net.send({ t: 'kn', ids: [...G.known] }); }
  const p = G.player;
  if (netT <= 0) {
    netT = 1 / 12;
    G.net.send({ t: 'st', id: p.id, name: p.name, lk: myLookStr(), x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(3), hp: Math.round(p.hp), sh: Math.round(p.shield), chant: p.chantText, n: p.chantWords || 0, downed: p.downed, alive: p.alive, kills: p.kills });
  }
  if (G.isHost && esT <= 0) {
    esT = 0.1;
    G.net.send({ t: 'es', arena:G.dungeon?.arena?.phase, e: G.enemies.filter(e => e.alive).map(e => [e.id, +e.pos.x.toFixed(2), +e.pos.z.toFixed(2), +e.yaw.toFixed(2), Math.round(e.hp), e.dragon ? { ...e.dragon, maxHp: e.maxHp } : null]) });
  }
  for (const m of G.mages) if (m.kind === 'remote') G.net.positionVoice(m.netId, m.pos.x, m.pos.z);
}

// ---------- メインループ ----------
let last = 0, exploreT = 0, stepT = 0, bob = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (G.debugHold) return; // 撮影中は、時間を外から 1コマずつ進める
  frame(now);
}
// 確かめる用: 画面の更新に頼らず、ゲームの時間を進める(秒)
G.debugAdvance = sec => { let t = last; for (let s = 0; s < sec - 1e-6; s += 1 / 30) { t += 1000 / 30; frame(t); } if (!G.debugHold) last = performance.now(); };
function frame(now) {
  const realDt = Math.min(0.05, (now - last) / 1000); last = now;
  // 名詠の瞬間は時の流れが緩む
  const dt = G.slowmo > 0 ? realDt * 0.3 : realDt;
  if (G.slowmo > 0) G.slowmo -= realDt;
  if (!G.net && G.uiOpen) { composer.render(); return; } // ひとり探索中は魔導書を開くと時が止まる
  G.time += dt;
  const p = G.player;

  updatePlayer(dt);
  updateArena();
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
    k.mesh.userData.animate?.(dt, G.time);
    if (k.kind === 'loot' && p.alive && !p.downed && k.pos.distanceTo(p.pos) < 1.3 && !(k.data.noPick > performance.now()) && !invFull(k.data.mat)) pickUp(k);
  }
  // 開けた宝箱(蓋が開く動き・中の輝き)
  for (const m of G.openChests || []) m.userData.animate?.(dt, G.time);
  if (portal) {
    portal.visible=G.floor===0||!guardianAlive();
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
  updateWaitHall(); updateUniques(dt);
  showElCard(G.floor === 0 ? shrineNear(p.pos)?.el : null); // 祭壇の前では属性の札を出す
  const fallen = fallenNear(p);
  if (fallen) hint = `${keyOf('interact')}: ${fallen.name}を起こす(魔力${BIG_COST}${p.mp < BIG_COST ? ' — 足りない' : ''})`;
  else if(arenaDoorNear(p.pos)){const left=sealNeed()-(G.floorStats?.kills||0);hint=left>0?`封印の大扉 — 封印が固い(魔物をあと ${left} 体鎮めよ)`:`${keyOf('interact')}: 封印の大扉を開ける — 入場後は討伐まで退路が閉ざされる`;}
  else if (G.sanctuary && p.pos.distanceTo(G.sanctuary.lecternPos) < 2.2) hint = `${keyOf('interact')}: 聖域に記録する（次回ここから再開）`;
  else if (G.floor === 0 && shrineNear(p.pos)) { const s = shrineNear(p.pos); hint = BOOK.affinityChosen ? (BOOK.affinityChosen === s.el ? `${EL_INFO[s.el].name}(${EL_INFO[s.el].sub}) — 誓いを立てた得意属性` : `${EL_INFO[s.el].name} — すでに${EL_INFO[BOOK.affinityChosen].name}に誓いを立てている`) : `${keyOf('interact')}: ${EL_INFO[s.el].name}(${EL_INFO[s.el].sub})に誓いを立てる(一度選ぶと変えられない)`; }
  else if (portal && p.pos.distanceTo(portal.position) < 2.4) hint = G.floor === 0 ? `${keyOf('interact')}: 迷宮の門をくぐる${G.resumeFloor > 0 ? `(記録の続き 第${G.resumeFloor}層へ)` : ''}(全員がそろってから)` : guardianAlive() ? '転移陣は門番に守られている — 門番を倒せ' : `${keyOf('interact')}: 転移陣に触れて次の層へ`;
  else if ((hint = coopHint(p, keyOf('interact')))) {}
  else if ((hint = roomHint(p, keyOf('interact')))) {}
  else if ((hint = gimmickHint(p, keyOf('interact')))) {}
  else if (G.work) hint = '';
  else for (const k of G.pickups) if (!k.opened && k.pos.distanceTo(p.pos) < 2.6) { hint = keyOf('interact') + ': ' + ({ scroll: '古文書を読む', herb: '霊草を摘む', crystal: '魔晶を砕き取る(押し続ける)', mushroom: '灯り茸を摘む', oddshroom: '怪し茸を食べる(何が起きるか…)', chest: k.data?.frozen ? '宝箱を開ける' : '宝箱をこじ開ける(押し続ける)', loot: '拾う' })[k.kind]; break; }
  if (!hint && G.held === 'item' && G.quick?.[G.heldSlot]) { const k = G.quick[G.heldSlot]; hint = `${keyOf('use')}: ${itemName(k)}を${k.startsWith('gear_') ? '装備する' : USABLE.includes(k) ? '使う' : (k === 'scroll' || k.startsWith('scroll_') || k.startsWith('tome_')) ? '読む' : '手に持っている(素材は使えない)'} ・ ${keyOf('item' + (G.heldSlot + 1))}をもう一度で魔導書へ`; }
  UI.prompt(hint);

  updateWork(dt);
  // 戦っていない間は、画面の表示を静かに薄くする
  if ((G.calmT = (G.calmT || 0) - dt) <= 0) {
    G.calmT = 0.5;
    const pl = G.player, near = pl && G.enemies.some(e => e.alive && (e.aggro || e.type === 'dragon' && G.dungeon?.arena?.phase === 'active') && e.pos.distanceToSquared(pl.pos) < 26 * 26);
    document.getElementById('hud')?.classList.toggle('calm', !!pl && !near && !pl.chanting && pl.hp >= pl.maxHp * 0.98 && !pl.downed);
  }
  updateGuardians(dt);
  updateChips(dt);
  updateCoop(dt, p);
  // 全滅判定(協力)
  if (G.mode === 'coop' && G.isHost) {
    const heroes = G.mages.filter(m => m.team === 'hero');
    if (heroes.every(m => m.downed || !m.alive)) {
      if (G.gameOverT == null) { G.gameOverT = 4; UI.banner('全滅', '迷宮が魔導師たちを呑み込んでいく…', 4); if (!G.noSave) { G.wiping = true; clearRun(); forgetBook(); } }
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
    if (m.respawnT <= 0) { m.alive = true; m.hp = m.maxHp; m.mp = m.maxMp; m.status = {}; m.stamina = 100; m.winded = false; m.pos.copy(m === G.player ? G.spawnPoint : (m.spawn || G.spawnPoint)); if (m === G.player) UI.log('再臨した', '#cfe8ff'); }
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
  // 押し終えた詠唱の確定 / 常時詠唱は2.2秒黙ったら確定
  const nowMs = performance.now();
  if (commitAt && nowMs > commitAt) commitChant();
  if (isContinuous() && chantBuf && nowMs - lastSpeech > 2200) commitChant();
  if (voiceDeadline && G.time > voiceDeadline) { voiceDeadline = 0; if (p.chanting && !typed && !chantBuf) clearChant(); }

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
  if (p.status.invert) move.negate(); // あべこべ
  if (p.status.drunk && move.lengthSq()) move.addScaledVector(right, Math.sin(G.time * 1.7) * 0.9).addScaledVector(fwd, Math.sin(G.time * 1.1) * 0.3); // 千鳥足
  // 詠唱・掲げるが終わったのに残っている状態を片付ける(走れなくなる不具合の対策)
  if (G.reading && !isDown('read')) G.reading = false;
  if (p.chanting && !typed && !pttHeld && !chantBuf && !commitAt && performance.now() - lastSpeech > 3500) clearChant();
  if (p.status.drinking) move.multiplyScalar(0.5); // 飲みながらは歩みが鈍る
  const spelling = p.chanting && p.chantKnown > 0; // 声が呪文として聞き取れてから足が重くなる
  const chantSlow = spelling ? [0.8, 0.58, 0.36][p.chantTier || 0] : 1; // 上級の詠唱ほど重い
  p.stamina ??= 100;
  const moving = move.lengthSq() > 0;
  const wantRun = isDown('sprint') && !spelling && !G.reading && moving;
  if (p.winded && p.stamina >= 35) p.winded = false; // 息が整った
  const running = wantRun && !p.winded && p.stamina > 0;
  if (running) { p.stamina = Math.max(0, p.stamina - dt * 18); p.staminaWait = 0.9; if (p.stamina <= 0) { p.winded = true; UI.log('息が切れた — 少し休めば走れる', '#c8e6a0'); } }
  else if ((p.staminaWait = (p.staminaWait || 0) - dt) <= 0) p.stamina = Math.min(100, p.stamina + dt * (moving ? 16 : 26));
  const sprint = (running ? 1.55 : G.reading ? 0.6 : 1) * chantSlow * (G.mut?.id === 'frenzy' ? 1 : 1);
  const vg = $('chantVignette'); if (vg) vg.style.opacity = spelling ? [0.18, 0.4, 0.68][p.chantTier || 0] : 0;
  if (move.lengthSq()) move.normalize().multiplyScalar(4.4 * sprint * p.speedMul * (1 + (G.eqT?.speed || 0))*(p.status.drinking?.5:1));
  if (p.pushV) { move.add(p.pushV); p.pushV.multiplyScalar(Math.max(0, 1 - dt * 5)); if (p.pushV.length() < 0.2) p.pushV = null; }
  p.vel.lerp(move, Math.min(1, dt * 28)); // 入力に素早く追従させ、滑る感じを無くす
  if (!move.lengthSq() && p.vel.lengthSq() < 0.05) p.vel.set(0, 0, 0);
  moveWithCollision(p.pos, p.vel.x * dt, p.vel.z * dt, p.radius, p.team);
  {
    const ground = heightAt(p.pos.x, p.pos.z);
    p.vy = (p.vy || 0) - 20 * dt;
    if(p.status.levitate){const target=floatHeight(p.pos);p.vy=Math.max(-3,Math.min(3,(target-p.pos.y)*5));}
    p.pos.y += p.vy * dt;
    if (p.pos.y <= ground) {
      if (!p.onGround && p.vy < -9) { G.shake = Math.min(1, (G.shake || 0) + 0.15); sfx.step(null); } // 高い所から着地
      p.pos.y = ground; p.vy = 0; p.onGround = true;
    } else if (p.pos.y > ground + 0.05) p.onGround = false;
    // 跳んでいる間に前へ押すと、目の前の縁(足元より1.3mまで)によじ登る
    if (!p.onGround && isDown('forward') && !p.mantle) {
      const f = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      const ax = p.pos.x + f.x * (p.radius + 0.55), az = p.pos.z + f.z * (p.radius + 0.55);
      const hA = heightAt(ax, az);
      if (!isWall(ax, az) && hA - p.pos.y > 0.15 && hA - p.pos.y <= 1.3) p.mantle = { to: hA, t: 0, f };
    }
    if (p.mantle) {
      p.mantle.t += dt; p.vy = 0;
      p.pos.y += (p.mantle.to + 0.02 - p.pos.y) * Math.min(1, dt * 14);
      if (p.mantle.t > 0.12) { moveWithCollision(p.pos,p.mantle.f.x*dt*3,p.mantle.f.z*dt*3,p.radius,p.team,CLIMB); }
      if (p.mantle.t > 0.3) { p.pos.y = Math.max(p.pos.y, heightAt(p.pos.x, p.pos.z)); p.mantle = null; p.onGround = true; G.shake = Math.min(1, (G.shake || 0) + 0.06); }
    }
  }

  // カメラ
  const speed = p.vel.length();
  G.stats.moved += speed * dt;
  if (G.reading) G.stats.read += dt;
  G.tutorial?.update(dt);
  updateTargetInfo();
  updateSanctuary(dt);
  updateSecrets(dt, p, UI);
  updateRoomEvents(dt, p);
  for (const spin of G.dungeon?.spinners || []) spin(dt); // からくりの間の歯車
  updateMischief(dt);
  if (G.floor === 0) updateShrines(dt);
  updateHazards(dt);
  updateBosses(dt);
  if (G.mut?.id === 'silence' && p.chanting && G.isHost) for (const e of G.enemies) if (e.alive && !e.aggro && e.pos.distanceTo(p.pos) < 26) { e.aggro = true; e.target = p; }
  updateGoals();
  if (G.sanctuary && !G.sanctuaryGreeted && inSanctuary(p.pos)) { G.sanctuaryGreeted = true; UI.banner('聖域', '降り立った場所の結界。焚き火が残るあいだ傷と魔力が少しずつ癒える', 4.5); sfx.heal(p.pos); }
  bob += dt * speed * 2.2;
  stepT -= dt * speed; if (stepT <= 0 && speed > 1) { stepT = 2.2; sfx.step(null); }
  const eye = p.downed || !p.alive ? 0.4 : 1.62 + (opts.headBob ? Math.sin(bob) * 0.04 * Math.min(1, speed / 4) : 0);
  // 段差を上った時は目の高さを滑らかに追わせる(一瞬で段の高さ分カクッと上がらないように)。落ちる時と大きな移動はそのまま
  const eyeY = p.pos.y + eye * eyeScale(p);
  if (camY == null || eyeY < camY || eyeY - camY > 2.5) camY = eyeY; else camY += (eyeY - camY) * Math.min(1, dt * 12);
  camera.position.set(p.pos.x, camY, p.pos.z);
  camera.rotation.set(p.pitch, p.yaw, p.downed ? 0.4 : p.status.drunk ? Math.sin(G.time * 1.3) * 0.14 : 0);
  if (G.shake > 0) { G.shake = Math.max(0, G.shake - dt * 1.6); const k = G.shake * 0.035 * (settings.shake ?? 100) / 100; camera.rotation.x += (Math.random() - 0.5) * k; camera.rotation.y += (Math.random() - 0.5) * k; }

  // 手元の書物
  // 音楽の曲調: 守護者と戦っている / 魔物に追われている / 聖域にいる / 探索している。詠唱中は音を下げる
  updateGimmicks(dt, p, G.time || 0);
  G.musicT = (G.musicT || 0) - dt;
  if (G.musicT <= 0) {
    G.musicT = 0.4;
    const boss = G.enemies.find(e => e.alive && e.type === 'dragon' && e.dragon);
    const fight = boss && G.dungeon?.arena?.phase === 'active' && boss.pos.distanceTo(p.pos) < 60;
    const chased = G.enemies.some(e => e.alive && e.aggro && e.type !== 'dragon' && e.pos.distanceToSquared(p.pos) < 22 * 22);
    setMusic(fight ? 'boss' : chased ? 'combat' : G.floor === 0 || G.inSanctuary?.(p.pos) ? 'sanct' : 'explore', { floor: Math.max(1, G.floor), phase2: !!fight && boss.dragon.phase === 2, el: boss?.dragon?.element || 'fire', final: !!boss?.final });
    setMusicDuck(!!p.chanting || pttHeld || isContinuous()); // 聞き取っている間は、音楽をマイクが拾わないように下げる
  }
  if (G.run && G.floor > 0 && !G.run.done && !G.noSave) G.run.time = (G.run.time || 0) + dt; // 旅の時計(迷宮の中にいる間だけ進む)
  VM.update(dt, { bob, chanting: p.chanting, chantWords: p.chantWords, reading: G.reading && G.held === 'grimoire', alive: p.alive && !p.downed, time: G.time, drinkK: p.status.drinking ? 1 - p.status.drinking.t / (p.status.drinking.d || 1) : -1, work: G.work ? { kind: G.work.k.kind, prog: Math.min(1, G.work.t / G.work.dur) } : null });
  // 頁を読む・めくる間は、手元を照らす光を弱める(紙が白く飛ばないように)
  const nearBook = Math.max(VM.readAmount, VM.flipAmount > 0 ? 1 : 0);
  staffLight.intensity = ((G.held === 'grimoire' ? 5 : 3) + (p.chanting ? 3 : 0)) * (1 - nearBook * 0.65);
  G.readAmount = nearBook;
}

// タイトル画面の背景(大書庫の景色)。ロビーが見えている間だけ動く
startTitle();
initLook();
initMp({ warp: id => warpToMate(id), close: () => closeMenu(), colorOf: id => { const m = G.mages?.find(x => x.id === 'p' + id); return m?.color; }, saveBefore: () => { try { if (!$('mSave').disabled) $('mSave').click(); } catch {} }, online: canOnline });
// メニューの「仲間と潜る」で始め直した時: 選んだ入り方で、そのまま迷宮へ入る
const autoNet = takeAuto();
if (autoNet && canOnline && (autoNet.mode === 'host' || autoNet.mode === 'join')) {
  if (autoNet.mode === 'host') hostCode = autoNet.code || hostCode;
  setNet(autoNet.mode); $('roomIn').value = autoNet.mode === 'host' ? hostCode : String(autoNet.code || '').toUpperCase();
  setTimeout(() => startGame(), 50);
} else initUpdates();   // 更新情報(まだ見ていない更新があれば、起動した時に出す)
