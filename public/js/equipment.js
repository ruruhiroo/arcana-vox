// 装備: 魔導書を中心に据えた6つの部位。宝箱から手に入り、所持品画面で付け替える。
// 効果は一つの品に一つだけ。「何が、どれだけ」が一目で分かるようにする
import { ELEMENTS } from './lexicon.js';

export const SLOTS = [
  { id: 'cover', name: '装丁', ruby: 'そうてい', desc: '魔導書の表紙' },
  { id: 'bookmark', name: '栞', ruby: 'しおり', desc: '頁に挟む栞' },
  { id: 'ring', name: '指輪', ruby: 'ゆびわ', desc: '指に嵌める' },
  { id: 'cloak', name: '外套', ruby: 'がいとう', desc: '身を包む外套' },
  { id: 'necklace', name: '首飾り', ruby: 'くびかざり', desc: '胸に下げる品' },
  { id: 'gloves', name: '手袋', ruby: 'てぶくろ', desc: '頁をめくる手' },
];

export const RARITY = [
  { id: 0, name: '並', color: '#d8d0c0', mult: 1 },
  { id: 1, name: '業物', color: '#7fb8ff', mult: 1.5 },
  { id: 2, name: '秘宝', color: '#c38bff', mult: 2.1 },
  { id: 3, name: '伝説', color: '#ffc94a', mult: 3 },
  { id: 4, name: 'ユニーク', color: '#ff7a4a', mult: 3 },
];

// ユニークな品。uq = 特別な効果の名(効き目は main.js と spells.js の G.uq を見る所にある)。stats を持つ物は、数の効果も付く
//   bid は見た目に使う素体。text は一行の説明
export const UNIQUES = [
  { uq: 'boom', slot: 'bookmark', bid: 'salamander', name: '爆ぜる栞', text: '自分が倒した敵は爆発し、周りの敵に 40 の傷' },
  { uq: 'leech', slot: 'ring', bid: 'ruby', name: '吸命の指輪', text: '敵を倒すたびに、生命が 10 戻る' },
  { uq: 'echo', slot: 'gloves', bid: 'silkgl', name: '二度咲きの手袋', text: '術を放つと、4回に1回、同じ術がもう一度出る(魔力は要らない)' },
  { uq: 'guard', slot: 'cloak', bid: 'shadow', name: '影武者の外套', text: '倒れる一撃を、層ごとに一度だけ耐える(生命が半分戻る)' },
  { uq: 'vessel', slot: 'cover', bid: 'starsilver', name: '底なしの装丁', text: '魔力の上限 +100。ただし魔力が戻る速さは半分', stats: { maxMp: 100, regen: -0.5 } },
  { uq: 'rapid', slot: 'necklace', bid: 'locket', name: '早口の首飾り', text: '魔力が戻る速さ 3倍。ただし魔力の上限 −50', stats: { regen: 2, maxMp: -50 } },
  { uq: 'giant', slot: 'ring', bid: 'obsidian', name: '主殺しの指輪', text: '層の主と門番への傷が 1.5倍' },
  { uq: 'dice', slot: 'bookmark', bid: 'moon', name: '博打の栞', text: '術の威力が、放つたびに 0.5倍〜3倍のどれかになる' },
  { uq: 'storm', slot: 'cloak', bid: 'stargazer', name: '雷雲の外套', text: '5秒ごとに、近くの敵へ雷が落ちる(35 の傷)' },
];
// まだ持っていないユニークな品を一つ作る(全部持っていれば、どれかをもう一度)
export function rollUnique(have = [], rng = Math.random) {
  const rest = UNIQUES.filter(u => !have.includes(u.uq)), list = rest.length ? rest : UNIQUES, u = list[Math.floor(rng() * list.length)];
  return { uid: 'u' + (uid++), slot: u.slot, bid: u.bid, name: u.name, rarity: 4, uq: u.uq, stats: { ...(u.stats || {}) }, balanceVersion: 3 };
}
// 身に着けているユニークな効果の名の集まり
export const uniquesOf = equip => new Set(Object.values(equip || {}).filter(it => it?.uq).map(it => it.uq));

