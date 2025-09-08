// backend/services/vaultService.js
const vault = require("node-vault");
const axios = require("axios");
const logger = require("../configurations/logger");

const VAULT_ADDR = process.env.VAULT_ADDR;
const VAULT_TOKEN = process.env.VAULT_TOKEN;

const vaultClient = vault({
  endpoint: VAULT_ADDR,
  token: VAULT_TOKEN,
});

// Vault service for centralized secret access
// - getCouchbaseConfig(): returns Couchbase credentials from Vault
// - getFlagSecret(): returns challenge flag value from Vault
// - getDynamicCouchbaseCreds(role): returns dynamic Couchbase creds for a role

async function getCouchbaseConfig() {
  try {
    const result = await vaultClient.read("secret/ctf/data/config"); // KV v2
    const data = result?.data?.data || {};

    logger.debug(`[VAULT] Couchbase config from Vault:`, {
      url: data.COUCHBASE_URL,
      username: data.COUCHBASE_USERNAME,
      password: data.COUCHBASE_PASSWORD ? "******" : "(not set)",
    });

    return {
      url: data.COUCHBASE_URL,
      username: data.COUCHBASE_USERNAME,
      password: data.COUCHBASE_PASSWORD,
    };
  } catch (err) {
    logger.warn(`[VAULT] Failed to fetch Couchbase config: ${err.message}`);
    return null;
  }
}
``;

async function getFlagSecret() {
  try {
    const result = await vaultClient.read("secret/ctf/data/flag"); // KV v2
    const flag = result?.data?.data?.value;

    logger.debug(
      `[VAULT] Retrieved flag from Vault: ${flag ? "[REDACTED]" : "(none found)"}`,
    );

    return flag;
  } catch (err) {
    logger.warn(
      `[VAULT] Could not read flag: ${err.response?.status || err.message}`,
    );
    return null;
  }
}

// === NEW: Fetch dynamic Couchbase credentials for a Vault database role
async function getDynamicCouchbaseCreds(role = "readonly") {
  try {
    // This calls: VAULT_ADDR/v1/database/creds/readonly
    const url = `${VAULT_ADDR.replace(/\/$/, "")}/v1/database/creds/${role}`;
    const resp = await axios.get(url, {
      headers: {
        "X-Vault-Token": VAULT_TOKEN,
      },
    });
    const data = resp.data?.data || {};

    logger.info(
      `[VAULT] Dynamic Couchbase creds for ${role}: ${data.username ? data.username : "none"}`,
    );

    return {
      username: data.username,
      password: data.password,
      lease_id: data.lease_id,
      lease_duration: data.lease_duration,
      // ...other fields if needed
    };
  } catch (err) {
    logger.warn(
      `[VAULT] Could not get dynamic Couchbase creds for role ${role}: ${err.message}`,
    );
    return null;
  }
}

module.exports = {
  getCouchbaseConfig,
  getFlagSecret,
  getDynamicCouchbaseCreds,
};
