// 仲間と潜る(マルチプレイ)の窓。ゲームを始めた後に、メニューから開く。
//   ひとり旅の間:  「部屋を開く」「部屋に入る」を選べる(選ぶと、マルチの旅として始め直す)
//   つながっている間: 部屋コードを大きく出し、コピーできる。今いる仲間の一覧と「部屋を抜ける」
// また、タイトル画面の接続の選び方を、選択欄から札に置き換える(initLobbyNet)。
import { G } from './state.js';

const AUTO = 'arcana_auto';   // 始め直した後に自動で入るための覚え書き { mode: 'host' | 'join', code }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const makeCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)]; return s; };

const CSS = `
#mpPanel { position: fixed; inset: 0; z-index: 82; display: grid; place-items: center; padding: 24px; box-sizing: border-box; background: rgba(3,2,6,.74); backdrop-filter: blur(4px); color: #e8dcc0; pointer-events: auto; }
#mpPanel.hidden { display: none; }
#mpPanel .box { position: relative; width: min(760px, 100%); max-height: 100%; overflow: auto; padding: 30px 34px 26px; box-sizing: border-box; background: linear-gradient(180deg, rgba(20,14,26,.97), rgba(8,5,12,.98)); border: 1px solid rgba(216,180,106,.45); box-shadow: 0 0 70px rgba(0,0,0,.85), inset 0 0 60px rgba(90,60,140,.08); }
#mpPanel .box::before, #mpPanel .box::after { content: ''; position: absolute; width: 18px; height: 18px; border: 1px solid #d8b46a; }
#mpPanel .box::before { left: 8px; top: 8px; border-right: none; border-bottom: none; }
#mpPanel .box::after { right: 8px; bottom: 8px; border-left: none; border-top: none; }
#mpPanel h2 { margin: 0; text-align: center; font-weight: normal; font-size: 27px; letter-spacing: .45em; text-indent: .45em; color: #e0bd72; }
#mpPanel .lead { margin: 8px 0 22px; text-align: center; font-size: 14.5px; line-height: 1.8; color: #a89a7a; letter-spacing: .05em; }
#mpPanel .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
#mpPanel .card { padding: 20px 20px 18px; border: 1px solid rgba(216,180,106,.28); background: rgba(0,0,0,.32); display: flex; flex-direction: column; gap: 10px; transition: border-color .15s, box-shadow .2s; }
#mpPanel .card:hover { border-color: rgba(216,180,106,.7); box-shadow: 0 0 26px rgba(216,180,106,.12); }
#mpPanel .card h3 { margin: 0; font-weight: normal; font-size: 20px; letter-spacing: .25em; color: #f0dca8; }
#mpPanel .card p { margin: 0; font-size: 14px; line-height: 1.75; color: #b8ac90; flex: 1; }
#mpPanel button { font: inherit; cursor: pointer; }
#mpPanel .go { padding: 11px 14px; font-size: 16px; letter-spacing: .25em; color: #1a120a; background: linear-gradient(180deg, #f0d890, #c89a48); border: none; transition: filter .15s; }
#mpPanel .go:hover { filter: brightness(1.12); }
#mpPanel .go:disabled { filter: grayscale(.8) brightness(.6); cursor: default; }
#mpPanel .ghost { padding: 9px 16px; font-size: 14.5px; letter-spacing: .18em; color: #e0bd72; background: none; border: 1px solid rgba(216,180,106,.45); }
#mpPanel .ghost:hover { border-color: #d8b46a; background: rgba(216,180,106,.08); }
#mpPanel .ghost.danger { color: #ff9a8a; border-color: rgba(255,120,100,.4); }
#mpPanel input { font: inherit; font-size: 24px; letter-spacing: .4em; text-indent: .4em; text-align: center; text-transform: uppercase; padding: 9px 6px; color: #fff2cc; background: rgba(0,0,0,.5); border: 1px solid rgba(216,180,106,.35); outline: none; width: 100%; box-sizing: border-box; }
#mpPanel input:focus { border-color: #d8b46a; box-shadow: 0 0 14px rgba(216,180,106,.2); }
#mpPanel .row { display: flex; gap: 8px; }
#mpPanel .codebox { margin: 4px auto 6px; padding: 16px 20px 14px; text-align: center; border: 1px solid rgba(216,180,106,.5); background: radial-gradient(ellipse at 50% 0%, rgba(216,180,106,.14), transparent 70%), rgba(0,0,0,.4); }
#mpPanel .codebox small { display: block; font-size: 12.5px; letter-spacing: .4em; text-indent: .4em; color: #a89a7a; }
#mpPanel .code { font-family: 'Cinzel', 'Consolas', monospace; font-size: 50px; letter-spacing: .32em; text-indent: .32em; color: #fff2cc; text-shadow: 0 0 22px rgba(216,180,106,.55); margin: 4px 0 10px; user-select: all; }
#mpPanel .list { margin: 18px 0 4px; display: grid; gap: 6px; }
#mpPanel .who { display: flex; align-items: center; gap: 12px; padding: 9px 14px; background: rgba(0,0,0,.3); border-left: 3px solid var(--c, #d8b46a); font-size: 16.5px; }
#mpPanel .who i { width: 11px; height: 11px; border-radius: 50%; background: var(--c, #d8b46a); box-shadow: 0 0 10px var(--c, #d8b46a); }
#mpPanel .who span { margin-left: auto; font-size: 12.5px; letter-spacing: .2em; color: #a89a7a; }
#mpPanel .foot { margin-top: 22px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
#mpPanel .note { font-size: 13px; color: #8a7e66; line-height: 1.7; }
#mpPanel .err { min-height: 1.4em; font-size: 13.5px; color: #ff9a8a; }
@media (max-width: 640px) { #mpPanel .two { grid-template-columns: 1fr; } #mpPanel .code { font-size: 36px; } }

/* タイトル画面: 接続の選び方を札にする */
.lobbyForm select#netSel { display: none; }
.netcards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; width: 100%; margin-bottom: 10px; }
.netcard { all: unset; box-sizing: border-box; cursor: pointer; padding: 12px 14px; border: 1px solid var(--panel-edge, rgba(216,180,106,.25)); background: rgba(0,0,0,.35); transition: .15s; }
.netcard b { display: block; font-weight: normal; font-size: 17px; letter-spacing: .12em; color: var(--ink, #e9e0cc); }
.netcard span { display: block; margin-top: 4px; font-size: 12.5px; line-height: 1.5; color: var(--ink-dim, #a39a86); }
.netcard:hover { border-color: var(--gold-dim, #8a6d36); }
.netcard.sel { border-color: var(--gold, #d8b46a); background: linear-gradient(180deg, rgba(216,180,106,.16), rgba(0,0,0,.35)); box-shadow: 0 0 20px rgba(216,180,106,.12); }
.netcard.sel b { color: var(--gold, #d8b46a); }
.lobbyForm #roomIn { font-size: 22px; letter-spacing: .35em; text-align: center; text-transform: uppercase; width: 230px !important; padding: 8px 6px; }
.lobbyForm #roomIn[readonly] { color: #fff2cc; border-color: var(--gold, #d8b46a); text-shadow: 0 0 14px rgba(216,180,106,.5); }

/* ゲーム中: 仲間の一覧 */
#party .pm { margin: 6px 0; width: 230px; padding: 6px 10px 7px; background: linear-gradient(90deg, rgba(8,5,12,.7), rgba(8,5,12,0)); border-left: 3px solid var(--c, #cfe8ff); }
#party .pm .nm { display: flex; align-items: baseline; gap: 8px; font-size: 15.5px; letter-spacing: .06em; text-shadow: 0 0 6px #000; }
#party .pm .nm small { font-size: 12px; color: #ffb0a0; letter-spacing: .1em; }
#party .pm .bar { height: 5px; margin-top: 5px; background: rgba(0,0,0,.55); }
#party .pm .bar div { height: 100%; transition: width .25s; }
#party .pm.down { opacity: .6; }
`;

