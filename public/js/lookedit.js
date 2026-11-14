// 姿を変える画面: 自分の精霊の子(仲間から見える姿)を、部品を選んで組み立てる。左に回る見本、右に選ぶ欄。
// 選んだ姿はこの端末に保存し、仲間と潜っている間は相手の画面にも同じ姿で映る。
import * as THREE from 'three';
import { LOOK_PARTS, DEFAULT_LOOK, makeCompanion, lookToStr, parseLook, randomLook, lookColor } from './companion.js';

const KEY = 'arcana_look';
let look = null, panel = null, onChange = null;
let renderer = null, scene = null, camera = null, model = null, raf = 0, last = 0, spin = 0.5, demoChant = false;

// 着る物の枠(迷宮で見つけた物だけ着けられる)。それ以外(色・目・腹の紋・光の輪・頭の上・色合い)は、いつでも自由
export const WEAR_KEYS = ['head', 'face', 'neck', 'wear', 'back', 'hands', 'feet'];
const WKEY = 'arcana_wardrobe';
let owned = null;
function wardrobe() { if (!owned) { try { owned = new Set(JSON.parse(localStorage.getItem(WKEY)) || []); } catch { owned = new Set(); } } return owned; }
const has = (key, i) => i === 0 || !WEAR_KEYS.includes(key) || wardrobe().has(key + ':' + i);
const WEAR_ALL = LOOK_PARTS.filter(p => WEAR_KEYS.includes(p.key)).flatMap(p => p.names.slice(1).map((name, k) => ({ key: p.key, i: k + 1, name, slot: p.label })));
export const wardrobeCount = () => ({ have: WEAR_ALL.filter(w => wardrobe().has(w.key + ':' + w.i)).length, all: WEAR_ALL.length });
// 全滅した時: 拾った物をすべて失い、着ていた物も外れる
export function clearWardrobe() {
  owned = new Set(); try { localStorage.removeItem(WKEY); } catch {}
  if (look) { fit(look); try { localStorage.setItem(KEY, lookToStr(look)); } catch {} paintButton(); onChange?.(lookToStr(look)); }
  if (panel && !panel.classList.contains('hidden')) { render(); rebuild(); }
}
// まだ持っていない着る物を一つ手に入れる。全部持っていれば null
export function grantRandomWear() {
  const rest = WEAR_ALL.filter(w => !wardrobe().has(w.key + ':' + w.i)); if (!rest.length) return null;
  const w = rest[Math.floor(Math.random() * rest.length)];
  wardrobe().add(w.key + ':' + w.i); try { localStorage.setItem(WKEY, JSON.stringify([...owned])); } catch {}
  if (panel && !panel.classList.contains('hidden')) render();
  return w;
}
// 持っていない物は外す
function fit(l) { for (const k of WEAR_KEYS) if (!has(k, l[k])) l[k] = 0; return l; }
export function myLook() {
  if (look) return look;
  try { look = parseLook(localStorage.getItem(KEY)); } catch {}
  if (look) fit(look);
  if (!look) { const h = Math.floor(Math.random() * 360); look = { ...DEFAULT_LOOK, hue: h, hue2: (h + 190) % 360 }; try { localStorage.setItem(KEY, lookToStr(look)); } catch {} }   // 初めての時は、色だけ無作為に
  return look;
}
export const myLookStr = () => lookToStr(myLook());

