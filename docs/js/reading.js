// 聞き取った文の漢字を、いったん「ひらがなの読み」に分解する
// 音声認識は「聖光」を「成功」、「汝に」を「何時に」のように同じ音の別の字で返しがち。
// 読みに直してから言霊と照らし合わせれば、字が違っても音が合っていれば拾える。
// (形態素解析 kuromoji の辞書を使う。読み込みが済むまでは何もしない)
let tokenizer = null, loading = null;

function loadScript(src) {
  return new Promise((ok, ng) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ng; document.head.appendChild(s); });
}

export function initReading() {
  if (loading) return loading;
  loading = (async () => {
    try {
      if (!window.kuromoji) await loadScript('vendor/nm/kuromoji/build/kuromoji.js');
      tokenizer = await new Promise((ok, ng) => window.kuromoji.builder({ dicPath: 'vendor/nm/kuromoji/dict/' }).build((err, t) => err ? ng(err) : ok(t)));
    } catch (e) { console.warn('読みの辞書を読み込めなかった', e); }
  })();
  return loading;
}

const KANJI = /[㐀-鿿々〆]/;
const kata2hira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

// 漢字を含む語だけを読み(ひらがな)に直す。カタカナ(ファイア などの魔法の名)はそのまま残す
export function toReading(text) {
  if (!tokenizer || !text || !KANJI.test(text)) return null;
  try {
    return tokenizer.tokenize(text).map(t => KANJI.test(t.surface_form) && t.reading && t.reading !== '*' ? kata2hira(t.reading) : t.surface_form).join('');
  } catch { return null; }
}
export const readingReady = () => !!tokenizer;
