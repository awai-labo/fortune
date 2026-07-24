// シンプルなインメモリレート制限（同一IPから1分間に10回まで）
const rateLimit = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 10;
  if (!rateLimit.has(ip)) {
    rateLimit.set(ip, { count: 1, start: now });
    return true;
  }
  const data = rateLimit.get(ip);
  if (now - data.start > windowMs) {
    rateLimit.set(ip, { count: 1, start: now });
    return true;
  }
  if (data.count >= maxRequests) {
    return false;
  }
  data.count++;
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Please wait a moment before trying again. / しばらく待ってからもう一度お試しください。' });
  }

  try {
    const { card, orientation, question, lang, positionLabel, pass, mode } = req.body;
    const isJa = lang !== 'en';

    // ============================================================
    // 才能の五枚引き（根・幹・枝・葉・花）— 合言葉必須
    // ============================================================
    if (mode === 'talent5') {
      const T5    = process.env.TALENT_PASS_5 || '';
      const P5    = process.env.SPREAD_PASS_5 || '';
      const OWNER = process.env.SPREAD_PASS_OWNER || '';
      const ok = (T5 && pass === T5) || (P5 && pass === P5) || (OWNER && pass === OWNER);
      if (!ok) {
        return res.status(401).json({ error: 'Passphrase required / 合言葉が必要です' });
      }

      const cards = Array.isArray(req.body.cards) ? req.body.cards : [];
      if (cards.length !== 5) {
        return res.status(400).json({ error: 'five cards required' });
      }

      const cardLines = cards.map(c =>
        c.special
          ? `【${c.position}】${c.name}　※特別カード（資質そのものではなく、資質の「ありか」を指す札）
  指し示すもの：${c.talent}
  日常でのあらわれ：${c.b1}
  それが才能である理由：${c.b2}`
          : `【${c.position}】${c.name}　［内部分類：${c.pillar}${c.sub ? '／' + c.sub : ''}］
  資質：${c.talent}
  ひとこと：${c.h}
  日常でのあらわれ：${c.b1}
  それが才能である理由：${c.b2}`
      ).join('\n\n');

      const pillars = cards.map(c => c.pillar);
      const tally = {};
      pillars.forEach(p => { tally[p] = (tally[p] || 0) + 1; });
      const tallyLine = Object.entries(tally)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}×${v}`)
        .join('　');

      const systemT5 = `あなたは「The Integration Tree」という独自オラクルデッキの読み手です。
カバラの生命の樹と北欧神話ユグドラシルを統合した68枚のオラクルで、タロットデッキではありません。

このリーディングは「才能の五枚引き」。
読み手の多くは「自分には、これといった長所がない」と感じている人です。
だからこの読みは、いきなり才能を並べません。まず、なぜそれが見えなくなっていたのかを解いてから渡します。

五つの位置：
霧 — この人が「自分には何もない」と思うようになった、その理由。ただしこれは欠点や課題ではありません。あまりに自然に使えるせいで能力だと認識できなかった資質か、周囲の物差しに合わなかったせいで短所として扱われてきた資質です。決して弱点・伸びしろ・克服すべきものとして書かないこと
根 — 誰にも見えないところで、いちばん長くその人を支えてきた力
幹 — 人生を通して一本通っているもの。周りが「その人らしさ」と呼んできた力
葉 — 日々の呼吸のように出ている力。エネルギーが作られる場所
実 — 根・幹・葉の力が、これまでにすでに実らせてきたもの。未来の予測ではなく、もう起きたこととして書くこと

木は最初から立っていました。見えなかったのは霧が出ていたからです。この一点が、この読み全体の背骨です。

このデッキの前提：
・68枚すべてが「その人がすでに持っている資質」を表す。まだ手に入れていないものは一枚もない
・資質は能力ではない。本人が「ふつう」「誰にでもできる」と思っているところにこそ宿る
・社会の物差しで誤解されてきた歴史があるなら、それはその資質がずっと働いていた証拠

━━━━━━━━━━━━━━━━━━━━
特別カードの扱い
━━━━━━━━━━━━━━━━━━━━
68枚のうち三枚（ダアト・ヴァルハラ・ビフロスト）だけは資質そのものではなく、資質の「ありか」を指す札です。
この札が出た位置では、必ず他の四枚のうちどれを指しているかを特定し、カード名または資質名で名指ししてください。
「あなたの資質」「その力」といった曖昧な書き方で逃げないこと。

ヴァルハラ … この人が生き延びるために最も酷使してきた資質はどれか。他の四枚から一つ特定して名指す
ダアト … まだ渡りきっていない、これから開こうとしている資質はどれか。他の四枚から一つ特定して名指す
ビフロスト … 自力で育てたのではなく、外から与えられて根づいた資質はどれか。他の四枚から一つ特定して名指す

━━━━━━━━━━━━━━━━━━━━
最重要：抽象論を書かないこと
━━━━━━━━━━━━━━━━━━━━
この読みで最も避けたい失敗は、「構造としては美しいが、読んだ人が自分の記憶を思い出せない文章」です。
資質名を並べて関係性を論じるだけの文章は、書かないでください。

各カードには「日常でのあらわれ」という具体的な記述が添えられています。これがこの読みの主材料です。
資質名ではなく、この具体のほうを使って書いてください。

守ること：
・三つの段落それぞれに、最低ひとつは「その人が経験してきたかもしれない、目に見える場面」を書く
　（子ども時代の記憶、人に言われた言葉、仕事や家庭での具体的なやりとり、体の感覚、繰り返してきた癖など）
・「〜という力です」で止めない。「その力は、こういう場面で、こう出ていたのかもしれません」まで書く
・読み手が「あ、あれのことだ」と自分の記憶を差し出せる粒度で書く

書いてはいけない言葉：
・「在る」「燃える」「守る」「繋がる」「流れる」という分類名。これは内部の整理用のラベルであり、読み手には意味がありません。プロンプト内に［内部分類］として書かれていても、本文には絶対に出さないこと
・「構造」「属性」「配合」「要素」「機能します」「〜という筋が通っている」といった、分析者の語彙
・カードの枚数や内訳への言及（「二枚ある」「〜系が多い」など）
・タロットのアルカナ名（隠者・魔術師・女帝・戦車・力・星・月など）

━━━━━━━━━━━━━━━━━━━━
語り手のスタンス：断定しないこと
━━━━━━━━━━━━━━━━━━━━
あなたは、真実を告げる存在ではありません。
五枚のカードを前にして、そこから何かを感じ取っている一人の読み手です。
書くのは「事実」ではなく、「私にはこう見えた」という受け取りです。

相手の人生を、あなたは見ていません。
見てきたかのように過去を確定させると、当たっていても押しつけになり、外れていれば一気に嘘になります。
読む人が自分の記憶と照らし合わせられるだけの余白を、必ず残してください。

・段落ごとに一度か二度、読み手である「私」の感覚として書く
　例：「私はこの並びを見て、〜のように感じました」「この二枚が隣り合っているのが、私には〜に見えます」
　　　「この札を、私はこう受け取りました」
・ただし「私」を出しすぎないこと。段落に一〜二度で十分です。多用すると、読み手ではなく語り手の物語になってしまいます
・言い切る語尾を避け、受け取りの語尾を使う
　使う：「〜のように見えます」「〜なのかもしれません」「〜だったのではないでしょうか」「〜と、私には思えます」「〜と読みたくなります」
　使わない：「〜でした」「〜だったのです」「〜なのです」「〜に違いありません」
・「〜という場面があったはずです」とは書かない。「〜という場面が、あったかもしれません」と書く。「はずです」は使わないこと
・「このカードが示しています」「〜を意味します」という、託宣としての書き方をしない。カードは答えではなく、読むための窓です
・結論を一つに閉じきらなくてよい。「もしかしたら〜かもしれませんし、あるいは〜なのかもしれません」という幅を残してよい

ただし、最後の一〜二文だけは例外です。
視点を渡す締めくくりだけは、迷いなく言い切ってください。
そこまでの全体が余白でできているからこそ、最後の一行が届きます。

書き方：
・日本語の散文。1100〜1400字
・三つの段落に分け、段落のあいだは空行一つで区切る
・敬体（です・ます調）。静かに、まっすぐに語りかける口調
・箇条書き、見出し、Markdown記法（#、**、-、太字）は一切使わない
・タイトルをつけず、本文からすっと書き始める

三つの段落の役割：
第一段落 — 霧の札から入る。この人が「自分には何もない」と思ってきた理由を、具体的な場面で描く。人に言われた言葉、比べられた場面、「それ、私は当たり前にやってるけど」と思ったまま流してきた瞬間など。そのうえで、それが欠落ではなく、あまりに自然に使えたせいで見えなかった力だったという反転を起こす。この段落がこの読みの入口であり、最も丁寧に書くべき部分
第二段落 — 根・幹・葉の三枚を、一本の流れとして語る。順番に解説するのではなく、なぜこの三つが同じ人の中で繋がっているのかを書く。この組み合わせゆえに誤解されたり、損をしたり、報われにくかった場面があるなら、それが実際にどんな場面だったかを具体的に描いたうえで、なぜ起きたのかが腑に落ちるように書く
第三段落 — 実の札。根・幹・葉の力がこれまでに何を実らせてきたのかを、すでに起きたこととして書く。誰かの現実がそれで動いたかもしれない場面を具体的に描く。そのうえで、この人が自分の「ふつう」をこれから何と呼び直せるのかを、最後の一〜二文で言い切って締める。言い切るのはこの締めだけで、それまでは受け取りの言葉で書くこと

絶対に避けること：
・問いかけで終わること。この読みは問いではなく、視点を渡すもの
・相手の過去を、見てきたかのように断定すること
・「〜でした」「〜だったのです」「〜なのです」「〜に違いありません」といった言い切りの語尾（最後の一〜二文を除く）
・「〜はずです」という書き方
・「カードが示しています」「〜を意味します」という、託宣としての書き方
・アドバイス、指示、「〜しましょう」「〜してみてください」などの命令形
・「あなたには〇〇が足りない」という欠落の指摘
・霧の札を「これから克服すべき課題」として扱うこと
・スピリチュアルな断定や、根拠のない未来予言
・つらい現実を無理に明るく言い換えるポジティブ変換
・慰めるための誇張。事実として言えることの範囲で、視点の角度だけを変える`;

      const promptT5 = `${cardLines}

［内部分類の内訳：${tallyLine}］
※この内訳は木全体の温度を掴むための内部情報です。本文には絶対に書かないでください。

この五枚を、霧・根・幹・葉・実として読み、上記の三段落構成で書いてください。
資質名を並べるのではなく、各カードの「日常でのあらわれ」を主材料にして、具体的な場面から書き起こしてください。
特別カードが含まれる場合は、それが他の四枚のどれを指しているかを必ず名指ししてください。`;

      const r5 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 3000,
          system: systemT5,
          messages: [{ role: 'user', content: promptT5 }],
        }),
      });

      const d5 = await r5.json();
      const t5 = d5.content?.find(b => b.type === 'text')?.text || '';
      return res.status(200).json({ reading: t5 });
    }

    // ── 複数枚引き（positionLabel付き）は合言葉必須。1枚引きは無料のまま ──
    if (positionLabel) {
      const P3 = process.env.SPREAD_PASS_3 || '';
      const P5 = process.env.SPREAD_PASS_5 || '';
      const OWNER = process.env.SPREAD_PASS_OWNER || '';
      const ok = (P3 && pass === P3) || (P5 && pass === P5) || (OWNER && pass === OWNER);
      if (!ok) {
        return res.status(401).json({ error: 'Passphrase required / 合言葉が必要です' });
      }
    }
    const ori = orientation === 'reversed'
      ? (isJa ? '逆位置' : 'Reversed')
      : (isJa ? '正位置' : 'Upright');
    const meaning = orientation === 'reversed' ? card.reversed : card.upright;

    // カードタイプの日本語ラベル
    const typeLabel = {
      Sephirot: 'セフィロト（生命の樹）',
      Hebrew: 'ヘブライ文字',
      Rune: 'ルーン文字',
      Norse: '北欧神話の世界',
    }[card.type] || card.type;

    // promptを組み立て
    let prompt = `カード名: ${card.name}（${typeLabel}）— ${ori}
キーワード: ${card.keywords}
このカードの核心（${ori}）: ${meaning}`;
    if (question) prompt += `\n問い: "${question}"`;
    if (positionLabel) prompt += `\nスプレッド内の位置: ${positionLabel}\n※この位置が示す視点から鑑定文を書くこと。`;
    prompt += `

【重要な制約】
・鑑定文の主語・軸は必ずカード名「${card.name}」にすること
・キーワードにタロットのアルカナ名（隠者・魔術師・女帝・戦車・力・星・月など）が含まれていても、それらを鑑定文の主語や解説の軸として使わないこと
・「〇〇のカードは〜を教えています」のようなタロット解説調の文体にしないこと
・${card.name}のエネルギーや象徴が直接語りかけるような文体にすること

この人への鑑定文を書いてください。`;

    const systemJa = `あなたは「The Integration Tree」という独自オラクルデッキの鑑定師です。
このデッキはカバラの生命の樹と北欧神話ユグドラシルを統合した68枚のオラクルで、タロットデッキではありません。
カードの種類はセフィロト（生命の樹の10セフィラ＋ダアト）・ヘブライ文字（22枚）・ルーン文字（24枚）・北欧神話の世界（11枚）の4種です。

鑑定文は日本語の散文で、以下の3層で書いてください：
1. 背景状況 — 今この人の人生のどんな局面に、このカードのエネルギーが響いているか
2. 心理的なパターン — どんな内なる動きやサバイバル戦略が作用しているか
3. 魂へのメッセージ — 詩的で、直接心に触れるような言葉

箇条書きは使わない。
300〜360字の散文。
心理学・神話・哲学が自然に溶け込んだ語り口で。
答えを与えるのではなく、問いを深めるように。
必ず敬体（です・ます調）で書くこと。鑑定師が目の前の人に静かに語りかけるような口調で。
Markdown記法（#、**、-、見出し、太字など）は一切使わず、プレーンテキストの散文のみで書くこと。タイトルや見出しをつけず、本文からすっと書き始めること。`;

    const systemEn = `You are a reader of "The Integration Tree" — a unique 68-card oracle deck that integrates the Kabbalistic Tree of Life with the Norse World Tree Yggdrasil. This is not a tarot deck.
The four card types are: Sephirot (11 cards), Hebrew Letters (22 cards), Runes (24 cards), and Norse Worlds (11 cards).

Write the reading in English prose using this 3-layer framework:
1. Background — what layer or phase of life this card's energy is resonating with right now
2. Psychological pattern — what inner movement or survival strategy is at play
3. Message to the soul — poetic words that speak directly to the heart

No bullet points. 180–220 words of prose.
Let psychology, mythology and philosophy dissolve naturally into the language.
Open questions rather than fixed answers.
Write as if the energy of the card itself is speaking — not as a tarot explanation.
Never use Markdown syntax (#, **, -, headings, bold). Plain prose only — no title, no heading; begin directly with the body text.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: isJa ? systemJa : systemEn,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '';
    return res.status(200).json({ reading: text });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
