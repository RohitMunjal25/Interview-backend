const Interview = require("../models/Interview");
const {
  generateInterviewQuestions,
  generateFinalReport,
} = require("../services/geminiService");

const {
  generateInterviewReport,
} = require("../services/pdfService");

const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");
const User = require("../models/User");


// =====================================
// UPLOAD RESUME
// =====================================

const uploadResume = async (req, res) => {
  try {
    const { jobRole } = req.body;

    if (!jobRole) {
      return res.status(400).json({
        success: false,
        message: "Job role is required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Resume file is required",
      });
    }

    const file = req.file;
    let resumeText = "";

    // PDF
    if (file.mimetype === "application/pdf") {
      const parser = new PDFParse({
        data: file.buffer,
      });

      const result = await parser.getText();

      resumeText = result.text;

      await parser.destroy();
    }

    // DOC / DOCX
    else if (
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.mimetype === "application/msword"
    ) {
      const result = await mammoth.extractRawText({
        buffer: file.buffer,
      });

      resumeText = result.value;
    }

    else {
      return res.status(400).json({
        success: false,
        message:
          "Only PDF, DOC and DOCX files are allowed",
      });
    }

    resumeText = resumeText.trim();

    if (!resumeText) {
      return res.status(400).json({
        success: false,
        message: "Could not extract text from resume",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.resume = {
      fileName: file.originalname,
      filePath: null,
      extractedText: resumeText,
      uploadedAt: new Date(),
    };

    await user.save();

    return res.status(200).json({
      success: true,
      message:
        "Resume uploaded and parsed successfully",

      data: {
        jobRole,
        fileName: file.originalname,
        resumeText,
        textLength: resumeText.length,
      },
    });

  } catch (error) {
    console.error(
      "Resume Upload Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to upload and parse resume",
    });
  }
};


// =====================================
// GENERATE QUESTIONS
// =====================================

const generateQuestions = async (req, res) => {
  try {
    const { jobRole } = req.body;

    if (!jobRole) {
      return res.status(400).json({
        success: false,
        message: "Job role is required",
      });
    }

    const user = await User.findById(
      req.user._id
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.resume?.extractedText) {
      return res.status(400).json({
        success: false,
        message:
          "Please upload your resume first",
      });
    }

    const questions =
      await generateInterviewQuestions(
        user.resume.extractedText,
        jobRole
      );

    const interview =
      await Interview.create({
        user: user._id,
        jobRole,
        resumeText:
          user.resume.extractedText,
        questions,
        status: "in_progress",
      });

    return res.status(201).json({
      success: true,
      message:
        "Interview questions generated successfully",

      data: {
        interviewId: interview._id,
        jobRole: interview.jobRole,
        totalQuestions:
          interview.questions.length,
        questions: interview.questions,
      },
    });

  } catch (error) {
    console.error(
      "Generate Questions Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to generate interview questions",
    });
  }
};


// =====================================
// SUBMIT ANSWER
// =====================================

const submitAnswer = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const { questionId, answer } = req.body;

    if (!questionId) {
      return res.status(400).json({
        success: false,
        message: "Question ID is required",
      });
    }

    if (!answer || !answer.trim()) {
      return res.status(400).json({
        success: false,
        message: "Answer is required",
      });
    }

    const interview =
      await Interview.findOne({
        _id: interviewId,
        user: req.user._id,
      });

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: "Interview not found",
      });
    }

    if (interview.status === "completed") {
      return res.status(400).json({
        success: false,
        message:
          "Interview already completed",
      });
    }

    const question =
      interview.questions.id(questionId);

    if (!question) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
      });
    }

    // Save answer
    question.answer = answer.trim();
    question.answerMode = "text";

    await interview.save();

    // Find next unanswered question
    const nextQuestion =
      interview.questions.find(
        (q) =>
          !q.answer ||
          !q.answer.trim()
      );

    // =====================================
    // MORE QUESTIONS REMAIN
    // =====================================

    if (nextQuestion) {
      const answeredQuestions =
        interview.questions.filter(
          (q) =>
            q.answer &&
            q.answer.trim()
        ).length;

      return res.status(200).json({
        success: true,
        message:
          "Answer saved successfully",

        data: {
          interviewId:
            interview._id,

          completed: false,

          answeredQuestions,

          totalQuestions:
            interview.questions.length,

          nextQuestion: {
            questionId:
              nextQuestion._id,

            question:
              nextQuestion.question,

            type:
              nextQuestion.type,
          },
        },
      });
    }


    // =====================================
    // ALL 10 QUESTIONS COMPLETED
    // =====================================

    console.log(
      "All questions answered. Generating final report..."
    );

    const report =
      await generateFinalReport(
        interview
      );


    // =====================================
    // SAVE QUESTION EVALUATIONS
    // =====================================

    if (
      Array.isArray(
        report.questionEvaluations
      )
    ) {
      report.questionEvaluations.forEach(
        (evaluation) => {
          const index =
            evaluation.questionIndex - 1;

          if (
            interview.questions[index]
          ) {
            interview.questions[
              index
            ].evaluation = {
              score:
                evaluation.score,

              correctness:
                evaluation.correctness,

              relevance:
                evaluation.relevance,

              communication:
                evaluation.communication,

              feedback:
                evaluation.feedback,

              fillerWords: 0,
            };
          }
        }
      );
    }


    // =====================================
    // SAVE FINAL REPORT DATA
    // =====================================

    interview.overallScore =
      report.overallScore;

    interview.strengths =
      report.strengths;

    interview.weaknesses =
      report.weaknesses;

    interview.recommendations =
      report.recommendations;

    interview.finalReport = {
      summary:
        report.summary,

      performanceLevel:
        report.performanceLevel,
    };

    interview.status = "completed";

    await interview.save();


    // =====================================
    // GENERATE + UPLOAD PDF
    // =====================================

    const pdf =
      await generateInterviewReport(
        interview
      );

    interview.reportUrl =
      pdf.reportUrl;

    await interview.save();


    // =====================================
    // FINAL RESPONSE
    // =====================================

    return res.status(200).json({
      success: true,

      message:
        "Interview completed successfully",

      data: {
        completed: true,

        interviewId:
          interview._id,

        overallScore:
          interview.overallScore,

        performanceLevel:
          report.performanceLevel,

        summary:
          report.summary,

        strengths:
          report.strengths,

        weaknesses:
          report.weaknesses,

        recommendations:
          report.recommendations,

        questionEvaluations:
          Array.isArray(report.questionEvaluations)
            ? report.questionEvaluations
            : interview.questions.map((q, index) => ({
                questionIndex: index + 1,
                question: q.question,
                type: q.type,
                score: q.evaluation?.score || 0,
                correctness: q.evaluation?.correctness || 0,
                relevance: q.evaluation?.relevance || 0,
                communication: q.evaluation?.communication || 0,
                feedback: q.evaluation?.feedback || "",
                fillerWords: q.evaluation?.fillerWords || 0,
              })),

        reportUrl:
          interview.reportUrl,
      },
    });

  } catch (error) {
    console.error(
      "Submit Answer Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to submit answer",

      error: error.message,
    });
  }
};



// =====================================
// DOWNLOAD INTERVIEW REPORT
// =====================================

const downloadInterviewReport = async (req, res) => {
  try {
    const { interviewId } = req.params;

    const interview = await Interview.findOne({
      _id: interviewId,
      user: req.user._id,
    });

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: "Interview not found",
      });
    }

    if (interview.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Interview report is not ready yet",
      });
    }

    if (!interview.reportUrl) {
      return res.status(404).json({
        success: false,
        message: "Interview report not available",
      });
    }

    const pdfResponse = await fetch(interview.reportUrl);

    if (!pdfResponse.ok) {
      return res.status(500).json({
        success: false,
        message: "Unable to fetch interview report",
      });
    }

    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="interview-report-${interview._id}.pdf"`
    );

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error("Download Report Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to download interview report",
    });
  }
};

module.exports = {
  uploadResume,
  generateQuestions,
  submitAnswer,
  downloadInterviewReport,
};