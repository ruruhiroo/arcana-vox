// 属性を選ぶ画面(誓いの間)。六つの理が円環に並び、札に触れるとその属性の気配(炎の粉・雪・稲妻・風・光・闇の渦)が画面に満ちる。
// 選ぶと、その色の光が弾けて誓いの言葉が浮かび、それから旅が始まる。
//   askElement({ info, lore, second }) → 選んだ属性の id を返す Promise
const ORDER = ['fire', 'ice', 'thunder', 'wind', 'holy', 'void'];
const hex = c => '#' + c.toString(16).padStart(6, '0');
const rgb = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const R = (a, b) => a + Math.random() * (b - a);

const CSS = `
#elPick { position: fixed; inset: 0; z-index: 70; background: #040208; overflow: auto; pointer-events: auto; color: #e8dcc0; --elc: #d8b46a; }
#elPick canvas { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; }
#elPick .wrap { position: relative; min-height: 100%; display: grid; place-items: center; padding: 26px; box-sizing: border-box; }
#elPick .inner { width: min(1120px, 100%); }
#elPick h2 { margin: 0 0 6px; text-align: center; color: #e0bd72; letter-spacing: .5em; text-indent: .5em; font-size: 34px; text-shadow: 0 0 24px var(--elc); transition: text-shadow .4s; animation: epIn .9s ease both; }
#elPick .lead { margin: 0 0 22px; text-align: center; color: #b8ac90; font-size: 15px; letter-spacing: .08em; line-height: 1.8; animation: epIn .9s .15s ease both; }
#elPick .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
#elPick .card { all: unset; cursor: pointer; box-sizing: border-box; position: relative; overflow: hidden; padding: 18px 18px 16px; display: flex; flex-direction: column; gap: 8px;
  border: 1px solid rgba(216,180,106,.26); background: linear-gradient(180deg, rgba(14,10,20,.86), rgba(8,5,12,.9));
  transition: border-color .2s, transform .2s, box-shadow .25s, opacity .5s, filter .5s; animation: epCard .7s ease both; }
#elPick .card::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 0%, var(--c), transparent 62%); opacity: .1; transition: opacity .25s; pointer-events: none; }
#elPick .card::after { content: ''; position: absolute; left: -60%; top: 0; width: 40%; height: 100%; background: linear-gradient(100deg, transparent, rgba(255,255,255,.1), transparent); transform: skewX(-18deg); pointer-events: none; }
#elPick .card:hover, #elPick .card:focus-visible { border-color: var(--c); transform: translateY(-4px); box-shadow: 0 0 34px color-mix(in srgb, var(--c) 45%, transparent), inset 0 0 26px color-mix(in srgb, var(--c) 16%, transparent); }
#elPick .card:hover::before, #elPick .card:focus-visible::before { opacity: .34; }
#elPick .card:hover::after { animation: epSheen .7s ease; }
#elPick .sig { position: absolute; right: 12px; top: 10px; width: 74px; height: 74px; opacity: .5; transition: opacity .25s, transform .6s; }
#elPick .card:hover .sig { opacity: 1; transform: rotate(60deg) scale(1.08); }
#elPick .nm { font-size: 32px; letter-spacing: .14em; color: var(--c); text-shadow: 0 0 18px color-mix(in srgb, var(--c) 55%, transparent); }
#elPick .nm rt { font-size: 12px; letter-spacing: .2em; color: #a89a7a; }
#elPick .sub { font-size: 13px; letter-spacing: .3em; color: #a89a7a; }
#elPick .motto { font-size: 14.5px; line-height: 1.7; min-height: 3.4em; }
#elPick .desc { font-size: 13.5px; color: #cfc4a8; line-height: 1.75; }
#elPick .desc b { color: #d8b46a; }
#elPick.chosen .card:not(.pick) { opacity: 0; filter: blur(4px); transform: scale(.96); pointer-events: none; }
#elPick.chosen .card.pick { border-color: var(--c); box-shadow: 0 0 80px var(--c), inset 0 0 50px color-mix(in srgb, var(--c) 30%, transparent); transform: scale(1.04); }
#elPick.chosen h2, #elPick.chosen .lead { opacity: 0; transition: opacity .4s; }
#elPick .vow { position: fixed; inset: 0; display: grid; place-items: center; align-content: center; gap: 14px; pointer-events: none; opacity: 0; }
#elPick.chosen .vow { animation: epVow 2.1s ease forwards; }
#elPick .vow .t { font-size: 84px; letter-spacing: .5em; text-indent: .5em; color: #fff6dc; text-shadow: 0 0 30px var(--elc), 0 0 70px var(--elc); }
#elPick .vow .l { font-size: 22px; letter-spacing: .15em; color: #f4e6c4; text-shadow: 0 0 12px #000, 0 0 22px var(--elc); }
#elPick .white { position: fixed; inset: 0; background: var(--elc); opacity: 0; pointer-events: none; mix-blend-mode: screen; }
#elPick.chosen .white { animation: epFlash 2.1s ease forwards; }
@keyframes epIn { from { opacity: 0; transform: translateY(-10px); letter-spacing: .9em; } }
@keyframes epCard { from { opacity: 0; transform: translateY(26px) scale(.97); } }
@keyframes epSheen { to { left: 130%; } }
@keyframes epVow { 0% { opacity: 0; transform: scale(1.25); } 22% { opacity: 1; transform: scale(1); } 80% { opacity: 1; } 100% { opacity: 0; transform: scale(1.04); } }
@keyframes epFlash { 0% { opacity: 0; } 8% { opacity: .75; } 30% { opacity: .12; } 85% { opacity: .1; } 100% { opacity: .9; } }
@media (prefers-reduced-motion: reduce) { #elPick * { animation-duration: .01s !important; transition-duration: .01s !important; } }
`;

