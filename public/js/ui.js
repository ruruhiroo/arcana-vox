// HUD・魔導書・調合・ミニマップ
import * as THREE from 'three';
import { G, clamp } from './state.js';
import { WORDS, WORD_BY_ID, CAT, compile, formula, tokenize, expandChant, chantGaps, STARTER_WORDS, callName } from './lexicon.js';
import { W, H, CELL, lineOfSight } from './dungeon.js';
import { keyOf } from './controls.js';
import { SPIRITS, BOND_NAMES, bondProgress } from './spirits.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- 魔導書の永続化 ----------
const SAVE_KEY = 'arcana_vox_grimoire_v1';
export const BOOK = {
  known: [...STARTER_WORDS], understood: [...STARTER_WORDS], notes: {}, equip: {}, bag: [],
  spells: [
    { name: '初級炎魔術', text: '汝に 紅蓮 放て', memo: '最も短い攻撃の詠唱。威力は控えめだが消費が少ない。' },
    { name: '中級炎魔術', text: '汝に 紅蓮 穿槍 放て', memo: '火の槍を放つ。粘獣によく効く。' },
    { name: '初級治癒魔術', text: '我に 癒息 放て', memo: '' },
    { name: '初級守護魔術', text: '我に 守護 放て', memo: '強打を受けても詠唱が乱れなくなる。' },
    { name: '中級治癒魔術', text: '同胞に 癒息 放て', memo: '倒れた仲間を蘇生できる。' },
    { name: '灯火', text: '我に 灯火 放て', memo: '肩越しに光の玉が付き従い、暗い迷宮を照らす。「穿槍」を加えると照準地点に灯る。' },
  ],
  slots: [0, 1, 2, 3],
};
export function loadBook() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.known) Object.assign(BOOK, s); } catch {}
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
  if (BOOK.chantVer < 5) {
    for (const sp of BOOK.spells) {
      const name = callName(compile(sp.text, null));
      if (name) sp.text = sp.text.replace(/\s*(今こそ)?解き放て\s*$/, ' ' + name).replace(/\s+放て\s*$/, ' ' + name);
    }
    BOOK.chantVer = 5;
  }
  G.known = new Set(BOOK.known);
}
export function saveBook() {
  BOOK.known = [...G.known];
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(BOOK)); } catch {}
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

