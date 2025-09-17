const express = require('express');
const router = express.Router();
const { getBook, listBooks } = require('../controllers/bookController');

router.get('/', listBooks);
router.get('/:id', getBook);

module.exports = router;
