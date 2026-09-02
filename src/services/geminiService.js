// =====================================
// AI SERVICE WITH AUTOMATIC FALLBACK
// Gemini -> Groq -> OpenRouter
// =====================================

const PROVIDER_ORDER = (process.env.AI_PROVIDER_ORDER || "gemini,groq,openrouter")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 45000);

const getGeminiClient = async () => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const { GoogleGenAI } = await import("@google/genai");

  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });
};

const extractJson = (text) => {
  if (!text) throw new Error("AI returned an empty response");

  const cleaned = String(text)
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const firstObject = cleaned.indexOf("{");
    const lastObject = cleaned.lastIndexOf("}");
    const firstArray = cleaned.indexOf("[");
    const lastArray = cleaned.lastIndexOf("]");

    const objectCandidate =
      firstObject !== -1 && lastObject > firstObject
        ? cleaned.slice(firstObject, lastObject + 1)
        : null;

    const arrayCandidate =
      firstArray !== -1 && lastArray > firstArray
        ? cleaned.slice(firstArray, lastArray + 1)
        : null;

    for (const candidate of [objectCandidate, arrayCandidate]) {
      if (!candidate) continue;
      try {
        return JSON.parse(candidate);
      } catch (_) {}
    }

    throw new Error(`AI returned invalid JSON: ${cleaned.slice(0, 500)}`);
  }
};

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const getErrorMessage = async (response) => {
  let body = "";

  try {
    body = await response.text();
  } catch (_) {}

  return `${response.status} ${response.statusText}${body ? ` - ${body.slice(0, 1000)}` : ""}`;
};

const callGemini = async (prompt, mode) => {
  const ai = await getGeminiClient();

  const isQuestions = mode === "questions";

  const response = await ai.models.generateContent({
    model: isQuestions
      ? process.env.GEMINI_QUESTIONS_MODEL || "gemini-3.5-flash-lite"
      : process.env.GEMINI_REPORT_MODEL || "gemini-3.5-flash",
    contents: prompt,
    config: isQuestions
      ? {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: "minimal" },
          maxOutputTokens: 2048,
          responseSchema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                type: {
                  type: "string",
                  enum: ["technical", "behavioral", "situational"],
                },
              },
              required: ["question", "type"],
            },
          },
        }
      : {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: "low" },
          maxOutputTokens: 8192,
          responseSchema: {
            type: "object",
            properties: {
              overallScore: { type: "number" },
              performanceLevel: { type: "string" },
              summary: { type: "string" },
              strengths: { type: "array", items: { type: "string" } },
              weaknesses: { type: "array", items: { type: "string" } },
              recommendations: { type: "array", items: { type: "string" } },
              questionEvaluations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    questionIndex: { type: "number" },
                    score: { type: "number" },
                    correctness: { type: "number" },
                    relevance: { type: "number" },
                    communication: { type: "number" },
                    feedback: { type: "string" },
                  },
                  required: [
                    "questionIndex",
                    "score",
                    "correctness",
                    "relevance",
                    "communication",
                    "feedback",
                  ],
                },
              },
            },
            required: [
              "overallScore",
              "performanceLevel",
              "summary",
              "strengths",
              "weaknesses",
              "recommendations",
              "questionEvaluations",
            ],
          },
        },
  });

  return extractJson(response.text);
};

const callOpenAICompatible = async ({
  url,
  apiKey,
  model,
  prompt,
  mode,
  headers = {},
}) => {
  if (!apiKey) throw new Error("API key is not configured");

  const systemMessage =
    mode === "questions"
      ? "Return only valid JSON. For questions, return an object with a questions array."
      : "Return only valid JSON matching the requested interview report structure.";

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...headers,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;

  if (!text) throw new Error("Provider returned no content");

  const parsed = extractJson(text);

  if (mode === "questions") {
    return Array.isArray(parsed) ? parsed : parsed.questions;
  }

  return parsed;
};

const callGroq = async (prompt, mode) => {
  return callOpenAICompatible({
    url: "https://api.groq.com/openai/v1/chat/completions",
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    prompt,
    mode,
  });
};

