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

const RUBRIC_DIMENSIONS = {
  "Situational Writing": [["Content points",12],["Purpose and reader",3],["Format and tone",3],["Language accuracy and expression",6]],
  "Picture Composition": [["Relevant picture events and task relevance",8],["Story development and organisation",6],["Vocabulary and expression",4],["Grammar, spelling and punctuation",6]],
  "Continuous Writing": [["Relevance and development of ideas",8],["Organisation and coherence",6],["Vocabulary and expression",4],["Grammar, spelling and punctuation",6]]
};

function countEnglishWords(text) {
  return (String(text || "").match(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g) || []).length;
}
function getRequestedWordRange(taskPrompt) {
  const text = String(taskPrompt || "");
  const patterns = [
    /(?:suggested|recommended|target)?\\s*(?:word\\s*count|length)[^\\n.]{0,50}?(\\d{2,3})\\s*[-–—]\\s*(\\d{2,3})\\s*words?/i,
    /(?:suggested|recommended|write|length)[^\\n.]{0,35}?(\\d{2,3})\\s*[-–—]\\s*(\\d{2,3})\\s*words?/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const min = Number(match[1]), max = Number(match[2]);
      if (Number.isInteger(min) && Number.isInteger(max) && min <= max) return { min, max };
    }
  }
  return null;
}
function parseAndValidateReport(raw, writingType, studentText, taskPrompt) {
  const cleaned = raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  let report;
  try { report = JSON.parse(cleaned); } catch { throw new Error("评分服务没有返回有效的结构化报告。为避免显示未经校验的分数，本次未返回评分；请稍后重试。"); }
  if (!report || typeof report !== "object" || Array.isArray(report)) throw new Error("评分报告结构无效，本次未返回分数。");
  const expected = RUBRIC_DIMENSIONS[writingType];
  if (!Array.isArray(report.scores) || report.scores.length !== expected.length) throw new Error("评分维度不完整或有多余维度；本次未返回分数。");
  let sum = 0;
  for (let i = 0; i < expected.length; i++) {
    const item = report.scores[i]; const [name, max] = expected[i];
    if (!item || item.dimension !== name || item.max !== max || !Number.isInteger(item.score) || item.score < 0 || item.score > max || typeof item.reason !== "string" || !item.reason.trim()) throw new Error("评分维度、满分或分项分数未通过校验；本次未返回分数。");
    sum += item.score;
  }
  if (!Number.isInteger(report.total) || report.total !== sum || report.total < 0 || report.total > 24) throw new Error("总分与分项分数不一致；本次未返回分数。");
  if (!Array.isArray(report.fulfilment) || !Array.isArray(report.errors) || !Array.isArray(report.strengths) || !Array.isArray(report.improvements) || !Array.isArray(report.organisationTone)) throw new Error("评分报告缺少必要栏目；本次未返回分数。");
  const statuses = new Set(["Fully addressed", "Partially addressed", "Missing", "Not applicable"]);
  for (const item of report.fulfilment) {
    if (!item || typeof item.requirement !== "string" || !statuses.has(item.status) || typeof item.evidence !== "string" || typeof item.reason !== "string") throw new Error("题目要求核对栏目的结构无效；本次未返回分数。");
  }
  const stringsOnly = arr => arr.every(x => typeof x === "string");
  if (!report.errors.every(x => x && typeof x.original === "string" && typeof x.correction === "string" && typeof x.explanation === "string") || !stringsOnly(report.strengths) || !stringsOnly(report.improvements) || !stringsOnly(report.organisationTone)) throw new Error("报告栏目格式无效；本次未返回分数。");
  if (report.errors.length === 0) {
    const languageDimension = writingType === "Situational Writing" ? "Language accuracy and expression" : "Grammar, spelling and punctuation";
    const languageScore = report.scores.find(x => x.dimension === languageDimension);
    if (languageScore && languageScore.score < languageScore.max &&
        /(?:grammar|spelling|punctuation)\\s+(?:errors?|mistakes?)|(?:errors?|mistakes?)\\s+in\\s+(?:grammar|spelling|punctuation)/i.test(languageScore.reason)) {
      throw new Error("语言分数理由与“没有明确语言错误”的报告互相矛盾；本次未返回分数，请重试。");
    }
  }
  const wordCount = countEnglishWords(studentText);
  const wordRange = getRequestedWordRange(taskPrompt);
  const wordCountLine = wordRange
    ? `Word count (server-calculated): ${wordCount}; requested range: ${wordRange.min}–${wordRange.max} words; ${wordCount >= wordRange.min && wordCount <= wordRange.max ? "within range" : "outside range"}. Word count is reported separately and is not an automatic mark deduction.`
    : `Word count (server-calculated): ${wordCount} words. Word count is reported separately and is not an automatic mark deduction unless the task explicitly makes it a scored requirement.`;
  const lines = [
    wordCountLine, "", "1. Task fulfilment",
    ...(report.fulfilment.length ? report.fulfilment.map((x,i) => `${i+1}. [${x.status}] ${x.requirement}\n   Evidence: ${x.evidence || "—"}\n   Reason: ${x.reason}`) : ["No explicit requirements were listed by the model."]),
    "", "2. Genuine grammar and spelling errors",
    ...(report.errors.length ? report.errors.map((x,i) => `${i+1}. “${x.original}” → “${x.correction}”\n   ${x.explanation}`) : ["No clear grammar or spelling errors identified."]),
    "", "3. Language strengths", ...(report.strengths.length ? report.strengths.map(x => `• ${x}`) : ["—"]),
    "", "4. Optional improvements (not errors)", ...(report.improvements.length ? report.improvements.map(x => `• ${x}`) : ["—"]),
    "", "5. Organisation, format and tone", ...(report.organisationTone.length ? report.organisationTone.map(x => `• ${x}`) : ["—"]),
    "", "6. AI reference score (project rubric; not an official MOE/SEAB result)",
    ...report.scores.map(x => `• ${x.dimension}: ${x.score}/${x.max} — ${x.reason}`),
    `TOTAL: ${report.total}/24`, `Rubric version: ${RUBRIC_VERSION}`
  ];
  return lines.join("\n");
};

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

    const system = `You are SG Primary English Writing Coach for Singapore primary English, ${grade}.\nReturn a structured report using the fixed project rubric below. This rubric is project-defined, not an official MOE/SEAB rubric. Use only the exact task supplied; do not invent requirements or details. Be supportive and age-appropriate.\n\nFIXED SCORING: use a total of exactly 24 marks, never switch to another scale. Keep each dimension name and maximum exactly as listed:\nFor Situational Writing: Content points 12 (four explicit points scored 0–3 each; 0 missing/irrelevant, 1 limited attempt with major information absent, 2 main point addressed but incomplete/unclear, 3 clear and sufficient); Purpose and reader 3 (0 not addressed, 1 unclear, 2 clear but indirect/uneven, 3 clear and reader-appropriate); Format and tone 3 (0 seriously unsuitable, 1 notable mismatches, 2 generally suitable/minor omission, 3 suitable); Language accuracy and expression 6 (0–1 frequent errors impede meaning, 2–3 noticeable errors but understandable, 4–5 mostly accurate, 6 consistently accurate and clear for grade).\nFor Picture Composition: Relevant picture events and task relevance 8 (0–2 major events missing/irrelevant, 3–4 some relevant events but important gaps, 5–6 main events covered with minor gaps, 7–8 relevant visible/prompted events covered accurately); Story development and organisation 6 (0–1 hard to follow, 2–3 basic sequence/weak links, 4–5 clear sequence and adequate development, 6 coherent well-paced story); Vocabulary and expression 4 (0 unclear, 1 limited, 2 suitable and understandable, 3 effective in places, 4 consistently effective for grade); Grammar, spelling and punctuation 6 (0–1 frequent errors impede meaning, 2–3 noticeable errors, 4–5 mostly accurate, 6 consistently accurate).\nFor Continuous Writing: Relevance and development of ideas 8 (0–2 off-topic/little development, 3–4 relevant but limited/uneven, 5–6 developed with supporting details, 7–8 focused and well-developed); Organisation and coherence 6 (0–1 hard to follow, 2–3 basic structure/weak links, 4–5 clear progression, 6 coherent purposeful structure); Vocabulary and expression 4 (0 unclear, 1 limited, 2 suitable and understandable, 3 effective in places, 4 consistently effective for grade); Grammar, spelling and punctuation 6 (0–1 frequent errors impede meaning, 2–3 noticeable errors, 4–5 mostly accurate, 6 consistently accurate).\n\nApply expectations appropriate to ${grade}; do not automatically apply P6 PSLE marks to P4/P5. For Situational Writing, assess each supplied content point separately. A request for permission must be judged in context of the whole message; do not require a fixed phrase if purpose is clear. For Picture Composition, never require details not shown or stated. For Continuous Writing, do not assume pictures or extra requirements.\nTask fulfilment: list every explicit requirement, label Fully addressed / Partially addressed / Missing / Not applicable, and quote short exact evidence. Do not penalise for details the task did not request.\nWord count: do not estimate the student response length. The server calculates the word count separately. Do not include word count as a task-fulfilment item and do not deduct marks solely because the response is outside a suggested word range; report the count and range separately. If the task explicitly requires a length, explain it as a separate compliance note, not an invented grammar error.\nErrors: list only genuine grammar, spelling or punctuation errors with exact original span, correction and simple explanation. Keep optional style suggestions separate and do not count them as errors. Do not deduct marks automatically for optional improvements. If errors is empty, do not claim that grammar/spelling/punctuation errors caused a language-score deduction. Every score reason must explain the awarded mark using evidence; if language marks are withheld for expression or clarity rather than a genuine error, state that distinction explicitly.\nReturn ONLY valid JSON, with no markdown fences or text outside JSON, matching this schema exactly: {"fulfilment":[{"requirement":"string","status":"Fully addressed|Partially addressed|Missing|Not applicable","evidence":"short exact quote or empty string","reason":"string"}],"errors":[{"original":"exact original span","correction":"correction","explanation":"simple explanation"}],"strengths":["string"],"improvements":["string"],"organisationTone":["string"],"scores":[{"dimension":"exact dimension name listed for this writing type","score":0,"max":0,"reason":"brief evidence-based reason"}],"total":24}. Include every score dimension exactly once and no extra dimensions. Scores and max must be integers. The total must equal the sum of score values and must be out of 24. For Situational Writing, use exactly: Content points (12), Purpose and reader (3), Format and tone (3), Language accuracy and expression (6). For Picture Composition, use exactly: Relevant picture events and task relevance (8), Story development and organisation (6), Vocabulary and expression (4), Grammar, spelling and punctuation (6). For Continuous Writing, use exactly: Relevance and development of ideas (8), Organisation and coherence (6), Vocabulary and expression (4), Grammar, spelling and punctuation (6). Do not add a score dimension for each content point; discuss content points in fulfilment. Configuration version: ${RUBRIC_VERSION}. This is a project reference score, not an official MOE/SEAB result.`;
    const user = `Grade: ${grade}\nWriting type: ${writingType}\n\nEXACT TASK PROMPT AND REQUIREMENTS:\n${taskPrompt}\n\nSTUDENT RESPONSE:\n${studentText}\n\nAssess only against the task requirements above.`;
    const raw = await askAgnes([{ role: "system", content: system }, { role: "user", content: user }], 3000);
    const result = parseAndValidateReport(raw, writingType, studentText, taskPrompt);
    return send(res, 200, { ok: true, result, rubricVersion: RUBRIC_VERSION, model: MODEL });
  } catch (error) {
    return send(res, 502, { ok: false, error: error instanceof Error ? error.message.slice(0, 400) : "服务器处理失败。" });
  }
};