// 札の隅に置く、属性ごとの小さな紋
function sigil(el, col) {
  const s = (inner) => `<svg class="sig" viewBox="0 0 100 100" fill="none" stroke="${col}" stroke-width="1.6"><circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="39" stroke-dasharray="2 5"/>${inner}</svg>`;
  const poly = n => { let p = ''; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i / n * Math.PI * 2; p += `${(50 + Math.cos(a) * 34).toFixed(1)},${(50 + Math.sin(a) * 34).toFixed(1)} `; } return `<polygon points="${p}"/>`; };
  return s({
    fire: poly(3) + '<path d="M50 30 C62 46 60 56 50 70 C40 56 38 46 50 30Z"/>',
    ice: poly(6) + '<path d="M50 20V80M24 35L76 65M24 65L76 35"/>',
    thunder: poly(4) + '<path d="M56 22L38 54H52L44 80L64 44H50Z"/>',
    wind: poly(5) + '<path d="M28 44C44 32 60 34 70 44M30 58C46 48 62 50 72 60"/>',
    holy: poly(8) + '<path d="M50 24V76M32 44H68"/>',
    void: poly(7) + '<circle cx="50" cy="50" r="14" fill="' + col + '" fill-opacity=".25"/><circle cx="50" cy="50" r="22" stroke-dasharray="6 4"/>',
  }[el] || poly(6));
}

// 背景の粒: 属性ごとに動きが違う
function spawn(el, W, H) {
  const p = { x: R(0, W), y: R(0, H), vx: 0, vy: 0, life: R(1.5, 4), max: 0, size: R(1, 3), a: 1 };
  if (el === 'fire') { p.y = H + 10; p.vx = R(-20, 20); p.vy = R(-170, -60); p.size = R(1.5, 4); }
  else if (el === 'ice') { p.y = -10; p.vx = R(-25, 25); p.vy = R(30, 90); p.size = R(1.5, 3.5); p.life = R(4, 8); }
  else if (el === 'thunder') { p.vx = R(-260, 260); p.vy = R(-260, 260); p.life = R(0.12, 0.4); p.size = R(1, 2.2); }
  else if (el === 'wind') { p.x = -20; p.vx = R(380, 760); p.vy = R(-40, 40); p.life = R(1, 2.4); p.size = R(1, 2); p.len = R(40, 120); }
  else if (el === 'holy') { p.y = H + 10; p.vx = R(-8, 8); p.vy = R(-70, -25); p.size = R(1.5, 3.5); p.life = R(4, 8); }
  else if (el === 'void') { const a = R(0, 6.28), r = Math.hypot(W, H) * R(0.35, 0.6); p.x = W / 2 + Math.cos(a) * r; p.y = H / 2 + Math.sin(a) * r; p.ang = a; p.r = r; p.life = R(2.5, 5); }
  else { p.vx = R(-10, 10); p.vy = R(-22, -6); p.life = R(4, 9); p.size = R(1, 2.4); }
  p.max = p.life; return p;
}

