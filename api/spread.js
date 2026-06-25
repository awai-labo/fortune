// シンプルなインメモリレート制限（同一IPから1分間に6回まで）
const rateLimit = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 6;
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
    const { cards, question, lang } = req.body;
    const isJa = lang !== 'en';

    if (!cards || !Array.isArray(cards) || cards.length < 2) {
      return res.status(400).json({ error: 'Invalid cards data' });
    }

    // カード情報をリスト化
    const cardList = cards.map((c, i) => {
      const ori = c.orientation === 'reversed'
        ? (isJa ? '逆位置' : 'Reversed')
        : (isJa ? '正位置' : 'Upright');
      const meaning = c.orientation === 'reversed' ? c.reversed : c.upright;
      const pos = c.positionLabel || (isJa ? `${i + 1}枚目` : `Card ${i + 1}`);
      return isJa
        ? `【${pos}】${c.name}（${ori}）\nキーワード：${c.keywords}\n核心：${meaning}\n個別鑑定：${c.reading}`
        : `[${pos}] ${c.name} (${ori})\nKeywords: ${c.keywords}\nEssence: ${meaning}\nIndividual reading: ${c.reading}`;
    }).join('\n\n');

    const prompt = isJa
      ? `以下のスプレッド（複数枚引き）の結果を踏まえて、全体のまとめ鑑定文を書いてください。\n\n${question ? `問い：「${question}」\n\n` : ''}${cardList}`
      : `Write a synthesis reading for the following spread.\n\n${question ? `Question: "${question}"\n\n` : ''}${cardList}`;

    const systemJa = `あなたは「The Integration Tree」という独自オラクルデッキの鑑定師です。
このデッキはカバラの生命の樹と北欧神話ユグドラシルを統合した68枚のオラクルで、タロットデッキではありません。
カードの種類はセフィロト・ヘブライ文字・ルーン文字・北欧神話の世界の4種です。

あなたはこれから、複数枚のカードを引いたスプレッドの「まとめ鑑定文」を書きます。
各カードの個別鑑定は既に完了しています。あなたの役割は、それらのカードが全体としてどのような流れ・物語・メッセージを示しているかを読むことです。

書き方の指針：
・各カードを個別に繰り返すのではなく、カード同士の関係性・流れ・変容の物語として読む
・問いがある場合はそれに対する全体の答えを示す
・心理学・神話・哲学が自然に溶け込んだ語り口で
・答えを与えるのではなく、問いを深め、視点を広げるように
・詩的でありながら、地に足のついた言葉で
・400〜500字の散文、敬体（です・ます調）で
・箇条書きは使わない
・鑑定師が目の前の人に静かに語りかけるような口調で`;

    const systemEn = `You are a reader of "The Integration Tree" — a unique 68-card oracle deck that integrates the Kabbalistic Tree of Life with the Norse World Tree Yggdrasil. This is not a tarot deck.
The four card types are: Sephirot, Hebrew Letters, Runes, and Norse Worlds.

You are writing a synthesis reading for a multi-card spread. Individual readings for each card have already been given. Your role is to read the cards together — their relationship, arc, and collective message.

Guidelines:
- Do not repeat individual card readings; read their interplay and narrative arc
- If a question was asked, address it through the combined field of the cards
- Let psychology, mythology and philosophy dissolve naturally into the language
- Open questions and widen perspective rather than offering fixed answers
- Poetic yet grounded
- 250–300 words of prose, no bullet points
- Write as if you are quietly speaking to the person in front of you`;

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
