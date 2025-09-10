// services/vaultService.js
const axios = require("axios");
const logger = require("../configurations/logger");

// ---------- Config ----------
const VAULT_ADDR = (process.env.VAULT_ADDR || "").replace(/\/$/, "");
const VAULT_NAMESPACE = process.env.VAULT_NAMESPACE || null;

const STATIC_TOKEN = process.env.VAULT_TOKEN || null;
const ROLE_ID = process.env.VAULT_ROLE_ID || null;
const SECRET_ID = process.env.VAULT_SECRET_ID || null;

const DB_ROLE = process.env.VAULT_DB_ROLE || "readwrite";

// Rotation lead/caps (DB creds)
const DB_LEAD_SECONDS = Number(process.env.VAULT_DB_LEAD_SECONDS ?? 60);
const DB_MIN_SECONDS  = Number(process.env.VAULT_DB_MIN_SECONDS  ?? 30);

// Auth refresh (AppRole)
const AUTH_LEAD_SECONDS = Number(process.env.VAULT_AUTH_LEAD_SECONDS ?? 60);
const AUTH_MIN_SECONDS  = Number(process.env.VAULT_AUTH_MIN_SECONDS  ?? 30);

// ---------- Auth state ----------
let clientToken = null;
let tokenExpiry = null;     // Date or null
let tokenRenewable = false; // boolean
let authMode = null;        // "static" | "approle"

// Detect auth mode
if (STATIC_TOKEN) {
  authMode = "static";
} else if (ROLE_ID && SECRET_ID) {
  authMode = "approle";
} else {
  authMode = "none";
  logger.warn("[VAULT] No auth method provided (VAULT_TOKEN or VAULT_ROLE_ID/VAULT_SECRET_ID). Calls will fail.");
}

// ---------- Helpers ----------
function headers() {
  const h = {};
  if (!clientToken) {
    // We’ll let the caller ensure token before requests
  } else {
    h["X-Vault-Token"] = clientToken;
  }
  if (VAULT_NAMESPACE) h["X-Vault-Namespace"] = VAULT_NAMESPACE;
  return h;
}

function secondsUntil(d) {
  if (!d) return null;
  return Math.floor((d.getTime() - Date.now()) / 1000);
}

function fmtShortDate(d) {
  return d ? new Date(d).toISOString().replace("T", " ").substring(0, 19) : null;
}

// ---------- AppRole login ----------
async function loginWithAppRole() {
  if (!ROLE_ID || !SECRET_ID) {
    throw new Error("AppRole login requested but VAULT_ROLE_ID / VAULT_SECRET_ID are missing");
  }
  const url = `${VAULT_ADDR}/v1/auth/approle/login`;
  const resp = await axios.post(url, { role_id: ROLE_ID, secret_id: SECRET_ID }, { headers: VAULT_NAMESPACE ? { "X-Vault-Namespace": VAULT_NAMESPACE } : {} });
  const auth = resp.data?.auth || {};
  const token = auth.client_token;
  const ttl = Number(auth.lease_duration || 3600); // seconds
  const renewable = Boolean(auth.renewable);

  if (!token) throw new Error("AppRole login did not return a client_token");

  clientToken = token;
  tokenRenewable = renewable;
  tokenExpiry = new Date(Date.now() + ttl * 1000);

  logger.info(`[VAULT] AppRole login success — token ttl ~${ttl}s (renews: ${renewable}), expires at ${fmtShortDate(tokenExpiry)}`);
  return { token, ttl, renewable };
}

// Ensure we have a valid client token (static or approle)
async function ensureClientToken() {
  if (authMode === "none") {
    throw new Error("No Vault auth configured (set VAULT_TOKEN or VAULT_ROLE_ID/VAULT_SECRET_ID)");
  }

  // Static token: set once and done
  if (authMode === "static") {
    if (!clientToken) {
      clientToken = STATIC_TOKEN;
      tokenExpiry = null;
      tokenRenewable = false;
      logger.info("[VAULT] Using static token from VAULT_TOKEN");
    }
    return clientToken;
  }

  // AppRole: login if missing or about to expire
  const nowTTL = secondsUntil(tokenExpiry);
  if (!clientToken || (nowTTL !== null && nowTTL <= AUTH_LEAD_SECONDS)) {
    await loginWithAppRole();
  }
  return clientToken;
}

