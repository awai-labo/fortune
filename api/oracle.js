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

    let prompt = `Card: ${card.name} (${card.type}) — ${ori}\nKeywords: ${card.keywords}\nCore meaning (${ori}): ${meaning}`;
    if (question) prompt += `\nQuestion: "${question}"`;
    prompt += '\n\nWrite a reading for this person from this card.';

    const systemJa = `あなたは、カバラの生命の樹と北欧神話ユグドラシルを統合した独自のオラクルデッキ「The Integration Tree」の鑑定師です。
鑑定文は日本語の散文で書いてください。
以下の3層フレームワークで読んでください：
1. 背景状況 — 今この人の人生のどんな局面に響いているか
2. 心理的制約 — どんな内なるパターンが動いているか
3. 共鳴するメッセージ — 魂に直接語りかける詩的な言葉

箇条書き不使用。200〜280字。心理学・神話・哲学が自然に溶け込んだ語り口で。問いを開くように。`;

    const systemEn = `You are a reader of "The Integration Tree" — a unique 68-card oracle deck that integrates the Kabbalistic Tree of Life with the Norse World Tree Yggdrasil.
Write the reading in English prose using this 3-layer framework:
1. Background — what layer or phase of life this card is resonating with right now
2. Psychological pattern — what inner constraint or survival strategy is at play
3. Resonant message — poetic words that speak directly to the soul

No bullet points. 150-200 words. Let psychology, mythology and philosophy dissolve naturally into the language. Open questions rather than fixed answers. Speak with warmth and depth.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
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
