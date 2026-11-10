// 装備: 魔導書を中心に据えた4つの部位。宝箱から手に入り、所持品画面で付け替える。
// 装丁(魔導書の表紙) / 栞 / 指輪 / 外套
import { ELEMENTS } from './lexicon.js';

export const SLOTS = [
  { id: 'cover', name: '装丁', ruby: 'そうてい', desc: '魔導書の表紙。魔力の器と術の威力を左右する' },
  { id: 'bookmark', name: '栞', ruby: 'しおり', desc: '頁に挟む栞。魔力の回復と詠唱の補助' },
  { id: 'ring', name: '指輪', ruby: 'ゆびわ', desc: '指に嵌める。属性の力を高め、消費を抑える' },
  { id: 'cloak', name: '外套', ruby: 'がいとう', desc: '身を包む外套。生命と守り' },
  { id: 'necklace', name: '首飾り', ruby: 'くびかざり', desc: '胸に下げる護りの品。生命・属性・守り' },
  { id: 'gloves', name: '手袋', ruby: 'てぶくろ', desc: '頁をめくり印を結ぶ手。詠唱の補助と威力' },
];

export const RARITY = [
  { id: 0, name: '並', color: '#d8d0c0', mult: 1 },
  { id: 1, name: '業物', color: '#7fb8ff', mult: 1.5 },
  { id: 2, name: '秘宝', color: '#c38bff', mult: 2.1 },
  { id: 3, name: '伝説', color: '#ffc94a', mult: 3 },
];

// 部位ごとの素体。stats は「並」の値で、希少度で伸びる
const BASES = {
  cover: [
    { id: 'tanned', name: 'なめし革の装丁', stats: { maxMp: 15 } },
    { id: 'ebony', name: '黒檀の装丁', stats: { maxMp: 10, power: 0.06 } },
    { id: 'dragon', name: '竜鱗の装丁', stats: { power: 0.1 } },
    { id: 'starsilver', name: '星銀の装丁', stats: { maxMp: 20, costMul: -0.04 } },
    // 属性の装丁: 表紙に属性の力が宿る
    { id: 'cv_fire', name: '焔紋の装丁', stats: { maxMp: 8, elem: 'fire', elemPow: 0.08 } },
    { id: 'cv_ice', name: '霜紋の装丁', stats: { maxMp: 8, elem: 'ice', elemPow: 0.08 } },
    { id: 'cv_thunder', name: '雷紋の装丁', stats: { maxMp: 8, elem: 'thunder', elemPow: 0.08 } },
    { id: 'cv_wind', name: '風紋の装丁', stats: { maxMp: 8, elem: 'wind', elemPow: 0.08 } },
    { id: 'cv_holy', name: '聖紋の装丁', stats: { maxMp: 8, elem: 'holy', elemPow: 0.08 } },
    { id: 'cv_void', name: '闇紋の装丁', stats: { maxMp: 8, elem: 'void', elemPow: 0.08 } },
  ],
  bookmark: [
    { id: 'silk', name: '絹の栞', stats: { regen: 0.15 } },
    { id: 'silver', name: '銀の栞', stats: { regen: 0.1, grace: 0.05 } },
    { id: 'moon', name: '月光の栞', stats: { grace: 0.08 } },
    { id: 'memory', name: '記憶の栞', stats: { regen: 0.2, maxMp: 5 } },
    { id: 'salamander', name: '火蜥蜴の栞', stats: { regen: 0.08, elem: 'fire', elemPow: 0.07 } },
    { id: 'iceflower', name: '氷華の栞', stats: { regen: 0.08, elem: 'ice', elemPow: 0.07 } },
    { id: 'thunderbird', name: '雷鳥の栞', stats: { regen: 0.08, elem: 'thunder', elemPow: 0.07 } },
    { id: 'windfeather', name: '風切羽の栞', stats: { regen: 0.08, elem: 'wind', elemPow: 0.07 } },
    { id: 'angelfeather', name: '天使の羽の栞', stats: { regen: 0.08, elem: 'holy', elemPow: 0.07 } },
    { id: 'raven', name: '夜鴉の栞', stats: { regen: 0.08, elem: 'void', elemPow: 0.07 } },
  ],
  ring: [
    { id: 'ruby', name: '紅玉の指輪', stats: { elem: 'fire', elemPow: 0.12 } },
    { id: 'sapphire', name: '蒼玉の指輪', stats: { elem: 'ice', elemPow: 0.12 } },
    { id: 'thunderstone', name: '雷石の指輪', stats: { elem: 'thunder', elemPow: 0.12 } },
    { id: 'platinum', name: '白金の指輪', stats: { elem: 'holy', elemPow: 0.12 } },
    { id: 'obsidian', name: '黒曜の指輪', stats: { elem: 'void', elemPow: 0.12 } },
    { id: 'emerald', name: '翠玉の指輪', stats: { elem: 'wind', elemPow: 0.12 } },
    { id: 'temperance', name: '節制の指輪', stats: { costMul: -0.06 } },
    { id: 'healer', name: '癒し手の指輪', stats: { regen: 0.12, ward: 0.08 } },
    { id: 'warden', name: '守り手の指輪', stats: { maxHp: 12, ward: 0.12 } },
  ],
  cloak: [
    { id: 'traveler', name: '旅人の外套', stats: { maxHp: 15 } },
    { id: 'cleric', name: '聖職者の外套', stats: { maxHp: 10, ward: 0.15 } },
    { id: 'shadow', name: '影織りの外套', stats: { maxHp: 8, speed: 0.05 } },
    { id: 'hunter', name: '狩人の外套', stats: { maxHp: 10, speed: 0.07 } },
    { id: 'drake', name: '竜革の外套', stats: { maxHp: 24, elem: 'fire', elemPow: 0.05 } },
    { id: 'stargazer', name: '星読みの外套', stats: { maxHp: 8, regen: 0.12, maxMp: 8 } },
  ],
  necklace: [
    { id: 'bonecharm', name: '骨の首飾り', stats: { maxHp: 14 } },
    { id: 'silvercross', name: '銀十字の首飾り', stats: { ward: 0.1, elem: 'holy', elemPow: 0.06 } },
    { id: 'amber', name: '琥珀の首飾り', stats: { maxHp: 6, elem: 'fire', elemPow: 0.08 } },
    { id: 'moonstone', name: '月長石の首飾り', stats: { regen: 0.1, elem: 'ice', elemPow: 0.06 } },
    { id: 'fang', name: '牙の首飾り', stats: { power: 0.07 } },
    { id: 'locket', name: '星屑のロケット', stats: { maxMp: 18 } },
  ],
  gloves: [
    { id: 'leathergl', name: '革の手袋', stats: { grace: 0.06 } },
    { id: 'silkgl', name: '絹の詠唱手袋', stats: { grace: 0.08, regen: 0.06 } },
    { id: 'gauntlet', name: '鉄の籠手', stats: { maxHp: 16, ward: 0.08 } },
    { id: 'stormgl', name: '雷紋の手甲', stats: { power: 0.04, elem: 'thunder', elemPow: 0.08 } },
    { id: 'shadowgl', name: '影の手袋', stats: { speed: 0.05, elem: 'void', elemPow: 0.06 } },
  ],
};
const PREFIX = ['', '研がれた', '古の', '神代の'];

