import { dragonProfile } from './dragon-profiles.js';
// モーションと命中が共有する時間・角度。床の予測表示は使わない。
export const DRAGON_ATTACKS = {
  breath: { label: '薙ぎ払う劫火', warn: 2.4, active: 1.8, recover: 1.8, range: 28, angle: Math.PI / 9, damage: 52, hitStart: .12, hitEnd: .88 },
  sweep: { label: '旋回尾撃', warn: 1.65, active: 1.35, recover: 1.5, range: 16, inner: 4, angle: .38, damage: 48, hitStart: .08, hitEnd: .92 },
  slam: { label: '崩山の叩きつけ', warn: 1.9, active: 1, recover: 3.4, range: 17, angle: Math.PI * .36, damage: 64, hitStart: .48, hitEnd: .48 },
  meteor: { label: '墜ちる竜星', warn: 2.2, active: 1, recover: 3.8, range: 6.5, damage: 70, hitStart: .72, hitEnd: .72 },
};
export const dragonHp = (floor, party = 1, final = false) => Math.round((final ? 5200 : 3200) * (1 + .15 * (floor - 1)) * (1 + .6 * (party - 1)));
export const DRAGON_ROAM = 3.5;
export const GUARDIAN_TRAVEL = { dragon:1.4, giant:1.65, beast:1.1, griffin:1.6, sentinel:1.3, reaper:1.25 };
export function createDragonState(element = 'fire') {
  return { element, stage: 'idle', remaining: 2.5, phase: 1, turn: 0, serial: 0, move: 'breath', origin: [0, 0, 0], target: [0, 0, 0], yaw: 0 };
}
export function dragonAttack(s) {
  const base=DRAGON_ATTACKS[s.move], profile=dragonProfile(s);
  return { ...base, damage: Math.round(base.damage*profile.damage), recover: base.recover*profile.recovery,
    ...(s.move==='breath' ? {range:profile.range,angle:profile.angle,label:profile.breath} : {}),
    ...(s.move==='sweep' ? {label:profile.sweep,offset:profile.kind==='dragon'?Math.PI:profile.kind==='griffin'?Math.PI/2:0} : {}),
    ...(s.move==='meteor' ? {range:s.element==='void'?8:base.range,label:profile.meteor} : {}) };
}
export function dragonDuration(s, stage = s.stage) {
  const a = dragonAttack(s);
  if (stage === 'windup') return a.warn * (s.phase === 2 ? .86 : 1);
  if (stage === 'strike') return a.active;
  if (stage === 'recover') return a.recover * (s.phase === 2 ? .85 : 1);
  return GUARDIAN_TRAVEL[dragonProfile(s).kind] || 1.4;
}
export const dragonProgress = s => Math.max(0, Math.min(1, 1 - s.remaining / dragonDuration(s)));
export const smooth = p => { p = Math.max(0, Math.min(1, p)); return p * p * (3 - 2 * p); };
export const breathTurn = p => -.55 + 1.1 * smooth(p);
export const sweepTurn = p => -.9 + Math.PI * 2 * smooth(p);
// 一度に一段階だけ進む。低fpsでも構えを省略しない。構え始めに狙いを固定。
export function stepDragon(s, dt, { health, distance, origin, target, yaw }) {
  s.remaining -= Math.max(0, dt);
  if (s.remaining > 0) return null;
  if (s.stage === 'idle') {
    s.phase = health <= .5 ? 2 : 1;
    const order = dragonProfile(s).order;
    const pattern = s.phase === 1 ? order : [order[0], order[1], order[0], order[2], order[3], order[1]];
    s.move = pattern[s.turn++ % pattern.length];
    if (distance > dragonProfile(s).range) s.move = 'meteor';
    s.origin = [...origin]; s.target = [...target]; s.yaw = yaw;
    s.stage = 'windup'; s.remaining = dragonDuration(s); s.serial++;
    return 'windup';
  }
  if (s.stage === 'windup') s.stage = 'strike';
  else if (s.stage === 'strike') s.stage = 'recover';
  else { s.stage = 'idle'; s.travel = null; }
  s.remaining = dragonDuration(s); return s.stage;
}
function inArc(dx, dz, yaw, from, to, halfAngle) {
  const angle = Math.atan2(-dx, -dz) - yaw, middle = (from + to) / 2;
  const delta = Math.atan2(Math.sin(angle - middle), Math.cos(angle - middle));
  return Math.abs(delta) <= Math.abs(to - from) / 2 + halfAngle;
}
// 回転を前フレームから積分し、低fpsでも尾の通過を拾う。1技につき各人1回まで。
export function dragonHits(s, point, from = 0, to = 1) {
  const a = dragonAttack(s);
  if (!a || to < a.hitStart || from > a.hitEnd) return false;
  from = Math.max(from, a.hitStart); to = Math.min(to, a.hitEnd);
  const center = s.move === 'meteor' ? s.target : s.origin;
  if (Math.abs(point[1] - center[1]) > 3.5) return false;
  const dx = point[0] - center[0], dz = point[2] - center[2], d = Math.hypot(dx, dz);
  if (d > a.range || d < (a.inner || 0)) return false;
  if (s.move === 'meteor') return true;
  if (s.move === 'sweep') return inArc(dx, dz, s.yaw, a.offset + sweepTurn(from), a.offset + sweepTurn(to), a.angle);
  if (s.move === 'breath') return inArc(dx, dz, s.yaw, breathTurn(from), breathTurn(to), a.angle);
  return inArc(dx, dz, s.yaw, 0, 0, a.angle);
}
