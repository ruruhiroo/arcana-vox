// NPC魔導師(協力モードの仲間 / PvPモードの好敵手)の思考
// 彼らも実際に詠唱し、読み上げる。プレイヤーの詠唱を「聞いて」対抗呪文を選ぶ。
import * as THREE from 'three';
import { G, rand } from './state.js';
import { compile, tokenize, WORD_BY_ID, speakable, ELEMENTS } from './lexicon.js';
import { flowDir, lineOfSight, moveWithCollision, bfs, cellOf, CELL, settleY } from './dungeon.js';
import { speakChant } from './voice.js';

const CHANTS = {
  fireLance: '紅蓮 穿槍 放て', iceLance: '氷獄 穿槍 放て', thunderLance: '雷霆 穿槍 放て', holyLance: '聖光 穿槍 放て',
  voidLance: '深淵 穿槍 放て', fireRain: '紅蓮 天雨 放て', iceRain: '氷獄 天雨 放て', thunderNova: '雷霆 円環 放て',
  holyRain: '聖光 天雨 放て', dualFire: '二重 紅蓮 穿槍 放て', maxThunder: '極大 雷霆 穿槍 放て',
  healAlly: '同胞に 聖光 癒息 放て', healSelf: '我に 癒息 放て', wardAlly: '同胞に 守護 放て', wardSelf: '我に 守護 放て',
  wall: '城壁 放て', iceWall: '氷獄 城壁 放て', haste: '我に 神速 放て', windNova: '颶風 円環 放て', trap: '刻印 紅蓮 放て',
};

// 弱点を突く術と汎用の術を混ぜ、同じ詠唱が続かないようにする
function bestAttack(target, dist, rng, lastKey) {
  const weak = target.T?.weak || [];
  const map = { fire: 'fireLance', ice: 'iceLance', thunder: 'thunderLance', holy: 'holyLance', void: 'voidLance' };
  const pool = ['fireLance', 'thunderLance', 'iceLance', 'voidLance', 'fireRain', 'dualFire'];
  for (const w of weak) if (map[w]) pool.push(map[w], map[w]);
  if (target.boss || (target.T && target.maxHp > 120)) pool.push('maxThunder', 'maxThunder', 'dualFire');
  if (target.isMage) pool.push('iceRain', 'iceRain');
  const choices = pool.filter(k => k !== lastKey);
  return choices[Math.floor(rng * choices.length)];
}

