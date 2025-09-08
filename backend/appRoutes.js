const express = require("express");
const router = express.Router();

// Import route modules from the routes directory
const apiRoutes = require("./routes"); // This now clearly points to the routes directory's index.js

// Mount API routes under /api
router.use("/api", apiRoutes);

module.exports = router;
