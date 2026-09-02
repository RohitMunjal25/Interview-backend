const express = require("express");

const protect = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const multer = require("multer");

const proctorUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const {
  uploadResume,
  generateQuestions,
  submitAnswer,
  downloadInterviewReport,
  getInterviewReport,
  startProctoring,
  terminateInterview,
} = require("../controllers/interviewController");

const router = express.Router();

/**
 * @swagger
 * /api/interview/upload-resume:
 *   post:
 *     tags:
 *       - Interview
 *     summary: Upload resume
 *     description: Upload PDF, DOC or DOCX resume along with the selected job role and extract resume text.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - resume
 *               - jobRole
 *             properties:
 *               resume:
 *                 type: string
 *                 format: binary
 *                 description: Resume file in PDF, DOC or DOCX format
 *               jobRole:
 *                 type: string
 *                 description: Job role for the interview
 *                 example: Frontend Developer
 *     responses:
 *       200:
 *         description: Resume uploaded and parsed successfully
 *       400:
 *         description: Resume or job role is missing
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Resume processing failed
 */
router.post(
  "/upload-resume",
  protect,
  upload.single("resume"),
  uploadResume
);

/**
 * @swagger
 * /api/interview/generate-questions:
 *   post:
 *     tags:
 *       - Interview
 *     summary: Generate interview questions
 *     description: Generate resume-based technical, behavioral and situational interview questions using AI.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jobRole
 *             properties:
 *               jobRole:
 *                 type: string
 *                 description: Job role for which interview questions should be generated
 *                 example: Frontend Developer
 *     responses:
 *       200:
 *         description: Interview questions generated successfully
 *       400:
 *         description: Job role or resume is missing
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Failed to generate interview questions
 */
router.post(
  "/generate-questions",
  protect,
  generateQuestions
);

/**
 * @swagger
 * /api/interview/{interviewId}/answer:
 *   post:
 *     tags:
 *       - Interview
 *     summary: Submit interview answer
 *     description: Submit a text answer for a specific question. The final answer triggers AI evaluation and final report generation.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: interviewId
 *         required: true
 *         schema:
 *           type: string
 *         description: Interview MongoDB ID
 *         example: 68a97e92ea9083b47a32d6151
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - questionId
 *               - answer
 *             properties:
 *               questionId:
 *                 type: string
 *                 description: MongoDB ID of the question
 *                 example: 68a97e92ea9083b47a32d6152
 *               answer:
 *                 type: string
 *                 description: Candidate's text answer
 *                 example: I used React because it provides reusable components and efficient UI updates.
 *     responses:
 *       200:
 *         description: Answer submitted successfully
 *       400:
 *         description: Invalid answer, question already answered, or previous question not completed
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Interview or question not found
 *       500:
 *         description: Failed to submit answer
 */
router.post(
  "/:interviewId/answer",
  protect,
  submitAnswer
);

/**
 * @swagger
 * /api/interview/{interviewId}/report/download:
 *   get:
 *     tags:
 *       - Interview
 *     summary: Download interview report
 *     description: Download the completed interview report as a PDF file.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: interviewId
 *         required: true
 *         schema:
 *           type: string
 *         description: Interview MongoDB ID
 *         example: 68a97e92ea9083b47a32d6151
 *     responses:
 *       200:
 *         description: Interview report PDF
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Invalid interview ID
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Interview does not belong to the authenticated user
 *       404:
 *         description: Interview report not found
 *       500:
 *         description: Failed to download interview report
 */

/**
 * @swagger
 * /api/interview/{interviewId}/proctor/start:
 *   post:
 *     tags:
 *       - Interview
 *     summary: Start interview proctoring
 *     description: Upload the initial webcam capture to Cloudinary and save its URL in the interview record.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: interviewId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Interview started and webcam image saved
 *       400:
 *         description: Interview cannot be started or image is missing
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Interview not found
 *       500:
 *         description: Failed to start interview
 */
router.post(
  "/:interviewId/proctor/start",
  protect,
  proctorUpload.single("image"),
  startProctoring
);

/**
 * @swagger
 * /api/interview/{interviewId}/proctor/terminate:
 *   post:
 *     tags:
 *       - Interview
 *     summary: Terminate interview
 *     description: Terminate an active interview, for example when the user switches browser tabs.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: interviewId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: User switched browser tab
 *     responses:
 *       200:
 *         description: Interview terminated
 *       400:
 *         description: Interview is already ended
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Interview not found
 *       500:
 *         description: Failed to terminate interview
 */
router.post(
  "/:interviewId/proctor/terminate",
  protect,
  terminateInterview
);

router.get(
  "/:interviewId/report/download",
  protect,
  downloadInterviewReport
);

/**
 * @swagger
 * /api/interview/{interviewId}/report:
 *   get:
 *     tags:
 *       - Interview
 *     summary: Get interview report JSON
 *     description: Get the complete completed interview report as JSON.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: interviewId
 *         required: true
 *         schema:
 *           type: string
 *         description: Interview MongoDB ID
 *         example: 68a97e92ea9083b47a32d6151
 *     responses:
 *       200:
 *         description: Complete interview report JSON
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid interview ID
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Interview does not belong to the authenticated user
 *       404:
 *         description: Interview report not found
 *       500:
 *         description: Failed to download interview report
 */
router.get(
  "/:interviewId/report",
  protect,
  getInterviewReport
);

module.exports = router;