let uid = Date.now() % 100000;
export function rollItem(floor = 1, rng = Math.random) {
  const slot = SLOTS[Math.floor(rng() * SLOTS.length)].id;
  const list = BASES[slot], base = list[Math.floor(rng() * list.length)];
  // 深い層ほど希少なものが出やすい
  const r = rng() * (1 + floor * 0.12);
  const rar = r > 1.25 ? 3 : r > 0.95 ? 2 : r > 0.6 ? 1 : 0;
  const m = RARITY[rar].mult, stats = {};
  for (const [k, v] of Object.entries(base.stats)) stats[k] = typeof v === 'number' ? +(v * m * (0.85 + rng() * 0.3)).toFixed(3) : v;
  for (const k of ['maxMp', 'maxHp']) if (stats[k]) stats[k] = Math.round(stats[k]);
  return { uid: 'e' + (uid++), slot, bid: base.id, name: (PREFIX[rar] ? PREFIX[rar] + ' ' : '') + base.name, rarity: rar, stats };
}

// 装備の見た目の鍵(以前の版の品は名前から探す)
export function baseId(it) {
  if (it.bid) return it.bid;
  for (const b of BASES[it.slot] || []) if (String(it.name || "").endsWith(b.name)) return b.id;
  return null;
}

// 能力値の説明
export function statLines(it) {
  const s = it.stats, out = [];
  if (s.maxMp) out.push(`魔力の上限 +${s.maxMp}`);
  if (s.maxHp) out.push(`生命の上限 +${s.maxHp}`);
  if (s.power) out.push(`術の威力 +${Math.round(s.power * 100)}%`);
  if (s.elemPow) out.push(`${ELEMENTS[s.elem].name}属性の威力 +${Math.round(s.elemPow * 100)}%`);
  if (s.costMul) out.push(`魔力の消費 ${Math.round(s.costMul * 100)}%`);
  if (s.regen) out.push(`魔力の回復 +${Math.round(s.regen * 100)}%`);
  if (s.grace) out.push(`詠唱の補助 +${Math.round(s.grace * 100)}%(唱え切りの判定が緩む)`);
  if (s.ward) out.push(`守護の効果 +${Math.round(s.ward * 100)}%`);
  if (s.speed) out.push(`移動の速さ +${Math.round(s.speed * 100)}%`);
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
  return t;
}
