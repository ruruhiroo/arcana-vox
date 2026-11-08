// 手ほどき(チュートリアル): ひとつずつ課題を出し、達成したら次へ進む
import { G } from './state.js';
import { keyOf } from './controls.js';
import { sfx } from './audio.js';

const $ = id => document.getElementById(id);

function steps(h) {
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
      title: '名詠', enter: () => h.openPageOf('紅蓮'),
      text: `詠唱が<b>文章として成立</b>すると威力が上がる。<br>・一節ずつ最後まで唱える(完唱)<br>・対象→修飾→属性→形→効果→起句 の順(語順)<br>・最後に魔法の名(ファイア・ヒーリングなど)を呼んで締める(結句)<br>三つ揃えば<b style="color:#ffd76a">名詠</b>(威力+30%)。「紅蓮の槍」を名詠で放て。` + typedNote,
      done: () => G.stats.eloquent >= 1,
    },
    { title: '魔物を討つ', enter: () => h.spawnFoe(), text: '前方に魔物が現れた。紅蓮の槍で倒せ。<br><small>詠唱中は無防備。距離を取ってから唱えよう。</small>', done: () => G.stats.kills >= 1 },
    { title: '宝箱', enter: () => h.spawnChest(), text: `近くに宝箱が現れた。近づいて <kbd>${keyOf('interact')}</kbd> で開けよ。中から<b>装備</b>が出る。`, done: () => G.stats.chests >= 1 },
    { title: '装備する', text: `<kbd>${keyOf('inventory')}</kbd> で所持品を開き、手に入れた装備を身に着けよ。<br>装丁・栞・指輪・外套の四つの部位がある。`, done: () => h.equipped() },
    { title: '手ほどき完了', text: '以上で手ほどきは終わり。<br>迷宮の奥の<b>転移陣</b>(E)から次の層へ。古文書から新たな言霊を集め、魔導書(Tab)に自分だけの呪文を書き記せ。', done: () => false, last: true },
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
