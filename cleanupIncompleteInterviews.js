require("dotenv").config();

const connectDB = require("./src/config/db");
const Interview = require("./src/models/Interview");

const cleanupIncompleteInterviews = async () => {
  try {
    await connectDB();

    const result = await Interview.deleteMany({
      status: { $in: ["in_progress", "terminated"] },
    });

    console.log(
      `Removed ${result.deletedCount} incomplete/terminated interview records from MongoDB.`
    );

    process.exit(0);
  } catch (error) {
    console.error("Cleanup incomplete interviews failed:", error);
    process.exit(1);
  }
};

cleanupIncompleteInterviews();
