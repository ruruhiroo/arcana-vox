// 精霊: 言霊は精霊の真名の一部。名を呼べば力を貸してくれる。
// 同じ精霊を呼ぶほど「縁」が深まり、その精霊の術が強くなる。名詠は精霊を喜ばせ、言い損じが続くと機嫌を損ねる。
import { G } from './state.js';

export const SPIRITS = {
  fire: { name: '緋の焔姫', ruby: 'あけのほむらひめ', color: '#ff7a40', lore: '燃え尽きることを恐れぬ、気まぐれな火の姫。力強く呼ぶ声を好み、ためらう声には背を向ける。粘つく魔物を嫌う。' },
  ice: { name: '凍の白狐', ruby: 'いてのびゃっこ', color: '#9fe4ff', lore: '最果ての氷原に棲む白い狐。静かで冷たいが、敵の足を縫い止めることにかけては右に出る者がいない。' },
  thunder: { name: '鳴神の翁', ruby: 'なるかみのおきな', color: '#d0c0ff', lore: '雲の上で鼓を打つ老人。ひとたび怒れば隣の者へ、また隣の者へと稲妻を渡す。石の兵を砕くのが楽しみ。' },
  holy: { name: '暁の巫女', ruby: 'あかつきのみこ', color: '#fff0b0', lore: '夜明けの光を束ねる巫女。死してなお歩く者を憐れみ、その身を光で還す。癒しや守りと共に呼ぶと力が増す。' },
  void: { name: '虚の黒蛇', ruby: 'うつろのくろへび', color: '#b070ff', lore: '底のない穴に棲む蛇。呼んだ者の術に、全てを呑む重さを与える。弱った獲物ほど深く牙を立てるが、その飢えが何に向かうのかは誰も知らない。' },
  wind: { name: '颯の童', ruby: 'はやてのわらべ', color: '#9effc8', lore: 'いたずら好きな風の子。傷つける力は弱いが、ものを遠くへ運ぶことにかけては誰にも負けない。足が速い。' },
  heal: { name: '泉の乙女', ruby: 'いずみのおとめ', color: '#8dffb0', lore: '迷宮の奥に湧く泉の主。傷を閉じ、倒れた者をもう一度立たせる。優しいが、粗い言葉は届きにくい。' },
  ward: { name: '石の衛士', ruby: 'いしのえじ', color: '#8ac8ff', lore: '古い城壁に宿る衛士。見えない殻で呼んだ者を包み、詠唱を乱す一撃さえ受け止める。' },
  haste: { name: '時渡りの燕', ruby: 'ときわたりのつばめ', color: '#c8ffe8', lore: '時の流れの隙間を飛ぶ燕。呼んだ者を半歩だけ時の外へ連れ出し、足を速くする。' },
  light: { name: '蛍の子', ruby: 'ほたるのこ', color: '#fff0c0', lore: '暗がりを怖がる小さな光。呼べば肩のそばに寄り添い、冥い路を照らしてくれる。' },
};
export const BOND_NAMES = ['初対面', '顔見知り', '友', '盟友', '契り', '一心'];
const XP_NEED = [0, 6, 18, 40, 75, 130];

export function bondLevel(xp = 0) { let l = 0; for (let i = 0; i < XP_NEED.length; i++) if (xp >= XP_NEED[i]) l = i; return l; }
export function bondProgress(xp = 0) {
  const l = bondLevel(xp); if (l >= XP_NEED.length - 1) return { level: l, frac: 1 };
  return { level: l, frac: (xp - XP_NEED[l]) / (XP_NEED[l + 1] - XP_NEED[l]) };
}
// 術に関わる精霊(属性と効果の言霊)
export const spiritsOf = spell => [...spell.elements, ...spell.effects].filter(id => SPIRITS[id]);
// 縁による威力: 初対面は0.95倍、一心で1.15倍。機嫌を損ねている精霊は0.85倍
export function bondMul(spell, bonds) {
  const ids = spiritsOf(spell); if (!ids.length) return 1;
  const now = G.time || 0;
  let sum = 0;
  for (const id of ids) {
    let m = 0.95 + 0.04 * bondLevel(bonds[id] || 0);
    if ((G.sulk?.[id] || 0) > now) m *= 0.85;
    sum += m;
  }
  return sum / ids.length;
}
// 唱えた: 縁を深める。名詠は大きく、整詠はやや大きく。上がった精霊を返す
export function gainBond(spell, bonds, tier, mul = 1) {
  const ups = [];
  const gain = (tier === '名詠' ? 3 : tier === '整詠' ? 2 : 1) * mul;
  for (const id of spiritsOf(spell)) {
    const before = bondLevel(bonds[id] || 0);
    bonds[id] = (bonds[id] || 0) + gain;
    const after = bondLevel(bonds[id]);
    if (after > before) ups.push({ id, level: after });
  }
  return ups;
}
// 言い損じ: 続くと精霊が一時的にそっぽを向く
export function scold(ids) {
  G.miss = G.miss || {}; G.sulk = G.sulk || {};
  const sulked = [];
  for (const id of ids) {
    if (!SPIRITS[id]) continue;
    G.miss[id] = (G.miss[id] || 0) + 1;
    if (G.miss[id] >= 2) { G.miss[id] = 0; G.sulk[id] = (G.time || 0) + 25; sulked.push(id); }
  }
  return sulked;
}
export function forgive(ids) { if (G.miss) for (const id of ids) G.miss[id] = 0; }
