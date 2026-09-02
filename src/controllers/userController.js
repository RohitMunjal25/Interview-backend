const Interview = require("../models/Interview");

const getDashboard = async (req, res) => {
  try {
    const userId = req.user._id;

    // Dashboard attempts should count only completed interviews.
    const totalInterviews = await Interview.countDocuments({
      user: userId,
      status: "completed",
    });

    const completedInterviews = await Interview.countDocuments({
      user: userId,
      status: "completed",
    });

    const completedSessions = await Interview.find({
      user: userId,
      status: "completed",
    })
      .select("jobRole overallScore reportUrl createdAt")
      .sort({ createdAt: -1 });

    let averageScore = 0;

    if (completedSessions.length > 0) {
      const totalScore = completedSessions.reduce(
        (sum, interview) =>
          sum + (interview.overallScore || 0),
        0
      );

      averageScore = Math.round(
        totalScore / completedSessions.length
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: req.user._id,
          name: req.user.name,
          email: req.user.email,
        },

        resume: req.user.resume,

        statistics: {
          totalInterviews,
          completedInterviews,
          averageScore,
        },

        recentInterviews: completedSessions.slice(0, 5),
      },
    });
  } catch (error) {
    console.error("Dashboard Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load dashboard",
    });
  }
};

const getProfile = async (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      resume: req.user.resume,
      isEmailVerified: req.user.isEmailVerified,
      createdAt: req.user.createdAt,
    },
  });
};

module.exports = {
  getDashboard,
  getProfile,
};