// Optional: explicit auth refresh loop (rarely needed if you call DB creds regularly)
async function startVaultAuthRotation() {
  if (authMode !== "approle") {
    // static token: nothing to do
    return () => {};
  }

  let timer = null;
  let stopped = false;

  async function tick() {
    try {
      await ensureClientToken();
      const ttl = secondsUntil(tokenExpiry);
      const wait = Math.max(AUTH_MIN_SECONDS, (ttl ?? 3600) - AUTH_LEAD_SECONDS);
      if (!stopped) timer = setTimeout(tick, wait * 1000);
    } catch (e) {
      logger.warn(`[VAULT] auth rotation error: ${e.message}`);
      if (!stopped) timer = setTimeout(tick, 10_000);
    }
  }

  await tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

// ---------- DB creds ----------
/**
 * Fetch short-lived Couchbase creds from Vault database engine.
 * @param {string} [role] e.g., "readwrite" or "readonly"
 * @returns {Promise<{username:string, password:string, ttl:number, lease_id?:string}>}
 */
async function getDynamicDbCreds(role = DB_ROLE) {
  if (!VAULT_ADDR) throw new Error("VAULT_ADDR missing");

  // Make sure we have a valid client token first
  await ensureClientToken();

  const url = `${VAULT_ADDR}/v1/database/creds/${role}`;
  try {
    const resp = await axios.get(url, { headers: headers() });
    const data = resp.data?.data || {};
    const leaseTTL = Number(resp.data?.lease_duration || 300);
    const leaseId = resp.data?.lease_id;
    if (!data.username || !data.password) throw new Error("Vault returned empty dynamic creds");

    logger.info(`[VAULT] got dynamic creds for role=${role}`);
    return { username: data.username, password: data.password, ttl: leaseTTL, lease_id: leaseId };
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data ? ` body=${JSON.stringify(err.response.data).slice(0, 300)}` : "";
    logger.warn(`[VAULT] creds error${status ? ` ${status}` : ""}: ${err.message}${body}`);
    throw err;
  }
}

/**
 * Start a rotation loop that fetches fresh DB creds and calls onUpdate(creds).
 * Schedules next run ~LEAD seconds before TTL (min MIN_SECONDS).
 * @param {(creds:{username:string,password:string,ttl:number,lease_id?:string})=>Promise<void>} onUpdate
 * @returns {Promise<() => void>} stop function
 */
async function startDbCredRotation(onUpdate) {
  let timer = null;
  let stopped = false;

  async function tick() {
    try {
      // Ensure we have/refresh the client token (handles AppRole automatically)
      await ensureClientToken();

      const creds = await getDynamicDbCreds(DB_ROLE);
      await onUpdate(creds);

      const wait = Math.max(DB_MIN_SECONDS, (creds.ttl || 300) - DB_LEAD_SECONDS);
      if (!stopped) timer = setTimeout(tick, wait * 1000);
    } catch (e) {
      logger.warn(`[VAULT] rotation error: ${e.message}`);
      if (!stopped) timer = setTimeout(tick, 10_000);
    }
  }

  await tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

// Optional: expose token info (for diagnostics)
function getClientTokenInfo() {
  return {
    mode: authMode,
    expiry: tokenExpiry,
    secondsRemaining: tokenExpiry ? secondsUntil(tokenExpiry) : null,
    renewable: tokenRenewable,
    hasToken: Boolean(clientToken),
  };
}

module.exports = {
  // auth
  startVaultAuthRotation,  // optional; you don't have to call it if DB rotation runs frequently
  getClientTokenInfo,

  // db creds
  getDynamicDbCreds,
  startDbCredRotation,
};