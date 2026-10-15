const AGNES_ENDPOINT = "https://apihub.agnes-ai.com/v1/chat/completions";
const MODEL = "agnes-2.5-flash";
const ALLOWED_ORIGINS = new Set([
  "https://virtualaihuman.vercel.app",
  "https://aplusachiever2025-create.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);

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

async function askAgnes(messages, maxTokens = 6000) {
  const key = process.env.AGNES_API_KEY;
  if (!key) throw new Error("服务器尚未设置 AGNES_API_KEY 环境变量。");
  const response = await fetch(AGNES_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.1, max_tokens: maxTokens })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error?.message === "string" ? data.error.message.slice(0, 250) : `Agnes API returned HTTP ${response.status}`;
    throw new Error(message);
  }
  const choice = data?.choices?.[0];
  const rawContent = choice?.message?.content;
  const content = typeof rawContent === "string"
    ? rawContent
    : Array.isArray(rawContent)
      ? rawContent.map(part => typeof part?.text === "string" ? part.text : "").join("\n")
      : "";
  if (!content.trim()) {
    const finish = typeof choice?.finish_reason === "string" ? choice.finish_reason : "unknown";
    const hasReasoning = Boolean(choice?.message?.reasoning_content);
    throw new Error(
      `Agnes 已响应，但没有可用识别文字（finish_reason=${finish}${hasReasoning ? "；模型只返回了推理内容" : ""}）。请重试；若再次发生，请查看 Vercel 的 /api/ocr 运行日志。`
    );
  }
  return content.trim();
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "仅支持 POST 请求。" });
  const origin = req.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return res.status(403).json({ ok: false, error: "此网页来源不在允许列表中。" });

  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const imageDataUrl = body.imageDataUrl;
    if (typeof imageDataUrl !== "string" || !/^data:image\/(png|jpeg|webp);base64,/.test(imageDataUrl)) {
      return res.status(400).json({ ok: false, error: "请提供有效的 JPG、PNG 或 WebP 图片。" });
    }
    if (imageDataUrl.length > 3_500_000) return res.status(413).json({ ok: false, error: "照片太大，请压缩至约 2.5 MB 以下后重试。" });
    const purpose = body.purpose === "task" ? "task" : "essay";
    const prompt = purpose === "task"
      ? "Read this photograph of a Singapore primary school English writing task or worksheet. Transcribe all visible printed and handwritten instructions exactly, including the writing topic, scenario, audience, bullet points, numbered content requirements, labels and captions. Preserve the order and structure using line breaks and numbered/bulleted lists where possible. Do not answer the task or invent missing text. If a word is unreadable, write [unclear]. If the page contains picture prompts or visual information that cannot be transcribed as text, add a brief clearly labelled note describing only the visible relevant details; do not guess the intended story. Return the transcription and any visual note only."
      : "Transcribe the English handwriting in this image exactly as written. Preserve original spelling, grammar, punctuation, paragraph breaks, and apparent mistakes. Do not correct, rewrite, grade, or improve the student's writing. If a word is unreadable, use [unclear]. Return only the transcription. This is likely a Singapore primary school English composition.";
    const text = await askAgnes([{ role: "user", content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: imageDataUrl } }
    ] }], 6000);
    return res.status(200).json({ ok: true, text });
  } catch (error) {
    return res.status(502).json({ ok: false, error: error instanceof Error ? error.message.slice(0, 400) : "服务器处理失败。" });
  }
};
