import { dragonProfile } from './dragon-profiles.js';
// モーションと命中が共有する時間・角度。床の予測表示は使わない。
export const DRAGON_ATTACKS = {
  breath: { label: '薙ぎ払う劫火', warn: 2.4, active: 1.8, recover: 2.2, range: 28, angle: Math.PI / 9, damage: 40, hitStart: .12, hitEnd: .88 },
  sweep: { label: '旋回尾撃', warn: 1.65, active: 1.35, recover: 1.8, range: 16, inner: 4, angle: .38, damage: 36, hitStart: .08, hitEnd: .92 },
  slam: { label: '崩山の叩きつけ', warn: 1.9, active: 1, recover: 3.4, range: 17, angle: Math.PI * .36, damage: 50, hitStart: .48, hitEnd: .48 },
  meteor: { label: '墜ちる竜星', warn: 2.2, active: 1, recover: 3.8, range: 6.5, damage: 58, hitStart: .72, hitEnd: .72 },
  // 相手の動きを見て挟む技: 間合いを詰める突進と、詠唱を乱す咆哮。構えが短いぶん、隙も短い
  lunge: { label: '噛み砕き', warn: .95, active: .55, recover: 1.5, range: 7.5, angle: .5, damage: 32, hitStart: .2, hitEnd: .85 },
  roar: { label: '咆哮', warn: .75, active: .5, recover: 1.1, range: 11, damage: 13, hitStart: .1, hitEnd: .6, circle: true },
};
// ---- 守護者ごとの固有技(四つ)と大技(一つ)。共通の六つと合わせて、一体につき十一種 ----
//   anim  = 体の動き(共通の六つのどれを使うか)
//   shape = 当たる形: circle(自分の周り。inner があれば内側は安全) / line(前へ伸びる帯。lines で本数、bursts で時間差) /
//           cone(扇。offset で向き) / prongs(細い扇を何本か) / spots(狙った所の円をいくつか) / spin(回りながら薙ぐ腕)
//   min, max = 使う間合い / need = この状況でだけ使う(behind など) / effect = 当たった時の追加(slow, burn, knock, pull, drain)
//   dash = 踏み込む速さ / leap = 狙った所へ跳ぶ / blink = 相手の向こう側へ渡る / ult = 大技(体力が半分を切ると使う)
export const SPECIALS = {
  // 炎鱗竜ヴォルグ
  firewall:  { label: '焔の壁', anim: 'breath', shape: 'line', width: 5, range: 26, warn: 1.5, active: 1.0, recover: 1.9, damage: 34, hitStart: .3, hitEnd: .3, effect: 'burn', min: 6 },
  eruption:  { label: '噴火の列', anim: 'slam', shape: 'spots', pattern: 'trail', count: 6, step: 4.2, radius: 3.1, stagger: .09, warn: 1.5, active: 1.5, recover: 2.4, damage: 38, hitStart: .3, hitEnd: .8, effect: 'burn', min: 7 },
  wingbuffet:{ label: '翼の烈風', anim: 'roar', shape: 'circle', range: 13, warn: 1.0, active: .5, recover: 1.2, damage: 18, hitStart: .3, hitEnd: .3, effect: 'knock', max: 12, track: true },
  tailcrush: { label: '尾の叩き潰し', anim: 'sweep', shape: 'cone', offset: Math.PI, angle: .62, range: 13, warn: 1.0, active: .7, recover: 1.6, damage: 44, hitStart: .45, hitEnd: .45, need: 'behind', max: 15 },
  inferno:   { label: '灰燼の大劫火', anim: 'breath', shape: 'spin', arms: 1, turn: Math.PI * 2, angle: .3, range: 27, flame: true, warn: 3.0, active: 3.4, recover: 4.6, damage: 55, hitStart: .06, hitEnd: .96, effect: 'burn', ult: true },
  // 氷冠巨人ニヴァリス
  icicles:   { label: '氷柱の雨', anim: 'meteor', shape: 'spots', pattern: 'cross', count: 5, dist: 5.5, radius: 3, stagger: .05, warn: 1.7, active: 1.2, recover: 2.2, damage: 36, hitStart: .5, hitEnd: .8, effect: 'slow', min: 6 },
  frostnova: { label: '凍てつく波紋', anim: 'slam', shape: 'circle', range: 10.5, warn: 1.4, active: .8, recover: 2.2, damage: 40, hitStart: .5, hitEnd: .5, effect: 'slow', max: 10 },
  glacier:   { label: '氷河の突進', anim: 'lunge', shape: 'cone', angle: .75, range: 6.5, dash: 19, roam: 13, warn: 1.3, active: .9, recover: 2.0, damage: 42, hitStart: .1, hitEnd: .9, effect: 'knock', min: 8, max: 22, track: true },
  frostbell: { label: '凍鐘', anim: 'roar', shape: 'circle', inner: 8.5, range: 26, warn: 1.6, active: .6, recover: 1.6, damage: 30, hitStart: .3, hitEnd: .3, effect: 'slow', min: 8 },
  absolute:  { label: '絶対零度', anim: 'meteor', shape: 'circle', inner: 5.5, range: 34, warn: 3.2, active: 1.0, recover: 4.6, damage: 70, hitStart: .5, hitEnd: .5, effect: 'slow', ult: true },
  // 雷角獣ヴァジュラ
  chainbolt: { label: '三叉の雷', anim: 'breath', shape: 'prongs', count: 3, spacing: .42, angle: .1, range: 30, warn: 1.2, active: .7, recover: 1.5, damage: 34, hitStart: .3, hitEnd: .3, effect: 'slow', min: 6 },
  stampede:  { label: '雷蹄の蹂躙', anim: 'lunge', shape: 'cone', angle: .8, range: 5.5, dash: 23, roam: 15, warn: 1.2, active: 1.1, recover: 1.9, damage: 44, hitStart: .08, hitEnd: .92, effect: 'knock', min: 9, max: 26, track: true },
  thunderfield: { label: '落雷陣', anim: 'meteor', shape: 'spots', pattern: 'ring', count: 7, dist: 6, radius: 2.7, stagger: .08, warn: 1.5, active: 1.5, recover: 2.2, damage: 34, hitStart: .25, hitEnd: .85, min: 5 },
  hornspark: { label: '角の放電', anim: 'roar', shape: 'circle', range: 8, warn: .6, active: .4, recover: 1.0, damage: 26, hitStart: .3, hitEnd: .3, max: 7.5, track: true },
  judgment:  { label: '万雷の裁き', anim: 'meteor', shape: 'line', lines: 4, width: 4.2, range: 32, bursts: [[.3, 0], [.72, Math.PI / 4]], warn: 3.0, active: 2.2, recover: 4.2, damage: 60, hitStart: .3, hitEnd: .72, ult: true },
  // 嵐翼グリフォン
  dive:      { label: '急降下', anim: 'slam', shape: 'circle', range: 6.5, leap: true, roam: 16, warn: 1.3, active: 1.0, recover: 2.3, damage: 46, hitStart: .62, hitEnd: .62, effect: 'knock', min: 7 },
  feathers:  { label: '羽根の矢雨', anim: 'breath', shape: 'prongs', count: 5, spacing: .27, angle: .075, range: 28, warn: 1.1, active: .7, recover: 1.4, damage: 28, hitStart: .3, hitEnd: .3, min: 6 },
  cyclone:   { label: '竜巻', anim: 'meteor', shape: 'spots', pattern: 'scatter', count: 4, dist: 4.5, radius: 3.4, stagger: .16, warn: 1.4, active: 1.8, recover: 2.0, damage: 30, hitStart: .25, hitEnd: .8, effect: 'pull', min: 5 },
  gale:      { label: '突風', anim: 'roar', shape: 'line', width: 9, range: 22, warn: .9, active: .5, recover: 1.3, damage: 16, hitStart: .3, hitEnd: .3, effect: 'knock', max: 20, track: true },
  tempest:   { label: '天裂く大嵐', anim: 'sweep', shape: 'spin', arms: 2, turn: Math.PI * 3, angle: .34, inner: 5, range: 30, flame: true, warn: 3.0, active: 3.6, recover: 4.4, damage: 50, hitStart: .05, hitEnd: .96, effect: 'knock', ult: true },
  // 聖堂騎像アウレリア
  lance:     { label: '光槍', anim: 'breath', shape: 'line', width: 3, range: 32, warn: 1.1, active: .6, recover: 1.5, damage: 44, hitStart: .3, hitEnd: .3, min: 7, track: true },
  shieldbash:{ label: '聖盾の突き', anim: 'lunge', shape: 'cone', angle: .7, range: 6, dash: 16, roam: 11, warn: 1.0, active: .7, recover: 1.7, damage: 34, hitStart: .1, hitEnd: .9, effect: 'knock', max: 16, track: true },
  pillars:   { label: '光の柱', anim: 'meteor', shape: 'spots', pattern: 'trail', count: 8, step: 3.4, radius: 2.5, stagger: .07, warn: 1.5, active: 1.6, recover: 2.2, damage: 36, hitStart: .22, hitEnd: .8, min: 8 },
  consecrate:{ label: '聖域の輪', anim: 'slam', shape: 'circle', inner: 5.5, range: 15, warn: 1.5, active: .8, recover: 2.2, damage: 38, hitStart: .5, hitEnd: .5, max: 16 },
  verdict:   { label: '最後の審判', anim: 'meteor', shape: 'spin', arms: 4, turn: Math.PI / 4, angle: .15, range: 32, warn: 3.0, active: 3.0, recover: 4.4, damage: 60, hitStart: .08, hitEnd: .95, ult: true },
  // 深淵の死神ノクス
  scythewave:{ label: '飛ぶ斬撃', anim: 'sweep', shape: 'cone', angle: .95, range: 24, warn: 1.2, active: .7, recover: 1.7, damage: 38, hitStart: .4, hitEnd: .4, min: 5 },
  abysshands:{ label: '奈落の手', anim: 'meteor', shape: 'spots', pattern: 'scatter', count: 4, dist: 3.2, radius: 3.1, stagger: .14, warn: 1.3, active: 1.6, recover: 2.0, damage: 30, hitStart: .25, hitEnd: .75, effect: 'slow', min: 4 },
  shadowstep:{ label: '影渡り', anim: 'lunge', shape: 'cone', angle: .85, range: 7.5, blink: true, roam: 18, warn: .9, active: .8, recover: 1.7, damage: 42, hitStart: .5, hitEnd: .5, min: 6 },
  soulring:  { label: '魂喰らいの輪', anim: 'roar', shape: 'circle', inner: 4, range: 13, warn: 1.1, active: .5, recover: 1.4, damage: 30, hitStart: .3, hitEnd: .3, effect: 'drain', max: 13 },
  eclipse:   { label: '蝕', anim: 'meteor', shape: 'spots', pattern: 'around', count: 9, dist: 11, radius: 5, stagger: .06, warn: 3.0, active: 2.0, recover: 4.4, damage: 62, hitStart: .3, hitEnd: .8, ult: true },
};
export const GUARDIAN_KITS = {
  fire: ['firewall', 'eruption', 'wingbuffet', 'tailcrush', 'inferno'], ice: ['icicles', 'frostnova', 'glacier', 'frostbell', 'absolute'],
  thunder: ['chainbolt', 'stampede', 'thunderfield', 'hornspark', 'judgment'], wind: ['dive', 'feathers', 'cyclone', 'gale', 'tempest'],
  holy: ['lance', 'shieldbash', 'pillars', 'consecrate', 'verdict'], void: ['scythewave', 'abysshands', 'shadowstep', 'soulring', 'eclipse'],
};
// 共通の短い技も、守護者ごとに呼び名が違う
const KIND_LABELS = { giant: { lunge: '氷拳の打ち下ろし', roar: '凍てつく咆哮' }, beast: { lunge: '角の突き上げ', roar: '雷鳴の咆哮' }, griffin: { lunge: '嘴の一閃', roar: '嵐の叫び' }, sentinel: { lunge: '踏み込み斬り', roar: '聖鐘の響き' }, reaper: { lunge: '鎌の引き裂き', roar: '亡者の叫び' } };
const hash = (s, i) => { const x = Math.sin((s.serial + 1) * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x); };
// 固有技の当たる形を、部品の列にする(当たり判定と、見た目の予兆の両方が使う)。t0〜t1 は当たる時間
export function attackPrims(s) {
  const a = dragonAttack(s); if (!a.shape) return [];
  const o = s.origin, t = s.target, out = [], T0 = a.hitStart, T1 = a.hitEnd;
  if (a.shape === 'circle') out.push({ k: 'circle', x: o[0], z: o[2], r: a.range, inner: a.inner || 0, t0: T0, t1: T1 });
  else if (a.shape === 'line') for (const [time, off] of a.bursts || [[T0, 0]]) for (let i = 0; i < (a.lines || 1); i++) out.push({ k: 'line', x: o[0], z: o[2], yaw: s.yaw + off + i * Math.PI * 2 / (a.lines || 1), len: a.range, w: a.width, t0: time, t1: a.bursts ? time : T1 });
  else if (a.shape === 'cone') out.push({ k: 'cone', x: o[0], z: o[2], yaw: s.yaw + (a.offset || 0), half: a.angle, r: a.range, t0: T0, t1: T1 });
  else if (a.shape === 'prongs') for (let i = 0; i < a.count; i++) out.push({ k: 'cone', x: o[0], z: o[2], yaw: s.yaw + (i - (a.count - 1) / 2) * a.spacing, half: a.angle, r: a.range, t0: T0, t1: T1 });
  else if (a.shape === 'spin') for (let i = 0; i < a.arms; i++) out.push({ k: 'arm', x: o[0], z: o[2], yaw: s.yaw + i * Math.PI * 2 / a.arms, half: a.angle, r: a.range, inner: a.inner || 0, turn: a.turn, t0: T0, t1: T1 });
  else if (a.shape === 'spots') {
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), n = a.count, step = (T1 - T0) / Math.max(1, n - 1);
    for (let i = 0; i < n; i++) {
      let x = t[0], z = t[2];
      if (a.pattern === 'trail') { x = o[0] + fx * a.step * (i + 1.2); z = o[2] + fz * a.step * (i + 1.2); }
      else if (a.pattern === 'cross' && i) { const ang = s.yaw + i * Math.PI / 2; x += Math.sin(ang) * a.dist; z += Math.cos(ang) * a.dist; }
      else if (a.pattern === 'ring' && i) { const ang = s.yaw + i * Math.PI * 2 / (n - 1); x += Math.sin(ang) * a.dist; z += Math.cos(ang) * a.dist; }
      else if (a.pattern === 'scatter' && i) { const ang = hash(s, i) * Math.PI * 2, d = a.dist * (.6 + .8 * hash(s, i + 20)); x += Math.sin(ang) * d; z += Math.cos(ang) * d; }
      else if (a.pattern === 'around' && i) { const ang = s.yaw + (i + hash(s, 3) * .5) * Math.PI * 2 / (n - 1); x = o[0] + Math.sin(ang) * a.dist; z = o[2] + Math.cos(ang) * a.dist; }
      const time = Math.min(T1, T0 + i * (a.stagger ? Math.min(step, a.stagger) : step));
      out.push({ k: 'circle', x, z, r: a.radius, inner: 0, t0: time, t1: time, spot: true });
    }
  }
  return out;
}
export const spinTurn = (a, p) => a.turn * smooth((p - a.hitStart) / Math.max(.001, a.hitEnd - a.hitStart));
function specialHits(s, a, point, from, to) {
  if (Math.abs(point[1] - s.origin[1]) > 3.5) return false;
  for (const q of attackPrims(s)) {
    if (to < q.t0 || from > q.t1) continue;
    const dx = point[0] - q.x, dz = point[2] - q.z, d = Math.hypot(dx, dz);
    if (q.k === 'circle') { if (d <= q.r && d >= q.inner) return true; }
    else if (q.k === 'cone') { if (d <= q.r && inArc(dx, dz, q.yaw, 0, 0, q.half)) return true; }
    else if (q.k === 'arm') { if (d <= q.r && d >= q.inner && inArc(dx, dz, q.yaw, spinTurn(a, Math.max(from, q.t0)), spinTurn(a, Math.min(to, q.t1)), q.half)) return true; }
    else if (q.k === 'line') { const f = -dx * Math.sin(q.yaw) - dz * Math.cos(q.yaw), side = dx * Math.cos(q.yaw) - dz * Math.sin(q.yaw); if (f >= 0 && f <= q.len && Math.abs(side) <= q.w / 2) return true; }
  }
  return false;
}
export const dragonHp = (floor, party = 1, final = false) => Math.round((final ? 2600 : 1400) * (1 + .15 * (floor - 1)) * (1 + .6 * (party - 1)));
export const DRAGON_ROAM = 3.5;
export const GUARDIAN_TRAVEL = { dragon:1.4, giant:1.65, beast:1.1, griffin:1.6, sentinel:1.3, reaper:1.25 };
export function createDragonState(element = 'fire') {
  return { element, stage: 'idle', remaining: 2.5, phase: 1, turn: 0, serial: 0, move: 'breath', origin: [0, 0, 0], target: [0, 0, 0], yaw: 0 };
}
export function dragonAttack(s) {
  const profile=dragonProfile(s), base=DRAGON_ATTACKS[s.move]||SPECIALS[s.move]||DRAGON_ATTACKS.breath;
  return { ...base, damage: Math.round(base.damage*profile.damage), recover: base.recover*profile.recovery,
    ...(s.move==='breath' ? {range:profile.range,angle:profile.angle,label:profile.breath} : {}),
    ...(s.move==='sweep' ? {label:profile.sweep,offset:profile.kind==='dragon'?Math.PI:profile.kind==='griffin'?Math.PI/2:0} : {}),
    ...(s.move==='meteor' ? {range:s.element==='void'?8:base.range,label:profile.meteor} : {}),
    ...(KIND_LABELS[profile.kind]?.[s.move] ? {label:KIND_LABELS[profile.kind][s.move]} : {}) };
}
export function dragonDuration(s, stage = s.stage) {
  const a = dragonAttack(s);
  if (stage === 'windup') return a.warn * (s.phase === 2 ? .86 : 1) * (s.tempo || 1);
  if (stage === 'strike') return a.active;
  if (stage === 'recover') return a.recover * (s.phase === 2 ? .85 : 1);
  return GUARDIAN_TRAVEL[dragonProfile(s).kind] || 1.4;
}
export const dragonProgress = s => Math.max(0, Math.min(1, 1 - s.remaining / dragonDuration(s)));
export const smooth = p => { p = Math.max(0, Math.min(1, p)); return p * p * (3 - 2 * p); };
export const breathTurn = p => -.55 + 1.1 * smooth(p);
export const sweepTurn = p => -.9 + Math.PI * 2 * smooth(p);
// 一度に一段階だけ進む。低fpsでも構えを省略しない。構え始めに狙いを固定。
export function stepDragon(s, dt, { health, distance, origin, target, yaw, ctx }) {
  s.remaining -= Math.max(0, dt);
  if (s.remaining > 0) return null;
  if (s.stage === 'idle') {
    s.phase = health <= .5 ? 2 : 1;
    const order = dragonProfile(s).order;
    const pattern = s.phase === 1 ? order : [order[0], order[1], order[0], order[2], order[3], order[1]];
    s.move = pattern[s.turn++ % pattern.length];
    s.tempo = 1; s.chain = 0;
    if (ctx && ctx.adaptive) {
      // 相手を見て技を変える。同じ手順の繰り返しにしない
      const [r1 = 1, r2 = 1, r3 = .5, r4 = 1] = ctx.rand || [];
      if (ctx.chanting && distance < 12 && s.last !== 'roar' && r1 < .55) s.move = 'roar';           // 詠唱を聞きつけて吠え、乱す
      else if (ctx.behind && distance < 15) s.move = 'sweep';                                          // 背後へ回られたら薙ぎ払う
      else if (distance < 6.5 && r1 < .6) s.move = r1 < .3 ? 'slam' : 'lunge';                         // 懐に入られたら叩く・噛む
      else if (distance > 8 && distance < 15 && r1 < .32) s.move = 'lunge';                            // 中距離は一気に詰める
      else if ((ctx.still || 0) > 2.2 && r1 < .6) s.move = 'meteor';                                   // 立ち止まった者には星を落とす
      if (s.move === s.last && r2 < .75) s.move = pattern[s.turn++ % pattern.length];                  // 同じ技を続けにくく
      if (s.phase === 2) { s.tempo = .82 + r3 * .36; s.chain = (s.move === 'sweep' || s.move === 'lunge' || s.move === 'roar') && r4 < .5 ? 1 : 0; }   // 後半は緩急と連続技
    }
    if (distance > dragonProfile(s).range) s.move = 'meteor';
    if (ctx && ctx.adaptive && ctx.rand && ctx.rand[4] !== undefined) {
      // 守護者ごとの固有技を織り交ぜる。体力が半分を切ったら、まず大技。その後も数手ごとに繰り返す
      const kit = GUARDIAN_KITS[s.element] || [], ult = kit.find(id => SPECIALS[id].ult);
      s.recent ||= [];
      if (s.phase === 2 && ult && (!s.ultDone || s.turn - s.ultTurn >= 7)) { s.move = ult; s.ultDone = true; s.ultTurn = s.turn; s.tempo = 1; s.chain = 0; }
      else if (ctx.rand[4] < (s.phase === 2 ? .62 : .48)) {
        const fits = kit.filter(id => { const a = SPECIALS[id]; return !a.ult && distance >= (a.min || 0) && distance <= (a.max || 99) && !s.recent.includes(id) && (!a.need || ctx[a.need]); });
        const forced = fits.find(id => SPECIALS[id].need);
        if (fits.length) { s.move = forced || fits[Math.floor((ctx.rand[5] || 0) * fits.length) % fits.length]; s.chain = 0; s.tempo = 1; }
      }
      s.recent.push(s.move); if (s.recent.length > 3) s.recent.shift();
    }
    s.last = s.move;
    s.origin = [...origin]; s.target = [...target]; s.yaw = yaw;
    s.stage = 'windup'; s.remaining = dragonDuration(s); s.serial++;
    return 'windup';
  }
  if (s.stage === 'windup') s.stage = 'strike';
  else if (s.stage === 'strike' && s.chain) { s.chain = 0; s.stage = 'idle'; s.travel = null; s.remaining = .35; return 'idle'; } // 連続技: 隙を見せずに次の構えへ
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
  if (a && a.shape) return specialHits(s, a, point, from, to);
  if (!a || to < a.hitStart || from > a.hitEnd) return false;
  from = Math.max(from, a.hitStart); to = Math.min(to, a.hitEnd);
  const center = s.move === 'meteor' ? s.target : s.origin;
  if (Math.abs(point[1] - center[1]) > 3.5) return false;
  const dx = point[0] - center[0], dz = point[2] - center[2], d = Math.hypot(dx, dz);
  if (d > a.range || d < (a.inner || 0)) return false;
  if (s.move === 'meteor' || a.circle) return true;
  if (s.move === 'sweep') return inArc(dx, dz, s.yaw, a.offset + sweepTurn(from), a.offset + sweepTurn(to), a.angle);
  if (s.move === 'breath') return inArc(dx, dz, s.yaw, breathTurn(from), breathTurn(to), a.angle);
  return inArc(dx, dz, s.yaw, 0, 0, a.angle);
}
