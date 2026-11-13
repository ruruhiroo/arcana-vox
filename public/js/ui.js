import { badges as mischiefBadges } from './mischief.js';
import { itemIcon } from './icons.js';
import { canCraft } from './carry.js';
// HUD・魔導書・調合・ミニマップ
import * as THREE from 'three';
import { G, clamp } from './state.js';
import { WORDS, WORD_BY_ID, CAT, compile, formula, tokenize, expandChant, chantGaps, chantCoverage, STARTER_WORDS, callName, CALL_WORDS, callTail, withCallName } from './lexicon.js';
import { W, H, CELL, lineOfSight } from './dungeon.js';
import { keyOf } from './controls.js';
import { SPIRITS, BOND_NAMES, bondProgress } from './spirits.js';
import { BESTIARY, BESTIARY_INTRO, GUARDIAN_LORE } from './bestiary.js';
import { ENEMY_TYPES } from './entities.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- 魔導書の永続化 ----------
const SAVE_KEY = 'arcana_vox_grimoire_v1';
// 呪文の研究: 覚えた言霊をすべて分類ごとに並べる(未習得の言霊は古文書で覚えるまで出てこない)
const CHIP_ORDER = [['target', '対象'], ['element', '力(属性)'], ['effect', '力(効果)'], ['form', '出し方'], ['mod', '修飾']]; // 締めは魔法の名(起句「放て」は出さない)
function chipGroups() {
  return CHIP_ORDER.map(([cat, label]) => {
    const ws = WORDS.filter(w => w.cat === cat && G.known.has(w.id));
    if (!ws.length) return '';
    return `<div class="chipgrp"><span class="chiplbl">${label}</span>${ws.map(w => `<span class="chip c-${w.cat}" data-w="${esc(w.text)}" title="${esc(w.text)}
${esc(w.meaning || '')}"><ruby>${esc(w.core)}<rt>${esc(w.ruby)}</rt></ruby></span>`).join('')}</div>`;
  }).join('');
}
export const BOOK = {
  known: [...STARTER_WORDS], understood: [...STARTER_WORDS], notes: {}, equip: {}, bag: [],
  spells: [
    { name: '初級強化魔術', text: '我に 覇気 放て', memo: '20秒間、自分の術の威力を1.3倍にする。戦いの前に。' },
    { name: '初級治癒魔術', text: '我に 癒息 放て', memo: '' },
    { name: '初級守護魔術', text: '我に 守護 放て', memo: '強打を受けても詠唱が乱れなくなる。' },
    { name: '初級治癒魔術(同胞)', text: '同胞に 癒息 放て', memo: '倒れた仲間を蘇生できる。' },
    { name: '灯火', text: '我に 灯火 放て', memo: '肩越しに光の玉が付き従い、暗い迷宮を照らす。「穿槍」を加えると照準地点に灯る。' },
  ],
  slots: [0, 1, 2, 3],
};
// 記録の枠(セーブスロット)。魔導書は枠ごとに別々に保存する
const BOOK_DEFAULT = JSON.stringify(BOOK);
let bookKey = SAVE_KEY;
// 道具袋の魔導書の札: 誓った属性の色と紋
const GSLOT_EL = { fire: ['#6a1c12', '#2a0a06', '#f0a850', '炎'], ice: ['#1c4466', '#0a1a2a', '#cfeaff', '氷'], thunder: ['#3a2466', '#140a2a', '#f0dc70', '雷'], wind: ['#1e5038', '#0a2014', '#d0eab0', '風'], holy: ['#e8dcb8', '#9a8a60', '#7a5a1a', '聖'], void: ['#26143a', '#08040e', '#b080e8', '闇'] };
let gslotEl;
// 守護者の登場: 画面の下寄りに、名を大きく静かに出す
export function bossTitle(name, sub = '') {
  let el = document.getElementById('bossTitle');
  if (!el) { el = document.createElement('div'); el.id = 'bossTitle'; el.innerHTML = '<div class="bt-sub"></div><div class="bt-name"></div><div class="bt-line"></div>'; document.body.appendChild(el); }
  el.querySelector('.bt-name').textContent = name; el.querySelector('.bt-sub').textContent = sub ? `— ${sub} の守護者 —` : '';
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}
export function setGrimoireElement(el) {
  if (el === gslotEl) return; gslotEl = el;
  const c = GSLOT_EL[el];
  document.querySelectorAll('.gslot .gcover').forEach(g => {
    g.style.background = c ? `linear-gradient(135deg, ${c[0]}, ${c[1]})` : '';
    g.style.borderColor = c ? c[2] : '';
    g.style.boxShadow = c ? `0 0 16px ${c[2]}55` : '';
    let em = g.querySelector('i.gel');
    if (!em) { em = document.createElement('i'); em.className = 'gel'; g.appendChild(em); }
    em.textContent = c ? c[3] : ''; em.style.color = c ? c[2] : '';
    g.querySelector('b').style.color = el === 'holy' ? '#3a2408' : '';
  });
}
export function setBookKey(k) { bookKey = k; }
export function loadBook() {
  for (const k of Object.keys(BOOK)) delete BOOK[k];
  Object.assign(BOOK, JSON.parse(BOOK_DEFAULT));
  let fresh = true;
  try { const s = JSON.parse(localStorage.getItem(bookKey)); if (s && s.known) { Object.assign(BOOK, s); fresh = false; } } catch {}
  // 旧来の短い詠唱(紅蓮 穿槍 放て)を、正式な詠唱文に書き直す
  if ((BOOK.chantVer || 0) < 3) {
    // 灯火(光源の魔法)を追加
    if (!BOOK.known.includes('light')) BOOK.known.push('light');
    if (!BOOK.spells.some(sp => /灯火/.test(sp.text))) BOOK.spells.push({ name: '灯火', text: '我に 灯火 放て', memo: '肩越しに光の玉が付き従い、暗い迷宮を照らす。「穿槍」を加えると照準地点に灯る。' });
  }
  if ((BOOK.chantVer || 0) < 3) { for (const sp of BOOK.spells) sp.text = expandChant(sp.text); BOOK.chantVer = 3; }
  if (BOOK.chantVer < 4) {
    // 呪文の名を位階つきに改める(自分で付けた名前はそのまま)
    const RENAME = { '紅蓮の槍': '中級炎魔術', '自己治癒': '初級治癒魔術', '守護の誓い': '初級守護魔術', '同胞への癒し': '中級治癒魔術' };
    for (const sp of BOOK.spells) if (RENAME[sp.name]) sp.name = RENAME[sp.name];
    if (!BOOK.spells.some(sp => sp.name === '初級炎魔術')) BOOK.spells.unshift({ name: '初級炎魔術', text: expandChant('汝に 紅蓮 放て'), memo: '最も短い攻撃の詠唱。威力は控えめだが消費が少ない。' });
    BOOK.chantVer = 4;
  }
  if (BOOK.chantVer < 6 && (BOOK.chantVer || 0) >= 1) {
    // 中級魔法は最初は持たない: 最初から書かれていた中級の呪文を外し、形の言霊(穿槍)も古文書で見つけ直す
    BOOK.spells = BOOK.spells.filter(sp => sp.name !== '中級炎魔術');
    for (const sp of BOOK.spells) if (sp.name === '中級治癒魔術') sp.name = '初級治癒魔術(同胞)';
    BOOK.known = BOOK.known.filter(id => id !== 'lance');
  }
  if (BOOK.chantVer < 5) {
    for (const sp of BOOK.spells) {
      const name = callName(compile(sp.text, null));
      if (name) sp.text = sp.text.replace(/\s*(今こそ)?解き放て\s*$/, ' ' + name).replace(/\s+放て\s*$/, ' ' + name);
    }
    BOOK.chantVer = 5;
  }
  if (BOOK.chantVer < 6) BOOK.chantVer = 6;
  if (BOOK.chantVer < 7) {
    // 出し方の言霊: 発射(穿槍)は最初から使える。威力アップの魔法(覇気)も最初から
    for (const id of ['lance', 'might']) { if (!BOOK.known.includes(id)) BOOK.known.push(id); if (!BOOK.understood?.includes(id)) BOOK.understood?.push(id); }
    const fire = BOOK.spells.find(sp => sp.name === '初級炎魔術');
    if (fire && !/穿槍/.test(fire.text) && !fire.call) fire.text = expandChant('汝に 紅蓮 穿槍') + ' ファイアランス';
    if (!BOOK.spells.some(sp => /覇気/.test(sp.text))) BOOK.spells.splice(1, 0, { name: '初級強化魔術', text: expandChant('我に 覇気') + ' ブースト', memo: '20秒間、自分の術の威力を1.3倍にする。戦いの前に。' });
    BOOK.chantVer = 7;
  }
  if (BOOK.chantVer < 8) {
    // 出し方(穿槍)を含む炎の呪文は中級になった。初級は「対象+属性+名」(迷宮へ降りる時に書き足す)
    for (const sp of BOOK.spells) if (sp.name === '初級炎魔術' && /穿槍/.test(sp.text)) sp.name = '中級炎魔術';
    BOOK.chantVer = 8;
  }
  // 白紙の魔導書には炎の中級呪文を入れない(攻撃呪文は入口の祭壇で選んだ属性のものが書かれる)
  if (fresh) BOOK.spells = BOOK.spells.filter(sp => sp.name !== '中級炎魔術');
  if ((BOOK.chantVer || 0) < 9) {
    // 詠唱文を短く流れるものに改めた: 書いてある呪文を新しい文に直す(結句の魔法の名は残す)
    // 古い詠唱文は、まず丸ごと核の言葉に戻す(古い文の一部が別の言霊と聞き違えられないように)
    const OLD = { fire: '紅蓮の業火よ、燃え盛れ', ice: '万象を凍てつかせよ、氷獄の吐息', thunder: '天を裂く雷霆よ、轟け', holy: '穢れを祓え、聖光の輝き', void: '深淵より這い出でよ、虚無の顎', wind: '荒れ狂え、颶風の咆哮', lance: '一条の穿槍となりて貫け', nova: '我を軸とし円環を描け', rain: '天より降れ、天雨の裁き', orbit: '衛星となりて我が周りを巡れ', enchant: '其の身に力を付与せよ', might: '内なる覇気よ、昂ぶれ', wall: '何人も通さぬ城壁よ、聳えよ', heal: '癒息の恵みよ、傷を塞げ', ward: '見えざる守護の盾よ、包み込め', haste: '時を置き去りに、神速の翼', enemy: '仇なす汝に', self: '我が身に宿れ', ally: '背を預けし同胞に', dual: '二重に重ねて', max: '器を超えし極大の', eternal: '永劫に続く', rune: '地に刻印を刻み', swift: '迅の如く', blood: '我が血を贄とし、血誓を結ぶ', ruin: '天地よ崩壊せよ、全て崩れ去れ', release: '今こそ解き放て', light: '灯火よ、冥き路を照らし出せ', freeze: '凍結の楔よ、其の身を縫い止めよ', bind: '束縛の鎖よ、影より伸びよ', impact: '衝撃となりて打ち砕け', poison: '蝕毒の霧よ、内より蝕め' };
    const olds = Object.entries(OLD).sort((x, y) => y[1].length - x[1].length);
    for (const sp of BOOK.spells) for (const [id, o] of olds) if (WORD_BY_ID[id]) sp.text = sp.text.split(o).join(' ' + WORD_BY_ID[id].core + ' ');
    for (const sp of BOOK.spells) { const m = sp.text.match(/\s([ァ-ヶー・]+)\s*$/), tail = m ? m[1] : callTail(sp.text); sp.text = expandChant(sp.text) + (tail ? ' ' + tail : ''); }
    BOOK.chantVer = 9;
  }
  if (BOOK.chantVer < 10) {
    // 締めの「今こそ放て」をやめ、魔法の名で締める
    for (const sp of BOOK.spells) sp.text = withCallName(sp.text);
    BOOK.known = BOOK.known.filter(id => id !== 'release'); BOOK.understood = (BOOK.understood || []).filter(id => id !== 'release');
    BOOK.chantVer = 10;
  }
  if ((BOOK.chantVer || 0) < 11) {
    // 転移と探知は、最初から持つ術ではなくなった(古文書から覚える影の術)。闇に誓った者だけは、そのまま持ち続ける
    if (!fresh && BOOK.affinityChosen !== 'void') {
      BOOK.known = BOOK.known.filter(id => id !== 'blink' && id !== 'survey'); BOOK.understood = (BOOK.understood || []).filter(id => id !== 'blink' && id !== 'survey');
      BOOK.spells = BOOK.spells.filter(s => !['短距離転移', '気配の探知'].includes(s.name));
    }
    BOOK.chantVer = 11;
  }
  BOOK.mastery ||= {};
  ensureUtilityBook();
  G.known = new Set(BOOK.known);
}
export function saveBook() {
  if (G.wiping) return; // 全滅の演出中は書き戻さない
  BOOK.known = [...G.known];
  try { localStorage.setItem(bookKey, JSON.stringify(BOOK)); } catch {}
}
// 全滅が決まった瞬間に記録を消す(演出の間にタイトルへ戻っても逃れられないように)
export function forgetBook() { try { localStorage.removeItem(bookKey); } catch {} }
// 全滅: 魔導書を白紙に戻す(覚えた言霊・書いた呪文・装備・秘伝書がすべて消える)
export function wipeBook() {
  try { localStorage.removeItem(bookKey); } catch {}
  loadBook(); saveBook();
}

