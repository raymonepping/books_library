// services/couchbasePool.js
/**
 * Couchbase connection manager with retry-on-auth, jittered backoff, and hot-reconnect
 * when Vault rotates dynamic credentials.
 *
 * Env:
 * - COUCHBASE_CONNSTR (e.g., couchbase://couchbase or couchbase://couchbase_library)
 * - COUCHBASE_BUCKET  (e.g., library)
 *
 * Optional tuning:
 * - CB_AUTH_RETRY_ATTEMPTS    (default 10)
 * - CB_AUTH_RETRY_INITIAL_MS  (default 400)
 * - CB_AUTH_RETRY_MAX_MS      (default 2000)
 * - CB_AUTH_RETRY_JITTER_MS   (default 250)
 */
const couchbase = require("couchbase");
const logger = require("../configurations/logger");

const CONNSTR = process.env.COUCHBASE_CONNSTR;
const BUCKET  = process.env.COUCHBASE_BUCKET;

// Retry/backoff knobs
const RETRY_ATTEMPTS   = Number(process.env.CB_AUTH_RETRY_ATTEMPTS   ?? 10);
const RETRY_INITIAL_MS = Number(process.env.CB_AUTH_RETRY_INITIAL_MS ?? 400);
const RETRY_MAX_MS     = Number(process.env.CB_AUTH_RETRY_MAX_MS     ?? 2000);
const RETRY_JITTER_MS  = Number(process.env.CB_AUTH_RETRY_JITTER_MS  ?? 250);

let cluster = null;
let bucket  = null;
let current = { username: null, password: null };
let leaseExpiry = null; // when current creds expire

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jittered = (ms) => {
  const j = Math.floor((Math.random() * 2 - 1) * RETRY_JITTER_MS); // [-jitter, +jitter]
  return Math.max(0, ms + j);
};

function ensureEnv() {
  if (!CONNSTR || !BUCKET) {
    throw new Error("COUCHBASE_CONNSTR or COUCHBASE_BUCKET missing");
  }
}

/**
 * Establish a connection using provided creds. Retries on early auth lag (RBAC propagation),
 * with small initial pause + exponential backoff and jitter.
 * @param {{username:string,password:string,ttl?:number}} creds
 */
async function connectWith(creds) {
  ensureEnv();

  // Close previous cluster if any
  if (cluster) {
    try { await cluster.close(); } catch {}
    cluster = null; bucket = null;
  }

  current = { username: String(creds.username).trim(), password: String(creds.password).trim() };
  leaseExpiry = creds.ttl ? new Date(Date.now() + creds.ttl * 1000) : null;

  logger.info(`[couchbase] connecting (dynamic) user="${current.username}"`);

  let lastErr;
  let delay = RETRY_INITIAL_MS;

  // Small initial delay → avoids the very first auth race most of the time
  await sleep(jittered(delay));

  for (let i = 1; i <= RETRY_ATTEMPTS; i++) {
    try {
      cluster = await couchbase.connect(CONNSTR, {
        username: current.username,
        password: current.password,
      });
      bucket = cluster.bucket(BUCKET);

      // Warm-up probe (ignore miss)
      try { await bucket.defaultCollection().get("_ping_"); } catch {}

      logger.info("[couchbase] connected");
      return;
    } catch (e) {
      lastErr = e;
      if (/auth/i.test(e.message) || /authentication/i.test(e.message)) {
        // Quieter first retry message; more detailed on subsequent attempts
        const msg = i === 1
          ? "[couchbase] auth not ready yet, retrying shortly"
          : `[couchbase] auth not ready yet (attempt ${i}/${RETRY_ATTEMPTS}), retrying in ${delay}ms`;
        logger.warn(msg);

        await sleep(jittered(delay));
        delay = Math.min(RETRY_MAX_MS, Math.floor(delay * 1.6) || RETRY_INITIAL_MS);
        continue;
      }
      // Non-auth errors bubble immediately
      throw e;
    }
  }

  throw lastErr || new Error("failed to connect to Couchbase with dynamic creds");
}

/**
 * Reconnect only if username or password changed (or not connected yet).
 * @param {{username:string,password:string,ttl?:number}} creds
 */
async function reconnectIfChanged(creds) {
  const u = String(creds.username).trim();
  const p = String(creds.password).trim();
  if (!current.username || !current.password || u !== current.username || p !== current.password) {
    await connectWith({ username: u, password: p, ttl: creds.ttl });
  }
}

/** Get the active bucket (throws if not connected yet). */
function getBucket() {
  if (!bucket) throw new Error("Couchbase bucket not opened");
  return bucket;
}

/** Lightweight liveness probe for health endpoints. */
async function ping() {
  if (!cluster || !bucket) return false;
  try { await cluster.ping(); return true; } catch { return false; }
}

/** When the current creds will expire (or null if unknown). */
function getLeaseExpiry() {
  return leaseExpiry;
}

/** Close the cluster (graceful shutdown). */
async function close() {
  try { if (cluster) await cluster.close(); } catch {}
  cluster = null; bucket = null; current = { username: null, password: null };
  leaseExpiry = null;
}

module.exports = {
  connectWith,
  reconnectIfChanged,
  getBucket,
  ping,
  close,
  getLeaseExpiry,
};
