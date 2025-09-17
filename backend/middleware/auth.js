// middleware/auth.js
const { getPublicKey } = require('../services/jwtTransit');
const { importSPKI, jwtVerify } = require('jose');

let cachedKey;

async function verifyToken(token) {
  if (!cachedKey) {
    const { public_key } = await getPublicKey();
    const pem = `-----BEGIN PUBLIC KEY-----\n${public_key}\n-----END PUBLIC KEY-----\n`;
    cachedKey = await importSPKI(pem, 'EdDSA');
  }
  return jwtVerify(token, cachedKey, {
    issuer: process.env.JWT_ISS || 'booklib-backend',
    audience: process.env.JWT_AUD || 'booklib-frontend',
  });
}

module.exports = async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });

  try {
    const { payload } = await verifyToken(token);
    req.user = payload; // attach claims for downstream routes
    next();
  } catch (e) {
    res.status(401).json({ error: 'invalid token', details: e.message });
  }
};