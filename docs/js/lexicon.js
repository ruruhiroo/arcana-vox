// 言霊辞書と呪文コンパイラ
// 呪文 = [対象] × [修飾]* × [属性]* × [形] × [効果]* × [起句]
// 各語は「項」で、組み合わせで威力・形・対象・発動条件が決まる。

export const CAT = {
  element: '属性', form: '形', effect: '効果', target: '対象', mod: '修飾', trigger: '起句',
};

export const ELEMENTS = {
  fire:    { name: '火', color: 0xff6a1a, light: 0xff7a30, status: 'burn' },
  ice:     { name: '氷', color: 0x7fd8ff, light: 0x9fe4ff, status: 'slow' },
  thunder: { name: '雷', color: 0xd6c8ff, light: 0xc0b0ff, status: 'shock' },
  holy:    { name: '聖', color: 0xfff1b0, light: 0xfff0c0, status: 'purge' },
  void:    { name: '闇', color: 0x9a3cff, light: 0x8a40ff, status: 'drain' },
  wind:    { name: '風', color: 0x9effc8, light: 0xb0ffd8, status: 'push' },
};

// id, 表記, ルビ(読み上げ), 分類, 値, 消費, 認識別名, 謎めいた手掛かり, 真の意味
export const WORDS = [
  { id: 'fire', text: '紅蓮', ruby: 'ぐれん', cat: 'element', val: 'fire', cost: 8,
    alias: ['紅蓮', 'ぐれん', 'グレン', '焔', '炎', 'ほむら', 'ほのお', '火炎'],
    hint: '「赤き蓮は咲き、触れしものを灰へと還す」', meaning: '火属性。継続して焼く。粘獣に強い。' },
  { id: 'ice', text: '氷獄', ruby: 'ひょうごく', cat: 'element', val: 'ice', cost: 8,
    alias: ['氷獄', 'ひょうごく', 'コキュートス', 'こきゅーとす', 'コキュートス', '氷結', '氷'],
    hint: '「最果ての地獄は燃えていない。凍てついている」', meaning: '氷属性。命中した者の動きを鈍らせる。' },
  { id: 'thunder', text: '雷霆', ruby: 'らいてい', cat: 'element', val: 'thunder', cost: 9,
    alias: ['雷霆', 'らいてい', 'ライテイ', '雷電', '雷鳴', '稲妻', 'いかずち', '雷'],
    hint: '「天の怒りは一つに留まらず、隣へ跳ねる」', meaning: '雷属性。威力が高く近くの敵へ連鎖する。石像に強い。' },
  { id: 'holy', text: '聖光', ruby: 'せいこう', cat: 'element', val: 'holy', cost: 8,
    alias: ['聖光', 'せいこう', 'セイクリッド', 'せいくりっど', 'せいくりーど', '神聖', '聖なる', '聖'],
    hint: '「死してなお歩む者は、この光を最も恐れる」', meaning: '聖属性。不死者に2倍。癒・守護と合わせると効果1.5倍。' },
  { id: 'void', text: '深淵', ruby: 'しんえん', cat: 'element', val: 'void', cost: 9,
    alias: ['深淵', 'しんえん', 'アビス', 'あびす', '奈落', '闇'],
    hint: '「覗き込む者は、何かを奪い、何かを奪われる」', meaning: '闇属性。与えた傷の一部を自らの命に変える。' },
  { id: 'wind', text: '颶風', ruby: 'ぐふう', cat: 'element', val: 'wind', cost: 7,
    alias: ['颶風', 'ぐふう', 'テンペスト', 'てんぺすと', '暴風', '嵐', '風'],
    hint: '「風そのものは傷つけぬ。ただ、遠くへ運ぶ」', meaning: '風属性。威力は控えめだが大きく吹き飛ばす。速い。' },

  { id: 'lance', text: '穿槍', ruby: 'やり', cat: 'form', val: 'lance', cost: 6,
    alias: ['穿槍', 'せんそう', 'ランス', 'らんす', '槍', 'やり', '穿て', 'うがて'],
    hint: '「一点を穿つ。視線の先へ」', meaning: '形:投射。照準方向へ飛ぶ単体弾。' },
  { id: 'nova', text: '円環', ruby: 'えんかん', cat: 'form', val: 'nova', cost: 8,
    alias: ['円環', 'えんかん', 'サークル', 'さーくる', '環', '輪'],
    hint: '「中心に立つ者を軸に、世界は輪を描く」', meaning: '形:環。術者を中心とした範囲。' },
  { id: 'rain', text: '天雨', ruby: 'てんう', cat: 'form', val: 'rain', cost: 10,
    alias: ['天雨', 'てんう', 'レイン', 'れいん', '降り注げ', 'ふりそそげ', '雨', 'あめ'],
    hint: '「遅れて来るものは、広く降る」', meaning: '形:雨。照準地点に一拍遅れて広範囲。' },
  { id: 'wall', text: '城壁', ruby: 'じょうへき', cat: 'form', val: 'wall', cost: 10,
    alias: ['城壁', 'じょうへき', 'ウォール', 'うぉーる', '壁', 'かべ'],
    hint: '「拒むために立つ。敵の矢も、敵の足も」', meaning: '形:壁。前方に障壁を築き、飛来する魔弾と敵を阻む。' },

  { id: 'heal', text: '癒息', ruby: 'いやし', cat: 'effect', val: 'heal', cost: 10,
    alias: ['癒息', 'ゆそく', 'ヒール', 'ひーる', '癒やし', '癒し', 'いやし', '息吹', '癒'],
    hint: '「傷は閉じ、倒れた友は再び立つ」', meaning: '効果:回復。倒れた仲間を蘇生できる。' },
  { id: 'ward', text: '守護', ruby: 'しゅご', cat: 'effect', val: 'ward', cost: 10,
    alias: ['守護', 'しゅご', 'ガード', 'がーど', '護れ', 'まもれ', '護り', '守り'],
    hint: '「見えざる殻は、詠唱を乱す一撃をも受け止める」', meaning: '効果:守護。ダメージを吸収する障壁。詠唱妨害を防ぐ。属性を込めると反撃する。' },
  { id: 'haste', text: '神速', ruby: 'しんそく', cat: 'effect', val: 'haste', cost: 8,
    alias: ['神速', 'しんそく', 'アクセル', 'あくせる', '加速'],
    hint: '「時の流れから、半歩だけ外れる」', meaning: '効果:加速。移動速度と詠唱後の硬直を短縮。' },

  { id: 'light', text: '灯火', ruby: 'ともしび', cat: 'effect', val: 'light', cost: 6,
    alias: ['灯火', 'ともしび', 'ルミナ', 'るみな', '明かり', 'あかり', 'ライト'],
    hint: '「闇を払うのに、剣はいらない」', meaning: '効果:光源。宙に浮かぶ灯を生み、周囲を照らす(90秒)。対象に付き従い、穿槍・天雨・刻印なら照準地点に灯る。属性を込めるとその色に。' },
  { id: 'enemy', text: '汝に', ruby: 'なんじに', cat: 'target', val: 'enemy', cost: 0,
    alias: ['汝に', '汝', 'なんじ', '敵に', 'てきに'],
    hint: '「指し示すは、我と相容れぬもの」', meaning: '対象:敵のみに作用する。' },
  { id: 'self', text: '我に', ruby: 'われに', cat: 'target', val: 'self', cost: 0,
    alias: ['我に', '我が身', 'わがみ', 'われに'],
    hint: '「全ての力は、まず己に還る」', meaning: '対象:自分のみに作用する。(攻撃も自分に当たる)' },
  { id: 'ally', text: '同胞に', ruby: 'はらからに', cat: 'target', val: 'ally', cost: 0,
    alias: ['同胞に', '同胞', 'はらから', 'どうほう', '仲間に', 'なかまに', '仲間'],
    hint: '「血を分けずとも、背を預けし者へ」', meaning: '対象:味方のみに作用する。形が無ければ最も傷ついた味方へ。' },

  { id: 'dual', text: '二重', ruby: 'にじゅう', cat: 'mod', val: 'dual', cost: 4,
    alias: ['二重', 'にじゅう', 'ダブル', 'だぶる', '20', '二十', '双'],
    hint: '「二度唱えるより、一度で二つ」', meaning: '修飾:×2。術が二つ発現する。消費も2倍。' },
  { id: 'max', text: '極大', ruby: 'きょくだい', cat: 'mod', val: 'max', cost: 4,
    alias: ['極大', 'きょくだい', 'マキシマ', 'まきしま'],
    hint: '「器を超えて注げ。代償は倍」', meaning: '修飾:威力×1.8。消費×2。' },
  { id: 'eternal', text: '永劫', ruby: 'えいごう', cat: 'mod', val: 'eternal', cost: 4,
    alias: ['永劫', 'えいごう', 'エターナル', 'えたーなる', '永遠'],
    hint: '「終わりを遠ざける言葉」', meaning: '修飾:持続時間・範囲×1.6。' },
  { id: 'rune', text: '刻印', ruby: 'こくいん', cat: 'mod', val: 'rune', cost: 5,
    alias: ['刻印', 'こくいん', 'ルーン', 'るーん', '刻め'],
    hint: '「今ではない。敵が踏んだ、その時に」', meaning: '発動条件:照準地点に罠として刻み、敵が近づいた瞬間に発動。' },
  { id: 'swift', text: '迅', ruby: 'はやて', cat: 'mod', val: 'swift', cost: 3,
    alias: ['迅', 'はやて', 'ハヤテ', '疾風', 'しっぷう'],
    hint: '「速さは、重さを削って得る」', meaning: '修飾:弾速×1.8・雨の遅延短縮。威力×0.8。' },
  // 呪いの頁: 宝箱からだけ見つかる、強いが代償のある言霊
  { id: 'blood', text: '血誓', ruby: 'けっせい', cat: 'mod', val: 'blood', cost: 0, cursed: true,
    alias: ['血誓', 'けっせい', '血の誓い', 'ちのちかい'],
    hint: '「力は流れる血の量に等しい」', meaning: '呪い:威力×2。唱えるたびに生命の上限の12%を失う。' },
  { id: 'ruin', text: '崩壊', ruby: 'ほうかい', cat: 'mod', val: 'ruin', cost: 6, cursed: true,
    alias: ['崩壊', 'ほうかい', '崩れ去れ', 'くずれされ'],
    hint: '「壊すことにかけて、これに勝る言葉はない」', meaning: '呪い:壁を砕く力×2.2、威力×1.3。消費×1.5。着弾地点の近くにいると自分も巻き込まれる。' },

  { id: 'release', text: '放て', ruby: 'はなて', cat: 'trigger', val: 'release', cost: 0,
    alias: ['解き放て', '放て', 'はなて', 'ハナテ', '顕現せよ', '顕現', 'けんげん', 'リリース', 'りりーす', '発動'],
    hint: '「起句なき詠唱は、半分しか届かない」', meaning: '起句:詠唱を完成させる。無いと略式詠唱となり威力×0.7。' },
];

