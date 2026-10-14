const AGNES_ENDPOINT = "https://apihub.agnes-ai.com/v1/chat/completions";
const MODEL = "agnes-2.5-flash";
const ALLOWED_ORIGINS = new Set([
  "https://virtualaihuman.vercel.app",
  "https://aplusachiever2025-create.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);
const ASSESSMENT_VERSION = "SG-WA-2026.1";

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

const ASSESSMENT_SECTIONS = ["taskUnderstanding","genuineErrors","strengths","improvementPriorities","optionalSuggestions","revisionPractice","organisationAndTone"];

function countEnglishWords(text) {
  return (String(text || "").match(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g) || []).length;
}
function getRequestedWordRange(taskPrompt) {
  const text = String(taskPrompt || "");
  const patterns = [
    /(?:suggested|recommended|target)?\s*(?:word\s*count|length)[^\n.]{0,50}?(\d{2,3})\s*[-–—]\s*(\d{2,3})\s*words?/i,
    /(?:suggested|recommended|write|length)[^\n.]{0,35}?(\d{2,3})\s*[-–—]\s*(\d{2,3})\s*words?/i
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
  try { report = JSON.parse(cleaned); } catch { throw new Error("Assessment 服务没有返回有效报告。请稍后重试。"); }
  if (!report || typeof report !== "object" || Array.isArray(report)) throw new Error("Assessment 报告结构无效。");
  for (const key of ASSESSMENT_SECTIONS) if (!Array.isArray(report[key])) throw new Error("Assessment 报告缺少必要栏目：" + key);
  if (["score","scores","total","marks","band","percentage","rating"].some(key => Object.prototype.hasOwnProperty.call(report, key))) throw new Error("报告包含评分字段；本次未返回结果，请重试。");\n  if (report.taskUnderstanding.length > 15 || report.genuineErrors.length > 30 || report.strengths.length > 6 || report.improvementPriorities.length > 3 || report.optionalSuggestions.length > 3 || report.revisionPractice.length > 3 || report.organisationAndTone.length > 6) throw new Error("Assessment 报告内容超出合理范围。");
  const stringsOnly = arr => arr.every(x => typeof x === "string" && x.trim());
  if (!report.taskUnderstanding.every(x => x && typeof x.requirement === "string" && ["Met","Partly met","Needs attention","Not applicable"].includes(x.status) && typeof x.evidence === "string" && typeof x.explanation === "string")) throw new Error("任务要求诊断格式无效。");
  if (!report.genuineErrors.every(x => x && typeof x.original === "string" && typeof x.correction === "string" && typeof x.explanation === "string")) throw new Error("真实错误栏目格式无效。");
  for (const key of ["strengths","improvementPriorities","optionalSuggestions","revisionPractice","organisationAndTone"]) if (!stringsOnly(report[key])) throw new Error("Assessment 栏目格式无效：" + key);
  const wordCount = countEnglishWords(studentText), wordRange = getRequestedWordRange(taskPrompt);
  const wordNote = wordRange ? `Server-calculated word count: ${wordCount}; suggested range: ${wordRange.min}–${wordRange.max} words; ${wordCount >= wordRange.min && wordCount <= wordRange.max ? "within range" : "outside range"}. This is a separate note, not an automatic quality judgement.` : `Server-calculated word count: ${wordCount} words. This is a separate note, not an automatic quality judgement.`;
  return [
    "SG PRIMARY ENGLISH WRITING COACH — WRITING ASSESSMENT",
    `Writing type: ${writingType} | Assessment version: ${ASSESSMENT_VERSION}`,
    wordNote, "", "1. TASK UNDERSTANDING",
    ...(report.taskUnderstanding.length ? report.taskUnderstanding.map((x,n) => `${n+1}. [${x.status}] ${x.requirement}\n   Evidence: ${x.evidence || "—"}\n   Explanation: ${x.explanation}`) : ["No explicit task requirements were listed."]),
    "", "2. GENUINE ERRORS (only clear errors)",
    ...(report.genuineErrors.length ? report.genuineErrors.map((x,n) => `${n+1}. “${x.original}” → “${x.correction}”\n   Why: ${x.explanation}`) : ["No clear grammar, spelling or punctuation errors identified. Do not invent errors."]),
    "", "3. WHAT THE STUDENT IS DOING WELL", ...(report.strengths.length ? report.strengths.map(x => "• " + x) : ["No specific strength was provided."]),
    "", "4. PRIORITIES FOR IMPROVEMENT (not necessarily errors)", ...(report.improvementPriorities.length ? report.improvementPriorities.map(x => "• " + x) : ["No major improvement priority identified."]),
    "", "5. ORGANISATION, FORMAT AND TONE", ...(report.organisationAndTone.length ? report.organisationAndTone.map(x => "• " + x) : ["No additional observations."]),
    "", "7. TRY THIS YOURSELF", ...(report.revisionPractice.length ? report.revisionPractice.map((x,n) => `${n+1}. ${x}`) : ["Re-read the writing and revise one priority."]),
    "", "No marks or total score are assigned. The goal is to identify real issues and help the student improve."
  ].join("\n");
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

    const system = `You are SG Primary English Writing Coach for Singapore primary English, ${grade}. This product performs WRITING ASSESSMENT for learning, NOT MARKING. Never assign marks, scores, bands, percentages or a total. Do not output scoring dimensions. Help the child identify real issues and improve, kindly and specifically.
Writing type: ${writingType}. Assess only against the exact task and grade. Use evidence from the student's text.
Return ONLY valid JSON: {"taskUnderstanding":[{"requirement":"string","status":"Met|Partly met|Needs attention|Not applicable","evidence":"short exact quote or empty string","explanation":"specific explanation"}],"genuineErrors":[{"original":"exact original span","correction":"corrected text","explanation":"simple explanation"}],"strengths":["specific evidenced strength"],"improvementPriorities":["up to 3 genuine learning needs supported by evidence"],"optionalSuggestions":["up to 3 clearly optional enrichment ideas; never imply these are required or missing from the task"],"organisationAndTone":["specific observation"],"revisionPractice":["1–3 small revision tasks or learning questions"]}.
Rules:
- List explicit task requirements only. Situational Writing: check purpose, audience, format and every stated content point. Picture Composition: assess only visible/provided events. Continuous Writing: assess relevance, idea development, paragraphing, coherence and language.
- genuineErrors contains only clear grammar, spelling or punctuation errors with exact original text, correction and reason. If none, return an empty array. Never invent errors or treat a style preference as an error.
- strengths must cite specific effective choices from the writing.
- Give at most 3 genuine improvement priorities, ordered by learning value. Put optional extensions only in optionalSuggestions. Never suggest extra requirements (such as a rain plan) unless the task asks for them. Clearly state optional suggestions are not errors or missing requirements.
- Provide 1–3 short revision tasks the child can attempt; do not write a complete replacement essay.
- Word count is calculated by the server. Do not estimate it, call it an error or deduct marks. Suggested range is a separate note.
- If no genuine errors are found, do not imply that grammar/spelling/punctuation errors are a problem. Do not include any scoring fields in the JSON.
- No marks, scores, bands, rubrics or numeric quality ratings. This is learning assessment, not an official MOE/SEAB judgement.`;
    const user = `Grade: ${grade}\nWriting type: ${writingType}\n\nEXACT TASK PROMPT AND REQUIREMENTS:\n${taskPrompt}\n\nSTUDENT RESPONSE:\n${studentText}\n\nAssess only against the task requirements above.`;
    const raw = await askAgnes([{ role: "system", content: system }, { role: "user", content: user }], 3000);
    const result = parseAndValidateReport(raw, writingType, studentText, taskPrompt);
    return send(res, 200, { ok: true, result, assessmentVersion: ASSESSMENT_VERSION, model: MODEL });
  } catch (error) {
    return send(res, 502, { ok: false, error: error instanceof Error ? error.message.slice(0, 400) : "服务器处理失败。" });
  }
};
