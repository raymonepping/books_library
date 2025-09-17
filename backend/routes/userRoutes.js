// routes/userRoutes.js
const express = require('express');
const bcrypt = require('bcryptjs');
const { signJwt } = require('../services/jwtTransit');
const users = require('../controllers/userController');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// --- Public-ish: signup/login ---
router.post('/signup', async (req, res) => {
  try {
    const { email, password, display_name } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const existing = await users.getByEmail(email);
    if (existing) return res.status(409).json({ error: 'user exists' });

    const password_hash = await bcrypt.hash(password, 10);
    const doc = {
      type: 'user',
      id: `user::${email.toLowerCase()}`,
      email: email.toLowerCase(),
      display_name: display_name || email.split('@')[0],
      password_hash,
      roles: ['reader'],
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await users.upsert(doc);
    res.status(201).json({ ok: true, status: doc.status });
  } catch (err) {
    res.status(500).json({ error: 'signup failed', detail: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const u = email ? await users.getByEmail(email) : null;
    if (!u) return res.status(401).json({ error: 'invalid credentials' });
    if (u.status !== 'active') return res.status(403).json({ error: 'user not active' });

    const ok = await bcrypt.compare(password || '', u.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    const token = await signJwt({
      sub: u.id,
      email: u.email,
      roles: u.roles,
      name: u.display_name,
    });

    res.json({ token, user: { email: u.email, roles: u.roles, display_name: u.display_name } });
  } catch (err) {
    res.status(500).json({ error: 'login failed', detail: err.message });
  }
});

// --- Admin-only APIs ---
router.post('/approve/:email', requireRole(['admin']), async (req, res) => {
  try {
    const u = await users.approve(req.params.email);
    if (!u) return res.status(404).json({ error: 'user not found' });
    res.json({ ok: true, email: u.email, status: u.status });
  } catch (err) {
    res.status(500).json({ error: 'approve failed', detail: err.message });
  }
});

// GET /auth/users?status=pending&limit=50&offset=0
router.get('/users', requireRole(['admin']), async (req, res) => {
  try {
    const status = (req.query.status || 'pending').toString();
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
    const items = await users.listByStatus(status, limit, offset);
    res.json({ items, pagination: { limit, offset, status } });
  } catch (e) {
    res.status(500).json({ error: 'query failed', detail: e.message });
  }
});

// PUT /auth/users/:email/roles { roles: [...] }
router.put('/users/:email/roles', requireRole(['admin']), async (req, res) => {
  try {
    const roles = Array.isArray(req.body?.roles) ? req.body.roles : [];
    const u = await users.setRoles(req.params.email, roles);
    if (!u) return res.status(404).json({ error: 'user not found' });
    res.json({ ok: true, email: u.email, roles: u.roles });
  } catch (e) {
    res.status(500).json({ error: 'set roles failed', detail: e.message });
  }
});

// PUT /auth/users/:email/status { status: "active"|"pending"|"disabled" }
router.put('/users/:email/status', requireRole(['admin']), async (req, res) => {
  try {
    const status = String(req.body?.status || '');
    if (!['active', 'pending', 'disabled'].includes(status)) {
      return res.status(400).json({ error: 'invalid status' });
    }
    const u = await users.setStatus(req.params.email, status);
    if (!u) return res.status(404).json({ error: 'user not found' });
    res.json({ ok: true, email: u.email, status: u.status });
  } catch (e) {
    res.status(500).json({ error: 'set status failed', detail: e.message });
  }
});

// DELETE /auth/users/:email
router.delete('/users/:email', requireRole(['admin']), async (req, res) => {
  try {
    const ok = await users.remove(req.params.email);
    if (!ok) return res.status(404).json({ error: 'user not found' });
    res.json({ ok: true, email: req.params.email });
  } catch (e) {
    res.status(500).json({ error: 'delete failed', detail: e.message });
  }
});

// --- Basic token reflection (unchanged) ---
router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'missing token' });

    const [, payloadB64] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    res.json({ token, payload });
  } catch {
    res.status(400).json({ error: 'bad token' });
  }
});

module.exports = router;