// 詠唱の一節 (ふりがな付き記法 {漢字|よみ})。短い「核」(紅蓮など)だけ唱えても通じる
const PHRASES_RUBY = {
  "fire": "{紅蓮|ぐれん}の{業火|ごうか}よ、{燃|も}え{盛|さか}れ",
  "ice": "{万象|ばんしょう}を{凍|い}てつかせよ、{氷獄|ひょうごく}の{吐息|といき}",
  "thunder": "{天|てん}を{裂|さ}く{雷霆|らいてい}よ、{轟|とどろ}け",
  "holy": "{穢|けが}れを{祓|はら}え、{聖光|せいこう}の{輝|かがや}き",
  "void": "{深淵|しんえん}より{這|は}い{出|い}でよ、{虚無|きょむ}の{顎|あぎと}",
  "wind": "{荒|あ}れ{狂|くる}え、{颶風|ぐふう}の{咆哮|ほうこう}",
  "lance": "{一条|いちじょう}の{穿槍|やり}となりて{貫|つらぬ}け",
  "nova": "{我|われ}を{軸|じく}とし{円環|えんかん}を{描|えが}け",
  "rain": "{天|てん}より{降|ふ}れ、{天雨|てんう}の{裁|さば}き",
  "wall": "{何人|なんぴと}も{通|とお}さぬ{城壁|じょうへき}よ、{聳|そび}えよ",
  "heal": "{癒息|いやし}の{恵|めぐ}みよ、{傷|きず}を{塞|ふさ}げ",
  "ward": "{見|み}えざる{守護|しゅご}の{盾|たて}よ、{包|つつ}み{込|こ}め",
  "haste": "{時|とき}を{置|お}き{去|ざ}りに、{神速|しんそく}の{翼|つばさ}",
  "enemy": "{仇|あだ}なす{汝|なんじ}に",
  "self": "{我|わ}が{身|み}に{宿|やど}れ",
  "ally": "{背|せ}を{預|あず}けし{同胞|はらから}に",
  "dual": "{二重|にじゅう}に{重|かさ}ねて",
  "max": "{器|うつわ}を{超|こ}えし{極大|きょくだい}の",
  "eternal": "{永劫|えいごう}に{続|つづ}く",
  "rune": "{地|ち}に{刻印|こくいん}を{刻|きざ}み",
  "swift": "{迅|はやて}の{如|ごと}く",
  "blood": "{我|わ}が{血|ち}を{贄|にえ}とし、{血誓|けっせい}を{結|むす}ぶ",
  "ruin": "{天地|あめつち}よ{崩壊|ほうかい}せよ、{全|すべ}て{崩|くず}れ{去|さ}れ",
  "release": "{今|いま}こそ{解|と}き{放|はな}て",
  "light": "{灯火|ともしび}よ、{冥|くら}き{路|みち}を{照|て}らし{出|だ}せ"
};
for (const w of WORDS) {
  const src = PHRASES_RUBY[w.id];
  w.core = w.text;                                         // 紅蓮
  w.text = src.replace(/\{([^|}]+)\|[^}]+\}/g, (_, k) => k);        // 紅蓮の業火よ、燃え盛れ
  w.yomi = src.replace(/\{[^|}]+\|([^}]+)\}/g, (_, r) => r);        // グレンのごうかよ、もえさかれ
  w.rubyHtml = src.replace(/\{([^|}]+)\|([^}]+)\}/g, (_, k, r) => `<ruby>${k}<rt>${r}</rt></ruby>`);
  w.alias.unshift(w.text);
  if (!w.alias.includes(w.core)) w.alias.push(w.core);
}

