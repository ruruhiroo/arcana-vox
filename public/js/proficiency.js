// 属性の熟練(レベル): その属性の術を使うほど、その属性で魔物を倒すほど上がる。全滅で魔導書ごと消える
// 上がると、短縮魔術(詠唱を省いた術)の弱まりが減り、やがて魔法の名を呼ぶだけで全力で放てるようになる
// 階梯(かいてい)は五つ。階梯ごとに二つ名が付く(例: 雷霆の徒 → 雷霆の担い手 → 雷霆を識る者 → 雷霆を統べる者 → 雷霆の化身)
//   第二階梯: 初級の短縮魔術の弱まりが半分   第三階梯: 初級は名を呼ぶだけで全力
//   第四階梯: 中級の短縮魔術の弱まりが半分   終の階梯: 中級も名を呼ぶだけで全力
//   さらに階梯ごとにその属性の威力 +3%
import { BOOK } from './ui.js';

export const EL_JP = { fire: '炎', ice: '氷', thunder: '雷', wind: '風', holy: '聖', void: '闇' };
export const PROF_STEPS = [0, 40, 110, 230, 420]; // 第一〜終の階梯に必要な熟練の合計
// 属性の呼び名と、階梯の名
export const EL_POET = { fire: '紅蓮', ice: '氷獄', thunder: '雷霆', wind: '颶風', holy: '聖光', void: '深淵' };
export const RANK_NAMES = ['第一階梯', '第二階梯', '第三階梯', '第四階梯', '終の階梯'];
const EPITHET = [e => `${e}の徒`, e => `${e}の担い手`, e => `${e}を識る者`, e => `${e}を統べる者`, e => `${e}の化身`];
export const profTitle = (el, lv) => EPITHET[Math.max(1, Math.min(5, lv)) - 1](EL_POET[el] || EL_JP[el]);
export const rankName = lv => RANK_NAMES[Math.max(1, Math.min(5, lv)) - 1];
export const PROF_MAX = PROF_STEPS.length;
const PERKS = {
  2: '初級の短縮魔術の弱まりが半分になった',
  3: '初級の術は、魔法の名を呼ぶだけで全力で放てる',
  4: '中級の短縮魔術の弱まりが半分になった',
  5: '中級の術も、魔法の名を呼ぶだけで全力で放てる',
};

export function profXp(el) { return (BOOK.prof || {})[el] || 0; }
export function profLevel(el) {
  const x = profXp(el); let lv = 1;
  for (let i = 1; i < PROF_STEPS.length; i++) if (x >= PROF_STEPS[i]) lv = i + 1;
  return lv;
}
const spellLevel = spell => (spell.elements || []).length ? Math.max(...spell.elements.map(profLevel)) : 1;

// 短縮魔術の弱まりがどれだけ残るか (1 = そのまま / 0 = 弱まらない)
export function shortChantPenalty(spell) {
  const lv = spellLevel(spell);
  if (!(spell.elements || []).length) return 1;
  if ((spell.tier || 0) === 0) return lv >= 3 ? 0 : lv >= 2 ? 0.5 : 1;
  if (spell.tier === 1) return lv >= 5 ? 0 : lv >= 4 ? 0.5 : 1;
  return 1;
}
export const profPower = spell => 1 + 0.03 * (spellLevel(spell) - 1);

// 熟練を足す。レベルが上がったら知らせを返す
export function gainProf(els, amount) {
  BOOK.prof ||= {};
  const ups = [];
  for (const el of new Set(els || [])) {
    if (!EL_JP[el]) continue;
    const before = profLevel(el);
    BOOK.prof[el] = profXp(el) + amount;
    const after = profLevel(el);
    for (let lv = before + 1; lv <= after; lv++) ups.push({ el, lv, title: `「${profTitle(el, lv)}」`, text: `${rankName(lv)}に至った ・ ${PERKS[lv] ? PERKS[lv] + ' ・ ' : ''}${EL_POET[el]}の術の威力 +${3 * (lv - 1)}%` });
  }
  return ups;
}
// 所持品などに出す一行
export function profSummary() {
  return Object.keys(EL_JP).filter(el => profXp(el) > 0).map(el => {
    const lv = profLevel(el), next = PROF_STEPS[lv];
    return { el, lv, xp: profXp(el), next: next ?? null };
  });
}
