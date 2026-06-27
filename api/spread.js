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

    // カード情報をリスト化（role/group/themeも含める）
    const cardList = cards.map((c, i) => {
      const ori = c.orientation === 'reversed'
        ? (isJa ? '逆位置' : 'Reversed')
        : (isJa ? '正位置' : 'Upright');
      const meaning = c.orientation === 'reversed' ? c.reversed : c.upright;
      const pos = c.positionLabel || (isJa ? `${i + 1}枚目` : `Card ${i + 1}`);

      const roleLabel = {
        connector: isJa ? '接続者' : 'Connector',
        threshold: isJa ? '境界・扉' : 'Threshold',
        guardian: isJa ? '守護者' : 'Guardian',
        igniter: isJa ? '点火者' : 'Igniter',
        condenser: isJa ? '凝縮者' : 'Condenser',
        translator: isJa ? '翻訳者' : 'Translator',
        purifier: isJa ? '浄化者' : 'Purifier',
        nurturer: isJa ? '育成者' : 'Nurturer',
        guide: isJa ? '導き手' : 'Guide',
        observer: isJa ? '観察者' : 'Observer',
        chooser: isJa ? '選択者' : 'Chooser',
        challenger: isJa ? '挑戦者' : 'Challenger',
        depths: isJa ? '深淵者' : 'Depths',
        builder: isJa ? '構築者' : 'Builder',
        awakener: isJa ? '覚醒者' : 'Awakener',
        returner: isJa ? '帰還者' : 'Returner',
        center: isJa ? '中心者' : 'Center',
        witness: isJa ? '証人' : 'Witness',
      }[c.role] || c.role;

      const groupLabel = {
        mover: isJa ? '動かし手' : 'Mover',
        diver: isJa ? '潜り手' : 'Diver',
        nurturer: isJa ? '育み手' : 'Nurturer',
        weaver: isJa ? '編み手' : 'Weaver',
        core: isJa ? '核' : 'Core',
      }[c.group] || c.group;

      const themeLabel = {
        existence: isJa ? '存在' : 'Existence',
        consciousness: isJa ? '意識・知性' : 'Consciousness',
        emotion: isJa ? '感情・愛' : 'Emotion',
        will: isJa ? '意志・勇気' : 'Will',
        growth: isJa ? '成長・豊かさ' : 'Growth',
        journey: isJa ? '人生の旅' : 'Journey',
        transformation: isJa ? '変容' : 'Transformation',
        mystery: isJa ? '無意識・神秘' : 'Mystery',
        reality: isJa ? '現実・土台' : 'Reality',
      }[c.theme] || c.theme;

      return isJa
        ? `【${pos}】${c.name}（${ori}）\n役職：${roleLabel}／グループ：${groupLabel}／テーマ：${themeLabel}\n核心：${meaning}`
        : `[${pos}] ${c.name} (${ori})\nRole: ${roleLabel} / Group: ${groupLabel} / Theme: ${themeLabel}\nEssence: ${meaning}`;
    }).join('\n\n');

    const prompt = isJa
      ? `以下のカードが引かれました。${question ? `\n問い：「${question}」\n` : '\n'}${cardList}`
      : `The following cards were drawn.${question ? `\nQuestion: "${question}"\n` : '\n'}${cardList}`;

    const systemJa = `あなたは「The Integration Tree」という独自オラクルデッキの鑑定師です。
このデッキはカバラの生命の樹と北欧神話ユグドラシルを統合した68枚のオラクルで、タロットデッキではありません。

各カードには以下の4つのレイヤーが設定されています：
- 役職（Role）：そのカードが物語の中で果たす機能
  （接続者・境界扉・守護者・点火者・凝縮者・翻訳者・浄化者・育成者・導き手・観察者・選択者・挑戦者・深淵者・構築者・覚醒者・帰還者・中心者・証人）
- グループ（Group）：魂の成長サイクルのどこで働くか
  （動かし手＝外へ向かう力／潜り手＝内へ向かう力／育み手＝保持する力／編み手＝統合する力／核＝存在の中心）
- テーマ（Theme）：そのカードが語る人生の領域

あなたの仕事は、これらのレイヤーを使って、カード単体の意味を足し算するのではなく、カード同士が作り出す「物語」を読むことです。

【読み方の手順】
1. グループの組み合わせを見る
   動かし手が多い→今は外へ出るタイミング
   潜り手が多い→内側を深める時期
   育み手が多い→守り・育てる時期
   編み手が多い→統合・意味づけの時期
   核が登場→物語の中心軸が明確

2. テーマの重なりや対立を見る
   同じテーマが複数→そのテーマが今の中心
   対立するテーマ→その緊張そのものが問いになる

3. 役職から配役を決める
   主人公：今回もっとも中心になるカード
   試練：主人公を揺さぶるカード
   贈り物：最後に残る気づきや可能性
   （必要に応じて：相棒・案内人・橋）

4. 物語の形を見極める
   一本道／分岐／螺旋／円環のどれか

【書き方の指針】
・各カードを個別に繰り返すのではなく、カード同士の関係性・流れ・変容の物語として読む
・配役と物語の形を意識しながら、一つの神話として語る
・問いがある場合はそれに対する全体の答えを示す
・心理学・神話・哲学が自然に溶け込んだ語り口で
・答えを与えるのではなく、問いを深め、視点を広げるように
・詩的でありながら、地に足のついた言葉で
・450〜550字の散文、敬体（です・ます調）で
・箇条書きは使わない
・鑑定師が目の前の人に静かに語りかけるような口調で`;

    const systemEn = `You are a reader of "The Integration Tree" — a unique 68-card oracle deck integrating the Kabbalistic Tree of Life with the Norse World Tree Yggdrasil. This is not a tarot deck.

Each card carries four layers of meaning:
- Role: the function this card plays in the story
  (Connector, Threshold, Guardian, Igniter, Condenser, Translator, Purifier, Nurturer, Guide, Observer, Chooser, Challenger, Depths, Builder, Awakener, Returner, Center, Witness)
- Group: where this card works in the soul's growth cycle
  (Mover=outward force / Diver=inward force / Nurturer=sustaining force / Weaver=integrating force / Core=the center of being)
- Theme: the domain of life this card speaks to

Your task is not to add up individual card meanings, but to read the story the cards create together.

【How to read】
1. Look at the Group balance
   Mostly Movers → time to move outward
   Mostly Divers → time to go inward
   Mostly Nurturers → time to protect and sustain
   Mostly Weavers → time to integrate and find meaning
   Core present → the story has a clear center

2. Notice Theme resonance or tension
   Same themes repeating → that is the heart of the matter
   Opposing themes → the tension itself is the question

3. Assign roles in the story
   Protagonist: the card at the center of this reading
   Trial: the card that challenges or disrupts
   Gift: the awareness or possibility that remains at the end
   (Add Ally, Guide, or Bridge as needed)

4. Find the shape of the story
   Straight path / Branching / Spiral / Circle

【Writing guidelines】
- Read the interplay and arc of the cards, not each card separately
- Tell it as a single myth, with the cast and story shape in mind
- If a question was asked, address it through the combined field
- Let psychology, mythology and philosophy dissolve naturally
- Open questions rather than fixed answers — widen perspective
- Poetic yet grounded
- 280–350 words of prose, no bullet points
- Write as if quietly speaking to the person in front of you`;

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
