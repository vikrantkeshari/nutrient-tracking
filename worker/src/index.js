// Cloudflare Worker — AI meal analysis proxy
// Primary: Google Gemini Flash (free tier). Fallback: GitHub Models gpt-4o-mini.
// CORS locked to ALLOWED_ORIGINS (comma-separated env var; localhost always allowed in dev).

const SYSTEM_PROMPT =
  'You are a precise nutrition analysis bot. Analyze the food in the image or text. ' +
  'Estimate the macronutrients. Respond with ONLY a raw, valid JSON object: ' +
  '{ "food_item": string, "calories": number, "protein_g": number, "carbs_g": number, ' +
  '"fat_g": number, "confidence": number (0.0-1.0), "explanation": string }. ' +
  'No markdown, no backticks.';

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const ok =
    allowed.includes(origin) ||
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1");
  return {
    "Access-Control-Allow-Origin": ok ? origin : (allowed[0] || ""),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

const json = (body, status, cors) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors }
  });

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST")
      return json({ error: "Method not allowed. Use POST." }, 405, cors);

    try {
      const { image, text } = await request.json();
      if (!image && !text)
        return json({ error: "Provide an image (base64 data URL) or a text description." }, 400, cors);

      const result = await analyzeWithFallback(image, text, env);
      return json(result, 200, cors);
    } catch (err) {
      return json({ error: err.message || "Internal Server Error" }, 500, cors);
    }
  }
};

async function analyzeWithFallback(image, text, env) {
  const errors = [];

  // 1. Gemini Flash (primary — free tier, vision included)
  if (env.GEMINI_API_KEY) {
    try {
      return await callWithRetry(() => queryGemini(image, text, env.GEMINI_API_KEY), 2, 1000);
    } catch (e) { errors.push(`Gemini: ${e.message}`); }
  } else errors.push("Gemini: GEMINI_API_KEY not set");

  // 2. GitHub Models gpt-4o-mini (fallback)
  if (env.GITHUB_TOKEN) {
    try {
      return await callWithRetry(() => queryGitHubModels(image, text, env.GITHUB_TOKEN), 2, 1000);
    } catch (e) { errors.push(`GitHub Models: ${e.message}`); }
  } else errors.push("GitHub Models: GITHUB_TOKEN not set");

  throw new Error("All AI providers failed. " + errors.join(" | "));
}

// Exponential backoff on 429 (free-tier rate limits are the expected failure mode)
async function callWithRetry(fn, retries, delay) {
  try {
    return await fn();
  } catch (error) {
    if (error.status === 429 && retries > 0) {
      await new Promise(r => setTimeout(r, delay));
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

function parseModelJson(raw) {
  let t = raw.trim();
  if (t.startsWith("```")) t = t.replace(/^```(json)?\s*/i, "").replace(/```\s*$/, "");
  const out = JSON.parse(t);
  // Normalize: some models return strings for numbers
  for (const k of ["calories", "protein_g", "carbs_g", "fat_g", "confidence"])
    out[k] = Number(out[k]) || 0;
  if (!out.food_item) out.food_item = "Unknown meal";
  return out;
}

async function queryGemini(image, text, apiKey) {
  const parts = [];
  if (text) parts.push({ text: `Food description: ${text}` });
  if (image) {
    const m = image.match(/^data:(image\/\w+);base64,(.+)$/s);
    if (!m) throw new Error("Image must be a base64 data URL");
    parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
  }

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
      })
    }
  );
  if (!res.ok) {
    const err = new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("Gemini returned no content");
  return parseModelJson(raw);
}

async function queryGitHubModels(image, text, token) {
  const content = [];
  if (text) content.push({ type: "text", text: `Food description: ${text}` });
  if (image) content.push({ type: "image_url", image_url: { url: image } });

  const res = await fetch("https://models.inference.ai.azure.com/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content }
      ],
      temperature: 0.1
    })
  });
  if (!res.ok) {
    const err = new Error(`GitHub Models HTTP ${res.status}: ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return parseModelJson(data.choices[0].message.content);
}