// 装備の効果は、一つの品に一つだけ。数は切りのよい大きな値で、希少度(並・業物・秘宝・伝説)で決まる。
//   生命 = 生命の上限 / 魔力 = 魔力の上限 / 威力 = すべての術 / 属性 = その属性の術 / 節約 = 術に使う魔力 / 回復 = 魔力が戻る速さ / 守り = 守護の障壁 / 速さ = 足の速さ
const VALUE = {
  maxHp: [20, 30, 45, 70], maxMp: [20, 30, 45, 70], power: [0.15, 0.25, 0.4, 0.6], elemPow: [0.25, 0.4, 0.6, 1],
  costMul: [-0.1, -0.15, -0.25, -0.35], regen: [0.25, 0.4, 0.6, 1], ward: [0.25, 0.4, 0.6, 1], speed: [0.1, 0.15, 0.2, 0.3],
};
const B = (id, name, stat, elem) => ({ id, name, stat, elem });
const BASES = {
  cover: [
    B('tanned', 'なめし革の装丁', 'maxMp'), B('ebony', '黒檀の装丁', 'power'), B('dragon', '竜鱗の装丁', 'power'), B('starsilver', '星銀の装丁', 'costMul'),
    B('cv_fire', '焔紋の装丁', 'elemPow', 'fire'), B('cv_ice', '霜紋の装丁', 'elemPow', 'ice'), B('cv_thunder', '雷紋の装丁', 'elemPow', 'thunder'),
    B('cv_wind', '風紋の装丁', 'elemPow', 'wind'), B('cv_holy', '聖紋の装丁', 'elemPow', 'holy'), B('cv_void', '闇紋の装丁', 'elemPow', 'void'),
  ],
  bookmark: [
    B('silk', '絹の栞', 'regen'), B('silver', '銀の栞', 'costMul'), B('moon', '月光の栞', 'maxMp'), B('memory', '記憶の栞', 'regen'),
    B('salamander', '火蜥蜴の栞', 'elemPow', 'fire'), B('iceflower', '氷華の栞', 'elemPow', 'ice'), B('thunderbird', '雷鳥の栞', 'elemPow', 'thunder'),
    B('windfeather', '風切羽の栞', 'elemPow', 'wind'), B('angelfeather', '天使の羽の栞', 'elemPow', 'holy'), B('raven', '夜鴉の栞', 'elemPow', 'void'),
  ],
  ring: [
    B('ruby', '紅玉の指輪', 'elemPow', 'fire'), B('sapphire', '蒼玉の指輪', 'elemPow', 'ice'), B('thunderstone', '雷石の指輪', 'elemPow', 'thunder'),
    B('platinum', '白金の指輪', 'elemPow', 'holy'), B('obsidian', '黒曜の指輪', 'elemPow', 'void'), B('emerald', '翠玉の指輪', 'elemPow', 'wind'),
    B('temperance', '節制の指輪', 'costMul'), B('healer', '癒し手の指輪', 'ward'), B('warden', '守り手の指輪', 'maxHp'),
  ],
  cloak: [
    B('traveler', '旅人の外套', 'maxHp'), B('cleric', '聖職者の外套', 'ward'), B('shadow', '影織りの外套', 'speed'),
    B('hunter', '狩人の外套', 'speed'), B('drake', '竜革の外套', 'maxHp'), B('stargazer', '星読みの外套', 'regen'),
  ],
  necklace: [
    B('bonecharm', '骨の首飾り', 'maxHp'), B('silvercross', '銀十字の首飾り', 'elemPow', 'holy'), B('amber', '琥珀の首飾り', 'elemPow', 'fire'),
    B('moonstone', '月長石の首飾り', 'elemPow', 'ice'), B('fang', '牙の首飾り', 'power'), B('locket', '星屑のロケット', 'maxMp'),
  ],
  gloves: [
    B('leathergl', '革の手袋', 'costMul'), B('silkgl', '絹の詠唱手袋', 'regen'), B('gauntlet', '鉄の籠手', 'maxHp'),
    B('stormgl', '雷紋の手甲', 'elemPow', 'thunder'), B('shadowgl', '影の手袋', 'elemPow', 'void'),
  ],
};
const statsOf = (base, rar) => { const st = { [base.stat]: VALUE[base.stat][rar] }; if (base.elem) st.elem = base.elem; return st; };
const PREFIX = ['', '研がれた', '古の', '神代の'];

