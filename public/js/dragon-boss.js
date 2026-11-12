import { frostExposure } from './guardian-mechanics.js';
import { insideArena, arenaIntro } from './arena-room.js';
import { sfx } from './audio.js';
import { animateGuardian } from './guardian-model.js';
import { dragonProfile, dragonElement } from './dragon-profiles.js';
import * as THREE from 'three';
import { G } from './state.js';
import { lineOfSight, moveWithCollision, CLIMB } from './dungeon.js';
import { createDragonState, stepDragon, DRAGON_ROAM, dragonHits, dragonProgress, dragonDuration, dragonAttack, smooth, spinTurn } from './dragon-rules.js';

import { colorDragon } from './dragon-model.js';
import { createDragonVisual, updateDragonVisual } from './dragon-vfx.js';

const visuals = new Map();
function disposeVisual(id) {
  const v = visuals.get(id); if (!v) return;
  G.scene.remove(v.group);
  v.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); if (o.isInstancedMesh) o.dispose(); });
  visuals.delete(id);
}
export function clearDragons() { for (const id of visuals.keys()) disposeVisual(id); document.getElementById('dragonHud')?.classList.add('hidden'); }
function drawDragon(e, dt) {
  const s = e.dragon;
  if (e.body.userData.element !== s.element) colorDragon(e.body, s.element);
  let v = visuals.get(e.id);
  if (!v) { v = createDragonVisual(); visuals.set(e.id, v); G.scene.add(v.group); }
  const key = `${s.serial}:${s.stage}`, p = dragonProgress(s);
  // 10Hzの通信間も構え・首・尾を滑らかに進める。クライアントは判定しない。
  v.progress = v.key !== key || G.isHost || v.snapshot !== s ? p : Math.min(1, v.progress + dt / dragonDuration(s));
  v.snapshot = s;
  const intro = arenaIntro();
  if (v.key !== key && s.stage === 'strike' && s.move === 'roar') { // 咆哮: 衝撃の輪が広がり、近くの詠唱を乱す
    G.shake = Math.max(G.shake || 0, 0.7); sfx.growl?.(e.pos); sfx.dragonCharge?.(e.pos, 'meteor');
    for (let k = 0; k < 3; k++) G.fx?.burst(e.pos.clone().add(new THREE.Vector3(0, 0.5 + k, 0)), dragonProfile(s).color, 50, { speed: 10 + k * 3, up: 0.6, size: 0.5, life: 0.6 });
  }
  if (v.key !== key && s.stage === 'windup' && dragonAttack(s).ult) { // 大技: 名を告げ、長く構える(部屋の主にも客にも見せる)
    G.ui?.banner(dragonAttack(s).label, dragonProfile(s).name + ' ― 大技', 2.8); G.shake = Math.max(G.shake || 0, 0.8); sfx.growl?.(e.pos);
  }
  if (intro > 0 && intro < 1 && !e.introShown) { e.introShown = true; G.ui?.bossTitle?.(dragonProfile(s).name, dragonProfile(s).title); }
  if (intro >= 0.5 && intro < 1 && !e.roared) { e.roared = true; G.shake = Math.max(G.shake || 0, 0.9); sfx.dragonCharge?.(e.pos, 'meteor'); sfx.growl?.(e.pos); G.fx?.burst(e.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xb2a28b, 60, { speed: 7, up: 1.5, size: 0.6, life: 0.9 }); }
  // 体ごと回る技は、首を振らず正面へ向けたまま吐く(体が回るので、帯は体の向きと合う)
  Object.assign(e.body.userData, { intro, stage: s.stage, move: dragonAttack(s).anim || s.move, progress: dragonAttack(s).follow && s.stage === 'strike' ? .5 : v.progress, travelProgress: s.stage === 'idle' && s.travel ? v.progress : -1 });
  if (e.root) { e.root.position.copy(e.pos); e.root.rotation.y = e.yaw; }
  const walking = G.isHost ? e.dragonWalking : v.lastPos && v.lastPos.distanceToSquared(e.pos) > dt * dt * .16;
  v.lastPos = e.pos.clone();
  animateGuardian(e.body.userData, G.time || 0, !!walking);
  e.body.updateWorldMatrix(true, true);
  updateDragonVisual(v, e, v.progress, dt);
}
function moveDragon(e, delta, roam = DRAGON_ROAM) {
  const next = e.pos.clone().add(delta);
  if (e.leash) {
    const offset = next.clone().sub(e.leash).setY(0);
    if (offset.length() > roam) next.copy(e.leash).add(offset.setLength(roam)).setY(e.pos.y);
  }
  const before = e.pos.clone();
  moveWithCollision(e.pos, next.x - e.pos.x, next.z - e.pos.z, e.radius, e.team, CLIMB);
  e.dragonWalking = before.distanceToSquared(e.pos) > .00001;
}
export function updateDragons(dt) {
  const living = new Set();
  for (const e of G.enemies) {
    if (!e.alive || e.type !== 'dragon') continue;
    living.add(e.id);
    if (G.isHost) {
      const targets = G.mages.filter(m => m.team === 'hero' && m.alive && !m.downed && (!G.dungeon?.arena || G.dungeon.arena.phase==='active'&&insideArena(m.pos)) && !G.inSanctuary?.(m.pos) && m.pos.distanceTo(e.pos) < 42 && lineOfSight(e.pos, m.pos));
      const target = targets.sort((a, b) => a.pos.distanceToSquared(e.pos) - b.pos.distanceToSquared(e.pos))[0];
      e.dragon ||= createDragonState(e.dragonElement || dragonElement(G.floor, e.final));
      const s = e.dragon;
      e.dragonWalking = false;
      if (target && arenaIntro() < 1) { // 登場のあいだは、起き上がって吠えるだけ
        const yaw = Math.atan2(e.pos.x - target.pos.x, e.pos.z - target.pos.z), turn = Math.atan2(Math.sin(yaw - e.yaw), Math.cos(yaw - e.yaw));
        e.yaw += Math.max(-dt * 1.2, Math.min(dt * 1.2, turn));
        s.stage = 'idle'; s.remaining = Math.max(s.remaining, 1.4); s.travel = null; e.vulnUntil = 0; e.aggro = true; drawDragon(e, dt); continue;
      }
      if (!target) { s.stage = 'idle'; s.remaining = 2.5; s.travel = null; e.vulnUntil = 0; drawDragon(e, dt); continue; }
      e.aggro = true;
      e.guardianExposure ||= new Map();
      for(const m of targets) {
        const h=e.guardianExposure.get(m.id ?? m)||{frost:0,tick:0,still:0,last:m.pos.clone()};
        const speed=h.last.distanceTo(m.pos)/Math.max(.001,dt),distance=m.pos.distanceTo(e.pos);h.last.copy(m.pos);
        h.still=speed<.6?(h.still||0)+dt:0; // 立ち止まっている時間(主が技を選ぶ手がかり)
        h.frost=s.element==='ice'?frostExposure(h.frost,dt,speed,distance):0;
        h.tick+=dt;
        if(h.tick>=1) {
          h.tick=0;
          if(h.frost>=2.5)G.fx.damage(m,6,['ice'],e,{power:.5,silent:true});
          if(s.element==='void'&&distance<10&&s.stage!=='recover'&&s.stage!=='idle') {
            G.fx.damage(m,6,[],e,{silent:true});e.hp=Math.min(e.maxHp,e.hp+18);e.updateHpBar?.();
          }
        }
        e.guardianExposure.set(m.id ?? m,h);
      }
      s.frost = s.element === 'ice' ? targets.map(m=>({id:m.id,value:e.guardianExposure.get(m.id ?? m).frost})) : [];

      const d = target.pos.distanceTo(e.pos), canMove = !(e.stun > 0) && !e.status.bound;
      if (s.stage === 'idle') {
        const yaw = Math.atan2(e.pos.x - target.pos.x, e.pos.z - target.pos.z);
        const turn = Math.atan2(Math.sin(yaw - e.yaw), Math.cos(yaw - e.yaw));
        e.yaw += Math.max(-dt * 2.1, Math.min(dt * 2.1, turn));
        // 攻撃の合間に左右へ歩いて間合いを変える。巨体の旋回を瞬間移動にしない。
        if (canMove && s.remaining <= dragonDuration(s)) {
          if (!s.travel) {
            const forward = target.pos.clone().sub(e.leash || e.pos).setY(0).normalize();
            const side = new THREE.Vector3(forward.z, 0, -forward.x).multiplyScalar(s.turn % 2 ? 2.6 : -2.6);
            const goal = (e.leash || e.pos).clone().addScaledVector(forward, d < 11 ? -1.8 : 1.8).add(side);
            s.travel = { from: e.pos.toArray(), to: goal.toArray() };
          }
          const p = dragonProgress({ ...s, remaining: s.remaining - dt });
          const next = new THREE.Vector3(...s.travel.from).lerp(new THREE.Vector3(...s.travel.to), smooth(p));
          moveDragon(e, next.sub(e.pos));
        }
      }
      const atk = dragonAttack(s);
      if (s.stage === 'strike' && atk.dash && canMove) { // 突進する固有技: 構えた向きへ駆け抜ける
        moveDragon(e, new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw)).multiplyScalar(dt * atk.dash * (1 - dragonProgress(s) * .7)), atk.roam);
        s.origin = e.pos.toArray();
      }
      if (s.stage === 'strike' && atk.leap && canMove && dragonProgress(s) < atk.hitStart) { // 跳びかかる: 狙った所へ降りる
        const goal = new THREE.Vector3(...s.target), left = Math.max(.02, (atk.hitStart - dragonProgress(s)) * dragonDuration(s));
        moveDragon(e, goal.sub(e.pos).setY(0).multiplyScalar(Math.min(1, dt / left)), atk.roam);
        s.origin = e.pos.toArray();
      }
      if (s.stage === 'windup' && (s.move === 'lunge' || s.move === 'roar' || atk.track) && dragonProgress(s) < .6) { // 短い技は、構えの前半だけ相手を目で追う
        const want = Math.atan2(e.pos.x - target.pos.x, e.pos.z - target.pos.z), turn = Math.atan2(Math.sin(want - e.yaw), Math.cos(want - e.yaw));
        e.yaw += Math.max(-dt * 2.6, Math.min(dt * 2.6, turn)); s.yaw = e.yaw;
      }
      if (s.stage === 'strike' && s.move === 'lunge' && canMove) { // 噛みつき: 構えた向きへ一気に踏み込む
        moveDragon(e, new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw)).multiplyScalar(dt * 15 * (1 - dragonProgress(s))));
        s.origin = e.pos.toArray();
      }
      if (s.stage === 'windup' && s.move === 'slam' && dragonProgress(s) < .55 && canMove) {
        moveDragon(e, new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw)).multiplyScalar(dt * 2.3));
        s.origin = e.pos.toArray(); // 踏み込みの実位置から衝撃を出す。照準は追尾しない。
      }
      if (s.stage === 'strike' && atk.follow) e.yaw = s.yaw + spinTurn(atk, dragonProgress(s)); // 吐きながら回る・光の腕を回す: 体ごと回る
      const oldStage = s.stage, from = dragonProgress(s);
      const facing = Math.atan2(e.pos.x - target.pos.x, e.pos.z - target.pos.z), off = Math.abs(Math.atan2(Math.sin(facing - e.yaw), Math.cos(facing - e.yaw)));
      const ctx = { adaptive: !!G.dungeon?.arena, chanting: targets.some(m => m.chanting && m.pos.distanceTo(e.pos) < 12), behind: off > 2.1, still: e.guardianExposure.get(target.id ?? target)?.still || 0, rand: [Math.random(), Math.random(), Math.random(), Math.random(), Math.random(), Math.random()] };
      const event = stepDragon(s, e.stun > 0 && s.stage !== 'recover' ? 0 : dt, { health: e.hp / e.maxHp, distance: d, origin: e.pos.toArray(), target: target.pos.toArray(), yaw: e.yaw, ctx });
      if (event === 'strike' && dragonAttack(s).blink && canMove) { // 影渡り: 相手の向こう側へ現れ、振り向いて斬る
        const tp = new THREE.Vector3(...s.target), away = tp.clone().sub(e.pos).setY(0).normalize();
        G.fx?.burst(e.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), dragonProfile(s).color, 50, { speed: 5, up: 2, size: .6, life: .7 });
        moveDragon(e, tp.addScaledVector(away, 4.5).sub(e.pos), dragonAttack(s).roam);
        e.yaw = s.yaw = Math.atan2(e.pos.x - s.target[0], e.pos.z - s.target[2]); s.origin = e.pos.toArray();
        G.fx?.burst(e.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), dragonProfile(s).color, 50, { speed: 5, up: 2, size: .6, life: .7 });
      }
      if (event === 'windup') {
        e.dragonHit = new Set();
        if (s.phase === 2 && !e.dragonEnraged) { e.dragonEnraged = true; G.ui?.log('守護者が激昂した', '#ffb785'); }
      }
      if (oldStage === 'strike') {
        e.dragonHit ||= new Set();
        const to = s.stage === 'strike' ? dragonProgress(s) : 1;
        for (const m of targets) if (!e.dragonHit.has(m.id ?? m) && dragonHits(s, m.pos.toArray(), from, to) && lineOfSight(new THREE.Vector3(...s.origin), m.pos)) {
          e.dragonHit.add(m.id ?? m);
          const hitA = dragonAttack(s), fxk = hitA.effect;
          const dir = m.pos.clone().sub(e.pos).setY(0).normalize(); if (fxk === 'pull') dir.negate();
          G.fx.damage(m, hitA.damage * (1 + Math.min(.5, (G.floor - 1) * .025)), [s.element || 'fire'], e, { dir, power: fxk === 'knock' ? 1.7 : fxk === 'pull' ? 1.2 : .7, fx: fxk });
          // 固有技の追加の効き目: 鈍る・燃える・吸われる
          if (m.status && m.kind !== 'remote') {   // 離れた仲間には、通信で本人の側に掛ける
            if (fxk === 'slow') m.status.slow = { t: 3 };
            if (fxk === 'burn') m.status.burn = { t: 3, dps: 4, src: e };
          }
          if (fxk === 'drain') { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * .03); e.updateHpBar?.(); }
        }
      }
      e.vulnUntil = s.stage === 'recover' ? G.time + s.remaining : 0;
    }
    if (e.dragon) drawDragon(e, dt);
  }
  for (const id of visuals.keys()) if (!living.has(id)) disposeVisual(id);
  const boss = G.enemies.find(e => e.alive && e.type === 'dragon' && e.dragon && G.player?.alive && (!G.dungeon?.arena||G.dungeon.arena.phase==='active'&&insideArena(G.player.pos)) && e.pos.distanceTo(G.player.pos) < 42 && lineOfSight(e.pos, G.player.pos));
  const hud = document.getElementById('dragonHud');
  if (hud) {
    hud.classList.toggle('hidden', !boss);
    if (boss) {
      const s = boss.dragon; hud.dataset.stage = s.stage;
      document.getElementById('dragonName').textContent = `【${boss.final ? '終章・' : ''}${dragonProfile(s).name}】 ${dragonProfile(s).title}` + (s.phase === 2 ? ' ― 激昂' : '');
      document.getElementById('dragonHealth').style.width = `${Math.max(0, boss.hp / boss.maxHp * 100)}%`;
    }
  }
}