export const WORD_BY_ID = Object.fromEntries(WORDS.map(w => [w.id, w]));

// ---- 完唱判定: 核の語だけでなく、詠唱文を十分に読み上げたか ----
// 詠唱文を {漢字|よみ} の節に分け、核以外の節(業火・燃え・盛れ…)の半分以上が聞こえていれば「唱え切った」とみなす
const toHira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
for (const w of WORDS) {
  const src = PHRASES_RUBY[w.id], segs = [];
  const re = /\{([^|}]+)\|([^}]+)\}([ぁ-んー]*)/g; let m;
  while ((m = re.exec(src))) segs.push({ k: m[1], r: toHira(m[2]), ext: toHira(m[2] + m[3]), okuri: m[3] });
  const core = segs.find(g => w.core.startsWith(g.k)) || segs[0];
  w.parts = segs.filter(g => g !== core);
  w.need = Math.max(1, Math.ceil(w.parts.length * 0.5));
  w.vocab = [...new Set(segs.flatMap(g => [g.k, g.k + g.okuri, g.r, g.ext]).filter(x => x.length >= 2 || /[一-龯]/.test(x)))];
}
const partHeard = (s, g) => s.includes(g.k) || (g.r.length >= 2 && s.includes(g.r)) || (g.ext.length >= 2 && s.includes(g.ext))
  || (g.k.length >= 2 && s.includes(g.k[0]) && s.includes(g.k[1])) // 漢字の取り違え(業火→豪華 など)をある程度許す
  || (g.r.length >= 3 && s.includes(g.r.slice(0, 2)));
