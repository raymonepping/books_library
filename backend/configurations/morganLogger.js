const morgan = require("morgan");
const logger = require("./logger"); // Import Winston logger

// Define a custom token for logging HTTP requests
morgan.token("message", (req, res) => {
  const status = res.statusCode;
  const logLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
  const timestamp = new Date().toISOString();
  return `${logLevel.toUpperCase()} - ${timestamp} - [${req.method}] ${status} - ${req.originalUrl}`;
});

// Conditionally log requests based on the log level
const httpLogger = morgan(":message", {
  stream: {
    write: (message) => {
      const statusCode = message.split(" ")[2]; // Extract status code from message

      // Only log HTTP requests at the debug level
      if (process.env.LOG_LEVEL === "debug") {
        logger.debug(message.trim());
      }
      // Optionally log errors or warnings even at info level
      if (statusCode >= 500) {
        logger.error(message.trim());
      } else if (statusCode >= 400) {
        logger.warn(message.trim());
      }
    },
  },
});

module.exports = httpLogger;
