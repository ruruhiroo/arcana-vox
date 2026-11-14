// 音の機器の設定: 使うマイクと、音の出力先を、ゲームの中で選ぶ。マイクの入り具合も、その場で確かめられる。
//   micAudio(extra)  … getUserMedia に渡す audio の指定(選んだマイクを使う)
//   applyOutput(ctx) … 選んだ出力先へ音を出す
//   openDevicePanel()… 選ぶ窓を開く(タイトル画面と、設定の「音」から)
const MIC = 'arcana_mic', OUT = 'arcana_out';
const get = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const put = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 選んだマイクを使う指定。選んでいなければ、Windows の既定のマイク
export function micAudio(extra = {}) {
  const id = get(MIC);
  return { ...extra, ...(id ? { deviceId: { exact: id } } : {}) };
}
// 選んだマイクが無くなっていた時(抜いた・名前が変わった)は、既定のマイクでやり直す
export async function openMic(extra = {}) {
  try { return await navigator.mediaDevices.getUserMedia({ audio: micAudio(extra) }); }
  catch (e) {
    if (get(MIC) && (e?.name === 'OverconstrainedError' || e?.name === 'NotFoundError')) { put(MIC, ''); return navigator.mediaDevices.getUserMedia({ audio: extra }); }
    throw e;
  }
}
let audioCtx = null;
export async function applyOutput(ctx = audioCtx) {
  if (ctx) audioCtx = ctx;
  const id = get(OUT);
  if (!audioCtx?.setSinkId) return false;
  try { await audioCtx.setSinkId(id || ''); return true; }
  catch { if (id) { put(OUT, ''); try { await audioCtx.setSinkId(''); } catch {} } return false; }
}

