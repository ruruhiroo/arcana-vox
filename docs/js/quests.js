// 精霊の頼みごと: ときどき精霊が話しかけ、挑戦を持ちかけてくる。果たすと縁が大きく深まり、言霊を授かる
import { G } from './state.js';
import { SPIRITS } from './spirits.js';

const TYPES = [
  { id: 'meiei', need: 2, text: (sp) => `私の名で、名詠を2度聞かせて`, line: '美しい詠唱が聞きたいの。' },
  { id: 'cast', need: 5, text: (sp) => `私の名を、5度呼んで`, line: 'もっと私を頼って。' },
  { id: 'kill', need: 3, text: (sp) => `私の力で、魔物を3体討って`, line: '力を見せてあげる。' },
  { id: 'chain', need: 3, text: (sp) => `言い損じずに、私の術を3度続けて`, line: '一度も噛まずに、よ。' },
];

export function offerQuest(hooks) {
  if (G.quest && !G.quest.done) return;
  const met = Object.keys(SPIRITS).filter(id => G.known?.has(id));
  if (!met.length) return;
  const sid = met[Math.floor(Math.random() * met.length)];
  const type = TYPES[Math.floor(Math.random() * TYPES.length)];
  const sp = SPIRITS[sid];
  G.quest = { sid, type: type.id, need: type.need, cur: 0, text: type.text(sp), done: false, hooks };
  hooks.onOffer?.(sp, `${type.line}${type.text(sp)}`);
}

// 出来事を伝える: 'cast' {spell, tier} / 'kill' {spell} / 'miss' {}
export function questEvent(kind, data = {}) {
  const q = G.quest; if (!q || q.done) return;
  const uses = data.spell && [...data.spell.elements, ...data.spell.effects].includes(q.sid);
  if (q.type === 'cast' && kind === 'cast' && uses) q.cur++;
  if (q.type === 'meiei' && kind === 'cast' && uses && data.tier === '名詠') q.cur++;
  if (q.type === 'kill' && kind === 'kill' && uses) q.cur++;
  if (q.type === 'chain') { if (kind === 'cast' && uses) q.cur++; if (kind === 'miss') q.cur = 0; }
  if (q.cur >= q.need) { q.done = true; q.hooks.onDone?.(SPIRITS[q.sid], q); }
}