// 詠唱文を「ふりがな付きの断片」に分ける (頁に描くため): [{ t: '紅蓮', r: 'グレン' }, { t: 'の' }, ...]
const RUBY_SRC = WORDS.map(w => ({ t: w.text, src: PHRASES_RUBY[w.id] }))
  .concat(WORDS.map(w => ({ t: w.core, src: '{' + w.core + '|' + w.ruby + '}' })))
  .sort((a, b) => b.t.length - a.t.length);
const PIECE_RE = /\{([^|}]+)\|([^}]+)\}|([^{])/g;
export function rubyPieces(text) {
  const out = []; let i = 0;
  while (i < text.length) {
    const hit = RUBY_SRC.find(x => x.t && text.startsWith(x.t, i));
    if (hit) {
      let m; PIECE_RE.lastIndex = 0;
      while ((m = PIECE_RE.exec(hit.src))) out.push(m[1] ? { t: m[1], r: m[2] } : { t: m[3] });
      i += hit.t.length;
    } else out.push({ t: text[i++] });
  }
  return out;
}
// 唱え切れていない言霊を返す
// grace: 装備(栞)による詠唱の補助。必要な節の割合が下がる
export function chantGaps(rawText, ids, grace = 0) {
  const s = toHira(normalize(rawText));
  const ratio = Math.max(0.15, 0.34 - grace);
  return ids.filter(id => {
    const w = WORD_BY_ID[id];
    if (s.includes(normalize(w.text))) return false;
    return w.parts.filter(g => partHeard(s, g)).length < Math.max(1, Math.ceil(w.parts.length * ratio));
  });
}
// ---- 名詠: 詠唱が「文章として成立」しているほど術は強まる ----
// 完唱: どの言霊も一節を最後まで唱えた / 語順: 対象→修飾→属性→形→効果→起句 の順 / 結句: 起句(今こそ解き放て)で締めた
const ORDER = { target: 0, mod: 1, element: 2, form: 3, effect: 4, trigger: 5 };
export function eloquence(rawText, known) {
  const s = toHira(normalize(rawText));
  const toks = tokenize(rawText, known).filter(t => t.known);
  if (toks.length < 2) return { tier: null, bonus: 0, marks: [] };
  const ws = toks.map(t => WORD_BY_ID[t.id]);
  const complete = ws.every(w => s.includes(normalize(w.text)) || w.parts.every(g => partHeard(s, g)));
  let ordered = true;
  for (let i = 1; i < ws.length; i++) if (ORDER[ws[i].cat] < ORDER[ws[i - 1].cat]) ordered = false;
  const closed = ws[ws.length - 1].cat === 'trigger' || compile(rawText, known).calledByName;
  const marks = [complete && '完唱', ordered && '語順', closed && '結句'].filter(Boolean);
  const tier = marks.length === 3 ? '名詠' : marks.length === 2 ? '整詠' : null;
  return { tier, bonus: tier === '名詠' ? 0.3 : tier === '整詠' ? 0.12 : 0, marks, complete, ordered, closed };
}

export const STARTER_WORDS = ['fire', 'lance', 'heal', 'ward', 'light', 'enemy', 'self', 'ally', 'release'];

// ---- 正規化: カタカナ→ひらがな、空白・記号除去 ----
export function normalize(s) {
  return (s || '')
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s、。，．,.!！?？「」『』・〜~\-]/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase();
}

