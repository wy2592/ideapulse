const MODERATION_URL = "https://api.openai.com/v1/moderations";
const DEFAULT_LLM_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_CLASSIFIER_MODEL = "gpt-4.1-mini";

export async function allowIdea(text, options = {}) {
  const {
    moderationApiKey = process.env.OPENAI_MODERATION_KEY || process.env.OPENAI_KEY,
    ideaApiKey = process.env.IDEA_LLM_API_KEY || process.env.OPENAI_KEY,
    ideaBaseUrl = process.env.IDEA_LLM_BASE_URL || DEFAULT_LLM_BASE_URL,
    skipAI = process.env.SKIP_AI === "true",
    moderationEnabled = process.env.MODERATION_ENABLED !== "false",
    ideaCheck = process.env.IDEA_CHECK !== "false",
    classifierModel = process.env.IDEA_LLM_MODEL || process.env.OPENAI_CLASSIFIER_MODEL || DEFAULT_CLASSIFIER_MODEL,
    timeoutMs = 3000
  } = options;

  if (skipAI) return true;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (moderationEnabled && moderationApiKey) {
      const safe = await passesModeration(text, moderationApiKey, controller.signal);
      if (!safe) return false;
    }
    if (!ideaCheck || !ideaApiKey) return true;
    return await isLegitimateIdea(text, ideaApiKey, ideaBaseUrl, classifierModel, controller.signal);
  } catch {
    return true;
  } finally {
    clearTimeout(timeout);
  }
}

async function passesModeration(text, apiKey, signal) {
  const response = await fetch(MODERATION_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: text
    }),
    signal
  });

  if (!response.ok) return true;
  const result = await response.json();
  return !result.results?.some((entry) => entry.flagged);
}

async function isLegitimateIdea(text, apiKey, baseUrl, model, signal) {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are IdeaPulse's lightweight idea gatekeeper.",
            "Decide whether the user's text is a real business need, project idea, creative concept, product plan, feature request, or practical problem worth sending to voters.",
            "Allow rough, short, early-stage ideas.",
            "Reject only clear spam, gibberish, repeated characters, harassment, sexual content, illegal requests, private credential dumps, ads, or text that is not an idea/request/plan.",
            "Return JSON only: {\"allow\":true|false,\"reason\":\"short\"}."
          ].join(" ")
        },
        {
          role: "user",
          content: text
        }
      ]
    }),
    signal
  });

  if (!response.ok) return true;
  const result = await response.json();
  const output = result.choices?.[0]?.message?.content;
  if (!output) return true;
  const parsed = JSON.parse(extractJson(output));
  return parsed.allow !== false;
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, "");
}

function extractJson(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}
