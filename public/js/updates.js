// 更新情報: 起動した時、まだ見ていない更新があればタイトル画面の上に出す。タイトル画面の「更新情報」からいつでも開ける。
// 更新を足す時は、UPDATES の先頭に一つ足す(id は他と重ならない文字なら何でもよい。新しい順)。
export const UPDATES = [
  {
    id: '2026-11-14i', date: '2026年11月14日', title: '精霊の子・誓いの術・魔物の振り・仲間と潜る窓',
    groups: [
      ['仲間の姿', [
        '他のプレイヤーの姿が、精霊の子になった。持ち主の色をした、角の取れた一つのかたまり。黒い粒の目が二つ、ときどき瞬き、よちよち歩き、大きな魔導書を抱えている',
        'タイトル画面の「姿を変える」(ゲーム中は Esc のメニュー)で、自分の姿を変えられる。体の形は皆同じ。体の色・服の色・目・腹の紋・光は、いつでも自由に変えられる。選んだ姿は仲間の画面にも同じに映る',
        '身に着ける物(つの・帽子・めがね・襟巻き・外套・羽など)は、宝箱や層の主の亡骸から拾うことがある。他の装備と同じく、全滅すると失う',
        '詠唱している仲間は、頭の上に浮かぶ結晶が回って強く光る',
      ]],
      ['仲間と潜る(マルチプレイ)', [
        'ゲームを始めた後でも、Esc のメニュー「仲間と潜る」から部屋を開く・部屋に入るを選べる(選ぶと迷宮の入口から始め直す。属性は入口の祭壇で誓う)',
        'つながっている間は、同じ窓に部屋コードが大きく出て、ボタンでコピーできる。仲間の一覧もここ',
        'タイトル画面の接続の選び方と、左上の仲間の表示を作り直した',
      ]],
      ['属性の効果を、一つずつ派手に', [
        '炎: 当たると爆発して周りも巻き込む / 氷: 4回に1回 氷漬け、次の一撃で砕けて傷が2倍 / 雷: 近くの敵へ連鎖',
        '風: 遠くへ吹き飛ばして動きを止める / 聖: 当てるたびに生命が戻る / 闇: 10回に1回、主以外の敵を即死させる',
      ]],
      ['装備の効果を、一つの品に一つ', [
        '装備は「生命の上限 +30」「炎の術の威力 +40%」のように、効果が一つだけ・切りのよい数になった',
        '効果の種類は八つ: 生命 / 魔力 / すべての術の威力 / 属性の術の威力 / 術に使う魔力 / 魔力が戻る速さ / 守護の障壁 / 足の速さ',
        '以前の版で持っていた装備は、同じ品の新しい効果に直る',
      ]],
      ['魔力と蘇生', [
        '魔力は毎秒3ずつ戻る(詠唱中も)。空から満ちるまで約33秒',
        'ふつうの術は軽い(10〜25)。大技の「極大」は魔力を100使い、威力は約5倍',
        '極大に二重や崩壊を重ねると魔力が150〜200要る。装備で魔力の上限を広げた者だけが撃てる',
        '倒れた仲間を起こすには魔力が100要る(そばで調べても、癒息でも)',
      ]],
      ['ユニークな品', [
        '数が増えるだけでなく、戦い方が変わる特別な品を9つ足した。層の主の亡骸(3回に1回)と、豪華な宝箱から出る',
        '爆ぜる栞: 倒した敵が爆発する / 吸命の指輪: 倒すたび生命が戻る / 二度咲きの手袋: 術がもう一度出る',
        '影武者の外套: 倒れる一撃を一度耐える / 主殺しの指輪: 主への傷1.5倍 / 博打の栞: 威力が毎回0.5〜3倍',
        '底なしの装丁: 魔力の上限+100 / 早口の首飾り: 魔力の回復3倍 / 雷雲の外套: 5秒ごとに雷が落ちる',
      ]],
      ['仲間と潜る時の不便を減らした', [
        '迷宮の入口が待機所になった。画面の上に部屋コードと、集まった仲間が出る。全員が北の門の前にそろったら、誰でも降りられる',
        '宝箱は一人ずつ開けられる(誰かが開けても、自分の分は残る)。古文書も今まで通り一人ずつ',
        '倒れた仲間は、そばで調べるだけで起こせる(癒息を唱えなくてもよい)',
        'はぐれたら、Esc →「仲間と潜る」の一覧から、仲間のそばへ跳べる(主との戦いの最中は不可、20秒に一度)',
      ]],
      ['言霊の集まり方', [
        '穿槍(槍となれ)は、最初から持つ言霊ではなくなった。古文書から覚える。いちばん出やすく、最初の一枚で半分以上、六枚までにはほぼ必ず出る',
        '古文書を増やした。3部屋に一つほど',
        '言霊に出やすさの順を付けた。出し方(穿槍 → 円環・天雨)、術を強くする言葉、攻めの効果が先に出て、探索の術や二つ目の属性は後になる',
        '仲間の誰かが持っている言霊は出にくく、仲間の全員が持っている言霊は出ない',
      ]],
      ['詠唱の聞き違いに強く', [
        '術にならなかった時、魔導書の中に近い呪文があれば、その呪文として放つ(威力は1割減)',
        '呼び名の聞き違い(ヒーディング → ヒーリング)は、自分の魔導書の呪文名へ寄せる',
        '聞き違いで精霊が拗ねる罰をなくした。術にならなかった時は、何と聞こえたかを出す',
      ]],
      ['1階層を長く', [
        '魔物を増やし、大扉の封印に要る討伐を層の7割にした。主に挑む前に、言霊と装備を整える時間ができる',
      ]],
      ['誓いの術(名前は仮)', [
        '属性に誓うと、攻撃の術とは別に、その属性だけの術を一つ授かる。「我に ○○」で唱える。再使用まで6秒',
        '炎: 火炎放射 / 氷: 凍波 / 雷: 雷歩 / 風: 突風 / 聖: 聖域 / 闇: 影渡り(転移)',
        '転移と探知(サーチ)は最初から持つ術ではなくなった。探知は古文書から覚える影の術',
      ]],
      ['魔物の攻撃', [
        '振り方が4種に: 小振り・大振り・薙ぎ払い・踏み込み突き。大振りほど痛く、振った後の硬直も長い',
        '傷を受けるのは、武器が届いた瞬間。振りかぶりの間に離れるか横へ回れば避けられる',
        '振りかぶりの間に怯ませると、振りが止まる',
      ]],
      ['見た目と演出', [
        '属性を選ぶ画面を作り直した。札に触れると、その属性の気配が画面に満ちる',
        '着弾の演出を属性ごとに強化(火球・氷の棘・落雷・風の渦・光の輪・闇の球・床の魔法陣)',
        '手作りの調度品に、染み・擦れ・煤けを付けた。炉やかまどは積み石に',
        '天井から吊る物(シャンデリア・鎖・吊るし肉)が、宙に浮いたり天井に埋まったりしないようにした',
      ]],
      ['遊びやすさ', [
        '魔物が赤や紫に縁取られて光るのをやめた(薄い輪郭だけ残る)',
        '声が変わる呪いは、掛かった本人には知らせない(気づくのは仲間)',
        '何が起きるか分かりにくい仕掛け(天球儀・金床・大釜)を外した。泉と石棺は残る',
        '道具を手に持つと名前が出る。初めて持つ種類は、何ができるか・どう使うかも出る',
        '音楽は、いったん鳴らさないようにした(設定 → 音 の「音楽」を上げれば鳴る)',
        'ローディング画面を追加。魔導書をめくった時の文字のちらつきと、BGMのこもりを直した',
      ]],
    ],
  },
];

