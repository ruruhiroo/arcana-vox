// ローディング画面: 読み込みや迷宮づくりで待たせる間に出す(始める時の模型の読み込み、層を移る時)。
//   showLoading(見出し, 進み具合を返す関数)  /  hideLoading()
const TIPS = [
  '言霊は「対象 → 修飾 → 属性 → 出し方」の順に唱え、最後に魔法の名で締める。',
  '守護者が構えを解いた後の数秒は、与える傷が大きくなる。',
  '違う属性を、仲間と続けて当てると傷が増える(連携)。',
  '封印の大扉は、その層の魔物を鎮めるほど開きやすくなる。',
  '鍛冶場では炎の術が、墓所では聖の術が強まる。部屋の名は左上に出る。',
  '古文書は書庫や写本室の机の上に置かれていることが多い。',
  '詠唱の途中で声が途切れても、V を押している間は続きから唱えられる。',
  '魔導書(Tab)に書いた呪文は、手元の本にそのまま写る。右クリックで掲げて読める。',
  '言霊の欠片は守護者や精鋭が落とす。写本と秘伝書を綴る素材になる。',
  '囲まれたら氷で足を止め、まとめて雷で焼く。',
];
let el = null, raf = 0, prog = null, shownAt = 0;

function build() {
  el = document.createElement('div'); el.id = 'loading';
  el.innerHTML = `<style>
    #loading { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; background: radial-gradient(ellipse at 50% 45%, rgba(70,40,110,.38), transparent 60%), #050308; color: #e8dcc0; opacity: 0; transition: opacity .35s; pointer-events: auto; }
    #loading.on { opacity: 1; }
    #loading .lbox { text-align: center; width: min(620px, 86vw); }
    #loading .lring { width: 150px; height: 150px; margin: 0 auto 26px; opacity: .85; }
    #loading .lring svg { width: 100%; height: 100%; animation: ldSpin 14s linear infinite; }
    #loading .lring svg .in { transform-origin: 50% 50%; animation: ldSpin 9s linear infinite reverse; }
    @keyframes ldSpin { to { transform: rotate(360deg); } }
    #loading .lhead { font-size: 26px; letter-spacing: .32em; padding-left: .32em; color: #e0bd72; margin-bottom: 18px; }
    #loading .lbar { height: 2px; background: rgba(216,180,106,.18); margin: 0 auto 22px; width: 70%; overflow: hidden; }
    #loading .lbar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #8a6a2a, #f0d890); transition: width .25s; }
    #loading .lbar.wait i { width: 35%; animation: ldSlide 1.4s ease-in-out infinite; }
    @keyframes ldSlide { 0% { transform: translateX(-110%); } 100% { transform: translateX(300%); } }
    #loading .ltip { font-size: 15px; line-height: 1.9; color: #b8ac90; letter-spacing: .05em; min-height: 3.8em; }
  </style>
  <div class="lbox">
    <div class="lring"><svg viewBox="0 0 200 200" fill="none" stroke="#d8b46a" stroke-width=".9">
      <circle cx="100" cy="100" r="96"/><circle cx="100" cy="100" r="88" stroke-dasharray="2 5"/>
      <g class="in"><polygon points="100,22 167.5,61 167.5,139 100,178 32.5,139 32.5,61"/><polygon points="178,100 139,167.5 61,167.5 22,100 61,32.5 139,32.5"/><circle cx="100" cy="100" r="44" stroke-dasharray="7 3 1 3"/></g>
    </svg></div>
    <div class="lhead"></div>
    <div class="lbar"><i></i></div>
    <div class="ltip"></div>
  </div>`;
  document.body.appendChild(el);
}
function tick() {
  raf = requestAnimationFrame(tick);
  if (!el || !prog) return;
  const p = Math.max(0, Math.min(1, prog() ?? 0));
  el.querySelector('.lbar i').style.width = Math.round(p * 100) + '%';
}
// head = 見出し, progress = 0〜1 を返す関数(無ければ、行き来する帯を出す)
export function showLoading(head, progress = null) {
  if (!el) build();
  prog = progress; shownAt = performance.now();
  el.querySelector('.lhead').textContent = head;
  el.querySelector('.ltip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  const bar = el.querySelector('.lbar'); bar.classList.toggle('wait', !progress); if (!progress) bar.querySelector('i').style.width = '';
  el.style.display = 'grid';
  void el.offsetWidth; el.classList.add('on');
  cancelAnimationFrame(raf); if (progress) tick();
}
// 一瞬だけ出て消えると目障りなので、出してから少なくとも min ミリ秒は見せる
export function hideLoading(min = 500) {
  if (!el) return;
  const wait = Math.max(0, min - (performance.now() - shownAt));
  setTimeout(() => { cancelAnimationFrame(raf); prog = null; el.classList.remove('on'); setTimeout(() => { if (!el.classList.contains('on')) el.style.display = 'none'; }, 380); }, wait);
}
export const loadingShown = () => !!el && el.classList.contains('on');
