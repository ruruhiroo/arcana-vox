// 装備: 魔導書を中心に据えた4つの部位。宝箱から手に入り、所持品画面で付け替える。
// 装丁(魔導書の表紙) / 栞 / 指輪 / 外套
import { ELEMENTS } from './lexicon.js';

export const SLOTS = [
  { id: 'cover', name: '装丁', ruby: 'そうてい', desc: '魔導書の表紙。魔力の器と術の威力を左右する' },
  { id: 'bookmark', name: '栞', ruby: 'しおり', desc: '頁に挟む栞。魔力の回復と詠唱の補助' },
  { id: 'ring', name: '指輪', ruby: 'ゆびわ', desc: '指に嵌める。属性の力を高め、消費を抑える' },
  { id: 'cloak', name: '外套', ruby: 'がいとう', desc: '身を包む外套。生命と守り' },
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
    { name: 'なめし革の装丁', stats: { maxMp: 15 } },
    { name: '黒檀の装丁', stats: { maxMp: 10, power: 0.06 } },
    { name: '竜鱗の装丁', stats: { power: 0.1 } },
    { name: '星銀の装丁', stats: { maxMp: 20, costMul: -0.04 } },
  ],
  bookmark: [
    { name: '絹の栞', stats: { regen: 0.15 } },
    { name: '銀の栞', stats: { regen: 0.1, grace: 0.05 } },
    { name: '月光の栞', stats: { grace: 0.08 } },
    { name: '記憶の栞', stats: { regen: 0.2, maxMp: 5 } },
  ],
  ring: [
    { name: '紅玉の指輪', stats: { elem: 'fire', elemPow: 0.12 } },
    { name: '蒼玉の指輪', stats: { elem: 'ice', elemPow: 0.12 } },
    { name: '雷石の指輪', stats: { elem: 'thunder', elemPow: 0.12 } },
    { name: '白金の指輪', stats: { elem: 'holy', elemPow: 0.12 } },
    { name: '黒曜の指輪', stats: { elem: 'void', elemPow: 0.12 } },
    { name: '翠玉の指輪', stats: { elem: 'wind', elemPow: 0.12 } },
    { name: '節制の指輪', stats: { costMul: -0.06 } },
  ],
  cloak: [
    { name: '旅人の外套', stats: { maxHp: 15 } },
    { name: '聖職者の外套', stats: { maxHp: 10, ward: 0.15 } },
    { name: '影織りの外套', stats: { maxHp: 8, speed: 0.05 } },
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
  return { uid: 'e' + (uid++), slot, name: (PREFIX[rar] ? PREFIX[rar] + ' ' : '') + base.name, rarity: rar, stats };
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
