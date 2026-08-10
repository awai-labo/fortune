/* ============================================================
   Canva 一括作成用CSV — オラクル各アプリ共通ヘルパー

   使い方（各アプリ側）:
     const csv = CanvaCSV.sheet();
     csv.add("カード名", card.name);
     csv.add("本文", text, { split: 3 });   // 本文1/本文2/本文3 に分割
     csv.download("spread3_canva");

   Canva の「一括作成」は、中身が空の列をフィールドとして認識しない。
   そのため値が空になりうる列は、不可視文字（ノーブレークスペース）で埋めて
   「空ではない列」にしておく。画面上・デザイン上は何も表示されない。

   日付や固定文言は Canva 側のテンプレートで持たせる前提のため、
   CSV には入れない（talent5 と同じ方針）。
   ============================================================ */
(function (global) {
  'use strict';

  // 空欄よけの不可視文字（ノーブレークスペース）
  var BLANK = '\u00A0';

  // 文末とみなす記号（半角ピリオドは後述のとおり条件付き）
  var SENTENCE_END = '。．！？!?';

  function toText(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/\r\n?/g, '\n').trim();
  }

  // 空なら不可視文字に置き換える
  function fill(v) {
    var s = toText(v);
    return s === '' ? BLANK : s;
  }

  // 文単位に切る（lookbehind を使わず iOS 旧版でも動くように）
  function sentences(text) {
    var out = [];
    var cur = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      cur += ch;
      var isEnd = SENTENCE_END.indexOf(ch) !== -1;
      // 半角ピリオドは、後ろが空白か文末のときだけ区切りとみなす（英文用）
      if (!isEnd && ch === '.') {
        var next = text[i + 1];
        isEnd = next === undefined || /\s/.test(next);
      }
      if (isEnd) {
        out.push(cur);
        cur = '';
      }
    }
    if (cur !== '') out.push(cur);
    // 文と文のあいだの空白は次の文の先頭に残しておく（英文で連結しても詰まらないように）
    return out.filter(function (s) { return s.trim() !== ''; });
  }

  // 1つの塊を、文の切れ目で n 個におおよそ均等に割る
  function balance(text, n) {
    var ss = sentences(text);
    if (ss.length <= 1) return [text];
    if (ss.length <= n) return ss.map(function (x) { return x.trim(); });

    var target = Math.ceil(text.length / n);
    var chunks = [];
    var cur = '';
    for (var i = 0; i < ss.length; i++) {
      var remainingChunks = n - chunks.length;
      var remainingSentences = ss.length - i;
      // 残りの文が残り枠と同数になったら、以降は1文ずつ割り当てる
      if (cur !== '' && (cur.length >= target || remainingSentences < remainingChunks)) {
        chunks.push(cur.trim());
        cur = '';
      }
      cur = cur === '' ? ss[i] : cur + ss[i];
      if (chunks.length === n - 1) {
        // 最後の枠には残り全部を入れる
        cur = cur + ss.slice(i + 1).join('');
        break;
      }
    }
    if (cur !== '') chunks.push(cur.trim());
    return chunks;
  }

  /**
   * 本文を n 個の段落に整える。
   * 空行区切り → 改行区切り → 文の切れ目、の順に分割を試みる。
   * 多すぎる場合は最後の枠にまとめ、足りない場合は不可視文字で埋める。
   */
  function paragraphs(text, n) {
    var t = toText(text);
    if (n <= 1) return [fill(t)];
    if (t === '') {
      var empty = [];
      for (var i = 0; i < n; i++) empty.push(BLANK);
      return empty;
    }

    var parts = t.split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (parts.length === 1) {
      parts = t.split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    }
    if (parts.length === 1) {
      parts = balance(t, n);
    }
    if (parts.length > n) {
      parts = parts.slice(0, n - 1).concat([parts.slice(n - 1).join('\n\n')]);
    }
    while (parts.length < n) parts.push('');

    return parts.map(fill);
  }

  // カード画像の絶対URL（Canva の画像フィールド用）
  function imageUrl(card) {
    if (!card || !card.image) return BLANK;
    try {
      return new URL(card.image, global.location.href).href;
    } catch (e) {
      return card.image;
    }
  }

  function orientation(isReversed, isJa) {
    if (isJa === false) return isReversed ? 'Reversed' : 'Upright';
    return isReversed ? '逆位置' : '正位置';
  }

  // 多言語フィールド（{ja, en}）／文字列のどちらでも受け取れるように
  function localized(v, lang) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    return v[lang] || v.ja || v.en || '';
  }

  function stamp() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function escape(v) {
    return '"' + String(v).replace(/"/g, '""').replace(/\r\n?/g, '\n') + '"';
  }

  /** 1行ぶんの CSV を組み立てるビルダー */
  function sheet() {
    var head = [];
    var row = [];

    var api = {
      /**
       * 列を1つ（または opts.split 指定で複数）追加する。
       * @param {string} name 列名（Canva 側のフィールド名になる）
       * @param {*} value 値
       * @param {{split?: number}} [opts] split を指定すると name1..nameN に分割
       */
      add: function (name, value, opts) {
        var n = opts && opts.split ? opts.split : 0;
        if (n > 1) {
          var ps = paragraphs(value, n);
          for (var i = 0; i < n; i++) {
            head.push(name + (i + 1));
            row.push(ps[i]);
          }
        } else {
          head.push(name);
          row.push(fill(value));
        }
        return api;
      },

      /** カード1枚ぶんの共通列をまとめて追加する */
      addCard: function (prefix, card, isReversed, lang) {
        var isJa = lang !== 'en';
        api.add(prefix + '_カード名', card && card.name);
        api.add(prefix + '_タイプ', card && card.type);
        api.add(prefix + '_柱', localized(card && card.pillar, isJa ? 'ja' : 'en'));
        api.add(prefix + '_サブテーマ', localized(card && card.subtheme, isJa ? 'ja' : 'en'));
        api.add(prefix + '_テーマ', localized(card && card.theme, isJa ? 'ja' : 'en'));
        api.add(prefix + '_英文', card && card.message && card.message.en);
        api.add(prefix + '_和訳', card && card.message && card.message.ja);
        api.add(prefix + '_正逆', orientation(isReversed, isJa));
        api.add(prefix + '_画像ID', card && card.id);
        api.add(prefix + '_画像URL', imageUrl(card));
        return api;
      },

      /** 組み立てた CSV 文字列（BOM + CRLF）を返す */
      toString: function () {
        return '\uFEFF' +
          head.map(escape).join(',') + '\r\n' +
          row.map(escape).join(',') + '\r\n';
      },

      /** ファイル名の基点を渡すと <basename>_YYYY-MM-DD.csv で保存する */
      download: function (basename) {
        var blob = new Blob([api.toString()], { type: 'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = basename + '_' + stamp() + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      },
    };

    return api;
  }

  global.CanvaCSV = {
    BLANK: BLANK,
    sheet: sheet,
    fill: fill,
    paragraphs: paragraphs,
    imageUrl: imageUrl,
    orientation: orientation,
    localized: localized,
    stamp: stamp,
  };
})(window);
