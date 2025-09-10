const express = require('express');
const router = express.Router();
const { getAuthor, listAuthors } = require('../controllers/authorController');

router.get('/', listAuthors);
router.get('/:id', getAuthor);

module.exports = router;