const CSS = `
#lookPanel { position: fixed; inset: 0; z-index: 84; display: grid; place-items: center; padding: 20px; box-sizing: border-box; background: rgba(3,2,6,.8); backdrop-filter: blur(4px); color: #e8dcc0; pointer-events: auto; }
#lookPanel.hidden { display: none; }
#lookPanel .box { width: min(940px, 100%); max-height: 100%; overflow: auto; padding: 26px 30px 22px; box-sizing: border-box; background: linear-gradient(180deg, rgba(20,14,26,.97), rgba(8,5,12,.98)); border: 1px solid rgba(216,180,106,.45); box-shadow: 0 0 70px rgba(0,0,0,.85); }
#lookPanel h2 { margin: 0; text-align: center; font-weight: normal; font-size: 26px; letter-spacing: .45em; text-indent: .45em; color: #e0bd72; }
#lookPanel .lead { margin: 6px 0 18px; text-align: center; font-size: 14px; color: #a89a7a; letter-spacing: .05em; }
#lookPanel .cols { display: grid; grid-template-columns: 340px 1fr; gap: 26px; align-items: start; }
#lookPanel .view { position: relative; border: 1px solid rgba(216,180,106,.3); background: radial-gradient(ellipse at 50% 70%, rgba(90,70,130,.35), rgba(0,0,0,.6) 70%); }
#lookPanel canvas { display: block; width: 100%; height: 440px; cursor: grab; }
#lookPanel .view span { position: absolute; left: 0; right: 0; bottom: 8px; text-align: center; font-size: 12.5px; color: #8a7e66; pointer-events: none; }
#lookPanel .row { display: grid; grid-template-columns: 78px 1fr; align-items: center; gap: 8px; margin: 0 0 7px; }
#lookPanel .row > b { font-weight: normal; font-size: 13.5px; letter-spacing: .25em; color: #a89a7a; }
#lookPanel .opts { display: flex; flex-wrap: wrap; gap: 6px; }
#lookPanel button { font: inherit; cursor: pointer; }
#lookPanel .opt { padding: 4px 10px; font-size: 13.5px; color: #d8ccb0; background: rgba(0,0,0,.35); border: 1px solid rgba(216,180,106,.22); transition: .12s; }
#lookPanel .opt:hover { border-color: rgba(216,180,106,.6); }
#lookPanel .none { margin: 4px 0 0; font-size: 13.5px; color: #8a7e66; line-height: 1.7; }
#lookPanel .opt.lock { color: #5a5248; border-style: dashed; cursor: default; }
#lookPanel .opt.lock:hover { border-color: rgba(216,180,106,.22); }
#lookPanel .sep { margin: 14px 0 9px; padding-top: 10px; border-top: 1px solid rgba(216,180,106,.2); font-size: 14px; letter-spacing: .25em; color: #d8b46a; }
#lookPanel .sep span { margin-left: 10px; font-size: 12.5px; letter-spacing: .05em; color: #8a7e66; }
#lookPanel .opt.sel { color: #1a120a; background: linear-gradient(180deg, #f0d890, #c89a48); border-color: #d8b46a; }
#lookPanel input[type=range] { width: 100%; height: 14px; -webkit-appearance: none; appearance: none; border-radius: 7px; outline: none; background: linear-gradient(90deg, hsl(0,60%,50%), hsl(60,60%,50%), hsl(120,60%,50%), hsl(180,60%,50%), hsl(240,60%,50%), hsl(300,60%,50%), hsl(360,60%,50%)); }
#lookPanel input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 22px; border-radius: 4px; background: #fff6dc; border: 2px solid #1a120a; cursor: pointer; }
#lookPanel .foot { margin-top: 18px; display: flex; justify-content: space-between; gap: 10px; }
#lookPanel .ghost { padding: 9px 16px; font-size: 14.5px; letter-spacing: .18em; color: #e0bd72; background: none; border: 1px solid rgba(216,180,106,.45); }
#lookPanel .ghost:hover { border-color: #d8b46a; background: rgba(216,180,106,.08); }
#lookPanel .go { padding: 10px 34px; font-size: 16px; letter-spacing: .3em; color: #1a120a; background: linear-gradient(180deg, #f0d890, #c89a48); border: none; }
#lookBtn { margin-left: 12px; padding: 7px 14px; font: inherit; font-size: 14px; letter-spacing: .15em; color: #e0bd72; background: rgba(0,0,0,.35); border: 1px solid rgba(216,180,106,.4); cursor: pointer; white-space: nowrap; }
#lookBtn:hover { border-color: #d8b46a; }
#lookBtn i { display: inline-block; width: 11px; height: 11px; border-radius: 50%; margin-right: 8px; vertical-align: -1px; box-shadow: 0 0 8px currentColor; }
@media (max-width: 760px) { #lookPanel .cols { grid-template-columns: 1fr; } #lookPanel canvas { height: 300px; } }
`;

