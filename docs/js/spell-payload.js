import { ATTACK_FX } from './lexicon.js';
export const BASE = { fire:60,ice:55,thunder:66,holy:58,void:76,wind:45 };
export function payload(spell) {
  const p = spell.power;
  const els = spell.elements;
  const atk = ATTACK_FX.filter(a => spell.effects.includes(a));
  // 属性が無くても、攻撃の種類があれば無属性の傷を与える(衝撃は重い)
  const dmg = els.length ? els.reduce((s, e) => s + BASE[e], 0) / els.length * p * (atk.includes('impact') ? 1.15 : 1) : atk.length ? (atk.includes('impact') ? 62 : 44) * p : 0;
  const holyB = els.includes('holy') ? 1.5 : 1;
  return {
    dmg,
    heal: spell.effects.includes('heal') ? 28 * p * holyB : 0,
    ward: spell.effects.includes('ward') ? 35 * p * holyB : 0,
    haste: spell.effects.includes('haste') ? 6 * (spell.eternal ? 1.6 : 1) * (els.includes('wind') ? 1.5 : 1) : 0,
    might: spell.effects.includes('might') ? 20 * (spell.eternal ? 1.6 : 1) : 0,
    atk,
  };
}
