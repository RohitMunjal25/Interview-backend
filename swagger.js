const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",

    info: {
      title: "AI Interview Analyzer API",
      version: "1.0.0",
      description:
        "Production API documentation for AI Interview Analyzer",
    },

    servers: [
      {
        url: "https://anytime-leone-calendars-respond.trycloudflare.com",
        description: "Production / Cloudflare Quick Tunnel",
      },
    ],

    tags: [
      {
        name: "Authentication",
        description: "Signup, verification, login and password APIs",
      },
      {
        name: "User",
        description: "User profile and dashboard APIs",
      },
      {
        name: "Interview",
        description:
          "Resume upload, AI questions, proctoring, answers and reports",
      },
    ],

    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter JWT token as: Bearer <token>",
        },
      },

      schemas: {
        SignupRequest: {
          type: "object",
          required: ["name", "email", "password"],
          properties: {
            name: { type: "string", example: "Rohit Munjal" },
            email: {
              type: "string",
              format: "email",
              example: "rohit@example.com",
            },
            password: {
              type: "string",
              minLength: 6,
              example: "Password123",
            },
          },
        },

        VerifyEmailRequest: {
          type: "object",
          required: ["email", "otp"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "rohit@example.com",
            },
            otp: { type: "string", example: "123456" },
          },
        },

        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "rohit@example.com",
            },
            password: {
              type: "string",
              example: "Password123",
            },
          },
        },

        ForgotPasswordRequest: {
          type: "object",
          required: ["email"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "rohit@example.com",
            },
          },
        },

        ResetPasswordRequest: {
          type: "object",
          required: ["email", "otp", "newPassword"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "rohit@example.com",
            },
            otp: { type: "string", example: "123456" },
            newPassword: {
              type: "string",
              minLength: 6,
              example: "NewPassword123",
            },
          },
        },

        AnswerRequest: {
          type: "object",
          required: ["questionId", "answer"],
          properties: {
            questionId: {
              type: "string",
              example: "68b7a1c4e8f123456789abcd",
            },
            answer: {
              type: "string",
              example:
                "I used React because it provides reusable components and efficient UI updates.",
            },
          },
        },
      },
    },
  },

  apis: ["./src/routes/*.js"],
};

module.exports = swaggerJsdoc(options);
