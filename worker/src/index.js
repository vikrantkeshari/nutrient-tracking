// Cloudflare Worker Proxy for Groq & GitHub Models Vision API with Failover & Retry Queue

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};

export default {
  async fetch(request, env, ctx) {
    // 1. CORS Preflight Handler
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });
    }

    try {
      const payload = await request.json();
      const { image, text } = payload;

      if (!image && !text) {
        return new Response(JSON.stringify({ error: "Please provide either an image base64 or text description." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }

      // 2. Execute analysis with failover and retry mechanisms
      const analysisResult = await analyzeFoodWithFallback(image, text, env);

      return new Response(JSON.stringify(analysisResult), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || "Internal Server Error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });
    }
  }
};

// Orchestrates primary API call and fallback failover
async function analyzeFoodWithFallback(image, text, env) {
  const systemPrompt = "You are a precise nutrition analysis bot. Analyze the food in the image or text. Estimate the macronutrients (Calories, Protein, Carbs, Fats). You must respond with ONLY a raw, valid JSON object containing: { \"food_item\": string, \"calories\": number, \"protein_g\": number, \"carbs_g\": number, \"fat_g\": number, \"confidence\": number (range 0.0 to 1.0), \"explanation\": string }. Do not include markdown wraps or backticks in your response.";

  // Define contents array
  const userContent = [];
  if (text) {
    userContent.push({ type: "text", text: `Food description: ${text}` });
  }
  if (image) {
    userContent.push({
      type: "image_url",
      image_url: { url: image } // Base64 Data URL, e.g., data:image/jpeg;base64,...
    });
  }

  // 1. Try Groq (Llama 3.2 11B Vision)
  if (env.GROQ_API_KEY) {
    try {
      console.log("Calling Groq API...");
      const result = await callWithRetry(
        () => queryGroq(userContent, systemPrompt, env.GROQ_API_KEY),
        2,
        1000
      );
      return result;
    } catch (groqError) {
      console.error("Groq API failed. Attempting fallback to GitHub Models...", groqError);
    }
  } else {
    console.warn("GROQ_API_KEY not bound. Trying fallback directly.");
  }

  // 2. Fallback: GitHub Models (gpt-4o-mini)
  if (env.GITHUB_TOKEN) {
    try {
      console.log("Calling GitHub Models API...");
      const result = await callWithRetry(
        () => queryGitHubModels(userContent, systemPrompt, env.GITHUB_TOKEN),
        2,
        1000
      );
      return result;
    } catch (githubError) {
      console.error("GitHub Models API failed as well.", githubError);
      throw new Error("All AI providers (Groq and GitHub Models) failed to resolve the request.");
    }
  }

  throw new Error("No API keys found in the Worker environment. Please set GROQ_API_KEY or GITHUB_TOKEN.");
}

// Queue retry executor for HTTP 429 Rate Limits
async function callWithRetry(apiCallFn, retries, delay) {
  try {
    return await apiCallFn();
  } catch (error) {
    // If rate limited and we have retries remaining, wait and try again
    if (error.status === 429 && retries > 0) {
      console.warn(`Rate limit (429) hit. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callWithRetry(apiCallFn, retries - 1, delay * 2);
    }
    throw error;
  }
}

// Groq API client
async function queryGroq(content, systemPrompt, apiKey) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.2-11b-vision-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: content }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Groq HTTP error: ${response.status} - ${errText}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content.trim());
}

// GitHub Models API client
async function queryGitHubModels(content, systemPrompt, token) {
  const response = await fetch("https://models.inference.ai.azure.com/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: content }
      ],
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`GitHub Models HTTP error: ${response.status} - ${errText}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  let textContent = data.choices[0].message.content.trim();
  // Strip any markdown backticks if returned despite system instructions
  if (textContent.startsWith("```")) {
    textContent = textContent.replace(/^```json\s*/i, "").replace(/```$/, "");
  }
  return JSON.parse(textContent);
}