// ---------- HUD ----------
const floats = [];
// 言霊にふりがなを振る (詠唱文はまるごと、核の語(紅蓮など)は真名の読みで)
const RUBY_MAP = {};
for (const w of WORDS) { RUBY_MAP[w.core] = `<ruby>${w.core}<rt>${w.ruby}</rt></ruby>`; RUBY_MAP[w.text] = w.rubyHtml; }
const RUBY_RE = new RegExp(Object.keys(RUBY_MAP).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
export const rubify = str => esc(str).replace(RUBY_RE, m => RUBY_MAP[m]);
// ホットバー用: 呪文を核の語だけに縮めて表示 (紅蓮・穿槍・放て)
const coreLine = text => tokenize(text).map(t => RUBY_MAP[WORD_BY_ID[t.id].core]).join('<i class="sep">・</i>');

// 持ち物6枠(1〜6キー)。素材・道具・未装着の装備はすべてこの枠に収まる。
// 転移・探知の言霊を覚えていれば、その呪文を本に書いておく(覚えた時にも呼ぶ)
export function ensureUtilityBook(){
  for(const [id,name]of [['blink','影渡り'],['survey','影の眼']])if((BOOK.known||[]).includes(id)&&!BOOK.spells.some(s=>compile(s.text,null).effects.includes(id))){const base=expandChant('我に '+WORD_BY_ID[id].core);BOOK.spells.push({name,text:base+' '+callName(compile(base,null)),memo:WORD_BY_ID[id].meaning});}
}
export const QUICK_DEFAULT = [null, null, null, null, null, null];
export function quickSlotsHtml(withKeys) {
  return G.quick.map((k, i) => {
    const c = k ? G.inv[k] || 0 : 0, key = withKeys ? `<span class="k">${keyOf('item' + (i + 1))}</span>` : `<span class="k">${i + 1}</span>`;
    const held = G.held === 'item' && G.heldSlot === i ? ' held' : '';
    if (!k || !c) return `<div class="slot item ic empty${held}" data-q="${i}">${key}</div>`;
    return `<div class="slot item ic${held} ${k === 'ether' && G.player?.status?.drinking ? 'using' : ''}" data-q="${i}" title="${esc(G.itemName?.(k) || k)}"><span class="pic">${G.carriedIcon?.(k)||itemIcon(k)}</span>${key}${c > 1 ? `<span class="c">${c}</span>` : ''}</div>`;
  }).join('');
}

export const UI = {
  bossTitle: (name, sub) => bossTitle(name, sub),
  floatText(pos, text, color = '#fff') {
    const el = document.createElement('div'); el.className = 'float'; el.textContent = text; el.style.color = color;
    $('floats').appendChild(el);
    floats.push({ el, pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 2.0, (Math.random() - 0.5) * 0.6)), t: 1.1 });
  },
  log(text, color) {
    const el = document.createElement('div'); el.textContent = text; if (color) el.style.color = color;
    const box = $('log'); box.prepend(el);
    while (box.children.length > 7) box.lastChild.remove();
    setTimeout(() => { el.style.opacity = 0; }, 6000); setTimeout(() => el.remove(), 7200);
  },
  banner(big, small = '', dur = 3.5) {
    const b = $('banner'); b.querySelector('.big').textContent = big; b.querySelector('.small').textContent = small;
    b.style.opacity = 1; clearTimeout(this._bt); this._bt = setTimeout(() => { b.style.opacity = 0; }, dur * 1000);
  },
  hurt(a) { const v = $('vignette'); v.style.opacity = Math.min(1, 0.3 + a / 30); clearTimeout(this._ht); this._ht = setTimeout(() => { v.style.opacity = 0; }, 250); },
  prompt(t) { const p = $('prompt'); if (p.textContent !== t) p.textContent = t; },

  setChantDisplay(text, final) {
    const el = $('chantText');
    if (!text) { el.innerHTML = ''; $('chantFormula').textContent = ''; return; }
    const toks = tokenize(text, G.known);
    if (!toks.some(t => t.known)) { el.innerHTML = ''; $('chantFormula').textContent = ''; return; } // 言霊でない言葉(ただの会話)は出さない
    // 一節ごとにまとめて折り返す(節の途中で改行しない)。長い詠唱は字を小さく
    el.innerHTML = `<span class="w ok">${text.trim().split(/\s+/).map(seg => `<span class="ph">${rubify(seg)}</span>`).join(" ")}</span>`;
    el.classList.toggle("long", text.length > 22);
    const sp = compile(text, G.known);
    // 言霊ごとに唱え切れたかを示す(どこで詰まったか分かるように)。✓=唱え切った / △=一部だけ(短縮)
    const lenient = G.lenientChant?.();
    const ids = [...new Set(toks.filter(t => t.known).map(t => t.id))];
    const parts = lenient ? '' : ids.map(id => { const c = chantCoverage(text, [id]); const w = WORD_BY_ID[id]; return c >= 0.8 ? `<span class="cp ok">✓ ${esc(w.text)}</span>` : `<span class="cp part">△ ${esc(w.text)} <small>${Math.round(c * 100)}%</small></span>`; }).join('');
    $('chantFormula').innerHTML = (parts ? `<div class="cparts">${parts}</div>` : '') + esc(formula(sp) + (toks.some(t => !t.known) ? '  (未習得の言霊は効力を持たない)' : ''));
  },
  micState(s) { const m = $('micState'); m.textContent = s; m.classList.toggle('on', /聴取|詠唱/.test(s)); },

  updateHUD() {
    const p = G.player; if (!p) return;
    $('hpBar').firstElementChild.style.width = clamp(p.hp / p.maxHp * 100, 0, 100) + '%';
    $('hpBar').lastElementChild.textContent = `生命 ${Math.ceil(Math.max(0, p.hp))} / ${p.maxHp}`;
    $('mpBar').firstElementChild.style.width = clamp(p.mp / p.maxMp * 100, 0, 100) + '%';
    $('mpBar').lastElementChild.textContent = `魔力 ${Math.floor(p.mp)} / ${p.maxMp}`;
    { const st = p.stamina ?? 100, sb = $('stBar'); sb.firstElementChild.style.width = st + '%'; sb.classList.toggle('winded', !!p.winded); sb.classList.toggle('full', st >= 100); }
    $('shBar').firstElementChild.style.width = clamp(p.shield / 60 * 100, 0, 100) + '%';
    const st = [];
    if (p.shield > 0) st.push(`守護${Math.ceil(p.shield)}`); if (p.status.burn) st.push('炎上'); if (p.status.slow) st.push('鈍足'); if (p.status.haste) st.push('神速');
    const might = p.status.might ? `<span class="buff might">覇気 威力×1.3 <b>${Math.ceil(p.status.might.t)}</b>秒</span>` : '';
    const odd = mischiefBadges(p).map(t => `<span class="buff odd">${esc(t)}</span>`).join('');
    $('statusIcons').innerHTML = might + odd + esc(st.join('  '));
    const mv = $('mightVignette'); if (mv) mv.style.opacity = p.status.might ? (p.status.might.t < 4 ? 0.5 + 0.5 * Math.sin(G.time * 10) : 1) : 0;
    $('floorLabel').textContent = G.floor === 0 ? '迷宮の入口' : `第${G.floor}層`;
    $('modeLabel').textContent = (G.mode === 'coop' ? '協力探索' : '探索PvP') + (G.net ? ' ・ オンライン' : '') + (G.mode === 'pvp' ? `  討伐 ${p.kills}` : '');
    const others = G.mages.filter(m => m !== p);
    $('party').innerHTML = others.map(m => {
      const hostile = m.team !== p.team;
      const st = !m.alive ? '(死亡)' : m.downed ? '(瀕死)' : '';
      const c = hostile ? '#ff8a7a' : '#' + new THREE.Color(m.color ?? 0xcfe8ff).lerp(new THREE.Color(0xffffff), 0.45).getHexString();
      return `<div class="pm${st ? ' down' : ''}" style="--c:${c}"><div class="nm"><span style="color:${c}">${esc(m.name)}</span><small>${st}</small></div><div class="bar"><div style="width:${clamp(m.hp / m.maxHp * 100, 0, 100)}%;background:${hostile ? '#c44' : c}"></div></div></div>`;
    }).join('');
    const dn = $('downed');
    if (p.downed) { dn.classList.remove('hidden'); dn.innerHTML = `倒れた…<br><small>仲間の「癒息」を待て (${Math.ceil(p.downT)})</small>`; }
    else if (!p.alive) { dn.classList.remove('hidden'); dn.innerHTML = `討たれた<br><small>${Math.ceil(p.respawnT || 0)}秒後に再臨</small>`; }
    else dn.classList.add('hidden');
  },

  renderHotbar() {
    G.quick ||= [...QUICK_DEFAULT];
    G.autoQuick?.();
    // 手に持つ書物 (Q で持ち替え)。魔導書を持っている間だけ詠唱できる
    let h = '';
    h += quickSlotsHtml(true);
    $('hotbar').innerHTML = h;
  },

  frame(dt) {
    const cam = G.camera, w = innerWidth, h = innerHeight;
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]; f.t -= dt; f.pos.y += dt * 0.8;
      const v = f.pos.clone().project(cam);
      if (v.z > 1 || f.t <= 0) { if (f.t <= 0) { f.el.remove(); floats.splice(i, 1); } else f.el.style.display = 'none'; continue; }
      f.el.style.display = ''; f.el.style.left = (v.x * 0.5 + 0.5) * w + 'px'; f.el.style.top = (-v.y * 0.5 + 0.5) * h + 'px';
      f.el.style.opacity = Math.min(1, f.t * 2);
    }
    this.minimap();
  },

  minimap() {
    const c = $('minimap'), g = c.getContext('2d'), d = G.dungeon, p = G.player;
    if (!d || !p) return;
    const S = c.width, view = 26, cs = S / view;
    const [pcx, pcz] = [p.pos.x / CELL, p.pos.z / CELL];
    g.clearRect(0, 0, S, S);
    g.save(); g.translate(S / 2, S / 2);
    for (let y = Math.floor(pcz - view / 2) - 1; y < pcz + view / 2 + 1; y++) for (let x = Math.floor(pcx - view / 2) - 1; x < pcx + view / 2 + 1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || !G.explored[y * W + x]) continue;
      g.fillStyle = d.grid[y * W + x] ? 'rgba(200,180,140,0.55)' : 'rgba(60,50,40,0.9)';
      g.fillRect((x - pcx) * cs, (y - pcz) * cs, cs + 0.5, cs + 0.5);
    }
    const dot = (pos, col, r = 3) => { g.fillStyle = col; g.beginPath(); g.arc((pos.x / CELL - pcx) * cs, (pos.z / CELL - pcz) * cs, r, 0, 7); g.fill(); };
    const [px, pz] = [Math.floor(d.portal.x / CELL), Math.floor(d.portal.z / CELL)];
    if (G.explored[pz * W + px]) dot(d.portal, '#a07aff', 5);
    for (const k of G.pickups) if (k.kind === 'scroll' && G.explored[Math.floor(k.pos.z / CELL) * W + Math.floor(k.pos.x / CELL)]) dot(k.pos, '#ffd86a', 3);
    if (G.sanctuary && G.explored[Math.floor(G.sanctuary.center.z / CELL) * W + Math.floor(G.sanctuary.center.x / CELL)]) dot(G.sanctuary.center, '#9ad8ff', 5);
    for (const e of G.enemies) if (e.alive && e.pos.distanceTo(p.pos) < 22 && lineOfSight(p.pos, e.pos)) dot(e.pos, '#ff4a3a', 2.5);
    for (const m of G.mages) if (m !== p && m.alive) dot(m.pos, m.team === p.team ? '#6ad0ff' : '#ff8a3a', 3.5);
    g.rotate(-p.yaw + Math.PI);
    g.fillStyle = '#fff3cf'; g.beginPath(); g.moveTo(0, 7); g.lineTo(-4.5, -5); g.lineTo(4.5, -5); g.closePath(); g.fill();
    g.restore();
  },
};

