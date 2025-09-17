// middleware/requireRole.js
const { getPublicKey } = require('../services/jwtTransit');
const { importSPKI, jwtVerify } = require('jose');

let cachedKey = null;

async function getVerifier() {
  if (!cachedKey) {
    const { public_key } = await getPublicKey();
    const pem = `-----BEGIN PUBLIC KEY-----\n${public_key}\n-----END PUBLIC KEY-----\n`;
    cachedKey = await importSPKI(pem, 'EdDSA');
  }
  return cachedKey;
}

module.exports = function requireRole(roles = []) {
  return async (req, res, next) => {
    try {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      if (!token) return res.status(401).json({ error: 'missing token' });
      const key = await getVerifier();
      const { payload } = await jwtVerify(token, key, {
        issuer: process.env.JWT_ISS || 'booklib-backend',
        audience: process.env.JWT_AUD || 'booklib-frontend',
      });
      const userRoles = payload.roles || [];
      const ok = roles.length === 0 || roles.some(r => userRoles.includes(r));
      if (!ok) return res.status(403).json({ error: 'forbidden' });
      req.user = payload;
      next();
    } catch (e) {
      res.status(401).json({ error: 'invalid token' });
    }
  };
};