import * as THREE from 'three';
import { G } from './state.js';
import { lineOfSight, moveWithCollision, CLIMB } from './dungeon.js';
import { sfx } from './audio.js';
import { createDragonState, stepDragon, DRAGON_ATTACKS, dragonHits } from './dragon-rules.js';

const visuals = new Map();
function disposeVisual(id) {
  const v = visuals.get(id); if (!v) return;
  G.scene.remove(v.group);
  v.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  visuals.delete(id);
}
export function clearDragons() { for (const id of visuals.keys()) disposeVisual(id); document.getElementById('dragonHud')?.classList.add('hidden'); }
function drawTelegraph(e) {
  const s = e.dragon, a = DRAGON_ATTACKS[s.move], key = `${s.serial}:${s.stage}`;
  let v = visuals.get(e.id);
  if (v?.key !== key) {
    disposeVisual(e.id);
    const group = new THREE.Group();
    v = { key, group }; visuals.set(e.id, v); G.scene.add(group);
    if (s.stage === 'windup' || s.stage === 'strike') {
      const pos = s.move === 'meteor' ? s.target : s.origin;
      const color = s.stage === 'strike' ? 0xffe0a0 : s.move === 'sweep' ? 0xffc24c : 0xff6348;
      // XY の扇を -X 回転すると、+Y が前方(-Z)になる。
      const start = s.move === 'breath' ? Math.PI / 2 - a.angle : 0;
      const arc = s.move === 'breath' ? a.angle * 2 : Math.PI * 2;
      for (const geo of [new THREE.CircleGeometry(a.range, 48, start, arc), new THREE.RingGeometry(a.range - 0.12, a.range, 48, 1, start, arc)]) {
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: geo.type === 'RingGeometry' ? 0.95 : 0.23, side: THREE.DoubleSide, depthWrite: false });
        const mesh = new THREE.Mesh(geo, mat); mesh.rotation.x = -Math.PI / 2; group.add(mesh);
      }
      group.position.set(pos[0], pos[1] + 0.08, pos[2]); group.rotation.y = s.yaw;
      if (G.player?.pos.distanceTo(e.pos) < 42 && s.stage === 'windup') {
        G.ui?.log(a.label, '#ffd18b'); sfx.growl?.(e.pos);
      }
      if (s.stage === 'strike') {
        e.attackAnim = 1;
        const hit = new THREE.Vector3(...pos).add(new THREE.Vector3(0, 0.7, 0));
        if (s.move === 'breath') {
          for (let i = 1; i <= 10; i++) G.fx.burst(hit.clone().add(new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw)).multiplyScalar(i * a.range / 10)), 0xff7020, 12, { speed: 3, size: 1.4, life: 0.9, up: 1 });
        } else G.fx.burst(hit, color, 70, { speed: 6, up: 3 });
        sfx.crumble?.(e.pos);
      }
    } else if (s.stage === 'recover' && G.player?.pos.distanceTo(e.pos) < 42) {
      G.ui?.floatText(e.pos.clone().add(new THREE.Vector3(0, 6, 0)), '逆鱗露出 — 今こそ詠唱！', '#9ffff0');
    }
  }
  if (s.stage === 'windup') v.group.children[0].material.opacity = 0.15 + 0.25 * (1 - s.remaining / a.warn);
  Object.assign(e.body.userData, { stage: s.stage, move: s.move });
}

export function updateDragons(dt) {
  const living = new Set();
  for (const e of G.enemies) {
    if (!e.alive || e.type !== 'dragon') continue;
    living.add(e.id);
    if (G.isHost) {
      const targets = G.mages.filter(m => m.team === 'hero' && m.alive && !m.downed && !G.inSanctuary?.(m.pos) && m.pos.distanceTo(e.pos) < 42 && lineOfSight(e.pos, m.pos));
      const target = targets.sort((a, b) => a.pos.distanceToSquared(e.pos) - b.pos.distanceToSquared(e.pos))[0];
      e.dragon ||= createDragonState();
      const s = e.dragon;
      if (!target) { s.stage = 'idle'; s.remaining = 2.5; e.vulnUntil = 0; drawTelegraph(e); continue; }
      e.aggro = true;
      const d = target.pos.distanceTo(e.pos);
      if (s.stage === 'idle') {
        e.yaw = Math.atan2(e.pos.x - target.pos.x, e.pos.z - target.pos.z);
        // 予兆に入ったら足と向きを止める。画面に示した安全地帯を後追いしない。
        if (d > 15 && !(e.stun > 0) && !e.status.bound) {
          const delta = target.pos.clone().sub(e.pos).setY(0).normalize().multiplyScalar(dt * (e.status.slow ? 1 : 2));
          const next = e.pos.clone().add(delta);
          if (!e.leash || next.distanceTo(e.leash) < 1.5) moveWithCollision(e.pos, delta.x, delta.z, e.radius, e.team, CLIMB);
        }
      }
      // 凍結/麻痺は予兆を延ばす。回復中は反撃の持ち時間を削らない。
      const event = stepDragon(s, e.stun > 0 && s.stage !== 'recover' ? 0 : dt, { health: e.hp / e.maxHp, distance: d, origin: e.pos.toArray(), target: target.pos.toArray(), yaw: e.yaw });
      if (event === 'windup' && s.phase === 2 && !e.dragonEnraged) {
        e.dragonEnraged = true; G.ui?.log('竜が翼を広げた — 竜星の予兆に備えよ', '#ffb785');
      }
      if (event === 'strike') {
        for (const m of targets) if (dragonHits(s, m.pos.toArray()) && lineOfSight(new THREE.Vector3(...s.origin), m.pos)) {
          // ホストのみ判定。remote は既存の dmg メッセージで所有者へ渡す。
          G.fx.damage(m, DRAGON_ATTACKS[s.move].damage * (1 + Math.min(0.5, (G.floor - 1) * 0.025)), [], e, {});
        }
      }
      e.vulnUntil = s.stage === 'recover' ? G.time + s.remaining : 0;
    }
    if (e.dragon) drawTelegraph(e);
  }
  for (const id of visuals.keys()) if (!living.has(id)) disposeVisual(id);
  const boss = G.enemies.find(e => e.alive && e.type === 'dragon' && e.dragon && G.player?.alive && e.pos.distanceTo(G.player.pos) < 42 && lineOfSight(e.pos, G.player.pos));
  const hud = document.getElementById('dragonHud');
  if (hud) {
    hud.classList.toggle('hidden', !boss);
    if (boss) {
      const s = boss.dragon; hud.dataset.stage = s.stage;
      document.getElementById('dragonName').textContent = boss.name + (s.phase === 2 ? ' ― 逆鱗' : '');
      document.getElementById('dragonHealth').style.width = `${Math.max(0, boss.hp / boss.maxHp * 100)}%`;
      document.getElementById('dragonCue').textContent = s.stage === 'recover'
        ? `逆鱗露出 ×1.6 — 長い詠唱の好機（${Math.ceil(s.remaining)}秒）`
        : s.stage === 'windup' || s.stage === 'strike' ? DRAGON_ATTACKS[s.move].label : '竜の動きを読め — 大技の後が詠唱の好機';
    }
  }
}