// ---------- 書物 ----------
// 魔導書 (Tab): 自分で編んだ呪文と研究ノート — 自分だけの記録
//              言霊辞典・心得・調合書 も魔導書の章として収める
const BOOKS = { grimoire: { title: '魔導書', first: 'spells', key: 'Tab' } };
let book = 'grimoire', tab = 'spells', selSpell = 0;
const bookOf = t => document.querySelector(`#book nav button[data-tab="${t}"]`)?.dataset.book || 'grimoire';
export function openBook(which) {
  book = 'grimoire';
  if (which === 'words') tab = 'words';
  $('book').classList.remove('hidden'); G.uiOpen = true; G.onUiOpen?.();
  document.exitPointerLock?.();
  renderBook();
}
export function closeBook() { $('book').classList.add('hidden'); G.uiOpen = false; saveBook(); UI.renderHotbar(); G.onPageChange?.(); }
export const bookOpen = () => !$('book').classList.contains('hidden');
export const currentBook = () => book;

document.querySelectorAll('#book nav button[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; book = bookOf(tab); renderBook(); });
$('bookClose').onclick = closeBook;
$('bookSwitch').classList.add('hidden');

function renderBook() {
  $('bookTitle').textContent = ['words', 'help', 'craft', 'spirits', 'beasts'].includes(tab) ? '教本' : BOOKS[book].title;
  $('bookClose').textContent = `閉じる (${BOOKS[book].key})`;
  document.querySelectorAll('#book nav button[data-tab]').forEach(b => {
    b.classList.toggle('sel', b.dataset.tab === tab);
  });
  const pg = $('bookPage');
  if (tab === 'notes') {
    pg.innerHTML = `<h3>研究ノート</h3><p class="muted">気づいたこと、試したい組み合わせ、仲間との作戦… 自由に書き留めよ。自動で保存される。</p>
      <textarea class="journal" id="journal" placeholder="例: 骸骨兵は聖光に弱い。刻印と城壁を組み合わせたら？">${esc(BOOK.journal || '')}</textarea>`;
    $('journal').oninput = e => { BOOK.journal = e.target.value; saveBook(); };
  } else if (tab === 'spirits') {
    const bonds = BOOK.bonds || {};
    pg.innerHTML = `<h3>精霊</h3>
      <div class="spguide">
        <p><b>精霊とは</b> — 属性(紅蓮・氷獄…)と、癒息・守護・神速・灯火の言霊は、それぞれ精霊の<b>真名の一部</b>。その言霊を含む術を唱えると、名を呼ばれた精霊が力を貸す。古文書で新しい言霊を覚えた時に、その精霊と出会う。</p>
        <p><b>縁(えにし)</b> — その精霊の言霊を含む術を放つたびに縁が深まる。ふつうに唱えて +1、整詠で +2、名詠で +3。縁が深いほど、その精霊の術が強くなる。</p>
        <table class="bondtable"><tr>${BOND_NAMES.map((n, i) => `<th>${n}</th>`).join('')}</tr><tr>${[0, 6, 18, 40, 75, 130].map(x => `<td>${x}</td>`).join('')}</tr><tr>${BOND_NAMES.map((n, i) => `<td>${Math.round((0.95 + 0.04 * i) * 100)}%</td>`).join('')}</tr></table>
        <p class="muted" style="margin-top:-4px">上から: 縁の名 ・ 必要な縁 ・ 術の威力</p>
        <p><b>機嫌</b> — その精霊の言霊を含む詠唱を<b>二度続けて言い損じる</b>(術にならない)と、精霊は25秒そっぽを向き、その間は術の威力が85%に落ちる。うまく唱えれば言い損じの数は消える。</p>
        <p><b>頼み</b> — 出会った精霊は、ときどき頼みごとをしてくる(画面左の課題に出る)。叶えると縁が一気に +15 深まる。</p>
      </div>
      <div class="spirits">${Object.entries(SPIRITS).map(([id, sp]) => {
        const met = G.known.has(id), w = WORD_BY_ID[id], b = bondProgress(bonds[id] || 0);
        if (!met) return `<div class="spcard unmet"><h4>？？？</h4><div class="lore">まだ出会っていない精霊。古文書の中に、その名が眠っている。</div></div>`;
        return `<div class="spcard"><h4 style="color:${sp.color}"><ruby>${sp.name}<rt>${sp.ruby}</rt></ruby></h4><div class="word">真名の言霊『${w.core}』(${w.ruby})</div><div class="lore">${sp.lore}</div><div class="bond">縁: ${BOND_NAMES[b.level]}${b.level < BOND_NAMES.length - 1 ? '' : '(極み)'} ・ 威力 ${Math.round((0.95 + 0.04 * b.level) * 100)}%</div><div class="bar"><i style="width:${Math.round(b.frac * 100)}%;background:${sp.color}"></i></div></div>`;
      }).join('')}</div>`;
  } else if (tab === 'beasts') {
    // 魔物の記録: 倒した魔物の「なぜ、その姿なのか」が記される
    const seen = BOOK.seen || {};
    const card = (name, sub, rows) => `<div class="spcard beast"><h4>${name}</h4><div class="sub">${sub}</div><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>`;
    const unknown = t => `<div class="spcard unmet"><h4>？？？</h4><div class="lore">${t}</div></div>`;
    pg.innerHTML = `<h3>魔物の記録</h3><div class="spguide"><p>${BESTIARY_INTRO}</p><p class="muted">討ち果たした魔物の由来は、ここに記される。姿には、必ず理由がある。</p></div>
      <h4 style="color:#d8b46a;margin:14px 0 8px">迷宮に棲むもの</h4>
      <div class="spirits">${Object.entries(BESTIARY).map(([id, b]) => seen[id]
        ? card(ENEMY_TYPES[id]?.name || id, b.title, [['何者か', b.who], ['なぜ、この姿か', b.why], ['見るべき所', b.sign], ['弱みの理由', b.weak]])
        : unknown('まだ討っていない魔物。')).join('')}</div>
      <h4 style="color:#d8b46a;margin:18px 0 8px">守護者 ― 砕けた「沈黙」の一片を抱くもの</h4>
      <div class="spirits">${Object.entries(GUARDIAN_LORE).map(([el, g]) => seen['g_' + el]
        ? card(g.name, '守護者', [['なぜ、この姿か', g.why], ['戦い方の理由', g.hint]])
        : unknown('まだ討っていない守護者。')).join('')}</div>`;
  } else if (tab === 'words') {
    const order = ['element', 'form', 'effect', 'target', 'mod', 'trigger'];
    const sorted = [...WORDS].sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat));
    pg.innerHTML = `<h3>言霊 — ${G.known.size} / ${WORDS.length}</h3>
      <p class="muted">迷宮の古文書から新たな言霊を見つけられる。手掛かりから意味を推理し、実際に唱えて確かめよ。一度唱えれば真意が記される。下の欄は自由に書き込めるメモ。</p>
      <div class="words">${sorted.map(w => {
        const k = G.known.has(w.id), u = BOOK.understood.includes(w.id);
        if (!k) return `<div class="wcard unknown"><div class="head"><span class="tx">？？？</span><span class="cat">${CAT[w.cat]}</span></div><div class="hint">未発見の言霊</div></div>`;
        return `<div class="wcard"><div class="head"><span class="tx">${esc(w.core)}</span><span class="rb">${esc(w.ruby)}</span><span class="cat">${CAT[w.cat]}</span></div>
          <div class="phrase">「${w.rubyHtml}」</div>
          <div class="hint">${esc(w.hint)}</div>
          <div class="mean ${u ? '' : 'no'}">${u ? '真意: ' + esc(w.meaning) : '真意: 未解明 — 唱えて確かめよ'}</div>
          <div class="muted">消費魔力 ${w.cost} ・ 聞き取り候補: ${esc(w.alias.slice(0, 4).join(' / '))}</div>
          <textarea data-note="${w.id}" placeholder="研究メモ…">${esc(BOOK.notes[w.id] || '')}</textarea></div>`;
      }).join('')}</div>`;
    pg.querySelectorAll('textarea[data-note]').forEach(t => t.oninput = () => { BOOK.notes[t.dataset.note] = t.value; saveBook(); });
  } else if (tab === 'spells') {
    if (selSpell >= BOOK.spells.length) selSpell = Math.max(0, BOOK.spells.length - 1);
    const s = BOOK.spells[selSpell] || { name: '', text: '', memo: '' };
    pg.innerHTML = `<h3>呪文の研究</h3>
      <div class="spells">
        <div class="slist">${BOOK.spells.map((sp, i) => {
          return `<div class="sitem ${i === selSpell ? 'sel' : ''}" data-i="${i}"><span class="slotk">${G.page === i ? '📖 ' : ''}第${i + 1}頁</span><b>${esc(sp.name)}</b><small>${rubify(sp.text)}</small></div>`;
        }).join('')}
          <button class="btn small" id="newSpell" style="width:100%">＋ 新しい呪文</button></div>
        <div class="editor">
          <label>呪文名</label><input type="text" id="spName" value="${esc(s.name)}" maxlength="20">
          <label>唱える名 — 詠唱の最後にこの名を叫ぶと術が完成する(空欄なら標準の名)</label><input type="text" id="spCall" value="${esc(s.call || '')}" maxlength="16" placeholder="例: インフェルノ / 紅蓮葬">
          <label>詠唱文 — 未知の言葉は飾りとして無視される(厨二的な前口上も自由)</label>
          <textarea id="spText" class="chanttext" rows="3" placeholder="例: 仇なす汝に 燃ゆる紅蓮の焔よ 一筋の穿槍となれ ファイアランス (最後に魔法の名を呼ぶ)">${esc(s.text)}</textarea>
          <div class="chips" id="chips">${chipGroups()}</div>
          <div class="formula" id="spFormula"></div>
          <label>研究メモ</label><textarea id="spMemo">${esc(s.memo)}</textarea>
          <div class="row">
            <button class="btn small" id="spSave">保存</button>
            <button class="btn small ghost" id="spOpen">この頁を開いて持つ</button>
            <button class="btn small ghost" id="spUp">↑ 前へ</button><button class="btn small ghost" id="spDown">↓ 後ろへ</button>
            <button class="btn small ghost" id="spDel" style="margin-left:auto">削除</button>
          </div>
          <p class="muted">文法: [対象] [修飾] [属性…] [形] [効果…] [起句]。順番は自由。<br>
          例: 「同胞に 聖光 癒息 円環」= 周囲の味方をまとめて大回復 / 「刻印 氷獄」= 踏むと凍る罠 / 「颶風 城壁」= 触れた敵を吹き飛ばす壁(最後に魔法の名を唱えて締める)</p>
        </div>
      </div>`;
    const upd = () => { const sp = compile($('spText').value, G.known); $('spFormula').innerHTML = esc(formula(sp)) + (sp.unknownWords.length ? `<br><span class="muted">未習得: ${sp.unknownWords.map(i => '？？？').join(' ')}</span>` : ''); };
    $('spText').oninput = upd; upd();
    pg.querySelectorAll('.chip').forEach(c => c.onclick = () => { const t = $('spText'); t.value = (t.value.trim() + ' ' + c.dataset.w).trim(); upd(); });
    pg.querySelectorAll('.sitem').forEach(el => el.onclick = () => { selSpell = +el.dataset.i; renderBook(); });
    const commit = () => {
      const call = $('spCall').value.trim();
      let text = $('spText').value.trim();
      // 詠唱文の最後の名(標準の名・前に付けた名)を外し、唱える名を付け直す
      const old = BOOK.spells[selSpell]?.call;
      const ends = [old, ...[...CALL_WORDS].sort((a, b) => b.length - a.length)].filter(Boolean);
      for (let cut = true; cut;) { cut = false; for (const w of ends) if (text.endsWith(w)) { text = text.slice(0, -w.length).trim(); cut = true; break; } }
      const std = callName(compile(text, null));
      if (call || std) text = (text + ' ' + (call || std)).trim();
      const obj = { name: $('spName').value || '無銘の呪文', text, memo: $('spMemo').value, ...(call ? { call } : {}) };
      if (BOOK.spells[selSpell]) BOOK.spells[selSpell] = obj; else { BOOK.spells.push(obj); selSpell = BOOK.spells.length - 1; }
      saveBook();
    };
    $('spSave').onclick = () => { commit(); renderBook(); };
    $('newSpell').onclick = () => { BOOK.spells.push({ name: '新たな呪文', text: '', memo: '' }); selSpell = BOOK.spells.length - 1; saveBook(); renderBook(); };
    $('spDel').onclick = () => {
      if (!BOOK.spells[selSpell]) return;
      BOOK.spells.splice(selSpell, 1);
      BOOK.slots = BOOK.slots.map(i => i === selSpell ? -1 : i > selSpell ? i - 1 : i);
      saveBook(); renderBook();
    };
    $('spOpen').onclick = () => { commit(); G.page = selSpell; G.onPageChange?.(); renderBook(); };
    const move = d => { const j = selSpell + d; if (j < 0 || j >= BOOK.spells.length) return; commit(); const sp = BOOK.spells; [sp[selSpell], sp[j]] = [sp[j], sp[selSpell]]; if (G.page === selSpell) G.page = j; else if (G.page === j) G.page = selSpell; selSpell = j; saveBook(); G.onPageChange?.(); renderBook(); };
    $('spUp').onclick = () => move(-1); $('spDown').onclick = () => move(1);
  } else if (tab === 'craft') {
    const names = { shard: '言霊の欠片', herb: '霊草', crystal: '魔晶', bone: '骨片', iron: '鉄屑' };
    // 写本: 欠片を綴って、望んだ種類の言霊の古文書を作る。属性そのものの写本はとても重い
    const EL_JP = { fire: '紅蓮', ice: '氷獄', thunder: '雷霆', wind: '颶風', holy: '聖光', void: '深淵' };
    const unknownOf = cat => WORDS.filter(w => w.cat === cat && !w.cursed && !G.known.has(w.id) && !(G.inv['scroll_' + w.id] > 0));
    const scribe = [];
    for (const [cat, label] of [['form', '出し方'], ['effect', '効果'], ['mod', '修飾']]) if (unknownOf(cat).length)
      scribe.push({ id: 'scroll', name: `写本「${label}」`, need: { shard: 2, crystal: 2 }, desc: `まだ知らない「${label}」の言霊がどれか一つ記された古文書を綴る(残り ${unknownOf(cat).length} 語)。`, make: () => 'scroll_' + unknownOf(cat)[Math.floor(Math.random() * unknownOf(cat).length)].id });
    for (const w of unknownOf('element'))
      scribe.push({ id: 'scroll', name: `秘奥の写本『${w.core}』`, need: { shard: 6, crystal: 4, iron: 2 }, desc: `属性「${EL_JP[w.id] || w.core}」そのものを覚える古文書。迷宮ではまず見つからない。望んだ属性を選んで綴れるが、素材は重い。`, make: () => 'scroll_' + w.id, rare: true });
    for (const el of Object.keys(EL_JP)) if (G.known.has(el) && ((BOOK.mastery || {})[el] || 0) + (G.inv['tome_' + el] || 0) < 3)
      scribe.push({ id: 'tome_' + el, name: `秘伝書『${EL_JP[el]}』`, need: { shard: 3, crystal: 3, bone: 2 }, desc: `読むと${EL_JP[el]}の術の威力が +15%(全三巻。いま ${((BOOK.mastery || {})[el] || 0)} 巻)。`, make: () => 'tome_' + el });
    pg.innerHTML = `<h3>調合</h3>
      <div class="inv">${Object.entries(names).map(([k, n]) => `<span>${n} <b>${G.inv[k] || 0}</b></span>`).join('')}</div>
      <div class="recipes">${RECIPES.map((r, i) => {
        const ok = canCraft(G.inv,r);
        return `<div class="recipe"><b>${r.name}</b> <span class="muted">所持 ${G.inv[r.id] || 0}</span><p>${r.desc}</p>
          <p>素材: ${Object.entries(r.need).map(([k, n]) => `${names[k]}×${n}`).join(' ')}</p>
          <button class="btn small ${ok ? '' : 'ghost'}" data-craft="${i}" ${ok ? '' : 'disabled'}>調合する</button></div>`;
      }).join('')}</div>
      <h3 style="margin-top:22px">写本と秘伝書</h3>
      <p class="muted">言霊の欠片は、守護者(三つ)や精鋭の魔物から、また、すでに覚えている古文書を読んで砕くと手に入る。</p>
      <div class="recipes">${scribe.map((r, i) => {
        const ok = canCraft(G.inv, r);
        return `<div class="recipe" ${r.rare ? 'style="border-color:#b070ff"' : ''}><b>${r.name}</b><p>${r.desc}</p>
          <p>素材: ${Object.entries(r.need).map(([k, n]) => `${names[k]}×${n}`).join(' ')}</p>
          <button class="btn small ${ok ? '' : 'ghost'}" data-scribe="${i}" ${ok ? '' : 'disabled'}>綴る</button></div>`;
      }).join('') || '<p class="muted">いま綴れるものは無い。</p>'}</div>
      <p class="muted" style="margin-top:14px">素材は迷宮の霊草・壁の魔晶・宝箱・倒した魔物から得られる。持ち物は下の6枠だけ。1〜6で持ち替え、左クリックで使用・装備、Gで落とす。</p>`;
    pg.querySelectorAll('[data-scribe]').forEach(b => b.onclick = () => {
      const r = scribe[+b.dataset.scribe];
      if (!r || !canCraft(G.inv, r)) { UI.log('材料か空き枠が足りない'); return; }
      for (const [k, n] of Object.entries(r.need)) G.inv[k] -= n;
      const made = r.make(); G.invAdd(made, 1);
      UI.log(`${r.name}を綴った — 持って読めば身に付く`, r.rare ? '#d8a0ff' : '#ffe08a'); renderBook(); UI.renderHotbar();
    });
    pg.querySelectorAll('[data-craft]').forEach(b => b.onclick = () => {
      const r = RECIPES[+b.dataset.craft];
      if(!canCraft(G.inv,r)){UI.log('材料か空き枠が足りない');return;}
      for (const [k, n] of Object.entries(r.need)) G.inv[k] -= n;
      G.invAdd(r.id,1);
      UI.log(`${r.name}を調合した`, '#ffe08a'); renderBook(); UI.renderHotbar();
    });
  } else {
    pg.innerHTML = `<h3>魔導師の心得</h3><div style="line-height:2;font-size:15px">
      <p>■ <b>詠唱</b> — <b>V</b>を押しながら呪文を声に出す(離すと発動)。<b>C</b>で常時詠唱(ハンズフリー)。<b>Enter</b>は仲間とのチャット。チャットでは術は発動しない。詠唱中は足が鈍る。</p>
      <p>■ <b>魔法の名</b> — 最後に魔法の名(ファイア・ヒーリング など)を唱えて締めると完全詠唱。無いと略式(威力70%)。</p>
      <p>■ <b>詠唱妨害</b> — 詠唱中に強打(12以上)を受けると術が霧散する。「守護」で防げる。仲間が長い呪文を唱えている間は守ってやれ。</p>
      <p>■ <b>読み合い</b> — 敵の魔導師の詠唱は頭上に表示され、声も聞こえる。「穿槍」が聞こえたら「城壁」で阻め。「天雨」なら足元の魔法陣から離れろ。</p>
      <p>■ <b>属性と相性</b> — 骸骨兵・怨霊は聖光に弱い。粘獣は紅蓮、石像兵は雷霆に弱い。複数の属性を混ぜると効果が融合する。</p>
      <p>■ <b>蘇生</b> — 協力探索では倒れても「癒息」を受ければ立ち上がる。</p>
      <p>■ <b>転移陣</b> — 最も遠い部屋にある紫の転移陣から次の層へ。3層ごとに主が待つ。</p>
      <p class="muted">音声認識は Chrome / Edge で動作します。VC(近接ボイス)はオンライン時、マイク許可後に自動で繋がります。</p></div>`;
  }
}

