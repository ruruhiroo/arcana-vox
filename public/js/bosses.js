// 主(ボス)ごとの仕掛け
// 現在の主は詠灰竜。旧三種の仕掛けは互換用に残す。
//  鏡の魔導師(第3層): こちらの術を写し取って唱え返し、写した属性には強くなる
//  鐘の守護者(第6層): 鐘が鳴るたび、守護のない者の詠唱を乱す。鳴った直後は脆くなる
//  崩落の番人(第9層): 天井を崩す。赤い印の上から逃げよ
import * as THREE from 'three';
import { G } from './state.js';
import { rubbleBurst, shake, bigImpact } from './vfx.js';
import { sfx } from './audio.js';
import { updateDragons, clearDragons } from './dragon-boss.js';

export const BOSS_KINDS = { 3: 'dragon', 6: 'dragon', 9: 'dragon' };
export const BOSS_NAMES = { dragon: '【詠灰竜ヴォルグ】', mirror: '【鏡の魔導師】', bell: '【鐘の守護者】', collapse: '【崩落の番人】' };
export const bossKindFor = floor => BOSS_KINDS[((floor - 1) % 9) + 1] || null;

const marks = [];
// こちらが術を唱えた: 鏡の魔導師が写し取る
export function onPlayerCast(spell) {
  for (const e of G.enemies) {
    if (!e.alive || e.bossKind !== 'mirror' || !spell.elements.length) continue;
    if (e.pos.distanceTo(G.player.pos) > 30) continue;
    e.nextSpell = spell.text; e.resistElem = spell.elements[0];
    G.ui?.floatText(e.pos, '写し取った', '#e0c0ff');
  }
}

export function updateBosses(dt, hooks) {
  updateDragons(dt);
  for (const e of G.enemies) {
    if (!e.alive || !e.bossKind || !e.aggro) continue;
    e.bossT = (e.bossT ?? 4) - dt;
    if (e.bossKind === 'bell' && e.bossT <= 0) {
      e.bossT = 7;
      // 鐘の音: 広がる輪と、詠唱の乱れ
      bigImpact(e.pos.clone().setY(e.pos.y + 2.2), 0xffe0a0, 1.6, []);
      sfx.bell?.(e.pos); shake(0.4, e.pos);
      for (const m of G.mages) if (m.alive && m.chanting && !(m.shield > 0) && m.pos.distanceTo(e.pos) < 30) { m.chantInterrupted = true; G.ui?.floatText(m.pos, '鐘の音に乱された!', '#ffd76a'); }
      e.vulnUntil = (G.time || 0) + 2.5;
      G.ui?.floatText(e.pos, '余韻 — 今が好機', '#fff0b0');
    }
    if (e.bossKind === 'collapse' && e.bossT <= 0) {
      e.bossT = 5;
      for (const m of G.mages) {
        if (!m.alive || m.pos.distanceTo(e.pos) > 22) continue;
        const p = m.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
        const ring = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.2, 36), new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, (p.y || 0) + 0.05, p.z); G.scene.add(ring);
        marks.push({ ring, pos: p, t: 1.4 });
      }
    }
  }
  for (let i = marks.length - 1; i >= 0; i--) {
    const mk = marks[i]; mk.t -= dt;
    mk.ring.material.opacity = 0.5 + Math.sin(mk.t * 20) * 0.3;
    if (mk.t <= 0) {
      G.scene.remove(mk.ring); marks.splice(i, 1);
      rubbleBurst(mk.pos, 16);
      if (G.isHost) for (const t of [...G.mages, ...G.enemies]) if (t.alive && !t.bossKind && Math.hypot(t.pos.x - mk.pos.x, t.pos.z - mk.pos.z) < 2.2) G.fx.damage(t, 26, [], null, { melee: true });
    }
  }
}
export function clearBosses() { clearDragons(); for (const m of marks) { G.scene.remove(m.ring); m.ring.geometry.dispose(); m.ring.material.dispose(); } marks.length = 0; }
