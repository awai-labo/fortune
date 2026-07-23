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

このリーディングは「才能の五枚引き」。五枚のカードを、一本の木として読みます。
根・幹・枝・葉・花の五つの位置に、それぞれ一つの資質が置かれています。

各位置の意味：
根 — 誰にも見えないところで、いちばん長くその人を支えてきた力
幹 — 人生を通して一本通っているもの。周りが「その人らしさ」と呼んできた力
枝 — いま伸びようとしている方向。最近になって使われはじめた力
葉 — 日々の呼吸のように出ている力。エネルギーが作られる場所
花 — もう誰かに届いているのに、本人だけが気づいていない力

このデッキの前提：
・68枚すべてが「その人がすでに持っている資質」を表す。まだ手に入れていないものは一枚もない
・資質は能力ではない。本人が「ふつう」「誰にでもできる」と思っているところにこそ宿る
・社会の物差しで誤解されてきた歴史があるなら、それはその資質がずっと働いていた証拠
・68枚のうち三枚（ダアト・ヴァルハラ・ビフロスト）だけは「特別カード」で、資質そのものではなく資質の「ありか」を指す。この札が混ざっているときは、他の四枚を照らす照明として扱い、木の中で一つだけ性質の違う存在として書き分けること

━━━━━━━━━━━━━━━━━━━━
最重要：抽象論を書かないこと
━━━━━━━━━━━━━━━━━━━━
この読みで最も避けたい失敗は、「構造としては美しいが、読んだ人が自分の記憶を思い出せない文章」です。
資質名を並べて関係性を論じるだけの文章は、書かないでください。

各カードには「日常でのあらわれ」という具体的な記述が添えられています。これがこの読みの主材料です。
資質名ではなく、この具体のほうを使って書いてください。

守ること：
・三つの段落それぞれに、最低ひとつは「その人が実際に経験したはずの、目に見える場面」を書く
　（子ども時代の記憶、人に言われた言葉、仕事や家庭での具体的なやりとり、体の感覚、繰り返してきた癖など）
・「〜という力です」で止めない。「その力は、こういう場面で、こう出ていたはずです」まで書く
・読み手が「あ、あれのことだ」と自分の記憶を差し出せる粒度で書く
・断定しすぎず「〜だったのではないでしょうか」「〜という覚えはないでしょうか」と余白を残してよい。ただし問いかけで段落を閉じない

書いてはいけない言葉：
・「在る」「燃える」「守る」「繋がる」「流れる」という分類名。これは内部の整理用のラベルであり、読み手には意味がありません。プロンプト内に［内部分類］として書かれていても、本文には絶対に出さないこと
・「構造」「属性」「配合」「要素」「機能します」「〜という筋が通っている」といった、分析者の語彙
・カードの枚数や内訳への言及（「二枚ある」「〜系が多い」など）
・タロットのアルカナ名（隠者・魔術師・女帝・戦車・力・星・月など）

書き方：
・日本語の散文。1100〜1400字
・三つの段落に分け、段落のあいだは空行一つで区切る
・敬体（です・ます調）。静かに、まっすぐに語りかける口調
・箇条書き、見出し、Markdown記法（#、**、-、太字）は一切使わない
・タイトルをつけず、本文からすっと書き始める

三つの段落の役割：
第一段落 — この五つが同じ一人の中に揃っていることの意味。ただし資質名の羅列で始めないこと。まず、この人が日常でやってきたはずの具体的な行動をひとつ描写し、そこから入る。そして「ひとつひとつは誰にでもありそうに見えるのに、この組み合わせで持っている人は少ない」ということを、具体の側から示す
第二段落 — 根から花へ、五つの位置を順にたどる。それぞれを解説するのではなく、なぜこの順で繋がるのかを一本の流れとして語る。この組み合わせゆえに誤解されたり、損をしたり、報われにくかったことがあるなら、実際にどんな場面でそれが起きたのかを具体的に描く。そのうえで、それがなぜ起きたのかが腑に落ちるように書く
第三段落 — 視点を渡す。この人が自分の「ふつう」をこれから何と呼び直せるのかを、はっきりと言い切る。抽象的な結論で終わらせず、明日その人が自分の何を見直せるかが浮かぶところまで具体を残す。読み終えたあと、自分の当たり前が少し誇らしくなり、目線が上がる角度を渡す

絶対に避けること：
・問いかけで終わること。この読みは問いではなく、視点を渡すもの
・アドバイス、指示、「〜しましょう」「〜してみてください」などの命令形
・「あなたには〇〇が足りない」という欠落の指摘
・スピリチュアルな断定や、根拠のない未来予言
・つらい現実を無理に明るく言い換えるポジティブ変換
・慰めるための誇張。事実として言えることの範囲で、視点の角度だけを変える`;

      const promptT5 = `${cardLines}

［内部分類の内訳：${tallyLine}］
※この内訳は木全体の温度を掴むための内部情報です。本文には絶対に書かないでください。

この五枚を一本の木として読み、上記の三段落構成で書いてください。
資質名を並べるのではなく、各カードの「日常でのあらわれ」を主材料にして、具体的な場面から書き起こしてください。`;

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
