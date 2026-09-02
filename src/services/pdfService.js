const PDFDocument = require("pdfkit");
const cloudinary = require("../config/cloudinary");
const { PassThrough } = require("stream");
const User = require("../models/User");

const fetchImageBuffer = async (imageUrl) => {
  if (!imageUrl) return null;

  try {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`Image request failed with status ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error("Unable to fetch proctoring image:", error.message);
    return null;
  }
};

// Always format PDF date/time in India timezone
const formatIndiaDateTime = (date) => {
  if (!date) return "N/A";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "N/A";
  }

  return parsedDate.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
};

const generateInterviewReport = async (interview) => {
  const fileName = `interview-report-${interview._id}`;

  let user = interview.user || {};

  if (interview.user && (!user.name || !user.email)) {
    user =
      (await User.findById(interview.user)
        .select("name email")
        .lean()) || {};
  }

  const candidateName =
    user.name || interview.candidateName || "Candidate";

  const candidateEmail =
    user.email || interview.candidateEmail || "N/A";

  const imageUrl = interview.proctoring?.initialImageUrl;

  const imageBuffer = await fetchImageBuffer(imageUrl);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 50,
      size: "A4",
      bufferPages: true,
    });

    const chunks = [];

    doc.on("data", (chunk) => {
      chunks.push(chunk);
    });

    doc.on("end", async () => {
      try {
        const pdfBuffer = Buffer.concat(chunks);

        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: "ai-interview/reports",
            public_id: fileName,
            resource_type: "raw",
          },
          (error, result) => {
            if (error) {
              return reject(error);
            }

            resolve({
              fileName: `${fileName}.pdf`,
              reportUrl: result.secure_url,
              publicId: result.public_id,
            });
          }
        );

        const stream = new PassThrough();

        stream.end(pdfBuffer);
        stream.pipe(uploadStream);
      } catch (error) {
        reject(error);
      }
    });

    doc.on("error", reject);

    // --------------------------------
    // HELPERS
    // --------------------------------

    const section = (title) => {
      doc.moveDown(0.8);

      doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .text(title);

      doc.moveDown(0.35);

      doc.font("Helvetica");
    };

    const line = () => {
      doc.moveDown(0.2);

      doc
        .moveTo(50, doc.y)
        .lineTo(545, doc.y)
        .stroke();

      doc.moveDown(0.4);
    };

    // --------------------------------
    // HEADER
    // --------------------------------

    doc
      .fontSize(24)
      .font("Helvetica-Bold")
      .text("AI Interview Analysis Report", {
        align: "center",
      });

    doc
      .moveDown(0.3)
      .fontSize(10)
      .font("Helvetica")
      .text(
        "AI-powered interview performance assessment",
        {
          align: "center",
        }
      );

    line();

    // --------------------------------
    // CANDIDATE DETAILS
    // --------------------------------

    section("Candidate Details");

    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .text("Name:");

    doc
      .font("Helvetica")
      .text(candidateName);

    doc
      .font("Helvetica-Bold")
      .text("Email:");

    doc
      .font("Helvetica")
      .text(candidateEmail);

    doc
      .font("Helvetica-Bold")
      .text("Job Role:");

    doc
      .font("Helvetica")
      .text(interview.jobRole || "N/A");

    doc
      .font("Helvetica-Bold")
      .text("Interview ID:");

    doc
      .font("Helvetica")
      .text(String(interview._id));

    // FIXED INTERVIEW DATE
    doc
      .font("Helvetica-Bold")
      .text("Interview Date:");

    doc
      .font("Helvetica")
      .text(
        interview.createdAt
          ? formatIndiaDateTime(interview.createdAt)
          : "N/A"
      );

    doc.moveDown(1.2);

    line();

    // --------------------------------
    // OVERALL SCORE
    // --------------------------------

    section("Overall Performance");

    doc
      .fontSize(22)
      .font("Helvetica-Bold")
      .text(
        `${interview.overallScore || 0}/100`,
        {
          align: "center",
        }
      );

    doc
      .moveDown(0.3)
      .fontSize(13)
      .font("Helvetica")
      .text(
        `Performance Level: ${
          interview.finalReport?.performanceLevel || "N/A"
        }`,
        {
          align: "center",
        }
      );

    // --------------------------------
    // PERFORMANCE SUMMARY
    // --------------------------------

    section("Performance Summary");

    doc
      .fontSize(11)
      .font("Helvetica")
      .text(
        interview.finalReport?.summary ||
          "No summary available.",
        {
          lineGap: 4,
        }
      );

    // --------------------------------
    // STRENGTHS
    // --------------------------------

    section("Strengths");

    const strengths = interview.strengths || [];

    if (strengths.length === 0) {
      doc
        .fontSize(11)
        .text("No strengths recorded.");
    } else {
      strengths.forEach((item) => {
        doc
          .fontSize(11)
          .text(`• ${item}`, {
            lineGap: 2,
          });
      });
    }

    // --------------------------------
    // AREAS FOR IMPROVEMENT
    // --------------------------------

    section("Areas for Improvement");

    const weaknesses = interview.weaknesses || [];

    if (weaknesses.length === 0) {
      doc
        .fontSize(11)
        .text(
          "No areas for improvement recorded."
        );
    } else {
      weaknesses.forEach((item) => {
        doc
          .fontSize(11)
          .text(`• ${item}`, {
            lineGap: 2,
          });
      });
    }

    // --------------------------------
    // RECOMMENDATIONS
    // --------------------------------

    section("Recommendations");

    const recommendations =
      interview.recommendations || [];

    if (recommendations.length === 0) {
      doc
        .fontSize(11)
        .text("No recommendations recorded.");
    } else {
      recommendations.forEach((item) => {
        doc
          .fontSize(11)
          .text(`• ${item}`, {
            lineGap: 2,
          });
      });
    }

    // --------------------------------
    // QUESTION-WISE ANALYSIS
    // --------------------------------

    section("Question-wise Analysis");

    (interview.questions || []).forEach(
      (q, index) => {
        if (doc.y > 680) {
          doc.addPage();
        }

        doc
          .fontSize(13)
          .font("Helvetica-Bold")
          .text(`Question ${index + 1}`);

        doc
          .fontSize(11)
          .font("Helvetica-Bold")
          .text("Question:");

        doc
          .font("Helvetica")
          .text(q.question || "N/A", {
            lineGap: 3,
          });

        doc
          .moveDown(0.25)
          .font("Helvetica-Bold")
          .text("Your Answer:");

        doc
          .font("Helvetica")
          .text(
            q.answer?.trim() ||
              "No answer provided.",
            {
              lineGap: 3,
            }
          );

        doc.moveDown(0.25);

        doc
          .font("Helvetica-Bold")
          .text("Answer Type:");

        doc
          .font("Helvetica")
          .text(q.type || "N/A");

        doc
          .font("Helvetica-Bold")
          .text("Answer Mode:");

        doc
          .font("Helvetica")
          .text(q.answerMode || "text");

        doc.moveDown(0.2);

        doc
          .font("Helvetica-Bold")
          .text("Evaluation:");

        doc
          .font("Helvetica")
          .text(
            `Overall Score: ${
              q.evaluation?.score || 0
            }/100`
          )
          .text(
            `Correctness: ${
              q.evaluation?.correctness || 0
            }/100`
          )
          .text(
            `Relevance: ${
              q.evaluation?.relevance || 0
            }/100`
          )
          .text(
            `Communication: ${
              q.evaluation?.communication || 0
            }/100`
          )
          .text(
            `Filler Words: ${
              q.evaluation?.fillerWords || 0
            }`
          );

        doc.moveDown(0.2);

        doc
          .font("Helvetica-Bold")
          .text("AI Feedback:");

        doc
          .font("Helvetica")
          .text(
            q.evaluation?.feedback ||
              "No feedback available.",
            {
              lineGap: 3,
            }
          );

        line();
      }
    );

    // --------------------------------
    // INTERVIEW PROCTORING
    // --------------------------------

    section("Interview Proctoring");

    const startedAt =
      interview.proctoring?.startedAt;

    const endedAt =
      interview.proctoring?.endedAt;

    const endReason =
      interview.proctoring?.endReason ||
      "Completed normally";

    doc
      .fontSize(11)
      .font("Helvetica")
      .text(
        `Started At: ${
          startedAt
            ? formatIndiaDateTime(startedAt)
            : "N/A"
        }`
      )
      .text(
        `Ended At: ${
          endedAt
            ? formatIndiaDateTime(endedAt)
            : "N/A"
        }`
      )
      .text(
        `End Reason: ${endReason}`
      );

    // --------------------------------
    // START CAPTURE IMAGE
    // --------------------------------

    if (imageBuffer) {
      doc
        .moveDown(0.4)
        .font("Helvetica-Bold")
        .text("Interview Start Capture:");

      try {
        doc.image(imageBuffer, {
          fit: [180, 180],
          align: "left",
        });
      } catch (error) {
        doc
          .font("Helvetica")
          .text(
            "Captured image could not be embedded in the PDF."
          );
      }
    }

    // --------------------------------
    // FOOTER
    // --------------------------------

    doc
      .moveDown(1)
      .fontSize(9)
      .font("Helvetica")
      .text(
        "Generated automatically by AI Interview Analyzer.",
        {
          align: "center",
        }
      );

    doc.end();
  });
};

module.exports = {
  generateInterviewReport,
};