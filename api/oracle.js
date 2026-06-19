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
    const { card, orientation, question, lang } = req.body;
    const isJa = lang !== 'en';
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
必ず敬体（です・ます調）で書くこと。鑑定師が目の前の人に静かに語りかけるような口調で。`;

    const systemEn = `You are a reader of "The Integration Tree" — a unique 68-card oracle deck that integrates the Kabbalistic Tree of Life with the Norse World Tree Yggdrasil. This is not a tarot deck.
The four card types are: Sephirot (11 cards), Hebrew Letters (22 cards), Runes (24 cards), and Norse Worlds (11 cards).

Write the reading in English prose using this 3-layer framework:
1. Background — what layer or phase of life this card's energy is resonating with right now
2. Psychological pattern — what inner movement or survival strategy is at play
3. Message to the soul — poetic words that speak directly to the heart

No bullet points. 180–220 words of prose.
Let psychology, mythology and philosophy dissolve naturally into the language.
Open questions rather than fixed answers.
Write as if the energy of the card itself is speaking — not as a tarot explanation.`;

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
