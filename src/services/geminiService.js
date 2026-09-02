const getGeminiClient = async () => {
  const { GoogleGenAI } = await import("@google/genai");

  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });
};

// =====================================
// GENERATE QUESTIONS
// =====================================

const generateInterviewQuestions = async (resumeText, jobRole) => {
  const ai = await getGeminiClient();

  const prompt = `
You are an expert technical interviewer.

Create a realistic interview for the candidate based strictly on their resume
and the target job role.

Target Job Role:
${jobRole}

Candidate Resume:
${resumeText}

Generate exactly 10 interview questions.

Requirements:
- 5 technical questions
- 3 behavioral questions
- 2 situational questions
- Questions must be relevant to the target job role.
- Questions should use technologies/projects mentioned in the resume where appropriate.
- Do not ask questions unrelated to the candidate's profile.
- Make questions suitable for an actual job interview.
- Keep each question concise.
- Return ONLY JSON.
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: prompt,

      config: {
        responseMimeType: "application/json",

        thinkingConfig: {
          thinkingLevel: "minimal",
        },

        maxOutputTokens: 2048,

        responseSchema: {
          type: "array",

          items: {
            type: "object",

            properties: {
              question: {
                type: "string",
              },

              type: {
                type: "string",
                enum: [
                  "technical",
                  "behavioral",
                  "situational",
                ],
              },
            },

            required: [
              "question",
              "type",
            ],
          },
        },
      },
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini Questions Error:", error);
    throw error;
  }
};


// =====================================
// FINAL REPORT
// =====================================

const generateFinalReport = async (interview) => {
  const ai = await getGeminiClient();

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

The candidate completed a 10-question interview.

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
- Return ONLY valid JSON.
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,

      config: {
        responseMimeType: "application/json",

        thinkingConfig: {
          thinkingLevel: "low",
        },

        maxOutputTokens: 8192,

        responseSchema: {
          type: "object",

          properties: {
            overallScore: {
              type: "number",
            },

            performanceLevel: {
              type: "string",
            },

            summary: {
              type: "string",
            },

            strengths: {
              type: "array",
              items: {
                type: "string",
              },
            },

            weaknesses: {
              type: "array",
              items: {
                type: "string",
              },
            },

            recommendations: {
              type: "array",
              items: {
                type: "string",
              },
            },

            questionEvaluations: {
              type: "array",

              items: {
                type: "object",

                properties: {
                  questionIndex: {
                    type: "number",
                  },

                  score: {
                    type: "number",
                  },

                  correctness: {
                    type: "number",
                  },

                  relevance: {
                    type: "number",
                  },

                  communication: {
                    type: "number",
                  },

                  feedback: {
                    type: "string",
                  },
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

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini Final Report Error:", error);
    throw error;
  }
};


module.exports = {
  generateInterviewQuestions,
  generateFinalReport,
};