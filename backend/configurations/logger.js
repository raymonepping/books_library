// configurations/logger.js

const winston = require("winston");
const dotenv = require("dotenv");

// Load environment variables from the .env file
dotenv.config();

// Destructure necessary environment variables
LOG_LEVEL = process.env.LOG_LEVEL;
CONTAINER_NAME = process.env.CONTAINER_NAME;

// Console transport with a clear timestamp format and container name
const consoleTransport = new winston.transports.Console({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), // Explicit timestamp format
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
      let logMessage = `${timestamp} [${level.toUpperCase()}] [${CONTAINER_NAME}]: ${message}`;
      if (Object.keys(metadata).length > 0) {
        logMessage += ` ${JSON.stringify(metadata)}`;
      }
      return logMessage;
    }),
  ),
});

const logger = winston.createLogger({
  level: LOG_LEVEL,
  transports: [
    consoleTransport, // Keep the console transport for logs
  ],
  exitOnError: false,
});

// Debug message to confirm log level and container name
logger.debug(
  `Current log level is set to: ${LOG_LEVEL}, running in container: ${CONTAINER_NAME}`,
);

logger.debug("Initializing logger with console transport.");

// Graceful shutdown handling for SIGTERM and SIGINT
const handleShutdown = async (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`, {
    containerName: CONTAINER_NAME,
  });
  process.exit(0);
};

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

// Export logger
module.exports = logger;