export class BotBrain {
  constructor(mage, role) {
    this.m = mage; this.role = role; // 'ally' | 'rival'
    this.think = rand(0, 0.5); this.chant = null; this.goal = null; this.goalField = null; this.strafe = rand(-1, 1);
    this.pitch = rand(0.9, 1.2);
  }
  enemiesOf() {
    const m = this.m;
    return [...G.enemies.filter(e => e.alive), ...G.mages.filter(o => o.alive && !o.downed && o.team !== m.team)];
  }
  startChant(key, target) {
    const text = CHANTS[key];
    const spell = compile(text, null);
    if (this.m.mp < spell.cost) return false;
    const dist = this.m.pos.distanceTo(G.player.pos);
    let vol = Math.max(0, 1 - dist / 30) * (lineOfSight(this.m.pos, G.player.pos) ? 1 : 0.4);
    // 仲間の詠唱は時々だけ声に出す(PvPの好敵手は読み合いのため毎回)
    if (this.role === 'ally') {
      if (G.time - (G.lastAllyVoice || -99) < 7 || Math.random() > 0.3) vol = 0;
      else G.lastAllyVoice = G.time;
    }
    this.lastKey = key;
    const dur = Math.max(0.6 + spell.words.length * 0.42, speakChant(speakable(spell), { volume: vol, pitch: this.pitch, rate: 1.25 }) * (vol ? 0.9 : 0));
    this.chant = { key, spell, target, t: dur };
    this.m.chantInterrupted = false;
    this.m.setChant(spell.words.map(id => WORD_BY_ID[id].text).join(' '), spell.words.length);
    G.hearChant?.(this.m, text);
    return true;
  }
  update(dt) {
    const m = this.m;
    if (!m.alive || m.downed) { this.chant = null; m.setChant(''); return; }
    // 詠唱進行
    if (this.chant) {
      const c = this.chant; c.t -= dt;
      if (c.target && c.target.alive) m.yaw = Math.atan2(-(c.target.pos.x - m.pos.x), -(c.target.pos.z - m.pos.z));
      if (m.chantInterrupted) { this.chant = null; m.setChant(''); m.chantInterrupted = false; G.ui?.floatText(m.pos, '詠唱失敗', '#ff8080'); return; }
      if (c.t <= 0) {
        this.chant = null; m.setChant('');
        const t = c.target;
        const origin = m.pos.clone().setY(1.5);
        let dir = new THREE.Vector3(-Math.sin(m.yaw), 0, -Math.cos(m.yaw));
        let point = m.pos.clone().add(dir.clone().multiplyScalar(6));
        if (t && t.alive) {
          const lead = t.vel ? t.vel.clone().multiplyScalar(origin.distanceTo(t.pos) / 26) : new THREE.Vector3();
          const tp = t.pos.clone().add(lead).setY(t.T?.fly ? 1.6 : 1.0);
          dir = tp.clone().sub(origin).normalize();
          dir.x += rand(-0.03, 0.03); dir.z += rand(-0.03, 0.03);
          point = t.pos.clone();
        }
        const targetId = c.spell.form ? null : (t ? t.id : null) || G.fx.pickDirectTarget(m, c.spell, dir);
        G.castSpell(m, c.spell, { origin: origin.toArray(), dir: dir.toArray(), point: point.toArray(), targetId });
      }
      this.moveToward(null, dt, 0.4);
      return;
    }
    this.think -= dt;
    if (this.think > 0) { this.moveGoal(dt); return; }
    this.think = rand(0.25, 0.45);
    const foes = this.enemiesOf();
    let near = null, nd = 24;
    for (const f of foes) { const d = f.pos.distanceTo(m.pos); if (d < nd && lineOfSight(m.pos, f.pos)) { nd = d; near = f; } }
    this.nearFoe = near;

    if (this.role === 'ally') {
      const friends = G.mages.filter(o => o.alive && o.team === m.team);
      const downed = friends.find(o => o.downed && o.pos.distanceTo(m.pos) < 22);
      if (downed) { if (downed.pos.distanceTo(m.pos) < 14 && this.startChant('healAlly', downed)) return; this.goal = downed.pos; return; }
      const hurt = friends.filter(o => !o.downed && o.hp / o.maxHp < 0.5).sort((a, b) => a.hp - b.hp)[0];
      if (hurt && Math.random() < 0.8 && this.startChant(hurt === m ? 'healSelf' : 'healAlly', hurt)) return;
      // 仲間が長い詠唱中で敵が近い → 守る
      const p = G.player;
      if (p.chanting && (p.chantWords || 0) >= 4 && near && near.pos.distanceTo(p.pos) < 9 && p.shield <= 0 && Math.random() < 0.7) {
        if (this.startChant('wardAlly', p)) { G.ui?.log(`${m.name}「詠唱を続けて！守る！」`); return; }
      }
      if (near && m.mp > 20) {
        const crowd = G.enemies.filter(e => e.alive && e.pos.distanceTo(near.pos) < 4).length;
        const key = crowd >= 3 ? (Math.random() < 0.5 ? 'fireRain' : 'holyRain') : (nd < 3.5 && Math.random() < 0.4 ? 'windNova' : bestAttack(near, nd, Math.random(), this.lastKey));
        if (this.startChant(key, near)) return;
      }
      // 追従
      const off = new THREE.Vector3(Math.sin(G.time * 0.3 + m.id.length) * 2.5, 0, 3).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
      this.goal = p.downed ? p.pos : p.pos.clone().add(off);
      if (p.pos.distanceTo(m.pos) > 30) { m.pos.copy(p.pos).add(off.normalize()); } // はぐれたら合流
    } else {
      if (m.hp < 40 && Math.random() < 0.6 && this.startChant('healSelf', m)) return;
      if (near && m.mp > 15) {
        const key = near.isMage ? (Math.random() < 0.3 ? 'iceRain' : bestAttack(near, nd, Math.random(), this.lastKey)) : bestAttack(near, nd, Math.random(), this.lastKey);
        if (this.startChant(key, near)) return;
      }
      if (!this.goal || m.pos.distanceTo(this.goal) < 3 || Math.random() < 0.01) {
        // 他の魔導師か、ランダムな部屋へ
        const rivals = G.mages.filter(o => o !== m && o.alive && o.team !== m.team);
        if (rivals.length && Math.random() < 0.55) this.goal = rivals[Math.floor(Math.random() * rivals.length)].pos;
        else { const r = G.dungeon.rooms[Math.floor(Math.random() * G.dungeon.rooms.length)]; this.goal = new THREE.Vector3((r.cx + 0.5) * CELL, 0, (r.cy + 0.5) * CELL); }
      }
    }
    this.moveGoal(dt);
  }
  // 相手の詠唱を聞いて対応する
  onHear(speaker, text) {
    const m = this.m;
    if (this.chant || !m.alive || m.downed || speaker === m) return;
    if (speaker.team === m.team) return;
    const d = speaker.pos.distanceTo(m.pos);
    if (d > 26 || !lineOfSight(speaker.pos, m.pos)) return;
    const toks = tokenize(text, null).map(t => t.id);
    const attack = toks.some(t => ['lance', 'rain', 'nova'].includes(t)) && toks.some(t => ELEMENTS[WORD_BY_ID[t].val]);
    if (!attack) return;
    this.heardT = (this.heardT || 0);
    if (G.time - this.heardT < 2.5) return;
    this.heardT = G.time;
    const r = Math.random();
    if (toks.includes('lance') && r < 0.55) this.startChant(Math.random() < 0.5 ? 'wall' : 'wardSelf', speaker);
    else if (toks.includes('rain') && r < 0.6) { this.strafe = Math.sign(rand(-1, 1)) * 2; this.dodgeT = 1.6; } // 雨は避ける
    else if (toks.includes('nova') && d < 6 && r < 0.6) { this.dodgeT = 1.4; this.dodgeFrom = speaker.pos.clone(); }
  }
  moveGoal(dt) {
    const m = this.m;
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      const away = this.dodgeFrom ? m.pos.clone().sub(this.dodgeFrom).setY(0).normalize() : new THREE.Vector3(Math.cos(m.yaw) * this.strafe, 0, -Math.sin(m.yaw) * this.strafe).normalize();
      this.moveToward(away, dt, 1.2); return;
    }
    let dir = null;
    if (this.nearFoe && this.role === 'rival') {
      const d = this.nearFoe.pos.distanceTo(m.pos);
      const to = this.nearFoe.pos.clone().sub(m.pos).setY(0).normalize();
      const side = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(this.strafe);
      dir = d > 12 ? to.add(side.multiplyScalar(0.5)) : d < 6 ? to.negate().add(side) : side;
      if (Math.random() < dt * 0.6) this.strafe = -this.strafe;
    } else if (this.goal) {
      const g = this.goal;
      if (g.distanceTo(m.pos) < 1.5) dir = null;
      else if (lineOfSight(m.pos, g)) dir = g.clone().sub(m.pos).setY(0).normalize();
      else {
        const [gx, gz] = cellOf(g); const key = gx + ',' + gz;
        if (this.fieldKey !== key) { this.fieldKey = key; this.goalField = bfs(G.dungeon.grid, gx, gz, G.dungeon.hgt); }
        dir = flowDir(this.goalField, m.pos);
      }
    }
    if (this.nearFoe) m.yaw = Math.atan2(-(this.nearFoe.pos.x - m.pos.x), -(this.nearFoe.pos.z - m.pos.z));
    else if (dir) m.yaw = Math.atan2(-dir.x, -dir.z);
    this.moveToward(dir, dt, 1);
  }
  moveToward(dir, dt, mul) {
    const m = this.m;
    const sp = 4.2 * m.speedMul * mul;
    const v = dir ? dir.clone().multiplyScalar(sp) : new THREE.Vector3();
    if (m.pushV) { v.add(m.pushV); m.pushV.multiplyScalar(Math.max(0, 1 - dt * 5)); if (m.pushV.length() < 0.2) m.pushV = null; }
    m.vel.lerp(v, Math.min(1, dt * 8));
    moveWithCollision(m.pos, m.vel.x * dt, m.vel.z * dt, m.radius, m.team);
    settleY(m.pos, dt);
  }
}