const ALIAS_TABLE = [];
for (const w of WORDS) for (const a of w.alias) ALIAS_TABLE.push({ n: normalize(a), id: w.id });
ALIAS_TABLE.sort((a, b) => b.n.length - a.n.length);

// 短い核で書かれた呪文(古い保存データ等)を、正式な詠唱文に書き直す
export function expandChant(text) {
  const ids = tokenize(text).map(t => t.id);
  return ids.length ? ids.map(id => WORD_BY_ID[id].text).join(' ') : text;
}

// 音声/テキストから言葉を抽出 (知らない言葉は効力を持たない)
export function tokenize(text, known) {
  const s = normalize(text);
  const out = [];
  let i = 0;
  while (i < s.length) {
    let hit = null;
    for (const a of ALIAS_TABLE) { if (a.n && s.startsWith(a.n, i)) { hit = a; break; } }
    if (hit) {
      out.push({ id: hit.id, known: !known || known.has(hit.id) });
      i += hit.n.length;
    } else i++;
  }
  return out;
}

// ---- 聞き違いの救済(あいまい一致) ----
// 音声認識の結果は「紅連」「ぐれむ」「ランスー」のように少しずれることがある。
// 完全一致しなかった部分を、言霊の表記・読みと音の近さで比べ、十分似ていればその言霊とみなす。
const DAKUTEN = { が: 'か', ぎ: 'き', ぐ: 'く', げ: 'け', ご: 'こ', ざ: 'さ', じ: 'し', ず: 'す', ぜ: 'せ', ぞ: 'そ', だ: 'た', ぢ: 'ち', づ: 'つ', で: 'て', ど: 'と',
  ば: 'は', び: 'ひ', ぶ: 'ふ', べ: 'へ', ぼ: 'ほ', ぱ: 'は', ぴ: 'ひ', ぷ: 'ふ', ぺ: 'へ', ぽ: 'ほ', ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お', ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', っ: '', ゔ: 'う' };
