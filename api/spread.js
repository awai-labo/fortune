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

// ── 場の見取り図をサーバー側で作る ──
// カードを1枚ずつ並べる前に「全体の分布」を先に見せることで、
// モデルが一枚ずつ順に処理する読み方に落ちるのを防ぐ。
function buildField(cards, isJa) {
  const pillars = new Map();
  const subs = new Map();
  const themes = [];
  const signs = [];
  const reversedNames = [];

  cards.forEach((c) => {
    const p = (isJa ? c.pillar?.ja : c.pillar?.en) || '';
    const s = (isJa ? c.subtheme?.ja : c.subtheme?.en) || '';
    const t = (isJa ? c.theme?.ja : c.theme?.en) || '';
    if (p) pillars.set(p, (pillars.get(p) || 0) + 1);
    if (s) subs.set(s, (subs.get(s) || 0) + 1);
    if (t) themes.push(t);
    if (p === '証' || p === 'Sign') signs.push(c.name);
    if (c.orientation === 'reversed') reversedNames.push(c.name);
  });

  const fmt = (m) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => (v > 1 ? `${k}×${v}` : k))
      .join(isJa ? '／' : ' / ');

  const dupSubs = [...subs.entries()].filter(([, v]) => v > 1);

  if (isJa) {
    const lines = [
      `いのちの動きの分布：${fmt(pillars) || '（不明）'}`,
      `テーマの並び：${themes.join('／') || '（不明）'}`,
      dupSubs.length
        ? `重なっている中テーマ：${dupSubs.map(([k, v]) => `${k}×${v}`).join('／')}`
        : `重なっている中テーマ：なし`,
      `逆位置：${reversedNames.length}枚（全${cards.length}枚中）${reversedNames.length ? '／' + reversedNames.join('・') : ''}`,
      signs.length ? `特別カード：${signs.join('・')}` : `特別カード：なし`,
    ];
    return `■ この場の分布（分析用のデータです。この語句をそのまま鑑定文に書かないこと）\n${lines.join('\n')}`;
  }

  const lines = [
    `Distribution of life-movements: ${fmt(pillars) || '(unknown)'}`,
    `Themes in order: ${themes.join(' / ') || '(unknown)'}`,
    dupSubs.length
      ? `Repeating sub-themes: ${dupSubs.map(([k, v]) => `${k} ×${v}`).join(' / ')}`
      : `Repeating sub-themes: none`,
    `Reversals: ${reversedNames.length} of ${cards.length}${reversedNames.length ? ' — ' + reversedNames.join(', ') : ''}`,
    signs.length ? `Sign cards: ${signs.join(', ')}` : `Sign cards: none`,
  ];
  return `■ Field distribution (analysis data — never reproduce these labels in the reading)\n${lines.join('\n')}`;
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

    // 枚数に応じて字数を決める（一枚ずつ書く余裕を残さない長さにする）
    const n = cards.length;
    const lenJa = n >= 5 ? '550〜650字' : n === 4 ? '480〜580字' : '400〜500字';
    const lenEn = n >= 5 ? '330–400 words' : n === 4 ? '300–360 words' : '250–310 words';

    // 場の見取り図（カードリストより先に置く）
    const field = buildField(cards, isJa);

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
      ? `${question ? `問い：「${question}」\n\n` : ''}${field}\n\n■ 引かれたカード（素材です。この順番で語らないこと）\n\n${cardList}`
      : `${question ? `Question: "${question}"\n\n` : ''}${field}\n\n■ Cards drawn (raw material — do not narrate in this order)\n\n${cardList}`;

    const systemJa = `あなたは「The Integration Tree」という独自オラクルデッキの鑑定師です。
このデッキはカバラの生命の樹と北欧神話ユグドラシルを統合した68枚のオラクルで、タロットデッキではありません。

【最重要】
読者はすでに、一枚ごとの鑑定文を読み終えて、それが画面に表示されたままの状態であなたの文章を読みます。
ですからここで一枚ずつ意味を説明することには、何の価値もありません。
読者が知りたいのはただ一つ、「この${n}枚が同時に出たことは、何を意味するのか」です。
あなたが書くのは要約ではなく、${n}枚が重なって初めて立ち上がる、一つの物語です。

各カードは「柱→中テーマ→テーマ」の三層で分類されています：
- 柱（Pillar）：そのカードが属するいのちの動き。5本あります。
  在る＝自分をそのまま承認する／燃える＝生命力と創造／守る＝境界と聖域／繋がる＝信頼と循環／流れる＝時と変容
  （柱が「証」のカードはダアト・ヴァルハラ・ビフロストの特別カードで、5本の柱の枠外。何かが起きているサインとして読みます）
- 中テーマ（Sub-theme）：柱の中での位置
- テーマ（Theme）：そのカード固有の核となる一語

このデッキの根底にはホメオスタシスの思想があります。各カードは「何かを維持しようとしている恒常性」を表し、正位置はそれが健やかに働いている状態、逆位置はそれが過剰に働いている状態——ネガティブではなく、命がけで守ろうとしてきたサバイバル戦略の証です。

【考えるための手順（これは思考の順番であって、文章の構成ではありません。この見出しを文章に出さないこと）】
1. 柱の分布を見る
   同じ柱が重なる→今のいのちの動きの中心がそこにある
   在ると流れるの同席→承認と変化の間の揺らぎ
   守ると繋がるの同席→開くことと守ることの緊張
   燃えるが混じる→動き出そうとする火がある
   証が登場→物語全体への合図として扱う
2. テーマ同士の重なり・対立を見る。対立する二枚があれば、その緊張そのものが今の問いです
3. 逆位置の枚数と配置を見る。過剰に働いている恒常性の背景には、そう生きざるを得なかった歴史があります
4. 物語の形を見極める：一本道／分岐／螺旋／円環のどれか
5. 全体を貫く一本の芯を、自分の中で一文に言い切る。文章はそこから書き始めます

【文章の構成（厳守）】
・第一段落：カードの名前を一つも書かないこと。この場に何が起きているか、全体の力学だけを書く。ここで芯を渡す。
・第二段落：${n}枚の間にある緊張、あるいは呼応を書く。カード名を出すときは必ず二枚以上の関係の中で出すこと。
・最終段落：問いへの応答と、閉じない余白。問いがなければ、読者がこれから生きる時間へ手渡す言葉で終える。

【絶対にしないこと】
・引かれた順にカードを一枚ずつ取り上げる構成
・「一枚目の◯◯は」「まず◯◯が示すのは」「次に◯◯は」といった書き出し
・カード一枚だけを主語にして、その意味を説明する文
・柱の名前（在る／燃える／守る／繋がる／流れる／証）や「中テーマ」「テーマ」「ホメオスタシス」「恒常性」という語をそのまま文章に書くこと。これらは内部の分類語であり、読者には見せません。意味は日常の言葉に翻訳して語ること
・表面的な慰め、無理なポジティブ変換
・箇条書き、見出し、Markdown記法（#、**、-、太字など）

【文体】
・${lenJa}の散文、敬体（です・ます調）
・心理学・神話・哲学が自然に溶け込んだ語り口
・答えを与えるのではなく、問いを深め、視点を広げるように
・詩的でありながら、地に足のついた言葉で
・鑑定師が目の前の人に静かに語りかけるような口調で
・タイトルや見出しをつけず、本文だけを書くこと`;

    const systemEn = `You are a reader of "The Integration Tree" — a unique 68-card oracle deck integrating the Kabbalistic Tree of Life with the Norse World Tree Yggdrasil. This is not a tarot deck.

【MOST IMPORTANT】
The reader has already read an individual reading for every single card, and those readings are still on screen as they read your text.
So explaining the cards one by one here has no value whatsoever.
There is only one thing they want to know: what it means that these ${n} cards appeared together.
You are not writing a summary. You are writing the single story that only exists when these ${n} cards overlap.

Each card is classified in three layers: Pillar → Sub-theme → Theme.
- Pillar: the movement of life this card belongs to. There are five:
  Being = accepting yourself as you are / Burning = life force and creation / Guarding = boundaries and sanctuary / Connecting = trust and circulation / Flowing = time and transformation
  (Cards whose Pillar is "Sign" — Daat, Valhalla, Bifrost — stand outside the five pillars and are read as signs that something is stirring)
- Sub-theme: the card's place within its pillar
- Theme: the single core phrase unique to this card

At the root of this deck lies the idea of homeostasis. Each card represents something the psyche is trying to maintain. Upright means that homeostasis is working in a healthy way; reversed means it is working in overdrive — not negative, but proof of a survival strategy once needed to stay alive.

【How to think (this is the order of your thinking, NOT the structure of your text — never let these headings appear)】
1. Look at the distribution of pillars
   Same pillar repeating → that movement of life is at the center now
   Being with Flowing → a wavering between acceptance and change
   Guarding with Connecting → tension between opening and protecting
   Burning present → a fire wanting to move
   Sign present → treat it as a signal over the whole story
2. Notice resonance and opposition between themes. Where two cards oppose, that tension itself is the question
3. Note how many reversals there are and where they fall. Behind an overdriven homeostasis lies a history of having had to live that way
4. Find the shape of the story: straight path / branching / spiral / circle
5. Name, in one sentence to yourself, the single spine running through all of it. Begin writing from there

【Structure (strict)】
- First paragraph: do not name a single card. Write only the dynamics of the whole field, and hand over the spine.
- Middle paragraph: write the tension or the answering-back between the ${n} cards. When you name a card, always name it inside a relationship with at least one other.
- Final paragraph: respond to the question and leave it open. If no question was asked, end with words handed toward the time they are about to live.

【Never】
- Take the cards one at a time in the order drawn
- Openings like "The first card, X, means…" / "X shows us…" / "Next, Y…"
- Any sentence whose subject is a single card being explained
- Writing the internal labels themselves: the pillar names (Being / Burning / Guarding / Connecting / Flowing / Sign), or the words "sub-theme", "theme", "homeostasis". These are internal classification terms and are never shown to the reader — translate their meaning into ordinary language
- Shallow comfort or forced positive reframing
- Bullet points, headings, Markdown (#, **, -, bold)

【Voice】
- ${lenEn} of prose
- Let psychology, mythology and philosophy dissolve naturally
- Open questions rather than fixed answers — widen perspective
- Poetic yet grounded
- Write as if quietly speaking to the person in front of you
- No title, no heading — body text only`;

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
