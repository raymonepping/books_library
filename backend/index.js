require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");

const { getConnection } = require("./services/couchbasePool"); // Import Couchbase connection
const httpLogger = require("./configurations/morganLogger");
const logger = require("./configurations/logger");
const appRoutes = require("./appRoutes");

const swaggerUi = require("swagger-ui-express");
const swaggerDocs = require("./configurations/swaggerOptions");

const app = express();
const port = Number(process.env.PORT || 3000);

// Static for custom Swagger CSS
app.use(
  "/swagger-custom.css",
  express.static(path.join(__dirname, "configurations", "swagger-custom.css"))
);

// Swagger UI
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocs, { customCssUrl: "/swagger-custom.css" })
);
logger.info("Swagger UI available at /api-docs");

// Core middleware
app.use(cors());
app.use(httpLogger);
app.use(express.json());

// Health endpoint used by Docker healthcheck
app.get("/health", (_req, res) => res.json({ ok: true, service: "booklib-backend" }));

// App routes
app.use("/", appRoutes);

logger.info(`Current LOG_LEVEL from .env is: ${process.env.LOG_LEVEL}`);

// Establish Couchbase connection
getConnection()
  .then(() => {
    logger.info("Connected to Couchbase successfully");

    // Start the server and log it using Winston
    app.listen(port, () => {
      logger.info(`Backend service running on port ${port}`);
    });
  })
  .catch((err) => {
    logger.error("Failed to connect to Couchbase. Exiting...");
    logger.error(err.message);
    process.exit(1); // Exit the application if Couchbase connection fails
  });

// Graceful shutdown
const shutdown = (signal) => {
  logger.info(`Received ${signal}. Shutting down...`);
  server.close(() => {
    logger.info("HTTP server closed.");
    process.exit(0);
  });
  // Force-exit if it hangs
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
