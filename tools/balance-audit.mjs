import fs from 'node:fs';
import {compile,expandChant,callName,eloquence,chantCoverage} from '../public/js/lexicon.js';
import {payload} from '../public/js/spell-payload.js';
import {dragonHp,DRAGON_ATTACKS} from '../public/js/dragon-rules.js';
import {totals,tuneEquipment} from '../public/js/equipment.js';
const full=raw=>{const base=expandChant(raw);return base+' '+callName(compile(base,null));};
export function evaluate(raw,{short=false,affinity=null,equip={}}={}){
  const text=short?raw:full(raw),s=compile(text,null),eq=totals(equip);
  s.cost=Math.max(1,Math.round(s.cost*(1+eq.costMul)));
  s.power*=1+eloquence(text,null).bonus;
  const coverage=chantCoverage(text,s.words,eq.grace);s.power*=.5+.5*coverage;
  s.power*=1+eq.power+(s.elements.length?s.elements.reduce((n,e)=>n+(eq.elem[e]||0),0)/s.elements.length:0);
  if(affinity&&s.elements.includes(affinity))s.power*=1.2;
  const p=payload(s),count=s.dual?2:1,form=s.form==='rain'?1.26:s.form==='nova'?.85:!s.form?.85:1;
  return {text,tier:s.tierName,cost:s.cost,power:s.power,damage:s.target==='self'?0:p.dmg*count*form,heal:p.heal*count,ward:p.ward*count,valid:s.valid};
}
const list=['紅蓮','氷獄','雷霆','颶風','聖光','深淵'].flatMap(el=>['','穿槍','天雨'].map(form=>'汝に '+el+' '+form));
list.push('我に 癒息','我に 聖光 癒息','我に 守護','我に 聖光 守護','汝に 二重 紅蓮 穿槍','汝に 極大 紅蓮 穿槍','我に 転移','我に 浮遊','我に 探知','我に 浄化','我に 帰還');
const rows=list.map(raw=>({raw,...evaluate(raw)}));
const equipment={cover:tuneEquipment({stats:{power:.1}}),bookmark:tuneEquipment({stats:{regen:.2}}),cloak:tuneEquipment({stats:{maxHp:24}})};
const bare=evaluate('汝に 紅蓮 穿槍',{affinity:'fire'}),geared=evaluate('汝に 紅蓮 穿槍',{affinity:'fire',equip:equipment});
const round=x=>Math.round(x*10)/10;
const out=['# 呪文と初層ボスの数値監査','', '2026-11-11。実際の compile / eloquence / chantCoverage / payload / 装備合計を使用。初期熟練・秘伝なし・精霊なし。全力の名詠。表は無相性・誓いなし。単体全段命中の直撃値で、継続ダメージ・範囲内の人数・敵の防御は含めない。これは計算比較であり初見プレイの成功率ではない。','', '| 呪文 | 位階 | MP | 直撃 | 回復 | 障壁 | 直撃/MP |','|---|---|---:|---:|---:|---:|---:|',...rows.map(r=>`| ${r.raw} | ${r.tier} | ${r.cost} | ${round(r.damage)} | ${round(r.heal)} | ${round(r.ward)} | ${round(r.damage/r.cost)} |`),'','## 初層の想定',`- ボスHP ${dragonHp(1)}。炎の誓いの完全な穿槍は装備なし ${round(bare.damage)}、並の竜鱗装丁で ${round(geared.damage)}。全て反撃時間の1.6倍を取る場合 ${Math.ceil(dragonHp(1)/(geared.damage*1.6))}発（燃焼は除外）。`,`- 比較用装備3点は威力+17%、魔力回復+32%、最大HP+36。ランダムドロップ全てがこの組合せになるわけではない。`,`- 基準攻撃 ${Object.entries(DRAGON_ATTACKS).map(([k,a])=>k+' '+a.damage).join(' / ')}。装備HP136なら最大技58を2回受けても残るが、燃焼と他攻撃を続けて受ければ倒れる。`,'- 衛星は1回につき対象ごとに4回まで、二重で8回まで。再詠唱は前の衛星を更新。','- 転移は5秒の再使用待ち。失敗条件は魔力消費前に確認。帰還は近くに敵がいると使用不可、封印内から脱出不可。','- 火力・状態異常・範囲・命中難度は異なるため、効率を全属性で同じにはしない。',''];
fs.mkdirSync('design',{recursive:true});fs.writeFileSync('design/spell-balance-audit.md',out.join('\n'));console.log(JSON.stringify({rows:rows.length,bossHP:dragonHp(1),bare,geared},null,2));