export function askElement({ info, lore, second }) {
  return new Promise(resolve => {
    const ov = document.createElement('div'); ov.id = 'elPick';
    const els = ORDER.filter(e => info[e]);
    const card = (el, i) => {
      const I = info[el], L = lore[el], col = hex(I.color);
      return `<button class="card" data-el="${el}" style="--c:${col};animation-delay:${0.25 + i * 0.09}s">${sigil(el, col)}
        <div class="nm"><ruby>${I.name}<rt>${L.ruby}</rt></ruby></div>
        <div class="sub">${I.sub} の 理</div>
        <div class="motto">「${L.motto}」</div>
        <div class="desc"><b>威力</b> ${L.power}<br><b>撃てば</b> ${L.onHit}<br><b>性質</b> ${L.trait}<br><b>得手の術</b> ${second[el]}</div>
      </button>`;
    };
    ov.innerHTML = `<style>${CSS}</style><canvas></canvas>
      <div class="wrap"><div class="inner">
        <h2>誓 い を 立 て よ</h2>
        <p class="lead">この旅で得手とする属性を一つ選ぶ。選んだ属性の言霊と初級の術を授かり、旅の間は変えられない。<br>仲間と違う属性を選ぶと、続けて当てた時に傷が増える(連携)。</p>
        <div class="grid">${els.map(card).join('')}</div>
      </div></div>
      <div class="white"></div><div class="vow"><div class="t">誓 約</div><div class="l"></div></div>`;
    document.body.appendChild(ov);

    // --- 背景の絵 ---
    const cv = ov.querySelector('canvas'), g = cv.getContext('2d');
    let W = 0, H = 0, cur = null, mix = 0, col = [216, 180, 106], want = [216, 180, 106], parts = [], raf = 0, last = performance.now(), spin = 0, bolt = null, done = false, burstT = 0;
    const fit = () => { W = cv.width = innerWidth; H = cv.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    for (let i = 0; i < 70; i++) parts.push(spawn(null, innerWidth, innerHeight));
    const frame = now => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now; spin += dt;
      for (let i = 0; i < 3; i++) col[i] += (want[i] - col[i]) * Math.min(1, dt * 5);
      mix += ((cur ? 1 : 0) - mix) * Math.min(1, dt * 4);
      const c = `${col[0] | 0},${col[1] | 0},${col[2] | 0}`;
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#040208'; g.fillRect(0, 0, W, H);
      const bg = g.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.7);
      bg.addColorStop(0, `rgba(${c},${0.1 + mix * 0.16 + burstT * 0.5})`); bg.addColorStop(0.5, `rgba(${c},${0.03 + mix * 0.05})`); bg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      // 奥でゆっくり回る大きな魔法陣
      g.globalCompositeOperation = 'lighter';
      g.save(); g.translate(W / 2, H / 2); g.strokeStyle = `rgba(${c},${0.1 + mix * 0.14 + burstT * 0.5})`; g.lineWidth = 1.2;
      const RR = Math.min(W, H) * (0.46 + burstT * 0.5);
      for (const [k, w, n] of [[1, 0.05, 6], [0.8, -0.08, 3], [0.62, 0.12, 4]]) {
        g.save(); g.rotate(spin * w * (1 + mix)); g.beginPath(); g.arc(0, 0, RR * k, 0, 6.2832); g.stroke();
        g.beginPath(); for (let i = 0; i <= n; i++) { const a = i / n * 6.2832; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * RR * k, Math.sin(a) * RR * k); } g.stroke();
        g.setLineDash([3, 9]); g.beginPath(); g.arc(0, 0, RR * k * 0.93, 0, 6.2832); g.stroke(); g.setLineDash([]);
        g.restore();
      }
      g.restore();
      // 粒
      const el = cur, target = el ? (el === 'thunder' ? 60 : 150) : 70;
      while (parts.length < target) parts.push(spawn(el, W, H));
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.life -= dt;
        if (p.ang !== undefined) { p.ang += dt * 0.9; p.r -= dt * (90 + (1 - p.life / p.max) * 260); p.x = W / 2 + Math.cos(p.ang) * p.r; p.y = H / 2 + Math.sin(p.ang) * p.r; if (p.r < 12) p.life = 0; }
        else { p.x += p.vx * dt; p.y += p.vy * dt; if (el === 'fire' || el === 'ice') p.x += Math.sin(now / 500 + p.y * 0.02) * 18 * dt; }
        if (p.life <= 0 || p.x < -140 || p.x > W + 140 || p.y < -30 || p.y > H + 30) { parts.splice(i, 1); continue; }
        const k = Math.min(1, p.life / p.max * 3) * Math.min(1, (p.max - p.life) * 4);
        g.fillStyle = g.strokeStyle = `rgba(${c},${0.75 * k})`;
        if (p.len) { g.lineWidth = p.size; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.len, p.y - p.vy * 0.1); g.stroke(); }
        else { g.beginPath(); g.arc(p.x, p.y, p.size, 0, 6.2832); g.fill(); g.fillStyle = `rgba(${c},${0.12 * k})`; g.beginPath(); g.arc(p.x, p.y, p.size * 4, 0, 6.2832); g.fill(); }
      }
      // 雷: ときどき稲妻が走る
      if (el === 'thunder' && (!bolt || bolt.t <= 0) && Math.random() < dt * 2.2) { const pts = []; let x = R(W * 0.1, W * 0.9), y = 0; while (y < H) { pts.push([x, y]); x += R(-60, 60); y += R(30, 90); } bolt = { pts, t: 0.22 }; }
      if (bolt && bolt.t > 0) { bolt.t -= dt; const k = bolt.t / 0.22; g.strokeStyle = `rgba(255,255,255,${k})`; g.lineWidth = 2.2; g.beginPath(); bolt.pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.stroke(); g.strokeStyle = `rgba(${c},${k * 0.6})`; g.lineWidth = 9; g.stroke(); g.fillStyle = `rgba(${c},${k * 0.12})`; g.fillRect(0, 0, W, H); }
      // 聖: 上から差す光の筋
      if (el === 'holy') { for (let i = 0; i < 5; i++) { const x = W * (0.15 + i * 0.175) + Math.sin(spin * 0.4 + i) * 40, gr = g.createLinearGradient(x, 0, x + 120, H); gr.addColorStop(0, `rgba(${c},${0.1 * mix})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(x - 30, 0); g.lineTo(x + 30, 0); g.lineTo(x + 240, H); g.lineTo(x + 40, H); g.fill(); } }
      // 闇: 中心に光を呑む穴
      if (el === 'void') { const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) * 0.3); g.globalCompositeOperation = 'source-over'; gr.addColorStop(0, `rgba(0,0,0,${0.75 * mix})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
      if (burstT > 0) burstT = Math.max(0, burstT - dt * 0.7);
    };
    raf = requestAnimationFrame(frame);

    const hover = el => { if (done) return; if (cur !== el) { cur = el; parts = parts.slice(0, 20); } want = el ? rgb(info[el].color) : [216, 180, 106]; ov.style.setProperty('--elc', el ? hex(info[el].color) : '#d8b46a'); };
    ov.querySelectorAll('.card').forEach(b => {
      b.onmouseenter = b.onfocus = () => hover(b.dataset.el);
      b.onmouseleave = b.onblur = () => hover(null);
      b.onclick = () => {
        if (done) return; const el = b.dataset.el; hover(el); done = true; burstT = 1;
        b.classList.add('pick'); ov.classList.add('chosen'); ov.querySelector('.vow .l').textContent = `「${lore[el].vow || lore[el].motto}」`;
        // 選んだ色の粒が、中心から弾ける
        for (let i = 0; i < 220; i++) { const a = R(0, 6.28), v = R(120, 900); parts.push({ x: W / 2, y: H / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: R(0.6, 1.6), max: 1.6, size: R(1.5, 4) }); }
        setTimeout(() => { cancelAnimationFrame(raf); removeEventListener('resize', fit); ov.remove(); resolve(el); }, 2050);
      };
    });
  });
}
