const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const sendOTPEmail = async (email, otp, purpose) => {
  const subject =
    purpose === "verify_email"
      ? "Verify your AI Interview account"
      : "Reset your AI Interview password";

  const message =
    purpose === "verify_email"
      ? "Use this OTP to verify your email address."
      : "Use this OTP to reset your password.";

  await transporter.sendMail({
    from: `"AI Interview Analyzer" <${process.env.EMAIL_USER}>`,
    to: email,
    subject,
    html: `
      <div style="font-family: Arial; padding: 20px;">
        <h2>AI Interview Analyzer</h2>
        <p>${message}</p>

        <div style="
          font-size: 32px;
          font-weight: bold;
          letter-spacing: 8px;
          margin: 25px 0;
        ">
          ${otp}
        </div>

        <p>This OTP is valid for 10 minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
      </div>
    `,
  });
};

module.exports = {
  sendOTPEmail,
};