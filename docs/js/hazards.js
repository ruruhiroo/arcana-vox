// 地形の仕掛け: 油樽(紅蓮で爆ぜる)・水たまり(雷霆で感電、氷獄で凍る)・ひび割れた天井(強い術で崩れ落ちる)
// 術が着弾すると近くの仕掛けが反応する。引き金を引いた端末が効果を与え、ほかの端末には見た目だけ伝える
import * as THREE from 'three';
import { G } from './state.js';
import { bigImpact, rubbleBurst, shake } from './vfx.js';
import { sfx } from './audio.js';

const near = (h, pos, r) => Math.hypot(h.pos.x - pos.x, h.pos.z - pos.z) < r;
const targetsIn = (pos, r) => [...G.mages.filter(m => m.alive), ...G.enemies.filter(e => e.alive)].filter(t => Math.hypot(t.pos.x - pos.x, t.pos.z - pos.z) < r);

export function hazardImpact(pos, spell, local, hooks) {
  const hz = G.dungeon?.hazards; if (!hz) return;
  const els = spell.elements || [];
  hz.forEach((h, i) => {
    if (!h.alive) return;
    if (h.type === 'oilbarrel' && near(h, pos, 1.8) && (els.includes('fire') || (spell.power || 1) >= 1.3)) trigger(i, local, hooks, spell);
    else if (h.type === 'puddle' && near(h, pos, h.r + 0.6) && (els.includes('thunder') || els.includes('ice'))) trigger(i, local, hooks, spell, els.includes('thunder') ? 'shock' : 'freeze');
    else if (h.type === 'crack' && near(h, pos, 3.2) && (spell.breakPower || spell.power || 1) >= 1.1) trigger(i, local, hooks, spell);
  });
}

export function trigger(i, local, hooks, spell, mode) {
  const h = G.dungeon.hazards[i]; if (!h || !h.alive && h.type !== 'puddle') return;
  if (h.type === 'puddle' && h.busy > (G.time || 0)) return;
  if (local) G.net?.send({ t: 'hz', i, mode });
  const src = hooks.src;
  if (h.type === 'oilbarrel') {
    h.alive = false; h.group.visible = false;
    const p = h.pos.clone().setY(h.pos.y + 0.6);
    bigImpact(p, 0xff7020, 2.4, ['fire']); bigImpact(p.clone().add(new THREE.Vector3(0.5, 0.4, 0)), 0xffc040, 1.6, ['fire']);
    sfx.crumble?.(p); shake(0.9, p);
    G.solidsRemove?.(h);
    if (local) {
      for (const t of targetsIn(h.pos, 4.5)) G.fx.damage(t, 34, ['fire'], src, { dir: t.pos.clone().sub(h.pos).setY(0).normalize() });
      hooks.dig?.(h.pos, 3.2, 2);
    }
    hooks.log?.('油樽が爆ぜた!', '#ff9a50');
  } else if (h.type === 'puddle') {
    h.busy = (G.time || 0) + 2;
    if (mode === 'shock') {
      for (let k = 0; k < 6; k++) bigImpact(h.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * h.r * 1.6, 0.1, (Math.random() - 0.5) * h.r * 1.6)), 0xd0c0ff, 0.6, ['thunder']);
      if (local) for (const t of targetsIn(h.pos, h.r + 0.3)) { G.fx.damage(t, 14, ['thunder'], src, { power: 1.2 }); if (!t.isMage) t.stun = Math.max(t.stun || 0, 1.4); }
      hooks.log?.('水たまりに雷が走った!', '#d0c0ff');
    } else {
      h.mat.color.set(0xcfefff); h.mat.roughness = 0.4; h.frozenT = 6;
      bigImpact(h.pos.clone().setY(0.3), 0x9fe4ff, 1.0, ['ice']);
      if (local) for (const t of targetsIn(h.pos, h.r + 0.3)) { t.status.slow = { t: 5 }; if (!t.isMage) t.stun = Math.max(t.stun || 0, 2.2); }
      hooks.log?.('水たまりが凍りついた!', '#9fe4ff');
    }
  } else if (h.type === 'crack') {
    h.alive = false;
    setTimeout(() => {
      h.group.visible = false;
      const p = h.pos.clone(); rubbleBurst(p, 22); sfx.crumble?.(p);
      if (local) for (const t of targetsIn(h.pos, 2.6)) G.fx.damage(t, 30, [], src, { melee: true });
      hooks.log?.('天井が崩れ落ちた!', '#d8c8a8');
    }, 450);
  }
}

// 凍った水たまりはしばらくで融ける
export function updateHazards(dt) {
  for (const h of G.dungeon?.hazards || []) if (h.type === 'puddle' && h.frozenT > 0) { h.frozenT -= dt; if (h.frozenT <= 0) { h.mat.color.set(0x1a2a3a); h.mat.roughness = 0.05; } }
}