const CSS = `
#devPanel { position: fixed; inset: 0; z-index: 86; display: grid; place-items: center; padding: 20px; box-sizing: border-box; background: rgba(3,2,6,.8); backdrop-filter: blur(4px); color: #e8dcc0; pointer-events: auto; }
#devPanel.hidden { display: none; }
#devPanel .box { width: min(640px, 100%); max-height: 100%; overflow: auto; padding: 26px 30px 22px; box-sizing: border-box; background: linear-gradient(180deg, rgba(20,14,26,.97), rgba(8,5,12,.98)); border: 1px solid rgba(216,180,106,.45); box-shadow: 0 0 70px rgba(0,0,0,.85); }
#devPanel h2 { margin: 0 0 4px; text-align: center; font-weight: normal; font-size: 25px; letter-spacing: .4em; text-indent: .4em; color: #e0bd72; }
#devPanel .lead { margin: 0 0 18px; text-align: center; font-size: 13.5px; color: #a89a7a; line-height: 1.7; }
#devPanel label { display: block; margin: 14px 0 6px; font-size: 13px; letter-spacing: .3em; color: #a89a7a; }
#devPanel select { width: 100%; padding: 9px 10px; font: inherit; font-size: 15px; color: #f0e6cc; background: #120d16; border: 1px solid rgba(216,180,106,.35); outline: none; }
#devPanel select:focus { border-color: #d8b46a; }
#devPanel .meter { height: 14px; margin-top: 10px; background: rgba(0,0,0,.5); border: 1px solid rgba(216,180,106,.25); overflow: hidden; }
#devPanel .meter i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #5a9a5a, #d8c05a 70%, #e06a4a); transition: width .06s linear; }
#devPanel .note { min-height: 1.5em; margin-top: 8px; font-size: 13.5px; line-height: 1.7; color: #cfc4a8; }
#devPanel .note.bad { color: #ff9a8a; }
#devPanel .row { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
#devPanel button { font: inherit; cursor: pointer; }
#devPanel .ghost { padding: 8px 14px; font-size: 14px; letter-spacing: .15em; color: #e0bd72; background: none; border: 1px solid rgba(216,180,106,.45); }
#devPanel .ghost:hover { border-color: #d8b46a; background: rgba(216,180,106,.08); }
#devPanel .foot { margin-top: 20px; display: flex; justify-content: flex-end; }
#devPanel .go { padding: 9px 30px; font-size: 15px; letter-spacing: .3em; color: #1a120a; background: linear-gradient(180deg, #f0d890, #c89a48); border: none; }
#devBtn { margin: 8px 0 0; padding: 6px 12px; font: inherit; font-size: 13.5px; letter-spacing: .12em; color: #e0bd72; background: rgba(0,0,0,.35); border: 1px solid rgba(216,180,106,.4); cursor: pointer; }
#devBtn:hover { border-color: #d8b46a; }
`;
let panel = null, test = null, onChange = null;
const WHY = {
  NotAllowedError: 'マイクの使用が許可されていない。Windows の 設定 → プライバシーとセキュリティ → マイク で、「デスクトップ アプリにマイクへのアクセスを許可する」を入にする',
  NotFoundError: 'マイクが見つからない。マイクがつながっているか、Windows の 設定 → システム → サウンド → 入力 に出ているかを確かめる',
  NotReadableError: 'マイクを他のアプリが使っているか、機器に問題がある。他のアプリ(通話など)を閉じて、もう一度試す',
  OverconstrainedError: '選んだマイクが見つからない。別のマイクを選ぶ',
};
function stopTest() { if (!test) return; cancelAnimationFrame(test.raf); test.stream.getTracks().forEach(t => t.stop()); test.ctx.close().catch(() => {}); test = null; const b = panel?.querySelector('#devTest'); if (b) b.textContent = 'マイクを試す'; const m = panel?.querySelector('.meter i'); if (m) m.style.width = '0'; }
async function startTest() {
  stopTest();
  const note = panel.querySelector('#devMicNote');
  try {
    const stream = await openMic({ echoCancellation: true, noiseSuppression: true });
    const ctx = new (window.AudioContext || window.webkitAudioContext)(), an = ctx.createAnalyser(); an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize), bar = panel.querySelector('.meter i');
    let peak = 0;
    const tick = () => { an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; const lv = Math.min(1, Math.sqrt(s / buf.length) * 6); peak = Math.max(peak * 0.94, lv); bar.style.width = Math.round(peak * 100) + '%'; test.raf = requestAnimationFrame(tick); };
    test = { stream, ctx, raf: 0 }; tick();
    note.className = 'note'; note.textContent = '声を出すと、上の帯が動く。動かなければ、別のマイクを選ぶか、Windows 側の入力の音量を上げる。';
    panel.querySelector('#devTest').textContent = '試すのをやめる';
    await fill();          // 許可が出ると、機器の名前が読めるようになる
  } catch (e) { note.className = 'note bad'; note.textContent = WHY[e?.name] || ('マイクを開けなかった(' + (e?.name || e) + ')'); }
}
async function fill() {
  let list = [];
  try { list = await navigator.mediaDevices.enumerateDevices(); } catch {}
  const ins = list.filter(d => d.kind === 'audioinput' && d.deviceId !== 'communications'), outs = list.filter(d => d.kind === 'audiooutput' && d.deviceId !== 'communications');
  const opts = (arr, cur, word) => `<option value="">Windows の既定の${word}</option>` + arr.filter(d => d.deviceId && d.deviceId !== 'default').map((d, i) => `<option value="${esc(d.deviceId)}"${d.deviceId === cur ? ' selected' : ''}>${esc(d.label || word + ' ' + (i + 1))}</option>`).join('');
  panel.querySelector('#devMic').innerHTML = opts(ins, get(MIC), 'マイク');
  panel.querySelector('#devOut').innerHTML = opts(outs, get(OUT), '出力先');
  const mn = panel.querySelector('#devMicNote');
  if (!ins.length) { mn.className = 'note bad'; mn.textContent = 'マイクが一つも見つからない。' + WHY.NotFoundError.replace('マイクが見つからない。', ''); }
  else if (!ins.some(d => d.label) && !test) { mn.className = 'note'; mn.textContent = '「マイクを試す」を押すと、マイクの名前が出て選べるようになる。'; }
  const on = panel.querySelector('#devOutNote');
  on.className = 'note' + (outs.length ? '' : ' bad');
  on.textContent = !outs.length ? '音の出力先が一つも見つからない。スピーカーやヘッドホンがつながっているか、Windows の 設定 → システム → サウンド → 出力 を確かめる。音が出ないのは、これが原因。'
    : !('setSinkId' in (window.AudioContext || window.webkitAudioContext).prototype) ? 'この環境では出力先を選べない(Windows の既定の出力先から出る)。' : '';
}
export async function openDevicePanel() {
  if (!panel) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    panel = document.createElement('div'); panel.id = 'devPanel';
    panel.innerHTML = `<div class="box"><h2>音 と マ イ ク</h2><p class="lead">声で詠唱するマイクと、音を出す先を選ぶ。選んだ機器は、このPCに覚えておく。</p>
      <label>マ イ ク</label><select id="devMic"></select>
      <div class="meter"><i></i></div>
      <div class="row"><button class="ghost" id="devTest" type="button">マイクを試す</button><button class="ghost" id="devRe" type="button">機器を探し直す</button></div>
      <div class="note" id="devMicNote"></div>
      <label>音 の 出 力 先</label><select id="devOut"></select>
      <div class="row"><button class="ghost" id="devBeep" type="button">音を鳴らしてみる</button></div>
      <div class="note" id="devOutNote"></div>
      <div class="foot"><button class="go" id="devOk" type="button">閉じる</button></div></div>`;
    document.body.appendChild(panel);
    panel.querySelector('#devMic').onchange = e => { put(MIC, e.target.value); onChange?.('mic'); if (test) startTest(); panel.querySelector('#devMicNote').textContent = 'マイクを替えた。次に詠唱を始める時から、このマイクを使う(うまく切り替わらなければ、タイトルへ戻って始め直す)。'; };
    panel.querySelector('#devOut').onchange = async e => { put(OUT, e.target.value); const ok = await applyOutput(); onChange?.('out'); panel.querySelector('#devOutNote').textContent = ok || !audioCtx ? '出力先を替えた。' : '出力先を替えられなかった(Windows の既定の出力先から出る)。'; };
    panel.querySelector('#devTest').onclick = () => test ? stopTest() : startTest();
    panel.querySelector('#devRe').onclick = fill;
    panel.querySelector('#devBeep').onclick = async () => {
      const c = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (!audioCtx) { audioCtx = c; await applyOutput(c); }
      try { await c.resume(); } catch {}
      const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 660; g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(0.2, c.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5); o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.55);
      const n = panel.querySelector('#devOutNote'); n.className = 'note'; n.textContent = 'いま音を鳴らした。聞こえなければ、出力先を替えるか、Windows の音量と、音量ミキサーでこのゲームが消音になっていないかを確かめる。';
    };
    panel.querySelector('#devOk').onclick = closeDevicePanel;
    addEventListener('keydown', e => { if (e.code === 'Escape' && panel && !panel.classList.contains('hidden')) { e.stopImmediatePropagation(); e.preventDefault(); closeDevicePanel(); } }, true);
    navigator.mediaDevices?.addEventListener?.('devicechange', () => { if (panel && !panel.classList.contains('hidden')) fill(); });
  }
  panel.classList.remove('hidden');
  await fill();
}
export function closeDevicePanel() { stopTest(); panel?.classList.add('hidden'); }
// タイトル画面に入口を置く。change(kind) = 機器を替えた時に呼ぶ
export function initDevices(change) {
  onChange = change;
  const host = document.getElementById('voiceNote')?.parentElement || document.querySelector('.lobbyFoot'); if (!host) return;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const b = document.createElement('button'); b.id = 'devBtn'; b.type = 'button'; b.textContent = '音とマイクの設定'; b.onclick = openDevicePanel;
  host.insertBefore(b, host.firstChild);
}
