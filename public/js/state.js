// 全モジュールで共有するゲーム状態
export const G = {
  scene: null, camera: null, renderer: null,
  dungeon: null, floor: 1, mode: 'coop', // 'coop' | 'pvp'
  player: null, mages: [], enemies: [], projectiles: [], effects: [], pickups: [], obstacles: [], runes: [],
  net: null, isHost: true, time: 0, paused: false, uiOpen: false,
  known: new Set(), // 習得した言霊
};

export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
