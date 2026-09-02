const getGeminiClient = async () => {
  const { GoogleGenAI } = await import("@google/genai");

  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });
};

// =====================================
// GENERATE QUESTIONS
// =====================================

const generateInterviewQuestions = async (resumeText, jobRole, difficulty, questionCount) => {
  const ai = await getGeminiClient();

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
// FRONT-FACE PROCTORING VALIDATION
// =====================================
const validateFrontFaceImage = async (imageBuffer, mimeType = "image/jpeg") => {
  const ai = await getGeminiClient();

  if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || imageBuffer.length < 1000) {
    return {
      valid: false,
      code: "INVALID_OR_EMPTY_IMAGE",
      message: "Camera image is empty or invalid. Please enable the camera and try again.",
    };
  }

  const base64Image = imageBuffer.toString("base64");

  const prompt = `
Analyze this webcam image ONLY for interview proctoring.

Return ONLY valid JSON.

The image is acceptable ONLY when ALL conditions are true:
1. Exactly ONE human face is clearly visible.
2. The face is the candidate's front-facing face.
3. The person is looking approximately directly toward the camera.
4. The face is reasonably centered and clearly visible.
5. The image is not black, blank, severely dark, corrupted, or empty.
6. There are no additional human faces.

Reject the image when:
- no face is visible
- more than one face is visible
- the face is strongly turned left or right
- the face is strongly tilted/up/down
- the face is too small or unclear
- the image is black/blank/dark enough that a face cannot be verified

Do NOT identify the person.
Do NOT infer identity.
Do NOT compare the face with any stored identity.

Return exactly:
{
  "valid": true | false,
  "faceCount": number,
  "frontFacing": true | false,
  "centered": true | false,
  "imageUsable": true | false,
  "code": "FRONT_FACE_VERIFIED | NO_FACE | MULTIPLE_FACES | NOT_FRONT_FACING | FACE_NOT_CENTERED | IMAGE_NOT_USABLE",
  "message": "short user-facing message"
}
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Image,
          },
        },
        {
          text: prompt,
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            valid: { type: "boolean" },
            faceCount: { type: "number" },
            frontFacing: { type: "boolean" },
            centered: { type: "boolean" },
            imageUsable: { type: "boolean" },
            code: { type: "string" },
            message: { type: "string" },
          },
          required: [
            "valid",
            "faceCount",
            "frontFacing",
            "centered",
            "imageUsable",
            "code",
            "message",
          ],
        },
      },
    });

    const result = JSON.parse(response.text);

    return {
      valid:
        result.valid === true &&
        result.faceCount === 1 &&
        result.frontFacing === true &&
        result.centered === true &&
        result.imageUsable === true,
      faceCount: result.faceCount,
      frontFacing: result.frontFacing,
      centered: result.centered,
      imageUsable: result.imageUsable,
      code: result.code,
      message: result.message,
    };
  } catch (error) {
    console.error("Gemini Face Validation Error:", error);
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
  validateFrontFaceImage,
};