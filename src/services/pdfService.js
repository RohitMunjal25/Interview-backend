const PDFDocument = require("pdfkit");
const cloudinary = require("../config/cloudinary");
const { PassThrough } = require("stream");

const generateInterviewReport = async (interview) => {
  const fileName = `interview-report-${interview._id}`;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 50,
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

    // =========================
    // TITLE
    // =========================

    doc
      .fontSize(22)
      .text("AI Interview Analysis Report", {
        align: "center",
      });

    doc.moveDown();

    doc
      .fontSize(12)
      .text(`Job Role: ${interview.jobRole}`);

    doc.text(`Interview ID: ${interview._id}`);

    doc.moveDown();

    // =========================
    // SCORE
    // =========================

    doc
      .fontSize(18)
      .text(`Overall Score: ${interview.overallScore}/100`);

    doc.moveDown();

    // =========================
    // SUMMARY
    // =========================

    doc
      .fontSize(16)
      .text("Performance Summary");

    doc.moveDown(0.5);

    doc
      .fontSize(11)
      .text(
        interview.finalReport?.summary ||
          "No summary available."
      );

    doc.moveDown();

    // =========================
    // PERFORMANCE LEVEL
    // =========================

    doc
      .fontSize(14)
      .text(
        `Performance Level: ${
          interview.finalReport?.performanceLevel ||
          "N/A"
        }`
      );

    doc.moveDown();

    // =========================
    // STRENGTHS
    // =========================

    doc.fontSize(16).text("Strengths");

    doc.moveDown(0.5);

    (interview.strengths || []).forEach((item) => {
      doc.fontSize(11).text(`• ${item}`);
    });

    doc.moveDown();

    // =========================
    // WEAKNESSES
    // =========================

    doc
      .fontSize(16)
      .text("Areas for Improvement");

    doc.moveDown(0.5);

    (interview.weaknesses || []).forEach((item) => {
      doc.fontSize(11).text(`• ${item}`);
    });

    doc.moveDown();

    // =========================
    // RECOMMENDATIONS
    // =========================

    doc.fontSize(16).text("Recommendations");

    doc.moveDown(0.5);

    (interview.recommendations || []).forEach(
      (item) => {
        doc.fontSize(11).text(`• ${item}`);
      }
    );

    doc.moveDown();

    // =========================
    // QUESTION-WISE ANALYSIS
    // =========================

    doc
      .fontSize(16)
      .text("Question-wise Performance");

    doc.moveDown();

    interview.questions.forEach((q, index) => {
      doc
        .fontSize(12)
        .text(`${index + 1}. ${q.question}`);

      doc
        .fontSize(10)
        .text(`Type: ${q.type}`);

      doc
        .fontSize(10)
        .text(
          `Score: ${
            q.evaluation?.score || 0
          }/100`
        );

      doc
        .fontSize(10)
        .text(
          `Correctness: ${
            q.evaluation?.correctness || 0
          }/100`
        );

      doc
        .fontSize(10)
        .text(
          `Relevance: ${
            q.evaluation?.relevance || 0
          }/100`
        );

      doc
        .fontSize(10)
        .text(
          `Communication: ${
            q.evaluation?.communication || 0
          }/100`
        );

      doc
        .fontSize(10)
        .text(
          `Feedback: ${
            q.evaluation?.feedback ||
            "No feedback available."
          }`
        );

      doc.moveDown();
    });

    doc.end();
  });
};

module.exports = {
  generateInterviewReport,
};