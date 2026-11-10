// 描画・通信に依存しない竜の戦闘ルール。予兆と当たり判定で同じ寸法を使う。
export const DRAGON_ATTACKS = {
  breath: { label: '灼熱の息 — 横へ逃げよ', warn: 2.2, active: 0.7, recover: 6, range: 14, angle: Math.PI / 6, damage: 24 },
  sweep: { label: '尾の薙ぎ払い — 円の外へ', warn: 1.8, active: 0.5, recover: 5.5, range: 4.5, damage: 20 },
  meteor: { label: '竜星 — 光る足元から離れよ', warn: 2.4, active: 0.6, recover: 6, range: 2.6, damage: 30 },
};
export function createDragonState() {
  return { stage: 'idle', remaining: 2.5, phase: 1, turn: 0, serial: 0, move: 'breath', origin: [0, 0, 0], target: [0, 0, 0], yaw: 0 };
}
// 一度に一段階だけ進む。低フレームレートでも予兆を飛ばして命中させない。
export function stepDragon(s, dt, { health, distance, origin, target, yaw }) {
  s.remaining -= Math.max(0, dt);
  if (s.remaining > 0) return null;
  if (s.stage === 'idle') {
    s.phase = health <= 0.5 ? 2 : 1;
    const pattern = s.phase === 1 ? ['breath', 'sweep'] : ['breath', 'meteor', 'sweep', 'meteor'];
    s.move = pattern[s.turn++ % pattern.length];
    if (s.move === 'sweep' && distance > 6) s.move = 'breath';
    if (distance > DRAGON_ATTACKS.breath.range) s.move = 'meteor'; // 射程外からの一方的な攻撃にも、同じ予兆付きで応じる
    s.origin = [...origin]; s.target = [...target]; s.yaw = yaw;
    s.stage = 'windup'; s.remaining = DRAGON_ATTACKS[s.move].warn; s.serial++;
    return 'windup';
  }
  const attack = DRAGON_ATTACKS[s.move];
  if (s.stage === 'windup') { s.stage = 'strike'; s.remaining = attack.active; return 'strike'; }
  if (s.stage === 'strike') { s.stage = 'recover'; s.remaining = attack.recover; return 'recover'; }
  s.stage = 'idle'; s.remaining = 1.2; return 'idle';
}
export function dragonHits(s, point) {
  const a = DRAGON_ATTACKS[s.move], center = s.move === 'meteor' ? s.target : s.origin;
  if (!a || Math.abs(point[1] - center[1]) > 2.5) return false;
  const dx = point[0] - center[0], dz = point[2] - center[2], d = Math.hypot(dx, dz);
  if (d > a.range) return false;
  if (s.move !== 'breath' || d < 0.001) return true;
  return (dx * -Math.sin(s.yaw) + dz * -Math.cos(s.yaw)) / d >= Math.cos(a.angle);
}
