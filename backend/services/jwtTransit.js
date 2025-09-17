// services/jwtTransit.js
const axios = require('axios');
const { importSPKI, jwtVerify } = require('jose');
const logger = require('../configurations/logger');
const { ensureClientToken } = require('./vaultService');

const VAULT_ADDR = (process.env.VAULT_ADDR || '').replace(/\/$/, '');
const VAULT_NAMESPACE = process.env.VAULT_NAMESPACE || null;

const JWT_ISS = process.env.JWT_ISS || 'booklib-backend';
const JWT_AUD = process.env.JWT_AUD || 'booklib-frontend';
const JWT_TTL = Number(process.env.JWT_TTL || 3600);
const TRANSIT_KEY = process.env.TRANSIT_JWT_KEY || 'booklib-jwt';

function buildHeaders(token) {
  const h = {};
  if (token) h['X-Vault-Token'] = token;
  if (VAULT_NAMESPACE) h['X-Vault-Namespace'] = VAULT_NAMESPACE;
  return h;
}

let cachedKey = null;
let cachedVersion = null;

async function getPublicKey() {
  const token = await ensureClientToken();
  const { data } = await axios.get(`${VAULT_ADDR}/v1/transit/keys/${TRANSIT_KEY}`, {
    headers: buildHeaders(token)
  });

  const latest = Number(data?.data?.latest_version || 1);
  const pk = data?.data?.keys?.[latest]?.public_key;
  if (!pk) throw new Error('Transit public_key not found');

  cachedVersion = latest;
  return { public_key: pk, latest_version: latest };
}

async function signJwt(claims, ttlSec = JWT_TTL) {
  // Ensure we have key info
  if (!cachedVersion) {
    const { latest_version } = await getPublicKey();
    cachedVersion = latest_version;
  }
  const kid = String(cachedVersion);

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: JWT_ISS,
    aud: JWT_AUD,
    iat: now,
    nbf: now,
    exp: now + ttlSec,
    ...claims,
  };

  const header = { alg: 'EdDSA', typ: 'JWT', kid };
  const headerB64  = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;

  const token = await ensureClientToken();
  const body = {
    marshaling_algorithm: 'jws',
    signature_algorithm: 'ed25519',
    input: Buffer.from(signingInput).toString('base64'),
  };

  const { data } = await axios.post(`${VAULT_ADDR}/v1/transit/sign/${TRANSIT_KEY}`, body, {
    headers: buildHeaders(token)
  });

  const sig = data?.data?.signature; // vault:vX:<b64urlsig>
  if (!sig) throw new Error('Transit sign returned empty signature');
  const b64urlSig = sig.split(':')[2];

  return `${signingInput}.${b64urlSig}`;
}

async function verifyLocal(jwt) {
  if (!cachedKey) {
    const { public_key } = await getPublicKey();
    const pem = `-----BEGIN PUBLIC KEY-----\n${public_key}\n-----END PUBLIC KEY-----\n`;
    cachedKey = await importSPKI(pem, 'EdDSA');
  }
  const { payload, protectedHeader } = await jwtVerify(jwt, cachedKey, {
    issuer: JWT_ISS,
    audience: JWT_AUD,
  });
  return { payload, protectedHeader };
}

module.exports = { signJwt, getPublicKey, verifyLocal };
