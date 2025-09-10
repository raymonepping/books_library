const express = require('express');
const router = express.Router()

// Import route modules
const healthRoutes = require('./health')
const pingRoutes = require('./ping')
const couchbaseSeedRoutes = require('./couchbaseSeed')

// Use the route modules
router.use('/health', healthRoutes)
router.use('/ping', pingRoutes)
router.use('/couchbase-demo', couchbaseSeedRoutes)

module.exports = router