export const RECIPES = [
  { id: 'ether', name: '魔力薬', need: { crystal: 2 }, desc: '1秒かけて飲み干すと、4秒かけて魔力が55戻る。飲んでいる間は詠唱できず、足も鈍る。' },
  { id: 'amulet', name: '護符', need: { bone: 2, crystal: 1 }, desc: '50の守護を15秒間まとう。詠唱妨害を防ぐ。' },
  { id: 'flash', name: '閃光玉', need: { iron: 1, crystal: 1 }, desc: '周囲10mの魔物を2.5秒間怯ませる。' },
  { id: 'lantern', name: '導灯', need: { iron: 2, herb: 1 }, desc: 'この層の地図をすべて照らし出す。' },
];

// ---- 画面の文字と帯の傷み: 起動時に二枚の模様を作り、CSS(--wear / --scuff)から使う ----
//   --wear  = 文字の抜け(擦れた所は字が薄れ、引っかき傷で欠ける)
//   --scuff = 帯や枠の上の引っかき傷・汚れ
(() => {
  try {
    let seed = 20261107; const r = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const N = 256, mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return [c, c.getContext('2d')]; };
    // 継ぎ目が出ないよう、縁をまたぐ物は反対側にも描く
    const wrap = (g, fn) => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { g.save(); g.translate(ox, oy); fn(); g.restore(); } };
    const [wc, w] = mk();
    w.fillStyle = '#fff'; w.fillRect(0, 0, N, N);
    w.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 16; i++) { const x = r() * N, y = r() * N, rad = 14 + r() * 34, a = 0.18 + r() * 0.3; wrap(w, () => { const gr = w.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); w.fillStyle = gr; w.fillRect(x - rad, y - rad, rad * 2, rad * 2); }); } // 擦れ
    for (let i = 0; i < 260; i++) { const x = r() * N, y = r() * N, rad = 0.5 + r() * r() * 2.4, a = 0.4 + r() * 0.6; wrap(w, () => { w.fillStyle = `rgba(0,0,0,${a})`; w.beginPath(); w.arc(x, y, rad, 0, 7); w.fill(); }); } // 欠け
    w.lineCap = 'round';
    for (let i = 0; i < 26; i++) { const x = r() * N, y = r() * N, a = r() * Math.PI, len = 20 + r() * 90, lw = 0.6 + r() * 1.3, al = 0.5 + r() * 0.5, bend = (r() - 0.5) * 14; wrap(w, () => { w.strokeStyle = `rgba(0,0,0,${al})`; w.lineWidth = lw; w.beginPath(); w.moveTo(x, y); w.quadraticCurveTo(x + Math.cos(a) * len / 2 + bend, y + Math.sin(a) * len / 2 - bend, x + Math.cos(a) * len, y + Math.sin(a) * len); w.stroke(); }); } // 引っかき傷
    const [sc, g] = mk();
    g.lineCap = 'round';
    for (let i = 0; i < 34; i++) { const x = r() * N, y = r() * N, a = (r() - 0.5) * 0.9 + (r() < 0.2 ? 1.3 : 0), len = 14 + r() * 80, lw = 0.5 + r() * 1.1, dark = r() < 0.7, al = 0.25 + r() * 0.4; wrap(g, () => { g.strokeStyle = dark ? `rgba(0,0,0,${al})` : `rgba(255,240,210,${al * 0.45})`; g.lineWidth = lw; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke(); }); }
    for (let i = 0; i < 12; i++) { const x = r() * N, y = r() * N, rad = 8 + r() * 26, a = 0.12 + r() * 0.2; wrap(g, () => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }); }
    for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(0,0,0,${0.2 + r() * 0.4})`; g.beginPath(); g.arc(r() * N, r() * N, 0.4 + r() * 1.2, 0, 7); g.fill(); }
    const st = document.documentElement.style;
    st.setProperty('--wear', `url(${wc.toDataURL('image/png')})`); st.setProperty('--scuff', `url(${sc.toDataURL('image/png')})`);
  } catch (e) { console.warn('wear', e); }
})();
