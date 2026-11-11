// JSON-only sanctuary checkpoints. Never persist scene objects or timed callbacks.
export function captureCheckpoint(g,book,progress={}) {
  return {version:1,floor:g.floor,seed:g.dungeon.seed,position:g.player.pos.toArray(),yaw:g.player.yaw,pitch:g.player.pitch,hp:g.player.hp,mp:g.player.mp,
    book:JSON.parse(JSON.stringify(book)),grid:Array.from(g.dungeon.grid),explored:Array.from(g.explored||[]),
    enemies:g.enemies.filter(e=>e.alive).map(e=>({id:e.id,type:e.type,hp:e.hp,maxHp:e.maxHp,pos:e.pos.toArray(),summoner:e.summoner})),
    pickups:g.pickups.map(k=>({id:k.id,kind:k.kind,pos:k.pos.toArray(),data:{...k.data,noPick:undefined}})),
    arena:g.dungeon.arena?.phase,reserve:g.sanctuary?.reserve,run:{...g.run},floorStats:{...g.floorStats},progress};
}
export function validCheckpoint(c){return c?.version===1&&Number.isInteger(c.floor)&&c.floor>=0&&Number.isFinite(c.seed)&&Array.isArray(c.position)&&c.position.length===3&&c.position.every(Number.isFinite)&&Array.isArray(c.grid)&&c.grid.length===52*52&&Array.isArray(c.enemies)&&Array.isArray(c.pickups);}