let panel = null, deps = null;
const colorOf = id => { const c = deps?.colorOf?.(id); return c == null ? '#d8b46a' : '#' + c.toString(16).padStart(6, '0'); };

function restart(mode, code) {
  try { sessionStorage.setItem(AUTO, JSON.stringify({ mode, code })); } catch {}
  deps?.saveBefore?.();
  location.reload();
}
function render() {
  const box = panel.querySelector('.box');
  if (G.net) {
    const players = [...(G.net.players?.values?.() || [])];
    const code = G.roomCode || '';
    box.innerHTML = `<h2>仲 間 と 潜 る</h2>
      <p class="lead">${code ? 'この部屋コードを仲間に伝えると、仲間はタイトル画面かこの窓から入れる。' : '同じネットワークの部屋につながっている。'}</p>
      ${code ? `<div class="codebox"><small>部 屋 コ ー ド</small><div class="code">${esc(code)}</div><button class="go" id="mpCopy" type="button">コードをコピー</button></div>` : ''}
      <div class="list">${players.map(p => `<div class="who" style="--c:${p.id === G.netId ? '#ffb060' : colorOf(p.id)}"><i></i>${esc(p.name || '魔導師')}<span>${p.id === G.hostId ? '部屋の主' : ''}${p.id === G.netId ? (p.id === G.hostId ? ' ・ ' : '') + 'あなた' : ''}</span></div>`).join('')}</div>
      <div class="foot"><button class="ghost danger" id="mpLeave" type="button">部屋を抜ける</button><button class="ghost" id="mpClose" type="button">閉じる</button></div>`;
    const cp = box.querySelector('#mpCopy');
    if (cp) cp.onclick = () => copy(code, cp);
    box.querySelector('#mpLeave').onclick = () => { try { sessionStorage.removeItem(AUTO); } catch {} location.reload(); };
  } else {
    box.innerHTML = `<h2>仲 間 と 潜 る</h2>
      <p class="lead">仲間との旅は、第1層から新しく始まる。ひとり旅の記録はそのまま残る。</p>
      <div class="two">
        <div class="card"><h3>部屋を開く</h3><p>あなたが部屋の主になる。始まったら、この窓に出る部屋コードを仲間に伝える。</p><button class="go" id="mpHost" type="button">部屋を開く</button></div>
        <div class="card"><h3>部屋に入る</h3><p>仲間から聞いた部屋コードを入れる。</p><div class="row"><input id="mpCode" maxlength="12" autocomplete="off" spellcheck="false" placeholder="コード"><button class="ghost" id="mpPaste" type="button">貼る</button></div><button class="go" id="mpJoin" type="button" disabled>部屋に入る</button></div>
      </div>
      <div class="err" id="mpErr"></div>
      <div class="foot"><span class="note">${deps?.online === false ? 'オンラインはアプリ版でのみ使える。' : '選ぶと、いったん始め直してからつながる。'}</span><button class="ghost" id="mpClose" type="button">閉じる</button></div>`;
    const inp = box.querySelector('#mpCode'), join = box.querySelector('#mpJoin'), host = box.querySelector('#mpHost');
    if (deps?.online === false) { host.disabled = true; inp.disabled = true; }
    inp.oninput = () => { inp.value = inp.value.toUpperCase().replace(/\s/g, ''); join.disabled = inp.value.length < 4; };
    inp.onkeydown = e => { e.stopPropagation(); if (e.code === 'Enter' && !join.disabled) join.click(); };
    box.querySelector('#mpPaste').onclick = async () => { try { inp.value = (await navigator.clipboard.readText()).trim().toUpperCase().slice(0, 12); inp.oninput(); } catch { box.querySelector('#mpErr').textContent = '貼り付けできなかった。手で入れてください。'; } };
    host.onclick = () => restart('host', makeCode());
    join.onclick = () => restart('join', inp.value.trim());
  }
  box.querySelector('#mpClose').onclick = closeMp;
}
function copy(text, btn) {
  const done = () => { const t = btn.textContent; btn.textContent = 'コピーした'; setTimeout(() => { btn.textContent = t; }, 1500); };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done)); else fallbackCopy(text, done);
}
function fallbackCopy(text, done) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch {} t.remove(); }

