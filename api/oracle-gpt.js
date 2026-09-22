const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    belief: { type: "string" },
    background: { type: "string" },
    view: { type: "string" },
    column: { type: "string" }
  },
  required: ["belief", "background", "view", "column"]
};

const SYSTEM_PROMPT = `あなたは、問いと象徴カードを材料に内省を助ける日本語の書き手です。
占いやカードを未来の断定、診断、権威的な助言として扱わず、「ひとつの見方」として差し出してください。
相手の体験を決めつけず、「〜かもしれません」「〜ということはないでしょうか」を自然に使います。
怖がらせる表現、因果の断定、依存を促す表現、医療・法律・金融上の指示は避けます。

4つの文章を作ってください。
belief: 願いを止めているかもしれない思い込みを、責めずに具体化する。120〜220字。
background: その思い込みが、過去に自分を守るため必要だった可能性を丁寧に描く。220〜380字。
view: 願いが叶ったあとの視点から、内側で何が変わったのかを情景とともに描く。280〜450字。
column: カード名・体系・キーワードから、その象徴や由来についての短い小話を書く。事実に確信がない場合は神話的・象徴的な読みだと明示する。120〜220字。

問いの内容をそのまま長く反復せず、カード情報を機械的に列挙しないでください。出力は指定されたJSONだけにしてください。`;

function send(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.end(JSON.stringify(body));
}

function readOutputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "POSTのみ利用できます" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return send(res, 500, { error: "OPENAI_API_KEY が設定されていません" });
  }

  let body = req.body || {};
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return send(res, 400, { error: "JSONの形式が正しくありません" });
    }
  }
  const { mode, lang, question, card } = body;
  if (mode !== "lens1" || lang !== "ja") {
    return send(res, 400, { error: "未対応のモードです" });
  }
  if (typeof question !== "string" || !question.trim() || question.length > 1000) {
    return send(res, 400, { error: "問いは1〜1000文字で入力してください" });
  }
  if (!card || typeof card.name !== "string" || typeof card.type !== "string") {
    return send(res, 400, { error: "カード情報が正しくありません" });
  }

  const input = {
    question: question.trim(),
    card: {
      name: card.name.slice(0, 100),
      type: card.type.slice(0, 100),
      keywords: String(card.keywords || "").slice(0, 1200),
      upright: String(card.upright || "").slice(0, 2000),
      reversed: String(card.reversed || "").slice(0, 2000)
    }
  };

  try {
    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        store: false,
        instructions: SYSTEM_PROMPT,
        input: JSON.stringify(input),
        max_output_tokens: 1800,
        text: {
          format: {
            type: "json_schema",
            name: "oracle_lens",
            strict: true,
            schema: OUTPUT_SCHEMA
          }
        }
      })
    });

    const response = await openaiResponse.json();
    if (!openaiResponse.ok) {
      console.error("OpenAI API error", response?.error?.code, response?.error?.message);
      return send(res, openaiResponse.status >= 500 ? 502 : 500, {
        error: "GPTから結果を受け取れませんでした"
      });
    }

    const outputText = readOutputText(response);
    if (!outputText) throw new Error("OpenAI response did not contain output_text");
    const result = JSON.parse(outputText);
    return send(res, 200, result);
  } catch (error) {
    console.error("oracle-gpt", error);
    return send(res, 500, { error: "読み取り中にエラーが起きました" });
  }
}

export { OUTPUT_SCHEMA, SYSTEM_PROMPT, readOutputText };
