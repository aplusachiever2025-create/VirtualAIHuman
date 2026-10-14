const AGNES_ENDPOINT = "https://apihub.agnes-ai.com/v1/chat/completions";
const MODEL = "agnes-2.5-flash";
const ALLOWED_ORIGINS = new Set([
  "https://aplusachiever2025-create.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);
const RUBRIC_VERSION = "SG-EL-2026.1";
const LAST_VERIFIED_DATE = "2026-10-14";

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://aplusachiever2025-create.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}
function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(origin) }
  });
}
async function askAgnes(env, messages, maxTokens=2400) {
  if (!env.AGNES_API_KEY) throw new Error("服务器尚未设置 AGNES_API_KEY secret。");
  const response = await fetch(AGNES_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.AGNES_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const safeMessage = typeof data?.error?.message === "string" ? data.error.message.slice(0, 300) : `Agnes API returned HTTP ${response.status}`;
    throw new Error(safeMessage);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Agnes API 没有返回可用文字。");
  return content.trim();
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, {status:204, headers:corsHeaders(origin)});
    const url = new URL(request.url);
    if (request.method !== "POST") return json({ok:false,error:"仅支持 POST 请求。"},405,origin);
    if (!["/api/ocr","/api/grade"].includes(url.pathname)) return json({ok:false,error:"找不到此 API 路径。"},404,origin);
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ok:false,error:"此网页来源不在允许列表中。"},403,origin);
    let body;
    try { body = await request.json(); } catch { return json({ok:false,error:"请求内容不是有效 JSON。"},400,origin); }
    try {
      if (url.pathname === "/api/ocr") {
        const imageDataUrl = body.imageDataUrl;
        if (typeof imageDataUrl !== "string" || !/^data:image\/(png|jpeg|webp);base64,/.test(imageDataUrl)) {
          return json({ok:false,error:"请提供有效的 JPG、PNG 或 WebP 图片。"},400,origin);
        }
        if (imageDataUrl.length > 7_000_000) return json({ok:false,error:"照片太大，请压缩后重试。"},413,origin);
        const prompt = "Transcribe the English handwriting in this image exactly as written. Preserve original spelling, grammar, punctuation, paragraph breaks, and apparent mistakes. Do not correct, rewrite, grade, or improve the student's writing. If a word is unreadable, use [unclear]. Return only the transcription. This is likely a Singapore primary school English composition.";
        const text = await askAgnes(env, [{role:"user",content:[
          {type:"text",text:prompt},
          {type:"image_url",image_url:{url:imageDataUrl}}
        ]}], 2200);
        return json({ok:true,text},200,origin);
      }
      const grade = String(body.grade || "");
      const writingType = String(body.writingType || "");
      const taskPrompt = String(body.taskPrompt || "").trim();
      const studentText = String(body.studentText || "").trim();
      if (!["P4","P5","P6"].includes(grade)) return json({ok:false,error:"年级必须是 P4、P5 或 P6。"},400,origin);
      if (!["Situational Writing","Picture Composition"].includes(writingType)) return json({ok:false,error:"不支持的写作类型。"},400,origin);
      if (!taskPrompt || taskPrompt.length > 12000) return json({ok:false,error:"请填写题目；题目长度上限为 12,000 字符。"},400,origin);
      if (!studentText || studentText.length > 20000) return json({ok:false,error:"请填写作文；作文长度上限为 20,000 字符。"},400,origin);
      const system = `You are SG Primary English Writing Coach, an educational feedback assistant for Singapore Primary English, ${grade}. Writing type: ${writingType}.
Use the exact task prompt supplied by the user; never invent additional requirements. Be supportive and age-appropriate.
Return a structured report with these sections:
1. Task fulfilment: list every explicit requirement from the task and label Fully addressed / Partially addressed / Missing. Quote evidence from the student's response.
2. Genuine grammar and spelling errors: quote exact original words, provide a correction and a simple explanation. Do not label optional style preferences as errors.
3. Language strengths.
4. Optional improvements: keep separate from actual errors and do not deduct marks merely for optional additions.
5. Organisation, format and tone.
6. AI reference score only if you can state a transparent, consistent scoring breakdown. Label it clearly as non-official and do not claim it is an MOE/SEAB mark.
If no applicable official detailed rubric is supplied, do not pretend a self-defined score is official. For P4/P5/P6 school tasks, do not automatically apply P6 PSLE marks.
Configuration version: ${RUBRIC_VERSION} (internal project version, not an official MOE/SEAB version).
Recorded official-reference check date: ${LAST_VERIFIED_DATE}. Do not claim live verification or automatic monitoring.
Official references for context:
MOE Primary English Language Syllabus 2020: https://www.moe.gov.sg/-/media/files/primary/2020-english-language-primary.pdf
SEAB PSLE formats examined in 2026: https://www.seab.gov.sg/psle/psle-formats-examined-in-2026/
If the task prompt does not include an official rubric, clearly say the feedback is an educational AI reference, not an official mark.`;
      const user = `Grade: ${grade}\nWriting type: ${writingType}\n\nEXACT TASK PROMPT AND REQUIREMENTS:\n${taskPrompt}\n\nSTUDENT RESPONSE:\n${studentText}\n\nAssess only against the task requirements above.`;
      const result = await askAgnes(env, [{role:"system",content:system},{role:"user",content:user}], 3000);
      return json({ok:true,result,rubricVersion:RUBRIC_VERSION,lastVerifiedDate:LAST_VERIFIED_DATE,model:MODEL},200,origin);
    } catch (error) {
      return json({ok:false,error:error instanceof Error ? error.message.slice(0,500) : "服务器处理失败。"},502,origin);
    }
  }
};