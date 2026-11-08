// 操作設定: キー割り当て(マウスボタン含む)と各種オプション。localStorage に保存する
const KEY = 'arcana_vox_controls_v1';

export const ACTIONS = [
  { id: 'forward', label: '前進', def: 'KeyW', group: '移動' },
  { id: 'back', label: '後退', def: 'KeyS', group: '移動' },
  { id: 'left', label: '左へ', def: 'KeyA', group: '移動' },
  { id: 'right', label: '右へ', def: 'KeyD', group: '移動' },
  { id: 'sprint', label: '走る', def: 'ShiftLeft', group: '移動' },
  { id: 'jump', label: 'ジャンプ', def: 'Space', group: '移動' },
  { id: 'voice', label: '詠唱(押す間)', def: 'KeyV', group: '詠唱' },
  { id: 'continuous', label: '常時詠唱', def: 'KeyC', group: '詠唱' },
  { id: 'read', label: '魔導書を掲げる', def: 'Mouse2', group: '詠唱' },
  { id: 'pageNext', label: '次のページ', def: 'KeyX', group: '詠唱' },
  { id: 'pagePrev', label: '前のページ', def: 'KeyZ', group: '詠唱' },
  { id: 'typed', label: '文字で詠唱', def: 'Enter', group: '詠唱' },
  { id: 'interact', label: '調べる・拾う・転移', def: 'KeyF', group: '行動' },
  { id: 'item1', label: '回復薬', def: 'Digit1', group: '行動' },
  { id: 'item2', label: '魔力薬', def: 'Digit2', group: '行動' },
  { id: 'item3', label: '護符', def: 'Digit3', group: '行動' },
  { id: 'item4', label: '閃光玉', def: 'Digit4', group: '行動' },
  { id: 'item5', label: '導灯', def: 'Digit5', group: '行動' },
  { id: 'grimoire', label: '魔導書を開く', def: 'Tab', group: '画面' },
  { id: 'textbook', label: '教本(言霊辞典)を開く', def: 'KeyB', group: '画面' },
  { id: 'inventory', label: '所持品・装備', def: 'KeyE', group: '画面' },
  { id: 'ambience', label: '環境音', def: 'KeyM', group: '画面' },
  { id: 'tts', label: 'NPCの読み上げ', def: 'KeyT', group: '画面' },
];

export const OPTION_DEFS = {
  sens: 1, invertY: false, fov: 72, headBob: true, wheelPages: true, typedChant: false, furigana: true,
};

const state = { v: 2, binds: {}, opts: { ...OPTION_DEFS } };
for (const a of ACTIONS) state.binds[a.id] = a.def;
try {
  const s = JSON.parse(localStorage.getItem(KEY));
  if (s) {
    Object.assign(state.binds, s.binds || {}); Object.assign(state.opts, s.opts || {});
    if ((s.v || 1) < 2) { // v2: E=所持品, F=調べる, X/Z=頁めくり
      Object.assign(state.binds, { inventory: 'KeyE', interact: 'KeyF', pageNext: 'KeyX', pagePrev: 'KeyZ' });
    }
  }
  state.v = 2;
} catch {}

export const binds = state.binds;
export const opts = state.opts;
export function saveControls() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
export function resetControls() {
  for (const a of ACTIONS) state.binds[a.id] = a.def;
  Object.assign(state.opts, OPTION_DEFS);
  saveControls();
}
// あるキーに割り当てられた操作 (無ければ null)
export function actionOf(code) {
  for (const a of ACTIONS) if (state.binds[a.id] === code) return a.id;
  return null;
}
// 割り当て変更。他の操作と重なったら、そちらは入れ替え(元のキーを渡す)
export function rebind(id, code) {
  const old = state.binds[id];
  for (const a of ACTIONS) if (a.id !== id && state.binds[a.id] === code) state.binds[a.id] = old;
  state.binds[id] = code;
  saveControls();
}

const NAMES = {
  ShiftLeft: '左Shift', ShiftRight: '右Shift', ControlLeft: '左Ctrl', ControlRight: '右Ctrl', AltLeft: '左Alt', AltRight: '右Alt',
  Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: 'BackSpace', CapsLock: 'CapsLock',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Mouse0: '左クリック', Mouse1: '中クリック', Mouse2: '右クリック', Mouse3: 'マウス4', Mouse4: 'マウス5',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
};
export function keyName(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'テンキー' + code.slice(6);
  return code;
}
export const keyOf = id => keyName(state.binds[id]);
