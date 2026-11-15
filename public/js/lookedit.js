// 体の色を選ぶ: 自分の精霊の子(仲間から見える姿)は、形は皆同じで、色だけが違う。
// 選んだ色はこの端末に保存し、仲間と潜っている間は相手の画面にも同じ色で映る。自分の画面に見える手も同じ色になる。
import { DEFAULT_LOOK, lookToStr, parseLook, lookColor } from './companion.js';
import { tintHands } from './fphand.js';

const KEY = 'arcana_look';
let look = null, panel = null, onChange = null;

// 着る物は無くした(色だけ)。前の版で拾った物の記録は消す
export function clearWardrobe() { try { localStorage.removeItem('arcana_wardrobe'); } catch {} }
export const grantRandomWear = () => null;

export function myLook() {
  if (look) return look;
  let hue = null;
  try { hue = parseLook(localStorage.getItem(KEY))?.hue ?? null; } catch {}
  const fresh = hue == null;
  if (fresh) hue = Math.floor(Math.random() * 360);          // 初めての時は、色を無作為に
  look = { ...DEFAULT_LOOK, hue, hue2: (hue + 190) % 360 };  // 色のほかは皆同じ
  if (fresh) { try { localStorage.setItem(KEY, lookToStr(look)); } catch {} }
  tintHands(lookColor(look));
  return look;
}
export const myLookStr = () => lookToStr(myLook());

const CSS = `
#lookPanel { position: fixed; inset: 0; z-index: 84; display: grid; place-items: center; padding: 20px; box-sizing: border-box; background: rgba(3,2,6,.6); color: #e8dcc0; pointer-events: auto; }
#lookPanel.hidden { display: none; }
#lookPanel .box { width: min(460px, 100%); padding: 24px 28px 22px; box-sizing: border-box; background: linear-gradient(180deg, rgba(20,14,26,.97), rgba(8,5,12,.98)); border: 1px solid rgba(216,180,106,.45); box-shadow: 0 0 70px rgba(0,0,0,.85); }
#lookPanel h2 { margin: 0 0 16px; text-align: center; font-weight: normal; font-size: 22px; letter-spacing: .45em; text-indent: .45em; color: #e0bd72; }
#lookPanel .sw { width: 84px; height: 84px; margin: 0 auto 18px; border-radius: 26px 26px 22px 22px; box-shadow: 0 0 34px currentColor, inset 0 -14px 22px rgba(0,0,0,.35), inset 0 10px 16px rgba(255,255,255,.25); }
#lookPanel input[type=range] { display: block; width: 100%; height: 16px; margin: 0; -webkit-appearance: none; appearance: none; border-radius: 8px; outline: none; background: linear-gradient(90deg, hsl(0,60%,50%), hsl(60,60%,50%), hsl(120,60%,50%), hsl(180,60%,50%), hsl(240,60%,50%), hsl(300,60%,50%), hsl(360,60%,50%)); }
#lookPanel input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 26px; border-radius: 4px; background: #fff6dc; border: 2px solid #1a120a; cursor: pointer; }
#lookPanel .go { display: block; margin: 20px auto 0; padding: 10px 40px; font: inherit; font-size: 16px; letter-spacing: .3em; color: #1a120a; background: linear-gradient(180deg, #f0d890, #c89a48); border: none; cursor: pointer; }
#lookBtn { margin-left: 12px; padding: 7px 14px; font: inherit; font-size: 14px; letter-spacing: .15em; color: #e0bd72; background: rgba(0,0,0,.35); border: 1px solid rgba(216,180,106,.4); cursor: pointer; white-space: nowrap; }
#lookBtn:hover { border-color: #d8b46a; }
#lookBtn i { display: inline-block; width: 11px; height: 11px; border-radius: 50%; margin-right: 8px; vertical-align: -1px; box-shadow: 0 0 8px currentColor; }
`;

const hex = () => '#' + lookColor(myLook()).getHexString();
function paint() {
  tintHands(lookColor(myLook()));
  const sw = panel?.querySelector('.sw'); if (sw) { sw.style.background = hex(); sw.style.color = hex(); }
  paintButton();
}
function save() {
  try { localStorage.setItem(KEY, lookToStr(look)); } catch {}
  onChange?.(lookToStr(look));
}
export function openLookEditor() {
  myLook();
  if (!panel) {
    panel = document.createElement('div'); panel.id = 'lookPanel';
    panel.innerHTML = `<div class="box"><h2>体 の 色</h2><div class="sw"></div><input type="range" id="lookHue" min="0" max="359"><button class="go" id="lookOk" type="button">決める</button></div>`;
    document.body.appendChild(panel);
    panel.querySelector('#lookHue').oninput = e => { look.hue = +e.target.value; look.hue2 = (look.hue + 190) % 360; paint(); };
    panel.querySelector('#lookOk').onclick = closeLookEditor;
    panel.onclick = e => { if (e.target === panel) closeLookEditor(); };
    addEventListener('keydown', e => { if (e.code === 'Escape' && panel && !panel.classList.contains('hidden')) { e.stopImmediatePropagation(); e.preventDefault(); closeLookEditor(); } }, true);
  }
  panel.querySelector('#lookHue').value = look.hue;
  panel.classList.remove('hidden'); paint();
}
export function closeLookEditor() { if (!panel || panel.classList.contains('hidden')) return; panel.classList.add('hidden'); save(); }
export const lookEditorOpen = () => !!panel && !panel.classList.contains('hidden');

let btn = null;
function paintButton() { if (btn) btn.innerHTML = `<i style="background:${hex()};color:${hex()}"></i>体の色`; }
// change(str) = 色が変わった時に呼ぶ(仲間へ知らせるため)
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
