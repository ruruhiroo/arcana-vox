// 開発用の確かめ道具(ゲーム本体からは読み込まない)。ブラウザの検証から import('/js/dev.js') で使う。
const wait = ms => new Promise(r => setTimeout(r, ms));

// 記録3で迷宮へ入り、第1層の主の広間に立つ。画面の文字は消す
export async function arena({ dist = 17, side = 1, intro = false, quiet = true } = {}) {
  const G = window.G;
  if (!G?.player) {
    document.querySelectorAll('#slots > *')[2]?.click();
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('迷宮へ降りる'))?.click();
    for (let i = 0; i < 40 && !window.G?.player; i++) await wait(300);
    await wait(2500);
  }
  const g = window.G;
  document.getElementById('lobby')?.classList.add('hidden');
  if (g.floor === 0) { g.debugNextFloor(); for (let i = 0; i < 40 && !(g.floor >= 1 && g.dungeon?.arena && g.enemies.some(e => e.type === 'dragon')); i++) await wait(300); await wait(800); }
  const L = await import('./lexicon.js');
  for (const w of L.WORDS) g.known.add(w.id);
  const boss = g.enemies.find(e => e.type === 'dragon'), a = g.dungeon.arena;
  if (intro) { a.phase = 'open'; a.seenPhase = 'open'; } else { a.phase = 'active'; a.seenPhase = 'active'; a.activeAt = -99; }
  g.player.hp = g.player.maxHp; g.player.pos.set(boss.pos.x + side, boss.pos.y, boss.pos.z + dist); g.player.yaw = 0; g.player.pitch = 0.1;
  g.VM.setHeld('grimoire');
  if (quiet) for (const id of ['banner', 'log', 'goals', 'meieiFx', 'chantBox', 'micState', 'tut']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  g.debugAdvance(0.4);
  return { floor: g.floor, boss: boss.name, species: boss.body.userData.species, asset: boss.body.userData.asset };
}

// 言霊の核を並べた文で術を放つ(魔力は満たす)
export function cast(text, yaw = 0) {
  const g = window.G;
  g.player.castLock = 0; g.player.mp = g.player.maxMp; g.player.yaw = yaw;
  g.debugChant(text);
}

// 次の層へ(主が生きていても進む)
export async function next() {
  const g = window.G, f = g.floor;
  for (const e of g.enemies) if (e.guardian || e.type === 'dragon') { e.alive = false; e.hp = 0; if (e.root) e.root.visible = false; }
  g.debugNextFloor();
  for (let i = 0; i < 50 && !(g.floor > f && g.dungeon?.arena && g.enemies.some(e => e.type === 'dragon' && e.alive)); i++) await wait(300);
  await wait(1200);
  return g.floor;
}

// 第1層へ移る(記録は消さない)
export async function floor1() {
  const g = window.G;
  if (g.floor === 1) return 1;
  for (const e of g.enemies) if (e.guardian || e.type === 'dragon') { e.alive = false; e.hp = 0; if (e.root) e.root.visible = false; }
  g.floor = 0; g.resumeFloor = 0;
  g.debugNextFloor();
  for (let i = 0; i < 50 && !(g.floor === 1 && g.dungeon?.arena && g.enemies.some(e => e.type === 'dragon' && e.alive)); i++) await wait(300);
  await wait(1200);
  return g.floor;
}
