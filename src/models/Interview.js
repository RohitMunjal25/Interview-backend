const mongoose = require("mongoose");

const interviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    jobRole: {
      type: String,
      required: true,
      trim: true,
    },

    resumeText: {
      type: String,
      default: "",
    },

    questions: [
      {
        question: {
          type: String,
          required: true,
        },

        type: {
          type: String,
          enum: ["technical", "behavioral", "situational"],
          default: "technical",
        },

        answer: {
          type: String,
          default: "",
        },

        answerMode: {
          type: String,
          enum: ["text", "voice"],
          default: "text",
        },

        evaluation: {
          score: {
            type: Number,
            default: 0,
          },

          correctness: {
            type: Number,
            default: 0,
          },

          relevance: {
            type: Number,
            default: 0,
          },

          communication: {
            type: Number,
            default: 0,
          },

          feedback: {
            type: String,
            default: "",
          },

          fillerWords: {
            type: Number,
            default: 0,
          },
        },
      },
    ],

    overallScore: {
      type: Number,
      default: 0,
    },

    strengths: [
      {
        type: String,
      },
    ],

    weaknesses: [
      {
        type: String,
      },
    ],

    recommendations: [
      {
        type: String,
      },
    ],

    finalReport: {
      summary: {
        type: String,
        default: "",
      },

      performanceLevel: {
        type: String,
        default: "",
      },
    },

    reportUrl: {
      type: String,
      default: null,
    },

    proctoring: {
      startedAt: {
        type: Date,
        default: null,
      },
      endedAt: {
        type: Date,
        default: null,
      },
      endReason: {
        type: String,
        default: null,
      },
      initialImageUrl: {
        type: String,
        default: null,
      },
    },

    status: {
      type: String,
      enum: ["in_progress", "completed", "terminated"],
      default: "in_progress",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Interview", interviewSchema);