const KEY = 'arcana_updSeen';
const CSS = `
#updBtn { position: absolute; left: 22px; bottom: 18px; z-index: 5; padding: 8px 16px; font: inherit; font-size: 14px; letter-spacing: .2em; color: #e0bd72; background: rgba(8,5,12,.72); border: 1px solid rgba(216,180,106,.4); cursor: pointer; transition: border-color .15s, box-shadow .15s; }
#updBtn:hover { border-color: #d8b46a; box-shadow: 0 0 18px rgba(216,180,106,.25); }
#updBtn i { display: inline-block; width: 8px; height: 8px; margin-left: 8px; border-radius: 50%; background: #ff6a4a; box-shadow: 0 0 8px #ff6a4a; vertical-align: middle; }
#updPanel { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 24px; box-sizing: border-box; background: rgba(3,2,6,.78); color: #e8dcc0; pointer-events: auto; }
#updPanel.hidden { display: none; }
#updPanel .box { width: min(980px, 100%); max-height: 100%; overflow: auto; background: linear-gradient(180deg, rgba(18,12,24,.97), rgba(8,5,12,.98)); border: 1px solid rgba(216,180,106,.45); box-shadow: 0 0 60px rgba(0,0,0,.8); padding: 26px 30px 22px; box-sizing: border-box; }
#updPanel h2 { margin: 0; color: #e0bd72; letter-spacing: .4em; font-size: 26px; font-weight: normal; }
#updPanel .when { margin: 6px 0 2px; color: #a89a7a; font-size: 13px; letter-spacing: .2em; }
#updPanel .ttl { margin: 0 0 16px; font-size: 19px; letter-spacing: .08em; color: #f4e6c4; }
#updPanel .cols { display: grid; grid-template-columns: 1fr 250px; gap: 26px; align-items: start; }
#updPanel h3 { margin: 14px 0 6px; font-size: 15px; font-weight: normal; letter-spacing: .25em; color: #d8b46a; border-bottom: 1px solid rgba(216,180,106,.2); padding-bottom: 4px; }
#updPanel h3:first-child { margin-top: 0; }
#updPanel ul { margin: 0; padding-left: 1.2em; font-size: 14.5px; line-height: 1.8; color: #d8ccb0; }
#updPanel figure { margin: 0; text-align: center; }
#updPanel figure img { width: 100%; border: 1px solid rgba(216,180,106,.3); background: #1a1a22; display: block; }
#updPanel figcaption { margin-top: 8px; font-size: 13px; color: #a89a7a; line-height: 1.6; }
#updPanel .foot { margin-top: 20px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
#updPanel .foot span { font-size: 13px; color: #8a7e66; }
#updPanel button.ok { font: inherit; font-size: 15px; letter-spacing: .3em; padding: 9px 30px; color: #1a120a; background: linear-gradient(180deg, #f0d890, #c89a48); border: none; cursor: pointer; }
#updPanel hr { border: none; border-top: 1px solid rgba(216,180,106,.2); margin: 22px 0; }
@media (max-width: 760px) { #updPanel .cols { grid-template-columns: 1fr; } #updPanel figure { max-width: 240px; margin: 0 auto; } }
`;
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const seen = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };

