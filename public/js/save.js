// 記録(セーブ・ロード)。枠は3つ。枠ごとに「魔導書」と「旅の記録(到達した層・所持品・得意属性)」を持つ。
// 記録は層に着いた時に自動で残り、迷宮の入口と聖域ではメニューから手動でも残せる。
// 全滅するとその枠の旅は白紙に戻る(魔導書ごと)。
import { setBookKey } from './ui.js';

export const SLOTS = 3;
const OLD_BOOK = 'arcana_vox_grimoire_v1';
const bookKeyOf = n => `arcana_vox_grimoire_s${n}`;
const runKeyOf = n => `arcana_vox_run_s${n}`;
const get = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const del = k => { try { localStorage.removeItem(k); } catch {} };

// 以前の版の魔導書は枠1へ移す
(() => {
  try {
    const old = localStorage.getItem(OLD_BOOK);
    if (old && !localStorage.getItem(bookKeyOf(1))) localStorage.setItem(bookKeyOf(1), old);
    if (old) localStorage.removeItem(OLD_BOOK);
  } catch {}
})();

let slot = Math.min(SLOTS, Math.max(1, +(get('arcana_vox_slot') || 1)));
export const currentSlot = () => slot;
export function useSlot(n) { slot = n; set('arcana_vox_slot', n); setBookKey(bookKeyOf(n)); }
useSlot(slot);

// 枠の中身の要約(ロビーの表示用)
export function slotInfo(n) {
  const book = get(bookKeyOf(n)), run = get(runKeyOf(n));
  if (!book && !run) return null;
  return {
    floor: run?.floor || 0, best: run?.best || 0, affinity: run?.affinity || null, time: run?.time || 0, name: run?.name || '',
    words: book?.known?.length || 0, spells: book?.spells?.length || 0,
    gear: Object.keys(book?.equip || {}).length + (book?.bag?.length || 0),
  };
}
export const loadRun = () => get(runKeyOf(slot));
export function saveRun(run) {
  const prev = loadRun();
  set(runKeyOf(slot), { ...run, best: Math.max(run.floor || 0, prev?.best || 0), time: Date.now() });
}
// 全滅・枠を消す
export function clearRun() { del(runKeyOf(slot)); }
export function deleteSlot(n) { del(runKeyOf(n)); del(bookKeyOf(n)); }
