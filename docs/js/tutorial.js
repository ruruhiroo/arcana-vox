// 手ほどき(チュートリアル): ひとつずつ課題を出し、達成したら次へ進む
import { G } from './state.js';
import { keyOf } from './controls.js';
import { sfx } from './audio.js';

const $ = id => document.getElementById(id);

function steps(h) {
  let baseSpells = 0; // 「呪文を書く」課題を始めた時の頁数
  const typedNote = h.voiceOK ? '' : '<br><small>(マイクが使えない環境では Enter で文字詠唱できる)</small>';
  return [
    { title: '歩く', text: `<kbd>${keyOf('forward')}</kbd><kbd>${keyOf('left')}</kbd><kbd>${keyOf('back')}</kbd><kbd>${keyOf('right')}</kbd> で歩いてみよう。`, done: () => G.stats.moved > 5 },
    { title: '見回す', text: 'マウスを動かして辺りを見回そう。', done: () => G.stats.looked > 3 },
    { title: '魔導書を掲げる', text: `両手で抱えているのが<b>魔導書</b>。<kbd>${keyOf('read')}</kbd> を押している間、顔の前に掲げて頁を読める。`, done: () => G.stats.read > 0.8 },
    { title: '頁をめくる', text: `<kbd>ホイール</kbd>(または <kbd>${keyOf('pageNext')}</kbd>/<kbd>${keyOf('pagePrev')}</kbd>)で頁をめくる。頁ごとに一つの呪文が書いてある。`, done: () => G.stats.flips >= 2 },
    {
      title: '灯火を唱える', enter: () => h.openPageOf('灯火'),
      text: `「灯火」の頁を開いた。<kbd>${keyOf('voice')}</kbd> を押しながら、右の頁の文を<b>最後まで声に出して</b>唱えよ。<br>核の語だけでは術は形を成さない。` + typedNote,
      done: () => G.lumens.length > 0,
    },
    {
      title: '魔法の作り方', enter: () => h.openPageOf('初級強化魔術'),
      text: `魔法は<b>言霊の組み合わせ</b>でできている。<br>
        ①<b>対象</b> — 汝に(敵) / 我に(自分) / 同胞に(味方)<br>
        ②<b>力</b> — 属性(紅蓮=炎…) か 効果(癒息=回復・覇気=威力アップ…)<br>
        ③<b>出し方</b> — 発射(穿槍): 目の前に撃ち出す ／ 設置(刻印): 地面に置く罠 ／ 衛星: 周りを巡る ／ 付与: 力を宿す<br>
        ④<b>唱える名</b> — 最後に叫ぶ魔法の名。ここで詠唱が終わり、術が放たれる<br>
        最初に使える出し方は<b>発射</b>だけ。他は迷宮の<b>古文書</b>で学ぶ。<br>まずは威力アップの魔法「初級強化魔術」を唱えよ。` + typedNote,
      done: () => h.empowered?.(),
    },
    {
      title: '名詠', enter: () => h.openPageOf(G.starterSpell || '初級炎魔術'),
      text: `出し方を付けない術は、狙った敵を<b>直接</b>撃つ。「穿槍」(ランス)を足すと発射になり、言霊が増えて<b>中級</b>になる。<br>詠唱が<b>文章として成立</b>すると威力が上がる。<br>・一節ずつ最後まで唱える(完唱)<br>・対象→修飾→属性→出し方→効果 の順(語順)<br>・最後に魔法の名(ファイア・ヒーリングなど)を呼んで締める(結句)<br>三つ揃えば<b style="color:#ffd76a">名詠</b>(威力+30%)。「初級炎魔術」を名詠で放て。<br><small>核の言葉だけ(「汝 紅蓮 ランス」)でも撃てるが、省いた分だけ弱まる(短縮魔術)。唱え切れた言霊には ✓ が付く。</small>` + typedNote,
      done: () => G.stats.eloquent >= 1,
    },
    { title: '魔物を討つ', enter: () => h.spawnFoe(), text: '前方に魔物が現れた。炎の術で倒せ。<br><small>詠唱中は無防備。距離を取ってから唱えよう。</small>', done: () => G.stats.kills >= 1 },
    {
      title: '呪文を書く', enter: () => { baseSpells = h.spellCount?.() || 0; },
      text: `<kbd>${keyOf('grimoire')}</kbd> で魔導書を開き「呪文の研究」→「＋ 新しい呪文」。<br>言霊の札を押して詠唱文を組み立て、<b>唱える名</b>(最後に叫ぶ名)を自由に付けて保存しよう。`,
      done: () => (h.spellCount?.() || 0) > baseSpells,
    },
    { title: '宝箱', enter: () => h.spawnChest(), text: `近くに宝箱が現れた。近づいて <kbd>${keyOf('interact')}</kbd> で開けよ。中から<b>装備</b>が出る。`, done: () => G.stats.chests >= 1 },
    { title: '装備する', text: `<kbd>${keyOf('inventory')}</kbd> で所持品を開き、手に入れた装備を身に着けよ。<br>装丁・栞・指輪・外套の四つの部位がある。`, done: () => h.equipped() },
    { title: '手ほどき完了', text: `以上で手ほどきは終わり。<br>迷宮の奥の<b>転移陣</b>(${keyOf('interact')})から次の層へ。古文書から新たな出し方(設置・衛星・付与…)や言霊を集め、魔導書(${keyOf('grimoire')})に自分だけの呪文を書き記せ。`, done: () => false, last: true },
  ];
}

export function startTutorial(hooks) {
  const list = steps(hooks);
  let i = -1, wait = 0;
  const el = $('tut');
  el.classList.remove('hidden');
  $('goals')?.classList.add('hidden'); // 手ほどき中は課題パネルを隠す(重なるため)
  function show() {
    const s = list[i];
    el.innerHTML = `<div class="tstep">手ほどき ${i + 1} / ${list.length}</div><h4>${s.title}</h4><p>${s.text}</p>${s.last ? '<button class="btn small" id="tutEnd">手ほどきを終える</button>' : ''}`;
    el.classList.remove('ok');
    if (s.last) $('tutEnd').onclick = () => stop();
  }
  function next() { i++; if (i >= list.length) return stop(); list[i].enter?.(); show(); }
  function stop() { el.classList.add('hidden'); G.tutorial = null; $('goals')?.classList.remove('hidden'); }
  next();
  G.tutorial = {
    update(dt) {
      if (i < 0 || i >= list.length) return;
      if (wait > 0) { wait -= dt; if (wait <= 0) next(); return; }
      if (list[i].done()) { el.classList.add('ok'); sfx.learn(); wait = 1.4; }
    },
    stop,
  };
}
