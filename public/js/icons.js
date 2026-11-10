// 所持品の絵: 暗い陰影のある、写実寄りの小さな静物画。文字を読まなくても何か分かるように
import { icon3d, gear3d } from './icons3d.js';
// すべて 64×64 の SVG。グラデーションと粒子のざらつきで、古びた質感を出す
const EL_COL = { fire: '#c8541e', ice: '#6aa8c8', thunder: '#9a8ad0', wind: '#6aa88a', holy: '#d8c890', void: '#7a4aa8' };
let seq = 0;
// 共通: ざらつき(古びた質感)と、ほのかな光
const DEFS = id => `<filter id="${id}g" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="${id.length}"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .22 0"/><feComposite in2="SourceGraphic" operator="in"/><feBlend in="SourceGraphic" mode="multiply"/></filter>
  <filter id="${id}b"><feGaussianBlur stdDeviation="2.2"/></filter>`;
// 「url(#ID…)」の # は残し、「id="#ID…"」の # は外す
const fix = (t, id) => t.replaceAll('url(#ID', 'url(#' + id).replaceAll('#ID', id);
const svg = (body, defs = '') => { const id = 'i' + (seq++); return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><defs>${DEFS(id)}${fix(defs, id)}</defs><g filter="url(#${id}g)">${fix(body, id)}</g></svg>`; };
const shade = (a, b, x1 = 0, y1 = 0, x2 = 0, y2 = 1) => `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;

const ITEM = {
  // 魔力薬: 曇った硝子の小瓶。中で深い青がほのかに光る。蝋で封じた栓
  ether: () => svg(`
    <ellipse cx="32" cy="58" rx="15" ry="3" fill="#000" opacity=".5"/>
    <path d="M26 12h12v9c8 3 13 10 13 19a19 19 0 0 1-38 0c0-9 5-16 13-19z" fill="url(#IDglass)" fill-opacity=".55" stroke="#b8c4d4" stroke-opacity=".55" stroke-width="1.2"/>
    <path d="M15.5 40c5-4 10 1 16-1s11-4 17 0a17 17 0 0 1-33 1z" fill="url(#IDliq)"/>
    <ellipse cx="32" cy="45" rx="9" ry="6" fill="#4a7aff" opacity=".45" filter="url(#IDb)"/>
    <path d="M20 30c-2 4-3 9-1 14" stroke="#e8f0ff" stroke-width="2" opacity=".35" fill="none" stroke-linecap="round"/>
    <path d="M27 21c-2 1-4 2-5 3" stroke="#e8f0ff" stroke-width="1.4" opacity=".3" fill="none"/>
    <rect x="25" y="6" width="14" height="8" rx="2" fill="url(#IDcork)"/><path d="M24 13h16v3H24z" fill="#5a1e14"/>`,
    `<linearGradient id="#IDglass" ${shade('#8a96a8', '#2a323e', 0, 0, 1, 1)}<linearGradient id="#IDliq" ${shade('#4a78e0', '#14246a')}<linearGradient id="#IDcork" ${shade('#7a5a3a', '#3a2614')}`),
  // 霊草: 乾きかけた薬草の束。くすんだ緑、先に淡く光る蕾、麻紐で縛る
  herb: () => svg(`
    <path d="M30 58c0-10 1-20 2-30" stroke="#3a3a1e" stroke-width="2.2" fill="none"/><path d="M33 58c1-12 4-22 9-30" stroke="#33361c" stroke-width="2" fill="none"/><path d="M28 58c-2-10-6-18-12-24" stroke="#33361c" stroke-width="2" fill="none"/>
    <path d="M32 30c-9-3-13-11-11-19 8 2 12 9 11 19z" fill="url(#IDleaf)"/><path d="M42 30c4-8 3-16-3-21-5 6-5 14 3 21z" fill="url(#IDleaf2)"/>
    <path d="M16 34c-8-2-11-8-10-14 7 1 10 7 10 14z" fill="url(#IDleaf2)"/><path d="M33 40c7-4 13-3 17 1-5 4-11 4-17-1z" fill="url(#IDleaf)"/>
    <path d="M32 30c-4-5-7-10-9-17" stroke="#1e2a10" stroke-width=".8" fill="none" opacity=".7"/>
    <circle cx="39" cy="9" r="2.6" fill="#e0f0b0"/><circle cx="39" cy="9" r="5" fill="#c8f080" opacity=".35" filter="url(#IDb)"/><circle cx="21" cy="11" r="2" fill="#d8eca8" opacity=".8"/>
    <path d="M25 47l11-2v4l-11 2z" fill="#8a7448"/><path d="M25 47l11-2" stroke="#4a3a22" stroke-width=".8"/>`,
    `<linearGradient id="#IDleaf" ${shade('#6a7a3a', '#2a3418', 0, 0, 1, 1)}<linearGradient id="#IDleaf2" ${shade('#58683a', '#202a14', 1, 0, 0, 1)}`),
  // 魔晶: 黒い岩に食い込んだ青い結晶の塊
  crystal: () => svg(`
    <ellipse cx="32" cy="57" rx="20" ry="3.5" fill="#000" opacity=".5"/>
    <path d="M10 50l6-12 10-4 14 2 12 6 4 9-8 4H16z" fill="url(#IDrock)"/>
    <path d="M28 44l4-30 7 8 1 22z" fill="url(#IDcry)"/><path d="M32 14l7 8-3 2z" fill="#c8e4ff" opacity=".7"/>
    <path d="M20 46l-2-18 7 6 2 12z" fill="url(#IDcry2)"/><path d="M40 46l6-16 4 8-4 9z" fill="url(#IDcry2)"/>
    <ellipse cx="32" cy="34" rx="9" ry="12" fill="#5aa0ff" opacity=".28" filter="url(#IDb)"/>
    <path d="M16 46l10-2 14 1" stroke="#000" stroke-width="1" opacity=".5" fill="none"/>`,
    `<linearGradient id="#IDrock" ${shade('#6a625a', '#26221c')}<linearGradient id="#IDcry" ${shade('#9ac8f0', '#1e4a8a', 0, 0, 1, 1)}<linearGradient id="#IDcry2" ${shade('#6a9ad0', '#142e5a', 0, 0, 1, 1)}`),
  // 骨片: 黄ばんでひびの入った骨
  bone: () => svg(`
    <ellipse cx="32" cy="56" rx="20" ry="3" fill="#000" opacity=".45"/>
    <g transform="rotate(-32 32 32)"><path d="M14 27a6 6 0 1 1 4-8l28 0a6 6 0 1 1 4 8 6 6 0 1 1-4 8H18a6 6 0 1 1-4-8z" fill="url(#IDbone)"/>
    <path d="M22 30l6-2 3 3" stroke="#5a4a2a" stroke-width=".9" fill="none" opacity=".8"/><path d="M18 22h28" stroke="#fff6dc" stroke-width="1.4" opacity=".35"/></g>`,
    `<linearGradient id="#IDbone" ${shade('#d8c8a0', '#7a6a48')}`),
  // 鉄屑: 錆びた鉄片
  iron: () => svg(`
    <ellipse cx="32" cy="55" rx="22" ry="3" fill="#000" opacity=".5"/>
    <path d="M10 44l10-16 24-4 12 10-6 14-30 2z" fill="url(#IDiron)"/>
    <path d="M20 28l24-4 12 10" stroke="#9aa0a8" stroke-width="1.2" fill="none" opacity=".6"/>
    <path d="M18 40c6-3 10 2 16-1M36 44c4-2 7 0 10-2" stroke="#8a4a1e" stroke-width="3" opacity=".6" fill="none"/>
    <circle cx="27" cy="36" r="2.4" fill="#1a1a1e"/><circle cx="41" cy="34" r="2" fill="#1a1a1e"/>`,
    `<linearGradient id="#IDiron" ${shade('#8a8e96', '#34363c', 0, 0, 1, 1)}`),
  // 古文書: 紐で縛った古い巻物と、赤い封蝋
  scroll: () => svg(`
    <ellipse cx="32" cy="56" rx="22" ry="3" fill="#000" opacity=".45"/>
    <g transform="rotate(-20 32 32)"><rect x="12" y="22" width="40" height="18" rx="3" fill="url(#IDpap)"/>
    <ellipse cx="12" cy="31" rx="4" ry="9" fill="url(#IDend)"/><ellipse cx="52" cy="31" rx="4" ry="9" fill="#cdb68a"/><ellipse cx="52" cy="31" rx="2" ry="5" fill="#6a5434"/>
    <path d="M30 22v18" stroke="#5a3a1e" stroke-width="2"/><circle cx="30" cy="33" r="4.5" fill="url(#IDwax)"/><circle cx="29" cy="32" r="1.4" fill="#e07060" opacity=".6"/>
    <path d="M16 26h10M36 26h12M36 36h10" stroke="#7a6040" stroke-width=".8" opacity=".6"/></g>`,
    `<linearGradient id="#IDpap" ${shade('#d8c498', '#8a7248')}<linearGradient id="#IDend" ${shade('#b89a68', '#5a4428', 1, 0, 0, 0)}<radialGradient id="#IDwax"><stop offset="0" stop-color="#a02a1e"/><stop offset="1" stop-color="#4a0c08"/></radialGradient>`),
  // 古文書の断片: 縁の焦げた紙片に褪せた文字
  frag: () => svg(`
    <path d="M14 10l26 2 8 8-3 8 5 8-4 9 3 9-34-2 2-10-4-10 4-12z" fill="url(#IDpap)"/>
    <path d="M14 10l26 2 8 8-3 8 5 8-4 9 3 9-34-2 2-10-4-10 4-12z" fill="none" stroke="#2a1608" stroke-width="2.4" opacity=".75"/>
    <path d="M20 20h16M20 26h20M20 32h14M20 38h18M20 44h10" stroke="#5a4028" stroke-width="1.3" opacity=".55"/>`,
    `<radialGradient id="#IDpap" cx=".45" cy=".45" r=".7"><stop offset="0" stop-color="#d8c498"/><stop offset=".8" stop-color="#9a7e50"/><stop offset="1" stop-color="#4a3018"/></radialGradient>`),
  // 護符: 古びた札。朱の印と、擦り切れた縁
  amulet: () => svg(`
    <g transform="rotate(8 32 32)"><path d="M21 6h22v50l-3-2-3 2-3-2-3 2-3-2-3 2-4-2z" fill="url(#IDpap)"/>
    <circle cx="32" cy="20" r="6" fill="none" stroke="#8a1e14" stroke-width="2.2" opacity=".85"/><path d="M32 30v16M26 36h12M27 42l10 0" stroke="#8a1e14" stroke-width="2" opacity=".85"/>
    <path d="M32 0v7" stroke="#6a4a2a" stroke-width="1.6"/></g>`,
    `<linearGradient id="#IDpap" ${shade('#e0d0a8', '#8a7650')}`),
  // 閃光玉: 金具で留めた硝子玉。中に白い光が渦巻く
  flash: () => svg(`
    <ellipse cx="32" cy="57" rx="14" ry="3" fill="#000" opacity=".5"/>
    <circle cx="32" cy="36" r="17" fill="url(#IDorb)"/><circle cx="32" cy="36" r="9" fill="#fff6d8" opacity=".75" filter="url(#IDb)"/>
    <path d="M24 26a12 12 0 0 1 10-4" stroke="#fff" stroke-width="2" opacity=".45" fill="none" stroke-linecap="round"/>
    <path d="M25 18h14l-2 4H27z" fill="url(#IDmet)"/><rect x="29" y="12" width="6" height="6" rx="1" fill="url(#IDmet)"/>`,
    `<radialGradient id="#IDorb" cx=".5" cy=".5" r=".55"><stop offset="0" stop-color="#e8e0c0"/><stop offset=".6" stop-color="#a89e80"/><stop offset="1" stop-color="#2a2820"/></radialGradient><linearGradient id="#IDmet" ${shade('#9a8a5a', '#3a3018')}`),
  // 導灯: 鉄の手提げランタン。中で炎が揺れる
  lantern: () => svg(`
    <ellipse cx="32" cy="58" rx="13" ry="2.5" fill="#000" opacity=".5"/>
    <ellipse cx="32" cy="36" rx="16" ry="18" fill="#ff9a3a" opacity=".22" filter="url(#IDb)"/>
    <path d="M22 18h20l3 5H19z" fill="url(#IDmet)"/><rect x="21" y="23" width="22" height="26" rx="2" fill="url(#IDglow)"/>
    <path d="M21 23v26M43 23v26M32 23v26" stroke="#2a241c" stroke-width="2.4"/><rect x="19" y="49" width="26" height="5" fill="url(#IDmet)"/>
    <path d="M32 30c3 4 4 7 4 10a4 4 0 0 1-8 0c0-3 2-6 4-10z" fill="#ffe8a0"/><path d="M26 18c0-8 12-8 12 0" stroke="#3a3024" stroke-width="2.4" fill="none"/>`,
    `<linearGradient id="#IDmet" ${shade('#8a7a62', '#3a3226')}<radialGradient id="#IDglow"><stop offset="0" stop-color="#ffb84a"/><stop offset="1" stop-color="#6a3a10"/></radialGradient>`),
};
// 秘伝書: 革の表紙、角に金具、属性の紋が浮き彫り
const MARK = {
  fire: '<path d="M32 18c6 7 8 11 8 16a8 8 0 0 1-16 0c0-4 3-7 4-10 0 4 2 5 4 5-1-4 0-7 0-11z"/>',
  ice: '<path d="M32 16v28M20 23l24 14M44 23L20 37" stroke-width="3" fill="none"/>',
  thunder: '<path d="M35 14l-11 17h8l-4 15 12-20h-8z"/>',
  wind: '<path d="M18 26h18a5 5 0 1 0-5-5M18 34h22a5 5 0 1 1-5 5" stroke-width="3" fill="none"/>',
  holy: '<path d="M32 15v30M23 25h18" stroke-width="4" fill="none"/>',
  void: '<circle cx="32" cy="30" r="9" fill="none" stroke-width="3"/><path d="M32 21a9 9 0 0 1 0 18" />',
};
function tome(el) {
  const c = EL_COL[el] || '#a08a5a';
  return svg(`
    <ellipse cx="32" cy="58" rx="20" ry="3" fill="#000" opacity=".5"/>
    <path d="M14 8h34a3 3 0 0 1 3 3v42a3 3 0 0 1-3 3H14z" fill="url(#IDcov)"/>
    <path d="M14 8h5v48h-5z" fill="#140c08"/><path d="M48 10v44" stroke="#c8b890" stroke-width="2" opacity=".5"/>
    <rect x="22" y="13" width="23" height="38" rx="1" fill="none" stroke="#8a7240" stroke-width="1" opacity=".7"/>
    <g fill="${c}" stroke="${c}" opacity=".9" transform="translate(1.5 2)">${MARK[el] || ''}</g>
    <circle cx="33" cy="32" r="12" fill="${c}" opacity=".18" filter="url(#IDb)"/>
    <path d="M44 8h7v7zM44 56h7v-7z" fill="url(#IDbr)"/>`,
    `<linearGradient id="#IDcov" ${shade('#6a4a32', '#24160c', 0, 0, 1, 1)}<linearGradient id="#IDbr" ${shade('#c8a860', '#5a4420')}`);
}
// 装備: 部位ごとの形、属性があればその色の石
function gear(slot, it) {
  const c = it?.stats?.elem ? EL_COL[it.stats.elem] : null;
  const gem = c || ['#8a8478', '#4a7ab0', '#8a5ab8', '#c89a3a'][it?.rarity || 0];
  if (slot === 'cover') return svg(`
    <path d="M12 8h38a2 2 0 0 1 2 2v44a2 2 0 0 1-2 2H12z" fill="url(#IDcov)"/><path d="M12 8h6v48h-6z" fill="#170c06"/>
    <rect x="22" y="13" width="25" height="38" fill="none" stroke="#9a7c40" stroke-width="1.4"/><path d="M22 13l6 6M47 13l-6 6M22 51l6-6M47 51l-6-6" stroke="#9a7c40" stroke-width="1.2"/>
    <circle cx="34.5" cy="32" r="6" fill="url(#IDgem)"/><circle cx="33" cy="30.5" r="1.6" fill="#fff" opacity=".5"/><circle cx="34.5" cy="32" r="9" fill="${gem}" opacity=".25" filter="url(#IDb)"/>`,
    `<linearGradient id="#IDcov" ${shade('#7a4a2e', '#2a160c', 0, 0, 1, 1)}<radialGradient id="#IDgem"><stop offset="0" stop-color="${gem}"/><stop offset="1" stop-color="#0a0806"/></radialGradient>`);
  if (slot === 'bookmark') return svg(`
    <path d="M24 4h16v44l-8-7-8 7z" fill="url(#IDsilk)"/><path d="M27 4v42M37 4v38" stroke="#000" stroke-width=".8" opacity=".35"/>
    <path d="M24 4h16v6H24z" fill="url(#IDmet)"/><circle cx="32" cy="7" r="2" fill="${gem}"/>
    <path d="M28 48c-3 5-2 9 1 11M36 48c3 5 2 9-1 11" stroke="url(#IDsilk)" stroke-width="2" fill="none"/>`,
    `<linearGradient id="#IDsilk" ${shade(c || '#7a1e24', '#200608', 0, 0, 1, 0)}<linearGradient id="#IDmet" ${shade('#c8a860', '#5a4420')}`);
  if (slot === 'ring') return svg(`
    <ellipse cx="32" cy="57" rx="16" ry="3" fill="#000" opacity=".5"/>
    <ellipse cx="32" cy="38" rx="16" ry="13" fill="none" stroke="url(#IDgold)" stroke-width="6"/>
    <ellipse cx="32" cy="38" rx="16" ry="13" fill="none" stroke="#fff4c8" stroke-width="1" opacity=".35" stroke-dasharray="14 60"/>
    <path d="M25 24l7-9 7 9-7 7z" fill="url(#IDgem)"/><path d="M28 22l4-5 2 4z" fill="#fff" opacity=".45"/>
    <path d="M24 26h16l-3 4H27z" fill="url(#IDgold)"/><circle cx="32" cy="23" r="9" fill="${gem}" opacity=".22" filter="url(#IDb)"/>`,
    `<linearGradient id="#IDgold" ${shade('#c8a050', '#4a3412', 0, 0, 1, 1)}<linearGradient id="#IDgem" ${shade(gem, '#0a0608', 0, 0, 1, 1)}`);
  if (slot === 'necklace') return svg(`
    <path d="M14 8c0 18 8 28 18 30M50 8c0 18-8 28-18 30" stroke="url(#IDgold)" stroke-width="2.2" fill="none" stroke-dasharray="3 1.5"/>
    <path d="M32 36l9 9-9 14-9-14z" fill="url(#IDgem)"/><path d="M32 38l4 6-4 3z" fill="#fff" opacity=".35"/>
    <circle cx="32" cy="36" r="3" fill="url(#IDgold)"/><circle cx="32" cy="47" r="10" fill="${gem}" opacity=".2" filter="url(#IDb)"/>`,
    `<linearGradient id="#IDgold" ${shade('#c8a050', '#4a3412', 0, 0, 1, 1)}<linearGradient id="#IDgem" ${shade(gem, '#0a0608', 0, 0, 1, 1)}`);
  if (slot === 'gloves') return svg(`
    <path d="M20 58V30l-4-12c-1-3 3-5 5-2l4 9V10c0-3 4-3 4 0v14V7c0-3 4-3 4 0v17V9c0-3 4-3 4 0v16V13c0-3 4-3 4 0v22l-2 12-3 11z" fill="url(#IDleath)"/>
    <path d="M18 50h26v8H20z" fill="url(#IDcuff)"/><path d="M27 14v12M33 10v14M39 14v12" stroke="#000" stroke-width="1" opacity=".3"/>`,
    `<linearGradient id="#IDleath" ${shade(c || '#6a4a2e', '#1e120a', 0, 0, 1, 1)}<linearGradient id="#IDcuff" ${shade('#c8a860', '#5a4420')}`);
  if (slot === 'cloak') return svg(`
    <path d="M24 8c-2 4-2 8 0 10l-8 10-6 28h44l-6-28-8-10c2-2 2-6 0-10z" fill="url(#IDcloth)"/>
    <path d="M24 8c4 4 12 4 16 0" stroke="#000" stroke-width="2" opacity=".4" fill="none"/>
    <path d="M22 30l-4 26M32 22v34M42 30l4 26" stroke="#000" stroke-width="1.4" opacity=".35"/><path d="M28 20c-6 10-9 22-10 36" stroke="#fff" stroke-width="1" opacity=".08"/>
    <circle cx="32" cy="19" r="3" fill="url(#IDmet)"/>`,
    `<linearGradient id="#IDcloth" ${shade(c ? c : '#5a5a6e', '#1a1a22', 0, 0, 0.3, 1)}<radialGradient id="#IDmet"><stop offset="0" stop-color="#d8b870"/><stop offset="1" stop-color="#5a4420"/></radialGradient>`);
  return svg('');
}
// 何も付けていない部位の影
export function slotGhost(slot) { return gear(slot, null).replace('<svg ', '<svg class="ghost" '); }
// 立体の模型から撮った画像があればそれを、無ければ平面の絵を使う
const img = u => `<img src="${u}" alt="" draggable="false">`;
export function itemIcon(k) {
  if (k.startsWith('scroll_')) { const u = icon3d('scroll'); const w = k.slice(7); return (u ? img(u) : (ITEM.scroll || ITEM.frag)()) + `<i class="wtag">${(globalThis.G?.wordCore?.(w)) || ''}</i>`; }
  const u = icon3d(k); if (u) return img(u); if (k.startsWith('tome_')) return tome(k.slice(5)); return (ITEM[k] || ITEM.frag)(); }
export function gearIcon(it) { const u = gear3d(it); return u ? img(u) : gear(it.slot, it); }
// 能力の印 (小さいので素朴なまま)
const s2 = b => `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">${b}</svg>`;
export const STAT_ICON = {
  hp: s2('<path d="M24 40C10 30 6 22 8 15a8 8 0 0 1 16-2 8 8 0 0 1 16 2c2 7-2 15-16 25z" fill="#a8302a"/>'),
  mp: s2('<path d="M24 6c8 11 12 18 12 24a12 12 0 0 1-24 0c0-6 4-13 12-24z" fill="#3a5ab0"/>'),
  power: s2('<path d="M24 4l5 14h15l-12 9 4 15-12-9-12 9 4-15L4 18h15z" fill="#b8904a"/>'),
  regen: s2('<path d="M24 8a16 16 0 1 0 16 16" fill="none" stroke="#5a8ac8" stroke-width="4"/><path d="M40 12v12H28" fill="none" stroke="#5a8ac8" stroke-width="4"/>'),
  cost: s2('<path d="M24 6c8 11 12 18 12 24a12 12 0 0 1-24 0c0-6 4-13 12-24z" fill="none" stroke="#3a5ab0" stroke-width="3"/><path d="M16 32h16" stroke="#ddd" stroke-width="3"/>'),
};
export const EL_COLOR = EL_COL;
