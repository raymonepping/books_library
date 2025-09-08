const express = require('express');
const router = express.Router();
const { submitFlag } = require('../controllers/flagController');

console.log('[ROUTE] Flag route loaded');

router.post('/', submitFlag); // ✅ Connects to controller

module.exports = router;
