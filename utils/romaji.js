// ローマ字検索用ユーティリティ。
// かな名（カタカナ）をローマ字に変換し、ローマ字入力での部分一致検索を可能にする。
// 例: かな名「ブドウトウ」→ "budoutou" → ユーザー入力 "budou" が部分一致。

const YOUON = {
  キャ: 'kya', キュ: 'kyu', キョ: 'kyo',
  シャ: 'sha', シュ: 'shu', ショ: 'sho',
  チャ: 'cha', チュ: 'chu', チョ: 'cho',
  ニャ: 'nya', ニュ: 'nyu', ニョ: 'nyo',
  ヒャ: 'hya', ヒュ: 'hyu', ヒョ: 'hyo',
  ミャ: 'mya', ミュ: 'myu', ミョ: 'myo',
  リャ: 'rya', リュ: 'ryu', リョ: 'ryo',
  ギャ: 'gya', ギュ: 'gyu', ギョ: 'gyo',
  ジャ: 'ja', ジュ: 'ju', ジョ: 'jo',
  ビャ: 'bya', ビュ: 'byu', ビョ: 'byo',
  ピャ: 'pya', ピュ: 'pyu', ピョ: 'pyo',
  シェ: 'she', チェ: 'che', ジェ: 'je',
  ティ: 'ti', ディ: 'di', トゥ: 'tu', ドゥ: 'du',
  ファ: 'fa', フィ: 'fi', フェ: 'fe', フォ: 'fo',
  ウィ: 'wi', ウェ: 'we', ウォ: 'wo',
  ヴァ: 'va', ヴィ: 'vi', ヴェ: 've', ヴォ: 'vo',
};

const BASE = {
  ア: 'a', イ: 'i', ウ: 'u', エ: 'e', オ: 'o',
  カ: 'ka', キ: 'ki', ク: 'ku', ケ: 'ke', コ: 'ko',
  ガ: 'ga', ギ: 'gi', グ: 'gu', ゲ: 'ge', ゴ: 'go',
  サ: 'sa', シ: 'shi', ス: 'su', セ: 'se', ソ: 'so',
  ザ: 'za', ジ: 'ji', ズ: 'zu', ゼ: 'ze', ゾ: 'zo',
  タ: 'ta', チ: 'chi', ツ: 'tsu', テ: 'te', ト: 'to',
  ダ: 'da', ヂ: 'ji', ヅ: 'zu', デ: 'de', ド: 'do',
  ナ: 'na', ニ: 'ni', ヌ: 'nu', ネ: 'ne', ノ: 'no',
  ハ: 'ha', ヒ: 'hi', フ: 'fu', ヘ: 'he', ホ: 'ho',
  バ: 'ba', ビ: 'bi', ブ: 'bu', ベ: 'be', ボ: 'bo',
  パ: 'pa', ピ: 'pi', プ: 'pu', ペ: 'pe', ポ: 'po',
  マ: 'ma', ミ: 'mi', ム: 'mu', メ: 'me', モ: 'mo',
  ヤ: 'ya', ユ: 'yu', ヨ: 'yo',
  ラ: 'ra', リ: 'ri', ル: 'ru', レ: 're', ロ: 'ro',
  ワ: 'wa', ヲ: 'o', ン: 'n', ヴ: 'vu',
  ァ: 'a', ィ: 'i', ゥ: 'u', ェ: 'e', ォ: 'o',
  ャ: 'ya', ュ: 'yu', ョ: 'yo',
};

// ひらがな→カタカナ変換（コードポイントを +0x60）
function hiraToKata(str) {
  return str.replace(/[ぁ-ゖ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );
}

// カタカナ文字列をヘボン式ローマ字に変換
export function kanaToRomaji(input) {
  if (!input) return '';
  const s = hiraToKata(String(input));
  let result = '';
  let i = 0;
  while (i < s.length) {
    const two = s.substr(i, 2);
    if (YOUON[two]) {
      result += YOUON[two];
      i += 2;
      continue;
    }
    const ch = s[i];
    // 促音（ッ）: 次の音の頭子音を重ねる
    if (ch === 'ッ') {
      const nextTwo = s.substr(i + 1, 2);
      const nextRom = YOUON[nextTwo] || BASE[s[i + 1]] || '';
      if (nextRom) result += nextRom[0];
      i += 1;
      continue;
    }
    // 長音（ー）: 無視
    if (ch === 'ー') {
      i += 1;
      continue;
    }
    if (BASE[ch]) {
      result += BASE[ch];
      i += 1;
      continue;
    }
    // かな以外（英数字など）はそのまま小文字で
    result += ch.toLowerCase();
    i += 1;
  }
  return result;
}

// ヘボン式／訓令式のゆれを吸収して比較用に正規化
export function romajiCanonical(romaji) {
  return (romaji || '')
    .toLowerCase()
    .replace(/sha/g, 'sya').replace(/shu/g, 'syu').replace(/sho/g, 'syo').replace(/shi/g, 'si')
    .replace(/cha/g, 'tya').replace(/chu/g, 'tyu').replace(/cho/g, 'tyo').replace(/chi/g, 'ti')
    .replace(/tsu/g, 'tu')
    .replace(/ja/g, 'zya').replace(/ju/g, 'zyu').replace(/jo/g, 'zyo').replace(/ji/g, 'zi')
    .replace(/fu/g, 'hu')
    // 長音のゆれを吸収（チュウ=tyuu と chu=tyu を一致させる等）
    .replace(/ou/g, 'o')
    .replace(/([aiueo])\1+/g, '$1');
}

// かな名から検索キー（正規化ローマ字）を作る
export function kanaSearchKey(kana) {
  return romajiCanonical(kanaToRomaji(kana));
}

// 入力がローマ字（半角英字を含む）かどうか
export function isRomajiQuery(q) {
  return /[a-z]/i.test(q);
}