export function openMp() {
  if (!panel) { panel = document.createElement('div'); panel.id = 'mpPanel'; panel.innerHTML = '<div class="box"></div>'; document.body.appendChild(panel); panel.addEventListener('click', e => { if (e.target === panel) closeMp(); }); }
  render(); panel.classList.remove('hidden');
}
export function closeMp() { panel?.classList.add('hidden'); }
addEventListener('keydown', e => { if (e.code === 'Escape' && panel && !panel.classList.contains('hidden')) { e.stopImmediatePropagation(); e.preventDefault(); closeMp(); } }, true);
export const mpOpen = () => !!panel && !panel.classList.contains('hidden');
export function refreshMp() { if (mpOpen()) render(); }

// 始め直した後の覚え書きを取り出す(一度きり)
export function takeAuto() { try { const s = sessionStorage.getItem(AUTO); sessionStorage.removeItem(AUTO); return s ? JSON.parse(s) : null; } catch { return null; } }

// d = { colorOf(id), saveBefore(), online }
export function initMp(d) {
  deps = d;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  // タイトル画面: 選択欄の代わりに札を並べる(選択欄そのものは裏で使い続ける)
  const sel = document.getElementById('netSel'); if (!sel) return;
  const INFO = { solo: ['ひとりで', '後からメニューで仲間を呼べる'], host: ['部屋を開く', 'コードを仲間に伝える'], join: ['部屋に入る', '聞いたコードを入れる'], lan: ['LAN', '同じネットワークで直接'] };
  const wrap = document.createElement('div'); wrap.className = 'netcards';
  for (const o of sel.options) { const b = document.createElement('button'); b.type = 'button'; b.className = 'netcard' + (o.value === sel.value ? ' sel' : ''); b.dataset.v = o.value; b.innerHTML = `<b>${INFO[o.value]?.[0] || esc(o.textContent)}</b><span>${INFO[o.value]?.[1] || ''}</span>`; b.onclick = () => setNet(o.value); wrap.appendChild(b); }
  sel.parentElement.parentElement.insertBefore(wrap, sel.parentElement);
}
export function setNet(v) {
  const sel = document.getElementById('netSel'); if (!sel || ![...sel.options].some(o => o.value === v)) return false;
  sel.value = v; sel.onchange?.();
  document.querySelectorAll('.netcard').forEach(b => b.classList.toggle('sel', b.dataset.v === v));
  return true;
}
