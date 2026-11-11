import { dragonProgress } from './dragon-rules.js';

// 属性を持っていなくても、位置・タイミング・狙いで攻略できる仕掛け。
export function guardianDefense(s, { distance = Infinity, front = false, mouthHit = false, silent = false } = {}) {
  const exposed = s.stage === 'recover';
  if (s.element === 'fire' && !silent && mouthHit && s.move === 'breath' && (s.stage === 'windup' || s.stage === 'strike' && dragonProgress(s) < .2))
    return { mult: 1.6, stagger: true, hint: '口内を撃ち抜いた — 暴発！' };
  if (s.element === 'thunder' && !exposed && s.stage !== 'idle' && !silent)
    return { mult: .45, reflect: 8, hint: '帯電反射 — 放電後を狙え' };
  if (s.element === 'wind' && distance > 8 && !exposed)
    return { mult: .3, hint: '風の鎧 — 懐へ潜り込め' };
  if (s.element === 'holy' && front && !exposed)
    return { mult: .25, hint: '聖盾 — 側面か背後を狙え' };
  return { mult: 1 };
}
export function frostExposure(value, dt, speed, distance) {
  return Math.max(0, Math.min(2.5, value + dt * (distance < 22 && speed < .35 ? 1 : -2.5)));
}
export function guardianHint(s, distance = Infinity, frost = 0) {
  if (s.stage === 'recover') return '弱点露出 ×1.6';
  if (s.element === 'ice') return `凍気 ${Math.round(frost / 2.5 * 100)}% — 足を止めるな`;
  if (s.element === 'thunder') return s.stage === 'idle' ? '放電中' : '角が帯電している';
  if (s.element === 'wind') return distance > 8 ? '翼に風の鎧' : '風の鎧の内側';
  if (s.element === 'holy') return '正面を守る聖盾';
  if (s.element === 'void' && distance < 10) return '生命吸収 — 鎖から離れよ';
  if (s.element === 'fire' && s.move === 'breath' && s.stage === 'windup') return '息を吸い込み、口内が輝く';
  return '構えを読め';
}
