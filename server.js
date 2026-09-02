const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");

const connectDB = require("./src/config/db");

const authRoutes = require("./src/routes/authRoutes");
const userRoutes = require("./src/routes/userRoutes");
const interviewRoutes = require("./src/routes/interviewRoutes");

const app = express();


// =====================================
// MIDDLEWARE
// =====================================

app.use(cors());

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);


// =====================================
// DATABASE
// =====================================

connectDB();


// =====================================
// SWAGGER AUTH
// =====================================

const swaggerUsername = process.env.SWAGGER_USERNAME;
const swaggerPassword = process.env.SWAGGER_PASSWORD;

const swaggerAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.setHeader(
      "WWW-Authenticate",
      'Basic realm="Swagger Documentation"'
    );

    return res.status(401).send(
      "Swagger authentication required"
    );
  }

  try {
    const encodedCredentials = authHeader.split(" ")[1];

    const decodedCredentials = Buffer.from(
      encodedCredentials,
      "base64"
    ).toString("utf-8");

    const separatorIndex =
      decodedCredentials.indexOf(":");

    const username =
      decodedCredentials.substring(
        0,
        separatorIndex
      );

    const password =
      decodedCredentials.substring(
        separatorIndex + 1
      );

    if (
      username !== swaggerUsername ||
      password !== swaggerPassword
    ) {
      res.setHeader(
        "WWW-Authenticate",
        'Basic realm="Swagger Documentation"'
      );

      return res.status(401).send(
        "Invalid Swagger credentials"
      );
    }

    next();

  } catch (error) {
    return res.status(401).send(
      "Invalid Swagger authentication"
    );
  }
};


// =====================================
// SWAGGER DOCUMENTATION
// =====================================

app.use(
  "/api-docs",
  swaggerAuth,
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec)
);


// =====================================
// API ROUTES
// =====================================

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/user",
  userRoutes
);

app.use(
  "/api/interview",
  interviewRoutes
);


// =====================================
// HEALTH CHECK
// =====================================

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "AI Interview Backend is running",
  });
});


// =====================================
// 404 HANDLER
// =====================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});


// =====================================
// GLOBAL ERROR HANDLER
// =====================================

app.use((err, req, res, next) => {
  console.error("Global Error:", err);

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});


// =====================================
// SERVER
// =====================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    `Server running on port ${PORT}`
  );

  console.log(
    `Swagger Docs: http://localhost:${PORT}/api-docs`
  );
});