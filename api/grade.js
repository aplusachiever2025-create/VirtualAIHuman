const AGNES_ENDPOINT = "https://apihub.agnes-ai.com/v1/chat/completions";
const MODEL = "agnes-2.5-flash";
const ALLOWED_ORIGINS = new Set([
  "https://virtualaihuman.vercel.app",
  "https://aplusachiever2025-create.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);
const RUBRIC_VERSION = "SG-EL-2026.1";

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
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.2, max_tokens: maxTokens })
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

    const system = `You are SG Primary English Writing Coach, an educational feedback assistant for Singapore Primary English, ${grade}. Writing type: ${writingType}.
Use the exact task prompt supplied by the user; never invent additional requirements. Be supportive and age-appropriate.
Use writing-type-specific educational assessment priorities:
- For Picture Composition: assess use of relevant picture information, coherent narrative sequence, character/event development, relevant descriptive details and a fitting ending, alongside language accuracy. Do not require details that the prompt/images do not establish.
- For Continuous Writing: assess relevance to the given topic or prompt, development of the main idea/story with relevant details, coherence and paragraphing, progression and ending where appropriate, vocabulary/sentence variety and language accuracy. Do not assume pictures are required.
- For Situational Writing: assess each explicit content point, purpose and intended reader, suitability of format and tone, clarity and relevance, and language accuracy.
These are project teaching priorities informed by the Singapore primary English curriculum, not a claim that MOE publishes one universal detailed rubric or identical marks for every school task. Adapt expectations to the stated grade and exact task.
Return a structured report with these sections:
1. Task fulfilment: list every explicit requirement from the task and label Fully addressed / Partially addressed / Missing. Quote evidence from the student's response.
2. Genuine grammar and spelling errors: quote exact original words, provide a correction and a simple explanation. Do not label optional style preferences as errors.
3. Language strengths.
4. Optional improvements: keep separate from actual errors and do not deduct marks merely for optional additions.
5. Organisation, format and tone.
6. AI reference score only if you can state a transparent, consistent scoring breakdown. Label it clearly as non-official and do not claim it is an MOE/SEAB mark.
If no applicable official detailed rubric is supplied, do not pretend a self-defined score is official. For P4/P5/P6 school tasks, do not automatically apply P6 PSLE marks.
Configuration version: ${RUBRIC_VERSION} (internal project version, not an official MOE/SEAB version).
Official references for context:
MOE Primary English Language Syllabus 2020: https://www.moe.gov.sg/-/media/files/primary/2020-english-language-primary.pdf
SEAB PSLE formats examined in 2026: https://www.seab.gov.sg/psle/psle-formats-examined-in-2026/
If the task prompt does not include an official rubric, clearly say the feedback is an educational AI reference, not an official mark.`;
    const user = `Grade: ${grade}\nWriting type: ${writingType}\n\nEXACT TASK PROMPT AND REQUIREMENTS:\n${taskPrompt}\n\nSTUDENT RESPONSE:\n${studentText}\n\nAssess only against the task requirements above.`;
    const result = await askAgnes([{ role: "system", content: system }, { role: "user", content: user }], 3000);
    return send(res, 200, { ok: true, result, rubricVersion: RUBRIC_VERSION, model: MODEL });
  } catch (error) {
    return send(res, 502, { ok: false, error: error instanceof Error ? error.message.slice(0, 400) : "服务器处理失败。" });
  }
};
