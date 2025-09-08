const express = require('express')
const router = express.Router()
const { writeDemoDoc, readDemoDoc } = require('../controllers/couchbaseSeedController')

router.post('/write', writeDemoDoc)
router.get('/read', readDemoDoc)

module.exports = router
