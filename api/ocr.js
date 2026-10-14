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

async function askAgnes(messages, maxTokens = 2200) {
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
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Agnes API 没有返回可用文字。");
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
    const prompt = "Transcribe the English handwriting in this image exactly as written. Preserve original spelling, grammar, punctuation, paragraph breaks, and apparent mistakes. Do not correct, rewrite, grade, or improve the student's writing. If a word is unreadable, use [unclear]. Return only the transcription. This is likely a Singapore primary school English composition.";
    const text = await askAgnes([{ role: "user", content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: imageDataUrl } }
    ] }], 2200);
    return res.status(200).json({ ok: true, text });
  } catch (error) {
    return res.status(502).json({ ok: false, error: error instanceof Error ? error.message.slice(0, 400) : "服务器处理失败。" });
  }
};
