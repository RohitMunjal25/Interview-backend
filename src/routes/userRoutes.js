const express = require("express");

const protect = require("../middleware/authMiddleware");

const {
  getDashboard,
  getProfile,
} = require("../controllers/userController");

const router = express.Router();

/**
 * @swagger
 * /api/user/dashboard:
 *   get:
 *     tags:
 *       - User
 *     summary: Get user dashboard
 *     description: Get authenticated user's profile, resume, interview statistics and recent completed interviews.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data fetched successfully
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Server error
 */
router.get(
  "/dashboard",
  protect,
  getDashboard
);

/**
 * @swagger
 * /api/user/profile:
 *   get:
 *     tags:
 *       - User
 *     summary: Get user profile
 *     description: Get authenticated user's profile information and resume details.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched successfully
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Server error
 */
router.get(
  "/profile",
  protect,
  getProfile
);

module.exports = router;