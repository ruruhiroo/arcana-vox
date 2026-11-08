// 層の変異: 第2層から、層ごとに一つの条件が付く。層の種(seed)で決まるので、オンラインでも全員同じ
import { seeded } from './state.js';

export const MUTATORS = [
  { id: 'holy', name: '暁の加護', desc: '聖光の術の威力が1.8倍' },
  { id: 'dark', name: '闇夜の層', desc: '辺りがひどく暗い。灯火を頼れ' },
  { id: 'brittle', name: '脆い迷宮', desc: '壁が崩れやすい' },
  { id: 'plenty', name: '豊穣の層', desc: '宝箱が多い' },
  { id: 'frenzy', name: '狂乱の層', desc: '魔物が速く、強い' },
  { id: 'feast', name: '精霊の宴', desc: '精霊との縁が2倍の速さで深まる' },
  { id: 'silence', name: '静寂の層', desc: '詠唱の声を聞きつけて、魔物が集まってくる' },
  { id: 'storm', name: '雷雲の層', desc: '雷霆の術の威力が1.6倍、氷獄は弱まる' },
];
export function pickMutator(seed, floor) {
  if (floor < 2) return null;
  // 近い種でも偏らないよう、混ぜてから数回回す
  const r = seeded(((seed ^ 0x5eed) * 2654435761 + floor * 40503) >>> 0); r(); r(); r();
  return MUTATORS[Math.floor(r() * MUTATORS.length)];
}
// 自分の術への補正
export function mutatePower(mut, spell) {
  if (!mut) return 1;
  let k = 1;
  if (mut.id === 'holy' && spell.elements.includes('holy')) k *= 1.8;
  if (mut.id === 'storm') { if (spell.elements.includes('thunder')) k *= 1.6; if (spell.elements.includes('ice')) k *= 0.7; }
  return k;
}
