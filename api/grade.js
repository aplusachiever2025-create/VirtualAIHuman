const AGNES_ENDPOINT = "https://apihub.agnes-ai.com/v1/chat/completions";
const MODEL = "agnes-2.5-flash";
const ALLOWED_ORIGINS = new Set([
  "https://virtualaihuman.vercel.app",
  "https://aplusachiever2025-create.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);
const RUBRIC_VERSION = "SG-EL-2026.2";

function setCors(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

function send(res, status, data) {
  res.status(status).json(data);
}

async function askAgnes(messages, maxTokens = 2400) {
  const key = process.env.AGNES_API_KEY;
  if (!key) throw new Error("服务器尚未设置 AGNES_API_KEY 环境变量。");
  const response = await fetch(AGNES_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0, max_tokens: maxTokens })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error?.message === "string"
      ? data.error.message.slice(0, 250)
      : `Agnes API returned HTTP ${response.status}`;
    throw new Error(message);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Agnes API 没有返回可用文字。");
  return content.trim();
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "仅支持 POST 请求。" });
  const origin = req.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return send(res, 403, { ok: false, error: "此网页来源不在允许列表中。" });
  }

  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const grade = String(body.grade || "");
    const writingType = String(body.writingType || "");
    const taskPrompt = String(body.taskPrompt || "").trim();
    const studentText = String(body.studentText || "").trim();

    if (!["P4", "P5", "P6"].includes(grade)) return send(res, 400, { ok: false, error: "年级必须是 P4、P5 或 P6。" });
    if (!["Situational Writing", "Picture Composition", "Continuous Writing"].includes(writingType)) return send(res, 400, { ok: false, error: "不支持的写作类型。" });
    if (!taskPrompt || taskPrompt.length > 12000) return send(res, 400, { ok: false, error: "请填写题目；题目长度上限为 12,000 字符。" });
    if (!studentText || studentText.length > 20000) return send(res, 400, { ok: false, error: "请填写作文；作文长度上限为 20,000 字符。" });

    const system = `You are SG Primary English Writing Coach for Singapore primary English, ${grade}.\nReturn a structured report using the fixed project rubric below. This rubric is project-defined, not an official MOE/SEAB rubric. Use only the exact task supplied; do not invent requirements or details. Be supportive and age-appropriate.\n\nFIXED SCORING: use a total of exactly 24 marks, never switch to another scale. Keep each dimension name and maximum exactly as listed:\nFor Situational Writing: Content points 12 (four explicit points scored 0–3 each; 0 missing/irrelevant, 1 limited attempt with major information absent, 2 main point addressed but incomplete/unclear, 3 clear and sufficient); Purpose and reader 3 (0 not addressed, 1 unclear, 2 clear but indirect/uneven, 3 clear and reader-appropriate); Format and tone 3 (0 seriously unsuitable, 1 notable mismatches, 2 generally suitable/minor omission, 3 suitable); Language accuracy and expression 6 (0–1 frequent errors impede meaning, 2–3 noticeable errors but understandable, 4–5 mostly accurate, 6 consistently accurate and clear for grade).\nFor Picture Composition: Relevant picture events and task relevance 8 (0–2 major events missing/irrelevant, 3–4 some relevant events but important gaps, 5–6 main events covered with minor gaps, 7–8 relevant visible/prompted events covered accurately); Story development and organisation 6 (0–1 hard to follow, 2–3 basic sequence/weak links, 4–5 clear sequence and adequate development, 6 coherent well-paced story); Vocabulary and expression 4 (0 unclear, 1 limited, 2 suitable and understandable, 3 effective in places, 4 consistently effective for grade); Grammar, spelling and punctuation 6 (0–1 frequent errors impede meaning, 2–3 noticeable errors, 4–5 mostly accurate, 6 consistently accurate).\nFor Continuous Writing: Relevance and development of ideas 8 (0–2 off-topic/little development, 3–4 relevant but limited/uneven, 5–6 developed with supporting details, 7–8 focused and well-developed); Organisation and coherence 6 (0–1 hard to follow, 2–3 basic structure/weak links, 4–5 clear progression, 6 coherent purposeful structure); Vocabulary and expression 4 (0 unclear, 1 limited, 2 suitable and understandable, 3 effective in places, 4 consistently effective for grade); Grammar, spelling and punctuation 6 (0–1 frequent errors impede meaning, 2–3 noticeable errors, 4–5 mostly accurate, 6 consistently accurate).\n\nApply expectations appropriate to ${grade}; do not automatically apply P6 PSLE marks to P4/P5. For Situational Writing, assess each supplied content point separately. A request for permission must be judged in context of the whole message; do not require a fixed phrase if purpose is clear. For Picture Composition, never require details not shown or stated. For Continuous Writing, do not assume pictures or extra requirements.\nTask fulfilment: list every explicit requirement, label Fully addressed / Partially addressed / Missing / Not applicable, and quote short exact evidence. Do not penalise for details the task did not request.\nErrors: list only genuine grammar, spelling or punctuation errors with exact original span, correction and simple explanation. Keep optional style suggestions separate and do not count them as errors. Do not deduct marks automatically for optional improvements.\nReturn exactly these sections:\n1. Task fulfilment with requirement, status, evidence and reason.\n2. Genuine grammar and spelling errors.\n3. Language strengths.\n4. Optional improvements (not errors).\n5. Organisation, format and tone.\n6. AI reference score with exact dimensions, each score/max, brief evidence-based reason, and total /24. Sum the dimensions correctly. If you cannot apply the rubric consistently, say so instead of inventing another scale.\nConfiguration version: ${RUBRIC_VERSION}. This is a project reference score, not an official MOE/SEAB result.`;
    const user = `Grade: ${grade}\nWriting type: ${writingType}\n\nEXACT TASK PROMPT AND REQUIREMENTS:\n${taskPrompt}\n\nSTUDENT RESPONSE:\n${studentText}\n\nAssess only against the task requirements above.`;
    const result = await askAgnes([{ role: "system", content: system }, { role: "user", content: user }], 3000);
    return send(res, 200, { ok: true, result, rubricVersion: RUBRIC_VERSION, model: MODEL });
  } catch (error) {
    return send(res, 502, { ok: false, error: error instanceof Error ? error.message.slice(0, 400) : "服务器处理失败。" });
  }
};
