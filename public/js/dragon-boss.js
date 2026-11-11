import { frostExposure, guardianHint } from './guardian-mechanics.js';
import { animateGuardian } from './guardian-model.js';
import { dragonProfile, dragonElement } from './dragon-profiles.js';
import * as THREE from 'three';
import { G } from './state.js';
import { lineOfSight, moveWithCollision, CLIMB } from './dungeon.js';
import { createDragonState, stepDragon, DRAGON_ROAM, dragonHits, dragonProgress, dragonDuration, dragonAttack, smooth } from './dragon-rules.js';
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
  Object.assign(e.body.userData, { stage: s.stage, move: s.move, progress: v.progress, travelProgress: s.stage === 'idle' && s.travel ? v.progress : -1 });
  if (e.root) { e.root.position.copy(e.pos); e.root.rotation.y = e.yaw; }
  const walking = G.isHost ? e.dragonWalking : v.lastPos && v.lastPos.distanceToSquared(e.pos) > dt * dt * .16;
  v.lastPos = e.pos.clone();
  animateGuardian(e.body.userData, G.time || 0, !!walking);
  e.body.updateWorldMatrix(true, true);
  updateDragonVisual(v, e, v.progress, dt);
}
function moveDragon(e, delta) {
  const next = e.pos.clone().add(delta);
  if (e.leash) {
    const offset = next.clone().sub(e.leash).setY(0);
    if (offset.length() > DRAGON_ROAM) next.copy(e.leash).add(offset.setLength(DRAGON_ROAM)).setY(e.pos.y);
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
      const targets = G.mages.filter(m => m.team === 'hero' && m.alive && !m.downed && !G.inSanctuary?.(m.pos) && m.pos.distanceTo(e.pos) < 42 && lineOfSight(e.pos, m.pos));
      const target = targets.sort((a, b) => a.pos.distanceToSquared(e.pos) - b.pos.distanceToSquared(e.pos))[0];
      e.dragon ||= createDragonState(e.dragonElement || dragonElement(G.floor, e.final));
      const s = e.dragon;
      e.dragonWalking = false;
      if (!target) { s.stage = 'idle'; s.remaining = 2.5; s.travel = null; e.vulnUntil = 0; drawDragon(e, dt); continue; }
      e.aggro = true;
      e.guardianExposure ||= new Map();
      for(const m of targets) {
        const h=e.guardianExposure.get(m.id ?? m)||{frost:0,tick:0,last:m.pos.clone()};
        const speed=h.last.distanceTo(m.pos)/Math.max(.001,dt),distance=m.pos.distanceTo(e.pos);h.last.copy(m.pos);
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
      if (s.stage === 'windup' && s.move === 'slam' && dragonProgress(s) < .55 && canMove) {
        moveDragon(e, new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw)).multiplyScalar(dt * 2.3));
        s.origin = e.pos.toArray(); // 踏み込みの実位置から衝撃を出す。照準は追尾しない。
      }
      const oldStage = s.stage, from = dragonProgress(s);
      const event = stepDragon(s, e.stun > 0 && s.stage !== 'recover' ? 0 : dt, { health: e.hp / e.maxHp, distance: d, origin: e.pos.toArray(), target: target.pos.toArray(), yaw: e.yaw });
      if (event === 'windup') {
        e.dragonHit = new Set();
        if (s.phase === 2 && !e.dragonEnraged) { e.dragonEnraged = true; G.ui?.log('守護者が激昂した', '#ffb785'); }
      }
      if (oldStage === 'strike') {
        e.dragonHit ||= new Set();
        const to = s.stage === 'strike' ? dragonProgress(s) : 1;
        for (const m of targets) if (!e.dragonHit.has(m.id ?? m) && dragonHits(s, m.pos.toArray(), from, to) && lineOfSight(new THREE.Vector3(...s.origin), m.pos)) {
          e.dragonHit.add(m.id ?? m);
          const dir = m.pos.clone().sub(e.pos).setY(0).normalize();
          G.fx.damage(m, dragonAttack(s).damage * (1 + Math.min(.5, (G.floor - 1) * .025)), [s.element || 'fire'], e, { dir, power: .7 });
        }
      }
      e.vulnUntil = s.stage === 'recover' ? G.time + s.remaining : 0;
    }
    if (e.dragon) drawDragon(e, dt);
  }
  for (const id of visuals.keys()) if (!living.has(id)) disposeVisual(id);
  const boss = G.enemies.find(e => e.alive && e.type === 'dragon' && e.dragon && G.player?.alive && e.pos.distanceTo(G.player.pos) < 42 && lineOfSight(e.pos, G.player.pos));
  const hud = document.getElementById('dragonHud');
  if (hud) {
    hud.classList.toggle('hidden', !boss);
    if (boss) {
      const s = boss.dragon; hud.dataset.stage = s.stage;
      document.getElementById('dragonName').textContent = `【${boss.final ? '終章・' : ''}${dragonProfile(s).name}】 ${dragonProfile(s).title}` + (s.phase === 2 ? ' ― 激昂' : '');
      document.getElementById('dragonHealth').style.width = `${Math.max(0, boss.hp / boss.maxHp * 100)}%`;
      const frost = s.frost?.find(x=>x.id===G.player.id)?.value || 0;
      document.getElementById('dragonCue').textContent = (s.stage === 'strike' ? dragonAttack(s).label + ' ｜ ' : '') + guardianHint(s, boss.pos.distanceTo(G.player.pos), frost);
    }
  }
}