const callOpenRouter = async (prompt, mode) => {
  return callOpenAICompatible({
    url: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || "openrouter/free",
    prompt,
    mode,
    headers: {
      ...(process.env.OPENROUTER_SITE_URL
        ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL }
        : {}),
      ...(process.env.OPENROUTER_APP_NAME
        ? { "X-Title": process.env.OPENROUTER_APP_NAME }
        : {}),
    },
  });
};

const providerCalls = {
  gemini: callGemini,
  groq: callGroq,
  openrouter: callOpenRouter,
};

const runWithFallback = async (prompt, mode) => {
  const errors = [];

  for (const provider of PROVIDER_ORDER) {
    const callProvider = providerCalls[provider];

    if (!callProvider) {
      errors.push(`${provider}: unknown provider`);
      continue;
    }

    try {
      console.log(`[AI] Trying ${provider} for ${mode}...`);
      const result = await callProvider(prompt, mode);

      if (mode === "questions" && !Array.isArray(result)) {
        throw new Error("Questions response is not an array");
      }

      console.log(`[AI] ${provider} succeeded for ${mode}`);
      return result;
    } catch (error) {
      const message = error?.message || String(error);
      errors.push(`${provider}: ${message}`);
      console.error(`[AI] ${provider} failed for ${mode}:`, message);
      console.log(`[AI] Falling back to next provider...`);
    }
  }

  throw new Error(`All AI providers failed for ${mode}. ${errors.join(" | ")}`);
};

// =====================================
// GENERATE QUESTIONS
// =====================================

const generateInterviewQuestions = async (
  resumeText,
  jobRole,
  difficulty = "medium",
  questionCount = 10
) => {
  const prompt = `
You are an expert technical interviewer.

Create a realistic interview for the candidate based strictly on their resume
and the target job role.

Target Job Role:
${jobRole}

Difficulty Level:
${difficulty}

Number of Questions:
${questionCount}

Candidate Resume:
${resumeText}

Generate exactly ${questionCount} interview questions.

Requirements:
- 5 technical questions
- 3 behavioral questions
- 2 situational questions
- Questions must be relevant to the target job role.
- All questions must match the requested difficulty level.
- Use the exact difficulty level provided by the frontend; do not change it.
- Questions should use technologies/projects mentioned in the resume where appropriate.
- Do not ask questions unrelated to the candidate's profile.
- Make questions suitable for an actual job interview.
- Keep each question concise.

Return JSON in this exact shape:
{
  "questions": [
    { "question": "...", "type": "technical|behavioral|situational" }
  ]
}
`;

  return runWithFallback(prompt, "questions");
};

// =====================================
// FINAL REPORT
// =====================================

const generateFinalReport = async (interview) => {
  const answers = interview.questions
    .map(
      (q, index) => `
Question ${index + 1}:
${q.question}

Candidate Answer:
${q.answer}
`
    )
    .join("\n");

  const prompt = `
You are an expert technical interview evaluator.

Candidate Job Role:
${interview.jobRole}

Candidate Resume:
${interview.resumeText}

The candidate completed a ${interview.questions.length}-question interview.

Here are all questions and answers:
${answers}

Analyze the candidate's complete interview performance.

Calculate:
- Overall score out of 100
- Question-wise score
- Correctness
- Relevance
- Communication
- Detailed feedback for every answer
- Overall strengths
- Overall weaknesses
- Practical recommendations
- Performance level
- Professional summary

Important:
- Evaluate answers based on the actual question.
- Compare answers with the candidate's resume where relevant.
- Do not reward claims that contradict the resume.
- Do not invent experience or skills.
- Give realistic interview-level feedback.
- Keep feedback professional and useful.

Return ONLY valid JSON in exactly this shape:
{
  "overallScore": 0,
  "performanceLevel": "",
  "summary": "",
  "strengths": [],
  "weaknesses": [],
  "recommendations": [],
  "questionEvaluations": [
    {
      "questionIndex": 1,
      "score": 0,
      "correctness": 0,
      "relevance": 0,
      "communication": 0,
      "feedback": ""
    }
  ]
}
`;

  return runWithFallback(prompt, "report");
};

module.exports = {
  generateInterviewQuestions,
  generateFinalReport,
};