let panel = null, btn = null;
function entry(u) {
  const body = u.groups.map(([h, items]) => `<h3>${esc(h)}</h3><ul>${items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`).join('');
  const fig = u.img ? `<figure><img src="${u.img}" alt=""><figcaption>${esc(u.imgNote || '')}</figcaption></figure>` : '';
  return `<div class="when">${esc(u.date)}</div><div class="ttl">${esc(u.title)}</div><div class="cols" ${fig ? '' : 'style="grid-template-columns:1fr"'}><div>${body}</div>${fig}</div>`;
}
export function showUpdates() {
  if (!panel) {
    panel = document.createElement('div'); panel.id = 'updPanel';
    panel.innerHTML = `<div class="box"><h2>更 新 情 報</h2>${UPDATES.map(entry).join('<hr>')}<div class="foot"><span>タイトル画面の左下「更新情報」から、いつでも見直せる</span><button class="ok" type="button">閉じる</button></div></div>`;
    document.body.appendChild(panel);
    const close = () => { panel.classList.add('hidden'); try { localStorage.setItem(KEY, UPDATES[0].id); } catch {} btn?.querySelector('i')?.remove(); };
    panel.querySelector('.ok').onclick = close;
    panel.addEventListener('click', e => { if (e.target === panel) close(); });
    addEventListener('keydown', e => { if (e.code === 'Escape' && !panel.classList.contains('hidden')) { e.stopPropagation(); close(); } }, true);
  }
  panel.classList.remove('hidden');
}
// タイトル画面に「更新情報」の入口を置き、まだ見ていない更新があれば開く
export function initUpdates() {
  const lobby = document.getElementById('lobby'); if (!lobby || !UPDATES.length || btn) return;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const fresh = seen() !== UPDATES[0].id;
  btn = document.createElement('button'); btn.id = 'updBtn'; btn.type = 'button'; btn.innerHTML = '更新情報' + (fresh ? '<i></i>' : '');
  btn.onclick = showUpdates; lobby.appendChild(btn);
  if (fresh) showUpdates();
}