// 濁点・小書き・長音の揺れを吸収した「音の骨格」
// 「ひーる」「ひいる」→ひる、語末の「む」は「ん」の聞き違いとして扱う(ぐれむ→ぐれん)
const VOWEL = /[あいうえお]/;
const skeleton = s => {
  const cs = [...s.replace(/む$/, 'ん')].map(c => DAKUTEN[c] ?? c).filter(c => c && c !== 'ー');
  return cs.filter((c, i) => !(i > 0 && VOWEL.test(c) && !VOWEL.test(cs[i - 1]))).join('');
};

function similarity(a, b) {
  if (!a || !b) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

// 比較対象: 3音以上の「かな読み」だけ(短い語や漢字は日常語と誤爆しやすいので除外)
const KANA = /^[ぁ-ゟー]+$/;
const FUZZY_FORMS = [];
for (const w of WORDS) {
  const forms = new Set([normalize(w.text), normalize(w.ruby), ...w.alias.map(normalize)]);
  for (const f of forms) if (KANA.test(f) && f.length >= 3 && skeleton(f).length >= 2) FUZZY_FORMS.push({ id: w.id, f, sk: skeleton(f) });
}

function fuzzyIn(span) {
  const found = [];
  let i = 0;
  while (i < span.length - 2) {
    let best = null;
    for (const c of FUZZY_FORMS) {
      for (let L = Math.max(3, c.f.length - 1); L <= c.f.length + 1; L++) {
        const win = span.slice(i, i + L);
        if (win.length < 3 || !KANA.test(win)) continue;
        // 骨格(濁点・長音などを無視した音)で比べる。3音の語は骨格の完全一致、それ以上は1〜2音の違いまで許す
        const sim = similarity(skeleton(win), c.sk);
        const need = c.sk.length <= 3 ? 1 : c.sk.length <= 5 ? 0.75 : 0.7;
        if (sim >= need && (!best || sim > best.sim || (sim === best.sim && L > best.L))) best = { id: c.id, sim, L };
      }
    }
    if (best) { found.push(best); i += best.L; } else i++;
  }
  return found;
}

// 音声入力を言霊の正式表記に寄せる。例: 「ぐれむの らんすー はなて」→「紅蓮 穿槍 放て」
export function canonicalize(text) {
  const s = normalize(text);
  const out = [];
  let i = 0, rest = '';
  const flush = () => { if (rest.length >= 2) for (const f of fuzzyIn(rest)) out.push({ id: f.id, fuzzy: true }); rest = ''; };
  while (i < s.length) {
    let hit = null;
    for (const a of ALIAS_TABLE) { if (a.n && s.startsWith(a.n, i)) { hit = a; break; } }
    if (hit) { flush(); out.push({ id: hit.id }); i += hit.n.length; }
    else rest += s[i++];
  }
  flush();
  return { text: out.map(t => WORD_BY_ID[t.id].text).join(' '), tokens: out, fuzzy: out.some(t => t.fuzzy) };
}

// ---- 魔法の名(結句) ----
// 属性(または効果)と形から決まる。詠唱の最後にこの名を呼ぶと術が完成する
const CALL_EL = { fire: ['ファイア', 'ファイヤ', 'ファイヤー', 'ファイアー'], ice: ['アイス', 'アイスー'], thunder: ['サンダー', 'サンダ'], holy: ['ホーリー', 'ホーリ', 'ホリー'], void: ['ダーク', 'ダアク'], wind: ['ウィンド', 'ウインド', 'ウィンドー'] };
const CALL_FORM = { lance: ['ランス', 'ランスー'], nova: ['ノヴァ', 'ノバ', 'ノーヴァ'], rain: ['レイン', 'レーン'], wall: ['ウォール', 'ウオール', 'ウォル'] };
const CALL_EFF = { heal: ['ヒーリング', 'ヒール', 'ヒーリン'], ward: ['プロテクション', 'プロテクト'], haste: ['ヘイスト', 'ヘースト'], light: ['ライト', 'ライトー'] };
function callParts(spell) {
  if (spell.elements.length) return [CALL_EL[spell.elements[0]], spell.form ? CALL_FORM[spell.form] : null];
  if (spell.effects.length) return [CALL_EFF[spell.effects[0]], spell.form && spell.form !== 'nova' ? CALL_FORM[spell.form] : null];
  return null;
}
export function callName(spell) { const p = callParts(spell); return p ? p[0][0] + (p[1] ? p[1][0] : '') : ''; }
// 魔法の名が唱えられたか(音声認識の揺れ「ファイヤー」なども許す)
function calledByName(text, spell) {
  const p = callParts(spell); if (!p) return false;
  const t = normalize(text);
  const has = list => list.some(a => t.includes(normalize(a)));
  return has(p[0]) && (!p[1] || has(p[1]));
}
export const CALL_WORDS = [...Object.values(CALL_EL), ...Object.values(CALL_FORM), ...Object.values(CALL_EFF)].flat();

// ---- 呪文コンパイラ ----
export function compile(text, known) {
  const toks = tokenize(text, known);
  const used = toks.filter(t => t.known).map(t => WORD_BY_ID[t.id]);
  const unknown = toks.filter(t => !t.known).map(t => WORD_BY_ID[t.id]);
  const spell = {
    text, words: used.map(w => w.id), unknownWords: unknown.map(w => w.id),
    elements: [], form: null, effects: [], target: null,
    dual: false, max: false, eternal: false, rune: false, swift: false, released: false,
    cost: 0, power: 1, valid: false, error: null,
  };
  for (const w of used) {
    spell.cost += w.cost;
    switch (w.cat) {
      case 'element': if (!spell.elements.includes(w.val)) spell.elements.push(w.val); break;
      case 'form': spell.form = w.val; break; // 最後に唱えた形が優先
      case 'effect': if (!spell.effects.includes(w.val)) spell.effects.push(w.val); break;
      case 'target': spell.target = w.val; break;
      case 'mod': spell[w.val] = true; break;
      case 'trigger': spell.released = true; break;
    }
  }
  let p = 1;
  if (spell.max) p *= 1.8;
  if (spell.blood) p *= 2;
  if (spell.ruin) p *= 1.3;
  if (spell.swift) p *= 0.8;
  if (!spell.released) p *= 0.7;
  if (spell.elements.length > 1) p *= 1 + 0.15 * (spell.elements.length - 1); // 属性融合
  // 位階: 言霊の数と修飾で 初級・中級・上級 が決まる。上の位階ほど強く、魔力も多く要る
  const score = used.length + (spell.max ? 1 : 0) + (spell.dual ? 1 : 0) + (spell.eternal ? 1 : 0);
  spell.tier = score >= 6 ? 2 : score >= 4 ? 1 : 0;
  spell.tierName = ['初級', '中級', '上級'][spell.tier];
  p *= [0.58, 1, 1.6][spell.tier];
  const KIND = { fire: '炎', ice: '氷', thunder: '雷', holy: '聖', void: '闇', wind: '風' };
  const EFF = { heal: '治癒', ward: '守護', haste: '加速', light: '灯火' };
  spell.school = spell.elements.length > 1 ? '複合' : spell.elements.length ? KIND[spell.elements[0]] : spell.effects.length ? EFF[spell.effects[0]] : '';
  spell.title = spell.school ? `${spell.tierName}${spell.school}魔術` : '';
  spell.power = p;
  let mult = [0.8, 1, 1.25][spell.tier];
  if (spell.max) mult *= 2;
  if (spell.ruin) mult *= 1.5;
  if (spell.dual) mult *= 2;
  spell.cost = Math.round(spell.cost * mult);

  if (spell.rune && !spell.form) spell.form = 'nova';
  spell.callName = callName(spell);
  if (!spell.released && calledByName(text || '', spell)) { spell.released = true; spell.calledByName = true; spell.power /= 0.7; } // 魔法の名で締めた
  if (!used.length) spell.error = '言霊が一つも宿っていない';
  else if (!spell.elements.length && !spell.effects.length) spell.error = '力の源(属性か効果)が無い';
  else if (!spell.form && !spell.effects.length && !spell.target) spell.error = '魔力が形を成さなかった(形か対象が必要)';
  else spell.valid = true;
  if (spell.rune && !spell.form) spell.form = 'nova';
  return spell;
}

// 研究用: 呪文を数式のように表示
export function formula(spell) {
  if (!spell.words.length) return '—';
  const parts = [];
  if (spell.title) parts.push(`《${spell.title}》${spell.callName ? '「' + spell.callName + '」' : ''}`);
  const tgt = { enemy: '敵', self: '自己', ally: '味方' };
  if (spell.target) parts.push(`対象[${tgt[spell.target]}]`);
  if (spell.elements.length) parts.push(spell.elements.map(e => ELEMENTS[e].name).join('+'));
  if (spell.effects.length) parts.push(spell.effects.map(e => ({ heal: '癒', ward: '護', haste: '速' })[e]).join('+'));
  const formName = { lance: '投射', nova: '環', rain: '雨', wall: '壁' };
  const mods = [];
  if (spell.dual) mods.push('×2');
  if (spell.max) mods.push('×1.8');
  if (spell.eternal) mods.push('持続↑');
  if (spell.swift) mods.push('迅');
  if (spell.rune) mods.push('罠');
  let s = parts.join(' × ');
  s += spell.form ? ` → ${formName[spell.form]}` : (spell.effects.length || spell.target ? ' → 直接' : '');
  if (mods.length) s += ` [${mods.join(' ')}]`;
  s += `  威力${Math.round(spell.power * 100)}% 消費${spell.cost}`;
  if (!spell.released) s += ' (略式)';
  if (spell.error) s += `  ✖ ${spell.error}`;
  return s;
}

// 呪文を読み上げ用テキストへ
export function speakable(spell) {
  return spell.words.map(id => WORD_BY_ID[id].yomi).join('、');
}
