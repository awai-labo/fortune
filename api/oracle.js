export default async function handler(req, res) {
  // CORSヘッダー（GitHub Pagesからのアクセスを許可）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { card, orientation, question } = req.body;

    const ori = orientation === 'reversed' ? '逆位置' : '正位置';
    const meaning = orientation === 'reversed' ? card.reversed : card.upright;

    let prompt = `引かれたカード：${card.name}（${card.type}）— ${ori}\nキーワード：${card.keywords}\n${ori}の本質：${meaning}`;
    if (question) prompt += `\n問いかけ：「${question}」`;
    prompt += '\n\nこのカードから、今この人に届くべき鑑定文を書いてください。';

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
        system: `あなたは、カバラの生命の樹と北欧神話ユグドラシルを統合した独自のオラクルデッキの鑑定師です。
鑑定文は日本語の散文で書いてください。
以下の3層フレームワークで読んでください：
1. 背景状況 — 今この人の人生のどんな局面に響いているか
2. 心理的制約 — どんな内なるパターンが動いているか
3. 共鳴するメッセージ — 魂に直接語りかける詩的な言葉

箇条書き不使用。200〜280字。心理学・神話・哲学が自然に溶け込んだ語り口で。問いを開くように。`,
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