function rebuild() {
  if (!scene) return;
  if (model) { scene.remove(model); model.traverse(o => { o.geometry?.dispose?.(); o.material?.map?.dispose?.(); o.material?.dispose?.(); }); }
  model = makeCompanion(look); scene.add(model);
}
function frame(now) {
  raf = requestAnimationFrame(frame);
  if (!panel || panel.classList.contains('hidden') || !renderer) return;
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
  if (!drag) spin += dt * 0.5;
  if (model) { model.rotation.y = spin; model.userData.tick(dt, { speed: 0, chanting: demoChant, cast: false, downed: false }); }
  renderer.render(scene, camera);
}
let drag = null;
function setup(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const fit = () => { const w = canvas.clientWidth || 340, h = canvas.clientHeight || 400; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 340 / 400, 0.1, 50); camera.position.set(0, 1.6, -5.2); camera.lookAt(0, 1.22, 0);
  scene.add(new THREE.HemisphereLight(0xfff0e0, 0x30283c, 1.5));
  const key = new THREE.DirectionalLight(0xfff2dc, 2.2); key.position.set(-2.5, 4, -4); scene.add(key);
  const back = new THREE.DirectionalLight(0x8a7aff, 1.2); back.position.set(3, 2, 4); scene.add(back);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.5, 40), new THREE.MeshBasicMaterial({ color: 0x1a1424, transparent: true, opacity: 0.8 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  fit(); addEventListener('resize', fit);
  canvas.onpointerdown = e => { drag = { x: e.clientX, s: spin }; canvas.setPointerCapture(e.pointerId); };
  canvas.onpointermove = e => { if (drag) spin = drag.s + (e.clientX - drag.x) * 0.012; };
  canvas.onpointerup = canvas.onpointercancel = () => { drag = null; };
}
function render() {
  // 持っている物だけを並べる(何が何個あるかは見せない。集めて埋める物ではないので)
  const opt = (p, n, i) => has(p.key, i) ? `<button type="button" class="opt${look[p.key] === i ? ' sel' : ''}" data-k="${p.key}" data-i="${i}">${n}</button>` : '';
  const part = p => `<div class="row"><b>${p.label}</b><div class="opts">${p.names.map((n, i) => opt(p, n, i)).join('')}</div></div>`;
  const free = LOOK_PARTS.filter(p => !WEAR_KEYS.includes(p.key)), wear = LOOK_PARTS.filter(p => WEAR_KEYS.includes(p.key) && p.names.some((_, i) => i > 0 && has(p.key, i)));
  const rows = free.map(part).join('') + `<div class="sep">身に着ける物 <span>この旅で拾った物。全滅すると失う</span></div>` + (wear.length ? wear.map(part).join('') : '<p class="none">まだ何も拾っていない。宝箱や、層の主の亡骸から見つかることがある。</p>');
  panel.querySelector('.side').innerHTML = `<div class="row"><b>体の色</b><input type="range" id="lookHue" min="0" max="359" value="${look.hue}"></div><div class="row"><b>服の色</b><input type="range" id="lookHue2" min="0" max="359" value="${look.hue2}"></div>${rows}`;
  panel.querySelectorAll('.opt').forEach(b => { b.onclick = () => { look[b.dataset.k] = +b.dataset.i; render(); rebuild(); }; });
  panel.querySelector('#lookHue').oninput = e => { look.hue = +e.target.value; rebuildSoon(); };
  panel.querySelector('#lookHue2').oninput = e => { look.hue2 = +e.target.value; rebuildSoon(); };
}
let soonT = 0;
function rebuildSoon() { clearTimeout(soonT); soonT = setTimeout(rebuild, 60); }
function save() {
  try { localStorage.setItem(KEY, lookToStr(look)); } catch {}
  paintButton(); onChange?.(lookToStr(look));
}
export function openLookEditor() {
  myLook();
  if (!panel) {
    panel = document.createElement('div'); panel.id = 'lookPanel';
    panel.innerHTML = `<div class="box"><h2>姿 を 変 え る</h2><p class="lead">精霊の子 — 仲間から見える、あなたの姿。色や目は、いつでも変えられる。身に着ける物は、その旅で拾った物を着ける。</p>
      <div class="cols"><div class="view"><canvas></canvas><span>引くと回る</span></div><div class="side"></div></div>
      <div class="foot"><div style="display:flex;gap:8px"><button class="ghost" id="lookRnd" type="button">おまかせ</button><button class="ghost" id="lookChant" type="button">詠唱の姿を見る</button></div><button class="go" id="lookOk" type="button">決める</button></div></div>`;
    document.body.appendChild(panel);
    setup(panel.querySelector('canvas'));
    panel.querySelector('#lookRnd').onclick = () => { const r = randomLook(); for (const k of WEAR_KEYS) { const p = LOOK_PARTS.find(x => x.key === k), ok = p.names.map((_, i) => i).filter(i => has(k, i)); r[k] = ok[Math.floor(Math.random() * ok.length)]; } look = r; render(); rebuild(); };
    panel.querySelector('#lookChant').onclick = e => { demoChant = !demoChant; e.target.textContent = demoChant ? '立ち姿を見る' : '詠唱の姿を見る'; };
    panel.querySelector('#lookOk').onclick = closeLookEditor;
    addEventListener('keydown', e => { if (e.code === 'Escape' && panel && !panel.classList.contains('hidden')) { e.stopImmediatePropagation(); e.preventDefault(); closeLookEditor(); } }, true);
    raf = requestAnimationFrame(frame);
  }
  panel.classList.remove('hidden'); render(); rebuild();
}
export function closeLookEditor() { if (!panel || panel.classList.contains('hidden')) return; panel.classList.add('hidden'); save(); }
export const lookEditorOpen = () => !!panel && !panel.classList.contains('hidden');

let btn = null;
function paintButton() { if (btn) btn.innerHTML = `<i style="background:#${lookColor(myLook()).getHexString()};color:#${lookColor(myLook()).getHexString()}"></i>姿を変える`; }
// change(str) = 姿が変わった時に呼ぶ(仲間へ知らせるため)
export function initLook(change) {
  onChange = change; myLook();
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const name = document.getElementById('nameIn'); if (!name) return;
  name.parentElement.style.display = 'flex'; name.parentElement.style.flexWrap = 'wrap'; name.parentElement.style.alignItems = 'center';
  name.style.flex = '1'; name.style.minWidth = '160px';
  const label = name.parentElement.querySelector('.flabel'); if (label) label.style.width = '100%';
  btn = document.createElement('button'); btn.id = 'lookBtn'; btn.type = 'button'; btn.onclick = openLookEditor; name.parentElement.appendChild(btn);
  paintButton();
}
