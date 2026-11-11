// The six visible slots are the complete carried inventory. Equipped gear lives
// on the character; each spare piece occupies one slot just like a consumable.
export const CARRY_SLOTS=6, STACK_CAP=5;
export const gearKey=it=>'gear_'+it.uid;
export const carryKeys=inv=>Object.keys(inv).filter(k=>Number.isFinite(inv[k])&&inv[k]>0);
export function carryRoom(inv,k){return inv[k]>0?Math.max(0,(k.startsWith('gear_')?1:STACK_CAP)-inv[k]):carryKeys(inv).length<CARRY_SLOTS?(k.startsWith('gear_')?1:STACK_CAP):0;}
export function addCarry(inv,k,n=1){const got=Math.max(0,Math.min(carryRoom(inv,k),Math.floor(n)));if(got)inv[k]=(inv[k]||0)+got;return got;}
export function carryOrder(inv,quick=[]){const order=Array(CARRY_SLOTS).fill(null),seen=new Set();quick.slice(0,CARRY_SLOTS).forEach((k,i)=>{if(inv[k]>0&&!seen.has(k)){order[i]=k;seen.add(k);}});for(const k of carryKeys(inv)){if(seen.has(k))continue;const i=order.indexOf(null);if(i<0)break;order[i]=k;seen.add(k);}return order;}
export function migrateCarry(inv,quick=[],bag=[]) {
  const source={...inv};for(const it of bag)source[gearKey(it)]=1;
  const order=[...new Set([...quick.filter(Boolean),...carryKeys(source)])], kept={},overflow=[];
  for(const k of order){const n=Math.max(0,Math.floor(source[k]||0)),got=addCarry(kept,k,n);if(n>got)overflow.push({key:k,count:n-got,gear:bag.find(it=>gearKey(it)===k)});}
  return {inv:kept,quick:carryOrder(kept,quick),bag:bag.filter(it=>kept[gearKey(it)]),overflow};
}
export function canCraft(inv,recipe){const after={...inv};for(const[k,n]of Object.entries(recipe.need)){if((after[k]||0)<n)return false;after[k]-=n;}return carryRoom(after,recipe.id)>0;}