export const UI = {
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
    if (!toks.length) { el.innerHTML = `<span class="w unk" style="text-decoration:none">${esc(text)}</span>`; $('chantFormula').textContent = '…言霊が聞き取れない'; return; }
    // 一節ごとにまとめて折り返す(節の途中で改行しない)。長い詠唱は字を小さく
    el.innerHTML = `<span class="w ok">${text.trim().split(/\s+/).map(seg => `<span class="ph">${rubify(seg)}</span>`).join(" ")}</span>`;
    el.classList.toggle("long", text.length > 22);
    const sp = compile(text, G.known);
    const gaps = chantGaps(text, toks.map(t => t.id));
    $('chantFormula').textContent = formula(sp) + (toks.some(t => !t.known) ? '  (未習得の言霊は効力を持たない)' : '') + (gaps.length ? `  ／ 続きを唱えよ:「${WORD_BY_ID[gaps[0]].text}」` : '');
  },
  micState(s) { const m = $('micState'); m.textContent = s; m.classList.toggle('on', /聴取|詠唱/.test(s)); },

  updateHUD() {
    const p = G.player; if (!p) return;
    $('hpBar').firstElementChild.style.width = clamp(p.hp / p.maxHp * 100, 0, 100) + '%';
    $('hpBar').lastElementChild.textContent = `生命 ${Math.ceil(Math.max(0, p.hp))} / ${p.maxHp}`;
    $('mpBar').firstElementChild.style.width = clamp(p.mp / p.maxMp * 100, 0, 100) + '%';
    $('mpBar').lastElementChild.textContent = `魔力 ${Math.floor(p.mp)} / ${p.maxMp}`;
    $('shBar').firstElementChild.style.width = clamp(p.shield / 60 * 100, 0, 100) + '%';
    const st = [];
    if (p.shield > 0) st.push(`守護${Math.ceil(p.shield)}`); if (p.status.burn) st.push('炎上'); if (p.status.slow) st.push('鈍足'); if (p.status.haste) st.push('神速');
    $('statusIcons').textContent = st.join('  ');
    $('floorLabel').textContent = `第${G.floor}層`;
    $('modeLabel').textContent = (G.mode === 'coop' ? '協力探索' : '探索PvP') + (G.net ? ' ・ オンライン' : '') + (G.mode === 'pvp' ? `  討伐 ${p.kills}` : '');
    const others = G.mages.filter(m => m !== p);
    $('party').innerHTML = others.map(m => {
      const hostile = m.team !== p.team;
      const st = !m.alive ? '(死亡)' : m.downed ? '(瀕死)' : '';
      return `<div class="pm"><span style="color:${hostile ? '#ff9a8a' : '#cfe8ff'}">${esc(m.name)}</span> <span class="muted">${st}</span><div class="bar"><div style="width:${clamp(m.hp / m.maxHp * 100, 0, 100)}%;background:${hostile ? '#a33' : '#3a8'}"></div></div></div>`;
    }).join('');
    const dn = $('downed');
    if (p.downed) { dn.classList.remove('hidden'); dn.innerHTML = `倒れた…<br><small>仲間の「癒息」を待て (${Math.ceil(p.downT)})</small>`; }
    else if (!p.alive) { dn.classList.remove('hidden'); dn.innerHTML = `討たれた<br><small>${Math.ceil(p.respawnT || 0)}秒後に再臨</small>`; }
    else dn.classList.add('hidden');
  },

  renderHotbar() {
    const items = [['potion', '回復薬', 'かいふくやく'], ['ether', '魔力薬', 'まりょくやく'], ['amulet', '護符', 'ごふ'], ['flash', '閃光玉', 'せんこうだま'], ['lantern', '導灯', 'しるべび']];
    // 手に持つ書物 (Q で持ち替え)。魔導書を持っている間だけ詠唱できる
    let h = '';
    items.forEach(([k, n, r], i) => { h += `<div class="slot item ${G.inv[k] ? '' : 'dim'}"><span class="k">${keyOf('item' + (i + 1))}</span><span class="n"><ruby>${n}<rt>${r}</rt></ruby></span><span class="c">${G.inv[k] || 0}</span></div>`; });
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
  $('bookTitle').textContent = ['words', 'help', 'craft', 'spirits'].includes(tab) ? '教本' : BOOKS[book].title;
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
    pg.innerHTML = `<h3>精霊</h3><p class="muted">言霊は精霊の真名の一部。名を呼べば力を貸してくれる。同じ精霊を呼ぶほど縁が深まり、その術が強くなる。名詠は精霊を大いに喜ばせ、言い損じが続くと機嫌を損ねる。</p>
      <div class="spirits">${Object.entries(SPIRITS).map(([id, sp]) => {
        const met = G.known.has(id), w = WORD_BY_ID[id], b = bondProgress(bonds[id] || 0);
        if (!met) return `<div class="spcard unmet"><h4>？？？</h4><div class="lore">まだ出会っていない精霊。古文書の中に、その名が眠っている。</div></div>`;
        return `<div class="spcard"><h4 style="color:${sp.color}"><ruby>${sp.name}<rt>${sp.ruby}</rt></ruby></h4><div class="word">真名の言霊『${w.core}』(${w.ruby})</div><div class="lore">${sp.lore}</div><div class="bond">縁: ${BOND_NAMES[b.level]}${b.level < BOND_NAMES.length - 1 ? '' : '(極み)'} ・ 威力 ${Math.round((0.95 + 0.04 * b.level) * 100)}%</div><div class="bar"><i style="width:${Math.round(b.frac * 100)}%;background:${sp.color}"></i></div></div>`;
      }).join('')}</div>`;
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
          <label>詠唱文 — 未知の言葉は飾りとして無視される(厨二的な前口上も自由)</label>
          <textarea id="spText" class="chanttext" rows="3" placeholder="例: 仇なす汝に 紅蓮の業火よ、燃え盛れ 一条の穿槍となりて貫け ファイアランス (最後に魔法の名を呼ぶ)">${esc(s.text)}</textarea>
          <div class="chips" id="chips">${[...G.known].map(id => WORD_BY_ID[id]).sort((a, b) => a.cat.localeCompare(b.cat)).map(w => `<span class="chip c-${w.cat}" data-w="${esc(w.text)}" title="${esc(w.text)}"><ruby>${esc(w.core)}<rt>${esc(w.ruby)}</rt></ruby></span>`).join('')}</div>
          <div class="formula" id="spFormula"></div>
          <label>研究メモ</label><textarea id="spMemo">${esc(s.memo)}</textarea>
          <div class="row">
            <button class="btn small" id="spSave">保存</button>
            <button class="btn small ghost" id="spOpen">この頁を開いて持つ</button>
            <button class="btn small ghost" id="spUp">↑ 前へ</button><button class="btn small ghost" id="spDown">↓ 後ろへ</button>
            <button class="btn small ghost" id="spDel" style="margin-left:auto">削除</button>
          </div>
          <p class="muted">文法: [対象] [修飾] [属性…] [形] [効果…] [起句]。順番は自由。<br>
          例: 「同胞に 聖光 癒息 円環 放て」= 周囲の味方をまとめて大回復 / 「刻印 氷獄 放て」= 踏むと凍る罠 / 「颶風 城壁 放て」= 触れた敵を吹き飛ばす壁</p>
        </div>
      </div>`;
    const upd = () => { const sp = compile($('spText').value, G.known); $('spFormula').innerHTML = esc(formula(sp)) + (sp.unknownWords.length ? `<br><span class="muted">未習得: ${sp.unknownWords.map(i => '？？？').join(' ')}</span>` : ''); };
    $('spText').oninput = upd; upd();
    pg.querySelectorAll('.chip').forEach(c => c.onclick = () => { const t = $('spText'); t.value = (t.value.trim() + ' ' + c.dataset.w).trim(); upd(); });
    pg.querySelectorAll('.sitem').forEach(el => el.onclick = () => { selSpell = +el.dataset.i; renderBook(); });
    const commit = () => {
      const obj = { name: $('spName').value || '無銘の呪文', text: $('spText').value, memo: $('spMemo').value };
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
    const names = { herb: '霊草', crystal: '魔晶', bone: '骨片', iron: '鉄屑' };
    pg.innerHTML = `<h3>調合</h3>
      <div class="inv">${Object.entries(names).map(([k, n]) => `<span>${n} <b>${G.inv[k] || 0}</b></span>`).join('')}</div>
      <div class="recipes">${RECIPES.map((r, i) => {
        const ok = Object.entries(r.need).every(([k, n]) => (G.inv[k] || 0) >= n);
        return `<div class="recipe"><b>${r.name}</b> <span class="muted">所持 ${G.inv[r.id] || 0}</span><p>${r.desc}</p>
          <p>素材: ${Object.entries(r.need).map(([k, n]) => `${names[k]}×${n}`).join(' ')}</p>
          <button class="btn small ${ok ? '' : 'ghost'}" data-craft="${i}" ${ok ? '' : 'disabled'}>調合する</button></div>`;
      }).join('')}</div>
      <p class="muted" style="margin-top:14px">素材は迷宮の霊草・壁の魔晶・宝箱・倒した魔物から得られる。道具は 5〜9 キーで使用。</p>`;
    pg.querySelectorAll('[data-craft]').forEach(b => b.onclick = () => {
      const r = RECIPES[+b.dataset.craft];
      for (const [k, n] of Object.entries(r.need)) G.inv[k] -= n;
      G.inv[r.id] = (G.inv[r.id] || 0) + 1;
      UI.log(`${r.name}を調合した`, '#ffe08a'); renderBook(); UI.renderHotbar();
    });
  } else {
    pg.innerHTML = `<h3>魔導師の心得</h3><div style="line-height:2;font-size:15px">
      <p>■ <b>詠唱</b> — <b>V</b>を押しながら呪文を声に出す(離すと発動)。<b>C</b>で常時詠唱(ハンズフリー)。マイクが無い場合は<b>Enter</b>で文字詠唱。声でも文字でも、詠唱には時間がかかり、その間は足が鈍る。</p>
      <p>■ <b>起句</b> — 「放て」で詠唱を締めると完全詠唱。無いと略式(威力70%)。</p>
      <p>■ <b>詠唱妨害</b> — 詠唱中に強打(12以上)を受けると術が霧散する。「守護」で防げる。仲間が長い呪文を唱えている間は守ってやれ。</p>
      <p>■ <b>読み合い</b> — 敵の魔導師の詠唱は頭上に表示され、声も聞こえる。「穿槍」が聞こえたら「城壁」で阻め。「天雨」なら足元の魔法陣から離れろ。</p>
      <p>■ <b>属性と相性</b> — 骸骨兵・怨霊は聖光に弱い。粘獣は紅蓮、石像兵は雷霆に弱い。複数の属性を混ぜると効果が融合する。</p>
      <p>■ <b>蘇生</b> — 協力探索では倒れても「癒息」を受ければ立ち上がる。</p>
      <p>■ <b>転移陣</b> — 最も遠い部屋にある紫の転移陣から次の層へ。3層ごとに主が待つ。</p>
      <p class="muted">音声認識は Chrome / Edge で動作します。VC(近接ボイス)はオンライン時、マイク許可後に自動で繋がります。</p></div>`;
  }
}

export const RECIPES = [
  { id: 'potion', name: '回復薬', need: { herb: 2 }, desc: '生命を45回復する。' },
  { id: 'ether', name: '魔力薬', need: { crystal: 2 }, desc: '魔力を50回復する。' },
  { id: 'amulet', name: '護符', need: { bone: 2, crystal: 1 }, desc: '50の守護を15秒間まとう。詠唱妨害を防ぐ。' },
  { id: 'flash', name: '閃光玉', need: { iron: 1, crystal: 1 }, desc: '周囲10mの魔物を2.5秒間怯ませる。' },
  { id: 'lantern', name: '導灯', need: { iron: 2, herb: 1 }, desc: 'この層の地図をすべて照らし出す。' },
];