var uid = Date.now() % 100000;
export function rollItem(floor = 1, rng = Math.random) {
  const slot = SLOTS[Math.floor(rng() * SLOTS.length)].id;
  const list = BASES[slot], base = list[Math.floor(rng() * list.length)];
  // 深い層ほど希少なものが出やすい
  const r = rng() * (1 + floor * 0.12);
  const rar = r > 1.25 ? 3 : r > 0.95 ? 2 : r > 0.6 ? 1 : 0;
  return tuneEquipment({ uid: 'e' + (uid++), slot, bid: base.id, name: (PREFIX[rar] ? PREFIX[rar] + ' ' : '') + base.name, rarity: rar, stats: statsOf(base, rar), balanceVersion: 3 });
}
// 以前の版の品(効果がいくつも付いていた)は、今の「一つの品に一つの効果」に直す
export function tuneEquipment(it) {
  if (!it || it.balanceVersion >= 3) return it;
  const bid = baseId(it), base = (BASES[it.slot] || []).find(b => b.id === bid);
  if (base) it.stats = statsOf(base, Math.max(0, Math.min(3, it.rarity | 0)));
  it.balanceVersion = 3; return it;
}

// 装備の見た目の鍵(以前の版の品は名前から探す)
export function baseId(it) {
  if (it.bid) return it.bid;
  for (const b of BASES[it.slot] || []) if (String(it.name || "").endsWith(b.name)) return b.id;
  return null;
}

// 効果の説明(一つの品に一行)
export function statLines(it) {
  if (it.uq) return [UNIQUES.find(u => u.uq === it.uq)?.text || '特別な効果'];
  const s = it.stats, out = [], pc = v => Math.round(Math.abs(v) * 100);
  if (s.maxHp) out.push(`生命の上限 +${s.maxHp}`);
  if (s.maxMp) out.push(`魔力の上限 +${s.maxMp}`);
  if (s.power) out.push(`すべての術の威力 +${pc(s.power)}%`);
  if (s.elemPow) out.push(`${ELEMENTS[s.elem].name}の術の威力 +${pc(s.elemPow)}%`);
  if (s.costMul) out.push(`術に使う魔力 −${pc(s.costMul)}%`);
  if (s.regen) out.push(`魔力が戻る速さ +${pc(s.regen)}%`);
  if (s.ward) out.push(`守護の障壁の強さ +${pc(s.ward)}%`);
  if (s.speed) out.push(`足の速さ +${pc(s.speed)}%`);
  return out;
}

// 装備一式の合計
export function totals(equip) {
  const t = { maxMp: 0, maxHp: 0, power: 0, costMul: 0, regen: 0, grace: 0, ward: 0, speed: 0, elem: {} };
  for (const it of Object.values(equip || {})) {
    if (!it) continue;
    for (const [k, v] of Object.entries(it.stats)) {
      if (k === 'elem') continue;
      if (k === 'elemPow') t.elem[it.stats.elem] = (t.elem[it.stats.elem] || 0) + v;
      else t[k] += v;
    }
  }
  // いくつ重ねても、ここまで(威力 +150% / 属性 +200% / 節約 −50% / 回復 +200% / 守り +200% / 速さ +40%)
  t.costMul = Math.max(-0.5, t.costMul); t.power = Math.min(1.5, t.power); t.regen = Math.min(2, t.regen); t.ward = Math.min(2, t.ward); t.speed = Math.min(0.4, t.speed);
  for (const k of Object.keys(t.elem)) t.elem[k] = Math.min(2, t.elem[k]);
  return t;
}
