require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");

const httpLogger = require("./configurations/morganLogger");
const logger = require("./configurations/logger");
const appRoutes = require("./appRoutes");

// Swagger
const swaggerUi = require("swagger-ui-express");
const swaggerDocs = require("./configurations/swaggerOptions");

// Couchbase + Vault
const { reconnectIfChanged, ping, close, getLeaseExpiry } = require("./services/couchbasePool");
const { startDbCredRotation } = require("./services/vaultService");

const app = express();
const port = Number(process.env.PORT || 3000);

// Helpers
function formatTTL(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v, i) => (i === 0 ? v : String(v).padStart(2, "0"))).join(":");
}

function formatDate(date) {
  return date
    ? new Date(date).toISOString().replace("T", " ").substring(0, 19)
    : null;
}

// Static for custom Swagger CSS
app.use(
  "/swagger-custom.css",
  express.static(path.join(__dirname, "configurations", "swagger-custom.css"))
);

// Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs, { customCssUrl: "/swagger-custom.css" }));
logger.info("Swagger UI available at /api-docs");

// Core middleware
app.use(cors());
app.use(httpLogger);
app.use(express.json());
logger.info(`Current LOG_LEVEL from .env is: ${process.env.LOG_LEVEL}`);

// Inject remaining TTL as header
app.use((req, res, next) => {
  const expiry = getLeaseExpiry();
  if (expiry) {
    const ttl = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
    res.setHeader("X-DB-Creds-Expires-In", formatTTL(ttl));
  }
  next();
});

// Health (tolerant)
app.get("/health", async (_req, res) => {
  const ok = await ping();
  res.status(ok ? 200 : 503).json({ ok, service: "booklib-backend" });
});

// Lease diagnostics
app.get("/db/lease", (_req, res) => {
  const expiry = getLeaseExpiry();
  const ttl = expiry ? Math.max(0, Math.floor((expiry - Date.now()) / 1000)) : null;
  res.json({
    expiresAt: formatDate(expiry),
    secondsRemaining: ttl,
    humanReadable: ttl != null ? formatTTL(ttl) : null,
  });
});

// Diagnostics route
app.get("/db/diagnostics", async (_req, res) => {
  const ok = await ping();
  const expiry = getLeaseExpiry();
  const ttl = expiry ? Math.max(0, Math.floor((expiry - Date.now()) / 1000)) : null;
  res.json({
    ok,
    bucket: process.env.COUCHBASE_BUCKET,
    expiresAt: formatDate(expiry),
    secondsRemaining: ttl,
    humanReadable: ttl != null ? formatTTL(ttl) : null,
  });
});

// Routes
app.use("/", appRoutes);

// Start server
const server = app.listen(port, () => {
  logger.info(`Backend service running on port ${port}`);
});

// Start dynamic-cred rotation: first tick connects, later ticks rotate
(async () => {
  const stop = await startDbCredRotation(async (creds) => {
    try {
      await reconnectIfChanged(creds);
      const expiry = getLeaseExpiry();
      const ttl = expiry ? Math.max(0, Math.floor((expiry - Date.now()) / 1000)) : null;
      logger.info(
        "[couchbase] connected with fresh dynamic creds" +
        (ttl != null ? ` — renew in ~${formatTTL(ttl)} (at ${formatDate(expiry)})` : "")
      );
    } catch (e) {
      logger.warn(`[couchbase] connect failed during rotation: ${e.message}`);
    }
  });

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}. Shutting down...`);
    try { stop(); } catch {}
    server.close(async () => {
      logger.info("HTTP server closed.");
      try { await close(); } catch {}
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT",  () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
})();
