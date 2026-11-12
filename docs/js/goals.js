// 目標: 各層の課題と、長い目で目指す深さ。課題を全部こなすと褒美が出る
import { G } from './state.js';
import { SPIRITS } from './spirits.js';

const $ = id => document.getElementById(id);
const DEPTH_GOALS = [3, 5, 8, 10, 15, 20];

// 封印の大扉を開くのに要る討伐数: その層の魔物の半分(上限18)。声を失ったものを鎮めるほど、封印は弱まる。
// クリアまでの目安(約2時間)は、主にこの数と守護者の体力で決まる
export const sealNeed = () => G.noSave ? 0 : Math.min(18, Math.ceil(0.5 * (G.dungeon?.spawns || []).filter(s => !s.boss).length));
export function setupGoals(floor, hooks) {
  const fs = G.floorStats = { scrolls: 0, chests: 0, kills: 0, boss: false };
  const d = G.dungeon;
  const killNeed = Math.max(1, sealNeed());
  const list = [];
  if (d.scrolls.length) list.push({ id: 'scroll', text: '古文書を読み、言霊を得る', need: 1, cur: () => fs.scrolls });
  if (d.chests.length) list.push({ id: 'chest', text: '宝箱を開ける', need: 1, cur: () => fs.chests });
  list.push({ id: 'kill', text: '魔物を鎮め、大扉の封印を弱める', need: killNeed, cur: () => fs.kills });
  if (G.enemies.some(e => e.boss)) list.push({ id: 'boss', text: 'この層の主を討つ', need: 1, cur: () => (fs.boss ? 1 : 0) });
  // 聖域は降り立った部屋にあるので、探す課題は無し
  if (false) list.push({ id: 'sanct', text: '聖域を見つける', need: 1, cur: () => (G.sanctuaryGreeted ? 1 : 0) });
  G.goals = { floor, list, rewarded: false, hooks, depth: DEPTH_GOALS.find(x => x > floor) || floor + 5 };
  renderGoals(true);
}

let lastKey = '';
export function updateGoals() {
  const gs = G.goals; if (!gs) return;
  const key = gs.list.map(g => Math.min(g.need, g.cur())).join(',') + '|' + (G.run?.keys || 0) + (G.run?.done ? 'd' : '') + '|' + (G.quest ? G.quest.cur + (G.quest.done ? 'd' : '') + G.quest.sid : '');
  if (key === lastKey) return;
  // 新しく達成した課題
  for (const g of gs.list) if (!g.done && g.cur() >= g.need) { g.done = true; gs.hooks.onGoal?.(g); }
  if (!gs.rewarded && gs.list.every(g => g.done)) { gs.rewarded = true; gs.hooks.onAllDone?.(); }
  renderGoals();
}

function renderGoals(force) {
  const gs = G.goals, el = $('goals'); if (!gs || !el) return;
  lastKey = gs.list.map(g => Math.min(g.need, g.cur())).join(',') + '|' + (G.run?.keys || 0) + (G.run?.done ? 'd' : '') + '|' + (G.quest ? G.quest.cur + (G.quest.done ? 'd' : '') + G.quest.sid : '');
  el.classList.toggle('hidden', !!G.tutorial);
  const run = G.run || { keys: 0 };
  const keys = [0, 1, 2].map(i => i < run.keys ? '●' : '○').join('');
  el.innerHTML = `<div class="big">${run.done ? '✔ 迷宮踏破 — 原初の魔導書を手にした' : `大目標: 第${G.FINAL_FLOOR}層に眠る『原初の魔導書』`}</div>${run.done ? '' : `<div class="keys">封印の鍵頁 <b>${keys}</b> <span>(第3・6・9層の主が持つ)</span></div>`}` + (G.mut ? `<div class="mut">層の変異: ${G.mut.name} — ${G.mut.desc}</div>` : '') + `<div class="gh">第${gs.floor}層の課題${gs.rewarded ? ' <b>達成</b>' : ''}</div>` +
    gs.list.map(g => { const c = Math.min(g.need, g.cur()); return `<div class="gi ${c >= g.need ? 'ok' : ''}"><i>${c >= g.need ? '✔' : '◇'}</i>${g.text}${g.need > 1 ? ` <span>${c}/${g.need}</span>` : ''}</div>`; }).join('') +
    (G.quest && !G.quest.done ? `<div class="quest" style="color:${SPIRITS[G.quest.sid].color}">◆ ${SPIRITS[G.quest.sid].name}の頼み: ${G.quest.text} <span>${G.quest.cur}/${G.quest.need}</span></div>` : '') +
    `<div class="gi next"><i>➤</i>${gs.floor === G.FINAL_FLOOR && !run.done ? '書庫の番人を討ち、封印を解け' : '転移陣で次の層へ'}</div>`;
  if (force) el.classList.add('fresh'), setTimeout(() => el.classList.remove('fresh'), 1200);
}
