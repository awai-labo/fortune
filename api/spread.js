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
    const { cards, question, lang, pass, verify, tier } = req.body;
    const isJa = lang !== 'en';

    // ── 合言葉チェック（2段階） ──
    // SPREAD_PASS_3：3枚引き用／SPREAD_PASS_5：5枚引き用（5の合言葉は3も開ける）
    const P3 = process.env.SPREAD_PASS_3 || '';
    const P5 = process.env.SPREAD_PASS_5 || '';
    const OWNER = process.env.SPREAD_PASS_OWNER || '';
    const isOwner = !!(OWNER && pass === OWNER);
    const has5 = !!(P5 && pass === P5) || isOwner;
    const has3 = !!(P3 && pass === P3) || isOwner;

    // 合言葉の確認だけのリクエスト（Anthropic APIは呼ばない）
    if (verify) {
      const ok = Number(tier) === 5 ? has5 : (has3 || has5);
      if (ok) return res.status(200).json({ ok: true });
      return res.status(401).json({ error: 'Invalid passphrase' });
    }

    const need5 = Array.isArray(cards) && cards.length >= 4;
    const passOk = need5 ? has5 : (has3 || has5);
    if (!passOk) {
      return res.status(401).json({ error: 'Passphrase required / 合言葉が必要です' });
    }

    if (!cards || !Array.isArray(cards) || cards.length < 2) {
      return res.status(400).json({ error: 'Invalid cards data' });
    }

    // カード情報をリスト化（柱／中テーマ／テーマの三層を含める）
    const cardList = cards.map((c, i) => {
      const ori = c.orientation === 'reversed'
        ? (isJa ? '逆位置' : 'Reversed')
        : (isJa ? '正位置' : 'Upright');
      const meaning = c.orientation === 'reversed' ? c.reversed : c.upright;
      const pos = c.positionLabel || (isJa ? `${i + 1}枚目` : `Card ${i + 1}`);

      const pillarLabel = (isJa ? c.pillar?.ja : c.pillar?.en) || '';
      const subthemeLabel = (isJa ? c.subtheme?.ja : c.subtheme?.en) || '';
      const themeLabel = (isJa ? c.theme?.ja : c.theme?.en) || '';

      return isJa
        ? `【${pos}】${c.name}（${ori}）\n柱：${pillarLabel}／中テーマ：${subthemeLabel}／テーマ：${themeLabel}\n核心：${meaning}`
        : `[${pos}] ${c.name} (${ori})\nPillar: ${pillarLabel} / Sub-theme: ${subthemeLabel} / Theme: ${themeLabel}\nEssence: ${meaning}`;
    }).join('\n\n');

    const prompt = isJa
      ? `以下のカードが引かれました。${question ? `\n問い：「${question}」\n` : '\n'}${cardList}`
      : `The following cards were drawn.${question ? `\nQuestion: "${question}"\n` : '\n'}${cardList}`;

    const systemJa = `あなたは「The Integration Tree」という独自オラクルデッキの鑑定師です。
このデッキはカバラの生命の樹と北欧神話ユグドラシルを統合した68枚のオラクルで、タロットデッキではありません。

各カードは「柱→中テーマ→テーマ」の三層で分類されています：
- 柱（Pillar）：そのカードが属するいのちの動き。5本あります。
  在る＝自分をそのまま承認する／燃える＝生命力と創造／守る＝境界と聖域／繋がる＝信頼と循環／流れる＝時と変容
  （柱が「証」のカードはダアト・ヴァルハラ・ビフロストの特別カードで、5本の柱の枠外。何かが起きているサインとして読みます）
- 中テーマ（Sub-theme）：柱の中での位置。例：在るの中の「存在」「内なる指針」「感性」「可能性と力」など
- テーマ（Theme）：そのカード固有の核となる一語

このデッキの根底にはホメオスタシスの思想があります。各カードは「何かを維持しようとしている恒常性」を表し、正位置はそれが健やかに働いている状態、逆位置はそれが過剰に働いている状態——ネガティブではなく、命がけで守ろうとしてきたサバイバル戦略の証です。

あなたの仕事は、カード単体の意味を足し算するのではなく、カード同士が作り出す「物語」を読むことです。

【読み方の手順】
1. 柱の組み合わせを見る
   同じ柱が重なる→今のいのちの動きの中心がそこにある
   在ると流れるの同席→承認と変化の間の揺らぎ
   守ると繋がるの同席→開くことと守ることの緊張
   燃えるが混じる→動き出そうとする火がある
   証が登場→物語全体への合図として扱う

2. 中テーマとテーマの重なり・対立を見る
   近いテーマが複数→そこが今の核心
   対立するテーマ→その緊張そのものが問いになる

3. 逆位置は敬意をもって読む
   過剰に働いている恒常性の背景には、そう生きざるを得なかった歴史がある
   表面的な慰めや無理なポジティブ変換はしない

4. 物語の形を見極める
   一本道／分岐／螺旋／円環のどれか

【書き方の指針】
・各カードを個別に繰り返すのではなく、カード同士の関係性・流れ・変容の物語として読む
・柱の重なりを意識しながら、一つの神話として語る
・問いがある場合はそれに対する全体の答えを示す
・心理学・神話・哲学が自然に溶け込んだ語り口で
・答えを与えるのではなく、問いを深め、視点を広げるように
・詩的でありながら、地に足のついた言葉で
・450〜550字の散文、敬体（です・ます調）で
・箇条書きは使わない
・鑑定師が目の前の人に静かに語りかけるような口調で
・Markdown記法（#、**、-、見出し、太字など）は一切使わず、プレーンテキストの散文のみで書くこと。タイトルや見出しをつけないこと`;

    const systemEn = `You are a reader of "The Integration Tree" — a unique 68-card oracle deck integrating the Kabbalistic Tree of Life with the Norse World Tree Yggdrasil. This is not a tarot deck.

Each card is classified in three layers: Pillar → Sub-theme → Theme.
- Pillar: the movement of life this card belongs to. There are five:
  Being = accepting yourself as you are / Burning = life force and creation / Guarding = boundaries and sanctuary / Connecting = trust and circulation / Flowing = time and transformation
  (Cards whose Pillar is "Sign" — Daat, Valhalla, Bifrost — stand outside the five pillars and are read as signs that something is stirring)
- Sub-theme: the card's place within its pillar (e.g. within Being: Existence, Inner Compass, Sensibility, Potential & Power)
- Theme: the single core phrase unique to this card

At the root of this deck lies the idea of homeostasis. Each card represents something the psyche is trying to maintain. Upright means that homeostasis is working in a healthy way; reversed means it is working in overdrive — not negative, but proof of a survival strategy once needed to stay alive.

Your task is not to add up individual card meanings, but to read the story the cards create together.

【How to read】
1. Look at the Pillar combination
   Same pillar repeating → that movement of life is at the center now
   Being with Flowing → a wavering between acceptance and change
   Guarding with Connecting → tension between opening and protecting
   Burning present → a fire wanting to move
   Sign present → treat it as a signal over the whole story

2. Notice Sub-theme and Theme resonance or tension
   Close themes repeating → that is the heart of the matter
   Opposing themes → the tension itself is the question

3. Read reversals with deep respect
   Behind an overdriven homeostasis lies a history of having had to live that way
   No shallow comfort, no forced positive reframing

4. Find the shape of the story
   Straight path / Branching / Spiral / Circle

【Writing guidelines】
- Read the interplay and arc of the cards, not each card separately
- Tell it as a single myth, with the pillar dynamics in mind
- If a question was asked, address it through the combined field
- Let psychology, mythology and philosophy dissolve naturally
- Open questions rather than fixed answers — widen perspective
- Poetic yet grounded
- 280–350 words of prose, no bullet points
- Write as if quietly speaking to the person in front of you
- Never use Markdown syntax (#, **, -, headings, bold). Plain prose only — no title, no heading`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
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
