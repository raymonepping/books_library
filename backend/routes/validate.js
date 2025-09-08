const express = require('express');
const router = express.Router();
const { validateLevel } = require('../controllers/validatorController');

router.post('/', validateLevel);

module.exports = router;
